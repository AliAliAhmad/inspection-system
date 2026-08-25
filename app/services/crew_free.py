"""The fast crew — and what is actually left of their day.

Nothing else in this system prices a day by `actual_hours`. Every wallet, the
generator and the domino use `estimated_hours`, which is exactly why a crew
that finishes a six-hour job in three releases nothing, anywhere.

The day wallet is deliberately NOT consulted here. A wallet is a planning
budget for a team; this question is about specific men standing in the yard at
eleven in the morning. Asking the wallet would answer a different question and
would say "nothing is free" on any day that was planned full — which is every
day this feature is for.
"""

import logging
from datetime import datetime, time, timedelta

from app.extensions import db
from app.models import WorkPlanDay, WorkPlanJob
from app.models.work_plan_assignment import WorkPlanAssignment
from app.models.work_plan_job_tracking import WorkPlanJobTracking
from app.services.job_durations import MAN_HOURS_PER_DAY, MIN_CREW
from app.services.place_one import place_one, price_one, useful_crew
from app.services.telegram.taps import register

logger = logging.getLogger(__name__)

# Statuses that mean "this job is finished with, for today".
DONE_STATUSES = ('completed', 'incomplete')


def _his_jobs_on(user_id, on_date):
    """Every job this man is on, on this date, with its tracking row.

    The same three-table join `/my-jobs` uses (work_plan_tracking.py:625);
    there is no reusable helper for it in the codebase.
    """
    return (db.session.query(WorkPlanJob, WorkPlanJobTracking)
            .join(WorkPlanAssignment,
                  WorkPlanAssignment.work_plan_job_id == WorkPlanJob.id)
            .join(WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id)
            .outerjoin(WorkPlanJobTracking,
                       WorkPlanJobTracking.work_plan_job_id == WorkPlanJob.id)
            .filter(WorkPlanAssignment.user_id == user_id,
                    WorkPlanDay.date == on_date)
            .all())


def hours_worked_today(user_id, on_date):
    """What this man's day has actually cost him so far.

    A finished job counts the hours it REALLY took. A job not yet finished
    counts its estimate — he is still committed to it, so those hours are not
    free to give away.
    """
    total = 0.0
    for job, tracking in _his_jobs_on(user_id, on_date):
        if (tracking is not None
                and tracking.status in DONE_STATUSES
                and tracking.actual_hours is not None):
            total += float(tracking.actual_hours)
        else:
            total += float(job.estimated_hours or 0)
    return total


def free_hours_for_crew(job):
    """{user_id: hours left} for the men on this job. Eight hours each, minus
    what the day has really cost them. Never negative."""
    day = job.day
    if day is None:
        return {}
    free = {}
    for assignment in job.assignments or []:
        worked = hours_worked_today(assignment.user_id, day.date)
        free[assignment.user_id] = max(0.0, MAN_HOURS_PER_DAY - worked)
    return free


def crew_is_done_for_today(job):
    """True when nobody on this job still has work waiting today.

    'incomplete' counts as done: the man has stopped, and the evening
    carry-over owns those hours now.
    """
    day = job.day
    if day is None:
        return False
    for assignment in job.assignments or []:
        for other, tracking in _his_jobs_on(assignment.user_id, day.date):
            if tracking is None or tracking.status not in DONE_STATUSES:
                return False
    return True


