"""
Checklist template and item models for inspection workflows.
Items now have categories (mechanical/electrical) for inspector specialization.
"""

from app.extensions import db
from datetime import datetime


class ChecklistTemplate(db.Model):
    """Checklist template for a specific equipment type."""
    __tablename__ = 'checklist_templates'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    name_ar = db.Column(db.String(200), nullable=True)
    description = db.Column(db.Text, nullable=True)
    function = db.Column(db.String(200), nullable=True)
    assembly = db.Column(db.String(200), nullable=True)
    part = db.Column(db.String(200), nullable=True)
    equipment_type = db.Column(db.String(50), nullable=True, index=True)
    version = db.Column(db.String(20), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    created_by = db.relationship('User', backref='created_templates')
    items = db.relationship(
        'ChecklistItem',
        back_populates='template',
        cascade='all, delete-orphan',
        order_by='ChecklistItem.order_index',
        lazy='dynamic'
    )
    inspections = db.relationship('Inspection', back_populates='template', lazy='dynamic')

    __table_args__ = (
        db.UniqueConstraint('equipment_type', 'version', name='uq_template_type_version'),
    )

    def to_dict(self, include_items=False, language='en'):
        """Convert template to dictionary."""
        data = {
            'id': self.id,
            'name': self.name_ar if language == 'ar' and self.name_ar else self.name,
            'name_ar': self.name_ar,
            'description': self.description,
            'function': self.function,
            'assembly': self.assembly,
            'part': self.part,
            'equipment_type': self.equipment_type,
            'version': self.version,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        if include_items:
            data['items'] = [item.to_dict(language=language) for item in self.items.order_by(ChecklistItem.order_index)]
        return data

    def __repr__(self):
        return f'<ChecklistTemplate {self.name} v{self.version}>'


class ChecklistItem(db.Model):
    """
    Individual question/item in a checklist template.
    Each item belongs to a category (mechanical/electrical) for inspector specialization.
    """
    __tablename__ = 'checklist_items'

    id = db.Column(db.Integer, primary_key=True)
    template_id = db.Column(db.Integer, db.ForeignKey('checklist_templates.id'), nullable=False)

    # Auto-generated item code: [Function 2 letters]-[Assembly 2 letters]-00X
    item_code = db.Column(db.String(20), nullable=True)

    question_text = db.Column(db.Text, nullable=False)
    question_text_ar = db.Column(db.Text, nullable=True)
    answer_type = db.Column(
        db.Enum('pass_fail', 'yes_no', 'numeric', 'text', name='answer_types'),
        nullable=False
    )
    # Category determines which inspector type answers this question
    category = db.Column(db.String(20), nullable=True)  # 'mechanical' or 'electrical'
    is_required = db.Column(db.Boolean, default=True)
    order_index = db.Column(db.Integer, nullable=False)
    pass_fail_rule = db.Column(db.JSON, nullable=True)
    critical_failure = db.Column(db.Boolean, default=False)

    # Action/guide for inspector
    action = db.Column(db.Text, nullable=True)
    action_ar = db.Column(db.Text, nullable=True)

    # Numeric validation rules (for answer_type='numeric')
    numeric_rule = db.Column(db.String(20), nullable=True)  # 'less_than', 'greater_than', 'between'
    min_value = db.Column(db.Float, nullable=True)
    max_value = db.Column(db.Float, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    template = db.relationship('ChecklistTemplate', back_populates='items')
    answers = db.relationship('InspectionAnswer', back_populates='checklist_item', lazy='dynamic')
    defects = db.relationship('Defect', back_populates='checklist_item', lazy='dynamic')

    __table_args__ = (
        db.UniqueConstraint('template_id', 'order_index', name='uq_item_template_order'),
        db.CheckConstraint(
            "category IN ('mechanical', 'electrical') OR category IS NULL",
            name='check_valid_item_category'
        ),
    )

    def to_dict(self, language='en'):
        """Convert checklist item to dictionary."""
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
            'critical_failure': self.critical_failure,
            'action': self.action_ar if language == 'ar' and self.action_ar else self.action,
            'action_en': self.action,
            'action_ar': self.action_ar,
            'numeric_rule': self.numeric_rule,
            'min_value': self.min_value,
            'max_value': self.max_value
        }

    def __repr__(self):
        return f'<ChecklistItem {self.id}: {self.question_text[:30]}>'
