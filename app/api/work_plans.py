"""
Work Planning endpoints.
Handles weekly work plans, jobs, assignments, and materials.
Enhanced with job templates, dependencies, capacity config, skills, conflicts, and AI features.
"""

import logging
import requests as http_requests
from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required, get_jwt_identity

logger = logging.getLogger(__name__)
from sqlalchemy.orm import joinedload, selectinload
from app.extensions import db
from app.models import (
    WorkPlan, WorkPlanDay, WorkPlanJob, WorkPlanAssignment, WorkPlanMaterial,
    Material, MaterialKit, MaterialKitItem, User, Equipment, Defect,
    InspectionAssignment, Notification, MaintenanceCycle, PMTemplate, PMTemplateMaterial,
    SAPWorkOrder, WorkPlanJobTracking,
    # Enhanced Work Planning models
    JobTemplate, JobTemplateMaterial, JobTemplateChecklist, JobDependency,
    CapacityConfig, WorkerSkill, EquipmentRestriction, WorkPlanVersion,
    SchedulingConflict, JobChecklistResponse, InspectionAnswer
)
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from app.utils.decorators import (get_current_user, get_language,
                                  planning_today as get_planning_today,
                                  admin_required as admin_decorator)
from app.services.notification_service import NotificationService
from app.services.work_plan_ai_service import WorkPlanAIService
from datetime import datetime, timedelta, date
from io import BytesIO
import json

bp = Blueprint('work_plans', __name__)


# Roles allowed to touch work planning. Deliberately NOT quality_engineer:
# QEs review work, they do not author plans. Nobody holds it as a primary role
# today (it exists only as the auto-paired minor role of engineer, see
# User.get_minor_role), so removing it locks nobody out — but _log_excluded_roles()
# at startup will shout if that ever stops being true.
PLANNING_ROLES = ('admin', 'engineer')


def engineer_or_admin_required():
    """Check if user is engineer or admin."""
    user = get_current_user()
    if user.role not in PLANNING_ROLES:
        raise ForbiddenError("Only engineers and admins can access this resource")
    return user


def admin_required():
    """Check if user is admin."""
    user = get_current_user()
    if user.role != 'admin':
        raise ForbiddenError("Only admins can access this resource")
    return user


# AI Service instance
ai_service = WorkPlanAIService()


def _defect_ids_with_active_specialist_job(defect_ids=None):
    """Return the set of defect_ids that already have an ACTIVE specialist job.

    A defect should live in only one place. If it was directly assigned to a
    specialist (and that job isn't cancelled/finished), it must not also be
    schedulable in a work plan. 'completed'/'qc_approved'/'cancelled' are
    excluded so a finished or cancelled job never blocks scheduling forever.
    """
    from app.models.specialist_job import SpecialistJob
    q = db.session.query(SpecialistJob.defect_id).filter(
        SpecialistJob.status.in_(['assigned', 'in_progress', 'paused', 'incomplete'])
    )
    if defect_ids is not None:
        q = q.filter(SpecialistJob.defect_id.in_(defect_ids))
    return {row[0] for row in q.all() if row[0] is not None}


def _difficulty_from_severity(severity):
    """Map a defect's severity to the work-plan job difficulty (for points)."""
    return 'major' if severity in ('high', 'critical') else 'minor'


def _auto_group_equipment_jobs(plan_id, day_id, equipment_id, exclude_sap_order_id=None):
    """Auto-add ALL related jobs for the same equipment to the same day.
    Includes: open defects (from inspections + direct) AND pending SAP orders.
    Called after any job is scheduled. Returns count of auto-added jobs.
    """
    if not equipment_id:
        return 0

    added = 0
    eq = db.session.get(Equipment, equipment_id)
    berth = eq.berth if eq else None

    # Get next position
    max_pos = db.session.query(db.func.max(WorkPlanJob.position)).filter_by(
        work_plan_day_id=day_id
    ).scalar() or 0

    # ── 1. Open defects (from inspections + direct equipment link) ──
    already_scheduled_defects = db.session.query(WorkPlanJob.defect_id).join(WorkPlanDay).filter(
        WorkPlanDay.work_plan_id == plan_id,
        WorkPlanJob.defect_id.isnot(None)
    ).subquery()

    from app.models.inspection import Inspection
    open_defects = Defect.query.filter(
        Defect.status.in_(['open', 'in_progress']),
        ~Defect.id.in_(already_scheduled_defects),
        db.or_(
            Defect.equipment_id_direct == equipment_id,
            Defect.inspection.has(Inspection.equipment_id == equipment_id)
        )
    ).all()

    # Don't auto-pull defects that are already assigned directly to a specialist
    specialist_owned = _defect_ids_with_active_specialist_job([d.id for d in open_defects])

    for defect in open_defects:
        if defect.id in specialist_owned:
            continue
        max_pos += 1
        eq_id = defect.equipment_id_direct or (defect.inspection.equipment_id if defect.inspection else None)
        db.session.add(WorkPlanJob(
            work_plan_day_id=day_id,
            job_type='defect',
            berth=berth,
            equipment_id=eq_id or equipment_id,
            defect_id=defect.id,
            description=defect.description or defect.description_ar or '',
            estimated_hours=2.0,
            position=max_pos,
            priority='normal',
            difficulty=_difficulty_from_severity(defect.severity),
        ))
        added += 1

    # ── 2. Pending SAP orders for same equipment (PM + defect types) ──
    # pool_orders_query, not work_plan_id == plan_id. Since the pool became one
    # global box, robot-fed orders carry work_plan_id NULL — an exact-plan match
    # finds none of them, so "also add the other open work on this machine"
    # silently added nothing at all.
    pending_sap = pool_orders_query(plan_id).filter(
        SAPWorkOrder.equipment_id == equipment_id,
    ).all()

    for sap in pending_sap:
        if exclude_sap_order_id and sap.id == exclude_sap_order_id:
            continue
        max_pos += 1

        # Find PM template if applicable
        pm_template_id = None
        if sap.job_type == 'pm' and sap.cycle_id:
            pm_template = PMTemplate.find_for_job(eq.equipment_type if eq else None, sap.cycle_id)
            if pm_template:
                pm_template_id = pm_template.id

        db.session.add(WorkPlanJob(
            work_plan_day_id=day_id,
            job_type=sap.job_type,
            berth=berth,
            equipment_id=equipment_id,
            sap_order_number=sap.order_number,
            sap_order_type=sap.order_type,
            description=sap.description,
            cycle_id=sap.cycle_id,
            pm_template_id=pm_template_id,
            overdue_value=sap.overdue_value,
            overdue_unit=sap.overdue_unit,
            maintenance_base=sap.maintenance_base,
            planned_date=sap.planned_date or sap.required_date,
            estimated_hours=sap.estimated_hours,
            position=max_pos,
            priority='normal',
        ))
        sap.status = 'scheduled'
        # plan_id, not plan.id — this function only ever receives the id. The
        # NameError this raised was swallowed by the caller's
        # `except Exception: logger.warning(...)`, so auto-adding a machine's
        # other open work has been silently doing nothing since f50e3c8.
        sap.work_plan_id = plan_id  # leaves the box, into this week
        added += 1

    return added


def create_plan_version(plan, change_type, change_summary, user_id):
    """Create a version snapshot of the plan."""
    # Get next version number
    max_version = db.session.query(db.func.max(WorkPlanVersion.version_number)).filter_by(
        work_plan_id=plan.id
    ).scalar() or 0

    # Create snapshot
    snapshot = {
        'days': []
    }
    for day in plan.days:
        day_snapshot = {
            'id': day.id,
            'date': day.date.isoformat(),
            'jobs': []
        }
        for job in day.jobs:
            job_snapshot = {
                'id': job.id,
                'job_type': job.job_type,
                'equipment_id': job.equipment_id,
                'berth': job.berth,
                'estimated_hours': job.estimated_hours,
                'priority': job.priority,
                'assignments': [{'user_id': a.user_id, 'is_lead': a.is_lead} for a in job.assignments]
            }
            day_snapshot['jobs'].append(job_snapshot)
        snapshot['days'].append(day_snapshot)

    version = WorkPlanVersion(
        work_plan_id=plan.id,
        version_number=max_version + 1,
        snapshot_data=snapshot,
        change_type=change_type,
        change_summary=change_summary,
        created_by_id=user_id
    )
    db.session.add(version)
    return version


def detect_conflicts_for_plan(plan):
    """Detect scheduling conflicts for a plan."""
    conflicts = []

    # Track hours per worker per day
    worker_day_hours = {}

    for day in plan.days:
        for job in day.jobs:
            for assignment in job.assignments:
                key = (day.id, assignment.user_id)
                if key not in worker_day_hours:
                    worker_day_hours[key] = 0
                worker_day_hours[key] += job.estimated_hours or 0

    # Check capacity conflicts
    for (day_id, user_id), hours in worker_day_hours.items():
        if hours > 10:  # More than 10 hours in a day
            day = db.session.get(WorkPlanDay, day_id)
            user = db.session.get(User, user_id)
            conflicts.append({
                'type': 'capacity',
                'severity': 'warning' if hours <= 12 else 'error',
                'description': f'{user.full_name if user else "Worker"} has {hours:.1f}h scheduled on {day.date if day else "unknown"}',
                'affected_user_ids': [user_id],
                'affected_day_id': day_id
            })

    return conflicts


# ==================== DIAGNOSTIC ====================

@bp.route('/debug/<week_start_str>', methods=['GET'])
@jwt_required()
@admin_decorator()
def debug_work_plan(week_start_str):
    """Debug endpoint to check work plan loading (admin only)."""
    try:
        from collections import Counter

        week_date = datetime.strptime(week_start_str, '%Y-%m-%d').date()

        # Get the plan
        plan = WorkPlan.query.filter_by(week_start=week_date).first()
        if not plan:
            return jsonify({'status': 'no_plan'}), 200

        # Get all scheduled jobs for this plan
        all_jobs = []
        for day in plan.days:
            for job in day.jobs:
                all_jobs.append({
                    'id': job.id,
                    'day': day.date.isoformat(),
                    'sap_order': job.sap_order_number,
                    'equipment_id': job.equipment_id
                })

        # Get pending SAP orders in the pool
        # Counts the shared box as well, or the planner reports "0 waiting"
        # while /pool on the phone reports 202 — same question, two answers.
        pending_sap_orders = pool_orders_query(plan.id).count()

        scheduled_sap_orders = SAPWorkOrder.query.filter_by(
            work_plan_id=plan.id,
            status='scheduled'
        ).count()

        return jsonify({
            'status': 'ok',
            'plan_id': plan.id,
            'total_scheduled_jobs': len(all_jobs),
            'sap_orders_in_pool': pending_sap_orders,
            'sap_orders_scheduled': scheduled_sap_orders,
            'sample_jobs': all_jobs[:5]
        }), 200

    except Exception as e:
        logger.error(f'Debug work plan error: {e}')
        return jsonify({
            'status': 'error',
            'message': 'Internal server error'
        }), 500


@bp.route('/cleanup/<week_start_str>', methods=['POST'])
@jwt_required()
@admin_decorator()
def cleanup_duplicate_jobs(week_start_str):
    """Remove duplicate jobs (keep first occurrence by SAP order). Admin only."""
    try:
        week_date = datetime.strptime(week_start_str, '%Y-%m-%d').date()
        plan = WorkPlan.query.filter_by(week_start=week_date).first()
        if not plan:
            return jsonify({'status': 'no_plan'}), 404

        # Collect all jobs with SAP orders
        seen_orders = set()
        jobs_to_delete = []

        for day in plan.days:
            for job in day.jobs:
                if job.sap_order_number:
                    if job.sap_order_number in seen_orders:
                        jobs_to_delete.append(job.id)
                    else:
                        seen_orders.add(job.sap_order_number)

        # Delete duplicates
        deleted = 0
        for job_id in jobs_to_delete:
            job = db.session.get(WorkPlanJob, job_id)
            if job:
                db.session.delete(job)
                deleted += 1

        db.session.commit()

        return jsonify({
            'status': 'ok',
            'deleted': deleted,
            'remaining': len(seen_orders)
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f'Cleanup duplicate jobs error: {e}')
        return jsonify({
            'status': 'error',
            'message': 'Internal server error'
        }), 500


@bp.route('/clear-jobs/<week_start_str>', methods=['POST'])
@jwt_required()
def clear_all_jobs(week_start_str):
    """Remove ALL jobs from a plan. Admin or engineer only, destructive operation."""
    user = engineer_or_admin_required()
    try:
        week_date = datetime.strptime(week_start_str, '%Y-%m-%d').date()
        plan = WorkPlan.query.filter_by(week_start=week_date).first()
        if not plan:
            return jsonify({'status': 'no_plan'}), 404

        from app.models.sap_work_order import SAPWorkOrder
        from app.models.work_plan_job_tracking import WorkPlanJobTracking
        from app.models.work_plan_assignment import WorkPlanAssignment
        from app.models.work_plan_material import WorkPlanMaterial

        # Collect job IDs and SAP order numbers in one pass.
        #
        # Jobs carrying a record of real work are KEPT, not cleared — one button
        # must not quietly destroy a week of the crew's tracking, checklists and
        # materials. They are reported back so nothing disappears silently.
        scheduled_sap_numbers = set()
        job_ids = []
        kept = []
        for day in plan.days:
            for job in day.jobs:
                state = job_work_state(job)
                if state is not None:
                    kept.append({'job_id': job.id, 'state': state,
                                 'sap_order_number': job.sap_order_number})
                    continue
                if job.sap_order_number:
                    scheduled_sap_numbers.add(job.sap_order_number)
                job_ids.append(job.id)

        if not job_ids:
            return jsonify({
                'status': 'ok', 'deleted': 0, 'sap_orders_reset': 0,
                'kept': len(kept), 'kept_jobs': kept,
                'message': (f'Nothing cleared — {len(kept)} job(s) have work recorded.'
                            if kept else 'No jobs to clear.'),
            }), 200

        # Delete child records FIRST to avoid FK violations
        # 1. Tracking rows (NOT NULL FK, no cascade)
        WorkPlanJobTracking.query.filter(
            WorkPlanJobTracking.work_plan_job_id.in_(job_ids)
        ).delete(synchronize_session=False)

        # Also clean up tracking rows referencing these as original_job_id
        WorkPlanJobTracking.query.filter(
            WorkPlanJobTracking.original_job_id.in_(job_ids)
        ).update({'original_job_id': None}, synchronize_session=False)

        # 2. Assignments (cascade should handle, but be explicit for safety)
        WorkPlanAssignment.query.filter(
            WorkPlanAssignment.work_plan_job_id.in_(job_ids)
        ).delete(synchronize_session=False)

        # 3. Materials
        WorkPlanMaterial.query.filter(
            WorkPlanMaterial.work_plan_job_id.in_(job_ids)
        ).delete(synchronize_session=False)

        # 3b. Ratings — NOT NULL FK to work_plan_jobs. Previously missing, which
        # made clearing a week containing any rated job fail with an IntegrityError.
        from app.models.work_plan_job_rating import WorkPlanJobRating
        WorkPlanJobRating.query.filter(
            WorkPlanJobRating.work_plan_job_id.in_(job_ids)
        ).delete(synchronize_session=False)

        # 4. Now delete the jobs themselves
        from app.models.work_plan_job import WorkPlanJob as WPJ
        deleted = WPJ.query.filter(WPJ.id.in_(job_ids)).delete(synchronize_session=False)

        # 5. Reset SAP orders back to pending
        sap_reset = 0
        if scheduled_sap_numbers:
            sap_reset = SAPWorkOrder.query.filter(
                SAPWorkOrder.work_plan_id == plan.id,
                SAPWorkOrder.order_number.in_(scheduled_sap_numbers),
                SAPWorkOrder.status == 'scheduled',
            ).update({'status': 'pending'}, synchronize_session=False)

        db.session.commit()
        logger.info(f'clear_all_jobs | plan_id={plan.id} deleted={deleted} sap_reset={sap_reset} kept={len(kept)}')

        return jsonify({
            'status': 'ok',
            'deleted': deleted,
            'sap_orders_reset': sap_reset,
            'kept': len(kept),
            'kept_jobs': kept,
            'message': (f'Cleared {deleted}. Kept {len(kept)} job(s) that have work recorded.'
                        if kept else f'Cleared {deleted} job(s).'),
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f'Clear all jobs error: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@bp.route('/clear-pool/<week_start_str>', methods=['POST'])
@jwt_required()
@admin_decorator()
def clear_sap_pool(week_start_str):
    """Remove SAP orders that were imported into THIS week. Admin only, destructive.

    Deliberately does NOT empty the shared pool. Since the pool became one global
    box, "clear" would otherwise mean deleting every outstanding order in the
    yard from one week's screen — and the robot would refill it within ten
    minutes anyway, so the destruction would be both total and pointless.

    What it still does: remove orders stamped with this plan, i.e. legacy
    per-week imports and anything currently scheduled into this week. The
    response says plainly how many were removed and how many remain in the box.
    """
    try:
        week_date = datetime.strptime(week_start_str, '%Y-%m-%d').date()
        plan = WorkPlan.query.filter_by(week_start=week_date).first()
        if not plan:
            return jsonify({'status': 'no_plan'}), 404

        deleted = SAPWorkOrder.query.filter_by(work_plan_id=plan.id).delete()
        remaining = SAPWorkOrder.query.filter(
            SAPWorkOrder.work_plan_id.is_(None),
            SAPWorkOrder.status == 'pending',
        ).count()
        db.session.commit()

        return jsonify({
            'status': 'ok',
            'deleted': deleted,
            'remaining_in_pool': remaining,
            'message': (f'Removed {deleted} order(s) belonging to this week. '
                        f'{remaining} order(s) remain in the shared pool — those are '
                        f'outstanding work for the whole yard and are managed by the '
                        f'SAP sync, not by this button.'),
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f'Clear SAP pool error: {e}')
        return jsonify({
            'status': 'error',
            'message': 'Internal server error'
        }), 500


# ==================== WORK PLANS ====================

@bp.route('', methods=['GET'])
@jwt_required()
def list_work_plans():
    """
    List work plans with optional filtering.

    Query params:
        - week_start: Filter by specific week (YYYY-MM-DD)
        - status: Filter by status (draft, published)
        - include_days: Include day details (default false for list view)
    """
    user = get_current_user()
    language = get_language(user)

    week_start = request.args.get('week_start')
    status = request.args.get('status')
    include_days = request.args.get('include_days', 'false').lower() == 'true'

    # Use eager loading when include_days=True to prevent N+1 queries
    if include_days:
        query = WorkPlan.query.options(
            joinedload(WorkPlan.created_by),
            joinedload(WorkPlan.published_by),
            joinedload(WorkPlan.pdf_file),
            selectinload(WorkPlan.days).selectinload(WorkPlanDay.jobs).options(
                joinedload(WorkPlanJob.equipment),
                joinedload(WorkPlanJob.defect),
                joinedload(WorkPlanJob.cycle),
                joinedload(WorkPlanJob.pm_template),
                joinedload(WorkPlanJob.template),
                selectinload(WorkPlanJob.assignments).joinedload(WorkPlanAssignment.user),
                selectinload(WorkPlanJob.materials).joinedload(WorkPlanMaterial.material),
            )
        )
    else:
        query = WorkPlan.query.options(
            joinedload(WorkPlan.created_by),
            selectinload(WorkPlan.days)  # Just load days for job counts
        )

    if week_start:
        try:
            week_date = datetime.strptime(week_start, '%Y-%m-%d').date()
            query = query.filter(WorkPlan.week_start == week_date)
        except ValueError:
            raise ValidationError("Invalid date format. Use YYYY-MM-DD")

    if status:
        query = query.filter(WorkPlan.status == status)

    plans = query.order_by(WorkPlan.week_start.desc()).all()

    return jsonify({
        'status': 'success',
        'work_plans': [p.to_dict(language, include_days=include_days) for p in plans],
        'count': len(plans)
    }), 200


@bp.route('/<int:plan_id>', methods=['GET'])
@jwt_required()
def get_work_plan(plan_id):
    """Get a single work plan with full details."""
    # Use eager loading to prevent N+1 queries (critical for performance)
    plan = WorkPlan.query.options(
        joinedload(WorkPlan.created_by),
        joinedload(WorkPlan.published_by),
        joinedload(WorkPlan.pdf_file),
        selectinload(WorkPlan.days).selectinload(WorkPlanDay.jobs).options(
            joinedload(WorkPlanJob.equipment),
            joinedload(WorkPlanJob.defect),
            joinedload(WorkPlanJob.cycle),
            joinedload(WorkPlanJob.pm_template),
            joinedload(WorkPlanJob.template),
            selectinload(WorkPlanJob.assignments).joinedload(WorkPlanAssignment.user),
            selectinload(WorkPlanJob.materials).joinedload(WorkPlanMaterial.material),
        )
    ).filter_by(id=plan_id).first()

    if not plan:
        raise NotFoundError("Work plan not found")

    user = get_current_user()
    language = get_language(user)

    return jsonify({
        'status': 'success',
        'work_plan': plan.to_dict(language, include_days=True)
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
def create_work_plan():
    """
    Create a new work plan for a week. Engineers and admins only.

    Request body:
        {
            "week_start": "2026-02-09",  // Must be a Monday
            "notes": "Optional notes"
        }
    """
    user = engineer_or_admin_required()
    data = request.get_json()

    if not data or not data.get('week_start'):
        raise ValidationError("week_start is required")

    try:
        week_start = datetime.strptime(data['week_start'], '%Y-%m-%d').date()
    except ValueError:
        raise ValidationError("Invalid date format. Use YYYY-MM-DD")

    # Accept any start date — no longer forced to Monday
    # The plan runs 7 days from the selected start date

    week_end = week_start + timedelta(days=6)

    # Check if plan already exists for this week
    existing = WorkPlan.query.filter_by(week_start=week_start).first()
    if existing:
        raise ValidationError(f"A work plan already exists for week starting {week_start}")

    plan = WorkPlan(
        week_start=week_start,
        week_end=week_end,
        status='draft',
        created_by_id=user.id,
        notes=data.get('notes')
    )

    db.session.add(plan)
    db.session.flush()

    # Create days for the week
    for i in range(7):
        day_date = week_start + timedelta(days=i)
        day = WorkPlanDay(
            work_plan_id=plan.id,
            date=day_date
        )
        db.session.add(day)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Work plan created',
        'work_plan': plan.to_dict(user.language or 'en', include_days=True)
    }), 201


@bp.route('/<int:plan_id>', methods=['PUT'])
@jwt_required()
def update_work_plan(plan_id):
    """Update a work plan. Only draft plans can be updated."""
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot edit a published work plan")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    if 'notes' in data:
        plan.notes = data['notes']

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Work plan updated',
        'work_plan': plan.to_dict(user.language or 'en')
    }), 200


@bp.route('/<int:plan_id>', methods=['DELETE'])
@jwt_required()
def delete_work_plan(plan_id):
    """Delete a draft work plan. Published plans cannot be deleted."""
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot delete a published work plan")

    db.session.delete(plan)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Work plan deleted'
    }), 200


# ==================== JOBS ====================

