"""
MaterialBatch model for batch/lot tracking.
Tracks material batches with expiry dates and vendor information.
"""

from app.extensions import db
from datetime import datetime, date


class MaterialBatch(db.Model):
    """Batch/Lot tracking for materials"""
    __tablename__ = 'material_batches'

    id = db.Column(db.Integer, primary_key=True)
    material_id = db.Column(db.Integer, db.ForeignKey('materials.id'), nullable=False, index=True)

    batch_number = db.Column(db.String(100), nullable=False, index=True)
    lot_number = db.Column(db.String(100))

    quantity = db.Column(db.Float, default=0)
    received_date = db.Column(db.Date)
    expiry_date = db.Column(db.Date, index=True)
    manufacture_date = db.Column(db.Date)

    vendor_id = db.Column(db.Integer, db.ForeignKey('vendors.id'), index=True)
    purchase_price = db.Column(db.Float)

    location_id = db.Column(db.Integer, db.ForeignKey('storage_locations.id'), index=True)

    status = db.Column(db.String(20), default='available', index=True)  # available, reserved, expired, depleted
    notes = db.Column(db.Text)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    material = db.relationship('Material', backref='batches')
    vendor = db.relationship('Vendor', backref='batches')
    location = db.relationship('StorageLocation', backref='batches')

    @property
    def is_expired(self):
        """Check if batch is expired."""
        if self.expiry_date:
            return self.expiry_date < date.today()
        return False

    @property
    def days_until_expiry(self):
        """Calculate days until expiry."""
        if self.expiry_date:
            return (self.expiry_date - date.today()).days
        return None

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'material_id': self.material_id,
            'batch_number': self.batch_number,
            'lot_number': self.lot_number,
            'quantity': self.quantity,
            'received_date': self.received_date.isoformat() if self.received_date else None,
            'expiry_date': self.expiry_date.isoformat() if self.expiry_date else None,
            'manufacture_date': self.manufacture_date.isoformat() if self.manufacture_date else None,
            'vendor_id': self.vendor_id,
            'purchase_price': self.purchase_price,
            'location_id': self.location_id,
            'status': self.status,
            'notes': self.notes,
            'is_expired': self.is_expired,
            'days_until_expiry': self.days_until_expiry,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<MaterialBatch {self.batch_number} for Material {self.material_id}>'
