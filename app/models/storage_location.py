"""
StorageLocation model for warehouse/shelf location tracking.
Tracks storage locations for materials inventory.
"""

from app.extensions import db
from datetime import datetime


class StorageLocation(db.Model):
    """Warehouse/Shelf locations"""
    __tablename__ = 'storage_locations'

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), unique=True, nullable=False, index=True)  # 'WH1-A-01'
    name = db.Column(db.String(100), nullable=False)
    name_ar = db.Column(db.String(100))

    warehouse = db.Column(db.String(50))  # Main Warehouse, Secondary
    zone = db.Column(db.String(50))  # A, B, C
    aisle = db.Column(db.String(20))
    shelf = db.Column(db.String(20))
    bin = db.Column(db.String(20))

    description = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True)

    # Capacity
    max_capacity = db.Column(db.Float)
    current_usage = db.Column(db.Float, default=0)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        name = self.name_ar if language == 'ar' and self.name_ar else self.name

        return {
            'id': self.id,
            'code': self.code,
            'name': name,
            'name_en': self.name,
            'name_ar': self.name_ar,
            'warehouse': self.warehouse,
            'zone': self.zone,
            'aisle': self.aisle,
            'shelf': self.shelf,
            'bin': self.bin,
            'description': self.description,
            'is_active': self.is_active,
            'max_capacity': self.max_capacity,
            'current_usage': self.current_usage,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<StorageLocation {self.code}: {self.name}>'
