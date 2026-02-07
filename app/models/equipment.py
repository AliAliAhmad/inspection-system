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
    equipment_type = db.Column(db.String(50), nullable=False, index=True)  # Auto-generated from name (letters only, uppercase)
    equipment_type_2 = db.Column(db.String(100), nullable=True)  # User-provided, free text
    equipment_type_ar = db.Column(db.String(50), nullable=True)
    serial_number = db.Column(db.String(50), unique=True, nullable=False)
    location = db.Column(db.String(100), nullable=True)
    location_ar = db.Column(db.String(100), nullable=True)

    # Berth system - east or west only
    berth = db.Column(db.String(20), nullable=True, index=True)  # 'east' or 'west'
    home_berth = db.Column(db.String(20), nullable=True)  # 'east' or 'west'

    # Status: active, under_maintenance, out_of_service, stopped, paused
    status = db.Column(db.String(30), default='active')

    # Scrapped flag - when True, equipment is hidden from lists and no activities allowed
    is_scrapped = db.Column(db.Boolean, default=False, nullable=False)

    # Capacity (e.g., "50 tons", "100 kg")
    capacity = db.Column(db.String(50), nullable=True)

    assigned_technician_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Manufacturer info
    manufacturer = db.Column(db.String(100), nullable=True)
    model_number = db.Column(db.String(50), nullable=True)
    installation_date = db.Column(db.Date, nullable=True)

    # Tracking
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    assigned_technician = db.relationship('User', foreign_keys=[assigned_technician_id], backref='assigned_equipment')
    created_by = db.relationship('User', foreign_keys=[created_by_id])
    inspections = db.relationship('Inspection', back_populates='equipment', cascade='all, delete-orphan', lazy='dynamic')

    __table_args__ = (
        db.CheckConstraint(
            "status IN ('active', 'under_maintenance', 'out_of_service', 'stopped', 'paused')",
            name='check_valid_equipment_status'
        ),
        db.CheckConstraint(
            "berth IN ('east', 'west') OR berth IS NULL",
            name='check_valid_berth'
        ),
        db.CheckConstraint(
            "home_berth IN ('east', 'west') OR home_berth IS NULL",
            name='check_valid_home_berth'
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
            'equipment_type_2': self.equipment_type_2,
            'equipment_type_ar': self.equipment_type_ar,
            'serial_number': self.serial_number,
            'location': self.location_ar if language == 'ar' and self.location_ar else self.location,
            'location_en': self.location,
            'location_ar': self.location_ar,
            'berth': self.berth,
            'home_berth': self.home_berth,
            'status': self.status,
            'is_scrapped': self.is_scrapped,
            'capacity': self.capacity,
            'assigned_technician_id': self.assigned_technician_id,
            'assigned_technician': self.assigned_technician.to_dict() if self.assigned_technician else None,
            'manufacturer': self.manufacturer,
            'model_number': self.model_number,
            'installation_date': self.installation_date.isoformat() if self.installation_date else None,
            'created_by_id': self.created_by_id,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    @staticmethod
    def generate_equipment_type(name):
        """
        Auto-generate equipment_type from equipment name.
        Extracts letters only, removes numbers and spaces, converts to uppercase.
        Example: "Crane01" -> "CRANE", "HVAC Unit 3" -> "HVACUNIT"
        """
        import re
        letters_only = re.sub(r'[^a-zA-Z]', '', name)
        return letters_only.upper() if letters_only else 'UNKNOWN'

    def __repr__(self):
        return f'<Equipment {self.name}>'
