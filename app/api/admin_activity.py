"""
Admin Activity Log API - view audit trail of admin actions.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models.admin_activity_log import AdminActivityLog
from app.models.user import User
from app.extensions import db

bp = Blueprint('admin_activity', __name__)


@bp.route('/', methods=['GET'])
@jwt_required()
def get_activity_logs():
    """Get activity logs with filtering and pagination. Admin only."""
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user or user.role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    entity_type = request.args.get('entity_type')
    action = request.args.get('action')
    user_id = request.args.get('user_id', type=int)
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')

    query = AdminActivityLog.query

    if entity_type:
        query = query.filter(AdminActivityLog.entity_type == entity_type)
    if action:
        query = query.filter(AdminActivityLog.action == action)
    if user_id:
        query = query.filter(AdminActivityLog.user_id == user_id)
    if date_from:
        from datetime import datetime
        query = query.filter(AdminActivityLog.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        from datetime import datetime
        query = query.filter(AdminActivityLog.created_at <= datetime.fromisoformat(date_to))

    query = query.order_by(AdminActivityLog.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'status': 'success',
        'data': [log.to_dict() for log in pagination.items],
        'total': pagination.total,
        'page': page,
        'per_page': per_page,
        'pages': pagination.pages,
    }), 200


@bp.route('/summary', methods=['GET'])
@jwt_required()
def get_activity_summary():
    """Get activity summary stats. Admin only."""
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user or user.role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403

    from datetime import datetime, timedelta
    from sqlalchemy import func

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = today - timedelta(days=7)

    # Today's activity count
    today_count = AdminActivityLog.query.filter(
        AdminActivityLog.created_at >= today
    ).count()

    # This week's activity by action type
    weekly_by_action = db.session.query(
        AdminActivityLog.action,
        func.count(AdminActivityLog.id)
    ).filter(
        AdminActivityLog.created_at >= week_ago
    ).group_by(AdminActivityLog.action).all()

    # Most active users this week
    active_users = db.session.query(
        AdminActivityLog.user_id,
        User.full_name,
        func.count(AdminActivityLog.id).label('count')
    ).join(User, User.id == AdminActivityLog.user_id).filter(
        AdminActivityLog.created_at >= week_ago
    ).group_by(AdminActivityLog.user_id, User.full_name).order_by(
        func.count(AdminActivityLog.id).desc()
    ).limit(10).all()

    return jsonify({
        'status': 'success',
        'data': {
            'today_count': today_count,
            'weekly_by_action': {a: c for a, c in weekly_by_action},
            'active_users': [{'user_id': u, 'name': n, 'count': c} for u, n, c in active_users],
        }
    }), 200
