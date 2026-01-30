"""
Service for managing notifications.
Supports priority levels and persistent notifications.
"""

import logging
from app.models import Notification, User
from app.extensions import db
from app.exceptions.api_exceptions import NotFoundError, ForbiddenError
from datetime import datetime

logger = logging.getLogger(__name__)


class NotificationService:
    """Service for managing in-app notifications."""

    @staticmethod
    def create_notification(user_id, type, title, message, related_type=None,
                            related_id=None, priority='info', is_persistent=False,
                            action_url=None, title_ar=None, message_ar=None):
        """
        Create a notification for a user.

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
        logger.info("Bulk notifications sent: type=%s recipient_count=%s", type, len(user_ids))
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
