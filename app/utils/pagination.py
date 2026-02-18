"""
Reusable pagination helper for SQLAlchemy queries.
"""

from flask import request


def paginate(query, max_per_page=500):
    """
    Apply pagination to a SQLAlchemy query.

    Uses `page` and `per_page` query parameters.
    Returns (items, pagination_meta) tuple.

    Args:
        query: SQLAlchemy query object
        max_per_page: Maximum allowed per_page value

    Returns:
        tuple: (list of items, dict with pagination metadata)
    """
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 200, type=int)

    # Clamp values
    page = max(1, page)
    per_page = max(1, min(per_page, max_per_page))

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    meta = {
        'page': pagination.page,
        'per_page': pagination.per_page,
        'total': pagination.total,
        'pages': pagination.pages,
        'has_next': pagination.has_next,
        'has_prev': pagination.has_prev,
    }

    return pagination.items, meta
