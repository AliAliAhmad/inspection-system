"""
Tests for overdue computation in work-plan priority scoring:
- day-based overdue computed as (today - order date) for all non-performance orders
- performance PMs keep hours, and POSITIVE (hours remaining) = not overdue = 0 bonus
"""

from datetime import date, timedelta

from app.services.work_plan_generator_service import (
    WorkPlanGeneratorService,
    _resolve_overdue,
    _is_performance_pm,
    _overdue_bonus_hours,
    _overdue_bonus_days,
)
from app.models import WorkPlan, SAPWorkOrder
from tests.conftest import make_equipment


TODAY = date(2026, 6, 27)


class TestResolveOverdue:
    def test_calendar_pm_day_based_from_date(self):
        gen = TODAY - timedelta(days=20)
        val, unit = _resolve_overdue('pm', 'calendar', gen, None, None, TODAY)
        assert val == 20 and unit == 'days'

    def test_other_order_type_day_based(self):
        # COM imports as job_type 'defect' — still day-based from the date
        gen = TODAY - timedelta(days=5)
        val, unit = _resolve_overdue('defect', None, gen, None, None, TODAY)
        assert val == 5 and unit == 'days'

    def test_generated_today_is_zero(self):
        val, unit = _resolve_overdue('pm', 'calendar', TODAY, None, None, TODAY)
        assert val == 0 and unit == 'days'

    def test_performance_pm_keeps_hours_value(self):
        assert _resolve_overdue('pm', 'running_hours', None, -20, 'hours', TODAY) == (-20, 'hours')
        assert _resolve_overdue('pm', 'running_hours', None, 100, 'hours', TODAY) == (100, 'hours')

    def test_is_performance_pm(self):
        assert _is_performance_pm('pm', 'running_hours') is True
        assert _is_performance_pm('pm', 'calendar') is False
        assert _is_performance_pm('defect', 'running_hours') is False


class TestOverdueBonus:
    def test_before_lead_window_is_zero(self):
        # more than 24 hrs before the trigger → no points yet
        assert _overdue_bonus_hours(100) == 0.0
        assert _overdue_bonus_hours(30) == 0.0
        assert _overdue_bonus_hours(24) == 0.0   # exactly at the start line

    def test_points_start_inside_lead_window(self):
        # within 24 hrs of the trigger → starts accruing
        assert _overdue_bonus_hours(0) == 10.0          # at the trigger
        assert _overdue_bonus_hours(10) > 0             # 10 hrs before due

    def test_fast_ramp_reaches_max_about_one_day_past(self):
        assert _overdue_bonus_hours(-24) == 20.0        # ~1 day past → max
        assert _overdue_bonus_hours(-200) == 20.0       # capped
        assert abs(_overdue_bonus_hours(-20) - (44 / 48 * 20)) < 1e-9  # ~18.3

    def test_overdue_ranks_above_not_due(self):
        assert _overdue_bonus_hours(-20) > _overdue_bonus_hours(100)

    def test_calendar_days_unchanged(self):
        assert _overdue_bonus_days(20) == 20.0    # min(20/14,1)*20 capped
        assert _overdue_bonus_days(7) == 10.0
        assert _overdue_bonus_days(0) == 0.0


class TestEndToEndCandidates:
    def _plan(self, db_session, admin_user):
        plan = WorkPlan(
            week_start=date.today(), week_end=date.today() + timedelta(days=6),
            status='draft', created_by_id=admin_user.id,
        )
        db_session.session.add(plan)
        db_session.session.flush()
        return plan

    def test_calendar_pm_overdue_computed_from_date(self, db_session, admin_user):
        eq = make_equipment(db_session, 'OD Pump', 'OD-1')
        plan = self._plan(db_session, admin_user)
        # No overdue_value provided — system must compute it from required_date
        db_session.session.add(SAPWorkOrder(
            work_plan_id=plan.id, order_number='OD100', order_type='PRM',
            job_type='pm', equipment_id=eq.id, estimated_hours=3.0,
            maintenance_base='calendar', priority='normal',
            required_date=date.today() - timedelta(days=20),
            status='pending',
        ))
        db_session.session.commit()

        result = WorkPlanGeneratorService.get_candidates(plan.id)
        cand = next(c for c in result['candidates'] if c['equipment_id'] == eq.id)
        assert cand['overdue_value'] == 20
        assert cand['overdue_unit'] == 'days'
        # normal(40) + full overdue(20) = 60 -> high
        assert cand['priority'] == 'high'

    def test_performance_pm_positive_scores_as_not_overdue(self, db_session, admin_user):
        eq = make_equipment(db_session, 'OD Crane', 'OD-2')
        plan = self._plan(db_session, admin_user)
        db_session.session.add(SAPWorkOrder(
            work_plan_id=plan.id, order_number='OD200', order_type='PRM',
            job_type='pm', equipment_id=eq.id, estimated_hours=3.0,
            maintenance_base='running_hours', priority='normal',
            overdue_value=100, overdue_unit='hours',   # 100 hrs still remaining
            required_date=date.today(), status='pending',
        ))
        db_session.session.commit()

        result = WorkPlanGeneratorService.get_candidates(plan.id)
        cand = next(c for c in result['candidates'] if c['equipment_id'] == eq.id)
        # keeps hours value, but contributes no overdue bonus -> stays normal(40)
        assert cand['overdue_value'] == 100
        assert cand['overdue_unit'] == 'hours'
        assert cand['priority'] == 'normal'

    def test_performance_pm_one_day_past_is_high(self, db_session, admin_user):
        eq = make_equipment(db_session, 'OD Hoist', 'OD-3')
        plan = self._plan(db_session, admin_user)
        db_session.session.add(SAPWorkOrder(
            work_plan_id=plan.id, order_number='OD300', order_type='PRM',
            job_type='pm', equipment_id=eq.id, estimated_hours=3.0,
            maintenance_base='running_hours', priority='normal',
            overdue_value=-24, overdue_unit='hours',   # 24 hrs past the 250 trigger
            required_date=date.today(), status='pending',
        ))
        db_session.session.commit()

        result = WorkPlanGeneratorService.get_candidates(plan.id)
        cand = next(c for c in result['candidates'] if c['equipment_id'] == eq.id)
        # normal(40) + full overdue(20) = 60 -> high, ~1 day past due
        assert cand['priority'] == 'high'
