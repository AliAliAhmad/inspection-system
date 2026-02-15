"""
Running Hours Models
Equipment service tracking with meter readings, service intervals, and alerts
"""
from datetime import datetime, timezone
from app.extensions import db


class RunningHoursReading(db.Model):
    __tablename__ = 'running_hours_readings'

    id = db.Column(db.Integer, primary_key=True)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id', ondelete='CASCADE'), nullable=False, index=True)
    hours = db.Column(db.Float, nullable=False)
    recorded_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    recorded_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    notes = db.Column(db.Text, nullable=True)
    source = db.Column(db.String(20), default='manual', nullable=False)  # manual, meter, estimated

    # Relationships
    equipment = db.relationship('Equipment', backref=db.backref('running_hours_readings', lazy='dynamic'))
    recorded_by = db.relationship('User', backref='running_hours_entries')

    __table_args__ = (
        db.CheckConstraint("source IN ('manual', 'meter', 'estimated')", name='ck_rhr_source'),
    )

    def to_dict(self):
        prev = RunningHoursReading.query.filter(
            RunningHoursReading.equipment_id == self.equipment_id,
            RunningHoursReading.recorded_at < self.recorded_at
        ).order_by(RunningHoursReading.recorded_at.desc()).first()

        hours_since_last = round(self.hours - prev.hours, 2) if prev else None
        days_since_last = (self.recorded_at - prev.recorded_at).days if prev else None

        return {
            'id': self.id,
            'equipment_id': self.equipment_id,
            'hours': self.hours,
            'recorded_at': self.recorded_at.isoformat() if self.recorded_at else None,
            'recorded_by_id': self.recorded_by_id,
            'recorded_by': {
                'id': self.recorded_by.id,
                'full_name': self.recorded_by.full_name,
                'role_id': self.recorded_by.role_id,
            } if self.recorded_by else None,
            'notes': self.notes,
            'source': self.source,
            'hours_since_last': hours_since_last,
            'days_since_last': days_since_last,
        }


class ServiceInterval(db.Model):
    __tablename__ = 'service_intervals'

    id = db.Column(db.Integer, primary_key=True)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id', ondelete='CASCADE'), nullable=False, unique=True, index=True)
    service_interval_hours = db.Column(db.Float, nullable=False, default=500)
    alert_threshold_hours = db.Column(db.Float, nullable=False, default=50)
    last_service_date = db.Column(db.DateTime, nullable=True)
    last_service_hours = db.Column(db.Float, nullable=False, default=0)
    next_service_hours = db.Column(db.Float, nullable=False, default=500)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    equipment = db.relationship('Equipment', backref=db.backref('service_interval', uselist=False))

    def to_dict(self):
        return {
            'id': self.id,
            'equipment_id': self.equipment_id,
            'service_interval_hours': self.service_interval_hours,
            'alert_threshold_hours': self.alert_threshold_hours,
            'last_service_date': self.last_service_date.isoformat() if self.last_service_date else None,
            'last_service_hours': self.last_service_hours,
            'next_service_hours': self.next_service_hours,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class RunningHoursAlert(db.Model):
    __tablename__ = 'running_hours_alerts'

    id = db.Column(db.Integer, primary_key=True)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id', ondelete='CASCADE'), nullable=False, index=True)
    alert_type = db.Column(db.String(30), nullable=False)  # approaching_service, overdue_service, hours_spike, reading_gap
    severity = db.Column(db.String(10), nullable=False, default='warning')  # warning, critical
    message = db.Column(db.Text, nullable=False)
    hours_value = db.Column(db.Float, nullable=True)
    threshold_value = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    acknowledged_at = db.Column(db.DateTime, nullable=True)
    acknowledged_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Relationships
    equipment = db.relationship('Equipment', backref=db.backref('running_hours_alerts', lazy='dynamic'))
    acknowledged_by = db.relationship('User', backref='acknowledged_alerts')

    __table_args__ = (
        db.CheckConstraint(
            "alert_type IN ('approaching_service', 'overdue_service', 'hours_spike', 'reading_gap')",
            name='ck_rha_type'
        ),
        db.CheckConstraint("severity IN ('warning', 'critical')", name='ck_rha_severity'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'equipment_id': self.equipment_id,
            'equipment_name': self.equipment.name if self.equipment else None,
            'alert_type': self.alert_type,
            'severity': self.severity,
            'message': self.message,
            'hours_value': self.hours_value,
            'threshold_value': self.threshold_value,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'acknowledged_at': self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            'acknowledged_by_id': self.acknowledged_by_id,
        }
