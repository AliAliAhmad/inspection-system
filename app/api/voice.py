"""
Voice transcription and translation API endpoints.
Records audio → Whisper transcription → bilingual output (EN + AR).
"""

import os
import tempfile
import logging
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.services.translation_service import TranslationService

logger = logging.getLogger(__name__)

bp = Blueprint('voice', __name__)


@bp.route('/transcribe', methods=['POST'])
@jwt_required()
def transcribe():
    """
    Transcribe an audio file and return both English and Arabic text.

    Accepts: multipart/form-data with an 'audio' file field.
    Returns: { "status": "success", "data": { "en": "...", "ar": "...", "detected_language": "en|ar" } }
    """
    if 'audio' not in request.files:
        return jsonify({'status': 'error', 'message': 'No audio file provided'}), 400

    audio_file = request.files['audio']
    if not audio_file.filename:
        return jsonify({'status': 'error', 'message': 'Empty audio file'}), 400

    try:
        from openai import OpenAI

        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            return jsonify({'status': 'error', 'message': 'Transcription service not configured'}), 503

        client = OpenAI(api_key=api_key)

        # Save to temp file (Whisper needs a file-like with a name)
        suffix = _get_suffix(audio_file.filename or 'audio.webm')
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            audio_file.save(tmp)
            tmp_path = tmp.name

        try:
            with open(tmp_path, 'rb') as f:
                transcript = client.audio.transcriptions.create(
                    model='whisper-1',
                    file=f,
                    response_format='verbose_json',
                )

            text = transcript.text.strip() if transcript.text else ''
            detected_language = getattr(transcript, 'language', None) or 'unknown'

            if not text:
                return jsonify({
                    'status': 'success',
                    'data': {'en': '', 'ar': '', 'detected_language': detected_language}
                }), 200

            # Translate to both languages
            result = TranslationService.auto_translate(text)

            return jsonify({
                'status': 'success',
                'data': {
                    'en': result.get('en') or text,
                    'ar': result.get('ar') or text,
                    'detected_language': detected_language,
                }
            }), 200

        finally:
            os.unlink(tmp_path)

    except Exception as e:
        logger.error(f'Voice transcription failed: {e}')
        return jsonify({'status': 'error', 'message': 'Transcription failed'}), 500


@bp.route('/translate', methods=['POST'])
@jwt_required()
def translate():
    """
    Translate text to both English and Arabic.

    Accepts: JSON { "text": "..." }
    Returns: { "status": "success", "data": { "en": "...", "ar": "..." } }
    """
    data = request.get_json()
    if not data or not data.get('text', '').strip():
        return jsonify({'status': 'error', 'message': 'No text provided'}), 400

    text = data['text'].strip()
    result = TranslationService.auto_translate(text)

    return jsonify({
        'status': 'success',
        'data': {
            'en': result.get('en') or text,
            'ar': result.get('ar') or text,
        }
    }), 200


def _get_suffix(filename):
    """Extract file extension for temp file."""
    if '.' in filename:
        return '.' + filename.rsplit('.', 1)[1].lower()
    return '.webm'
