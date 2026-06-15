"""
Tests for routing defects through the work plan + unified worker features:
- worker planned-time entry + enforcement on start
- AI planned-time estimate endpoint
- double-booking guard (a defect can't be both a SpecialistJob and a WorkPlanJob)
"""

from datetime import date, timedelta

from tests.conftest import get_auth_header, make_equipment
from app.models import (
    Defect, Inspection, ChecklistTemplate, SpecialistJob,
    WorkPlan, WorkPlanDay, WorkPlanJob, WorkPlanAssignment,
)


def _defect_with_inspection(db_session, inspector, equipment, severity='medium'):
    template = ChecklistTemplate(
        name='WP Template', equipment_type='centrifugal_pump',
        version=f'wp-{equipment.id}',
    )
    db_session.session.add(template)
    db_session.session.flush()

    insp = Inspection(
        equipment_id=equipment.id, template_id=template.id,
        technician_id=inspector.id, status='submitted',
    )
    db_session.session.add(insp)
    db_session.session.flush()

    defect = Defect(
        inspection_id=insp.id,
        description='Vibration on bearing',
        severity=severity,
        status='open',
        due_date=date.today() + timedelta(days=7),
    )
    db_session.session.add(defect)
    db_session.session.flush()
    return defect


def _work_plan_with_defect_job(db_session, engineer, equipment, defect, assignee, status='published'):
    plan = WorkPlan(
        week_start=date.today(), week_end=date.today() + timedelta(days=6),
        status=status, created_by_id=engineer.id,
    )
    db_session.session.add(plan)
    db_session.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=date.today())
    db_session.session.add(day)
    db_session.session.flush()
    job = WorkPlanJob(
        work_plan_day_id=day.id, job_type='defect', berth='east',
        equipment_id=equipment.id, defect_id=defect.id,
        estimated_hours=3.0, position=1, priority='normal',
    )
    db_session.session.add(job)
    db_session.session.flush()
    db_session.session.add(WorkPlanAssignment(
        work_plan_job_id=job.id, user_id=assignee.id, is_lead=True,
    ))
    db_session.session.commit()
    return plan, day, job


class TestPlannedTimeEnforcement:
    def test_start_without_planned_time_rejected(self, client, engineer, specialist, mech_inspector, db_session):
        eq = make_equipment(db_session, 'WP Pump', 'WPP-1')
        defect = _defect_with_inspection(db_session, mech_inspector, eq)
        _, _, job = _work_plan_with_defect_job(db_session, engineer, eq, defect, specialist)

        headers = get_auth_header(client, 'spec@test.com', 'test123')
        resp = client.post(f'/api/work-plan-tracking/jobs/{job.id}/start', headers=headers, json={})
        assert resp.status_code == 400
        assert 'planned time' in resp.get_json()['message'].lower()

    def test_start_with_planned_time_succeeds(self, client, engineer, specialist, mech_inspector, db_session):
        eq = make_equipment(db_session, 'WP Pump', 'WPP-2')
        defect = _defect_with_inspection(db_session, mech_inspector, eq)
        _, _, job = _work_plan_with_defect_job(db_session, engineer, eq, defect, specialist)

        headers = get_auth_header(client, 'spec@test.com', 'test123')
        resp = client.post(f'/api/work-plan-tracking/jobs/{job.id}/start', headers=headers,
                           json={'planned_time_hours': 2.5})
        assert resp.status_code == 200
        refreshed = db_session.session.get(WorkPlanJob, job.id)
        assert float(refreshed.planned_time_hours) == 2.5
        assert refreshed.has_planned_time()

    def test_enter_planned_time_then_double_entry_rejected(self, client, engineer, specialist, mech_inspector, db_session):
        eq = make_equipment(db_session, 'WP Pump', 'WPP-3')
        defect = _defect_with_inspection(db_session, mech_inspector, eq)
        _, _, job = _work_plan_with_defect_job(db_session, engineer, eq, defect, specialist)

        headers = get_auth_header(client, 'spec@test.com', 'test123')
        ok = client.post(f'/api/work-plan-tracking/jobs/{job.id}/planned-time', headers=headers,
                         json={'planned_time_hours': 4})
        assert ok.status_code == 200
        again = client.post(f'/api/work-plan-tracking/jobs/{job.id}/planned-time', headers=headers,
                            json={'planned_time_hours': 5})
        assert again.status_code >= 400  # rejected (BusinessError -> 422)
        # The original committed value must be unchanged
        assert float(db_session.session.get(WorkPlanJob, job.id).planned_time_hours) == 4


class TestAIEstimate:
    def test_ai_estimate_returns_payload(self, client, engineer, specialist, mech_inspector, db_session):
        eq = make_equipment(db_session, 'WP Pump', 'WPP-4')
        defect = _defect_with_inspection(db_session, mech_inspector, eq, severity='high')
        _, _, job = _work_plan_with_defect_job(db_session, engineer, eq, defect, specialist)

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post('/api/work-plan-tracking/ai-estimate-time', headers=headers,
                           json={'job_id': job.id})
        assert resp.status_code == 200
        data = resp.get_json()['data']
        assert data['estimated_hours'] > 0
        assert data['confidence'] in ('low', 'medium', 'high')
        assert len(data['suggestions']) == 3


class TestDoubleBookingGuard:
    def test_assign_specialist_rejected_when_scheduled(self, client, engineer, specialist, admin_user, mech_inspector, db_session):
        eq = make_equipment(db_session, 'WP Pump', 'WPP-5')
        defect = _defect_with_inspection(db_session, mech_inspector, eq)
        _work_plan_with_defect_job(db_session, engineer, eq, defect, specialist)

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post(f'/api/defects/{defect.id}/assign-specialist', headers=headers,
                           json={'specialist_ids': [specialist.id]})
        assert resp.status_code == 400
        assert 'work plan' in resp.get_json()['message'].lower()

    def test_available_jobs_excludes_specialist_owned_defect(self, client, engineer, specialist, admin_user, mech_inspector, db_session):
        eq = make_equipment(db_session, 'WP Pump', 'WPP-6')
        defect = _defect_with_inspection(db_session, mech_inspector, eq)
        # Directly assign to a specialist (active job)
        db_session.session.add(SpecialistJob(
            universal_id=900 + specialist.id, job_id=f'SPE{specialist.id:03d}-900',
            specialist_id=specialist.id, assigned_by=admin_user.id,
            defect_id=defect.id, status='assigned', category='minor',
        ))
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get('/api/work-plans/available-jobs', headers=headers)
        assert resp.status_code == 200
        defect_ids = [d['defect']['id'] for d in resp.get_json().get('defect_jobs', [])]
        assert defect.id not in defect_ids
