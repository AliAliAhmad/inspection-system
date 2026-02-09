"""
UserLevel model for user leveling system.
"""

from app.extensions import db
from datetime import datetime


class UserLevel(db.Model):
    """User leveling system"""
    __tablename__ = 'user_levels'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)
    level = db.Column(db.Integer, default=1)
    current_xp = db.Column(db.Integer, default=0)
    total_xp = db.Column(db.Integer, default=0)
    tier = db.Column(db.String(20), default='bronze')  # bronze, silver, gold, platinum, diamond

    # Stats
    total_points = db.Column(db.Integer, default=0)
    inspections_count = db.Column(db.Integer, default=0)
    jobs_count = db.Column(db.Integer, default=0)
    defects_found = db.Column(db.Integer, default=0)
    avg_rating = db.Column(db.Float, default=0.0)

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('level_info', uselist=False))

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond')",
            name='check_valid_user_level_tier'
        ),
    )

    # Tier thresholds (level required for each tier)
    TIER_THRESHOLDS = {
        'bronze': 1,
        'silver': 10,
        'gold': 25,
        'platinum': 50,
        'diamond': 100,
    }

    @property
    def xp_for_next_level(self):
        """Calculate XP needed for next level."""
        return self.level * 100 + 50  # 150, 250, 350, etc.

    @property
    def level_progress_percent(self):
        """Progress to next level as percentage."""
        return min(100, (self.current_xp / self.xp_for_next_level) * 100)

    def add_xp(self, xp_amount):
        """Add XP and handle level ups."""
        self.current_xp += xp_amount
        self.total_xp += xp_amount

        # Check for level up
        while self.current_xp >= self.xp_for_next_level:
            self.current_xp -= self.xp_for_next_level
            self.level += 1
            self._update_tier()

    def _update_tier(self):
        """Update tier based on current level."""
        if self.level >= self.TIER_THRESHOLDS['diamond']:
            self.tier = 'diamond'
        elif self.level >= self.TIER_THRESHOLDS['platinum']:
            self.tier = 'platinum'
        elif self.level >= self.TIER_THRESHOLDS['gold']:
            self.tier = 'gold'
        elif self.level >= self.TIER_THRESHOLDS['silver']:
            self.tier = 'silver'
        else:
            self.tier = 'bronze'

    def to_dict(self):
        """Convert user level to dictionary."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'level': self.level,
            'current_xp': self.current_xp,
            'total_xp': self.total_xp,
            'xp_for_next_level': self.xp_for_next_level,
            'level_progress_percent': self.level_progress_percent,
            'tier': self.tier,
            'total_points': self.total_points,
            'inspections_count': self.inspections_count,
            'jobs_count': self.jobs_count,
            'defects_found': self.defects_found,
            'avg_rating': self.avg_rating,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<UserLevel user={self.user_id} level={self.level} tier={self.tier}>'
