"""
Work Plan Job Rating model.
Individual performance rating per worker per job.
Lead gets full rating, helpers get shared/adjustable rating.
"""

from app.extensions import db
from datetime import datetime


class WorkPlanJobRating(db.Model):
    """
    Performance rating for a worker on a specific work plan job.
    One rating per worker per job. Includes time, QC, cleaning, and admin bonus.
    """
    __tablename__ = 'work_plan_job_ratings'

    id = db.Column(db.Integer, primary_key=True)

    # Job + Worker (unique together)
    work_plan_job_id = db.Column(db.Integer, db.ForeignKey('work_plan_jobs.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    is_lead = db.Column(db.Boolean, default=False, nullable=False)

    # Time rating (auto-calculated, 1-7 stars)
    time_rating = db.Column(db.Numeric(3, 1), nullable=True)
    # Override by engineer
    time_rating_override = db.Column(db.Numeric(3, 1), nullable=True)
    time_rating_override_reason = db.Column(db.Text, nullable=True)
    time_rating_override_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    # Admin approval for override
    time_rating_override_approved = db.Column(db.Boolean, nullable=True)
    time_rating_override_approved_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    time_rating_override_approved_at = db.Column(db.DateTime, nullable=True)

    # QC rating (engineer gives)
    qc_rating = db.Column(db.Numeric(3, 1), nullable=True)
    qc_reason = db.Column(db.Text, nullable=True)  # Required if < 3 or > 4
    qc_voice_file_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=True)

    # Cleaning rating (0-2 stars, engineer gives)
    cleaning_rating = db.Column(db.Integer, nullable=True)

    # Admin bonus (0-10, admin gives anytime)
    admin_bonus = db.Column(db.Integer, default=0, nullable=False)
    admin_bonus_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    admin_bonus_notes = db.Column(db.Text, nullable=True)

    # Total points earned for this job
    points_earned = db.Column(db.Integer, default=0, nullable=False)

    # Dispute tracking
    is_disputed = db.Column(db.Boolean, default=False, nullable=False)
    dispute_reason = db.Column(db.Text, nullable=True)
    dispute_filed_at = db.Column(db.DateTime, nullable=True)
    dispute_resolved = db.Column(db.Boolean, nullable=True)
    dispute_resolved_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    dispute_resolved_at = db.Column(db.DateTime, nullable=True)
    dispute_resolution = db.Column(db.Text, nullable=True)

    # Who rated and when
    rated_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    rated_at = db.Column(db.DateTime, nullable=True)

    # Part of which daily review
    daily_review_id = db.Column(db.Integer, db.ForeignKey('work_plan_daily_reviews.id'), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship('User', foreign_keys=[user_id])
    rater = db.relationship('User', foreign_keys=[rated_by_id])
    time_rating_overrider = db.relationship('User', foreign_keys=[time_rating_override_by_id])
    time_rating_approver = db.relationship('User', foreign_keys=[time_rating_override_approved_by_id])
    admin_bonus_giver = db.relationship('User', foreign_keys=[admin_bonus_by_id])
    dispute_resolver = db.relationship('User', foreign_keys=[dispute_resolved_by_id])
    qc_voice_file = db.relationship('File', foreign_keys=[qc_voice_file_id])

    __table_args__ = (
        db.UniqueConstraint('work_plan_job_id', 'user_id', name='unique_wp_job_user_rating'),
        db.CheckConstraint(
            "(time_rating >= 1 AND time_rating <= 7) OR time_rating IS NULL",
            name='check_valid_wp_time_rating'
        ),
        db.CheckConstraint(
            "(time_rating_override >= 1 AND time_rating_override <= 7) OR time_rating_override IS NULL",
            name='check_valid_wp_time_rating_override'
        ),
        db.CheckConstraint(
            "(qc_rating >= 1 AND qc_rating <= 5) OR qc_rating IS NULL",
            name='check_valid_wp_qc_rating'
        ),
        db.CheckConstraint(
            "(cleaning_rating >= 0 AND cleaning_rating <= 2) OR cleaning_rating IS NULL",
            name='check_valid_wp_cleaning_rating'
        ),
        db.CheckConstraint(
            "admin_bonus >= 0 AND admin_bonus <= 10",
            name='check_valid_wp_admin_bonus'
        ),
    )

    @property
    def effective_time_rating(self):
        """Get the effective time rating (override if approved, else original)."""
        if self.time_rating_override is not None and self.time_rating_override_approved:
            return self.time_rating_override
        return self.time_rating

    @staticmethod
    def calculate_time_rating(estimated_hours, actual_hours):
        """
        Calculate time rating based on estimated vs actual hours.
        Base: 5 stars
        Early: +2 if < 2h early, +4 if 2h+ early (cap at 7)
        Late: -1 star per 0.5 hour late (min 1)
        """
        if not estimated_hours or not actual_hours:
            return None

        estimated = float(estimated_hours)
        actual = float(actual_hours)
        diff = actual - estimated  # positive = late, negative = early

        rating = 5.0

        if diff < 0:
            # Early completion
            hours_early = abs(diff)
            if hours_early >= 2:
                rating += 2.0
            else:
                rating += 1.0
        elif diff > 0:
            # Late completion
            penalty = diff / 0.5  # -1 star per 0.5 hour late
            rating -= penalty

        # Clamp between 1 and 7
        return max(1.0, min(7.0, round(rating, 1)))

    def to_dict(self):
        return {
            'id': self.id,
            'work_plan_job_id': self.work_plan_job_id,
            'user_id': self.user_id,
            'user': {
                'id': self.user.id,
                'full_name': self.user.full_name,
                'role': self.user.role,
            } if self.user else None,
            'is_lead': self.is_lead,
            'time_rating': float(self.time_rating) if self.time_rating else None,
            'effective_time_rating': float(self.effective_time_rating) if self.effective_time_rating else None,
            'time_rating_override': float(self.time_rating_override) if self.time_rating_override else None,
            'time_rating_override_reason': self.time_rating_override_reason,
            'time_rating_override_approved': self.time_rating_override_approved,
            'qc_rating': float(self.qc_rating) if self.qc_rating else None,
            'qc_reason': self.qc_reason,
            'qc_voice_file_id': self.qc_voice_file_id,
            'qc_voice_url': self.qc_voice_file.file_path if self.qc_voice_file else None,
            'cleaning_rating': self.cleaning_rating,
            'admin_bonus': self.admin_bonus,
            'admin_bonus_notes': self.admin_bonus_notes,
            'points_earned': self.points_earned,
            'is_disputed': self.is_disputed,
            'dispute_reason': self.dispute_reason,
            'dispute_resolved': self.dispute_resolved,
            'dispute_resolution': self.dispute_resolution,
            'rated_by_id': self.rated_by_id,
            'rated_at': (self.rated_at.isoformat() + 'Z') if self.rated_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<WorkPlanJobRating job:{self.work_plan_job_id} user:{self.user_id}>'
