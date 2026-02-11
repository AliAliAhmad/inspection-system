"""
Performance Goal model for tracking personal performance goals.
"""

from app.extensions import db
from datetime import datetime, date


class PerformanceGoal(db.Model):
    """
    Personal performance goal for gamification and motivation.
    """
    __tablename__ = 'performance_goals'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    # Goal definition
    goal_type = db.Column(db.String(50), nullable=False)  # jobs, points, streak, rating
    target_value = db.Column(db.Float, nullable=False)
    current_value = db.Column(db.Float, default=0, nullable=False)

    # Period
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)

    # Status
    status = db.Column(db.String(20), default='active', nullable=False)
    # active, completed, failed, cancelled

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    completed_at = db.Column(db.DateTime, nullable=True)

    # Relationships
    user = db.relationship('User', backref='performance_goals')

    __table_args__ = (
        db.CheckConstraint(
            "goal_type IN ('jobs', 'points', 'streak', 'rating', 'inspections', 'defects')",
            name='check_valid_goal_type'
        ),
        db.CheckConstraint(
            "status IN ('active', 'completed', 'failed', 'cancelled')",
            name='check_valid_goal_status'
        ),
    )

    @property
    def progress_percentage(self):
        """Calculate progress percentage."""
        if self.target_value <= 0:
            return 0
        return min(100, round((self.current_value / self.target_value) * 100, 1))

    @property
    def days_remaining(self):
        """Calculate days remaining until deadline."""
        if self.end_date:
            remaining = (self.end_date - date.today()).days
            return max(0, remaining)
        return 0

    @property
    def is_on_track(self):
        """Check if goal is on track based on time elapsed."""
        if self.status != 'active':
            return None

        total_days = (self.end_date - self.start_date).days
        days_elapsed = (date.today() - self.start_date).days

        if total_days <= 0:
            return self.progress_percentage >= 100

        expected_progress = (days_elapsed / total_days) * 100
        return self.progress_percentage >= expected_progress * 0.9  # 10% tolerance

    def check_completion(self):
        """Check if goal is completed and update status."""
        if self.current_value >= self.target_value:
            self.status = 'completed'
            self.completed_at = datetime.utcnow()
            return True
        if date.today() > self.end_date and self.status == 'active':
            self.status = 'failed'
            return False
        return None

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'goal_type': self.goal_type,
            'target_value': self.target_value,
            'current_value': self.current_value,
            'progress_percentage': self.progress_percentage,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'days_remaining': self.days_remaining,
            'status': self.status,
            'is_on_track': self.is_on_track,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }

    def __repr__(self):
        return f'<PerformanceGoal {self.id} user:{self.user_id} {self.goal_type}>'
