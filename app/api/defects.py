"""
Defect management endpoints.
"""

from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Defect, SpecialistJob, User
from app.extensions import db, safe_commit
from app.services.defect_service import DefectService
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from app.utils.decorators import get_current_user, admin_required, get_language
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
@admin_required()
def assign_specialist(defect_id):
    """
    Create a specialist job from a defect. Admin only.

    Request Body:
        {
            "specialist_id": 5,
            "category": "major",       // optional: "major" or "minor"
            "major_reason": "..."       // required if category is "major"
        }

    Returns:
        {
            "status": "success",
            "data": { specialist_job }
        }
    """
    defect = db.session.get(Defect, defect_id)
    if not defect:
        raise NotFoundError(f"Defect {defect_id} not found")

    # Check if already assigned
    existing = SpecialistJob.query.filter_by(defect_id=defect_id).first()
    if existing:
        raise ValidationError(
            f"Defect already assigned to specialist (Job {existing.job_id})"
        )

    data = request.get_json()
    if not data or 'specialist_id' not in data:
        raise ValidationError("specialist_id is required")

    specialist = db.session.get(User, data['specialist_id'])
    if not specialist or specialist.role != 'specialist':
        raise ValidationError("Invalid specialist user")

    category = data.get('category')
    if category and category not in ('major', 'minor'):
        raise ValidationError("category must be 'major' or 'minor'")
    if category == 'major' and not data.get('major_reason'):
        raise ValidationError("major_reason is required when category is 'major'")

    current_user_id = int(get_jwt_identity())

    # Generate next universal_id and job_id
    max_uid = db.session.query(db.func.max(SpecialistJob.universal_id)).scalar()
    next_uid = (max_uid or 0) + 1

    role_id_suffix = specialist.role_id[-3:] if specialist.role_id else '000'
    job_id = f"SPE{role_id_suffix}-{str(next_uid).zfill(3)}"

    job = SpecialistJob(
        universal_id=next_uid,
        job_id=job_id,
        defect_id=defect_id,
        specialist_id=specialist.id,
        assigned_by=current_user_id,
        assigned_at=datetime.utcnow(),
        category=category,
        major_reason=data.get('major_reason'),
        status='assigned',
    )
    db.session.add(job)

    # Update defect status
    if defect.status == 'open':
        defect.status = 'in_progress'

    safe_commit()

    # Send notification to specialist
    from app.services.notification_service import NotificationService
    NotificationService.create_notification(
        user_id=specialist.id,
        type='specialist_job_assigned',
        title='New Specialist Job',
        message=f'You have been assigned job {job.job_id} for defect #{defect_id}',
        related_type='specialist_job',
        related_id=job.id,
    )

    return jsonify({
        'status': 'success',
        'message': f'Specialist job {job.job_id} created',
        'data': job.to_dict(),
    }), 201