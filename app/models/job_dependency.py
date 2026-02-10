"""
Job Dependency model for managing dependencies between work plan jobs.
Supports finish-to-start and start-to-start dependency types with optional lag time.
"""

from app.extensions import db
from datetime import datetime


class JobDependency(db.Model):
    """
    Represents a dependency relationship between two work plan jobs.
    Job B depends on Job A means Job B cannot start until Job A is complete (or started).
    """
    __tablename__ = 'job_dependencies'

    id = db.Column(db.Integer, primary_key=True)

    # The job that has the dependency
    job_id = db.Column(db.Integer, db.ForeignKey('work_plan_jobs.id'), nullable=False)

    # The job that must be completed/started first
    depends_on_job_id = db.Column(db.Integer, db.ForeignKey('work_plan_jobs.id'), nullable=False)

    # Type of dependency
    # finish_to_start: Job B can start only after Job A finishes
    # start_to_start: Job B can start only after Job A starts
    dependency_type = db.Column(db.String(20), default='finish_to_start')

    # Delay in minutes after the dependency is satisfied
    lag_minutes = db.Column(db.Integer, default=0)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    job = db.relationship('WorkPlanJob', foreign_keys=[job_id], backref='dependencies')
    depends_on_job = db.relationship('WorkPlanJob', foreign_keys=[depends_on_job_id], backref='dependents')

    # Constraints
    __table_args__ = (
        db.UniqueConstraint('job_id', 'depends_on_job_id', name='unique_job_dependency'),
        db.CheckConstraint('job_id != depends_on_job_id', name='check_no_self_dependency'),
        db.CheckConstraint(
            "dependency_type IN ('finish_to_start', 'start_to_start')",
            name='check_dependency_type'
        ),
    )

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'job_id': self.job_id,
            'depends_on_job_id': self.depends_on_job_id,
            'dependency_type': self.dependency_type,
            'lag_minutes': self.lag_minutes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<JobDependency job={self.job_id} depends_on={self.depends_on_job_id}>'
