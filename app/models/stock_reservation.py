"""
StockReservation model for reserving stock for upcoming jobs.
Tracks reserved inventory to prevent over-commitment.
"""

from app.extensions import db
from datetime import datetime


class StockReservation(db.Model):
    """Reserve stock for upcoming jobs"""
    __tablename__ = 'stock_reservations'

    id = db.Column(db.Integer, primary_key=True)
    material_id = db.Column(db.Integer, db.ForeignKey('materials.id'), nullable=False, index=True)
    quantity = db.Column(db.Float, nullable=False)

    # What it's reserved for
    reservation_type = db.Column(db.String(50), index=True)  # 'job', 'work_plan', 'manual'
    job_id = db.Column(db.Integer, index=True)
    work_plan_id = db.Column(db.Integer, index=True)

    reserved_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), index=True)
    reserved_at = db.Column(db.DateTime, default=datetime.utcnow)
    needed_by_date = db.Column(db.Date, index=True)

    status = db.Column(db.String(20), default='active', index=True)  # active, fulfilled, cancelled
    fulfilled_at = db.Column(db.DateTime)

    notes = db.Column(db.Text)

    material = db.relationship('Material', backref='reservations')
    reserved_by = db.relationship('User')

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'material_id': self.material_id,
            'quantity': self.quantity,
            'reservation_type': self.reservation_type,
            'job_id': self.job_id,
            'work_plan_id': self.work_plan_id,
            'reserved_by_id': self.reserved_by_id,
            'reserved_at': self.reserved_at.isoformat() if self.reserved_at else None,
            'needed_by_date': self.needed_by_date.isoformat() if self.needed_by_date else None,
            'status': self.status,
            'fulfilled_at': self.fulfilled_at.isoformat() if self.fulfilled_at else None,
            'notes': self.notes,
        }

    def __repr__(self):
        return f'<StockReservation {self.quantity} of Material {self.material_id} for {self.reservation_type}>'
