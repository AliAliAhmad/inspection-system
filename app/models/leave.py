"""
Leave management model.
Tracks employee leave requests, approvals, and coverage assignments.
"""

from app.extensions import db
from datetime import datetime


class Leave(db.Model):
    """
    Employee leave request and tracking.
    Supports configurable leave types with coverage assignment for inspectors.
    Enhanced with half-day leaves, certificates, cancellation, and extensions.
    """
    __tablename__ = 'leaves'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    # Leave details
    leave_type = db.Column(db.String(30), nullable=False)  # sick, annual, emergency, training, other
    leave_type_id = db.Column(db.Integer, db.ForeignKey('leave_types.id'), index=True)  # FK to configurable leave types
    other_reason = db.Column(db.Text, nullable=True)  # Required if leave_type is 'other'
    date_from = db.Column(db.Date, nullable=False, index=True)
    date_to = db.Column(db.Date, nullable=False, index=True)
    total_days = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.Text, nullable=True)

    # Half-day and hourly leave support
    is_half_day = db.Column(db.Boolean, default=False)
    half_day_period = db.Column(db.String(10))  # 'morning' or 'afternoon'
    requested_hours = db.Column(db.Float)  # for hourly leave requests

    # Scope: major role only or all roles
    scope = db.Column(db.String(20), default='major_only')  # 'major_only' or 'full'

    # Certificate/Document support
    certificate_file_id = db.Column(db.Integer, db.ForeignKey('files.id'))  # medical cert, etc.

    # Approval
    status = db.Column(db.String(20), default='pending', index=True)  # pending, approved, rejected, cancelled
    approved_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)
    rejection_reason = db.Column(db.Text, nullable=True)

    # Cancellation support
    cancellation_requested = db.Column(db.Boolean, default=False)
    cancellation_reason = db.Column(db.Text)
    cancelled_at = db.Column(db.DateTime)

    # Extension support (self-reference for extending existing leave)
    extension_of_id = db.Column(db.Integer, db.ForeignKey('leaves.id'))

    # Coverage assignment (for inspectors)
    coverage_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = db.relationship('User', foreign_keys=[user_id], backref='leaves')
    approved_by = db.relationship('User', foreign_keys=[approved_by_id])
    coverage_user = db.relationship('User', foreign_keys=[coverage_user_id])
    certificate_file = db.relationship('File', foreign_keys=[certificate_file_id])
    extension_of = db.relationship('Leave', remote_side=[id], backref='extensions', foreign_keys=[extension_of_id])

    __table_args__ = (
        db.CheckConstraint(
            "leave_type IN ('sick', 'annual', 'emergency', 'training', 'other', 'compensatory', 'custom')",
            name='check_valid_leave_type'
        ),
        db.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'cancelled')",
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
        db.CheckConstraint(
            "half_day_period IS NULL OR half_day_period IN ('morning', 'afternoon')",
            name='check_valid_half_day_period'
        ),
        db.CheckConstraint(
            "requested_hours IS NULL OR requested_hours > 0",
            name='check_requested_hours_positive'
        ),
        db.Index('ix_leaves_user_dates', 'user_id', 'date_from', 'date_to'),
        db.Index('ix_leaves_status_dates', 'status', 'date_from'),
    )

    def to_dict(self, language='en'):
        from app.utils.bilingual import get_bilingual_fields
        text_fields = {}
        if self.reason:
            text_fields['reason'] = self.reason
        if self.rejection_reason:
            text_fields['rejection_reason'] = self.rejection_reason
        if self.cancellation_reason:
            text_fields['cancellation_reason'] = self.cancellation_reason

        translated = get_bilingual_fields('leave', self.id, text_fields, language) if text_fields else {}

        return {
            'id': self.id,
            'user_id': self.user_id,
            'user': self.user.to_dict() if self.user else None,
            'leave_type': self.leave_type,
            'leave_type_id': self.leave_type_id,
            'leave_type_ref': self.leave_type_ref.to_dict(language) if self.leave_type_ref else None,
            'other_reason': self.other_reason,
            'date_from': self.date_from.isoformat() if self.date_from else None,
            'date_to': self.date_to.isoformat() if self.date_to else None,
            'total_days': self.total_days,
            'reason': translated.get('reason', self.reason),
            'is_half_day': self.is_half_day,
            'half_day_period': self.half_day_period,
            'requested_hours': self.requested_hours,
            'scope': self.scope,
            'certificate_file_id': self.certificate_file_id,
            'certificate_file': self.certificate_file.to_dict() if self.certificate_file else None,
            'status': self.status,
            'approved_by_id': self.approved_by_id,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'rejection_reason': translated.get('rejection_reason', self.rejection_reason),
            'cancellation_requested': self.cancellation_requested,
            'cancellation_reason': translated.get('cancellation_reason', self.cancellation_reason),
            'cancelled_at': self.cancelled_at.isoformat() if self.cancelled_at else None,
            'extension_of_id': self.extension_of_id,
            'coverage_user_id': self.coverage_user_id,
            'coverage_user': self.coverage_user.to_dict() if self.coverage_user else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def __repr__(self):
        return f'<Leave {self.user_id} {self.leave_type} {self.date_from}-{self.date_to}>'
