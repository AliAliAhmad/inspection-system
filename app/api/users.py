"""
User management endpoints (Admin only).
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.models import User
from app.extensions import db, safe_commit
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from app.utils.decorators import admin_required
from app.utils.pagination import paginate

bp = Blueprint('users', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
@admin_required()
def list_users():
    """List all users. Admin only."""
    query = User.query.filter_by(is_active=True)
    items, pagination = paginate(query)
    return jsonify({
        'status': 'success',
        'users': [user.to_dict() for user in items],
        'pagination': pagination
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
@admin_required()
def create_user():
    """
    Create new user. Admin only.
    
    Request Body:
        {
            "email": "newtech@company.com",
            "password": "password123",
            "full_name": "Jane Doe",
            "role": "technician",
            "language": "en"
        }
    
    Returns:
        {
            "status": "success",
            "user": {...}
        }
    """
    data = request.get_json()
    
    # Accept employee_id as alias for role_id (frontend uses employee_id)
    if 'employee_id' in data and 'role_id' not in data:
        data['role_id'] = data['employee_id']

    required_fields = ['email', 'password', 'full_name', 'role', 'role_id']
    for field in required_fields:
        if field not in data:
            raise ValidationError(f"{field} is required")

    # Check if email already exists
    existing = User.query.filter_by(email=data['email']).first()
    if existing:
        raise ValidationError(f"User with email {data['email']} already exists")

    # Check if role_id already exists
    existing_role_id = User.query.filter_by(role_id=data['role_id']).first()
    if existing_role_id:
        raise ValidationError(f"Employee ID '{data['role_id']}' already in use")

    # Validate role
    valid_roles = ['admin', 'inspector', 'specialist', 'engineer', 'quality_engineer']
    if data['role'] not in valid_roles:
        raise ValidationError(f"role must be one of: {', '.join(valid_roles)}")

    # Validate language
    language = data.get('language', 'en')
    if language not in ['en', 'ar']:
        raise ValidationError("language must be 'en' or 'ar'")

    user = User(
        email=data['email'],
        full_name=data['full_name'],
        role=data['role'],
        role_id=data['role_id'],
        language=language,
        phone=data.get('phone'),
        shift=data.get('shift'),
        specialization=data.get('specialization'),
        minor_role=data.get('minor_role'),
        minor_role_id=data.get('minor_role_id'),
        is_active=True
    )
    user.set_password(data['password'])
    
    db.session.add(user)
    safe_commit()
    
    return jsonify({
        'status': 'success',
        'message': 'User created',
        'user': user.to_dict()
    }), 201


@bp.route('/<int:user_id>', methods=['PUT'])
@jwt_required()
@admin_required()
def update_user(user_id):
    """
    Update user. Admin only.
    
    Request Body:
        {
            "full_name": "Jane Smith",
            "role": "admin",
            "language": "ar",
            "is_active": true
        }
    
    Returns:
        {
            "status": "success",
            "user": {...}
        }
    """
    user = db.session.get(User, user_id)
    if not user:
        raise NotFoundError(f"User with ID {user_id} not found")
    
    data = request.get_json()
    
    # Update fields if provided
    if 'full_name' in data:
        user.full_name = data['full_name']
    if 'role' in data:
        valid_roles = ['admin', 'inspector', 'specialist', 'engineer', 'quality_engineer']
        if data['role'] not in valid_roles:
            raise ValidationError(f"role must be one of: {', '.join(valid_roles)}")
        user.role = data['role']
    if 'language' in data:
        if data['language'] not in ['en', 'ar']:
            raise ValidationError("language must be 'en' or 'ar'")
        user.language = data['language']
    if 'is_active' in data:
        user.is_active = data['is_active']
    if 'password' in data:
        user.set_password(data['password'])
    
    safe_commit()
    
    return jsonify({
        'status': 'success',
        'message': 'User updated',
        'user': user.to_dict()
    }), 200


@bp.route('/<int:user_id>', methods=['DELETE'])
@jwt_required()
@admin_required()
def deactivate_user(user_id):
    """
    Deactivate user (soft delete). Admin only.
    
    Returns:
        {
            "status": "success",
            "message": "User deactivated"
        }
    """
    user = db.session.get(User, user_id)
    if not user:
        raise NotFoundError(f"User with ID {user_id} not found")
    
    user.is_active = False
    safe_commit()
    
    return jsonify({
        'status': 'success',
        'message': 'User deactivated'
    }), 200