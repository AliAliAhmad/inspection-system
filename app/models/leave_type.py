"""
Leave Type Model
Configurable leave types with rules and settings.
"""

from app.extensions import db
from datetime import datetime


class LeaveType(db.Model):
    """
    Configurable leave types for the organization.
    Supports system types (sick, annual, emergency, training, other)
    and custom types defined by admin.
    """
    __tablename__ = 'leave_types'

    id = db.Column(db.Integer, primary_key=True)

    # Type identification
    code = db.Column(db.String(20), unique=True, nullable=False, index=True)  # sick, annual, emergency, training, other, custom
    name = db.Column(db.String(100), nullable=False)
    name_ar = db.Column(db.String(100))
    description = db.Column(db.Text)

    # Display settings
    color = db.Column(db.String(7), default='#1976D2')  # hex color
    icon = db.Column(db.String(50))  # icon name (e.g., 'medical-bag', 'beach')

    # Certificate requirements
    requires_certificate = db.Column(db.Boolean, default=False)  # medical cert for sick leave
    certificate_after_days = db.Column(db.Integer, default=3)  # require certificate after X days

    # Leave limits
    max_consecutive_days = db.Column(db.Integer)  # max days per single request
    max_per_year = db.Column(db.Integer)  # max times this type can be used per year

    # Notice requirements
    advance_notice_days = db.Column(db.Integer, default=0)  # required advance notice in days

    # Payment and status
    is_paid = db.Column(db.Boolean, default=True)
    is_active = db.Column(db.Boolean, default=True, index=True)
    is_system = db.Column(db.Boolean, default=True)  # system types cannot be deleted

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    leaves = db.relationship('Leave', backref='leave_type_ref', lazy='dynamic')
    balance_history = db.relationship('LeaveBalanceHistory', backref='leave_type_ref', lazy='dynamic')
    encashments = db.relationship('LeaveEncashment', backref='leave_type_ref', lazy='dynamic')

    __table_args__ = (
        db.CheckConstraint(
            "certificate_after_days >= 0",
            name='check_certificate_after_days_positive'
        ),
        db.CheckConstraint(
            "max_consecutive_days IS NULL OR max_consecutive_days > 0",
            name='check_max_consecutive_days_positive'
        ),
        db.CheckConstraint(
            "max_per_year IS NULL OR max_per_year > 0",
            name='check_max_per_year_positive'
        ),
        db.CheckConstraint(
            "advance_notice_days >= 0",
            name='check_advance_notice_days_non_negative'
        ),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary with language support."""
        name = self.name_ar if language == 'ar' and self.name_ar else self.name

        return {
            'id': self.id,
            'code': self.code,
            'name': name,
            'name_en': self.name,
            'name_ar': self.name_ar,
            'description': self.description,
            'color': self.color,
            'icon': self.icon,
            'requires_certificate': self.requires_certificate,
            'certificate_after_days': self.certificate_after_days,
            'max_consecutive_days': self.max_consecutive_days,
            'max_per_year': self.max_per_year,
            'advance_notice_days': self.advance_notice_days,
            'is_paid': self.is_paid,
            'is_active': self.is_active,
            'is_system': self.is_system,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def __repr__(self):
        return f'<LeaveType {self.code}: {self.name}>'
