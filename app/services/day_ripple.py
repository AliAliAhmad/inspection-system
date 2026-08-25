"""
The domino: a day that must take more work makes room by sliding its least
important job forward.

Ali's "A" (2026-08-25), on what happens when unfinished RS110 hours land on a
full Tuesday: Tuesday's least important job slides to Wednesday, Wednesday's
to Thursday, and whatever falls off the week's end goes BACK TO THE BOX — the
same rule a finished week already follows. The whole chain is computed first
and returned, so the daily review can show it before one Submit approves it;
it runs as part of the review, never invisibly.

THE IRON RULES, same as everywhere else in this codebase:

  * A WORKED job never moves (job_work_state is not None). However
    unimportant, it is a work record with a man's hours in it.
  * No team rules configured -> no wallets -> no domino. The feature switches
    off exactly like the generator's hours check does.
  * The chain is SIMULATED on a snapshot, then applied — so dry_run=True
    returns byte-for-byte the chain that dry_run=False would execute. Two
    code paths would drift; one cannot.

Costs are the generator's: man-hours = duration x max(2, assigned men); AC
PM jobs belong to the AC team and are invisible here.
"""

import logging
from collections import defaultdict

from app.extensions import db
from app.models import SAPWorkOrder, WorkPlanJob
from app.services.day_budget import build_week_wallets
from app.services.job_durations import MIN_CREW, is_ac_service

logger = logging.getLogger(__name__)

_PRIORITY_RANK = {'low': 0, 'normal': 1, 'high': 2, 'urgent': 3}


def job_cost_man_hours(job):
    crew = max(MIN_CREW, len(job.assignments or []))
    return float(job.estimated_hours or 0) * crew


def _job_wallet_key(job):
    """Which wallet a job spends — mirrors the generator's charging."""
    if job.job_type == 'pm':
        return None if is_ac_service(job.description) else 'pm'
    from app.services.work_plan_generator_service import _job_is_defect_work
    if _job_is_defect_work(job):
        return 'spec'
    return None


def _berth_key(berth):
    return berth if berth in ('east', 'west') else 'east'


def make_room(plan, target_day, needed_mh, berth, wallet_key,
              protect_job_ids=None, dry_run=False):
    """Make `needed_mh` man-hours of room on `target_day`'s (berth, team) wallet.

    Returns the chain of moves as [{'job_id', 'description',
    'sap_order_number', 'priority', 'from', 'to'}] where 'to' is a date
    isoformat or 'box'. Empty list when nothing needs to move — or nothing CAN
    (no wallets configured, or only worked jobs stand in the way; the day then
    simply runs over, which the review shows honestly).
    """
    protect_job_ids = set(protect_job_ids or ())
    days = sorted(plan.days, key=lambda d: d.date)
    wallets = build_week_wallets(plan, days)
    if not wallets:
        return []

    berth = _berth_key(berth)

    def capacity(day):
        day_wallets = wallets.get(day.id, {}).get(berth)
        if not day_wallets:
            return None, False
        wallet = day_wallets[wallet_key]
        return wallet.hours_total, day_wallets['pm'] is day_wallets['spec']

    # Snapshot: every job on this berth's wallets, per day.
    records_by_day = {day.id: [] for day in days}
    for day in days:
        for job in day.jobs:
            key = _job_wallet_key(job)
            if key is None:
                continue
            if _berth_key(job.berth or 'both') != berth:
                continue
            from app.api.work_plans import job_work_state
            records_by_day[day.id].append({
                'job': job,
                'cost': job_cost_man_hours(job),
                'key': key,
                'movable': (job_work_state(job) is None
                            and job.id not in protect_job_ids),
            })

    # ── Simulate ──
    moves = []
    demand = defaultdict(float)
    demand[target_day.id] = float(needed_mh)
    start = next(i for i, day in enumerate(days) if day.id == target_day.id)

    for i in range(start, len(days)):
        day = days[i]
        cap, shared = capacity(day)
        if cap is None:
            continue

        def used():
            return sum(r['cost'] for r in records_by_day[day.id]
                       if shared or r['key'] == wallet_key)

        while used() + demand[day.id] > cap + 1e-6:
            victims = [r for r in records_by_day[day.id]
                       if r['movable'] and (shared or r['key'] == wallet_key)]
            if not victims:
                break  # only worked jobs left — the day runs over, honestly
            # Least important first; among equals the BIGGEST job, so one move
            # frees the most room and the chain stays short.
            victims.sort(key=lambda r: (
                _PRIORITY_RANK.get((r['job'].priority or 'normal').lower(), 1),
                -r['cost'],
            ))
            victim = victims[0]
            records_by_day[day.id].remove(victim)
            if i + 1 < len(days):
                records_by_day[days[i + 1].id].append(victim)
                destination = days[i + 1]
            else:
                destination = None  # off the week's end -> the box
            moves.append((victim['job'], day, destination))

    chain = [{
        'job_id': job.id,
        'description': job.description,
        'sap_order_number': job.sap_order_number,
        'priority': job.priority,
        'from': from_day.date.isoformat(),
        'to': to_day.date.isoformat() if to_day else 'box',
    } for job, from_day, to_day in moves]

    if dry_run or not moves:
        return chain

    # ── Apply, in chain order ──
    from app.api.work_plans import purge_job_rows
    for job, _from_day, to_day in moves:
        if to_day is not None:
            job.work_plan_day_id = to_day.id
        else:
            # Back to the box: the pool row is released, the job row goes.
            # Anything deleted in error is rebuilt from SAP the following
            # night; a defect job's defect stays open and re-enters via the
            # next generate.
            if job.sap_order_number:
                order = SAPWorkOrder.query.filter_by(
                    order_number=job.sap_order_number).first()
                if order is not None:
                    order.status = 'pending'
                    order.work_plan_id = None
            purge_job_rows(job)
    db.session.flush()

    logger.info('day_ripple | day=%s berth=%s key=%s needed=%.1f moves=%d',
                target_day.date, berth, wallet_key, needed_mh, len(chain))
    return chain
