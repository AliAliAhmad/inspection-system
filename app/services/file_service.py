"""
Service for secure file upload handling.
Handles cleaning photos, evidence photos, defect photos, etc.
"""

import os
import uuid
from datetime import datetime
from werkzeug.utils import secure_filename
from flask import current_app
from app.models import File
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError


ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf'}
MAX_FILE_SIZE = 16 * 1024 * 1024  # 16MB

# Magic bytes for MIME type validation
MAGIC_BYTES = {
    'png': [(b'\x89PNG\r\n\x1a\n',)],
    'jpg': [(b'\xff\xd8\xff',)],
    'jpeg': [(b'\xff\xd8\xff',)],
    'gif': [(b'GIF87a',), (b'GIF89a',)],
    'webp': [(b'RIFF', b'WEBP')],  # RIFF....WEBP
    'pdf': [(b'%PDF',)],
}


def _validate_mime_type(file_path, extension):
    """
    Validate file content matches its claimed extension using magic bytes.
    Removes the file and raises ValidationError if mismatch detected.
    """
    signatures = MAGIC_BYTES.get(extension)
    if not signatures:
        return

    try:
        with open(file_path, 'rb') as f:
            header = f.read(16)
    except OSError:
        os.remove(file_path)
        raise ValidationError("Could not read uploaded file")

    for sig_parts in signatures:
        if extension == 'webp':
            # WEBP: starts with RIFF, bytes 8-11 are WEBP
            if header[:4] == sig_parts[0] and header[8:12] == sig_parts[1]:
                return
        else:
            if header.startswith(sig_parts[0]):
                return

    os.remove(file_path)
    raise ValidationError(
        f"File content does not match .{extension} format. "
        "The file may be corrupted or have an incorrect extension."
    )


class FileService:
    """Service for managing file uploads."""

    @staticmethod
    def allowed_file(filename):
        """Check if file extension is allowed."""
        return '.' in filename and \
            filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

    @staticmethod
    def upload_file(file, uploaded_by, related_type=None, related_id=None, category='general'):
        """
        Upload a file securely.

        Args:
            file: FileStorage object from request.files
            uploaded_by: User ID
            related_type: e.g. 'specialist_job', 'defect', 'cleaning'
            related_id: ID of related object
            category: File category for organization

        Returns:
            File model instance
        """
        if not file or file.filename == '':
            raise ValidationError("No file provided")

        if not FileService.allowed_file(file.filename):
            raise ValidationError(f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

        # Generate unique filename
        ext = file.filename.rsplit('.', 1)[1].lower()
        unique_name = f"{uuid.uuid4().hex}.{ext}"

        # Organize into subdirectories by date and category
        date_dir = datetime.utcnow().strftime('%Y/%m/%d')
        upload_dir = os.path.join(
            current_app.config.get('UPLOAD_FOLDER', 'instance/uploads'),
            category,
            date_dir
        )
        os.makedirs(upload_dir, exist_ok=True)

        file_path = os.path.join(upload_dir, unique_name)
        file.save(file_path)

        # Validate file content matches extension (magic bytes check)
        _validate_mime_type(file_path, ext)

        # Get file size
        file_size = os.path.getsize(file_path)
        if file_size > MAX_FILE_SIZE:
            os.remove(file_path)
            raise ValidationError(f"File too large. Maximum: {MAX_FILE_SIZE // (1024*1024)}MB")

        # Create database record
        file_record = File(
            original_filename=secure_filename(file.filename),
            stored_filename=unique_name,
            file_path=file_path,
            file_size=file_size,
            mime_type=file.content_type,
            uploaded_by=uploaded_by,
            related_type=related_type,
            related_id=related_id
        )
        db.session.add(file_record)
        db.session.commit()

        return file_record

    @staticmethod
    def upload_multiple(files, uploaded_by, related_type=None, related_id=None, category='general'):
        """Upload multiple files."""
        results = []
        for file in files:
            result = FileService.upload_file(
                file, uploaded_by, related_type, related_id, category
            )
            results.append(result)
        return results

    @staticmethod
    def get_files(related_type, related_id):
        """Get all files for a related object."""
        return File.query.filter_by(
            related_type=related_type,
            related_id=related_id
        ).order_by(File.created_at.desc()).all()

    @staticmethod
    def delete_file(file_id, user_id):
        """Delete a file."""
        file_record = File.query.get(file_id)
        if not file_record:
            raise ValidationError(f"File {file_id} not found")

        # Remove physical file
        if os.path.exists(file_record.file_path):
            os.remove(file_record.file_path)

        db.session.delete(file_record)
        db.session.commit()
