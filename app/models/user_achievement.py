"""
UserAchievement model for tracking user's earned achievements.
"""

from app.extensions import db
from datetime import datetime


class UserAchievement(db.Model):
    """User's earned achievements"""
    __tablename__ = 'user_achievements'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    achievement_id = db.Column(db.Integer, db.ForeignKey('achievements.id'), nullable=False)
    earned_at = db.Column(db.DateTime, default=datetime.utcnow)
    progress = db.Column(db.Integer, default=0)  # Current progress toward achievement
    is_notified = db.Column(db.Boolean, default=False)  # Has user been notified

    # Unique constraint
    __table_args__ = (db.UniqueConstraint('user_id', 'achievement_id', name='unique_user_achievement'),)

    # Relationships
    user = db.relationship('User', backref=db.backref('achievements', lazy='dynamic'))
    achievement = db.relationship('Achievement', backref=db.backref('user_achievements', lazy='dynamic'))

    def to_dict(self, language='en'):
        """Convert user achievement to dictionary."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'achievement_id': self.achievement_id,
            'earned_at': self.earned_at.isoformat() if self.earned_at else None,
            'progress': self.progress,
            'is_notified': self.is_notified,
            'achievement': self.achievement.to_dict(language) if self.achievement else None,
        }

    def __repr__(self):
        return f'<UserAchievement user={self.user_id} achievement={self.achievement_id}>'
