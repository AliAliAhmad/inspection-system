"""
Tests for GET /work-plans/jobs/<id>/details — the data behind the mobile
job details screen.

Two things matter most here:
  1. A worker must not be able to open a job they are not assigned to.
  2. Arabic translation must be cached after the first call, and must NEVER
     break the screen when the AI providers fail.
"""

from datetime import date, timedelta
from unittest.mock import patch

from tests.conftest import get_auth_header, make_equipment
from app.models import (
    WorkPlan, WorkPlanDay, WorkPlanJob, WorkPlanAssignment,
    Defect, Inspection, ChecklistTemplate, ChecklistItem, InspectionAnswer,
    File, SAPWorkOrder, User,
)


def _plan_with_day(db_session, admin_user, week_offset=0):
    start = date.today() + timedelta(weeks=week_offset)
    plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                    status='published', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=start)
    db_session.session.add(day)
    db_session.session.flush()
    return plan, day


def _worker(db_session, email='w@test.com', name='Worker One', language='en'):
    u = User(email=email, full_name=name, role='specialist',
             role_id=email.split('@')[0].upper(), shift='day', language=language)
    u.set_password('test123')
    db_session.session.add(u)
    db_session.session.commit()
    return u


def _defect(db_session, equipment, mech_inspector, description='Bearing noise at DE side',
            description_ar=None):
    template = ChecklistTemplate(name='T', equipment_type='centrifugal_pump', version='jd1')
    db_session.session.add(template)
    db_session.session.flush()
    insp = Inspection(equipment_id=equipment.id, template_id=template.id,
                      technician_id=mech_inspector.id, status='submitted')
    db_session.session.add(insp)
    db_session.session.flush()
    d = Defect(
        inspection_id=insp.id, description=description, description_ar=description_ar,
        severity='high', category='mechanical', status='open',
        due_date=date.today() + timedelta(days=6),
        photo_url='https://res.cloudinary.com/demo/photo.jpg',
        voice_note_url='https://res.cloudinary.com/demo/voice.m4a',
    )
    db_session.session.add(d)
    db_session.session.commit()
    return d


def _file(db_session, uploader, path, name='f.bin', mime='image/jpeg'):
    f = File(original_filename=name, stored_filename=f'{path[-24:]}-{name}',
             file_path=path, file_size=1024, mime_type=mime, uploaded_by=uploader.id)
    db_session.session.add(f)
    db_session.session.flush()
    return f


def _inspection_defect_with_answer_media(db_session, equipment, mech_inspector,
                                         photo=True, video=True, voice=True,
                                         transcription=None, link_item=True):
    """A defect raised from a FAILED CHECKLIST ITEM.

    This is the shape that was broken: media lives on the InspectionAnswer, and
    the defect row itself has photo_url/voice_note_url = NULL.
    """
    template = ChecklistTemplate(name='T-media', equipment_type='centrifugal_pump', version='jdm1')
    db_session.session.add(template)
    db_session.session.flush()
    item = ChecklistItem(template_id=template.id, question_text='Bearing condition?',
                         question_text_ar='حالة المحمل؟', answer_type='pass_fail',
                         category='mechanical', order_index=1)
    db_session.session.add(item)
    db_session.session.flush()
    insp = Inspection(equipment_id=equipment.id, template_id=template.id,
                      technician_id=mech_inspector.id, status='submitted')
    db_session.session.add(insp)
    db_session.session.flush()

    answer = InspectionAnswer(
        inspection_id=insp.id, checklist_item_id=item.id, answer_value='fail',
        photo_file_id=_file(db_session, mech_inspector,
                            'https://res.cloudinary.com/demo/ans-photo.jpg').id if photo else None,
        video_file_id=_file(db_session, mech_inspector,
                            'https://res.cloudinary.com/demo/ans-video.mp4',
                            mime='video/mp4').id if video else None,
        voice_note_id=_file(db_session, mech_inspector,
                            'https://res.cloudinary.com/demo/ans-voice.m4a',
                            mime='audio/m4a').id if voice else None,
        voice_transcription=transcription,
    )
    db_session.session.add(answer)

    d = Defect(
        inspection_id=insp.id,
        checklist_item_id=item.id if link_item else None,
        description='Failed: Bearing condition?', description_ar='فشل: حالة المحمل؟',
        severity='critical', category='mechanical', status='open',
        due_date=date.today() + timedelta(days=3),
        # deliberately NULL — create_from_failed_item never sets these
        photo_url=None, voice_note_url=None,
    )
    db_session.session.add(d)
    db_session.session.commit()
    return d


