"""
Material model for stock/inventory management.
Tracks materials, stock levels, and consumption for work planning.
"""

from app.extensions import db
from datetime import datetime


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

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "category IN ('lubricant', 'filter', 'spare_part', 'consumable', 'electrical', 'mechanical', 'hvac', 'other')",
            name='check_material_category'
        ),
    )

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

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        name = self.name_ar if language == 'ar' and self.name_ar else self.name
        monthly_consumption = self.get_monthly_consumption()
        stock_months = self.get_stock_months()

        return {
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

    def __repr__(self):
        return f'<Material {self.code}: {self.name}>'
