"""
Tests for the 'corrective' job type: a manually-added field-found fix that is NOT
tied to an existing defect record. It needs equipment + a description, but no defect_id.
"""

from datetime import date, timedelta

from tests.conftest import get_auth_header, make_equipment
from app.models import WorkPlan, WorkPlanDay, WorkPlanJob, SAPWorkOrder


def _draft_plan(db_session, admin_user):
    plan = WorkPlan(
        week_start=date.today(), week_end=date.today() + timedelta(days=6),
        status='draft', created_by_id=admin_user.id,
    )
    db_session.session.add(plan)
    db_session.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=date.today())
    db_session.session.add(day)
    db_session.session.commit()
    return plan, day


class TestCorrectiveJob:
    def test_add_corrective_job_without_defect(self, client, admin_user, engineer, db_session):
        """A corrective job is accepted with equipment + description and no defect_id."""
        eq = make_equipment(db_session, 'Corr Pump', 'CORR-1')
        plan, day = _draft_plan(db_session, admin_user)
        headers = get_auth_header(client, 'eng@test.com', 'test123')

        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs',
            headers=headers,
            json={
                'day_id': day.id,
                'job_type': 'corrective',
                'equipment_id': eq.id,
                'description': 'Re-tighten loose coupling bolts found during rounds',
                'estimated_hours': 2.0,
                'priority': 'high',
                'berth': 'east',
            },
        )
        assert resp.status_code == 201, resp.get_json()
        job = resp.get_json()['job']
        assert job['job_type'] == 'corrective'
        assert job.get('defect_id') is None

        saved = db_session.session.get(WorkPlanJob, job['id'])
        assert saved is not None
        assert saved.job_type == 'corrective'
        assert saved.defect_id is None
        assert saved.equipment_id == eq.id

    def test_corrective_requires_description(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Corr Pump2', 'CORR-2')
        plan, day = _draft_plan(db_session, admin_user)
        headers = get_auth_header(client, 'eng@test.com', 'test123')

        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs',
            headers=headers,
            json={
                'day_id': day.id,
                'job_type': 'corrective',
                'equipment_id': eq.id,
                'estimated_hours': 2.0,
            },
        )
        assert resp.status_code == 400

    def test_corrective_requires_equipment(self, client, admin_user, engineer, db_session):
        plan, day = _draft_plan(db_session, admin_user)
        headers = get_auth_header(client, 'eng@test.com', 'test123')

        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs',
            headers=headers,
            json={
                'day_id': day.id,
                'job_type': 'corrective',
                'description': 'Something to fix',
                'estimated_hours': 2.0,
            },
        )
        assert resp.status_code == 400

    def test_corrective_job_returns_to_pool_on_remove(self, client, admin_user, engineer, db_session):
        """Removing a corrective job preserves it in the pool as a pending MANUAL order."""
        eq = make_equipment(db_session, 'Corr Pump3', 'CORR-3')
        plan, day = _draft_plan(db_session, admin_user)
        job = WorkPlanJob(
            work_plan_day_id=day.id, job_type='corrective', equipment_id=eq.id,
            estimated_hours=2.5, description='Patch hydraulic leak', priority='normal', position=1,
        )
        db_session.session.add(job)
        db_session.session.commit()
        job_id = job.id

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.delete(f'/api/work-plans/{plan.id}/jobs/{job_id}', headers=headers)
        assert resp.status_code == 200

        assert db_session.session.get(WorkPlanJob, job_id) is None
        order = SAPWorkOrder.query.filter_by(work_plan_id=plan.id, order_type='MANUAL').first()
        assert order is not None
        assert order.status == 'pending'
        assert order.equipment_id == eq.id
        assert order.job_type == 'corrective'
