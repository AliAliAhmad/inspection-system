"""
Maintenance Cycle model for configurable PM cycles.
Supports running hours (250, 500, 1000, etc.) and calendar-based (weekly, monthly, etc.) cycles.
"""

from app.extensions import db
from datetime import datetime


class MaintenanceCycle(db.Model):
    """
    Configurable maintenance cycle definitions.
    Used for PM scheduling and template linking.
    """
    __tablename__ = 'maintenance_cycles'

    id = db.Column(db.Integer, primary_key=True)

    # Cycle identification
    name = db.Column(db.String(100), nullable=False, unique=True)  # e.g., "250h", "monthly"
    name_ar = db.Column(db.String(100))

    # Cycle type
    cycle_type = db.Column(db.String(20), nullable=False)  # running_hours, calendar

    # Value based on type
    hours_value = db.Column(db.Integer)  # For running_hours: 250, 500, 1000, etc.
    calendar_value = db.Column(db.Integer)  # For calendar: number value
    calendar_unit = db.Column(db.String(20))  # days, weeks, months

    # Display labels
    display_label = db.Column(db.String(50))  # e.g., "250 Hours", "3 Weeks"
    display_label_ar = db.Column(db.String(50))

    # Status
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    is_system = db.Column(db.Boolean, default=False, nullable=False)  # System cycles cannot be deleted

    # Display order
    sort_order = db.Column(db.Integer, default=0)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "cycle_type IN ('running_hours', 'calendar')",
            name='check_cycle_type'
        ),
        db.CheckConstraint(
            "calendar_unit IN ('days', 'weeks', 'months') OR calendar_unit IS NULL",
            name='check_calendar_unit'
        ),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'name': self.name,
            'name_ar': self.name_ar,
            'cycle_type': self.cycle_type,
            'hours_value': self.hours_value,
            'calendar_value': self.calendar_value,
            'calendar_unit': self.calendar_unit,
            'display_label': self.display_label_ar if language == 'ar' and self.display_label_ar else self.display_label,
            'display_label_en': self.display_label,
            'display_label_ar': self.display_label_ar,
            'is_active': self.is_active,
            'is_system': self.is_system,
            'sort_order': self.sort_order,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    @staticmethod
    def get_by_value(cycle_type, value, unit=None):
        """
        Find a cycle by its value.
        For running_hours: match hours_value
        For calendar: match calendar_value and calendar_unit
        """
        query = MaintenanceCycle.query.filter_by(cycle_type=cycle_type, is_active=True)

        if cycle_type == 'running_hours':
            return query.filter_by(hours_value=value).first()
        else:
            return query.filter_by(calendar_value=value, calendar_unit=unit).first()

    def __repr__(self):
        return f'<MaintenanceCycle {self.name} ({self.cycle_type})>'
