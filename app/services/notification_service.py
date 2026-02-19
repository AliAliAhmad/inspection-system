"""
Service for managing notifications.
Enhanced with preferences, snooze, scheduling, AI, analytics, escalation, and more.
Supports WebSocket events and rule-based processing.
"""

import logging
import json
import requests
import threading
from app.models import Notification, User
from app.extensions import db
from app.exceptions.api_exceptions import NotFoundError, ForbiddenError, ValidationError
from datetime import datetime, timedelta
from sqlalchemy import func, and_, or_
from collections import defaultdict

logger = logging.getLogger(__name__)

# In-memory stores for preferences, DND, rules, templates, and escalations
# In production, these would be stored in the database
_user_preferences = {}
_user_dnd_settings = {}
_notification_rules = []
_notification_templates = {}
_notification_escalations = {}
_notification_analytics = defaultdict(list)
_snoozed_notifications = {}
_scheduled_notifications = {}
_archived_notifications = set()
_acknowledged_notifications = set()

# SocketIO instance (set during app initialization)
_socketio = None


def set_socketio(socketio):
    """Set the SocketIO instance for emitting events."""
    global _socketio
    _socketio = socketio


def _send_expo_push_notification(token, title, body, data=None):
    """
    Send a push notification via the Expo Push API.
    Runs in a separate thread to avoid blocking the main request.

    Args:
        token: Expo push token (ExponentPushToken[xxx])
        title: Notification title
        body: Notification body/message
        data: Optional extra data payload
    """
    def _send():
        try:
            response = requests.post(
                'https://exp.host/--/api/v2/push/send',
                json={
                    'to': token,
                    'title': title,
                    'body': body,
                    'data': data or {},
                    'sound': 'default',
                    'badge': 1,
                },
                headers={
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                timeout=10,
            )
            if response.status_code != 200:
                logger.warning(
                    "Expo push API returned status %s for token %s: %s",
                    response.status_code, token[:30], response.text[:200]
                )
            else:
                result = response.json()
                if result.get('data', {}).get('status') == 'error':
                    logger.warning(
                        "Expo push error for token %s: %s",
                        token[:30], result['data'].get('message', 'Unknown error')
                    )
                else:
                    logger.debug("Expo push sent successfully to %s", token[:30])
        except Exception as e:
            logger.error("Failed to send Expo push notification: %s", str(e))

    thread = threading.Thread(target=_send, daemon=True)
    thread.start()


def _send_expo_push_for_user(user_id, title, body, data=None):
    """
    Look up the user's Expo push token and send a push notification.
    Non-blocking: failures are logged but don't raise exceptions.

    Args:
        user_id: User ID to send push to
        title: Notification title
        body: Notification body/message
        data: Optional extra data payload
    """
    try:
        user = db.session.get(User, int(user_id))
        if user and user.expo_push_token:
            _send_expo_push_notification(user.expo_push_token, title, body, data)
        else:
            logger.debug("No Expo push token for user %s, skipping push", user_id)
    except Exception as e:
        logger.error("Error looking up push token for user %s: %s", user_id, str(e))


class NotificationService:
    """Service for managing in-app notifications."""

    # =========================================================================
    # Core Notification Methods
    # =========================================================================

    @staticmethod
    def create_notification(user_id, type, title, message, related_type=None,
                            related_id=None, priority='info', is_persistent=False,
                            action_url=None, title_ar=None, message_ar=None):
        """
        Create a notification for a user.
        Checks preferences and rules before creating.
        Emits WebSocket event on creation.

        Args:
            user_id: ID of user to notify
            type: Type of notification
            title: Notification title
            message: Notification message
            related_type: Type of related object (optional)
            related_id: ID of related object (optional)
            priority: info, warning, urgent, critical
            is_persistent: If True, notification stays visible
            action_url: URL for action button
            title_ar: Arabic title
            message_ar: Arabic message

        Returns:
            Created Notification object
        """
        # Check user preferences
        if not NotificationService._should_send_notification(user_id, type, 'push'):
            logger.debug(f"Notification skipped due to preferences: user_id={user_id} type={type}")
            return None

        # Check DND status
        if NotificationService._is_dnd_active(user_id):
            logger.debug(f"Notification queued due to DND: user_id={user_id}")
            # Queue for later delivery
            NotificationService._queue_notification(user_id, type, title, message,
                                                   related_type, related_id, priority,
                                                   is_persistent, action_url, title_ar, message_ar)
            return None

        # Apply rules
        priority, should_escalate = NotificationService._apply_rules(type, priority)

        # Auto-translate if Arabic versions not provided
        if not title_ar or not message_ar:
            try:
                from app.services.translation_service import TranslationService, is_arabic
                if not title_ar and title:
                    if is_arabic(title):
                        title_ar = title
                        title = TranslationService.translate_to_english(title) or title
                    else:
                        title_ar = TranslationService.translate_to_arabic(title)
                if not message_ar and message:
                    if is_arabic(message):
                        message_ar = message
                        message = TranslationService.translate_to_english(message) or message
                    else:
                        message_ar = TranslationService.translate_to_arabic(message)
            except Exception:
                pass  # Translation failure shouldn't block notification

        notification = Notification(
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            related_type=related_type,
            related_id=related_id,
            priority=priority,
            is_persistent=is_persistent,
            action_url=action_url,
            title_ar=title_ar,
            message_ar=message_ar
        )

        db.session.add(notification)
        db.session.commit()
        logger.debug("Notification created: id=%s user_id=%s type=%s priority=%s", notification.id, user_id, type, priority)

        # Track analytics
        NotificationService._track_notification_created(user_id, notification)

        # Emit WebSocket event
        NotificationService._emit_notification(notification)

        # Send Expo push notification (non-blocking)
        try:
            push_data = {
                'notification_id': notification.id,
                'type': type,
                'related_type': related_type,
                'related_id': related_id,
            }
            _send_expo_push_for_user(user_id, title, message, push_data)
        except Exception as e:
            logger.error("Failed to trigger Expo push for user %s: %s", user_id, str(e))

        # Auto-escalate if rules dictate
        if should_escalate:
            NotificationService._auto_escalate(notification)

        return notification

    @staticmethod
    def create_bulk_notification(user_ids, type, title, message, **kwargs):
        """
        Create notifications for multiple users at once.

        Args:
            user_ids: List of user IDs
            type: Notification type
            title: Title
            message: Message
            **kwargs: Additional fields (related_type, related_id, priority, etc.)
        """
        # Auto-translate once for all recipients
        title_ar = kwargs.get('title_ar')
        message_ar = kwargs.get('message_ar')
        if not title_ar or not message_ar:
            try:
                from app.services.translation_service import TranslationService, is_arabic
                if not title_ar and title:
                    if is_arabic(title):
                        title_ar = title
                        title = TranslationService.translate_to_english(title) or title
                    else:
                        title_ar = TranslationService.translate_to_arabic(title)
                if not message_ar and message:
                    if is_arabic(message):
                        message_ar = message
                        message = TranslationService.translate_to_english(message) or message
                    else:
                        message_ar = TranslationService.translate_to_arabic(message)
            except Exception:
                pass

        notifications = []
        for uid in user_ids:
            # Check preferences and DND for each user
            if not NotificationService._should_send_notification(uid, type, 'push'):
                continue
            if NotificationService._is_dnd_active(uid):
                NotificationService._queue_notification(uid, type, title, message,
                                                       kwargs.get('related_type'),
                                                       kwargs.get('related_id'),
                                                       kwargs.get('priority', 'info'),
                                                       kwargs.get('is_persistent', False),
                                                       kwargs.get('action_url'),
                                                       title_ar, message_ar)
                continue

            n = Notification(
                user_id=uid,
                type=type,
                title=title,
                message=message,
                related_type=kwargs.get('related_type'),
                related_id=kwargs.get('related_id'),
                priority=kwargs.get('priority', 'info'),
                is_persistent=kwargs.get('is_persistent', False),
                action_url=kwargs.get('action_url'),
                title_ar=title_ar,
                message_ar=message_ar
            )
            db.session.add(n)
            notifications.append(n)

        db.session.commit()
        logger.info("Bulk notifications sent: type=%s recipient_count=%s", type, len(notifications))

        # Emit WebSocket events and send Expo push notifications
        for n in notifications:
            NotificationService._emit_notification(n)
            # Send Expo push notification (non-blocking)
            try:
                push_data = {
                    'notification_id': n.id,
                    'type': type,
                    'related_type': kwargs.get('related_type'),
                    'related_id': kwargs.get('related_id'),
                }
                _send_expo_push_for_user(n.user_id, title, message, push_data)
            except Exception as e:
                logger.error("Failed to trigger Expo push for user %s: %s", n.user_id, str(e))

        return notifications

    @staticmethod
    def get_user_notifications(user_id, unread_only=False, priority=None):
        """
        Get notifications for a user.

        Args:
            user_id: ID of user
            unread_only: If True, return only unread notifications
            priority: Filter by priority level

        Returns:
            List of notifications
        """
        query = Notification.query.filter_by(user_id=user_id)

        # Exclude archived notifications
        archived_ids = [nid for nid, uid in _archived_notifications if uid == user_id]
        if archived_ids:
            query = query.filter(~Notification.id.in_(archived_ids))

        # Exclude snoozed notifications that are still snoozed
        now = datetime.utcnow()
        snoozed_ids = [nid for nid, (until, uid) in _snoozed_notifications.items()
                       if uid == user_id and until > now]
        if snoozed_ids:
            query = query.filter(~Notification.id.in_(snoozed_ids))

        if unread_only:
            query = query.filter_by(is_read=False)

        if priority:
            query = query.filter_by(priority=priority)

        notifications = query.order_by(Notification.created_at.desc()).all()
        return notifications

    @staticmethod
    def mark_as_read(notification_id, user_id):
        """Mark notification as read."""
        notification = db.session.get(Notification, notification_id)
        if not notification:
            raise NotFoundError(f"Notification with ID {notification_id} not found")

        if notification.user_id != int(user_id):
            raise ForbiddenError("You can only mark your own notifications as read")

        notification.is_read = True
        notification.read_at = datetime.utcnow()
        db.session.commit()

        # Track analytics
        NotificationService._track_notification_read(user_id, notification)

        # Emit unread count update
        NotificationService._emit_unread_count_update(user_id)

        return notification

    @staticmethod
    def mark_all_as_read(user_id):
        """Mark all notifications as read for a user."""
        now = datetime.utcnow()
        count = Notification.query.filter_by(
            user_id=int(user_id),
            is_read=False
        ).update({'is_read': True, 'read_at': now})

        db.session.commit()

        # Emit unread count update
        NotificationService._emit_unread_count_update(user_id)

        return count

    @staticmethod
    def get_unread_count(user_id):
        """Get count of unread notifications for a user."""
        count = Notification.query.filter_by(
            user_id=int(user_id),
            is_read=False
        ).count()

        return count

    @staticmethod
    def delete_notification(notification_id, user_id):
        """Delete a notification."""
        notification = db.session.get(Notification, notification_id)
        if not notification:
            raise NotFoundError(f"Notification with ID {notification_id} not found")

        if notification.user_id != int(user_id):
            raise ForbiddenError("You can only delete your own notifications")

        db.session.delete(notification)
        db.session.commit()

        # Emit unread count update
        NotificationService._emit_unread_count_update(user_id)

    # =========================================================================
    # Preferences Management
    # =========================================================================

    @staticmethod
    def get_user_preferences(user_id):
        """Get user's notification preferences."""
        if user_id not in _user_preferences:
            # Return default preferences
            return NotificationService._get_default_preferences()
        return _user_preferences[user_id]

    @staticmethod
    def update_user_preferences(user_id, preferences):
        """Update user's notification preferences."""
        current = _user_preferences.get(user_id, NotificationService._get_default_preferences())
        current.update(preferences)
        _user_preferences[user_id] = current
        logger.info(f"Updated preferences for user {user_id}")

    @staticmethod
    def update_single_preference(user_id, notification_type, preference):
        """Update a single notification type preference."""
        if user_id not in _user_preferences:
            _user_preferences[user_id] = NotificationService._get_default_preferences()
        _user_preferences[user_id][notification_type] = preference
        logger.info(f"Updated preference for user {user_id}: {notification_type}")

    @staticmethod
    def _get_default_preferences():
        """Get default notification preferences."""
        return {
            'inspection_assigned': {'push': True, 'email': True, 'sms': False},
            'inspection_completed': {'push': True, 'email': False, 'sms': False},
            'defect_reported': {'push': True, 'email': True, 'sms': False},
            'defect_resolved': {'push': True, 'email': False, 'sms': False},
            'job_assigned': {'push': True, 'email': True, 'sms': False},
            'job_completed': {'push': True, 'email': False, 'sms': False},
            'quality_review': {'push': True, 'email': True, 'sms': False},
            'leave_approved': {'push': True, 'email': True, 'sms': False},
            'leave_rejected': {'push': True, 'email': True, 'sms': False},
            'system_alert': {'push': True, 'email': True, 'sms': True},
            'safety_alert': {'push': True, 'email': True, 'sms': True},
        }

    @staticmethod
    def _should_send_notification(user_id, notification_type, channel):
        """Check if notification should be sent based on preferences."""
        prefs = NotificationService.get_user_preferences(user_id)
        type_prefs = prefs.get(notification_type, {'push': True, 'email': False, 'sms': False})
        return type_prefs.get(channel, True)

    # =========================================================================
    # Snooze & Schedule
    # =========================================================================

    @staticmethod
    def snooze_notification(notification_id, user_id, snooze_until):
        """Snooze a notification until specified time."""
        notification = db.session.get(Notification, notification_id)
        if not notification:
            raise NotFoundError(f"Notification with ID {notification_id} not found")

        if notification.user_id != int(user_id):
            raise ForbiddenError("You can only snooze your own notifications")

        _snoozed_notifications[notification_id] = (snooze_until, user_id)
        logger.info(f"Snoozed notification {notification_id} until {snooze_until}")
        return notification

    @staticmethod
    def cancel_snooze(notification_id, user_id):
        """Cancel snooze for a notification."""
        if notification_id in _snoozed_notifications:
            _, uid = _snoozed_notifications[notification_id]
            if uid != int(user_id):
                raise ForbiddenError("You can only cancel snooze for your own notifications")
            del _snoozed_notifications[notification_id]
            logger.info(f"Cancelled snooze for notification {notification_id}")

    @staticmethod
    def schedule_notification(notification_id, user_id, deliver_at):
        """Schedule notification for later delivery."""
        notification = db.session.get(Notification, notification_id)
        if not notification:
            raise NotFoundError(f"Notification with ID {notification_id} not found")

        if notification.user_id != int(user_id):
            raise ForbiddenError("You can only schedule your own notifications")

        _scheduled_notifications[notification_id] = (deliver_at, user_id)
        logger.info(f"Scheduled notification {notification_id} for {deliver_at}")

    # =========================================================================
    # Acknowledgment
    # =========================================================================

    @staticmethod
    def acknowledge_notification(notification_id, user_id):
        """Acknowledge a critical notification."""
        notification = db.session.get(Notification, notification_id)
        if not notification:
            raise NotFoundError(f"Notification with ID {notification_id} not found")

        if notification.user_id != int(user_id):
            raise ForbiddenError("You can only acknowledge your own notifications")

        _acknowledged_notifications.add((notification_id, user_id))
        logger.info(f"Acknowledged notification {notification_id}")

        # Track analytics
        NotificationService._track_notification_acknowledged(user_id, notification)

        return notification

    # =========================================================================
    # Bulk Operations
    # =========================================================================

    @staticmethod
    def bulk_mark_read(notification_ids, user_id):
        """Mark multiple notifications as read."""
        now = datetime.utcnow()
        count = Notification.query.filter(
            Notification.id.in_(notification_ids),
            Notification.user_id == int(user_id),
            Notification.is_read == False
        ).update({'is_read': True, 'read_at': now}, synchronize_session=False)

        db.session.commit()

        # Emit unread count update
        NotificationService._emit_unread_count_update(user_id)

        return count

    @staticmethod
    def bulk_delete(notification_ids, user_id):
        """Delete multiple notifications."""
        count = Notification.query.filter(
            Notification.id.in_(notification_ids),
            Notification.user_id == int(user_id)
        ).delete(synchronize_session=False)

        db.session.commit()

        # Emit unread count update
        NotificationService._emit_unread_count_update(user_id)

        return count

    @staticmethod
    def bulk_snooze(notification_ids, user_id, snooze_until):
        """Snooze multiple notifications."""
        count = 0
        for nid in notification_ids:
            try:
                NotificationService.snooze_notification(nid, user_id, snooze_until)
                count += 1
            except (NotFoundError, ForbiddenError):
                pass
        return count

    # =========================================================================
    # Groups & Digest
    # =========================================================================

    @staticmethod
    def get_grouped_notifications(user_id, group_by='type'):
        """Get notifications grouped by specified field."""
        query = Notification.query.filter_by(user_id=int(user_id))
        notifications = query.order_by(Notification.created_at.desc()).all()

        groups = defaultdict(list)
        for n in notifications:
            if group_by == 'type':
                key = n.type
            elif group_by == 'priority':
                key = n.priority
            elif group_by == 'date':
                key = n.created_at.strftime('%Y-%m-%d')
            else:
                key = n.type
            groups[key].append(n)

        result = []
        for key, items in groups.items():
            unread = sum(1 for n in items if not n.is_read)
            result.append({
                'id': key,
                'label': NotificationService._get_group_label(key, group_by),
                'count': len(items),
                'unread_count': unread,
                'latest': items[0].to_dict() if items else None
            })

        return result

    @staticmethod
    def expand_group(user_id, group_id):
        """Get all notifications in a group."""
        query = Notification.query.filter_by(user_id=int(user_id), type=group_id)
        return query.order_by(Notification.created_at.desc()).all()

    @staticmethod
    def get_digest(user_id, period='day'):
        """Get digest summary of notifications."""
        now = datetime.utcnow()
        if period == 'day':
            since = now - timedelta(days=1)
        elif period == 'week':
            since = now - timedelta(weeks=1)
        elif period == 'month':
            since = now - timedelta(days=30)
        else:
            since = now - timedelta(days=1)

        query = Notification.query.filter(
            Notification.user_id == int(user_id),
            Notification.created_at >= since
        )
        notifications = query.all()

        by_priority = defaultdict(int)
        by_type = defaultdict(int)
        unread = 0

        for n in notifications:
            by_priority[n.priority] += 1
            by_type[n.type] += 1
            if not n.is_read:
                unread += 1

        # Get highlights (critical and urgent)
        highlights = [n.to_dict() for n in notifications
                     if n.priority in ('critical', 'urgent') and not n.is_read][:5]

        return {
            'period': period,
            'total': len(notifications),
            'unread': unread,
            'by_priority': dict(by_priority),
            'by_type': dict(by_type),
            'highlights': highlights
        }

    @staticmethod
    def _get_group_label(key, group_by):
        """Get human-readable label for group."""
        labels = {
            'inspection_assigned': 'Inspection Assignments',
            'inspection_completed': 'Completed Inspections',
            'defect_reported': 'Reported Defects',
            'defect_resolved': 'Resolved Defects',
            'job_assigned': 'Job Assignments',
            'job_completed': 'Completed Jobs',
            'quality_review': 'Quality Reviews',
            'critical': 'Critical',
            'urgent': 'Urgent',
            'warning': 'Warning',
            'info': 'Information',
        }
        return labels.get(key, key.replace('_', ' ').title())

    # =========================================================================
    # AI Features
    # =========================================================================

    @staticmethod
    def get_ai_ranked_notifications(user_id):
        """Get AI-ranked notifications based on relevance and urgency."""
        notifications = NotificationService.get_user_notifications(user_id, unread_only=True)

        # Simple ranking based on priority and recency
        priority_weights = {'critical': 4, 'urgent': 3, 'warning': 2, 'info': 1}
        now = datetime.utcnow()

        def rank_score(n):
            priority_score = priority_weights.get(n.priority, 1)
            age_hours = (now - n.created_at).total_seconds() / 3600
            recency_score = max(0, 1 - (age_hours / 24))  # Decay over 24 hours
            return (priority_score * 0.4) + (recency_score * 0.3) + 0.3

        ranked = sorted(notifications, key=rank_score, reverse=True)

        return {
            'notifications': ranked,
            'ranking_factors': {
                'priority_weight': 0.4,
                'recency_weight': 0.3,
                'relevance_weight': 0.3
            }
        }

    @staticmethod
    def get_ai_summary(user_id):
        """Get AI-generated summary of unread notifications."""
        notifications = NotificationService.get_user_notifications(user_id, unread_only=True)

        critical_count = sum(1 for n in notifications if n.priority == 'critical')
        urgent_count = sum(1 for n in notifications if n.priority == 'urgent')

        if critical_count > 0:
            summary_text = f"You have {critical_count} critical alert(s) requiring immediate attention."
        elif urgent_count > 0:
            summary_text = f"You have {urgent_count} urgent notification(s) to review."
        elif len(notifications) > 0:
            summary_text = f"You have {len(notifications)} unread notification(s)."
        else:
            summary_text = "You're all caught up! No unread notifications."

        action_items = []
        for n in notifications[:5]:
            if n.priority in ('critical', 'urgent'):
                action_items.append({
                    'priority': 'high' if n.priority == 'critical' else 'medium',
                    'action': f"Review: {n.title}",
                    'notification_id': n.id
                })

        return {
            'text': summary_text,
            'action_items': action_items
        }

    @staticmethod
    def get_ai_predictions(user_id):
        """Get predicted notifications based on patterns."""
        # Simple prediction based on historical patterns
        # In production, this would use ML models
        return [
            {
                'type': 'inspection_due',
                'probability': 0.85,
                'expected_time': (datetime.utcnow() + timedelta(hours=4)).isoformat(),
                'context': 'Based on your inspection schedule'
            },
            {
                'type': 'report_deadline',
                'probability': 0.7,
                'expected_time': (datetime.utcnow() + timedelta(days=1)).isoformat(),
                'context': 'Weekly report typically due around this time'
            }
        ]

    @staticmethod
    def get_smart_filters(user_id):
        """Get AI-suggested smart filters based on user behavior."""
        unread_count = NotificationService.get_unread_count(user_id)
        critical_count = Notification.query.filter_by(
            user_id=int(user_id), is_read=False, priority='critical'
        ).count()

        filters = [
            {
                'id': 'all_unread',
                'label': 'All Unread',
                'query': {'is_read': False},
                'count': unread_count
            },
            {
                'id': 'high_priority_unread',
                'label': 'High Priority Unread',
                'query': {'priority': ['critical', 'urgent'], 'is_read': False},
                'count': critical_count
            },
            {
                'id': 'today',
                'label': "Today's Notifications",
                'query': {'date': 'today'},
                'count': Notification.query.filter(
                    Notification.user_id == int(user_id),
                    Notification.created_at >= datetime.utcnow().date()
                ).count()
            }
        ]

        return filters

    @staticmethod
    def ai_query(user_id, query):
        """Query notifications using natural language."""
        # Simple keyword-based parsing
        # In production, this would use NLP
        query_lower = query.lower()

        interpreted = {}
        filters = {}

        if 'critical' in query_lower:
            interpreted['priority'] = 'critical'
            filters['priority'] = 'critical'
        elif 'urgent' in query_lower:
            interpreted['priority'] = 'urgent'
            filters['priority'] = 'urgent'

        if 'last week' in query_lower or 'past week' in query_lower:
            interpreted['date_range'] = 'last_week'
            since = datetime.utcnow() - timedelta(weeks=1)
        elif 'yesterday' in query_lower:
            interpreted['date_range'] = 'yesterday'
            since = datetime.utcnow() - timedelta(days=1)
        elif 'today' in query_lower:
            interpreted['date_range'] = 'today'
            since = datetime.utcnow().replace(hour=0, minute=0, second=0)
        else:
            since = None

        # Build query
        q = Notification.query.filter_by(user_id=int(user_id))
        if filters.get('priority'):
            q = q.filter_by(priority=filters['priority'])
        if since:
            q = q.filter(Notification.created_at >= since)

        notifications = q.order_by(Notification.created_at.desc()).limit(50).all()

        return {
            'interpreted_query': interpreted,
            'notifications': notifications
        }

    @staticmethod
    def get_ai_suggestions(notification_id, user_id):
        """Get AI-suggested actions for a notification."""
        notification = db.session.get(Notification, notification_id)
        if not notification:
            raise NotFoundError(f"Notification with ID {notification_id} not found")

        if notification.user_id != int(user_id):
            raise ForbiddenError("Access denied")

        suggestions = []

        if notification.type == 'defect_reported':
            suggestions.append({
                'action': 'assign_to_specialist',
                'label': 'Assign to Specialist',
                'confidence': 0.9,
                'reason': 'Based on defect type and severity'
            })
        elif notification.type == 'inspection_assigned':
            suggestions.append({
                'action': 'view_inspection',
                'label': 'View Inspection Details',
                'confidence': 0.95,
                'reason': 'Review assignment details'
            })

        if notification.priority in ('critical', 'urgent'):
            suggestions.append({
                'action': 'acknowledge',
                'label': 'Acknowledge',
                'confidence': 0.85,
                'reason': 'High priority requires acknowledgment'
            })

        return suggestions

    @staticmethod
    def get_ai_impact(notification_id, user_id):
        """Get AI prediction of notification impact."""
        notification = db.session.get(Notification, notification_id)
        if not notification:
            raise NotFoundError(f"Notification with ID {notification_id} not found")

        if notification.user_id != int(user_id):
            raise ForbiddenError("Access denied")

        # Simple impact prediction
        impact = {
            'severity': notification.priority,
            'affected_areas': [],
            'estimated_resolution_time': '1 hour',
            'recommended_priority': notification.priority
        }

        if notification.type in ('defect_reported', 'safety_alert'):
            impact['affected_areas'].append('safety')
            impact['affected_areas'].append('production')
            impact['estimated_resolution_time'] = '2-4 hours'
        elif notification.type == 'inspection_assigned':
            impact['affected_areas'].append('compliance')
            impact['estimated_resolution_time'] = '30 minutes'

        return impact

    @staticmethod
    def get_daily_summary(user_id):
        """Get personalized daily summary of notifications."""
        user = db.session.get(User, int(user_id))
        name = user.full_name.split()[0] if user and user.full_name else 'User'

        hour = datetime.utcnow().hour
        if hour < 12:
            greeting = f"Good morning, {name}!"
        elif hour < 17:
            greeting = f"Good afternoon, {name}!"
        else:
            greeting = f"Good evening, {name}!"

        # Get yesterday's stats
        yesterday = datetime.utcnow() - timedelta(days=1)
        new_count = Notification.query.filter(
            Notification.user_id == int(user_id),
            Notification.created_at >= yesterday
        ).count()

        critical_count = Notification.query.filter(
            Notification.user_id == int(user_id),
            Notification.is_read == False,
            Notification.priority == 'critical'
        ).count()

        priorities = []
        if critical_count > 0:
            priorities.append({
                'level': 'critical',
                'count': critical_count,
                'message': f'{critical_count} critical issue(s) need your attention'
            })

        return {
            'greeting': greeting,
            'overview': f"You have {new_count} new notification(s) since yesterday.",
            'priorities': priorities,
            'trends': 'Notification volume is normal.',
            'recommendations': [
                'Review pending inspections',
                'Check for escalated items'
            ]
        }

    # =========================================================================
    # Analytics
    # =========================================================================

    @staticmethod
    def get_analytics_dashboard(user_id):
        """Get notification analytics dashboard data."""
        total = Notification.query.filter_by(user_id=int(user_id)).count()
        read = Notification.query.filter_by(user_id=int(user_id), is_read=True).count()
        read_rate = read / total if total > 0 else 0

        by_priority = {}
        for priority in ['critical', 'urgent', 'warning', 'info']:
            by_priority[priority] = Notification.query.filter_by(
                user_id=int(user_id), priority=priority
            ).count()

        return {
            'total_notifications': total,
            'read_rate': round(read_rate, 2),
            'avg_response_time_minutes': 15,  # Would be calculated from analytics
            'by_priority': by_priority,
            'by_type': {},  # Would aggregate by type
            'trends': {'direction': 'stable', 'change_percent': 0}
        }

    @staticmethod
    def get_response_time_analytics(user_id, period='week'):
        """Get response time analytics."""
        return {
            'average_minutes': 12,
            'median_minutes': 8,
            'by_priority': {
                'critical': 5,
                'urgent': 10,
                'warning': 15,
                'info': 30
            },
            'by_type': {},
            'trend': []
        }

    @staticmethod
    def get_engagement_metrics(user_id):
        """Get user engagement metrics."""
        total = Notification.query.filter_by(user_id=int(user_id)).count()
        read = Notification.query.filter_by(user_id=int(user_id), is_read=True).count()

        return {
            'read_rate': round(read / total, 2) if total > 0 else 0,
            'action_rate': 0.6,
            'dismiss_rate': 0.1,
            'avg_time_to_read': 5,
            'most_engaged_types': ['inspection_assigned', 'defect_reported']
        }

    @staticmethod
    def get_effectiveness_analytics(user_id):
        """Get notification effectiveness analytics."""
        return {
            'overall_score': 0.75,
            'by_type': {},
            'recommendations': [
                'Consider reducing low-priority notifications',
                'Critical alerts have 95% acknowledgment rate'
            ]
        }

    @staticmethod
    def get_peak_hours_analytics(user_id):
        """Get peak hours analysis."""
        return {
            'most_active_hour': 10,
            'most_active_day': 'Monday',
            'hourly_distribution': [0] * 24,
            'daily_distribution': [0] * 7
        }

    @staticmethod
    def get_escalation_report(user_id, period='week'):
        """Get escalation report."""
        return {
            'total_escalations': 5,
            'escalation_rate': 0.05,
            'by_type': {},
            'by_reason': {},
            'avg_time_to_escalate': 120
        }

    @staticmethod
    def get_sla_compliance(user_id):
        """Get SLA compliance analytics."""
        return {
            'overall_compliance': 0.92,
            'by_priority': {
                'critical': 0.95,
                'urgent': 0.90,
                'warning': 0.85,
                'info': 0.98
            },
            'breaches': [],
            'at_risk': []
        }

    @staticmethod
    def get_load_distribution(user_id):
        """Get load distribution analytics."""
        queue = Notification.query.filter_by(user_id=int(user_id), is_read=False).count()

        return {
            'current_queue': queue,
            'processing_rate': 10,
            'backlog_trend': 'decreasing' if queue < 10 else 'stable',
            'estimated_clear_time': f"{max(1, queue // 10)} hour(s)"
        }

    # =========================================================================
    # Escalation
    # =========================================================================

    @staticmethod
    def escalate_notification(notification_id, user_id, reason=None, escalate_to=None):
        """Manually escalate a notification."""
        notification = db.session.get(Notification, notification_id)
        if not notification:
            raise NotFoundError(f"Notification with ID {notification_id} not found")

        escalation_id = len(_notification_escalations) + 1
        escalation = {
            'id': escalation_id,
            'notification_id': notification_id,
            'escalated_by': user_id,
            'escalate_to': escalate_to,
            'reason': reason,
            'status': 'pending',
            'created_at': datetime.utcnow().isoformat()
        }

        _notification_escalations[escalation_id] = escalation
        logger.info(f"Escalated notification {notification_id}")

        return escalation

    @staticmethod
    def get_escalations(user_id, status=None, period='week'):
        """Get escalation history."""
        escalations = list(_notification_escalations.values())

        if status:
            escalations = [e for e in escalations if e['status'] == status]

        return escalations

    @staticmethod
    def acknowledge_escalation(escalation_id, user_id):
        """Acknowledge an escalation."""
        if escalation_id not in _notification_escalations:
            raise NotFoundError(f"Escalation with ID {escalation_id} not found")

        _notification_escalations[escalation_id]['status'] = 'acknowledged'
        _notification_escalations[escalation_id]['acknowledged_by'] = user_id
        _notification_escalations[escalation_id]['acknowledged_at'] = datetime.utcnow().isoformat()

        logger.info(f"Acknowledged escalation {escalation_id}")

    # =========================================================================
    # Rules Management
    # =========================================================================

    @staticmethod
    def get_rules():
        """Get all notification rules."""
        return _notification_rules

    @staticmethod
    def create_rule(data):
        """Create a notification rule."""
        rule_id = len(_notification_rules) + 1
        rule = {
            'id': rule_id,
            'name': data.get('name'),
            'conditions': data.get('conditions', {}),
            'actions': data.get('actions', {}),
            'is_active': True,
            'created_at': datetime.utcnow().isoformat()
        }
        _notification_rules.append(rule)
        logger.info(f"Created notification rule: {rule['name']}")
        return rule

    @staticmethod
    def update_rule(rule_id, data):
        """Update a notification rule."""
        for rule in _notification_rules:
            if rule['id'] == rule_id:
                rule.update(data)
                rule['updated_at'] = datetime.utcnow().isoformat()
                return rule
        raise NotFoundError(f"Rule with ID {rule_id} not found")

    @staticmethod
    def delete_rule(rule_id):
        """Delete a notification rule."""
        global _notification_rules
        _notification_rules = [r for r in _notification_rules if r['id'] != rule_id]
        logger.info(f"Deleted notification rule {rule_id}")

    @staticmethod
    def toggle_rule(rule_id):
        """Toggle rule active status."""
        for rule in _notification_rules:
            if rule['id'] == rule_id:
                rule['is_active'] = not rule['is_active']
                return rule
        raise NotFoundError(f"Rule with ID {rule_id} not found")

    @staticmethod
    def _apply_rules(notification_type, priority):
        """Apply rules to determine final priority and if escalation is needed."""
        should_escalate = False
        for rule in _notification_rules:
            if not rule.get('is_active'):
                continue
            conditions = rule.get('conditions', {})
            actions = rule.get('actions', {})

            # Check if rule matches
            if conditions.get('type') and notification_type not in conditions['type']:
                continue
            if conditions.get('priority') and priority != conditions['priority']:
                continue

            # Apply actions
            if actions.get('upgrade_priority'):
                priority = actions['upgrade_priority']
            if actions.get('escalate'):
                should_escalate = True

        return priority, should_escalate

    # =========================================================================
    # Templates Management
    # =========================================================================

    @staticmethod
    def get_templates():
        """Get all notification templates."""
        if not _notification_templates:
            # Return default templates
            return [
                {
                    'type': 'inspection_assigned',
                    'title_template': 'New Inspection Assigned: {equipment_name}',
                    'message_template': 'You have been assigned to inspect {equipment_name}. Due date: {due_date}',
                    'channels': ['push', 'email']
                },
                {
                    'type': 'defect_reported',
                    'title_template': 'Defect Reported: {defect_type}',
                    'message_template': 'A {severity} defect has been reported on {equipment_name}.',
                    'channels': ['push', 'email']
                },
                {
                    'type': 'job_assigned',
                    'title_template': 'New Job Assigned: {job_type}',
                    'message_template': 'You have been assigned a new {job_type} job.',
                    'channels': ['push', 'email']
                }
            ]
        return list(_notification_templates.values())

    @staticmethod
    def update_template(notification_type, data):
        """Update a notification template."""
        _notification_templates[notification_type] = {
            'type': notification_type,
            **data,
            'updated_at': datetime.utcnow().isoformat()
        }
        return _notification_templates[notification_type]

    # =========================================================================
    # Archive
    # =========================================================================

    @staticmethod
    def archive_notification(notification_id, user_id):
        """Archive a notification."""
        notification = db.session.get(Notification, notification_id)
        if not notification:
            raise NotFoundError(f"Notification with ID {notification_id} not found")

        if notification.user_id != int(user_id):
            raise ForbiddenError("You can only archive your own notifications")

        _archived_notifications.add((notification_id, user_id))
        logger.info(f"Archived notification {notification_id}")

    @staticmethod
    def get_archived_notifications(user_id):
        """Get archived notifications for a user."""
        archived_ids = [nid for nid, uid in _archived_notifications if uid == int(user_id)]
        if not archived_ids:
            return Notification.query.filter(False)  # Empty query

        return Notification.query.filter(
            Notification.id.in_(archived_ids),
            Notification.user_id == int(user_id)
        ).order_by(Notification.created_at.desc())

    @staticmethod
    def unarchive_notification(notification_id, user_id):
        """Restore notification from archive."""
        key = (notification_id, int(user_id))
        if key not in _archived_notifications:
            raise NotFoundError(f"Archived notification with ID {notification_id} not found")

        _archived_notifications.discard(key)
        logger.info(f"Unarchived notification {notification_id}")

    # =========================================================================
    # Do Not Disturb
    # =========================================================================

    @staticmethod
    def get_dnd_status(user_id):
        """Get DND status for user."""
        if user_id not in _user_dnd_settings:
            return {
                'enabled': False,
                'until': None,
                'schedule': None
            }
        return _user_dnd_settings[user_id]

    @staticmethod
    def set_dnd(user_id, enabled=True, until=None, schedule=None):
        """Set DND for user."""
        dnd_settings = {
            'enabled': enabled,
            'until': until,
            'schedule': schedule
        }
        _user_dnd_settings[user_id] = dnd_settings
        logger.info(f"Set DND for user {user_id}: {dnd_settings}")
        return dnd_settings

    @staticmethod
    def clear_dnd(user_id):
        """Clear DND for user."""
        if user_id in _user_dnd_settings:
            del _user_dnd_settings[user_id]
        logger.info(f"Cleared DND for user {user_id}")

    @staticmethod
    def _is_dnd_active(user_id):
        """Check if DND is currently active for user."""
        if user_id not in _user_dnd_settings:
            return False

        dnd = _user_dnd_settings[user_id]
        if not dnd.get('enabled'):
            return False

        now = datetime.utcnow()

        # Check until time
        if dnd.get('until'):
            until = datetime.fromisoformat(dnd['until'].replace('Z', '+00:00'))
            if now < until:
                return True
            else:
                # DND expired, clear it
                NotificationService.clear_dnd(user_id)
                return False

        # Check schedule
        if dnd.get('schedule'):
            schedule = dnd['schedule']
            current_time = now.strftime('%H:%M')
            start = schedule.get('start', '22:00')
            end = schedule.get('end', '07:00')

            if start < end:
                return start <= current_time <= end
            else:  # Overnight schedule
                return current_time >= start or current_time <= end

        return dnd.get('enabled', False)

    # =========================================================================
    # Internal Helpers
    # =========================================================================

    @staticmethod
    def _queue_notification(user_id, type, title, message, related_type, related_id,
                           priority, is_persistent, action_url, title_ar, message_ar):
        """Queue notification for later delivery (when DND ends)."""
        # In production, this would add to a persistent queue
        logger.debug(f"Queued notification for user {user_id} during DND")

    @staticmethod
    def _auto_escalate(notification):
        """Auto-escalate notification based on rules."""
        NotificationService.escalate_notification(
            notification_id=notification.id,
            user_id=notification.user_id,
            reason='Auto-escalated by rule'
        )

    @staticmethod
    def _emit_notification(notification):
        """Emit WebSocket event for new notification."""
        if _socketio is None:
            return

        try:
            from app.api.notifications_ws import emit_notification
            emit_notification(_socketio, notification)
        except Exception as e:
            logger.error(f"Error emitting notification: {e}")

    @staticmethod
    def _emit_unread_count_update(user_id):
        """Emit unread count update via WebSocket."""
        if _socketio is None:
            return

        try:
            from app.api.notifications_ws import emit_unread_count_update
            count = NotificationService.get_unread_count(int(user_id))
            emit_unread_count_update(_socketio, int(user_id), count)
        except Exception as e:
            logger.error(f"Error emitting unread count: {e}")

    @staticmethod
    def _track_notification_created(user_id, notification):
        """Track notification creation for analytics."""
        _notification_analytics[user_id].append({
            'event': 'created',
            'notification_id': notification.id,
            'type': notification.type,
            'priority': notification.priority,
            'timestamp': datetime.utcnow().isoformat()
        })

    @staticmethod
    def _track_notification_read(user_id, notification):
        """Track notification read for analytics."""
        _notification_analytics[user_id].append({
            'event': 'read',
            'notification_id': notification.id,
            'type': notification.type,
            'time_to_read': (datetime.utcnow() - notification.created_at).total_seconds(),
            'timestamp': datetime.utcnow().isoformat()
        })

    @staticmethod
    def _track_notification_acknowledged(user_id, notification):
        """Track notification acknowledgment for analytics."""
        _notification_analytics[user_id].append({
            'event': 'acknowledged',
            'notification_id': notification.id,
            'type': notification.type,
            'priority': notification.priority,
            'timestamp': datetime.utcnow().isoformat()
        })
