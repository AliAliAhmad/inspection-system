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
from app.services.job_durations import MIN_CREW

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


def price_one(order):
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
    """
    from app.services.work_plan_generator_service import (
        _bundle_wallet_key, _member_is_ac_pm, _price_bundle)

    member, berth = _member_for(order)
    bundle = {'equipment_id': order.equipment_id, 'berth': berth,
              'score': 0, 'members': [member]}
    _price_bundle(bundle)

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


def place_one(order, day, crew_user_ids=None, priority=None):
    """Put one box order on one day, priced and staffed. Does NOT commit.

    Named men beat the rule: the crew that just finished early gets the work,
    not whoever the rule would have chosen. When nobody is named, the rule
    picks; when there are no rules at all, the job still lands with nobody on
    it — consistent with the rest of the system, which switches its hours
    checks off rather than refusing to work when rules are missing.
    """
    from app.services.work_plan_generator_service import _normalize_berth
    from app.models.pm_template import PMTemplate

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
        estimated_hours=priced['hours'],
        equipment_id=order.equipment_id,
        cycle_id=order.cycle_id,
        pm_template_id=template.id if template else None,
        sap_order_number=order.order_number,
        sap_order_type=order.order_type,
        description=order.description,
        maintenance_base=order.maintenance_base,
        overdue_value=order.overdue_value,
        overdue_unit=order.overdue_unit,
        planned_date=order.planned_date or order.required_date,
        position=len(day.jobs) + 1,
    )
    db.session.add(job)
    db.session.flush()

    if crew_user_ids:
        for user_id in crew_user_ids:
            db.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                              user_id=user_id))
    else:
        staff_one_job(job, day, crew_needed=priced['crew'])

    order.status = 'scheduled'
    order.work_plan_id = day.work_plan_id
    db.session.flush()

    logger.info('place_one | order=%s day=%s hours=%.1f crew=%d',
                order.order_number, day.date, priced['hours'], priced['crew'])
    return job
