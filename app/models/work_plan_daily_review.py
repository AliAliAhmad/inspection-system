"""
Work Plan Daily Review model.
Engineer's daily review session for approving jobs, rating workers, handling carry-overs.
"""

from app.extensions import db
from datetime import datetime


class WorkPlanDailyReview(db.Model):
    """
    Daily review session per engineer per shift.
    Day shift review: opens 5 PM, deadline 1 AM next day.
    Night shift review: opens 3 AM, deadline 6 AM.
    Hourly reminders if not completed.
    """
    __tablename__ = 'work_plan_daily_reviews'

    id = db.Column(db.Integer, primary_key=True)

    # Engineer performing the review
    engineer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    # Date and shift
    date = db.Column(db.Date, nullable=False, index=True)
    shift_type = db.Column(db.String(10), nullable=False)  # day, night

    # Review status
    status = db.Column(db.String(20), default='open', nullable=False, index=True)
    # open, partial, submitted

    # Timestamps
    opened_at = db.Column(db.DateTime, nullable=True)
    submitted_at = db.Column(db.DateTime, nullable=True)
    last_saved_at = db.Column(db.DateTime, nullable=True)

    # Job counts
    total_jobs = db.Column(db.Integer, default=0, nullable=False)
    approved_jobs = db.Column(db.Integer, default=0, nullable=False)
    incomplete_jobs = db.Column(db.Integer, default=0, nullable=False)
    not_started_jobs = db.Column(db.Integer, default=0, nullable=False)
    carry_over_jobs = db.Column(db.Integer, default=0, nullable=False)

    # Pause requests status
    total_pause_requests = db.Column(db.Integer, default=0, nullable=False)
    resolved_pause_requests = db.Column(db.Integer, default=0, nullable=False)

    # Material consumption
    materials_reviewed = db.Column(db.Boolean, default=False, nullable=False)

    # Review notes
    notes = db.Column(db.Text, nullable=True)

    # Reminder tracking
    reminders_sent = db.Column(db.Integer, default=0, nullable=False)
    last_reminder_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    engineer = db.relationship('User', foreign_keys=[engineer_id])
    ratings = db.relationship('WorkPlanJobRating', backref='daily_review', lazy='dynamic')

    __table_args__ = (
        db.UniqueConstraint('engineer_id', 'date', 'shift_type', name='unique_engineer_date_shift_review'),
        db.CheckConstraint(
            "shift_type IN ('day', 'night')",
            name='check_valid_review_shift_type'
        ),
        db.CheckConstraint(
            "status IN ('open', 'partial', 'submitted')",
            name='check_valid_review_status'
        ),
    )

    @property
    def completion_rate(self):
        """Calculate job completion percentage."""
        if self.total_jobs == 0:
            return 0
        return round((self.approved_jobs / self.total_jobs) * 100, 1)

    @property
    def has_unresolved_pauses(self):
        """Check if there are unresolved pause requests."""
        return self.resolved_pause_requests < self.total_pause_requests

    @property
    def can_submit(self):
        """Review can only be submitted when all pause requests are resolved."""
        return not self.has_unresolved_pauses

    def to_dict(self):
        return {
            'id': self.id,
            'engineer_id': self.engineer_id,
            'engineer': {
                'id': self.engineer.id,
                'full_name': self.engineer.full_name,
            } if self.engineer else None,
            'date': self.date.isoformat() if self.date else None,
            'shift_type': self.shift_type,
            'status': self.status,
            'opened_at': (self.opened_at.isoformat() + 'Z') if self.opened_at else None,
            'submitted_at': (self.submitted_at.isoformat() + 'Z') if self.submitted_at else None,
            'last_saved_at': (self.last_saved_at.isoformat() + 'Z') if self.last_saved_at else None,
            'total_jobs': self.total_jobs,
            'approved_jobs': self.approved_jobs,
            'incomplete_jobs': self.incomplete_jobs,
            'not_started_jobs': self.not_started_jobs,
            'carry_over_jobs': self.carry_over_jobs,
            'total_pause_requests': self.total_pause_requests,
            'resolved_pause_requests': self.resolved_pause_requests,
            'has_unresolved_pauses': self.has_unresolved_pauses,
            'can_submit': self.can_submit,
            'materials_reviewed': self.materials_reviewed,
            'completion_rate': self.completion_rate,
            'notes': self.notes,
            'reminders_sent': self.reminders_sent,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<WorkPlanDailyReview engineer:{self.engineer_id} {self.date} {self.shift_type} - {self.status}>'
