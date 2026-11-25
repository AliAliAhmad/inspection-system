"""One rule for both PM clocks (Ali, 2026-11-25).

    overdue = (since the last service) − (interval − 10%)

Hourly plans count hours run; calendar plans count days passed. Never mixed.
"""
from datetime import date, timedelta

import pytest

from app.models import SAPWorkOrder, WorkPlan
from app.services import sap_pool_sync
from app.services.sap_order_parser import (calendar_days_overdue,
                                           calendar_interval_days, due_point)
from app.services.work_plan_generator_service import WorkPlanGeneratorService
from tests.conftest import make_equipment


class TestWhichCalendarIntervalAnOrderHas:
    @pytest.mark.parametrize('description, plant, days', [
        ('RS109-3-Week INSPECTION_RS', 'RS109', 21),
        ('RS115-3-Weeks INSPECTION_RS', 'RS115', 21),
        ('ECH02-3-Week INSPECTION_ECH', 'ECH02', 21),
        ('TT031-Inspection AC System', 'TT031', 30),
        ('TR101-MECHANICAL INSPECTION', 'TR101', 30),
        ('TR101-6-MECHANICAL INSPECTION', 'TR101', 30),
    ])
    def test_the_ones_ali_named(self, description, plant, days):
        assert calendar_interval_days(description, plant) == days

    @pytest.mark.parametrize('description, plant', [
        ('SV323-MECHANICAL KM SERVICE', 'SV323'),   # kilometres, not days
        ('WBO01-MECHANICAL RH SERVICE', 'WBO01'),   # running hours, not days
        ('XX001-MECHANICAL INSPECTION', 'XX001'),   # he answered for trailers only
        ('RS109-250HR-MECH.HOURLY SERVICE', 'RS109'),
        (None, None),
    ])
    def test_anything_else_is_not_guessed(self, description, plant):
        assert calendar_interval_days(description, plant) is None


class TestTheDuePoint:
    def test_hourly_is_due_at_225(self):
        assert due_point(250) == 225

    @pytest.mark.parametrize('since, interval, late', [
        (19, 21, 0),    # 3 weeks: due on day 19
        (25, 21, 6),
        (27, 30, 0),    # monthly: due on day 27
        (30, 30, 3),
        (3, 30, 0),     # done 3 days ago: 0, never negative
    ])
    def test_calendar_days_late(self, since, interval, late):
        assert calendar_days_overdue(since, interval) == late

    def test_unknown_stays_unknown(self):
        assert calendar_days_overdue(None, 21) is None
        assert calendar_days_overdue(25, None) is None


def _candidate(**kw):
    base = {'plant_code': 'RS109', 'description': '', 'priority': 'normal',
            'age_days': 2, 'days_since_last_pm': None, 'maintenance_plan': 'MP1',
            'is_released': False}
    base.update(kw)
    return base


class TestWhatTheNightlySyncStores:
    def test_hourly_260_hours_run_is_35_hours_overdue(self, monkeypatch):
        """Ali's own example."""
        monkeypatch.setattr(sap_pool_sync, 'hours_run_since', lambda *a: 260.0)
        priority, value, unit = sap_pool_sync._priority_for(
            _candidate(pm_basis='hourly'), {}, {}, {}, {})
        assert (priority, value, unit) == ('urgent', 35.0, 'hours')

    def test_hourly_200_hours_run_is_not_overdue(self, monkeypatch):
        monkeypatch.setattr(sap_pool_sync, 'hours_run_since', lambda *a: 200.0)
        _, value, unit = sap_pool_sync._priority_for(
            _candidate(pm_basis='hourly'), {}, {}, {}, {})
        assert value is None and unit is None

    def test_three_week_inspection_done_25_days_ago_is_6_days_late(self):
        _, value, unit = sap_pool_sync._priority_for(
            _candidate(pm_basis='calendar', description='RS109-3-Week INSPECTION_RS',
                       days_since_last_pm=25, age_days=40),
            {}, {}, {}, {})
        assert (value, unit) == (6, 'days')

    def test_not_due_yet_is_stored_as_zero_not_nothing(self):
        _, value, unit = sap_pool_sync._priority_for(
            _candidate(pm_basis='calendar', description='TT031-Inspection AC System',
                       plant_code='TT031', days_since_last_pm=10, age_days=12),
            {}, {}, {}, {})
        assert (value, unit) == (0, 'days')

    def test_unknown_interval_keeps_the_old_reading(self):
        _, value, unit = sap_pool_sync._priority_for(
            _candidate(pm_basis='calendar', description='SV323-MECHANICAL KM SERVICE',
                       plant_code='SV323', days_since_last_pm=50, age_days=12),
            {}, {}, {}, {})
        assert (value, unit) == (50, 'days')


class TestThePlanMakerUsesTheSameNumber:
    def _cand(self, db_session, admin_user, stored, required_days_ago):
        eq = make_equipment(db_session, 'DP RS', 'DP-1')
        plan = WorkPlan(week_start=date.today(), week_end=date.today() + timedelta(days=6),
                        status='draft', created_by_id=admin_user.id)
        db_session.session.add(plan)
        db_session.session.flush()
        db_session.session.add(SAPWorkOrder(
            work_plan_id=plan.id, order_number='DP100', order_type='PRM',
            job_type='pm', equipment_id=eq.id, estimated_hours=3.0,
            maintenance_base='calendar', priority='normal',
            overdue_value=stored, overdue_unit='days' if stored is not None else None,
            required_date=date.today() - timedelta(days=required_days_ago),
            status='pending'))
        db_session.session.commit()
        result = WorkPlanGeneratorService.get_candidates(plan.id)
        return next(c for c in result['candidates'] if c['equipment_id'] == eq.id)

    def test_a_stored_zero_means_not_due_on_the_day_card_too(self, db_session, admin_user):
        cand = self._cand(db_session, admin_user, stored=0, required_days_ago=20)
        assert cand['overdue_value'] == 0

    def test_a_stored_number_wins_over_the_order_date(self, db_session, admin_user):
        cand = self._cand(db_session, admin_user, stored=6, required_days_ago=20)
        assert cand['overdue_value'] == 6
