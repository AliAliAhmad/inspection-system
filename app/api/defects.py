"""
Defect management endpoints.
"""

from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Defect, Inspection, SpecialistJob, User
from app.extensions import db, safe_commit
from app.services.defect_service import DefectService
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from app.utils.decorators import get_current_user, admin_required, role_required, get_language
from app.utils.pagination import paginate

bp = Blueprint('defects', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
def list_defects():
    """
    List defects. Filtered by role.
    - Technicians see only assigned defects
    - Admins see all
    
    Query Parameters:
        status: Filter by status (open, in_progress, resolved, closed)
        severity: Filter by severity (low, medium, high, critical)
    
    Returns:
        {
            "status": "success",
            "defects": [...]
        }
    """
    current_user = get_current_user()
    
    query = Defect.query
    
    # Filter by role — admin and engineer see all, technician sees only assigned
    if current_user.role == 'technician':
        query = query.filter_by(assigned_to_id=current_user.id)
    elif current_user.role == 'specialist':
        # Specialists see defects assigned to them via specialist jobs
        from app.models import SpecialistJob
        specialist_defect_ids = db.session.query(SpecialistJob.defect_id).filter(
            SpecialistJob.specialist_id == current_user.id
        ).subquery()
        query = query.filter(Defect.id.in_(specialist_defect_ids))
    
    # Apply filters
    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)
    
    severity = request.args.get('severity')
    if severity:
        query = query.filter_by(severity=severity)

    equipment_id = request.args.get('equipment_id', type=int)
    if equipment_id:
        query = query.join(Inspection).filter(Inspection.equipment_id == equipment_id)

    query = query.order_by(Defect.due_date, Defect.severity.desc())
    items, pagination = paginate(query)
    lang = get_language(current_user)

    return jsonify({
        'status': 'success',
        'data': [defect.to_dict(language=lang) for defect in items],
        'pagination': pagination
    }), 200


@bp.route('/<int:defect_id>/resolve', methods=['POST'])
@jwt_required()
def resolve_defect(defect_id):
    """
    Mark defect as resolved.
    
    Request Body:
        {
            "resolution_notes": "Replaced faulty component"
        }
    
    Returns:
        {
            "status": "success",
            "defect": {...}
        }
    """
    data = request.get_json()
    current_user_id = get_jwt_identity()
    
    if not data or 'resolution_notes' not in data:
        raise ValidationError("resolution_notes is required")
    
    defect = DefectService.resolve_defect(
        defect_id=defect_id,
        resolution_notes=data['resolution_notes'],
        current_user_id=current_user_id
    )
    
    return jsonify({
        'status': 'success',
        'message': 'Defect resolved',
        'defect': defect.to_dict()
    }), 200


@bp.route('/<int:defect_id>/close', methods=['POST'])
@jwt_required()
@admin_required()
def close_defect(defect_id):
    """
    Close defect. Admin only.
    
    Returns:
        {
            "status": "success",
            "defect": {...}
        }
    """
    current_user_id = get_jwt_identity()
    
    defect = DefectService.close_defect(
        defect_id=defect_id,
        current_user_id=current_user_id
    )
    
    return jsonify({
        'status': 'success',
        'message': 'Defect closed',
        'defect': defect.to_dict()
    }), 200


