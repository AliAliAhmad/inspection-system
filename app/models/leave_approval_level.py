"""
Leave Approval Level Model
Multi-level approval workflow for leave requests.
"""

from app.extensions import db
from datetime import datetime


class LeaveApprovalLevel(db.Model):
    """
    Tracks approval at each level of a multi-level approval workflow.
    Each leave request can have multiple approval levels.
    """
    __tablename__ = 'leave_approval_levels'

    id = db.Column(db.Integer, primary_key=True)

    # Leave reference
    leave_id = db.Column(db.Integer, db.ForeignKey('leaves.id'), nullable=False, index=True)

    # Approval level (1, 2, 3, etc.)
    level = db.Column(db.Integer, nullable=False)

    # Approver details
    approver_role = db.Column(db.String(50))  # manager, hr, admin
    approver_id = db.Column(db.Integer, db.ForeignKey('users.id'), index=True)

    # Decision status
    status = db.Column(db.String(20), default='pending', index=True)  # pending, approved, rejected
    decision_at = db.Column(db.DateTime)

    # Notes/comments
    notes = db.Column(db.Text)

    # Timestamp
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    leave = db.relationship('Leave', backref='approval_levels')
    approver = db.relationship('User', backref='leave_approvals')

    __table_args__ = (
        db.UniqueConstraint('leave_id', 'level', name='uq_leave_approval_level'),
        db.CheckConstraint(
            "level > 0",
            name='check_approval_level_positive'
        ),
        db.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name='check_valid_approval_status'
        ),
        db.Index('ix_leave_approval_leave_level', 'leave_id', 'level'),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary with language support."""
        return {
            'id': self.id,
            'leave_id': self.leave_id,
            'level': self.level,
            'approver_role': self.approver_role,
            'approver_id': self.approver_id,
            'approver': self.approver.to_dict() if self.approver else None,
            'status': self.status,
            'decision_at': self.decision_at.isoformat() if self.decision_at else None,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def approve(self, approver_id, notes=None):
        """Mark this level as approved."""
        self.approver_id = approver_id
        self.status = 'approved'
        self.decision_at = datetime.utcnow()
        self.notes = notes

    def reject(self, approver_id, notes=None):
        """Mark this level as rejected."""
        self.approver_id = approver_id
        self.status = 'rejected'
        self.decision_at = datetime.utcnow()
        self.notes = notes

    def __repr__(self):
        return f'<LeaveApprovalLevel leave={self.leave_id} level={self.level} status={self.status}>'
