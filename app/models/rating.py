"""
Rating models for multi-component performance tracking.
"""

from app.extensions import db
from datetime import datetime


class InspectionRating(db.Model):
    """Rating given by admin to completed inspections (1-5 stars)."""
    __tablename__ = 'inspection_ratings'

    id = db.Column(db.Integer, primary_key=True)
    inspection_id = db.Column(db.Integer, db.ForeignKey('inspections.id'), nullable=False, unique=True)
    rated_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    rating = db.Column(db.Integer, nullable=False)  # 1-5 stars
    comment = db.Column(db.Text, nullable=True)
    rated_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Component breakdown
    asset_points = db.Column(db.Integer, default=0)
    finding_points = db.Column(db.Integer, default=0)
    admin_quality_bonus = db.Column(db.Integer, default=0)  # 0-10 stars

    inspection = db.relationship('Inspection', backref='rating')
    rated_by = db.relationship('User', backref='ratings_given')

    __table_args__ = (
        db.CheckConstraint('rating >= 1 AND rating <= 5', name='check_valid_rating'),
        db.CheckConstraint('admin_quality_bonus >= 0 AND admin_quality_bonus <= 10', name='check_valid_quality_bonus'),
    )

    def to_dict(self, language='en'):
        from app.utils.bilingual import get_bilingual_text
        comment = get_bilingual_text(
            'inspection_rating', self.id, 'comment', self.comment, language
        ) if self.comment else self.comment

        return {
            'id': self.id,
            'inspection_id': self.inspection_id,
            'rated_by_id': self.rated_by_id,
            'rated_by': self.rated_by.to_dict() if self.rated_by else None,
            'rating': self.rating,
            'comment': comment,
            'asset_points': self.asset_points,
            'finding_points': self.finding_points,
            'admin_quality_bonus': self.admin_quality_bonus,
            'rated_at': self.rated_at.isoformat() if self.rated_at else None
        }

    def __repr__(self):
        return f'<InspectionRating Inspection:{self.inspection_id} Rating:{self.rating}>'
