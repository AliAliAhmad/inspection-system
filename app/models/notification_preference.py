"""
NotificationPreference model for user notification settings.
Allows users to customize notification delivery per type.
"""

from app.extensions import db
from datetime import datetime


class NotificationPreference(db.Model):
    """
    User preferences for each notification type.
    Controls channels, sounds, and delivery timing.
    """
    __tablename__ = 'notification_preferences'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Notification type (e.g., 'equipment_status_change', 'inspection_submitted')
    notification_type = db.Column(db.String(100), nullable=False)

    # Channel preferences as JSON: {'in_app': True, 'email': True, 'sms': False, 'push': True}
    channels = db.Column(db.JSON, nullable=False, default=dict)

    # Master toggle for this notification type
    is_enabled = db.Column(db.Boolean, default=True)

    # Sound preference: 'default', 'chime', 'urgent', 'silent'
    sound_type = db.Column(db.String(20), default='default')

    # Do Not Disturb window
    do_not_disturb_start = db.Column(db.Time, nullable=True)  # e.g., 22:00
    do_not_disturb_end = db.Column(db.Time, nullable=True)    # e.g., 07:00

    # Digest mode: 'instant', 'hourly', 'daily', 'weekly'
    digest_mode = db.Column(db.String(20), default='instant')

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship('User', backref='notification_preferences')

    # Constraints and indexes
    __table_args__ = (
        db.UniqueConstraint('user_id', 'notification_type', name='unique_user_notification_type'),
        db.Index('ix_notification_preferences_user_type', 'user_id', 'notification_type'),
        db.CheckConstraint(
            "sound_type IN ('default', 'chime', 'urgent', 'silent')",
            name='check_valid_sound_type'
        ),
        db.CheckConstraint(
            "digest_mode IN ('instant', 'hourly', 'daily', 'weekly')",
            name='check_valid_digest_mode'
        ),
    )

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'notification_type': self.notification_type,
            'channels': self.channels,
            'is_enabled': self.is_enabled,
            'sound_type': self.sound_type,
            'do_not_disturb_start': self.do_not_disturb_start.strftime('%H:%M') if self.do_not_disturb_start else None,
            'do_not_disturb_end': self.do_not_disturb_end.strftime('%H:%M') if self.do_not_disturb_end else None,
            'digest_mode': self.digest_mode,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def __repr__(self):
        return f'<NotificationPreference {self.notification_type} for User:{self.user_id}>'
