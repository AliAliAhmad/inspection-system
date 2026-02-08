"""
Work Planning endpoints.
Handles weekly work plans, jobs, assignments, and materials.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models import (
    WorkPlan, WorkPlanDay, WorkPlanJob, WorkPlanAssignment, WorkPlanMaterial,
    Material, MaterialKit, MaterialKitItem, User, Equipment, Defect,
    InspectionAssignment, Notification, MaintenanceCycle, PMTemplate, PMTemplateMaterial
)
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from app.utils.decorators import get_current_user
from app.services.notification_service import NotificationService
from datetime import datetime, timedelta
import pandas as pd
from io import BytesIO

bp = Blueprint('work_plans', __name__)


def engineer_or_admin_required():
    """Check if user is engineer or admin."""
    user = get_current_user()
    if user.role not in ['admin', 'engineer', 'quality_engineer']:
        raise ForbiddenError("Only engineers and admins can access this resource")
    return user


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

    Query params:
        - week_start: Week to get (YYYY-MM-DD), defaults to current week
    """
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

    plan = WorkPlan.query.filter_by(week_start=week_date, status='published').first()

    if not plan:
        return jsonify({
            'status': 'success',
            'message': 'No published plan for this week',
            'work_plan': None,
            'my_jobs': []
        }), 200

    # Get user's assigned jobs
    my_jobs = []
    for day in plan.days:
        day_jobs = []
        for job in day.jobs:
            for assignment in job.assignments:
                if assignment.user_id == user.id:
                    job_dict = job.to_dict(language)
                    job_dict['is_lead'] = assignment.is_lead
                    job_dict['day_date'] = day.date.isoformat()
                    job_dict['day_name'] = day.date.strftime('%A')
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
        - type: PM, CM (Corrective Maintenance), INS (Inspection) (required)
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
    templates_linked = 0
    materials_added = 0
    errors = []

    for idx, row in df.iterrows():
        try:
            order_number = str(row['order_number']).strip()
            job_type_raw = str(row['type']).strip().upper()
            equipment_code = str(row['equipment_code']).strip()
            date_str = str(row['date']).strip()
            estimated_hours = float(row['estimated_hours'])

            # Map SAP type to our job type
            if job_type_raw == 'PM':
                job_type = 'pm'
            elif job_type_raw == 'CM':
                job_type = 'defect'
            elif job_type_raw == 'INS':
                job_type = 'inspection'
            else:
                errors.append(f"Row {idx + 2}: Unknown type '{job_type_raw}'")
                continue

            # Parse date
            try:
                if hasattr(row['date'], 'date'):
                    job_date = row['date'].date()
                else:
                    job_date = datetime.strptime(date_str[:10], '%Y-%m-%d').date()
            except:
                errors.append(f"Row {idx + 2}: Invalid date format")
                continue

            # Check date is within plan week
            if job_date < plan.week_start or job_date > plan.week_end:
                errors.append(f"Row {idx + 2}: Date {job_date} is outside plan week")
                continue

            # Find day
            day = WorkPlanDay.query.filter_by(work_plan_id=plan.id, date=job_date).first()
            if not day:
                errors.append(f"Row {idx + 2}: Day not found for date {job_date}")
                continue

            # Find equipment by code or serial_number
            equipment = Equipment.query.filter(
                db.or_(
                    Equipment.code == equipment_code,
                    Equipment.serial_number == equipment_code
                )
            ).first()
            if not equipment:
                errors.append(f"Row {idx + 2}: Equipment '{equipment_code}' not found")
                continue

            # Get next position
            max_position = db.session.query(db.func.max(WorkPlanJob.position)).filter_by(
                work_plan_day_id=day.id
            ).scalar() or 0

            # Parse priority
            priority = str(row.get('priority', 'normal')).lower() if pd.notna(row.get('priority')) else 'normal'
            if priority not in ['low', 'normal', 'high', 'urgent']:
                priority = 'normal'

            # Parse cycle information (for PM jobs)
            cycle_id = None
            pm_template = None
            if job_type == 'pm':
                cycle_value = row.get('cycle_value')
                cycle_unit = str(row.get('cycle_unit', '')).lower().strip() if pd.notna(row.get('cycle_unit')) else None

                if pd.notna(cycle_value):
                    try:
                        cycle_value = int(float(cycle_value))
                        # Find matching cycle
                        if cycle_unit in ['hours', 'h', 'hour']:
                            cycle = MaintenanceCycle.query.filter_by(
                                cycle_type='running_hours',
                                hours_value=cycle_value,
                                is_active=True
                            ).first()
                        elif cycle_unit in ['days', 'weeks', 'months']:
                            cycle = MaintenanceCycle.query.filter_by(
                                cycle_type='calendar',
                                calendar_value=cycle_value,
                                calendar_unit=cycle_unit,
                                is_active=True
                            ).first()
                        else:
                            # Default to running_hours if no unit specified
                            cycle = MaintenanceCycle.query.filter_by(
                                cycle_type='running_hours',
                                hours_value=cycle_value,
                                is_active=True
                            ).first()

                        if cycle:
                            cycle_id = cycle.id
                            # Try to find matching PM template
                            pm_template = PMTemplate.find_for_job(equipment.equipment_type, cycle_id)
                    except (ValueError, TypeError):
                        pass

            # Parse overdue information
            overdue_value = None
            overdue_unit = None
            if pd.notna(row.get('overdue_value')):
                try:
                    overdue_value = float(row['overdue_value'])
                    overdue_unit = str(row.get('overdue_unit', 'hours')).lower().strip() if pd.notna(row.get('overdue_unit')) else 'hours'
                    if overdue_unit not in ['hours', 'days']:
                        overdue_unit = 'hours' if job_type == 'pm' else 'days'
                except (ValueError, TypeError):
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

            # Get description and notes
            description = str(row.get('description', '')).strip() if pd.notna(row.get('description')) else None
            notes = str(row.get('note', '')).strip() if pd.notna(row.get('note')) else None
            if not notes:
                notes = str(row.get('notes', '')).strip() if pd.notna(row.get('notes')) else None

            # Get maintenance base
            maintenance_base = str(row.get('maintenance_base', '')).strip() if pd.notna(row.get('maintenance_base')) else None

            # Create job
            job = WorkPlanJob(
                work_plan_day_id=day.id,
                job_type=job_type,
                berth=equipment.berth,
                equipment_id=equipment.id,
                sap_order_number=order_number,
                description=description,
                cycle_id=cycle_id,
                pm_template_id=pm_template.id if pm_template else None,
                overdue_value=overdue_value,
                overdue_unit=overdue_unit,
                maintenance_base=maintenance_base,
                planned_date=planned_date,
                estimated_hours=pm_template.estimated_hours if pm_template else estimated_hours,
                position=max_position + 1,
                priority=priority,
                notes=notes
            )

            db.session.add(job)
            db.session.flush()  # Get job ID for materials

            # If PM template found, auto-add materials
            if pm_template:
                templates_linked += 1
                for tm in pm_template.materials:
                    wpm = WorkPlanMaterial(
                        work_plan_job_id=job.id,
                        material_id=tm.material_id,
                        quantity=tm.quantity
                    )
                    db.session.add(wpm)
                    materials_added += 1

            created += 1

        except Exception as e:
            errors.append(f"Row {idx + 2}: {str(e)}")

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Import complete. Created {created} jobs.',
        'created': created,
        'templates_linked': templates_linked,
        'materials_added': materials_added,
        'errors': errors
    }), 200


