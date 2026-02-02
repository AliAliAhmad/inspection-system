"""
Voice transcription and translation API endpoints.
Records audio → saves file permanently → Whisper transcription → bilingual output (EN + AR).
The audio file is always saved even if transcription fails.
"""

import os
import tempfile
import logging
import subprocess
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

bp = Blueprint('voice', __name__)


@bp.route('/transcribe', methods=['POST'])
@jwt_required()
def transcribe():
    """
    Save an audio recording and transcribe it to both English and Arabic text.

    Accepts: multipart/form-data with 'audio' file field.
             Optional: 'related_type', 'related_id' for linking the audio to an entity.
    Returns: {
        "status": "success",
        "data": {
            "en": "...", "ar": "...", "detected_language": "en|ar",
            "audio_file": { file record dict },
            "transcription_failed": false
        }
    }
    """
    if 'audio' not in request.files:
        return jsonify({'status': 'error', 'message': 'No audio file provided'}), 400

    audio_file = request.files['audio']
    if not audio_file.filename:
        return jsonify({'status': 'error', 'message': 'Empty audio file'}), 400

    user_id = get_jwt_identity()
    related_type = request.form.get('related_type')
    related_id = request.form.get('related_id')
    language_hint = request.form.get('language')  # 'en' or 'ar' from frontend
    if related_id:
        try:
            related_id = int(related_id)
        except (ValueError, TypeError):
            related_id = None

    # --- 1. Save the audio file permanently ---
    audio_file_record = None
    try:
        # Ensure filename has an extension
        filename = audio_file.filename or 'recording.webm'
        if '.' not in filename:
            filename = filename + '.webm'
        audio_file.filename = filename

        audio_file_record = FileService.upload_file(
            file=audio_file,
            uploaded_by=user_id,
            related_type=related_type,
            related_id=related_id,
            category='voice_notes',
        )
        logger.info("Voice recording saved: file_id=%s user_id=%s", audio_file_record.id, user_id)
    except Exception as e:
        logger.error("Failed to save voice recording: %s", e)
        # Continue to try transcription even if file save fails

    # --- 2. Attempt transcription ---
    en_text = ''
    ar_text = ''
    detected_language = 'unknown'
    transcription_failed = False

    try:
        from openai import OpenAI

        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            transcription_failed = True
            logger.warning("Transcription skipped: OPENAI_API_KEY not configured")
        else:
            client = OpenAI(api_key=api_key)

            # We need to read from the saved file (audio_file stream was consumed by upload)
            if audio_file_record and os.path.exists(audio_file_record.file_path):
                source_path = audio_file_record.file_path
            else:
                # Fallback: re-read from request if file save failed
                audio_file.seek(0)
                suffix = _get_suffix(audio_file.filename or 'audio.webm')
                tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
                audio_file.save(tmp)
                tmp.close()
                source_path = tmp.name

            # Convert to WAV for better Whisper accuracy
            whisper_path = _convert_to_wav(source_path)
            wav_was_created = (whisper_path != source_path)

            try:
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

            finally:
                # Clean up WAV temp file
                if wav_was_created and os.path.exists(whisper_path):
                    try:
                        os.unlink(whisper_path)
                    except OSError:
                        pass
                # Clean up temp file if we created one from fallback
                if not audio_file_record or not os.path.exists(audio_file_record.file_path):
                    try:
                        os.unlink(source_path)
                    except OSError:
                        pass

    except Exception as e:
        logger.error("Voice transcription failed: %s", e)
        transcription_failed = True

    # --- 3. Build response ---
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