@bp.route('/<int:plan_id>/jobs', methods=['POST'])
@jwt_required()
def add_job(plan_id):
    """
    Add a job to a work plan day. Engineers and admins only.

    Request body:
        {
            "day_id": 123,  // or "date": "2026-02-09"
            "job_type": "pm",  // pm, defect, inspection
            "berth": "east",  // east, west, both
            "equipment_id": 1,  // for pm/defect
            "defect_id": 5,  // for defect jobs
            "inspection_assignment_id": 10,  // for inspection jobs
            "sap_order_number": "1234567",
            "estimated_hours": 4.0,  // required
            "priority": "normal",
            "notes": "Optional notes"
        }
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot add jobs to a published work plan")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    # Get the day
    day = None
    if data.get('day_id'):
        day = db.session.get(WorkPlanDay, data['day_id'])
        if not day or day.work_plan_id != plan_id:
            raise NotFoundError("Day not found in this plan")
    elif data.get('date'):
        try:
            date = datetime.strptime(data['date'], '%Y-%m-%d').date()
        except ValueError:
            raise ValidationError("Invalid date format. Use YYYY-MM-DD")
        day = WorkPlanDay.query.filter_by(work_plan_id=plan_id, date=date).first()
        if not day:
            raise NotFoundError("Day not found in this plan")
    else:
        raise ValidationError("day_id or date is required")

    # Validate required fields
    if not data.get('job_type'):
        raise ValidationError("job_type is required")
    if data.get('estimated_hours') is None:
        raise ValidationError("estimated_hours is required")

    job_type = data['job_type']
    if job_type not in ['pm', 'defect', 'inspection', 'corrective']:
        raise ValidationError("job_type must be pm, defect, inspection, or corrective")

    # Validate references based on job type
    equipment_id = data.get('equipment_id')
    defect_id = data.get('defect_id')
    inspection_assignment_id = data.get('inspection_assignment_id')

    # Corrective = a field-found fix on a piece of equipment that is NOT tied to an
    # existing defect record. It needs equipment + a description, but no defect_id.
    if job_type in ['pm', 'defect', 'corrective'] and not equipment_id:
        raise ValidationError("equipment_id is required for PM, defect, and corrective jobs")

    if job_type == 'defect' and not defect_id:
        raise ValidationError("defect_id is required for defect jobs")

    if job_type == 'corrective' and not (data.get('description') or '').strip():
        raise ValidationError("description is required for corrective jobs")

    if job_type == 'inspection' and not inspection_assignment_id:
        raise ValidationError("inspection_assignment_id is required for inspection jobs")

    # Validate references exist
    if equipment_id:
        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            raise NotFoundError("Equipment not found")

    if defect_id:
        defect = db.session.get(Defect, defect_id)
        if not defect:
            raise NotFoundError("Defect not found")
        # Guard: a defect already assigned directly to a specialist must not
        # also be scheduled in a work plan (single home per defect).
        if _defect_ids_with_active_specialist_job([defect_id]):
            raise ValidationError(
                "This defect is already assigned to a specialist. "
                "Cancel that assignment first, or schedule a different defect."
            )

    if inspection_assignment_id:
        assignment = db.session.get(InspectionAssignment, inspection_assignment_id)
        if not assignment:
            raise NotFoundError("Inspection assignment not found")

    # For inspection jobs, always use the assignment's berth (east/west)
    # so the job lands in the correct column regardless of where the user dropped it
    effective_berth = data.get('berth')
    if inspection_assignment_id and assignment and assignment.berth:
        effective_berth = assignment.berth

    # Get next position
    max_position = db.session.query(db.func.max(WorkPlanJob.position)).filter_by(
        work_plan_day_id=day.id
    ).scalar() or 0

    # Validate difficulty if provided
    difficulty = data.get('difficulty')
    if difficulty and difficulty not in ('minor', 'major'):
        raise ValidationError("difficulty must be 'minor' or 'major'")
    # Default defect difficulty from severity so engineer-review points are accurate
    if not difficulty and job_type == 'defect' and defect is not None:
        difficulty = _difficulty_from_severity(defect.severity)

    # Validate engineer_id if provided
    engineer_id = data.get('engineer_id')
    if engineer_id:
        from app.models import User as UserModel
        eng = db.session.get(UserModel, engineer_id)
        if not eng or eng.role not in ('engineer', 'admin'):
            raise ValidationError("engineer_id must reference an engineer or admin user")

    # Auto-populate description from defect if not provided
    description = data.get('description')
    if not description and defect_id:
        defect_obj = db.session.get(Defect, defect_id)
        if defect_obj:
            description = defect_obj.description

    # Validate work_center if provided
    work_center = data.get('work_center')
    if work_center and work_center not in ('ELEC', 'MECH', 'ELME'):
        raise ValidationError("work_center must be ELEC, MECH, or ELME")

    job = WorkPlanJob(
        work_plan_day_id=day.id,
        job_type=job_type,
        berth=effective_berth,
        equipment_id=equipment_id,
        defect_id=defect_id,
        inspection_assignment_id=inspection_assignment_id,
        sap_order_number=data.get('sap_order_number'),
        description=description,
        estimated_hours=float(data['estimated_hours']),
        position=max_position + 1,
        priority=data.get('priority', 'normal'),
        notes=data.get('notes'),
        difficulty=difficulty,
        engineer_id=engineer_id,
        work_center=work_center,
    )

    db.session.add(job)
    db.session.flush()

    # Auto-attach material kit for PM jobs
    if job_type == 'pm' and equipment_id:
        try:
            from app.api.materials import find_matching_kit
            kit = find_matching_kit(equipment_id, data.get('cycle_id'))
            if kit and kit.items:
                for item in kit.items:
                    wpm = WorkPlanMaterial(
                        work_plan_job_id=job.id,
                        material_id=item.material_id,
                        quantity=item.quantity,
                        from_kit_id=kit.id
                    )
                    db.session.add(wpm)
        except Exception as e:
            import logging
            logging.getLogger('app').warning(f'Auto-kit attach failed: {e}')

    # Auto-add open defects for the same equipment (any job type triggers grouping)
    auto_defect_count = 0
    try:
        auto_defect_count = _auto_group_equipment_jobs(plan_id, day.id, equipment_id)
    except Exception as e:
        logger.warning(f'Auto-group defects failed: {e}')

    db.session.commit()

    msg = 'Job added to plan'
    if auto_defect_count:
        msg += f'. {auto_defect_count} related defect(s) auto-added to the same day.'

    return jsonify({
        'status': 'success',
        'message': msg,
        'job': job.to_dict(user.language or 'en'),
        'auto_added_defects': auto_defect_count,
    }), 201


@bp.route('/<int:plan_id>/schedule-sap-order', methods=['POST'])
@jwt_required()
def schedule_sap_order(plan_id):
    """
    Schedule a SAP order from the pool to a specific day.
    Creates a WorkPlanJob and marks the SAP order as scheduled.

    Request body:
        {
            "sap_order_id": 123,
            "day_id": 456,
            "position": 0  // optional
        }
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot add jobs to a published work plan")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    sap_order_id = data.get('sap_order_id')
    day_id = data.get('day_id')

    if not sap_order_id:
        raise ValidationError("sap_order_id is required")
    if not day_id:
        raise ValidationError("day_id is required")

    # Get the SAP order
    sap_order = db.session.get(SAPWorkOrder, sap_order_id)
    # An order is schedulable if it is waiting in the shared box (work_plan_id
    # NULL) or was imported into THIS week the old way. Requiring an exact plan
    # match would make every order in the global pool unschedulable — the pool
    # would list jobs the planner then could not place.
    if not sap_order or (sap_order.work_plan_id is not None
                         and sap_order.work_plan_id != plan_id):
        raise NotFoundError("SAP order not found in the pool")

    if sap_order.status != 'pending':
        raise ValidationError("SAP order has already been scheduled")

    # Get the day
    day = db.session.get(WorkPlanDay, day_id)
    if not day or day.work_plan_id != plan_id:
        raise NotFoundError("Day not found in this plan")

    # Get next position
    max_position = db.session.query(db.func.max(WorkPlanJob.position)).filter_by(
        work_plan_day_id=day.id
    ).scalar() or 0
    position = data.get('position', max_position + 1)

    # Find PM template if applicable
    pm_template = None
    pm_template_id = None
    if sap_order.job_type == 'pm' and sap_order.cycle_id:
        equipment = db.session.get(Equipment, sap_order.equipment_id)
        if equipment:
            pm_template = PMTemplate.find_for_job(equipment.equipment_type, sap_order.cycle_id)
            if pm_template:
                pm_template_id = pm_template.id

    # Create job from SAP order
    job = WorkPlanJob(
        work_plan_day_id=day.id,
        job_type=sap_order.job_type,
        berth=sap_order.berth,
        equipment_id=sap_order.equipment_id,
        sap_order_number=sap_order.order_number,
        sap_order_type=sap_order.order_type,
        description=sap_order.description,
        cycle_id=sap_order.cycle_id,
        pm_template_id=pm_template_id,
        overdue_value=sap_order.overdue_value,
        overdue_unit=sap_order.overdue_unit,
        maintenance_base=sap_order.maintenance_base,
        planned_date=sap_order.planned_date or sap_order.required_date,
        estimated_hours=sap_order.estimated_hours,
        position=position,
        priority=sap_order.priority,
        notes=sap_order.notes
    )

    db.session.add(job)
    db.session.flush()

    # Auto-add materials from PM template
    kit_attached = None
    if pm_template:
        for tm in pm_template.materials:
            wpm = WorkPlanMaterial(
                work_plan_job_id=job.id,
                material_id=tm.material_id,
                quantity=tm.quantity
            )
            db.session.add(wpm)

    # Auto-attach material kit (if no PM template materials, or as additional kit materials)
    if job.job_type == 'pm' and job.equipment_id:
        try:
            from app.api.materials import find_matching_kit
            kit = find_matching_kit(job.equipment_id, job.cycle_id)
            if kit and kit.items:
                # Get already-added material IDs to avoid duplicates
                existing_material_ids = {tm.material_id for tm in (pm_template.materials if pm_template else [])}
                for item in kit.items:
                    if item.material_id not in existing_material_ids:
                        wpm = WorkPlanMaterial(
                            work_plan_job_id=job.id,
                            material_id=item.material_id,
                            quantity=item.quantity,
                            from_kit_id=kit.id
                        )
                        db.session.add(wpm)
                kit_attached = kit
        except Exception as e:
            import logging
            logging.getLogger('app').warning(f'Auto-kit attach failed: {e}')

    # Mark SAP order as scheduled
    sap_order.status = 'scheduled'
    sap_order.work_plan_id = plan_id  # leaves the box, into this week

    # Auto-add open defects for same equipment
    auto_defect_count = 0
    try:
        auto_defect_count = _auto_group_equipment_jobs(plan_id, day.id, sap_order.equipment_id, exclude_sap_order_id=sap_order.id)
    except Exception as e:
        logger.warning(f'Auto-group jobs failed: {e}')

    db.session.commit()

    msg = 'SAP order scheduled'
    if auto_defect_count:
        msg += f'. {auto_defect_count} related defect(s) auto-added to the same day.'

    return jsonify({
        'status': 'success',
        'message': msg,
        'job': job.to_dict(user.language or 'en'),
        'auto_added_defects': auto_defect_count,
    }), 201


@bp.route('/<int:plan_id>/jobs/<int:job_id>', methods=['PUT'])
@jwt_required()
def update_job(plan_id, job_id):
    """Update a job in a work plan."""
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot edit jobs in a published work plan")

    job = db.session.get(WorkPlanJob, job_id)
    if not job or job.day.work_plan_id != plan_id:
        raise NotFoundError("Job not found in this plan")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    # Update fields
    if 'berth' in data:
        job.berth = data['berth']
    if 'estimated_hours' in data:
        job.estimated_hours = float(data['estimated_hours'])
    if 'priority' in data:
        job.priority = data['priority']
    if 'notes' in data:
        job.notes = data['notes']
    if 'position' in data:
        job.position = data['position']
    if 'sap_order_number' in data:
        job.sap_order_number = data['sap_order_number']
    if 'difficulty' in data:
        if data['difficulty'] and data['difficulty'] not in ('minor', 'major'):
            raise ValidationError("difficulty must be 'minor' or 'major'")
        job.difficulty = data['difficulty']
    if 'engineer_id' in data:
        engineer_id = data['engineer_id']
        if engineer_id:
            from app.models import User as UserModel
            eng = db.session.get(UserModel, engineer_id)
            if not eng or eng.role not in ('engineer', 'admin'):
                raise ValidationError("engineer_id must reference an engineer or admin user")
        job.engineer_id = engineer_id

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Job updated',
        'job': job.to_dict(user.language or 'en')
    }), 200


# Tracking statuses that mean a human actually did something on this job.
# 'pending' and 'not_started' are placeholders created alongside the job, so they
# do NOT count as work.
WORKED_TRACKING_STATUSES = ('in_progress', 'paused', 'completed', 'incomplete')

# Of those, the ones that are finished and must never leave the board — removing
# them would understate what the yard actually did that week.
FINISHED_TRACKING_STATUSES = ('completed', 'incomplete')


def job_work_state(job):
    """What a worker has actually done on this job, or None if untouched.

    Used to decide whether a job may be removed from a plan. Removing a worked
    job used to hard-DELETE its tracking row, assignments, checklist responses
    and materials — silently destroying the record of who did the work, how long
    it took, and what they found.

    Points and stars survive regardless (point_history / star_history key on
    users.id and carry no FK to the job), but the evidence behind them does not.
    """
    tracking = getattr(job, 'tracking', None)
    if tracking is not None and tracking.status in WORKED_TRACKING_STATUSES:
        return tracking.status

    # A rating without tracking shouldn't happen, but if it does the job has been
    # judged and is certainly not untouched.
    from app.models.work_plan_job_rating import WorkPlanJobRating
    if WorkPlanJobRating.query.filter_by(work_plan_job_id=job.id).first():
        return 'rated'
    return None


def assert_job_removable(job):
    """Refuse to remove a job that carries a record of real work.

    Deliberately a hard block rather than a warn-and-override: `work_plan_day_id`
    is NOT NULL, so there is nowhere for a job to live once it leaves a day. Until
    the job pool becomes a first-class place a job can sit (the "one big box"
    work), forcing a removal would mean deleting the record — the exact thing this
    is here to prevent.
    """
    state = job_work_state(job)
    if state is None:
        return
    if state in FINISHED_TRACKING_STATUSES or state == 'rated':
        raise ForbiddenError(
            f"Job #{job.id} is finished and cannot be removed from the plan. "
            "Finished work stays on the plan as a record of what was done."
        )
    raise ForbiddenError(
        f"Job #{job.id} has work in progress ({state}) and cannot be removed. "
        "Removing it would erase the worker's time, checklist and materials."
    )


def pool_orders_query(plan_id=None):
    """Every SAP order currently sitting in the job pool.

    The pool is ONE global box, not one box per week. `work_plan_id IS NULL`
    means "waiting in the box"; a value means the order is scheduled into that
    week. Both are matched so that orders imported the old way — into a specific
    week's pool — keep appearing exactly as they did before.

    Without the NULL branch a robot-fed order would belong to no week and be
    invisible everywhere. Without the plan branch every order imported before
    this change would vanish from the planner.
    """
    from sqlalchemy import or_

    query = SAPWorkOrder.query.filter(SAPWorkOrder.status == 'pending')
    if plan_id is None:
        return query.filter(SAPWorkOrder.work_plan_id.is_(None))
    return query.filter(or_(SAPWorkOrder.work_plan_id.is_(None),
                            SAPWorkOrder.work_plan_id == plan_id))


def _delete_job_record(plan_id, job):
    """Delete a single job from a plan, preserving pool semantics.

    Shared by remove_job (single) and bulk_delete_jobs (many) so both paths
    behave identically. Does NOT commit — the caller owns the transaction so a
    bulk delete is one commit instead of one per job.

    Raises ForbiddenError if the job carries a record of real work.
    """
    assert_job_removable(job)
    job_id = job.id

    # If the job came from a SAP order, reset it back to 'pending' so it reappears in the pool
    if job.sap_order_number:
        sap_order = SAPWorkOrder.query.filter_by(
            work_plan_id=plan_id,
            order_number=job.sap_order_number
        ).first()
        if sap_order and sap_order.status == 'scheduled':
            # Back into the shared box, not this week's — the job is outstanding
            # work again and belongs to whenever it gets done, not to the week it
            # happened to be pulled from.
            sap_order.status = 'pending'
            sap_order.work_plan_id = None
    # Otherwise, if it's a MANUAL PM or corrective job (not from SAP, not a defect),
    # preserve it by returning it to the pool as a pending SAP order — so a
    # manually-added job can be dragged back to the pool like any other job
    # instead of vanishing.
    elif job.job_type in ('pm', 'corrective') and not job.defect_id and job.equipment_id:
        manual_order_number = f"MAN-{plan_id}-{job_id}"
        existing_manual = SAPWorkOrder.query.filter_by(
            work_plan_id=plan_id, order_number=manual_order_number
        ).first()
        if not existing_manual:
            db.session.add(SAPWorkOrder(
                work_plan_id=plan_id,
                order_number=manual_order_number,
                order_type='MANUAL',
                job_type=job.job_type,
                equipment_id=job.equipment_id,
                description=job.description,
                estimated_hours=job.estimated_hours or 4.0,
                priority=job.priority or 'normal',
                berth=job.berth,
                cycle_id=job.cycle_id,
                maintenance_base=job.maintenance_base,
                work_center=getattr(job, 'work_center', None),
                notes=job.notes,
                status='pending',
            ))

    purge_job_rows(job)


# Every table whose rows die with a job.
#
# work_plan_job_ratings MUST be in this list. Its work_plan_job_id is a NOT NULL
# FK to work_plan_jobs. Omitting it broke differently per database: Postgres
# (production) enforced the FK and raised IntegrityError -> 500 with the job not
# removed; SQLite (tests, foreign_keys=0) deleted the job anyway and left the
# rating row dangling.
JOB_CHILD_TABLES = ('job_checklist_responses', 'work_plan_assignments',
                    'work_plan_materials', 'work_plan_job_ratings',
                    'work_plan_job_trackings')


def purge_job_rows(job):
    """Delete a job row and its children. Does NOT commit, and does NOT check safety.

    Split out of _delete_job_record so the robot's removal rules delete a job the
    same way the planner does. Callers own the decision about whether removal is
    allowed; this only carries it out.
    """
    job_id = job.id

    # Detach job from ORM session so SQLAlchemy never lazy-loads its child
    # relationships (job_checklist_responses has columns not yet in the DB).
    db.session.expunge(job)

    # Raw SQL — no ORM cascade, no lazy-load.
    for table in JOB_CHILD_TABLES:
        db.session.execute(
            db.text(f'DELETE FROM {table} WHERE work_plan_job_id = :jid'),
            {'jid': job_id}
        )
    db.session.execute(db.text('DELETE FROM work_plan_jobs WHERE id = :jid'), {'jid': job_id})


@bp.route('/<int:plan_id>/jobs/<int:job_id>', methods=['DELETE'])
@jwt_required()
def remove_job(plan_id, job_id):
    """Remove a job from a work plan."""
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot remove jobs from a published work plan")

    job = db.session.get(WorkPlanJob, job_id)
    if not job or job.day.work_plan_id != plan_id:
        raise NotFoundError("Job not found in this plan")

    _delete_job_record(plan_id, job)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Job removed from plan'
    }), 200


def _arabic_or_original(text, cached_ar, on_translated=None):
    """Return Arabic text for `text`, translating once and caching if needed.

    `cached_ar` is an already-stored Arabic translation (e.g.
    defect.description_ar). When it is empty we translate and hand the result to
    `on_translated` so the caller can persist it — every later request is then
    instant and free.

    Translation must never break the screen: any failure returns the original
    English rather than raising.
    """
    if not text:
        return text
    if cached_ar:
        return cached_ar
    try:
        from app.services.translation_service import TranslationService
        translated = TranslationService.translate_to_arabic(text)
        if translated and translated != text:
            if on_translated:
                on_translated(translated)
            return translated
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Arabic translation failed, serving English: {e}")
    return text


def _file_url(file_obj, raw_path=None):
    """Best available URL for an uploaded file.

    `File.get_url()` returns None for anything that is not already an absolute
    URL, so fall back to the stored path — older rows predate Cloudinary and keep
    the URL directly in `file_path` / the `*_path` column.
    """
    if file_obj:
        url = file_obj.get_url()
        if url:
            return url
        if file_obj.file_path:
            return file_obj.file_path
    return raw_path or None


def _defect_media(defect):
    """Photo / video / voice for a defect, falling back to the inspection answer.

    Defects raised from a FAILED CHECKLIST ITEM (`DefectService.create_from_failed_item`)
    never copy media onto the defect row — the photo, video and voice note stay on
    the `InspectionAnswer` for that item. Only the ad-hoc field-report path copies
    them across. So reading `defect.photo_url` alone returns nothing for exactly
    the "job came from an inspection finding" case.

    The answer lookup is keyed on inspection_id AND checklist_item_id. Matching on
    inspection_id alone would attach an unrelated question's photo to this defect;
    a NULL checklist_item_id (ad-hoc finding) is therefore never looked up — those
    defects already carry their own media.
    """
    media = {
        'photo_url': defect.photo_url,
        'video_url': None,
        'voice_note_url': defect.voice_note_url,
        'voice_transcription': None,
    }

    if not defect.inspection_id or defect.checklist_item_id is None:
        return media

    answer = InspectionAnswer.query.filter_by(
        inspection_id=defect.inspection_id,
        checklist_item_id=defect.checklist_item_id,
    ).first()
    if not answer:
        return media

    if not media['photo_url']:
        media['photo_url'] = _file_url(answer.photo_file, answer.photo_path)
    if not media['voice_note_url']:
        media['voice_note_url'] = _file_url(answer.voice_note)
    media['video_url'] = _file_url(answer.video_file, answer.video_path)
    # Already stored bilingual as {'en': ..., 'ar': ...} — no AI call needed.
    media['voice_transcription'] = answer.voice_transcription

    return media


