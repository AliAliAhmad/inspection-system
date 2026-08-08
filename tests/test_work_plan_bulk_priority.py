"""
Tests for POST /jobs/bulk-priority.

`work-plans.api.ts` declared bulkUpdatePriority against this path with no backend
route behind it, so any caller would have 404'd.

Priority has a DB CHECK constraint (low/normal/high/urgent), so an invalid value
must be rejected with a clean 400 rather than reaching the database and raising
an IntegrityError as a 500.
"""

from datetime import date, timedelta

from tests.conftest import get_auth_header, make_equipment
from app.models import WorkPlan, WorkPlanDay, WorkPlanJob


def _draft_plan(db_session, admin_user, week_offset=0):
    """Create a draft plan with one day. week_start is UNIQUE, so a second plan
    in the same test needs a different week_offset."""
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


def _add_jobs(db_session, day, equipment, count, priority='normal'):
    jobs = []
    for i in range(count):
        job = WorkPlanJob(
            work_plan_day_id=day.id, job_type='pm', equipment_id=equipment.id,
            estimated_hours=2.0, description=f'Job {i}', priority=priority,
            position=i + 1, berth='east',
        )
        db_session.session.add(job)
        jobs.append(job)
    db_session.session.commit()
    return jobs


class TestBulkUpdatePriority:
    def test_sets_priority_on_every_job(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Prio Pump', 'PRIO-1')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 3, priority='normal')
        job_ids = [j.id for j in jobs]

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-priority',
            json={'job_ids': job_ids, 'priority': 'urgent'},
            headers=headers,
        )

        assert resp.status_code == 200
        assert resp.get_json()['updated'] == 3
        for job_id in job_ids:
            assert db_session.session.get(WorkPlanJob, job_id).priority == 'urgent'

    def test_leaves_other_jobs_untouched(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Untouched Pump', 'PRIO-2')
        plan, day = _draft_plan(db_session, admin_user)
        targeted = _add_jobs(db_session, day, eq, 2, priority='normal')
        untouched = _add_jobs(db_session, day, eq, 1, priority='low')[0]

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-priority',
            json={'job_ids': [j.id for j in targeted], 'priority': 'high'},
            headers=headers,
        )

        assert resp.status_code == 200
        assert db_session.session.get(WorkPlanJob, untouched.id).priority == 'low'

    def test_accepts_every_valid_priority(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'AllPrio Pump', 'PRIO-3')
        plan, day = _draft_plan(db_session, admin_user)
        job = _add_jobs(db_session, day, eq, 1)[0]

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        for value in ('low', 'normal', 'high', 'urgent'):
            resp = client.post(
                f'/api/work-plans/{plan.id}/jobs/bulk-priority',
                json={'job_ids': [job.id], 'priority': value},
                headers=headers,
            )
            assert resp.status_code == 200, f'{value} should be accepted'
            assert db_session.session.get(WorkPlanJob, job.id).priority == value

    def test_rejects_invalid_priority_with_400_not_500(self, client, admin_user, engineer, db_session):
        """The DB CHECK constraint would raise IntegrityError (500); validate first."""
        eq = make_equipment(db_session, 'Bad Prio Pump', 'PRIO-4')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 2, priority='normal')

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-priority',
            json={'job_ids': [j.id for j in jobs], 'priority': 'super-urgent'},
            headers=headers,
        )

        assert resp.status_code == 400
        # Nothing may be written on a rejected request
        for job in jobs:
            assert db_session.session.get(WorkPlanJob, job.id).priority == 'normal'

    def test_rejects_published_plan(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Pub Prio Pump', 'PRIO-5')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 2, priority='normal')
        plan.status = 'published'
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-priority',
            json={'job_ids': [j.id for j in jobs], 'priority': 'high'},
            headers=headers,
        )

        assert resp.status_code == 403
        for job in jobs:
            assert db_session.session.get(WorkPlanJob, job.id).priority == 'normal'

    def test_rejects_job_from_another_plan(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Foreign Prio Pump', 'PRIO-6')
        plan_a, day_a = _draft_plan(db_session, admin_user)
        plan_b, _day_b = _draft_plan(db_session, admin_user, week_offset=1)
        foreign = _add_jobs(db_session, day_a, eq, 1, priority='normal')[0]

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan_b.id}/jobs/bulk-priority',
            json={'job_ids': [foreign.id], 'priority': 'urgent'},
            headers=headers,
        )

        assert resp.status_code == 404
        assert db_session.session.get(WorkPlanJob, foreign.id).priority == 'normal'

    def test_rejects_unknown_job(self, client, admin_user, engineer, db_session):
        plan, _day = _draft_plan(db_session, admin_user)
        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-priority',
            json={'job_ids': [999999], 'priority': 'high'},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_requires_job_ids_and_priority(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Empty Prio Pump', 'PRIO-7')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 1)

        headers = get_auth_header(client, 'eng@test.com', 'test123')

        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-priority',
            json={'job_ids': [], 'priority': 'high'},
            headers=headers,
        )
        assert resp.status_code == 400

        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-priority',
            json={'job_ids': [j.id for j in jobs]},
            headers=headers,
        )
        assert resp.status_code == 400
