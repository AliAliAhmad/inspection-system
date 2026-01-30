"""
Authentication service for user login and token management.
"""

from app.models import User
from app.extensions import db
from flask_jwt_extended import create_access_token, create_refresh_token
from app.exceptions.api_exceptions import ValidationError, UnauthorizedError


class AuthService:
    """Service for handling authentication operations."""
    
    @staticmethod
    def login(email, password):
        """
        Authenticate user and return JWT tokens.
        
        Args:
            email: User's email
            password: User's password
        
        Returns:
            Dictionary with access_token, refresh_token, and user info
        
        Raises:
            ValidationError: If email or password is missing
            UnauthorizedError: If credentials are invalid
        """
        if not email or not password:
            raise ValidationError("Email and password are required")
        
        # Find user by email
        user = User.query.filter_by(email=email).first()
        
        if not user or not user.check_password(password):
            raise UnauthorizedError("Invalid email or password")
        
        if not user.is_active:
            raise UnauthorizedError("Account is deactivated")
        
        # Create JWT tokens (convert user.id to string for JWT)
        access_token = create_access_token(identity=str(user.id))
        refresh_token = create_refresh_token(identity=str(user.id))
        
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