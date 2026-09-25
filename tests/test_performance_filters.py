"""
Performance filters that used to be ignored.

1. GET /api/performance/goals?status=... returned every goal whatever the tab.
2. GET /api/work-plan-tracking/performance?period=weekly|monthly was always
   empty: only daily rows are ever written, so weeks and months are now rolled
   up from those daily rows on read.
"""

from datetime import date, timedelta
from decimal import Decimal

from app.models import PerformanceGoal
from app.models.work_plan_performance import WorkPlanPerformance
from tests.conftest import get_auth_header


# ─── Goals status filter ──────────────────────────────────────────

def _goal(db_session, user, status):
    goal = PerformanceGoal(
        user_id=user.id,
        goal_type='jobs',
        target_value=10,
        current_value=0,
        start_date=date.today(),
        end_date=date.today() + timedelta(days=30),
        status=status,
    )
    db_session.session.add(goal)
    return goal


def _seed_goals(db_session, user):
    _goal(db_session, user, 'active')
    _goal(db_session, user, 'completed')
    _goal(db_session, user, 'failed')
    db_session.session.commit()


def test_goals_status_filter_returns_only_that_status(client, db_session, admin_user):
    _seed_goals(db_session, admin_user)
    headers = get_auth_header(client, 'admin@test.com', 'admin123')

    for status in ('active', 'completed', 'failed'):
        resp = client.get(f'/api/performance/goals?status={status}', headers=headers)
        assert resp.status_code == 200
        goals = resp.get_json()['data']
        assert [g['status'] for g in goals] == [status]


def test_goals_without_status_returns_everything(client, db_session, admin_user):
    _seed_goals(db_session, admin_user)
    headers = get_auth_header(client, 'admin@test.com', 'admin123')

    resp = client.get('/api/performance/goals', headers=headers)
    assert resp.status_code == 200
    assert sorted(g['status'] for g in resp.get_json()['data']) == ['active', 'completed', 'failed']


def test_goals_unknown_status_is_refused(client, db_session, admin_user):
    _seed_goals(db_session, admin_user)
    headers = get_auth_header(client, 'admin@test.com', 'admin123')

    resp = client.get('/api/performance/goals?status=bogus', headers=headers)
    assert resp.status_code == 400


# ─── Weekly / monthly performance report ──────────────────────────

MONDAY = date(2026, 9, 7)  # a Monday


def _daily(db_session, user, day, assigned, completed, est, actual, time_rating=None,
           points=0, streak=0, max_streak=0):
    row = WorkPlanPerformance(
        user_id=user.id,
        period_type='daily',
        period_start=day,
        period_end=day,
        total_jobs_assigned=assigned,
        total_jobs_completed=completed,
        total_estimated_hours=Decimal(str(est)),
        total_actual_hours=Decimal(str(actual)),
        avg_time_rating=time_rating,
        completion_rate=Decimal(str(round(completed / assigned * 100, 2))) if assigned else 0,
        total_points_earned=points,
        current_streak_days=streak,
        max_streak_days=max_streak,
    )
    db_session.session.add(row)
    return row


def _seed_two_weeks(db_session, worker):
    # Week 1 (Mon 7 Sep - Sun 13 Sep): two days.
    _daily(db_session, worker, MONDAY, 1, 1, 2, 2, time_rating=4, points=5, streak=1, max_streak=1)
    _daily(db_session, worker, MONDAY + timedelta(days=1), 9, 0, 8, 10, time_rating=2, points=1)
    # Week 2 (Mon 14 Sep): one day.
    _daily(db_session, worker, MONDAY + timedelta(days=7), 4, 4, 6, 3, points=7, streak=3, max_streak=3)
    db_session.session.commit()


def _report(client, headers, period, start, end):
    resp = client.get(
        f'/api/work-plan-tracking/performance?period={period}'
        f'&start_date={start.isoformat()}&end_date={end.isoformat()}',
        headers=headers,
    )
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()['performances']


