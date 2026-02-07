"""
User management endpoints (Admin only).
"""

from datetime import date
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy.exc import IntegrityError
from app.models import User, Leave
from app.extensions import db, safe_commit
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from app.utils.decorators import admin_required
from app.utils.pagination import paginate

bp = Blueprint('users', __name__)

# Prefix mapping for auto-generating employee IDs
_ROLE_PREFIXES = {
    'admin': 'ADM',
    'inspector': 'INS',
    'specialist': 'SPC',
    'engineer': 'ENG',
    'quality_engineer': 'QE',
}


def _generate_role_id(role):
    """Auto-generate the next employee ID for a given role, e.g. INS-001, SPC-002."""
    prefix = _ROLE_PREFIXES.get(role)
    if not prefix:
        raise ValidationError(f"Unknown role: {role}")

    # Find the highest existing number for this prefix across both role_id and minor_role_id
    existing_role = User.query.filter(User.role_id.like(f'{prefix}%')).all()
    existing_minor = User.query.filter(User.minor_role_id.like(f'{prefix}%')).all()

    max_num = 0
    for u in existing_role:
        suffix = u.role_id[len(prefix):]
        if suffix.startswith('-'):
            suffix = suffix[1:]
        try:
            num = int(suffix)
            if num > max_num:
                max_num = num
        except ValueError:
            continue

    for u in existing_minor:
        if not u.minor_role_id:
            continue
        suffix = u.minor_role_id[len(prefix):]
        if suffix.startswith('-'):
            suffix = suffix[1:]
        try:
            num = int(suffix)
            if num > max_num:
                max_num = num
        except ValueError:
            continue

    return f'{prefix}-{max_num + 1:03d}'


@bp.route('', methods=['GET'])
@jwt_required()
@admin_required()
def list_users():
    """List all users. Admin only."""
    query = User.query.filter_by(is_active=True)
    items, pagination = paginate(query)

    # Find active leave coverage for on-leave users
    today = date.today()
    active_leaves = Leave.query.filter(
        Leave.status == 'approved',
        Leave.date_from <= today,
        Leave.date_to >= today,
        Leave.coverage_user_id.isnot(None)
    ).all()

    # Build maps: on-leave user -> cover info, cover user -> who they cover
    leave_cover_map = {}  # user_id -> { cover user info }
    covering_for_map = {}  # cover_user_id -> { on-leave user info }
    for lv in active_leaves:
        if lv.coverage_user:
            leave_cover_map[lv.user_id] = {
                'id': lv.coverage_user.id,
                'full_name': lv.coverage_user.full_name,
                'role_id': lv.coverage_user.role_id,
            }
        user_on_leave = db.session.get(User, lv.user_id)
        if user_on_leave and lv.coverage_user_id:
            covering_for_map[lv.coverage_user_id] = {
                'id': user_on_leave.id,
                'full_name': user_on_leave.full_name,
                'role_id': user_on_leave.role_id,
            }

    user_list = []
    for u in items:
        d = u.to_dict()
        if u.id in leave_cover_map:
            d['leave_cover'] = leave_cover_map[u.id]
        if u.id in covering_for_map:
            d['covering_for'] = covering_for_map[u.id]
        user_list.append(d)

    return jsonify({
        'status': 'success',
        'data': user_list,
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
    
    required_fields = ['email', 'password', 'full_name', 'role']
    for field in required_fields:
        if field not in data:
            raise ValidationError(f"{field} is required")

    # Validate role
    valid_roles = ['admin', 'inspector', 'specialist', 'engineer', 'quality_engineer']
    if data['role'] not in valid_roles:
        raise ValidationError(f"role must be one of: {', '.join(valid_roles)}")

    # Check if email already exists
    existing = User.query.filter_by(email=data['email']).first()
    if existing:
        raise ValidationError(f"User with email {data['email']} already exists")

    # Auto-generate role_id based on role
    role_id = _generate_role_id(data['role'])

    # Auto-generate minor_role_id if minor_role is provided
    minor_role = data.get('minor_role')
    minor_role_id = None
    if minor_role:
        if minor_role not in valid_roles:
            raise ValidationError(f"minor_role must be one of: {', '.join(valid_roles)}")
        minor_role_id = _generate_role_id(minor_role)

    # Validate language
    language = data.get('language', 'en')
    if language not in ['en', 'ar']:
        raise ValidationError("language must be 'en' or 'ar'")

    # Auto-generate username from full name
    username = User.generate_username(data['full_name'])

    user = User(
        email=data['email'],
        username=username,
        full_name=data['full_name'],
        role=data['role'],
        role_id=role_id,
        language=language,
        phone=data.get('phone'),
        shift=data.get('shift'),
        specialization=data.get('specialization'),
        minor_role=minor_role,
        minor_role_id=minor_role_id,
        is_active=True,
        annual_leave_balance=24,
    )
    user.set_password(data['password'])
    
    db.session.add(user)
    try:
        safe_commit()
    except IntegrityError as e:
        db.session.rollback()
        error_msg = str(e.orig) if e.orig else str(e)
        if 'role_id' in error_msg or 'minor_role_id' in error_msg:
            raise ValidationError("Duplicate employee ID generated. Please try again.")
        raise ValidationError(f"Database constraint error: {error_msg}")

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