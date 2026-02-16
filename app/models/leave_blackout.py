"""
Leave Blackout Model
Blackout periods when leave is not allowed.
"""

from app.extensions import db
from datetime import datetime


class LeaveBlackout(db.Model):
    """
    Blackout periods where leave requests are not permitted.
    Can be applied to all employees or specific roles.
    """
    __tablename__ = 'leave_blackouts'

    id = db.Column(db.Integer, primary_key=True)

    # Blackout period details
    name = db.Column(db.String(100), nullable=False)
    name_ar = db.Column(db.String(100))

    # Date range
    date_from = db.Column(db.Date, nullable=False)
    date_to = db.Column(db.Date, nullable=False)

    # Reason for blackout
    reason = db.Column(db.Text)

    # Applicability
    applies_to_roles = db.Column(db.JSON)  # null = all roles, or list like ['inspector', 'specialist']
    exception_user_ids = db.Column(db.JSON)  # list of user IDs exempt from this blackout

    # Status
    is_active = db.Column(db.Boolean, default=True, index=True)

    # Created by
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    # Timestamp
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    created_by = db.relationship('User', backref='created_blackouts')

    __table_args__ = (
        db.CheckConstraint(
            "date_to >= date_from",
            name='check_blackout_valid_dates'
        ),
        db.Index('ix_leave_blackouts_date_range', 'date_from', 'date_to'),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary with language support."""
        name = self.name_ar if language == 'ar' and self.name_ar else self.name

        return {
            'id': self.id,
            'name': name,
            'name_en': self.name,
            'name_ar': self.name_ar,
            'date_from': self.date_from.isoformat() if self.date_from else None,
            'date_to': self.date_to.isoformat() if self.date_to else None,
            'reason': self.reason,
            'applies_to_roles': self.applies_to_roles,
            'exception_user_ids': self.exception_user_ids,
            'is_active': self.is_active,
            'created_by_id': self.created_by_id,
            'created_by': self.created_by.to_dict() if self.created_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def applies_to_user(self, user):
        """Check if this blackout applies to a specific user."""
        # Check if user is in exception list
        if self.exception_user_ids and user.id in self.exception_user_ids:
            return False

        # If no role restriction, applies to all
        if not self.applies_to_roles:
            return True

        # Check if user's role is in the list
        return user.role in self.applies_to_roles

    def overlaps_with_dates(self, start_date, end_date):
        """Check if the blackout period overlaps with given dates."""
        return not (end_date < self.date_from or start_date > self.date_to)

    def __repr__(self):
        return f'<LeaveBlackout {self.name}: {self.date_from} to {self.date_to}>'
