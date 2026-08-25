"""
"If the week finish and the job not done it will back to the box."

Ali's rule, stated at the start and never implemented. The cost was visible in
production: ten finished weeks still holding 2,242 orders, going back months —
6:257, 7:288, 8:276, 9:301, 11:289, 13:207, 31:195, 37:179, 38:181, 40:69.

Nothing was lost, because the nightly rebuild sees those orders still open in
SAP and creates fresh copies. But the originals never let go, so every finished
week leaves its rows behind and one order accumulates a copy per week it waited.
"""

from datetime import date, timedelta

import pytest

from app.models import Equipment, SAPWorkOrder, WorkPlan, WorkPlanDay, WorkPlanJob
from app.models.work_plan_job_tracking import WorkPlanJobTracking
from app.services.sap_carry_over import (
    classify,
    dead_week_plan_ids,
    live_week_filter,
    release_dead_week_orders,
)

TODAY = date(2026, 8, 24)


def _equipment(db_session, name='TT001'):
    equipment = Equipment(name=name, serial_number=f'SN-{name}',
                          equipment_type='tractor')
    db_session.session.add(equipment)
    db_session.session.commit()
    return equipment


def _week(db_session, admin_user, start, status='draft'):
    plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                    status=status, created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=start)
    db_session.session.add(day)
    db_session.session.commit()
    return plan, day


def _held(db_session, plan, equipment, number):
    """An order stamped into a week."""
    order = SAPWorkOrder(work_plan_id=plan.id, order_number=number,
                         order_type='PRM', job_type='pm',
                         equipment_id=equipment.id, estimated_hours=4.0,
                         status='scheduled')
    db_session.session.add(order)
    db_session.session.commit()
    return order


def _job(db_session, day, equipment, number, worked=None):
    job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm',
                      equipment_id=equipment.id, sap_order_number=number,
                      estimated_hours=4.0, position=1)
    db_session.session.add(job)
    db_session.session.flush()
    if worked:
        db_session.session.add(WorkPlanJobTracking(
            work_plan_job_id=job.id, status=worked))
    db_session.session.commit()
    return job


@pytest.fixture
def dead(db_session, admin_user):
    """A week that ended a month ago."""
    return _week(db_session, admin_user, TODAY - timedelta(days=35))


@pytest.fixture
def alive(db_session, admin_user):
    """The current week."""
    return _week(db_session, admin_user, TODAY)


class TestOnlyFinishedWeeksLetGo:
    def test_a_finished_week_releases_its_untouched_order(self, db_session, dead):
        plan, day = dead
        equipment = _equipment(db_session)
        order = _held(db_session, plan, equipment, '700000000001')

        result = release_dead_week_orders(today=TODAY)

        assert result['carried_back'] == 1
        db_session.session.refresh(order)
        assert order.work_plan_id is None
        assert order.status == 'pending'

    def test_the_CURRENT_week_keeps_its_orders(self, db_session, alive):
        """Planned work for the week being worked is not pool stock."""
        plan, day = alive
        equipment = _equipment(db_session)
        order = _held(db_session, plan, equipment, '700000000001')

        result = release_dead_week_orders(today=TODAY)

        assert result['carried_back'] == 0
        db_session.session.refresh(order)
        assert order.work_plan_id == plan.id

    def test_a_week_ending_TODAY_is_still_live(self, db_session, admin_user):
        """The boundary. A week ends at midnight, not at breakfast."""
        plan, day = _week(db_session, admin_user, TODAY - timedelta(days=6))
        assert plan.week_end == TODAY
        assert plan.id not in dead_week_plan_ids(today=TODAY)

    def test_it_becomes_dead_the_next_day(self, db_session, admin_user):
        plan, day = _week(db_session, admin_user, TODAY - timedelta(days=6))
        assert plan.id in dead_week_plan_ids(today=TODAY + timedelta(days=1))

    def test_the_live_and_dead_rules_are_exact_complements(self, db_session,
                                                           admin_user):
        """Shared predicate. If they disagree, an order on the boundary is
        either protected by both rules or claimed by both."""
        plan, day = _week(db_session, admin_user, TODAY - timedelta(days=6))
        live_ids = {p.id for p in WorkPlan.query.filter(live_week_filter(TODAY)).all()}
        assert live_ids.isdisjoint(set(dead_week_plan_ids(TODAY)))
        assert plan.id in live_ids


