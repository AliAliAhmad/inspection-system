"""
Capacity Config model for capacity planning rules.
Defines work limits, overtime rules, and scheduling constraints.
"""

from app.extensions import db
from datetime import datetime


class CapacityConfig(db.Model):
    """
    Configuration for workforce capacity planning.
    Defines work limits and scheduling constraints per role/shift.
    """
    __tablename__ = 'capacity_configs'

    id = db.Column(db.Integer, primary_key=True)

    # Configuration name
    name = db.Column(db.String(100), nullable=False)

    # Role filter (null = applies to all roles)
    role = db.Column(db.String(50))

    # Shift filter (null = applies to all shifts)
    shift = db.Column(db.String(20))  # day, night

    # Work limits
    max_hours_per_day = db.Column(db.Float, default=8)
    max_jobs_per_day = db.Column(db.Integer, default=5)

    # Rest requirements
    min_rest_hours = db.Column(db.Float, default=12)  # Minimum hours between shifts

    # Overtime rules
    overtime_threshold_hours = db.Column(db.Float, default=8)  # Hours after which overtime starts
    max_overtime_hours = db.Column(db.Float, default=4)  # Maximum overtime allowed

    # Break configuration
    break_duration_minutes = db.Column(db.Integer, default=60)
    break_after_hours = db.Column(db.Float, default=4)  # Hours of work before break

    # Concurrent work
    concurrent_jobs_allowed = db.Column(db.Integer, default=1)

    # Status
    is_active = db.Column(db.Boolean, default=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "shift IN ('day', 'night') OR shift IS NULL",
            name='check_capacity_shift'
        ),
    )

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'name': self.name,
            'role': self.role,
            'shift': self.shift,
            'max_hours_per_day': self.max_hours_per_day,
            'max_jobs_per_day': self.max_jobs_per_day,
            'min_rest_hours': self.min_rest_hours,
            'overtime_threshold_hours': self.overtime_threshold_hours,
            'max_overtime_hours': self.max_overtime_hours,
            'break_duration_minutes': self.break_duration_minutes,
            'break_after_hours': self.break_after_hours,
            'concurrent_jobs_allowed': self.concurrent_jobs_allowed,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<CapacityConfig {self.name} role={self.role} shift={self.shift}>'
