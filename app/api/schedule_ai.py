"""
Schedule AI API Endpoints.
Provides AI-powered scheduling and inspection management features.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.services.schedule_ai_service import schedule_ai_service
from app.utils.decorators import role_required
from datetime import date, datetime

bp = Blueprint('schedule_ai', __name__)


# =========================================================================
# RISK-BASED SCHEDULING
# =========================================================================

@bp.route('/risk-scores', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_risk_scores():
    """Get AI risk scores for all equipment."""
    try:
        result = schedule_ai_service.calculate_equipment_risk_scores()
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/coverage-gaps', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_coverage_gaps():
    """Get equipment with insufficient inspection coverage."""
    try:
        result = schedule_ai_service.get_coverage_gaps()
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/optimal-frequency/<int:equipment_id>', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def suggest_optimal_frequency(equipment_id: int):
    """Suggest optimal inspection frequency for equipment."""
    try:
        result = schedule_ai_service.suggest_optimal_frequency(equipment_id)
        if 'error' in result:
            return jsonify({'status': 'error', 'message': result['error']}), 404
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# =========================================================================
# INSPECTOR INTELLIGENCE
# =========================================================================

@bp.route('/inspector-scores', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_inspector_scores():
    """Get quality scores for inspectors."""
    try:
        result = schedule_ai_service.get_inspector_quality_scores()
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/team-performance', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_team_performance():
    """Get team performance metrics."""
    try:
        result = schedule_ai_service.get_team_performance()
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/fatigue-risk', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_fatigue_risk():
    """Detect inspectors at fatigue risk."""
    try:
        result = schedule_ai_service.detect_fatigue_risk()
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# =========================================================================
# ROUTE OPTIMIZATION
# =========================================================================

@bp.route('/optimize-route', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def optimize_route():
    """Optimize inspection routes."""
    try:
        data = request.get_json() or {}
        assignment_ids = data.get('assignment_ids', [])

        if not assignment_ids:
            return jsonify({'status': 'error', 'message': 'assignment_ids required'}), 400

        result = schedule_ai_service.optimize_route(assignment_ids)

        if 'error' in result:
            return jsonify({'status': 'error', 'message': result['error']}), 400

        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# =========================================================================
# PROACTIVE ALERTS
# =========================================================================

@bp.route('/sla-warnings', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_sla_warnings():
    """Get assignments approaching deadline."""
    try:
        result = schedule_ai_service.get_sla_warnings()
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/capacity-forecast', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_capacity_forecast():
    """Get capacity forecast for upcoming days."""
    try:
        days = request.args.get('days', 7, type=int)
        result = schedule_ai_service.get_capacity_forecast(days)
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# =========================================================================
# ANALYTICS
# =========================================================================

@bp.route('/health-trends/<int:equipment_id>', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer', 'inspector')
def get_health_trends(equipment_id: int):
    """Get equipment health trends."""
    try:
        result = schedule_ai_service.get_equipment_health_trends(equipment_id)
        if 'error' in result:
            return jsonify({'status': 'error', 'message': result['error']}), 404
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/anomalies', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def detect_anomalies():
    """Detect unusual patterns in inspection data."""
    try:
        result = schedule_ai_service.detect_anomalies()
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/dashboard-summary', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_dashboard_summary():
    """Get comprehensive AI summary for scheduling dashboard."""
    try:
        result = schedule_ai_service.get_dashboard_summary()
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
