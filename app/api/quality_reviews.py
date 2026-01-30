"""
Quality Review endpoints.
QE reviews completed specialist/engineer jobs.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.quality_service import QualityService
from app.utils.decorators import get_current_user, admin_required, quality_engineer_required, role_required, get_language
from app.models import QualityReview
from app.utils.pagination import paginate

bp = Blueprint('quality_reviews', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
@role_required('admin', 'quality_engineer')
def list_reviews():
    """List quality reviews. QE sees own, admin sees all."""
    user = get_current_user()
    status = request.args.get('status')

    if user.role == 'admin':
        query = QualityReview.query
    else:
        query = QualityReview.query.filter_by(qe_id=user.id)

    if status:
        query = query.filter_by(status=status)

    query = query.order_by(QualityReview.created_at.desc())
    items, pagination_meta = paginate(query)
    language = get_language(user)

    return jsonify({
        'status': 'success',
        'data': [r.to_dict(language=language) for r in items],
        'pagination': pagination_meta
    }), 200


@bp.route('/<int:review_id>', methods=['GET'])
@jwt_required()
def get_review(review_id):
    """Get review details."""
    review = QualityReview.query.get_or_404(review_id)
    return jsonify({
        'status': 'success',
        'data': review.to_dict()
    }), 200


@bp.route('/pending', methods=['GET'])
@jwt_required()
@quality_engineer_required()
def pending_reviews():
    """Get pending reviews for current QE."""
    user = get_current_user()
    reviews = QualityService.get_pending_reviews(user.id)

    return jsonify({
        'status': 'success',
        'data': [r.to_dict() for r in reviews]
    }), 200


@bp.route('/overdue', methods=['GET'])
@jwt_required()
@role_required('admin', 'quality_engineer')
def overdue_reviews():
    """Get reviews past SLA deadline."""
    reviews = QualityService.get_overdue_reviews()

    return jsonify({
        'status': 'success',
        'data': [r.to_dict() for r in reviews]
    }), 200


@bp.route('/<int:review_id>/approve', methods=['POST'])
@jwt_required()
@quality_engineer_required()
def approve_review(review_id):
    """QE approves job quality."""
    user = get_current_user()
    data = request.get_json()

    review = QualityService.approve_review(
        review_id=review_id,
        qe_id=user.id,
        qc_rating=data['qc_rating'],
        notes=data.get('notes')
    )

    # Auto-translate notes
    if data.get('notes'):
        from app.utils.bilingual import auto_translate_and_save
        auto_translate_and_save('quality_review', review.id, {'notes': data['notes']})

    return jsonify({
        'status': 'success',
        'message': 'Quality review approved',
        'data': review.to_dict()
    }), 200


@bp.route('/<int:review_id>/reject', methods=['POST'])
@jwt_required()
@quality_engineer_required()
def reject_review(review_id):
    """QE rejects job quality."""
    user = get_current_user()
    data = request.get_json()

    review = QualityService.reject_review(
        review_id=review_id,
        qe_id=user.id,
        rejection_reason=data['rejection_reason'],
        rejection_category=data['rejection_category'],
        evidence_photos=data.get('evidence_photos')
    )

    # Auto-translate rejection reason
    from app.utils.bilingual import auto_translate_and_save
    auto_translate_and_save('quality_review', review.id, {
        'rejection_reason': data['rejection_reason']
    })

    return jsonify({
        'status': 'success',
        'message': 'Quality review rejected. Pending admin validation.',
        'data': review.to_dict()
    }), 200


@bp.route('/<int:review_id>/validate', methods=['POST'])
@jwt_required()
@admin_required()
def validate_rejection(review_id):
    """Admin validates QE rejection."""
    user = get_current_user()
    data = request.get_json()

    review = QualityService.validate_rejection(
        review_id=review_id,
        admin_id=user.id,
        is_valid=data['is_valid']
    )

    return jsonify({
        'status': 'success',
        'message': f'Rejection validated as {"valid" if data["is_valid"] else "invalid"}',
        'data': review.to_dict()
    }), 200
