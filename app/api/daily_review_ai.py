"""
Daily Review AI API Endpoints.
Provides AI-powered daily review assistance.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.services.daily_review_ai_service import daily_review_ai_service
from app.utils.decorators import get_current_user, role_required
from datetime import date

bp = Blueprint('daily_review_ai', __name__)


@bp.route('/<int:review_id>/ai/suggest-ratings', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def suggest_ratings(review_id: int):
    """Get AI-suggested ratings for a daily review."""
    result = daily_review_ai_service.suggest_ratings(review_id)
    return jsonify({'status': 'success', 'data': result})


@bp.route('/<int:review_id>/ai/auto-rate', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def apply_ai_ratings(review_id: int):
    """Apply AI-suggested ratings (with optional overrides)."""
    data = request.get_json() or {}
    overrides = data.get('overrides', {})

    # Get suggestions
    suggestions = daily_review_ai_service.suggest_ratings(review_id)

    # Apply ratings (this would call the rating service)
    from app.models import WorkPlanDailyReview, WorkPlanJobRating
    from app.extensions import db, safe_commit

    review = db.session.get(WorkPlanDailyReview, review_id)
    if not review:
        return jsonify({'status': 'error', 'message': 'Review not found'}), 404

    applied_count = 0
    for suggestion in suggestions:
        job_id = suggestion['job_id']
        user_id = suggestion['user_id']

        # Check for override
        key = f"{job_id}_{user_id}"
        if key in overrides:
            qc_rating = overrides[key].get('qc_rating', suggestion['suggested_qc_rating'])
            cleaning_rating = overrides[key].get('cleaning_rating', suggestion['suggested_cleaning_rating'])
        else:
            qc_rating = suggestion['suggested_qc_rating']
            cleaning_rating = suggestion['suggested_cleaning_rating']

        # Check if rating exists
        existing = WorkPlanJobRating.query.filter_by(
            review_id=review_id,
            job_id=job_id,
            user_id=user_id
        ).first()

        if existing:
            existing.qc_rating = qc_rating
            existing.cleaning_rating = cleaning_rating
            existing.is_ai_suggested = True
        else:
            rating = WorkPlanJobRating(
                review_id=review_id,
                job_id=job_id,
                user_id=user_id,
                qc_rating=qc_rating,
                cleaning_rating=cleaning_rating,
                is_ai_suggested=True
            )
            db.session.add(rating)

        applied_count += 1

    safe_commit()

    return jsonify({
        'status': 'success',
        'data': {'applied_count': applied_count}
    })


@bp.route('/ai/bias-check/<int:engineer_id>', methods=['GET'])
@jwt_required()
@role_required('admin')
def check_rating_bias(engineer_id: int):
    """Check for rating bias by an engineer."""
    days = request.args.get('days', 30, type=int)
    result = daily_review_ai_service.detect_rating_bias(engineer_id, days)
    return jsonify({'status': 'success', 'data': result})


@bp.route('/ai/feedback-summary/<int:user_id>', methods=['GET'])
@jwt_required()
def get_feedback_summary(user_id: int):
    """Get feedback summary for a worker."""
    current_user = get_current_user()

    # Workers can only see their own feedback
    if current_user.role not in ['admin', 'engineer'] and current_user.id != user_id:
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    period = request.args.get('period', 'weekly')
    result = daily_review_ai_service.generate_feedback_summary(user_id, period)

    if 'error' in result:
        return jsonify({'status': 'error', 'message': result['error']}), 404

    return jsonify({'status': 'success', 'data': result})


@bp.route('/ai/predict-incomplete', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def predict_incomplete_jobs():
    """Predict which jobs might not be completed today."""
    target_date_str = request.args.get('date')
    if target_date_str:
        from datetime import datetime
        target_date = datetime.strptime(target_date_str, '%Y-%m-%d').date()
    else:
        target_date = date.today()

    result = daily_review_ai_service.predict_incomplete_jobs(target_date)
    return jsonify({'status': 'success', 'data': result})


@bp.route('/ai/time-accuracy', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def analyze_time_accuracy():
    """Analyze time estimation accuracy."""
    days = request.args.get('days', 30, type=int)
    result = daily_review_ai_service.analyze_time_accuracy(days)
    return jsonify({'status': 'success', 'data': result})
