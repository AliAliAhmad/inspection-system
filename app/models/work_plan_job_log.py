"""
Work Plan Job Log model.
Records every execution event for a work plan job.
"""

from app.extensions import db
from datetime import datetime


class WorkPlanJobLog(db.Model):
    """
    Event log for work plan job execution.
    Tracks every start, pause, resume, complete, incomplete event.
    """
    __tablename__ = 'work_plan_job_logs'

    id = db.Column(db.Integer, primary_key=True)

    # Job reference
    work_plan_job_id = db.Column(db.Integer, db.ForeignKey('work_plan_jobs.id'), nullable=False, index=True)

    # Who performed the action
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Event type
    event_type = db.Column(db.String(30), nullable=False, index=True)
    # started, paused, resumed, completed, marked_incomplete, carry_over_created,
    # auto_flagged, rating_given, rating_disputed, rating_override, pause_approved,
    # pause_rejected, material_consumed

    # Additional context
    event_data = db.Column(db.JSON, nullable=True)
    # Stores contextual data like:
    # - pause: {reason_category, reason_details}
    # - completed: {actual_hours, work_notes}
    # - rating: {time_rating, qc_rating, cleaning_rating}
    # - carry_over: {new_job_id, reason}

    # Optional notes
    notes = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    user = db.relationship('User', foreign_keys=[user_id])

    __table_args__ = (
        db.CheckConstraint(
            "event_type IN ('started', 'paused', 'resumed', 'completed', 'marked_incomplete', "
            "'carry_over_created', 'auto_flagged', 'rating_given', 'rating_disputed', "
            "'rating_override', 'pause_approved', 'pause_rejected', 'material_consumed', "
            "'engineer_override')",
            name='check_valid_log_event_type'
        ),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'work_plan_job_id': self.work_plan_job_id,
            'user_id': self.user_id,
            'user': {
                'id': self.user.id,
                'full_name': self.user.full_name,
                'role': self.user.role,
            } if self.user else None,
            'event_type': self.event_type,
            'event_data': self.event_data,
            'notes': self.notes,
            'created_at': (self.created_at.isoformat() + 'Z') if self.created_at else None,
        }

    def __repr__(self):
        return f'<WorkPlanJobLog job:{self.work_plan_job_id} - {self.event_type}>'
