"""
NotificationTemplate model for customizable notification templates.
Supports variable substitution in titles and messages.
"""

from app.extensions import db
from datetime import datetime


class NotificationTemplate(db.Model):
    """
    Customizable notification templates.
    Supports {{variable}} syntax for dynamic content.
    """
    __tablename__ = 'notification_templates'

    id = db.Column(db.Integer, primary_key=True)

    # Notification type (unique identifier)
    notification_type = db.Column(db.String(100), unique=True, nullable=False, index=True)

    # Title templates (support {{variables}})
    title_template = db.Column(db.String(500), nullable=False)
    title_template_ar = db.Column(db.String(500), nullable=True)

    # Message templates (support {{variables}})
    message_template = db.Column(db.Text, nullable=False)
    message_template_ar = db.Column(db.Text, nullable=True)

    # Default priority: 'info', 'warning', 'urgent', 'critical'
    default_priority = db.Column(db.String(20), default='info')

    # Default channels as JSON: {'in_app': True, 'email': True, 'sms': False, 'push': True}
    default_channels = db.Column(db.JSON, nullable=False, default=dict)

    # Whether this template is active
    is_active = db.Column(db.Boolean, default=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Constraints
    __table_args__ = (
        db.Index('ix_notification_templates_active', 'is_active'),
        db.CheckConstraint(
            "default_priority IN ('info', 'warning', 'urgent', 'critical')",
            name='check_valid_template_priority'
        ),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'notification_type': self.notification_type,
            'title_template': self.title_template_ar if language == 'ar' and self.title_template_ar else self.title_template,
            'title_template_en': self.title_template,
            'title_template_ar': self.title_template_ar,
            'message_template': self.message_template_ar if language == 'ar' and self.message_template_ar else self.message_template,
            'message_template_en': self.message_template,
            'message_template_ar': self.message_template_ar,
            'default_priority': self.default_priority,
            'default_channels': self.default_channels,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def render(self, variables, language='en'):
        """
        Render the template with provided variables.

        Args:
            variables: dict of variable names and values
            language: 'en' or 'ar'

        Returns:
            tuple of (title, message)
        """
        import re

        title_template = self.title_template_ar if language == 'ar' and self.title_template_ar else self.title_template
        message_template = self.message_template_ar if language == 'ar' and self.message_template_ar else self.message_template

        def replace_var(match):
            var_name = match.group(1)
            return str(variables.get(var_name, match.group(0)))

        pattern = r'\{\{(\w+)\}\}'
        title = re.sub(pattern, replace_var, title_template)
        message = re.sub(pattern, replace_var, message_template)

        return title, message

    def __repr__(self):
        return f'<NotificationTemplate {self.notification_type}>'
