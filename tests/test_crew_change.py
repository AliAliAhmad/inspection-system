"""Changing who is on a job after the week has been published.

Ali, 2026-09-23: "how the supervisor can change the employee already assigned to
a job, is the plan should be in edit mode or no issue if in publish mode???" and
then "this need the admin or the planner approval".

His answers, each pinned below:
  * a PLANNER changes the crew of a PUBLISHED week directly — only while nobody
    has started the job. Revise would blank the whole week on every phone.
  * a SUPERVISOR who is not a planner only ASKS; any engineer or admin approves.
  * the request lives in the Approvals inbox; engineers enter it for crew
    changes ONLY.
  * a job that starts while a request waits cancels the request.
"""

from datetime import date, datetime, timedelta

import pytest

from tests.conftest import get_auth_header, make_equipment
from app.extensions import db
from app.models import (Leave, Notification, User, WorkPlan, WorkPlanAssignment,
                        WorkPlanCrewChangeRequest, WorkPlanDay, WorkPlanJob,
                        WorkPlanJobTask, WorkPlanJobTracking)


def _user(email, role, name):
    person = User(email=email, full_name=name, role=role,
                  role_id=email.split('@')[0].upper()[:12], shift='day')
    person.set_password('test123')
    db.session.add(person)
    db.session.commit()
    return person


def _h(client, user):
    pw = 'admin123' if user.email == 'admin@test.com' else 'test123'
    return get_auth_header(client, user.email, pw)


@pytest.fixture
def world(db_session, admin_user):
    """A PUBLISHED week, one SAP job on today, two men on it, a maintenance
    supervisor watching it, and a spare man who could replace one of them."""
    start = date.today()
    plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                    status='published', created_by_id=admin_user.id)
    db.session.add(plan)
    db.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=start)
    db.session.add(day)
    db.session.flush()

    eq = make_equipment(db_session, 'RS109', 'RS109')
    supervisor = _user('sup@test.com', 'maintenance', 'Senior Fitter')
    hassan = _user('hassan@test.com', 'specialist', 'Hassan')
    karim = _user('karim@test.com', 'specialist', 'Karim')
    spare = _user('spare@test.com', 'specialist', 'Spare Man')
    engineer = _user('eng@test.com', 'engineer', 'An Engineer')

    job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm',
                      equipment_id=eq.id, estimated_hours=4, berth='east',
                      sap_order_number='700001234567', engineer_id=supervisor.id)
    db.session.add(job)
    db.session.flush()
    db.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                      user_id=hassan.id, is_lead=True))
    db.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                      user_id=karim.id, is_lead=False))
    db.session.commit()
    return dict(plan=plan, day=day, job=job, sup=supervisor, hassan=hassan,
                karim=karim, spare=spare, eng=engineer, admin=admin_user)


def _team(job_id):
    return {a.user_id: a.is_lead for a in
            WorkPlanAssignment.query.filter_by(work_plan_job_id=job_id).all()}


def _start(job):
    db.session.add(WorkPlanJobTracking(work_plan_job_id=job.id,
                                       status='in_progress'))
    db.session.commit()


def _operation(job, creator, **kw):
    op = WorkPlanJobTask(anchor_kind='sap', anchor_key=job.sap_order_number,
                         content='Change hydraulic filter', source='sap',
                         operation_number='0010', created_by_id=creator.id, **kw)
    db.session.add(op)
    db.session.commit()
    return op


# ─── A planner, on a published week ────────────────────────────────────────

