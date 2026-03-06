"""
Star History model — tracks star ratings per user per target (inspection/job/daily).
Used to calculate avg_rating and for audit trail.
"""

from app.extensions import db
from datetime import datetime


class StarHistory(db.Model):
    """Per-user, per-target star rating record."""
    __tablename__ = 'star_history'

    id = db.Column(db.Integer, primary_key=True)

    # Who earned the stars
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # What role they had when earning
    role = db.Column(db.String(20), nullable=False)  # inspector, specialist, engineer

    # What was rated
    target_type = db.Column(db.String(30), nullable=False)  # inspection, specialist_job, engineer_daily
    target_id = db.Column(db.Integer, nullable=True)  # inspection_id, specialist_job_id, or null for daily

    # Target date (for daily engineer stars)
    target_date = db.Column(db.Date, nullable=True)

    # Individual stars (True = earned, False = not earned)
    star_1 = db.Column(db.Boolean, default=False, nullable=False)
    star_2 = db.Column(db.Boolean, default=False, nullable=False)
    star_3 = db.Column(db.Boolean, default=False, nullable=False)
    star_4 = db.Column(db.Boolean, default=False, nullable=False)
    star_5 = db.Column(db.Boolean, default=False, nullable=False)

    # Star names for display
    star_1_name = db.Column(db.String(50), nullable=True)
    star_2_name = db.Column(db.String(50), nullable=True)
    star_3_name = db.Column(db.String(50), nullable=True)
    star_4_name = db.Column(db.String(50), nullable=True)
    star_5_name = db.Column(db.String(50), nullable=True)

    # Aggregates
    total_stars = db.Column(db.Integer, default=0, nullable=False)
    auto_stars = db.Column(db.Integer, default=0, nullable=False)  # system-calculated
    manual_stars = db.Column(db.Integer, default=0, nullable=False)  # engineer/admin given

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship('User', backref='star_history')

    def recalculate_totals(self):
        """Recalculate total_stars from individual star booleans."""
        stars = [self.star_1, self.star_2, self.star_3, self.star_4, self.star_5]
        self.total_stars = sum(1 for s in stars if s)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'role': self.role,
            'target_type': self.target_type,
            'target_id': self.target_id,
            'target_date': self.target_date.isoformat() if self.target_date else None,
            'stars': {
                'star_1': {'earned': self.star_1, 'name': self.star_1_name},
                'star_2': {'earned': self.star_2, 'name': self.star_2_name},
                'star_3': {'earned': self.star_3, 'name': self.star_3_name},
                'star_4': {'earned': self.star_4, 'name': self.star_4_name},
                'star_5': {'earned': self.star_5, 'name': self.star_5_name},
            },
            'total_stars': self.total_stars,
            'auto_stars': self.auto_stars,
            'manual_stars': self.manual_stars,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<StarHistory user={self.user_id} target={self.target_type}:{self.target_id} stars={self.total_stars}/5>'