def _candidate_dict(order):
    """One box row in the shape `_step_score` expects.

    The same keys `_step_populate`'s SAP branch emits, including the
    `_resolve_overdue` call — that is what makes `overdue_value` comparable
    between a calendar PM (days) and a running-hours PM (hours past 250).

    NOTE: the real `_resolve_overdue` signature is
    `(job_type, maintenance_base, required_date, stored_value, stored_unit, today)`
    — six positional args, `required_date` third and `today` last. It also
    needs a real `today` (via `planning_today()`, never `date.today()`):
    passing `None` there raises inside the day-based branch the moment a
    non-performance PM has a `required_date`, which real box rows do.
    """
    from app.services.work_plan_generator_service import (_normalize_berth,
                                                          _resolve_overdue)
    from app.utils.decorators import planning_today
    equipment = order.equipment
    value, unit = _resolve_overdue(
        order.job_type, order.maintenance_base, order.required_date,
        order.overdue_value, order.overdue_unit, planning_today())
    return {
        'source': 'sap',
        'job_type': order.job_type,
        'equipment_id': order.equipment_id,
        'equipment_name': equipment.name if equipment else None,
        'equipment_type': equipment.equipment_type if equipment else None,
        'berth': _normalize_berth(order.berth or (equipment.berth if equipment else None)),
        'description': order.description,
        'estimated_hours': order.estimated_hours,
        'priority': order.priority,
        'overdue_value': value,
        'overdue_unit': unit,
        'maintenance_base': order.maintenance_base,
        'planned_date': order.planned_date,
        'sap_order_id': order.id,
        'sap_order_number': order.order_number,
        'sap_order_type': order.order_type,
        'cycle_id': order.cycle_id,
        'work_center': order.work_center,
    }


def candidates_for(plan, berth, free_man_hours, free_men, limit=3,
                   exclude_orders=(), free_clock_hours=()):
    """The best few jobs from the box that these men could actually start.

    Ordered by Ali's rule, 2026-08-25: **jobs that FIT come first** — finishing
    something beats starting something. Only when nothing fits are oversized
    jobs offered, each carrying `fits=False` so the message can say plainly
    that the rest will carry to tomorrow.

    A job must never need more men than are standing free: a four-man job is
    no use to two men with a whole afternoon, however many hours they have.

    Nor may it run longer than the SHORTEST of the men who would go.
    `free_clock_hours` is those men's remaining hours, most-free first, in the
    same order `ask_for_backfill` stores the crew — so the N who go are the N
    most-free, and the job must fit inside the Nth. Two men holding 8h and 1h
    are nine man-hours, and a tractor PM costs exactly nine, but the second man
    goes home after an hour and the job needs four and a half from both.

    `exclude_orders` keeps a job that is already sitting in somebody else's
    open question out of this one. Two crews finishing at the same moment must
    not both be offered the same machine — the second press would fail.

    Deliberately NO fence on splittable PMs. A 12-hour reach stacker may be
    started here like anything else; Ali declined the guard, knowing it leaves
    a ~7h remainder on tomorrow's plan.
    """
    from app.api.work_plans import pool_orders_query
    from app.services.work_plan_generator_service import (_normalize_berth,
                                                          _step_bundle,
                                                          _step_score,
                                                          bundle_man_hours)

    wanted = _normalize_berth(berth)
    rows = [order for order in pool_orders_query(plan.id).all()
            if _normalize_berth(order.berth
                                or (order.equipment.berth if order.equipment else None))
            in (wanted, 'both')]
    if not rows:
        return []

    by_number = {o.order_number: o for o in rows}
    bundles = _step_bundle(_step_score([_candidate_dict(o) for o in rows], plan))

    excluded = set(exclude_orders or ())
    fits, oversized = [], []
    for bundle in bundles:
        cost = bundle_man_hours(bundle)
        if cost <= 0:
            continue
        crew = max((m.get('crew') or MIN_CREW) for m in bundle['members'])
        if crew > free_men:
            continue                    # more men than are standing there
        first = bundle['members'][0]
        number = first.get('sap_order_number')
        if number in excluded:
            continue                    # already in somebody else's question
        # Price the BUTTON for the crew that would really go — the same
        # `useful_crew` the press will send. Costing it with the job's own
        # table crew instead made the message promise 4.5h x 2 = 9 man-hours
        # for a tractor that three free men would then charge 13.5 for, and
        # made the fits check a lie: offered because 9 fits, then costing 13.5.
        order_row = by_number.get(number)
        if order_row is not None:
            going = useful_crew(order_row, free_men)
            going_price = price_one(order_row, crew=going)
            hours = going_price['hours']
            crew = going_price['crew']
            cost = going_price['cost_man_hours']
        else:
            hours = float(first.get('estimated_hours') or 0)
        clock = list(free_clock_hours or ())
        # The Nth most-free man is the one who runs out first. With no clock
        # figures given, only the man-hour sum can be checked.
        shortest = clock[int(crew) - 1] if len(clock) >= int(crew) else None
        entry = {
            'order_number': number,
            'description': first.get('description') or '',
            'hours': hours,
            'crew': int(crew),
            'cost_man_hours': cost,
            'score': bundle.get('score', 0),
            'fits': (cost <= free_man_hours
                     and (shortest is None or hours <= shortest)),
            # Carried so the `over` label can name the man the job actually
            # fails on. Labelling it with the MOST-free man's hours produced
            # "needs 4.5h, they have 8.0h" on a job rejected because the second
            # man had one hour — a sentence that reads as nonsense.
            'shortest': shortest if shortest is not None else free_man_hours,
        }
        (fits if entry['fits'] else oversized).append(entry)
        if len(fits) >= limit:
            break

    # Finishing something beats starting something: an oversized job is a last
    # resort, never a filler alongside jobs that fit.
    return fits[:limit] if fits else oversized[:limit]


