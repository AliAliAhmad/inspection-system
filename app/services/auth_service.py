"""
Authentication service for user login and token management.
"""

import logging
from app.models import User
from app.extensions import db
from flask_jwt_extended import create_access_token, create_refresh_token
from app.exceptions.api_exceptions import ValidationError, UnauthorizedError

logger = logging.getLogger(__name__)


class AuthService:
    """Service for handling authentication operations."""
    
    @staticmethod
    def login(email, password):
        """
        Authenticate user and return JWT tokens.

        Args:
            email: User's email or role_id
            password: User's password

        Returns:
            Dictionary with access_token, refresh_token, and user info

        Raises:
            ValidationError: If email or password is missing
            UnauthorizedError: If credentials are invalid
        """
        if not email or not password:
            raise ValidationError("Email/username and password are required")

        # Try to find user by email, then username, then role_id
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User.query.filter_by(username=email).first()
        if not user:
            user = User.query.filter_by(role_id=email).first()

        if not user or not user.check_password(password):
            logger.warning("Login failed for identifier=%s: invalid credentials", email)
            raise UnauthorizedError("Invalid email/username or password")

        if not user.is_active:
            logger.warning("Login failed for identifier=%s user_id=%s: account deactivated", email, user.id)
            raise UnauthorizedError("Account is deactivated")
        
        # Create JWT tokens (convert user.id to string for JWT)
        access_token = create_access_token(identity=str(user.id))
        refresh_token = create_refresh_token(identity=str(user.id))
        
        logger.info("Login successful for identifier=%s user_id=%s", email, user.id)
        return {
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': user.to_dict()
        }
    
    @staticmethod
    def refresh_token(current_user_id):
        """
        Generate new access token from refresh token.
        
        Args:
            current_user_id: ID of current user from JWT
        
        Returns:
            Dictionary with new access_token
        """
        access_token = create_access_token(identity=str(current_user_id))
        return {'access_token': access_token}