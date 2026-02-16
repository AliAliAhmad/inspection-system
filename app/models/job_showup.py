"""
Job Show Up & Challenge models.
Tracks show-up photos, challenge voice notes, and review marks (star/point)
for specialist and engineer jobs.
"""

from app.extensions import db
from datetime import datetime


class JobShowUpPhoto(db.Model):
    """Photo proving specialist/engineer showed up to the job site."""
    __tablename__ = 'job_showup_photos'

    id = db.Column(db.Integer, primary_key=True)

    # Polymorphic job reference
    job_type = db.Column(db.String(20), nullable=False)  # 'specialist' or 'engineer'
    job_id = db.Column(db.Integer, nullable=False)

    # File reference (stored in files table via Cloudinary)
    file_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=False)

    # Who uploaded
    uploaded_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    file = db.relationship('File', backref='showup_photo')
    uploader = db.relationship('User', backref='showup_photos')

    __table_args__ = (
        db.Index('ix_showup_photos_job', 'job_type', 'job_id'),
        db.CheckConstraint(
            "job_type IN ('specialist', 'engineer')",
            name='check_showup_photo_job_type'
        ),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'job_type': self.job_type,
            'job_id': self.job_id,
            'file_id': self.file_id,
            'file': self.file.to_dict() if self.file else None,
            'uploaded_by': self.uploaded_by,
            'uploader_name': self.uploader.full_name if self.uploader else None,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
        }

    def __repr__(self):
        return f'<JobShowUpPhoto {self.job_type}#{self.job_id}>'


class JobChallengeVoice(db.Model):
    """Voice note describing a challenge encountered on a job."""
    __tablename__ = 'job_challenge_voices'

    id = db.Column(db.Integer, primary_key=True)

    # Polymorphic job reference
    job_type = db.Column(db.String(20), nullable=False)  # 'specialist' or 'engineer'
    job_id = db.Column(db.Integer, nullable=False)

    # File reference (audio stored in files table via Cloudinary)
    file_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=False)

    # Transcriptions (bilingual)
    transcription_en = db.Column(db.Text, nullable=True)
    transcription_ar = db.Column(db.Text, nullable=True)

    # Audio metadata
    duration_seconds = db.Column(db.Integer, nullable=True)

    # Who recorded
    recorded_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    file = db.relationship('File', backref='challenge_voice')
    recorder = db.relationship('User', backref='challenge_voices')

    __table_args__ = (
        db.Index('ix_challenge_voices_job', 'job_type', 'job_id'),
        db.CheckConstraint(
            "job_type IN ('specialist', 'engineer')",
            name='check_challenge_voice_job_type'
        ),
    )

    def to_dict(self, language='en'):
        transcription = self.transcription_ar if language == 'ar' and self.transcription_ar else self.transcription_en

        return {
            'id': self.id,
            'job_type': self.job_type,
            'job_id': self.job_id,
            'file_id': self.file_id,
            'file': self.file.to_dict() if self.file else None,
            'transcription': transcription,
            'transcription_en': self.transcription_en,
            'transcription_ar': self.transcription_ar,
            'duration_seconds': self.duration_seconds,
            'recorded_by': self.recorded_by,
            'recorder_name': self.recorder.full_name if self.recorder else None,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
        }

    def __repr__(self):
        return f'<JobChallengeVoice {self.job_type}#{self.job_id}>'


class JobReviewMark(db.Model):
    """
    Star or Point mark added by engineer/admin during review.
    - star: marks job as 'show up' (good work to showcase)
    - point: marks job as 'challenge' (issue to discuss)
    """
    __tablename__ = 'job_review_marks'

    id = db.Column(db.Integer, primary_key=True)

    # Polymorphic job reference
    job_type = db.Column(db.String(20), nullable=False)  # 'specialist' or 'engineer'
    job_id = db.Column(db.Integer, nullable=False)

    # Mark type
    mark_type = db.Column(db.String(10), nullable=False)  # 'star' (show up) or 'point' (challenge)

    # Optional note
    note = db.Column(db.Text, nullable=True)

    # Who marked
    marked_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    marker = db.relationship('User', backref='review_marks')

    __table_args__ = (
        db.Index('ix_review_marks_job', 'job_type', 'job_id'),
        db.CheckConstraint(
            "job_type IN ('specialist', 'engineer')",
            name='check_review_mark_job_type'
        ),
        db.CheckConstraint(
            "mark_type IN ('star', 'point')",
            name='check_review_mark_type'
        ),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'job_type': self.job_type,
            'job_id': self.job_id,
            'mark_type': self.mark_type,
            'note': self.note,
            'marked_by': self.marked_by,
            'marker_name': self.marker.full_name if self.marker else None,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
        }

    def __repr__(self):
        return f'<JobReviewMark {self.mark_type} {self.job_type}#{self.job_id}>'
