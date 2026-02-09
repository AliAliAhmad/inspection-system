"""
Challenge model for weekly/monthly challenges.
"""

from app.extensions import db
from datetime import datetime, date


class Challenge(db.Model):
    """Weekly/Monthly challenges"""
    __tablename__ = 'challenges'

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    name_ar = db.Column(db.String(100))
    description = db.Column(db.Text)
    description_ar = db.Column(db.Text)

    challenge_type = db.Column(db.String(20))  # 'weekly', 'monthly', 'special'
    target_type = db.Column(db.String(50))  # 'inspections', 'jobs', 'defects', 'rating'
    target_value = db.Column(db.Integer, nullable=False)
    points_reward = db.Column(db.Integer, default=100)

    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)

    is_active = db.Column(db.Boolean, default=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Filter challenges by role
    eligible_roles = db.Column(db.JSON)  # ['inspector', 'engineer'] or null for all

    # Relationships
    created_by = db.relationship('User', foreign_keys=[created_by_id])

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "challenge_type IN ('weekly', 'monthly', 'special') OR challenge_type IS NULL",
            name='check_valid_challenge_type'
        ),
        db.CheckConstraint(
            "target_type IN ('inspections', 'jobs', 'defects', 'rating') OR target_type IS NULL",
            name='check_valid_target_type'
        ),
    )

    @property
    def is_expired(self):
        """Check if challenge is expired."""
        return date.today() > self.end_date

    @property
    def is_started(self):
        """Check if challenge has started."""
        return date.today() >= self.start_date

    @property
    def days_remaining(self):
        """Get days remaining until challenge ends."""
        if self.is_expired:
            return 0
        return (self.end_date - date.today()).days

    def to_dict(self, language='en'):
        """Convert challenge to dictionary."""
        return {
            'id': self.id,
            'code': self.code,
            'name': self.name_ar if language == 'ar' and self.name_ar else self.name,
            'description': self.description_ar if language == 'ar' and self.description_ar else self.description,
            'challenge_type': self.challenge_type,
            'target_type': self.target_type,
            'target_value': self.target_value,
            'points_reward': self.points_reward,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'is_active': self.is_active,
            'is_expired': self.is_expired,
            'is_started': self.is_started,
            'days_remaining': self.days_remaining,
            'eligible_roles': self.eligible_roles,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<Challenge {self.code} ({self.challenge_type})>'
