"""
EngineerJobLocation model for tracking engineer location history during jobs.
"""

from app.extensions import db
from datetime import datetime


class EngineerJobLocation(db.Model):
    """Location history for engineer job tracking."""
    __tablename__ = 'engineer_job_locations'

    id = db.Column(db.Integer, primary_key=True)

    # Job reference
    engineer_job_id = db.Column(db.Integer, db.ForeignKey('engineer_jobs.id'), nullable=False, index=True)

    # Location data
    latitude = db.Column(db.Numeric(10, 8), nullable=False)
    longitude = db.Column(db.Numeric(11, 8), nullable=False)
    accuracy_meters = db.Column(db.Float, nullable=True)  # GPS accuracy
    altitude_meters = db.Column(db.Float, nullable=True)

    # Location type/event
    location_type = db.Column(db.String(50), default='tracking')  # checkin, checkout, tracking, manual

    # Address (if reverse geocoded)
    address = db.Column(db.String(500), nullable=True)

    # User reference
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Timestamps
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    engineer_job = db.relationship('EngineerJob', backref=db.backref('location_history', lazy='dynamic'))
    user = db.relationship('User', backref='job_locations')

    __table_args__ = (
        db.CheckConstraint(
            "location_type IN ('checkin', 'checkout', 'tracking', 'manual')",
            name='check_valid_location_type'
        ),
        db.Index('ix_engineer_job_locations_job_recorded', 'engineer_job_id', 'recorded_at'),
    )

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'engineer_job_id': self.engineer_job_id,
            'latitude': float(self.latitude) if self.latitude else None,
            'longitude': float(self.longitude) if self.longitude else None,
            'accuracy_meters': self.accuracy_meters,
            'altitude_meters': self.altitude_meters,
            'location_type': self.location_type,
            'address': self.address,
            'user_id': self.user_id,
            'recorded_at': self.recorded_at.isoformat() + 'Z' if self.recorded_at else None,
        }

    def __repr__(self):
        return f'<EngineerJobLocation job={self.engineer_job_id} type={self.location_type}>'