class TestWorkedJobsAreNeverTouched:
    """The one irreversible mistake would be moving a row whose job carries
    real work. Everything else is rebuilt from SAP the following night."""

    @pytest.mark.parametrize('status',
                             ['in_progress', 'paused', 'completed', 'incomplete'])
    def test_an_order_whose_job_was_worked_stays_put(self, db_session, dead, status):
        plan, day = dead
        equipment = _equipment(db_session)
        order = _held(db_session, plan, equipment, '700000000001')
        _job(db_session, day, equipment, '700000000001', worked=status)

        result = release_dead_week_orders(today=TODAY)

        assert result['carried_back'] == 0
        assert result['left_worked'] == 1
        db_session.session.refresh(order)
        assert order.work_plan_id == plan.id

    def test_a_job_nobody_started_does_not_protect_it(self, db_session, dead):
        """A job that exists but was never touched is just an unworked plan."""
        plan, day = dead
        equipment = _equipment(db_session)
        order = _held(db_session, plan, equipment, '700000000001')
        _job(db_session, day, equipment, '700000000001', worked=None)

        result = release_dead_week_orders(today=TODAY)

        assert result['carried_back'] == 1
        db_session.session.refresh(order)
        assert order.work_plan_id is None


class TestOneSurvivorPerOrderNumber:
    """The dedup branch inside the carry-over.

    It can no longer be exercised here, and that is worth explaining rather
    than deleting. The model now carries UNIQUE(order_number), so the test
    database physically refuses the two-rows-for-one-order state the branch
    cleans up — TestOneRowPerOrderNumber below asserts exactly that refusal.

    The branch stays, because on THIS deployment a migration can fail without
    stopping the boot (`flask db upgrade || echo WARNING` in start.sh). If the
    constraint never lands, duplicates are possible again and the carry-over is
    the only thing that clears them. It was verified against production before
    the constraint existed: 1,898 duplicate rows deleted, 344 released, 0
    worked jobs touched.
    """

    def test_different_orders_do_not_interfere(self, db_session, dead):
        plan, day = dead
        equipment = _equipment(db_session)
        _held(db_session, plan, equipment, '700000000001')
        _held(db_session, plan, equipment, '700000000002')

        result = release_dead_week_orders(today=TODAY)

        assert result['carried_back'] == 2


class TestLookBeforeTouching:
    """classify() exists because the last cleanup shipped the same afternoon it
    was written, ran unattended, and emptied the pool."""

    def test_it_reports_without_changing_anything(self, db_session, dead):
        plan, day = dead
        equipment = _equipment(db_session)
        order = _held(db_session, plan, equipment, '700000000001')

        report = classify(today=TODAY)

        assert report['would_release'] == 1
        assert report['rows_held'] == 1
        db_session.session.refresh(order)
        assert order.work_plan_id == plan.id

    def test_it_buckets_per_plan(self, db_session, dead):
        plan, day = dead
        equipment = _equipment(db_session)
        _held(db_session, plan, equipment, '700000000001')
        _held(db_session, plan, equipment, '700000000002')
        _job(db_session, day, equipment, '700000000002', worked='completed')

        report = classify(today=TODAY)

        assert report['per_plan'][plan.id]['held'] == 2
        assert report['per_plan'][plan.id]['release'] == 1
        assert report['per_plan'][plan.id]['worked'] == 1

    def test_a_dry_run_changes_nothing_but_still_counts(self, db_session, dead):
        plan, day = dead
        equipment = _equipment(db_session)
        order = _held(db_session, plan, equipment, '700000000001')

        result = release_dead_week_orders(today=TODAY, dry_run=True)

        assert result['carried_back'] == 1
        db_session.session.refresh(order)
        assert order.work_plan_id == plan.id


