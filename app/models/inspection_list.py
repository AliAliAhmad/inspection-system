"""
Inspection List model.
Auto-generated daily at 1:00 PM for next shift inspections.
"""

from app.extensions import db
from datetime import datetime


class InspectionList(db.Model):
    """
    Daily inspection list generated from routines.
    Contains equipment that needs inspection for a specific shift/date.
    """
    __tablename__ = 'inspection_lists'

    id = db.Column(db.Integer, primary_key=True)

    # Generation info
    generated_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    shift = db.Column(db.String(20), nullable=False)  # 'day' or 'night'
    target_date = db.Column(db.Date, nullable=False)

    # Status
    status = db.Column(db.String(20), default='generated')  # generated, partially_assigned, fully_assigned, completed

    # Stats
    total_assets = db.Column(db.Integer, default=0)
    assigned_assets = db.Column(db.Integer, default=0)
    completed_assets = db.Column(db.Integer, default=0)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    assignments = db.relationship('InspectionAssignment', backref='inspection_list', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'generated_at': self.generated_at.isoformat() if self.generated_at else None,
            'shift': self.shift,
            'target_date': self.target_date.isoformat() if self.target_date else None,
            'status': self.status,
            'total_assets': self.total_assets,
            'assigned_assets': self.assigned_assets,
            'completed_assets': self.completed_assets,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<InspectionList {self.target_date} {self.shift}>'
