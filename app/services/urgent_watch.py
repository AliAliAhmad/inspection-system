"""An urgent order with nowhere to go — ask, never decide.

Today such an order simply waits in the box and nobody is told: the generator
drops a bundle it cannot place into `unscheduled` and returns. The domino
already knows how to slide the least important untouched job forward. Nothing
ever asked whether it should.

This runs once a night, inside the pool rebuild's cross-worker lock, and it
CHANGES NOTHING. It only writes questions.
"""

import logging
from datetime import datetime, timedelta

from app.extensions import db
from app.models import SAPWorkOrder, TelegramProposal, WorkPlan, WorkPlanJob
from app.services.day_budget import day_free_man_hours, day_wallet_hours
from app.services.day_ripple import job_cost_man_hours, make_room
from app.services.job_durations import MAN_HOURS_PER_DAY
from app.services.place_one import (available_men, can_field, place_one,
                                    place_split, price_one,
                                    urgent_one_day_crew)
from app.services.telegram.ask import ask, expire_open
from app.services.telegram.taps import register
from app.utils.decorators import planning_today

logger = logging.getLogger(__name__)

KIND = 'urgent_needs_room'

# How many questions ONE night may raise. Without a cap the watch asks about
# every homeless urgent order, one message per order to every planner — with 40
# of 133 live orders flagged urgent that is a wall of buzzing at five in the
# morning, and `TelegramClient._call` has no retry and no rate-limit pacing, so
# a burst would silently drop some planners' copies (message_id NULL) and they
# would never know they had been asked. Three is a morning's worth of decisions.
# Whatever is skipped is LOGGED and counted, never silently dropped, and it
# comes back the next night — the box does not forget.
MAX_ASKS_PER_NIGHT = 3

WORDS = {
    'en': {
        'headline': 'URGENT {order} — {machine} — has no room on {day}.',
        'needs': 'It needs {hours} hours from {crew} men ({mh} man-hours).',
        'would_move': 'To fit it: {moves}',
        'to_box': 'back to the box',
        'yes': 'Yes, make room',
        'no': 'No',
        'pick': 'Pick a day',
        'day': '{day}',
    },
    'ar': {
        'headline': 'عاجل {order} — {machine} — لا مكان له يوم {day}.',
        'needs': 'يحتاج {hours} ساعات من {crew} رجال ({mh} ساعة-رجل).',
        'would_move': 'لإدخاله: {moves}',
        'to_box': 'يعود إلى الصندوق',
        'yes': 'نعم، أفسح مكاناً',
        'no': 'لا',
        'pick': 'اختر يوماً',
        'day': '{day}',
    },
}


def _t(language, key, **fields):
    table = WORDS.get(language, WORDS['en'])
    return table.get(key, WORDS['en'][key]).format(**fields)


def order_is_urgent(order):
    """Ali's urgency, as the placement code already reads it.

    `_is_urgent_bundle` treats a member with priority urgent/critical as urgent,
    and separately anything scoring 85+. For a lone SAP order those agree:
    `_SAP_PRIORITY_SCORE['urgent']` is 90. Deliberately NOT `_is_high_urgency`,
    which also counts plain 'high' — that one splits recipe steps, it does not
    drive placement, and 33 of the 133 live orders are 'high'.
    """
    return (order.priority or '').lower() in ('urgent', 'critical')


def plan_for_week(day):
    """The plan covering this date, or None. There is no shared helper for this
    outside the Telegram module; `week_start` is uniquely constrained, so a
    lookup by Monday is exact."""
    monday, _sunday = WorkPlan.get_week_bounds(day)
    return WorkPlan.query.filter_by(week_start=monday).first()


def _homeless_urgents():
    return [order for order in SAPWorkOrder.query.filter(
        SAPWorkOrder.status == 'pending',
        SAPWorkOrder.work_plan_id.is_(None)).all()
        if order_is_urgent(order)]


def _already_open(order_number):
    """Is this order already the subject of a live question?

    Compared in PYTHON, not in SQL. A JSON-path filter
    (`details['order_number'].as_string()`) works on Postgres and not on
    SQLite, and the whole test suite runs on SQLite — it would pass in
    production and blow up in every test, or the reverse. The number of open
    questions is single digits; a Python loop is free.
    """
    open_rows = TelegramProposal.query.filter(
        TelegramProposal.kind == KIND,
        TelegramProposal.status == 'open').all()
    return any((row.details or {}).get('order_number') == order_number
               for row in open_rows)