class TestAPlannerOnAPublishedWeek:

    def test_he_can_add_a_man_without_revise(self, client, world):
        w = world
        r = client.post(f"/api/work-plans/{w['plan'].id}/jobs/{w['job'].id}/assignments",
                        json={'user_id': w['spare'].id}, headers=_h(client, w['admin']))
        assert r.status_code == 201, r.get_json()
        assert w['spare'].id in _team(w['job'].id)
        assert db.session.get(WorkPlan, w['plan'].id).status == 'published', \
            'the week must stay on the phones'

    def test_he_can_take_a_man_off(self, client, world):
        w = world
        row = WorkPlanAssignment.query.filter_by(
            work_plan_job_id=w['job'].id, user_id=w['karim'].id).first()
        r = client.delete(f"/api/work-plans/{w['plan'].id}/jobs/{w['job'].id}"
                          f"/assignments/{row.id}", headers=_h(client, w['eng']))
        assert r.status_code == 200, r.get_json()
        assert w['karim'].id not in _team(w['job'].id)

    def test_both_men_are_told(self, client, world):
        """In a draft nobody is told — publishing tells them. On a live week the
        change is news, so the server says so."""
        w = world
        client.post(f"/api/work-plans/{w['plan'].id}/jobs/{w['job'].id}/assignments",
                    json={'user_id': w['spare'].id}, headers=_h(client, w['admin']))
        told = Notification.query.filter_by(user_id=w['spare'].id).all()
        assert told and told[0].title == 'Added to a job'
        assert told[0].title_ar, 'Arabic written by us, not the dead AI chain'

    def test_a_started_job_keeps_its_men(self, client, world):
        w = world
        _start(w['job'])
        r = client.post(f"/api/work-plans/{w['plan'].id}/jobs/{w['job'].id}/assignments",
                        json={'user_id': w['spare'].id}, headers=_h(client, w['admin']))
        assert r.status_code == 403
        assert 'already started' in r.get_json()['message']

    def test_a_running_line_counts_as_started(self, client, world):
        """THE TRAP. A line's timer does not touch the job's tracking row, so
        reading tracking alone would say 'not started' while a man is three hours
        into line 0010."""
        w = world
        _operation(w['job'], w['admin'], status='in_progress',
                   started_at=datetime.utcnow())
        r = client.post(f"/api/work-plans/{w['plan'].id}/jobs/{w['job'].id}/assignments",
                        json={'user_id': w['spare'].id}, headers=_h(client, w['admin']))
        assert r.status_code == 403

    def test_last_weeks_line_does_not_lock_this_weeks_crew(self, client, world):
        """Operations hang on the SAP order and outlive the week. Half an order
        done last week is history; this week's crew is still open."""
        w = world
        _operation(w['job'], w['admin'], status='completed', is_done=True,
                   started_at=datetime.utcnow() - timedelta(days=8),
                   done_at=datetime.utcnow() - timedelta(days=8))
        r = client.post(f"/api/work-plans/{w['plan'].id}/jobs/{w['job'].id}/assignments",
                        json={'user_id': w['spare'].id}, headers=_h(client, w['admin']))
        assert r.status_code == 201, r.get_json()

    def test_a_man_on_leave_that_day_is_refused(self, client, world):
        """The board checks leave in the browser only. On a live week the man is
        told at once, so the server must refuse him itself."""
        w = world
        db.session.add(Leave(user_id=w['spare'].id, leave_type='annual',
                             date_from=w['day'].date, date_to=w['day'].date,
                             total_days=1, status='approved'))
        db.session.commit()
        r = client.post(f"/api/work-plans/{w['plan'].id}/jobs/{w['job'].id}/assignments",
                        json={'user_id': w['spare'].id}, headers=_h(client, w['admin']))
        assert r.status_code == 400
        assert 'on leave' in r.get_json()['message']

    def test_bulk_assign_stays_draft_only(self, client, world):
        """The board's bundle drop is planning, not a correction."""
        w = world
        r = client.post(f"/api/work-plans/{w['plan'].id}/jobs/bulk-assign",
                        json={'job_ids': [w['job'].id], 'user_ids': [w['spare'].id]},
                        headers=_h(client, w['admin']))
        assert r.status_code == 403


# ─── A supervisor asks ─────────────────────────────────────────────────────

def _ask(client, w, **body):
    return client.post(f"/api/work-plans/jobs/{w['job'].id}/crew-change-requests",
                       json=body, headers=_h(client, w['sup']))


