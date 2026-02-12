"""Team Communication Channel model."""
from datetime import datetime
from app.extensions import db


class TeamChannel(db.Model):
    """Communication channels for team messaging."""
    __tablename__ = 'team_channels'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    channel_type = db.Column(db.String(30), nullable=False, default='general')  # general, shift, role, job, emergency
    shift = db.Column(db.String(20))  # day, night, morning, afternoon - null means all shifts
    role_filter = db.Column(db.String(30))  # admin, engineer, inspector, specialist, quality_engineer - null means all
    job_id = db.Column(db.Integer)  # linked job ID for job-specific channels
    is_active = db.Column(db.Boolean, default=True)
    is_default = db.Column(db.Boolean, default=False)  # auto-join channels
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    creator = db.relationship('User', foreign_keys=[created_by])
    members = db.relationship('ChannelMember', back_populates='channel', cascade='all, delete-orphan')
    messages = db.relationship('TeamMessage', back_populates='channel', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'channel_type': self.channel_type,
            'shift': self.shift,
            'role_filter': self.role_filter,
            'job_id': self.job_id,
            'is_active': self.is_active,
            'is_default': self.is_default,
            'created_by': self.created_by,
            'creator_name': self.creator.full_name if self.creator else None,
            'member_count': len(self.members) if self.members else 0,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
