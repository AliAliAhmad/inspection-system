"""
WebSocket handlers for real-time notifications.
Uses Flask-SocketIO for WebSocket support.
"""

import logging
from datetime import datetime
from flask import request
from flask_jwt_extended import decode_token
from flask_jwt_extended.exceptions import JWTDecodeError

logger = logging.getLogger(__name__)

# Store connected users and their rooms
connected_users = {}
user_subscriptions = {}


def register_socketio_handlers(socketio):
    """
    Register all WebSocket handlers for the notifications namespace.

    Args:
        socketio: Flask-SocketIO instance
    """
    from flask_socketio import emit, join_room, leave_room, disconnect

    @socketio.on('connect', namespace='/notifications')
    def handle_connect():
        """
        Handle client connection.
        Authenticates the user via JWT token and joins them to their personal room.
        """
        try:
            # Get token from query string or headers
            token = request.args.get('token')
            if not token:
                auth_header = request.headers.get('Authorization', '')
                if auth_header.startswith('Bearer '):
                    token = auth_header[7:]

            if not token:
                logger.warning("WebSocket connection rejected: No token provided")
                disconnect()
                return False

            # Decode and validate token
            try:
                decoded = decode_token(token)
                user_id = decoded.get('sub')
                if not user_id:
                    logger.warning("WebSocket connection rejected: Invalid token payload")
                    disconnect()
                    return False
            except JWTDecodeError as e:
                logger.warning(f"WebSocket connection rejected: {e}")
                disconnect()
                return False

            # Store connection info
            sid = request.sid
            connected_users[sid] = {
                'user_id': int(user_id),
                'connected_at': datetime.utcnow(),
                'subscriptions': set()
            }

            # Join user's personal room
            user_room = f"user_{user_id}"
            join_room(user_room)

            logger.info(f"WebSocket connected: user_id={user_id} sid={sid}")

            # Send connection confirmation
            emit('connected', {
                'status': 'success',
                'message': 'Connected to notifications',
                'user_id': user_id,
                'timestamp': datetime.utcnow().isoformat()
            })

            return True

        except Exception as e:
            logger.error(f"WebSocket connection error: {e}")
            disconnect()
            return False

    @socketio.on('disconnect', namespace='/notifications')
    def handle_disconnect():
        """
        Handle client disconnection.
        Cleans up user's rooms and subscriptions.
        """
        sid = request.sid

        if sid in connected_users:
            user_info = connected_users.pop(sid)
            user_id = user_info['user_id']

            # Leave all rooms
            user_room = f"user_{user_id}"
            leave_room(user_room)

            # Leave subscription rooms
            for subscription in user_info.get('subscriptions', []):
                leave_room(subscription)

            logger.info(f"WebSocket disconnected: user_id={user_id} sid={sid}")

    @socketio.on('subscribe', namespace='/notifications')
    def handle_subscribe(data):
        """
        Subscribe to specific notification types or categories.

        Args:
            data: {
                "types": ["inspection_assigned", "defect_reported"],
                "priorities": ["critical", "urgent"],
                "equipment_ids": [1, 2, 3]
            }
        """
        sid = request.sid
        if sid not in connected_users:
            emit('error', {'message': 'Not authenticated'})
            return

        user_info = connected_users[sid]
        subscriptions = user_info.get('subscriptions', set())

        # Subscribe to notification types
        if 'types' in data:
            for notification_type in data['types']:
                room = f"type_{notification_type}"
                join_room(room)
                subscriptions.add(room)

        # Subscribe to priority levels
        if 'priorities' in data:
            for priority in data['priorities']:
                room = f"priority_{priority}"
                join_room(room)
                subscriptions.add(room)

        # Subscribe to equipment-specific notifications
        if 'equipment_ids' in data:
            for equipment_id in data['equipment_ids']:
                room = f"equipment_{equipment_id}"
                join_room(room)
                subscriptions.add(room)

        user_info['subscriptions'] = subscriptions
        connected_users[sid] = user_info

        emit('subscribed', {
            'status': 'success',
            'subscriptions': list(subscriptions),
            'timestamp': datetime.utcnow().isoformat()
        })

        logger.debug(f"User {user_info['user_id']} subscribed to: {subscriptions}")

    @socketio.on('unsubscribe', namespace='/notifications')
    def handle_unsubscribe(data):
        """
        Unsubscribe from specific notification types or categories.

        Args:
            data: {
                "types": ["inspection_assigned"],
                "priorities": ["info"],
                "equipment_ids": [1]
            }
        """
        sid = request.sid
        if sid not in connected_users:
            emit('error', {'message': 'Not authenticated'})
            return

        user_info = connected_users[sid]
        subscriptions = user_info.get('subscriptions', set())

        # Unsubscribe from notification types
        if 'types' in data:
            for notification_type in data['types']:
                room = f"type_{notification_type}"
                leave_room(room)
                subscriptions.discard(room)

        # Unsubscribe from priority levels
        if 'priorities' in data:
            for priority in data['priorities']:
                room = f"priority_{priority}"
                leave_room(room)
                subscriptions.discard(room)

        # Unsubscribe from equipment-specific notifications
        if 'equipment_ids' in data:
            for equipment_id in data['equipment_ids']:
                room = f"equipment_{equipment_id}"
                leave_room(room)
                subscriptions.discard(room)

        user_info['subscriptions'] = subscriptions
        connected_users[sid] = user_info

        emit('unsubscribed', {
            'status': 'success',
            'subscriptions': list(subscriptions),
            'timestamp': datetime.utcnow().isoformat()
        })

    @socketio.on('mark_read', namespace='/notifications')
    def handle_mark_read(data):
        """
        Mark notification as read via WebSocket.

        Args:
            data: { "notification_id": 123 } or { "notification_ids": [1, 2, 3] }
        """
        sid = request.sid
        if sid not in connected_users:
            emit('error', {'message': 'Not authenticated'})
            return

        user_info = connected_users[sid]
        user_id = user_info['user_id']

        try:
            from app.services.notification_service import NotificationService

            if 'notification_id' in data:
                # Mark single notification as read
                notification = NotificationService.mark_as_read(
                    notification_id=data['notification_id'],
                    user_id=user_id
                )
                emit('read_confirmed', {
                    'status': 'success',
                    'notification_id': data['notification_id'],
                    'timestamp': datetime.utcnow().isoformat()
                })

            elif 'notification_ids' in data:
                # Mark multiple notifications as read
                count = NotificationService.bulk_mark_read(
                    notification_ids=data['notification_ids'],
                    user_id=user_id
                )
                emit('read_confirmed', {
                    'status': 'success',
                    'notification_ids': data['notification_ids'],
                    'count': count,
                    'timestamp': datetime.utcnow().isoformat()
                })

            # Update unread count
            unread_count = NotificationService.get_unread_count(user_id)
            emit('unread_count', {
                'count': unread_count,
                'timestamp': datetime.utcnow().isoformat()
            })

        except Exception as e:
            logger.error(f"Error marking notification read: {e}")
            emit('error', {'message': str(e)})

    @socketio.on('acknowledge', namespace='/notifications')
    def handle_acknowledge(data):
        """
        Acknowledge a critical notification via WebSocket.

        Args:
            data: { "notification_id": 123 }
        """
        sid = request.sid
        if sid not in connected_users:
            emit('error', {'message': 'Not authenticated'})
            return

        user_info = connected_users[sid]
        user_id = user_info['user_id']

        try:
            from app.services.notification_service import NotificationService

            notification = NotificationService.acknowledge_notification(
                notification_id=data['notification_id'],
                user_id=user_id
            )

            emit('acknowledge_confirmed', {
                'status': 'success',
                'notification_id': data['notification_id'],
                'timestamp': datetime.utcnow().isoformat()
            })

        except Exception as e:
            logger.error(f"Error acknowledging notification: {e}")
            emit('error', {'message': str(e)})

    @socketio.on('get_unread_count', namespace='/notifications')
    def handle_get_unread_count():
        """
        Get current unread count via WebSocket.
        """
        sid = request.sid
        if sid not in connected_users:
            emit('error', {'message': 'Not authenticated'})
            return

        user_info = connected_users[sid]
        user_id = user_info['user_id']

        try:
            from app.services.notification_service import NotificationService

            unread_count = NotificationService.get_unread_count(user_id)
            emit('unread_count', {
                'count': unread_count,
                'timestamp': datetime.utcnow().isoformat()
            })

        except Exception as e:
            logger.error(f"Error getting unread count: {e}")
            emit('error', {'message': str(e)})

    @socketio.on('ping', namespace='/notifications')
    def handle_ping():
        """
        Handle ping for keep-alive.
        """
        emit('pong', {'timestamp': datetime.utcnow().isoformat()})


