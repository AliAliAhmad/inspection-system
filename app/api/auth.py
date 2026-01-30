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
    from app.extensions import db
    from datetime import datetime, timezone

    jwt_data = get_jwt()
    token_blocklist = TokenBlocklist(
        jti=jwt_data['jti'],
        token_type='access',
        user_id=int(get_jwt_identity()),
        expires_at=datetime.fromtimestamp(jwt_data['exp'], tz=timezone.utc),
    )
    db.session.add(token_blocklist)
    db.session.commit()

    return jsonify({'status': 'success', 'message': 'Logged out'}), 200