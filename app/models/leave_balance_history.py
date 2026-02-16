"""
Leave Balance History Model
Track all leave balance changes for audit trail.
"""

from app.extensions import db
from datetime import datetime


class LeaveBalanceHistory(db.Model):
    """
    Tracks all changes to leave balances.
    Provides complete audit trail for balance modifications.
    """
    __tablename__ = 'leave_balance_history'

    id = db.Column(db.Integer, primary_key=True)

    # User reference
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    # Leave type reference (optional - null for general balance)
    leave_type_id = db.Column(db.Integer, db.ForeignKey('leave_types.id'), index=True)

    # Change details
    change_type = db.Column(db.String(30), nullable=False, index=True)  # accrual, used, adjustment, carry_over, expired, encashment
    amount = db.Column(db.Float, nullable=False)  # positive = credit, negative = debit

    # Balance tracking
    balance_before = db.Column(db.Float)
    balance_after = db.Column(db.Float)

    # Related leave request (if applicable)
    leave_id = db.Column(db.Integer, db.ForeignKey('leaves.id'), index=True)

    # Additional info
    reason = db.Column(db.Text)

    # Who made the adjustment (for manual adjustments)
    adjusted_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    # Timestamp
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship('User', foreign_keys=[user_id], backref='balance_history')
    leave_type = db.relationship('LeaveType', foreign_keys=[leave_type_id], overlaps='balance_history,leave_type_ref')
    leave = db.relationship('Leave', foreign_keys=[leave_id], backref='balance_changes')
    adjusted_by = db.relationship('User', foreign_keys=[adjusted_by_id])

    __table_args__ = (
        db.CheckConstraint(
            "change_type IN ('accrual', 'used', 'adjustment', 'carry_over', 'expired', 'encashment')",
            name='check_valid_balance_change_type'
        ),
        db.Index('ix_leave_balance_history_user_type', 'user_id', 'leave_type_id'),
        db.Index('ix_leave_balance_history_user_created', 'user_id', 'created_at'),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary with language support."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'leave_type_id': self.leave_type_id,
            'leave_type': self.leave_type.to_dict(language) if self.leave_type else None,
            'change_type': self.change_type,
            'amount': self.amount,
            'balance_before': self.balance_before,
            'balance_after': self.balance_after,
            'leave_id': self.leave_id,
            'reason': self.reason,
            'adjusted_by_id': self.adjusted_by_id,
            'adjusted_by': self.adjusted_by.to_dict() if self.adjusted_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<LeaveBalanceHistory user={self.user_id} {self.change_type}: {self.amount}>'