def _tomorrow_morning(today):
    """The buttons live until the next night's check (05:00 Baghdad).

    Deliberately built from the REAL current moment, not from `today` — every
    comparison against `expires_at` elsewhere in the Telegram module
    (`ask.expire_open`, `taps.claim`) uses `datetime.utcnow()`. `today` is a
    business date a caller may simulate (a dry run, a test) that need not
    match the real clock; computing expiry from it would hand back a question
    that is already expired the moment `today` lags behind real "now" — which
    it always does in a test fixing `today` to a past Monday. `look_for_
    homeless_urgents` is always called for real at 05:00 Baghdad with no
    `today` override, so "24 hours from now" and "tomorrow's 05:00 Baghdad
    check" are the same moment in production; only a simulated `today` could
    tell them apart, and expiry should follow the real clock, not the
    simulation.
    """
    return datetime.utcnow() + timedelta(hours=24)


def _describe(chain, language):
    parts = []
    for move in chain:
        where = (_t(language, 'to_box') if move['to'] == 'box' else move['to'])
        parts.append(f"{move['description']} → {where}")
    return '; '.join(parts)


def look_for_homeless_urgents(today=None, client=None):
    """Ask about every urgent order that cannot fit anywhere. Changes nothing."""
    today = today or planning_today()
    # force=True: this is the nightly sweep's first act, so it must expire
    # EVERY still-open row of this kind, not just the ones whose clock has
    # run out — see expire_open's docstring for why a time-based expiry would
    # leave last night's own proposal open and suppress tonight's fresh ask.
    expired = expire_open(KIND, force=True)

    plan = plan_for_week(today)
    if plan is None:
        return {'asked': 0, 'checked': 0, 'expired': expired,
                'reason': 'no plan for this week'}

    days = [d for d in sorted(plan.days, key=lambda d: d.date)
            if d.date >= today]
    if not days:
        return {'asked': 0, 'checked': 0, 'expired': expired,
                'reason': 'no days left in this week'}

    asked = 0
    skipped = 0
    orders = _homeless_urgents()
    # Most overdue first, so a capped night spends its three questions on the
    # work that has waited longest. `overdue_value` is already comparable across
    # kinds — `_resolve_overdue` normalises calendar PMs to days and
    # running-hours PMs to hours past due — and None sorts last.
    orders.sort(key=lambda o: (o.overdue_value is None, -(o.overdue_value or 0)))
    for order in orders:
        if asked >= MAX_ASKS_PER_NIGHT:
            remaining = len(orders) - orders.index(order)
            logger.info('urgent watch | cap reached — asked about %d, %d more '
                        'urgent orders still have nowhere to go; they come back '
                        'tomorrow night', asked, remaining)
            skipped = remaining
            break
        # Ali, 2026-08-25: an urgent reach stacker (or ECH) must ALWAYS be
        # offered. Give it 3 or 4 men and it takes 8 hours — one day. Only if
        # 3 or 4 are not standing free does it drop to 2 men, 12 hours, and
        # run 8 today + 4 tomorrow. His curve holds the numbers; this just
        # asks for them.
        boost = urgent_one_day_crew(order, days[0])
        priced = price_one(order, crew=boost[0]) if boost else price_one(order)

        if priced['wallet_key'] is None:
            continue                     # AC work spends no wallet; not ours

        free = [day_free_man_hours(plan, d, priced['berth'],
                                   priced['wallet_key']) for d in days]
        if any(f is None for f in free):
            return {'asked': asked, 'checked': len(orders), 'skipped': skipped,
                    'expired': expired,
                    'reason': 'no team rules — hours check is off'}

        if priced['hours'] > MAN_HOURS_PER_DAY:
            # Two men, twelve hours: 8 today and the rest tomorrow, the same
            # shape the weekly planner produces and the same shape the evening
            # carry-over's merge already understands.
            if len(days) < 2:
                logger.info('urgent watch | %s needs two days and only %d is '
                            'left in the week — not asking',
                            order.order_number, len(days))
                continue
            first_h = float(MAN_HOURS_PER_DAY)
            rest_h = round(priced['hours'] - first_h, 2)
            costs = [first_h * priced['crew'], rest_h * priced['crew']]
            shape_days = [days[0], days[1]]
            split = True
            if any(free[i] >= costs[0] and free[i + 1] >= costs[1]
                   for i in range(len(days) - 1)):
                continue                 # a consecutive pair already takes it
        else:
            costs = [priced['cost_man_hours']]
            shape_days = [days[0]]
            split = False
            if any(f >= costs[0] for f in free):
                continue                 # it fits; the next generate places it
        cost = costs[0]

        if _already_open(order.order_number):
            continue

        target = shape_days[0]

        ceilings = [day_wallet_hours(plan, d, priced['berth'],
                                     priced['wallet_key']) for d in shape_days]
        ceiling = ceilings[0]
        if (any(c is None for c in ceilings)
                or any(cst > c + 1e-6 for cst, c in zip(costs, ceilings))):
            logger.info('urgent watch | %s needs %.1f mh, the whole %s %s '
                        'wallet is %s — cannot fit any day, not asking',
                        order.order_number, cost, target.date,
                        priced['berth'], ceiling)
            continue

        # ONE simulation for the whole shape. Two calls cannot see each
        # other: the first pushes a job onto the second day, which the second
        # then plans without — the message promised five moves while six
        # happened, and a different job moved.
        chain = make_room(plan, shape_days[0], costs[0], priced['berth'],
                          priced['wallet_key'], dry_run=True,
                          demands=list(zip(shape_days, costs)))
        if not chain:
            continue                     # nothing can move; asking is pointless

        freed = 0.0
        for move in chain:
            if move['from'] != target.date.isoformat():
                continue
            moved = db.session.get(WorkPlanJob, move['job_id'])
            if moved is not None:
                freed += job_cost_man_hours(moved)
        if free[0] + freed + 1e-6 < cost:
            logger.info('urgent watch | %s needs %.1f mh, moving everything '
                        'movable off %s frees only %.1f — not asking',
                        order.order_number, cost, target.date,
                        free[0] + freed)
            continue

        machine = order.equipment.name if order.equipment else '?'
        texts = {}
        for language in WORDS:
            texts[language] = '\n'.join([
                _t(language, 'headline', order=order.order_number,
                   machine=machine, day=target.date.isoformat()),
                _t(language, 'needs', hours=priced['hours'],
                   crew=priced['crew'], mh=cost),
                _t(language, 'would_move', moves=_describe(chain, language)),
            ])

        options = [
            {'key': 'yes', 'action': 'apply',
             'label_en': WORDS['en']['yes'], 'label_ar': WORDS['ar']['yes']},
            {'key': 'no', 'action': 'decline',
             'label_en': WORDS['en']['no'], 'label_ar': WORDS['ar']['no']},
            {'key': 'pick', 'action': 'expand',
             'label_en': WORDS['en']['pick'], 'label_ar': WORDS['ar']['pick'],
             # A split needs a day AFTER it, so the week's last day is never
             # offered for one — picking it could only ever raise an error.
             'expand': [{'key': f'day:{d.id}', 'action': 'apply',
                         'label_en': d.date.isoformat(),
                         'label_ar': d.date.isoformat()}
                        for d in (days[1:-1] if split else days[1:])]},
        ]

        proposal = ask(KIND, texts, options, _tomorrow_morning(today),
                       details={'order_number': order.order_number,
                                'berth': priced['berth'],
                                'wallet_key': priced['wallet_key'],
                                'cost_man_hours': cost,
                                'costs': costs,
                                'hours': priced['hours'],
                                'crew': priced['crew'],
                                'split': split,
                                'boosted': boost is not None,
                                'day_ids': [d.id for d in shape_days],
                                'chain': chain},
                       work_plan_id=plan.id, target_day_id=target.id,
                       client=client)
        if proposal is not None:
            asked += 1

    logger.info('urgent watch | checked=%d asked=%d skipped_by_cap=%d expired=%d',
                len(orders), asked, skipped, expired)
    return {'asked': asked, 'checked': len(orders), 'skipped': skipped,
            'expired': expired, 'reason': None}


