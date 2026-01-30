"""
Equipment management endpoints.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.models import Equipment
from app.extensions import db, safe_commit
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from app.utils.decorators import get_current_user, admin_required, get_language
from app.utils.pagination import paginate

bp = Blueprint('equipment', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
def list_equipment():
    """
    List equipment. Filtered by role.
    - Technicians see only assigned equipment
    - Admins see all
    
    Returns:
        {
            "status": "success",
            "equipment": [...]
        }
    """
    current_user = get_current_user()
    
    query = Equipment.query
    
    # Filter by role
    if current_user.role == 'technician':
        query = query.filter_by(assigned_technician_id=current_user.id)
    
    query = query.order_by(Equipment.name)
    items, pagination = paginate(query)
    lang = get_language(current_user)

    return jsonify({
        'status': 'success',
        'equipment': [eq.to_dict(language=lang) for eq in items],
        'pagination': pagination
    }), 200


@bp.route('/<int:equipment_id>', methods=['GET'])
@jwt_required()
def get_equipment(equipment_id):
    """
    Get equipment details.
    
    Returns:
        {
            "status": "success",
            "equipment": {...}
        }
    """
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")
    
    lang = get_language()

    return jsonify({
        'status': 'success',
        'equipment': equipment.to_dict(language=lang)
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
@admin_required()
def create_equipment():
    """
    Create new equipment. Admin only.
    
    Request Body:
        {
            "name": "Pump A-101",
            "equipment_type": "Centrifugal Pump",
            "serial_number": "CP-2024-001",
            "location": "Building A",
            "status": "active",
            "assigned_technician_id": 2
        }
    
    Returns:
        {
            "status": "success",
            "equipment": {...}
        }
    """
    data = request.get_json()
    
    required_fields = ['name', 'equipment_type', 'serial_number', 'location']
    for field in required_fields:
        if field not in data:
            raise ValidationError(f"{field} is required")
    
    # Auto-translate location only (name and equipment_type are technical identifiers, always English)
    location_ar = data.get('location_ar')
    if not location_ar:
        from app.services.translation_service import TranslationService
        location_ar = TranslationService.translate_to_arabic(data['location'])

    equipment = Equipment(
        name=data['name'],
        name_ar=data.get('name_ar'),
        equipment_type=data['equipment_type'],
        equipment_type_ar=data.get('equipment_type_ar'),
        serial_number=data['serial_number'],
        location=data['location'],
        location_ar=location_ar,
        status=data.get('status', 'active'),
        assigned_technician_id=data.get('assigned_technician_id')
    )

    db.session.add(equipment)
    safe_commit()
    
    return jsonify({
        'status': 'success',
        'message': 'Equipment created',
        'equipment': equipment.to_dict()
    }), 201


@bp.route('/<int:equipment_id>', methods=['PUT'])
@jwt_required()
@admin_required()
def update_equipment(equipment_id):
    """
    Update equipment. Admin only.
    
    Request Body:
        {
            "name": "Pump A-102",
            "location": "Building A - Floor 3",
            "status": "under_maintenance",
            "assigned_technician_id": 2
        }
    
    Returns:
        {
            "status": "success",
            "equipment": {...}
        }
    """
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")
    
    data = request.get_json()
    
    # Update fields if provided
    if 'name' in data:
        equipment.name = data['name']
    if 'equipment_type' in data:
        equipment.equipment_type = data['equipment_type']
    if 'serial_number' in data:
        equipment.serial_number = data['serial_number']
    if 'location' in data:
        equipment.location = data['location']
    if 'status' in data:
        equipment.status = data['status']
    if 'assigned_technician_id' in data:
        equipment.assigned_technician_id = data['assigned_technician_id']
    
    safe_commit()
    
    return jsonify({
        'status': 'success',
        'message': 'Equipment updated',
        'equipment': equipment.to_dict()
    }), 200


@bp.route('/<int:equipment_id>', methods=['DELETE'])
@jwt_required()
@admin_required()
def delete_equipment(equipment_id):
    """
    Delete equipment. Admin only.
    
    Returns:
        {
            "status": "success",
            "message": "Equipment deleted"
        }
    """
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    # Soft-delete: mark as out_of_service instead of hard-deleting
    # This preserves FK references from inspections, defects, jobs, and assignments
    equipment.status = 'out_of_service'
    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Equipment decommissioned'
    }), 200