class TestInspectionFindingMedia:
    """Regression: defects from failed checklist items keep their media on the
    InspectionAnswer, so reading defect.photo_url alone returned nothing."""

    def test_photo_video_and_voice_come_from_the_inspection_answer(
            self, client, admin_user, engineer, mech_inspector, db_session):
        eq = make_equipment(db_session, 'Media Pump', 'JD-M1')
        plan, day = _plan_with_day(db_session, admin_user)
        d = _inspection_defect_with_answer_media(db_session, eq, mech_inspector)
        assert d.photo_url is None and d.voice_note_url is None, 'precondition: defect row has no media'

        job = WorkPlanJob(work_plan_day_id=day.id, job_type='defect', equipment_id=eq.id,
                          defect_id=d.id, estimated_hours=4.0, position=1)
        db_session.session.add(job)
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get(f'/api/work-plans/jobs/{job.id}/details', headers=headers)

        assert resp.status_code == 200
        defect = resp.get_json()['data']['defect']
        assert defect['photo_url'].endswith('ans-photo.jpg'), 'photo must fall back to the answer'
        assert defect['video_url'].endswith('ans-video.mp4'), 'video was never surfaced at all'
        assert defect['voice_note_url'].endswith('ans-voice.m4a'), 'voice must fall back to the answer'

    def test_adhoc_defect_does_not_borrow_another_answers_media(
            self, client, admin_user, engineer, mech_inspector, db_session):
        """checklist_item_id=None must NOT match an arbitrary answer in the same
        inspection — that would show the wrong question's photo."""
        eq = make_equipment(db_session, 'Adhoc Pump', 'JD-M2')
        plan, day = _plan_with_day(db_session, admin_user)
        d = _inspection_defect_with_answer_media(db_session, eq, mech_inspector, link_item=False)

        job = WorkPlanJob(work_plan_day_id=day.id, job_type='defect', equipment_id=eq.id,
                          defect_id=d.id, estimated_hours=4.0, position=1)
        db_session.session.add(job)
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get(f'/api/work-plans/jobs/{job.id}/details', headers=headers)

        assert resp.status_code == 200
        defect = resp.get_json()['data']['defect']
        assert defect['photo_url'] is None
        assert defect['video_url'] is None
        assert defect['voice_note_url'] is None

    def test_defects_own_media_wins_over_the_answer(
            self, client, admin_user, engineer, mech_inspector, db_session):
        """Field reports copy media at creation; that must not be overwritten."""
        eq = make_equipment(db_session, 'Own Media Pump', 'JD-M3')
        plan, day = _plan_with_day(db_session, admin_user)
        d = _inspection_defect_with_answer_media(db_session, eq, mech_inspector)
        d.photo_url = 'https://res.cloudinary.com/demo/defect-own.jpg'
        db_session.session.commit()

        job = WorkPlanJob(work_plan_day_id=day.id, job_type='defect', equipment_id=eq.id,
                          defect_id=d.id, estimated_hours=4.0, position=1)
        db_session.session.add(job)
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get(f'/api/work-plans/jobs/{job.id}/details', headers=headers)

        assert resp.get_json()['data']['defect']['photo_url'].endswith('defect-own.jpg')

    def test_voice_transcription_is_served_in_the_users_language(
            self, client, admin_user, mech_inspector, db_session):
        eq = make_equipment(db_session, 'Trans Pump', 'JD-M4')
        plan, day = _plan_with_day(db_session, admin_user)
        d = _inspection_defect_with_answer_media(
            db_session, eq, mech_inspector,
            transcription={'en': 'Loud grinding noise', 'ar': 'صوت طحن عالٍ'})

        job = WorkPlanJob(work_plan_day_id=day.id, job_type='defect', equipment_id=eq.id,
                          defect_id=d.id, estimated_hours=4.0, position=1)
        db_session.session.add(job)
        db_session.session.flush()
        w = _worker(db_session, 'trans@test.com', 'Trans Worker', language='en')
        db_session.session.add(WorkPlanAssignment(work_plan_job_id=job.id, user_id=w.id))
        db_session.session.commit()

        headers = get_auth_header(client, 'trans@test.com', 'test123')
        en = client.get(f'/api/work-plans/jobs/{job.id}/details', headers=headers)
        assert en.get_json()['data']['defect']['voice_transcription'] == 'Loud grinding noise'

        headers['Accept-Language'] = 'ar'
        ar = client.get(f'/api/work-plans/jobs/{job.id}/details', headers=headers)
        assert ar.get_json()['data']['defect']['voice_transcription'] == 'صوت طحن عالٍ'


