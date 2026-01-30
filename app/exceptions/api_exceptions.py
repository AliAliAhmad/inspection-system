"""
Custom exceptions for API error handling.
"""

class APIException(Exception):
    """Base exception for API errors."""
    status_code = 400
    
    def __init__(self, message, status_code=None, payload=None):
        super().__init__()
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.payload = payload
    
    def to_dict(self):
        rv = dict(self.payload or ())
        rv['message'] = self.message
        rv['status'] = 'error'
        return rv


class ValidationError(APIException):
    """Raised when validation fails."""
    status_code = 400


class NotFoundError(APIException):
    """Raised when resource is not found."""
    status_code = 404


class UnauthorizedError(APIException):
    """Raised when user is not authenticated."""
    status_code = 401


class ForbiddenError(APIException):
    """Raised when user lacks permission."""
    status_code = 403


class ConflictError(APIException):
    """Raised when there's a conflict (e.g., duplicate)."""
    status_code = 409