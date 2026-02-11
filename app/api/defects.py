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


@bp.route('/<int:id>', methods=['GET'])
@jwt_required()
def get_defect(id):
    """
    Get a single defect with full details.

    Returns:
        {
            "status": "success",
            "data": {...}
        }
    """
    current_user = get_current_user()
    defect = Defect.query.get_or_404(id)
    lang = get_language(current_user)

    return jsonify({
        'status': 'success',
        'data': defect.to_dict(language=lang)
    }), 200


@bp.route('/<int:id>/escalate', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def escalate_defect(id):
    """
    Escalate a defect.

    Request Body:
        {
            "reason": "Critical production impact",
            "level": 2  // optional: escalation level (1-5)
        }

    Returns:
        {
            "status": "success",
            "message": "Defect escalated",
            "data": {...},
            "escalation": {...}
        }
    """
    from app.services.shared import EscalationEngine, EscalationLevel, defect_risk_scorer
    from app.services.notification_service import NotificationService

    defect = Defect.query.get_or_404(id)
    data = request.get_json() or {}

    if not data.get('reason'):
        raise ValidationError("reason is required")

    reason = data['reason']
    level = data.get('level', 2)  # Default to MEDIUM

    # Validate level
    if not isinstance(level, int) or level < 1 or level > 5:
        raise ValidationError("level must be an integer between 1 and 5")

    # Map level to EscalationLevel
    level_map = {
        1: EscalationLevel.LOW,
        2: EscalationLevel.MEDIUM,
        3: EscalationLevel.HIGH,
        4: EscalationLevel.CRITICAL,
        5: EscalationLevel.EMERGENCY,
    }
    escalation_level = level_map[level]

    # Update priority based on escalation level
    priority_map = {
        EscalationLevel.LOW: 'medium',
        EscalationLevel.MEDIUM: 'high',
        EscalationLevel.HIGH: 'high',
        EscalationLevel.CRITICAL: 'urgent',
        EscalationLevel.EMERGENCY: 'urgent',
    }
    new_priority = priority_map.get(escalation_level, defect.priority)

    # Update defect priority if escalation warrants it
    if new_priority and (defect.priority != 'urgent' or escalation_level.value >= 4):
        defect.priority = new_priority

    # Calculate risk score
    days_open = (datetime.utcnow().date() - defect.created_at.date()).days if defect.created_at else 0
    risk_context = {
        'severity': defect.severity,
        'days_old': days_open,
        'occurrence_count': defect.occurrence_count or 1,
        'sla_percentage': 50,  # Default, would be calculated from SLA tracker
    }
    risk_result = defect_risk_scorer.calculate(risk_context)

    safe_commit()

    # Create notification for admins and engineers
    from app.models import User
    admins_and_engineers = User.query.filter(
        User.role.in_(['admin', 'engineer']),
        User.is_active == True
    ).all()

    current_user_id = int(get_jwt_identity())
    for user in admins_and_engineers:
        if user.id != current_user_id:
            NotificationService.create_notification(
                user_id=user.id,
                type='defect_escalated',
                title='Defect Escalated',
                message=f'Defect #{defect.id} has been escalated: {reason}',
                related_type='defect',
                related_id=defect.id,
                priority='urgent' if level >= 4 else 'warning',
            )

    current_user = get_current_user()
    lang = get_language(current_user)

    return jsonify({
        'status': 'success',
        'message': 'Defect escalated',
        'data': defect.to_dict(language=lang),
        'escalation': {
            'level': escalation_level.name,
            'level_value': escalation_level.value,
            'reason': reason,
            'new_priority': defect.priority,
            'risk_score': risk_result.to_dict(),
            'escalated_at': datetime.utcnow().isoformat(),
        }
    }), 200


@bp.route('/<int:id>/sla', methods=['PUT'])
@jwt_required()
@role_required('admin', 'engineer')
def update_defect_sla(id):
    """
    Update SLA deadline for a defect.

    Request Body:
        {
            "new_deadline": "2024-03-15",
            "reason": "Extended due to parts availability"  // optional
        }

    Returns:
        {
            "status": "success",
            "message": "SLA deadline updated",
            "data": {...},
            "sla_change": {...}
        }
    """
    from app.services.shared import SLATracker, SLAConfig

    defect = Defect.query.get_or_404(id)
    data = request.get_json() or {}

    if not data.get('new_deadline'):
        raise ValidationError("new_deadline is required")

    # Parse the new deadline
    try:
        from datetime import date
        if isinstance(data['new_deadline'], str):
            new_deadline = datetime.strptime(data['new_deadline'], '%Y-%m-%d').date()
        else:
            new_deadline = data['new_deadline']
    except ValueError:
        raise ValidationError("new_deadline must be in YYYY-MM-DD format")

    old_deadline = defect.due_date
    reason = data.get('reason', 'SLA deadline updated')

    # Update the due date
    defect.due_date = new_deadline

    # Calculate new SLA days from creation date
    if defect.created_at:
        new_sla_days = (new_deadline - defect.created_at.date()).days
        defect.sla_days = new_sla_days

    safe_commit()

    # Get SLA status with new deadline
    sla_tracker = SLATracker(SLAConfig.default_defect_config())
    sla_status = sla_tracker.get_status(
        created_at=defect.created_at,
        severity=defect.severity,
        completed_at=defect.resolved_at,
    )

    current_user = get_current_user()
    lang = get_language(current_user)

    return jsonify({
        'status': 'success',
        'message': 'SLA deadline updated',
        'data': defect.to_dict(language=lang),
        'sla_change': {
            'old_deadline': old_deadline.isoformat() if old_deadline else None,
            'new_deadline': new_deadline.isoformat(),
            'reason': reason,
            'updated_at': datetime.utcnow().isoformat(),
            'sla_status': sla_status,
        }
    }), 200


@bp.route('/<int:id>/status', methods=['PUT'])
@jwt_required()
def update_defect_status(id):
    """
    Update defect status with validation.

    Request Body:
        {
            "status": "in_progress",
            "notes": "Work started on the defect"  // optional
        }

    Returns:
        {
            "status": "success",
            "message": "Status updated",
            "data": {...}
        }
    """
    defect = Defect.query.get_or_404(id)
    data = request.get_json() or {}

    if not data.get('status'):
        raise ValidationError("status is required")

    new_status = data['status']
    notes = data.get('notes')

    # Valid statuses
    valid_statuses = ['open', 'in_progress', 'resolved', 'closed', 'false_alarm']
    if new_status not in valid_statuses:
        raise ValidationError(f"Invalid status. Must be one of: {', '.join(valid_statuses)}")

    # Define valid status transitions
    valid_transitions = {
        'open': ['in_progress', 'false_alarm'],
        'in_progress': ['open', 'resolved', 'false_alarm'],
        'resolved': ['closed', 'in_progress'],  # Can reopen if issues found
        'closed': [],  # Closed is final (admins can force change if needed)
        'false_alarm': ['open'],  # Can be reopened if mistake
    }

    current_user = get_current_user()

    # Check if transition is valid (admins can override)
    if current_user.role != 'admin':
        allowed_transitions = valid_transitions.get(defect.status, [])
        if new_status not in allowed_transitions and new_status != defect.status:
            raise ValidationError(
                f"Cannot transition from '{defect.status}' to '{new_status}'. "
                f"Allowed transitions: {', '.join(allowed_transitions) or 'none'}"
            )

    old_status = defect.status
    defect.status = new_status

    # Set resolved_at timestamp if resolving
    if new_status == 'resolved' and not defect.resolved_at:
        defect.resolved_at = datetime.utcnow()

    # Clear resolved_at if reopening
    if new_status in ['open', 'in_progress'] and defect.resolved_at:
        defect.resolved_at = None

    # Store notes in resolution_notes if resolving
    if new_status == 'resolved' and notes:
        defect.resolution_notes = notes

    safe_commit()

    lang = get_language(current_user)

    return jsonify({
        'status': 'success',
        'message': f'Status updated from {old_status} to {new_status}',
        'data': defect.to_dict(language=lang),
        'transition': {
            'old_status': old_status,
            'new_status': new_status,
            'notes': notes,
            'updated_at': datetime.utcnow().isoformat(),
        }
    }), 200


@bp.route('/<int:id>/assess', methods=['POST'])
@jwt_required()
@role_required('specialist', 'admin', 'engineer')
def assess_defect(id):
    """
    Record specialist assessment of a defect.

    Request Body:
        {
            "verdict": "confirmed",  // 'confirmed', 'rejected', or 'minor'
            "notes": "Defect confirmed, requires immediate attention"  // optional
        }

    Returns:
        {
            "status": "success",
            "message": "Assessment recorded",
            "data": {...}
        }
    """
    defect = Defect.query.get_or_404(id)
    data = request.get_json() or {}

    if not data.get('verdict'):
        raise ValidationError("verdict is required")

    verdict = data['verdict']
    notes = data.get('notes')

    # Valid verdicts
    valid_verdicts = ['confirmed', 'rejected', 'minor']
    if verdict not in valid_verdicts:
        raise ValidationError(f"Invalid verdict. Must be one of: {', '.join(valid_verdicts)}")

    # Update assessment status
    defect.assessment_status = verdict

    # Adjust status and priority based on verdict
    if verdict == 'rejected':
        # Mark as false alarm if rejected
        defect.status = 'false_alarm'
        defect.resolution_notes = notes or 'Rejected during specialist assessment'
    elif verdict == 'minor':
        # Downgrade priority for minor issues
        if defect.priority in ['urgent', 'high']:
            defect.priority = 'medium'
        elif defect.priority == 'medium':
            defect.priority = 'low'
    elif verdict == 'confirmed':
        # Upgrade priority for confirmed issues if currently low
        if defect.priority == 'low' and defect.severity in ['high', 'critical']:
            defect.priority = 'medium'

    safe_commit()

    # Notify relevant users
    from app.services.notification_service import NotificationService

    # Notify the engineer/admin who assigned this
    from app.models import User
    admins = User.query.filter(
        User.role.in_(['admin', 'engineer']),
        User.is_active == True
    ).all()

    current_user = get_current_user()
    for admin in admins:
        if admin.id != current_user.id:
            NotificationService.create_notification(
                user_id=admin.id,
                type='defect_assessed',
                title=f'Defect Assessment: {verdict.title()}',
                message=f'Defect #{defect.id} has been assessed as {verdict}' + (f': {notes}' if notes else ''),
                related_type='defect',
                related_id=defect.id,
                priority='info' if verdict == 'minor' else 'warning',
            )

    lang = get_language(current_user)

    return jsonify({
        'status': 'success',
        'message': f'Assessment recorded: {verdict}',
        'data': defect.to_dict(language=lang),
        'assessment': {
            'verdict': verdict,
            'notes': notes,
            'assessed_by': current_user.id,
            'assessed_at': datetime.utcnow().isoformat(),
        }
    }), 200