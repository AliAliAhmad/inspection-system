"""
Achievement model for gamification badges/achievements.
"""

from app.extensions import db
from datetime import datetime


class Achievement(db.Model):
    """Achievement/Badge definitions"""
    __tablename__ = 'achievements'

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), unique=True, nullable=False)  # 'first_blood', 'speed_demon'
    name = db.Column(db.String(100), nullable=False)
    name_ar = db.Column(db.String(100))
    description = db.Column(db.Text)
    description_ar = db.Column(db.Text)
    icon = db.Column(db.String(50))  # emoji or icon name
    category = db.Column(db.String(50))  # 'milestone', 'streak', 'quality', 'speed', 'special'
    points_reward = db.Column(db.Integer, default=0)

    # Unlock criteria
    criteria_type = db.Column(db.String(50))  # 'count', 'streak', 'rating', 'time', 'manual'
    criteria_target = db.Column(db.Integer)  # e.g., 100 for "100 inspections"
    criteria_field = db.Column(db.String(100))  # what to count: 'inspections', 'jobs', etc.

    tier = db.Column(db.String(20), default='bronze')  # bronze, silver, gold, platinum, diamond
    is_active = db.Column(db.Boolean, default=True)
    is_hidden = db.Column(db.Boolean, default=False)  # Secret achievements
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "category IN ('milestone', 'streak', 'quality', 'speed', 'special') OR category IS NULL",
            name='check_valid_achievement_category'
        ),
        db.CheckConstraint(
            "criteria_type IN ('count', 'streak', 'rating', 'time', 'manual') OR criteria_type IS NULL",
            name='check_valid_criteria_type'
        ),
        db.CheckConstraint(
            "tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond')",
            name='check_valid_achievement_tier'
        ),
    )

    def to_dict(self, language='en'):
        """Convert achievement to dictionary."""
        return {
            'id': self.id,
            'code': self.code,
            'name': self.name_ar if language == 'ar' and self.name_ar else self.name,
            'description': self.description_ar if language == 'ar' and self.description_ar else self.description,
            'icon': self.icon,
            'category': self.category,
            'points_reward': self.points_reward,
            'tier': self.tier,
            'is_hidden': self.is_hidden,
            'criteria_type': self.criteria_type,
            'criteria_target': self.criteria_target,
            'criteria_field': self.criteria_field,
        }

    def __repr__(self):
        return f'<Achievement {self.code} ({self.tier})>'
