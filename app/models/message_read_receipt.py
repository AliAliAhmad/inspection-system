"""Message Read Receipt model."""
from datetime import datetime
from app.extensions import db


class MessageReadReceipt(db.Model):
    """Read receipts for team messages."""
    __tablename__ = 'message_read_receipts'

    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey('team_messages.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    read_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('message_id', 'user_id', name='uq_message_read'),
    )

    message = db.relationship('TeamMessage', back_populates='read_receipts')
    user = db.relationship('User', foreign_keys=[user_id])

    def to_dict(self):
        return {
            'id': self.id,
            'message_id': self.message_id,
            'user_id': self.user_id,
            'user_name': self.user.full_name if self.user else None,
            'read_at': self.read_at.isoformat() if self.read_at else None,
        }
