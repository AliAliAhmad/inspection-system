"""
Work Planning endpoints.
Handles weekly work plans, jobs, assignments, and materials.
Enhanced with job templates, dependencies, capacity config, skills, conflicts, and AI features.
"""

from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models import (
    WorkPlan, WorkPlanDay, WorkPlanJob, WorkPlanAssignment, WorkPlanMaterial,
    Material, MaterialKit, MaterialKitItem, User, Equipment, Defect,
    InspectionAssignment, Notification, MaintenanceCycle, PMTemplate, PMTemplateMaterial,
    SAPWorkOrder, WorkPlanJobTracking,
    # Enhanced Work Planning models
    JobTemplate, JobTemplateMaterial, JobTemplateChecklist, JobDependency,
    CapacityConfig, WorkerSkill, EquipmentRestriction, WorkPlanVersion,
    SchedulingConflict, JobChecklistResponse
)
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from app.utils.decorators import get_current_user, admin_required as admin_decorator
from app.services.notification_service import NotificationService
from app.services.work_plan_ai_service import WorkPlanAIService
from datetime import datetime, timedelta, date
import pandas as pd
from io import BytesIO
import json

bp = Blueprint('work_plans', __name__)


def engineer_or_admin_required():
    """Check if user is engineer or admin."""
    user = get_current_user()
    if user.role not in ['admin', 'engineer', 'quality_engineer']:
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
def debug_work_plan(week_start_str):
    """Debug endpoint to check work plan loading (temporary)."""
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
        pending_sap_orders = SAPWorkOrder.query.filter_by(
            work_plan_id=plan.id,
            status='pending'
        ).count()

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
        import traceback
        return jsonify({
            'status': 'error',
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 200


@bp.route('/cleanup/<week_start_str>', methods=['POST'])
def cleanup_duplicate_jobs(week_start_str):
    """Remove duplicate jobs (keep first occurrence by SAP order)."""
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
        import traceback
        return jsonify({
            'status': 'error',
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 200


@bp.route('/clear-jobs/<week_start_str>', methods=['POST'])
def clear_all_jobs(week_start_str):
    """Remove ALL jobs from a plan (use with caution!)."""
    try:
        week_date = datetime.strptime(week_start_str, '%Y-%m-%d').date()
        plan = WorkPlan.query.filter_by(week_start=week_date).first()
        if not plan:
            return jsonify({'status': 'no_plan'}), 404

        deleted = 0
        for day in plan.days:
            for job in day.jobs:
                db.session.delete(job)
                deleted += 1

        db.session.commit()

        return jsonify({
            'status': 'ok',
            'deleted': deleted
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        return jsonify({
            'status': 'error',
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 200


@bp.route('/clear-pool/<week_start_str>', methods=['POST'])
def clear_sap_pool(week_start_str):
    """Remove ALL SAP orders from the pool for a plan."""
    try:
        week_date = datetime.strptime(week_start_str, '%Y-%m-%d').date()
        plan = WorkPlan.query.filter_by(week_start=week_date).first()
        if not plan:
            return jsonify({'status': 'no_plan'}), 404

        deleted = SAPWorkOrder.query.filter_by(work_plan_id=plan.id).delete()
        db.session.commit()

        return jsonify({
            'status': 'ok',
            'deleted': deleted
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        return jsonify({
            'status': 'error',
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 200


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
    language = user.language or 'en'

    week_start = request.args.get('week_start')
    status = request.args.get('status')
    include_days = request.args.get('include_days', 'false').lower() == 'true'

    query = WorkPlan.query

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
    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    user = get_current_user()
    language = user.language or 'en'

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

    # Ensure it's a Monday
    if week_start.weekday() != 0:
        # Adjust to Monday
        week_start = week_start - timedelta(days=week_start.weekday())

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
    if job_type not in ['pm', 'defect', 'inspection']:
        raise ValidationError("job_type must be pm, defect, or inspection")

    # Validate references based on job type
    equipment_id = data.get('equipment_id')
    defect_id = data.get('defect_id')
    inspection_assignment_id = data.get('inspection_assignment_id')

    if job_type in ['pm', 'defect'] and not equipment_id:
        raise ValidationError("equipment_id is required for PM and defect jobs")

    if job_type == 'defect' and not defect_id:
        raise ValidationError("defect_id is required for defect jobs")

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

    if inspection_assignment_id:
        assignment = db.session.get(InspectionAssignment, inspection_assignment_id)
        if not assignment:
            raise NotFoundError("Inspection assignment not found")

    # Get next position
    max_position = db.session.query(db.func.max(WorkPlanJob.position)).filter_by(
        work_plan_day_id=day.id
    ).scalar() or 0

    job = WorkPlanJob(
        work_plan_day_id=day.id,
        job_type=job_type,
        berth=data.get('berth'),
        equipment_id=equipment_id,
        defect_id=defect_id,
        inspection_assignment_id=inspection_assignment_id,
        sap_order_number=data.get('sap_order_number'),
        description=data.get('description'),
        estimated_hours=float(data['estimated_hours']),
        position=max_position + 1,
        priority=data.get('priority', 'normal'),
        notes=data.get('notes')
    )

    db.session.add(job)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Job added to plan',
        'job': job.to_dict(user.language or 'en')
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
    if not sap_order or sap_order.work_plan_id != plan_id:
        raise NotFoundError("SAP order not found in this plan")

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
    if pm_template:
        for tm in pm_template.materials:
            wpm = WorkPlanMaterial(
                work_plan_job_id=job.id,
                material_id=tm.material_id,
                quantity=tm.quantity
            )
            db.session.add(wpm)

    # Mark SAP order as scheduled
    sap_order.status = 'scheduled'

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'SAP order scheduled',
        'job': job.to_dict(user.language or 'en')
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

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Job updated',
        'job': job.to_dict(user.language or 'en')
    }), 200


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

    db.session.delete(job)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Job removed from plan'
    }), 200


# ==================== ASSIGNMENTS ====================

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

    # Check if already assigned
    existing = WorkPlanAssignment.query.filter_by(
        work_plan_job_id=job_id,
        user_id=data['user_id']
    ).first()

    if existing:
        # Update is_lead if provided
        if 'is_lead' in data:
            existing.is_lead = data['is_lead']
        db.session.commit()
        return jsonify({
            'status': 'success',
            'message': 'Assignment updated',
            'assignment': existing.to_dict()
        }), 200

    assignment = WorkPlanAssignment(
        work_plan_job_id=job_id,
        user_id=data['user_id'],
        is_lead=data.get('is_lead', False)
    )

    db.session.add(assignment)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'User assigned to job',
        'assignment': assignment.to_dict()
    }), 201


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

    # Generate PDF
    from app.services.work_plan_pdf_service import WorkPlanPDFService
    pdf_file = None
    try:
        pdf_file = WorkPlanPDFService.generate_plan_pdf(plan)
        plan.pdf_file_id = pdf_file.id if pdf_file else None
    except Exception as e:
        # Continue without PDF if generation fails
        print(f"PDF generation failed: {e}")

    # Update status
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

    # Send email to planning team (async-ish, non-blocking)
    email_sent = False
    if send_email:
        try:
            from app.services.email_service import EmailService
            email_sent = EmailService.send_work_plan_notification(plan, pdf_file)
        except Exception as e:
            print(f"Email notification failed: {e}")

    return jsonify({
        'status': 'success',
        'message': 'Work plan published',
        'email_sent': email_sent,
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
    language = user.language or 'en'

    week_start = request.args.get('week_start')
    if week_start:
        try:
            week_date = datetime.strptime(week_start, '%Y-%m-%d').date()
        except ValueError:
            raise ValidationError("Invalid date format. Use YYYY-MM-DD")
    else:
        # Current week
        today = datetime.utcnow().date()
        week_date = today - timedelta(days=today.weekday())

    # Ensure it's a Monday
    if week_date.weekday() != 0:
        week_date = week_date - timedelta(days=week_date.weekday())

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
    ).filter_by(week_start=week_date, status='published').first()

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
                            'name': job.equipment.name,
                            'serial_number': job.equipment.serial_number
                        } if job.equipment else None,
                        'defect_id': job.defect_id,
                        'defect': {
                            'id': job.defect.id,
                            'description': job.defect.description,
                            'status': job.defect.status
                        } if job.defect else None,
                        'sap_order_number': job.sap_order_number,
                        'description': job.description,
                        'estimated_hours': job.estimated_hours,
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
                                'user_name': a.user.name if a.user else None,
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
    language = user.language or 'en'

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
    if not job_type or job_type in ['sap', 'pm', 'defect']:
        if plan_id:
            sap_query = SAPWorkOrder.query.filter_by(work_plan_id=int(plan_id), status='pending')
            if berth and berth != 'both':
                sap_query = sap_query.filter(
                    db.or_(SAPWorkOrder.berth == berth, SAPWorkOrder.berth == 'both', SAPWorkOrder.berth == None)
                )
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

    # Get open defects
    if not job_type or job_type == 'defect':
        defect_query = Defect.query.filter(Defect.status.in_(['open', 'in_progress']))
        defects = defect_query.order_by(Defect.created_at.desc()).all()
        result['defect_jobs'] = [{
            'defect': d.to_dict(language),
            'job_type': 'defect',
            'equipment': d.inspection.equipment.to_dict() if d.inspection and d.inspection.equipment else None
        } for d in defects]

    # Get pending inspection assignments (unassigned or assigned but not completed)
    if not job_type or job_type == 'inspection':
        from app.models.inspection_list import InspectionList
        today = datetime.utcnow().date()
        assignment_query = InspectionAssignment.query.join(
            InspectionList, InspectionAssignment.inspection_list_id == InspectionList.id
        ).filter(
            InspectionAssignment.status.in_(['unassigned', 'assigned', 'in_progress']),
            InspectionList.target_date >= today
        )
        assignments = assignment_query.order_by(InspectionList.target_date).all()
        result['inspection_jobs'] = [{
            'assignment': a.to_dict(),
            'job_type': 'inspection'
        } for a in assignments]

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
        'date': ['2026-02-10', '2026-02-11', '2026-02-12'],
        'estimated_hours': [4, 6, 2],
        'description': ['Monthly pump maintenance', 'Crane hydraulic repair', 'Generator inspection'],
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

    df = pd.DataFrame(sample_data)

    # Create Excel file in memory
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Work Orders', index=False)

        # Add instructions sheet
        instructions = pd.DataFrame({
            'Column': [
                'order_number', 'type', 'equipment_code', 'date', 'estimated_hours',
                'description', 'priority', 'berth', 'cycle_value', 'cycle_unit',
                'maintenance_base', 'overdue_value', 'overdue_unit', 'planned_date', 'note'
            ],
            'Required': [
                'Yes', 'Yes', 'Yes', 'Yes', 'No',
                'No', 'No', 'No', 'No', 'No',
                'No', 'No', 'No', 'No', 'No'
            ],
            'Description': [
                'SAP order number (unique identifier)',
                'Any SAP order type (e.g., PRM, COM, INS, PM01, PM02, CM01). Stored as-is.',
                'Equipment name or serial number (must exist in system)',
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

    from app.services.work_plan_pdf_service import WorkPlanPDFService
    pdf_file = WorkPlanPDFService.generate_day_pdf(plan, day_date)

    if not pdf_file:
        raise ValidationError("Failed to generate PDF")

    return jsonify({
        'status': 'success',
        'pdf_url': pdf_file.get_url()
    }), 200


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

    # Get pending SAP orders
    sap_query = SAPWorkOrder.query.filter_by(work_plan_id=plan.id, status='pending')
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
            days_until = (order.required_date - datetime.utcnow().date()).days
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
    language = user.language or 'en'

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
    language = user.language or 'en'

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
    language = user.language or 'en'

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
    language = user.language or 'en'

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
