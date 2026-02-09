"""
LeaderboardSnapshot model for daily snapshots of historical rankings.
"""

from app.extensions import db
from datetime import date


class LeaderboardSnapshot(db.Model):
    """Daily snapshots for historical rankings"""
    __tablename__ = 'leaderboard_snapshots'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    snapshot_date = db.Column(db.Date, nullable=False)
    period_type = db.Column(db.String(20), nullable=False)  # 'daily', 'weekly', 'monthly'

    rank = db.Column(db.Integer)
    points = db.Column(db.Integer)
    role = db.Column(db.String(50))

    __table_args__ = (
        db.UniqueConstraint('user_id', 'snapshot_date', 'period_type', name='unique_user_snapshot_period'),
        db.Index('idx_snapshot_date_period', 'snapshot_date', 'period_type'),
    )

    user = db.relationship('User', backref=db.backref('leaderboard_snapshots', lazy='dynamic'))

    @classmethod
    def get_rank_change(cls, user_id, period_type='weekly'):
        """Get rank change from previous period snapshot."""
        from sqlalchemy import desc

        # Get the two most recent snapshots for this user and period type
        snapshots = cls.query.filter_by(
            user_id=user_id,
            period_type=period_type
        ).order_by(desc(cls.snapshot_date)).limit(2).all()

        if len(snapshots) < 2:
            return None  # Not enough data

        current_rank = snapshots[0].rank
        previous_rank = snapshots[1].rank

        if current_rank is None or previous_rank is None:
            return None

        # Positive means improved (moved up in rank)
        return previous_rank - current_rank

    def to_dict(self):
        """Convert leaderboard snapshot to dictionary."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'snapshot_date': self.snapshot_date.isoformat() if self.snapshot_date else None,
            'period_type': self.period_type,
            'rank': self.rank,
            'points': self.points,
            'role': self.role,
        }

    def __repr__(self):
        return f'<LeaderboardSnapshot user={self.user_id} date={self.snapshot_date} rank={self.rank}>'