KIND = 'crew_is_free'

ASK_WORDS = {
    'en': {
        # CLOCK hours, never man-hours. Ali, 2026-08-25: two men who each have
        # five hours left hold ten man-hours of work — both true — but at
        # eleven in the morning "ten hours left" is a number nobody can work.
        # The arithmetic stays in man-hours; the message speaks in hours.
        'headline': '{names} finished {machine} early on {day}.',
        'left': '{clock} hours left today ({men} men).',
        # Men who work together usually have the same hours left, and then one
        # number is the whole truth. When they differ, neither end alone is:
        # the high number promises time the pair has not got, the low one
        # throws away a man's whole afternoon. Say both.
        'left_range': '{low} to {high} hours left today ({men} men).',
        'pick': 'Pick one, or say no thanks:',
        'option': '{description} — {hours}h, {crew} men',
        'over': '{description} — {hours}h, {crew} men (needs {hours}h, they '
                'have {shortest}h — the rest carries to tomorrow)',
        'nothing': '{names} finished {machine} early on {day}. {clock} hours '
                   'left today ({men} men). Nothing in the box fits.',
        'nothing_range': '{names} finished {machine} early on {day}. {low} to '
                         '{high} hours left today ({men} men). Nothing in the '
                         'box fits.',
        'no': 'No thanks',
        'swap': 'Swap crew',
    },
    'ar': {
        'headline': '{names} أنهوا {machine} مبكراً يوم {day}.',
        'left': 'بقي {clock} ساعات اليوم ({men} رجال).',
        'left_range': 'بقي من {low} إلى {high} ساعات اليوم ({men} رجال).',
        'pick': 'اختر واحدة، أو لا شكراً:',
        'option': '{description} — {hours} ساعة، {crew} رجال',
        'over': '{description} — {hours} ساعة، {crew} رجال (يحتاج {hours} ساعة '
                'ولديهم {shortest} — الباقي ينتقل إلى الغد)',
        'nothing': '{names} أنهوا {machine} مبكراً يوم {day}. بقي {clock} ساعات '
                   'اليوم ({men} رجال). لا يوجد في الصندوق ما يناسب.',
        'nothing_range': '{names} أنهوا {machine} مبكراً يوم {day}. بقي من {low} '
                         'إلى {high} ساعات اليوم ({men} رجال). لا يوجد في '
                         'الصندوق ما يناسب.',
        'no': 'لا شكراً',
        'swap': 'تبديل الفريق',
    },
}


def _at(language, key, **fields):
    table = ASK_WORDS.get(language, ASK_WORDS['en'])
    return table.get(key, ASK_WORDS['en'][key]).format(**fields)


def _already_asked_today(day, crew_user_ids):
    """One announcement per crew per day. Two men finishing two jobs in the
    same minute must not buzz eight phones twice."""
    from app.models import TelegramProposal
    # Includes the told-only rows the nothing-fits push leaves behind, which
    # are born 'expired' — a crew mentioned once today is not mentioned again.
    open_rows = TelegramProposal.query.filter(
        TelegramProposal.kind == KIND,
        TelegramProposal.target_day_id == day.id).all()
    wanted = set(crew_user_ids)
    return any(wanted & set((row.details or {}).get('crew_user_ids') or [])
               for row in open_rows)


