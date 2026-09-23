"""A supervisor watches a job. He is not one of its workers.

Ali, 2026-09-23: "we need to have the option to have supervisor for the job, is
it already thier?" — partly. `WorkPlanJob.engineer_id` existed, was validated to
engineer/admin, was editable in Job Details, and NOTHING in the backend ever
read it. A pure label.

He chose a watcher over a worker: responsible for the job, doing none of its
lines, told when it starts and finishes. And he chose that any senior person may
supervise, not only an engineer — SAP's 685 MES-SUPV operations say supervision
is real yard work.

WHY THE FIELD IS STILL CALLED engineer_id
=========================================

Because nothing read it, it was free to BECOME this rather than earn a second
column beside it. Two records of one fact is what this codebase keeps refusing.
Renaming the wire contract would break the mobile payload until an OTA and buy
nothing: only the DISPLAY says "Supervisor".
"""

from datetime import date, timedelta

import pytest

from tests.conftest import get_auth_header, make_equipment
from app.extensions import db
from app.models import (WorkPlan, WorkPlanDay, WorkPlanJob, WorkPlanAssignment,
                        Notification, User)


def _user(email, role, name):
    person = User(email=email, full_name=name, role=role,
                  role_id=email[:6].upper(), shift='day')
    person.set_password('test123')
    db.session.add(person)
    db.session.commit()
    return person


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


def _headers(client, admin_user):
    return get_auth_header(client, admin_user.email, 'admin123')


class TestWhoMaySupervise:
    """Ali widened this deliberately, 2026-09-23."""

    @pytest.mark.parametrize('role', ['engineer', 'admin', 'specialist',
                                      'maintenance'])
    def test_any_senior_person_may_watch_a_job(self, client, admin_user,
                                               db_session, plan_day, role):
        plan, day = plan_day
        eq = make_equipment(db_session, f'SUP{role[:3]}', f'SUP{role[:3]}')
        watcher = _user(f'watch_{role}@test.com', role, f'Watcher {role}')

        resp = client.post(f'/api/work-plans/{plan.id}/jobs',
                           json={'day_id': day.id, 'job_type': 'pm',
                                 'equipment_id': eq.id, 'estimated_hours': 4,
                                 'engineer_id': watcher.id, 'auto_group': False},
                           headers=_headers(client, admin_user))
        assert resp.status_code == 201, resp.get_json()
        assert resp.get_json()['job']['engineer_id'] == watcher.id

    def test_an_inspector_may_not(self, client, admin_user, db_session, plan_day):
        """The one role left out. Inspectors inspect; they do not run jobs."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'SUPINS', 'SUPINS')
        inspector = _user('watch_ins@test.com', 'inspector', 'An Inspector')

        resp = client.post(f'/api/work-plans/{plan.id}/jobs',
                           json={'day_id': day.id, 'job_type': 'pm',
                                 'equipment_id': eq.id, 'estimated_hours': 4,
                                 'engineer_id': inspector.id, 'auto_group': False},
                           headers=_headers(client, admin_user))
        assert resp.status_code == 400

    def test_nobody_is_always_allowed(self, client, admin_user, db_session, plan_day):
        plan, day = plan_day
        eq = make_equipment(db_session, 'SUPNON', 'SUPNON')
        resp = client.post(f'/api/work-plans/{plan.id}/jobs',
                           json={'day_id': day.id, 'job_type': 'pm',
                                 'equipment_id': eq.id, 'estimated_hours': 4,
                                 'auto_group': False},
                           headers=_headers(client, admin_user))
        assert resp.status_code == 201
        assert resp.get_json()['job']['engineer_id'] is None


class TestASupervisorIsNotAWorker:
    """THE INVARIANT. Ali: "not one of the workers".

    If naming a supervisor created a WorkPlanAssignment row he would be counted
    by `bundle_man_hours`, the day budget, `_step_assign`, the board's avatars
    and every "unassigned" count in the app. He would silently become a man the
    planner thinks is busy.
    """

    def test_naming_him_creates_no_assignment(self, client, admin_user,
                                              db_session, plan_day):
        plan, day = plan_day
        eq = make_equipment(db_session, 'SUPW1', 'SUPW1')
        watcher = _user('watch_w1@test.com', 'engineer', 'Haidar Ghulam')

        job_id = client.post(f'/api/work-plans/{plan.id}/jobs',
                             json={'day_id': day.id, 'job_type': 'pm',
                                   'equipment_id': eq.id, 'estimated_hours': 4,
                                   'engineer_id': watcher.id, 'auto_group': False},
                             headers=_headers(client, admin_user)
                             ).get_json()['job']['id']

        assert WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job_id, user_id=watcher.id).count() == 0
        assert WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job_id).count() == 0, 'the job has NO workers yet'

    def test_he_costs_the_day_nothing(self, client, admin_user, db_session,
                                      plan_day):
        """The number a planner actually reads."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'SUPW2', 'SUPW2')
        watcher = _user('watch_w2@test.com', 'maintenance', 'A Senior Fitter')
        h = _headers(client, admin_user)

        job_id = client.post(f'/api/work-plans/{plan.id}/jobs',
                             json={'day_id': day.id, 'job_type': 'pm',
                                   'equipment_id': eq.id, 'estimated_hours': 4,
                                   'auto_group': False}, headers=h
                             ).get_json()['job']['id']
        before = db.session.get(WorkPlanJob, job_id).estimated_hours

        client.put(f'/api/work-plans/{plan.id}/jobs/{job_id}',
                   json={'engineer_id': watcher.id}, headers=h)

        job = db.session.get(WorkPlanJob, job_id)
        assert job.engineer_id == watcher.id
        assert job.estimated_hours == before, 'watching a job does not cost hours'
        assert len(job.assignments) == 0


