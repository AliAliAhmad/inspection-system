"""
Multi-layer equipment assessment endpoints.
4-layer flow: System Auto → Inspector → Engineer → Admin
3 verdicts: operational / monitor / stop
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
    """List assessments. Inspectors see their own, admins/engineers see all."""
    user = get_current_user()
    status = request.args.get('status')

    if user.role in ('admin', 'engineer'):
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


@bp.route('/<int:id_value>', methods=['GET'])
@jwt_required()
def get_assessment(id_value):
    """Get assessment details. Looks up by assessment ID first, then by assignment ID."""
    assessment = FinalAssessment.query.get(id_value)
    if not assessment:
        assessment = FinalAssessment.query.filter_by(
            inspection_assignment_id=id_value
        ).first()
    if not assessment:
        from app.exceptions.api_exceptions import NotFoundError
        raise NotFoundError(f"Assessment not found for ID {id_value}")
    return jsonify({
        'status': 'success',
        'data': assessment.to_dict()
    }), 200


@bp.route('/create/<int:assignment_id>', methods=['POST'])
@jwt_required()
def create_assessment(assignment_id):
    """Create final assessment when inspectors complete checklists. Computes system verdict."""
    assessment = AssessmentService.create_assessment(assignment_id)
    return jsonify({
        'status': 'success',
        'message': 'Assessment created',
        'data': assessment.to_dict()
    }), 201


@bp.route('/<int:assessment_id>/verdict', methods=['POST'])
@jwt_required()
def submit_verdict(assessment_id):
    """Submit inspector verdict (operational, monitor, or stop)."""
    user = get_current_user()
    data = request.get_json()

    assessment = AssessmentService.submit_verdict(
        assessment_id=assessment_id,
        inspector_id=user.id,
        verdict=data['verdict'],
        monitor_reason=data.get('monitor_reason'),
        stop_reason=data.get('stop_reason'),
        urgent_reason=data.get('urgent_reason')  # Legacy support
    )

    # Auto-translate reason fields
    from app.utils.bilingual import auto_translate_and_save
    translate_fields = {}
    if data.get('monitor_reason'):
        translate_fields['monitor_reason'] = data['monitor_reason']
    if data.get('stop_reason'):
        translate_fields['stop_reason'] = data['stop_reason']
    if data.get('urgent_reason'):
        translate_fields['urgent_reason'] = data['urgent_reason']
    if translate_fields:
        auto_translate_and_save('final_assessment', assessment.id, translate_fields)

    return jsonify({
        'status': 'success',
        'message': 'Verdict submitted',
        'data': assessment.to_dict()
    }), 200


@bp.route('/<int:assessment_id>/engineer-verdict', methods=['POST'])
@jwt_required()
def submit_engineer_verdict(assessment_id):
    """Engineer submits review verdict after escalation."""
    user = get_current_user()
    data = request.get_json()

    assessment = AssessmentService.submit_engineer_verdict(
        assessment_id=assessment_id,
        engineer_id=user.id,
        verdict=data['verdict'],
        notes=data.get('notes')
    )

    # Auto-translate engineer notes
    if data.get('notes'):
        from app.utils.bilingual import auto_translate_and_save
        auto_translate_and_save('final_assessment', assessment.id, {
            'engineer_notes': data['notes']
        })

    return jsonify({
        'status': 'success',
        'message': 'Engineer verdict submitted',
        'data': assessment.to_dict()
    }), 200


@bp.route('/<int:assessment_id>/admin-resolve', methods=['POST'])
@jwt_required()
@admin_required()
def admin_resolve(assessment_id):
    """Admin resolves escalation with final decision."""
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


@bp.route('/engineer-pending', methods=['GET'])
@jwt_required()
def engineer_pending():
    """Get assessments awaiting engineer review."""
    assessments = AssessmentService.get_pending_engineer_reviews()
    return jsonify({
        'status': 'success',
        'data': [a.to_dict() for a in assessments]
    }), 200


@bp.route('/admin-pending', methods=['GET'])
@jwt_required()
@admin_required()
def admin_pending():
    """Get assessments awaiting admin final decision."""
    assessments = AssessmentService.get_pending_admin_reviews()
    return jsonify({
        'status': 'success',
        'data': [a.to_dict() for a in assessments]
    }), 200


@bp.route('/<int:assessment_id>/shared-answers', methods=['GET'])
@jwt_required()
def shared_answers(assessment_id):
    """Get first inspector's answers for the second inspector."""
    user = get_current_user()
    answers = AssessmentService.get_shared_answers(assessment_id, user.id)
    return jsonify({
        'status': 'success',
        'data': answers
    }), 200
