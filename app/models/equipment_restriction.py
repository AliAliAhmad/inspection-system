"""
Equipment Restriction model for equipment-specific scheduling rules.
Supports various restriction types like blackouts, crew requirements, and skill requirements.
"""

from app.extensions import db
from datetime import datetime


class EquipmentRestriction(db.Model):
    """
    Scheduling restriction for equipment.
    Can define blackout periods, crew size requirements, skill requirements, etc.
    """
    __tablename__ = 'equipment_restrictions'

    id = db.Column(db.Integer, primary_key=True)

    # Equipment
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False)

    # Restriction type
    # blackout: Equipment not available for scheduling
    # crew_size: Minimum crew size required
    # skill_required: Specific skills required
    # shift_only: Can only work during specific shift
    restriction_type = db.Column(db.String(30), nullable=False)

    # Restriction value (JSON, depends on type)
    # blackout: { "reason": "maintenance" }
    # crew_size: { "min": 2, "max": 4 }
    # skill_required: { "skills": ["electrical", "hydraulic"] }
    # shift_only: { "shift": "day" }
    value = db.Column(db.JSON)

    # Reason for restriction
    reason = db.Column(db.Text)

    # Date range (null means ongoing)
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)

    # Permanent restriction (no end date)
    is_permanent = db.Column(db.Boolean, default=False)

    # Status
    is_active = db.Column(db.Boolean, default=True)

    # Creator
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    equipment = db.relationship('Equipment', backref='restrictions')
    created_by = db.relationship('User')

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "restriction_type IN ('blackout', 'crew_size', 'skill_required', 'shift_only')",
            name='check_restriction_type'
        ),
    )

    @property
    def is_currently_active(self):
        """Check if restriction is currently in effect."""
        if not self.is_active:
            return False
        if self.is_permanent:
            return True

        today = datetime.utcnow().date()
        if self.start_date and today < self.start_date:
            return False
        if self.end_date and today > self.end_date:
            return False
        return True

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'equipment_id': self.equipment_id,
            'restriction_type': self.restriction_type,
            'value': self.value,
            'reason': self.reason,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'is_permanent': self.is_permanent,
            'is_active': self.is_active,
            'is_currently_active': self.is_currently_active,
            'created_by_id': self.created_by_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<EquipmentRestriction equipment={self.equipment_id} type={self.restriction_type}>'
