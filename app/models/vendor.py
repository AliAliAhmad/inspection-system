"""
Vendor model for material suppliers/vendors.
Tracks vendor information for procurement and material sourcing.
"""

from app.extensions import db
from datetime import datetime


class Vendor(db.Model):
    """Material suppliers/vendors"""
    __tablename__ = 'vendors'

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), unique=True, nullable=False, index=True)
    name = db.Column(db.String(200), nullable=False)
    name_ar = db.Column(db.String(200))

    contact_person = db.Column(db.String(100))
    email = db.Column(db.String(100))
    phone = db.Column(db.String(50))
    address = db.Column(db.Text)

    payment_terms = db.Column(db.String(100))  # Net 30, etc.
    lead_time_days = db.Column(db.Integer)  # Average delivery time

    rating = db.Column(db.Float)  # 1-5 rating
    notes = db.Column(db.Text)

    is_active = db.Column(db.Boolean, default=True)
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
            'contact_person': self.contact_person,
            'email': self.email,
            'phone': self.phone,
            'address': self.address,
            'payment_terms': self.payment_terms,
            'lead_time_days': self.lead_time_days,
            'rating': self.rating,
            'notes': self.notes,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<Vendor {self.code}: {self.name}>'
