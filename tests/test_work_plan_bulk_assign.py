"""
Tests for POST /jobs/bulk-assign, used by the web planner when a worker is
dropped onto a whole bundle card.

Assignment is ADDITIVE: it never removes anyone. Assigning a user who is
already on a job updates their is_lead flag instead of creating a duplicate.
"""

from datetime import date, timedelta

from tests.conftest import get_auth_header, make_equipment
from app.models import WorkPlan, WorkPlanDay, WorkPlanJob, WorkPlanAssignment, User


def _draft_plan(db_session, admin_user, week_offset=0):
    """Create a draft plan with one day.

    week_start is UNIQUE, so a second plan in the same test needs a different
    week_offset.
    """
    start = date.today() + timedelta(weeks=week_offset)
    plan = WorkPlan(
        week_start=start, week_end=start + timedelta(days=6),
        status='draft', created_by_id=admin_user.id,
    )
    db_session.session.add(plan)
    db_session.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=start)
    db_session.session.add(day)
    db_session.session.flush()
    return plan, day


def _add_jobs(db_session, day, equipment, count):
    jobs = []
    for i in range(count):
        job = WorkPlanJob(
            work_plan_day_id=day.id, job_type='pm', equipment_id=equipment.id,
            estimated_hours=2.0, description=f'Job {i}', priority='normal',
            position=i + 1, berth='east',
        )
        db_session.session.add(job)
        jobs.append(job)
    db_session.session.commit()
    return jobs


def _make_worker(db_session, email, name):
    user = User(email=email, full_name=name, role='specialist',
                role_id=email.split('@')[0].upper(), shift='day')
    user.set_password('test123')
    db_session.session.add(user)
    db_session.session.commit()
    return user


class TestBulkAssign:
    def test_assigns_user_to_every_job(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Assign Pump', 'ASSIGN-1')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 3)
        worker = _make_worker(db_session, 'w1@test.com', 'Worker One')

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [j.id for j in jobs], 'user_ids': [worker.id], 'is_lead': False},
            headers=headers,
        )

        assert resp.status_code == 200
        assert resp.get_json()['assigned'] == 3
        for job in jobs:
            a = WorkPlanAssignment.query.filter_by(
                work_plan_job_id=job.id, user_id=worker.id).first()
            assert a is not None

    def test_is_lead_applies_to_all_jobs(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Lead Pump', 'ASSIGN-2')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 3)
        worker = _make_worker(db_session, 'w2@test.com', 'Worker Two')

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [j.id for j in jobs], 'user_ids': [worker.id], 'is_lead': True},
            headers=headers,
        )

        assert resp.status_code == 200
        for job in jobs:
            a = WorkPlanAssignment.query.filter_by(
                work_plan_job_id=job.id, user_id=worker.id).first()
            assert a.is_lead is True, 'lead must apply to every job in the bundle'

    def test_is_additive_keeps_other_workers(self, client, admin_user, engineer, db_session):
        """A bundle drop must never remove someone who is already assigned."""
        eq = make_equipment(db_session, 'Additive Pump', 'ASSIGN-3')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 2)
        existing = _make_worker(db_session, 'w3a@test.com', 'Existing Worker')
        newcomer = _make_worker(db_session, 'w3b@test.com', 'New Worker')

        db_session.session.add(WorkPlanAssignment(
            work_plan_job_id=jobs[0].id, user_id=existing.id, is_lead=True))
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [j.id for j in jobs], 'user_ids': [newcomer.id], 'is_lead': False},
            headers=headers,
        )

        assert resp.status_code == 200
        assert WorkPlanAssignment.query.filter_by(
            work_plan_job_id=jobs[0].id, user_id=existing.id).first() is not None
        assert WorkPlanAssignment.query.filter_by(
            work_plan_job_id=jobs[0].id).count() == 2

    def test_reassigning_updates_lead_without_duplicating(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Dup Pump', 'ASSIGN-4')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 2)
        worker = _make_worker(db_session, 'w4@test.com', 'Worker Four')

        db_session.session.add(WorkPlanAssignment(
            work_plan_job_id=jobs[0].id, user_id=worker.id, is_lead=False))
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [j.id for j in jobs], 'user_ids': [worker.id], 'is_lead': True},
            headers=headers,
        )

        assert resp.status_code == 200
        rows = WorkPlanAssignment.query.filter_by(
            work_plan_job_id=jobs[0].id, user_id=worker.id).all()
        assert len(rows) == 1, 'must update in place, not duplicate'
        assert rows[0].is_lead is True

    def test_rejects_published_plan(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Pub Assign Pump', 'ASSIGN-5')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 2)
        worker = _make_worker(db_session, 'w5@test.com', 'Worker Five')
        plan.status = 'published'
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [j.id for j in jobs], 'user_ids': [worker.id], 'is_lead': False},
            headers=headers,
        )

        assert resp.status_code == 403
        assert WorkPlanAssignment.query.filter_by(user_id=worker.id).count() == 0

    def test_rejects_job_from_another_plan(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Foreign Pump', 'ASSIGN-6')
        plan_a, day_a = _draft_plan(db_session, admin_user)
        plan_b, _day_b = _draft_plan(db_session, admin_user, week_offset=1)
        foreign = _add_jobs(db_session, day_a, eq, 1)[0]
        worker = _make_worker(db_session, 'w6@test.com', 'Worker Six')

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan_b.id}/jobs/bulk-assign',
            json={'job_ids': [foreign.id], 'user_ids': [worker.id], 'is_lead': False},
            headers=headers,
        )

        assert resp.status_code == 404
        assert WorkPlanAssignment.query.filter_by(user_id=worker.id).count() == 0

    def test_rejects_unknown_user(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Ghost Pump', 'ASSIGN-7')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 1)

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [j.id for j in jobs], 'user_ids': [999999], 'is_lead': False},
            headers=headers,
        )

        assert resp.status_code == 404

    def test_requires_job_ids_and_user_ids(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Empty Pump', 'ASSIGN-8')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 1)
        worker = _make_worker(db_session, 'w8@test.com', 'Worker Eight')

        headers = get_auth_header(client, 'eng@test.com', 'test123')

        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [], 'user_ids': [worker.id], 'is_lead': False},
            headers=headers,
        )
        assert resp.status_code == 400

        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [j.id for j in jobs], 'user_ids': [], 'is_lead': False},
            headers=headers,
        )
        assert resp.status_code == 400
