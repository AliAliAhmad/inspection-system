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
    Defect, Inspection, ChecklistTemplate, SAPWorkOrder, User,
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
