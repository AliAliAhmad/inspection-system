"""Put ONE job on ONE day: price it, create it, staff it, empty its box row.

Nothing in this codebase could do this. The generator bakes a whole week in one
pass and refuses anything but a draft plan. `schedule_sap_order`
(app/api/work_plans.py:934) places one order but diverges from the generator in
four ways — it does not re-price from Ali's hours table, does not normalise the
berth, does no capacity check, and staffs nobody.

THE PRICE TAG, stated once. A job costs its day `estimated_hours x crew`, and
this codebase holds two different ideas of `crew`: the generator's priced figure
from Ali's table, and day_ripple's `max(MIN_CREW, len(job.assignments))`. For a
4-man urgent reach stacker those differ by DOUBLE. This function assigns the men
BEFORE anybody measures the day, so the two agree by construction. The same
disagreement, in its other home, was the carry-over bug of 2026-08-25.
"""

import logging
from collections import defaultdict

from app.extensions import db
from app.models import SAPWorkOrder, WorkPlanJob  # noqa: F401
from app.models.work_plan_assignment import WorkPlanAssignment
from app.models.worker_assignment_rule import WorkerAssignmentRule
from app.models.user import User
from app.services.day_budget import _unavailable_by_date
from app.services.job_durations import (MAN_HOURS_PER_DAY, MIN_CREW,
                                        pm_hours, urgent_max_crew)

logger = logging.getLogger(__name__)


def _member_for(order):
    equipment = order.equipment
    from app.services.work_plan_generator_service import _normalize_berth
    berth = _normalize_berth(order.berth or (equipment.berth if equipment else None))
    return {
        'source': 'sap',
        'job_type': order.job_type,
        'sap_order_type': order.order_type,
        'sap_order_number': order.order_number,
        'equipment_id': order.equipment_id,
        'equipment_type': equipment.equipment_type if equipment else None,
        'description': order.description,
        'berth': berth,
        'estimated_hours': order.estimated_hours,
        'priority': order.priority,
        'cycle_id': order.cycle_id,
        'maintenance_base': order.maintenance_base,
    }, berth


def rule_crew_for(order):
    """How many men a rule will actually send for this order, or None.

    This is the number that matters, because `_assign_from_rule` fills a job to
    `rule.mech_count + rule.elec_count` and `day_ripple.job_cost_man_hours`
    later prices the job by `max(MIN_CREW, len(job.assignments))`. Ali's hours
    table has a crew figure too, but it is currently 2 for every family, so
    pricing from it while staffing from the rule lets a rule configured with
    (mech 2, elec 1) cost the day 3x hours against a promise of 2x. Nobody has
    to write code to create that divergence — it is one settings row.
    """
    from app.services.work_plan_generator_service import (_determine_team_type,
                                                          _get_category,
                                                          _normalize_berth)
    equipment = order.equipment
    berth = _normalize_berth(order.berth or (equipment.berth if equipment else None)) or 'both'

    class _Shim:
        """_determine_team_type reads .job_type and .description off a job.

        For defect-team job types it also runs `_job_is_defect_work`, which
        reads .sap_order_number, and then checks .defect (a SAPWorkOrder has
        no linked Defect row of its own — that relationship belongs to the
        inspection-raised-defect flow — so this is always None, same as it
        would read on a freshly-built WorkPlanJob that has no defect_id yet).
        """
        job_type = order.job_type
        description = order.description
        equipment_id = order.equipment_id
        sap_order_number = order.order_number
        defect = None

    team_type = _determine_team_type(_Shim())
    category = (_get_category(equipment.equipment_type)
                if equipment and equipment.equipment_type else 'all')

    rules = WorkerAssignmentRule.query.filter_by(is_active=True).all()

    def matches(rule, wanted):
        return (rule.berth == berth and rule.team_type == team_type
                and rule.equipment_category == wanted)

    found = ([r for r in rules if matches(r, category)]
             or [r for r in rules if matches(r, 'all')])
    if not found:
        return None
    rule = found[0]
    return max(MIN_CREW, (rule.mech_count or 0) + (rule.elec_count or 0))


