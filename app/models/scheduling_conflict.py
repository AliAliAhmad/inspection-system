"""
Scheduling Conflict model for tracking conflicts in work plans.
Supports various conflict types like capacity, overlap, skill, equipment, and dependency conflicts.
"""

from app.extensions import db
from datetime import datetime


class SchedulingConflict(db.Model):
    """
    Scheduling conflict detected in a work plan.
    Tracks conflict details, affected resources, and resolution.
    """
    __tablename__ = 'scheduling_conflicts'

    id = db.Column(db.Integer, primary_key=True)

    # Parent work plan
    work_plan_id = db.Column(db.Integer, db.ForeignKey('work_plans.id'), nullable=False)

    # Conflict type
    # capacity: Worker assigned more hours than allowed
    # overlap: Worker assigned to overlapping jobs
    # skill: Worker lacks required skill/certification
    # equipment: Equipment unavailable or restricted
    # dependency: Job scheduled before its dependency
    conflict_type = db.Column(db.String(30), nullable=False)

    # Severity level
    severity = db.Column(db.String(20), default='warning')  # info, warning, error

    # Conflict description
    description = db.Column(db.Text, nullable=False)

    # Affected resources
    affected_job_ids = db.Column(db.JSON)  # List of job IDs involved
    affected_user_ids = db.Column(db.JSON)  # List of user IDs involved

    # Resolution
    resolution = db.Column(db.Text)
    resolved_at = db.Column(db.DateTime)
    resolved_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    # Can be ignored (acknowledged but not fixed)
    is_ignored = db.Column(db.Boolean, default=False)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    work_plan = db.relationship('WorkPlan', backref='conflicts')
    resolved_by = db.relationship('User')

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "conflict_type IN ('capacity', 'overlap', 'skill', 'equipment', 'dependency')",
            name='check_conflict_type'
        ),
        db.CheckConstraint(
            "severity IN ('info', 'warning', 'error')",
            name='check_conflict_severity'
        ),
    )

    @property
    def is_resolved(self):
        """Check if conflict is resolved."""
        return self.resolved_at is not None

    @property
    def is_blocking(self):
        """Check if conflict prevents publishing."""
        return self.severity == 'error' and not self.is_resolved and not self.is_ignored

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'work_plan_id': self.work_plan_id,
            'conflict_type': self.conflict_type,
            'severity': self.severity,
            'description': self.description,
            'affected_job_ids': self.affected_job_ids or [],
            'affected_user_ids': self.affected_user_ids or [],
            'resolution': self.resolution,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
            'resolved_by_id': self.resolved_by_id,
            'is_ignored': self.is_ignored,
            'is_resolved': self.is_resolved,
            'is_blocking': self.is_blocking,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<SchedulingConflict plan={self.work_plan_id} type={self.conflict_type}>'
