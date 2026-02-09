"""
Work Plan Pause Request model.
Tracks pause requests from workers, requiring engineer approval.
"""

from app.extensions import db
from datetime import datetime


class WorkPlanPauseRequest(db.Model):
    """
    Pause request for a work plan job.
    Worker pauses immediately, engineer reviews later.
    Must be resolved before daily review can be submitted.
    """
    __tablename__ = 'work_plan_pause_requests'

    id = db.Column(db.Integer, primary_key=True)

    # Job reference
    work_plan_job_id = db.Column(db.Integer, db.ForeignKey('work_plan_jobs.id'), nullable=False, index=True)

    # Worker who requested pause
    requested_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    requested_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Reason (from templates)
    reason_category = db.Column(db.String(30), nullable=False)
    # break, waiting_for_materials, urgent_task, waiting_for_access, other
    reason_details = db.Column(db.Text, nullable=True)

    # Approval status
    status = db.Column(db.String(20), default='pending', nullable=False, index=True)
    # pending, approved, rejected

    # Engineer review
    reviewed_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    review_notes = db.Column(db.Text, nullable=True)

    # Resume tracking
    resumed_at = db.Column(db.DateTime, nullable=True)
    duration_minutes = db.Column(db.Integer, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    requester = db.relationship('User', foreign_keys=[requested_by_id])
    reviewer = db.relationship('User', foreign_keys=[reviewed_by_id])

    __table_args__ = (
        db.CheckConstraint(
            "reason_category IN ('break', 'waiting_for_materials', 'urgent_task', 'waiting_for_access', 'other')",
            name='check_valid_wp_pause_reason'
        ),
        db.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name='check_valid_wp_pause_status'
        ),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'work_plan_job_id': self.work_plan_job_id,
            'requested_by_id': self.requested_by_id,
            'requester': {
                'id': self.requester.id,
                'full_name': self.requester.full_name,
                'role': self.requester.role,
            } if self.requester else None,
            'requested_at': (self.requested_at.isoformat() + 'Z') if self.requested_at else None,
            'reason_category': self.reason_category,
            'reason_details': self.reason_details,
            'status': self.status,
            'reviewed_by_id': self.reviewed_by_id,
            'reviewer': {
                'id': self.reviewer.id,
                'full_name': self.reviewer.full_name,
            } if self.reviewer else None,
            'reviewed_at': (self.reviewed_at.isoformat() + 'Z') if self.reviewed_at else None,
            'review_notes': self.review_notes,
            'resumed_at': (self.resumed_at.isoformat() + 'Z') if self.resumed_at else None,
            'duration_minutes': self.duration_minutes,
            'created_at': (self.created_at.isoformat() + 'Z') if self.created_at else None,
        }

    def __repr__(self):
        return f'<WorkPlanPauseRequest job:{self.work_plan_job_id} - {self.status}>'