class TestJobDetailsContent:
    def test_defect_job_returns_photo_voice_and_severity(self, client, admin_user, engineer,
                                                         mech_inspector, db_session):
        eq = make_equipment(db_session, 'Detail Pump', 'JD-1')
        plan, day = _plan_with_day(db_session, admin_user)
        d = _defect(db_session, eq, mech_inspector)
        job = WorkPlanJob(work_plan_day_id=day.id, job_type='defect', equipment_id=eq.id,
                          defect_id=d.id, estimated_hours=4.0, position=1, berth='east')
        db_session.session.add(job)
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get(f'/api/work-plans/jobs/{job.id}/details', headers=headers)

        assert resp.status_code == 200
        data = resp.get_json()['data']
        assert data['sap'] is None, 'not a SAP job'
        assert data['defect']['photo_url'].endswith('photo.jpg')
        assert data['defect']['voice_note_url'].endswith('voice.m4a')
        assert data['defect']['severity'] == 'high'
        assert data['defect']['category'] == 'mechanical'
        assert data['defect']['inspection'] is not None, 'should say which inspection it came from'
        assert data['equipment']['serial_number'] == 'JD-1'

    def test_sap_job_returns_sap_block(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Sap Detail Pump', 'JD-2')
        plan, day = _plan_with_day(db_session, admin_user)
        db_session.session.add(SAPWorkOrder(
            work_plan_id=plan.id, order_number='SAP-9001', order_type='PM01',
            job_type='pm', equipment_id=eq.id, description='500h service',
            estimated_hours=4.0, status='scheduled',
        ))
        job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm', equipment_id=eq.id,
                          sap_order_number='SAP-9001', sap_order_type='PM01',
                          work_center='MECH', maintenance_base='running_hours',
                          estimated_hours=4.0, position=1)
        db_session.session.add(job)
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get(f'/api/work-plans/jobs/{job.id}/details', headers=headers)

        assert resp.status_code == 200
        data = resp.get_json()['data']
        assert data['defect'] is None, 'not a defect job'
        assert data['sap']['order_number'] == 'SAP-9001'
        assert data['sap']['order_type'] == 'PM01'
        assert data['sap']['work_center'] == 'MECH'
        assert data['sap']['maintenance_base'] == 'running_hours'

    def test_unknown_job_is_404(self, client, admin_user, engineer, db_session):
        headers = get_auth_header(client, 'eng@test.com', 'test123')
        assert client.get('/api/work-plans/jobs/999999/details', headers=headers).status_code == 404


class TestJobDetailsAccess:
    def test_worker_cannot_open_a_job_they_are_not_assigned_to(self, client, admin_user, engineer,
                                                               mech_inspector, db_session):
        """Otherwise job ids could simply be enumerated."""
        eq = make_equipment(db_session, 'Private Pump', 'JD-3')
        plan, day = _plan_with_day(db_session, admin_user)
        job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm', equipment_id=eq.id,
                          estimated_hours=2.0, position=1)
        db_session.session.add(job)
        _worker(db_session, 'outsider@test.com', 'Outsider')
        db_session.session.commit()

        headers = get_auth_header(client, 'outsider@test.com', 'test123')
        resp = client.get(f'/api/work-plans/jobs/{job.id}/details', headers=headers)
        assert resp.status_code == 403

    def test_assigned_worker_can_open_their_own_job(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Mine Pump', 'JD-4')
        plan, day = _plan_with_day(db_session, admin_user)
        job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm', equipment_id=eq.id,
                          estimated_hours=2.0, position=1)
        db_session.session.add(job)
        db_session.session.flush()
        w = _worker(db_session, 'mine@test.com', 'Assigned Worker')
        db_session.session.add(WorkPlanAssignment(work_plan_job_id=job.id, user_id=w.id, is_lead=True))
        db_session.session.commit()

        headers = get_auth_header(client, 'mine@test.com', 'test123')
        resp = client.get(f'/api/work-plans/jobs/{job.id}/details', headers=headers)
        assert resp.status_code == 200


