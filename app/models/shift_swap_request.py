"""
Shift Swap Request model.
Allows users to request swapping shifts with colleagues.
"""

from datetime import datetime
from app.extensions import db


class ShiftSwapRequest(db.Model):
    """Shift swap request between two users."""

    __tablename__ = 'shift_swap_requests'

    id = db.Column(db.Integer, primary_key=True)

    # Requester info
    requester_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    requester_date = db.Column(db.Date, nullable=False)
    requester_shift = db.Column(db.String(20), nullable=False)  # day, night, off

    # Target user (who they want to swap with)
    target_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    target_date = db.Column(db.Date, nullable=False)
    target_shift = db.Column(db.String(20), nullable=False)  # day, night, off

    # Request details
    reason = db.Column(db.Text)
    status = db.Column(db.String(20), default='pending')  # pending, approved, rejected, cancelled

    # Target user response
    target_response = db.Column(db.String(20))  # accepted, declined
    target_response_at = db.Column(db.DateTime)

    # Admin approval
    approved_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    approved_at = db.Column(db.DateTime)
    rejection_reason = db.Column(db.Text)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    requester = db.relationship('User', foreign_keys=[requester_id], backref='swap_requests_made')
    target_user = db.relationship('User', foreign_keys=[target_user_id], backref='swap_requests_received')
    approved_by = db.relationship('User', foreign_keys=[approved_by_id])

    def to_dict(self):
        return {
            'id': self.id,
            'requester': {
                'id': self.requester_id,
                'full_name': self.requester.full_name if self.requester else None,
                'role': self.requester.role if self.requester else None,
            },
            'requester_date': self.requester_date.isoformat() if self.requester_date else None,
            'requester_shift': self.requester_shift,
            'target_user': {
                'id': self.target_user_id,
                'full_name': self.target_user.full_name if self.target_user else None,
                'role': self.target_user.role if self.target_user else None,
            },
            'target_date': self.target_date.isoformat() if self.target_date else None,
            'target_shift': self.target_shift,
            'reason': self.reason,
            'status': self.status,
            'target_response': self.target_response,
            'target_response_at': self.target_response_at.isoformat() if self.target_response_at else None,
            'approved_by': {
                'id': self.approved_by_id,
                'full_name': self.approved_by.full_name if self.approved_by else None,
            } if self.approved_by_id else None,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'rejection_reason': self.rejection_reason,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
