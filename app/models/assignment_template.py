"""
Assignment Template Model
Allows saving and reusing daily assignment patterns.
"""

from app.extensions import db
from datetime import datetime


class AssignmentTemplate(db.Model):
    """Stores reusable assignment patterns."""
    __tablename__ = 'assignment_templates'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    shift = db.Column(db.String(10))  # day, night
    is_active = db.Column(db.Boolean, default=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    created_by = db.relationship('User', backref='assignment_templates')
    items = db.relationship(
        'AssignmentTemplateItem',
        backref='template',
        lazy='dynamic',
        cascade='all, delete-orphan'
    )

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'shift': self.shift,
            'is_active': self.is_active,
            'created_by_id': self.created_by_id,
            'created_by_name': self.created_by.full_name if self.created_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'items_count': self.items.count(),
            'items': [item.to_dict() for item in self.items.all()]
        }


class AssignmentTemplateItem(db.Model):
    """Individual assignment in a template."""
    __tablename__ = 'assignment_template_items'

    id = db.Column(db.Integer, primary_key=True)
    template_id = db.Column(db.Integer, db.ForeignKey('assignment_templates.id'), nullable=False)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False)
    berth = db.Column(db.String(50))
    mechanical_inspector_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    electrical_inspector_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    # Relationships
    equipment = db.relationship('Equipment')
    mechanical_inspector = db.relationship('User', foreign_keys=[mechanical_inspector_id])
    electrical_inspector = db.relationship('User', foreign_keys=[electrical_inspector_id])

    def to_dict(self):
        return {
            'id': self.id,
            'template_id': self.template_id,
            'equipment_id': self.equipment_id,
            'equipment_name': self.equipment.name if self.equipment else None,
            'berth': self.berth,
            'mechanical_inspector_id': self.mechanical_inspector_id,
            'mechanical_inspector_name': self.mechanical_inspector.full_name if self.mechanical_inspector else None,
            'electrical_inspector_id': self.electrical_inspector_id,
            'electrical_inspector_name': self.electrical_inspector.full_name if self.electrical_inspector else None,
        }
