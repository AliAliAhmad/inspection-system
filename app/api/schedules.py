"""
Schedule management endpoints (Admin only).
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.schedule_service import ScheduleService
from app.exceptions.api_exceptions import ValidationError
from app.utils.decorators import get_current_user, admin_required

bp = Blueprint('schedules', __name__)


@bp.route('/today', methods=['GET'])
@jwt_required()
def get_todays_equipment():
    """
    Get equipment scheduled for today plus overdue equipment.
    Any technician can access this.
    
    Returns:
        {
            "status": "success",
            "scheduled_today": [...],
            "overdue": [...],
            "today": "Monday, January 27, 2026",
            "week_number": 5
        }
    """
    result = ScheduleService.get_todays_equipment()
    
    return jsonify({
        'status': 'success',
        **result
    }), 200


@bp.route('/weekly', methods=['GET'])
@jwt_required()
@admin_required()
def get_weekly_schedule():
    """
    Get complete weekly schedule. Admin only.
    
    Returns:
        {
            "status": "success",
            "schedule": {
                "0": {"day": "Monday", "equipment": [...]},
                ...
            }
        }
    """
    schedule = ScheduleService.get_weekly_schedule()
    
    return jsonify({
        'status': 'success',
        'schedule': schedule
    }), 200


@bp.route('', methods=['GET'])
@jwt_required()
@admin_required()
def list_schedules():
    """
    Get all schedules. Admin only.
    Returns weekly schedule in a list format.
    """
    schedule = ScheduleService.get_weekly_schedule()

    return jsonify({
        'status': 'success',
        'data': schedule
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
@admin_required()
def create_schedule():
    """
    Create a schedule entry. Admin only.
    
    Request Body:
        {
            "equipment_id": 1,
            "day_of_week": 0  // 0=Monday, 6=Sunday
        }
    
    Returns:
        {
            "status": "success",
            "schedule": {...}
        }
    """
    data = request.get_json()
    
    if not data or 'equipment_id' not in data or 'day_of_week' not in data:
        raise ValidationError("equipment_id and day_of_week are required")
    
    schedule = ScheduleService.create_schedule(
        equipment_id=data['equipment_id'],
        day_of_week=data['day_of_week']
    )
    
    return jsonify({
        'status': 'success',
        'message': 'Schedule created',
        'schedule': schedule.to_dict()
    }), 201


@bp.route('/<int:schedule_id>', methods=['DELETE'])
@jwt_required()
@admin_required()
def delete_schedule(schedule_id):
    """
    Delete a schedule entry. Admin only.
    
    Returns:
        {
            "status": "success",
            "message": "Schedule deleted"
        }
    """
    current_user_id = get_jwt_identity()
    
    ScheduleService.delete_schedule(
        schedule_id=schedule_id,
        current_user_id=current_user_id
    )
    
    return jsonify({
        'status': 'success',
        'message': 'Schedule deleted'
    }), 200