@bp.route('/jobs/<int:job_id>/details', methods=['GET'])
@jwt_required()
def get_job_details(job_id):
    """Everything a worker needs to understand ONE job.

    Deliberately a separate endpoint rather than more fields on /my-plan: details
    are needed for one job at a time, and putting photos, voice URLs and
    translated text on every job in the week would undo the payload trimming done
    on 2026-08-08.

    `sap` and `defect` are null when not applicable — clients branch on presence,
    not on job_type strings.
    """
    user = get_current_user()
    # Must be get_language(), not user.language: `users.language` defaults to 'en'
    # and is only ever set by an admin editing the user, so a worker who switches
    # the app to Arabic still has 'en' stored. get_language() checks ?lang= and the
    # Accept-Language header the client actually sends, then falls back to the
    # stored preference.
    language = get_language(user)

    job = db.session.get(WorkPlanJob, job_id)
    if not job:
        raise NotFoundError("Job not found")

    # A worker may only open jobs they are assigned to; admins/engineers may open
    # any. Without this, job ids could be enumerated.
    if user.role not in ('admin', 'engineer'):
        assigned = any(a.user_id == user.id for a in job.assignments)
        if not assigned:
            raise ForbiddenError("You are not assigned to this job")

    want_ar = language == 'ar'

    def job_desc():
        # work_plan_jobs has no description_ar column, so this is translated per
        # request. Only the long-lived defect text is worth caching.
        return _arabic_or_original(job.description, None) if want_ar else job.description

    eq = job.equipment
    equipment = None
    if eq:
        equipment = {
            'id': eq.id,
            'name': eq.name,
            'name_ar': getattr(eq, 'name_ar', None),
            'serial_number': eq.serial_number,
            'equipment_type': getattr(eq, 'equipment_type', None),
            'equipment_type_ar': getattr(eq, 'equipment_type_ar', None),
            'location': getattr(eq, 'location', None),
            'location_ar': getattr(eq, 'location_ar', None),
        }

    sap = None
    if job.sap_order_number:
        sap = {
            'order_number': job.sap_order_number,
            'order_type': job.sap_order_type,
            'work_center': getattr(job, 'work_center', None),
            'maintenance_base': job.maintenance_base,
            'cycle': job.cycle.name if job.cycle else None,
        }

    defect = None
    if job.defect:
        d = job.defect

        def _cache_ar(translated):
            d.description_ar = translated
            db.session.commit()

        defect_desc = (
            _arabic_or_original(d.description, d.description_ar, _cache_ar)
            if want_ar else d.description
        )

        inspection = None
        if getattr(d, 'inspection', None):
            insp = d.inspection
            inspection = {
                'id': insp.id,
                'date': insp.created_at.date().isoformat() if insp.created_at else None,
                'inspector': insp.technician.full_name if getattr(insp, 'technician', None) else None,
            }

        media = _defect_media(d)

        # voice_transcription is stored bilingual; hand the worker their language
        # and fall back to whatever exists rather than showing nothing.
        transcription = None
        if isinstance(media['voice_transcription'], dict):
            transcription = (
                media['voice_transcription'].get(language)
                or media['voice_transcription'].get('en')
                or media['voice_transcription'].get('ar')
            )
        elif media['voice_transcription']:
            transcription = str(media['voice_transcription'])

        defect = {
            'id': d.id,
            'description': defect_desc,
            'description_en': d.description,
            'severity': d.severity,
            'category': d.category,
            'hazard_type': getattr(d, 'hazard_type', None),
            'report_source': getattr(d, 'report_source', None),
            'status': d.status,
            'due_date': d.due_date.isoformat() if d.due_date else None,
            'photo_url': media['photo_url'],
            'video_url': media['video_url'],
            'voice_note_url': media['voice_note_url'],
            'voice_transcription': transcription,
            'reported_by': d.reported_by.full_name if getattr(d, 'reported_by', None) else None,
            'inspection': inspection,
        }

    return jsonify({
        'status': 'success',
        'data': {
            'id': job.id,
            'job_type': job.job_type,
            'description': job_desc(),
            'description_en': job.description,
            'estimated_hours': job.estimated_hours,
            'planned_time_hours': float(job.planned_time_hours) if job.planned_time_hours is not None else None,
            'priority': job.priority,
            'berth': job.berth,
            'day_date': job.day.date.isoformat() if job.day and job.day.date else None,
            'notes': job.notes,
            'equipment': equipment,
            'sap': sap,
            'defect': defect,
            'assignments': [
                {
                    'user_id': a.user_id,
                    'full_name': a.user.full_name if a.user else None,
                    'is_lead': a.is_lead,
                }
                for a in job.assignments
            ],
        }
    }), 200


# ==================== BULK JOB OPERATIONS ====================
# Must mirror work_plan_jobs' check_job_priority CHECK constraint
# (app/models/work_plan_job.py). Kept here so an invalid value is rejected as a
# 400 before it reaches the database and surfaces as a 500.
VALID_JOB_PRIORITIES = {'low', 'normal', 'high', 'urgent'}

# Dragging a bundle (several jobs on the same equipment) used to fire one
# request per job from the web planner, so a 5-job bundle cost 5 round-trips,
# 5 commits and 5 full-plan refetches. These endpoints do the whole batch in
# one transaction so the planner stays responsive.

@bp.route('/<int:plan_id>/jobs/bulk-move', methods=['POST'])
@jwt_required()
def bulk_move_jobs(plan_id):
    """Move several jobs to the same target day in one transaction.

    Request body:
        {"job_ids": [1, 2, 3], "target_day_id": 42}
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot move jobs in a published work plan")

    data = request.get_json() or {}
    job_ids = data.get('job_ids')
    target_day_id = data.get('target_day_id')

    if not job_ids or not isinstance(job_ids, list):
        raise ValidationError("job_ids (non-empty list) is required")
    if not target_day_id:
        raise ValidationError("target_day_id is required")

    target_day = db.session.get(WorkPlanDay, target_day_id)
    if not target_day or target_day.work_plan_id != plan_id:
        raise NotFoundError("Target day not found in this plan")

    jobs = WorkPlanJob.query.filter(WorkPlanJob.id.in_(job_ids)).all()
    found_ids = {j.id for j in jobs}
    missing = [jid for jid in job_ids if jid not in found_ids]
    if missing:
        raise NotFoundError(f"Job(s) not found: {missing}")

    # Every job must already belong to this plan — never move another plan's jobs
    for job in jobs:
        if job.day.work_plan_id != plan_id:
            raise NotFoundError(f"Job {job.id} not found in this plan")

    # One MAX() query for the whole batch instead of one per job
    max_position = db.session.query(db.func.max(WorkPlanJob.position)).filter(
        WorkPlanJob.work_plan_day_id == target_day.id,
        ~WorkPlanJob.id.in_(job_ids)
    ).scalar() or 0

    moved = 0
    for job in jobs:
        if job.work_plan_day_id == target_day.id:
            continue  # already there — nothing to do
        job.work_plan_day_id = target_day.id
        max_position += 1
        job.position = max_position
        moved += 1

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Moved {moved} job(s) to {target_day.date.strftime("%A, %B %d")}',
        'moved': moved,
        'target_day_id': target_day.id
    }), 200


@bp.route('/<int:plan_id>/jobs/bulk-delete', methods=['POST'])
@jwt_required()
def bulk_delete_jobs(plan_id):
    """Remove several jobs from a plan in one transaction.

    Uses the same per-job semantics as remove_job (SAP orders return to
    'pending', manual PM/corrective jobs are preserved back into the pool).

    Request body:
        {"job_ids": [1, 2, 3]}
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot remove jobs from a published work plan")

    data = request.get_json() or {}
    job_ids = data.get('job_ids')

    if not job_ids or not isinstance(job_ids, list):
        raise ValidationError("job_ids (non-empty list) is required")

    jobs = WorkPlanJob.query.filter(WorkPlanJob.id.in_(job_ids)).all()
    found_ids = {j.id for j in jobs}
    missing = [jid for jid in job_ids if jid not in found_ids]
    if missing:
        raise NotFoundError(f"Job(s) not found: {missing}")

    for job in jobs:
        if job.day.work_plan_id != plan_id:
            raise NotFoundError(f"Job {job.id} not found in this plan")

    # Resolve every job's pool side-effects before any expunge/raw delete runs
    for job in jobs:
        _delete_job_record(plan_id, job)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Removed {len(jobs)} job(s) from plan',
        'deleted': len(jobs)
    }), 200


@bp.route('/<int:plan_id>/jobs/bulk-priority', methods=['POST'])
@jwt_required()
def bulk_update_priority(plan_id):
    """Set the same priority on several jobs in one transaction.

    Request body:
        {"job_ids": [1, 2, 3], "priority": "urgent"}
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot modify a published work plan")

    data = request.get_json() or {}
    job_ids = data.get('job_ids')
    priority = data.get('priority')

    if not job_ids or not isinstance(job_ids, list):
        raise ValidationError("job_ids (non-empty list) is required")
    if not priority:
        raise ValidationError("priority is required")

    # work_plan_jobs has CHECK check_job_priority — validate here so a bad value
    # is a clean 400 instead of an IntegrityError surfacing as a 500.
    if priority not in VALID_JOB_PRIORITIES:
        raise ValidationError(
            f"Invalid priority '{priority}'. Must be one of: {', '.join(sorted(VALID_JOB_PRIORITIES))}"
        )

    jobs = WorkPlanJob.query.filter(WorkPlanJob.id.in_(job_ids)).all()
    found_ids = {j.id for j in jobs}
    missing = [jid for jid in job_ids if jid not in found_ids]
    if missing:
        raise NotFoundError(f"Job(s) not found: {missing}")

    # Every job must already belong to this plan
    for job in jobs:
        if job.day.work_plan_id != plan_id:
            raise NotFoundError(f"Job {job.id} not found in this plan")

    for job in jobs:
        job.priority = priority

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Set priority "{priority}" on {len(jobs)} job(s)',
        'updated': len(jobs)
    }), 200


@bp.route('/<int:plan_id>/jobs/bulk-assign', methods=['POST'])
@jwt_required()
def bulk_assign_users(plan_id):
    """Assign user(s) to several jobs in one transaction.

    Used when a worker is dropped onto a whole bundle card in the web planner.
    Additive — never removes an existing assignment. No server-side leave
    check, matching single assign; the client warns instead.

    Request body:
        {"job_ids": [1, 2, 3], "user_ids": [7], "is_lead": true}
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot modify a published work plan")

    data = request.get_json() or {}
    job_ids = data.get('job_ids')
    user_ids = data.get('user_ids')
    is_lead = bool(data.get('is_lead', False))

    if not job_ids or not isinstance(job_ids, list):
        raise ValidationError("job_ids (non-empty list) is required")
    if not user_ids or not isinstance(user_ids, list):
        raise ValidationError("user_ids (non-empty list) is required")

    jobs = WorkPlanJob.query.filter(WorkPlanJob.id.in_(job_ids)).all()
    found_job_ids = {j.id for j in jobs}
    missing_jobs = [jid for jid in job_ids if jid not in found_job_ids]
    if missing_jobs:
        raise NotFoundError(f"Job(s) not found: {missing_jobs}")

    # Every job must already belong to this plan
    for job in jobs:
        if job.day.work_plan_id != plan_id:
            raise NotFoundError(f"Job {job.id} not found in this plan")

    users = User.query.filter(User.id.in_(user_ids)).all()
    found_user_ids = {u.id for u in users}
    missing_users = [uid for uid in user_ids if uid not in found_user_ids]
    if missing_users:
        raise NotFoundError(f"User(s) not found: {missing_users}")

    assigned = 0
    for job in jobs:
        for assigned_user in users:
            _assign_user_to_job(job.id, assigned_user.id, is_lead)
            assigned += 1

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Assigned {len(users)} user(s) to {len(jobs)} job(s)',
        'assigned': assigned
    }), 200


# ==================== ASSIGNMENTS ====================

def _assign_user_to_job(job_id, user_id, is_lead=None):
    """Assign one user to one job, or update their role if already assigned.

    Shared by assign_user (single) and bulk_assign_users (many) so the two can
    never drift apart. Does NOT commit — the caller owns the transaction, so a
    bulk assign is one commit instead of one per job.

    This update-else-create behaviour is what makes bundle assignment additive:
    dropping a worker on a bundle never removes anyone already on those jobs.

    is_lead=None means "leave an existing assignment's role unchanged", which
    matches the single-assign route (it only touches is_lead when the key is
    present in the request body). A newly created assignment defaults to False.
    """
    existing = WorkPlanAssignment.query.filter_by(
        work_plan_job_id=job_id,
        user_id=user_id
    ).first()

    if existing:
        if is_lead is not None:
            existing.is_lead = is_lead
        return existing

    assignment = WorkPlanAssignment(
        work_plan_job_id=job_id,
        user_id=user_id,
        is_lead=bool(is_lead),
    )
    db.session.add(assignment)
    return assignment


@bp.route('/<int:plan_id>/jobs/<int:job_id>/assignments', methods=['POST'])
@jwt_required()
def assign_user(plan_id, job_id):
    """
    Assign a user to a job.

    Request body:
        {
            "user_id": 5,
            "is_lead": false
        }
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot modify a published work plan")

    job = db.session.get(WorkPlanJob, job_id)
    if not job or job.day.work_plan_id != plan_id:
        raise NotFoundError("Job not found in this plan")

    data = request.get_json()
    if not data or not data.get('user_id'):
        raise ValidationError("user_id is required")

    assigned_user = db.session.get(User, data['user_id'])
    if not assigned_user:
        raise NotFoundError("User not found")

    # is_lead absent → leave an existing assignment's role untouched
    was_new = WorkPlanAssignment.query.filter_by(
        work_plan_job_id=job_id,
        user_id=data['user_id']
    ).first() is None

    assignment = _assign_user_to_job(job_id, data['user_id'], data.get('is_lead'))
    db.session.commit()

    if was_new:
        return jsonify({
            'status': 'success',
            'message': 'User assigned to job',
            'assignment': assignment.to_dict()
        }), 201

    return jsonify({
        'status': 'success',
        'message': 'Assignment updated',
        'assignment': assignment.to_dict()
    }), 200


@bp.route('/<int:plan_id>/jobs/<int:job_id>/assignments/<int:assignment_id>', methods=['DELETE'])
@jwt_required()
def unassign_user(plan_id, job_id, assignment_id):
    """Remove a user assignment from a job."""
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot modify a published work plan")

    assignment = db.session.get(WorkPlanAssignment, assignment_id)
    if not assignment or assignment.work_plan_job_id != job_id:
        raise NotFoundError("Assignment not found")

    db.session.delete(assignment)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'User unassigned from job'
    }), 200


# ==================== MATERIALS ====================

@bp.route('/<int:plan_id>/jobs/<int:job_id>/materials', methods=['POST'])
@jwt_required()
def add_material(plan_id, job_id):
    """
    Add a material to a job.

    Request body:
        {
            "material_id": 1,
            "quantity": 2.0,
            "from_kit_id": null  // Optional
        }

    OR add from kit:
        {
            "kit_id": 5
        }
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot modify a published work plan")

    job = db.session.get(WorkPlanJob, job_id)
    if not job or job.day.work_plan_id != plan_id:
        raise NotFoundError("Job not found in this plan")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    materials_added = []

    # Add from kit
    if data.get('kit_id'):
        kit = db.session.get(MaterialKit, data['kit_id'])
        if not kit:
            raise NotFoundError("Material kit not found")

        for item in kit.items:
            wpm = WorkPlanMaterial(
                work_plan_job_id=job_id,
                material_id=item.material_id,
                quantity=item.quantity,
                from_kit_id=kit.id
            )
            db.session.add(wpm)
            materials_added.append(wpm)

    # Add individual material
    elif data.get('material_id'):
        material = db.session.get(Material, data['material_id'])
        if not material:
            raise NotFoundError("Material not found")

        wpm = WorkPlanMaterial(
            work_plan_job_id=job_id,
            material_id=data['material_id'],
            quantity=data.get('quantity', 1),
            from_kit_id=data.get('from_kit_id')
        )
        db.session.add(wpm)
        materials_added.append(wpm)
    else:
        raise ValidationError("material_id or kit_id is required")

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Added {len(materials_added)} material(s) to job',
        'materials': [m.to_dict(user.language or 'en') for m in materials_added]
    }), 201


@bp.route('/<int:plan_id>/jobs/<int:job_id>/materials/<int:material_id>', methods=['DELETE'])
@jwt_required()
def remove_material(plan_id, job_id, material_id):
    """Remove a material from a job."""
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot modify a published work plan")

    wpm = db.session.get(WorkPlanMaterial, material_id)
    if not wpm or wpm.work_plan_job_id != job_id:
        raise NotFoundError("Material not found in this job")

    db.session.delete(wpm)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Material removed from job'
    }), 200


# ==================== PUBLISH ====================

@bp.route('/<int:plan_id>/publish', methods=['POST'])
@jwt_required()
def publish_plan(plan_id):
    """
    Publish a work plan. Generates PDF and sends notifications.

    Query params:
        - send_email: 'true' to send email to planning team (default true)
    """
    user = engineer_or_admin_required()

    send_email = request.args.get('send_email', 'true').lower() == 'true'

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Work plan is already published")

    # Validate plan has jobs
    if plan.get_total_jobs() == 0:
        raise ValidationError("Cannot publish an empty work plan")

    # Update status FIRST (fast — respond before heavy tasks)
    plan.status = 'published'
    plan.published_at = datetime.utcnow()
    plan.published_by_id = user.id

    # Send in-app notifications to all assigned users
    assigned_user_ids = set()
    for day in plan.days:
        for job in day.jobs:
            for assignment in job.assignments:
                assigned_user_ids.add(assignment.user_id)

    week_str = plan.week_start.strftime('%Y-%m-%d')
    for uid in assigned_user_ids:
        NotificationService.create_notification(
            user_id=uid,
            type='work_plan',
            title='Work Plan Published',
            message=f'A new work plan for week {week_str} has been published with jobs assigned to you.',
            related_type='work_plan',
            related_id=plan.id
        )

    db.session.commit()

    # Background: PDF, email, points (non-blocking — don't delay response)
    plan_id_for_bg = plan.id
    user_id_for_bg = user.id
    user_lang = user.language or 'en'
    # Capture the current app for the background thread
    from flask import current_app
    _app = current_app._get_current_object()

    def _publish_background_tasks():
        """Run PDF generation, email, and points in background thread."""
        with _app.app_context():
            _plan = db.session.get(WorkPlan, plan_id_for_bg)
            if not _plan:
                return

            # Generate PDF
            pdf_file = None
            try:
                from app.services.work_plan_pdf_service import WorkPlanPDFService
                pdf_file = WorkPlanPDFService.generate_plan_pdf(_plan)
                _plan.pdf_file_id = pdf_file.id if pdf_file else None
                db.session.commit()
                if pdf_file:
                    logger.info(f"PDF generated OK for plan {plan_id_for_bg}: file_id={pdf_file.id}")
                else:
                    logger.warning(f"PDF generation returned None for plan {plan_id_for_bg}")
            except Exception as e:
                import traceback
                logger.error(f"PDF generation failed for plan {plan_id_for_bg}: {e}\n{traceback.format_exc()}")

            # Send email
            if send_email:
                try:
                    from app.services.email_service import EmailService
                    EmailService.send_work_plan_notification(_plan, pdf_file)

                    # Materials email to store team
                    import os
                    store_emails = [e.strip() for e in os.getenv('STORE_EMAILS', '').split(',') if e.strip()]
                    if store_emails:
                        mat_totals = {}
                        for day in _plan.days:
                            for job in day.jobs:
                                for wpm in (job.materials or []):
                                    mid = wpm.material_id
                                    if mid not in mat_totals:
                                        mat_totals[mid] = {
                                            'code': wpm.material.code if wpm.material else '',
                                            'name': wpm.material.name if wpm.material else '',
                                            'unit': wpm.material.unit if wpm.material else '',
                                            'location': wpm.material.storage_location if (wpm.material and hasattr(wpm.material, 'storage_location')) else None,
                                            'total_qty': 0,
                                        }
                                    mat_totals[mid]['total_qty'] += (wpm.quantity or 0)
                        materials_summary = sorted(mat_totals.values(), key=lambda x: x['code'])
                        if materials_summary:
                            EmailService.send_store_materials_notification(_plan, materials_summary, store_emails)
                except Exception as e:
                    logger.error(f"Email notification failed: {e}")

            # Award points
            try:
                from app.services.leaderboard_ai_service import LeaderboardAIService
                lb = LeaderboardAIService()
                lb.award_engineer_points(user_id_for_bg, 'publish_plan', f'week {week_str}')
            except Exception as e:
                logger.warning(f"Engineer publish points failed: {e}")

    import threading
    threading.Thread(target=_publish_background_tasks, daemon=True).start()

    return jsonify({
        'status': 'success',
        'message': 'Work plan published. PDF and email notifications are being processed.',
    }), 200


