"""
Work Plan Job model for individual jobs within a day plan.
Supports PM, defect repair, and inspection job types.
"""

from app.extensions import db
from datetime import datetime


class WorkPlanJob(db.Model):
    """
    A job within a work plan day.
    Can be a PM job, defect repair, or inspection.
    """
    __tablename__ = 'work_plan_jobs'

    id = db.Column(db.Integer, primary_key=True)

    # Parent day
    work_plan_day_id = db.Column(db.Integer, db.ForeignKey('work_plan_days.id'), nullable=False)

    # Job type
    job_type = db.Column(db.String(20), nullable=False)  # pm, defect, inspection

    # Berth assignment
    berth = db.Column(db.String(10))  # east, west, both

    # Equipment (for PM and defect jobs)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'))

    # Defect reference (for defect jobs)
    defect_id = db.Column(db.Integer, db.ForeignKey('defects.id'))

    # Inspection reference (for inspection jobs)
    inspection_assignment_id = db.Column(db.Integer, db.ForeignKey('inspection_assignments.id'))

    # SAP integration
    sap_order_number = db.Column(db.String(50))

    # Time estimate (required when adding job)
    estimated_hours = db.Column(db.Float, nullable=False)

    # Display order
    position = db.Column(db.Integer, default=0)

    # Priority
    priority = db.Column(db.String(20), default='normal')  # low, normal, high, urgent

    # Notes
    notes = db.Column(db.Text)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    day = db.relationship('WorkPlanDay', back_populates='jobs')
    equipment = db.relationship('Equipment')
    defect = db.relationship('Defect')
    inspection_assignment = db.relationship('InspectionAssignment')
    assignments = db.relationship('WorkPlanAssignment', back_populates='job', cascade='all, delete-orphan')
    materials = db.relationship('WorkPlanMaterial', back_populates='job', cascade='all, delete-orphan')

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "job_type IN ('pm', 'defect', 'inspection')",
            name='check_job_type'
        ),
        db.CheckConstraint(
            "berth IN ('east', 'west', 'both') OR berth IS NULL",
            name='check_job_berth'
        ),
        db.CheckConstraint(
            "priority IN ('low', 'normal', 'high', 'urgent')",
            name='check_job_priority'
        ),
    )

    def get_related_defects(self):
        """For PM jobs, get related open defects for the same equipment."""
        if self.job_type != 'pm' or not self.equipment_id:
            return []

        from app.models.defect import Defect
        from app.models.inspection import Inspection

        return Defect.query.join(Inspection).filter(
            Inspection.equipment_id == self.equipment_id,
            Defect.status.in_(['open', 'in_progress'])
        ).all()

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        data = {
            'id': self.id,
            'work_plan_day_id': self.work_plan_day_id,
            'job_type': self.job_type,
            'berth': self.berth,
            'equipment_id': self.equipment_id,
            'equipment': self.equipment.to_dict() if self.equipment else None,
            'defect_id': self.defect_id,
            'defect': self.defect.to_dict(language) if self.defect else None,
            'inspection_assignment_id': self.inspection_assignment_id,
            'inspection_assignment': self.inspection_assignment.to_dict() if self.inspection_assignment else None,
            'sap_order_number': self.sap_order_number,
            'estimated_hours': self.estimated_hours,
            'position': self.position,
            'priority': self.priority,
            'notes': self.notes,
            'assignments': [a.to_dict() for a in self.assignments],
            'materials': [m.to_dict(language) for m in self.materials],
            'assigned_users_count': len(self.assignments),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

        # Add related defects for PM jobs
        if self.job_type == 'pm':
            related_defects = self.get_related_defects()
            data['related_defects'] = [d.to_dict(language) for d in related_defects]
            data['related_defects_count'] = len(related_defects)

        return data

    def __repr__(self):
        return f'<WorkPlanJob {self.job_type} equipment={self.equipment_id}>'
