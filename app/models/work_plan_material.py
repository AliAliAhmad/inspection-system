"""
Work Plan Material model for materials assigned to jobs.
Tracks materials needed for each job with optional kit reference.
"""

from app.extensions import db
from datetime import datetime


class WorkPlanMaterial(db.Model):
    """
    Material assigned to a work plan job.
    Can be added individually or from a material kit.
    """
    __tablename__ = 'work_plan_materials'

    id = db.Column(db.Integer, primary_key=True)

    # Parent job
    work_plan_job_id = db.Column(db.Integer, db.ForeignKey('work_plan_jobs.id'), nullable=False)

    # Material reference
    material_id = db.Column(db.Integer, db.ForeignKey('materials.id'), nullable=False)

    # Quantity needed
    quantity = db.Column(db.Float, nullable=False, default=1)

    # Kit reference (if added via kit)
    from_kit_id = db.Column(db.Integer, db.ForeignKey('material_kits.id'))

    # Actual consumption (filled after job completion)
    actual_quantity = db.Column(db.Float)
    consumed_at = db.Column(db.DateTime)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    job = db.relationship('WorkPlanJob', back_populates='materials')
    material = db.relationship('Material')
    from_kit = db.relationship('MaterialKit')

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'work_plan_job_id': self.work_plan_job_id,
            'material_id': self.material_id,
            'material': self.material.to_dict(language) if self.material else None,
            'quantity': self.quantity,
            'from_kit_id': self.from_kit_id,
            'from_kit': self.from_kit.name if self.from_kit else None,
            'actual_quantity': self.actual_quantity,
            'consumed_at': self.consumed_at.isoformat() if self.consumed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<WorkPlanMaterial job={self.work_plan_job_id} material={self.material_id}>'
