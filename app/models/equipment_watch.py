"""
Equipment Watch model for tracking user subscriptions to equipment notifications.
"""

from app.extensions import db
from datetime import datetime


class EquipmentWatch(db.Model):
    """
    Tracks users who are watching specific equipment for notifications.
    When equipment status changes or anomalies are detected, watchers are notified.
    """
    __tablename__ = 'equipment_watches'

    id = db.Column(db.Integer, primary_key=True)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Notification preferences
    notify_status_change = db.Column(db.Boolean, default=True)
    notify_high_risk = db.Column(db.Boolean, default=True)
    notify_anomaly = db.Column(db.Boolean, default=True)
    notify_maintenance = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    equipment = db.relationship('Equipment', backref=db.backref('watchers', lazy='dynamic'))
    user = db.relationship('User', backref=db.backref('watched_equipment', lazy='dynamic'))

    __table_args__ = (
        db.UniqueConstraint('equipment_id', 'user_id', name='unique_equipment_watch'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'equipment_id': self.equipment_id,
            'user_id': self.user_id,
            'user': {
                'id': self.user.id,
                'full_name': self.user.full_name,
                'role_id': self.user.role_id,
                'role': self.user.role,
            } if self.user else None,
            'notify_status_change': self.notify_status_change,
            'notify_high_risk': self.notify_high_risk,
            'notify_anomaly': self.notify_anomaly,
            'notify_maintenance': self.notify_maintenance,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<EquipmentWatch User:{self.user_id} -> Equipment:{self.equipment_id}>'
