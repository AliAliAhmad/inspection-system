"""
Inspection schedule and routine models.
InspectionSchedule: legacy per-equipment scheduling.
InspectionRoutine: new asset-type-based routine system.
WeeklyCompletion: tracks completion per week.
"""

from app.extensions import db
from datetime import datetime


class InspectionSchedule(db.Model):
    """Weekly schedule for equipment inspections. Imported from Excel."""
    __tablename__ = 'inspection_schedules'

    id = db.Column(db.Integer, primary_key=True)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False)
    day_of_week = db.Column(db.Integer, nullable=False)
    shift = db.Column(db.String(20), nullable=True, default='morning')  # 'morning', 'afternoon', 'night', or legacy 'day'
    berth = db.Column(db.String(50), nullable=True)  # from Excel import
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    equipment = db.relationship('Equipment', backref='schedules')

    __table_args__ = (
        db.CheckConstraint('day_of_week >= 0 AND day_of_week <= 6', name='check_valid_day'),
    )

    def to_dict(self):
        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        return {
            'id': self.id,
            'equipment_id': self.equipment_id,
            'equipment': self.equipment.to_dict() if self.equipment else None,
            'day_of_week': self.day_of_week,
            'day_name': days[self.day_of_week],
            'shift': self.shift,
            'berth': self.berth,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        return f'<InspectionSchedule Equipment:{self.equipment_id} Day:{days[self.day_of_week]}>'


class InspectionRoutine(db.Model):
    """
    Inspection routine based on asset type (not individual equipment).
    Admin creates routines that apply to all equipment of matching types.
    System generates daily inspection lists from these routines at 1:00 PM.
    """
    __tablename__ = 'inspection_routines'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    name_ar = db.Column(db.String(200), nullable=True)

    # Asset types this routine applies to (JSON array)
    asset_types = db.Column(db.JSON, nullable=False)  # e.g. ["Centrifugal Pump", "Screw Pump"]

    # Shift: 'morning', 'afternoon', 'night', or null for any shift
    shift = db.Column(db.String(20), nullable=True)

    # Frequency: 'daily', 'weekly', 'monthly'
    frequency = db.Column(db.String(20), nullable=True, default='weekly')

    # Days of week for weekly frequency (JSON array)
    # e.g. ["monday", "wednesday", "friday"]
    days_of_week = db.Column(db.JSON, nullable=True)

    # Template to use
    template_id = db.Column(db.Integer, db.ForeignKey('checklist_templates.id'), nullable=False)

    is_active = db.Column(db.Boolean, default=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    template = db.relationship('ChecklistTemplate')
    created_by = db.relationship('User')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'name_ar': self.name_ar,
            'asset_types': self.asset_types,
            'shift': self.shift,
            'frequency': self.frequency or 'weekly',
            'days_of_week': self.days_of_week or [],
            'template_id': self.template_id,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<InspectionRoutine {self.name}>'


class WeeklyCompletion(db.Model):
    """Tracks completion of inspections per week."""
    __tablename__ = 'weekly_completions'

    id = db.Column(db.Integer, primary_key=True)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False)
    week_number = db.Column(db.Integer, nullable=False)
    year = db.Column(db.Integer, nullable=False)
    completion_count = db.Column(db.Integer, default=0)
    last_inspection_id = db.Column(db.Integer, db.ForeignKey('inspections.id'), nullable=True)
    last_inspection_date = db.Column(db.Date, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    equipment = db.relationship('Equipment', backref='weekly_completions')
    last_inspection = db.relationship('Inspection', foreign_keys=[last_inspection_id])

    __table_args__ = (
        db.UniqueConstraint('equipment_id', 'year', 'week_number', name='uq_equipment_week'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'equipment_id': self.equipment_id,
            'week_number': self.week_number,
            'year': self.year,
            'week_label': f"{self.year}-W{self.week_number:02d}",
            'completion_count': self.completion_count,
            'last_inspection_id': self.last_inspection_id,
            'last_inspection_date': self.last_inspection_date.isoformat() if self.last_inspection_date else None
        }

    def __repr__(self):
        return f'<WeeklyCompletion Equipment:{self.equipment_id} {self.year}-W{self.week_number}>'
