"""
Leave Calendar Model
Public holidays and company-specific non-working days.
"""

from app.extensions import db
from datetime import datetime


class LeaveCalendar(db.Model):
    """
    Calendar of holidays and special days.
    Used to exclude holidays from leave day calculations.
    """
    __tablename__ = 'leave_calendar'

    id = db.Column(db.Integer, primary_key=True)

    # Date information
    date = db.Column(db.Date, unique=True, nullable=False, index=True)
    year = db.Column(db.Integer, nullable=False, index=True)

    # Holiday details
    name = db.Column(db.String(100), nullable=False)
    name_ar = db.Column(db.String(100))

    # Holiday type
    holiday_type = db.Column(db.String(30))  # public, religious, company

    # Working day status
    is_working_day = db.Column(db.Boolean, default=False)  # False = holiday (no work)

    # Timestamp
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.CheckConstraint(
            "holiday_type IS NULL OR holiday_type IN ('public', 'religious', 'company')",
            name='check_valid_holiday_type'
        ),
        db.Index('ix_leave_calendar_year_date', 'year', 'date'),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary with language support."""
        name = self.name_ar if language == 'ar' and self.name_ar else self.name

        return {
            'id': self.id,
            'date': self.date.isoformat() if self.date else None,
            'year': self.year,
            'name': name,
            'name_en': self.name,
            'name_ar': self.name_ar,
            'holiday_type': self.holiday_type,
            'is_working_day': self.is_working_day,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    @staticmethod
    def is_holiday(date):
        """Check if a specific date is a holiday."""
        entry = LeaveCalendar.query.filter_by(date=date).first()
        return entry is not None and not entry.is_working_day

    @staticmethod
    def get_holidays_in_range(start_date, end_date):
        """Get all holidays within a date range."""
        return LeaveCalendar.query.filter(
            LeaveCalendar.date >= start_date,
            LeaveCalendar.date <= end_date,
            LeaveCalendar.is_working_day == False
        ).all()

    @staticmethod
    def count_holidays_in_range(start_date, end_date):
        """Count holidays within a date range."""
        return LeaveCalendar.query.filter(
            LeaveCalendar.date >= start_date,
            LeaveCalendar.date <= end_date,
            LeaveCalendar.is_working_day == False
        ).count()

    def __repr__(self):
        status = 'working' if self.is_working_day else 'holiday'
        return f'<LeaveCalendar {self.date}: {self.name} ({status})>'
