"""
Material model for stock/inventory management.
Tracks materials, stock levels, and consumption for work planning.
"""

from app.extensions import db
from datetime import datetime, date


class Material(db.Model):
    """
    Material model for tracking stock items.
    Used for PM jobs and defect repairs.
    """
    __tablename__ = 'materials'

    id = db.Column(db.Integer, primary_key=True)

    # Material identification
    code = db.Column(db.String(50), unique=True, nullable=False, index=True)  # SAP material code
    name = db.Column(db.String(255), nullable=False)
    name_ar = db.Column(db.String(255))

    # Classification
    category = db.Column(db.String(50), nullable=False)  # lubricant, filter, spare_part, consumable, etc.
    unit = db.Column(db.String(20), nullable=False)  # pcs, liters, kg, meters, etc.

    # Stock levels
    current_stock = db.Column(db.Float, default=0, nullable=False)
    min_stock = db.Column(db.Float, default=0, nullable=False)  # Minimum threshold for warnings

    # Consumption tracking (for 3-month average)
    total_consumed = db.Column(db.Float, default=0, nullable=False)
    consumption_start_date = db.Column(db.Date)  # When consumption tracking started

    # Status
    is_active = db.Column(db.Boolean, default=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # ============ NEW FIELDS FOR MATERIALS ENHANCEMENT ============

    # Barcode/QR tracking
    barcode = db.Column(db.String(100), index=True)
    qr_code = db.Column(db.String(100), index=True)

    # Location and vendor defaults
    default_location_id = db.Column(db.Integer, db.ForeignKey('storage_locations.id'))
    preferred_vendor_id = db.Column(db.Integer, db.ForeignKey('vendors.id'))

    # Reorder settings
    reorder_point = db.Column(db.Float)  # When to reorder
    reorder_quantity = db.Column(db.Float)  # How much to order
    safety_stock = db.Column(db.Float)  # Buffer stock

    # Tracking dates
    last_count_date = db.Column(db.Date)
    last_restock_date = db.Column(db.Date)

    # Usage analytics
    avg_monthly_usage = db.Column(db.Float)
    avg_lead_time_days = db.Column(db.Integer)

    # Pricing
    cost_per_unit = db.Column(db.Float)
    currency = db.Column(db.String(10), default='USD')

    # Image
    image_url = db.Column(db.String(500))

    # Relationships
    default_location = db.relationship('StorageLocation', foreign_keys=[default_location_id])
    preferred_vendor = db.relationship('Vendor', foreign_keys=[preferred_vendor_id])

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "category IN ('lubricant', 'filter', 'spare_part', 'consumable', 'electrical', 'mechanical', 'hvac', 'other')",
            name='check_material_category'
        ),
    )

    @property
    def reserved_quantity(self):
        """Get total reserved stock."""
        from app.models.stock_reservation import StockReservation
        return db.session.query(db.func.sum(StockReservation.quantity)).filter(
            StockReservation.material_id == self.id,
            StockReservation.status == 'active'
        ).scalar() or 0

    @property
    def available_quantity(self):
        """Stock minus reservations."""
        return self.current_stock - self.reserved_quantity

    @property
    def needs_reorder(self):
        """Check if below reorder point."""
        if self.reorder_point:
            return self.available_quantity <= self.reorder_point
        return self.is_low_stock()

    @property
    def stock_status(self):
        """Return stock status."""
        if self.current_stock <= 0:
            return 'out_of_stock'
        elif self.is_low_stock():
            return 'low'
        elif self.needs_reorder:
            return 'reorder'
        return 'ok'

    def get_monthly_consumption(self):
        """Calculate average monthly consumption."""
        if not self.consumption_start_date or self.total_consumed == 0:
            return 0
        days = (datetime.utcnow().date() - self.consumption_start_date).days
        if days <= 0:
            return self.total_consumed
        months = days / 30.0
        return self.total_consumed / months if months > 0 else 0

    def get_stock_months(self):
        """Calculate how many months of stock remaining."""
        monthly = self.get_monthly_consumption()
        if monthly <= 0:
            return float('inf')
        return self.current_stock / monthly

    def is_low_stock(self, threshold_months=3):
        """Check if stock is below threshold (default 3 months)."""
        return self.get_stock_months() < threshold_months

    def to_dict(self, language='en', include_extended=False):
        """Convert to dictionary."""
        name = self.name_ar if language == 'ar' and self.name_ar else self.name
        monthly_consumption = self.get_monthly_consumption()
        stock_months = self.get_stock_months()

        result = {
            'id': self.id,
            'code': self.code,
            'name': name,
            'name_en': self.name,
            'name_ar': self.name_ar,
            'category': self.category,
            'unit': self.unit,
            'current_stock': self.current_stock,
            'min_stock': self.min_stock,
            'monthly_consumption': round(monthly_consumption, 2),
            'stock_months': round(stock_months, 1) if stock_months != float('inf') else None,
            'is_low_stock': self.is_low_stock(),
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

        if include_extended:
            result.update({
                'barcode': self.barcode,
                'qr_code': self.qr_code,
                'default_location_id': self.default_location_id,
                'preferred_vendor_id': self.preferred_vendor_id,
                'reorder_point': self.reorder_point,
                'reorder_quantity': self.reorder_quantity,
                'safety_stock': self.safety_stock,
                'last_count_date': self.last_count_date.isoformat() if self.last_count_date else None,
                'last_restock_date': self.last_restock_date.isoformat() if self.last_restock_date else None,
                'avg_monthly_usage': self.avg_monthly_usage,
                'avg_lead_time_days': self.avg_lead_time_days,
                'cost_per_unit': self.cost_per_unit,
                'currency': self.currency,
                'image_url': self.image_url,
                'reserved_quantity': self.reserved_quantity,
                'available_quantity': self.available_quantity,
                'needs_reorder': self.needs_reorder,
                'stock_status': self.stock_status,
            })

        return result

    def __repr__(self):
        return f'<Material {self.code}: {self.name}>'
