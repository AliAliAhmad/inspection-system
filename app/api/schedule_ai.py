"""
Schedule AI API Endpoints.
Provides AI-powered scheduling and inspection management features.
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from app.utils.decorators import role_required
import logging

logger = logging.getLogger(__name__)

bp = Blueprint('schedule_ai', __name__, url_prefix='/api/schedule-ai')


# Risk-Based Scheduling
@bp.route('/risk-scores', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_risk_scores():
    """Get equipment risk scores."""
    try:
        from app.services.schedule_ai_service import ScheduleAIService
        service = ScheduleAIService()
        result = service.calculate_equipment_risk_scores()
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        logger.error(f"Error getting risk scores: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/coverage-gaps', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_coverage_gaps():
    """Get coverage gap analysis."""
    try:
        from app.services.schedule_ai_service import ScheduleAIService
        service = ScheduleAIService()
        result = service.get_coverage_gaps()

        # Filter by severity if provided
        severity = request.args.get('severity')
        if severity and result:
            result = [item for item in result if item.get('priority') == severity]

        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        logger.error(f"Error getting coverage gaps: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/optimal-frequency', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def suggest_optimal_frequency():
    """Suggest optimal inspection frequency."""
    try:
        from app.services.schedule_ai_service import ScheduleAIService
        data = request.get_json()

        if not data:
            return jsonify({'status': 'error', 'message': 'Request body required'}), 400

        equipment_id = data.get('equipment_id')
        if not equipment_id:
            return jsonify({'status': 'error', 'message': 'equipment_id is required'}), 400

        service = ScheduleAIService()
        result = service.suggest_optimal_frequency(equipment_id)

        if 'error' in result:
            return jsonify({'status': 'error', 'message': result['error']}), 404

        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        logger.error(f"Error suggesting optimal frequency: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# Inspector Intelligence
@bp.route('/inspector-scores', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_inspector_scores():
    """Get inspector quality scores."""
    try:
        from app.services.schedule_ai_service import ScheduleAIService
        service = ScheduleAIService()
        result = service.get_inspector_quality_scores()
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        logger.error(f"Error getting inspector scores: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/team-performance', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_team_performance():
    """Get team performance metrics."""
    try:
        from app.services.schedule_ai_service import ScheduleAIService
        service = ScheduleAIService()
        result = service.get_team_performance()
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        logger.error(f"Error getting team performance: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/fatigue-risk', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_fatigue_risks():
    """Detect inspector fatigue risk."""
    try:
        from app.services.schedule_ai_service import ScheduleAIService
        service = ScheduleAIService()
        result = service.detect_fatigue_risk()
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        logger.error(f"Error detecting fatigue risk: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# Route Optimization
@bp.route('/optimize-route', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def optimize_route():
    """Optimize inspection route."""
    try:
        from app.services.schedule_ai_service import ScheduleAIService
        data = request.get_json()

        if not data:
            return jsonify({'status': 'error', 'message': 'Request body required'}), 400

        assignment_ids = data.get('assignment_ids', [])
        if not assignment_ids:
            return jsonify({'status': 'error', 'message': 'assignment_ids is required'}), 400

        service = ScheduleAIService()
        result = service.optimize_route(assignment_ids)

        if 'error' in result:
            return jsonify({'status': 'error', 'message': result['error']}), 400

        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        logger.error(f"Error optimizing route: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# Proactive Alerts
@bp.route('/sla-warnings', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_sla_warnings():
    """Get SLA violation warnings."""
    try:
        from app.services.schedule_ai_service import ScheduleAIService
        service = ScheduleAIService()
        result = service.get_sla_warnings()
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        logger.error(f"Error getting SLA warnings: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/capacity-forecast', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_capacity_forecast():
    """Get capacity forecasting."""
    try:
        from app.services.schedule_ai_service import ScheduleAIService
        days = request.args.get('days', 14, type=int)
        service = ScheduleAIService()
        result = service.get_capacity_forecast(days)
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        logger.error(f"Error getting capacity forecast: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# Analytics
@bp.route('/health-trends', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_health_trends():
    """Get equipment health trends."""
    try:
        from app.services.schedule_ai_service import ScheduleAIService
        equipment_id = request.args.get('equipment_id', type=int)

        if not equipment_id:
            return jsonify({'status': 'error', 'message': 'equipment_id query parameter is required'}), 400

        service = ScheduleAIService()
        result = service.get_equipment_health_trends(equipment_id)

        if 'error' in result:
            return jsonify({'status': 'error', 'message': result['error']}), 404

        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        logger.error(f"Error getting health trends: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/anomalies', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def detect_anomalies():
    """Detect schedule anomalies."""
    try:
        from app.services.schedule_ai_service import ScheduleAIService
        service = ScheduleAIService()
        result = service.detect_anomalies()
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        logger.error(f"Error detecting anomalies: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/insights', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_insights():
    """Get AI-generated insights dashboard summary."""
    try:
        from app.services.schedule_ai_service import ScheduleAIService
        service = ScheduleAIService()
        result = service.get_dashboard_summary()

        if result.get('status') == 'error':
            return jsonify({'status': 'error', 'message': result.get('error', 'Unknown error')}), 500

        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        logger.error(f"Error generating insights: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500
