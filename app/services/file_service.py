"""
Service for secure file upload handling using Cloudinary.
Handles inspection photos, videos, voice notes, etc.
"""

import logging
import os
import cloudinary
import cloudinary.uploader
from datetime import datetime
from werkzeug.utils import secure_filename
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
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


def _init_cloudinary():
    """Initialize Cloudinary with environment variables."""
    cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME')
    api_key = os.getenv('CLOUDINARY_API_KEY')
    api_secret = os.getenv('CLOUDINARY_API_SECRET')

    if not all([cloud_name, api_key, api_secret]):
        logger.error("Cloudinary credentials not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET")
        raise ValidationError("File upload service not configured")

    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True
    )


def _get_resource_type(ext, mime_type):
    """Determine Cloudinary resource type from extension/mime."""
    video_extensions = {'mp4', 'mov', '3gp', 'avi', 'mkv', 'flv', 'wmv', 'm4v', 'ts', 'webm'}
    audio_extensions = {'wav', 'mp3', 'ogg', 'm4a'}

    # webm can be audio (voice notes) or video - check mime type
    if ext == 'webm':
        if mime_type and 'audio' in mime_type.lower():
            return 'video'  # Cloudinary uses 'video' for audio too
        return 'video'

    if ext in video_extensions:
        return 'video'
    if ext in audio_extensions:
        return 'video'  # Cloudinary uses 'video' resource type for audio
    return 'image'