def matching_rule(order):
    """The WorkerAssignmentRule that will staff this order, or None.

    Extracted so `rule_crew_for`, `available_men` and `staff_one_job` all ask
    the same question the same way — three copies of a lookup drift, and the
    first thing to drift here would be which team a machine belongs to.
    """
    from app.services.work_plan_generator_service import (_determine_team_type,
                                                          _get_category,
                                                          _normalize_berth)
    equipment = order.equipment
    berth = _normalize_berth(
        order.berth or (equipment.berth if equipment else None)) or 'both'

    class _Shim:
        """What _determine_team_type and _job_is_defect_work actually read."""
        job_type = order.job_type
        description = order.description
        sap_order_number = order.order_number
        defect = None

    team_type = _determine_team_type(_Shim())
    category = (_get_category(equipment.equipment_type)
                if equipment and equipment.equipment_type else 'all')

    rules = WorkerAssignmentRule.query.filter_by(is_active=True).all()

    def matches(rule, wanted):
        return (rule.berth == berth and rule.team_type == team_type
                and rule.equipment_category == wanted)

    found = ([r for r in rules if matches(r, category)]
             or [r for r in rules if matches(r, 'all')])
    return found[0] if found else None


def _free_by_discipline(order, day):
    """(free mechanics, free electricians) for this order's team on this day.

    Free means: in the rule's candidate list or one of its two leads for that
    discipline, active, not on leave, and not off/leave/NIGHT on the roster.
    Night counts as away because `day_budget` gives a night man zero wallet
    hours — staffing him onto day work would spend hours the day never had.
    """
    rule = matching_rule(order)
    if rule is None:
        return (0, 0)

    plan = day.work_plan
    gone = _unavailable_by_date(plan.week_start, plan.week_end).get(day.date, set())

    def free(ids):
        ids = {i for i in ids if i}
        if not ids:
            return 0
        here = User.query.filter(
            User.id.in_(ids),
            User.is_active.is_(True),
            User.is_on_leave.is_(False)).all()
        return len([u for u in here if u.id not in gone])

    mech = free(set(rule.candidate_mech_workers or []) |
                {rule.primary_mech_lead_id, rule.successor_mech_lead_id})
    elec = free(set(rule.candidate_elec_workers or []) |
                {rule.primary_elec_lead_id, rule.successor_elec_lead_id})
    return (mech, elec)


def can_field(order, day, size):
    """Can this order's team really put `size` men on this machine, this day?

    NOT "are `size` people free". `_assign_from_rule` fills a job to
    `rule.mech_count` mechanics and `rule.elec_count` electricians, and
    `crew_needed` raises **the mech target only** — and it raises it by
    `size - (mech_count + elec_count)`, subtracting the electricians the rule
    WISHES for, not the ones that exist. So when free electricians fall short
    of `elec_count`, nothing makes up the difference and the job lands smaller
    than promised:

        elec_count=2, 0 electricians free, 10 mechanics free, ask for 4
        -> mech target stays 2, elec fills 0 -> TWO men on an 8-hour reach
           stacker, and Ali's curve says two men need twelve.

    Ten free mechanics and it still lands two. That is why this is a per-size
    question and not a headcount.
    """
    rule = matching_rule(order)
    if rule is None:
        return False
    mech_free, elec_free = _free_by_discipline(order, day)
    elec_want = rule.elec_count or 0
    mech_target = max(rule.mech_count or 0, size - elec_want)
    return min(mech_free, mech_target) + min(elec_free, elec_want) >= size


def available_men(order, day):
    """The biggest crew this order's team can really field on this day."""
    mech_free, elec_free = _free_by_discipline(order, day)
    for size in range(mech_free + elec_free, 0, -1):
        if can_field(order, day, size):
            return size
    return 0


def urgent_one_day_crew(order, day):
    """(crew, hours) for finishing this urgent PM in ONE day, or None.

    Ali, 2026-08-25: "always he should offer and plan an urgent reach stacker
    — if it is possible to put 4 or 3 so the time be 8; if 3 or 4 not
    available, put 2 and make the time 12."

    So: try the biggest crew his curve allows for this family, down to three,
    and take the first one that both finishes inside a day AND has the men
    standing free. None means there is no one-day answer and the caller must
    split it 8 + 4 across two days.

    Only ever a boost for the families Ali named — "if TT or FL, TR is urgent
    always keep 2. RS AND ECHs put maximum up to 4." A truck fits a day at two
    men anyway; more men would only take them off other machines.
    """
    from app.services.work_plan_generator_service import _get_category

    if order.job_type != 'pm':
        return None
    equipment = order.equipment
    family = _get_category(equipment.equipment_type) if (
        equipment and equipment.equipment_type) else ''
    biggest = urgent_max_crew(family)
    if biggest <= MIN_CREW:
        return None                      # not a family Ali boosts

    for size in range(biggest, MIN_CREW, -1):
        if not can_field(order, day, size):
            continue
        crew_n, hours_n = pm_hours(family, crew=size,
                                   description=order.description)
        if crew_n > MIN_CREW and hours_n <= MAN_HOURS_PER_DAY:
            return (crew_n, hours_n)
    return None


