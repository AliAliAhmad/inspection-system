"""
File upload and download endpoints.
Files are stored on Cloudinary - download/stream redirect to Cloudinary URLs.
"""

from flask import Blueprint, request, jsonify, redirect
from flask_jwt_extended import jwt_required
from app.extensions import limiter
from app.services.file_service import FileService
from app.utils.decorators import get_current_user
from app.models import File

bp = Blueprint('files', __name__)


@bp.route('/upload', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def upload_file():
    """
    Upload a file.
    Multipart form: file, related_type, related_id, category
    """
    user = get_current_user()

    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file in request'}), 400

    file = request.files['file']
    related_type = request.form.get('related_type')
    related_id = request.form.get('related_id')
    category = request.form.get('category', 'general')

    file_record = FileService.upload_file(
        file=file,
        uploaded_by=user.id,
        related_type=related_type,
        related_id=int(related_id) if related_id else None,
        category=category
    )

    return jsonify({
        'status': 'success',
        'message': 'File uploaded',
        'data': file_record.to_dict()
    }), 201


@bp.route('/upload-multiple', methods=['POST'])
@limiter.limit("5 per minute")
@jwt_required()
def upload_multiple():
    """Upload multiple files."""
    user = get_current_user()

    files = request.files.getlist('files')
    if not files:
        return jsonify({'status': 'error', 'message': 'No files in request'}), 400

    related_type = request.form.get('related_type')
    related_id = request.form.get('related_id')
    category = request.form.get('category', 'general')

    results = FileService.upload_multiple(
        files=files,
        uploaded_by=user.id,
        related_type=related_type,
        related_id=int(related_id) if related_id else None,
        category=category
    )

    return jsonify({
        'status': 'success',
        'message': f'{len(results)} files uploaded',
        'data': [f.to_dict() for f in results]
    }), 201


@bp.route('/<int:file_id>/download', methods=['GET'])
@jwt_required()
def download_file(file_id):
    """Download a file - redirects to Cloudinary URL."""
    file_record = File.query.get_or_404(file_id)
    url = file_record.get_url()
    if url:
        return redirect(url)
    return jsonify({'status': 'error', 'message': 'File not available'}), 404


@bp.route('/<int:file_id>/stream', methods=['GET'])
def stream_file(file_id):
    """
    Stream a file - redirects to Cloudinary URL.
    No auth required since Cloudinary URLs are publicly accessible.
    Kept for backwards compatibility.
    """
    file_record = File.query.get_or_404(file_id)
    url = file_record.get_url()
    if url:
        return redirect(url)
    return jsonify({'status': 'error', 'message': 'File not available'}), 404


@bp.route('', methods=['GET'])
@jwt_required()
def list_files():
    """List files by related entity."""
    related_type = request.args.get('related_type')
    related_id = request.args.get('related_id')

    if related_type and related_id:
        files = FileService.get_files(related_type, int(related_id))
    else:
        user = get_current_user()
        files = File.query.filter_by(uploaded_by=user.id).order_by(
            File.created_at.desc()
        ).limit(50).all()

    return jsonify({
        'status': 'success',
        'data': [f.to_dict() for f in files]
    }), 200


@bp.route('/<int:file_id>', methods=['DELETE'])
@jwt_required()
def delete_file(file_id):
    """Delete a file."""
    user = get_current_user()
    FileService.delete_file(file_id, user.id)

    return jsonify({
        'status': 'success',
        'message': 'File deleted'
    }), 200


@bp.route('/<int:file_id>/ocr', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def extract_ocr(file_id):
    """
    Extract text from an image using Cloudinary OCR.
    Returns the extracted text and updates the file record.
    """
    text = FileService.extract_ocr(file_id)

    return jsonify({
        'status': 'success',
        'message': 'OCR extraction complete',
        'data': {
            'file_id': file_id,
            'ocr_text': text or ''
        }
    }), 200


@bp.route('/<int:file_id>/background-removed', methods=['GET'])
@jwt_required()
def get_background_removed(file_id):
    """
    Get URL with background removed using Cloudinary AI.
    Returns the transformed URL.
    """
    file_record = File.query.get_or_404(file_id)

    if not file_record.is_image():
        return jsonify({
            'status': 'error',
            'message': 'Background removal is only available for images'
        }), 400

    bg_removed_url = FileService.get_background_removed_url(file_record)

    return jsonify({
        'status': 'success',
        'data': {
            'file_id': file_id,
            'original_url': file_record.get_url(),
            'background_removed_url': bg_removed_url
        }
    }), 200


@bp.route('/<int:file_id>/info', methods=['GET'])
@jwt_required()
def get_file_info(file_id):
    """
    Get detailed file info including AI tags and OCR text.
    """
    file_record = File.query.get_or_404(file_id)

    data = file_record.to_dict()

    # Add transformed URLs for images
    if file_record.is_image():
        data['background_removed_url'] = FileService.get_background_removed_url(file_record)
        data['optimized_url'] = FileService.get_optimized_url(file_record)

    return jsonify({
        'status': 'success',
        'data': data
    }), 200
