"""
UserChallenge model for tracking user's challenge participation.
"""

from app.extensions import db
from datetime import datetime


class UserChallenge(db.Model):
    """User's challenge participation"""
    __tablename__ = 'user_challenges'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    challenge_id = db.Column(db.Integer, db.ForeignKey('challenges.id'), nullable=False)
    progress = db.Column(db.Integer, default=0)
    is_completed = db.Column(db.Boolean, default=False)
    completed_at = db.Column(db.DateTime)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint('user_id', 'challenge_id', name='unique_user_challenge'),)

    user = db.relationship('User', backref=db.backref('challenges', lazy='dynamic'))
    challenge = db.relationship('Challenge', backref=db.backref('participants', lazy='dynamic'))

    @property
    def progress_percent(self):
        """Get progress as percentage."""
        if self.challenge and self.challenge.target_value > 0:
            return min(100, (self.progress / self.challenge.target_value) * 100)
        return 0

    def update_progress(self, new_progress):
        """Update progress and check for completion."""
        self.progress = new_progress
        if self.challenge and self.progress >= self.challenge.target_value:
            if not self.is_completed:
                self.is_completed = True
                self.completed_at = datetime.utcnow()

    def to_dict(self, language='en'):
        """Convert user challenge to dictionary."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'challenge_id': self.challenge_id,
            'progress': self.progress,
            'progress_percent': self.progress_percent,
            'is_completed': self.is_completed,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'joined_at': self.joined_at.isoformat() if self.joined_at else None,
            'challenge': self.challenge.to_dict(language) if self.challenge else None,
        }

    def __repr__(self):
        return f'<UserChallenge user={self.user_id} challenge={self.challenge_id} progress={self.progress}>'
