"""
Compensatory Leave Model
Comp-off earned for overtime/weekend work.
"""

from app.extensions import db
from datetime import datetime


class CompensatoryLeave(db.Model):
    """
    Tracks compensatory leave (comp-off) earned for overtime work.
    Employees can earn comp days for working on holidays/weekends.
    """
    __tablename__ = 'compensatory_leaves'

    id = db.Column(db.Integer, primary_key=True)

    # Employee reference
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    # Work details
    work_date = db.Column(db.Date, nullable=False, index=True)  # date when overtime was worked
    hours_worked = db.Column(db.Float, nullable=False)
    comp_days_earned = db.Column(db.Float, nullable=False)  # typically 0.5 or 1.0

    # Reason for overtime
    reason = db.Column(db.Text)

    # Approval status
    status = db.Column(db.String(20), default='pending', index=True)  # pending, approved, used, expired
    approved_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    approved_at = db.Column(db.DateTime)

    # Usage tracking
    used_in_leave_id = db.Column(db.Integer, db.ForeignKey('leaves.id'), index=True)

    # Expiration
    expires_at = db.Column(db.Date)  # comp-off typically expires after X months

    # Timestamp
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship('User', foreign_keys=[user_id], backref='compensatory_leaves')
    approved_by = db.relationship('User', foreign_keys=[approved_by_id])
    used_in_leave = db.relationship('Leave', backref='compensatory_leaves_used')

    __table_args__ = (
        db.CheckConstraint(
            "hours_worked > 0",
            name='check_comp_hours_worked_positive'
        ),
        db.CheckConstraint(
            "comp_days_earned > 0",
            name='check_comp_days_earned_positive'
        ),
        db.CheckConstraint(
            "status IN ('pending', 'approved', 'used', 'expired')",
            name='check_valid_comp_status'
        ),
        db.Index('ix_compensatory_leave_user_status', 'user_id', 'status'),
        db.Index('ix_compensatory_leave_user_expires', 'user_id', 'expires_at'),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary with language support."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'work_date': self.work_date.isoformat() if self.work_date else None,
            'hours_worked': self.hours_worked,
            'comp_days_earned': self.comp_days_earned,
            'reason': self.reason,
            'status': self.status,
            'approved_by_id': self.approved_by_id,
            'approved_by': self.approved_by.to_dict() if self.approved_by else None,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'used_in_leave_id': self.used_in_leave_id,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'is_expired': self.is_expired(),
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def is_expired(self):
        """Check if the compensatory leave has expired."""
        if not self.expires_at:
            return False
        from datetime import date
        return date.today() > self.expires_at

    def is_available(self):
        """Check if this comp-off is available for use."""
        return self.status == 'approved' and not self.is_expired()

    def mark_used(self, leave_id):
        """Mark this comp-off as used in a leave request."""
        self.used_in_leave_id = leave_id
        self.status = 'used'

    def __repr__(self):
        return f'<CompensatoryLeave user={self.user_id} date={self.work_date} days={self.comp_days_earned}>'
