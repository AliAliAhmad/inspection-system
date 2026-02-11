"""
Overdue Management API Endpoints.
Provides centralized overdue tracking across all entities.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.services.overdue_ai_service import OverdueAIService
from app.utils.decorators import get_current_user, role_required, admin_required
from datetime import date, datetime

bp = Blueprint('overdue', __name__)
overdue_service = OverdueAIService()


@bp.route('/summary', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer', 'quality_engineer')
def get_overdue_summary():
    """Get summary of all overdue items by type."""
    result = overdue_service.get_summary()
    return jsonify({'status': 'success', 'data': result})


@bp.route('/inspections', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_overdue_inspections():
    """Get list of overdue inspections."""
    result = overdue_service.get_overdue_inspections()
    return jsonify({'status': 'success', 'data': result})


@bp.route('/defects', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_overdue_defects():
    """Get list of overdue defects."""
    result = overdue_service.get_overdue_defects()
    return jsonify({'status': 'success', 'data': result})


@bp.route('/reviews', methods=['GET'])
@jwt_required()
@role_required('admin', 'quality_engineer')
def get_overdue_reviews():
    """Get list of overdue quality reviews."""
    result = overdue_service.get_overdue_reviews()
    return jsonify({'status': 'success', 'data': result})


@bp.route('/aging', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_aging_buckets():
    """Get aging bucket analysis."""
    entity_type = request.args.get('type', 'all')
    result = overdue_service.get_aging_buckets(entity_type)
    return jsonify({'status': 'success', 'data': result})


@bp.route('/bulk-reschedule', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def bulk_reschedule():
    """Reschedule multiple overdue items."""
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': 'Request body required'}), 400

    entity_type = data.get('entity_type')
    entity_ids = data.get('entity_ids', [])
    new_date = data.get('new_date')

    if not entity_type or not entity_ids or not new_date:
        return jsonify({
            'status': 'error',
            'message': 'entity_type, entity_ids, and new_date are required'
        }), 400

    result = overdue_service.bulk_reschedule(entity_type, entity_ids, new_date)
    return jsonify({'status': 'success', 'data': result})


@bp.route('/ai/patterns', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_overdue_patterns():
    """Get AI analysis of overdue patterns."""
    result = overdue_service.analyze_patterns()
    return jsonify({'status': 'success', 'data': result})


@bp.route('/ai/predict/<entity_type>/<int:entity_id>', methods=['GET'])
@jwt_required()
def predict_overdue_risk(entity_type: str, entity_id: int):
    """Predict if an entity will become overdue."""
    result = overdue_service.predict_overdue_risk(entity_type, entity_id)
    if 'error' in result:
        return jsonify({'status': 'error', 'message': result['error']}), 404
    return jsonify({'status': 'success', 'data': result})


@bp.route('/calendar', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_overdue_calendar():
    """Get calendar view of overdue items."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    result = overdue_service.get_calendar_data(start_date, end_date)
    return jsonify({'status': 'success', 'data': result})