@bp.route('/<int:plan_id>/revise', methods=['POST'])
@jwt_required()
def revise_plan(plan_id):
    """
    Revert a published work plan back to draft for editing.
    Only admins and engineers can revise.
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status != 'published':
        raise ValidationError("Only published plans can be revised")

    plan.status = 'draft'

    # Notify assigned users about the revision
    assigned_user_ids = set()
    for day in plan.days:
        for job in day.jobs:
            for assignment in job.assignments:
                assigned_user_ids.add(assignment.user_id)

    week_str = plan.week_start.strftime('%Y-%m-%d')
    for uid in assigned_user_ids:
        NotificationService.create_notification(
            user_id=uid,
            type='work_plan',
            title='Work Plan Under Revision',
            message=f'The work plan for week {week_str} is being revised. Changes may be coming.',
            related_type='work_plan',
            related_id=plan.id
        )

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Work plan reverted to draft for editing',
        'work_plan': plan.to_dict(user.language or 'en')
    }), 200


# ==================== MY PLAN ====================

@bp.route('/my-plan', methods=['GET'])
@jwt_required()
def get_my_plan():
    """
    Get the current user's assigned jobs for a week.
    Optimized to include tracking data and use eager loading.

    Query params:
        - week_start: Week to get (YYYY-MM-DD), defaults to current week
    """
    from sqlalchemy.orm import joinedload

    user = get_current_user()
    # Must be get_language(), not user.language: `users.language` defaults to 'en'
    # and is only ever set by an admin editing the user, so a worker who switched
    # the app to Arabic still had 'en' stored and this whole screen came back in
    # English. Same reasoning as get_job_details().
    language = get_language(user)
    want_ar = language == 'ar'

    week_start = request.args.get('week_start')
    if week_start:
        try:
            week_date = datetime.strptime(week_start, '%Y-%m-%d').date()
        except ValueError:
            raise ValidationError("Invalid date format. Use YYYY-MM-DD")
    else:
        week_date = datetime.utcnow().date()

    # Plans can start on any day of the week (e.g., Sunday from the web
    # planner), so match the published plan whose date range contains the
    # requested date instead of requiring an exact Monday week_start.
    # Optimized query with eager loading to prevent N+1 issues
    plan = WorkPlan.query.options(
        joinedload(WorkPlan.days)
        .joinedload(WorkPlanDay.jobs)
        .joinedload(WorkPlanJob.assignments),
        joinedload(WorkPlan.days)
        .joinedload(WorkPlanDay.jobs)
        .joinedload(WorkPlanJob.equipment),
        joinedload(WorkPlan.days)
        .joinedload(WorkPlanDay.jobs)
        .joinedload(WorkPlanJob.defect),
        joinedload(WorkPlan.days)
        .joinedload(WorkPlanDay.jobs)
        .joinedload(WorkPlanJob.tracking),
        joinedload(WorkPlan.pdf_file),
    ).filter(
        WorkPlan.week_start <= week_date,
        WorkPlan.week_end >= week_date,
        WorkPlan.status == 'published',
    ).order_by(WorkPlan.week_start.desc()).first()

    if not plan:
        return jsonify({
            'status': 'success',
            'message': 'No published plan for this week',
            'work_plan': None,
            'my_jobs': [],
            'total_jobs': 0
        }), 200

    # Get user's assigned jobs with minimal data + tracking
    my_jobs = []
    for day in plan.days:
        day_jobs = []
        for job in day.jobs:
            for assignment in job.assignments:
                if assignment.user_id == user.id:
                    # Build compact job dict with only essential data
                    job_dict = {
                        'id': job.id,
                        'job_type': job.job_type,
                        'berth': job.berth,
                        'equipment_id': job.equipment_id,
                        'equipment': {
                            'id': job.equipment.id,
                            # Swapped in place so the job card needs no client
                            # change. Only the CACHED translation is served here:
                            # this endpoint renders a whole week of jobs, and
                            # translating each one would put the entire screen
                            # behind a flaky external API. get_job_details() is
                            # what fills description_ar, one job at a time.
                            'name': (job.equipment.name_ar
                                     if want_ar and job.equipment.name_ar
                                     else job.equipment.name),
                            'serial_number': job.equipment.serial_number
                        } if job.equipment else None,
                        'defect_id': job.defect_id,
                        'defect': {
                            'id': job.defect.id,
                            'description': (job.defect.description_ar
                                            if want_ar and job.defect.description_ar
                                            else job.defect.description),
                            'status': job.defect.status
                        } if job.defect else None,
                        'sap_order_number': job.sap_order_number,
                        'description': job.description,
                        'estimated_hours': job.estimated_hours,
                        'planned_time_hours': float(job.planned_time_hours) if job.planned_time_hours is not None else None,
                        'has_planned_time': job.has_planned_time(),
                        'priority': job.priority,
                        'notes': job.notes,
                        'checklist_required': job.checklist_required,
                        'checklist_completed': job.checklist_completed,
                        'completion_photo_required': job.completion_photo_required,
                        'is_lead': assignment.is_lead,
                        'day_date': day.date.isoformat(),
                        'day_name': day.date.strftime('%A'),
                        'assignments': [
                            {
                                'id': a.id,
                                'user_id': a.user_id,
                                'user_name': a.user.full_name if a.user else None,
                                'is_lead': a.is_lead
                            } for a in job.assignments
                        ],
                    }

                    # Add tracking info if exists
                    if job.tracking:
                        t = job.tracking
                        job_dict['tracking'] = {
                            'id': t.id,
                            'status': t.status,
                            'started_at': (t.started_at.isoformat() + 'Z') if t.started_at else None,
                            'paused_at': (t.paused_at.isoformat() + 'Z') if t.paused_at else None,
                            'completed_at': (t.completed_at.isoformat() + 'Z') if t.completed_at else None,
                            'total_paused_minutes': t.total_paused_minutes or 0,
                            'actual_hours': float(t.actual_hours) if t.actual_hours else None,
                            'is_running': t.is_running(),
                            'is_paused': t.is_paused(),
                            'work_notes': t.work_notes,
                        }
                    else:
                        job_dict['tracking'] = None

                    day_jobs.append(job_dict)
                    break

        if day_jobs:
            my_jobs.append({
                'date': day.date.isoformat(),
                'day_name': day.date.strftime('%A'),
                'jobs': day_jobs
            })

    return jsonify({
        'status': 'success',
        'work_plan': {
            'id': plan.id,
            'week_start': plan.week_start.isoformat(),
            'week_end': plan.week_end.isoformat(),
            'status': plan.status,
            'pdf_url': plan.pdf_file.get_url() if plan.pdf_file else None
        },
        'my_jobs': my_jobs,
        'total_jobs': sum(len(d['jobs']) for d in my_jobs)
    }), 200


# ==================== MOVE JOB (Drag & Drop) ====================

@bp.route('/<int:plan_id>/jobs/<int:job_id>/move', methods=['POST'])
@jwt_required()
def move_job(plan_id, job_id):
    """
    Move a job to a different day (for drag & drop rescheduling).

    Request body:
        {
            "target_day_id": 123,
            "position": 0,  // Optional, for ordering within the day
            "start_time": "08:00"  // Optional, for timeline positioning
        }
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot move jobs in a published work plan")

    job = db.session.get(WorkPlanJob, job_id)
    if not job or job.day.work_plan_id != plan_id:
        raise NotFoundError("Job not found in this plan")

    data = request.get_json()
    if not data or not data.get('target_day_id'):
        raise ValidationError("target_day_id is required")

    target_day = db.session.get(WorkPlanDay, data['target_day_id'])
    if not target_day or target_day.work_plan_id != plan_id:
        raise NotFoundError("Target day not found in this plan")

    # Move to new day
    old_day_id = job.work_plan_day_id
    job.work_plan_day_id = target_day.id

    # Update position if provided
    if 'position' in data:
        job.position = data['position']
    else:
        # Get next position on target day
        max_position = db.session.query(db.func.max(WorkPlanJob.position)).filter(
            WorkPlanJob.work_plan_day_id == target_day.id,
            WorkPlanJob.id != job_id
        ).scalar() or 0
        job.position = max_position + 1

    # Update start_time if provided (for timeline view)
    if 'start_time' in data and data['start_time']:
        try:
            job.start_time = datetime.strptime(data['start_time'], '%H:%M').time()
            # Calculate end_time based on estimated_hours
            start_minutes = job.start_time.hour * 60 + job.start_time.minute
            end_minutes = start_minutes + int(job.estimated_hours * 60)
            end_hour = min(end_minutes // 60, 23)
            end_minute = end_minutes % 60
            job.end_time = datetime.strptime(f'{end_hour:02d}:{end_minute:02d}', '%H:%M').time()
        except ValueError:
            pass  # Ignore invalid time format

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Job moved to {target_day.date.strftime("%A, %B %d")}',
        'job': job.to_dict(user.language or 'en'),
        'old_day_id': old_day_id,
        'new_day_id': target_day.id
    }), 200


# ==================== SAP IMPORT ====================

@bp.route('/import-sap', methods=['POST'])
@jwt_required()
def import_sap_orders():
    """
    Import SAP work orders from Excel file.

    Expected columns:
        - order_number: SAP order number (required)
        - type: PRM (Preventive Maintenance), COM (Corrective Maintenance), INS (Inspection) (required)
        - equipment_code: Equipment serial number (required)
        - date: Target date YYYY-MM-DD (required)
        - estimated_hours: Estimated hours (required)
        - description: Job description (optional)
        - cycle_value: Cycle value e.g. 250, 500 (optional, for PM)
        - cycle_unit: 'hours' or 'days/weeks/months' (optional)
        - maintenance_base: running_hours, calendar, condition (optional)
        - priority: low, normal, high, urgent (optional)
        - overdue_value: Hours or days overdue (optional)
        - overdue_unit: 'hours' or 'days' (optional)
        - planned_date: Original planned date (optional)
        - note: Additional notes (optional)

    Request params:
        - plan_id: Work plan ID to import into
    """
    user = engineer_or_admin_required()

    plan_id = request.args.get('plan_id')
    if not plan_id:
        raise ValidationError("plan_id is required")

    plan = db.session.get(WorkPlan, int(plan_id))
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot import into a published work plan")

    if 'file' not in request.files:
        raise ValidationError("No file uploaded")

    file = request.files['file']
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise ValidationError("File must be Excel format (.xlsx or .xls)")

    try:
        import pandas as pd
        df = pd.read_excel(BytesIO(file.read()))
        # Normalize column names
        df.columns = [str(c).strip().lower().replace(' ', '_') for c in df.columns]
    except Exception as e:
        raise ValidationError(f"Failed to read Excel file: {str(e)}")

    required_columns = ['order_number', 'type', 'equipment_code', 'date', 'estimated_hours']
    # Also accept equipment_serial as alternative to equipment_code
    if 'equipment_serial' in df.columns and 'equipment_code' not in df.columns:
        df['equipment_code'] = df['equipment_serial']

    missing = [c for c in required_columns if c not in df.columns]
    if missing:
        raise ValidationError(f"Missing required columns: {', '.join(missing)}")

    created = 0
    skipped = 0
    errors = []

    for idx, row in df.iterrows():
        try:
            order_number = str(row['order_number']).strip()
            job_type_raw = str(row['type']).strip().upper()
            equipment_code = str(row['equipment_code']).strip()
            date_str = str(row['date']).strip()

            # Parse estimated_hours (optional now, default to 4)
            try:
                estimated_hours = float(row['estimated_hours']) if pd.notna(row.get('estimated_hours')) else 4.0
            except:
                estimated_hours = 4.0

            # Map SAP type to our job type
            if job_type_raw in ['PRM', 'PM', 'PM01', 'PM02', 'PM03']:
                job_type = 'pm'
            elif job_type_raw in ['COM', 'CM', 'CM01', 'CM02']:
                job_type = 'defect'
            elif job_type_raw in ['INS', 'INSP']:
                job_type = 'inspection'
            else:
                job_type = 'pm'  # Default unknown to PM

            # Parse date
            try:
                if hasattr(row['date'], 'date'):
                    required_date = row['date'].date()
                else:
                    required_date = datetime.strptime(date_str[:10], '%Y-%m-%d').date()
            except:
                errors.append(f"Row {idx + 2}: Invalid date format")
                continue

            # Find equipment
            equipment = Equipment.query.filter(
                db.or_(
                    Equipment.serial_number == equipment_code,
                    Equipment.name == equipment_code
                )
            ).first()
            if not equipment:
                errors.append(f"Row {idx + 2}: Equipment '{equipment_code}' not found")
                continue

            # Check if order already exists in staging
            existing = SAPWorkOrder.query.filter_by(
                work_plan_id=plan.id,
                order_number=order_number
            ).first()
            if existing:
                skipped += 1
                continue

            # Parse optional fields
            priority = str(row.get('priority', 'normal')).lower() if pd.notna(row.get('priority')) else 'normal'
            if priority not in ['low', 'normal', 'high', 'urgent']:
                priority = 'normal'

            description = str(row.get('description', '')).strip() if pd.notna(row.get('description')) else None
            notes = str(row.get('note', '')).strip() if pd.notna(row.get('note')) else None
            if not notes:
                notes = str(row.get('notes', '')).strip() if pd.notna(row.get('notes')) else None
            maintenance_base = str(row.get('maintenance_base', '')).strip() if pd.notna(row.get('maintenance_base')) else None

            # Parse work_center: ELEC, MECH, or ELME (both)
            work_center = None
            if pd.notna(row.get('work_center')):
                wc_raw = str(row['work_center']).strip().upper()
                if wc_raw in ('ELEC', 'MECH', 'ELME'):
                    work_center = wc_raw
                elif wc_raw in ('E', 'ELECTRICAL'):
                    work_center = 'ELEC'
                elif wc_raw in ('M', 'MECHANICAL'):
                    work_center = 'MECH'
                elif wc_raw in ('B', 'BOTH', 'EM', 'ME'):
                    work_center = 'ELME'

            # Parse cycle info
            cycle_id = None
            if job_type == 'pm' and pd.notna(row.get('cycle_value')):
                try:
                    cycle_value = int(float(row['cycle_value']))
                    cycle_unit = str(row.get('cycle_unit', '')).lower().strip() if pd.notna(row.get('cycle_unit')) else None
                    if cycle_unit in ['hours', 'h', 'hour']:
                        cycle = MaintenanceCycle.query.filter_by(cycle_type='running_hours', hours_value=cycle_value, is_active=True).first()
                    else:
                        cycle = MaintenanceCycle.query.filter_by(cycle_type='running_hours', hours_value=cycle_value, is_active=True).first()
                    if cycle:
                        cycle_id = cycle.id
                except:
                    pass

            # Parse overdue info
            overdue_value = None
            overdue_unit = None
            if pd.notna(row.get('overdue_value')):
                try:
                    overdue_value = float(row['overdue_value'])
                    overdue_unit = str(row.get('overdue_unit', 'hours')).lower().strip() if pd.notna(row.get('overdue_unit')) else 'hours'
                except:
                    pass

            # Parse planned_date
            planned_date = None
            if pd.notna(row.get('planned_date')):
                try:
                    if hasattr(row['planned_date'], 'date'):
                        planned_date = row['planned_date'].date()
                    else:
                        planned_date = datetime.strptime(str(row['planned_date'])[:10], '%Y-%m-%d').date()
                except:
                    pass

            # Create SAP work order in staging (pool)
            sap_order = SAPWorkOrder(
                work_plan_id=plan.id,
                order_number=order_number,
                order_type=job_type_raw,
                job_type=job_type,
                equipment_id=equipment.id,
                description=description,
                estimated_hours=estimated_hours,
                priority=priority,
                berth=equipment.berth,
                cycle_id=cycle_id,
                maintenance_base=maintenance_base,
                required_date=required_date,
                planned_date=planned_date,
                overdue_value=overdue_value,
                overdue_unit=overdue_unit,
                notes=notes,
                work_center=work_center,
                status='pending'
            )

            db.session.add(sap_order)
            created += 1

        except Exception as e:
            errors.append(f"Row {idx + 2}: {str(e)}")

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Import complete. Added {created} orders to pool.',
        'created': created,
        'skipped': skipped,
        'errors': errors
    }), 200


# ==================== DAY INSPECTIONS (Read-Only Visibility) ====================

@bp.route('/day-inspections', methods=['GET'])
@jwt_required()
def get_day_inspections():
    """
    Get inspection assignments for a given date, grouped by berth.
    Used for read-only visibility in the work plan.
    """
    from app.models.inspection_assignment import InspectionAssignment
    from app.models.inspection_list import InspectionList
    from datetime import date as date_type

    date_str = request.args.get('date')
    berth_filter = request.args.get('berth')  # optional: 'east' or 'west'

    if not date_str:
        return jsonify({'status': 'error', 'message': 'date parameter required'}), 400

    try:
        target_date = date_type.fromisoformat(date_str)
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid date format (use YYYY-MM-DD)'}), 400

    # Query inspection assignments for the target date (eager-load relationships to avoid N+1)
    query = db.session.query(InspectionAssignment).join(
        InspectionList, InspectionAssignment.inspection_list_id == InspectionList.id
    ).options(
        joinedload(InspectionAssignment.equipment),
        joinedload(InspectionAssignment.mechanical_inspector),
        joinedload(InspectionAssignment.electrical_inspector),
        joinedload(InspectionAssignment.engineer),
    ).filter(InspectionList.target_date == target_date)

    assignments = query.all()

    result = {'east': {'count': 0, 'assignments': []}, 'west': {'count': 0, 'assignments': []}}

    for a in assignments:
        try:
            # Determine berth from equipment or assignment
            eq = a.equipment
            berth = getattr(a, 'berth', None) or getattr(eq, 'berth', None) or 'east'
            if isinstance(berth, str):
                berth = berth.lower()
            if berth not in ('east', 'west'):
                berth = 'east'

            if berth_filter and berth != berth_filter:
                continue

            # Get inspector/engineer names via relationships
            mech_name = a.mechanical_inspector.full_name if a.mechanical_inspector else None
            elec_name = a.electrical_inspector.full_name if a.electrical_inspector else None
            eng_name = a.engineer.full_name if a.engineer else None

            entry = {
                'equipment_name': eq.name if eq else 'Unknown',
                'equipment_serial': eq.serial_number if eq else None,
                'equipment_type': getattr(eq, 'equipment_type', None) or getattr(eq, 'equipment_type_2', None) or '',
                'status': a.status or 'unassigned',
                'mechanical_inspector': mech_name,
                'electrical_inspector': elec_name,
                'engineer': eng_name,
                'shift': getattr(a, 'shift', 'day') or 'day',
            }

            result[berth]['assignments'].append(entry)
            result[berth]['count'] += 1
        except Exception as e:
            logger.error(f"Error processing inspection assignment {a.id}: {e}")
            continue

    return jsonify({'status': 'success', 'data': result}), 200


def _inspection_berth(assignment):
    """Resolve an assignment's berth, defaulting to east."""
    eq = assignment.equipment
    berth = getattr(assignment, 'berth', None) or getattr(eq, 'berth', None) or 'east'
    if isinstance(berth, str):
        berth = berth.lower()
    return berth if berth in ('east', 'west') else 'east'


def _inspection_entry(assignment):
    """One row of the inspection summary. Shared by the day and week endpoints
    so the two can never drift apart."""
    eq = assignment.equipment
    return {
        'equipment_name': eq.name if eq else 'Unknown',
        'equipment_serial': eq.serial_number if eq else None,
        'equipment_type': getattr(eq, 'equipment_type', None) or getattr(eq, 'equipment_type_2', None) or '',
        'status': assignment.status or 'unassigned',
        'mechanical_inspector': assignment.mechanical_inspector.full_name if assignment.mechanical_inspector else None,
        'electrical_inspector': assignment.electrical_inspector.full_name if assignment.electrical_inspector else None,
        'engineer': assignment.engineer.full_name if assignment.engineer else None,
        'shift': getattr(assignment, 'shift', 'day') or 'day',
    }


@bp.route('/week-inspections', methods=['GET'])
@jwt_required()
def get_week_inspections():
    """Inspection assignments for a DATE RANGE, grouped by date then berth.

    The web planner renders one summary bar per day column, which previously
    meant seven separate /day-inspections requests per page load — measured, and
    the single biggest source of latency on that screen from a distant region.
    This returns the whole range in one request.

    /day-inspections is deliberately left untouched: the mobile app (including
    builds already installed on phones) still uses it.

    Query params:
        - start: YYYY-MM-DD (required)
        - end:   YYYY-MM-DD (required)
        - berth: optional 'east' or 'west'

    Response data shape:
        {"2026-08-09": {"east": {"count": n, "assignments": [...]},
                        "west": {"count": n, "assignments": [...]}}, ...}
    """
    from app.models.inspection_assignment import InspectionAssignment
    from app.models.inspection_list import InspectionList
    from datetime import date as date_type, timedelta as _timedelta

    start_str = request.args.get('start')
    end_str = request.args.get('end')
    berth_filter = request.args.get('berth')

    if not start_str or not end_str:
        return jsonify({'status': 'error', 'message': 'start and end parameters required'}), 400

    try:
        start_date = date_type.fromisoformat(start_str)
        end_date = date_type.fromisoformat(end_str)
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid date format (use YYYY-MM-DD)'}), 400

    if end_date < start_date:
        return jsonify({'status': 'error', 'message': 'end must not be before start'}), 400
    if (end_date - start_date).days > 31:
        return jsonify({'status': 'error', 'message': 'Range too large (max 31 days)'}), 400

    assignments = db.session.query(InspectionAssignment).join(
        InspectionList, InspectionAssignment.inspection_list_id == InspectionList.id
    ).options(
        joinedload(InspectionAssignment.equipment),
        joinedload(InspectionAssignment.mechanical_inspector),
        joinedload(InspectionAssignment.electrical_inspector),
        joinedload(InspectionAssignment.engineer),
        joinedload(InspectionAssignment.inspection_list),
    ).filter(
        InspectionList.target_date >= start_date,
        InspectionList.target_date <= end_date,
    ).all()

    # Pre-seed every date in the range so the client gets a predictable shape
    result = {}
    cursor = start_date
    while cursor <= end_date:
        result[cursor.isoformat()] = {
            'east': {'count': 0, 'assignments': []},
            'west': {'count': 0, 'assignments': []},
        }
        cursor += _timedelta(days=1)

    for a in assignments:
        try:
            berth = _inspection_berth(a)
            if berth_filter and berth != berth_filter:
                continue
            day_key = a.inspection_list.target_date.isoformat()
            if day_key not in result:
                continue
            result[day_key][berth]['assignments'].append(_inspection_entry(a))
            result[day_key][berth]['count'] += 1
        except Exception as e:
            logger.error(f"Error processing inspection assignment {a.id}: {e}")
            continue

    return jsonify({'status': 'success', 'data': result}), 200


@bp.route('/day-inspection-equipment', methods=['GET'])
@jwt_required()
def get_day_inspection_equipment():
    """
    Returns list of equipment_ids that have inspections on a given date.
    Used for the inspection badge on PM/defect job cards.
    """
    from app.models.inspection_assignment import InspectionAssignment
    from app.models.inspection_list import InspectionList
    from datetime import date as date_type

    date_str = request.args.get('date')
    if not date_str:
        return jsonify({'status': 'error', 'message': 'date parameter required'}), 400

    try:
        target_date = date_type.fromisoformat(date_str)
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid date format'}), 400

    equipment_ids = db.session.query(InspectionAssignment.equipment_id).join(
        InspectionList, InspectionAssignment.inspection_list_id == InspectionList.id
    ).filter(
        InspectionList.target_date == target_date,
        InspectionAssignment.equipment_id.isnot(None)
    ).distinct().all()

    return jsonify({'status': 'success', 'data': [eid for (eid,) in equipment_ids]}), 200


# ==================== AVAILABLE JOBS ====================

@bp.route('/available-jobs', methods=['GET'])
@jwt_required()
def get_available_jobs():
    """
    Get available jobs that can be added to a work plan.
    Returns SAP orders (from pool), open defects, and PM-due equipment.

    Query params:
        - berth: Filter by berth (east, west)
        - job_type: Filter by type (pm, defect, inspection, sap)
        - plan_id: Required for SAP orders - get orders for specific plan
    """
    user = get_current_user()
    language = get_language(user)

    berth = request.args.get('berth')
    job_type = request.args.get('job_type')
    plan_id = request.args.get('plan_id')

    result = {
        'pm_jobs': [],
        'defect_jobs': [],
        'inspection_jobs': [],
        'sap_orders': []
    }

    # Get pending SAP orders from pool (most important - show first)
    #
    # plan_id is OPTIONAL. It used to be required, from when every week owned
    # its own pool and there was nothing to show without one. The pool is now a
    # single global box that exists whether or not a week has been created, so
    # gating on plan_id left the planner showing an empty pool while the box
    # held 202 jobs — and the only way to see them was to create a plan first.
    #
    # With a plan_id the answer is additionally narrowed to that week: orders
    # already placed on one of its days drop out, so the pool shows what is
    # still available to drag rather than what is already placed.
    if not job_type or job_type in ['sap', 'pm', 'defect']:
        sap_query = pool_orders_query(int(plan_id) if plan_id else None)
        if berth and berth != 'both':
            sap_query = sap_query.filter(
                db.or_(SAPWorkOrder.berth == berth, SAPWorkOrder.berth == 'both', SAPWorkOrder.berth == None)
            )
        if plan_id:
            # Defensive: also exclude any SAP order whose order_number is already
            # used by a WorkPlanJob in this plan (in case the status field drifted out of sync)
            scheduled_order_numbers = db.session.query(WorkPlanJob.sap_order_number).join(
                WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id
            ).filter(
                WorkPlanDay.work_plan_id == int(plan_id),
                WorkPlanJob.sap_order_number.isnot(None),
            ).subquery()
            sap_query = sap_query.filter(~SAPWorkOrder.order_number.in_(scheduled_order_numbers))
        sap_orders = sap_query.order_by(SAPWorkOrder.required_date, SAPWorkOrder.order_number).all()
        result['sap_orders'] = [o.to_dict(language) for o in sap_orders]

    # Get equipment for PM jobs (all running equipment) - only if no SAP orders or explicitly requested
    if (not job_type or job_type == 'pm') and not result['sap_orders']:
        eq_query = Equipment.query.filter(
            Equipment.status == 'active',
            Equipment.is_scrapped == False
        )
        if berth and berth != 'both':
            eq_query = eq_query.filter(
                db.or_(Equipment.berth == berth, Equipment.berth == 'both')
            )
        equipment_list = eq_query.order_by(Equipment.serial_number).all()
        result['pm_jobs'] = [{
            'equipment': eq.to_dict(),
            'job_type': 'pm',
            'related_defects_count': Defect.query.join(
                Defect.inspection
            ).filter(
                Defect.inspection.has(equipment_id=eq.id),
                Defect.status.in_(['open', 'in_progress'])
            ).count()
        } for eq in equipment_list]

    # Get open defects — ONLY defects from inspections (not field reports or safety reports)
    if not job_type or job_type == 'defect':
        from app.models.inspection import Inspection
        defect_query = Defect.query.filter(
            Defect.status.in_(['open', 'in_progress']),
            Defect.inspection_id.isnot(None),
        )

        # Exclude defects already assigned directly to a specialist (single home
        # per defect — these are handled in "My Jobs", not the work plan).
        from app.models.specialist_job import SpecialistJob as _SpecJob
        specialist_owned_subq = db.session.query(_SpecJob.defect_id).filter(
            _SpecJob.status.in_(['assigned', 'in_progress', 'paused', 'incomplete']),
            _SpecJob.defect_id.isnot(None),
        ).scalar_subquery()
        defect_query = defect_query.filter(~Defect.id.in_(specialist_owned_subq))

        # Exclude defects already scheduled in the current work plan
        if plan_id:
            # Direct match: defect_id explicitly set on a job
            already_in_plan_by_id = db.session.query(WorkPlanJob.defect_id).join(WorkPlanDay).filter(
                WorkPlanDay.work_plan_id == int(plan_id),
                WorkPlanJob.defect_id.isnot(None)
            ).subquery()
            defect_query = defect_query.filter(~Defect.id.in_(already_in_plan_by_id))

            # Bundle exclusion: also exclude defects on equipment that already has
            # ANY job in the plan (the auto-planner bundles same-equipment work
            # under a single PM job — the defect doesn't get its own row but
            # it IS being handled by that team).
            from sqlalchemy import or_ as _or
            scheduled_equipment_ids = db.session.query(WorkPlanJob.equipment_id).join(WorkPlanDay).filter(
                WorkPlanDay.work_plan_id == int(plan_id),
                WorkPlanJob.equipment_id.isnot(None),
            ).subquery()
            # A defect's equipment can come via inspection.equipment_id OR equipment_id_direct
            defect_query = defect_query.outerjoin(Defect.inspection).filter(
                ~_or(
                    Defect.equipment_id_direct.in_(scheduled_equipment_ids),
                    Inspection.equipment_id.in_(scheduled_equipment_ids),
                )
            )

        defects = defect_query.order_by(Defect.created_at.desc()).all()
        result['defect_jobs'] = [{
            'defect': d.to_dict(language),
            'job_type': 'defect',
            'equipment': d.inspection.equipment.to_dict() if d.inspection and d.inspection.equipment else None
        } for d in defects]

    # Inspection assignments are NOT shown in the work-plan pool.
    # They have their own assignment system and appear in InspectionSummaryBar.
    # result['inspection_jobs'] stays empty.

    return jsonify({
        'status': 'success',
        **result
    }), 200


