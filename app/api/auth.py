"""
Authentication endpoints for login and token refresh.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from app.services.auth_service import AuthService
from app.exceptions.api_exceptions import ValidationError
from app.extensions import limiter

bp = Blueprint('auth', __name__)


@bp.route('/login', methods=['POST'])
@limiter.limit("5 per minute")
def login():
    """
    User login endpoint.
    
    Request Body:
        {
            "email": "user@example.com",
            "password": "password123"
        }
    
    Returns:
        {
            "status": "success",
            "access_token": "...",
            "refresh_token": "...",
            "user": {...}
        }
    """
    data = request.get_json()
    
    if not data:
        raise ValidationError("Request body is required")
    
    email = data.get('email')
    password = data.get('password')
    
    result = AuthService.login(email, password)
    
    return jsonify({
        'status': 'success',
        **result
    }), 200


@bp.route('/refresh', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required(refresh=True)
def refresh():
    """
    Refresh access token using refresh token.
    
    Returns:
        {
            "status": "success",
            "access_token": "..."
        }
    """
    current_user_id = get_jwt_identity()
    result = AuthService.refresh_token(current_user_id)
    
    return jsonify({
        'status': 'success',
        **result
    }), 200


@bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """
    Get current authenticated user info.
    
    Returns:
        {
            "status": "success",
            "user": {...}
        }
    """
    from app.utils.decorators import get_current_user
    user = get_current_user()
    
    return jsonify({
        'status': 'success',
        'user': user.to_dict()
    }), 200


@bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    """Revoke the current access token."""
    from app.models import TokenBlocklist
    from app.extensions import db, safe_commit
    from datetime import datetime, timezone

    jwt_data = get_jwt()
    token_blocklist = TokenBlocklist(
        jti=jwt_data['jti'],
        token_type='access',
        user_id=int(get_jwt_identity()),
        expires_at=datetime.fromtimestamp(jwt_data['exp'], tz=timezone.utc),
    )
    db.session.add(token_blocklist)
    safe_commit()

    return jsonify({'status': 'success', 'message': 'Logged out'}), 200


@bp.route('/push-token', methods=['POST'])
@jwt_required()
def register_push_token():
    """
    Register or update Expo push token for the current user.
    Called by the mobile app after login to enable push notifications.

    Request Body:
        {
            "token": "ExponentPushToken[xxxxxx]"
        }

    Returns:
        {
            "status": "success",
            "message": "Push token registered"
        }
    """
    from app.models import User
    from app.extensions import db, safe_commit

    data = request.get_json()
    if not data or not data.get('token'):
        raise ValidationError("Push token is required")

    token = data['token']

    # Validate it looks like an Expo push token
    if not token.startswith('ExponentPushToken[') and not token.startswith('ExpoPushToken['):
        raise ValidationError("Invalid Expo push token format")

    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)

    if not user:
        raise ValidationError("User not found")

    user.expo_push_token = token
    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Push token registered'
    }), 200


@bp.route('/push-token', methods=['DELETE'])
@jwt_required()
def remove_push_token():
    """
    Remove Expo push token for the current user (e.g. on logout).

    Returns:
        {
            "status": "success",
            "message": "Push token removed"
        }
    """
    from app.models import User
    from app.extensions import db, safe_commit

    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)

    if user:
        user.expo_push_token = None
        safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Push token removed'
    }), 200


@bp.route('/change-password', methods=['POST'])
@jwt_required()
def change_password():
    """
    Change user password. Used for first-time login and regular password changes.

    Request Body:
        {
            "old_password": "current_password",
            "new_password": "new_secure_password"
        }

    Returns:
        {
            "status": "success",
            "message": "Password changed successfully"
        }
    """
    from app.models import User
    from app.extensions import db, safe_commit

    data = request.get_json()

    if not data:
        raise ValidationError("Request body is required")

    old_password = data.get('old_password')
    new_password = data.get('new_password')

    if not old_password or not new_password:
        raise ValidationError("old_password and new_password are required")

    if len(new_password) < 6:
        raise ValidationError("New password must be at least 6 characters")

    if old_password == new_password:
        raise ValidationError("New password must be different from current password")

    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)

    if not user:
        raise ValidationError("User not found")

    if not user.check_password(old_password):
        raise ValidationError("Current password is incorrect")

    # Set new password and clear must_change_password flag
    user.set_password(new_password)
    user.must_change_password = False
    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Password changed successfully',
        'user': user.to_dict()
    }), 200