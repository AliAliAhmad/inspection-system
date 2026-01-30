"""
Leave management model.
Tracks employee leave requests, approvals, and coverage assignments.
"""

from app.extensions import db
from datetime import datetime


class Leave(db.Model):
    """
    Employee leave request and tracking.
    Supports 5 leave types with coverage assignment for inspectors.
    """
    __tablename__ = 'leaves'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Leave details
    leave_type = db.Column(db.String(30), nullable=False)  # sick, annual, emergency, training, other
    other_reason = db.Column(db.Text, nullable=True)  # Required if leave_type is 'other'
    date_from = db.Column(db.Date, nullable=False)
    date_to = db.Column(db.Date, nullable=False)
    total_days = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.Text, nullable=True)

    # Scope: major role only or all roles
    scope = db.Column(db.String(20), default='major_only')  # 'major_only' or 'full'

    # Approval
    status = db.Column(db.String(20), default='pending')  # pending, approved, rejected
    approved_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)
    rejection_reason = db.Column(db.Text, nullable=True)

    # Coverage assignment (for inspectors)
    coverage_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = db.relationship('User', foreign_keys=[user_id], backref='leaves')
    approved_by = db.relationship('User', foreign_keys=[approved_by_id])
    coverage_user = db.relationship('User', foreign_keys=[coverage_user_id])

    __table_args__ = (
        db.CheckConstraint(
            "leave_type IN ('sick', 'annual', 'emergency', 'training', 'other')",
            name='check_valid_leave_type'
        ),
        db.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name='check_valid_leave_status'
        ),
        db.CheckConstraint(
            "scope IN ('major_only', 'full')",
            name='check_valid_leave_scope'
        ),
        db.CheckConstraint(
            "date_to >= date_from",
            name='check_valid_leave_dates'
        ),
    )

    def to_dict(self, language='en'):
        from app.utils.bilingual import get_bilingual_fields
        text_fields = {}
        if self.reason:
            text_fields['reason'] = self.reason
        if self.rejection_reason:
            text_fields['rejection_reason'] = self.rejection_reason

        translated = get_bilingual_fields('leave', self.id, text_fields, language) if text_fields else {}

        return {
            'id': self.id,
            'user_id': self.user_id,
            'user': self.user.to_dict() if self.user else None,
            'leave_type': self.leave_type,
            'other_reason': self.other_reason,
            'date_from': self.date_from.isoformat() if self.date_from else None,
            'date_to': self.date_to.isoformat() if self.date_to else None,
            'total_days': self.total_days,
            'reason': translated.get('reason', self.reason),
            'scope': self.scope,
            'status': self.status,
            'approved_by_id': self.approved_by_id,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'rejection_reason': translated.get('rejection_reason', self.rejection_reason),
            'coverage_user_id': self.coverage_user_id,
            'coverage_user': self.coverage_user.to_dict() if self.coverage_user else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<Leave {self.user_id} {self.leave_type} {self.date_from}-{self.date_to}>'
