"""Shift Handover Model - End-of-shift notes between crews."""
from datetime import datetime
from app import db


class ShiftHandover(db.Model):
    __tablename__ = 'shift_handovers'

    id = db.Column(db.Integer, primary_key=True)
    shift_date = db.Column(db.Date, nullable=False)
    shift_type = db.Column(db.String(10), nullable=False)  # 'day', 'night', 'morning', 'afternoon'

    outgoing_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    notes = db.Column(db.Text)  # Free-text handover notes
    pending_items = db.Column(db.JSON, default=list)  # [{description, priority, equipment_name}]
    safety_alerts = db.Column(db.JSON, default=list)  # [{alert, severity}]
    equipment_issues = db.Column(db.JSON, default=list)  # [{equipment_name, issue, status}]

    voice_file_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=True)
    voice_transcription = db.Column(db.JSON)  # {en: "", ar: ""}

    acknowledged_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    acknowledged_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    outgoing_user = db.relationship('User', foreign_keys=[outgoing_user_id], lazy='joined')
    acknowledged_by = db.relationship('User', foreign_keys=[acknowledged_by_id], lazy='joined')
    voice_file = db.relationship('File', foreign_keys=[voice_file_id], lazy='joined')

    def to_dict(self):
        return {
            'id': self.id,
            'shift_date': self.shift_date.isoformat() if self.shift_date else None,
            'shift_type': self.shift_type,
            'outgoing_user_id': self.outgoing_user_id,
            'outgoing_user_name': self.outgoing_user.full_name if self.outgoing_user else None,
            'notes': self.notes,
            'pending_items': self.pending_items or [],
            'safety_alerts': self.safety_alerts or [],
            'equipment_issues': self.equipment_issues or [],
            'voice_file_id': self.voice_file_id,
            'voice_url': self.voice_file.url if self.voice_file else None,
            'voice_transcription': self.voice_transcription,
            'acknowledged_by_id': self.acknowledged_by_id,
            'acknowledged_by_name': self.acknowledged_by.full_name if self.acknowledged_by else None,
            'acknowledged_at': self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<ShiftHandover {self.id} {self.shift_date} {self.shift_type}>'
