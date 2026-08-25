"""
A team's day, in hours: the men who showed up x 8.

Ali, 2026-08-24. The men come from the team lists the app already holds
(WorkerAssignmentRule candidates + leads), minus anyone the roster marks
off/leave/night, minus approved leaves. Night shift is breakdowns only and
never counts toward the plan.

THE EAST RULE. East's maintenance men ARE the defect team (maintenance role,
specialist minor role). The old code gave them a PM budget AND a specialist
budget — 16 bookable hours from one man. Here, when the two pools share any
member they get ONE Wallet object, so a spent hour is spent everywhere at
once. West's pools are disjoint and get two. Nothing is hardcoded per berth:
hire east a separate defect crew, edit the team lists, and the wallets split
by themselves.

AC is deliberately absent. The AC team keeps its existing machine-count rules
("keep the ac as it is" — Ali), so AC bundles never touch these wallets.
"""

from collections import defaultdict
from datetime import timedelta

from app.services.job_durations import MAN_HOURS_PER_DAY

PM_TEAM_TYPES = ('regular_pm',)
SPEC_TEAM_TYPES = ('defect_mech', 'defect_elec')


class Wallet:
    def __init__(self, men):
        self.men = set(men)
        self.hours_total = float(len(self.men) * MAN_HOURS_PER_DAY)
        self.hours_spent = 0.0

    def remaining(self):
        return self.hours_total - self.hours_spent

    def charge(self, hours):
        self.hours_spent += float(hours)


def is_one_team(pm_ids, spec_ids):
    """One team = the pools share men, or there is no defect pool at all.

    An empty defect pool is NOT a second team: with nobody listed, the
    maintenance men are all there is, which is exactly the one-team case.
    """
    if not spec_ids:
        return True
    return bool(set(pm_ids) & set(spec_ids))


def _rule_member_ids(rule):
    ids = set(rule.candidate_mech_workers or []) | set(rule.candidate_elec_workers or [])
    for uid in (rule.primary_mech_lead_id, rule.successor_mech_lead_id,
                rule.primary_elec_lead_id, rule.successor_elec_lead_id):
        if uid:
            ids.add(uid)
    return ids


def team_pools():
    """{berth: {'pm': set_of_user_ids, 'spec': set_of_user_ids}} from the rules."""
    from app.models.worker_assignment_rule import WorkerAssignmentRule
    pools = {berth: {'pm': set(), 'spec': set()} for berth in ('east', 'west')}
    for rule in WorkerAssignmentRule.query.filter_by(is_active=True).all():
        if rule.berth not in pools:
            continue
        if rule.team_type in PM_TEAM_TYPES:
            pools[rule.berth]['pm'] |= _rule_member_ids(rule)
        elif rule.team_type in SPEC_TEAM_TYPES:
            pools[rule.berth]['spec'] |= _rule_member_ids(rule)
    return pools


def _unavailable_by_date(week_start, week_end):
    """user_ids with no plan-money that day: roster off/leave/NIGHT, or on leave."""
    gone = defaultdict(set)
    try:
        from app.models.roster import RosterEntry
        for entry in RosterEntry.query.filter(RosterEntry.date >= week_start,
                                              RosterEntry.date <= week_end).all():
            if entry.shift in ('off', 'leave', 'night'):
                gone[entry.date].add(entry.user_id)
    except Exception:
        pass
    try:
        from app.models.leave import Leave
        for leave in Leave.query.filter(Leave.status == 'approved',
                                        Leave.date_from <= week_end,
                                        Leave.date_to >= week_start).all():
            day = max(leave.date_from, week_start)
            while day <= min(leave.date_to, week_end):
                gone[day].add(leave.user_id)
                day += timedelta(days=1)
    except Exception:
        pass
    return gone


def build_week_wallets(plan, days):
    """{day_id: {berth: {'pm': Wallet, 'spec': Wallet}}}.

    On a one-team berth 'pm' and 'spec' are the SAME object — a spent hour is
    spent everywhere. Empty dict when no rules exist: the generator treats
    that as "wallets off" and places without an hours check, which keeps every
    installation without team rules working exactly as before.
    """
    pools = team_pools()
    if not any(pool['pm'] or pool['spec'] for pool in pools.values()):
        return {}

    gone = _unavailable_by_date(plan.week_start, plan.week_end)
    wallets = {}
    for day in days:
        wallets[day.id] = {}
        absent = gone.get(day.date, set())
        for berth, pool in pools.items():
            pm_here = pool['pm'] - absent
            spec_here = pool['spec'] - absent
            if is_one_team(pool['pm'], pool['spec']):
                shared = Wallet(pm_here | spec_here)
                wallets[day.id][berth] = {'pm': shared, 'spec': shared}
            else:
                wallets[day.id][berth] = {'pm': Wallet(pm_here),
                                          'spec': Wallet(spec_here)}
    return wallets


def day_free_man_hours(plan, day, berth, wallet_key):
    """Man-hours still unspent on this day's (berth, team) wallet.

    Returns None — never 0.0 — when no team rules exist. None means "there is
    no budget concept here" and every caller must treat it as "the hours check
    is off", exactly as the generator already treats an empty wallet dict.
    Zero would mean the opposite: a full day.

    Three places already did this inline and one of them (`_existing_load`)
    got it wrong, summing machine-hours with no crew multiplier. This is the
    one home for it.
    """
    from app.services.day_ripple import (_berth_key, _job_wallet_key,
                                         job_cost_man_hours)

    wallets = build_week_wallets(plan, list(plan.days))
    if not wallets:
        return None

    berth_key = _berth_key(berth)
    pots = wallets.get(day.id, {}).get(berth_key)
    if not pots or wallet_key not in pots:
        return None

    # On a one-team berth 'pm' and 'spec' are the SAME Wallet object, so an
    # hour spent on either drains both. Filtering by key alone under-counts it.
    shared = pots['pm'] is pots['spec']

    spent = 0.0
    for job in day.jobs:
        key = _job_wallet_key(job)
        if key is None:
            continue
        if _berth_key(job.berth or 'both') != berth_key:
            continue
        if shared or key == wallet_key:
            spent += job_cost_man_hours(job)

    return max(0.0, pots[wallet_key].hours_total - spent)


def day_wallet_hours(plan, day, berth, wallet_key):
    """The wallet's FULL size for this (day, berth, team) — men x 8h.

    The ceiling, not what is left. A job costing more than this can never fit
    on that day no matter how much is moved out of the way, which is a thing
    worth knowing BEFORE promising anybody a fit. None when no rules exist.
    """
    from app.services.day_ripple import _berth_key

    wallets = build_week_wallets(plan, list(plan.days))
    if not wallets:
        return None

    berth_key = _berth_key(berth)
    pots = wallets.get(day.id, {}).get(berth_key)
    if not pots or wallet_key not in pots:
        return None

    return pots[wallet_key].hours_total
