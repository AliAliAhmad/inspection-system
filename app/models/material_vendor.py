"""
MaterialVendor model for linking materials to vendors with pricing.
Tracks vendor-specific pricing and availability for materials.
"""

from app.extensions import db
from datetime import datetime


class MaterialVendor(db.Model):
    """Link materials to vendors with pricing"""
    __tablename__ = 'material_vendors'

    id = db.Column(db.Integer, primary_key=True)
    material_id = db.Column(db.Integer, db.ForeignKey('materials.id'), nullable=False, index=True)
    vendor_id = db.Column(db.Integer, db.ForeignKey('vendors.id'), nullable=False, index=True)

    vendor_part_number = db.Column(db.String(100))
    unit_price = db.Column(db.Float)
    currency = db.Column(db.String(10), default='USD')
    min_order_qty = db.Column(db.Float)
    lead_time_days = db.Column(db.Integer)

    is_preferred = db.Column(db.Boolean, default=False, index=True)
    last_price_update = db.Column(db.DateTime)

    __table_args__ = (db.UniqueConstraint('material_id', 'vendor_id', name='uq_material_vendor'),)

    material = db.relationship('Material', backref='vendor_links')
    vendor = db.relationship('Vendor', backref='material_links')

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'material_id': self.material_id,
            'vendor_id': self.vendor_id,
            'vendor_part_number': self.vendor_part_number,
            'unit_price': self.unit_price,
            'currency': self.currency,
            'min_order_qty': self.min_order_qty,
            'lead_time_days': self.lead_time_days,
            'is_preferred': self.is_preferred,
            'last_price_update': self.last_price_update.isoformat() if self.last_price_update else None,
        }

    def __repr__(self):
        return f'<MaterialVendor Material {self.material_id} - Vendor {self.vendor_id}>'
