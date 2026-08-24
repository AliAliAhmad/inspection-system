"""
The day gets a real size: the men who showed up x 8 hours.

Ali, 2026-08-24. These tests drive the full generate_plan pipeline against a
seeded pool, real team rules and a roster, and assert on the WorkPlanJob rows
that land on each day — the same thing the yard reads at 06:00.

What died to make room (asserted dead in TestTheOldRulesAreDead): the
one-family-per-berth-day lock, the machines-per-day counts, the invented
per-worker bundle constants, and the urgent "+1 machine" override. Urgency now
buys the earliest day, and for RS/ECH extra men — never a way past the limit.
"""

from datetime import date, timedelta

import pytest

from app.extensions import db
from app.models import Equipment, SAPWorkOrder, User, WorkPlan, WorkPlanDay, WorkPlanJob
from app.models.worker_assignment_rule import WorkerAssignmentRule
from app.services.work_plan_generator_service import WorkPlanGeneratorService

MONDAY = date(2026, 8, 24)

_seq = iter(range(1, 10000))


def _user(db_session, name, spec='mechanical'):
    user = User(email=f'{name}@t.iq', full_name=name, role='maintenance',
                role_id=f'MNT{next(_seq):03d}', specialization=spec, shift='day')
    user.set_password('x')
    db_session.session.add(user)
    db_session.session.commit()
    return user


def _rule(db_session, berth, team_type, workers):
    rule = WorkerAssignmentRule(
        berth=berth, team_type=team_type, equipment_category='all',
        mech_count=2, elec_count=0,
        candidate_mech_workers=[u.id for u in workers])
    db_session.session.add(rule)
    db_session.session.commit()
    return rule


