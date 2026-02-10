"""
Job Template model for recurring job definitions.
Templates can be used to create work plan jobs with predefined settings.
"""

from app.extensions import db
from datetime import datetime


class JobTemplate(db.Model):
    """
    Template for recurring jobs with predefined settings.
    Can be linked to specific equipment or generic equipment types.
    """
    __tablename__ = 'job_templates'

    id = db.Column(db.Integer, primary_key=True)

    # Template name
    name = db.Column(db.String(200), nullable=False)
    name_ar = db.Column(db.String(200))

    # Job type: pm, defect, inspection
    job_type = db.Column(db.String(20), nullable=False)

    # Equipment - specific equipment or generic type
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'))
    equipment_type = db.Column(db.String(50))  # For generic templates (e.g., 'RTG', 'STS')

    # Berth assignment
    berth = db.Column(db.String(10))  # east, west, both

    # Time estimate
    estimated_hours = db.Column(db.Float, nullable=False)

    # Priority
    priority = db.Column(db.String(20), default='normal')  # low, normal, high, urgent

    # Description
    description = db.Column(db.Text)
    description_ar = db.Column(db.Text)

    # Recurrence settings
    recurrence_type = db.Column(db.String(20))  # weekly, monthly, quarterly, yearly
    recurrence_day = db.Column(db.Integer)  # Day of week (0-6) or day of month (1-31)

    # Team configuration
    default_team_size = db.Column(db.Integer, default=1)

    # Required certifications (JSON array of certification names)
    required_certifications = db.Column(db.JSON)  # e.g., ['electrical', 'hydraulic']

    # Status
    is_active = db.Column(db.Boolean, default=True)

    # Creator
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    equipment = db.relationship('Equipment')
    created_by = db.relationship('User')
    materials = db.relationship('JobTemplateMaterial', back_populates='template', cascade='all, delete-orphan')
    checklist_items = db.relationship('JobTemplateChecklist', back_populates='template', cascade='all, delete-orphan', order_by='JobTemplateChecklist.order_index')

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "job_type IN ('pm', 'defect', 'inspection')",
            name='check_template_job_type'
        ),
        db.CheckConstraint(
            "priority IN ('low', 'normal', 'high', 'urgent')",
            name='check_template_priority'
        ),
        db.CheckConstraint(
            "recurrence_type IN ('weekly', 'monthly', 'quarterly', 'yearly') OR recurrence_type IS NULL",
            name='check_template_recurrence_type'
        ),
    )

    def to_dict(self, language='en', include_materials=True, include_checklist=True):
        """Convert to dictionary."""
        data = {
            'id': self.id,
            'name': self.name_ar if language == 'ar' and self.name_ar else self.name,
            'name_en': self.name,
            'name_ar': self.name_ar,
            'job_type': self.job_type,
            'equipment_id': self.equipment_id,
            'equipment': self.equipment.to_dict() if self.equipment else None,
            'equipment_type': self.equipment_type,
            'berth': self.berth,
            'estimated_hours': self.estimated_hours,
            'priority': self.priority,
            'description': self.description_ar if language == 'ar' and self.description_ar else self.description,
            'description_en': self.description,
            'description_ar': self.description_ar,
            'recurrence_type': self.recurrence_type,
            'recurrence_day': self.recurrence_day,
            'default_team_size': self.default_team_size,
            'required_certifications': self.required_certifications or [],
            'is_active': self.is_active,
            'created_by_id': self.created_by_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

        if include_materials:
            data['materials'] = [m.to_dict(language) for m in self.materials]

        if include_checklist:
            data['checklist_items'] = [c.to_dict(language) for c in self.checklist_items]

        return data

    def __repr__(self):
        return f'<JobTemplate {self.name} ({self.job_type})>'
