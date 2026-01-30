"""
Notification model for in-app notifications.
Enhanced with priority levels and persistent notifications.
"""

from app.extensions import db
from datetime import datetime


class Notification(db.Model):
    """
    In-app notifications for users.
    Supports 30+ notification types with priority levels.
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

    # Relationships
    user = db.relationship('User', backref='notifications')

    __table_args__ = (
        db.CheckConstraint(
            "priority IN ('info', 'warning', 'urgent', 'critical')",
            name='check_valid_notification_priority'
        ),
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
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<Notification {self.type} for User:{self.user_id}>'
