"""
Inspection and inspection answer models.
"""

from app.extensions import db
from datetime import datetime

class Inspection(db.Model):
    """
    Inspection record representing a technician's inspection of equipment.
    
    Lifecycle: draft → submitted → reviewed
    
    Attributes:
        id: Primary key
        equipment_id: ID of equipment being inspected
        template_id: ID of checklist template used
        technician_id: ID of technician performing inspection
        status: Current status (draft, submitted, reviewed)
        result: Final result (pass, fail, incomplete)
        started_at: When inspection was started
        submitted_at: When inspection was submitted
        reviewed_at: When inspection was reviewed
        reviewed_by_id: ID of admin who reviewed
    """
    __tablename__ = 'inspections'
    
    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(db.Integer, db.ForeignKey('inspection_assignments.id'), nullable=True)
    inspection_code = db.Column(db.String(100), nullable=True, unique=True)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False)
    template_id = db.Column(db.Integer, db.ForeignKey('checklist_templates.id'), nullable=False)
    technician_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    status = db.Column(
        db.Enum('draft', 'submitted', 'reviewed', name='inspection_status'),
        default='draft'
    )
    result = db.Column(
        db.Enum('pass', 'fail', 'incomplete', name='inspection_result'),
        nullable=True
    )
    started_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    submitted_at = db.Column(db.DateTime, nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    reviewed_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    equipment = db.relationship('Equipment', back_populates='inspections')
    template = db.relationship('ChecklistTemplate', back_populates='inspections')
    technician = db.relationship('User', foreign_keys=[technician_id], backref='inspections')
    reviewed_by = db.relationship('User', foreign_keys=[reviewed_by_id], backref='reviewed_inspections')
    answers = db.relationship(
        'InspectionAnswer',
        back_populates='inspection',
        cascade='all, delete-orphan',
        lazy='dynamic'
    )
    defects = db.relationship('Defect', back_populates='inspection', lazy='dynamic')
    
    __table_args__ = (
        db.CheckConstraint(
            'submitted_at IS NULL OR submitted_at >= started_at',
            name='check_submitted_after_start'
        ),
        db.CheckConstraint(
            'reviewed_at IS NULL OR reviewed_at >= submitted_at',
            name='check_reviewed_after_submit'
        ),
    )
    
    def to_dict(self, include_answers=False, language='en'):
        """Convert inspection to dictionary."""
        data = {
            'id': self.id,
            'assignment_id': self.assignment_id,
            'inspection_code': self.inspection_code,
            'equipment_id': self.equipment_id,
            'equipment': self.equipment.to_dict(language=language) if self.equipment else None,
            'template_id': self.template_id,
            'technician_id': self.technician_id,
            'technician': self.technician.to_dict() if self.technician else None,
            'status': self.status,
            'result': self.result,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
            'reviewed_at': self.reviewed_at.isoformat() if self.reviewed_at else None,
            'notes': self.notes
        }
        if include_answers:
            data['answers'] = [answer.to_dict(language=language) for answer in self.answers.all()]
        return data
    
    def __repr__(self):
        return f'<Inspection {self.id} - {self.status}>'


class InspectionAnswer(db.Model):
    """
    Individual answer to a checklist item within an inspection.
    
    Attributes:
        id: Primary key
        inspection_id: ID of parent inspection
        checklist_item_id: ID of the question being answered
        answer_value: The answer (stored as string, validated by type)
        comment: Optional comment
        photo_path: Path to uploaded photo (if any)
        answered_at: When the answer was recorded
    """
    __tablename__ = 'inspection_answers'
    
    id = db.Column(db.Integer, primary_key=True)
    inspection_id = db.Column(db.Integer, db.ForeignKey('inspections.id'), nullable=False)
    checklist_item_id = db.Column(db.Integer, db.ForeignKey('checklist_items.id'), nullable=False)
    answer_value = db.Column(db.String(500), nullable=False)
    comment = db.Column(db.Text, nullable=True)
    photo_path = db.Column(db.String(500), nullable=True)
    video_path = db.Column(db.String(500), nullable=True)
    video_file_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=True)
    voice_note_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=True)
    answered_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    inspection = db.relationship('Inspection', back_populates='answers')
    checklist_item = db.relationship('ChecklistItem', back_populates='answers')
    video_file = db.relationship('File', foreign_keys=[video_file_id])
    voice_note = db.relationship('File', foreign_keys=[voice_note_id])
    
    __table_args__ = (
        db.UniqueConstraint(
            'inspection_id',
            'checklist_item_id',
            name='uq_answer_inspection_item'
        ),
    )
    
    def to_dict(self, language='en'):
        """Convert answer to dictionary."""
        from app.utils.bilingual import get_bilingual_text
        comment = get_bilingual_text(
            'inspection_answer', self.id, 'comment',
            self.comment, language
        ) if self.comment else self.comment

        # Look up the photo file record if photo_path is set
        photo_file = None
        if self.photo_path:
            from app.models.file import File
            photo_file = File.query.filter_by(
                related_type='inspection_answer',
                related_id=self.checklist_item_id
            ).first()

        # Look up the video file record
        video_file_record = None
        if self.video_file_id:
            video_file_record = self.video_file
        elif self.video_path:
            from app.models.file import File
            video_file_record = File.query.filter_by(
                related_type='inspection_answer_video',
                related_id=self.checklist_item_id
            ).first()

        return {
            'id': self.id,
            'inspection_id': self.inspection_id,
            'checklist_item_id': self.checklist_item_id,
            'checklist_item': self.checklist_item.to_dict(language=language) if self.checklist_item else None,
            'answer_value': self.answer_value,
            'comment': comment,
            'photo_path': self.photo_path,
            'photo_file': photo_file.to_dict() if photo_file else None,
            'video_path': self.video_path,
            'video_file': video_file_record.to_dict() if video_file_record else None,
            'voice_note_id': self.voice_note_id,
            'voice_note': self.voice_note.to_dict() if self.voice_note else None,
            'answered_at': self.answered_at.isoformat() if self.answered_at else None
        }
    
    def __repr__(self):
        return f'<InspectionAnswer {self.id}>'