"""
Defect Assessment endpoints.
Specialist reviews defect validity before starting work.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db, safe_commit
from app.models import DefectAssessment, Defect, SpecialistJob, User
from app.utils.decorators import get_current_user, specialist_required, get_language
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import datetime

bp = Blueprint('defect_assessments', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
def list_assessments():
    """List defect assessments for current specialist."""
    user = get_current_user()

    if user.role == 'admin':
        assessments = DefectAssessment.query.order_by(DefectAssessment.assessed_at.desc()).all()
    else:
        assessments = DefectAssessment.query.filter_by(specialist_id=user.id).order_by(
            DefectAssessment.assessed_at.desc()
        ).all()

    return jsonify({
        'status': 'success',
        'data': [a.to_dict() for a in assessments]
    }), 200


@bp.route('/pending', methods=['GET'])
@jwt_required()
@specialist_required()
def pending_assessments():
    """Get defects pending specialist assessment."""
    user = get_current_user()

    # Find specialist jobs where defect hasn't been assessed
    jobs = SpecialistJob.query.filter_by(
        specialist_id=user.id,
        status='assigned'
    ).all()

    pending = []
    for job in jobs:
        if job.defect_id:
            existing = DefectAssessment.query.filter_by(defect_id=job.defect_id).first()
            if not existing:
                defect = db.session.get(Defect, job.defect_id)
                if defect:
                    pending.append({
                        'job_id': job.id,
                        'defect': defect.to_dict(language=get_language(user))
                    })

    return jsonify({
        'status': 'success',
        'data': pending
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
@specialist_required()
def create_assessment():
    """
    Specialist assesses a defect before starting work.
    Verdict: confirm, reject, or minor.
    Reject → inspector loses 1 star.
    """
    user = get_current_user()
    data = request.get_json()

    defect_id = data.get('defect_id')
    verdict = data.get('verdict')
    technical_notes = data.get('technical_notes')

    if not defect_id or not verdict:
        raise ValidationError("defect_id and verdict are required")

    if verdict not in ('confirm', 'reject', 'minor'):
        raise ValidationError("Verdict must be 'confirm', 'reject', or 'minor'")

    defect = db.session.get(Defect, defect_id)
    if not defect:
        raise NotFoundError(f"Defect {defect_id} not found")

    # Check if already assessed
    existing = DefectAssessment.query.filter_by(defect_id=defect_id).first()
    if existing:
        raise ValidationError("Defect has already been assessed")

    # Create assessment
    assessment = DefectAssessment(
        defect_id=defect_id,
        specialist_id=user.id,
        verdict=verdict,
        technical_notes=technical_notes,
        assessed_at=datetime.utcnow()
    )
    db.session.add(assessment)

    # Update defect status based on verdict
    if verdict == 'confirm':
        defect.assessment_status = 'confirmed'
    elif verdict == 'reject':
        defect.assessment_status = 'rejected'
        defect.status = 'false_alarm'

        # Inspector loses 1 star
        if defect.inspection:
            inspector = db.session.get(User, defect.inspection.technician_id)
            if inspector:
                inspector.add_points(-1, 'inspector')

            # Notify inspector
            from app.services.notification_service import NotificationService
            NotificationService.create_notification(
                user_id=defect.inspection.technician_id,
                type='defect_rejected',
                title='Defect Rejected by Specialist',
                message=f'Your reported defect was rejected: {defect.description[:50]}. -1 star.',
                related_type='defect',
                related_id=defect.id
            )
    elif verdict == 'minor':
        defect.assessment_status = 'minor'
        defect.priority = 'low'

    safe_commit()

    # Auto-translate technical notes
    if technical_notes:
        from app.utils.bilingual import auto_translate_and_save
        auto_translate_and_save('defect_assessment', assessment.id, {
            'technical_notes': technical_notes
        })

    return jsonify({
        'status': 'success',
        'message': f'Defect assessed as: {verdict}',
        'data': assessment.to_dict()
    }), 201
