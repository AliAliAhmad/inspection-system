"""
File Model
Stores uploaded file metadata with Cloudinary cloud storage.
"""

from app.extensions import db
from datetime import datetime


class File(db.Model):
    """Uploaded file metadata. Files stored on Cloudinary."""

    __tablename__ = 'files'

    id = db.Column(db.Integer, primary_key=True)

    # File Details
    original_filename = db.Column(db.String(255), nullable=False)
    stored_filename = db.Column(db.String(255), nullable=False, unique=True)
    file_path = db.Column(db.String(500), nullable=False)
    file_size = db.Column(db.Integer, nullable=False)
    mime_type = db.Column(db.String(100), nullable=True)

    # Uploaded By
    uploaded_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Related Entity
    related_type = db.Column(db.String(50), nullable=True)  # 'specialist_job', 'defect', 'cleaning', etc.
    related_id = db.Column(db.Integer, nullable=True)

    # Cloudinary AI Features
    ai_tags = db.Column(db.JSON, nullable=True)  # Auto-detected tags from Cloudinary AI
    ocr_text = db.Column(db.Text, nullable=True)  # Extracted text from OCR

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    uploader = db.relationship('User', backref='uploaded_files')

    def is_image(self):
        """Check if file is an image."""
        return self.mime_type and self.mime_type.startswith('image/')

    def is_video(self):
        """Check if file is a video."""
        return self.mime_type and self.mime_type.startswith('video/')

    def is_audio(self):
        """Check if file is audio."""
        return self.mime_type and self.mime_type.startswith('audio/')

    def get_file_size_mb(self):
        """Get file size in MB."""
        return round(self.file_size / (1024 * 1024), 2)

    def get_url(self):
        """Get the URL for this file. Returns Cloudinary URL directly."""
        if self.file_path and self.file_path.startswith('http'):
            return self.file_path
        return None

    def to_dict(self):
        url = self.get_url()
        return {
            'id': self.id,
            'original_filename': self.original_filename,
            'file_size': self.file_size,
            'file_size_mb': self.get_file_size_mb(),
            'mime_type': self.mime_type,
            'is_image': self.is_image(),
            'is_video': self.is_video(),
            'is_audio': self.is_audio(),
            'uploaded_by': self.uploaded_by,
            'related_type': self.related_type,
            'related_id': self.related_id,
            'url': url,  # Direct Cloudinary URL
            'ai_tags': self.ai_tags,  # Auto-detected tags from Cloudinary AI
            'ocr_text': self.ocr_text,  # Extracted text from OCR
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<File {self.original_filename} ({self.get_file_size_mb()}MB)>'
