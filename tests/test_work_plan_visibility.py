"""The whole yard's week is a planner's document.

Ali, 2026-09-09: "i made a plan for today i access one of the user the plan is
showing in the my work plan, but when i press the workplaning card it shows all
the plan. why?"

Because two things pointed there and nothing stopped them. The mobile dashboard
gave every role a "Work Plan" card, and the floating button offered an action
LABELLED "My Work Plan" that opened WorkPlanOverview — the whole plan, everyone's
jobs. The endpoints behind it were @jwt_required() with no role check, so they
answered.

The web has always known the rule; AppRouter guards the same screen with
RoleGuard roles={['admin', 'engineer']}. These tests put that rule where it
cannot be bypassed by a screen wired to the wrong place.

A worker's own plan (/my-plan) is deliberately untouched — that is his view and
it stays open to him.
"""

from datetime import date, timedelta

import pytest

from app.extensions import db
from app.models import User, WorkPlan, WorkPlanDay
from tests.conftest import get_auth_header


@pytest.fixture
def plan(db_session, engineer):
    monday = date(2026, 9, 7)
    wp = WorkPlan(week_start=monday, week_end=monday + timedelta(days=6),
                  status='published', created_by_id=engineer.id)
    db.session.add(wp)
    db.session.flush()
    for offset in range(7):
        db.session.add(WorkPlanDay(work_plan_id=wp.id,
                                   date=monday + timedelta(days=offset)))
    db.session.commit()
    return wp


@pytest.fixture
def worker(db_session):
    user = User(email='worker@test.com', full_name='Test Worker',
                role='maintenance', role_id='MNT001', shift='day')
    user.set_password('test123')
    db.session.add(user)
    db.session.commit()
    return user


@pytest.fixture
def inspector(db_session):
    user = User(email='insp@test.com', full_name='Test Inspector',
                role='inspector', role_id='INS009', shift='day')
    user.set_password('test123')
    db.session.add(user)
    db.session.commit()
    return user


# ── Refused ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('email', ['worker@test.com', 'insp@test.com'])
def test_a_worker_cannot_list_the_whole_plan(db_session, engineer, worker,
                                             inspector, client, plan, email):
    headers = get_auth_header(client, email, 'test123')
    resp = client.get('/api/work-plans?week_start=2026-09-07&include_days=true',
                      headers=headers)
    assert resp.status_code == 403, resp.get_json()


@pytest.mark.parametrize('email', ['worker@test.com', 'insp@test.com'])
def test_a_worker_cannot_open_one_plan_either(db_session, engineer, worker,
                                              inspector, client, plan, email):
    """Gating the list and not the detail leaves the same door one URL over."""
    headers = get_auth_header(client, email, 'test123')
    resp = client.get(f'/api/work-plans/{plan.id}', headers=headers)
    assert resp.status_code == 403, resp.get_json()


# ── Allowed ────────────────────────────────────────────────────────────────

def test_an_engineer_still_sees_everything(db_session, engineer, client, plan):
    headers = get_auth_header(client, 'eng@test.com', 'test123')
    assert client.get('/api/work-plans?week_start=2026-09-07&include_days=true',
                      headers=headers).status_code == 200
    assert client.get(f'/api/work-plans/{plan.id}',
                      headers=headers).status_code == 200


def test_an_admin_still_sees_everything(db_session, admin_user, engineer,
                                        client, plan):
    headers = get_auth_header(client, 'admin@test.com', 'admin123')
    assert client.get('/api/work-plans?week_start=2026-09-07&include_days=true',
                      headers=headers).status_code == 200
    assert client.get(f'/api/work-plans/{plan.id}',
                      headers=headers).status_code == 200


def test_a_worker_keeps_his_own_plan(db_session, engineer, worker, client,
                                     plan):
    """The point of the whole thing. He loses the yard's plan, not his own."""
    headers = get_auth_header(client, 'worker@test.com', 'test123')
    resp = client.get('/api/work-plans/my-plan?week_start=2026-09-07',
                      headers=headers)
    assert resp.status_code == 200, resp.get_json()