class TestArabicTranslation:
    def _arabic_worker_job(self, db_session, admin_user, mech_inspector, description_ar=None):
        eq = make_equipment(db_session, 'Ar Pump', 'JD-AR')
        plan, day = _plan_with_day(db_session, admin_user)
        d = _defect(db_session, eq, mech_inspector, description_ar=description_ar)
        job = WorkPlanJob(work_plan_day_id=day.id, job_type='defect', equipment_id=eq.id,
                          defect_id=d.id, estimated_hours=4.0, position=1)
        db_session.session.add(job)
        db_session.session.flush()
        w = _worker(db_session, 'ar@test.com', 'Arabic Worker', language='ar')
        db_session.session.add(WorkPlanAssignment(work_plan_job_id=job.id, user_id=w.id, is_lead=True))
        db_session.session.commit()
        return job, d

    def test_existing_arabic_is_used_without_calling_the_ai(self, client, admin_user,
                                                            mech_inspector, db_session):
        job, d = self._arabic_worker_job(db_session, admin_user, mech_inspector,
                                         description_ar='ضجيج في المحمل')

        headers = get_auth_header(client, 'ar@test.com', 'test123')
        with patch('app.services.translation_service.TranslationService.translate_to_arabic') as tr:
            resp = client.get(f'/api/work-plans/jobs/{job.id}/details', headers=headers)
            assert tr.call_count == 0, 'must not re-translate what is already cached'

        assert resp.status_code == 200
        assert resp.get_json()['data']['defect']['description'] == 'ضجيج في المحمل'

    def test_translation_is_cached_back_to_the_column(self, client, admin_user,
                                                      mech_inspector, db_session):
        """The point of caching: the second open costs nothing."""
        job, d = self._arabic_worker_job(db_session, admin_user, mech_inspector)
        assert d.description_ar in (None, '')

        headers = get_auth_header(client, 'ar@test.com', 'test123')
        with patch('app.services.translation_service.TranslationService.translate_to_arabic',
                   return_value='ضجيج في المحمل') as tr:
            resp = client.get(f'/api/work-plans/jobs/{job.id}/details', headers=headers)
            assert tr.call_count >= 1

        assert resp.status_code == 200
        assert resp.get_json()['data']['defect']['description'] == 'ضجيج في المحمل'

        db_session.session.refresh(d)
        assert d.description_ar == 'ضجيج في المحمل', 'must be written back for next time'

        # Second request: no AI call at all
        with patch('app.services.translation_service.TranslationService.translate_to_arabic') as tr2:
            resp2 = client.get(f'/api/work-plans/jobs/{job.id}/details', headers=headers)
            assert tr2.call_count == 0

        assert resp2.get_json()['data']['defect']['description'] == 'ضجيج في المحمل'

    def test_translation_failure_falls_back_to_english(self, client, admin_user,
                                                       mech_inspector, db_session):
        """AI providers are flaky (known Gemini 429s). The screen must still work."""
        job, d = self._arabic_worker_job(db_session, admin_user, mech_inspector)

        headers = get_auth_header(client, 'ar@test.com', 'test123')
        with patch('app.services.translation_service.TranslationService.translate_to_arabic',
                   side_effect=Exception('all providers down')):
            resp = client.get(f'/api/work-plans/jobs/{job.id}/details', headers=headers)

        assert resp.status_code == 200, 'a failed translation must not break the screen'
        assert resp.get_json()['data']['defect']['description'] == 'Bearing noise at DE side'

    def test_accept_language_header_alone_triggers_arabic(self, client, admin_user,
                                                          mech_inspector, db_session):
        """THE REPORTED BUG.

        `users.language` defaults to 'en' and is only ever changed by an admin, so
        a worker who switches the app to Arabic still has 'en' stored. The client
        signals Arabic with the Accept-Language header — the endpoint must honour
        it, otherwise Arabic is unreachable for every normal worker.
        """
        job, d = self._arabic_worker_job(db_session, admin_user, mech_inspector,
                                         description_ar='ضجيج في المحمل')
        w = User.query.filter_by(email='ar@test.com').first()
        w.language = 'en'  # stored preference says English...
        db_session.session.commit()

        headers = get_auth_header(client, 'ar@test.com', 'test123')
        headers['Accept-Language'] = 'ar'  # ...but the app is running in Arabic
        resp = client.get(f'/api/work-plans/jobs/{job.id}/details', headers=headers)

        assert resp.status_code == 200
        assert resp.get_json()['data']['defect']['description'] == 'ضجيج في المحمل'

    def test_lang_query_param_also_works(self, client, admin_user, mech_inspector, db_session):
        job, d = self._arabic_worker_job(db_session, admin_user, mech_inspector,
                                         description_ar='ضجيج في المحمل')
        w = User.query.filter_by(email='ar@test.com').first()
        w.language = 'en'
        db_session.session.commit()

        headers = get_auth_header(client, 'ar@test.com', 'test123')
        resp = client.get(f'/api/work-plans/jobs/{job.id}/details?lang=ar', headers=headers)
        assert resp.get_json()['data']['defect']['description'] == 'ضجيج في المحمل'

    def test_english_user_gets_no_translation(self, client, admin_user, engineer,
                                              mech_inspector, db_session):
        eq = make_equipment(db_session, 'En Pump', 'JD-EN')
        plan, day = _plan_with_day(db_session, admin_user)
        d = _defect(db_session, eq, mech_inspector)
        job = WorkPlanJob(work_plan_day_id=day.id, job_type='defect', equipment_id=eq.id,
                          defect_id=d.id, estimated_hours=4.0, position=1)
        db_session.session.add(job)
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        with patch('app.services.translation_service.TranslationService.translate_to_arabic') as tr:
            resp = client.get(f'/api/work-plans/jobs/{job.id}/details', headers=headers)
            assert tr.call_count == 0

        assert resp.get_json()['data']['defect']['description'] == 'Bearing noise at DE side'