# ==================== TEMPLATES ====================

@bp.route('/templates/sap-import', methods=['GET'])
def download_sap_import_template():
    """
    Download Excel template for SAP work order import.
    """
    from flask import Response

    # Create sample data with all columns
    sample_data = {
        'order_number': ['SAP-2026-001', 'SAP-2026-002', 'SAP-2026-003'],
        'type': ['PRM', 'COM', 'INS'],
        'equipment_code': ['PUMP-001', 'CRANE-002', 'GEN-003'],
        'work_center': ['ELME', 'ELEC', 'MECH'],
        'date': ['2026-02-10', '2026-02-11', '2026-02-12'],
        'estimated_hours': [4, 6, 2],
        'description': ['Monthly pump maintenance', 'AC system service', 'Generator inspection'],
        'priority': ['normal', 'high', 'normal'],
        'berth': ['east', 'west', 'both'],
        'cycle_value': [250, '', ''],
        'cycle_unit': ['hours', '', ''],
        'maintenance_base': ['running_hours', 'calendar', ''],
        'overdue_value': [50, 10, ''],
        'overdue_unit': ['hours', 'days', ''],
        'planned_date': ['2026-02-05', '2026-02-08', ''],
        'note': ['Check bearings', 'Urgent - safety issue', ''],
    }

    import pandas as pd
    df = pd.DataFrame(sample_data)

    # Create Excel file in memory
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Work Orders', index=False)

        # Add instructions sheet
        instructions = pd.DataFrame({
            'Column': [
                'order_number', 'type', 'equipment_code', 'work_center', 'date', 'estimated_hours',
                'description', 'priority', 'berth', 'cycle_value', 'cycle_unit',
                'maintenance_base', 'overdue_value', 'overdue_unit', 'planned_date', 'note'
            ],
            'Required': [
                'Yes', 'Yes', 'Yes', 'No', 'Yes', 'No',
                'No', 'No', 'No', 'No', 'No',
                'No', 'No', 'No', 'No', 'No'
            ],
            'Description': [
                'SAP order number (unique identifier)',
                'Any SAP order type (e.g., PRM, COM, INS, PM01, PM02, CM01). Stored as-is.',
                'Equipment name or serial number (must exist in system)',
                'Work center: ELEC = electrical only, MECH = mechanical only, ELME = both teams. Defaults to ELME for PM, MECH for defects.',
                'SAP required/due date (YYYY-MM-DD). Jobs outside plan week go to first day.',
                'Estimated hours to complete',
                'Job description/notes',
                'low, normal, high, urgent',
                'east, west, or both',
                'Cycle value (e.g., 250, 500, 1000)',
                'hours, days, weeks, months',
                'running_hours, calendar, or condition',
                'How much the job is overdue',
                'hours or days',
                'Original planned date (YYYY-MM-DD)',
                'Additional notes'
            ]
        })
        instructions.to_excel(writer, sheet_name='Instructions', index=False)

    output.seek(0)

    return Response(
        output.getvalue(),
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={
            'Content-Disposition': 'attachment; filename=sap_import_template.xlsx'
        }
    )


@bp.route('/templates/materials', methods=['GET'])
def download_materials_template():
    """
    Download Excel template for materials import.
    """
    from flask import Response

    # Create sample data
    sample_data = {
        'code': ['FLT-001', 'OIL-002', 'BRG-003'],
        'name': ['Oil Filter', 'Hydraulic Oil', 'Bearing 6205'],
        'name_ar': ['فلتر زيت', 'زيت هيدروليكي', 'رمان بلي 6205'],
        'category': ['filter', 'lubricant', 'bearing'],
        'unit': ['pcs', 'liter', 'pcs'],
        'current_stock': [50, 200, 30],
        'min_stock': [15, 50, 10],
    }

    import pandas as pd
    df = pd.DataFrame(sample_data)

    # Create Excel file in memory
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Materials', index=False)

        # Add instructions sheet
        instructions = pd.DataFrame({
            'Column': [
                'code', 'name', 'name_ar', 'category', 'unit', 'current_stock', 'min_stock'
            ],
            'Required': [
                'Yes', 'Yes', 'No', 'Yes', 'Yes', 'No', 'No'
            ],
            'Description': [
                'Unique material code (used to update existing records)',
                'Material name in English',
                'Material name in Arabic',
                'Category (filter, lubricant, bearing, seal, electrical, etc.)',
                'Unit of measure (pcs, liter, meter, kg, etc.)',
                'Current stock quantity (defaults to 0)',
                'Minimum stock level for alerts (defaults to 10)'
            ]
        })
        instructions.to_excel(writer, sheet_name='Instructions', index=False)

    output.seek(0)

    return Response(
        output.getvalue(),
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={
            'Content-Disposition': 'attachment; filename=materials_import_template.xlsx'
        }
    )


def _parse_pdf_filters_from_body(body):
    """Extract filter dict from JSON body. Returns {} if no filters set."""
    if not body:
        return {}
    filters = {
        'days': body.get('days'),
        'berths': body.get('berths'),
        'work_centers': body.get('work_centers'),
        'job_types': body.get('job_types'),
    }
    # Strip empty values so the service treats them as "no filter"
    return {k: v for k, v in filters.items() if v}


def _parse_pdf_filters_from_query():
    """Extract filter dict from query string (comma-separated list values).
    Used for GET requests where we cannot accept a JSON body.
    Returns {} if no filters set."""
    def _split(val):
        if not val:
            return None
        return [v.strip() for v in val.split(',') if v.strip()]

    filters = {
        'days': _split(request.args.get('days')),
        'berths': _split(request.args.get('berths')),
        'work_centers': _split(request.args.get('work_centers')),
        'job_types': _split(request.args.get('job_types')),
    }
    return {k: v for k, v in filters.items() if v}


@bp.route('/<int:plan_id>/generate-pdf', methods=['POST'])
@jwt_required()
def generate_plan_pdf_now(plan_id):
    """Generate PDF for a plan synchronously (not background). Returns error details if it fails.

    Optional JSON body for filtering (all keys optional):
        days: ["2026-04-05", "2026-04-06"]     # ISO date list
        berths: ["east", "west"]               # any of: east, west
        work_centers: ["MECH", "ELEC"]         # any of: MECH, ELEC
        job_types: ["pm", "defect"]            # any of: pm, defect, inspection
    """
    user = get_current_user()
    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    try:
        # Log plan details for debugging
        days_info = []
        for d in plan.days:
            job_count = len(list(d.jobs))
            days_info.append(f"{d.date.isoformat()}: {job_count} jobs")
        logger.info(f"Generating PDF for plan {plan.id}: {len(plan.days)} days — {days_info}")

        lang = request.args.get('lang', 'en')
        filters = _parse_pdf_filters_from_body(request.get_json(silent=True) or {})
        from app.services.work_plan_pdf_service import WorkPlanPDFService
        pdf_file = WorkPlanPDFService.generate_plan_pdf(
            plan, language=lang, filters=filters or None,
        )
        if not pdf_file:
            return jsonify({'status': 'error', 'message': 'PDF generation returned None — check Cloudinary config'}), 500

        plan.pdf_file_id = pdf_file.id
        db.session.commit()

        return jsonify({
            'status': 'success',
            'message': f'PDF generated ({len(plan.days)} days)',
            'pdf_url': pdf_file.get_url(),
            'days_count': len(plan.days),
            'days_detail': days_info,
        }), 200
    except Exception as e:
        import traceback
        return jsonify({
            'status': 'error',
            'message': str(e),
            'traceback': traceback.format_exc()
        }), 500


@bp.route('/<int:plan_id>/download-pdf', methods=['GET'])
@jwt_required()
def download_plan_pdf(plan_id):
    """Generate and serve PDF directly with proper headers.
    No Cloudinary dependency — generates fresh PDF on demand.

    Optional query string filters (comma-separated values):
        ?days=2026-04-05,2026-04-06
        ?berths=east,west
        ?work_centers=MECH,ELEC
        ?job_types=pm,defect,inspection
    """

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        return jsonify({'status': 'error', 'message': 'Plan not found'}), 404

    # Generate PDF fresh (no Cloudinary) — applies filters inline
    from app.services.work_plan_pdf_service import (
        WorkPlanPDF,
        _apply_filters_to_jobs,
        _build_filter_note,
    )
    lang = request.args.get('lang', 'en')
    filters = _parse_pdf_filters_from_query() or None
    # Version stamp so the Render logs reveal which code version is live.
    # Bump the suffix on every PDF-service edit.
    logger.info(
        'PDF VERSION round4 download-pdf | plan_id=%s lang=%s filters=%s',
        plan_id, lang, bool(filters),
    )
    try:
        # Pre-compute filtered jobs per day (mirror of service logic)
        allowed_day_dates = set(filters['days']) if filters and filters.get('days') else None
        filtered_jobs_by_day = {}
        for day in plan.days:
            if allowed_day_dates is not None and day.date.strftime('%Y-%m-%d') not in allowed_day_dates:
                filtered_jobs_by_day[day.id] = []
                continue
            filtered_jobs_by_day[day.id] = _apply_filters_to_jobs(
                list(day.jobs) if day.jobs else [], filters,
            )

        filter_note = _build_filter_note(filters, lang) if filters else ''

        pdf = WorkPlanPDF(plan, language=lang)
        # Embed defect photo thumbnails when filters are active (per-day,
        # per-berth, etc.) — skipped for full-week PDFs to avoid downloading
        # hundreds of images.
        pdf.filters_active = bool(filters)
        pdf.add_cover_page(
            filtered_jobs_by_day=filtered_jobs_by_day if filters else None,
            filter_note=filter_note,
        )
        for day in sorted(plan.days, key=lambda d: d.date):
            day_jobs = filtered_jobs_by_day.get(day.id)
            if filters and not day_jobs:
                continue  # Skip empty days under active filters
            try:
                pdf.add_day_page(day, filtered_jobs=day_jobs)
            except Exception as e:
                logger.error(f"PDF day render error {day.date}: {e}")
                pdf.current_day_label = day.date.strftime('%A, %d %B %Y') + ' (ERROR)'
                pdf.current_day_stats = ''
                pdf.add_page()

        pdf_bytes = bytes(pdf.output())
        filename = 'work_plan_%s.pdf' % plan.week_start.strftime('%Y_%m_%d')

        return Response(
            pdf_bytes,
            mimetype='application/pdf',
            headers={
                'Content-Disposition': 'inline; filename="%s"' % filename,
                'Content-Type': 'application/pdf',
                'Cache-Control': 'no-cache',
            }
        )
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/<int:plan_id>/pdf/day/<day_date>', methods=['GET'])
@jwt_required()
def download_day_pdf(plan_id, day_date):
    """
    Generate and download PDF for a specific day.
    """
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    lang = request.args.get('lang', 'en')
    from app.services.work_plan_pdf_service import WorkPlanPDFService
    pdf_file = WorkPlanPDFService.generate_day_pdf(plan, day_date, language=lang)

    if not pdf_file:
        raise ValidationError("Failed to generate PDF")

    return jsonify({
        'status': 'success',
        'pdf_url': pdf_file.get_url()
    }), 200


# ==================== SMART PLAN GENERATOR ====================

@bp.route('/<int:plan_id>/generate', methods=['POST'])
@jwt_required()
def generate_plan(plan_id):
    """Auto-generate a weekly work plan using the 5-step pipeline.

    Request body:
        recipe (str, optional): One of 'priority_first', 'travel_optimized',
            'team_balanced', 'pm_compliance', 'copy_last_week', 'combined'.
            Default: 'priority_first'.
        clear_existing (bool, optional): If True, wipe ALL existing jobs first.
            Default: False (only AI-generated jobs are wiped).
        step (int, optional): 1, 2, or 3 — REQUIRED when recipe='combined'.
            Step 1 = PMs + their defects. Step 2 = critical/high defects on
            equipment without PM. Step 3 = medium/low defects on equipment
            without PM.
        additive (bool, optional): If True, do NOT clear previous AI jobs at
            the start. Used for combined steps 2 and 3 to add to existing plan.
            Default: False.
    """
    # Planning-only. Placed before the try block on purpose: these handlers
    # catch bare Exception, which would turn a 403 into a 500.
    engineer_or_admin_required()

    data = request.get_json(silent=True) or {}
    recipe = data.get('recipe', 'priority_first')
    clear_existing = data.get('clear_existing', False)
    step = data.get('step')
    additive = data.get('additive', False)

    try:
        from app.services.work_plan_generator_service import WorkPlanGeneratorService
        result = WorkPlanGeneratorService.generate_plan(
            plan_id=plan_id,
            recipe=recipe,
            clear_existing=clear_existing,
            step=step,
            additive=additive,
        )
        return jsonify(result), 200
    except Exception as e:
        # Log the traceback, never return it — it leaks file paths and internals.
        logger.exception("Plan generation failed for plan_id=%s", plan_id)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/<int:plan_id>/generate/reject', methods=['POST'])
@jwt_required()
def reject_generation(plan_id):
    """Remove all AI-generated jobs and reset SAP orders to pending."""
    # Planning-only. Placed before the try block on purpose: these handlers
    # catch bare Exception, which would turn a 403 into a 500.
    engineer_or_admin_required()

    try:
        from app.services.work_plan_generator_service import WorkPlanGeneratorService
        result = WorkPlanGeneratorService.reject_generation(plan_id)
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Reject generation failed: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/<int:plan_id>/score', methods=['GET'])
@jwt_required()
def get_plan_score(plan_id):
    """Score an existing plan on 5 dimensions."""
    # Planning-only. Placed before the try block on purpose: these handlers
    # catch bare Exception, which would turn a 403 into a 500.
    engineer_or_admin_required()

    try:
        from app.services.work_plan_generator_service import WorkPlanGeneratorService
        result = WorkPlanGeneratorService.score_plan(plan_id)
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Plan scoring failed: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/<int:plan_id>/generate/preview', methods=['GET'])
@jwt_required()
def preview_candidates(plan_id):
    """Preview what would be scheduled without creating jobs."""
    # Planning-only. Placed before the try block on purpose: these handlers
    # catch bare Exception, which would turn a 403 into a 500.
    engineer_or_admin_required()

    try:
        from app.services.work_plan_generator_service import WorkPlanGeneratorService
        result = WorkPlanGeneratorService.get_candidates(plan_id)
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Candidate preview failed: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ==================== EMAIL SETTINGS ====================

@bp.route('/<int:plan_id>/auto-schedule', methods=['POST'])
@jwt_required()
def auto_schedule(plan_id):
    """
    Auto-schedule jobs from the pool to the calendar.

    Algorithm:
    1. Get all pending SAP orders from pool
    2. Sort by: critical first, then overdue, then priority (urgent > high > normal > low)
    3. Distribute across days, balancing hours (target max 8h/day per berth)
    4. Skip weekends unless forced

    Request body (optional):
        {
            "include_weekends": false,
            "max_hours_per_day": 8,
            "berth": "east" | "west" | "both"  // optional filter
        }
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot auto-schedule on a published work plan")

    data = request.get_json() or {}
    include_weekends = data.get('include_weekends', False)
    max_hours_per_day = data.get('max_hours_per_day', 8)
    berth_filter = data.get('berth')

    # Get pending SAP orders — from the shared box as well as this week's own,
    # otherwise auto-schedule sees an empty pool and reports nothing to do.
    sap_query = pool_orders_query(plan.id)
    if berth_filter and berth_filter != 'both':
        sap_query = sap_query.filter(
            db.or_(SAPWorkOrder.berth == berth_filter, SAPWorkOrder.berth == 'both', SAPWorkOrder.berth == None)
        )

    pending_orders = sap_query.all()

    if not pending_orders:
        return jsonify({
            'status': 'success',
            'message': 'No jobs to schedule',
            'scheduled': 0
        }), 200

    # Define priority scoring
    def get_priority_score(order):
        score = 0
        # Critical overdue gets highest priority
        if order.overdue_value and order.overdue_value > 0:
            if order.overdue_unit == 'hours' and order.overdue_value > 100:
                score += 1000  # Critical
            elif order.overdue_unit == 'days' and order.overdue_value > 7:
                score += 1000  # Critical
            else:
                score += 500  # Overdue but not critical

        # Priority levels
        priority_scores = {'urgent': 400, 'high': 300, 'normal': 200, 'low': 100}
        score += priority_scores.get(order.priority, 200)

        # Earlier required date = higher priority
        if order.required_date:
            days_until = (order.required_date - get_planning_today()).days
            if days_until < 0:
                score += 200  # Past due
            elif days_until < 3:
                score += 100  # Due soon

        return score

    # Sort orders by priority (highest first)
    pending_orders.sort(key=get_priority_score, reverse=True)

    # Get available days (sorted by date)
    available_days = []
    for day in sorted(plan.days, key=lambda d: d.date):
        # Skip weekends unless included
        if not include_weekends and day.date.weekday() >= 5:
            continue
        available_days.append(day)

    if not available_days:
        raise ValidationError("No available days for scheduling (weekends excluded)")

    # Track hours per day per berth
    hours_per_day = {day.id: {'east': 0, 'west': 0, 'both': 0} for day in available_days}

    # Calculate existing hours
    for day in available_days:
        for job in day.jobs:
            job_berth = job.berth or 'both'
            hours_per_day[day.id][job_berth] += job.estimated_hours

    scheduled_count = 0
    skipped_count = 0

    # Schedule each order
    for order in pending_orders:
        order_berth = order.berth or 'both'
        order_hours = order.estimated_hours or 4

        # Find best day (least loaded that can fit this job)
        best_day = None
        best_day_hours = float('inf')

        for day in available_days:
            # Calculate total hours for the relevant berth(s)
            if order_berth == 'both':
                current_hours = max(hours_per_day[day.id]['east'], hours_per_day[day.id]['west'], hours_per_day[day.id]['both'])
            else:
                current_hours = hours_per_day[day.id][order_berth] + hours_per_day[day.id]['both']

            # Check if we can fit this job
            if current_hours + order_hours <= max_hours_per_day:
                if current_hours < best_day_hours:
                    best_day = day
                    best_day_hours = current_hours

        # If no day fits within max hours, find the least loaded day anyway
        if not best_day:
            for day in available_days:
                if order_berth == 'both':
                    current_hours = max(hours_per_day[day.id]['east'], hours_per_day[day.id]['west'], hours_per_day[day.id]['both'])
                else:
                    current_hours = hours_per_day[day.id][order_berth] + hours_per_day[day.id]['both']

                if current_hours < best_day_hours:
                    best_day = day
                    best_day_hours = current_hours

        if not best_day:
            skipped_count += 1
            continue

        # Find PM template if applicable
        pm_template_id = None
        if order.job_type == 'pm' and order.cycle_id:
            equipment = db.session.get(Equipment, order.equipment_id)
            if equipment:
                pm_template = PMTemplate.find_for_job(equipment.equipment_type, order.cycle_id)
                if pm_template:
                    pm_template_id = pm_template.id

        # Get next position
        max_position = db.session.query(db.func.max(WorkPlanJob.position)).filter_by(
            work_plan_day_id=best_day.id
        ).scalar() or 0

        # Create the job
        job = WorkPlanJob(
            work_plan_day_id=best_day.id,
            job_type=order.job_type,
            berth=order.berth,
            equipment_id=order.equipment_id,
            sap_order_number=order.order_number,
            sap_order_type=order.order_type,
            description=order.description,
            cycle_id=order.cycle_id,
            pm_template_id=pm_template_id,
            overdue_value=order.overdue_value,
            overdue_unit=order.overdue_unit,
            maintenance_base=order.maintenance_base,
            planned_date=order.planned_date or order.required_date,
            estimated_hours=order_hours,
            position=max_position + 1,
            priority=order.priority,
            notes=order.notes
        )

        db.session.add(job)
        db.session.flush()

        # Auto-add materials from PM template
        if pm_template_id:
            pm_template = db.session.get(PMTemplate, pm_template_id)
            if pm_template:
                for tm in pm_template.materials:
                    wpm = WorkPlanMaterial(
                        work_plan_job_id=job.id,
                        material_id=tm.material_id,
                        quantity=tm.quantity
                    )
                    db.session.add(wpm)

        # Mark SAP order as scheduled
        order.status = 'scheduled'
        order.work_plan_id = plan.id  # leaves the box, into this week

        # Update hours tracking
        hours_per_day[best_day.id][order_berth] += order_hours

        scheduled_count += 1

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Auto-scheduled {scheduled_count} jobs',
        'scheduled': scheduled_count,
        'skipped': skipped_count,
        'total_in_pool': len(pending_orders)
    }), 200


@bp.route('/<int:plan_id>/copy-from-week', methods=['POST'])
@jwt_required()
def copy_from_previous_week(plan_id):
    """
    Copy jobs from a previous week to the current plan.

    This copies the job structure (equipment, estimated hours, berth, etc.)
    but NOT the SAP order numbers (those are unique per week).
    Teams are also copied so they can be quickly adjusted.

    Request body:
        {
            "source_week_start": "YYYY-MM-DD"  // Required: the week to copy from
        }
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot modify a published work plan")

    data = request.get_json() or {}
    source_week_start = data.get('source_week_start')

    if not source_week_start:
        raise ValidationError("source_week_start is required")

    try:
        source_date = datetime.strptime(source_week_start, '%Y-%m-%d').date()
    except ValueError:
        raise ValidationError("Invalid date format. Use YYYY-MM-DD")

    # Get the source plan
    source_plan = WorkPlan.query.filter_by(week_start=source_date).first()
    if not source_plan:
        raise NotFoundError(f"No work plan found for week {source_week_start}")

    # Map source days to target days by day of week
    source_days_by_weekday = {day.date.weekday(): day for day in source_plan.days}
    target_days_by_weekday = {day.date.weekday(): day for day in plan.days}

    copied_count = 0
    skipped_count = 0

    for weekday, source_day in source_days_by_weekday.items():
        target_day = target_days_by_weekday.get(weekday)
        if not target_day:
            continue

        for source_job in source_day.jobs:
            try:
                # Get next position
                max_position = db.session.query(db.func.max(WorkPlanJob.position)).filter_by(
                    work_plan_day_id=target_day.id
                ).scalar() or 0

                # Create new job (without SAP order number)
                new_job = WorkPlanJob(
                    work_plan_day_id=target_day.id,
                    job_type=source_job.job_type,
                    berth=source_job.berth,
                    equipment_id=source_job.equipment_id,
                    # Don't copy SAP order - each week has unique orders
                    sap_order_number=None,
                    sap_order_type=source_job.sap_order_type,
                    description=source_job.description,
                    cycle_id=source_job.cycle_id,
                    pm_template_id=source_job.pm_template_id,
                    # Don't copy overdue - it's specific to the original order
                    overdue_value=None,
                    overdue_unit=None,
                    maintenance_base=source_job.maintenance_base,
                    planned_date=None,  # Will be set when linked to SAP order
                    estimated_hours=source_job.estimated_hours,
                    position=max_position + 1,
                    priority=source_job.priority,
                    notes=f"Copied from {source_date.isoformat()}"
                )
                db.session.add(new_job)
                db.session.flush()

                # Copy team assignments
                for source_assignment in source_job.assignments:
                    new_assignment = WorkPlanAssignment(
                        work_plan_job_id=new_job.id,
                        user_id=source_assignment.user_id,
                        is_lead=source_assignment.is_lead
                    )
                    db.session.add(new_assignment)

                # Copy materials
                for source_material in source_job.materials:
                    new_material = WorkPlanMaterial(
                        work_plan_job_id=new_job.id,
                        material_id=source_material.material_id,
                        quantity=source_material.quantity
                    )
                    db.session.add(new_material)

                copied_count += 1

            except Exception as e:
                skipped_count += 1
                continue

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Copied {copied_count} jobs from {source_week_start}',
        'copied': copied_count,
        'skipped': skipped_count,
        'source_week': source_week_start
    }), 200


