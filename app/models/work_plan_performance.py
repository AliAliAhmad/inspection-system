"""
Work Plan Performance model.
Pre-computed performance aggregates per worker per period (daily/weekly/monthly).
"""

from app.extensions import db
from datetime import datetime


class WorkPlanPerformance(db.Model):
    """
    Aggregated performance stats per worker.
    Computed at end of day/week/month for fast dashboard loading.
    """
    __tablename__ = 'work_plan_performances'

    id = db.Column(db.Integer, primary_key=True)

    # Worker
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    # Period
    period_type = db.Column(db.String(10), nullable=False, index=True)
    # daily, weekly, monthly
    period_start = db.Column(db.Date, nullable=False)
    period_end = db.Column(db.Date, nullable=False)

    # Job counts
    total_jobs_assigned = db.Column(db.Integer, default=0, nullable=False)
    total_jobs_completed = db.Column(db.Integer, default=0, nullable=False)
    total_jobs_incomplete = db.Column(db.Integer, default=0, nullable=False)
    total_jobs_not_started = db.Column(db.Integer, default=0, nullable=False)
    total_jobs_carried_over = db.Column(db.Integer, default=0, nullable=False)

    # Hours
    total_estimated_hours = db.Column(db.Numeric(7, 2), default=0, nullable=False)
    total_actual_hours = db.Column(db.Numeric(7, 2), default=0, nullable=False)

    # Average ratings
    avg_time_rating = db.Column(db.Numeric(3, 1), nullable=True)
    avg_qc_rating = db.Column(db.Numeric(3, 1), nullable=True)
    avg_cleaning_rating = db.Column(db.Numeric(3, 1), nullable=True)

    # Completion rate (percentage)
    completion_rate = db.Column(db.Numeric(5, 2), default=0, nullable=False)

    # Points
    total_points_earned = db.Column(db.Integer, default=0, nullable=False)

    # Streak tracking
    current_streak_days = db.Column(db.Integer, default=0, nullable=False)
    max_streak_days = db.Column(db.Integer, default=0, nullable=False)

    # Pause stats
    total_pauses = db.Column(db.Integer, default=0, nullable=False)
    total_pause_minutes = db.Column(db.Integer, default=0, nullable=False)

    # Late start count
    late_starts = db.Column(db.Integer, default=0, nullable=False)

    # Material efficiency (if applicable)
    materials_planned = db.Column(db.Integer, default=0, nullable=False)
    materials_consumed = db.Column(db.Integer, default=0, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship('User', foreign_keys=[user_id])

    __table_args__ = (
        db.UniqueConstraint('user_id', 'period_type', 'period_start', name='unique_user_period_performance'),
        db.CheckConstraint(
            "period_type IN ('daily', 'weekly', 'monthly')",
            name='check_valid_performance_period_type'
        ),
    )

    @property
    def time_efficiency(self):
        """Calculate time efficiency (estimated / actual). >1 means faster than expected."""
        if not self.total_actual_hours or float(self.total_actual_hours) == 0:
            return None
        return round(float(self.total_estimated_hours) / float(self.total_actual_hours), 2)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user': {
                'id': self.user.id,
                'full_name': self.user.full_name,
                'role': self.user.role,
            } if self.user else None,
            'period_type': self.period_type,
            'period_start': self.period_start.isoformat() if self.period_start else None,
            'period_end': self.period_end.isoformat() if self.period_end else None,
            'total_jobs_assigned': self.total_jobs_assigned,
            'total_jobs_completed': self.total_jobs_completed,
            'total_jobs_incomplete': self.total_jobs_incomplete,
            'total_jobs_not_started': self.total_jobs_not_started,
            'total_jobs_carried_over': self.total_jobs_carried_over,
            'total_estimated_hours': float(self.total_estimated_hours) if self.total_estimated_hours else 0,
            'total_actual_hours': float(self.total_actual_hours) if self.total_actual_hours else 0,
            'avg_time_rating': float(self.avg_time_rating) if self.avg_time_rating else None,
            'avg_qc_rating': float(self.avg_qc_rating) if self.avg_qc_rating else None,
            'avg_cleaning_rating': float(self.avg_cleaning_rating) if self.avg_cleaning_rating else None,
            'completion_rate': float(self.completion_rate) if self.completion_rate else 0,
            'time_efficiency': self.time_efficiency,
            'total_points_earned': self.total_points_earned,
            'current_streak_days': self.current_streak_days,
            'max_streak_days': self.max_streak_days,
            'total_pauses': self.total_pauses,
            'total_pause_minutes': self.total_pause_minutes,
            'late_starts': self.late_starts,
            'materials_planned': self.materials_planned,
            'materials_consumed': self.materials_consumed,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<WorkPlanPerformance user:{self.user_id} {self.period_type} {self.period_start}>'
