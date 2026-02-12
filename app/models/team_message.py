"""Team Message model for communication channel."""
from datetime import datetime
from app.extensions import db


class TeamMessage(db.Model):
    """Messages in team communication channels."""
    __tablename__ = 'team_messages'

    id = db.Column(db.Integer, primary_key=True)
    channel_id = db.Column(db.Integer, db.ForeignKey('team_channels.id'), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    message_type = db.Column(db.String(20), nullable=False, default='text')  # text, voice, photo, video, location, system
    content = db.Column(db.Text)  # text content or transcription
    media_url = db.Column(db.String(500))  # URL for voice/photo/video
    media_thumbnail = db.Column(db.String(500))  # thumbnail for video/photo
    duration_seconds = db.Column(db.Integer)  # for voice/video messages
    location_lat = db.Column(db.Float)
    location_lng = db.Column(db.Float)
    location_label = db.Column(db.String(200))
    is_priority = db.Column(db.Boolean, default=False)  # priority/emergency message
    is_translated = db.Column(db.Boolean, default=False)
    original_language = db.Column(db.String(5))  # en, ar
    translated_content = db.Column(db.Text)  # auto-translated version
    reply_to_id = db.Column(db.Integer, db.ForeignKey('team_messages.id'))
    is_deleted = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    channel = db.relationship('TeamChannel', back_populates='messages')
    sender = db.relationship('User', foreign_keys=[sender_id])
    reply_to = db.relationship('TeamMessage', remote_side=[id])
    read_receipts = db.relationship('MessageReadReceipt', back_populates='message', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'channel_id': self.channel_id,
            'sender_id': self.sender_id,
            'sender_name': self.sender.full_name if self.sender else None,
            'sender_role': self.sender.role if self.sender else None,
            'message_type': self.message_type,
            'content': self.content,
            'media_url': self.media_url,
            'media_thumbnail': self.media_thumbnail,
            'duration_seconds': self.duration_seconds,
            'location_lat': self.location_lat,
            'location_lng': self.location_lng,
            'location_label': self.location_label,
            'is_priority': self.is_priority,
            'is_translated': self.is_translated,
            'original_language': self.original_language,
            'translated_content': self.translated_content,
            'reply_to_id': self.reply_to_id,
            'is_deleted': self.is_deleted,
            'read_count': len(self.read_receipts) if self.read_receipts else 0,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
