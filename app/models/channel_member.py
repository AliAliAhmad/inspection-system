"""Channel Member model for team communication."""
from datetime import datetime
from app.extensions import db


class ChannelMember(db.Model):
    """Members of team communication channels."""
    __tablename__ = 'channel_members'

    id = db.Column(db.Integer, primary_key=True)
    channel_id = db.Column(db.Integer, db.ForeignKey('team_channels.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    role = db.Column(db.String(20), default='member')  # admin, member
    is_muted = db.Column(db.Boolean, default=False)
    last_read_at = db.Column(db.DateTime)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Unique constraint
    __table_args__ = (
        db.UniqueConstraint('channel_id', 'user_id', name='uq_channel_member'),
    )

    # Relationships
    channel = db.relationship('TeamChannel', back_populates='members')
    user = db.relationship('User', foreign_keys=[user_id])

    def to_dict(self):
        return {
            'id': self.id,
            'channel_id': self.channel_id,
            'user_id': self.user_id,
            'user_name': self.user.full_name if self.user else None,
            'user_role': self.user.role if self.user else None,
            'role': self.role,
            'is_muted': self.is_muted,
            'last_read_at': self.last_read_at.isoformat() if self.last_read_at else None,
            'joined_at': self.joined_at.isoformat() if self.joined_at else None,
        }
