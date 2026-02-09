"""
InventoryCount model for periodic stock counting.
Tracks inventory counts, variances, and approvals.
"""

from app.extensions import db
from datetime import datetime


class InventoryCount(db.Model):
    """Periodic stock counting"""
    __tablename__ = 'inventory_counts'

    id = db.Column(db.Integer, primary_key=True)
    count_date = db.Column(db.Date, nullable=False, index=True)
    count_type = db.Column(db.String(30), index=True)  # 'full', 'cycle', 'spot'
    status = db.Column(db.String(20), default='draft', index=True)  # draft, in_progress, completed, approved

    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), index=True)
    approved_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)

    created_by = db.relationship('User', foreign_keys=[created_by_id])
    approved_by = db.relationship('User', foreign_keys=[approved_by_id])

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'count_date': self.count_date.isoformat() if self.count_date else None,
            'count_type': self.count_type,
            'status': self.status,
            'created_by_id': self.created_by_id,
            'approved_by_id': self.approved_by_id,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'items_count': len(self.items) if self.items else 0,
        }

    def __repr__(self):
        return f'<InventoryCount {self.count_type} on {self.count_date}>'


class InventoryCountItem(db.Model):
    """Individual items in a count"""
    __tablename__ = 'inventory_count_items'

    id = db.Column(db.Integer, primary_key=True)
    count_id = db.Column(db.Integer, db.ForeignKey('inventory_counts.id'), nullable=False, index=True)
    material_id = db.Column(db.Integer, db.ForeignKey('materials.id'), nullable=False, index=True)

    system_quantity = db.Column(db.Float)  # What system says
    counted_quantity = db.Column(db.Float)  # What was actually counted
    variance = db.Column(db.Float)  # Difference

    counted_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    counted_at = db.Column(db.DateTime)
    notes = db.Column(db.Text)

    count = db.relationship('InventoryCount', backref='items')
    material = db.relationship('Material')
    counted_by = db.relationship('User')

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'count_id': self.count_id,
            'material_id': self.material_id,
            'system_quantity': self.system_quantity,
            'counted_quantity': self.counted_quantity,
            'variance': self.variance,
            'counted_by_id': self.counted_by_id,
            'counted_at': self.counted_at.isoformat() if self.counted_at else None,
            'notes': self.notes,
        }

    def __repr__(self):
        return f'<InventoryCountItem Material {self.material_id} in Count {self.count_id}>'
