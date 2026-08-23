"""
Custom decorators for authentication and authorization.
Supports multi-role system with Major + Minor roles.
"""

from functools import wraps
from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request, get_jwt
from app.exceptions.api_exceptions import UnauthorizedError, ForbiddenError
from app.extensions import db


def admin_required():
    """Decorator to require admin role."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            current_user_id = get_jwt_identity()
            from app.models import User
            user = db.session.get(User, int(current_user_id))
            if not user:
                raise UnauthorizedError("User not found")
            if user.role != 'admin':
                raise ForbiddenError("Admin access required")
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def inspector_required():
    """Decorator to require inspector role (major or minor)."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            current_user_id = get_jwt_identity()
            from app.models import User
            user = db.session.get(User, int(current_user_id))
            if not user:
                raise UnauthorizedError("User not found")
            if not user.has_role('inspector'):
                raise ForbiddenError("Inspector access required")
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def specialist_required():
    """Decorator to require specialist role (major or minor)."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            current_user_id = get_jwt_identity()
            from app.models import User
            user = db.session.get(User, int(current_user_id))
            if not user:
                raise UnauthorizedError("User not found")
            if not user.has_role('specialist'):
                raise ForbiddenError("Specialist access required")
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def engineer_required():
    """Decorator to require engineer role (major or minor)."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            current_user_id = get_jwt_identity()
            from app.models import User
            user = db.session.get(User, int(current_user_id))
            if not user:
                raise UnauthorizedError("User not found")
            if not user.has_role('engineer'):
                raise ForbiddenError("Engineer access required")
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def quality_engineer_required():
    """Decorator to require quality engineer role (major or minor)."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            current_user_id = get_jwt_identity()
            from app.models import User
            user = db.session.get(User, int(current_user_id))
            if not user:
                raise UnauthorizedError("User not found")
            if not user.has_role('quality_engineer'):
                raise ForbiddenError("Quality Engineer access required")
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def role_required(*roles):
    """Decorator to require any of the specified roles (major or minor)."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            current_user_id = get_jwt_identity()
            from app.models import User
            user = db.session.get(User, int(current_user_id))
            if not user:
                raise UnauthorizedError("User not found")
            if not any(user.has_role(r) for r in roles):
                raise ForbiddenError(f"One of these roles required: {', '.join(roles)}")
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def technician_or_admin_required():
    """Decorator to require either technician or admin role."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            current_user_id = get_jwt_identity()
            from app.models import User
            user = db.session.get(User, int(current_user_id))
            if not user:
                raise UnauthorizedError("User not found")
            if user.role not in ['admin', 'technician']:
                raise ForbiddenError("Access denied")
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def get_current_user():
    """Helper function to get the current authenticated user."""
    verify_jwt_in_request()
    current_user_id = get_jwt_identity()
    from app.models import User
    user = db.session.get(User, int(current_user_id))
    return user


def get_language(user=None):
    """
    Get the preferred language for the current request.

    Priority:
        1. ?lang= query parameter
        2. Accept-Language header (if 'ar' is present)
        3. User's saved language preference
        4. Default: 'en'
    """
    # 1. Explicit query parameter
    lang_param = request.args.get('lang')
    if lang_param in ('en', 'ar'):
        return lang_param

    # 2. Accept-Language header
    accept_lang = request.headers.get('Accept-Language', '')
    if 'ar' in accept_lang:
        return 'ar'

    # 3. User's saved preference
    if user and hasattr(user, 'language') and user.language:
        return user.language

    return 'en'


def planning_today():
    """Today's date in the yard's timezone.

    Planning is a Baghdad operation (UTC+3), but the server runs UTC. Using
    utcnow().date() meant that every day between 00:00 and 03:00 local, the
    planner believed it was still yesterday — a PM due today read as not-yet-due,
    and everything overdue was counted one day short.

    ZoneInfo is stdlib since 3.9; the fallback keeps this working on a container
    without tzdata rather than failing at import.
    """
    return planning_now().date()


def planning_now():
    """The current NAIVE wall-clock time in the yard.

    Naive on purpose: it is compared against, and formatted alongside, the naive
    UTC timestamps this codebase stores everywhere (datetime.utcnow()). Mixing an
    aware value in raises rather than converting.

    ZoneInfo is stdlib since 3.9; the fallback keeps this working on a container
    without tzdata rather than failing at import.
    """
    from datetime import datetime, timedelta, timezone
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo('Asia/Baghdad')).replace(tzinfo=None)
    except Exception:  # noqa: BLE001 - no tzdata in the image
        return (datetime.now(timezone.utc) + timedelta(hours=3)).replace(tzinfo=None)


def to_planning_time(utc_naive):
    """A stored (naive UTC) timestamp as the yard's wall clock.

    Everything in this database is written with datetime.utcnow(), so a delivery
    at 09:14 Baghdad is stored as 06:14. Printing that raw to a man standing in
    Baghdad is the same off-by-three-hours family of bug as utcnow().date().
    """
    from datetime import timedelta
    if utc_naive is None:
        return None
    return utc_naive + timedelta(hours=3)
