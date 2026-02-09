"""
UserStreak model for tracking user work streaks.
"""

from app.extensions import db
from datetime import date


class UserStreak(db.Model):
    """Track user work streaks"""
    __tablename__ = 'user_streaks'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)
    current_streak = db.Column(db.Integer, default=0)
    longest_streak = db.Column(db.Integer, default=0)
    last_activity_date = db.Column(db.Date)
    streak_start_date = db.Column(db.Date)
    total_active_days = db.Column(db.Integer, default=0)

    user = db.relationship('User', backref=db.backref('streak_info', uselist=False))

    def update_streak(self, activity_date=None):
        """Update streak based on activity date."""
        if activity_date is None:
            activity_date = date.today()

        if self.last_activity_date is None:
            # First activity
            self.current_streak = 1
            self.streak_start_date = activity_date
        elif activity_date == self.last_activity_date:
            # Same day, no change
            return
        elif (activity_date - self.last_activity_date).days == 1:
            # Consecutive day
            self.current_streak += 1
        elif (activity_date - self.last_activity_date).days > 1:
            # Streak broken
            self.current_streak = 1
            self.streak_start_date = activity_date

        self.last_activity_date = activity_date
        self.total_active_days += 1

        # Update longest streak if needed
        if self.current_streak > self.longest_streak:
            self.longest_streak = self.current_streak

    def to_dict(self):
        """Convert user streak to dictionary."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'current_streak': self.current_streak,
            'longest_streak': self.longest_streak,
            'last_activity_date': self.last_activity_date.isoformat() if self.last_activity_date else None,
            'streak_start_date': self.streak_start_date.isoformat() if self.streak_start_date else None,
            'total_active_days': self.total_active_days,
        }

    def __repr__(self):
        return f'<UserStreak user={self.user_id} current={self.current_streak} longest={self.longest_streak}>'
