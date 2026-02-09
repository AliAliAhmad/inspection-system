"""
PointHistory model for tracking all point changes.
"""

from app.extensions import db
from datetime import datetime


class PointHistory(db.Model):
    """Track all point changes"""
    __tablename__ = 'point_history'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    points = db.Column(db.Integer, nullable=False)  # Can be negative for deductions
    reason = db.Column(db.String(100), nullable=False)
    reason_ar = db.Column(db.String(100))

    source_type = db.Column(db.String(50))  # 'inspection', 'job', 'defect', 'achievement', 'challenge', 'manual'
    source_id = db.Column(db.Integer)  # ID of the related record

    multiplier = db.Column(db.Float, default=1.0)  # Quality/speed multiplier applied
    base_points = db.Column(db.Integer)  # Points before multiplier

    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    user = db.relationship('User', backref=db.backref('point_history', lazy='dynamic'))

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "source_type IN ('inspection', 'job', 'defect', 'achievement', 'challenge', 'manual', 'bonus', 'streak') OR source_type IS NULL",
            name='check_valid_source_type'
        ),
    )

    def to_dict(self, language='en'):
        """Convert point history to dictionary."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'points': self.points,
            'reason': self.reason_ar if language == 'ar' and self.reason_ar else self.reason,
            'source_type': self.source_type,
            'source_id': self.source_id,
            'multiplier': self.multiplier,
            'base_points': self.base_points,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<PointHistory user={self.user_id} points={self.points} reason={self.reason}>'
