"""
Defect Occurrence model.
Tracks each time the same defect is found across inspections.
"""

from app.extensions import db
from datetime import datetime


class DefectOccurrence(db.Model):
    """
    Records each occurrence of a defect across inspections.
    Media lives on the InspectionAnswer for this inspection + checklist_item.
    """
    __tablename__ = 'defect_occurrences'

    id = db.Column(db.Integer, primary_key=True)
    defect_id = db.Column(db.Integer, db.ForeignKey('defects.id'), nullable=False)
    inspection_id = db.Column(db.Integer, db.ForeignKey('inspections.id'), nullable=False)
    occurrence_number = db.Column(db.Integer, nullable=False)
    found_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    found_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    defect = db.relationship('Defect', back_populates='occurrences')
    inspection = db.relationship('Inspection')
    found_by = db.relationship('User')

    def to_dict(self, language='en', checklist_item_id=None):
        """Convert occurrence to dictionary, including the inspection answer media."""
        data = {
            'id': self.id,
            'defect_id': self.defect_id,
            'inspection_id': self.inspection_id,
            'occurrence_number': self.occurrence_number,
            'found_by_id': self.found_by_id,
            'found_by': {'id': self.found_by.id, 'full_name': self.found_by.full_name} if self.found_by else None,
            'found_at': self.found_at.isoformat() if self.found_at else None,
        }

        # Include the inspection answer with media for this occurrence
        if checklist_item_id and self.inspection_id:
            from app.models.inspection import InspectionAnswer
            answer = InspectionAnswer.query.filter_by(
                inspection_id=self.inspection_id,
                checklist_item_id=checklist_item_id
            ).first()
            data['inspection_answer'] = answer.to_dict(language=language) if answer else None
        else:
            data['inspection_answer'] = None

        return data

    def __repr__(self):
        return f'<DefectOccurrence defect:{self.defect_id} #{self.occurrence_number}>'
