"""
StockHistory model for tracking all stock changes.
Records all inventory movements for audit and analytics.
"""

from app.extensions import db
from datetime import datetime


class StockHistory(db.Model):
    """Track all stock changes"""
    __tablename__ = 'stock_history'

    id = db.Column(db.Integer, primary_key=True)
    material_id = db.Column(db.Integer, db.ForeignKey('materials.id'), nullable=False, index=True)

    change_type = db.Column(db.String(30), nullable=False, index=True)  # 'consume', 'restock', 'adjust', 'transfer', 'return', 'waste'
    quantity_before = db.Column(db.Float, nullable=False)
    quantity_change = db.Column(db.Float, nullable=False)  # Positive or negative
    quantity_after = db.Column(db.Float, nullable=False)

    reason = db.Column(db.String(200))
    reason_ar = db.Column(db.String(200))

    # Link to source
    source_type = db.Column(db.String(50), index=True)  # 'job', 'manual', 'import', 'count', 'po'
    source_id = db.Column(db.Integer)

    # Who and when
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    # Batch info if applicable
    batch_id = db.Column(db.Integer, db.ForeignKey('material_batches.id'), index=True)

    material = db.relationship('Material', backref='stock_history')
    user = db.relationship('User')
    batch = db.relationship('MaterialBatch', backref='history')

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        reason = self.reason_ar if language == 'ar' and self.reason_ar else self.reason

        return {
            'id': self.id,
            'material_id': self.material_id,
            'change_type': self.change_type,
            'quantity_before': self.quantity_before,
            'quantity_change': self.quantity_change,
            'quantity_after': self.quantity_after,
            'reason': reason,
            'reason_en': self.reason,
            'reason_ar': self.reason_ar,
            'source_type': self.source_type,
            'source_id': self.source_id,
            'user_id': self.user_id,
            'batch_id': self.batch_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<StockHistory {self.change_type} {self.quantity_change} for Material {self.material_id}>'
