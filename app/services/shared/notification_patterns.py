"""
Reusable notification patterns for consistent messaging across modules.
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum


class NotificationPriority(Enum):
    LOW = 'low'
    NORMAL = 'normal'
    HIGH = 'high'
    URGENT = 'urgent'


@dataclass
class NotificationTemplate:
    """Template for consistent notifications."""
    type: str
    title_template: str
    message_template: str
    priority: NotificationPriority = NotificationPriority.NORMAL
    channels: List[str] = None  # ['push', 'email', 'sms', 'in_app']

    def __post_init__(self):
        if self.channels is None:
            self.channels = ['in_app', 'push']


class NotificationPatterns:
    """
    Centralized notification patterns used across all modules.
    Ensures consistent messaging and reduces duplication.
    """

    # Pre-defined templates for common scenarios
    TEMPLATES = {
        # Defect notifications
        'defect_created': NotificationTemplate(
            type='defect_created',
            title_template='New Defect: {severity}',
            message_template='Defect #{id} assigned to you: {description}. Due: {due_date}',
            priority=NotificationPriority.HIGH,
        ),
        'defect_recurring': NotificationTemplate(
            type='defect_recurring',
            title_template='Recurring Defect (x{count})',
            message_template='Defect #{id} found again on {equipment}. Occurrence #{count}.',
            priority=NotificationPriority.URGENT,
        ),
        'defect_escalated': NotificationTemplate(
            type='defect_escalated',
            title_template='Defect Escalated',
            message_template='Defect #{id} escalated: {reason}. New priority: {priority}.',
            priority=NotificationPriority.URGENT,
            channels=['in_app', 'push', 'email'],
        ),
        'defect_resolved': NotificationTemplate(
            type='defect_resolved',
            title_template='Defect Resolved',
            message_template='{resolver} resolved defect #{id}: {description}',
            priority=NotificationPriority.NORMAL,
        ),

        # Overdue notifications
        'overdue_reminder': NotificationTemplate(
            type='overdue_reminder',
            title_template='Due Tomorrow: {item_type}',
            message_template='{item_description} is due tomorrow. Please complete on time.',
            priority=NotificationPriority.NORMAL,
        ),
        'overdue_warning': NotificationTemplate(
            type='overdue_warning',
            title_template='Overdue: {item_type}',
            message_template='{item_description} is {days} day(s) overdue. Please complete immediately.',
            priority=NotificationPriority.HIGH,
        ),
        'overdue_critical': NotificationTemplate(
            type='overdue_critical',
            title_template='Critical Overdue: {item_type}',
            message_template='{item_description} is {days} days overdue. Escalated to management.',
            priority=NotificationPriority.URGENT,
            channels=['in_app', 'push', 'email', 'sms'],
        ),

        # Performance notifications
        'achievement_unlocked': NotificationTemplate(
            type='achievement_unlocked',
            title_template='Achievement Unlocked!',
            message_template='You earned "{achievement_name}": {description}. +{points} points!',
            priority=NotificationPriority.NORMAL,
        ),
        'streak_milestone': NotificationTemplate(
            type='streak_milestone',
            title_template='Streak Milestone!',
            message_template='Amazing! You\'ve maintained a {days}-day streak. Keep going!',
            priority=NotificationPriority.NORMAL,
        ),
        'level_up': NotificationTemplate(
            type='level_up',
            title_template='Level Up!',
            message_template='Congratulations! You\'ve reached level {level} ({tier} tier).',
            priority=NotificationPriority.NORMAL,
        ),
        'rank_change': NotificationTemplate(
            type='rank_change',
            title_template='Rank Change',
            message_template='Your rank changed from #{old_rank} to #{new_rank} on the leaderboard.',
            priority=NotificationPriority.LOW,
        ),

        # Daily Review notifications
        'review_ready': NotificationTemplate(
            type='review_ready',
            title_template='Daily Review Ready',
            message_template='Your shift review is ready. {completed}/{total} jobs completed.',
            priority=NotificationPriority.NORMAL,
        ),
        'rating_received': NotificationTemplate(
            type='rating_received',
            title_template='Rating Received',
            message_template='You received a {rating}/5 QC rating for job {job_id}. {feedback}',
            priority=NotificationPriority.NORMAL,
        ),
        'rating_disputed': NotificationTemplate(
            type='rating_disputed',
            title_template='Rating Dispute',
            message_template='{worker} disputed their rating on job {job_id}: {reason}',
            priority=NotificationPriority.HIGH,
        ),

        # Report notifications
        'report_ready': NotificationTemplate(
            type='report_ready',
            title_template='Report Ready',
            message_template='Your {report_type} report is ready for download.',
            priority=NotificationPriority.LOW,
        ),
        'anomaly_detected': NotificationTemplate(
            type='anomaly_detected',
            title_template='Anomaly Detected',
            message_template='Unusual pattern detected in {metric}: {description}',
            priority=NotificationPriority.HIGH,
        ),
    }

    @classmethod
    def get_template(cls, template_key: str) -> Optional[NotificationTemplate]:
        """Get a notification template by key."""
        return cls.TEMPLATES.get(template_key)

    @classmethod
    def format_notification(
        cls,
        template_key: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Format a notification using a template.

        Args:
            template_key: Key of the template to use
            **kwargs: Values to fill in the template

        Returns:
            Dict with formatted title, message, and metadata
        """
        template = cls.get_template(template_key)
        if not template:
            return {
                'title': kwargs.get('title', 'Notification'),
                'message': kwargs.get('message', ''),
                'type': template_key,
                'priority': NotificationPriority.NORMAL.value,
                'channels': ['in_app'],
            }

        return {
            'type': template.type,
            'title': template.title_template.format(**kwargs),
            'message': template.message_template.format(**kwargs),
            'priority': template.priority.value,
            'channels': template.channels,
        }

    @classmethod
    def send_notification(
        cls,
        user_id: int,
        template_key: str,
        related_type: str = None,
        related_id: int = None,
        **kwargs
    ) -> bool:
        """
        Send a notification using a template.

        Args:
            user_id: User to notify
            template_key: Template key
            related_type: Type of related entity
            related_id: ID of related entity
            **kwargs: Template variables

        Returns:
            True if notification was created
        """
        from app.services.notification_service import NotificationService

        formatted = cls.format_notification(template_key, **kwargs)

        return NotificationService.create_notification(
            user_id=user_id,
            type=formatted['type'],
            title=formatted['title'],
            message=formatted['message'],
            priority=formatted['priority'],
            related_type=related_type,
            related_id=related_id,
        )

    @classmethod
    def send_bulk_notification(
        cls,
        user_ids: List[int],
        template_key: str,
        related_type: str = None,
        related_id: int = None,
        **kwargs
    ) -> int:
        """
        Send notification to multiple users.

        Returns:
            Number of notifications sent
        """
        count = 0
        for user_id in user_ids:
            if cls.send_notification(
                user_id=user_id,
                template_key=template_key,
                related_type=related_type,
                related_id=related_id,
                **kwargs
            ):
                count += 1
        return count

    @classmethod
    def send_cascade_notification(
        cls,
        user_hierarchy: List[int],
        template_key: str,
        delay_minutes: int = 0,
        **kwargs
    ) -> None:
        """
        Send cascading notifications (e.g., inspector -> engineer -> admin).

        Args:
            user_hierarchy: List of user IDs in escalation order
            template_key: Template to use
            delay_minutes: Delay between each level (0 = immediate all)
            **kwargs: Template variables
        """
        from app.services.notification_service import NotificationService

        for i, user_id in enumerate(user_hierarchy):
            if delay_minutes > 0 and i > 0:
                # Schedule for later (would need scheduler integration)
                NotificationService.schedule_notification(
                    user_id=user_id,
                    delay_minutes=delay_minutes * i,
                    **cls.format_notification(template_key, **kwargs)
                )
            else:
                cls.send_notification(user_id, template_key, **kwargs)
