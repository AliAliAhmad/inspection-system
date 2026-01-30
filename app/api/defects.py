"""
Defect management endpoints.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Defect
from app.services.defect_service import DefectService
from app.exceptions.api_exceptions import ValidationError
from app.utils.decorators import get_current_user, admin_required, get_language
from app.utils.pagination import paginate

bp = Blueprint('defects', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
def list_defects():
    """
    List defects. Filtered by role.
    - Technicians see only assigned defects
    - Admins see all
    
    Query Parameters:
        status: Filter by status (open, in_progress, resolved, closed)
        severity: Filter by severity (low, medium, high, critical)
    
    Returns:
        {
            "status": "success",
            "defects": [...]
        }
    """
    current_user = get_current_user()
    
    query = Defect.query
    
    # Filter by role
    if current_user.role == 'technician':
        query = query.filter_by(assigned_to_id=current_user.id)
    
    # Apply filters
    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)
    
    severity = request.args.get('severity')
    if severity:
        query = query.filter_by(severity=severity)
    
    query = query.order_by(Defect.due_date, Defect.severity.desc())
    items, pagination = paginate(query)
    lang = get_language(current_user)

    return jsonify({
        'status': 'success',
        'data': [defect.to_dict(language=lang) for defect in items],
        'pagination': pagination
    }), 200


@bp.route('/<int:defect_id>/resolve', methods=['POST'])
@jwt_required()
def resolve_defect(defect_id):
    """
    Mark defect as resolved.
    
    Request Body:
        {
            "resolution_notes": "Replaced faulty component"
        }
    
    Returns:
        {
            "status": "success",
            "defect": {...}
        }
    """
    data = request.get_json()
    current_user_id = get_jwt_identity()
    
    if not data or 'resolution_notes' not in data:
        raise ValidationError("resolution_notes is required")
    
    defect = DefectService.resolve_defect(
        defect_id=defect_id,
        resolution_notes=data['resolution_notes'],
        current_user_id=current_user_id
    )
    
    return jsonify({
        'status': 'success',
        'message': 'Defect resolved',
        'defect': defect.to_dict()
    }), 200


@bp.route('/<int:defect_id>/close', methods=['POST'])
@jwt_required()
@admin_required()
def close_defect(defect_id):
    """
    Close defect. Admin only.
    
    Returns:
        {
            "status": "success",
            "defect": {...}
        }
    """
    current_user_id = get_jwt_identity()
    
    defect = DefectService.close_defect(
        defect_id=defect_id,
        current_user_id=current_user_id
    )
    
    return jsonify({
        'status': 'success',
        'message': 'Defect closed',
        'defect': defect.to_dict()
    }), 200