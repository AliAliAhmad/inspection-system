"""
Job Template Material model for predefined materials in job templates.
Specifies the materials needed for a job template with quantities.
"""

from app.extensions import db


class JobTemplateMaterial(db.Model):
    """
    Material requirement for a job template.
    Links templates to materials with required quantities.
    """
    __tablename__ = 'job_template_materials'

    id = db.Column(db.Integer, primary_key=True)

    # Parent template
    template_id = db.Column(db.Integer, db.ForeignKey('job_templates.id'), nullable=False)

    # Material
    material_id = db.Column(db.Integer, db.ForeignKey('materials.id'), nullable=False)

    # Required quantity
    quantity = db.Column(db.Float, nullable=False)

    # Optional materials can be skipped
    is_optional = db.Column(db.Boolean, default=False)

    # Relationships
    template = db.relationship('JobTemplate', back_populates='materials')
    material = db.relationship('Material')

    # Constraints
    __table_args__ = (
        db.UniqueConstraint('template_id', 'material_id', name='unique_template_material'),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'template_id': self.template_id,
            'material_id': self.material_id,
            'material': self.material.to_dict(language) if self.material else None,
            'quantity': self.quantity,
            'is_optional': self.is_optional,
        }

    def __repr__(self):
        return f'<JobTemplateMaterial template={self.template_id} material={self.material_id}>'