@register(KIND)
def apply_urgent(proposal, option, user):
    """Somebody said yes. Make the room, then put the job in it.

    `make_room` is run AGAIN, for real — the chain stored at ask time was a
    simulation and the plan may have moved since. What actually happened is
    what gets recorded.

    THE TRANSACTION CONTRACT (ruled 2026-08-25, from the Task 4 review): an
    apply function NEVER commits. It flushes, and `handle_callback` commits
    once — covering this function's work and the proposal's result row in the
    same transaction. That is what makes the failure path honest: if anything
    here raises, the rollback really does undo the plan change. An apply that
    committed its own work would put that work beyond the reach of the very
    rollback meant to protect it.
    """
    details = proposal.details or {}
    order = SAPWorkOrder.query.filter_by(
        order_number=details['order_number']).first()
    if order is None:
        raise ValueError(f"order {details['order_number']} is gone")

    day_id = proposal.target_day_id
    if (option.get('key') or '').startswith('day:'):
        day_id = int(option['key'].split(':')[1])

    from app.models import WorkPlanDay
    day = db.session.get(WorkPlanDay, day_id)
    if day is None:
        raise ValueError('that day is gone')

    # Re-price with the crew the QUESTION was asked about — but ONLY when the
    # ask was actually boosted. `price_one(crew=N)` re-reads the hours from
    # Ali's curve for N men, which is meaningful only for an urgent RS/ECH that
    # was offered a bigger crew. Replaying it on an ordinary proposal rewrites
    # hours nobody agreed to: a 3-hour fault becomes an 8-hour PM, a truck's
    # crew is silently cut to the table pair while three men are still
    # assigned, and a 12-hour split re-prices to 8 so `place_split` finds
    # nothing left to split and raises.
    # A boosted shape was measured against ONE day's roster. "Pick a day" can
    # move it to another, and four men free on Monday are not four men free on
    # Thursday. Re-ask on the day actually chosen; if the crew is no longer
    # there, fall back to the honest unboosted shape rather than booking an
    # eight-hour day that needs men who are not coming.
    if details.get('boosted') and can_field(order, day, details['crew']):
        priced = price_one(order, crew=details['crew'])
    else:
        if details.get('boosted'):
            logger.info('urgent watch | %s was offered %d men but only %d can '
                        'be fielded on %s — falling back to the plain shape',
                        order.order_number, details['crew'],
                        available_men(order, day), day.date)
        priced = price_one(order)
    plan = day.work_plan

    if not details.get('split'):
        chain = make_room(plan, day, priced['cost_man_hours'],
                          priced['berth'], priced['wallet_key'], dry_run=False)
        job = place_one(order, day, priced=priced)
        db.session.flush()
        return {'chain': chain, 'job_id': job.id,
                'day': day.date.isoformat(),
                'crew': priced['crew'], 'hours': priced['hours'],
                'cost_man_hours': priced['cost_man_hours']}

    # Two men, twelve hours: 8 today and 4 tomorrow, consecutive days.
    days = sorted(plan.days, key=lambda d: d.date)
    following = [d for d in days if d.date > day.date]
    if not following:
        raise ValueError(
            f'{order.order_number} needs two days and {day.date} is the last '
            f'day of the week')
    day2 = following[0]

    costs = details.get('costs') or [priced['cost_man_hours']]
    # ONE call, both days — the SAME call the ask simulated. Two sequential
    # calls were blind to each other, and the second planned against a picture
    # the first had already changed. Sharing one code path is what makes the
    # message honest: dry_run returns byte-for-byte what this does.
    chain = make_room(plan, day, costs[0], priced['berth'],
                      priced['wallet_key'], dry_run=False,
                      demands=list(zip((day, day2), costs)))
    part1, part2 = place_split(order, day, day2, priced=priced)
    db.session.flush()
    return {'chain': chain, 'job_id': part1.id, 'job_id_part2': part2.id,
            'day': day.date.isoformat(), 'day_part2': day2.date.isoformat(),
            'split': True, 'crew': priced['crew'], 'hours': priced['hours'],
            'cost_man_hours': sum(costs)}