def _plan(db_session, admin_user):
    plan = WorkPlan(week_start=MONDAY, week_end=MONDAY + timedelta(days=6),
                    status='draft', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.commit()
    return plan


def _machine(db_session, name, kind, berth='west'):
    equipment = Equipment(name=name, serial_number=f'SN-{name}',
                          equipment_type=kind, berth=berth)
    db_session.session.add(equipment)
    db_session.session.commit()
    return equipment


def _order(db_session, equipment, number, job_type='pm', activity='PRM',
           hours=4.5, priority='normal', berth='west', description='250HR SERVICE'):
    order = SAPWorkOrder(order_number=number, order_type=activity,
                         job_type=job_type, equipment_id=equipment.id,
                         estimated_hours=hours, priority=priority,
                         status='pending', berth=berth, description=description)
    db_session.session.add(order)
    db_session.session.commit()
    return order


def _jobs_by_day(plan):
    """{date: [WorkPlanJob, ...]} for the generated plan, AI jobs only."""
    out = {}
    db.session.refresh(plan)
    for day in sorted(plan.days, key=lambda d: d.date):
        out[day.date] = list(day.jobs)
    return out


def _generate(plan):
    return WorkPlanGeneratorService.generate_plan(plan_id=plan.id)


class TestTheDayHasARealSize:
    def test_a_full_day_refuses_the_next_bundle(self, db_session, admin_user):
        """2 west PM men = 16 man-hours a day. Each TT PM costs 2 x 4.5 = 9.
        Two of them cannot share a day; they must land on different days."""
        pm = [_user(db_session, f'a{i}') for i in range(2)]
        _rule(db_session, 'west', 'regular_pm', pm)
        plan = _plan(db_session, admin_user)
        for i in range(2):
            _order(db_session, _machine(db_session, f'TT{i:03d}', 'truck'),
                   f'70000000000{i}')

        _generate(plan)

        days_with_jobs = [d for d, jobs in _jobs_by_day(plan).items() if jobs]
        assert len(days_with_jobs) == 2, 'each TT PM needs its own 16h day'

    def test_a_bigger_team_holds_more(self, db_session, admin_user):
        """4 men = 32 man-hours: three TT PMs (27) fit ONE day."""
        pm = [_user(db_session, f'b{i}') for i in range(4)]
        _rule(db_session, 'west', 'regular_pm', pm)
        plan = _plan(db_session, admin_user)
        for i in range(3):
            _order(db_session, _machine(db_session, f'TT1{i:02d}', 'truck'),
                   f'70000000010{i}')

        _generate(plan)

        days_with_jobs = [d for d, jobs in _jobs_by_day(plan).items() if jobs]
        assert len(days_with_jobs) == 1


class TestEastOneWallet:
    def test_pm_work_and_standalone_faults_drain_the_same_money(self, db_session,
                                                                admin_user):
        """East, 2 men, 16h, ONE team. A TT PM (9 mh) + one standalone COM
        (3h x 2 = 6 mh) fit a day (15). A second standalone COM must go
        elsewhere — under the old two-budget code all three landed together."""
        team = [_user(db_session, f'e{i}') for i in range(2)]
        _rule(db_session, 'east', 'regular_pm', team)
        _rule(db_session, 'east', 'defect_mech', team)
        plan = _plan(db_session, admin_user)
        _order(db_session, _machine(db_session, 'TT200', 'truck', 'east'),
               '700000000200', berth='east')
        for i in range(2):
            _order(db_session, _machine(db_session, f'RS20{i}', 'reach stacker', 'east'),
                   f'70000000021{i}', job_type='defect', activity='COM',
                   hours=3.0, berth='east', description='Brake leak')

        _generate(plan)

        loads = {}
        for day, jobs in _jobs_by_day(plan).items():
            cost = 0.0
            for job in jobs:
                cost += (job.estimated_hours or 0) * 2
            if cost:
                loads[day] = cost
        assert loads, 'something must be scheduled'
        assert max(loads.values()) <= 16, f'a 16h wallet was overspent: {loads}'


class TestReachStackerSpansTwoDays:
    def test_the_pm_is_split_eight_plus_four(self, db_session, admin_user):
        pm = [_user(db_session, f'r{i}') for i in range(2)]
        _rule(db_session, 'west', 'regular_pm', pm)
        plan = _plan(db_session, admin_user)
        _order(db_session, _machine(db_session, 'RS110', 'reach stacker'),
               '700000000300', hours=12.0)

        _generate(plan)

        jobs = [job for jobs in _jobs_by_day(plan).values() for job in jobs]
        hours = sorted(job.estimated_hours for job in jobs)
        assert hours == [4.0, 8.0]
        assert len({job.work_plan_day_id for job in jobs}) == 2
        assert all(job.sap_order_number == '700000000300' for job in jobs)

    def test_its_riding_faults_land_on_the_second_day(self, db_session, admin_user):
        pm = [_user(db_session, f's{i}') for i in range(2)]
        _rule(db_session, 'west', 'regular_pm', pm)
        plan = _plan(db_session, admin_user)
        rs = _machine(db_session, 'RS111', 'reach stacker')
        _order(db_session, rs, '700000000310', hours=12.0)
        _order(db_session, rs, '700000000311', job_type='defect', activity='COM',
               hours=2.0, description='Horn not working')

        _generate(plan)

        by_day = {d: jobs for d, jobs in _jobs_by_day(plan).items() if jobs}
        days = sorted(by_day)
        assert len(days) == 2
        day2_types = {job.job_type for job in by_day[days[1]]}
        assert 'defect' in day2_types, 'the fault rides on the finishing day'
        day1_types = {job.job_type for job in by_day[days[0]]}
        assert day1_types == {'pm'}


class TestUrgentBuysMenNotOverflow:
    def test_an_urgent_rs_gets_four_men_and_one_day(self, db_session, admin_user):
        """4 west PM men, urgent RS -> ONE job, 8.0h, not a split."""
        pm = [_user(db_session, f'u{i}') for i in range(4)]
        _rule(db_session, 'west', 'regular_pm', pm)
        plan = _plan(db_session, admin_user)
        _order(db_session, _machine(db_session, 'RS112', 'reach stacker'),
               '700000000400', hours=12.0, priority='urgent')

        _generate(plan)

        jobs = [job for jobs in _jobs_by_day(plan).values() for job in jobs]
        assert len(jobs) == 1
        assert jobs[0].estimated_hours == 8.0

    def test_an_urgent_tt_stays_a_pair_and_a_full_day_stays_full(self, db_session,
                                                                 admin_user):
        """2 men, day one full with two TT PMs? No - one TT PM (9mh) + urgent
        TT PM must NOT overflow a 16h day to 18: the urgent one takes the
        earliest day and the other moves, total per day <= 16."""
        pm = [_user(db_session, f'v{i}') for i in range(2)]
        _rule(db_session, 'west', 'regular_pm', pm)
        plan = _plan(db_session, admin_user)
        _order(db_session, _machine(db_session, 'TT300', 'truck'), '700000000500')
        _order(db_session, _machine(db_session, 'TT301', 'truck'), '700000000501',
               priority='urgent')

        _generate(plan)

        for day, jobs in _jobs_by_day(plan).items():
            cost = sum((job.estimated_hours or 0) * 2 for job in jobs)
            assert cost <= 16, f'{day} overbooked: {cost}'


class TestAFullWeekRefusesEvenUrgentWork:
    def test_the_eighth_urgent_truck_waits_in_the_box(self, db_session, admin_user):
        """2 men, 7 days, one TT PM fills each day (9 of 16 mh — a second
        does not fit). Eight URGENT TT PMs: seven land, the eighth stays
        unscheduled. Urgency never buys a way past the wallet — that was the
        old "+1 machine" override, and it is dead."""
        pm = [_user(db_session, f'f{i}') for i in range(2)]
        _rule(db_session, 'west', 'regular_pm', pm)
        plan = _plan(db_session, admin_user)
        for i in range(8):
            _order(db_session, _machine(db_session, f'TT6{i:02d}', 'truck'),
                   f'70000000090{i}', priority='urgent')

        _generate(plan)

        by_day = _jobs_by_day(plan)
        for day, jobs in by_day.items():
            cost = sum((job.estimated_hours or 0) * 2 for job in jobs)
            assert cost <= 16, f'{day} overbooked: {cost}'
        total = sum(len(jobs) for jobs in by_day.values())
        assert total == 7, 'seven days, seven trucks — the eighth waits'


class TestTheOldRulesAreDead:
    def test_two_pm_families_share_a_day(self, db_session, admin_user):
        """Trailer PM (3h x 2 = 6) + truck PM (9) = 15 <= 16: SAME day.
        The old pm_category_locked forbade exactly this."""
        pm = [_user(db_session, f'w{i}') for i in range(2)]
        _rule(db_session, 'west', 'regular_pm', pm)
        plan = _plan(db_session, admin_user)
        _order(db_session, _machine(db_session, 'TR078', 'trailer'),
               '700000000600', hours=3.0)
        _order(db_session, _machine(db_session, 'TT400', 'truck'),
               '700000000601', hours=4.5)

        _generate(plan)

        days_with_jobs = [d for d, jobs in _jobs_by_day(plan).items() if jobs]
        assert len(days_with_jobs) == 1, 'families must mix inside a day now'

    def test_a_fifth_standalone_fault_machine_is_allowed_if_hours_allow(
            self, db_session, admin_user):
        """5 standalone COMs on 5 machines cost 5 x 6 = 30 <= 32 (4 spec men).
        The old DEFECT_CAPACITY_PER_BERTH = 4 refused the fifth machine."""
        spec = [_user(db_session, f'x{i}') for i in range(4)]
        pm = [_user(db_session, f'y{i}') for i in range(2)]
        _rule(db_session, 'west', 'regular_pm', pm)
        _rule(db_session, 'west', 'defect_mech', spec)
        plan = _plan(db_session, admin_user)
        for i in range(5):
            _order(db_session, _machine(db_session, f'FL3{i:02d}', 'forklift'),
                   f'70000000070{i}', job_type='defect', activity='COM',
                   hours=3.0, description='Brake leak')

        _generate(plan)

        by_day = {d: jobs for d, jobs in _jobs_by_day(plan).items() if jobs}
        best = max(len(jobs) for jobs in by_day.values())
        assert best == 5, f'all five must share the day: {[len(j) for j in by_day.values()]}'


class TestNoRulesMeansNoWallets:
    def test_generation_still_works_with_no_worker_rules(self, db_session,
                                                         admin_user):
        plan = _plan(db_session, admin_user)
        _order(db_session, _machine(db_session, 'TT500', 'truck'), '700000000800')

        result = _generate(plan)

        jobs = [job for jobs in _jobs_by_day(plan).values() for job in jobs]
        assert len(jobs) == 1
        assert result is not None
