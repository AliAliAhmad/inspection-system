"""
Equipment Note model for tracking notes and comments on equipment.
"""

from app.extensions import db
from datetime import datetime


class EquipmentNote(db.Model):
    """
    Notes and comments associated with specific equipment.
    Supports pinned notes for important information that should be prominently displayed.
    """
    __tablename__ = 'equipment_notes'

    id = db.Column(db.Integer, primary_key=True)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Note content
    content = db.Column(db.Text, nullable=False)
    content_ar = db.Column(db.Text, nullable=True)  # Arabic content

    # Note metadata
    is_pinned = db.Column(db.Boolean, default=False)
    note_type = db.Column(db.String(50), default='general')  # general, maintenance, safety, technical

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    equipment = db.relationship('Equipment', backref=db.backref('notes', lazy='dynamic', order_by='EquipmentNote.is_pinned.desc(), EquipmentNote.created_at.desc()'))
    user = db.relationship('User', backref=db.backref('equipment_notes', lazy='dynamic'))

    __table_args__ = (
        db.CheckConstraint(
            "note_type IN ('general', 'maintenance', 'safety', 'technical', 'warning')",
            name='check_valid_note_type'
        ),
    )

    def to_dict(self, language='en'):
        return {
            'id': self.id,
            'equipment_id': self.equipment_id,
            'user_id': self.user_id,
            'user': {
                'id': self.user.id,
                'full_name': self.user.full_name,
                'role_id': self.user.role_id,
                'role': self.user.role,
            } if self.user else None,
            'content': self.content_ar if language == 'ar' and self.content_ar else self.content,
            'content_en': self.content,
            'content_ar': self.content_ar,
            'is_pinned': self.is_pinned,
            'note_type': self.note_type,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<EquipmentNote {self.id} for Equipment:{self.equipment_id}>'
