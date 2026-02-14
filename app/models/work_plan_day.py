"""
Work Plan Day model for daily job planning.
Each day can have multiple jobs with berth separation.
"""

from app.extensions import db
from datetime import datetime


class WorkPlanDay(db.Model):
    """
    A single day within a work plan.
    Contains jobs organized by berth (east/west).
    """
    __tablename__ = 'work_plan_days'

    id = db.Column(db.Integer, primary_key=True)

    # Parent plan
    work_plan_id = db.Column(db.Integer, db.ForeignKey('work_plans.id'), nullable=False)

    # Date
    date = db.Column(db.Date, nullable=False, index=True)

    # Notes for the day
    notes = db.Column(db.Text)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    work_plan = db.relationship('WorkPlan', back_populates='days')
    jobs = db.relationship('WorkPlanJob', back_populates='day', cascade='all, delete-orphan', order_by='WorkPlanJob.position')

    # Constraints
    __table_args__ = (
        db.UniqueConstraint('work_plan_id', 'date', name='unique_plan_day'),
    )

    def get_jobs_by_berth(self):
        """Group jobs by berth."""
        east_jobs = [j for j in self.jobs if j.berth == 'east']
        west_jobs = [j for j in self.jobs if j.berth == 'west']
        both_jobs = [j for j in self.jobs if j.berth == 'both' or j.berth is None]
        return {
            'east': east_jobs,
            'west': west_jobs,
            'both': both_jobs,
        }

    def get_total_hours(self):
        """Get total estimated hours for the day."""
        return sum(job.estimated_hours or 0 for job in self.jobs)

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        # Use compact mode if there are many jobs (> 10) to avoid timeout
        compact = len(self.jobs) > 10

        # Serialize jobs ONCE and cache by ID to avoid double serialization
        jobs_dict = {}
        for job in self.jobs:
            jobs_dict[job.id] = job.to_dict(language, compact=compact)

        # Group job IDs by berth (reuse cached serialization)
        east_ids = [j.id for j in self.jobs if j.berth == 'east']
        west_ids = [j.id for j in self.jobs if j.berth == 'west']
        both_ids = [j.id for j in self.jobs if j.berth == 'both' or j.berth is None]

        return {
            'id': self.id,
            'work_plan_id': self.work_plan_id,
            'date': self.date.isoformat() if self.date else None,
            'day_name': self.date.strftime('%A') if self.date else None,
            'notes': self.notes,
            'total_jobs': len(self.jobs),
            'total_hours': self.get_total_hours(),
            'jobs': list(jobs_dict.values()),
            'jobs_east': [jobs_dict[jid] for jid in east_ids],
            'jobs_west': [jobs_dict[jid] for jid in west_ids],
            'jobs_both': [jobs_dict[jid] for jid in both_ids],
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<WorkPlanDay {self.date} ({len(self.jobs)} jobs)>'
