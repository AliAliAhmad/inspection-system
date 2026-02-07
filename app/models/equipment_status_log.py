"""
Equipment Status Log model for tracking status changes.
"""

from app.extensions import db
from datetime import datetime


class EquipmentStatusLog(db.Model):
    """
    Tracks history of equipment status changes.
    Records who changed the status, reason, and next action.
    """
    __tablename__ = 'equipment_status_logs'

    id = db.Column(db.Integer, primary_key=True)

    # Equipment reference
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False)

    # Status change
    old_status = db.Column(db.String(30), nullable=True)
    new_status = db.Column(db.String(30), nullable=False)

    # Mandatory fields
    reason = db.Column(db.Text, nullable=False)
    next_action = db.Column(db.Text, nullable=False)

    # Source of status change
    source_type = db.Column(db.String(20), nullable=False, default='manual')
    # 'manual' = admin/engineer changed it
    # 'inspection' = from failed inspection
    # 'defect' = from defect workflow

    source_id = db.Column(db.Integer, nullable=True)
    # If source_type is 'inspection', this is inspection_id
    # If source_type is 'defect', this is defect_id

    # Who made the change
    changed_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Timestamp
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    equipment = db.relationship('Equipment', backref=db.backref('status_logs', lazy='dynamic', order_by='EquipmentStatusLog.created_at.desc()'))
    changed_by = db.relationship('User')

    def to_dict(self):
        return {
            'id': self.id,
            'equipment_id': self.equipment_id,
            'old_status': self.old_status,
            'new_status': self.new_status,
            'reason': self.reason,
            'next_action': self.next_action,
            'source_type': self.source_type,
            'source_id': self.source_id,
            'changed_by_id': self.changed_by_id,
            'changed_by': self.changed_by.full_name if self.changed_by else None,
            'changed_by_role_id': self.changed_by.role_id if self.changed_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<EquipmentStatusLog {self.equipment_id}: {self.old_status} -> {self.new_status}>'