def _other_teams(berth, crew_user_ids):
    """Teams on this berth that are NOT the crew who just finished."""
    from app.models.worker_assignment_rule import WorkerAssignmentRule
    from app.services.work_plan_generator_service import _normalize_berth

    wanted = _normalize_berth(berth)
    theirs = set(crew_user_ids)
    teams = []
    for rule in WorkerAssignmentRule.query.filter_by(is_active=True).all():
        if _normalize_berth(rule.berth) != wanted:
            continue
        members = set(rule.candidate_mech_workers or []) | set(
            rule.candidate_elec_workers or [])
        if members and not (members & theirs):
            teams.append(rule)
    return teams


def _orders_in_open_questions():
    """Order numbers already offered in a question nobody has answered yet.

    Two crews finishing in the same minute must not both be offered the same
    machine — the second press would find the order gone and fail. Ali chose
    safe over optimal here, knowing the cost: if the first crew's question is
    never answered, that job stays hidden from the second crew until the
    question dies at the end of the day.
    """
    from app.models import TelegramProposal
    spoken_for = set()
    for row in TelegramProposal.query.filter(
            TelegramProposal.kind == KIND,
            TelegramProposal.status == 'open').all():
        for candidate in (row.details or {}).get('candidates') or []:
            if candidate.get('order_number'):
                spoken_for.add(candidate['order_number'])
    return spoken_for


def _remember_told(day, crew_user_ids):
    """Record that this crew was mentioned today, even with nothing to offer.

    The nothing-fits push creates no question row, so without this a crew that
    finishes early every morning would be announced every morning.
    """
    from app.extensions import db as _db
    from app.models import TelegramProposal
    _db.session.add(TelegramProposal(
        kind=KIND, summary='crew free, nothing in the box fits',
        details={'crew_user_ids': crew_user_ids, 'candidates': [],
                 'told_only': True},
        options=[], status='expired',
        work_plan_id=day.work_plan_id, target_day_id=day.id,
        expires_at=datetime.combine(day.date + timedelta(days=1), time(0, 0))))
    _db.session.commit()


