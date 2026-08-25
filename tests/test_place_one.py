"""Baking one bun.

The planner only knows how to bake a whole tray — a week at a time, and it
refuses a published week. Both new questions need to put ONE job on ONE day.

And the price tag has to match. A job costs the day `hours x crew`, and this
codebase has two ideas of `crew`: the planner's figure from Ali's table, and
the domino's `max(2, len(assignments))`. For a 4-man reach stacker they differ
by double. Putting the men on the job BEFORE the day is measured is what makes
them agree — the same mistake, in its other home, was the carry-over bug of
2026-08-25.
"""

from datetime import date, timedelta

import pytest

from app.extensions import db
from app.models import (Equipment, SAPWorkOrder, User, WorkPlan, WorkPlanDay,
                        WorkPlanJob)
from app.models.worker_assignment_rule import WorkerAssignmentRule
from app.services.day_ripple import job_cost_man_hours
from app.services.place_one import place_one, price_one, staff_one_job

MONDAY = date(2026, 8, 24)
_seq = iter(range(1, 10000))


def _man(db_session, name, on_leave=False):
    user = User(email=f'{name}-{next(_seq)}@t.iq', full_name=name,
                role='maintenance', role_id=f'PLC{next(_seq):04d}',
                specialization='mechanical', shift='day', is_on_leave=on_leave)
    user.set_password('x')
    db_session.session.add(user)
    db_session.session.commit()
    return user


def _rule(db_session, men, berth='west', team_type='regular_pm'):
    rule = WorkerAssignmentRule(berth=berth, team_type=team_type,
                                equipment_category='all', mech_count=2,
                                elec_count=0,
                                candidate_mech_workers=[m.id for m in men])
    db_session.session.add(rule)
    db_session.session.commit()
    return rule