# ==================== AVAILABLE JOBS ====================

@bp.route('/available-jobs', methods=['GET'])
@jwt_required()
def get_available_jobs():
    """
    Get available jobs that can be added to a work plan.
    Returns open defects and PM-due equipment.

    Query params:
        - berth: Filter by berth (east, west)
        - job_type: Filter by type (pm, defect, inspection)
    """
    user = get_current_user()
    language = user.language or 'en'

    berth = request.args.get('berth')
    job_type = request.args.get('job_type')

    result = {
        'pm_jobs': [],
        'defect_jobs': [],
        'inspection_jobs': []
    }

    # Get equipment for PM jobs (all running equipment)
    if not job_type or job_type == 'pm':
        eq_query = Equipment.query.filter(Equipment.is_active == True)
        if berth and berth != 'both':
            eq_query = eq_query.filter(
                db.or_(Equipment.berth == berth, Equipment.berth == 'both')
            )
        equipment_list = eq_query.order_by(Equipment.code).all()
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

    # Get pending inspection assignments
    if not job_type or job_type == 'inspection':
        today = datetime.utcnow().date()
        assignment_query = InspectionAssignment.query.filter(
            InspectionAssignment.status == 'pending',
            InspectionAssignment.due_date >= today
        )
        assignments = assignment_query.order_by(InspectionAssignment.due_date).all()
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
                'PRM = Preventive Maintenance, COM = Corrective Maintenance, INS = Inspection',
                'Equipment serial number (must exist in system)',
                'Target date for the job (YYYY-MM-DD)',
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
