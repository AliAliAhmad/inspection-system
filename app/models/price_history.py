"""
PriceHistory model for tracking material price changes.
Records price history for analytics and auditing.
"""

from app.extensions import db
from datetime import datetime


class PriceHistory(db.Model):
    """Track material price changes"""
    __tablename__ = 'price_history'

    id = db.Column(db.Integer, primary_key=True)
    material_id = db.Column(db.Integer, db.ForeignKey('materials.id'), nullable=False, index=True)
    vendor_id = db.Column(db.Integer, db.ForeignKey('vendors.id'), index=True)

    old_price = db.Column(db.Float)
    new_price = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String(10), default='USD')

    change_reason = db.Column(db.String(200))
    effective_date = db.Column(db.Date, index=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    material = db.relationship('Material', backref='price_history')
    vendor = db.relationship('Vendor')

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'material_id': self.material_id,
            'vendor_id': self.vendor_id,
            'old_price': self.old_price,
            'new_price': self.new_price,
            'currency': self.currency,
            'change_reason': self.change_reason,
            'effective_date': self.effective_date.isoformat() if self.effective_date else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<PriceHistory Material {self.material_id}: {self.old_price} -> {self.new_price}>'