def price_one(order, crew=None):
    """What this order costs a day, using the generator's own arithmetic.

    A one-member bundle through `_price_bundle`, so the hours come from Ali's
    table and NOT from `SAPWorkOrder.estimated_hours`, which is an import
    default of 4.0 for almost every row.

    A lone fault is priced from the "alone" column, which is correct: an order
    going in by itself is not riding along with a PM.

    The crew, however, is NOT taken from Ali's table when a WorkerAssignmentRule
    matches — the rule's headcount is what `_assign_from_rule` will actually
    send and what `day_ripple.job_cost_man_hours` will later read off the
    created job's assignments, so pricing must agree with the rule, not the
    table (see `rule_crew_for`). The table crew is the fallback when no rule
    matches. AC work still costs the day nothing, matching
    `bundle_man_hours`'s exclusion of AC-PM members: its wallet is None.

    Pass `crew` to price the order for a SPECIFIC number of men — that is how
    an urgent reach stacker is offered at 3 or 4 men and 8 hours instead of 2
    men and 12 (`urgent_one_day_crew`). An explicit crew beats both the rule
    and the table, because the caller is about to staff exactly that many.
    """
    from app.services.work_plan_generator_service import (
        _bundle_wallet_key, _get_category, _member_is_ac_pm, _price_bundle)

    member, berth = _member_for(order)
    bundle = {'equipment_id': order.equipment_id, 'berth': berth,
              'score': 0, 'members': [member]}
    _price_bundle(bundle)

    if crew is not None:
        # An explicit crew: re-read the hours from Ali's curve for THAT crew.
        # PM_CREW_CURVE is measurements, not a formula — three men on a reach
        # stacker buy four hours and the fourth buys nothing.
        family = _get_category(order.equipment.equipment_type) if (
            order.equipment and order.equipment.equipment_type) else ''
        crew_n, hours_n = pm_hours(family, crew=crew,
                                   description=order.description)
        member['crew'] = crew_n
        member['estimated_hours'] = hours_n
        crew = crew_n
    else:
        crew = int(member.get('crew') or MIN_CREW)
        from_rule = rule_crew_for(order)
        if from_rule is not None:
            crew = from_rule

    hours = float(member.get('estimated_hours') or 0)
    cost = 0.0 if _member_is_ac_pm(member) else hours * crew

    return {
        'hours': hours,
        'crew': crew,
        'cost_man_hours': cost,
        'berth': berth,
        'wallet_key': _bundle_wallet_key(bundle),
    }


def staff_one_job(job, day, crew_needed=None):
    """Pick men for one job using the generator's own rule logic.

    `_assign_from_rule` cannot be called on its own — it needs four context
    structures that only `_step_assign` builds. This rebuilds them for a single
    day, which is cheap, and returns the user ids assigned.

    Night shift: a man on nights is treated as UNAVAILABLE here, following
    `day_budget._unavailable_by_date`. The generator's own assigner disagrees
    (it only excludes 'off' and 'leave'), and that inconsistency is real and
    recorded in the spec — but a wallet that gives a night man no hours must not
    then have him staffed onto day work.
    """
    from app.services.work_plan_generator_service import (
        _assign_from_rule, _determine_team_type, _get_category, _normalize_berth)

    workers_by_id = {u.id: u for u in User.query.filter(
        User.is_active.is_(True), User.is_on_leave.is_(False)).all()}
    if not workers_by_id:
        return []

    rules = WorkerAssignmentRule.query.filter_by(is_active=True).all()
    if not rules:
        return []

    berth = _normalize_berth(job.berth) or 'both'
    team_type = _determine_team_type(job)
    equipment = job.equipment
    category = (_get_category(equipment.equipment_type)
                if equipment and equipment.equipment_type else 'all')

    def matches(rule, wanted_category):
        return (rule.berth == berth and rule.team_type == team_type
                and rule.equipment_category == wanted_category)

    candidates = ([r for r in rules if matches(r, category)]
                  or [r for r in rules if matches(r, 'all')])
    if not candidates:
        return []

    plan = day.work_plan
    unavailable = _unavailable_by_date(plan.week_start, plan.week_end)
    day_unavailable = set(unavailable.get(day.date, set()))

    # _assign_from_rule mutates these with `+=` on keys it hasn't seen yet
    # (mirroring _step_assign's own `defaultdict(lambda: defaultdict(int))` /
    # `defaultdict(int)`) — plain dicts raise KeyError the moment it fills a
    # candidate pool member who has no prior load this week.
    daily_load = defaultdict(lambda: defaultdict(int))
    weekly_load = defaultdict(int)
    for plan_day in plan.days:
        for other in plan_day.jobs:
            for assignment in other.assignments or []:
                weekly_load[assignment.user_id] += 1
                if plan_day.id == day.id:
                    daily_load[day.id][assignment.user_id] += 1

    picked = _assign_from_rule(job, candidates[0], workers_by_id, daily_load,
                               weekly_load, day.id,
                               day_unavailable=day_unavailable,
                               crew_needed=crew_needed)
    return [user_id for user_id, _is_lead in picked]


