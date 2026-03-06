"""
EPI Snapshot model — weekly Employee Performance Index snapshots.
EPI = 5 components x 20 points each = 0-100 total.
"""

from app.extensions import db
from datetime import datetime


class EPISnapshot(db.Model):
    """Weekly EPI snapshot for trend tracking."""
    __tablename__ = 'epi_snapshots'

    id = db.Column(db.Integer, primary_key=True)

    # Who
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # inspector, specialist, engineer

    # When (week boundaries)
    week_start = db.Column(db.Date, nullable=False)
    week_end = db.Column(db.Date, nullable=False)

    # 5 EPI components (each 0-20)
    completion_score = db.Column(db.Float, default=0.0, nullable=False)
    quality_score = db.Column(db.Float, default=0.0, nullable=False)
    timeliness_score = db.Column(db.Float, default=0.0, nullable=False)
    contribution_score = db.Column(db.Float, default=0.0, nullable=False)
    safety_score = db.Column(db.Float, default=0.0, nullable=False)

    # Total EPI (0-100)
    total_epi = db.Column(db.Float, default=0.0, nullable=False)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship('User', backref='epi_snapshots')

    # Unique constraint: one snapshot per user per week
    __table_args__ = (
        db.UniqueConstraint('user_id', 'week_start', name='uq_epi_user_week'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'role': self.role,
            'week_start': self.week_start.isoformat() if self.week_start else None,
            'week_end': self.week_end.isoformat() if self.week_end else None,
            'breakdown': {
                'completion': round(self.completion_score, 1),
                'quality': round(self.quality_score, 1),
                'timeliness': round(self.timeliness_score, 1),
                'contribution': round(self.contribution_score, 1),
                'safety': round(self.safety_score, 1),
            },
            'total_epi': round(self.total_epi, 1),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<EPISnapshot user={self.user_id} week={self.week_start} epi={self.total_epi}>'
