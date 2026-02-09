"""
NotificationGroup model for grouped and batched notifications.
Combines similar or related notifications into digests.
"""

from app.extensions import db
from datetime import datetime


class NotificationGroup(db.Model):
    """
    Groups related notifications together.
    Used for batching similar notifications into digests.
    """
    __tablename__ = 'notification_groups'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Group key (e.g., 'equipment_123_alerts', 'daily_digest_2025-02-09')
    group_key = db.Column(db.String(200), nullable=False)

    # Group type: 'similar', 'related', 'digest'
    group_type = db.Column(db.String(50), nullable=False)

    # List of notification IDs in this group
    notification_ids = db.Column(db.JSON, nullable=False, default=list)

    # Summary content
    summary_title = db.Column(db.String(500), nullable=False)
    summary_title_ar = db.Column(db.String(500), nullable=True)
    summary_message = db.Column(db.Text, nullable=True)
    summary_message_ar = db.Column(db.Text, nullable=True)

    # Whether the user has expanded this group
    is_expanded = db.Column(db.Boolean, default=False)

    # Timestamp
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship('User', backref='notification_groups')

    # Constraints and indexes
    __table_args__ = (
        db.Index('ix_notification_groups_user', 'user_id'),
        db.Index('ix_notification_groups_key', 'group_key'),
        db.Index('ix_notification_groups_user_key', 'user_id', 'group_key'),
        db.CheckConstraint(
            "group_type IN ('similar', 'related', 'digest')",
            name='check_valid_group_type'
        ),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'group_key': self.group_key,
            'group_type': self.group_type,
            'notification_ids': self.notification_ids,
            'notification_count': len(self.notification_ids) if self.notification_ids else 0,
            'summary_title': self.summary_title_ar if language == 'ar' and self.summary_title_ar else self.summary_title,
            'summary_message': self.summary_message_ar if language == 'ar' and self.summary_message_ar else self.summary_message,
            'is_expanded': self.is_expanded,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def add_notification(self, notification_id):
        """Add a notification to this group."""
        if self.notification_ids is None:
            self.notification_ids = []
        if notification_id not in self.notification_ids:
            self.notification_ids = self.notification_ids + [notification_id]

    def __repr__(self):
        return f'<NotificationGroup {self.group_key} ({len(self.notification_ids or [])} notifications)>'
