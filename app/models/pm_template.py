"""
PM Template models for preventive maintenance templates.
Templates include checklists and materials linked to equipment types and cycles.
"""

from app.extensions import db
from datetime import datetime


class PMTemplate(db.Model):
    """
    A preventive maintenance template defining checklist items and materials
    for a specific equipment type and maintenance cycle.
    """
    __tablename__ = 'pm_templates'

    id = db.Column(db.Integer, primary_key=True)

    # Template identification
    name = db.Column(db.String(255), nullable=False)
    name_ar = db.Column(db.String(255))
    description = db.Column(db.Text)
    description_ar = db.Column(db.Text)

    # Equipment type this template applies to
    equipment_type = db.Column(db.String(100), nullable=False, index=True)

    # Cycle reference
    cycle_id = db.Column(db.Integer, db.ForeignKey('maintenance_cycles.id'), nullable=False)

    # Default estimated hours for this PM
    estimated_hours = db.Column(db.Float, default=4.0)

    # Status
    is_active = db.Column(db.Boolean, default=True, nullable=False)

    # Audit
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    cycle = db.relationship('MaintenanceCycle')
    created_by = db.relationship('User')
    checklist_items = db.relationship(
        'PMTemplateChecklistItem',
        back_populates='template',
        cascade='all, delete-orphan',
        order_by='PMTemplateChecklistItem.order_index'
    )
    materials = db.relationship(
        'PMTemplateMaterial',
        back_populates='template',
        cascade='all, delete-orphan'
    )

    # Unique constraint: one template per equipment_type + cycle
    __table_args__ = (
        db.UniqueConstraint('equipment_type', 'cycle_id', name='uq_pm_template_equipment_cycle'),
    )

    def to_dict(self, language='en', include_items=True):
        """Convert to dictionary."""
        data = {
            'id': self.id,
            'name': self.name_ar if language == 'ar' and self.name_ar else self.name,
            'name_en': self.name,
            'name_ar': self.name_ar,
            'description': self.description_ar if language == 'ar' and self.description_ar else self.description,
            'description_en': self.description,
            'description_ar': self.description_ar,
            'equipment_type': self.equipment_type,
            'cycle_id': self.cycle_id,
            'cycle': self.cycle.to_dict(language) if self.cycle else None,
            'estimated_hours': self.estimated_hours,
            'is_active': self.is_active,
            'created_by_id': self.created_by_id,
            'created_by': self.created_by.full_name if self.created_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

        if include_items:
            data['checklist_items'] = [item.to_dict(language) for item in self.checklist_items]
            data['materials'] = [m.to_dict(language) for m in self.materials]
            data['checklist_items_count'] = len(self.checklist_items)
            data['materials_count'] = len(self.materials)

        return data

    @staticmethod
    def find_for_job(equipment_type, cycle_id):
        """Find a matching template for equipment type and cycle."""
        return PMTemplate.query.filter_by(
            equipment_type=equipment_type,
            cycle_id=cycle_id,
            is_active=True
        ).first()

    def __repr__(self):
        return f'<PMTemplate {self.name} ({self.equipment_type})>'


class PMTemplateChecklistItem(db.Model):
    """
    A checklist item within a PM template.
    Defines the inspection/task items for the PM procedure.
    """
    __tablename__ = 'pm_template_checklist_items'

    id = db.Column(db.Integer, primary_key=True)
    template_id = db.Column(db.Integer, db.ForeignKey('pm_templates.id'), nullable=False)

    # Item code (optional)
    item_code = db.Column(db.String(20))

    # Question/task text
    question_text = db.Column(db.Text, nullable=False)
    question_text_ar = db.Column(db.Text)

    # Answer type
    answer_type = db.Column(db.String(20), default='pass_fail')  # pass_fail, yes_no, numeric, text

    # Category for specialist routing
    category = db.Column(db.String(20))  # mechanical, electrical

    # Required flag
    is_required = db.Column(db.Boolean, default=True, nullable=False)

    # Display order
    order_index = db.Column(db.Integer, nullable=False, default=0)

    # Action guidance
    action = db.Column(db.Text)
    action_ar = db.Column(db.Text)

    # Relationships
    template = db.relationship('PMTemplate', back_populates='checklist_items')

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "answer_type IN ('pass_fail', 'yes_no', 'numeric', 'text')",
            name='check_pm_item_answer_type'
        ),
        db.CheckConstraint(
            "category IN ('mechanical', 'electrical') OR category IS NULL",
            name='check_pm_item_category'
        ),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'template_id': self.template_id,
            'item_code': self.item_code,
            'question_text': self.question_text_ar if language == 'ar' and self.question_text_ar else self.question_text,
            'question_text_en': self.question_text,
            'question_text_ar': self.question_text_ar,
            'answer_type': self.answer_type,
            'category': self.category,
            'is_required': self.is_required,
            'order_index': self.order_index,
            'action': self.action_ar if language == 'ar' and self.action_ar else self.action,
            'action_en': self.action,
            'action_ar': self.action_ar,
        }

    def __repr__(self):
        return f'<PMTemplateChecklistItem {self.item_code or self.id}>'


class PMTemplateMaterial(db.Model):
    """
    A material requirement for a PM template.
    Links materials to templates with required quantities.
    """
    __tablename__ = 'pm_template_materials'

    id = db.Column(db.Integer, primary_key=True)
    template_id = db.Column(db.Integer, db.ForeignKey('pm_templates.id'), nullable=False)
    material_id = db.Column(db.Integer, db.ForeignKey('materials.id'), nullable=False)

    # Required quantity
    quantity = db.Column(db.Float, nullable=False, default=1)

    # Relationships
    template = db.relationship('PMTemplate', back_populates='materials')
    material = db.relationship('Material')

    # Unique constraint: one material per template
    __table_args__ = (
        db.UniqueConstraint('template_id', 'material_id', name='uq_pm_template_material'),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'template_id': self.template_id,
            'material_id': self.material_id,
            'material': self.material.to_dict(language) if self.material else None,
            'quantity': self.quantity,
        }

    def __repr__(self):
        return f'<PMTemplateMaterial template={self.template_id} material={self.material_id}>'
