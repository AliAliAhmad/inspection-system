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

from sqlalchemy import and_, func
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models.defect import Defect
from app.models.equipment import Equipment
from app.models.inspection import Inspection
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

_CARRY_OVER_BOOST = 15
_MAX_OVERDUE_BONUS = 20


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
    ) -> Dict[str, Any]:
        """
        Main entry point.  Runs the 5-step pipeline and commits.

        Args:
            plan_id: ID of the WorkPlan (must be in 'draft' status).
            recipe: Distribution recipe key from RECIPES.
            clear_existing: If True, remove *all* existing jobs first.
                            If False (default), only remove AI-generated jobs
                            (ai_confidence IS NOT NULL).

        Returns:
            Generation result dict with summary, score, and jobs_by_day.

        Raises:
            NotFoundError: Plan does not exist.
            BusinessError: Plan is not in draft status.
            ValidationError: Unknown recipe.
        """
        if recipe not in RECIPES:
            raise ValidationError(
                f"Unknown recipe '{recipe}'. Valid: {', '.join(RECIPES.keys())}",
                field='recipe',
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
            "generate_plan START | plan_id=%s recipe=%s clear=%s",
            plan_id, recipe, clear_existing,
        )

        # -- Ensure 7 WorkPlanDay rows exist ----------------------------------
        _ensure_plan_days(plan)

        # -- Housekeeping: clear previous generation --------------------------
        _clear_generated_jobs(plan, clear_all=clear_existing)

        # -- Pipeline ---------------------------------------------------------
        candidates = _step_populate(plan)
        scored = _step_score(candidates, plan)
        bundles = _step_bundle(scored)
        day_map, unscheduled = _step_distribute(plan, bundles, recipe)
        assignment_stats = _step_assign(plan, day_map)

        db.session.commit()
        logger.info(
            "generate_plan DONE | plan_id=%s candidates=%d scheduled=%d unscheduled=%d",
            plan_id, len(candidates), sum(len(j) for j in day_map.values()), len(unscheduled),
        )

        # -- Compute score on the completed plan ------------------------------
        score = WorkPlanGeneratorService.score_plan(plan_id)

        # Build summary
        scheduled_count = sum(len(jobs) for jobs in day_map.values())
        jobs_by_day = {}
        for day in plan.days:
            jobs_by_day[day.date.isoformat()] = len(day.jobs)

        return {
            'status': 'success',
            'summary': {
                'total_candidates': len(candidates),
                'scheduled': scheduled_count,
                'bundles_created': len(bundles),
                'unscheduled': len(unscheduled),
                'recipe': recipe,
                'workers_assigned': assignment_stats.get('workers_assigned', 0),
                'jobs_without_worker': assignment_stats.get('jobs_without_worker', 0),
            },
            'score': score,
            'jobs_by_day': jobs_by_day,
        }

    # ------------------------------------------------------------------

    @staticmethod
    def score_plan(plan_id: int) -> Dict[str, Any]:
        """
        Score an existing plan on 5 dimensions (0-100 each).

        Dimensions (weighted):
            pm_coverage      (25%) — % of overdue PMs from pool that got scheduled
            priority_coverage (20%) — % of urgent/high jobs included
            travel_efficiency (20%) — ratio of same-berth-per-day groupings
            team_balance      (20%) — inverse of std-dev of jobs per worker
            capacity_fit      (15%) — how evenly jobs spread across days

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

        # ---- Travel Efficiency (20%) ----
        travel_efficiency = _calc_travel_efficiency(plan)

        # ---- Team Balance (20%) ----
        team_balance = _calc_team_balance(all_jobs)

        # ---- Capacity Fit (15%) ----
        capacity_fit = _calc_capacity_fit(day_job_counts)

        overall = round(
            pm_coverage * 0.25
            + priority_coverage * 0.20
            + travel_efficiency * 0.20
            + team_balance * 0.20
            + capacity_fit * 0.15
        )

        return {
            'overall': overall,
            'pm_coverage': round(pm_coverage),
            'priority_coverage': round(priority_coverage),
            'travel_efficiency': round(travel_efficiency),
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


def _clear_generated_jobs(plan: WorkPlan, clear_all: bool = False) -> int:
    """
    Remove previously generated jobs from the plan.

    If clear_all=True, remove every job.
    Otherwise, only remove jobs where ai_confidence IS NOT NULL
    (or all jobs if the column doesn't exist — safe fallback).

    Also resets SAP orders back to 'pending' for re-scheduling.

    Returns:
        Number of jobs removed.
    """
    removed = 0
    has_ai_col = _has_column(WorkPlanJob, 'ai_confidence')

    for day in plan.days:
        jobs_to_remove = []
        for job in day.jobs:
            should_remove = clear_all
            if not should_remove and has_ai_col:
                should_remove = getattr(job, 'ai_confidence', None) is not None
            elif not should_remove and not has_ai_col:
                # Column doesn't exist yet — skip removal unless clear_all
                continue

            if should_remove:
                # Reset SAP order status if this job came from one
                if job.sap_order_number:
                    sap = SAPWorkOrder.query.filter_by(
                        work_plan_id=plan.id,
                        order_number=job.sap_order_number,
                    ).first()
                    if sap:
                        sap.status = 'pending'

                jobs_to_remove.append(job)

        for job in jobs_to_remove:
            db.session.delete(job)
            removed += 1

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
    sap_orders = SAPWorkOrder.query.filter_by(
        work_plan_id=plan.id,
        status='pending',
    ).options(joinedload(SAPWorkOrder.equipment)).all()

    for sap in sap_orders:
        eq = sap.equipment
        candidates.append({
            'source': 'sap',
            'job_type': sap.job_type,
            'equipment_id': sap.equipment_id,
            'equipment_name': eq.name if eq else None,
            'equipment_type': eq.equipment_type if eq else None,
            'berth': sap.berth or (eq.berth if eq else None),
            'description': sap.description or '',
            'estimated_hours': sap.estimated_hours or 4.0,
            'priority': sap.priority or 'normal',
            'overdue_value': sap.overdue_value,
            'overdue_unit': sap.overdue_unit,
            'maintenance_base': sap.maintenance_base,
            'planned_date': sap.planned_date,
            'sap_order_id': sap.id,
            'sap_order_number': sap.order_number,
            'sap_order_type': sap.order_type,
            'cycle_id': sap.cycle_id,
        })

    # ── 2. Open defects from inspections ─────────────────────────────────
    open_defects = (
        Defect.query
        .filter(
            Defect.status.in_(['open', 'in_progress']),
            Defect.severity.in_(['critical', 'high', 'medium']),
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
            delta = (date.today() - defect.due_date).days
            overdue_days = max(delta, 0)

        candidates.append({
            'source': 'defect',
            'job_type': 'defect',
            'equipment_id': eq_id,
            'equipment_name': eq.name if eq else None,
            'equipment_type': eq.equipment_type if eq else None,
            'berth': eq.berth if eq else None,
            'description': defect.description or '',
            'estimated_hours': 2.0,  # Default estimate for defect repairs
            'severity': defect.severity,
            'priority': defect.priority or 'medium',
            'overdue_value': overdue_days,
            'overdue_unit': 'days' if overdue_days is not None else None,
            'maintenance_base': None,
            'defect_id': defect.id,
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
                'berth': job.berth,
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
            })

    # ── 4. Inspection assignments for this week ──────────────────────────
    inspection_assignments = (
        InspectionAssignment.query
        .join(InspectionList, InspectionAssignment.inspection_list_id == InspectionList.id)
        .filter(
            InspectionAssignment.status.in_(['unassigned', 'assigned']),
            InspectionList.target_date >= plan.week_start,
            InspectionList.target_date <= plan.week_end,
            ~InspectionAssignment.id.in_(already_scheduled_assignment_ids) if already_scheduled_assignment_ids else True,
        )
        .options(joinedload(InspectionAssignment.equipment))
        .all()
    )

    for ia in inspection_assignments:
        eq = ia.equipment
        candidates.append({
            'source': 'inspection',
            'job_type': 'inspection',
            'equipment_id': ia.equipment_id,
            'equipment_name': eq.name if eq else None,
            'equipment_type': eq.equipment_type if eq else None,
            'berth': ia.berth or (eq.berth if eq else None),
            'description': f'Inspection: {eq.name}' if eq else 'Inspection',
            'estimated_hours': 1.5,  # Default for inspections
            'priority': 'normal',
            'overdue_value': None,
            'overdue_unit': None,
            'maintenance_base': None,
            'inspection_assignment_id': ia.id,
            'target_date': ia.inspection_list.target_date if ia.inspection_list else None,
        })

    logger.info(
        "populate | plan_id=%s sap=%d defects=%d carry_overs=%d inspections=%d total=%d",
        plan.id,
        sum(1 for c in candidates if c['source'] == 'sap'),
        sum(1 for c in candidates if c['source'] == 'defect'),
        sum(1 for c in candidates if c['source'] == 'carry_over'),
        sum(1 for c in candidates if c['source'] == 'inspection'),
        len(candidates),
    )

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

        elif source == 'sap' and job_type == 'defect':
            # SAP-sourced defect orders: score by SAP priority
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
    Bonus for running-hours overdue.
    overdue_value for running-hours PMs is typically *negative*
    (hours past the trigger), so we take the absolute value.
    """
    if overdue_hours is None:
        return 0.0
    return min(abs(overdue_hours) / 200.0, 1.0) * _MAX_OVERDUE_BONUS


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

        bundles.append({
            'equipment_id': eq_id,
            'berth': berth,
            'score': max_score,
            'members': members,
        })

    # Each orphan candidate is its own bundle
    for c in no_equip:
        bundles.append({
            'equipment_id': None,
            'berth': c.get('berth'),
            'score': c.get('score', 0),
            'members': [c],
        })

    # Sort descending by score for downstream distribution
    bundles.sort(key=lambda b: b['score'], reverse=True)

    logger.info(
        "bundle | total_bundles=%d equipment_bundles=%d orphan_bundles=%d",
        len(bundles), len(groups), len(no_equip),
    )

    return bundles


# ===========================================================================
# STEP 4: DISTRIBUTE — Spread bundles across days
# ===========================================================================

def _step_distribute(
    plan: WorkPlan,
    bundles: List[Dict[str, Any]],
    recipe: str,
) -> Tuple[Dict[int, List[WorkPlanJob]], List[Dict[str, Any]]]:
    """
    Assign each bundle to a day and create WorkPlanJob records.

    Returns:
        (day_map, unscheduled)
        day_map: {day_id: [WorkPlanJob, ...]}
        unscheduled: list of candidate dicts that couldn't be placed
    """
    days = sorted(plan.days, key=lambda d: d.date)
    if not days:
        return {}, [m for b in bundles for m in b['members']]

    day_map: Dict[int, List[WorkPlanJob]] = {d.id: [] for d in days}
    unscheduled: List[Dict[str, Any]] = []

    # Track load per day for even distribution
    day_load: Dict[int, float] = {d.id: _existing_load(d) for d in days}

    # Apply recipe-specific ordering/grouping
    ordered_bundles = _apply_recipe_ordering(bundles, days, recipe)

    for bundle in ordered_bundles:
        target_day = _pick_day(bundle, days, day_load, recipe)
        if target_day is None:
            # Should never happen with 7 days, but handle gracefully
            unscheduled.extend(bundle['members'])
            continue

        created_jobs = _create_jobs_for_bundle(bundle, target_day, plan)
        day_map[target_day.id].extend(created_jobs)

        # Update load tracker
        bundle_hours = sum(c.get('estimated_hours', 0) for c in bundle['members'])
        day_load[target_day.id] += bundle_hours

    return day_map, unscheduled


def _existing_load(day: WorkPlanDay) -> float:
    """Sum estimated hours of jobs already on this day (manual ones)."""
    return sum(j.estimated_hours or 0 for j in day.jobs)


def _apply_recipe_ordering(
    bundles: List[Dict[str, Any]],
    days: List[WorkPlanDay],
    recipe: str,
) -> List[Dict[str, Any]]:
    """
    Re-order bundles based on recipe.
    Bundles are already sorted by score desc from _step_bundle.
    """
    if recipe == 'pm_compliance':
        # PMs first, then defects, then inspections
        def pm_key(b):
            has_pm = any(m.get('job_type') == 'pm' for m in b['members'])
            return (0 if has_pm else 1, -b['score'])
        return sorted(bundles, key=pm_key)

    if recipe == 'travel_optimized':
        # Group by berth so same-berth bundles land together
        def berth_key(b):
            return (b.get('berth') or 'zzz', -b['score'])
        return sorted(bundles, key=berth_key)

    # priority_first, team_balanced, copy_last_week: keep score-descending
    return bundles


def _pick_day(
    bundle: Dict[str, Any],
    days: List[WorkPlanDay],
    day_load: Dict[int, float],
    recipe: str,
) -> Optional[WorkPlanDay]:
    """
    Choose which day a bundle should land on, based on recipe.

    priority_first: highest scored bundles go to day 1, then 2, etc.
                    We achieve this by filling days sequentially until load
                    threshold, then move to the next day.
    travel_optimized: prefer a day that already has same-berth jobs.
    team_balanced: least loaded day (round-robin by hours).
    pm_compliance: same as priority_first (PM bundles already pushed to front).
    copy_last_week: least loaded (fallback — real copy logic is a separate path).
    """
    if recipe == 'priority_first' or recipe == 'pm_compliance':
        # Fill days in order, moving on when a day gets significantly heavier
        avg_load = sum(day_load.values()) / len(days) if days else 0
        bundle_hours = sum(c.get('estimated_hours', 0) for c in bundle['members'])
        threshold = avg_load + bundle_hours + 8  # generous — just avoid extreme imbalance

        for d in days:
            if day_load[d.id] <= threshold:
                return d
        # All days at threshold — pick lightest
        return min(days, key=lambda d: day_load[d.id])

    if recipe == 'travel_optimized':
        bundle_berth = bundle.get('berth')
        if bundle_berth:
            # Find days that already have most jobs on same berth
            best_day = None
            best_affinity = -1
            for d in days:
                same_berth = sum(
                    1 for j in d.jobs if j.berth == bundle_berth
                ) + sum(
                    1 for j in (day_load.get('_jobs', {}).get(d.id, []))
                    if isinstance(j, dict) and j.get('berth') == bundle_berth
                )
                # Tie-break by least load
                if same_berth > best_affinity or (
                    same_berth == best_affinity
                    and (best_day is None or day_load[d.id] < day_load[best_day.id])
                ):
                    best_affinity = same_berth
                    best_day = d
            if best_day:
                return best_day

        # Fallback: least loaded
        return min(days, key=lambda d: day_load[d.id])

    # team_balanced / copy_last_week / default: round-robin by load
    return min(days, key=lambda d: day_load[d.id])


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

        job_kwargs = dict(
            work_plan_day_id=day.id,
            job_type=member['job_type'],
            berth=member.get('berth'),
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
    Assign best-fit workers to newly created jobs.

    Scoring per worker per job:
      - Last performer bonus (+30): worked on same equipment/job_type last week
      - Specialization match (+20): worker.specialization matches equipment type
      - Berth continuity (+15): worker already has jobs on same berth that day
      - Load balance (+10): fewer jobs that day = higher score

    Returns:
        Stats dict with workers_assigned, jobs_without_worker counts.
    """
    # Query available workers
    workers = (
        User.query
        .filter(
            User.is_active.is_(True),
            User.is_on_leave.is_(False),
            User.role.in_(['specialist', 'engineer']),
        )
        .all()
    )

    if not workers:
        total_jobs = sum(len(jobs) for jobs in day_map.values())
        logger.warning("assign | no available workers found — %d jobs unassigned", total_jobs)
        return {'workers_assigned': 0, 'jobs_without_worker': total_jobs}

    # Pre-compute: previous week's assignments per (user_id, equipment_id, job_type)
    prev_assignments = _get_previous_week_assignments(plan)

    # Track daily load: {day_id: {user_id: job_count}}
    daily_worker_load: Dict[int, Dict[int, int]] = defaultdict(lambda: defaultdict(int))

    # Pre-load existing assignments from manual jobs on these days
    for day in plan.days:
        for job in day.jobs:
            for assignment in job.assignments:
                daily_worker_load[day.id][assignment.user_id] += 1

    # Track weekly load for overall balance
    weekly_worker_load: Dict[int, int] = defaultdict(int)
    for loads in daily_worker_load.values():
        for uid, count in loads.items():
            weekly_worker_load[uid] += count

    workers_assigned = 0
    jobs_without_worker = 0

    for day_id, jobs in day_map.items():
        for job in jobs:
            best_worker, best_score = _score_workers_for_job(
                job=job,
                workers=workers,
                day_id=day_id,
                daily_load=daily_worker_load,
                weekly_load=weekly_worker_load,
                prev_assignments=prev_assignments,
            )

            if best_worker:
                assignment = WorkPlanAssignment(
                    work_plan_job_id=job.id,
                    user_id=best_worker.id,
                    is_lead=True,
                )
                db.session.add(assignment)
                daily_worker_load[day_id][best_worker.id] += 1
                weekly_worker_load[best_worker.id] += 1
                workers_assigned += 1
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
        'travel_efficiency': 0,
        'team_balance': 0,
        'capacity_fit': 0,
    }


def _calc_pm_coverage(plan: WorkPlan, all_jobs: List[WorkPlanJob]) -> float:
    """% of overdue PMs from SAP pool that got scheduled."""
    overdue_pms_in_pool = SAPWorkOrder.query.filter(
        SAPWorkOrder.work_plan_id == plan.id,
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
        SAPWorkOrder.work_plan_id == plan.id,
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
        SAPWorkOrder.work_plan_id == plan.id,
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


def _calc_travel_efficiency(plan: WorkPlan) -> float:
    """
    Ratio of same-berth groupings per day.
    For each day: if all jobs share the same berth → 100%.
    Average across all days with jobs.
    """
    scores = []
    for day in plan.days:
        if not day.jobs:
            continue

        jobs_with_berth = [j for j in day.jobs if j.berth]
        if not jobs_with_berth:
            scores.append(100.0)  # No berth info — not penalizing
            continue

        berth_counts = defaultdict(int)
        for j in jobs_with_berth:
            berth_counts[j.berth] += 1

        # Dominant berth share
        dominant = max(berth_counts.values())
        total = len(jobs_with_berth)
        scores.append((dominant / total) * 100)

    return sum(scores) / len(scores) if scores else 100.0


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
