"""
Work Plan Assignment model for assigning employees to jobs.
Multiple employees can be assigned to a single job.
"""

from app.extensions import db
from datetime import datetime


class WorkPlanAssignment(db.Model):
    """
    Assignment of an employee to a work plan job.
    Supports multiple employees per job with team lead designation.
    """
    __tablename__ = 'work_plan_assignments'

    id = db.Column(db.Integer, primary_key=True)

    # Parent job
    work_plan_job_id = db.Column(db.Integer, db.ForeignKey('work_plan_jobs.id'), nullable=False)

    # Assigned user
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Team lead designation
    is_lead = db.Column(db.Boolean, default=False)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    job = db.relationship('WorkPlanJob', back_populates='assignments')
    user = db.relationship('User')

    # Constraints
    __table_args__ = (
        db.UniqueConstraint('work_plan_job_id', 'user_id', name='unique_job_user_assignment'),
    )

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'work_plan_job_id': self.work_plan_job_id,
            'user_id': self.user_id,
            'user': {
                'id': self.user.id,
                'full_name': self.user.full_name,
                'role': self.user.role,
                'role_id': self.user.role_id,
                'specialization': self.user.specialization,
            } if self.user else None,
            'is_lead': self.is_lead,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<WorkPlanAssignment job={self.work_plan_job_id} user={self.user_id}>'
