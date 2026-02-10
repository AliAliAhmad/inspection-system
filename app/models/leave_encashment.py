"""
Leave Encashment Model
Convert unused leave days to monetary payment.
"""

from app.extensions import db
from datetime import datetime


class LeaveEncashment(db.Model):
    """
    Tracks requests to convert unused leave days to cash payment.
    Usually done at year-end or upon resignation.
    """
    __tablename__ = 'leave_encashments'

    id = db.Column(db.Integer, primary_key=True)

    # Employee reference
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    # Leave type being encashed
    leave_type_id = db.Column(db.Integer, db.ForeignKey('leave_types.id'), index=True)

    # Encashment details
    days_encashed = db.Column(db.Float, nullable=False)
    amount_per_day = db.Column(db.Float)  # rate per day
    total_amount = db.Column(db.Float)  # total payment amount

    # Status tracking
    status = db.Column(db.String(20), default='pending', index=True)  # pending, approved, paid, rejected

    # Request timestamp
    requested_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Approval details
    approved_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    approved_at = db.Column(db.DateTime)

    # Payment tracking
    paid_at = db.Column(db.DateTime)

    # Notes
    notes = db.Column(db.Text)

    # Relationships
    user = db.relationship('User', foreign_keys=[user_id], backref='leave_encashments')
    leave_type = db.relationship('LeaveType', foreign_keys=[leave_type_id])
    approved_by = db.relationship('User', foreign_keys=[approved_by_id])

    __table_args__ = (
        db.CheckConstraint(
            "days_encashed > 0",
            name='check_days_encashed_positive'
        ),
        db.CheckConstraint(
            "amount_per_day IS NULL OR amount_per_day >= 0",
            name='check_amount_per_day_non_negative'
        ),
        db.CheckConstraint(
            "total_amount IS NULL OR total_amount >= 0",
            name='check_total_amount_non_negative'
        ),
        db.CheckConstraint(
            "status IN ('pending', 'approved', 'paid', 'rejected')",
            name='check_valid_encashment_status'
        ),
        db.Index('ix_leave_encashment_user_status', 'user_id', 'status'),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary with language support."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'leave_type_id': self.leave_type_id,
            'leave_type': self.leave_type.to_dict(language) if self.leave_type else None,
            'days_encashed': self.days_encashed,
            'amount_per_day': self.amount_per_day,
            'total_amount': self.total_amount,
            'status': self.status,
            'requested_at': self.requested_at.isoformat() if self.requested_at else None,
            'approved_by_id': self.approved_by_id,
            'approved_by': self.approved_by.to_dict() if self.approved_by else None,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'paid_at': self.paid_at.isoformat() if self.paid_at else None,
            'notes': self.notes
        }

    def calculate_total(self):
        """Calculate total encashment amount."""
        if self.amount_per_day:
            self.total_amount = self.days_encashed * self.amount_per_day
        return self.total_amount

    def approve(self, approver_id, notes=None):
        """Approve the encashment request."""
        self.approved_by_id = approver_id
        self.approved_at = datetime.utcnow()
        self.status = 'approved'
        if notes:
            self.notes = notes

    def mark_paid(self):
        """Mark the encashment as paid."""
        self.paid_at = datetime.utcnow()
        self.status = 'paid'

    def reject(self, approver_id, notes=None):
        """Reject the encashment request."""
        self.approved_by_id = approver_id
        self.approved_at = datetime.utcnow()
        self.status = 'rejected'
        if notes:
            self.notes = notes

    def __repr__(self):
        return f'<LeaveEncashment user={self.user_id} days={self.days_encashed} status={self.status}>'
