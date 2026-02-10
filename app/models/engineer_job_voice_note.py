"""
EngineerJobVoiceNote model for tracking voice notes attached to engineer jobs.
"""

from app.extensions import db
from datetime import datetime


class EngineerJobVoiceNote(db.Model):
    """Voice note attached to an engineer job."""
    __tablename__ = 'engineer_job_voice_notes'

    id = db.Column(db.Integer, primary_key=True)

    # Job reference
    engineer_job_id = db.Column(db.Integer, db.ForeignKey('engineer_jobs.id'), nullable=False, index=True)

    # File reference (stored in files table)
    file_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=False)

    # Metadata
    duration_seconds = db.Column(db.Integer, nullable=True)  # Audio duration
    transcription = db.Column(db.Text, nullable=True)  # Transcribed text (if available)
    transcription_ar = db.Column(db.Text, nullable=True)  # Arabic translation

    # Note context
    note_type = db.Column(db.String(50), default='general')  # general, progress_update, issue, completion

    # Created by
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    engineer_job = db.relationship('EngineerJob', backref=db.backref('voice_notes', lazy='dynamic'))
    file = db.relationship('File', backref='voice_note')
    creator = db.relationship('User', backref='engineer_job_voice_notes')

    __table_args__ = (
        db.CheckConstraint(
            "note_type IN ('general', 'progress_update', 'issue', 'completion')",
            name='check_valid_voice_note_type'
        ),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        transcription = self.transcription_ar if language == 'ar' and self.transcription_ar else self.transcription

        return {
            'id': self.id,
            'engineer_job_id': self.engineer_job_id,
            'file_id': self.file_id,
            'file': self.file.to_dict() if self.file else None,
            'duration_seconds': self.duration_seconds,
            'transcription': transcription,
            'note_type': self.note_type,
            'created_by': self.created_by,
            'creator_name': self.creator.full_name if self.creator else None,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
        }

    def __repr__(self):
        return f'<EngineerJobVoiceNote job={self.engineer_job_id} type={self.note_type}>'
