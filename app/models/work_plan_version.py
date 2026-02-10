"""
Work Plan Version model for tracking plan version history.
Stores snapshots of work plans for audit and rollback purposes.
"""

from app.extensions import db
from datetime import datetime


class WorkPlanVersion(db.Model):
    """
    Version snapshot of a work plan.
    Stores the complete state of a plan at a point in time.
    """
    __tablename__ = 'work_plan_versions'

    id = db.Column(db.Integer, primary_key=True)

    # Parent work plan
    work_plan_id = db.Column(db.Integer, db.ForeignKey('work_plans.id'), nullable=False)

    # Version number (incrementing)
    version_number = db.Column(db.Integer, nullable=False)

    # Complete plan state as JSON
    snapshot_data = db.Column(db.JSON, nullable=False)

    # Change information
    change_summary = db.Column(db.Text)
    change_type = db.Column(db.String(30))  # created, jobs_added, jobs_moved, published, jobs_removed

    # Creator
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    work_plan = db.relationship('WorkPlan', backref='versions')
    created_by = db.relationship('User')

    # Constraints
    __table_args__ = (
        db.UniqueConstraint('work_plan_id', 'version_number', name='unique_plan_version'),
        db.CheckConstraint(
            "change_type IN ('created', 'jobs_added', 'jobs_moved', 'jobs_removed', 'published', 'updated')",
            name='check_version_change_type'
        ),
    )

    def to_dict(self, include_snapshot=False):
        """Convert to dictionary."""
        data = {
            'id': self.id,
            'work_plan_id': self.work_plan_id,
            'version_number': self.version_number,
            'change_summary': self.change_summary,
            'change_type': self.change_type,
            'created_by_id': self.created_by_id,
            'created_by': self.created_by.to_dict() if self.created_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

        if include_snapshot:
            data['snapshot_data'] = self.snapshot_data

        return data

    def __repr__(self):
        return f'<WorkPlanVersion plan={self.work_plan_id} v{self.version_number}>'
