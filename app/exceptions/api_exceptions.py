"""
Custom exceptions for API error handling.
"""
from typing import Optional, List, Dict, Any
from flask import request
import uuid

from .error_codes import ErrorCode, get_error_message


class APIException(Exception):
    """Base exception for API errors."""
    status_code = 400
    default_code = ErrorCode.UNKNOWN_ERROR

    def __init__(
        self,
        message: Optional[str] = None,
        code: Optional[ErrorCode] = None,
        status_code: Optional[int] = None,
        errors: Optional[List[Dict[str, Any]]] = None,
        payload: Optional[Dict[str, Any]] = None
    ):
        super().__init__()
        self.code = code or self.default_code
        # Get language from request headers if available
        lang = 'en'
        try:
            lang = request.headers.get('Accept-Language', 'en')[:2]
        except RuntimeError:
            pass  # Outside request context

        self.message = message or get_error_message(self.code, lang)
        if status_code is not None:
            self.status_code = status_code
        self.errors = errors or []  # Field-level errors
        self.payload = payload
        self.request_id = str(uuid.uuid4())[:8]  # Short request ID for debugging

    def to_dict(self) -> Dict[str, Any]:
        rv = dict(self.payload or ())
        rv['status'] = 'error'
        rv['code'] = self.code.value if isinstance(self.code, ErrorCode) else self.code
        rv['message'] = self.message
        rv['request_id'] = self.request_id
        if self.errors:
            rv['errors'] = self.errors
        return rv


class ValidationError(APIException):
    """Raised when validation fails."""
    status_code = 400
    default_code = ErrorCode.VALIDATION_ERROR

    def __init__(
        self,
        message: Optional[str] = None,
        code: Optional[ErrorCode] = None,
        field: Optional[str] = None,
        errors: Optional[List[Dict[str, Any]]] = None,
        **kwargs
    ):
        # If a single field error, convert to errors list
        if field and not errors:
            errors = [{'field': field, 'message': message or 'Invalid value'}]
        super().__init__(message=message, code=code or self.default_code, errors=errors, **kwargs)


class NotFoundError(APIException):
    """Raised when resource is not found."""
    status_code = 404
    default_code = ErrorCode.RESOURCE_NOT_FOUND

    def __init__(self, resource: Optional[str] = None, message: Optional[str] = None, **kwargs):
        if resource and not message:
            message = f"{resource} not found"
        super().__init__(message=message, **kwargs)


class UnauthorizedError(APIException):
    """Raised when user is not authenticated."""
    status_code = 401
    default_code = ErrorCode.AUTH_TOKEN_MISSING


class ForbiddenError(APIException):
    """Raised when user lacks permission."""
    status_code = 403
    default_code = ErrorCode.AUTH_FORBIDDEN


class ConflictError(APIException):
    """Raised when there's a conflict (e.g., duplicate)."""
    status_code = 409
    default_code = ErrorCode.RESOURCE_CONFLICT


class BusinessError(APIException):
    """Raised when business logic validation fails."""
    status_code = 422
    default_code = ErrorCode.BUSINESS_INVALID_STATE


class RateLimitError(APIException):
    """Raised when rate limit is exceeded."""
    status_code = 429
    default_code = ErrorCode.AUTH_RATE_LIMITED


class ExternalServiceError(APIException):
    """Raised when an external service fails."""
    status_code = 503
    default_code = ErrorCode.EXTERNAL_SERVICE_ERROR
