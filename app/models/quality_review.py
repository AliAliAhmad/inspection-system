"""
Quality Review model.
Tracks QC reviews of completed specialist/engineer jobs.
"""

from app.extensions import db
from datetime import datetime


class QualityReview(db.Model):
    """
    Quality Engineer review of completed work.
    Supports approve/reject workflow with admin validation of rejections.
    """
    __tablename__ = 'quality_reviews'

    id = db.Column(db.Integer, primary_key=True)

    # Job reference (polymorphic - can reference specialist_job or engineer_job)
    job_type = db.Column(db.String(30), nullable=False)  # 'specialist' or 'engineer'
    job_id = db.Column(db.Integer, nullable=False)

    # Quality Engineer
    qe_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Review status
    status = db.Column(db.String(20), default='pending')  # pending, approved, rejected

    # Rejection details
    rejection_reason = db.Column(db.Text, nullable=True)
    rejection_category = db.Column(db.String(50), nullable=True)
    # Categories: incomplete_work, wrong_parts, safety_issue, poor_workmanship,
    #             did_not_follow_procedure, equipment_still_faulty, other

    # Evidence
    evidence_notes = db.Column(db.Text, nullable=True)
    evidence_photos = db.Column(db.JSON, nullable=True)  # List of photo paths
    notes = db.Column(db.Text, nullable=True)  # General review notes

    # SLA tracking
    sla_deadline = db.Column(db.DateTime, nullable=True)
    sla_met = db.Column(db.Boolean, nullable=True)

    # Admin validation of rejection
    admin_validation = db.Column(db.String(20), nullable=True)  # 'valid' or 'wrong'
    admin_validation_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    admin_validation_notes = db.Column(db.Text, nullable=True)
    admin_validated_at = db.Column(db.DateTime, nullable=True)

    # Timestamps
    reviewed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    quality_engineer = db.relationship('User', foreign_keys=[qe_id], backref='quality_reviews')
    admin_validator = db.relationship('User', foreign_keys=[admin_validation_by])

    __table_args__ = (
        db.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name='check_valid_qr_status'
        ),
        db.CheckConstraint(
            "job_type IN ('specialist', 'engineer')",
            name='check_valid_qr_job_type'
        ),
        db.CheckConstraint(
            "admin_validation IN ('valid', 'wrong') OR admin_validation IS NULL",
            name='check_valid_admin_validation'
        ),
    )

    def to_dict(self, language='en'):
        from app.utils.bilingual import get_bilingual_fields
        text_fields = {}
        if self.rejection_reason:
            text_fields['rejection_reason'] = self.rejection_reason
        if self.notes:
            text_fields['notes'] = self.notes
        if self.admin_validation_notes:
            text_fields['admin_validation_notes'] = self.admin_validation_notes

        translated = get_bilingual_fields('quality_review', self.id, text_fields, language) if text_fields else {}

        return {
            'id': self.id,
            'job_type': self.job_type,
            'job_id': self.job_id,
            'qe_id': self.qe_id,
            'quality_engineer': self.quality_engineer.to_dict() if self.quality_engineer else None,
            'status': self.status,
            'rejection_reason': translated.get('rejection_reason', self.rejection_reason),
            'rejection_category': self.rejection_category,
            'notes': translated.get('notes', self.notes),
            'evidence_notes': self.evidence_notes,
            'sla_deadline': self.sla_deadline.isoformat() if self.sla_deadline else None,
            'sla_met': self.sla_met,
            'admin_validation': self.admin_validation,
            'admin_validation_notes': translated.get('admin_validation_notes', self.admin_validation_notes),
            'reviewed_at': self.reviewed_at.isoformat() if self.reviewed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<QualityReview {self.job_type}:{self.job_id} - {self.status}>'
