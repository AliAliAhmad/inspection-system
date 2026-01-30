"""
Job Takeover model.
Tracks requests to take over stalled/backlog jobs.
"""

from app.extensions import db
from datetime import datetime


class JobTakeover(db.Model):
    """
    Takeover request for stalled jobs (paused 3+ days) or backlog inspections.
    Queue-based: first come, first serve, admin approves.
    +3 stars bonus for successful completion.
    """
    __tablename__ = 'job_takeovers'

    id = db.Column(db.Integer, primary_key=True)

    # Job reference
    job_type = db.Column(db.String(30), nullable=False)  # 'specialist', 'engineer', 'inspection'
    job_id = db.Column(db.Integer, nullable=False)

    # Requester
    requested_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    # For inspection takeover, also need a partner
    partner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    requested_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    reason = db.Column(db.Text, nullable=True)

    # Approval
    status = db.Column(db.String(20), default='pending')  # pending, approved, denied, completed
    approved_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)

    # Completion
    completed_at = db.Column(db.DateTime, nullable=True)
    bonus_awarded = db.Column(db.Boolean, default=False)

    # Queue position
    queue_position = db.Column(db.Integer, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    requester = db.relationship('User', foreign_keys=[requested_by], backref='takeover_requests')
    partner = db.relationship('User', foreign_keys=[partner_id])
    approver = db.relationship('User', foreign_keys=[approved_by])

    __table_args__ = (
        db.CheckConstraint(
            "job_type IN ('specialist', 'engineer', 'inspection')",
            name='check_valid_takeover_job_type'
        ),
        db.CheckConstraint(
            "status IN ('pending', 'approved', 'denied', 'completed')",
            name='check_valid_takeover_status'
        ),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'job_type': self.job_type,
            'job_id': self.job_id,
            'requested_by': self.requested_by,
            'requester': self.requester.to_dict() if self.requester else None,
            'partner_id': self.partner_id,
            'requested_at': self.requested_at.isoformat() if self.requested_at else None,
            'reason': self.reason,
            'status': self.status,
            'approved_by': self.approved_by,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'bonus_awarded': self.bonus_awarded,
            'queue_position': self.queue_position,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<JobTakeover {self.job_type}:{self.job_id} by User:{self.requested_by}>'
