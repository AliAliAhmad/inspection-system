"""Charging an order's hours to the trade that does the work.

Ali, 2026-09-11: an order can hold both mechanical and electrical operations,
and "the mechanical team sees its lines, the electrical team sees its own".

WHY THIS SHIPS SWITCHED OFF
===========================

Ali asked for a VISIBILITY split, and that is Phase 1. Splitting the day's
BUDGET by trade is the consequence I inferred and named "the expensive half".

`day_budget.team_pools()` merges `defect_mech` and `defect_elec` into ONE `spec`
wallet, and that is how every day in every week has been priced. Changing it
feeds the generator, the day ripple, the Telegram proposals and the capacity
warnings on the board. Switching that on for a real yard while nobody is
watching is not a decision to take as a side effect of a deploy.

So the numbers are computed and exposed — safe, and the useful half — while the
wallet split waits behind TRADE_SPLIT_BUDGET.

THE FIRST TEST CLASS IS THE IMPORTANT ONE: with the flag off, nothing moves.
"""

from datetime import date, timedelta

import pytest

from tests.conftest import get_auth_header, make_equipment
from app.extensions import db
from app.models import WorkPlan, WorkPlanDay, WorkPlanJob, WorkPlanJobTask
from app.services import trade_split


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


@pytest.fixture
def flag_off(monkeypatch):
    monkeypatch.delenv('TRADE_SPLIT_BUDGET', raising=False)


@pytest.fixture
def flag_on(monkeypatch):
    monkeypatch.setenv('TRADE_SPLIT_BUDGET', '1')


def _job(plan, day, equipment, order='700000123456', hours=9.0,
         work_center=None, job_type='corrective'):
    job = WorkPlanJob(work_plan_day_id=day.id, job_type=job_type,
                      equipment_id=equipment.id, sap_order_number=order,
                      description='GENERAL REFURBISHMENT',
                      work_center=work_center,
                      estimated_hours=hours, position=1)
    db.session.add(job)
    db.session.commit()
    return job


def _ops(order='700000123456'):
    from app.services.sap_pool_sync import sync_order_operations
    sync_order_operations({order: [
        {'operation_number': '0010', 'description': 'Check the spreader',
         'work_center': 'MECH', 'planned_hours': 2.0},
        {'operation_number': '0020', 'description': 'Replace harness',
         'work_center': 'ELEC', 'planned_hours': 3.0},
        {'operation_number': '0030', 'description': 'Open telescopic chain',
         'work_center': 'MECH', 'planned_hours': 4.0},
    ]})


class TestSwitchedOffNothingMoves:
    """The guarantee that makes shipping this safe."""

    def test_the_flag_is_off_by_default(self, flag_off):
        assert trade_split.trade_split_enabled() is False

    def test_defect_work_still_spends_the_merged_wallet(self, flag_off,
                                                        db_session, plan_day):
        from app.services.day_ripple import _job_wallet_key
        plan, day = plan_day
        eq = make_equipment(db_session, 'TRD01', 'ST01')
        job = _job(plan, day, eq, work_center='MECH')
        _ops()
        assert _job_wallet_key(job) == 'spec', \
            'the budget split turned itself on'

    def test_a_pm_is_untouched_either_way(self, flag_on, db_session, plan_day):
        from app.services.day_ripple import _job_wallet_key
        plan, day = plan_day
        eq = make_equipment(db_session, 'TRD02', 'ST02')
        job = _job(plan, day, eq, work_center='MECH', job_type='pm')
        assert _job_wallet_key(job) == 'pm'