class FileService:
    """Service for managing file uploads to Cloudinary."""

    @staticmethod
    def allowed_file(filename):
        """Check if file extension is allowed."""
        return '.' in filename and \
            filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

    @staticmethod
    def upload_file(file, uploaded_by, related_type=None, related_id=None, category='general'):
        """
        Upload a file to Cloudinary.

        Args:
            file: FileStorage object from request.files
            uploaded_by: User ID
            related_type: e.g. 'inspection_answer', 'defect', 'cleaning'
            related_id: ID of related object
            category: File category for folder organization

        Returns:
            File model instance with Cloudinary URL
        """
        if not file or file.filename == '':
            raise ValidationError("No file provided")

        if not FileService.allowed_file(file.filename):
            raise ValidationError(f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

        # Initialize Cloudinary
        _init_cloudinary()

        # Get file info
        ext = file.filename.rsplit('.', 1)[1].lower()
        original_filename = secure_filename(file.filename)
        mime_type = file.content_type or ''

        # Determine resource type for Cloudinary
        resource_type = _get_resource_type(ext, mime_type)

        # Create folder structure: category/YYYY/MM/DD
        date_folder = datetime.utcnow().strftime('%Y/%m/%d')
        folder = f"inspection_system/{category}/{date_folder}"

        # Upload to Cloudinary
        try:
            # Read file content
            file_content = file.read()
            file_size = len(file_content)

            if file_size > MAX_FILE_SIZE:
                raise ValidationError(f"File too large. Maximum: {MAX_FILE_SIZE // (1024*1024)}MB")

            # Reset file pointer for potential re-read
            file.seek(0)

            # Upload options (explicitly disable default preset to avoid ML add-ons)
            upload_options = {
                'folder': folder,
                'resource_type': resource_type,
                'invalidate': True,
                'upload_preset': None,  # Override default preset
            }

            # For images, add optimization
            if resource_type == 'image':
                upload_options['transformation'] = [
                    {'quality': 'auto:good', 'fetch_format': 'auto'}
                ]

            # Upload
            result = cloudinary.uploader.upload(
                file,
                **upload_options
            )

            cloudinary_url = result.get('secure_url')
            public_id = result.get('public_id')

            # Extract AI tags from response
            ai_tags = None
            if resource_type == 'image':
                # Tags come as list of tag names or categorization results
                tags_data = result.get('tags', [])
                info = result.get('info', {})
                categorization = info.get('categorization', {})
                google_tags = categorization.get('google_tagging', {}).get('data', [])

                if google_tags:
                    # Format: [{'tag': 'name', 'confidence': 0.9}, ...]
                    ai_tags = [{'tag': t.get('tag'), 'confidence': t.get('confidence')} for t in google_tags]
                elif tags_data:
                    ai_tags = [{'tag': t, 'confidence': 1.0} for t in tags_data]

            if not cloudinary_url:
                raise ValidationError("Upload failed - no URL returned")

            logger.info("Cloudinary upload success: public_id=%s url=%s", public_id, cloudinary_url)

        except cloudinary.exceptions.Error as e:
            logger.error("Cloudinary upload failed: %s", e)
            raise ValidationError(f"Upload failed: {str(e)}")

        # Create database record
        file_record = File(
            original_filename=original_filename,
            stored_filename=public_id,  # Store Cloudinary public_id
            file_path=cloudinary_url,   # Store Cloudinary URL
            file_size=file_size,
            mime_type=mime_type,
            uploaded_by=uploaded_by,
            related_type=related_type,
            related_id=related_id,
            ai_tags=ai_tags,  # Store AI-detected tags
        )
        db.session.add(file_record)
        db.session.commit()

        logger.info("File uploaded: file_id=%s filename=%s size=%s user_id=%s cloudinary_url=%s ai_tags=%s",
                    file_record.id, original_filename, file_size, uploaded_by, cloudinary_url, ai_tags)

        return file_record

    @staticmethod
    def upload_from_bytes(file_bytes, filename, mime_type, uploaded_by, related_type=None, related_id=None, category='general'):
        """
        Upload file from bytes to Cloudinary.

        Args:
            file_bytes: Raw file bytes
            filename: Original filename
            mime_type: MIME type of the file
            uploaded_by: User ID
            related_type: e.g. 'inspection_answer', 'defect'
            related_id: ID of related object
            category: File category for folder organization

        Returns:
            File model instance with Cloudinary URL
        """
        if not file_bytes:
            raise ValidationError("No file data provided")

        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'bin'
        if ext not in ALLOWED_EXTENSIONS:
            raise ValidationError(f"File type not allowed")

        file_size = len(file_bytes)
        if file_size > MAX_FILE_SIZE:
            raise ValidationError(f"File too large. Maximum: {MAX_FILE_SIZE // (1024*1024)}MB")

        # Initialize Cloudinary
        _init_cloudinary()

        resource_type = _get_resource_type(ext, mime_type)
        date_folder = datetime.utcnow().strftime('%Y/%m/%d')
        folder = f"inspection_system/{category}/{date_folder}"

        try:
            upload_options = {
                'folder': folder,
                'resource_type': resource_type,
                'invalidate': True,
                'upload_preset': None,  # Override default preset
            }

            if resource_type == 'image':
                upload_options['transformation'] = [
                    {'quality': 'auto:good', 'fetch_format': 'auto'}
                ]

            result = cloudinary.uploader.upload(
                file_bytes,
                **upload_options
            )

            cloudinary_url = result.get('secure_url')
            public_id = result.get('public_id')

            # Extract AI tags from response
            ai_tags = None
            if resource_type == 'image':
                tags_data = result.get('tags', [])
                info = result.get('info', {})
                categorization = info.get('categorization', {})
                google_tags = categorization.get('google_tagging', {}).get('data', [])

                if google_tags:
                    ai_tags = [{'tag': t.get('tag'), 'confidence': t.get('confidence')} for t in google_tags]
                elif tags_data:
                    ai_tags = [{'tag': t, 'confidence': 1.0} for t in tags_data]

            if not cloudinary_url:
                raise ValidationError("Upload failed - no URL returned")

        except cloudinary.exceptions.Error as e:
            logger.error("Cloudinary upload failed: %s", e)
            raise ValidationError(f"Upload failed: {str(e)}")

        # Create database record
        file_record = File(
            original_filename=secure_filename(filename),
            stored_filename=public_id,
            file_path=cloudinary_url,
            file_size=file_size,
            mime_type=mime_type,
            uploaded_by=uploaded_by,
            related_type=related_type,
            related_id=related_id,
            ai_tags=ai_tags,
        )
        db.session.add(file_record)
        db.session.commit()

        logger.info("File uploaded from bytes: file_id=%s cloudinary_url=%s ai_tags=%s", file_record.id, cloudinary_url, ai_tags)

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
        """Delete a file from Cloudinary and database."""
        file_record = db.session.get(File, file_id)
        if not file_record:
            raise ValidationError(f"File {file_id} not found")

        # Delete from Cloudinary if we have a public_id
        public_id = file_record.stored_filename
        if public_id and not public_id.startswith('/'):  # Skip old local paths
            try:
                _init_cloudinary()

                # Determine resource type from mime
                resource_type = 'image'
                if file_record.mime_type:
                    if 'video' in file_record.mime_type or 'audio' in file_record.mime_type:
                        resource_type = 'video'

                cloudinary.uploader.destroy(public_id, resource_type=resource_type)
                logger.info("Cloudinary file deleted: public_id=%s", public_id)
            except Exception as e:
                logger.warning("Failed to delete from Cloudinary: %s", e)
                # Continue with DB deletion even if Cloudinary fails

        db.session.delete(file_record)
        db.session.commit()
        logger.info("File deleted: file_id=%s by user_id=%s", file_id, user_id)

    @staticmethod
    def get_url(file_record):
        """Get the URL for a file. For Cloudinary files, returns the direct URL."""
        if file_record and file_record.file_path:
            # Cloudinary URLs start with https://
            if file_record.file_path.startswith('http'):
                return file_record.file_path
        return None

    @staticmethod
    def extract_ocr(file_id):
        """
        Extract text from an image using Cloudinary OCR.
        Updates the file record with extracted text.

        Args:
            file_id: ID of the file to process

        Returns:
            Extracted text or None
        """
        file_record = db.session.get(File, file_id)
        if not file_record:
            raise ValidationError(f"File {file_id} not found")

        if not file_record.is_image():
            raise ValidationError("OCR is only available for images")

        public_id = file_record.stored_filename
        if not public_id or public_id.startswith('/'):
            raise ValidationError("File not stored on Cloudinary")

        _init_cloudinary()

        try:
            # Use Cloudinary's OCR add-on to extract text
            # The adv_ocr add-on extracts text from images
            result = cloudinary.api.resource(
                public_id,
                ocr='adv_ocr'
            )

            # Extract OCR text from response
            ocr_info = result.get('info', {}).get('ocr', {})
            adv_ocr = ocr_info.get('adv_ocr', {})
            text_annotations = adv_ocr.get('data', [])

            extracted_text = ''
            if text_annotations:
                # Get all detected text blocks
                for annotation in text_annotations:
                    text_data = annotation.get('fullTextAnnotation', {})
                    if text_data:
                        extracted_text = text_data.get('text', '')
                        break
                    # Fallback to textAnnotations
                    text_annotations_list = annotation.get('textAnnotations', [])
                    if text_annotations_list:
                        # First annotation contains full text
                        extracted_text = text_annotations_list[0].get('description', '')
                        break

            # Update file record with OCR text
            if extracted_text:
                file_record.ocr_text = extracted_text
                db.session.commit()
                logger.info("OCR extracted for file_id=%s: %s chars", file_id, len(extracted_text))

            return extracted_text

        except cloudinary.exceptions.Error as e:
            logger.error("Cloudinary OCR failed for file_id=%s: %s", file_id, e)
            raise ValidationError(f"OCR failed: {str(e)}")

    @staticmethod
    def get_background_removed_url(file_record):
        """
        Get URL with background removed using Cloudinary AI.

        Args:
            file_record: File model instance

        Returns:
            URL with background removal transformation applied
        """
        url = file_record.get_url()
        if not url or 'cloudinary.com' not in url:
            return url

        # Add background removal transformation
        # e_background_removal removes background using AI
        return url.replace('/upload/', '/upload/e_background_removal/')

    @staticmethod
    def get_optimized_url(file_record, transformations=None):
        """
        Get optimized URL with custom Cloudinary transformations.

        Args:
            file_record: File model instance
            transformations: List of transformation strings (e.g., ['w_300', 'h_200', 'c_fill'])

        Returns:
            URL with transformations applied
        """
        url = file_record.get_url()
        if not url or 'cloudinary.com' not in url:
            return url

        if not transformations:
            transformations = ['f_auto', 'q_auto']

        transform_str = ','.join(transformations)
        return url.replace('/upload/', f'/upload/{transform_str}/')
