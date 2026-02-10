"""
Unified AI API Endpoints
Provides AI-powered features for Approvals, Quality Reviews, and Inspection Routines.
Uses the unified AI services with no code duplication.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.utils.decorators import admin_required
from app.services import (
    ApprovalAIService,
    QualityReviewAIService,
    InspectionRoutineAIService,
)


def success_response(data, status_code=200):
    """Return a success JSON response."""
    return jsonify({'success': True, 'data': data}), status_code


def error_response(message, status_code=400):
    """Return an error JSON response."""
    return jsonify({'success': False, 'error': message}), status_code

bp = Blueprint('unified_ai', __name__)


# ============================================================================
# APPROVAL AI ENDPOINTS
# ============================================================================

@bp.route('/approvals/<approval_type>/<int:entity_id>/risk', methods=['GET'])
@jwt_required()
def get_approval_risk(approval_type: str, entity_id: int):
    """
    Get risk score for an approval request.

    GET /api/ai/approvals/<type>/<id>/risk

    Types: leave, pause, takeover, bonus

    Returns:
        {
            "entity_id": 123,
            "entity_type": "approval",
            "risk_score": 35.5,
            "risk_level": "medium",
            "factors": {...},
            "recommendations": [...]
        }
    """
    if approval_type not in ('leave', 'pause', 'takeover', 'bonus'):
        return error_response('Invalid approval type', 400)

    try:
        ai_service = ApprovalAIService(approval_type)
        result = ai_service.calculate_risk(entity_id)

        if 'error' in result:
            return error_response(result['error'], 404)

        return success_response(result)
    except Exception as e:
        return error_response(str(e), 500)


@bp.route('/approvals/<approval_type>/<int:entity_id>/auto-approve-check', methods=['GET'])
@jwt_required()
def check_auto_approval(approval_type: str, entity_id: int):
    """
    Check if an approval can be auto-approved.

    GET /api/ai/approvals/<type>/<id>/auto-approve-check?threshold=25

    Query params:
        - threshold: Risk score threshold for auto-approval (default: 25)

    Returns:
        {
            "can_auto_approve": true,
            "risk_score": 18.5,
            "risk_level": "low",
            "threshold": 25,
            "recommendations": [...]
        }
    """
    if approval_type not in ('leave', 'pause', 'takeover', 'bonus'):
        return error_response('Invalid approval type', 400)

    threshold = request.args.get('threshold', 25, type=float)

    try:
        ai_service = ApprovalAIService(approval_type)
        result = ai_service.can_auto_approve(entity_id, threshold=threshold)

        if 'error' in result:
            return error_response(result['error'], 404)

        return success_response(result)
    except Exception as e:
        return error_response(str(e), 500)


@bp.route('/approvals/<approval_type>/<int:entity_id>/anomalies', methods=['GET'])
@jwt_required()
def get_approval_anomalies(approval_type: str, entity_id: int):
    """
    Detect anomalies in approval patterns.

    GET /api/ai/approvals/<type>/<id>/anomalies?lookback_days=30

    Returns:
        {
            "entity_id": 123,
            "anomaly_count": 2,
            "anomalies": [...],
            "max_severity": "medium",
            "status": "anomalies_detected"
        }
    """
    if approval_type not in ('leave', 'pause', 'takeover', 'bonus'):
        return error_response('Invalid approval type', 400)

    lookback_days = request.args.get('lookback_days', 30, type=int)

    try:
        ai_service = ApprovalAIService(approval_type)
        result = ai_service.detect_anomalies(entity_id, lookback_days=lookback_days)

        if 'error' in result:
            return error_response(result['error'], 404)

        return success_response(result)
    except Exception as e:
        return error_response(str(e), 500)


@bp.route('/approvals/<approval_type>/<int:entity_id>/predictions', methods=['GET'])
@jwt_required()
def get_approval_predictions(approval_type: str, entity_id: int):
    """
    Get predictions for an approval request.

    GET /api/ai/approvals/<type>/<id>/predictions

    Returns:
        {
            "entity_id": 123,
            "predictions": [
                {"metric": "processing_time_hours", "predicted_value": 4.5, "confidence": 0.85},
                {"metric": "approval_likelihood", "predicted_value": 82.0, "confidence": 0.80}
            ]
        }
    """
    if approval_type not in ('leave', 'pause', 'takeover', 'bonus'):
        return error_response('Invalid approval type', 400)

    try:
        ai_service = ApprovalAIService(approval_type)
        result = ai_service.predict(entity_id)

        if 'error' in result:
            return error_response(result['error'], 404)

        return success_response(result)
    except Exception as e:
        return error_response(str(e), 500)


@bp.route('/approvals/<approval_type>/<int:entity_id>/recommendations', methods=['GET'])
@jwt_required()
def get_approval_recommendations(approval_type: str, entity_id: int):
    """
    Get AI recommendations for an approval decision.

    GET /api/ai/approvals/<type>/<id>/recommendations?max=5

    Returns:
        [
            {"type": "auto_approve", "priority": "high", "message": "Low risk - Safe for auto-approval"},
            ...
        ]
    """
    if approval_type not in ('leave', 'pause', 'takeover', 'bonus'):
        return error_response('Invalid approval type', 400)

    max_recs = request.args.get('max', 10, type=int)

    try:
        ai_service = ApprovalAIService(approval_type)
        result = ai_service.get_recommendations(entity_id, max_recommendations=max_recs)

        return success_response(result)
    except Exception as e:
        return error_response(str(e), 500)


@bp.route('/approvals/<approval_type>/<int:entity_id>/analysis', methods=['GET'])
@jwt_required()
def get_approval_full_analysis(approval_type: str, entity_id: int):
    """
    Get comprehensive AI analysis for an approval.

    GET /api/ai/approvals/<type>/<id>/analysis

    Returns all AI insights: risk, anomalies, predictions, recommendations.
    """
    if approval_type not in ('leave', 'pause', 'takeover', 'bonus'):
        return error_response('Invalid approval type', 400)

    try:
        ai_service = ApprovalAIService(approval_type)
        result = ai_service.get_comprehensive_analysis(entity_id)

        return success_response(result)
    except Exception as e:
        return error_response(str(e), 500)


# ============================================================================
# QUALITY REVIEW AI ENDPOINTS
# ============================================================================

@bp.route('/quality-reviews/<int:review_id>/risk', methods=['GET'])
@jwt_required()
def get_quality_review_risk(review_id: int):
    """
    Get risk score for a quality review.

    GET /api/ai/quality-reviews/<id>/risk

    Returns:
        {
            "entity_id": 123,
            "risk_score": 42.5,
            "risk_level": "medium",
            "factors": {
                "inspector_experience": {...},
                "equipment_criticality": {...},
                ...
            }
        }
    """
    try:
        ai_service = QualityReviewAIService()
        result = ai_service.calculate_risk(review_id)

        if 'error' in result:
            return error_response(result['error'], 404)

        return success_response(result)
    except Exception as e:
        return error_response(str(e), 500)


@bp.route('/quality-reviews/<int:review_id>/auto-approve-check', methods=['GET'])
@jwt_required()
def check_quality_review_auto_approval(review_id: int):
    """
    Check if a quality review can be auto-approved.

    GET /api/ai/quality-reviews/<id>/auto-approve-check?threshold=20

    Returns:
        {
            "can_auto_approve": true,
            "risk_score": 15.0,
            "risk_level": "low",
            "threshold": 20
        }
    """
    threshold = request.args.get('threshold', 20, type=float)

    try:
        ai_service = QualityReviewAIService()
        result = ai_service.can_auto_approve(review_id, threshold=threshold)

        if 'error' in result:
            return error_response(result['error'], 404)

        return success_response(result)
    except Exception as e:
        return error_response(str(e), 500)


@bp.route('/quality-reviews/<int:review_id>/predictions', methods=['GET'])
@jwt_required()
def get_quality_review_predictions(review_id: int):
    """
    Get predictions for a quality review.

    GET /api/ai/quality-reviews/<id>/predictions

    Returns:
        {
            "predictions": [
                {"metric": "expected_defects", "predicted_value": 2, "confidence": 0.75},
                {"metric": "approval_likelihood", "predicted_value": 78.5, "confidence": 0.75}
            ]
        }
    """
    try:
        ai_service = QualityReviewAIService()
        result = ai_service.predict(review_id)

        if 'error' in result:
            return error_response(result['error'], 404)

        return success_response(result)
    except Exception as e:
        return error_response(str(e), 500)


@bp.route('/quality-reviews/<int:review_id>/trends', methods=['GET'])
@jwt_required()
def get_quality_review_trends(review_id: int):
    """
    Get trend analysis for quality reviews.

    GET /api/ai/quality-reviews/<id>/trends?period=monthly

    Query params:
        - period: monthly, weekly, or daily (default: monthly)

    Returns:
        [
            {
                "metric": "approval_rate",
                "current_value": 85.0,
                "previous_value": 78.0,
                "change_percentage": 8.97,
                "direction": "up",
                "insight": "approval_rate increased by 8%"
            },
            ...
        ]
    """
    period = request.args.get('period', 'monthly')
    if period not in ('monthly', 'weekly', 'daily'):
        period = 'monthly'

    try:
        ai_service = QualityReviewAIService()
        result = ai_service.analyze_trends(review_id, period_type=period)

        return success_response(result)
    except Exception as e:
        return error_response(str(e), 500)


@bp.route('/quality-reviews/<int:review_id>/analysis', methods=['GET'])
@jwt_required()
def get_quality_review_full_analysis(review_id: int):
    """
    Get comprehensive AI analysis for a quality review.

    GET /api/ai/quality-reviews/<id>/analysis
    """
    try:
        ai_service = QualityReviewAIService()
        result = ai_service.get_comprehensive_analysis(review_id)

        return success_response(result)
    except Exception as e:
        return error_response(str(e), 500)


# ============================================================================
# INSPECTION ROUTINE AI ENDPOINTS
# ============================================================================

@bp.route('/inspection-routines/<int:routine_id>/compliance-risk', methods=['GET'])
@jwt_required()
def get_routine_compliance_risk(routine_id: int):
    """
    Get compliance risk for an inspection routine.

    GET /api/ai/inspection-routines/<id>/compliance-risk

    Returns:
        {
            "entity_id": 123,
            "risk_score": 38.0,
            "risk_level": "medium",
            "factors": {
                "schedule_adherence": {...},
                "equipment_criticality": {...},
                "overdue_inspections": {...},
                "inspector_availability": {...}
            }
        }
    """
    try:
        ai_service = InspectionRoutineAIService()
        result = ai_service.get_compliance_risk(routine_id)

        if 'error' in result:
            return error_response(result['error'], 404)

        return success_response(result)
    except Exception as e:
        return error_response(str(e), 500)


@bp.route('/inspection-routines/<int:routine_id>/predict-completion', methods=['GET'])
@jwt_required()
def predict_routine_completion(routine_id: int):
    """
    Predict completion rate for an inspection routine.

    GET /api/ai/inspection-routines/<id>/predict-completion?days=7

    Query params:
        - days: Prediction horizon in days (default: 7)

    Returns:
        {
            "predictions": [
                {"metric": "completion_rate", "predicted_value": 88.5, "confidence": 0.82},
                {"metric": "failure_probability", "predicted_value": 15.0, "confidence": 0.70}
            ]
        }
    """
    days = request.args.get('days', 7, type=int)

    try:
        ai_service = InspectionRoutineAIService()
        result = ai_service.predict_completion(routine_id, days=days)

        if 'error' in result:
            return error_response(result['error'], 404)

        return success_response(result)
    except Exception as e:
        return error_response(str(e), 500)


@bp.route('/inspection-routines/<int:routine_id>/analysis', methods=['GET'])
@jwt_required()
def get_routine_full_analysis(routine_id: int):
    """
    Get comprehensive AI analysis for an inspection routine.

    GET /api/ai/inspection-routines/<id>/analysis
    """
    try:
        ai_service = InspectionRoutineAIService()
        result = ai_service.get_comprehensive_analysis(routine_id)

        return success_response(result)
    except Exception as e:
        return error_response(str(e), 500)


# ============================================================================
# BULK OPERATIONS
# ============================================================================

@bp.route('/approvals/bulk-evaluate', methods=['POST'])
@jwt_required()
@admin_required()
def bulk_evaluate_approvals():
    """
    Evaluate multiple approvals for auto-approval eligibility.

    POST /api/ai/approvals/bulk-evaluate

    Body:
        {
            "items": [
                {"type": "leave", "id": 1},
                {"type": "pause", "id": 2},
                {"type": "bonus", "id": 3}
            ],
            "threshold": 25
        }

    Returns:
        {
            "results": [
                {"type": "leave", "id": 1, "can_auto_approve": true, "risk_score": 18.5},
                ...
            ],
            "summary": {
                "total": 3,
                "can_auto_approve": 2,
                "needs_review": 1
            }
        }
    """
    data = request.get_json() or {}
    items = data.get('items', [])
    threshold = data.get('threshold', 25)

    if not items:
        return error_response('No items provided', 400)

    results = []
    can_auto_count = 0

    for item in items:
        approval_type = item.get('type')
        entity_id = item.get('id')

        if approval_type not in ('leave', 'pause', 'takeover', 'bonus'):
            results.append({
                'type': approval_type,
                'id': entity_id,
                'error': 'Invalid approval type'
            })
            continue

        try:
            ai_service = ApprovalAIService(approval_type)
            result = ai_service.can_auto_approve(entity_id, threshold=threshold)

            results.append({
                'type': approval_type,
                'id': entity_id,
                **result
            })

            if result.get('can_auto_approve'):
                can_auto_count += 1
        except Exception as e:
            results.append({
                'type': approval_type,
                'id': entity_id,
                'error': str(e)
            })

    return success_response({
        'results': results,
        'summary': {
            'total': len(items),
            'can_auto_approve': can_auto_count,
            'needs_review': len(items) - can_auto_count
        }
    })


@bp.route('/quality-reviews/bulk-evaluate', methods=['POST'])
@jwt_required()
@admin_required()
def bulk_evaluate_quality_reviews():
    """
    Evaluate multiple quality reviews for auto-approval eligibility.

    POST /api/ai/quality-reviews/bulk-evaluate

    Body:
        {
            "review_ids": [1, 2, 3, 4, 5],
            "threshold": 20
        }

    Returns:
        {
            "results": [...],
            "summary": {...}
        }
    """
    data = request.get_json() or {}
    review_ids = data.get('review_ids', [])
    threshold = data.get('threshold', 20)

    if not review_ids:
        return error_response('No review IDs provided', 400)

    ai_service = QualityReviewAIService()
    results = []
    can_auto_count = 0

    for review_id in review_ids:
        try:
            result = ai_service.can_auto_approve(review_id, threshold=threshold)
            results.append({
                'review_id': review_id,
                **result
            })

            if result.get('can_auto_approve'):
                can_auto_count += 1
        except Exception as e:
            results.append({
                'review_id': review_id,
                'error': str(e)
            })

    return success_response({
        'results': results,
        'summary': {
            'total': len(review_ids),
            'can_auto_approve': can_auto_count,
            'needs_review': len(review_ids) - can_auto_count
        }
    })


# ============================================================================
# DASHBOARD / STATS
# ============================================================================

@bp.route('/dashboard/stats', methods=['GET'])
@jwt_required()
@admin_required()
def get_ai_dashboard_stats():
    """
    Get AI dashboard statistics.

    GET /api/ai/dashboard/stats

    Returns aggregated AI stats across all modules.
    """
    from app.models import Leave, QualityReview, InspectionRoutine
    from datetime import datetime, timedelta

    now = datetime.utcnow()
    thirty_days_ago = now - timedelta(days=30)

    stats = {
        'approvals': {
            'pending_leaves': Leave.query.filter_by(status='pending').count(),
            'auto_approvable_estimate': 0,  # Would calculate with AI
        },
        'quality_reviews': {
            'pending_reviews': QualityReview.query.filter_by(status='pending').count() if hasattr(QualityReview, 'status') else 0,
            'auto_approvable_estimate': 0,
        },
        'inspection_routines': {
            'active_routines': InspectionRoutine.query.filter_by(is_active=True).count(),
            'high_risk_count': 0,  # Would calculate compliance risk
        },
        'generated_at': now.isoformat()
    }

    return success_response(stats)
