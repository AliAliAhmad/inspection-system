"""
Voice transcription and translation API endpoints.
Records audio → uploads to Cloudinary → Whisper transcription → bilingual output (EN + AR).
The audio file is always saved even if transcription fails.
"""

import os
import tempfile
import logging
import subprocess
import requests
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.translation_service import TranslationService
from app.services.file_service import FileService
from app.extensions import db

logger = logging.getLogger(__name__)

# Context prompt helps Whisper with domain-specific terminology
WHISPER_PROMPT = (
    "This is an industrial equipment inspection report. "
    "Terms include: bearing, valve, pump, motor, compressor, gasket, "
    "leak, corrosion, vibration, alignment, lubrication, pressure, "
    "temperature, RPM, voltage, amperage, insulation, winding."
)


def _convert_to_wav(source_path):
    """
    Convert audio file to WAV format using ffmpeg for better Whisper accuracy.
    Returns the WAV path if successful, or the original path if conversion fails.
    """
    wav_path = source_path.rsplit('.', 1)[0] + '_whisper.wav'
    try:
        result = subprocess.run(
            ['ffmpeg', '-i', source_path, '-ar', '16000', '-ac', '1',
             '-c:a', 'pcm_s16le', '-y', '-loglevel', 'error', wav_path],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and os.path.exists(wav_path) and os.path.getsize(wav_path) > 0:
            logger.info("Audio converted to WAV for Whisper: %s", wav_path)
            return wav_path
        else:
            logger.warning("WAV conversion failed: %s", result.stderr[:200])
            if os.path.exists(wav_path):
                os.remove(wav_path)
            return source_path
    except Exception as e:
        logger.warning("WAV conversion error: %s", e)
        if os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except OSError:
                pass
        return source_path


def _download_from_cloudinary(url, suffix='.webm'):
    """
    Download file from Cloudinary URL to a temp file for processing.
    Returns the temp file path.
    """
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()

        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        tmp.write(response.content)
        tmp.close()

        logger.info("Downloaded from Cloudinary: %s bytes", len(response.content))
        return tmp.name
    except Exception as e:
        logger.error("Failed to download from Cloudinary: %s", e)
        return None


bp = Blueprint('voice', __name__)


@bp.route('/transcribe', methods=['POST'])
@jwt_required()
def transcribe():
    """
    Save an audio recording to Cloudinary and transcribe it to both English and Arabic text.

    Accepts:
    1. multipart/form-data with 'audio' file field
    2. JSON with base64: audio_base64, file_name, file_type, language

    Optional: 'related_type', 'related_id' for linking the audio to an entity.
    Returns: {
        "status": "success",
        "data": {
            "en": "...", "ar": "...", "detected_language": "en|ar",
            "audio_file": { file record dict with Cloudinary URL },
            "transcription_failed": false
        }
    }
    """
    import base64
    from io import BytesIO
    from werkzeug.datastructures import FileStorage

    user_id = get_jwt_identity()

    # Check if base64 or FormData
    is_base64 = request.is_json and 'audio_base64' in request.json

    if is_base64:
        # Handle base64 upload
        data = request.json
        audio_base64 = data.get('audio_base64')
        file_name = data.get('file_name', 'recording.m4a')
        file_type = data.get('file_type', 'audio/m4a')
        language_hint = data.get('language', 'en')
        related_type = data.get('related_type')
        related_id = data.get('related_id')

        if not audio_base64:
            return jsonify({'status': 'error', 'message': 'audio_base64 is required'}), 400

        # Decode base64 to bytes
        try:
            audio_bytes = base64.b64decode(audio_base64)
            audio_content = audio_bytes
        except Exception as e:
            return jsonify({'status': 'error', 'message': f'Invalid base64 data: {str(e)}'}), 400

        # Create FileStorage object from bytes
        audio_file = FileStorage(
            stream=BytesIO(audio_bytes),
            filename=file_name,
            content_type=file_type
        )
        filename = file_name
    else:
        # Handle FormData upload (original method)
        if 'audio' not in request.files:
            return jsonify({'status': 'error', 'message': 'No audio file provided'}), 400

        audio_file = request.files['audio']
        if not audio_file.filename:
            return jsonify({'status': 'error', 'message': 'Empty audio file'}), 400

        related_type = request.form.get('related_type')
        related_id = request.form.get('related_id')
        language_hint = request.form.get('language')

        # Read audio content before upload
        audio_content = audio_file.read()
        audio_file.seek(0)  # Reset for upload

        # Ensure filename has an extension
        filename = audio_file.filename or 'recording.webm'
        if '.' not in filename:
            filename = filename + '.webm'
        audio_file.filename = filename

    if related_id:
        try:
            related_id = int(related_id)
        except (ValueError, TypeError):
            related_id = None

    # --- 2. Save the audio file to Cloudinary ---
    audio_file_record = None
    try:
        audio_file_record = FileService.upload_file(
            file=audio_file,
            uploaded_by=user_id,
            related_type=related_type,
            related_id=related_id,
            category='voice_notes',
        )
        logger.info("Voice recording saved to Cloudinary: file_id=%s user_id=%s url=%s",
                    audio_file_record.id, user_id, audio_file_record.file_path)
    except Exception as e:
        logger.error("Failed to save voice recording: %s", e)
        # Continue to try transcription even if file save fails

    # --- 3. Attempt transcription ---
    en_text = ''
    ar_text = ''
    detected_language = 'unknown'
    transcription_failed = False
    temp_files_to_cleanup = []

    try:
        from openai import OpenAI

        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            transcription_failed = True
            logger.warning("Transcription skipped: OPENAI_API_KEY not configured")
        else:
            client = OpenAI(api_key=api_key)

            # Create temp file from audio content for Whisper
            suffix = _get_suffix(filename)
            tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
            tmp.write(audio_content)
            tmp.close()
            source_path = tmp.name
            temp_files_to_cleanup.append(source_path)

            # Convert to WAV for better Whisper accuracy
            whisper_path = _convert_to_wav(source_path)
            if whisper_path != source_path:
                temp_files_to_cleanup.append(whisper_path)

            # Build Whisper API kwargs
            whisper_kwargs = {
                'model': 'whisper-1',
                'response_format': 'verbose_json',
                'prompt': WHISPER_PROMPT,
            }
            if language_hint in ('en', 'ar'):
                whisper_kwargs['language'] = language_hint

            with open(whisper_path, 'rb') as f:
                whisper_kwargs['file'] = f
                transcript = client.audio.transcriptions.create(**whisper_kwargs)

            text = transcript.text.strip() if transcript.text else ''
            detected_language = getattr(transcript, 'language', None) or 'unknown'

            if text:
                result = TranslationService.auto_translate(text)
                en_text = result.get('en') or text
                ar_text = result.get('ar') or text

    except Exception as e:
        logger.error("Voice transcription failed: %s", e)
        transcription_failed = True
    finally:
        # Clean up temp files
        for temp_file in temp_files_to_cleanup:
            try:
                if os.path.exists(temp_file):
                    os.unlink(temp_file)
            except OSError:
                pass

    # --- 4. Build response ---
    response_data = {
        'en': en_text,
        'ar': ar_text,
        'detected_language': detected_language,
        'transcription_failed': transcription_failed,
        'audio_file': audio_file_record.to_dict() if audio_file_record else None,
    }

    return jsonify({'status': 'success', 'data': response_data}), 200


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