@bp.route('/email/test', methods=['POST'])
@jwt_required()
def test_email():
    """
    Send a test email to verify email configuration.
    Only admins can use this endpoint.
    """
    user = get_current_user()
    if user.role != 'admin':
        raise ForbiddenError("Only admins can test email configuration")

    data = request.get_json() or {}
    to_email = data.get('email', user.email)

    if not to_email:
        raise ValidationError("Email address required")

    from app.services.email_service import EmailService
    success = EmailService.send_test_email(to_email)

    return jsonify({
        'status': 'success' if success else 'error',
        'message': 'Test email sent' if success else 'Failed to send test email. Check email configuration.',
        'to': to_email
    }), 200 if success else 500


@bp.route('/email/recipients', methods=['GET'])
@jwt_required()
def get_email_recipients():
    """
    Get configured planning team email recipients.
    """
    user = get_current_user()
    if user.role not in ['admin', 'engineer']:
        raise ForbiddenError("Only admins and engineers can view email recipients")

    from app.services.email_service import EmailService
    recipients = EmailService.get_planning_recipients()

    return jsonify({
        'status': 'success',
        'recipients': recipients
    }), 200


# ==================== JOB TEMPLATES ====================

@bp.route('/templates', methods=['GET'])
@jwt_required()
def list_job_templates():
    """
    List job templates with optional filtering.

    Query params:
        - job_type: Filter by job type (pm, defect, inspection)
        - equipment_type: Filter by equipment type
        - active_only: Only active templates (default true)
    """
    user = get_current_user()
    language = get_language(user)

    job_type = request.args.get('job_type')
    equipment_type = request.args.get('equipment_type')
    active_only = request.args.get('active_only', 'true').lower() == 'true'

    query = JobTemplate.query

    if job_type:
        query = query.filter(JobTemplate.job_type == job_type)

    if equipment_type:
        query = query.filter(JobTemplate.equipment_type == equipment_type)

    if active_only:
        query = query.filter(JobTemplate.is_active == True)

    templates = query.order_by(JobTemplate.name).all()

    return jsonify({
        'status': 'success',
        'templates': [t.to_dict(language, include_materials=False, include_checklist=False) for t in templates],
        'count': len(templates)
    }), 200


@bp.route('/templates', methods=['POST'])
@jwt_required()
def create_job_template():
    """
    Create a new job template.

    Request body:
        {
            "name": "250 Hours PM",
            "name_ar": "صيانة 250 ساعة",
            "job_type": "pm",
            "equipment_id": null,
            "equipment_type": "RTG",
            "berth": "both",
            "estimated_hours": 4.0,
            "priority": "normal",
            "description": "Regular 250h maintenance",
            "recurrence_type": "weekly",
            "recurrence_day": 1,
            "default_team_size": 2,
            "required_certifications": ["electrical"]
        }
    """
    user = engineer_or_admin_required()
    data = request.get_json()

    if not data:
        raise ValidationError("Request body is required")

    if not data.get('name'):
        raise ValidationError("name is required")
    if not data.get('job_type'):
        raise ValidationError("job_type is required")
    if data.get('estimated_hours') is None:
        raise ValidationError("estimated_hours is required")

    template = JobTemplate(
        name=data['name'],
        name_ar=data.get('name_ar'),
        job_type=data['job_type'],
        equipment_id=data.get('equipment_id'),
        equipment_type=data.get('equipment_type'),
        berth=data.get('berth'),
        estimated_hours=float(data['estimated_hours']),
        priority=data.get('priority', 'normal'),
        description=data.get('description'),
        description_ar=data.get('description_ar'),
        recurrence_type=data.get('recurrence_type'),
        recurrence_day=data.get('recurrence_day'),
        default_team_size=data.get('default_team_size', 1),
        required_certifications=data.get('required_certifications'),
        is_active=True,
        created_by_id=user.id
    )

    db.session.add(template)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Job template created',
        'template': template.to_dict(user.language or 'en')
    }), 201


@bp.route('/templates/<int:id>', methods=['GET'])
@jwt_required()
def get_job_template(id):
    """Get a job template with materials and checklist."""
    user = get_current_user()
    language = get_language(user)

    template = db.session.get(JobTemplate, id)
    if not template:
        raise NotFoundError("Job template not found")

    return jsonify({
        'status': 'success',
        'template': template.to_dict(language, include_materials=True, include_checklist=True)
    }), 200


@bp.route('/templates/<int:id>', methods=['PUT'])
@jwt_required()
def update_job_template(id):
    """Update a job template."""
    user = engineer_or_admin_required()

    template = db.session.get(JobTemplate, id)
    if not template:
        raise NotFoundError("Job template not found")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    # Update fields
    if 'name' in data:
        template.name = data['name']
    if 'name_ar' in data:
        template.name_ar = data['name_ar']
    if 'job_type' in data:
        template.job_type = data['job_type']
    if 'equipment_id' in data:
        template.equipment_id = data['equipment_id']
    if 'equipment_type' in data:
        template.equipment_type = data['equipment_type']
    if 'berth' in data:
        template.berth = data['berth']
    if 'estimated_hours' in data:
        template.estimated_hours = float(data['estimated_hours'])
    if 'priority' in data:
        template.priority = data['priority']
    if 'description' in data:
        template.description = data['description']
    if 'description_ar' in data:
        template.description_ar = data['description_ar']
    if 'recurrence_type' in data:
        template.recurrence_type = data['recurrence_type']
    if 'recurrence_day' in data:
        template.recurrence_day = data['recurrence_day']
    if 'default_team_size' in data:
        template.default_team_size = data['default_team_size']
    if 'required_certifications' in data:
        template.required_certifications = data['required_certifications']
    if 'is_active' in data:
        template.is_active = data['is_active']

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Job template updated',
        'template': template.to_dict(user.language or 'en')
    }), 200


@bp.route('/templates/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_job_template(id):
    """Delete a job template."""
    user = engineer_or_admin_required()

    template = db.session.get(JobTemplate, id)
    if not template:
        raise NotFoundError("Job template not found")

    db.session.delete(template)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Job template deleted'
    }), 200


@bp.route('/templates/<int:id>/materials', methods=['POST'])
@jwt_required()
def add_template_material(id):
    """
    Add a material to a template.

    Request body:
        {
            "material_id": 1,
            "quantity": 2.0,
            "is_optional": false
        }
    """
    user = engineer_or_admin_required()

    template = db.session.get(JobTemplate, id)
    if not template:
        raise NotFoundError("Job template not found")

    data = request.get_json()
    if not data or not data.get('material_id'):
        raise ValidationError("material_id is required")

    material = db.session.get(Material, data['material_id'])
    if not material:
        raise NotFoundError("Material not found")

    # Check if already exists
    existing = JobTemplateMaterial.query.filter_by(
        template_id=id,
        material_id=data['material_id']
    ).first()

    if existing:
        existing.quantity = data.get('quantity', existing.quantity)
        existing.is_optional = data.get('is_optional', existing.is_optional)
    else:
        tm = JobTemplateMaterial(
            template_id=id,
            material_id=data['material_id'],
            quantity=data.get('quantity', 1),
            is_optional=data.get('is_optional', False)
        )
        db.session.add(tm)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Material added to template',
        'template': template.to_dict(user.language or 'en')
    }), 201


@bp.route('/templates/<int:id>/materials/<int:mat_id>', methods=['DELETE'])
@jwt_required()
def remove_template_material(id, mat_id):
    """Remove a material from a template."""
    user = engineer_or_admin_required()

    template = db.session.get(JobTemplate, id)
    if not template:
        raise NotFoundError("Job template not found")

    tm = db.session.get(JobTemplateMaterial, mat_id)
    if not tm or tm.template_id != id:
        raise NotFoundError("Material not found in this template")

    db.session.delete(tm)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Material removed from template'
    }), 200


@bp.route('/templates/<int:id>/checklist', methods=['POST'])
@jwt_required()
def add_template_checklist_item(id):
    """
    Add a checklist item to a template.

    Request body:
        {
            "item_code": "CHK-001",
            "question": "Check oil level",
            "question_ar": "فحص مستوى الزيت",
            "answer_type": "pass_fail",
            "is_required": true,
            "order_index": 1,
            "fail_action": "Report to supervisor"
        }
    """
    user = engineer_or_admin_required()

    template = db.session.get(JobTemplate, id)
    if not template:
        raise NotFoundError("Job template not found")

    data = request.get_json()
    if not data or not data.get('question'):
        raise ValidationError("question is required")

    # Get next order index if not provided
    if data.get('order_index') is None:
        max_order = db.session.query(db.func.max(JobTemplateChecklist.order_index)).filter_by(
            template_id=id
        ).scalar() or 0
        order_index = max_order + 1
    else:
        order_index = data['order_index']

    item = JobTemplateChecklist(
        template_id=id,
        item_code=data.get('item_code'),
        question=data['question'],
        question_ar=data.get('question_ar'),
        answer_type=data.get('answer_type', 'pass_fail'),
        is_required=data.get('is_required', True),
        order_index=order_index,
        fail_action=data.get('fail_action'),
        fail_action_ar=data.get('fail_action_ar')
    )

    db.session.add(item)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Checklist item added',
        'item': item.to_dict(user.language or 'en')
    }), 201


@bp.route('/templates/<int:id>/checklist/<int:item_id>', methods=['PUT'])
@jwt_required()
def update_template_checklist_item(id, item_id):
    """Update a checklist item."""
    user = engineer_or_admin_required()

    template = db.session.get(JobTemplate, id)
    if not template:
        raise NotFoundError("Job template not found")

    item = db.session.get(JobTemplateChecklist, item_id)
    if not item or item.template_id != id:
        raise NotFoundError("Checklist item not found in this template")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    if 'item_code' in data:
        item.item_code = data['item_code']
    if 'question' in data:
        item.question = data['question']
    if 'question_ar' in data:
        item.question_ar = data['question_ar']
    if 'answer_type' in data:
        item.answer_type = data['answer_type']
    if 'is_required' in data:
        item.is_required = data['is_required']
    if 'order_index' in data:
        item.order_index = data['order_index']
    if 'fail_action' in data:
        item.fail_action = data['fail_action']
    if 'fail_action_ar' in data:
        item.fail_action_ar = data['fail_action_ar']

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Checklist item updated',
        'item': item.to_dict(user.language or 'en')
    }), 200


@bp.route('/templates/<int:id>/checklist/<int:item_id>', methods=['DELETE'])
@jwt_required()
def delete_template_checklist_item(id, item_id):
    """Delete a checklist item."""
    user = engineer_or_admin_required()

    template = db.session.get(JobTemplate, id)
    if not template:
        raise NotFoundError("Job template not found")

    item = db.session.get(JobTemplateChecklist, item_id)
    if not item or item.template_id != id:
        raise NotFoundError("Checklist item not found in this template")

    db.session.delete(item)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Checklist item deleted'
    }), 200


@bp.route('/templates/<int:id>/clone', methods=['POST'])
@jwt_required()
def clone_job_template(id):
    """
    Clone a job template.

    Request body:
        {
            "new_name": "250 Hours PM - Copy",
            "new_name_ar": "صيانة 250 ساعة - نسخة"
        }
    """
    user = engineer_or_admin_required()

    template = db.session.get(JobTemplate, id)
    if not template:
        raise NotFoundError("Job template not found")

    data = request.get_json() or {}

    new_template = JobTemplate(
        name=data.get('new_name', f"{template.name} (Copy)"),
        name_ar=data.get('new_name_ar', f"{template.name_ar} (نسخة)" if template.name_ar else None),
        job_type=template.job_type,
        equipment_id=template.equipment_id,
        equipment_type=template.equipment_type,
        berth=template.berth,
        estimated_hours=template.estimated_hours,
        priority=template.priority,
        description=template.description,
        description_ar=template.description_ar,
        recurrence_type=template.recurrence_type,
        recurrence_day=template.recurrence_day,
        default_team_size=template.default_team_size,
        required_certifications=template.required_certifications,
        is_active=True,
        created_by_id=user.id
    )

    db.session.add(new_template)
    db.session.flush()

    # Clone materials
    for mat in template.materials:
        new_mat = JobTemplateMaterial(
            template_id=new_template.id,
            material_id=mat.material_id,
            quantity=mat.quantity,
            is_optional=mat.is_optional
        )
        db.session.add(new_mat)

    # Clone checklist items
    for item in template.checklist_items:
        new_item = JobTemplateChecklist(
            template_id=new_template.id,
            item_code=item.item_code,
            question=item.question,
            question_ar=item.question_ar,
            answer_type=item.answer_type,
            is_required=item.is_required,
            order_index=item.order_index,
            fail_action=item.fail_action,
            fail_action_ar=item.fail_action_ar
        )
        db.session.add(new_item)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Template cloned',
        'template': new_template.to_dict(user.language or 'en')
    }), 201


# ==================== JOB DEPENDENCIES ====================

@bp.route('/<int:plan_id>/jobs/<int:job_id>/dependencies', methods=['GET'])
@jwt_required()
def get_job_dependencies(plan_id, job_id):
    """Get dependencies for a job."""
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    job = db.session.get(WorkPlanJob, job_id)
    if not job or job.day.work_plan_id != plan_id:
        raise NotFoundError("Job not found in this plan")

    # Get jobs this job depends on
    dependencies = JobDependency.query.filter_by(job_id=job_id).all()

    # Get jobs that depend on this job
    dependents = JobDependency.query.filter_by(depends_on_job_id=job_id).all()

    return jsonify({
        'status': 'success',
        'job_id': job_id,
        'depends_on': [d.to_dict() for d in dependencies],
        'required_by': [d.to_dict() for d in dependents]
    }), 200


@bp.route('/<int:plan_id>/jobs/<int:job_id>/dependencies', methods=['POST'])
@jwt_required()
def add_job_dependency(plan_id, job_id):
    """
    Add a dependency to a job.

    Request body:
        {
            "depends_on_job_id": 123,
            "dependency_type": "finish_to_start",
            "lag_minutes": 30
        }
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    job = db.session.get(WorkPlanJob, job_id)
    if not job or job.day.work_plan_id != plan_id:
        raise NotFoundError("Job not found in this plan")

    data = request.get_json()
    if not data or not data.get('depends_on_job_id'):
        raise ValidationError("depends_on_job_id is required")

    depends_on_job = db.session.get(WorkPlanJob, data['depends_on_job_id'])
    if not depends_on_job or depends_on_job.day.work_plan_id != plan_id:
        raise NotFoundError("Dependency job not found in this plan")

    if job_id == data['depends_on_job_id']:
        raise ValidationError("A job cannot depend on itself")

    # Check for circular dependency
    existing_reverse = JobDependency.query.filter_by(
        job_id=data['depends_on_job_id'],
        depends_on_job_id=job_id
    ).first()
    if existing_reverse:
        raise ValidationError("Circular dependency detected")

    # Check if already exists
    existing = JobDependency.query.filter_by(
        job_id=job_id,
        depends_on_job_id=data['depends_on_job_id']
    ).first()
    if existing:
        raise ValidationError("Dependency already exists")

    dependency = JobDependency(
        job_id=job_id,
        depends_on_job_id=data['depends_on_job_id'],
        dependency_type=data.get('dependency_type', 'finish_to_start'),
        lag_minutes=data.get('lag_minutes', 0)
    )

    db.session.add(dependency)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Dependency added',
        'dependency': dependency.to_dict()
    }), 201


@bp.route('/<int:plan_id>/jobs/<int:job_id>/dependencies/<int:dep_id>', methods=['DELETE'])
@jwt_required()
def remove_job_dependency(plan_id, job_id, dep_id):
    """Remove a dependency from a job."""
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    dependency = db.session.get(JobDependency, dep_id)
    if not dependency or dependency.job_id != job_id:
        raise NotFoundError("Dependency not found")

    db.session.delete(dependency)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Dependency removed'
    }), 200


# ==================== JOB SPLITTING ====================

@bp.route('/<int:plan_id>/jobs/<int:job_id>/split', methods=['POST'])
@jwt_required()
def split_job(plan_id, job_id):
    """
    Split a job across multiple days.

    Request body:
        {
            "parts": [
                {"day_id": 1, "hours": 4},
                {"day_id": 2, "hours": 4}
            ]
        }
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot split jobs in a published work plan")

    job = db.session.get(WorkPlanJob, job_id)
    if not job or job.day.work_plan_id != plan_id:
        raise NotFoundError("Job not found in this plan")

    data = request.get_json()
    if not data or not data.get('parts'):
        raise ValidationError("parts array is required")

    parts = data['parts']
    if len(parts) < 2:
        raise ValidationError("At least 2 parts required for splitting")

    # Validate total hours
    total_hours = sum(p.get('hours', 0) for p in parts)

    # Create new jobs for parts (keep original for first part)
    new_jobs = []
    for i, part in enumerate(parts):
        day = db.session.get(WorkPlanDay, part['day_id'])
        if not day or day.work_plan_id != plan_id:
            raise NotFoundError(f"Day {part['day_id']} not found in this plan")

        if i == 0:
            # Update original job
            job.work_plan_day_id = day.id
            job.estimated_hours = part['hours']
            job.notes = f"Part 1 of {len(parts)} - {job.notes or ''}"
            new_jobs.append(job)
        else:
            # Create new job for this part
            max_position = db.session.query(db.func.max(WorkPlanJob.position)).filter_by(
                work_plan_day_id=day.id
            ).scalar() or 0

            new_job = WorkPlanJob(
                work_plan_day_id=day.id,
                job_type=job.job_type,
                berth=job.berth,
                equipment_id=job.equipment_id,
                sap_order_number=f"{job.sap_order_number}-P{i+1}" if job.sap_order_number else None,
                sap_order_type=job.sap_order_type,
                description=job.description,
                cycle_id=job.cycle_id,
                pm_template_id=job.pm_template_id,
                estimated_hours=part['hours'],
                position=max_position + 1,
                priority=job.priority,
                notes=f"Part {i+1} of {len(parts)} - Split from job {job_id}"
            )
            db.session.add(new_job)
            db.session.flush()

            # Copy assignments
            for assignment in job.assignments:
                new_assignment = WorkPlanAssignment(
                    work_plan_job_id=new_job.id,
                    user_id=assignment.user_id,
                    is_lead=assignment.is_lead
                )
                db.session.add(new_assignment)

            new_jobs.append(new_job)

    # Create version
    create_plan_version(plan, 'updated', f'Split job {job_id} into {len(parts)} parts', user.id)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Job split into {len(parts)} parts',
        'jobs': [j.to_dict(user.language or 'en') for j in new_jobs]
    }), 200


# ==================== CAPACITY CONFIG ====================

@bp.route('/capacity-config', methods=['GET'])
@jwt_required()
def list_capacity_configs():
    """List capacity configurations."""
    user = get_current_user()

    configs = CapacityConfig.query.filter_by(is_active=True).all()

    return jsonify({
        'status': 'success',
        'configs': [c.to_dict() for c in configs],
        'count': len(configs)
    }), 200


@bp.route('/capacity-config', methods=['POST'])
@jwt_required()
def create_capacity_config():
    """
    Create a capacity configuration.

    Request body:
        {
            "name": "Standard Day Shift",
            "role": "specialist",
            "shift": "day",
            "max_hours_per_day": 8,
            "max_jobs_per_day": 5,
            "min_rest_hours": 12,
            "overtime_threshold_hours": 8,
            "max_overtime_hours": 4,
            "break_duration_minutes": 60,
            "concurrent_jobs_allowed": 1
        }
    """
    user = admin_required()
    data = request.get_json()

    if not data or not data.get('name'):
        raise ValidationError("name is required")

    config = CapacityConfig(
        name=data['name'],
        role=data.get('role'),
        shift=data.get('shift'),
        max_hours_per_day=data.get('max_hours_per_day', 8),
        max_jobs_per_day=data.get('max_jobs_per_day', 5),
        min_rest_hours=data.get('min_rest_hours', 12),
        overtime_threshold_hours=data.get('overtime_threshold_hours', 8),
        max_overtime_hours=data.get('max_overtime_hours', 4),
        break_duration_minutes=data.get('break_duration_minutes', 60),
        concurrent_jobs_allowed=data.get('concurrent_jobs_allowed', 1),
        is_active=True
    )

    db.session.add(config)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Capacity config created',
        'config': config.to_dict()
    }), 201


@bp.route('/capacity-config/<int:id>', methods=['PUT'])
@jwt_required()
def update_capacity_config(id):
    """Update a capacity configuration."""
    user = admin_required()

    config = db.session.get(CapacityConfig, id)
    if not config:
        raise NotFoundError("Capacity config not found")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    if 'name' in data:
        config.name = data['name']
    if 'role' in data:
        config.role = data['role']
    if 'shift' in data:
        config.shift = data['shift']
    if 'max_hours_per_day' in data:
        config.max_hours_per_day = data['max_hours_per_day']
    if 'max_jobs_per_day' in data:
        config.max_jobs_per_day = data['max_jobs_per_day']
    if 'min_rest_hours' in data:
        config.min_rest_hours = data['min_rest_hours']
    if 'overtime_threshold_hours' in data:
        config.overtime_threshold_hours = data['overtime_threshold_hours']
    if 'max_overtime_hours' in data:
        config.max_overtime_hours = data['max_overtime_hours']
    if 'break_duration_minutes' in data:
        config.break_duration_minutes = data['break_duration_minutes']
    if 'concurrent_jobs_allowed' in data:
        config.concurrent_jobs_allowed = data['concurrent_jobs_allowed']
    if 'is_active' in data:
        config.is_active = data['is_active']

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Capacity config updated',
        'config': config.to_dict()
    }), 200


