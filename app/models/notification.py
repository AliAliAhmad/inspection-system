"""
Notification model for in-app notifications.
Enhanced with priority levels, scheduling, escalation, and grouping support.
"""

from app.extensions import db
from datetime import datetime


class Notification(db.Model):
    """
    In-app notifications for users.
    Supports 30+ notification types with priority levels, scheduling,
    escalation chains, grouping, and multi-channel delivery.
    """
    __tablename__ = 'notifications'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    title_ar = db.Column(db.String(200), nullable=True)
    message = db.Column(db.Text, nullable=False)
    message_ar = db.Column(db.Text, nullable=True)
    related_type = db.Column(db.String(50), nullable=True)
    related_id = db.Column(db.Integer, nullable=True)

    # Priority: info, warning, urgent, critical
    priority = db.Column(db.String(20), default='info')
    # Persistent notifications cannot be dismissed until action is taken
    is_persistent = db.Column(db.Boolean, default=False)
    # URL for action button
    action_url = db.Column(db.String(500), nullable=True)

    is_read = db.Column(db.Boolean, default=False)
    read_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    # === NEW FIELDS FOR ENHANCED NOTIFICATION SYSTEM ===

    # Snooze and scheduling
    snoozed_until = db.Column(db.DateTime, nullable=True)
    scheduled_for = db.Column(db.DateTime, nullable=True, index=True)

    # Auto-expiration
    expires_at = db.Column(db.DateTime, nullable=True, index=True)

    # Acknowledgment tracking
    acknowledged_at = db.Column(db.DateTime, nullable=True)
    requires_acknowledgment = db.Column(db.Boolean, default=False)

    # Source tracking: 'system', 'ai', 'rule', 'manual', 'escalation'
    source_type = db.Column(db.String(20), default='system')

    # Grouping support
    group_id = db.Column(db.Integer, db.ForeignKey('notification_groups.id'), nullable=True)

    # Escalation chain (self-reference)
    parent_notification_id = db.Column(db.Integer, db.ForeignKey('notifications.id'), nullable=True)

    # Extra context data as JSON
    extra_data = db.Column(db.JSON, nullable=True)

    # Delivery status: 'pending', 'delivered', 'failed', 'snoozed', 'scheduled'
    delivery_status = db.Column(db.String(20), default='pending')

    # Channel that delivered this notification: 'in_app', 'email', 'sms', 'push'
    channel = db.Column(db.String(20), nullable=True)

    # Relationships
    user = db.relationship('User', backref='notifications')
    group = db.relationship('NotificationGroup', backref='notifications', foreign_keys=[group_id])
    parent_notification = db.relationship('Notification', remote_side=[id], backref='child_notifications')

    __table_args__ = (
        db.CheckConstraint(
            "priority IN ('info', 'warning', 'urgent', 'critical')",
            name='check_valid_notification_priority'
        ),
        db.CheckConstraint(
            "source_type IN ('system', 'ai', 'rule', 'manual', 'escalation')",
            name='check_valid_source_type'
        ),
        db.CheckConstraint(
            "delivery_status IN ('pending', 'delivered', 'failed', 'snoozed', 'scheduled')",
            name='check_valid_delivery_status'
        ),
        db.CheckConstraint(
            "channel IN ('in_app', 'email', 'sms', 'push') OR channel IS NULL",
            name='check_valid_notification_channel'
        ),
        db.Index('ix_notifications_user_delivery_status', 'user_id', 'delivery_status'),
        db.Index('ix_notifications_expires_at', 'expires_at'),
        db.Index('ix_notifications_scheduled_for', 'scheduled_for'),
    )

    def to_dict(self, language='en'):
        """Convert notification to dictionary."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'type': self.type,
            'title': self.title_ar if language == 'ar' and self.title_ar else self.title,
            'message': self.message_ar if language == 'ar' and self.message_ar else self.message,
            'related_type': self.related_type,
            'related_id': self.related_id,
            'priority': self.priority,
            'is_persistent': self.is_persistent,
            'action_url': self.action_url,
            'is_read': self.is_read,
            'read_at': self.read_at.isoformat() if self.read_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            # New fields
            'snoozed_until': self.snoozed_until.isoformat() if self.snoozed_until else None,
            'scheduled_for': self.scheduled_for.isoformat() if self.scheduled_for else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'acknowledged_at': self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            'requires_acknowledgment': self.requires_acknowledgment,
            'source_type': self.source_type,
            'group_id': self.group_id,
            'parent_notification_id': self.parent_notification_id,
            'extra_data': self.extra_data,
            'delivery_status': self.delivery_status,
            'channel': self.channel
        }

    def __repr__(self):
        return f'<Notification {self.type} for User:{self.user_id}>'