def ask_for_backfill(job, forced=False, client=None):
    """These men are free — ask the engineer what to give them.

    `forced=True` is the worker's own app button: he is telling us he is free,
    so the "has he anything left today" check is skipped. It is still only a
    REQUEST — the engineer decides, always.
    """
    from app.services.telegram.ask import ask
    from app.services.work_plan_generator_service import _normalize_berth

    day = job.day
    if day is None or day.work_plan is None:
        return None
    if not forced and not crew_is_done_for_today(job):
        return None

    free = free_hours_for_crew(job)

    # ONLY the men who still have hours, MOST-FREE FIRST — one list, used by
    # the offer AND by the press.
    #
    # This was two lists that disagreed: `free_men` (positive hours) priced the
    # offer, while `crew_user_ids = sorted(free)` — every man on the finished
    # job, by user id — was what the press sliced `[:going]` off. A three-man
    # crew with one man already eight hours deep was offered as two men and
    # sent as three, one of whom had nothing left to give.
    #
    # Most-free first also makes the clock check true by construction: the N
    # who go are the N with the most hours left.
    crew_user_ids = [user_id for user_id, hours
                     in sorted(free.items(), key=lambda kv: (-kv[1], kv[0]))
                     if hours > 0]
    free_clock_hours = [free[user_id] for user_id in crew_user_ids]
    free_man_hours = sum(free_clock_hours)
    if not crew_user_ids or free_man_hours <= 0:
        return None

    if _already_asked_today(day, crew_user_ids):
        return None

    berth = _normalize_berth(job.berth) or 'both'
    # The clock hours a human can act on. Man-hours stay the currency for
    # deciding what fits; the message speaks in hours (Ali, 2026-08-25).
    #
    # `free_clock_hours` is most-free first, so [0] is the longest day left and
    # [-1] the shortest. Crews that work together almost always match, and then
    # one number says everything. When they do not, neither end alone is
    # honest — the high number promises time the crew has not got, the low one
    # throws away a man's whole afternoon — so the sentence carries both.
    high, low = free_clock_hours[0], free_clock_hours[-1]
    clock = high
    even = high == low
    names = ', '.join(sorted(
        (a.user.full_name or a.user.email) for a in job.assignments or []
        if a.user is not None))
    machine = (job.equipment.name if job.equipment else job.description) or ''

    offered = candidates_for(day.work_plan, berth, free_man_hours,
                             len(crew_user_ids),
                             exclude_orders=_orders_in_open_questions(),
                             free_clock_hours=free_clock_hours)

    if not offered:
        # Ali: tell me anyway. Idle men are worth knowing about even when the
        # box has nothing for them — but there is nothing to decide, so this is
        # a plain push with no buttons and no question row to answer.
        from app.services.telegram.ask import recipients
        from app.services.telegram.client import TelegramClient
        teller = client or TelegramClient()
        for person, chat_id in recipients():
            language = getattr(person, 'language', None) or 'en'
            teller.send_message(chat_id, _at(
                language, 'nothing' if even else 'nothing_range',
                names=names, machine=machine, day=day.date.isoformat(),
                clock=clock, low=low, high=high, men=len(crew_user_ids)))
        _remember_told(day, crew_user_ids)
        return None

    texts, options = {}, []
    for language in ASK_WORDS:
        texts[language] = '\n'.join([
            _at(language, 'headline', names=names, machine=machine,
                day=day.date.isoformat()),
            (_at(language, 'left', clock=clock, men=len(crew_user_ids))
             if even else
             _at(language, 'left_range', low=low, high=high,
                 men=len(crew_user_ids))),
            _at(language, 'pick'),
        ])
    for candidate in offered:
        # An oversized job says so on its own button, so nobody presses one
        # without knowing the rest carries to tomorrow.
        word = 'option' if candidate.get('fits', True) else 'over'
        options.append({
            'key': f"order:{candidate['order_number']}",
            'action': 'apply',
            'label_en': _at('en', word, clock=clock, **candidate),
            'label_ar': _at('ar', word, clock=clock, **candidate),
        })
    options.append({'key': 'no', 'action': 'decline',
                    'label_en': ASK_WORDS['en']['no'],
                    'label_ar': ASK_WORDS['ar']['no']})

    # Ali: the same men by default, but the engineer can hand it to another
    # team. Expanding appends one button per (job, other team) pair — the
    # engineer picks the work and the crew in one press, because two presses
    # would need a second question and a second thing to expire.
    swap = []
    for candidate in offered:
        for rule in _other_teams(berth, crew_user_ids):
            # `team {rule.id}` was a database row id — a number nobody in the
            # yard has ever seen. Berth + team number is what the settings
            # screen and the men themselves call it.
            name = f'{rule.berth} team {rule.team_number}'
            swap.append({
                'key': f"order:{candidate['order_number']}:rule:{rule.id}",
                'action': 'apply',
                'label_en': f"{candidate['description']} — {name}",
                'label_ar': f"{candidate['description']} — {name}",
            })
    if swap:
        options.append({'key': 'swap', 'action': 'expand',
                        'label_en': ASK_WORDS['en']['swap'],
                        'label_ar': ASK_WORDS['ar']['swap'],
                        'expand': swap})

    # The buttons die with the day they are about, and are never re-asked.
    expires_at = datetime.combine(day.date + timedelta(days=1), time(0, 0))

    return ask(KIND, texts, options, expires_at,
               details={'job_id': job.id,
                        'berth': berth,
                        'crew_user_ids': crew_user_ids,
                        'free_man_hours': free_man_hours,
                        # NOT `free_clock_hours` — `candidates_for`'s parameter
                        # of that name is the per-man LIST, and two different
                        # shapes under one name is how the next reader gets it
                        # wrong.
                        'crew_clock_hours': clock,
                        'clock_hours_by_man': free_clock_hours,
                        'free_men': len(crew_user_ids),
                        'candidates': offered},
               work_plan_id=day.work_plan_id, target_day_id=day.id,
               client=client)


