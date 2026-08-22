"""
Removing a job must never destroy the record of work already done on it.

Before this, `_delete_job_record` hard-DELETEd work_plan_job_trackings,
work_plan_assignments, work_plan_materials and job_checklist_responses. Taking a
finished job off a plan silently erased who did it, how long it took, their
checklist answers and the parts used.

Separately, work_plan_job_ratings.work_plan_job_id is a NOT NULL FK that was NOT
in that delete list. The consequence differs by database, and both are wrong:
  - PostgreSQL (production) enforces the FK -> IntegrityError, 500 on screen,
    job not removed at all.
  - SQLite (this test suite, PRAGMA foreign_keys=0) does not enforce it -> the
    job is deleted and the rating row is left dangling, pointing at a job that
    no longer exists.
These tests assert the refusal, which is what fixes both.

Note: points and stars were never at risk. point_history and star_history key on
users.id and hold no FK to the job, so they survive. What was lost was the
evidence behind them.
"""

from datetime import date, timedelta

import pytest

from tests.conftest import get_auth_header, make_equipment
from app.models import (
    WorkPlan, WorkPlanDay, WorkPlanJob, WorkPlanAssignment, User,
)
from app.models.work_plan_job_tracking import WorkPlanJobTracking
from app.models.work_plan_job_rating import WorkPlanJobRating


@pytest.fixture
def plan_day(db_session, admin_user):
    start = date.today()
    plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                    status='draft', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=start)
    db_session.session.add(day)
    db_session.session.commit()
    return plan, day


def _job(db_session, day, equipment, position=1):
    job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm', equipment_id=equipment.id,
                      estimated_hours=4.0, position=position)
    db_session.session.add(job)
    db_session.session.commit()
    return job


def _worker(db_session, email='rw@test.com'):
    u = User(email=email, full_name='Removal Worker', role='specialist',
             role_id=email.split('@')[0].upper(), shift='day')
    u.set_password('test123')
    db_session.session.add(u)
    db_session.session.commit()
    return u


def _track(db_session, job, user, status):
    # Tracking is per-JOB, not per-user — the crew is recorded via assignments.
    t = WorkPlanJobTracking(work_plan_job_id=job.id, status=status,
                            actual_hours=6.0 if status == 'completed' else None)
    db_session.session.add(t)
    db_session.session.commit()
    return t


class TestUntouchedJobsStillDelete:
    def test_job_nobody_touched_is_removed_normally(self, client, admin_user, engineer,
                                                    db_session, plan_day):
        """Scenario 1 — nothing to lose, behaviour unchanged."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'Untouched Pump', 'RM-1')
        job = _job(db_session, day, eq)

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.delete(f'/api/work-plans/{plan.id}/jobs/{job.id}', headers=headers)

        assert resp.status_code == 200
        assert db_session.session.get(WorkPlanJob, job.id) is None

    def test_assigned_but_not_started_is_removed(self, client, admin_user, engineer,
                                                 db_session, plan_day):
        """Scenario 2 — men were named but no work happened."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'Assigned Pump', 'RM-2')
        job = _job(db_session, day, eq)
        w = _worker(db_session, 'assigned@test.com')
        db_session.session.add(WorkPlanAssignment(work_plan_job_id=job.id, user_id=w.id))
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.delete(f'/api/work-plans/{plan.id}/jobs/{job.id}', headers=headers)
        assert resp.status_code == 200


class TestWorkedJobsAreProtected:
    @pytest.mark.parametrize('status', ['in_progress', 'paused'])
    def test_in_flight_job_cannot_be_removed(self, client, admin_user, engineer,
                                             db_session, plan_day, status):
        """Scenarios 3 and 4 — a man is on it; his record must not be erased."""
        plan, day = plan_day
        eq = make_equipment(db_session, f'Live Pump {status}', f'RM-{status}')
        job = _job(db_session, day, eq)
        w = _worker(db_session, f'{status}@test.com')
        _track(db_session, job, w, status)

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.delete(f'/api/work-plans/{plan.id}/jobs/{job.id}', headers=headers)

        assert resp.status_code == 403
        assert db_session.session.get(WorkPlanJob, job.id) is not None, 'job must survive'
        assert WorkPlanJobTracking.query.filter_by(work_plan_job_id=job.id).first() is not None, \
            'the work record must survive'

    def test_finished_job_cannot_be_removed(self, client, admin_user, engineer,
                                            db_session, plan_day):
        """Scenario 5 — the work happened; taking it off understates the week."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'Done Pump', 'RM-5')
        job = _job(db_session, day, eq)
        w = _worker(db_session, 'done@test.com')
        _track(db_session, job, w, 'completed')

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.delete(f'/api/work-plans/{plan.id}/jobs/{job.id}', headers=headers)

        assert resp.status_code == 403
        assert 'finished' in resp.get_json()['message'].lower()

    def test_rated_job_is_refused_not_crashed(self, client, admin_user, engineer,
                                              db_session, plan_day):
        """Scenario 6 — previously: 500 on Postgres, orphaned rating row on SQLite."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'Rated Pump', 'RM-6')
        job = _job(db_session, day, eq)
        w = _worker(db_session, 'rated@test.com')
        _track(db_session, job, w, 'completed')
        db_session.session.add(WorkPlanJobRating(work_plan_job_id=job.id, user_id=w.id,
                                                 is_lead=True, points_earned=10))
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.delete(f'/api/work-plans/{plan.id}/jobs/{job.id}', headers=headers)

        assert resp.status_code == 403, f'expected a clean refusal, got {resp.status_code}'
        assert WorkPlanJobRating.query.filter_by(work_plan_job_id=job.id).first() is not None


class TestClearAllJobsKeepsWork:
    def test_clear_removes_untouched_and_keeps_worked(self, client, admin_user, engineer,
                                                      db_session, plan_day):
        """Scenario 11 — one button, mixed states. Clear what is safe, report the rest."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'Mixed Pump', 'RM-11')
        untouched_a = _job(db_session, day, eq, position=1)
        untouched_b = _job(db_session, day, eq, position=2)
        worked = _job(db_session, day, eq, position=3)
        w = _worker(db_session, 'mixed@test.com')
        _track(db_session, worked, w, 'completed')
        untouched_a_id, untouched_b_id, worked_id = untouched_a.id, untouched_b.id, worked.id

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(f'/api/work-plans/clear-jobs/{plan.week_start.isoformat()}',
                           headers=headers)

        assert resp.status_code == 200
        body = resp.get_json()
        assert body['deleted'] == 2
        assert body['kept'] == 1

        # Query fresh rather than session.get() — the identity map still holds the
        # deleted instances and raises ObjectDeletedError instead of returning None.
        db_session.session.expire_all()
        remaining = {j.id for j in WorkPlanJob.query.all()}
        assert untouched_a_id not in remaining
        assert untouched_b_id not in remaining
        assert worked_id in remaining, 'the finished job must survive Clear All'
        assert WorkPlanJobTracking.query.filter_by(work_plan_job_id=worked_id).first() is not None
