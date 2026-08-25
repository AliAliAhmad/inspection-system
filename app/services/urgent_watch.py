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
from app.services.place_one import place_one, price_one
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
        priced = price_one(order)
        if priced['hours'] > MAN_HOURS_PER_DAY:
            # The generator splits a big PM 8h + 4h across two days
            # (_place_big_pm). place_one cannot, and one 12-hour single-day job
            # is a shape the day model forbids. Stage 1 does not ask about work
            # it cannot place correctly.
            logger.info('urgent watch | %s is %.1fh, longer than a day — '
                        'needs the 8+4 split, not asking',
                        order.order_number, priced['hours'])
            continue
        if priced['wallet_key'] is None:
            continue                     # AC work spends no wallet; not ours
        cost = priced['cost_man_hours']

        free = [day_free_man_hours(plan, d, priced['berth'],
                                   priced['wallet_key']) for d in days]
        if any(f is None for f in free):
            return {'asked': asked, 'checked': len(orders), 'expired': expired,
                    'reason': 'no team rules — hours check is off'}
        if any(f >= cost for f in free):
            continue                     # it fits; the next generate places it

        if _already_open(order.order_number):
            continue

        target = days[0]

        ceiling = day_wallet_hours(plan, target, priced['berth'],
                                   priced['wallet_key'])
        if ceiling is None or cost > ceiling + 1e-6:
            logger.info('urgent watch | %s needs %.1f mh, the whole %s %s '
                        'wallet is %s — cannot fit any day, not asking',
                        order.order_number, cost, target.date,
                        priced['berth'], ceiling)
            continue

        chain = make_room(plan, target, cost, priced['berth'],
                          priced['wallet_key'], dry_run=True)
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
             'expand': [{'key': f'day:{d.id}', 'action': 'apply',
                         'label_en': d.date.isoformat(),
                         'label_ar': d.date.isoformat()}
                        for d in days[1:]]},
        ]

        proposal = ask(KIND, texts, options, _tomorrow_morning(today),
                       details={'order_number': order.order_number,
                                'berth': priced['berth'],
                                'wallet_key': priced['wallet_key'],
                                'cost_man_hours': cost,
                                'hours': priced['hours'],
                                'crew': priced['crew'],
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

    priced = price_one(order)
    chain = make_room(day.work_plan, day, priced['cost_man_hours'],
                      priced['berth'], priced['wallet_key'], dry_run=False)
    job = place_one(order, day)
    db.session.flush()
    return {'chain': chain, 'job_id': job.id,
            'day': day.date.isoformat(),
            'cost_man_hours': priced['cost_man_hours']}