class TestTheNumbersAreRightRegardless:
    """Exposed whether or not the wallets use them — this is the safe half."""

    def test_a_mixed_order_splits_by_operation(self, flag_off, db_session,
                                               plan_day):
        plan, day = plan_day
        eq = make_equipment(db_session, 'TRD03', 'ST03')
        job = _job(plan, day, eq)
        _ops()

        split = trade_split.hours_by_trade(job)
        assert split['MECH'] == pytest.approx(6.0), '0010 (2h) + 0030 (4h)'
        assert split['ELEC'] == pytest.approx(3.0), '0020'
        assert split['UNSET'] == pytest.approx(0.0)

        described = trade_split.describe(job)
        assert described['is_mixed'] is True
        assert described['total_hours'] == pytest.approx(9.0)
        assert described['budget_split_active'] is False

    def test_an_order_with_no_operations_sits_with_its_own_trade(
            self, flag_off, db_session, plan_day):
        """This is EVERY order until an IW49 with a known layout is imported."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'TRD04', 'ST04')
        job = _job(plan, day, eq, order='700000777777', hours=5.0,
                   work_center='ELEC')

        split = trade_split.hours_by_trade(job)
        assert split['ELEC'] == pytest.approx(5.0)
        assert split['MECH'] == pytest.approx(0.0)
        assert trade_split.describe(job)['is_mixed'] is False

    def test_a_both_trades_order_with_no_operations_is_unknown_not_guessed(
            self, flag_off, db_session, plan_day):
        """ELME cannot be divided without operations, so it is not divided.

        Pushing it arbitrarily onto one crew's budget would be a silent lie
        about that crew's day.
        """
        plan, day = plan_day
        eq = make_equipment(db_session, 'TRD05', 'ST05')
        job = _job(plan, day, eq, order='700000888888', hours=6.0,
                   work_center='ELME')

        split = trade_split.hours_by_trade(job)
        assert split['UNSET'] == pytest.approx(6.0)
        assert split['MECH'] == 0.0 and split['ELEC'] == 0.0

    def test_an_operation_with_no_trade_falls_back_to_the_order(
            self, flag_off, db_session, plan_day):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'TRD06', 'ST06')
        job = _job(plan, day, eq, order='700000999000', work_center='MECH')
        sync_order_operations({'700000999000': [
            {'operation_number': '0010', 'description': 'Unlabelled',
             'work_center': None, 'planned_hours': 3.0},
        ]})
        split = trade_split.hours_by_trade(job)
        assert split['MECH'] == pytest.approx(3.0)


class TestSwitchedOnItCharges:

    def test_a_mechanical_order_spends_the_mechanical_crew(self, flag_on,
                                                           db_session, plan_day):
        from app.services.day_ripple import _job_wallet_key
        plan, day = plan_day
        eq = make_equipment(db_session, 'TRD07', 'ST07')
        job = _job(plan, day, eq, work_center='MECH')
        assert _job_wallet_key(job) == 'spec_mech'

    def test_an_electrical_order_spends_the_electrical_crew(self, flag_on,
                                                            db_session, plan_day):
        from app.services.day_ripple import _job_wallet_key
        plan, day = plan_day
        eq = make_equipment(db_session, 'TRD08', 'ST08')
        job = _job(plan, day, eq, order='700000222000', work_center='ELEC')
        assert _job_wallet_key(job) == 'spec_elec'

    def test_a_both_trades_order_stays_on_the_merged_wallet(self, flag_on,
                                                            db_session, plan_day):
        """Splitting it needs the operations, and guessing would be a lie."""
        from app.services.day_ripple import _job_wallet_key
        plan, day = plan_day
        eq = make_equipment(db_session, 'TRD09', 'ST09')
        job = _job(plan, day, eq, order='700000333000', work_center='ELME')
        assert _job_wallet_key(job) == 'spec'


class TestTheWalletsExistEitherWay:
    """Built always, so the on and off paths cannot drift apart."""

    def test_both_crews_have_a_wallet(self, db_session, admin_user, plan_day):
        from app.services.day_budget import team_pools
        pools = team_pools()
        for berth in ('east', 'west'):
            assert 'spec_mech' in pools[berth]
            assert 'spec_elec' in pools[berth]
