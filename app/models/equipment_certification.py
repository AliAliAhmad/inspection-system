"""
Equipment Certification model for tracking certifications and compliance documents.
"""

from app.extensions import db
from datetime import datetime, date


class EquipmentCertification(db.Model):
    """
    Tracks certifications and compliance documents for equipment.
    Includes expiry tracking for automatic notification of upcoming renewals.
    """
    __tablename__ = 'equipment_certifications'

    id = db.Column(db.Integer, primary_key=True)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False)

    # Certification details
    name = db.Column(db.String(200), nullable=False)
    name_ar = db.Column(db.String(200), nullable=True)
    description = db.Column(db.Text, nullable=True)
    certification_type = db.Column(db.String(100), nullable=True)  # e.g., safety, calibration, inspection

    # Issuer information
    issuing_authority = db.Column(db.String(200), nullable=True)
    certificate_number = db.Column(db.String(100), nullable=True)

    # Dates
    issued_date = db.Column(db.Date, nullable=False)
    expiry_date = db.Column(db.Date, nullable=True)

    # Document
    document_url = db.Column(db.String(500), nullable=True)
    document_file_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=True)

    # Status: active, expired, revoked, pending_renewal
    status = db.Column(db.String(30), default='active')

    # Tracking
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    last_notified_at = db.Column(db.DateTime, nullable=True)  # Track when expiry notification was sent

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    equipment = db.relationship('Equipment', backref=db.backref('certifications', lazy='dynamic', order_by='EquipmentCertification.expiry_date'))
    created_by = db.relationship('User', backref=db.backref('created_certifications', lazy='dynamic'))
    document_file = db.relationship('File')

    __table_args__ = (
        db.CheckConstraint(
            "status IN ('active', 'expired', 'revoked', 'pending_renewal')",
            name='check_valid_certification_status'
        ),
    )

    @property
    def is_expired(self):
        """Check if certification is expired."""
        if not self.expiry_date:
            return False
        return self.expiry_date < date.today()

    @property
    def days_until_expiry(self):
        """Calculate days until expiry. Negative if already expired."""
        if not self.expiry_date:
            return None
        return (self.expiry_date - date.today()).days

    @property
    def computed_status(self):
        """Calculate current status based on expiry date."""
        if self.status == 'revoked':
            return 'revoked'
        if self.is_expired:
            return 'expired'
        if self.days_until_expiry and self.days_until_expiry <= 30:
            return 'pending_renewal'
        return 'active'

    def to_dict(self, language='en'):
        return {
            'id': self.id,
            'equipment_id': self.equipment_id,
            'name': self.name_ar if language == 'ar' and self.name_ar else self.name,
            'name_en': self.name,
            'name_ar': self.name_ar,
            'description': self.description,
            'certification_type': self.certification_type,
            'issuing_authority': self.issuing_authority,
            'certificate_number': self.certificate_number,
            'issued_date': self.issued_date.isoformat() if self.issued_date else None,
            'expiry_date': self.expiry_date.isoformat() if self.expiry_date else None,
            'document_url': self.document_url,
            'document_file_id': self.document_file_id,
            'status': self.computed_status,
            'days_until_expiry': self.days_until_expiry,
            'is_expired': self.is_expired,
            'created_by_id': self.created_by_id,
            'created_by': self.created_by.full_name if self.created_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<EquipmentCertification {self.name} for Equipment:{self.equipment_id}>'
