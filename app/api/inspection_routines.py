"""
Inspection routine management endpoints (Admin only).
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import InspectionRoutine, ChecklistTemplate
from app.extensions import db, safe_commit
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from app.utils.decorators import admin_required

bp = Blueprint('inspection_routines', __name__)


def _validate_routine_data(data, partial=False):
    """Validate routine request data. If partial=True, only validate fields that are present."""
    if not partial:
        required_fields = ['name', 'asset_types', 'template_id']
        for field in required_fields:
            if field not in data:
                raise ValidationError(f"{field} is required")

    if 'asset_types' in data:
        asset_types = data['asset_types']
        if not isinstance(asset_types, list) or len(asset_types) == 0:
            raise ValidationError("asset_types must be a non-empty list")

    if 'template_id' in data:
        template = db.session.get(ChecklistTemplate, data['template_id'])
        if not template:
            raise ValidationError(f"ChecklistTemplate with ID {data['template_id']} not found")


@bp.route('', methods=['GET'])
@jwt_required()
@admin_required()
def list_routines():
    """
    List all inspection routines. Admin only.

    Returns:
        {
            "status": "success",
            "data": [...]
        }
    """
    routines = InspectionRoutine.query.order_by(InspectionRoutine.created_at.desc()).all()

    return jsonify({
        'status': 'success',
        'data': [r.to_dict() for r in routines]
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
@admin_required()
def create_routine():
    """
    Create a new inspection routine. Admin only.

    Request Body:
        {
            "name": "Daily Pump Inspection",
            "name_ar": "...",
            "asset_types": ["Centrifugal Pump", "Screw Pump"],
            "shift": "day",
            "days_of_week": [0, 1, 2, 3, 4],
            "template_id": 1
        }

    Returns:
        {
            "status": "success",
            "data": {...}
        }
    """
    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    _validate_routine_data(data)

    current_user_id = get_jwt_identity()

    routine = InspectionRoutine(
        name=data['name'],
        name_ar=data.get('name_ar'),
        asset_types=data['asset_types'],
        template_id=data['template_id'],
        is_active=data.get('is_active', True),
        created_by_id=int(current_user_id)
    )

    db.session.add(routine)
    safe_commit()

    return jsonify({
        'status': 'success',
        'data': routine.to_dict()
    }), 201


@bp.route('/<int:routine_id>', methods=['PUT'])
@jwt_required()
@admin_required()
def update_routine(routine_id):
    """
    Update an inspection routine. Admin only.

    Request Body (all fields optional):
        {
            "name": "Updated name",
            "name_ar": "...",
            "asset_types": ["Centrifugal Pump"],
            "shift": "night",
            "days_of_week": [0, 1, 2],
            "template_id": 2,
            "is_active": false
        }

    Returns:
        {
            "status": "success",
            "data": {...}
        }
    """
    routine = db.session.get(InspectionRoutine, routine_id)
    if not routine:
        raise NotFoundError(f"InspectionRoutine with ID {routine_id} not found")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    _validate_routine_data(data, partial=True)

    if 'name' in data:
        routine.name = data['name']
    if 'name_ar' in data:
        routine.name_ar = data['name_ar']
    if 'asset_types' in data:
        routine.asset_types = data['asset_types']
    if 'template_id' in data:
        routine.template_id = data['template_id']
    if 'is_active' in data:
        routine.is_active = data['is_active']

    safe_commit()

    return jsonify({
        'status': 'success',
        'data': routine.to_dict()
    }), 200


@bp.route('/<int:routine_id>', methods=['DELETE'])
@jwt_required()
@admin_required()
def delete_routine(routine_id):
    """
    Deactivate an inspection routine. Admin only.

    Returns:
        {
            "status": "success",
            "message": "Inspection routine deactivated"
        }
    """
    routine = db.session.get(InspectionRoutine, routine_id)
    if not routine:
        raise NotFoundError(f"InspectionRoutine with ID {routine_id} not found")

    routine.is_active = False
    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Inspection routine deactivated'
    }), 200