@bp.route('/capacity-config/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_capacity_config(id):
    """Delete a capacity configuration."""
    user = admin_required()

    config = db.session.get(CapacityConfig, id)
    if not config:
        raise NotFoundError("Capacity config not found")

    db.session.delete(config)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Capacity config deleted'
    }), 200


# ==================== WORKER SKILLS ====================

@bp.route('/skills', methods=['GET'])
@jwt_required()
def list_skills():
    """List all distinct skill names in the system."""
    user = get_current_user()

    skills = db.session.query(WorkerSkill.skill_name).distinct().all()

    return jsonify({
        'status': 'success',
        'skills': [s[0] for s in skills]
    }), 200


@bp.route('/skills/users/<int:user_id>', methods=['GET'])
@jwt_required()
def get_user_skills(user_id):
    """Get skills for a user."""
    user = get_current_user()

    target_user = db.session.get(User, user_id)
    if not target_user:
        raise NotFoundError("User not found")

    skills = WorkerSkill.query.filter_by(user_id=user_id).all()

    return jsonify({
        'status': 'success',
        'user_id': user_id,
        'skills': [s.to_dict() for s in skills]
    }), 200


@bp.route('/skills/users/<int:user_id>', methods=['POST'])
@jwt_required()
def add_user_skill(user_id):
    """
    Add a skill to a user.

    Request body:
        {
            "skill_name": "Electrical",
            "skill_level": 4,
            "certification_name": "Electrical Safety Certificate",
            "certification_number": "ESC-2024-001",
            "issued_date": "2024-01-15",
            "expiry_date": "2026-01-15",
            "issuing_authority": "Safety Authority",
            "document_file_id": 123
        }
    """
    user = engineer_or_admin_required()

    target_user = db.session.get(User, user_id)
    if not target_user:
        raise NotFoundError("User not found")

    data = request.get_json()
    if not data or not data.get('skill_name'):
        raise ValidationError("skill_name is required")

    # Check if already exists
    existing = WorkerSkill.query.filter_by(
        user_id=user_id,
        skill_name=data['skill_name']
    ).first()

    if existing:
        raise ValidationError(f"User already has skill '{data['skill_name']}'")

    skill = WorkerSkill(
        user_id=user_id,
        skill_name=data['skill_name'],
        skill_level=data.get('skill_level', 1),
        certification_name=data.get('certification_name'),
        certification_number=data.get('certification_number'),
        issued_date=datetime.strptime(data['issued_date'], '%Y-%m-%d').date() if data.get('issued_date') else None,
        expiry_date=datetime.strptime(data['expiry_date'], '%Y-%m-%d').date() if data.get('expiry_date') else None,
        issuing_authority=data.get('issuing_authority'),
        document_file_id=data.get('document_file_id'),
        is_verified=False
    )

    db.session.add(skill)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Skill added',
        'skill': skill.to_dict()
    }), 201


@bp.route('/skills/<int:skill_id>', methods=['PUT'])
@jwt_required()
def update_skill(skill_id):
    """Update a skill."""
    user = engineer_or_admin_required()

    skill = db.session.get(WorkerSkill, skill_id)
    if not skill:
        raise NotFoundError("Skill not found")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    if 'skill_name' in data:
        skill.skill_name = data['skill_name']
    if 'skill_level' in data:
        skill.skill_level = data['skill_level']
    if 'certification_name' in data:
        skill.certification_name = data['certification_name']
    if 'certification_number' in data:
        skill.certification_number = data['certification_number']
    if 'issued_date' in data:
        skill.issued_date = datetime.strptime(data['issued_date'], '%Y-%m-%d').date() if data['issued_date'] else None
    if 'expiry_date' in data:
        skill.expiry_date = datetime.strptime(data['expiry_date'], '%Y-%m-%d').date() if data['expiry_date'] else None
    if 'issuing_authority' in data:
        skill.issuing_authority = data['issuing_authority']
    if 'document_file_id' in data:
        skill.document_file_id = data['document_file_id']

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Skill updated',
        'skill': skill.to_dict()
    }), 200


@bp.route('/skills/<int:skill_id>', methods=['DELETE'])
@jwt_required()
def delete_skill(skill_id):
    """Delete a skill."""
    user = engineer_or_admin_required()

    skill = db.session.get(WorkerSkill, skill_id)
    if not skill:
        raise NotFoundError("Skill not found")

    db.session.delete(skill)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Skill deleted'
    }), 200


@bp.route('/skills/<int:skill_id>/verify', methods=['POST'])
@jwt_required()
def verify_skill(skill_id):
    """Verify a skill/certification."""
    user = admin_required()

    skill = db.session.get(WorkerSkill, skill_id)
    if not skill:
        raise NotFoundError("Skill not found")

    skill.is_verified = True
    skill.verified_by_id = user.id
    skill.verified_at = datetime.utcnow()

    db.session.commit()

    # Notify the user
    NotificationService.create_notification(
        user_id=skill.user_id,
        type='skill_verified',
        title='Skill Verified',
        message=f'Your skill "{skill.skill_name}" has been verified.',
        related_type='skill',
        related_id=skill.id
    )

    return jsonify({
        'status': 'success',
        'message': 'Skill verified',
        'skill': skill.to_dict()
    }), 200


# ==================== EQUIPMENT RESTRICTIONS ====================

@bp.route('/equipment-restrictions', methods=['GET'])
@jwt_required()
def list_equipment_restrictions():
    """
    List equipment restrictions.

    Query params:
        - equipment_id: Filter by equipment
        - active_only: Only active restrictions (default true)
    """
    user = get_current_user()

    equipment_id = request.args.get('equipment_id', type=int)
    active_only = request.args.get('active_only', 'true').lower() == 'true'

    query = EquipmentRestriction.query

    if equipment_id:
        query = query.filter(EquipmentRestriction.equipment_id == equipment_id)

    if active_only:
        query = query.filter(EquipmentRestriction.is_active == True)

    restrictions = query.all()

    return jsonify({
        'status': 'success',
        'restrictions': [r.to_dict() for r in restrictions],
        'count': len(restrictions)
    }), 200


@bp.route('/equipment-restrictions', methods=['POST'])
@jwt_required()
def add_equipment_restriction():
    """
    Add an equipment restriction.

    Request body:
        {
            "equipment_id": 1,
            "restriction_type": "blackout",
            "value": {"reason": "scheduled maintenance"},
            "reason": "Major overhaul scheduled",
            "start_date": "2026-02-15",
            "end_date": "2026-02-20",
            "is_permanent": false
        }
    """
    user = engineer_or_admin_required()
    data = request.get_json()

    if not data or not data.get('equipment_id'):
        raise ValidationError("equipment_id is required")
    if not data.get('restriction_type'):
        raise ValidationError("restriction_type is required")

    equipment = db.session.get(Equipment, data['equipment_id'])
    if not equipment:
        raise NotFoundError("Equipment not found")

    restriction = EquipmentRestriction(
        equipment_id=data['equipment_id'],
        restriction_type=data['restriction_type'],
        value=data.get('value'),
        reason=data.get('reason'),
        start_date=datetime.strptime(data['start_date'], '%Y-%m-%d').date() if data.get('start_date') else None,
        end_date=datetime.strptime(data['end_date'], '%Y-%m-%d').date() if data.get('end_date') else None,
        is_permanent=data.get('is_permanent', False),
        is_active=True,
        created_by_id=user.id
    )

    db.session.add(restriction)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Restriction added',
        'restriction': restriction.to_dict()
    }), 201


@bp.route('/equipment-restrictions/<int:id>', methods=['PUT'])
@jwt_required()
def update_equipment_restriction(id):
    """Update an equipment restriction."""
    user = engineer_or_admin_required()

    restriction = db.session.get(EquipmentRestriction, id)
    if not restriction:
        raise NotFoundError("Restriction not found")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    if 'restriction_type' in data:
        restriction.restriction_type = data['restriction_type']
    if 'value' in data:
        restriction.value = data['value']
    if 'reason' in data:
        restriction.reason = data['reason']
    if 'start_date' in data:
        restriction.start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date() if data['start_date'] else None
    if 'end_date' in data:
        restriction.end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date() if data['end_date'] else None
    if 'is_permanent' in data:
        restriction.is_permanent = data['is_permanent']
    if 'is_active' in data:
        restriction.is_active = data['is_active']

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Restriction updated',
        'restriction': restriction.to_dict()
    }), 200


@bp.route('/equipment-restrictions/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_equipment_restriction(id):
    """Delete an equipment restriction."""
    user = engineer_or_admin_required()

    restriction = db.session.get(EquipmentRestriction, id)
    if not restriction:
        raise NotFoundError("Restriction not found")

    db.session.delete(restriction)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Restriction deleted'
    }), 200


# ==================== PLAN VERSIONS ====================

@bp.route('/<int:plan_id>/versions', methods=['GET'])
@jwt_required()
def get_plan_versions(plan_id):
    """Get version history for a plan."""
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    versions = WorkPlanVersion.query.filter_by(work_plan_id=plan_id).order_by(
        WorkPlanVersion.version_number.desc()
    ).all()

    return jsonify({
        'status': 'success',
        'plan_id': plan_id,
        'versions': [v.to_dict(include_snapshot=False) for v in versions],
        'count': len(versions)
    }), 200


@bp.route('/<int:plan_id>/versions/<int:version>', methods=['GET'])
@jwt_required()
def get_plan_version(plan_id, version):
    """Get a specific version snapshot."""
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    version_record = WorkPlanVersion.query.filter_by(
        work_plan_id=plan_id,
        version_number=version
    ).first()

    if not version_record:
        raise NotFoundError("Version not found")

    return jsonify({
        'status': 'success',
        'version': version_record.to_dict(include_snapshot=True)
    }), 200


@bp.route('/<int:plan_id>/versions/<int:version>/restore', methods=['POST'])
@jwt_required()
def restore_plan_version(plan_id, version):
    """Restore a plan to a specific version."""
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot restore a published work plan")

    version_record = WorkPlanVersion.query.filter_by(
        work_plan_id=plan_id,
        version_number=version
    ).first()

    if not version_record:
        raise NotFoundError("Version not found")

    # Create a new version before restoring (backup current state)
    create_plan_version(plan, 'updated', f'Before restoring to version {version}', user.id)

    # Clear current jobs and assignments
    for day in plan.days:
        for job in day.jobs:
            db.session.delete(job)

    db.session.flush()

    # Restore from snapshot
    snapshot = version_record.snapshot_data
    day_map = {d['id']: d for d in snapshot.get('days', [])}

    for day in plan.days:
        snapshot_day = day_map.get(day.id, {})
        for job_data in snapshot_day.get('jobs', []):
            job = WorkPlanJob(
                work_plan_day_id=day.id,
                job_type=job_data.get('job_type'),
                equipment_id=job_data.get('equipment_id'),
                berth=job_data.get('berth'),
                estimated_hours=job_data.get('estimated_hours'),
                priority=job_data.get('priority', 'normal')
            )
            db.session.add(job)
            db.session.flush()

            for assignment_data in job_data.get('assignments', []):
                assignment = WorkPlanAssignment(
                    work_plan_job_id=job.id,
                    user_id=assignment_data.get('user_id'),
                    is_lead=assignment_data.get('is_lead', False)
                )
                db.session.add(assignment)

    # Create version for restore
    create_plan_version(plan, 'updated', f'Restored from version {version}', user.id)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Plan restored to version {version}',
        'work_plan': plan.to_dict(user.language or 'en', include_days=True)
    }), 200


# ==================== JOB CHECKLISTS ====================

@bp.route('/<int:plan_id>/jobs/<int:job_id>/checklist', methods=['GET'])
@jwt_required()
def get_job_checklist(plan_id, job_id):
    """Get checklist for a job (from template)."""
    user = get_current_user()
    language = get_language(user)

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    job = db.session.get(WorkPlanJob, job_id)
    if not job or job.day.work_plan_id != plan_id:
        raise NotFoundError("Job not found in this plan")

    # Get checklist items from job template if linked
    checklist_items = []
    if job.template_id:
        template = db.session.get(JobTemplate, job.template_id)
        if template:
            checklist_items = [item.to_dict(language) for item in template.checklist_items]

    # Get existing responses
    responses = JobChecklistResponse.query.filter_by(work_plan_job_id=job_id).all()
    response_map = {r.checklist_item_id: r.to_dict() for r in responses}

    # Merge items with responses
    for item in checklist_items:
        item['response'] = response_map.get(item['id'])

    return jsonify({
        'status': 'success',
        'job_id': job_id,
        'checklist_items': checklist_items,
        'responses': [r.to_dict() for r in responses],
        'total_items': len(checklist_items),
        'answered_items': len(responses)
    }), 200


@bp.route('/<int:plan_id>/jobs/<int:job_id>/checklist/<int:item_id>/respond', methods=['POST'])
@jwt_required()
def respond_to_checklist_item(plan_id, job_id, item_id):
    """
    Submit a response to a checklist item.

    Request body:
        {
            "answer_value": "pass",
            "notes": "All good",
            "photo_file_id": 123
        }
    """
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    job = db.session.get(WorkPlanJob, job_id)
    if not job or job.day.work_plan_id != plan_id:
        raise NotFoundError("Job not found in this plan")

    checklist_item = db.session.get(JobTemplateChecklist, item_id)
    if not checklist_item:
        raise NotFoundError("Checklist item not found")

    data = request.get_json()
    if not data or data.get('answer_value') is None:
        raise ValidationError("answer_value is required")

    # Check if response already exists
    existing = JobChecklistResponse.query.filter_by(
        work_plan_job_id=job_id,
        checklist_item_id=item_id
    ).first()

    answer_value = str(data['answer_value'])

    # Determine pass/fail status
    is_passed = None
    if checklist_item.answer_type in ('pass_fail', 'yes_no'):
        is_passed = answer_value.lower() in ('pass', 'yes', 'true', '1')

    if existing:
        existing.answer_value = answer_value
        existing.is_passed = is_passed
        existing.notes = data.get('notes', existing.notes)
        existing.photo_file_id = data.get('photo_file_id', existing.photo_file_id)
        existing.answered_by_id = user.id
        existing.answered_at = datetime.utcnow()
        response = existing
    else:
        response = JobChecklistResponse(
            work_plan_job_id=job_id,
            checklist_item_id=item_id,
            question=checklist_item.question,
            answer_type=checklist_item.answer_type,
            answer_value=answer_value,
            is_passed=is_passed,
            notes=data.get('notes'),
            photo_file_id=data.get('photo_file_id'),
            answered_by_id=user.id,
            answered_at=datetime.utcnow()
        )
        db.session.add(response)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Response recorded',
        'response': response.to_dict()
    }), 200


@bp.route('/<int:plan_id>/jobs/<int:job_id>/checklist/complete', methods=['POST'])
@jwt_required()
def complete_job_checklist(plan_id, job_id):
    """Mark checklist as complete (validates all required items answered)."""
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    job = db.session.get(WorkPlanJob, job_id)
    if not job or job.day.work_plan_id != plan_id:
        raise NotFoundError("Job not found in this plan")

    # Get required checklist items
    required_items = []
    if job.template_id:
        template = db.session.get(JobTemplate, job.template_id)
        if template:
            required_items = [item for item in template.checklist_items if item.is_required]

    # Get existing responses
    responses = JobChecklistResponse.query.filter_by(work_plan_job_id=job_id).all()
    answered_item_ids = {r.checklist_item_id for r in responses}

    # Check if all required items are answered
    missing_items = [item for item in required_items if item.id not in answered_item_ids]

    if missing_items:
        return jsonify({
            'status': 'error',
            'message': f'{len(missing_items)} required items not answered',
            'missing_items': [{'id': item.id, 'question': item.question} for item in missing_items],
            'is_complete': False
        }), 400

    # Check for any failed items
    failed_responses = [r for r in responses if r.is_passed == False]

    return jsonify({
        'status': 'success',
        'message': 'Checklist complete',
        'is_complete': True,
        'total_items': len(required_items),
        'answered_items': len(responses),
        'passed_items': len([r for r in responses if r.is_passed == True]),
        'failed_items': len(failed_responses),
        'failed_details': [{'item_id': r.checklist_item_id, 'question': r.question, 'notes': r.notes} for r in failed_responses]
    }), 200


# ==================== CONFLICTS ====================

@bp.route('/<int:plan_id>/conflicts', methods=['GET'])
@jwt_required()
def get_plan_conflicts(plan_id):
    """Get scheduling conflicts for a plan."""
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    conflicts = SchedulingConflict.query.filter_by(work_plan_id=plan_id).order_by(
        SchedulingConflict.severity.desc(),
        SchedulingConflict.created_at.desc()
    ).all()

    # Categorize
    blocking = [c for c in conflicts if c.is_blocking]
    warnings = [c for c in conflicts if not c.is_resolved and not c.is_ignored and c.severity == 'warning']
    resolved = [c for c in conflicts if c.is_resolved or c.is_ignored]

    return jsonify({
        'status': 'success',
        'plan_id': plan_id,
        'conflicts': [c.to_dict() for c in conflicts],
        'summary': {
            'total': len(conflicts),
            'blocking': len(blocking),
            'warnings': len(warnings),
            'resolved': len(resolved)
        }
    }), 200


@bp.route('/<int:plan_id>/conflicts/<int:conflict_id>/resolve', methods=['POST'])
@jwt_required()
def resolve_conflict(plan_id, conflict_id):
    """
    Mark a conflict as resolved.

    Request body:
        {
            "resolution": "Reassigned worker to different day"
        }
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    conflict = db.session.get(SchedulingConflict, conflict_id)
    if not conflict or conflict.work_plan_id != plan_id:
        raise NotFoundError("Conflict not found in this plan")

    data = request.get_json() or {}

    conflict.resolution = data.get('resolution', 'Resolved manually')
    conflict.resolved_at = datetime.utcnow()
    conflict.resolved_by_id = user.id

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Conflict resolved',
        'conflict': conflict.to_dict()
    }), 200


@bp.route('/<int:plan_id>/conflicts/<int:conflict_id>/ignore', methods=['POST'])
@jwt_required()
def ignore_conflict(plan_id, conflict_id):
    """Ignore a conflict (acknowledge but not fix)."""
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    conflict = db.session.get(SchedulingConflict, conflict_id)
    if not conflict or conflict.work_plan_id != plan_id:
        raise NotFoundError("Conflict not found in this plan")

    conflict.is_ignored = True

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Conflict ignored',
        'conflict': conflict.to_dict()
    }), 200


@bp.route('/<int:plan_id>/validate', methods=['POST'])
@jwt_required()
def validate_plan(plan_id):
    """Validate plan (detect all conflicts)."""
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    # Detect conflicts
    detected = detect_conflicts_for_plan(plan)

    # Clear old unresolved conflicts and add new ones
    SchedulingConflict.query.filter_by(
        work_plan_id=plan_id
    ).filter(
        SchedulingConflict.resolved_at == None,
        SchedulingConflict.is_ignored == False
    ).delete()

    warnings = []
    errors = []

    for conflict_data in detected:
        conflict = SchedulingConflict(
            work_plan_id=plan_id,
            conflict_type=conflict_data['type'],
            severity=conflict_data['severity'],
            description=conflict_data['description'],
            affected_job_ids=conflict_data.get('affected_job_ids'),
            affected_user_ids=conflict_data.get('affected_user_ids')
        )
        db.session.add(conflict)

        if conflict_data['severity'] == 'error':
            errors.append(conflict_data)
        else:
            warnings.append(conflict_data)

    db.session.commit()

    valid = len(errors) == 0

    return jsonify({
        'status': 'success',
        'valid': valid,
        'conflicts': errors,
        'warnings': warnings,
        'summary': {
            'errors': len(errors),
            'warnings': len(warnings)
        }
    }), 200


# ==================== AI FEATURES ====================

@bp.route('/ai/auto-schedule/<int:plan_id>', methods=['POST'])
@jwt_required()
def ai_auto_schedule(plan_id):
    """
    AI auto-schedule jobs.

    Request body:
        {
            "options": {
                "priority_weight": 0.5,
                "balance_berths": true,
                "consider_skills": true,
                "minimize_travel": true
            }
        }
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot auto-schedule a published plan")

    data = request.get_json() or {}
    options = data.get('options', {})

    result = ai_service.auto_schedule_jobs(plan_id, options)

    # Apply the scheduled assignments if requested
    if data.get('apply', True) and result.get('scheduled'):
        for assignment_data in result['scheduled']:
            assignment = WorkPlanAssignment(
                work_plan_job_id=assignment_data['job_id'],
                user_id=assignment_data['user_id'],
                is_lead=True  # First assignment is lead
            )
            db.session.add(assignment)

        create_plan_version(plan, 'updated', f'AI auto-scheduled {len(result["scheduled"])} jobs', user.id)
        db.session.commit()

    return jsonify({
        'status': 'success',
        **result
    }), 200


@bp.route('/ai/suggest-team/<int:job_id>', methods=['GET'])
@jwt_required()
def ai_suggest_team(job_id):
    """AI suggest optimal team for a job."""
    user = get_current_user()

    job = db.session.get(WorkPlanJob, job_id)
    if not job:
        raise NotFoundError("Job not found")

    suggestions = ai_service.suggest_optimal_team(job_id)

    return jsonify({
        'status': 'success',
        'job_id': job_id,
        'suggestions': suggestions
    }), 200


@bp.route('/ai/optimize-sequence', methods=['POST'])
@jwt_required()
def ai_optimize_sequence():
    """
    Optimize job sequence for a worker.

    Request body:
        {
            "day_id": 1,
            "user_id": 5
        }
    """
    user = get_current_user()

    data = request.get_json()
    if not data or not data.get('day_id') or not data.get('user_id'):
        raise ValidationError("day_id and user_id are required")

    optimized = ai_service.optimize_job_sequence(data['day_id'], data['user_id'])

    return jsonify({
        'status': 'success',
        'optimized_sequence': optimized
    }), 200


@bp.route('/ai/balance-workload/<int:plan_id>', methods=['POST'])
@jwt_required()
def ai_balance_workload(plan_id):
    """Rebalance workload across workers."""
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    result = ai_service.balance_workload(plan_id)

    return jsonify({
        'status': 'success',
        **result
    }), 200


@bp.route('/ai/predict-duration', methods=['POST'])
@jwt_required()
def ai_predict_duration():
    """
    Predict job duration.

    Request body:
        {
            "job_type": "pm",
            "equipment_id": 1,
            "team_size": 2
        }
    """
    user = get_current_user()

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    prediction = ai_service.predict_job_duration(data)

    return jsonify({
        'status': 'success',
        **prediction
    }), 200


@bp.route('/ai/predict-delay/<int:job_id>', methods=['GET'])
@jwt_required()
def ai_predict_delay(job_id):
    """Predict delay risk for a job."""
    user = get_current_user()

    job = db.session.get(WorkPlanJob, job_id)
    if not job:
        raise NotFoundError("Job not found")

    prediction = ai_service.predict_delay_risk(job_id)

    return jsonify({
        'status': 'success',
        **prediction
    }), 200


@bp.route('/ai/predict-completion/<int:plan_id>', methods=['GET'])
@jwt_required()
def ai_predict_completion(plan_id):
    """Predict plan completion rate."""
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    prediction = ai_service.predict_completion_rate(plan_id)

    return jsonify({
        'status': 'success',
        **prediction
    }), 200


