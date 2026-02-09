"""
NotificationEscalation model for tracking escalation chains.
Manages notification escalation when users don't respond.
"""

from app.extensions import db
from datetime import datetime


class NotificationEscalation(db.Model):
    """
    Tracks escalation of notifications through the chain.
    Used when notifications require timely acknowledgment.
    """
    __tablename__ = 'notification_escalations'

    id = db.Column(db.Integer, primary_key=True)
    notification_id = db.Column(db.Integer, db.ForeignKey('notifications.id'), nullable=False)

    # Escalation level (1, 2, 3, etc.)
    escalation_level = db.Column(db.Integer, nullable=False, default=1)

    # Who the notification was escalated to
    escalated_to_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # When the escalation happened
    escalated_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # When the escalation was acknowledged (null if not yet acknowledged)
    acknowledged_at = db.Column(db.DateTime, nullable=True)

    # Reason for escalation: 'unread_timeout', 'manual', 'critical_priority'
    escalation_reason = db.Column(db.String(50), nullable=False)

    # Relationships
    notification = db.relationship('Notification', backref='escalations')
    escalated_to_user = db.relationship('User', backref='received_escalations')

    # Constraints
    __table_args__ = (
        db.Index('ix_notification_escalations_notification', 'notification_id'),
        db.Index('ix_notification_escalations_user', 'escalated_to_user_id'),
        db.CheckConstraint(
            "escalation_reason IN ('unread_timeout', 'manual', 'critical_priority')",
            name='check_valid_escalation_reason'
        ),
    )

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'notification_id': self.notification_id,
            'escalation_level': self.escalation_level,
            'escalated_to_user_id': self.escalated_to_user_id,
            'escalated_at': self.escalated_at.isoformat() if self.escalated_at else None,
            'acknowledged_at': self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            'escalation_reason': self.escalation_reason
        }

    def __repr__(self):
        return f'<NotificationEscalation Level:{self.escalation_level} for Notification:{self.notification_id}>'