def emit_notification(socketio, notification, user_id=None):
    """
    Emit a notification to connected clients.

    Args:
        socketio: Flask-SocketIO instance
        notification: Notification object or dict
        user_id: Optional specific user ID to target
    """
    if hasattr(notification, 'to_dict'):
        notification_data = notification.to_dict()
        notification_type = notification.type
        priority = notification.priority
        related_id = notification.related_id
        target_user_id = notification.user_id
    else:
        notification_data = notification
        notification_type = notification.get('type')
        priority = notification.get('priority', 'info')
        related_id = notification.get('related_id')
        target_user_id = notification.get('user_id')

    payload = {
        'notification': notification_data,
        'timestamp': datetime.utcnow().isoformat()
    }

    # Emit to user's personal room
    if target_user_id:
        user_room = f"user_{target_user_id}"
        socketio.emit('notification', payload, room=user_room, namespace='/notifications')

    # Emit to type-specific room
    if notification_type:
        type_room = f"type_{notification_type}"
        socketio.emit('notification', payload, room=type_room, namespace='/notifications')

    # Emit to priority-specific room
    if priority:
        priority_room = f"priority_{priority}"
        socketio.emit('notification', payload, room=priority_room, namespace='/notifications')

    # Emit to equipment-specific room if applicable
    if related_id and notification_data.get('related_type') == 'equipment':
        equipment_room = f"equipment_{related_id}"
        socketio.emit('notification', payload, room=equipment_room, namespace='/notifications')

    logger.debug(f"Emitted notification: type={notification_type} user_id={target_user_id}")


