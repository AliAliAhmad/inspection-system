"""
File Model
Stores uploaded file metadata with filesystem-based storage.
"""

from app.extensions import db
from datetime import datetime


class File(db.Model):
    """Uploaded file metadata. Actual files stored on filesystem."""

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

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    uploader = db.relationship('User', backref='uploaded_files')

    def is_image(self):
        """Check if file is an image."""
        return self.mime_type and self.mime_type.startswith('image/')

    def get_file_size_mb(self):
        """Get file size in MB."""
        return round(self.file_size / (1024 * 1024), 2)

    def to_dict(self):
        return {
            'id': self.id,
            'original_filename': self.original_filename,
            'file_size': self.file_size,
            'file_size_mb': self.get_file_size_mb(),
            'mime_type': self.mime_type,
            'is_image': self.is_image(),
            'uploaded_by': self.uploaded_by,
            'related_type': self.related_type,
            'related_id': self.related_id,
            'download_url': f'/api/files/{self.id}/download',
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<File {self.original_filename} ({self.get_file_size_mb()}MB)>'