def test_weekly_report_is_built_from_daily_rows(client, db_session, admin_user, mech_inspector):
    _seed_two_weeks(db_session, mech_inspector)
    headers = get_auth_header(client, 'admin@test.com', 'admin123')

    rows = _report(client, headers, 'weekly', MONDAY, MONDAY + timedelta(days=13))
    assert len(rows) == 2

    newest, oldest = rows  # newest first, like the daily report
    assert newest['period_start'] == '2026-09-14'
    assert newest['period_end'] == '2026-09-20'
    assert newest['total_jobs_assigned'] == 4
    assert newest['completion_rate'] == 100

    assert oldest['period_type'] == 'weekly'
    assert oldest['period_start'] == '2026-09-07'
    assert oldest['period_end'] == '2026-09-13'
    assert oldest['user_id'] == mech_inspector.id
    assert oldest['total_jobs_assigned'] == 10
    assert oldest['total_jobs_completed'] == 1
    # Rate from summed counts (1/10), NOT the mean of 100% and 0%.
    assert oldest['completion_rate'] == 10
    assert oldest['total_estimated_hours'] == 10
    assert oldest['total_actual_hours'] == 12
    assert oldest['time_efficiency'] == round(10 / 12, 2)
    assert oldest['avg_time_rating'] == 3
    assert oldest['total_points_earned'] == 6
    assert oldest['max_streak_days'] == 1
    assert oldest['current_streak_days'] == 0  # from the latest day in the week
    assert oldest['id'] != newest['id']


def test_monthly_report_rolls_the_whole_range_into_one_month(client, db_session, admin_user, mech_inspector):
    _seed_two_weeks(db_session, mech_inspector)
    headers = get_auth_header(client, 'admin@test.com', 'admin123')

    rows = _report(client, headers, 'monthly', date(2026, 9, 1), date(2026, 9, 30))
    assert len(rows) == 1
    month = rows[0]
    assert month['period_type'] == 'monthly'
    assert month['period_start'] == '2026-09-01'
    assert month['period_end'] == '2026-09-30'
    assert month['total_jobs_assigned'] == 14
    assert month['total_jobs_completed'] == 5
    assert month['total_points_earned'] == 13
    assert month['max_streak_days'] == 3
    assert month['current_streak_days'] == 3


def test_aggregated_bucket_is_clipped_to_the_requested_range(client, db_session, admin_user, mech_inspector):
    _seed_two_weeks(db_session, mech_inspector)
    headers = get_auth_header(client, 'admin@test.com', 'admin123')

    # Only the Tuesday of week 1 is inside the range.
    tuesday = MONDAY + timedelta(days=1)
    rows = _report(client, headers, 'weekly', tuesday, tuesday + timedelta(days=2))
    assert len(rows) == 1
    assert rows[0]['period_start'] == tuesday.isoformat()
    assert rows[0]['total_jobs_assigned'] == 9


def test_daily_report_is_unchanged(client, db_session, admin_user, mech_inspector):
    _seed_two_weeks(db_session, mech_inspector)
    headers = get_auth_header(client, 'admin@test.com', 'admin123')

    rows = _report(client, headers, 'daily', MONDAY, MONDAY + timedelta(days=13))
    assert [r['period_start'] for r in rows] == ['2026-09-14', '2026-09-08', '2026-09-07']
    assert all(r['period_type'] == 'daily' for r in rows)
    assert all(isinstance(r['id'], int) for r in rows)


def test_weekly_comparison_is_built_from_daily_rows(client, db_session, admin_user, mech_inspector):
    _seed_two_weeks(db_session, mech_inspector)
    headers = get_auth_header(client, 'admin@test.com', 'admin123')

    resp = client.get(
        '/api/work-plan-tracking/performance/comparison?period=weekly'
        f'&start_date={MONDAY.isoformat()}&end_date={(MONDAY + timedelta(days=13)).isoformat()}',
        headers=headers,
    )
    assert resp.status_code == 200
    comparison = resp.get_json()['comparison']
    assert len(comparison) == 1
    assert len(comparison[0]['periods']) == 2
    totals = comparison[0]['totals']
    assert totals['jobs_assigned'] == 14
    assert totals['jobs_completed'] == 5
    assert totals['points'] == 13


def test_unknown_period_is_refused(client, db_session, admin_user):
    headers = get_auth_header(client, 'admin@test.com', 'admin123')
    resp = client.get('/api/work-plan-tracking/performance?period=yearly', headers=headers)
    assert resp.status_code == 400
