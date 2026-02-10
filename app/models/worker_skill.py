"""
Worker Skill model for tracking worker skills and certifications.
Supports skill levels and certification verification.
"""

from app.extensions import db
from datetime import datetime


class WorkerSkill(db.Model):
    """
    Skill or certification held by a worker.
    Tracks skill level, certification details, and verification status.
    """
    __tablename__ = 'worker_skills'

    id = db.Column(db.Integer, primary_key=True)

    # Worker
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Skill information
    skill_name = db.Column(db.String(100), nullable=False)
    skill_level = db.Column(db.Integer, default=1)  # 1-5 scale

    # Certification details
    certification_name = db.Column(db.String(200))
    certification_number = db.Column(db.String(100))
    issued_date = db.Column(db.Date)
    expiry_date = db.Column(db.Date)
    issuing_authority = db.Column(db.String(200))

    # Supporting document
    document_file_id = db.Column(db.Integer, db.ForeignKey('files.id'))

    # Verification status
    is_verified = db.Column(db.Boolean, default=False)
    verified_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    verified_at = db.Column(db.DateTime)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship('User', foreign_keys=[user_id], backref='skills')
    verified_by = db.relationship('User', foreign_keys=[verified_by_id])
    document_file = db.relationship('File')

    # Constraints
    __table_args__ = (
        db.UniqueConstraint('user_id', 'skill_name', name='unique_user_skill'),
        db.CheckConstraint('skill_level >= 1 AND skill_level <= 5', name='check_skill_level_range'),
    )

    @property
    def is_expired(self):
        """Check if certification is expired."""
        if not self.expiry_date:
            return False
        return self.expiry_date < datetime.utcnow().date()

    @property
    def days_until_expiry(self):
        """Get days until expiry (negative if expired)."""
        if not self.expiry_date:
            return None
        delta = self.expiry_date - datetime.utcnow().date()
        return delta.days

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'skill_name': self.skill_name,
            'skill_level': self.skill_level,
            'certification_name': self.certification_name,
            'certification_number': self.certification_number,
            'issued_date': self.issued_date.isoformat() if self.issued_date else None,
            'expiry_date': self.expiry_date.isoformat() if self.expiry_date else None,
            'issuing_authority': self.issuing_authority,
            'document_file_id': self.document_file_id,
            'document_url': self.document_file.get_url() if self.document_file else None,
            'is_verified': self.is_verified,
            'verified_by_id': self.verified_by_id,
            'verified_at': self.verified_at.isoformat() if self.verified_at else None,
            'is_expired': self.is_expired,
            'days_until_expiry': self.days_until_expiry,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<WorkerSkill user={self.user_id} skill={self.skill_name}>'
