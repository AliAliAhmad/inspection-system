"""
Work Plan Generator Service — Auto-planning pipeline.

5-step pipeline: POPULATE → SCORE → BUNDLE → DISTRIBUTE → ASSIGN
Generates a complete weekly work plan from SAP orders, open defects,
carry-overs, and pending inspection assignments.

Usage:
    result = WorkPlanGeneratorService.generate_plan(plan_id, recipe='priority_first')
    score  = WorkPlanGeneratorService.score_plan(plan_id)
    candidates = WorkPlanGeneratorService.get_candidates(plan_id)
    WorkPlanGeneratorService.reject_generation(plan_id)
"""

import logging
from collections import defaultdict
from datetime import date, datetime, timedelta
from statistics import stdev
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models.defect import Defect
from app.models.equipment import Equipment
from app.models.inspection import Inspection
from app.services.job_durations import (MAN_HOURS_PER_DAY, MIN_CREW,
                                        hours_for, pm_hours, urgent_max_crew)
from app.services.day_budget import build_week_wallets
from app.models.inspection_assignment import InspectionAssignment
from app.models.inspection_list import InspectionList
from app.models.pm_template import PMTemplate
from app.models.sap_work_order import SAPWorkOrder
from app.models.user import User
from app.models.work_plan import WorkPlan
from app.models.work_plan_assignment import WorkPlanAssignment
from app.models.work_plan_carry_over import WorkPlanCarryOver
from app.models.work_plan_day import WorkPlanDay
from app.models.work_plan_job import WorkPlanJob
from app.models.work_plan_job_tracking import WorkPlanJobTracking
from app.exceptions.api_exceptions import (
    BusinessError, NotFoundError, ValidationError,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Recipe presets
# ---------------------------------------------------------------------------

RECIPES = {
    'priority_first': {
        'description': 'Schedule highest priority jobs first',
        'description_ar': 'جدولة المهام ذات الأولوية القصوى أولاً',
    },
    'travel_optimized': {
        'description': 'Group by berth/location per day',
        'description_ar': 'تجميع حسب الرصيف/الموقع لكل يوم',
    },
    'team_balanced': {
        'description': 'Distribute evenly across workers',
        'description_ar': 'توزيع متساوٍ على العمال',
    },
    'pm_compliance': {
        'description': 'Prioritize overdue PMs',
        'description_ar': 'إعطاء الأولوية للصيانة الوقائية المتأخرة',
    },
    'copy_last_week': {
        'description': "Clone last week's structure",
        'description_ar': 'نسخ هيكل الأسبوع الماضي',
    },
    'combined': {
        'description': 'Manual 3-step: PMs → urgent defects → normal defects',
        'description_ar': 'يدوي 3 خطوات: الصيانة الوقائية ← الأعطال العاجلة ← الأعطال العادية',
    },
}

# Severity → base score mapping for inspection-sourced defects
_DEFECT_SEVERITY_SCORE = {
    'critical': 95,
    'high': 75,
    'medium': 50,
    'low': 25,
}

# SAP priority → base score mapping
_SAP_PRIORITY_SCORE = {
    'urgent': 90,
    'high': 70,
    'normal': 40,
    'low': 20,
}

# Priority string → WorkPlanJob priority mapping
_SCORE_TO_PRIORITY = [
    (80, 'urgent'),
    (60, 'high'),
    (30, 'normal'),
    (0, 'low'),
]

# ── What belongs to the defect team ────────────────────────────────────────
#
# Ali, 2026-08-24: "there is two things — PRM, or a defect. First the generator
# should do the PM: he puts the PM, and any order or any defect related to the
# machine that has the PM, with it — even if it is COM, ACD, inspection or
# damage, and only the preventive maintenance guy does it. And then after this
# he does the defects ... the defect team, which are the inspectors and the
# specialists."
#
# So PRM is the only anchor, and every other letter is defect-team work.
#
# Before this, only job_type 'defect' (COM) was recognised as such. 'corrective'
# (DAM, ACD) and 'inspection' (INS) were counted against NO capacity bucket at
# all — a machine whose only open work was one of those formed a bundle that
# passed every check and could be placed on any day, any number of times. It was
# the only work in the system with no ceiling.
#
# App-raised inspections are deliberately excluded: they carry no order number,
# they belong to the inspector's own assignment flow, and they are not the
# planner's to schedule. Same discriminator the Telegram renderer uses.
DEFECT_TEAM_JOB_TYPES = ('defect', 'corrective')


def _is_defect_team_work(job_type: Optional[str], sap_order_number=None) -> bool:
    if job_type in DEFECT_TEAM_JOB_TYPES:
        return True
    return job_type == 'inspection' and bool(sap_order_number)


def _member_is_defect_work(member: Dict[str, Any]) -> bool:
    return _is_defect_team_work(member.get('job_type'), member.get('sap_order_number'))


def _bundle_has_defect_work(bundle: Dict[str, Any]) -> bool:
    return any(_member_is_defect_work(m) for m in bundle.get('members', []))


def _job_is_defect_work(job) -> bool:
    return _is_defect_team_work(job.job_type, getattr(job, 'sap_order_number', None))


def _is_high_urgency(candidate: Dict[str, Any]) -> bool:
    """Splits step 2 from step 3 of the Combined recipe.

    Inspection-raised defects carry `severity`; SAP orders carry `priority` and
    no severity at all. Filtering on severity alone therefore dropped every SAP
    fault out of both steps, so a SAP COM could only ever reach a day by riding
    along with a PM.
    """
    severity = (candidate.get('severity') or '').lower()
    if severity:
        return severity in ('critical', 'high')
    return (candidate.get('priority') or '').lower() in ('urgent', 'critical', 'high')


_CARRY_OVER_BOOST = 15
_MAX_OVERDUE_BONUS = 20

# Performance PM (running-hours) urgency window:
# start awarding priority _PERF_LEAD_HOURS before the cycle trigger, and reach
# the max overdue bonus _PERF_FULL_HOURS of "effective overdue" later — i.e. the
# bonus maxes out ~1 day past the trigger (fast ramp).
_PERF_LEAD_HOURS = 24.0
_PERF_FULL_HOURS = 48.0


def _score_to_priority(score: float) -> str:
    """Convert a numeric score to a priority label."""
    for threshold, label in _SCORE_TO_PRIORITY:
        if score >= threshold:
            return label
    return 'low'


def _has_column(model, column_name: str) -> bool:
    """Check if an ORM model has a given column (migration-safe)."""
    return column_name in model.__table__.columns


# ---------------------------------------------------------------------------
# Main service
# ---------------------------------------------------------------------------

class WorkPlanGeneratorService:
    """Auto-planning pipeline for weekly work plans."""

    # ======================================================================
    # PUBLIC API
    # ======================================================================

    @staticmethod
    def generate_plan(
        plan_id: int,
        recipe: str = 'priority_first',
        clear_existing: bool = False,
        step: Optional[int] = None,
        additive: bool = False,
    ) -> Dict[str, Any]:
        """
        Main entry point.  Runs the 5-step pipeline and commits.

        Args:
            plan_id: ID of the WorkPlan (must be in 'draft' status).
            recipe: Distribution recipe key from RECIPES.
            clear_existing: If True, remove *all* existing jobs first.
                            If False (default), only remove AI-generated jobs
                            (ai_confidence IS NOT NULL).
            step: Sub-step (1, 2, or 3) — REQUIRED when recipe='combined'.
                  Step 1 = PMs + their defects.
                  Step 2 = critical/high defects on equipment without PM.
                  Step 3 = medium/low defects on equipment without PM.
            additive: If True, do NOT clear previous AI jobs at the start.
                      Used for combined steps 2 and 3 to add to existing plan.

        Returns:
            Generation result dict with summary, score, and jobs_by_day.

        Raises:
            NotFoundError: Plan does not exist.
            BusinessError: Plan is not in draft status.
            ValidationError: Unknown recipe, or combined recipe missing step.
        """
        if recipe not in RECIPES:
            raise ValidationError(
                f"Unknown recipe '{recipe}'. Valid: {', '.join(RECIPES.keys())}",
                field='recipe',
            )

        if recipe == 'combined' and step not in (1, 2, 3):
            raise ValidationError(
                "Combined recipe requires 'step' to be 1, 2, or 3.",
                field='step',
            )

        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            raise NotFoundError('Work Plan')

        if plan.status != 'draft':
            raise BusinessError(
                'Cannot generate plan — status must be draft. '
                f'Current status: {plan.status}'
            )

        logger.info(
            "generate_plan START | plan_id=%s recipe=%s clear=%s step=%s additive=%s",
            plan_id, recipe, clear_existing, step, additive,
        )

        # -- Ensure 7 WorkPlanDay rows exist ----------------------------------
        _ensure_plan_days(plan)

        # -- Housekeeping: clear previous generation --------------------------
        # Skip clearing in additive mode so previous step's jobs survive.
        if not additive:
            _clear_generated_jobs(plan, clear_all=clear_existing)

        # -- Pipeline ---------------------------------------------------------
        candidates = _step_populate(plan)

        # Combined recipe filters candidates per step.
        if recipe == 'combined':
            candidates = _filter_candidates_for_combined_step(candidates, plan, step)

        scored = _step_score(candidates, plan)
        bundles = _step_bundle(scored)
        day_map, unscheduled, capacity_utilization = _step_distribute(plan, bundles, recipe)
        assignment_stats = _step_assign(plan, day_map)

        db.session.commit()
        logger.info(
            "generate_plan DONE | plan_id=%s candidates=%d scheduled=%d unscheduled=%d",
            plan_id, len(candidates), sum(len(j) for j in day_map.values()), len(unscheduled),
        )

        # -- Compute score on the completed plan ------------------------------
        score = WorkPlanGeneratorService.score_plan(plan_id)

        # Build unscheduled breakdown by reason
        unscheduled_count = len(unscheduled)
        unscheduled_by_source: Dict[str, int] = defaultdict(int)
        for c in unscheduled:
            unscheduled_by_source[c.get('source', 'unknown')] += 1

        # Build summary
        scheduled_count = sum(len(jobs) for jobs in day_map.values())
        bundles_scheduled = sum(1 for b in bundles if b['members'] and b['members'][0] not in unscheduled)
        jobs_by_day = {}
        for day in plan.days:
            jobs_by_day[day.date.isoformat()] = len(day.jobs)

        return {
            'status': 'success',
            'summary': {
                'total_candidates': len(candidates),
                'total_bundles': len(bundles),
                'scheduled': scheduled_count,
                'bundles_created': len(bundles),
                'unscheduled': unscheduled_count,
                'unscheduled_by_source': dict(unscheduled_by_source),
                'recipe': recipe,
                'workers_assigned': assignment_stats.get('workers_assigned', 0),
                'jobs_without_worker': assignment_stats.get('jobs_without_worker', 0),
                'message': _build_summary_message(
                    len(candidates), scheduled_count, unscheduled_count, len(bundles)
                ),
            },
            'score': score,
            'jobs_by_day': jobs_by_day,
            'capacity_utilization': capacity_utilization,
        }

    # ------------------------------------------------------------------

    @staticmethod
    def score_plan(plan_id: int) -> Dict[str, Any]:
        """
        Score an existing plan on 5 dimensions (0-100 each).

        Dimensions (weighted):
            pm_coverage      (25%) — % of overdue PMs from pool that got scheduled
            priority_coverage (20%) — % of urgent/high jobs included
            berth_balance    (20%) — how evenly jobs are split between East and West berths
            team_balance     (20%) — inverse of std-dev of jobs per worker
            capacity_fit     (15%) — how evenly jobs spread across days

        Returns:
            Dict with 'overall' and per-dimension scores.
        """
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            raise NotFoundError('Work Plan')

        # Collect all scheduled jobs
        all_jobs: List[WorkPlanJob] = []
        day_job_counts: List[int] = []
        for day in plan.days:
            all_jobs.extend(day.jobs)
            day_job_counts.append(len(day.jobs))

        if not all_jobs:
            return _empty_score()

        # ---- PM Coverage (25%) ----
        pm_coverage = _calc_pm_coverage(plan, all_jobs)

        # ---- Priority Coverage (20%) ----
        priority_coverage = _calc_priority_coverage(plan, all_jobs)

        # ---- Berth Balance (20%) ----
        berth_balance = _calc_berth_balance(all_jobs)

        # ---- Team Balance (20%) ----
        team_balance = _calc_team_balance(all_jobs)

        # ---- Capacity Fit (15%) ----
        capacity_fit = _calc_capacity_fit(day_job_counts)

        overall = round(
            pm_coverage * 0.25
            + priority_coverage * 0.20
            + berth_balance * 0.20
            + team_balance * 0.20
            + capacity_fit * 0.15
        )

        return {
            'overall': overall,
            'pm_coverage': round(pm_coverage),
            'priority_coverage': round(priority_coverage),
            'berth_balance': round(berth_balance),
            'team_balance': round(team_balance),
            'capacity_fit': round(capacity_fit),
        }

    # ------------------------------------------------------------------

    @staticmethod
    def get_candidates(plan_id: int) -> Dict[str, Any]:
        """
        Preview: show what *would* be scheduled without creating jobs.

        Returns:
            Dict with candidates list and aggregated stats.
        """
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            raise NotFoundError('Work Plan')

        candidates = _step_populate(plan)
        scored = _step_score(candidates, plan)
        bundles = _step_bundle(scored)

        # Summarize by source
        by_source = defaultdict(int)
        by_type = defaultdict(int)
        for c in scored:
            by_source[c['source']] += 1
            by_type[c['job_type']] += 1

        return {
            'total': len(scored),
            'by_source': dict(by_source),
            'by_type': dict(by_type),
            'bundles': len(bundles),
            'candidates': [
                {
                    'source': c['source'],
                    'job_type': c['job_type'],
                    'equipment_id': c.get('equipment_id'),
                    'equipment_name': c.get('equipment_name'),
                    'description': c.get('description', '')[:120],
                    'score': c.get('score', 0),
                    'priority': _score_to_priority(c.get('score', 0)),
                    'berth': c.get('berth'),
                    'estimated_hours': c.get('estimated_hours', 0),
                    'overdue_value': c.get('overdue_value'),
                    'overdue_unit': c.get('overdue_unit'),
                }
                for c in sorted(scored, key=lambda x: x.get('score', 0), reverse=True)
            ],
        }

    # ------------------------------------------------------------------

    @staticmethod
    def reject_generation(plan_id: int) -> Dict[str, Any]:
        """
        Remove all AI-generated jobs (where ai_confidence IS NOT NULL).
        Falls back to removing *all* jobs if ai_confidence column doesn't exist yet.

        Returns:
            Dict with removed job count.
        """
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            raise NotFoundError('Work Plan')

        if plan.status != 'draft':
            raise BusinessError('Can only reject generation on a draft plan')

        removed = _clear_generated_jobs(plan, clear_all=False)

        db.session.commit()
        logger.info("reject_generation | plan_id=%s removed=%d", plan_id, removed)

        return {
            'status': 'success',
            'removed': removed,
        }


# ===========================================================================
# INTERNAL HELPERS
# ===========================================================================

def _ensure_plan_days(plan: WorkPlan) -> None:
    """
    Make sure the plan has exactly 7 WorkPlanDay rows
    (one per date from week_start to week_end).
    """
    existing_dates = {d.date for d in plan.days}

    current = plan.week_start
    while current <= plan.week_end:
        if current not in existing_dates:
            db.session.add(WorkPlanDay(
                work_plan_id=plan.id,
                date=current,
            ))
        current += timedelta(days=1)

    db.session.flush()
    # plan.days was read (and cached) BEFORE the new rows were added, so a plan
    # that arrived with no days would keep showing an empty collection — and
    # every bundle would be silently deferred. Expire so the next read reloads.
    db.session.expire(plan, ['days'])


def _clear_generated_jobs(plan: WorkPlan, clear_all: bool = False) -> int:
    """
    Remove previously generated jobs from the plan.

    Uses bulk DELETE with explicit child cleanup to avoid the
    NotNullViolation on work_plan_job_trackings.work_plan_job_id.

    If clear_all=True, removes every job. Otherwise removes only
    AI-generated ones (where ai_confidence IS NOT NULL).

    Also resets SAP orders back to 'pending' for re-scheduling.
    """
    from app.models.work_plan_job_tracking import WorkPlanJobTracking

    has_ai_col = _has_column(WorkPlanJob, 'ai_confidence')

    # Decide which jobs to remove
    job_ids: List[int] = []
    sap_numbers: set = set()

    for day in plan.days:
        for job in day.jobs:
            should_remove = clear_all
            if not should_remove:
                if has_ai_col:
                    should_remove = getattr(job, 'ai_confidence', None) is not None
                else:
                    # Column doesn't exist — skip non-clear-all calls
                    continue
            if should_remove:
                job_ids.append(job.id)
                if job.sap_order_number:
                    sap_numbers.add(job.sap_order_number)

    if not job_ids:
        return 0

    # Reset SAP orders back to pending
    if sap_numbers:
        # Released back to the shared box, not this week's — an unplanned job is
        # outstanding work again and belongs to whenever it gets done.
        SAPWorkOrder.query.filter(
            SAPWorkOrder.order_number.in_(sap_numbers),
        ).update({'status': 'pending', 'work_plan_id': None}, synchronize_session=False)

    # Delete child records FIRST to avoid FK violations on tracking
    WorkPlanJobTracking.query.filter(
        WorkPlanJobTracking.work_plan_job_id.in_(job_ids)
    ).delete(synchronize_session=False)

    WorkPlanJobTracking.query.filter(
        WorkPlanJobTracking.original_job_id.in_(job_ids)
    ).update({'original_job_id': None}, synchronize_session=False)

    WorkPlanAssignment.query.filter(
        WorkPlanAssignment.work_plan_job_id.in_(job_ids)
    ).delete(synchronize_session=False)

    from app.models.work_plan_material import WorkPlanMaterial
    WorkPlanMaterial.query.filter(
        WorkPlanMaterial.work_plan_job_id.in_(job_ids)
    ).delete(synchronize_session=False)

    # Now delete the jobs
    removed = WorkPlanJob.query.filter(WorkPlanJob.id.in_(job_ids)).delete(synchronize_session=False)

    db.session.flush()
    return removed


# ===========================================================================
# STEP 1: POPULATE — Collect candidate jobs
# ===========================================================================

def _step_populate(plan: WorkPlan) -> List[Dict[str, Any]]:
    """
    Gather all candidate jobs from four sources:
      1. Pending SAP orders in this plan's pool
      2. Open defects from inspections (not already scheduled)
      3. Carry-overs from last week's incomplete jobs
      4. Pending inspection assignments for this week

    Returns:
        Unified list of candidate dicts, each with at minimum:
        source, job_type, equipment_id, description, estimated_hours,
        berth, overdue_value, overdue_unit, priority, maintenance_base,
        and source-specific IDs.
    """
    candidates: List[Dict[str, Any]] = []

    # IDs of defects already scheduled in this plan (avoid duplicates)
    already_scheduled_defect_ids = set(
        row[0] for row in
        db.session.query(WorkPlanJob.defect_id)
        .join(WorkPlanDay)
        .filter(
            WorkPlanDay.work_plan_id == plan.id,
            WorkPlanJob.defect_id.isnot(None),
        ).all()
    )

    # IDs of inspection assignments already scheduled
    already_scheduled_assignment_ids = set(
        row[0] for row in
        db.session.query(WorkPlanJob.inspection_assignment_id)
        .join(WorkPlanDay)
        .filter(
            WorkPlanDay.work_plan_id == plan.id,
            WorkPlanJob.inspection_assignment_id.isnot(None),
        ).all()
    )

    # ── 1. SAP orders (pending in this plan's pool) ──────────────────────
    # The pool is one global box. NULL work_plan_id means "waiting"; a value
    # means it was imported into a specific week the old way. Both are candidates
    # for this plan — see pool_orders_query in app/api/work_plans.py.
    sap_orders = SAPWorkOrder.query.filter(
        SAPWorkOrder.status == 'pending',
        or_(SAPWorkOrder.work_plan_id.is_(None), SAPWorkOrder.work_plan_id == plan.id),
    ).options(joinedload(SAPWorkOrder.equipment)).all()

    from app.utils.decorators import planning_today
    today = planning_today()
    for sap in sap_orders:
        eq = sap.equipment
        # Compute day-based overdue (today - order date) for everything except
        # performance PMs, which keep their imported running-hours value.
        ov_value, ov_unit = _resolve_overdue(
            sap.job_type, sap.maintenance_base, sap.required_date,
            sap.overdue_value, sap.overdue_unit, today,
        )
        candidates.append({
            'source': 'sap',
            'job_type': sap.job_type,
            'equipment_id': sap.equipment_id,
            'equipment_name': eq.name if eq else None,
            'equipment_type': eq.equipment_type if eq else None,
            'berth': _normalize_berth(sap.berth or (eq.berth if eq else None)),
            'description': sap.description or '',
            'estimated_hours': sap.estimated_hours or 4.0,
            'priority': sap.priority or 'normal',
            'overdue_value': ov_value,
            'overdue_unit': ov_unit,
            'maintenance_base': sap.maintenance_base,
            'planned_date': sap.planned_date,
            'sap_order_id': sap.id,
            'sap_order_number': sap.order_number,
            'sap_order_type': sap.order_type,
            'cycle_id': sap.cycle_id,
            'work_center': getattr(sap, 'work_center', None),
        })

    # ── 2. Open defects from inspections ─────────────────────────────────
    open_defects = (
        Defect.query
        .filter(
            Defect.status.in_(['open', 'in_progress']),
            Defect.severity.in_(['critical', 'high', 'medium', 'low']),
            ~Defect.id.in_(already_scheduled_defect_ids) if already_scheduled_defect_ids else True,
        )
        .options(
            joinedload(Defect.inspection).joinedload(Inspection.equipment),
            joinedload(Defect.equipment_direct),
        )
        .all()
    )

    for defect in open_defects:
        # Resolve equipment from direct link or through inspection
        eq = defect.equipment_direct
        eq_id = defect.equipment_id_direct
        if not eq and defect.inspection:
            eq = defect.inspection.equipment
            eq_id = defect.inspection.equipment_id if defect.inspection else None

        # Calculate overdue days from due_date
        overdue_days = None
        if defect.due_date:
            from app.utils.decorators import planning_today
            delta = (planning_today() - defect.due_date).days
            overdue_days = max(delta, 0)

        # Map defect category to work_center
        cat = (defect.category or '').lower()
        defect_work_center = 'ELEC' if cat == 'electrical' else 'MECH'

        candidates.append({
            'source': 'defect',
            'job_type': 'defect',
            'equipment_id': eq_id,
            'equipment_name': eq.name if eq else None,
            'equipment_type': eq.equipment_type if eq else None,
            'berth': _normalize_berth(eq.berth if eq else None),
            'description': defect.description or '',
            'estimated_hours': 2.0,  # Default estimate for defect repairs
            'severity': defect.severity,
            'priority': defect.priority or 'medium',
            'overdue_value': overdue_days,
            'overdue_unit': 'days' if overdue_days is not None else None,
            'maintenance_base': None,
            'defect_id': defect.id,
            'work_center': defect_work_center,
        })

    # ── 3. Carry-overs from previous week ────────────────────────────────
    prev_plan = (
        WorkPlan.query
        .filter(
            WorkPlan.week_start < plan.week_start,
            WorkPlan.id != plan.id,
        )
        .order_by(WorkPlan.week_start.desc())
        .first()
    )

    if prev_plan:
        # Find incomplete tracking records from previous plan
        incomplete_trackings = (
            WorkPlanJobTracking.query
            .join(WorkPlanJob, WorkPlanJobTracking.work_plan_job_id == WorkPlanJob.id)
            .join(WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id)
            .filter(
                WorkPlanDay.work_plan_id == prev_plan.id,
                WorkPlanJobTracking.status.in_(['incomplete', 'not_started', 'pending']),
            )
            .options(
                joinedload(WorkPlanJobTracking.work_plan_job)
                .joinedload(WorkPlanJob.equipment),
            )
            .all()
        )

        # Exclude carry-overs that already have a new_job in this plan
        already_carried = set(
            row[0] for row in
            db.session.query(WorkPlanCarryOver.original_job_id)
            .join(WorkPlanJob, WorkPlanCarryOver.new_job_id == WorkPlanJob.id)
            .join(WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id)
            .filter(WorkPlanDay.work_plan_id == plan.id)
            .all()
        )

        for tracking in incomplete_trackings:
            job = tracking.work_plan_job
            if not job or job.id in already_carried:
                continue

            eq = job.equipment
            candidates.append({
                'source': 'carry_over',
                'job_type': job.job_type,
                'equipment_id': job.equipment_id,
                'equipment_name': eq.name if eq else None,
                'equipment_type': eq.equipment_type if eq else None,
                'berth': _normalize_berth(job.berth),
                'description': job.description or '',
                'estimated_hours': job.estimated_hours or 4.0,
                'priority': job.priority or 'normal',
                'overdue_value': job.overdue_value,
                'overdue_unit': job.overdue_unit,
                'maintenance_base': job.maintenance_base,
                'sap_order_number': job.sap_order_number,
                'sap_order_type': job.sap_order_type,
                'defect_id': job.defect_id,
                'original_job_id': job.id,
                'carry_over_tracking_id': tracking.id,
                'work_center': getattr(job, 'work_center', None),
            })

    # ── 4. Inspections — EXCLUDED ────────────────────────────────────────
    # Inspections are generated by their own assignment system (target_date based).
    # The auto-planner does NOT pull them in. Inspectors get their work via the
    # inspection assignment flow, not via work_plan_jobs.

    logger.info(
        "populate | plan_id=%s sap=%d defects=%d carry_overs=%d total=%d",
        plan.id,
        sum(1 for c in candidates if c['source'] == 'sap'),
        sum(1 for c in candidates if c['source'] == 'defect'),
        sum(1 for c in candidates if c['source'] == 'carry_over'),
        len(candidates),
    )

    return candidates


def _filter_candidates_for_combined_step(
    candidates: List[Dict[str, Any]],
    plan: WorkPlan,
    step: int,
) -> List[Dict[str, Any]]:
    """
    Filter populated candidates based on which step of the Combined recipe
    is running. The Combined recipe is a manual 3-step pipeline where each
    step is run by the user (additive).

    Step 1: All PMs + any defects on the same equipment as a PM (defects
            ride along automatically via _step_bundle).
    Step 2: critical/high severity defects on equipment that has NO job
            scheduled in the plan yet (i.e., not picked up by Step 1).
    Step 3: medium/low severity defects on equipment that still has no
            scheduled job.

    Args:
        candidates: Output of _step_populate (all PMs, defects, carry-overs).
        plan: The current WorkPlan (to check existing scheduled jobs).
        step: 1, 2, or 3.

    Returns:
        Filtered candidate list — only those that match the current step.
    """
    # Equipment IDs that already have jobs scheduled in this plan.
    # For step 1 this is empty (fresh start). For steps 2 and 3 this contains
    # the equipment placed by previous steps.
    scheduled_eq_ids = set()
    for day in plan.days:
        for job in day.jobs:
            if job.equipment_id:
                scheduled_eq_ids.add(job.equipment_id)

    if step == 1:
        # PMs + defects on the same equipment as those PMs.
        # Carry-overs are also kept (they may include PMs or defects).
        pm_eq_ids = {
            c['equipment_id'] for c in candidates
            if c.get('job_type') == 'pm' and c.get('equipment_id')
        }
        return [
            c for c in candidates
            if c.get('job_type') == 'pm'
            or (
                _member_is_defect_work(c)
                and c.get('equipment_id') in pm_eq_ids
            )
            or c.get('source') == 'carry_over'
        ]

    if step == 2:
        return [
            c for c in candidates
            if _member_is_defect_work(c)
            and _is_high_urgency(c)
            and c.get('equipment_id') not in scheduled_eq_ids
        ]

    if step == 3:
        return [
            c for c in candidates
            if _member_is_defect_work(c)
            and not _is_high_urgency(c)
            and c.get('equipment_id') not in scheduled_eq_ids
        ]

    return candidates


# ===========================================================================
# STEP 2: SCORE — Calculate priority score (0-100) per candidate
# ===========================================================================

def _step_score(
    candidates: List[Dict[str, Any]],
    plan: WorkPlan,
) -> List[Dict[str, Any]]:
    """
    Assign a numeric score (0-100) to every candidate based on source,
    severity/priority, and overdue status.
    """
    for c in candidates:
        base = 0.0
        overdue_bonus = 0.0

        source = c['source']
        job_type = c['job_type']

        if source == 'defect':
            # Inspection-sourced defects: score by severity
            severity = c.get('severity', 'medium')
            base = _DEFECT_SEVERITY_SCORE.get(severity, 50)
            overdue_bonus = _overdue_bonus_days(c.get('overdue_value'))

        elif source == 'sap' and _is_defect_team_work(job_type, c.get('sap_order_number')):
            # SAP-sourced fault orders — COM, DAM, ACD and SAP inspections alike.
            # Recognising only 'defect' meant a DAM marked urgent fell through to
            # the flat default of 30, which the app then relabelled 'normal',
            # while the identical urgency on a COM scored 90 and showed red.
            base = _SAP_PRIORITY_SCORE.get(c.get('priority', 'normal'), 40)
            overdue_bonus = _overdue_bonus_days(c.get('overdue_value'))

        elif source == 'sap' and job_type == 'pm':
            base = _SAP_PRIORITY_SCORE.get(c.get('priority', 'normal'), 40)
            mb = c.get('maintenance_base') or ''
            if 'running_hours' in mb.lower():
                # Performance-based PM: more negative overdue_value = more urgent
                overdue_bonus = _overdue_bonus_hours(c.get('overdue_value'))
            else:
                # Calendar-based PM
                overdue_bonus = _overdue_bonus_days(c.get('overdue_value'))

        elif source == 'carry_over':
            # Re-score the original and add a boost
            priority = c.get('priority', 'normal')
            base = _SAP_PRIORITY_SCORE.get(priority, 40)
            overdue_bonus = _overdue_bonus_days(c.get('overdue_value'))
            base += _CARRY_OVER_BOOST

        elif source == 'inspection':
            # Inspection assignments get a flat moderate score
            base = 35

        else:
            # Unknown source — safe default
            base = 30

        # Clamp to 0-100
        c['score'] = min(max(round(base + overdue_bonus, 1), 0), 100)

    return candidates


def _overdue_bonus_days(overdue_days: Optional[float]) -> float:
    """Bonus points for day-based overdue: min(overdue_days/14, 1.0) * MAX_BONUS."""
    if not overdue_days or overdue_days <= 0:
        return 0.0
    return min(overdue_days / 14.0, 1.0) * _MAX_OVERDUE_BONUS


def _overdue_bonus_hours(overdue_hours: Optional[float]) -> float:
    """
    Bonus for running-hours (performance PM) overdue.

    overdue_hours = hours relative to the cycle trigger:
      POSITIVE = hours still remaining before due,
      ZERO     = exactly at the trigger,
      NEGATIVE = hours past the trigger (overdue).

    Priority starts to accrue once the order is within _PERF_LEAD_HOURS of the
    trigger (a 24h early flag) and ramps up FAST, reaching the max bonus about a
    day past due — so an overdue performance PM climbs quickly. Anything earlier
    than the lead window gets no bonus.
    """
    if overdue_hours is None:
        return 0.0
    effective = _PERF_LEAD_HOURS - overdue_hours   # > 0 once within the window/past due
    if effective <= 0:
        return 0.0
    return min(effective / _PERF_FULL_HOURS, 1.0) * _MAX_OVERDUE_BONUS


def _is_performance_pm(job_type: Optional[str], maintenance_base: Optional[str]) -> bool:
    """Performance PM = a PM measured by running hours (not the calendar)."""
    return job_type == 'pm' and 'running_hours' in (maintenance_base or '').lower()


def _resolve_overdue(
    job_type: Optional[str],
    maintenance_base: Optional[str],
    required_date,
    stored_value: Optional[float],
    stored_unit: Optional[str],
    today,
):
    """Return (overdue_value, overdue_unit) used for scoring.

    Performance PMs keep their imported hours value (negative = past trigger).
    Everything else (calendar PMs, COM, DAM, INS, ...) is day-based and computed
    by the system as today - order date, so it never relies on a manually-typed
    column. Orders only appear after generation, so the result is clamped at >= 0.
    """
    if _is_performance_pm(job_type, maintenance_base):
        return stored_value, (stored_unit or 'hours')
    if required_date is not None:
        return max(0, (today - required_date).days), 'days'
    # No date to compute from — fall back to whatever was imported
    return stored_value, (stored_unit or 'days')


# ===========================================================================
# STEP 3: BUNDLE — Group candidates by equipment_id
# ===========================================================================

def _step_bundle(
    candidates: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Group candidates sharing the same equipment_id into bundles.
    A bundle goes to the same day. Bundle priority = max score of members.

    Candidates with no equipment_id become single-item bundles.
    """
    groups: Dict[Optional[int], List[Dict[str, Any]]] = defaultdict(list)
    no_equip: List[Dict[str, Any]] = []

    for c in candidates:
        eq_id = c.get('equipment_id')
        if eq_id:
            groups[eq_id].append(c)
        else:
            no_equip.append(c)

    bundles: List[Dict[str, Any]] = []

    for eq_id, members in groups.items():
        max_score = max(m.get('score', 0) for m in members)
        # Resolve berth: pick the most common non-null berth in the group
        berths = [m.get('berth') for m in members if m.get('berth')]
        berth = max(set(berths), key=berths.count) if berths else None

        bundle = {
            'equipment_id': eq_id,
            'berth': berth,
            'score': max_score,
            'members': members,
        }
        _price_bundle(bundle)
        bundles.append(bundle)

    # Each orphan candidate is its own bundle
    for c in no_equip:
        bundle = {
            'equipment_id': None,
            'berth': c.get('berth'),
            'score': c.get('score', 0),
            'members': [c],
        }
        _price_bundle(bundle)
        bundles.append(bundle)

    # Sort descending by score for downstream distribution
    bundles.sort(key=lambda b: b['score'], reverse=True)

    logger.info(
        "bundle | total_bundles=%d equipment_bundles=%d orphan_bundles=%d",
        len(bundles), len(groups), len(no_equip),
    )

    return bundles



def _price_bundle(bundle: Dict[str, Any]) -> None:
    """Set every member's hours from Ali's table, in place.

    This runs at BUNDLE time and not earlier, because one of the numbers depends
    on the company a job keeps: a fault costs less when the PM team is already on
    the machine than when the defect team makes its own trip for it. Nothing
    knows that until the machine's work has been grouped onto one day.

    Carry-overs are left alone. Their hours are the REMAINING hours of work
    somebody already started, which is a fact about a specific job and not a
    price from a table.
    """
    with_pm = _bundle_has_regular_pm(bundle)
    for member in bundle.get('members', []):
        if member.get('source') == 'carry_over':
            member.setdefault('crew', MIN_CREW)
            continue
        family = _get_category(member.get('equipment_type') or '')
        member['estimated_hours'] = hours_for(
            member.get('job_type'),
            activity_type=member.get('sap_order_type'),
            family=family,
            with_pm=with_pm,
            description=member.get('description'),
        )
        # How many people the job takes — the other half of its price. A day
        # is budgeted in MAN-hours, so a 4.5h truck PM with a pair costs 9.
        if member.get('job_type') == 'pm':
            member['crew'] = pm_hours(family, description=member.get('description'))[0]
        else:
            member['crew'] = MIN_CREW


def _member_is_ac_pm(member: Dict[str, Any]) -> bool:
    from app.services.job_durations import is_ac_service
    return member.get('job_type') == 'pm' and is_ac_service(member.get('description'))


def bundle_man_hours(bundle: Dict[str, Any]) -> float:
    """What this bundle costs the day, in man-hours (duration x crew).

    AC-PM members are excluded: the AC team is separate, keeps its own
    machine-count rules, and never charges the maintenance/defect wallets.
    """
    total = 0.0
    for member in bundle.get('members', []):
        if _member_is_ac_pm(member):
            continue
        total += (member.get('estimated_hours') or 0.0) * (member.get('crew') or MIN_CREW)
    return total


# ===========================================================================
# STEP 4: DISTRIBUTE — Spread bundles across days
# ===========================================================================

# ── Helpers ────────────────────────────────────────────────────
def _build_summary_message(candidates: int, scheduled: int, unscheduled_bundles: int, total_bundles: int) -> str:
    """Build a human-readable summary message."""
    if unscheduled_bundles == 0:
        return f"All {scheduled} jobs scheduled successfully across the week."
    pct = round((scheduled / candidates) * 100) if candidates else 0
    return (
        f"Scheduled {scheduled} jobs ({pct}% of {candidates}). "
        f"{unscheduled_bundles} bundles deferred — they exceed weekly team capacity "
        f"and remain in the pool for next week."
    )


def _normalize_berth(berth):
    """Normalize berth value to match DB check constraint (east/west/both)."""
    if not berth:
        return None
    b = str(berth).strip().lower()
    if b in ('east', 'west', 'both'):
        return b
    # Handle common variations
    if 'east' in b or b == 'e':
        return 'east'
    if 'west' in b or b == 'w':
        return 'west'
    return 'both'


# ── Capacity Rules (per day per berth) ─────────────────────────
# Equipment categories — PM team can only do ONE category per day per berth.
# Maps the equipment_type code (or substring) → normalized category.
# Tellham uses these short codes: TT (Terminal Truck), RS (Reach Stacker),
# ECH (Empty Container Handler), TR (Trailer), FL (Forklift), BFL (Big Forklift).
EQUIPMENT_CATEGORIES = {
    # Reach Stacker
    'RS': 'reach_stacker',
    'REACHSTACKER': 'reach_stacker',
    'STACKER': 'reach_stacker',
    # Empty Container Handler
    'ECH': 'ech',
    'EMPTYCONTAINERHANDLER': 'ech',
    'EMPTYHANDLER': 'ech',
    # Truck (Terminal Truck)
    'TT': 'truck',
    'TRUCK': 'truck',
    'TERMINALTRUCK': 'truck',
    'TRACTOR': 'truck',
    # Forklift (regular + big)
    'FL': 'forklift',
    'BFL': 'forklift',
    'FORKLIFT': 'forklift',
    'FORKLIFTTRUCK': 'forklift',
    'BIGFORKLIFT': 'forklift',
    # Trailer
    'TR': 'trailer',
    'TRAILER': 'trailer',
}

# The regular teams' machine-count capacity rules are GONE (2026-08-25).
# PM_CAPACITY_BY_CATEGORY, the one-family-per-berth-day lock,
# DEFECT_CAPACITY_PER_BERTH, MAX_PM_BUNDLES_PER_WORKER_PER_DAY and the
# specialist group constants were all proxies for one number nobody had
# written down: how many hours the men who showed up can work. That number is
# now computed directly (app/services/day_budget.py: day-shift men x 8h per
# team per berth) and bundles are charged against it in man-hours. Ali's own
# week broke the family lock — "1st day you put 1 reach stacker, second day
# you keep the reach stacker and put TT" — and the counts died with it.

# The AC team is the exception, kept exactly as it was ("keep the ac as it
# is" — Ali). Max AC bundles per day per berth; the AC team is a separate
# 2-man crew, faster, and independent of the maintenance wallets. Small
# forklifts and trailers have no AC, so they are absent.
AC_CAPACITY_BY_CATEGORY = {
    'reach_stacker': 2,
    'ech': 2,
    'truck': 3,
    'forklift': 2,  # Only big forklifts have AC
    'other': 1,
}

# Urgency classification threshold (score >= this = urgent). Urgency buys the
# EARLIEST day and, for RS/ECH, extra men (job_durations.urgent_max_crew) —
# never a way past the wallet. The old "+1 machine" override survives only
# for the AC team's caps.
URGENT_THRESHOLD = 85


def _ac_capacity(category: str) -> int:
    """How many AC bundles of this category the AC team handles per day per berth."""
    if category not in AC_CAPACITY_BY_CATEGORY:
        return 0  # Trailers and small forklifts don't have AC
    return AC_CAPACITY_BY_CATEGORY[category]


def _get_equipment_type_key(bundle: Dict[str, Any]) -> str:
    """Get normalized equipment type for capacity lookup."""
    for m in bundle.get('members', []):
        t = (m.get('equipment_type') or '').strip().upper().replace(' ', '').replace('-', '').replace('_', '')
        if t:
            return t
    return ''


def _get_category(equipment_type: str) -> str:
    """Map raw equipment type to a normalized category key."""
    if not equipment_type:
        return 'other'
    eq_key = equipment_type.strip().upper().replace(' ', '').replace('-', '').replace('_', '')
    # Exact match first
    if eq_key in EQUIPMENT_CATEGORIES:
        return EQUIPMENT_CATEGORIES[eq_key]
    # Substring/prefix match
    for pattern, category in EQUIPMENT_CATEGORIES.items():
        if pattern in eq_key or eq_key in pattern:
            return category
    return 'other'


def _is_ac_service(bundle: Dict[str, Any]) -> bool:
    """
    Detect if this bundle is AC service.
    Rule: PM job with description containing 'AC' or 'AC system' (case insensitive).
    """
    for m in bundle.get('members', []):
        if m.get('job_type') != 'pm':
            continue
        desc = (m.get('description') or '').upper()
        # Match 'AC' as standalone word or 'AC SYSTEM'
        if ' AC ' in f' {desc} ' or 'AC SYSTEM' in desc or desc.startswith('AC ') or desc.endswith(' AC'):
            return True
    return False


def _bundle_has_ac_pm(bundle: Dict[str, Any]) -> bool:
    """True if any member is an AC PM."""
    for m in bundle.get('members', []):
        if m.get('job_type') != 'pm':
            continue
        desc = (m.get('description') or '').upper()
        if ' AC ' in f' {desc} ' or 'AC SYSTEM' in desc or desc.startswith('AC ') or desc.endswith(' AC'):
            return True
    return False


def _bundle_has_regular_pm(bundle: Dict[str, Any]) -> bool:
    """True if any member is a non-AC (regular) PM."""
    for m in bundle.get('members', []):
        if m.get('job_type') != 'pm':
            continue
        desc = (m.get('description') or '').upper()
        is_ac = (
            ' AC ' in f' {desc} '
            or 'AC SYSTEM' in desc
            or desc.startswith('AC ')
            or desc.endswith(' AC')
        )
        if not is_ac:
            return True
    return False


def _is_urgent_bundle(bundle: Dict[str, Any]) -> bool:
    """Check if bundle qualifies for urgent override (+1 slot)."""
    if bundle.get('score', 0) >= URGENT_THRESHOLD:
        return True
    for m in bundle.get('members', []):
        if (m.get('priority') or '').lower() in ('urgent', 'critical'):
            return True
        if (m.get('severity') or '').lower() in ('critical', 'high'):
            return True
    return False


# ── Workforce capacity helpers ──────────────────────────────────────────

def _step_distribute(
    plan: WorkPlan,
    bundles: List[Dict[str, Any]],
    recipe: str,
) -> Tuple[Dict[int, List[WorkPlanJob]], List[Dict[str, Any]], Dict[str, Any]]:
    """
    Assign each bundle to a day (or two) and create WorkPlanJob records.

    STRICT hours: a bundle fits a day only if its man-hours fit that team's
    wallet. Bundles that fit nowhere go to unscheduled — no overflow, no
    override. A regular PM bigger than a pair-day (only the reach stacker
    today) is SPLIT across two consecutive days, its riding faults landing on
    the finishing day; an URGENT reach stacker or ECH instead gets a bigger
    crew and one day, if the men exist.

    Returns:
        (day_map, unscheduled, capacity_utilization)
    """
    days = sorted(plan.days, key=lambda d: d.date)
    if not days:
        return {}, [m for b in bundles for m in b['members']], {}

    day_map: Dict[int, List[WorkPlanJob]] = {d.id: [] for d in days}
    unscheduled: List[Dict[str, Any]] = []

    # Informational load per day (machine-hours) — tie-breaks only.
    day_load: Dict[int, float] = {d.id: _existing_load(d) for d in days}

    # AC tracker only — the AC team keeps its machine-count rules as-is.
    capacity_tracker: Dict[int, Dict[str, Dict]] = {
        d.id: {berth: {'ac_category_locked': None, 'ac_count': 0}
               for berth in ('east', 'west', 'both')}
        for d in days
    }

    # The wallets: available day-shift men x 8h per team per berth. Empty dict
    # means no team rules are configured — the hours check switches off and
    # placement behaves as before, which keeps every installation without
    # WorkerAssignmentRules working unchanged.
    wallets = build_week_wallets(plan, days)

    # Jobs already sitting on the days (manual placements) are not free: AC
    # jobs count against the AC caps, everything else spends wallet money at
    # its assigned crew size (a pair when nobody is assigned yet).
    for d in days:
        for job in d.jobs:
            berth = _normalize_berth(job.berth) or 'both'
            desc_upper = (job.description or '').upper()
            job_is_ac = job.job_type == 'pm' and (
                ' AC ' in f' {desc_upper} ' or 'AC SYSTEM' in desc_upper
                or desc_upper.startswith('AC ') or desc_upper.endswith(' AC'))
            if job_is_ac:
                tracker = (capacity_tracker[d.id].get(berth)
                           or capacity_tracker[d.id]['both'])
                if job.equipment and job.equipment.equipment_type:
                    cat = _get_category(job.equipment.equipment_type)
                    if tracker['ac_category_locked'] is None:
                        tracker['ac_category_locked'] = cat
                    if tracker['ac_category_locked'] == cat:
                        tracker['ac_count'] += 1
                continue
            if wallets:
                if job.job_type == 'pm':
                    wallet_key = 'pm'
                elif _job_is_defect_work(job):
                    wallet_key = 'spec'
                else:
                    continue
                crew = max(MIN_CREW, len(job.assignments or []))
                _charge_wallet(wallets, d, berth, wallet_key,
                               (job.estimated_hours or 0) * crew)

    # Apply recipe-specific ordering
    ordered_bundles = _apply_recipe_ordering(bundles, days, recipe)

    capacity_full_count = 0
    for bundle_index, bundle in enumerate(ordered_bundles):
        placements = _plan_bundle_placement(
            bundle, days, day_load, capacity_tracker, wallets, recipe)
        if not placements:
            unscheduled.extend(bundle['members'])
            capacity_full_count += 1
            continue

        berth = bundle.get('berth') or 'both'
        bundle_is_pm_visit = _bundle_has_regular_pm(bundle)
        for day, members, wallet_key, charge in placements:
            part = dict(bundle, members=members)
            created_jobs = _create_jobs_for_bundle(part, day, plan)
            # One crew, one visit (Ali): a regular PM makes the WHOLE bundle
            # maintenance-team work — the assignment step must not look at the
            # riding defects alone and send a specialist to a machine the PM
            # pair is already standing on. The group ties the split halves
            # (and ride-alongs) to the SAME workers.
            if bundle_is_pm_visit:
                for job, member in zip(created_jobs, members):
                    job._bundle_team = 'regular_pm'
                    job._bundle_group = bundle_index
                    if member.get('job_type') == 'pm':
                        job._crew_needed = member.get('crew')
            day_map[day.id].extend(created_jobs)
            day_load[day.id] += sum(m.get('estimated_hours', 0) for m in members)
            if wallets and wallet_key and charge:
                _charge_wallet(wallets, day, berth, wallet_key, charge)
            _consume_ac_capacity(part, day, berth, capacity_tracker)

    capacity_utilization = _build_capacity_utilization(days, capacity_tracker, wallets)

    logger.info(
        "distribute | scheduled=%d unscheduled=%d full_bundles=%d",
        sum(len(jobs) for jobs in day_map.values()),
        len(unscheduled),
        capacity_full_count,
    )

    return day_map, unscheduled, capacity_utilization


def _bundle_wallet_key(bundle: Dict[str, Any]) -> Optional[str]:
    """Which wallet pays for this bundle.

    A regular PM makes it maintenance-team work — the whole visit, riding
    faults included ('pm'). Otherwise faults are the defect team's ('spec').
    A pure-AC bundle pays nobody: the AC team has its own caps.
    On a one-team berth the two keys are the same Wallet object anyway.
    """
    if _bundle_has_regular_pm(bundle):
        return 'pm'
    if _bundle_has_defect_work(bundle):
        return 'spec'
    return None


def _wallet_for(wallets, day, berth, wallet_key):
    if not wallets or not wallet_key:
        return None
    berth_key = berth if berth in ('east', 'west') else 'east'
    day_wallets = wallets.get(day.id, {}).get(berth_key)
    return day_wallets.get(wallet_key) if day_wallets else None


def _charge_wallet(wallets, day, berth, wallet_key, hours):
    wallet = _wallet_for(wallets, day, berth, wallet_key)
    if wallet is not None:
        wallet.charge(hours)


def _wallet_fits(wallets, day, berth, wallet_key, cost):
    wallet = _wallet_for(wallets, day, berth, wallet_key)
    if wallet is None:
        return True
    return cost <= wallet.remaining() + 1e-6


def _consume_ac_capacity(bundle, day, berth, capacity_tracker):
    """AC caps work exactly as they always did — lock the family, count one."""
    if not _bundle_has_ac_pm(bundle):
        return
    tracker = (capacity_tracker[day.id].get(berth)
               or capacity_tracker[day.id]['both'])
    cat = _get_category(_get_equipment_type_key(bundle)) if bundle.get('equipment_id') else None
    if cat:
        if tracker['ac_category_locked'] is None:
            tracker['ac_category_locked'] = cat
        tracker['ac_count'] += 1


def _build_capacity_utilization(
    days: List[WorkPlanDay],
    capacity_tracker: Dict[int, Dict[str, Dict]],
    wallets: Dict,
) -> Dict[str, Any]:
    """Per-day-per-berth summary: wallet hours for the regular teams, machine
    counts for the AC team (unchanged)."""
    util = {}
    for d in days:
        date_key = d.date.isoformat()
        util[date_key] = {}
        for berth in ('east', 'west', 'both'):
            tracker = capacity_tracker.get(d.id, {}).get(berth, {})
            ac_cat = tracker.get('ac_category_locked')
            entry = {
                'ac_category': ac_cat,
                'ac_used': tracker.get('ac_count', 0),
                'ac_max': _ac_capacity(ac_cat) if ac_cat else 0,
            }
            berth_key = berth if berth in ('east', 'west') else 'east'
            day_wallets = wallets.get(d.id, {}).get(berth_key) if wallets else None
            if day_wallets:
                pm_wallet, spec_wallet = day_wallets['pm'], day_wallets['spec']
                entry['hours'] = {
                    'pm': {'used': round(pm_wallet.hours_spent, 1),
                           'max': pm_wallet.hours_total},
                    'spec': {'used': round(spec_wallet.hours_spent, 1),
                             'max': spec_wallet.hours_total},
                    # One team wearing two hats (east): the same money.
                    'shared': pm_wallet is spec_wallet,
                }
                entry['is_full'] = (pm_wallet.remaining() <= 0
                                    and spec_wallet.remaining() <= 0)
            else:
                entry['hours'] = None
                entry['is_full'] = False
            util[date_key][berth] = entry
    return util


def _existing_load(day: WorkPlanDay) -> float:
    """Sum estimated hours of jobs already on this day (manual ones)."""
    return sum(j.estimated_hours or 0 for j in day.jobs)


def _apply_recipe_ordering(
    bundles: List[Dict[str, Any]],
    days: List[WorkPlanDay],
    recipe: str,
) -> List[Dict[str, Any]]:
    """
    Two-pass ordering:

    1. PM bundles (any equipment with at least one PM job) come FIRST.
       This ensures the PM team grabs equipment + all its bundled defects
       before defect-only bundles compete for capacity.

    2. Defect-only bundles come SECOND.
       These are equipment with no PM in the current week — handled
       by the defect team.

    Within each pass, recipe-specific ordering applies (priority, travel, etc).
    """
    pm_bundles = [b for b in bundles if any(m.get('job_type') == 'pm' for m in b['members'])]
    defect_bundles = [b for b in bundles if not any(m.get('job_type') == 'pm' for m in b['members'])]

    def order_within_pass(bundle_list):
        if recipe == 'travel_optimized':
            return sorted(bundle_list, key=lambda b: (b.get('berth') or 'zzz', -b['score']))
        # priority_first, team_balanced, copy_last_week, pm_compliance: by score desc
        return sorted(bundle_list, key=lambda b: -b['score'])

    return order_within_pass(pm_bundles) + order_within_pass(defect_bundles)


def _check_capacity(
    bundle: Dict[str, Any],
    day: WorkPlanDay,
    capacity_tracker: Dict[int, Dict[str, Dict]],
    allow_urgent_override: bool = False,
    wallets: Dict = None,
    cost: float = None,
) -> bool:
    """
    Does this bundle fit this day?

    Two gates, and only two:
      * AC caps — unchanged from the old design, urgent may still exceed by 1.
      * The wallet — the bundle's man-hours must fit the paying team's
        remaining hours. NEVER overridden: urgency buys the earliest fitting
        day (and, upstream, more men on RS/ECH), not a way past the limit.
    """
    berth = bundle.get('berth') or 'both'
    tracker = (capacity_tracker.get(day.id, {}).get(berth)
               or capacity_tracker.get(day.id, {}).get('both'))
    if tracker is None:
        return False

    if _bundle_has_ac_pm(bundle):
        cat = _get_category(_get_equipment_type_key(bundle)) if bundle.get('equipment_id') else None
        if cat:
            locked = tracker['ac_category_locked']
            if locked is not None and locked != cat:
                return False
            cap = _ac_capacity(cat)
            if cap == 0:
                return False
            if tracker['ac_count'] >= cap + (1 if allow_urgent_override else 0):
                return False

    if wallets:
        if cost is None:
            cost = bundle_man_hours(bundle)
        wallet_key = _bundle_wallet_key(bundle)
        if wallet_key and not _wallet_fits(wallets, day, berth, wallet_key, cost):
            return False

    return True


def _remaining_capacity(
    bundle: Dict[str, Any],
    day: WorkPlanDay,
    capacity_tracker: Dict[int, Dict[str, Dict]],
    wallets: Dict = None,
    cost: float = None,
) -> float:
    """How much room the day would have LEFT after this bundle — for ranking."""
    berth = bundle.get('berth') or 'both'
    if wallets:
        wallet_key = _bundle_wallet_key(bundle)
        wallet = _wallet_for(wallets, day, berth, wallet_key)
        if wallet is not None:
            if cost is None:
                cost = bundle_man_hours(bundle)
            return wallet.remaining() - cost
    if _bundle_has_ac_pm(bundle):
        tracker = (capacity_tracker.get(day.id, {}).get(berth)
                   or capacity_tracker.get(day.id, {}).get('both'))
        cat = _get_category(_get_equipment_type_key(bundle)) if bundle.get('equipment_id') else None
        if tracker is not None and cat:
            return float(_ac_capacity(cat) - tracker['ac_count'])
    return 1000.0


def _pick_day_with_capacity(
    bundle: Dict[str, Any],
    days: List[WorkPlanDay],
    day_load: Dict[int, float],
    capacity_tracker: Dict[int, Dict[str, Dict]],
    recipe: str,
    wallets: Dict = None,
    cost: float = None,
) -> Optional[WorkPlanDay]:
    """
    Choose the single day a bundle lands on. Returns None if nothing fits.

    Urgent bundles prefer the EARLIEST fitting day. The only override left is
    the AC team's +1 machine — the wallet is checked identically either way.
    """
    is_urgent = _is_urgent_bundle(bundle)

    def get_valid_days(allow_override: bool):
        return [d for d in days
                if _check_capacity(bundle, d, capacity_tracker, allow_override,
                                   wallets=wallets, cost=cost)]

    valid = get_valid_days(allow_override=False)

    if valid:
        if is_urgent:
            # Urgency buys position: first fitting day of the week.
            return valid[0]

        if recipe == 'travel_optimized':
            bundle_berth = bundle.get('berth')
            if bundle_berth:
                best_day, best_affinity = None, -1e9
                for d in valid:
                    affinity = sum(1 for j in d.jobs if j.berth == bundle_berth)
                    remaining = _remaining_capacity(bundle, d, capacity_tracker,
                                                    wallets, cost)
                    score = affinity * 10 + remaining
                    if score > best_affinity:
                        best_affinity, best_day = score, d
                if best_day:
                    return best_day

        if recipe == 'team_balanced':
            # Spreading is this recipe's whole promise: emptiest day first.
            return max(valid, key=lambda d: (
                _remaining_capacity(bundle, d, capacity_tracker, wallets, cost),
                -day_load[d.id],
            ))

        # Default: PACK the earliest day that fits. The week's model depends
        # on it — the carry-over pushes work FORWARD and the box catches what
        # falls off the end, which only makes sense if days fill front-first.
        # Ordering already ran highest-score first, so early days hold the
        # important work and the tail of the week stays movable.
        return valid[0]

    # AC-only override chance (+1 machine on the AC caps; wallet unchanged).
    if is_urgent and _bundle_has_ac_pm(bundle):
        valid = get_valid_days(allow_override=True)
        if valid:
            logger.info("urgent AC override applied | bundle_eq=%s score=%s",
                        bundle.get('equipment_id'), bundle.get('score'))
            return valid[0]

    return None


def _plan_bundle_placement(
    bundle: Dict[str, Any],
    days: List[WorkPlanDay],
    day_load: Dict[int, float],
    capacity_tracker: Dict[int, Dict[str, Dict]],
    wallets: Dict,
    recipe: str,
) -> Optional[List[Tuple[WorkPlanDay, List[Dict[str, Any]], Optional[str], float]]]:
    """Decide where a bundle's members land: a list of
    (day, members, wallet_key, man_hours_charge), or None for unscheduled.

    Normally one placement. A regular PM longer than a working day produces
    two (the split), unless it is urgent RS/ECH and enough men exist to
    finish it in one.
    """
    members = bundle['members']
    wallet_key = _bundle_wallet_key(bundle)
    cost = bundle_man_hours(bundle)

    if wallets:
        big_pm = next((m for m in members
                       if m.get('job_type') == 'pm' and not _member_is_ac_pm(m)
                       and (m.get('estimated_hours') or 0) > MAN_HOURS_PER_DAY),
                      None)
        if big_pm is not None:
            return _place_big_pm(bundle, big_pm, days, capacity_tracker, wallets)

    day = _pick_day_with_capacity(bundle, days, day_load, capacity_tracker,
                                  recipe, wallets, cost)
    if day is None:
        return None
    return [(day, members, wallet_key, cost)]


def _place_big_pm(
    bundle: Dict[str, Any],
    pm: Dict[str, Any],
    days: List[WorkPlanDay],
    capacity_tracker: Dict[int, Dict[str, Dict]],
    wallets: Dict,
) -> Optional[List[Tuple[WorkPlanDay, List[Dict[str, Any]], Optional[str], float]]]:
    """A regular PM that does not fit one pair-day (the reach stacker: 12h).

    URGENT RS/ECH first: try the biggest crew that finishes in a single day
    ("RS AND ECHs put maximum up to 4" — Ali). Otherwise Ali's own week:
    "1st day you put 1 reach stacker, second day you keep the reach stacker
    and put TT or FL or trailer" — 8h today, the rest plus every riding job
    on the finishing day, consecutive days, same machine, same pair.
    """
    members = bundle['members']
    others = [m for m in members if m is not pm]
    others_cost = sum(
        (m.get('estimated_hours') or 0) * (m.get('crew') or MIN_CREW)
        for m in others if not _member_is_ac_pm(m))
    family = _get_category(pm.get('equipment_type') or '')
    wallet_key = _bundle_wallet_key(bundle)

    if _is_urgent_bundle(bundle):
        for crew_try in range(urgent_max_crew(family), MIN_CREW, -1):
            crew_n, hours_n = pm_hours(family, crew=crew_try)
            if crew_n <= MIN_CREW or hours_n > MAN_HOURS_PER_DAY:
                continue
            cost_n = hours_n * crew_n + others_cost
            for day in days:  # earliest first — urgent buys position
                if _check_capacity(bundle, day, capacity_tracker,
                                   wallets=wallets, cost=cost_n):
                    pm['estimated_hours'] = hours_n
                    pm['crew'] = crew_n
                    return [(day, members, wallet_key, cost_n)]

    crew = pm.get('crew') or MIN_CREW
    first_hours = float(MAN_HOURS_PER_DAY)
    rest_hours = round((pm.get('estimated_hours') or 0) - first_hours, 2)
    if rest_hours <= 0:
        return None
    base_desc = (pm.get('description') or '').strip()
    part1 = dict(pm, estimated_hours=first_hours,
                 description=f'{base_desc} (part 1/2)'.strip())
    part2 = dict(pm, estimated_hours=rest_hours,
                 description=f'{base_desc} (part 2/2)'.strip())
    cost1 = first_hours * crew
    cost2 = rest_hours * crew + others_cost
    bundle1 = dict(bundle, members=[part1])
    bundle2 = dict(bundle, members=[part2] + others)

    for i in range(len(days) - 1):
        day1, day2 = days[i], days[i + 1]
        if (_check_capacity(bundle1, day1, capacity_tracker,
                            wallets=wallets, cost=cost1)
                and _check_capacity(bundle2, day2, capacity_tracker,
                                    wallets=wallets, cost=cost2)):
            return [(day1, [part1], wallet_key, cost1),
                    (day2, [part2] + others, wallet_key, cost2)]
    return None


def _create_jobs_for_bundle(
    bundle: Dict[str, Any],
    day: WorkPlanDay,
    plan: WorkPlan,
) -> List[WorkPlanJob]:
    """
    Materialize WorkPlanJob records from a bundle's candidate dicts.
    Marks SAP orders as scheduled. Sets ai_confidence if column exists.
    """
    # Get next position for this day
    max_pos = db.session.query(func.max(WorkPlanJob.position)).filter_by(
        work_plan_day_id=day.id
    ).scalar() or 0

    has_ai_col = _has_column(WorkPlanJob, 'ai_confidence')
    has_reason_col = _has_column(WorkPlanJob, 'ai_placement_reason')
    created: List[WorkPlanJob] = []

    for member in bundle['members']:
        max_pos += 1
        score = member.get('score', 0)

        # Resolve PM template if applicable
        pm_template_id = None
        eq_type = member.get('equipment_type')
        cycle_id = member.get('cycle_id')
        if member.get('job_type') == 'pm' and eq_type and cycle_id:
            tpl = PMTemplate.find_for_job(eq_type, cycle_id)
            if tpl:
                pm_template_id = tpl.id

        # Default work_center: PM = ELME (both teams), Defect = MECH (override via category)
        work_center = member.get('work_center')
        if not work_center:
            if member['job_type'] == 'pm':
                # AC PM defaults to ELEC, regular PM defaults to ELME (both)
                desc_upper = (member.get('description') or '').upper()
                if ' AC ' in f' {desc_upper} ' or 'AC SYSTEM' in desc_upper:
                    work_center = 'ELEC'
                else:
                    work_center = 'ELME'
            elif _member_is_defect_work(member):
                work_center = 'MECH'  # Defaults; defect category overrides

        job_kwargs = dict(
            work_plan_day_id=day.id,
            job_type=member['job_type'],
            berth=_normalize_berth(member.get('berth')),
            equipment_id=member.get('equipment_id'),
            defect_id=member.get('defect_id'),
            inspection_assignment_id=member.get('inspection_assignment_id'),
            sap_order_number=member.get('sap_order_number'),
            sap_order_type=member.get('sap_order_type'),
            description=member.get('description', ''),
            estimated_hours=member.get('estimated_hours', 4.0),
            priority=_score_to_priority(score),
            overdue_value=member.get('overdue_value'),
            overdue_unit=member.get('overdue_unit'),
            maintenance_base=member.get('maintenance_base'),
            planned_date=member.get('planned_date'),
            cycle_id=cycle_id,
            pm_template_id=pm_template_id,
            position=max_pos,
        )

        # Set work_center if column exists
        if _has_column(WorkPlanJob, 'work_center'):
            job_kwargs['work_center'] = work_center

        job = WorkPlanJob(**job_kwargs)

        # Set AI metadata columns if they exist on the model
        if has_ai_col:
            job.ai_confidence = round(score / 100.0, 2)
        if has_reason_col:
            job.ai_placement_reason = (
                f"Auto-generated ({member['source']}). "
                f"Score: {score}. Recipe: day assignment."
            )

        db.session.add(job)
        created.append(job)

        # Mark SAP order as scheduled
        sap_order_id = member.get('sap_order_id')
        if sap_order_id:
            sap = db.session.get(SAPWorkOrder, sap_order_id)
            if sap:
                sap.status = 'scheduled'
                sap.work_plan_id = plan.id  # leaves the box, into this week

    db.session.flush()
    return created


# ===========================================================================
# STEP 5: ASSIGN — Assign workers to jobs
# ===========================================================================

def _step_assign(
    plan: WorkPlan,
    day_map: Dict[int, List[WorkPlanJob]],
) -> Dict[str, int]:
    """
    Assign workers to newly created jobs using configured WorkerAssignmentRules
    when available, with smart fallback to scoring algorithm.

    Returns:
        Stats dict with workers_assigned, jobs_without_worker counts.
    """
    # Try loading the rules table. If missing, fall back to scoring only.
    # Each key maps to a LIST of rules (sorted by team_number) because
    # multiple parallel teams can exist per (berth, team_type, category).
    rules_by_key: Dict[Tuple[str, str, str], List[Any]] = defaultdict(list)
    try:
        from app.models.worker_assignment_rule import WorkerAssignmentRule
        all_rules = WorkerAssignmentRule.query.filter_by(is_active=True).all()
        # Sort by team_number so team 1 comes first
        all_rules.sort(key=lambda r: (r.berth, r.team_type, r.equipment_category, getattr(r, 'team_number', 1) or 1))
        for r in all_rules:
            rules_by_key[(r.berth, r.team_type, r.equipment_category)].append(r)
        logger.info(
            "assign | loaded %d worker assignment rules across %d (berth,team,cat) combinations",
            len(all_rules), len(rules_by_key),
        )
    except Exception as e:
        logger.warning("assign | could not load worker assignment rules: %s", e)

    # Query available workers — accept ANY non-admin active user.
    # The Worker Assignment Rules are the source of truth for who can be a lead.
    # Restricting by role here would silently exclude leads with roles like
    # 'mechanic', 'technician', 'inspector', etc.
    workers = (
        User.query
        .filter(
            User.is_active.is_(True),
            User.is_on_leave.is_(False),
        )
        .all()
    )
    workers_by_id = {w.id: w for w in workers}
    logger.info("assign | loaded %d active workers (all roles)", len(workers))

    if not workers:
        total_jobs = sum(len(jobs) for jobs in day_map.values())
        logger.warning("assign | no available workers found — %d jobs unassigned", total_jobs)
        return {'workers_assigned': 0, 'jobs_without_worker': total_jobs}

    # ── Load roster + approved leaves for per-day availability ──
    # roster_by_day_user[day_id][user_id] = 'day'|'night'|'off'|'leave'|None
    # A user is AVAILABLE on a day if their roster shift is 'day' or 'night'
    # (or no roster entry exists — default assume available).
    roster_by_day_user: Dict[int, Dict[int, str]] = defaultdict(dict)
    try:
        from app.models.roster import RosterEntry
        roster_entries = (
            RosterEntry.query
            .filter(
                RosterEntry.date >= plan.week_start,
                RosterEntry.date <= plan.week_end,
            )
            .all()
        )
        # Build a map by (date → day.id) for quick lookup
        date_to_day_id = {d.date: d.id for d in plan.days}
        for e in roster_entries:
            day_id = date_to_day_id.get(e.date)
            if day_id:
                roster_by_day_user[day_id][e.user_id] = e.shift
        logger.info("assign | loaded %d roster entries for plan week", len(roster_entries))
    except Exception as e:
        logger.warning("assign | could not load roster: %s", e)

    # Load approved leaves covering the plan week
    # leaves_by_user_day[user_id] = set of date strings when they're on leave
    leaves_by_user_day: Dict[int, set] = defaultdict(set)
    try:
        from app.models.leave import Leave
        from datetime import timedelta as _td
        approved_leaves = (
            Leave.query
            .filter(
                Leave.status == 'approved',
                Leave.date_from <= plan.week_end,
                Leave.date_to >= plan.week_start,
            )
            .all()
        )
        for lv in approved_leaves:
            d = lv.date_from
            while d <= lv.date_to:
                if plan.week_start <= d <= plan.week_end:
                    leaves_by_user_day[lv.user_id].add(d)
                d += _td(days=1)
        logger.info("assign | loaded %d approved leaves", len(approved_leaves))
    except Exception as e:
        logger.warning("assign | could not load leaves: %s", e)

    prev_assignments = _get_previous_week_assignments(plan)

    daily_worker_load: Dict[int, Dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for day in plan.days:
        for job in day.jobs:
            for assignment in job.assignments:
                daily_worker_load[day.id][assignment.user_id] += 1

    weekly_worker_load: Dict[int, int] = defaultdict(int)
    for loads in daily_worker_load.values():
        for uid, count in loads.items():
            weekly_worker_load[uid] += count

    workers_assigned = 0
    jobs_without_worker = 0

    # Build a set of (day_id, user_id) that are NOT available due to roster/leave
    unavailable_by_day: Dict[int, set] = defaultdict(set)
    for day in plan.days:
        # Roster: anyone marked 'off' or 'leave' is unavailable
        day_roster = roster_by_day_user.get(day.id, {})
        for user_id, shift in day_roster.items():
            if shift in ('off', 'leave'):
                unavailable_by_day[day.id].add(user_id)
        # Approved leaves: add all users on leave that day
        for user_id, leave_dates in leaves_by_user_day.items():
            if day.date in leave_dates:
                unavailable_by_day[day.id].add(user_id)

    # Track team rotation per (day_id, berth, team_type, cat) for multi-team load balancing
    team_rotation_counter: Dict[Tuple[int, str, str, str], int] = defaultdict(int)

    # The crew chosen for a bundle's first job, reused for its other jobs —
    # and for the second half of a split PM, so the same pair comes back.
    crew_by_group: Dict[int, List[Tuple[int, bool]]] = {}

    for day_id, jobs in day_map.items():
        for job in jobs:
            # The bundle's team wins over the job's own type: a riding defect
            # in a PM visit is maintenance work, not specialist work.
            team_type = getattr(job, '_bundle_team', None) or _determine_team_type(job)
            berth = _normalize_berth(job.berth)
            eq_cat = _get_category(job.equipment.equipment_type) if (job.equipment and job.equipment.equipment_type) else 'all'

            # Try to find configured rules (specific category, then 'all')
            rule_list = (
                rules_by_key.get((berth, team_type, eq_cat))
                or rules_by_key.get((berth, team_type, 'all'))
                or []
            )

            day_unavailable = unavailable_by_day.get(day_id, set())

            assigned_count = 0
            rule = None  # will point to the chosen rule for logging below

            group = getattr(job, '_bundle_group', None)
            needed = getattr(job, '_crew_needed', None)
            if group is not None and group in crew_by_group:
                for uid, is_lead in crew_by_group[group]:
                    if uid in day_unavailable:
                        continue
                    db.session.add(WorkPlanAssignment(
                        work_plan_job_id=job.id, user_id=uid, is_lead=is_lead))
                    daily_worker_load[day_id][uid] += 1
                    weekly_worker_load[uid] += 1
                    assigned_count += 1
                if assigned_count > 0:
                    workers_assigned += assigned_count
                else:
                    jobs_without_worker += 1
                continue

            if rule_list:
                # Multi-team selection: try each team in order of team rotation balance.
                # Track how many jobs each team has received TODAY for this (berth, team, cat).
                rotation_key = (day_id, berth, team_type, eq_cat)

                # Sort rules so the team with the LEAST jobs today comes first
                # (round-robin load balancing). Ties broken by team_number.
                def _rule_load(r):
                    tn = getattr(r, 'team_number', 1) or 1
                    return (team_rotation_counter.get((*rotation_key, tn), 0), tn)
                sorted_rules = sorted(rule_list, key=_rule_load)

                # Try each team until one succeeds
                for candidate_rule in sorted_rules:
                    assigned_crew = _assign_from_rule(
                        job, candidate_rule, workers_by_id, daily_worker_load, weekly_worker_load, day_id,
                        day_unavailable=day_unavailable,
                        crew_needed=needed,
                    )
                    assigned_count = len(assigned_crew)
                    if assigned_count > 0:
                        if group is not None:
                            crew_by_group[group] = assigned_crew
                        rule = candidate_rule
                        tn = getattr(candidate_rule, 'team_number', 1) or 1
                        team_rotation_counter[(*rotation_key, tn)] += 1
                        break
                    else:
                        rule = candidate_rule  # for logging even on failure
                if assigned_count == 0:
                    eq_name = job.equipment.name if job.equipment else 'unknown'
                    logger.warning(
                        "assign FAILED | job=%d eq=%s berth=%s team=%s cat=%s rule_id=%d "
                        "mech_count=%d elec_count=%d primary_mech=%s primary_elec=%s "
                        "succ_mech=%s succ_elec=%s pool_mech=%d pool_elec=%d",
                        job.id, eq_name, berth, team_type, eq_cat, rule.id,
                        rule.mech_count, rule.elec_count,
                        rule.primary_mech_lead_id, rule.primary_elec_lead_id,
                        rule.successor_mech_lead_id, rule.successor_elec_lead_id,
                        len(rule.candidate_mech_workers or []),
                        len(rule.candidate_elec_workers or []),
                    )
            else:
                eq_name = job.equipment.name if job.equipment else 'unknown'
                logger.warning(
                    "assign NO_RULE | job=%d eq=%s berth=%s team=%s cat=%s "
                    "(no rule found for this combination)",
                    job.id, eq_name, berth, team_type, eq_cat,
                )

            # If no rule was matched, fall back to scoring-based assignment
            if not rule:
                best_worker, _ = _score_workers_for_job(
                    job=job,
                    workers=workers,
                    day_id=day_id,
                    daily_load=daily_worker_load,
                    weekly_load=weekly_worker_load,
                    prev_assignments=prev_assignments,
                )
                if best_worker:
                    db.session.add(WorkPlanAssignment(
                        work_plan_job_id=job.id,
                        user_id=best_worker.id,
                        is_lead=True,
                    ))
                    daily_worker_load[day_id][best_worker.id] += 1
                    weekly_worker_load[best_worker.id] += 1
                    assigned_count = 1

            if assigned_count > 0:
                workers_assigned += assigned_count
            else:
                jobs_without_worker += 1

    db.session.flush()

    logger.info(
        "assign | workers_assigned=%d jobs_without_worker=%d",
        workers_assigned, jobs_without_worker,
    )

    return {
        'workers_assigned': workers_assigned,
        'jobs_without_worker': jobs_without_worker,
    }


def _determine_team_type(job: WorkPlanJob) -> str:
    """Map a WorkPlanJob to one of: regular_pm, ac_pm, defect_mech, defect_elec."""
    if job.job_type == 'pm':
        desc_upper = (job.description or '').upper()
        is_ac = (
            ' AC ' in f' {desc_upper} '
            or 'AC SYSTEM' in desc_upper
            or desc_upper.startswith('AC ')
            or desc_upper.endswith(' AC')
        )
        return 'ac_pm' if is_ac else 'regular_pm'
    if _job_is_defect_work(job):
        if job.defect and (job.defect.category or '').lower() == 'electrical':
            return 'defect_elec'
        return 'defect_mech'
    return 'regular_pm'  # fallback


def _assign_from_rule(
    job: WorkPlanJob,
    rule: Any,
    workers_by_id: Dict[int, Any],
    daily_load: Dict[int, Dict[int, int]],
    weekly_load: Dict[int, int],
    day_id: int,
    day_unavailable: Optional[set] = None,
    crew_needed: Optional[int] = None,
) -> List[Tuple[int, bool]]:
    """
    Assign workers to a job using a WorkerAssignmentRule.
    Picks primary lead (or successor if on leave), then fills with candidate workers.
    Skips workers marked unavailable for this day (off shift or approved leave).

    `crew_needed` overrides the rule's headcount UPWARD — an urgent reach
    stacker asks for 4 men from a rule written for a pair. The extra men come
    from the mechanical pool.

    Returns the assigned crew as [(user_id, is_lead), ...] so a bundle's other
    jobs (and the second half of a split PM) can reuse the exact same people.
    """
    assigned_count = 0
    assigned_crew: List[Tuple[int, bool]] = []
    assigned_user_ids = set()
    skipped_reasons = []  # debug: track why workers were rejected
    day_unavailable = day_unavailable or set()

    mech_target = rule.mech_count or 0
    elec_target = rule.elec_count or 0
    if crew_needed and crew_needed > mech_target + elec_target:
        mech_target += crew_needed - (mech_target + elec_target)

    def is_available(user_id):
        if user_id is None:
            return False
        if user_id in assigned_user_ids:
            skipped_reasons.append(f"uid={user_id}: already assigned to this job")
            return False
        if user_id in day_unavailable:
            skipped_reasons.append(f"uid={user_id}: off/leave on this day")
            return False
        u = workers_by_id.get(user_id)
        if u is None:
            skipped_reasons.append(f"uid={user_id}: not in active worker pool")
            return False
        if not u.is_active:
            skipped_reasons.append(f"uid={user_id} ({u.full_name}): inactive")
            return False
        if u.is_on_leave:
            skipped_reasons.append(f"uid={user_id} ({u.full_name}): globally on leave")
            return False
        return True

    # Pick MECH lead
    mech_lead_id = None
    if mech_target > 0:
        if is_available(rule.primary_mech_lead_id):
            mech_lead_id = rule.primary_mech_lead_id
        elif is_available(rule.successor_mech_lead_id):
            mech_lead_id = rule.successor_mech_lead_id
        if mech_lead_id:
            db.session.add(WorkPlanAssignment(
                work_plan_job_id=job.id,
                user_id=mech_lead_id,
                is_lead=True,
            ))
            assigned_user_ids.add(mech_lead_id)
            daily_load[day_id][mech_lead_id] += 1
            weekly_load[mech_lead_id] += 1
            assigned_count += 1
            assigned_crew.append((mech_lead_id, True))

    # Fill remaining mech workers from candidate pool
    # Implicitly include successor + primary in the pool (in case admin forgot)
    needed_mech = max(0, mech_target - (1 if mech_lead_id else 0))
    mech_pool = list(rule.candidate_mech_workers or [])
    for implicit_id in (rule.successor_mech_lead_id, rule.primary_mech_lead_id):
        if implicit_id and implicit_id not in mech_pool:
            mech_pool.append(implicit_id)
    # Sort by least-loaded for balance
    mech_pool_sorted = sorted(mech_pool, key=lambda uid: weekly_load.get(uid, 0))
    for uid in mech_pool_sorted:
        if needed_mech == 0:
            break
        if is_available(uid):
            db.session.add(WorkPlanAssignment(
                work_plan_job_id=job.id,
                user_id=uid,
                is_lead=False,
            ))
            assigned_user_ids.add(uid)
            daily_load[day_id][uid] += 1
            weekly_load[uid] += 1
            assigned_count += 1
            assigned_crew.append((uid, False))
            needed_mech -= 1

    # Pick ELEC lead
    elec_lead_id = None
    if elec_target > 0:
        if is_available(rule.primary_elec_lead_id):
            elec_lead_id = rule.primary_elec_lead_id
        elif is_available(rule.successor_elec_lead_id):
            elec_lead_id = rule.successor_elec_lead_id
        if elec_lead_id:
            db.session.add(WorkPlanAssignment(
                work_plan_job_id=job.id,
                user_id=elec_lead_id,
                is_lead=(mech_lead_id is None),  # Lead only if no mech lead
            ))
            assigned_user_ids.add(elec_lead_id)
            daily_load[day_id][elec_lead_id] += 1
            weekly_load[elec_lead_id] += 1
            assigned_count += 1
            assigned_crew.append((elec_lead_id, mech_lead_id is None))

    # Fill remaining elec workers
    # Implicitly include successor + primary in the pool
    needed_elec = max(0, elec_target - (1 if elec_lead_id else 0))
    elec_pool = list(rule.candidate_elec_workers or [])
    for implicit_id in (rule.successor_elec_lead_id, rule.primary_elec_lead_id):
        if implicit_id and implicit_id not in elec_pool:
            elec_pool.append(implicit_id)
    elec_pool_sorted = sorted(elec_pool, key=lambda uid: weekly_load.get(uid, 0))
    for uid in elec_pool_sorted:
        if needed_elec == 0:
            break
        if is_available(uid):
            db.session.add(WorkPlanAssignment(
                work_plan_job_id=job.id,
                user_id=uid,
                is_lead=False,
            ))
            assigned_user_ids.add(uid)
            daily_load[day_id][uid] += 1
            weekly_load[uid] += 1
            assigned_count += 1
            assigned_crew.append((uid, False))
            needed_elec -= 1

    # Debug: if we couldn't fully fill the team, log why
    if assigned_count == 0 and skipped_reasons:
        logger.warning(
            "_assign_from_rule | job=%d rule=%d zero workers assigned. Skip reasons: %s",
            job.id, rule.id, '; '.join(skipped_reasons[:6])
        )

    return assigned_crew


def _get_previous_week_assignments(
    plan: WorkPlan,
) -> set:
    """
    Return a set of (user_id, equipment_id, job_type) tuples
    from the previous week's plan assignments.
    """
    prev_plan = (
        WorkPlan.query
        .filter(
            WorkPlan.week_start < plan.week_start,
            WorkPlan.id != plan.id,
        )
        .order_by(WorkPlan.week_start.desc())
        .first()
    )
    if not prev_plan:
        return set()

    rows = (
        db.session.query(
            WorkPlanAssignment.user_id,
            WorkPlanJob.equipment_id,
            WorkPlanJob.job_type,
        )
        .join(WorkPlanJob, WorkPlanAssignment.work_plan_job_id == WorkPlanJob.id)
        .join(WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id)
        .filter(WorkPlanDay.work_plan_id == prev_plan.id)
        .all()
    )

    return {(r[0], r[1], r[2]) for r in rows}


def _score_workers_for_job(
    job: WorkPlanJob,
    workers: List[User],
    day_id: int,
    daily_load: Dict[int, Dict[int, int]],
    weekly_load: Dict[int, int],
    prev_assignments: set,
) -> Tuple[Optional[User], float]:
    """
    Score each worker for a specific job. Return (best_worker, best_score).
    Returns (None, 0) if no workers available.
    """
    best_worker = None
    best_score = -1.0

    # Pre-compute: max daily load for normalization
    day_loads_for_today = daily_load.get(day_id, {})
    max_daily = max(day_loads_for_today.values()) if day_loads_for_today else 0

    for worker in workers:
        score = 0.0

        # 1. Last performer bonus (+30)
        if (worker.id, job.equipment_id, job.job_type) in prev_assignments:
            score += 30

        # 2. Specialization match (+20)
        # Worker's specialization (mechanical/electrical) vs equipment type category
        if worker.specialization and job.equipment:
            eq_type = (job.equipment.equipment_type or '').lower()
            spec = worker.specialization.lower()
            # Equipment types containing 'electrical' or 'motor' match electrical,
            # everything else is mechanical by default
            eq_category = 'electrical' if any(
                kw in eq_type for kw in ('electrical', 'motor', 'generator', 'transformer')
            ) else 'mechanical'
            if spec == eq_category:
                score += 20

        # 3. Berth continuity (+15)
        # Does this worker already have jobs on same berth this day?
        if job.berth:
            worker_day_jobs = (
                db.session.query(WorkPlanJob.berth)
                .join(WorkPlanAssignment)
                .filter(
                    WorkPlanAssignment.user_id == worker.id,
                    WorkPlanJob.work_plan_day_id == day_id,
                    WorkPlanJob.berth == job.berth,
                )
                .first()
            )
            if worker_day_jobs:
                score += 15

        # 4. Load balance (+10)
        # Workers with fewer jobs today score higher
        worker_today = day_loads_for_today.get(worker.id, 0)
        if max_daily > 0:
            score += 10 * (1 - worker_today / (max_daily + 1))
        else:
            score += 10  # No one has jobs yet — full bonus

        if score > best_score:
            best_score = score
            best_worker = worker

    return best_worker, best_score


# ===========================================================================
# SCORING DIMENSION HELPERS
# ===========================================================================

def _empty_score() -> Dict[str, int]:
    return {
        'overall': 0,
        'pm_coverage': 0,
        'priority_coverage': 0,
        'berth_balance': 0,
        'team_balance': 0,
        'capacity_fit': 0,
    }


def _calc_pm_coverage(plan: WorkPlan, all_jobs: List[WorkPlanJob]) -> float:
    """% of overdue PMs from SAP pool that got scheduled."""
    overdue_pms_in_pool = SAPWorkOrder.query.filter(
        or_(SAPWorkOrder.work_plan_id.is_(None), SAPWorkOrder.work_plan_id == plan.id),
        SAPWorkOrder.job_type == 'pm',
        SAPWorkOrder.overdue_value.isnot(None),
        SAPWorkOrder.overdue_value != 0,
    ).count()

    if overdue_pms_in_pool == 0:
        return 100.0  # No overdue PMs — perfect score

    scheduled_pm_sap_numbers = {
        j.sap_order_number for j in all_jobs
        if j.job_type == 'pm' and j.sap_order_number
    }

    overdue_pms_scheduled = SAPWorkOrder.query.filter(
        or_(SAPWorkOrder.work_plan_id.is_(None), SAPWorkOrder.work_plan_id == plan.id),
        SAPWorkOrder.job_type == 'pm',
        SAPWorkOrder.overdue_value.isnot(None),
        SAPWorkOrder.overdue_value != 0,
        SAPWorkOrder.order_number.in_(scheduled_pm_sap_numbers) if scheduled_pm_sap_numbers else False,
    ).count()

    return (overdue_pms_scheduled / overdue_pms_in_pool) * 100


def _calc_priority_coverage(plan: WorkPlan, all_jobs: List[WorkPlanJob]) -> float:
    """% of urgent/high priority candidates that got scheduled."""
    # Count high-priority SAP orders in pool
    high_sap = SAPWorkOrder.query.filter(
        or_(SAPWorkOrder.work_plan_id.is_(None), SAPWorkOrder.work_plan_id == plan.id),
        SAPWorkOrder.priority.in_(['urgent', 'high']),
    ).count()

    # Count high-severity defects
    high_defects = Defect.query.filter(
        Defect.status.in_(['open', 'in_progress']),
        Defect.severity.in_(['critical', 'high']),
    ).count()

    total_high = high_sap + high_defects
    if total_high == 0:
        return 100.0

    # Count how many high-priority items got scheduled
    scheduled_high = sum(
        1 for j in all_jobs
        if j.priority in ('urgent', 'high')
    )

    return min((scheduled_high / total_high) * 100, 100.0)


def _calc_berth_balance(all_jobs: List[WorkPlanJob]) -> float:
    """
    How evenly the workload is split between East and West berths.

    Each berth has its own dedicated team, so we want both teams to have
    similar amounts of work — neither team should be drowning while the
    other sits idle.

    Score = (smaller_berth_count / bigger_berth_count) * 100

    Examples:
        East=18, West=17 → 17/18 = 94% (well balanced)
        East=25, West=12 → 12/25 = 48% (one team overloaded)
        East=30, West=0  →  0/30 =  0% (one team idle)

    Notes:
        - 'both' jobs are counted toward both berths (they're flexible work).
        - Jobs with no berth set are ignored.
        - If only one berth has jobs, score is 0 (totally unbalanced).
        - If neither berth has jobs, score is 100 (nothing to balance).
    """
    east_count = 0
    west_count = 0

    for job in all_jobs:
        berth = (job.berth or '').lower()
        if berth == 'east':
            east_count += 1
        elif berth == 'west':
            west_count += 1
        elif berth == 'both':
            east_count += 1
            west_count += 1

    if east_count == 0 and west_count == 0:
        return 100.0  # No berth info on any job — don't penalize

    smaller = min(east_count, west_count)
    bigger = max(east_count, west_count)

    if bigger == 0:
        return 100.0  # Should not happen given check above, defensive

    return (smaller / bigger) * 100


def _calc_team_balance(all_jobs: List[WorkPlanJob]) -> float:
    """
    Inverse of std deviation of jobs per assigned worker.
    Perfectly balanced = 100, very imbalanced = lower.
    """
    worker_counts: Dict[int, int] = defaultdict(int)
    for job in all_jobs:
        for assignment in job.assignments:
            worker_counts[assignment.user_id] += 1

    if len(worker_counts) <= 1:
        return 100.0  # Single or no worker — can't measure balance

    counts = list(worker_counts.values())
    mean = sum(counts) / len(counts)
    if mean == 0:
        return 100.0

    sd = stdev(counts) if len(counts) > 1 else 0
    # Normalize: CV (coefficient of variation) of 0 = 100, CV of 1+ = 0
    cv = sd / mean
    return max(0, min(100, (1 - cv) * 100))


def _calc_capacity_fit(day_job_counts: List[int]) -> float:
    """
    How evenly jobs are spread across days.
    Uses coefficient of variation — lower is better.
    """
    if not day_job_counts or sum(day_job_counts) == 0:
        return 100.0

    non_zero = [c for c in day_job_counts if c > 0]
    if len(non_zero) <= 1:
        # Everything on one day — poor fit
        return max(0, 100 - sum(day_job_counts) * 5)

    mean = sum(day_job_counts) / len(day_job_counts)
    if mean == 0:
        return 100.0

    sd = stdev(day_job_counts) if len(day_job_counts) > 1 else 0
    cv = sd / mean
    return max(0, min(100, (1 - cv) * 100))
