"""
Work Plan model for weekly planning.
A work plan covers one week and contains daily job assignments.
"""

from app.extensions import db
from datetime import datetime, timedelta


class WorkPlan(db.Model):
    """
    Weekly work plan created by engineers.
    Contains daily plans with jobs, assignments, and materials.
    """
    __tablename__ = 'work_plans'

    id = db.Column(db.Integer, primary_key=True)

    # Week range
    week_start = db.Column(db.Date, nullable=False, index=True)  # Monday
    week_end = db.Column(db.Date, nullable=False)  # Sunday

    # Status
    status = db.Column(db.String(20), default='draft', nullable=False)  # draft, published

    # Creator
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Publishing
    published_at = db.Column(db.DateTime)
    published_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    # Generated PDF
    pdf_file_id = db.Column(db.Integer, db.ForeignKey('files.id'))

    # Notes
    notes = db.Column(db.Text)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    created_by = db.relationship('User', foreign_keys=[created_by_id])
    published_by = db.relationship('User', foreign_keys=[published_by_id])
    pdf_file = db.relationship('File')
    days = db.relationship('WorkPlanDay', back_populates='work_plan', cascade='all, delete-orphan', order_by='WorkPlanDay.date')

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "status IN ('draft', 'published')",
            name='check_work_plan_status'
        ),
        db.UniqueConstraint('week_start', name='unique_week_plan'),
    )

    @staticmethod
    def get_week_bounds(date):
        """Get Monday and Sunday for a given date's week."""
        # Get Monday (weekday 0)
        monday = date - timedelta(days=date.weekday())
        sunday = monday + timedelta(days=6)
        return monday, sunday

    def get_total_jobs(self):
        """Get total number of jobs across all days."""
        return sum(len(day.jobs) for day in self.days)

    def get_jobs_by_day(self):
        """Get job count per day."""
        return {day.date.isoformat(): len(day.jobs) for day in self.days}

    def to_dict(self, language='en', include_days=True):
        """Convert to dictionary."""
        data = {
            'id': self.id,
            'week_start': self.week_start.isoformat() if self.week_start else None,
            'week_end': self.week_end.isoformat() if self.week_end else None,
            'status': self.status,
            'created_by_id': self.created_by_id,
            'created_by': self.created_by.to_dict() if self.created_by else None,
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'published_by_id': self.published_by_id,
            'pdf_file_id': self.pdf_file_id,
            'pdf_url': self.pdf_file.url if self.pdf_file else None,
            'notes': self.notes,
            'total_jobs': self.get_total_jobs(),
            'jobs_by_day': self.get_jobs_by_day(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

        if include_days:
            data['days'] = [day.to_dict(language) for day in self.days]

        return data

    def __repr__(self):
        return f'<WorkPlan {self.week_start} - {self.week_end} ({self.status})>'
