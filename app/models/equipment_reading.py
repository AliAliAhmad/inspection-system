"""
Equipment Reading model for tracking running hours (RNR) and twistlock counts (TWL).
"""

from datetime import datetime, date
from app.extensions import db


class EquipmentReading(db.Model):
    """
    Track equipment readings over time.
    - RNR (Running Hours): Engine/motor running hours
    - TWL (Twistlock Count): Number of twistlock operations
    """
    __tablename__ = 'equipment_readings'

    id = db.Column(db.Integer, primary_key=True)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False, index=True)

    # Reading type: 'rnr' (running hours) or 'twl' (twistlock count)
    reading_type = db.Column(db.String(10), nullable=False, index=True)

    # The numeric value read from the meter
    reading_value = db.Column(db.Float, nullable=True)  # Nullable for 'faulty' readings
    is_faulty = db.Column(db.Boolean, default=False)  # True if meter was faulty/unreadable

    # When this reading was recorded
    reading_date = db.Column(db.Date, nullable=False, default=date.today, index=True)
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Who recorded it and from which inspection
    recorded_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    inspection_id = db.Column(db.Integer, db.ForeignKey('inspections.id'), nullable=True)
    checklist_item_id = db.Column(db.Integer, db.ForeignKey('checklist_items.id'), nullable=True)

    # Photo evidence
    photo_file_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=True)

    # AI analysis if available
    ai_analysis = db.Column(db.JSON, nullable=True)

    # Relationships
    equipment = db.relationship('Equipment', backref=db.backref('readings', lazy='dynamic'))
    recorded_by = db.relationship('User', backref=db.backref('recorded_readings', lazy='dynamic'))
    inspection = db.relationship('Inspection', backref=db.backref('equipment_readings', lazy='dynamic'))
    photo_file = db.relationship('File', foreign_keys=[photo_file_id])

    def __repr__(self):
        return f'<EquipmentReading {self.reading_type}={self.reading_value} for Equipment {self.equipment_id}>'

    def to_dict(self):
        return {
            'id': self.id,
            'equipment_id': self.equipment_id,
            'equipment_name': self.equipment.name if self.equipment else None,
            'reading_type': self.reading_type,
            'reading_value': self.reading_value,
            'is_faulty': self.is_faulty,
            'reading_date': self.reading_date.isoformat() if self.reading_date else None,
            'recorded_at': self.recorded_at.isoformat() if self.recorded_at else None,
            'recorded_by_id': self.recorded_by_id,
            'recorded_by_name': self.recorded_by.full_name if self.recorded_by else None,
            'inspection_id': self.inspection_id,
            'photo_url': self.photo_file.file_path if self.photo_file else None,
            'ai_analysis': self.ai_analysis,
        }

    @classmethod
    def get_latest_reading(cls, equipment_id, reading_type):
        """Get the most recent reading for an equipment."""
        return cls.query.filter_by(
            equipment_id=equipment_id,
            reading_type=reading_type
        ).order_by(cls.reading_date.desc(), cls.recorded_at.desc()).first()

    @classmethod
    def get_reading_history(cls, equipment_id, reading_type, days=90):
        """Get reading history for an equipment."""
        from datetime import timedelta
        cutoff = date.today() - timedelta(days=days)
        return cls.query.filter(
            cls.equipment_id == equipment_id,
            cls.reading_type == reading_type,
            cls.reading_date >= cutoff
        ).order_by(cls.reading_date.desc()).all()
