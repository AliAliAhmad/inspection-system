"""
Answer Template model for saving reusable inspection answer templates.
Allows inspectors to save and reuse common response patterns.
"""

from datetime import datetime
from app.extensions import db


class AnswerTemplate(db.Model):
    """
    User-created templates for quickly filling in inspection answers.
    Stores common response patterns that can be reused across inspections.
    """
    __tablename__ = 'answer_templates'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Template identification
    name = db.Column(db.String(100), nullable=False)
    name_ar = db.Column(db.String(100), nullable=True)
    category = db.Column(db.String(50), nullable=True)  # e.g., 'mechanical', 'electrical', 'general'

    # Template content (JSON structure)
    # Format: { "answers": [{"question_pattern": "...", "answer_value": "pass", "comment": "..."}] }
    content = db.Column(db.JSON, nullable=False, default=dict)

    # User preferences
    is_favorite = db.Column(db.Boolean, default=False)
    usage_count = db.Column(db.Integer, default=0)

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = db.relationship('User', backref=db.backref('answer_templates', lazy='dynamic'))

    def to_dict(self, language='en'):
        """Convert template to dictionary."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name_ar if language == 'ar' and self.name_ar else self.name,
            'name_en': self.name,
            'name_ar': self.name_ar,
            'category': self.category,
            'content': self.content,
            'is_favorite': self.is_favorite,
            'usage_count': self.usage_count,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def increment_usage(self):
        """Increment the usage counter."""
        self.usage_count = (self.usage_count or 0) + 1

    def __repr__(self):
        return f'<AnswerTemplate {self.id} - {self.name}>'
