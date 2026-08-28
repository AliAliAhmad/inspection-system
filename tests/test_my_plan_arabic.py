"""The worker's job list must answer in the language the PHONE asks for.

Before this, /my-plan read `user.language`, a column only an admin ever writes.
A worker who switched the app to Arabic still had 'en' stored, so every job card
came back in English no matter what the phone sent. Worse, the value was
computed and then never used at all.
"""

from datetime import date, timedelta

from tests.conftest import get_auth_header, make_equipment
from app.models import (
    Defect, Inspection, ChecklistTemplate,
    WorkPlan, WorkPlanDay, WorkPlanJob, WorkPlanAssignment,
)


def _bilingual_defect_job(db_session, engineer, inspector, specialist):
    eq = make_equipment(db_session, 'Reach Stacker', 'RS-AR-1')
    eq.name_ar = 'رافعة حاويات'
    db_session.session.flush()

    template = ChecklistTemplate(
        name='AR Template', equipment_type='centrifugal_pump', version=f'ar-{eq.id}',
    )
    db_session.session.add(template)
    db_session.session.flush()

    insp = Inspection(
        equipment_id=eq.id, template_id=template.id,
        technician_id=inspector.id, status='submitted',
    )
    db_session.session.add(insp)
    db_session.session.flush()

    defect = Defect(
        inspection_id=insp.id,
        description='Vibration on bearing',
        description_ar='اهتزاز في المحمل',
        severity='medium', status='open',
        due_date=date.today() + timedelta(days=7),
    )
    db_session.session.add(defect)
    db_session.session.flush()

    plan = WorkPlan(
        week_start=date.today(), week_end=date.today() + timedelta(days=6),
        status='published', created_by_id=engineer.id,
    )
    db_session.session.add(plan)
    db_session.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=date.today())
    db_session.session.add(day)
    db_session.session.flush()
    job = WorkPlanJob(
        work_plan_day_id=day.id, job_type='defect', berth='east',
        equipment_id=eq.id, defect_id=defect.id,
        estimated_hours=3.0, position=1, priority='normal',
    )
    db_session.session.add(job)
    db_session.session.flush()
    db_session.session.add(WorkPlanAssignment(
        work_plan_job_id=job.id, user_id=specialist.id, is_lead=True,
    ))
    db_session.session.commit()
    return job


def _first_job(resp):
    body = resp.get_json()
    assert body['my_jobs'], 'no jobs came back'
    return body['my_jobs'][0]['jobs'][0]


class TestMyPlanLanguage:
    def test_accept_language_arabic_returns_arabic(
        self, client, engineer, specialist, mech_inspector, db_session
    ):
        """The phone says Arabic; users.language is still the default 'en'."""
        _bilingual_defect_job(db_session, engineer, mech_inspector, specialist)
        assert specialist.language in (None, 'en'), 'fixture assumption'

        headers = get_auth_header(client, 'spec@test.com', 'test123')
        headers['Accept-Language'] = 'ar'
        job = _first_job(client.get('/api/work-plans/my-plan', headers=headers))

        assert job['equipment']['name'] == 'رافعة حاويات'
        assert job['defect']['description'] == 'اهتزاز في المحمل'

    def test_default_still_english(
        self, client, engineer, specialist, mech_inspector, db_session
    ):
        _bilingual_defect_job(db_session, engineer, mech_inspector, specialist)

        headers = get_auth_header(client, 'spec@test.com', 'test123')
        job = _first_job(client.get('/api/work-plans/my-plan', headers=headers))

        assert job['equipment']['name'] == 'Reach Stacker'
        assert job['defect']['description'] == 'Vibration on bearing'

    def test_lang_query_param_also_works(
        self, client, engineer, specialist, mech_inspector, db_session
    ):
        _bilingual_defect_job(db_session, engineer, mech_inspector, specialist)

        headers = get_auth_header(client, 'spec@test.com', 'test123')
        job = _first_job(client.get('/api/work-plans/my-plan?lang=ar', headers=headers))

        assert job['equipment']['name'] == 'رافعة حاويات'

    def test_missing_arabic_falls_back_to_english_not_blank(
        self, client, engineer, specialist, mech_inspector, db_session
    ):
        """An untranslated row must show English, never an empty card."""
        job_row = _bilingual_defect_job(db_session, engineer, mech_inspector, specialist)
        job_row.equipment.name_ar = None
        job_row.defect.description_ar = None
        db_session.session.commit()

        headers = get_auth_header(client, 'spec@test.com', 'test123')
        headers['Accept-Language'] = 'ar'
        job = _first_job(client.get('/api/work-plans/my-plan', headers=headers))

        assert job['equipment']['name'] == 'Reach Stacker'
        assert job['defect']['description'] == 'Vibration on bearing'
