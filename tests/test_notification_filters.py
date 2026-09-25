"""Notifications page filters — found silently ignored in the 2026-09-24 audit.

The page sent `search`, `date_from` and `date_to`, and the endpoint read none of
them; ticking several types or priorities sent only the first.
"""

from datetime import datetime, timedelta

import pytest

from tests.conftest import get_auth_header
from app.extensions import db
from app.models import Notification


@pytest.fixture
def inbox(db_session, admin_user):
    now = datetime.utcnow()
    rows = [
        ('Job started', 'RS109 PM started', 'بدأ العمل', 'work_plan', 'info', now),
        ('Crew change requested', 'Ali asks to swap', 'طلب تغيير فريق', 'work_plan', 'warning', now),
        ('Leave approved', 'Your leave is approved', None, 'leave_approved', 'info',
         now - timedelta(days=10)),
        ('Critical defect', 'Hydraulic leak', None, 'defect_created', 'critical', now),
    ]
    for title, msg, title_ar, typ, prio, when in rows:
        db.session.add(Notification(user_id=admin_user.id, title=title, message=msg,
                                    title_ar=title_ar, type=typ, priority=prio,
                                    created_at=when))
    db.session.commit()


def _titles(client, admin_user, **params):
    h = get_auth_header(client, admin_user.email, 'admin123')
    r = client.get('/api/notifications', query_string=params, headers=h)
    assert r.status_code == 200, r.get_json()
    return {n['title'] for n in r.get_json()['data']}


def test_search_finds_by_title_and_message(client, admin_user, inbox):
    assert _titles(client, admin_user, search='hydraulic') == {'Critical defect'}
    assert _titles(client, admin_user, search='crew') == {'Crew change requested'}


def test_search_finds_arabic(client, admin_user, inbox):
    assert _titles(client, admin_user, search='تغيير') == {'Crew change requested'}


def test_date_range_is_applied(client, admin_user, inbox):
    since = (datetime.utcnow() - timedelta(days=2)).isoformat() + 'Z'
    got = _titles(client, admin_user, date_from=since)
    assert 'Leave approved' not in got and 'Job started' in got


def test_a_bare_date_to_means_the_whole_day(client, admin_user, inbox):
    today = datetime.utcnow().date().isoformat()
    assert 'Job started' in _titles(client, admin_user, date_to=today)


def test_several_types_are_all_used(client, admin_user, inbox):
    got = _titles(client, admin_user, type='leave_approved,defect_created')
    assert got == {'Leave approved', 'Critical defect'}


def test_several_priorities_are_all_used(client, admin_user, inbox):
    got = _titles(client, admin_user, priority='critical,warning')
    assert got == {'Critical defect', 'Crew change requested'}


def test_a_bad_date_is_a_clear_400(client, admin_user, inbox):
    h = get_auth_header(client, admin_user.email, 'admin123')
    r = client.get('/api/notifications', query_string={'date_from': 'yesterday'}, headers=h)
    assert r.status_code == 400


def test_the_analytics_page_has_data_for_its_date_range(client, admin_user, inbox):
    """/api/notifications/analytics did not exist — the page was always a 404."""
    h = get_auth_header(client, admin_user.email, 'admin123')
    since = (datetime.utcnow() - timedelta(days=2)).isoformat() + 'Z'
    r = client.get('/api/notifications/analytics', query_string={'date_from': since}, headers=h)
    assert r.status_code == 200, r.get_json()
    d = r.get_json()['data']
    assert d['total_sent'] == 3                      # the 10-day-old one is outside
    assert d['by_priority'] == {'info': 1, 'warning': 1, 'critical': 1}
    assert len(d['hourly_distribution']) == 24
    assert d['top_users'][0]['user_id'] == admin_user.id
    assert set(d['escalation_stats']) == {'total_escalated', 'avg_escalation_time',
                                          'resolved_before_escalation'}