def emit_unread_count_update(socketio, user_id, count):
    """
    Emit unread count update to a specific user.

    Args:
        socketio: Flask-SocketIO instance
        user_id: User ID
        count: New unread count
    """
    user_room = f"user_{user_id}"
    socketio.emit('unread_count', {
        'count': count,
        'timestamp': datetime.utcnow().isoformat()
    }, room=user_room, namespace='/notifications')


def emit_bulk_notification(socketio, notifications):
    """
    Emit multiple notifications at once.

    Args:
        socketio: Flask-SocketIO instance
        notifications: List of notification objects or dicts
    """
    for notification in notifications:
        emit_notification(socketio, notification)


def broadcast_system_notification(socketio, message, priority='info'):
    """
    Broadcast a system-wide notification to all connected users.

    Args:
        socketio: Flask-SocketIO instance
        message: Notification message
        priority: Notification priority level
    """
    payload = {
        'type': 'system',
        'message': message,
        'priority': priority,
        'timestamp': datetime.utcnow().isoformat()
    }
    socketio.emit('system_notification', payload, namespace='/notifications')
    logger.info(f"Broadcast system notification: {message}")


def get_connected_user_count():
    """
    Get the number of currently connected users.

    Returns:
        int: Number of connected users
    """
    return len(connected_users)


def get_connected_users():
    """
    Get list of connected user IDs.

    Returns:
        list: List of connected user IDs
    """
    return list(set(info['user_id'] for info in connected_users.values()))


def is_user_connected(user_id):
    """
    Check if a specific user is currently connected.

    Args:
        user_id: User ID to check

    Returns:
        bool: True if user is connected
    """
    return any(info['user_id'] == user_id for info in connected_users.values())
