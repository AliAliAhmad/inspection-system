"""
Notification endpoints.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Notification
from app.services.notification_service import NotificationService
from app.utils.pagination import paginate
from app.utils.decorators import get_language

bp = Blueprint('notifications', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
def get_notifications():
    """
    Get user's notifications.
    
    Query Parameters:
        unread_only: true/false (default: false)
    
    Returns:
        {
            "status": "success",
            "unread_count": 5,
            "notifications": [...]
        }
    """
    current_user_id = get_jwt_identity()
    unread_only = request.args.get('unread_only', 'false').lower() == 'true'

    query = Notification.query.filter_by(user_id=int(current_user_id))
    if unread_only:
        query = query.filter_by(is_read=False)
    query = query.order_by(Notification.created_at.desc())

    items, pagination_meta = paginate(query)
    unread_count = NotificationService.get_unread_count(int(current_user_id))
    lang = get_language()

    return jsonify({
        'status': 'success',
        'unread_count': unread_count,
        'data': [n.to_dict(language=lang) for n in items],
        'pagination': pagination_meta
    }), 200


@bp.route('/<int:notification_id>/read', methods=['POST'])
@jwt_required()
def mark_notification_read(notification_id):
    """
    Mark notification as read.
    
    Returns:
        {
            "status": "success",
            "notification": {...}
        }
    """
    current_user_id = get_jwt_identity()
    
    notification = NotificationService.mark_as_read(
        notification_id=notification_id,
        user_id=current_user_id
    )
    
    return jsonify({
        'status': 'success',
        'message': 'Notification marked as read',
        'notification': notification.to_dict()
    }), 200


@bp.route('/read-all', methods=['POST'])
@jwt_required()
def mark_all_read():
    """
    Mark all notifications as read.
    
    Returns:
        {
            "status": "success",
            "count": 5
        }
    """
    current_user_id = get_jwt_identity()
    
    count = NotificationService.mark_all_as_read(current_user_id)
    
    return jsonify({
        'status': 'success',
        'message': f'{count} notifications marked as read',
        'count': count
    }), 200


@bp.route('/<int:notification_id>', methods=['DELETE'])
@jwt_required()
def delete_notification(notification_id):
    """
    Delete notification.
    
    Returns:
        {
            "status": "success",
            "message": "Notification deleted"
        }
    """
    current_user_id = get_jwt_identity()
    
    NotificationService.delete_notification(
        notification_id=notification_id,
        user_id=current_user_id
    )
    
    return jsonify({
        'status': 'success',
        'message': 'Notification deleted'
    }), 200