class TestItRunsInTheNightlySync:
    def test_it_is_enabled(self, app):
        """Turned on 2026-08-24, after classify() was checked against production
        and the "zero worked jobs" claim was verified independently."""
        assert app.config.get('SAP_CARRY_OVER_ENABLED') is True


class TestOneRowPerOrderNumber:
    """The database now refuses a duplicate, rather than merely nobody making one.

    UniqueConstraint('work_plan_id','order_number') was a leftover from per-week
    pools, where the same order legitimately appeared once per week. Since the
    box went global that is no longer true — and leaving it in place let 2,242
    duplicates accumulate, then fired as a UniqueViolation the moment the
    generator tried to place one.
    """

    def test_the_same_order_cannot_exist_twice(self, db_session, admin_user):
        import pytest as _pytest
        from sqlalchemy.exc import IntegrityError
        equipment = _equipment(db_session)
        db_session.session.add(SAPWorkOrder(
            work_plan_id=None, order_number='700000000001', order_type='PRM',
            job_type='pm', equipment_id=equipment.id, estimated_hours=4.0,
            status='pending'))
        db_session.session.commit()

        plan, day = _week(db_session, admin_user, TODAY)
        db_session.session.add(SAPWorkOrder(
            work_plan_id=plan.id, order_number='700000000001', order_type='PRM',
            job_type='pm', equipment_id=equipment.id, estimated_hours=4.0,
            status='scheduled'))

        with _pytest.raises(IntegrityError):
            db_session.session.commit()
        db_session.session.rollback()

    def test_moving_an_order_between_weeks_is_still_fine(self, db_session,
                                                         admin_user):
        """One ROW moving is not a duplicate — that is the whole point."""
        equipment = _equipment(db_session)
        order = SAPWorkOrder(work_plan_id=None, order_number='700000000002',
                             order_type='PRM', job_type='pm',
                             equipment_id=equipment.id, estimated_hours=4.0,
                             status='pending')
        db_session.session.add(order)
        db_session.session.commit()

        plan, day = _week(db_session, admin_user, TODAY)
        order.work_plan_id = plan.id
        order.status = 'scheduled'
        db_session.session.commit()

        order.work_plan_id = None
        order.status = 'pending'
        db_session.session.commit()

        assert SAPWorkOrder.query.filter_by(order_number='700000000002').count() == 1


class TestSplitOrdersAreProtectedAsAWhole:
    """Since the day budget, a 12h reach stacker PM is planned split — TWO job
    rows with the same order number (part 1/2, part 2/2). The worked-check
    must see the ORDER, not whichever row a .first() happens to return: part 1
    half-done with part 2 untouched is a machine somebody is standing on."""

    def test_a_split_with_one_worked_half_is_left_alone(self, db_session, dead):
        plan, day = dead
        equipment = _equipment(db_session)
        order = _held(db_session, plan, equipment, '700000000001')
        # The UNTOUCHED half is created first on purpose: a .first() lookup
        # would see it, call the order unworked, and release a machine that
        # part 2's crew is standing on.
        part1 = _job(db_session, day, equipment, '700000000001', worked=None)
        part2 = _job(db_session, day, equipment, '700000000001', worked='in_progress')

        result = release_dead_week_orders(today=TODAY)

        assert result['carried_back'] == 0
        assert result['left_worked'] == 1
        db_session.session.refresh(order)
        assert order.work_plan_id == plan.id

    def test_a_split_with_no_work_at_all_is_released(self, db_session, dead):
        plan, day = dead
        equipment = _equipment(db_session)
        order = _held(db_session, plan, equipment, '700000000001')
        _job(db_session, day, equipment, '700000000001', worked=None)
        _job(db_session, day, equipment, '700000000001', worked=None)

        result = release_dead_week_orders(today=TODAY)

        assert result['carried_back'] == 1
        db_session.session.refresh(order)
        assert order.work_plan_id is None