def place_one(order, day, crew_user_ids=None, priority=None,
              priced=None, hours=None, description=None,
              release_order=True):
    """Put one box order on one day, priced and staffed. Does NOT commit.

    Named men beat the rule: the crew that just finished early gets the work,
    not whoever the rule would have chosen. When nobody is named, the rule
    picks; when there are no rules at all, the job still lands with nobody on
    it — consistent with the rest of the system, which switches its hours
    checks off rather than refusing to work when rules are missing.

    `priced` lets a caller hand in a price it already computed — an urgent
    reach stacker offered at 3 men and 8 hours was priced with an explicit
    crew, and re-pricing here would silently drop back to 2 men and 12.
    `hours` and `description` override just those two for one half of a split
    PM. `release_order=False` leaves the box row alone, so the second half of a
    split does not try to schedule an order the first half already took.
    """
    from app.services.work_plan_generator_service import _normalize_berth
    from app.models.pm_template import PMTemplate

    if priced is None:
        priced = price_one(order)
    equipment = order.equipment
    template = None
    if equipment is not None:
        template = PMTemplate.find_for_job(equipment.equipment_type,
                                           order.cycle_id)

    job = WorkPlanJob(
        work_plan_day_id=day.id,
        job_type=order.job_type,
        berth=_normalize_berth(order.berth or (equipment.berth if equipment else None)),
        priority=priority or order.priority or 'normal',
        estimated_hours=hours if hours is not None else priced['hours'],
        equipment_id=order.equipment_id,
        cycle_id=order.cycle_id,
        pm_template_id=template.id if template else None,
        sap_order_number=order.order_number,
        sap_order_type=order.order_type,
        description=description or order.description,
        maintenance_base=order.maintenance_base,
        overdue_value=order.overdue_value,
        overdue_unit=order.overdue_unit,
        planned_date=order.planned_date or order.required_date,
        position=len(day.jobs) + 1,
    )
    db.session.add(job)
    db.session.flush()

    if crew_user_ids:
        for entry in crew_user_ids:
            # Accept plain ids or (id, is_lead) pairs — the second half of a
            # split needs to carry the lead across.
            user_id, is_lead = entry if isinstance(entry, tuple) else (entry, False)
            db.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                              user_id=user_id,
                                              is_lead=is_lead))
    else:
        staff_one_job(job, day, crew_needed=priced['crew'])

    if release_order:
        order.status = 'scheduled'
        order.work_plan_id = day.work_plan_id
    db.session.flush()

    logger.info('place_one | order=%s day=%s hours=%.1f crew=%d',
                order.order_number, day.date,
                float(job.estimated_hours or 0), priced['crew'])
    return job


def place_split(order, day1, day2, priced=None):
    """A PM too long for one day: 8 hours today, the rest tomorrow.

    Ali, 2026-08-25: "if 3 or 4 not available, put 2 and make the time 12" —
    and twelve hours cannot be one day, so it runs 8 then 4 on consecutive
    days. The same shape the weekly planner already produces (_place_big_pm),
    which matters beyond tidiness: the evening carry-over MERGES a carried
    part 1/2 into an untouched part 2/2 by matching the order number, so a
    split made here is understood by machinery that already exists.

    Both halves get the SAME men — one crew, one machine, two days. The box row
    is released once, by the first half. Does NOT commit.
    """
    if priced is None:
        priced = price_one(order)

    first = float(MAN_HOURS_PER_DAY)
    rest = round(float(priced['hours']) - first, 2)
    if rest <= 0:
        raise ValueError(
            f"{order.order_number} is {priced['hours']}h — it fits one day, "
            f'nothing to split')

    base = (order.description or '').strip()
    part1 = place_one(order, day1, priced=priced, hours=first,
                      description=f'{base} (part 1/2)'.strip())
    # Same men AND the same lead: a crew arriving on the second morning with
    # nobody in charge is not the same crew.
    crew = [(a.user_id, bool(a.is_lead)) for a in part1.assignments]
    part2 = place_one(order, day2, priced=priced, hours=rest,
                      description=f'{base} (part 2/2)'.strip(),
                      crew_user_ids=crew or None, release_order=False)

    logger.info('place_split | order=%s %s=%.1fh + %s=%.1fh crew=%d',
                order.order_number, day1.date, first, day2.date, rest,
                len(crew))
    return part1, part2
