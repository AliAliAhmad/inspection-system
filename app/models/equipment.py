"""
Equipment model for tracking industrial equipment.
Supports dynamic berth/location system.
"""

from app.extensions import db
from datetime import datetime


class Equipment(db.Model):
    """
    Equipment model representing physical industrial equipment.
    Supports dynamic berth locations (B20, B27, etc.).
    """
    __tablename__ = 'equipment'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    name_ar = db.Column(db.String(100), nullable=True)
    equipment_type = db.Column(db.String(50), nullable=False, index=True)
    equipment_type_ar = db.Column(db.String(50), nullable=True)
    serial_number = db.Column(db.String(50), unique=True, nullable=False)
    location = db.Column(db.String(100), nullable=False)
    location_ar = db.Column(db.String(100), nullable=True)

    # Berth system
    berth = db.Column(db.String(20), nullable=True, index=True)  # B20, B27, etc.
    home_berth = db.Column(db.String(20), nullable=True)  # Default berth

    # Status: active, under_maintenance, out_of_service, stopped, paused
    status = db.Column(db.String(30), default='active')

    assigned_technician_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Manufacturer info
    manufacturer = db.Column(db.String(100), nullable=True)
    model_number = db.Column(db.String(50), nullable=True)
    installation_date = db.Column(db.Date, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    assigned_technician = db.relationship('User', backref='assigned_equipment')
    inspections = db.relationship('Inspection', back_populates='equipment', cascade='all, delete-orphan', lazy='dynamic')

    __table_args__ = (
        db.CheckConstraint(
            "status IN ('active', 'under_maintenance', 'out_of_service', 'stopped', 'paused')",
            name='check_valid_equipment_status'
        ),
    )

    def to_dict(self, language='en'):
        """Convert equipment object to dictionary.
        Asset name, equipment_type, serial_number, model_number, IDs
        are always English (technical identifiers). Only location is bilingual.
        """
        return {
            'id': self.id,
            'name': self.name,
            'name_ar': self.name_ar,
            'equipment_type': self.equipment_type,
            'equipment_type_ar': self.equipment_type_ar,
            'serial_number': self.serial_number,
            'location': self.location_ar if language == 'ar' and self.location_ar else self.location,
            'location_en': self.location,
            'location_ar': self.location_ar,
            'berth': self.berth,
            'home_berth': self.home_berth,
            'status': self.status,
            'assigned_technician_id': self.assigned_technician_id,
            'assigned_technician': self.assigned_technician.to_dict() if self.assigned_technician else None,
            'manufacturer': self.manufacturer,
            'model_number': self.model_number,
            'installation_date': self.installation_date.isoformat() if self.installation_date else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<Equipment {self.name}>'