@bp.route('/ai/forecast-workload', methods=['GET'])
@jwt_required()
def ai_forecast_workload():
    """
    Forecast upcoming workload.

    Query params:
        - weeks_ahead: Number of weeks to forecast (default 4)
    """
    user = get_current_user()

    weeks_ahead = request.args.get('weeks_ahead', 4, type=int)
    weeks_ahead = min(weeks_ahead, 12)  # Max 12 weeks

    forecasts = ai_service.forecast_workload(weeks_ahead)

    return jsonify({
        'status': 'success',
        'forecasts': forecasts,
        'weeks_ahead': weeks_ahead
    }), 200


@bp.route('/ai/detect-anomalies/<int:plan_id>', methods=['GET'])
@jwt_required()
def ai_detect_anomalies(plan_id):
    """Detect schedule anomalies."""
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    anomalies = ai_service.detect_schedule_anomalies(plan_id)

    return jsonify({
        'status': 'success',
        'plan_id': plan_id,
        'anomalies': anomalies,
        'count': len(anomalies)
    }), 200


@bp.route('/ai/bottlenecks/<int:plan_id>', methods=['GET'])
@jwt_required()
def ai_identify_bottlenecks(plan_id):
    """Identify scheduling bottlenecks."""
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    bottlenecks = ai_service.identify_bottlenecks(plan_id)

    return jsonify({
        'status': 'success',
        'plan_id': plan_id,
        'bottlenecks': bottlenecks,
        'count': len(bottlenecks)
    }), 200


@bp.route('/ai/critical-path/<int:plan_id>', methods=['GET'])
@jwt_required()
def ai_critical_path(plan_id):
    """Calculate critical path."""
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    result = ai_service.calculate_critical_path(plan_id)

    return jsonify({
        'status': 'success',
        **result
    }), 200


@bp.route('/ai/live-status/<int:plan_id>', methods=['GET'])
@jwt_required()
def ai_live_status(plan_id):
    """Real-time plan status summary."""
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    status = ai_service.get_live_status_summary(plan_id)

    return jsonify({
        'status': 'success',
        **status
    }), 200


@bp.route('/ai/skill-gaps', methods=['GET'])
@jwt_required()
def ai_skill_gaps():
    """Get skill gap analysis."""
    user = get_current_user()

    gaps = ai_service.get_skill_gap_analysis()

    return jsonify({
        'status': 'success',
        'skill_gaps': gaps,
        'count': len(gaps)
    }), 200


@bp.route('/ai/efficiency-score', methods=['GET'])
@jwt_required()
def ai_efficiency_score():
    """
    Get efficiency score.

    Query params:
        - plan_id: For plan efficiency
        - user_id: For worker efficiency
    """
    user = get_current_user()

    plan_id = request.args.get('plan_id', type=int)
    user_id = request.args.get('user_id', type=int)

    if not plan_id and not user_id:
        raise ValidationError("Either plan_id or user_id is required")

    score = ai_service.calculate_efficiency_score(plan_id=plan_id, user_id=user_id)

    return jsonify({
        'status': 'success',
        **score
    }), 200


@bp.route('/ai/natural-query', methods=['POST'])
@jwt_required()
def ai_natural_query():
    """
    Natural language planning query.

    Request body:
        {
            "query": "Schedule pump maintenance for Monday"
        }
    """
    user = get_current_user()

    data = request.get_json()
    if not data or not data.get('query'):
        raise ValidationError("query is required")

    # Use OpenAI to interpret and respond
    try:
        result = ai_service.openai_service.analyze_report_text(
            f"Work planning query: {data['query']}\n\nInterpret this as a scheduling request and provide structured JSON response with: action, parameters, and suggested_steps."
        )

        return jsonify({
            'status': 'success',
            'query': data['query'],
            'interpretation': result,
            'suggestions': [
                "Based on your query, I recommend reviewing available jobs in the pool.",
                "Check worker availability for the requested day.",
                "Consider existing assignments to avoid conflicts."
            ]
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'success',
            'query': data['query'],
            'interpretation': "Query received. Please use specific scheduling endpoints for actions.",
            'error_details': str(e)
        }), 200


@bp.route('/ai/simulate', methods=['POST'])
@jwt_required()
def ai_simulate():
    """
    Simulate a scheduling scenario.

    Request body:
        {
            "plan_id": 1,
            "scenario": {
                "type": "worker_absence",
                "params": {"user_id": 5}
            }
        }
    """
    user = get_current_user()

    data = request.get_json()
    if not data or not data.get('plan_id') or not data.get('scenario'):
        raise ValidationError("plan_id and scenario are required")

    plan = db.session.get(WorkPlan, data['plan_id'])
    if not plan:
        raise NotFoundError("Work plan not found")

    scenario = data['scenario']
    scenario_type = scenario.get('type')
    params = scenario.get('params', {})

    # Simulate based on scenario type
    if scenario_type == 'worker_absence':
        result = ai_service.real_time_reschedule({
            'event_type': 'absence',
            'affected_user_id': params.get('user_id'),
            'details': 'Simulated absence'
        })
    elif scenario_type == 'job_delay':
        result = ai_service.real_time_reschedule({
            'event_type': 'delay',
            'affected_job_id': params.get('job_id'),
            'details': 'Simulated delay'
        })
    else:
        result = {'message': 'Unknown scenario type', 'adjustments': [], 'notifications': []}

    return jsonify({
        'status': 'success',
        'scenario': scenario,
        'simulation_result': result
    }), 200


@bp.route('/ai/compare/<int:plan_a>/<int:plan_b>', methods=['GET'])
@jwt_required()
def ai_compare_plans(plan_a, plan_b):
    """Compare two plans."""
    user = get_current_user()

    plan_a_obj = db.session.get(WorkPlan, plan_a)
    plan_b_obj = db.session.get(WorkPlan, plan_b)

    if not plan_a_obj or not plan_b_obj:
        raise NotFoundError("One or both plans not found")

    # Calculate metrics for both plans
    def get_plan_metrics(plan):
        total_jobs = sum(len(day.jobs) for day in plan.days)
        total_hours = sum(sum(job.estimated_hours or 0 for job in day.jobs) for day in plan.days)
        assigned_jobs = sum(1 for day in plan.days for job in day.jobs if job.assignments)
        unique_workers = len(set(
            a.user_id for day in plan.days for job in day.jobs for a in job.assignments
        ))

        return {
            'plan_id': plan.id,
            'week_start': plan.week_start.isoformat(),
            'status': plan.status,
            'total_jobs': total_jobs,
            'total_hours': round(total_hours, 1),
            'assigned_jobs': assigned_jobs,
            'assignment_rate': round(assigned_jobs / total_jobs * 100, 1) if total_jobs > 0 else 0,
            'unique_workers': unique_workers
        }

    metrics_a = get_plan_metrics(plan_a_obj)
    metrics_b = get_plan_metrics(plan_b_obj)

    # Calculate differences
    differences = {
        'jobs_diff': metrics_b['total_jobs'] - metrics_a['total_jobs'],
        'hours_diff': round(metrics_b['total_hours'] - metrics_a['total_hours'], 1),
        'assignment_rate_diff': round(metrics_b['assignment_rate'] - metrics_a['assignment_rate'], 1),
        'workers_diff': metrics_b['unique_workers'] - metrics_a['unique_workers']
    }

    return jsonify({
        'status': 'success',
        'plan_a': metrics_a,
        'plan_b': metrics_b,
        'differences': differences
    }), 200


@bp.route('/ai/safety-check/<int:plan_id>', methods=['GET'])
@jwt_required()
def ai_safety_check(plan_id):
    """Check safety compliance for a plan."""
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    issues = []
    warnings = []

    # Check for required certifications
    for day in plan.days:
        for job in day.jobs:
            if job.template_id:
                template = db.session.get(JobTemplate, job.template_id)
                if template and template.required_certifications:
                    for assignment in job.assignments:
                        user_skills = WorkerSkill.query.filter_by(user_id=assignment.user_id).all()
                        skill_names = {s.skill_name.lower() for s in user_skills if s.is_verified and not s.is_expired}

                        for cert in template.required_certifications:
                            if cert.lower() not in skill_names:
                                issues.append({
                                    'type': 'missing_certification',
                                    'severity': 'error',
                                    'job_id': job.id,
                                    'user_id': assignment.user_id,
                                    'certification': cert,
                                    'description': f'Worker lacks required certification: {cert}'
                                })

    # Check for expired certifications
    for day in plan.days:
        for job in day.jobs:
            for assignment in job.assignments:
                expired_skills = WorkerSkill.query.filter_by(user_id=assignment.user_id).all()
                for skill in expired_skills:
                    if skill.is_expired:
                        warnings.append({
                            'type': 'expired_certification',
                            'severity': 'warning',
                            'job_id': job.id,
                            'user_id': assignment.user_id,
                            'skill': skill.skill_name,
                            'expired_date': skill.expiry_date.isoformat() if skill.expiry_date else None
                        })

    compliant = len(issues) == 0

    return jsonify({
        'status': 'success',
        'plan_id': plan_id,
        'compliant': compliant,
        'issues': issues,
        'warnings': warnings,
        'summary': {
            'issues_count': len(issues),
            'warnings_count': len(warnings)
        }
    }), 200


@bp.route('/ai/sla-check/<int:plan_id>', methods=['GET'])
@jwt_required()
def ai_sla_check(plan_id):
    """Check SLA compliance for a plan."""
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    violations = []
    at_risk = []

    for day in plan.days:
        for job in day.jobs:
            # Check overdue jobs
            if job.overdue_value and job.overdue_value > 0:
                violations.append({
                    'type': 'overdue',
                    'job_id': job.id,
                    'equipment': job.equipment.name if job.equipment else 'N/A',
                    'overdue_by': f"{job.overdue_value} {job.overdue_unit}",
                    'scheduled_for': day.date.isoformat()
                })

            # Check high priority jobs scheduled late in week
            if job.priority in ('urgent', 'high') and day.date.weekday() >= 3:
                at_risk.append({
                    'type': 'late_week_priority',
                    'job_id': job.id,
                    'priority': job.priority,
                    'scheduled_for': day.date.isoformat(),
                    'recommendation': 'Consider moving to earlier in the week'
                })

    compliant = len(violations) == 0

    return jsonify({
        'status': 'success',
        'plan_id': plan_id,
        'compliant': compliant,
        'violations': violations,
        'at_risk': at_risk,
        'summary': {
            'violations_count': len(violations),
            'at_risk_count': len(at_risk)
        }
    }), 200


@bp.route('/ai/transcribe-handover', methods=['POST'])
@jwt_required()
def ai_transcribe_handover():
    """
    Transcribe voice handover using multi-provider AI.
    Priority: Google Cloud → Gemini → Together AI → Groq → OpenAI

    Request body:
        {
            "audio_file_id": 123,
            "language_hint": "en"  # optional
        }
    """
    import os
    import tempfile
    import requests
    import logging as log
    from app.models.file import File

    from app.services.google_cloud_service import is_google_cloud_configured, get_speech_service as get_google_speech
    from app.services.gemini_service import is_gemini_configured, get_speech_service as get_gemini_speech
    from app.services.together_ai_service import is_together_configured, get_speech_service as get_together_speech
    from app.services.groq_service import is_groq_configured, get_speech_service as get_groq_speech
    from app.services.translation_service import TranslationService

    user = get_current_user()

    data = request.get_json()
    if not data or not data.get('audio_file_id'):
        raise ValidationError("audio_file_id is required")

    audio_file_id = data['audio_file_id']
    language_hint = data.get('language_hint', 'en')

    # Get the file record
    file_record = db.session.get(File, audio_file_id)
    if not file_record:
        raise NotFoundError("Audio file not found")

    if not file_record.file_path:
        raise ValidationError("Audio file has no URL")

    try:
        # Download audio from Cloudinary
        response = requests.get(file_record.file_path, timeout=30)
        if response.status_code != 200:
            raise ValidationError("Could not download audio file")

        audio_content = response.content

        # Create temp file
        suffix = '.wav'
        if file_record.original_name and '.' in file_record.original_name:
            suffix = '.' + file_record.original_name.rsplit('.', 1)[1].lower()

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_content)
            tmp_path = tmp.name

        try:
            result = None

            # Priority 1: Google Cloud
            if is_google_cloud_configured():
                log.getLogger(__name__).info("Using Google Cloud Speech-to-Text")
                speech_service = get_google_speech()
                result = speech_service.transcribe_file(tmp_path, language_hint)

            # Priority 2: Gemini
            elif is_gemini_configured():
                log.getLogger(__name__).info("Using Gemini Audio")
                speech_service = get_gemini_speech()
                result = speech_service.transcribe_file(tmp_path, language_hint)

            # Priority 3: Together AI
            elif is_together_configured():
                log.getLogger(__name__).info("Using Together AI Whisper")
                speech_service = get_together_speech()
                result = speech_service.transcribe_file(tmp_path, language_hint)

            # Priority 4: Groq
            elif is_groq_configured():
                log.getLogger(__name__).info("Using Groq Whisper")
                speech_service = get_groq_speech()
                result = speech_service.transcribe_file(tmp_path, language_hint)

            # Priority 5: OpenAI
            else:
                api_key = os.getenv('OPENAI_API_KEY')
                if api_key:
                    from openai import OpenAI
                    client = OpenAI(api_key=api_key)
                    with open(tmp_path, 'rb') as f:
                        transcript = client.audio.transcriptions.create(
                            model='whisper-1',
                            file=f,
                            response_format='text'
                        )
                    if transcript:
                        result = {'text': transcript.strip()}

            if not result or not result.get('text'):
                return jsonify({
                    'status': 'error',
                    'message': 'No AI transcription service configured',
                    'hint': 'Set GEMINI_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY'
                }), 400

            # Process transcription
            text = result['text'].strip()

            # Check if provider returned bilingual
            if result.get('en') and result.get('ar'):
                en_text = result['en']
                ar_text = result['ar']
            else:
                translated = TranslationService.auto_translate(text)
                en_text = translated.get('en') or text
                ar_text = translated.get('ar') or text

            return jsonify({
                'status': 'success',
                'audio_file_id': audio_file_id,
                'transcription': {
                    'text': text,
                    'en': en_text,
                    'ar': ar_text,
                    'confidence': result.get('confidence', 0.95),
                    'language': result.get('detected_language', language_hint)
                }
            }), 200

        finally:
            os.unlink(tmp_path)

    except Exception as e:
        log.getLogger(__name__).error(f"Transcription failed: {e}")
        return jsonify({
            'status': 'error',
            'message': f'Transcription failed: {str(e)}'
        }), 500


# ==================== REPORTS ====================

@bp.route('/reports/performance', methods=['GET'])
@jwt_required()
def report_performance():
    """
    Get performance report.

    Query params:
        - period: weekly, monthly, quarterly (default monthly)
        - user_id: Specific user (optional)
    """
    user = get_current_user()

    period = request.args.get('period', 'monthly')
    user_id = request.args.get('user_id', type=int)

    result = ai_service.analyze_historical_performance(period)

    # Filter by user if specified
    if user_id and result.get('top_performers'):
        result['top_performers'] = [p for p in result['top_performers'] if p.get('user_id') == user_id]

    return jsonify({
        'status': 'success',
        'report': result
    }), 200


@bp.route('/reports/completion', methods=['GET'])
@jwt_required()
def report_completion():
    """
    Get completion report.

    Query params:
        - from: Start date (YYYY-MM-DD)
        - to: End date (YYYY-MM-DD)
    """
    user = get_current_user()

    from_date_str = request.args.get('from')
    to_date_str = request.args.get('to')

    if from_date_str:
        from_date = datetime.strptime(from_date_str, '%Y-%m-%d').date()
    else:
        from_date = date.today() - timedelta(days=30)

    if to_date_str:
        to_date = datetime.strptime(to_date_str, '%Y-%m-%d').date()
    else:
        to_date = date.today()

    # Get plans in date range
    plans = WorkPlan.query.filter(
        WorkPlan.week_start >= from_date,
        WorkPlan.week_end <= to_date
    ).all()

    report_data = []
    for plan in plans:
        total_jobs = sum(len(day.jobs) for day in plan.days)
        completed_jobs = sum(
            1 for day in plan.days for job in day.jobs
            if hasattr(job, 'tracking') and job.tracking and job.tracking.status == 'completed'
        )
        completion_rate = (completed_jobs / total_jobs * 100) if total_jobs > 0 else 0

        report_data.append({
            'plan_id': plan.id,
            'week_start': plan.week_start.isoformat(),
            'week_end': plan.week_end.isoformat(),
            'total_jobs': total_jobs,
            'completed_jobs': completed_jobs,
            'completion_rate': round(completion_rate, 1)
        })

    overall_total = sum(r['total_jobs'] for r in report_data)
    overall_completed = sum(r['completed_jobs'] for r in report_data)
    overall_rate = (overall_completed / overall_total * 100) if overall_total > 0 else 0

    return jsonify({
        'status': 'success',
        'period': {
            'from': from_date.isoformat(),
            'to': to_date.isoformat()
        },
        'plans': report_data,
        'overall': {
            'total_jobs': overall_total,
            'completed_jobs': overall_completed,
            'completion_rate': round(overall_rate, 1)
        }
    }), 200


@bp.route('/reports/time-accuracy', methods=['GET'])
@jwt_required()
def report_time_accuracy():
    """Get time estimation accuracy report."""
    user = get_current_user()

    issues = ai_service.detect_time_estimation_issues()

    return jsonify({
        'status': 'success',
        'estimation_issues': issues,
        'recommendations': [
            'Review and adjust time estimates for job types with high error rates',
            'Consider equipment-specific adjustments',
            'Train planners on accurate estimation techniques'
        ]
    }), 200


@bp.route('/reports/export/<int:plan_id>', methods=['GET'])
@jwt_required()
def export_plan_report(plan_id):
    """
    Export plan to Excel/CSV.

    Query params:
        - format: xlsx or csv (default xlsx)
    """
    user = get_current_user()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    export_format = request.args.get('format', 'xlsx')
    language = get_language(user)

    # Build data for export
    rows = []
    for day in plan.days:
        for job in day.jobs:
            workers = ', '.join([a.user.full_name for a in job.assignments if a.user])
            materials_list = ', '.join([f"{m.material.name} ({m.quantity})" for m in job.materials if m.material])

            rows.append({
                'Day': day.date.strftime('%A'),
                'Date': day.date.isoformat(),
                'Job Type': job.job_type,
                'Equipment': job.equipment.name if job.equipment else '',
                'Berth': job.berth or '',
                'Description': job.description or '',
                'SAP Order': job.sap_order_number or '',
                'Estimated Hours': job.estimated_hours or 0,
                'Priority': job.priority,
                'Workers': workers,
                'Materials': materials_list
            })

    import pandas as pd
    df = pd.DataFrame(rows)

    output = BytesIO()

    if export_format == 'csv':
        df.to_csv(output, index=False)
        mimetype = 'text/csv'
        filename = f'work_plan_{plan.week_start}_export.csv'
    else:
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Work Plan', index=False)
        mimetype = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        filename = f'work_plan_{plan.week_start}_export.xlsx'

    output.seek(0)

    return Response(
        output.getvalue(),
        mimetype=mimetype,
        headers={
            'Content-Disposition': f'attachment; filename={filename}'
        }
    )


# ==================== JOB CLASSIFICATION ====================

MAJOR_KEYWORDS = [
    'engine', 'transmission', 'hydraulic', 'brakes', 'brake', 'overhaul',
    'rebuild', 'replacement', 'crack', 'structural', 'frame', 'suspension',
    'differential', 'gearbox', 'clutch', 'radiator', 'turbo', 'compressor',
    'alternator', 'starter motor', 'fuel pump', 'injector', 'cylinder',
    'piston', 'crankshaft', 'camshaft', 'timing chain', 'timing belt',
    'wiring harness', 'complete', 'full',
]

MINOR_KEYWORDS = [
    'filter', 'oil', 'fluid', 'top-up', 'lamp', 'bulb', 'light', 'belt',
    'hose', 'clamp', 'fuse', 'relay', 'sensor', 'wiper', 'washer', 'mirror',
    'door handle', 'latch', 'gasket', 'adjustment', 'calibration',
    'lubrication', 'grease', 'tire', 'tyre', 'wheel', 'rotation',
    'alignment', 'cleaning', 'wash', 'polish', 'inspection', 'check',
    'test', 'measure', 'visual',
]


def _classify_with_gemini(description: str) -> dict | None:
    """Try to classify job difficulty using Gemini text model."""
    try:
        from app.services.gemini_service import is_gemini_configured, _get_api_key, _get_api_url, TRANSLATION_MODELS
        import requests as req

        if not is_gemini_configured():
            return None

        prompt = (
            "You are a maintenance job classifier. Given this job description, "
            "classify it as either 'minor' or 'major'. A major job involves significant "
            "disassembly, structural work, or engine/transmission/hydraulic repair. "
            "A minor job is routine maintenance like filters, fluids, inspections, adjustments.\n\n"
            f"Job description: {description}\n\n"
            "Reply with ONLY valid JSON: {\"difficulty\": \"minor\" or \"major\", \"confidence\": 0.0-1.0, \"reason\": \"brief reason\"}"
        )

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 150}
        }

        api_key = _get_api_key()
        for model in TRANSLATION_MODELS:
            url = f"{_get_api_url(model)}:generateContent?key={api_key}"
            try:
                resp = req.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=15)
                if resp.status_code == 200:
                    text = resp.json()['candidates'][0]['content']['parts'][0]['text'].strip()
                    # Extract JSON from response
                    if '{' in text:
                        text = text[text.index('{'):text.rindex('}') + 1]
                    return json.loads(text)
                elif resp.status_code == 429:
                    break
            except Exception:
                continue
    except Exception as e:
        logger.warning(f"Gemini classify failed: {e}")
    return None


@bp.route('/classify-job', methods=['POST'])
@jwt_required()
def classify_job():
    """Classify a job description as minor or major."""
    user = engineer_or_admin_required()

    data = request.get_json() or {}
    description = (data.get('description') or '').strip()
    if not description:
        raise ValidationError("description is required")

    desc_lower = description.lower()
    major_hits = sum(1 for kw in MAJOR_KEYWORDS if kw in desc_lower)
    minor_hits = sum(1 for kw in MINOR_KEYWORDS if kw in desc_lower)

    # Clear keyword winner (2+ margin)
    if major_hits >= minor_hits + 2:
        return jsonify({'data': {'difficulty': 'major', 'confidence': min(0.95, 0.6 + major_hits * 0.1), 'reason': f'Matched {major_hits} major keywords vs {minor_hits} minor'}})
    if minor_hits >= major_hits + 2:
        return jsonify({'data': {'difficulty': 'minor', 'confidence': min(0.95, 0.6 + minor_hits * 0.1), 'reason': f'Matched {minor_hits} minor keywords vs {major_hits} major'}})

    # Ambiguous — try AI
    ai_result = _classify_with_gemini(description)
    if ai_result and ai_result.get('difficulty') in ('minor', 'major'):
        ai_result['source'] = 'ai'
        return jsonify({'data': ai_result})

    # Fallback: if any major hits, lean major; else default minor
    if major_hits > minor_hits:
        return jsonify({'data': {'difficulty': 'major', 'confidence': 0.4, 'reason': f'Slight major lean ({major_hits} vs {minor_hits}), AI unavailable'}})

    return jsonify({'data': {'difficulty': 'minor', 'confidence': 0.3, 'reason': 'No clear signal, defaulting to minor'}})