class TestHeIsToldWhatHappens:
    """Ali: he should "be told when it starts and finishes"."""

    def _job_with_watcher(self, client, admin_user, db_session, plan_day, tag,
                          watcher):
        plan, day = plan_day
        eq = make_equipment(db_session, tag, tag)
        h = _headers(client, admin_user)
        job_id = client.post(f'/api/work-plans/{plan.id}/jobs',
                             json={'day_id': day.id, 'job_type': 'pm',
                                   'equipment_id': eq.id, 'estimated_hours': 4,
                                   'engineer_id': watcher.id, 'auto_group': False},
                             headers=h).get_json()['job']['id']
        return plan, db.session.get(WorkPlanJob, job_id)

    def test_the_helper_tells_both_the_planner_and_the_supervisor(
            self, client, admin_user, db_session, plan_day):
        from app.api.work_plan_tracking import notify_engineers_for_job
        watcher = _user('watch_n1@test.com', 'engineer', 'Haidar Ghulam')
        plan, job = self._job_with_watcher(client, admin_user, db_session,
                                           plan_day, 'SUPN1', watcher)

        notify_engineers_for_job(job, 'work_plan_job_started', 'Job started',
                                 'Hassan started it')

        told = {n.user_id for n in Notification.query.filter_by(
            related_type='work_plan_job', related_id=job.id).all()}
        assert told == {admin_user.id, watcher.id}

    def test_one_person_is_never_told_twice(self, client, admin_user,
                                            db_session, plan_day):
        """The supervisor is very often the person who built the plan.

        Being told twice that one job started teaches people to stop reading
        notifications, which costs far more than it saves.
        """
        from app.api.work_plan_tracking import notify_engineers_for_job
        plan, job = self._job_with_watcher(client, admin_user, db_session,
                                           plan_day, 'SUPN2', admin_user)

        notify_engineers_for_job(job, 'work_plan_job_started', 'Job started',
                                 'Hassan started it')

        count = Notification.query.filter_by(
            related_type='work_plan_job', related_id=job.id,
            user_id=admin_user.id).count()
        assert count == 1

    def test_a_job_with_no_supervisor_still_tells_the_planner(
            self, client, admin_user, db_session, plan_day):
        """The old behaviour, unchanged."""
        from app.api.work_plan_tracking import notify_engineers_for_job
        plan, day = plan_day
        eq = make_equipment(db_session, 'SUPN3', 'SUPN3')
        job_id = client.post(f'/api/work-plans/{plan.id}/jobs',
                             json={'day_id': day.id, 'job_type': 'pm',
                                   'equipment_id': eq.id, 'estimated_hours': 4,
                                   'auto_group': False},
                             headers=_headers(client, admin_user)
                             ).get_json()['job']['id']
        job = db.session.get(WorkPlanJob, job_id)

        notify_engineers_for_job(job, 'work_plan_job_started', 'Job started', 'x')

        told = [n.user_id for n in Notification.query.filter_by(
            related_type='work_plan_job', related_id=job.id).all()]
        assert told == [admin_user.id]
