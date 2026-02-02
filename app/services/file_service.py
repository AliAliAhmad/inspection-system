"""
Service for secure file upload handling.
Handles cleaning photos, evidence photos, defect photos, etc.
"""

import logging
import os
import uuid
import subprocess
from datetime import datetime
from werkzeug.utils import secure_filename
from flask import current_app
from app.models import File
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError


logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {
    # Images
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff', 'tif',
    # Documents
    'pdf',
    # Audio
    'webm', 'wav', 'mp3', 'ogg', 'm4a',
    # Video
    'mp4', 'mov', '3gp', 'avi', 'mkv', 'flv', 'wmv', 'm4v', 'ts',
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB (increased for video files)

# Extensions that need conversion (webm excluded — used for audio voice notes)
VIDEO_CONVERT_EXTENSIONS = {'mov', '3gp', 'avi', 'mkv', 'flv', 'wmv', 'm4v', 'ts'}
IMAGE_CONVERT_EXTENSIONS = {'heic', 'heif', 'bmp', 'tiff', 'tif'}

# Magic bytes for MIME type validation
MAGIC_BYTES = {
    'png': [(b'\x89PNG\r\n\x1a\n',)],
    'jpg': [(b'\xff\xd8\xff',)],
    'jpeg': [(b'\xff\xd8\xff',)],
    'gif': [(b'GIF87a',), (b'GIF89a',)],
    'webp': [(b'RIFF', b'WEBP')],  # RIFF....WEBP
    'pdf': [(b'%PDF',)],
    'wav': [(b'RIFF',)],
    'mp3': [(b'\xff\xfb',), (b'\xff\xf3',), (b'\xff\xf2',), (b'ID3',)],
    'ogg': [(b'OggS',)],
    # webm, m4a, mp4, mov, 3gp, avi, mkv, heic, heif, bmp, tiff — skip magic check
}


def _convert_video_to_mp4(file_path):
    """
    Convert a video file to mp4 using ffmpeg.
    Returns the new file path if successful, or the original path if conversion fails.
    """
    output_path = file_path.rsplit('.', 1)[0] + '.mp4'
    if file_path == output_path:
        return file_path

    try:
        result = subprocess.run(
            ['ffmpeg', '-i', file_path, '-c:v', 'libx264', '-c:a', 'aac',
             '-movflags', '+faststart', '-y', '-loglevel', 'error', output_path],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            os.remove(file_path)
            logger.info("Video converted to mp4: %s", output_path)
            return output_path
        else:
            logger.warning("Video conversion failed (returncode=%s): %s", result.returncode, result.stderr[:200])
            if os.path.exists(output_path):
                os.remove(output_path)
            return file_path
    except Exception as e:
        logger.warning("Video conversion error: %s", e)
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
            except OSError:
                pass
        return file_path


def _convert_image_to_jpg(file_path, ext):
    """
    Convert an image file to JPEG using Pillow (with pillow-heif for HEIC/HEIF).
    Returns the new file path if successful, or the original path if conversion fails.
    """
    output_path = file_path.rsplit('.', 1)[0] + '.jpg'

    try:
        if ext in ('heic', 'heif'):
            import pillow_heif
            pillow_heif.register_heif_opener()

        from PIL import Image
        img = Image.open(file_path)
        if img.mode in ('RGBA', 'P', 'LA'):
            img = img.convert('RGB')
        img.save(output_path, 'JPEG', quality=85)
        img.close()

        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            os.remove(file_path)
            logger.info("Image converted to jpg: %s", output_path)
            return output_path
        else:
            if os.path.exists(output_path):
                os.remove(output_path)
            return file_path
    except Exception as e:
        logger.warning("Image conversion error: %s", e)
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
            except OSError:
                pass
        return file_path


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
    logger.warning("MIME validation failed: file_path=%s claimed_extension=%s", file_path, extension)
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

        # Convert video formats to mp4
        if ext in VIDEO_CONVERT_EXTENSIONS:
            new_path = _convert_video_to_mp4(file_path)
            if new_path != file_path:
                file_path = new_path
                unique_name = os.path.basename(new_path)
                ext = 'mp4'

        # Convert image formats to jpg
        if ext in IMAGE_CONVERT_EXTENSIONS:
            new_path = _convert_image_to_jpg(file_path, ext)
            if new_path != file_path:
                file_path = new_path
                unique_name = os.path.basename(new_path)
                ext = 'jpg'

        # Get file size
        file_size = os.path.getsize(file_path)
        if file_size > MAX_FILE_SIZE:
            os.remove(file_path)
            raise ValidationError(f"File too large. Maximum: {MAX_FILE_SIZE // (1024*1024)}MB")

        # Determine correct MIME type after potential conversion
        mime_type = file.content_type
        if ext == 'mp4':
            mime_type = 'video/mp4'
        elif ext == 'jpg':
            mime_type = 'image/jpeg'

        # Create database record
        file_record = File(
            original_filename=secure_filename(file.filename),
            stored_filename=unique_name,
            file_path=file_path,
            file_size=file_size,
            mime_type=mime_type,
            uploaded_by=uploaded_by,
            related_type=related_type,
            related_id=related_id
        )
        db.session.add(file_record)
        db.session.commit()
        logger.info("File uploaded: file_id=%s filename=%s size=%s user_id=%s related_type=%s", file_record.id, file.filename, file_size, uploaded_by, related_type)

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
        file_record = db.session.get(File, file_id)
        if not file_record:
            raise ValidationError(f"File {file_id} not found")

        # Remove physical file
        if os.path.exists(file_record.file_path):
            os.remove(file_record.file_path)

        db.session.delete(file_record)
        db.session.commit()
        logger.info("File deleted: file_id=%s by user_id=%s", file_id, user_id)