@bp.route('/<int:defect_id>/assign-specialist', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def assign_specialist(defect_id):
    """
    Create specialist jobs from a defect. Admin and Engineer.

    Auto-assigns related defects: all open defects with the same equipment
    and specialization (category) will be assigned to the same specialist(s).

    Request Body:
        {
            "specialist_ids": [5, 8],    // required: one or more specialist IDs
            "specialist_id": 5,          // legacy: single specialist (used if specialist_ids absent)
            "category": "major",         // optional: "major" or "minor"
            "major_reason": "...",       // required if category is "major"
            "auto_assign_related": true  // optional: auto-assign related defects (default: true)
        }

    Returns:
        {
            "status": "success",
            "data": [ specialist_job, ... ],
            "related_defects_assigned": 2  // number of additional defects auto-assigned
        }
    """
    defect = db.session.get(Defect, defect_id)
    if not defect:
        raise NotFoundError(f"Defect {defect_id} not found")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    # Support both specialist_ids (array) and specialist_id (single) for backward compatibility
    specialist_ids = data.get('specialist_ids')
    if not specialist_ids:
        single_id = data.get('specialist_id')
        if not single_id:
            raise ValidationError("specialist_ids is required")
        specialist_ids = [single_id]

    if not isinstance(specialist_ids, list) or len(specialist_ids) == 0:
        raise ValidationError("specialist_ids must be a non-empty array")

    # Remove duplicates while preserving order
    seen = set()
    unique_ids = []
    for sid in specialist_ids:
        if sid not in seen:
            seen.add(sid)
            unique_ids.append(sid)
    specialist_ids = unique_ids

    # Validate all specialists
    specialists = []
    for sid in specialist_ids:
        specialist = db.session.get(User, sid)
        if not specialist or specialist.role != 'specialist':
            raise ValidationError(f"Invalid specialist user (id={sid})")
        specialists.append(specialist)

    category = data.get('category')
    if category and category not in ('major', 'minor'):
        raise ValidationError("category must be 'major' or 'minor'")
    if category == 'major' and not data.get('major_reason'):
        raise ValidationError("major_reason is required when category is 'major'")

    current_user_id = int(get_jwt_identity())
    auto_assign_related = data.get('auto_assign_related', True)

    # Get the equipment_id from the primary defect's inspection
    equipment_id = defect.inspection.equipment_id if defect.inspection else None
    defect_category = defect.category  # mechanical/electrical

    # Find all defects to assign (primary + related)
    defects_to_assign = [defect]

    if auto_assign_related and equipment_id and defect_category:
        # Find related open defects with same equipment + same category (specialization)
        related_defects = Defect.query.join(Inspection).filter(
            Defect.id != defect_id,
            Inspection.equipment_id == equipment_id,
            Defect.category == defect_category,
            Defect.status == 'open'
        ).all()

        # Filter out defects that already have specialist jobs
        for rd in related_defects:
            has_job = SpecialistJob.query.filter_by(defect_id=rd.id).first()
            if not has_job:
                defects_to_assign.append(rd)

    max_uid = db.session.query(db.func.max(SpecialistJob.universal_id)).scalar()
    next_uid = (max_uid or 0) + 1

    created_jobs = []
    for target_defect in defects_to_assign:
        # Check for existing assignments for these specialists on this defect
        existing = SpecialistJob.query.filter(
            SpecialistJob.defect_id == target_defect.id,
            SpecialistJob.specialist_id.in_(specialist_ids)
        ).all()

        if existing:
            # Skip this defect if already assigned
            continue

        for specialist in specialists:
            role_id_suffix = specialist.role_id[-3:] if specialist.role_id else '000'
            job_id = f"SPE{role_id_suffix}-{str(next_uid).zfill(3)}"

            job = SpecialistJob(
                universal_id=next_uid,
                job_id=job_id,
                defect_id=target_defect.id,
                specialist_id=specialist.id,
                assigned_by=current_user_id,
                assigned_at=datetime.utcnow(),
                category=category,
                major_reason=data.get('major_reason'),
                status='assigned',
            )
            db.session.add(job)
            created_jobs.append((job, specialist, target_defect))
            next_uid += 1

        # Update defect status
        if target_defect.status == 'open':
            target_defect.status = 'in_progress'

    safe_commit()

    # Send notifications to all assigned specialists
    from app.services.notification_service import NotificationService
    for job, specialist, target_defect in created_jobs:
        NotificationService.create_notification(
            user_id=specialist.id,
            type='specialist_job_assigned',
            title='New Specialist Job',
            message=f'You have been assigned job {job.job_id} for defect #{target_defect.id}',
            related_type='specialist_job',
            related_id=job.id,
        )

    jobs_data = [job.to_dict() for job, _, _ in created_jobs]
    job_ids = ', '.join(j.job_id for j, _, _ in created_jobs)
    related_count = len(defects_to_assign) - 1  # Exclude the primary defect

    return jsonify({
        'status': 'success',
        'message': f'Specialist jobs created: {job_ids}',
        'data': jobs_data,
        'related_defects_assigned': related_count,
    }), 201