"""
A team's day = the men who showed up x 8 hours.

Ali, 2026-08-24. The men come from the team lists the app already holds
(WorkerAssignmentRule), minus roster 'off'/'leave'/'night' and approved
leaves. Night shift is for breakdowns only and never counts toward the plan.

The east rule is the heart of it: east's maintenance men ARE the defect team
(maintenance role + specialist minor role). The old code gave them a PM
budget AND a specialist budget — 16 bookable hours from one man. One man,
one wallet.
"""

from datetime import date, timedelta

import pytest

from app.models import User, WorkPlan, WorkPlanDay
from app.models.roster import RosterEntry
from app.models.worker_assignment_rule import WorkerAssignmentRule
from app.services.day_budget import Wallet, build_week_wallets, is_one_team

TODAY = date(2026, 8, 24)


_seq = iter(range(1, 10000))


def _user(db_session, name, spec='mechanical'):
    user = User(email=f'{name}@t.iq', full_name=name, role='maintenance',
                role_id=f'MNT{next(_seq):03d}', specialization=spec, shift='day')
    user.set_password('x')
    db_session.session.add(user)
    db_session.session.commit()
    return user


def _rule(db_session, berth, team_type, workers, category='all'):
    rule = WorkerAssignmentRule(
        berth=berth, team_type=team_type, equipment_category=category,
        mech_count=2, elec_count=0,
        candidate_mech_workers=[u.id for u in workers])
    db_session.session.add(rule)
    db_session.session.commit()
    return rule


def _week(db_session, admin_user, start=TODAY):
    plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                    status='draft', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    days = []
    for offset in range(2):
        day = WorkPlanDay(work_plan_id=plan.id, date=start + timedelta(days=offset))
        db_session.session.add(day)
        days.append(day)
    db_session.session.commit()
    return plan, days


class TestTheWallet:
    def test_men_times_eight(self):
        assert Wallet(men={1, 2, 3}).hours_total == 24

    def test_charging_spends_it(self):
        wallet = Wallet(men={1, 2})
        wallet.charge(9.0)
        assert wallet.remaining() == 7.0


class TestOneTeamDetection:
    def test_shared_men_means_one_team(self):
        assert is_one_team({1, 2, 3}, {2, 3}) is True

    def test_disjoint_means_two_teams(self):
        assert is_one_team({1, 2}, {3, 4}) is False

    def test_an_empty_defect_pool_is_not_a_second_team(self):
        """With nobody listed as a specialist, the maintenance men are all
        there is — which is exactly the one-team case."""
        assert is_one_team({1, 2}, set()) is True


class TestBuildingTheWeek:
    def test_west_gets_two_separate_wallets(self, db_session, admin_user):
        pm = [_user(db_session, f'pm{i}') for i in range(2)]
        spec = [_user(db_session, f'sp{i}') for i in range(2)]
        _rule(db_session, 'west', 'regular_pm', pm)
        _rule(db_session, 'west', 'defect_mech', spec)
        plan, days = _week(db_session, admin_user)

        west = build_week_wallets(plan, days)[days[0].id]['west']

        assert west['pm'] is not west['spec']
        assert west['pm'].hours_total == 16
        assert west['spec'].hours_total == 16

    def test_east_shares_ONE_wallet_when_the_men_overlap(self, db_session,
                                                         admin_user):
        team = [_user(db_session, f'e{i}') for i in range(4)]
        _rule(db_session, 'east', 'regular_pm', team)
        _rule(db_session, 'east', 'defect_mech', team)
        plan, days = _week(db_session, admin_user)

        east = build_week_wallets(plan, days)[days[0].id]['east']

        assert east['pm'] is east['spec']
        assert east['pm'].hours_total == 32
        east['pm'].charge(9.0)
        assert east['spec'].remaining() == 23.0   # same money

    def test_a_man_on_leave_shrinks_that_day_only(self, db_session, admin_user):
        team = [_user(db_session, f'l{i}') for i in range(3)]
        _rule(db_session, 'west', 'regular_pm', team)
        plan, days = _week(db_session, admin_user)
        db_session.session.add(RosterEntry(user_id=team[0].id,
                                           date=days[0].date, shift='leave'))
        db_session.session.commit()

        wallets = build_week_wallets(plan, days)

        assert wallets[days[0].id]['west']['pm'].hours_total == 16
        assert wallets[days[1].id]['west']['pm'].hours_total == 24

    def test_the_night_shift_is_not_plan_money(self, db_session, admin_user):
        """Ali: nights are for breakdowns only."""
        team = [_user(db_session, f'n{i}') for i in range(3)]
        _rule(db_session, 'west', 'regular_pm', team)
        plan, days = _week(db_session, admin_user)
        db_session.session.add(RosterEntry(user_id=team[0].id,
                                           date=days[0].date, shift='night'))
        db_session.session.commit()

        wallets = build_week_wallets(plan, days)

        assert wallets[days[0].id]['west']['pm'].hours_total == 16

    def test_team_leads_count_even_when_not_in_the_candidate_list(self, db_session,
                                                                  admin_user):
        lead = _user(db_session, 'lead')
        pair = [_user(db_session, 'c1'), _user(db_session, 'c2')]
        rule = _rule(db_session, 'west', 'regular_pm', pair)
        rule.primary_mech_lead_id = lead.id
        db_session.session.commit()
        plan, days = _week(db_session, admin_user)

        assert build_week_wallets(plan, days)[days[0].id]['west']['pm'].hours_total == 24

    def test_no_rules_means_no_wallets_feature_off(self, db_session, admin_user):
        plan, days = _week(db_session, admin_user)
        assert build_week_wallets(plan, days) == {}