def _week(db_session, admin_user, status='published'):
    plan = WorkPlan(week_start=MONDAY, week_end=MONDAY + timedelta(days=6),
                    status=status, created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    days = []
    for offset in range(7):
        day = WorkPlanDay(work_plan_id=plan.id, date=MONDAY + timedelta(days=offset))
        db_session.session.add(day)
        days.append(day)
    db_session.session.commit()
    return plan, days


def _order(db_session, name='RS110', kind='reach stacker', job_type='pm',
           order_type='PRM', number='700000000300', berth='west',
           description='RS110 250HR SERVICE'):
    equipment = Equipment(name=name, serial_number=f'SN-{name}-{next(_seq)}',
                          equipment_type=kind, berth=berth)
    db_session.session.add(equipment)
    db_session.session.commit()
    order = SAPWorkOrder(order_number=number, order_type=order_type,
                         job_type=job_type, equipment_id=equipment.id,
                         description=description, estimated_hours=4.0,
                         priority='urgent', berth=berth, status='pending',
                         work_plan_id=None)
    db_session.session.add(order)
    db_session.session.commit()
    return order


class TestThePriceTag:
    def test_a_reach_stacker_pm_is_priced_from_alis_table_not_the_import(
            self, db_session, admin_user):
        """SAPWorkOrder.estimated_hours is an import default of 4.0. Ali's
        table says a reach stacker PM is 12 hours with 2 men."""
        order = _order(db_session)

        priced = price_one(order)

        assert priced['hours'] == 12.0
        assert priced['crew'] == 2
        assert priced['cost_man_hours'] == 24.0
        assert priced['berth'] == 'west'
        assert priced['wallet_key'] == 'pm'

    def test_a_standalone_fault_spends_the_defect_wallet(self, db_session,
                                                         admin_user):
        order = _order(db_session, name='ECH5', kind='empty handler',
                       job_type='defect', order_type='COM',
                       number='700000000301', description='ECH5 leak')

        priced = price_one(order)

        assert priced['wallet_key'] == 'spec'

    def test_an_ac_service_spends_no_wallet_at_all(self, db_session, admin_user):
        order = _order(db_session, name='TT9', kind='tractor',
                       number='700000000302',
                       description='TT9 AC SERVICE')

        assert price_one(order)['wallet_key'] is None


class TestPuttingItOnTheDay:
    def test_the_job_lands_with_its_men_on_it(self, db_session, admin_user):
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'p{i}') for i in range(2)]
        _rule(db_session, men)
        order = _order(db_session)

        job = place_one(order, days[1])

        assert job.work_plan_day_id == days[1].id
        assert float(job.estimated_hours) == 12.0
        assert len(job.assignments) == 2
        assert {a.user_id for a in job.assignments} == {m.id for m in men}

    def test_the_promised_price_is_the_price_the_domino_reads(self, db_session,
                                                              admin_user):
        """The whole point. price_one() promises a number to the question; the
        domino later reads job_cost_man_hours() off the created row. If those
        two ever disagree, a day quietly runs over — that was the carry-over
        bug."""
        plan, days = _week(db_session, admin_user)
        _rule(db_session, [_man(db_session, f'q{i}') for i in range(2)])
        order = _order(db_session)
        promised = price_one(order)['cost_man_hours']

        job = place_one(order, days[1])

        assert job_cost_man_hours(job) == promised

    def test_the_box_row_is_emptied(self, db_session, admin_user):
        plan, days = _week(db_session, admin_user)
        _rule(db_session, [_man(db_session, f'r{i}') for i in range(2)])
        order = _order(db_session)

        place_one(order, days[1])

        db_session.session.refresh(order)
        assert order.status == 'scheduled'
        assert order.work_plan_id == plan.id

    def test_named_men_beat_the_rule(self, db_session, admin_user):
        """The crew that just finished early gets the work — not whoever the
        rule would have picked."""
        plan, days = _week(db_session, admin_user)
        rule_men = [_man(db_session, f's{i}') for i in range(2)]
        _rule(db_session, rule_men)
        chosen = [_man(db_session, 'chosen1'), _man(db_session, 'chosen2')]
        order = _order(db_session)

        job = place_one(order, days[1], crew_user_ids=[m.id for m in chosen])

        assert {a.user_id for a in job.assignments} == {m.id for m in chosen}

    def test_a_man_on_leave_is_never_staffed(self, db_session, admin_user):
        plan, days = _week(db_session, admin_user)
        away = _man(db_session, 'away', on_leave=True)
        here = [_man(db_session, f't{i}') for i in range(2)]
        _rule(db_session, [away] + here)
        order = _order(db_session)

        job = place_one(order, days[1])

        assert away.id not in {a.user_id for a in job.assignments}

    def test_no_rules_means_the_job_still_lands_but_empty_handed(
            self, db_session, admin_user):
        """Consistent with everything else: no team rules, no staffing. The
        job is still created so nothing is silently dropped."""
        plan, days = _week(db_session, admin_user)
        order = _order(db_session)

        job = place_one(order, days[1])

        assert job.id is not None
        assert job.assignments == []

    def test_it_works_on_a_published_week(self, db_session, admin_user):
        """Deliberate: a HUMAN decision may change a published week — the
        evening carry-over already does. Only unattended machinery may not, and
        nothing here runs without a finger on a button."""
        plan, days = _week(db_session, admin_user, status='published')
        _rule(db_session, [_man(db_session, f'u{i}') for i in range(2)])
        order = _order(db_session)

        job = place_one(order, days[1])

        assert job.id is not None

    def test_a_three_man_rule_is_priced_for_three_men(self, db_session,
                                                      admin_user):
        """The promise must equal what the domino will later read. A rule with
        (mech 2, elec 1) sends THREE men, so the day pays hours x 3 — pricing
        it at Ali's table crew of 2 would under-free the day by a third."""
        plan, days = _week(db_session, admin_user)
        mech = [_man(db_session, f'm{i}') for i in range(2)]
        elec = _man(db_session, 'e1')
        rule = WorkerAssignmentRule(
            berth='west', team_type='regular_pm', equipment_category='all',
            mech_count=2, elec_count=1,
            candidate_mech_workers=[m.id for m in mech],
            candidate_elec_workers=[elec.id])
        db_session.session.add(rule)
        db_session.session.commit()
        order = _order(db_session, number='700000000399')

        priced = price_one(order)
        job = place_one(order, days[1])

        assert priced['crew'] == 3
        assert priced['cost_man_hours'] == 36.0        # 12h x 3
        assert job_cost_man_hours(job) == priced['cost_man_hours']
