"""
One crew, one visit.

Ali, 2026-08-24: "only the maintenance team are the team who will be assigned
to PRM and its defect." Before this, the assignment step looked at each job
ALONE — so a defect riding along with a PM was handed to the specialist team,
sending a second man to a machine the PM pair was already standing on. The
bundle now decides the team, and every job in it gets the SAME workers.
"""

from datetime import date, timedelta

import pytest

from app.extensions import db
from app.models import (Equipment, SAPWorkOrder, User, WorkPlan,
                        WorkPlanAssignment, WorkPlanJob)
from app.models.worker_assignment_rule import WorkerAssignmentRule
from app.services.work_plan_generator_service import WorkPlanGeneratorService

MONDAY = date(2026, 8, 24)
_seq = iter(range(1, 10000))


def _user(db_session, name, spec='mechanical'):
    user = User(email=f'{name}@t.iq', full_name=name, role='maintenance',
                role_id=f'MNW{next(_seq):03d}', specialization=spec, shift='day')
    user.set_password('x')
    db_session.session.add(user)
    db_session.session.commit()
    return user


def _rule(db_session, berth, team_type, workers, count=2):
    rule = WorkerAssignmentRule(
        berth=berth, team_type=team_type, equipment_category='all',
        mech_count=count, elec_count=0,
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


def _machine(db_session, name, kind):
    equipment = Equipment(name=name, serial_number=f'SN-{name}',
                          equipment_type=kind, berth='west')
    db_session.session.add(equipment)
    db_session.session.commit()
    return equipment


def _order(db_session, equipment, number, job_type='pm', activity='PRM',
           hours=4.5, priority='normal', description='250HR SERVICE'):
    order = SAPWorkOrder(order_number=number, order_type=activity,
                         job_type=job_type, equipment_id=equipment.id,
                         estimated_hours=hours, priority=priority,
                         status='pending', berth='west', description=description)
    db_session.session.add(order)
    db_session.session.commit()
    return order


def _workers_of(job):
    return {a.user_id for a in WorkPlanAssignment.query
            .filter_by(work_plan_job_id=job.id).all()}


def _all_jobs(plan):
    db.session.refresh(plan)
    return [job for day in plan.days for job in day.jobs]


class TestOneCrewOneVisit:
    def test_a_riding_defect_is_assigned_to_the_PM_pair_not_a_specialist(
            self, db_session, admin_user):
        hassan = _user(db_session, 'Hassan')
        omar = _user(db_session, 'Omar')
        karim = _user(db_session, 'Karim')
        _rule(db_session, 'west', 'regular_pm', [hassan, omar])
        _rule(db_session, 'west', 'defect_mech', [karim])
        plan = _plan(db_session, admin_user)
        tt = _machine(db_session, 'TT024', 'truck')
        _order(db_session, tt, '700000001000')
        _order(db_session, tt, '700000001001', job_type='defect', activity='COM',
               hours=2.0, description='Horn not working')

        WorkPlanGeneratorService.generate_plan(plan_id=plan.id)

        jobs = _all_jobs(plan)
        assert len(jobs) == 2
        pair = {hassan.id, omar.id}
        for job in jobs:
            assert _workers_of(job) == pair, f'{job.job_type} not with the pair'
        assert all(karim.id not in _workers_of(job) for job in jobs)

    def test_the_pair_wins_even_when_the_fault_is_first_in_the_bundle(
            self, db_session, admin_user):
        """Order of arrival must not decide the team. The COM order here is
        CREATED before the PRM, so the fault leads the bundle — without the
        bundle-team rule it would be routed to the specialist rule first and
        drag the whole visit to Karim."""
        hassan = _user(db_session, 'HassanR')
        omar = _user(db_session, 'OmarR')
        karim = _user(db_session, 'KarimR')
        _rule(db_session, 'west', 'regular_pm', [hassan, omar])
        _rule(db_session, 'west', 'defect_mech', [karim])
        plan = _plan(db_session, admin_user)
        tt = _machine(db_session, 'TT025', 'truck')
        _order(db_session, tt, '700000001401', job_type='defect', activity='COM',
               hours=2.0, description='Horn not working')   # fault FIRST
        _order(db_session, tt, '700000001400')              # PM second

        WorkPlanGeneratorService.generate_plan(plan_id=plan.id)

        jobs = _all_jobs(plan)
        assert len(jobs) == 2
        pair = {hassan.id, omar.id}
        for job in jobs:
            assert _workers_of(job) == pair, f'{job.job_type} not with the pair'

    def test_a_standalone_fault_still_goes_to_the_specialists(self, db_session,
                                                              admin_user):
        hassan = _user(db_session, 'Hassan2')
        omar = _user(db_session, 'Omar2')
        karim = _user(db_session, 'Karim2')
        zain = _user(db_session, 'Zain2')
        _rule(db_session, 'west', 'regular_pm', [hassan, omar])
        _rule(db_session, 'west', 'defect_mech', [karim, zain])
        plan = _plan(db_session, admin_user)
        _order(db_session, _machine(db_session, 'FL318', 'forklift'),
               '700000001100', job_type='defect', activity='COM', hours=3.0,
               description='Brake leak')

        WorkPlanGeneratorService.generate_plan(plan_id=plan.id)

        jobs = _all_jobs(plan)
        assert len(jobs) == 1
        workers = _workers_of(jobs[0])
        assert workers == {karim.id, zain.id}

    def test_an_urgent_rs_gets_four_names(self, db_session, admin_user):
        crew = [_user(db_session, f'Man{i}') for i in range(4)]
        _rule(db_session, 'west', 'regular_pm', crew)
        plan = _plan(db_session, admin_user)
        _order(db_session, _machine(db_session, 'RS113', 'reach stacker'),
               '700000001200', hours=12.0, priority='urgent')

        WorkPlanGeneratorService.generate_plan(plan_id=plan.id)

        jobs = _all_jobs(plan)
        assert len(jobs) == 1
        assert jobs[0].estimated_hours == 8.0
        assert len(_workers_of(jobs[0])) == 4

    def test_the_split_pm_keeps_the_same_pair_on_both_days(self, db_session,
                                                           admin_user):
        """"If an eqt did not finish today we continue in it next day" — the
        SAME men come back, so the two halves carry identical names."""
        hassan = _user(db_session, 'Hassan3')
        omar = _user(db_session, 'Omar3')
        saad = _user(db_session, 'Saad3')
        _rule(db_session, 'west', 'regular_pm', [hassan, omar, saad])
        plan = _plan(db_session, admin_user)
        _order(db_session, _machine(db_session, 'RS114', 'reach stacker'),
               '700000001300', hours=12.0)

        WorkPlanGeneratorService.generate_plan(plan_id=plan.id)

        jobs = _all_jobs(plan)
        assert len(jobs) == 2
        crews = [_workers_of(job) for job in jobs]
        assert crews[0] == crews[1]
        assert len(crews[0]) == 2
