"""
Defect AI API Endpoints.
Provides AI-powered defect management features.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.services.defect_ai_service import defect_ai_service
from app.utils.decorators import get_current_user, role_required

bp = Blueprint('defect_ai', __name__)


@bp.route('/<int:defect_id>/ai/risk', methods=['GET'])
@jwt_required()
def get_defect_risk(defect_id: int):
    """Get AI risk assessment for a defect."""
    result = defect_ai_service.get_impact_risk(defect_id)
    if 'error' in result:
        return jsonify({'status': 'error', 'message': result['error']}), 404
    return jsonify({'status': 'success', 'data': result})


@bp.route('/<int:defect_id>/ai/sla-status', methods=['GET'])
@jwt_required()
def get_defect_sla_status(defect_id: int):
    """Get SLA status for a defect."""
    result = defect_ai_service.get_sla_status(defect_id)
    if 'error' in result:
        return jsonify({'status': 'error', 'message': result['error']}), 404
    return jsonify({'status': 'success', 'data': result})


@bp.route('/<int:defect_id>/ai/escalation', methods=['GET'])
@jwt_required()
def check_defect_escalation(defect_id: int):
    """Check if defect should be escalated."""
    result = defect_ai_service.check_escalation(defect_id)
    if 'error' in result:
        return jsonify({'status': 'error', 'message': result['error']}), 404
    return jsonify({'status': 'success', 'data': result})


@bp.route('/<int:defect_id>/ai/predict-resolution', methods=['GET'])
@jwt_required()
def predict_defect_resolution(defect_id: int):
    """Predict resolution time for a defect."""
    result = defect_ai_service.predict_resolution_time(defect_id)
    if 'error' in result:
        return jsonify({'status': 'error', 'message': result['error']}), 404
    return jsonify({'status': 'success', 'data': result})


@bp.route('/<int:defect_id>/ai/similar', methods=['GET'])
@jwt_required()
def find_similar_defects(defect_id: int):
    """Find similar defects."""
    limit = request.args.get('limit', 5, type=int)
    result = defect_ai_service.find_similar_defects(defect_id, limit)
    return jsonify({'status': 'success', 'data': result})


@bp.route('/<int:defect_id>/ai/root-cause', methods=['GET'])
@jwt_required()
def analyze_root_cause(defect_id: int):
    """Analyze potential root causes."""
    result = defect_ai_service.analyze_root_cause(defect_id)
    return jsonify({'status': 'success', 'data': result})


@bp.route('/ai/prevention/<int:equipment_id>', methods=['GET'])
@jwt_required()
def get_prevention_recommendations(equipment_id: int):
    """Get prevention recommendations for equipment."""
    result = defect_ai_service.get_prevention_recommendations(equipment_id)
    return jsonify({'status': 'success', 'data': result})


@bp.route('/ai/insights', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer', 'quality_engineer')
def get_dashboard_insights():
    """Get AI insights for defect dashboard."""
    result = defect_ai_service.get_dashboard_insights()
    return jsonify({'status': 'success', 'data': result})
