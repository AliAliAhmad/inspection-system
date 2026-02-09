"""
NotificationAnalytics model for tracking notification engagement.
Captures delivery, read, click, and action metrics.
"""

from app.extensions import db
from datetime import datetime


class NotificationAnalytics(db.Model):
    """
    Analytics tracking for notifications.
    Measures engagement and response times.
    """
    __tablename__ = 'notification_analytics'

    id = db.Column(db.Integer, primary_key=True)
    notification_id = db.Column(db.Integer, db.ForeignKey('notifications.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Delivery timestamp
    delivered_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    # Engagement timestamps
    read_at = db.Column(db.DateTime, nullable=True)
    clicked_at = db.Column(db.DateTime, nullable=True)

    # Action taken: 'approved', 'rejected', 'navigated', 'dismissed'
    action_taken = db.Column(db.String(50), nullable=True)
    action_taken_at = db.Column(db.DateTime, nullable=True)

    # Response time in seconds (from delivery to action)
    response_time_seconds = db.Column(db.Integer, nullable=True)

    # Channel that delivered this notification: 'in_app', 'email', 'sms', 'push'
    channel = db.Column(db.String(20), nullable=False)

    # Relationships
    notification = db.relationship('Notification', backref='analytics')
    user = db.relationship('User', backref='notification_analytics')

    # Indexes and constraints
    __table_args__ = (
        db.Index('ix_notification_analytics_notification', 'notification_id'),
        db.Index('ix_notification_analytics_user_delivered', 'user_id', 'delivered_at'),
        db.Index('ix_notification_analytics_channel', 'channel'),
        db.CheckConstraint(
            "channel IN ('in_app', 'email', 'sms', 'push')",
            name='check_valid_analytics_channel'
        ),
        db.CheckConstraint(
            "action_taken IN ('approved', 'rejected', 'navigated', 'dismissed') OR action_taken IS NULL",
            name='check_valid_action_taken'
        ),
    )

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'notification_id': self.notification_id,
            'user_id': self.user_id,
            'delivered_at': self.delivered_at.isoformat() if self.delivered_at else None,
            'read_at': self.read_at.isoformat() if self.read_at else None,
            'clicked_at': self.clicked_at.isoformat() if self.clicked_at else None,
            'action_taken': self.action_taken,
            'action_taken_at': self.action_taken_at.isoformat() if self.action_taken_at else None,
            'response_time_seconds': self.response_time_seconds,
            'channel': self.channel
        }

    def __repr__(self):
        return f'<NotificationAnalytics {self.id} for Notification:{self.notification_id}>'