class TestASupervisorAsks:

    def test_asking_changes_nothing(self, client, world):
        w = world
        before = _team(w['job'].id)
        r = _ask(client, w, remove_user_id=w['karim'].id, add_user_id=w['spare'].id,
                 reason='Karim is needed on the crane')
        assert r.status_code == 201, r.get_json()
        assert _team(w['job'].id) == before, 'nothing moves until a planner says yes'

    def test_every_planner_is_told(self, client, world):
        w = world
        _ask(client, w, add_user_id=w['spare'].id)
        for planner in (w['admin'], w['eng']):
            assert Notification.query.filter_by(
                user_id=planner.id, title='Crew change requested').count() == 1

    def test_he_cannot_change_the_crew_directly(self, client, world):
        w = world
        r = client.post(f"/api/work-plans/{w['plan'].id}/jobs/{w['job'].id}/assignments",
                        json={'user_id': w['spare'].id}, headers=_h(client, w['sup']))
        assert r.status_code == 403

    def test_only_this_jobs_supervisor_may_ask(self, client, world):
        w = world
        r = client.post(f"/api/work-plans/jobs/{w['job'].id}/crew-change-requests",
                        json={'add_user_id': w['spare'].id},
                        headers=_h(client, w['hassan']))
        assert r.status_code == 403

    def test_a_planner_is_told_to_do_it_himself(self, client, world):
        w = world
        w['job'].engineer_id = w['eng'].id
        db.session.commit()
        r = client.post(f"/api/work-plans/jobs/{w['job'].id}/crew-change-requests",
                        json={'add_user_id': w['spare'].id}, headers=_h(client, w['eng']))
        assert r.status_code == 400

    @pytest.mark.parametrize('body, why', [
        ({}, 'no change at all'),
        ({'remove_user_id': 'SPARE'}, 'not an id'),
    ])
    def test_nonsense_is_refused(self, client, world, body, why):
        w = world
        if body.get('remove_user_id') == 'SPARE':
            body = {'remove_user_id': 'abc'}
        assert _ask(client, w, **body).status_code == 400, why

    def test_cannot_remove_a_man_who_is_not_there(self, client, world):
        w = world
        assert _ask(client, w, remove_user_id=w['spare'].id).status_code == 400

    def test_cannot_add_a_man_on_leave(self, client, world):
        w = world
        db.session.add(Leave(user_id=w['spare'].id, leave_type='sick',
                             date_from=w['day'].date, date_to=w['day'].date,
                             total_days=1, status='approved'))
        db.session.commit()
        assert _ask(client, w, add_user_id=w['spare'].id).status_code == 400

    def test_the_same_request_twice_is_refused(self, client, world):
        w = world
        assert _ask(client, w, add_user_id=w['spare'].id).status_code == 201
        assert _ask(client, w, add_user_id=w['spare'].id).status_code == 400

    def test_options_mark_the_man_on_leave(self, client, world):
        """His pick list — he cannot read /users/for-assignment."""
        w = world
        db.session.add(Leave(user_id=w['spare'].id, leave_type='sick',
                             date_from=w['day'].date, date_to=w['day'].date,
                             total_days=1, status='approved'))
        db.session.commit()
        r = client.get(f"/api/work-plans/jobs/{w['job'].id}/crew-change-options",
                       headers=_h(client, w['sup']))
        assert r.status_code == 200
        data = r.get_json()['data']
        assert {m['user_id'] for m in data['team']} == {w['hassan'].id, w['karim'].id}
        spare = next(c for c in data['candidates'] if c['id'] == w['spare'].id)
        assert spare['on_leave'] is True
        assert all(c['id'] not in (w['hassan'].id, w['karim'].id)
                   for c in data['candidates'])

    def test_job_details_says_whether_he_may_ask(self, client, world):
        w = world
        mine = client.get(f"/api/work-plans/jobs/{w['job'].id}/details",
                          headers=_h(client, w['sup'])).get_json()['data']
        assert mine['can_request_crew_change'] is True
        admin = client.get(f"/api/work-plans/jobs/{w['job'].id}/details",
                           headers=_h(client, w['admin'])).get_json()['data']
        assert admin['can_request_crew_change'] is False

    def test_he_can_withdraw_his_own(self, client, world):
        w = world
        rid = _ask(client, w, add_user_id=w['spare'].id).get_json()['data']['id']
        r = client.delete(f'/api/work-plans/crew-change-requests/{rid}',
                          headers=_h(client, w['sup']))
        assert r.status_code == 200
        assert db.session.get(WorkPlanCrewChangeRequest, rid).status == 'cancelled'


# ─── A planner decides, in the Approvals inbox ─────────────────────────────

def _decide(client, who, rid, action, reason=None):
    return client.post('/api/approvals/bulk-action',
                       json={'items': [{'type': 'crew_change', 'id': rid}],
                             'action': action, 'reason': reason},
                       headers=_h(client, who))


