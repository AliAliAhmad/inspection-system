"""
Defect Assessment model.
Specialist reviews defect validity before starting repair work.
"""

from app.extensions import db
from datetime import datetime


class DefectAssessment(db.Model):
    """
    Specialist assessment of defect validity.
    Confirm: proceed with repair, inspector keeps finding point.
    Reject: false alarm, inspector loses 1 star.
    Minor: valid but less severe, downgrade priority.
    """
    __tablename__ = 'defect_assessments'

    id = db.Column(db.Integer, primary_key=True)

    defect_id = db.Column(db.Integer, db.ForeignKey('defects.id'), nullable=False, unique=True)
    specialist_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Verdict
    verdict = db.Column(db.String(20), nullable=False)  # confirm, reject, minor

    # Notes
    technical_notes = db.Column(db.Text, nullable=False)

    assessed_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    defect = db.relationship('Defect', backref='assessment')
    specialist = db.relationship('User', backref='defect_assessments')

    __table_args__ = (
        db.CheckConstraint(
            "verdict IN ('confirm', 'reject', 'minor')",
            name='check_valid_verdict'
        ),
    )

    def to_dict(self, language='en'):
        from app.utils.bilingual import get_bilingual_text
        notes = get_bilingual_text(
            'defect_assessment', self.id, 'technical_notes',
            self.technical_notes, language
        ) if self.technical_notes else self.technical_notes

        return {
            'id': self.id,
            'defect_id': self.defect_id,
            'specialist_id': self.specialist_id,
            'specialist': self.specialist.to_dict() if self.specialist else None,
            'verdict': self.verdict,
            'technical_notes': notes,
            'assessed_at': self.assessed_at.isoformat() if self.assessed_at else None
        }

    def __repr__(self):
        return f'<DefectAssessment Defect:{self.defect_id} - {self.verdict}>'
