"""
Admin Activity Log - tracks all admin/engineer actions for audit trail.
"""

from app.extensions import db
from datetime import datetime


class AdminActivityLog(db.Model):
    __tablename__ = 'admin_activity_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    action = db.Column(db.String(50), nullable=False)  # create, update, delete, approve, reject, etc.
    entity_type = db.Column(db.String(50), nullable=False)  # user, equipment, inspection, etc.
    entity_id = db.Column(db.Integer, nullable=True)
    entity_name = db.Column(db.String(200), nullable=True)  # human-readable name
    details = db.Column(db.JSON, nullable=True)  # changed fields, old/new values
    ip_address = db.Column(db.String(45), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship('User', backref=db.backref('activity_logs', lazy='dynamic'))

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user_name': self.user.full_name if self.user else None,
            'action': self.action,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'entity_name': self.entity_name,
            'details': self.details,
            'ip_address': self.ip_address,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    @staticmethod
    def log(user_id, action, entity_type, entity_id=None, entity_name=None, details=None, ip_address=None):
        """Create an activity log entry."""
        entry = AdminActivityLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            details=details,
            ip_address=ip_address,
        )
        db.session.add(entry)
        return entry
