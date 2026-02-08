"""
Material Kit models for PM job material bundles.
A kit is a predefined set of materials for specific equipment types.
"""

from app.extensions import db
from datetime import datetime


class MaterialKit(db.Model):
    """
    Material Kit - a bundle of materials for PM jobs.
    Example: "Crane 2000 PM Kit" = grease + oil + filter
    """
    __tablename__ = 'material_kits'

    id = db.Column(db.Integer, primary_key=True)

    # Kit identification
    name = db.Column(db.String(255), nullable=False)
    name_ar = db.Column(db.String(255))
    description = db.Column(db.Text)

    # Equipment association (optional - for equipment-specific kits)
    equipment_type = db.Column(db.String(100))  # e.g., "STS Crane", "RTG", etc.

    # Status
    is_active = db.Column(db.Boolean, default=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    items = db.relationship('MaterialKitItem', back_populates='kit', cascade='all, delete-orphan')

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        name = self.name_ar if language == 'ar' and self.name_ar else self.name

        return {
            'id': self.id,
            'name': name,
            'name_en': self.name,
            'name_ar': self.name_ar,
            'description': self.description,
            'equipment_type': self.equipment_type,
            'is_active': self.is_active,
            'items': [item.to_dict(language) for item in self.items],
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<MaterialKit {self.name}>'


class MaterialKitItem(db.Model):
    """
    Individual item within a material kit.
    Links a material to a kit with a specific quantity.
    """
    __tablename__ = 'material_kit_items'

    id = db.Column(db.Integer, primary_key=True)

    # Parent kit
    kit_id = db.Column(db.Integer, db.ForeignKey('material_kits.id'), nullable=False)

    # Material reference
    material_id = db.Column(db.Integer, db.ForeignKey('materials.id'), nullable=False)

    # Quantity needed
    quantity = db.Column(db.Float, nullable=False, default=1)

    # Relationships
    kit = db.relationship('MaterialKit', back_populates='items')
    material = db.relationship('Material')

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'kit_id': self.kit_id,
            'material_id': self.material_id,
            'material': self.material.to_dict(language) if self.material else None,
            'quantity': self.quantity,
        }

    def __repr__(self):
        return f'<MaterialKitItem kit={self.kit_id} material={self.material_id}>'
