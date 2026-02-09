"""
NotificationRule model for rule-based notification triggers.
Enables automated notifications based on conditions and thresholds.
"""

from app.extensions import db
from datetime import datetime


class NotificationRule(db.Model):
    """
    Rule-based notification triggers.
    Allows admins to create custom notification rules.
    """
    __tablename__ = 'notification_rules'

    id = db.Column(db.Integer, primary_key=True)

    # Rule name (bilingual)
    name = db.Column(db.String(200), nullable=False)
    name_ar = db.Column(db.String(200), nullable=True)

    # Trigger type: 'threshold', 'condition', 'schedule'
    trigger_type = db.Column(db.String(50), nullable=False)

    # Trigger configuration (conditions and thresholds)
    # Example: {"field": "defect_count", "operator": ">=", "value": 5}
    trigger_config = db.Column(db.JSON, nullable=False, default=dict)

    # Action configuration (what to do when triggered)
    # Example: {"notification_type": "high_defect_alert", "priority": "urgent"}
    action_config = db.Column(db.JSON, nullable=False, default=dict)

    # Target users (user IDs or role names)
    # Example: ["admin", "engineer"] or [1, 2, 3]
    target_users = db.Column(db.JSON, nullable=False, default=list)

    # Whether this rule is active
    is_active = db.Column(db.Boolean, default=True)

    # Who created this rule
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    created_by = db.relationship('User', backref='created_notification_rules')

    # Constraints
    __table_args__ = (
        db.Index('ix_notification_rules_active', 'is_active'),
        db.Index('ix_notification_rules_trigger_type', 'trigger_type'),
        db.CheckConstraint(
            "trigger_type IN ('threshold', 'condition', 'schedule')",
            name='check_valid_trigger_type'
        ),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'name': self.name_ar if language == 'ar' and self.name_ar else self.name,
            'name_en': self.name,
            'name_ar': self.name_ar,
            'trigger_type': self.trigger_type,
            'trigger_config': self.trigger_config,
            'action_config': self.action_config,
            'target_users': self.target_users,
            'is_active': self.is_active,
            'created_by_id': self.created_by_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def __repr__(self):
        return f'<NotificationRule {self.name} ({self.trigger_type})>'
