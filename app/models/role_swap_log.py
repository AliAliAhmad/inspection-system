"""
Role Swap Log model for tracking role changes.
"""

from app.extensions import db
from datetime import datetime


class RoleSwapLog(db.Model):
    """
    Tracks history of role swaps (major <-> minor role changes).
    """
    __tablename__ = 'role_swap_logs'

    id = db.Column(db.Integer, primary_key=True)

    # The user whose role was swapped
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Who performed the swap (admin)
    admin_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Previous state
    old_role = db.Column(db.String(50), nullable=False)
    old_role_id = db.Column(db.String(20), nullable=False)
    old_minor_role = db.Column(db.String(50), nullable=True)
    old_minor_role_id = db.Column(db.String(20), nullable=True)

    # New state
    new_role = db.Column(db.String(50), nullable=False)
    new_role_id = db.Column(db.String(20), nullable=False)
    new_minor_role = db.Column(db.String(50), nullable=True)
    new_minor_role_id = db.Column(db.String(20), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship('User', foreign_keys=[user_id])
    admin = db.relationship('User', foreign_keys=[admin_id])

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user_name': self.user.full_name if self.user else None,
            'admin_id': self.admin_id,
            'admin_name': self.admin.full_name if self.admin else None,
            'old_role': self.old_role,
            'old_role_id': self.old_role_id,
            'old_minor_role': self.old_minor_role,
            'old_minor_role_id': self.old_minor_role_id,
            'new_role': self.new_role,
            'new_role_id': self.new_role_id,
            'new_minor_role': self.new_minor_role,
            'new_minor_role_id': self.new_minor_role_id,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<RoleSwapLog {self.user_id}: {self.old_role} -> {self.new_role}>'