@register(KIND)
def apply_crew_free(proposal, option, user):
    """The engineer picked a job. Give it to the men who are standing free.

    No domino here: these hours were never in the day's planned budget in the
    first place — they exist because the men beat the estimate. Nothing needs
    to move aside.

    THE TRANSACTION CONTRACT (see `apply_urgent` in `urgent_watch.py`): this
    function NEVER commits. It flushes, and `handle_callback` commits once,
    covering this work and the proposal's result row together.
    """
    from app.models import SAPWorkOrder

    details = proposal.details or {}
    # Two shapes: 'order:<number>' (the same men) and
    # 'order:<number>:rule:<id>' (Swap crew — another team on this berth).
    key = option.get('key') or ''
    if not key.startswith('order:'):
        raise ValueError(f'not a job button: {key}')
    parts = key.split(':')
    order_number = parts[1]
    swapped_rule_id = (int(parts[3])
                       if len(parts) == 4 and parts[2] == 'rule' else None)

    order = SAPWorkOrder.query.filter_by(order_number=order_number).first()
    if order is None or order.status != 'pending':
        raise ValueError(f'order {order_number} is no longer in the box')

    day = db.session.get(WorkPlanDay, proposal.target_day_id)
    if day is None:
        raise ValueError('that day is gone')

    crew_user_ids = details.get('crew_user_ids') or []

    # SEND ONLY AS MANY MEN AS THE JOB NEEDS, and price for exactly those.
    #
    # `candidates_for` costed every button with the job's OWN crew — Ali's
    # table figure — so the message promised, say, 4.5h x 2 = 9 man-hours.
    # Handing the whole free crew to it instead put THREE men on a two-man
    # tractor and charged the day 13.5. Measured: promised 9.0, real 13.5.
    # It also made the fit check a lie: a job is offered because 9 fits inside
    # the hours they have, then costs 13.5.
    #
    # Sending the job's own crew fixes both at once and wastes nobody: the
    # third man stays free for the next offer. `price_one(order)` with no
    # override gives exactly the figure the button showed.
    if swapped_rule_id is not None:
        # Another team was chosen. The rule ID must be CARRIED, not merely
        # noted: `place_one(crew_user_ids=None)` used to fall through to
        # `staff_one_job`, which re-ran its own match and took whichever team
        # it found first — so with two teams on a berth the engineer pressed
        # team 2 and team 1 got the work. `place_one` raises if the named team
        # can field nobody, rather than landing a job with nobody on it.
        from app.models.worker_assignment_rule import WorkerAssignmentRule
        swapped_rule = db.session.get(WorkerAssignmentRule, swapped_rule_id)
        if swapped_rule is None or not swapped_rule.is_active:
            raise ValueError(f'team {swapped_rule_id} is gone')
        crew_user_ids = None
        priced = price_one(order)
    else:
        swapped_rule = None
        # `useful_crew` — the FEWEST men who finish this job soonest. Three
        # men on a reach stacker turn 12 hours into 8 and are worth sending;
        # the fourth turns 8 into 8 and is not; a third man on a tractor saves
        # no time and costs the day another 4.5 man-hours for nothing. The
        # OFFER priced the button with this same number AND the same argument,
        # so the promise and the day's charge are the same figure by
        # construction.
        going = useful_crew(order, len(crew_user_ids))
        crew_user_ids = crew_user_ids[:going]
        priced = price_one(order, crew=going)

    job = place_one(order, day, crew_user_ids=crew_user_ids, priced=priced,
                    rule=swapped_rule)
    if swapped_rule_id is not None:
        crew_user_ids = [a.user_id for a in job.assignments]
    # NEVER commit here — handle_callback owns the single commit.
    db.session.flush()
    return {'job_id': job.id, 'order_number': order_number,
            'crew_user_ids': crew_user_ids}
