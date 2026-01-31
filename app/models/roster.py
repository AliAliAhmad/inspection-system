"""
Team Roster model.
Tracks daily shift assignments for team members.
"""

from app.extensions import db
from datetime import datetime


class RosterEntry(db.Model):
    __tablename__ = 'roster_entries'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    shift = db.Column(db.String(20), nullable=True)  # 'day', 'night', 'off', 'leave'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User')

    __table_args__ = (
        db.UniqueConstraint('user_id', 'date', name='uq_roster_user_date'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'date': self.date.isoformat() if self.date else None,
            'shift': self.shift,
        }
