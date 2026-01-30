"""
Final Equipment Assessment endpoints.
Both inspectors submit verdict. Safety-first logic.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.assessment_service import AssessmentService
from app.utils.decorators import get_current_user, admin_required, inspector_required
from app.models import FinalAssessment

bp = Blueprint('assessments', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
def list_assessments():
    """List assessments. Inspectors see their own, admins see all."""
    user = get_current_user()
    status = request.args.get('status')

    if user.role == 'admin':
        query = FinalAssessment.query
    else:
        query = FinalAssessment.query.filter(
            (FinalAssessment.mechanical_inspector_id == user.id) |
            (FinalAssessment.electrical_inspector_id == user.id)
        )

    if status == 'pending':
        query = query.filter(FinalAssessment.finalized_at.is_(None))
    elif status == 'completed':
        query = query.filter(FinalAssessment.finalized_at.isnot(None))

    assessments = query.order_by(FinalAssessment.created_at.desc()).all()

    return jsonify({
        'status': 'success',
        'data': [a.to_dict() for a in assessments]
    }), 200


@bp.route('/<int:assessment_id>', methods=['GET'])
@jwt_required()
def get_assessment(assessment_id):
    """Get assessment details."""
    assessment = FinalAssessment.query.get_or_404(assessment_id)
    return jsonify({
        'status': 'success',
        'data': assessment.to_dict()
    }), 200


@bp.route('/create/<int:assignment_id>', methods=['POST'])
@jwt_required()
def create_assessment(assignment_id):
    """Create final assessment when both inspectors complete checklists."""
    assessment = AssessmentService.create_assessment(assignment_id)
    return jsonify({
        'status': 'success',
        'message': 'Assessment created',
        'data': assessment.to_dict()
    }), 201


@bp.route('/<int:assessment_id>/verdict', methods=['POST'])
@jwt_required()
def submit_verdict(assessment_id):
    """Submit inspector verdict (operational or urgent)."""
    user = get_current_user()
    data = request.get_json()

    assessment = AssessmentService.submit_verdict(
        assessment_id=assessment_id,
        inspector_id=user.id,
        verdict=data['verdict'],
        urgent_reason=data.get('urgent_reason')
    )

    # Auto-translate urgent reason
    if data.get('urgent_reason'):
        from app.utils.bilingual import auto_translate_and_save
        auto_translate_and_save('final_assessment', assessment.id, {
            'urgent_reason': data['urgent_reason']
        })

    return jsonify({
        'status': 'success',
        'message': 'Verdict submitted',
        'data': assessment.to_dict()
    }), 200


@bp.route('/<int:assessment_id>/admin-resolve', methods=['POST'])
@jwt_required()
@admin_required()
def admin_resolve(assessment_id):
    """Admin resolves disagreement or overrides."""
    user = get_current_user()
    data = request.get_json()

    assessment = AssessmentService.admin_resolve(
        assessment_id=assessment_id,
        admin_id=user.id,
        decision=data['decision'],
        notes=data.get('notes')
    )

    # Auto-translate admin notes
    if data.get('notes'):
        from app.utils.bilingual import auto_translate_and_save
        auto_translate_and_save('final_assessment', assessment.id, {
            'admin_decision_notes': data['notes']
        })

    return jsonify({
        'status': 'success',
        'message': 'Assessment resolved by admin',
        'data': assessment.to_dict()
    }), 200


@bp.route('/pending', methods=['GET'])
@jwt_required()
def pending_assessments():
    """Get assessments pending current user's verdict."""
    user = get_current_user()
    assessments = AssessmentService.get_pending_assessments(user.id)

    return jsonify({
        'status': 'success',
        'data': [a.to_dict() for a in assessments]
    }), 200
