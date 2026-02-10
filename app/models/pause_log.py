"""
Pause Log model.
Tracks all pause requests and approvals for specialist and engineer jobs.
"""

from app.extensions import db
from datetime import datetime


class PauseLog(db.Model):
    """
    Log of pause requests with mandatory reasons.
    Used for pause analytics and management.
    """
    __tablename__ = 'pause_logs'

    id = db.Column(db.Integer, primary_key=True)

    # Job reference
    job_type = db.Column(db.String(30), nullable=False)  # 'specialist' or 'engineer'
    job_id = db.Column(db.Integer, nullable=False)

    # Request
    requested_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    requested_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Reason (mandatory)
    reason_category = db.Column(db.String(30), nullable=False)
    # Categories: parts, duty_finish, tools, manpower, oem, other
    reason_details = db.Column(db.Text, nullable=False)  # min 20 chars (50 for 'other')

    # Approval
    status = db.Column(db.String(20), default='pending')  # pending, approved, rejected
    approved_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)
    denial_reason = db.Column(db.Text, nullable=True)

    # Delegated to engineer
    delegated_to = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Resume tracking
    resumed_at = db.Column(db.DateTime, nullable=True)
    duration_minutes = db.Column(db.Integer, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    requester = db.relationship('User', foreign_keys=[requested_by])
    approver = db.relationship('User', foreign_keys=[approved_by])
    delegate = db.relationship('User', foreign_keys=[delegated_to])

    __table_args__ = (
        db.CheckConstraint(
            "reason_category IN ('parts', 'duty_finish', 'tools', 'manpower', 'oem', 'error_record', 'other')",
            name='check_valid_pause_reason'
        ),
        db.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name='check_valid_pause_status'
        ),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'job_type': self.job_type,
            'job_id': self.job_id,
            'requested_by': self.requested_by,
            'requested_at': self.requested_at.isoformat() if self.requested_at else None,
            'reason_category': self.reason_category,
            'reason_details': self.reason_details,
            'status': self.status,
            'approved_by': self.approved_by,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'denial_reason': self.denial_reason,
            'resumed_at': self.resumed_at.isoformat() if self.resumed_at else None,
            'duration_minutes': self.duration_minutes,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<PauseLog {self.job_type}:{self.job_id} - {self.reason_category}>'
