"""
Who may generate a work plan.

Before this, `/generate` and its three siblings carried only @jwt_required() —
ANY logged-in user (an inspector, a specialist, a maintenance hand) could
regenerate the whole week's plan. These tests are the guard against that
regressing.

The 403-not-500 assertions matter more than they look: all four handlers wrap
their body in `except Exception`, so a guard placed inside the try would be
swallowed and returned as a 500. Asserting the status code proves the guard sits
outside it.
"""

from datetime import date, timedelta

import pytest

from tests.conftest import get_auth_header
from app.models import WorkPlan, User


GENERATE_FAMILY = [
    ('post', '/generate'),
    ('post', '/generate/reject'),
    ('get', '/score'),
    ('get', '/generate/preview'),
]


@pytest.fixture
def draft_plan(db_session, admin_user):
    start = date.today()
    plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                    status='draft', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.commit()
    return plan


def _call(client, method, url, headers):
    return client.post(url, json={}, headers=headers) if method == 'post' \
        else client.get(url, headers=headers)


class TestOnlyPlannersMayGenerate:
    @pytest.mark.parametrize('method,suffix', GENERATE_FAMILY)
    def test_inspector_is_refused(self, client, admin_user, mech_inspector,
                                  draft_plan, method, suffix):
        headers = get_auth_header(client, 'mech@test.com', 'test123')
        resp = _call(client, method, f'/api/work-plans/{draft_plan.id}{suffix}', headers)
        assert resp.status_code == 403, (
            f'{suffix} let an inspector through with {resp.status_code}. '
            'A 500 here means the guard is inside the try/except.'
        )

    @pytest.mark.parametrize('method,suffix', GENERATE_FAMILY)
    def test_specialist_is_refused(self, client, admin_user, specialist,
                                   draft_plan, method, suffix):
        headers = get_auth_header(client, 'spec@test.com', 'test123')
        resp = _call(client, method, f'/api/work-plans/{draft_plan.id}{suffix}', headers)
        assert resp.status_code == 403

    @pytest.mark.parametrize('method,suffix', GENERATE_FAMILY)
    def test_engineer_is_allowed_through_the_guard(self, client, admin_user, engineer,
                                                   draft_plan, method, suffix):
        """Not asserting success — only that authorization is not what stops them."""
        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = _call(client, method, f'/api/work-plans/{draft_plan.id}{suffix}', headers)
        assert resp.status_code != 403

    def test_quality_engineer_may_no_longer_plan(self, client, admin_user, db_session,
                                                 draft_plan):
        """Deliberate policy change: QEs review work, they do not author plans."""
        qe = User(email='qe@test.com', full_name='Quality Engineer',
                  role='quality_engineer', role_id='QUA001', shift='day')
        qe.set_password('test123')
        db_session.session.add(qe)
        db_session.session.commit()

        headers = get_auth_header(client, 'qe@test.com', 'test123')
        resp = client.post(f'/api/work-plans/{draft_plan.id}/generate', json={}, headers=headers)
        assert resp.status_code == 403


class TestNoInternalsLeak:
    def test_generate_failure_does_not_return_a_traceback(self, client, admin_user,
                                                          engineer, monkeypatch):
        """A 500 must not hand the caller our file paths and stack."""
        from app.services import work_plan_generator_service as svc

        def boom(*a, **k):
            raise RuntimeError('simulated generator explosion')

        monkeypatch.setattr(svc.WorkPlanGeneratorService, 'generate_plan', boom)

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post('/api/work-plans/999999/generate', json={}, headers=headers)

        assert resp.status_code == 500
        body = resp.get_json()
        assert 'traceback' not in body
        assert 'work_plan_generator_service' not in str(body), 'internal paths leaked'
