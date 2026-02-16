"""
NotificationSchedule model for scheduled and snoozed notifications.
Handles delayed delivery and snooze functionality.
"""

from app.extensions import db
from datetime import datetime


class NotificationSchedule(db.Model):
    """
    Tracks scheduled and snoozed notifications.
    Used to deliver notifications at a future time.
    """
    __tablename__ = 'notification_schedules'

    id = db.Column(db.Integer, primary_key=True)
    notification_id = db.Column(db.Integer, db.ForeignKey('notifications.id'), nullable=False)

    # When to deliver the notification
    scheduled_for = db.Column(db.DateTime, nullable=True)

    # When the notification is snoozed until
    snooze_until = db.Column(db.DateTime, nullable=True, index=True)

    # Whether the notification has been delivered
    is_delivered = db.Column(db.Boolean, default=False)

    # Timestamp
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    notification = db.relationship('Notification', backref='schedules')

    # Indexes
    __table_args__ = (
        db.Index('ix_notification_schedules_pending', 'is_delivered', 'scheduled_for'),
    )

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'notification_id': self.notification_id,
            'scheduled_for': self.scheduled_for.isoformat() if self.scheduled_for else None,
            'snooze_until': self.snooze_until.isoformat() if self.snooze_until else None,
            'is_delivered': self.is_delivered,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<NotificationSchedule {self.id} for Notification:{self.notification_id}>'