class TestAPlannerDecides:

    def test_an_engineer_approves_a_swap(self, client, world):
        w = world
        rid = _ask(client, w, remove_user_id=w['hassan'].id,
                   add_user_id=w['spare'].id).get_json()['data']['id']
        r = _decide(client, w['eng'], rid, 'approve')
        assert r.get_json()['data']['success_count'] == 1, r.get_json()
        team = _team(w['job'].id)
        assert w['hassan'].id not in team
        assert team[w['spare'].id] is True, 'the replacement takes the lead role'
        assert db.session.get(WorkPlanCrewChangeRequest, rid).status == 'approved'

    def test_the_supervisor_and_both_men_are_told(self, client, world):
        w = world
        rid = _ask(client, w, remove_user_id=w['karim'].id,
                   add_user_id=w['spare'].id).get_json()['data']['id']
        _decide(client, w['admin'], rid, 'approve')
        assert Notification.query.filter_by(
            user_id=w['sup'].id, title='Crew change approved').count() == 1
        assert Notification.query.filter_by(
            user_id=w['spare'].id, title='Added to a job').count() == 1
        assert Notification.query.filter_by(
            user_id=w['karim'].id, title='Removed from a job').count() == 1

    def test_first_press_wins(self, client, world):
        w = world
        rid = _ask(client, w, add_user_id=w['spare'].id).get_json()['data']['id']
        _decide(client, w['eng'], rid, 'reject', 'He is on the crane')
        second = _decide(client, w['admin'], rid, 'approve')
        assert second.get_json()['data']['failed_count'] == 1
        assert w['spare'].id not in _team(w['job'].id)

    def test_a_job_that_started_cancels_the_request(self, client, world):
        w = world
        rid = _ask(client, w, add_user_id=w['spare'].id).get_json()['data']['id']
        _start(w['job'])
        r = _decide(client, w['eng'], rid, 'approve')
        assert r.get_json()['data']['failed_count'] == 1
        req = db.session.get(WorkPlanCrewChangeRequest, rid)
        assert req.status == 'cancelled', 'saved, not rolled back with the refusal'
        assert w['spare'].id not in _team(w['job'].id)

    def test_pressing_start_cancels_it_at_once(self, client, world):
        w = world
        rid = _ask(client, w, add_user_id=w['spare'].id).get_json()['data']['id']
        # The app requires a planned time before Start.
        client.post(f"/api/work-plan-tracking/jobs/{w['job'].id}/planned-time",
                    json={'planned_time_hours': 4}, headers=_h(client, w['hassan']))
        r = client.post(f"/api/work-plan-tracking/jobs/{w['job'].id}/start",
                        headers=_h(client, w['hassan']))
        assert r.status_code == 200, r.get_json()
        assert db.session.get(WorkPlanCrewChangeRequest, rid).status == 'cancelled'
        assert Notification.query.filter_by(
            user_id=w['sup'].id, title='Crew change cancelled').count() == 1


class TestTheInboxForEngineers:
    """Engineers enter the Approvals page for crew changes ONLY — enforced on
    the server, because hiding a tab stops nobody posting to the endpoint."""

    def test_engineer_sees_crew_changes_and_nothing_else(self, client, world):
        w = world
        _ask(client, w, add_user_id=w['spare'].id)
        db.session.add(Leave(user_id=w['karim'].id, leave_type='annual',
                             date_from=date.today() + timedelta(days=30),
                             date_to=date.today() + timedelta(days=31),
                             total_days=2, status='pending'))
        db.session.commit()
        body = client.get('/api/approvals', headers=_h(client, w['eng'])).get_json()
        assert {a['type'] for a in body['data']} == {'crew_change'}
        assert body['counts']['leave'] == 0
        assert body['counts']['crew_change'] == 1

    def test_engineer_cannot_approve_a_leave(self, client, world):
        w = world
        leave = Leave(user_id=w['karim'].id, leave_type='annual',
                      date_from=date.today() + timedelta(days=30),
                      date_to=date.today() + timedelta(days=31),
                      total_days=2, status='pending')
        db.session.add(leave)
        db.session.commit()
        r = client.post('/api/approvals/bulk-action',
                        json={'items': [{'type': 'leave', 'id': leave.id}],
                              'action': 'approve'},
                        headers=_h(client, w['eng']))
        assert r.get_json()['data']['failed_count'] == 1
        assert db.session.get(Leave, leave.id).status == 'pending'

    def test_admin_still_sees_everything(self, client, world):
        w = world
        _ask(client, w, add_user_id=w['spare'].id)
        body = client.get('/api/approvals', headers=_h(client, w['admin'])).get_json()
        assert 'crew_change' in {a['type'] for a in body['data']}
        assert set(body['counts']) >= {'leave', 'pause', 'bonus', 'takeover',
                                       'crew_change', 'total'}

    def test_a_worker_cannot_enter(self, client, world):
        w = world
        r = client.get('/api/approvals', headers=_h(client, w['hassan']))
        assert r.status_code == 403
