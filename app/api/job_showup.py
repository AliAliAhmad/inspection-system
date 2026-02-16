"""
Job Show Up & Challenge API.
Handles:
  - Show-up photo upload (specialist/engineer uploads when starting a job)
  - Challenge voice recording with Arabic + English transcription
  - Review marks: star (show up) / point (challenge) by admin/engineer/specialist_lead
  - Auto-notification trigger on job start
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db, safe_commit
from app.models import User, File
from app.models.job_showup import JobShowUpPhoto, JobChallengeVoice, JobReviewMark
from app.services.file_service import FileService
from app.utils.decorators import get_current_user, role_required, get_language
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

bp = Blueprint('job_showup', __name__)


# ============================================
# SHOW-UP PHOTO
# ============================================

@bp.route('/<string:job_type>/<int:job_id>/showup-photo', methods=['POST'])
@jwt_required()
def upload_showup_photo(job_type, job_id):
    """
    Upload a show-up photo for a job.
    Proves the specialist/engineer physically showed up to the job site.

    Accepts:
      - multipart/form-data with 'photo' file field
      - OR JSON with 'file_base64', 'file_name', 'file_type'
    """
    user = get_current_user()

    # Validate job type
    if job_type not in ('specialist', 'engineer'):
        return jsonify({'status': 'error', 'message': 'Invalid job type'}), 400

    # Verify job exists and user has access
    job = _get_job(job_type, job_id)
    if not job:
        return jsonify({'status': 'error', 'message': 'Job not found'}), 404

    owner_id = job.specialist_id if job_type == 'specialist' else job.engineer_id
    if user.role != 'admin' and user.id != owner_id:
        return jsonify({'status': 'error', 'message': 'Not authorized for this job'}), 403

    # Handle file upload (FormData or base64 JSON)
    file_record = None

    if 'photo' in request.files:
        # FormData upload
        photo_file = request.files['photo']
        if not photo_file.filename:
            return jsonify({'status': 'error', 'message': 'Empty photo file'}), 400

        try:
            file_record = FileService.upload_file(
                file=photo_file,
                uploaded_by=user.id,
                related_type=f'{job_type}_job_showup',
                related_id=job_id,
                category='showup_photos'
            )
        except Exception as e:
            return jsonify({'status': 'error', 'message': f'Upload failed: {str(e)}'}), 400
    else:
        # Base64 JSON upload
        data = request.get_json()
        if not data or not data.get('file_base64'):
            return jsonify({'status': 'error', 'message': 'No photo provided. Send photo file or file_base64.'}), 400

        try:
            import base64
            import io
            from werkzeug.datastructures import FileStorage

            file_data = base64.b64decode(data['file_base64'])
            file_name = data.get('file_name', 'showup_photo.jpg')
            file_type = data.get('file_type', 'image/jpeg')

            file_obj = FileStorage(
                stream=io.BytesIO(file_data),
                filename=file_name,
                content_type=file_type
            )

            file_record = FileService.upload_file(
                file=file_obj,
                uploaded_by=user.id,
                related_type=f'{job_type}_job_showup',
                related_id=job_id,
                category='showup_photos'
            )
        except Exception as e:
            return jsonify({'status': 'error', 'message': f'Upload failed: {str(e)}'}), 400

    # Create show-up photo record
    showup = JobShowUpPhoto(
        job_type=job_type,
        job_id=job_id,
        file_id=file_record.id,
        uploaded_by=user.id
    )
    db.session.add(showup)
    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Show-up photo uploaded successfully',
        'data': showup.to_dict()
    }), 201


@bp.route('/<string:job_type>/<int:job_id>/showup-photos', methods=['GET'])
@jwt_required()
def get_showup_photos(job_type, job_id):
    """Get all show-up photos for a job."""
    if job_type not in ('specialist', 'engineer'):
        return jsonify({'status': 'error', 'message': 'Invalid job type'}), 400

    photos = JobShowUpPhoto.query.filter_by(
        job_type=job_type, job_id=job_id
    ).order_by(JobShowUpPhoto.created_at.desc()).all()

    return jsonify({
        'status': 'success',
        'data': [p.to_dict() for p in photos]
    }), 200


# ============================================
# CHALLENGE VOICE NOTES
# ============================================

@bp.route('/<string:job_type>/<int:job_id>/challenge-voice', methods=['POST'])
@jwt_required()
def upload_challenge_voice(job_type, job_id):
    """
    Upload a voice note describing a challenge on the job.
    Auto-transcribes in Arabic and English.

    Accepts:
      - multipart/form-data with 'audio' file field
      - OR JSON with 'audio_base64', 'file_name', 'file_type'
    Optional:
      - duration_seconds: int
      - language: 'en' or 'ar' (hint for transcription)
    """
    user = get_current_user()

    if job_type not in ('specialist', 'engineer'):
        return jsonify({'status': 'error', 'message': 'Invalid job type'}), 400

    job = _get_job(job_type, job_id)
    if not job:
        return jsonify({'status': 'error', 'message': 'Job not found'}), 404

    owner_id = job.specialist_id if job_type == 'specialist' else job.engineer_id
    if user.role != 'admin' and user.id != owner_id:
        return jsonify({'status': 'error', 'message': 'Not authorized for this job'}), 403

    # Handle audio upload
    file_record = None
    duration_seconds = None

    if 'audio' in request.files:
        audio_file = request.files['audio']
        if not audio_file.filename:
            return jsonify({'status': 'error', 'message': 'Empty audio file'}), 400

        duration_seconds = request.form.get('duration_seconds', type=int)

        try:
            file_record = FileService.upload_file(
                file=audio_file,
                uploaded_by=user.id,
                related_type=f'{job_type}_job_challenge',
                related_id=job_id,
                category='challenge_voices'
            )
        except Exception as e:
            return jsonify({'status': 'error', 'message': f'Upload failed: {str(e)}'}), 400
    else:
        data = request.get_json()
        if not data or not data.get('audio_base64'):
            return jsonify({'status': 'error', 'message': 'No audio provided. Send audio file or audio_base64.'}), 400

        duration_seconds = data.get('duration_seconds')

        try:
            import base64
            import io
            from werkzeug.datastructures import FileStorage

            audio_data = base64.b64decode(data['audio_base64'])
            file_name = data.get('file_name', 'challenge.m4a')
            file_type = data.get('file_type', 'audio/m4a')

            file_obj = FileStorage(
                stream=io.BytesIO(audio_data),
                filename=file_name,
                content_type=file_type
            )

            file_record = FileService.upload_file(
                file=file_obj,
                uploaded_by=user.id,
                related_type=f'{job_type}_job_challenge',
                related_id=job_id,
                category='challenge_voices'
            )
        except Exception as e:
            return jsonify({'status': 'error', 'message': f'Upload failed: {str(e)}'}), 400

    # Auto-transcribe with bilingual support
    transcription_en = None
    transcription_ar = None

    try:
        transcription_en, transcription_ar = _transcribe_audio(file_record)
    except Exception as e:
        logger.warning(f"Challenge voice transcription failed: {e}")

    # Create challenge voice record
    challenge = JobChallengeVoice(
        job_type=job_type,
        job_id=job_id,
        file_id=file_record.id,
        transcription_en=transcription_en,
        transcription_ar=transcription_ar,
        duration_seconds=duration_seconds,
        recorded_by=user.id
    )
    db.session.add(challenge)
    safe_commit()

    language = get_language(user)
    return jsonify({
        'status': 'success',
        'message': 'Challenge voice note uploaded successfully',
        'data': challenge.to_dict(language=language)
    }), 201


@bp.route('/<string:job_type>/<int:job_id>/challenge-voices', methods=['GET'])
@jwt_required()
def get_challenge_voices(job_type, job_id):
    """Get all challenge voice notes for a job."""
    if job_type not in ('specialist', 'engineer'):
        return jsonify({'status': 'error', 'message': 'Invalid job type'}), 400

    user = get_current_user()
    language = get_language(user)

    voices = JobChallengeVoice.query.filter_by(
        job_type=job_type, job_id=job_id
    ).order_by(JobChallengeVoice.created_at.desc()).all()

    return jsonify({
        'status': 'success',
        'data': [v.to_dict(language=language) for v in voices]
    }), 200


# ============================================
# REVIEW MARKS (STAR / POINT)
# ============================================

@bp.route('/<string:job_type>/<int:job_id>/review-mark', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer', 'specialist')
def add_review_mark(job_type, job_id):
    """
    Add a review mark to a job.
    - star: marks job for 'Show Up' (good work to showcase)
    - point: marks job as 'Challenge' (issue to discuss)

    Only admin, engineer, and specialist lead can mark.

    Request body:
        {
            "mark_type": "star" or "point",
            "note": "Optional note about the mark"
        }
    """
    user = get_current_user()

    if job_type not in ('specialist', 'engineer'):
        return jsonify({'status': 'error', 'message': 'Invalid job type'}), 400

    # Only admin, engineer, and specialist lead can mark
    if user.role == 'specialist':
        # Check if user is a specialist lead (has minor_role or is_lead flag)
        is_lead = getattr(user, 'minor_role', None) in ('specialist_lead', 'lead') or \
                  getattr(user, 'is_lead', False)
        if not is_lead:
            return jsonify({
                'status': 'error',
                'message': 'Only specialist leads can add review marks'
            }), 403

    data = request.get_json()
    mark_type = data.get('mark_type')
    note = data.get('note', '').strip() or None

    if mark_type not in ('star', 'point'):
        return jsonify({
            'status': 'error',
            'message': 'mark_type must be "star" or "point"'
        }), 400

    # Verify job exists
    job = _get_job(job_type, job_id)
    if not job:
        return jsonify({'status': 'error', 'message': 'Job not found'}), 404

    # Create review mark
    mark = JobReviewMark(
        job_type=job_type,
        job_id=job_id,
        mark_type=mark_type,
        note=note,
        marked_by=user.id
    )
    db.session.add(mark)
    safe_commit()

    # Auto-translate note if provided
    if note:
        from app.utils.bilingual import auto_translate_and_save
        auto_translate_and_save('job_review_mark', mark.id, {'note': note})

    return jsonify({
        'status': 'success',
        'message': f'Job marked as {"show up" if mark_type == "star" else "challenge"}',
        'data': mark.to_dict()
    }), 201


@bp.route('/<string:job_type>/<int:job_id>/review-marks', methods=['GET'])
@jwt_required()
def get_review_marks(job_type, job_id):
    """Get all review marks for a job."""
    if job_type not in ('specialist', 'engineer'):
        return jsonify({'status': 'error', 'message': 'Invalid job type'}), 400

    mark_type = request.args.get('mark_type')  # Optional filter: 'star' or 'point'

    query = JobReviewMark.query.filter_by(job_type=job_type, job_id=job_id)
    if mark_type in ('star', 'point'):
        query = query.filter_by(mark_type=mark_type)

    marks = query.order_by(JobReviewMark.created_at.desc()).all()

    return jsonify({
        'status': 'success',
        'data': [m.to_dict() for m in marks]
    }), 200


@bp.route('/<string:job_type>/<int:job_id>/review-mark/<int:mark_id>', methods=['DELETE'])
@jwt_required()
@role_required('admin', 'engineer')
def remove_review_mark(job_type, job_id, mark_id):
    """Remove a review mark (admin/engineer only)."""
    mark = JobReviewMark.query.get_or_404(mark_id)

    if mark.job_type != job_type or mark.job_id != job_id:
        return jsonify({'status': 'error', 'message': 'Mark does not belong to this job'}), 400

    db.session.delete(mark)
    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Review mark removed'
    }), 200


# ============================================
# JOB SHOWUP SUMMARY (for job detail pages)
# ============================================

@bp.route('/<string:job_type>/<int:job_id>/showup-summary', methods=['GET'])
@jwt_required()
def get_showup_summary(job_type, job_id):
    """
    Get full show-up summary for a job:
    - Show-up photos
    - Challenge voice notes (with transcriptions)
    - Review marks (stars and points)
    """
    if job_type not in ('specialist', 'engineer'):
        return jsonify({'status': 'error', 'message': 'Invalid job type'}), 400

    user = get_current_user()
    language = get_language(user)

    photos = JobShowUpPhoto.query.filter_by(
        job_type=job_type, job_id=job_id
    ).order_by(JobShowUpPhoto.created_at.desc()).all()

    voices = JobChallengeVoice.query.filter_by(
        job_type=job_type, job_id=job_id
    ).order_by(JobChallengeVoice.created_at.desc()).all()

    marks = JobReviewMark.query.filter_by(
        job_type=job_type, job_id=job_id
    ).order_by(JobReviewMark.created_at.desc()).all()

    star_marks = [m for m in marks if m.mark_type == 'star']
    point_marks = [m for m in marks if m.mark_type == 'point']

    return jsonify({
        'status': 'success',
        'data': {
            'showup_photos': [p.to_dict() for p in photos],
            'challenge_voices': [v.to_dict(language=language) for v in voices],
            'review_marks': {
                'stars': [m.to_dict() for m in star_marks],
                'points': [m.to_dict() for m in point_marks],
                'star_count': len(star_marks),
                'point_count': len(point_marks),
            },
            'has_showup_photo': len(photos) > 0,
            'has_challenges': len(voices) > 0,
        }
    }), 200


# ============================================
# HELPER FUNCTIONS
# ============================================

def _get_job(job_type, job_id):
    """Get a specialist or engineer job by type and ID."""
    if job_type == 'specialist':
        from app.models import SpecialistJob
        return db.session.get(SpecialistJob, job_id)
    elif job_type == 'engineer':
        from app.models import EngineerJob
        return db.session.get(EngineerJob, job_id)
    return None


def _transcribe_audio(file_record):
    """
    Transcribe audio file using the voice fallback chain.
    Returns (transcription_en, transcription_ar) tuple.
    """
    import os
    import tempfile
    import requests as http_requests

    if not file_record or not file_record.file_path:
        return None, None

    # Download from Cloudinary
    response = http_requests.get(file_record.file_path, timeout=30)
    if response.status_code != 200:
        return None, None

    audio_content = response.content

    # Determine file extension
    suffix = '.m4a'
    if file_record.original_filename and '.' in file_record.original_filename:
        suffix = '.' + file_record.original_filename.rsplit('.', 1)[1].lower()

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_content)
        tmp_path = tmp.name

    try:
        result = None

        # Use the same fallback chain as the voice API
        from app.services.gemini_service import is_gemini_configured, get_speech_service as get_gemini_speech
        from app.services.groq_service import is_groq_configured, get_speech_service as get_groq_speech
        from app.services.together_ai_service import is_together_configured, get_speech_service as get_together_speech

        if is_gemini_configured():
            logger.info("Challenge transcription: using Gemini")
            speech_service = get_gemini_speech()
            result = speech_service.transcribe_file(tmp_path, 'en')
        elif is_groq_configured():
            logger.info("Challenge transcription: using Groq Whisper")
            speech_service = get_groq_speech()
            result = speech_service.transcribe_file(tmp_path, 'en')
        elif is_together_configured():
            logger.info("Challenge transcription: using Together AI Whisper")
            speech_service = get_together_speech()
            result = speech_service.transcribe_file(tmp_path, 'en')
        else:
            # OpenAI fallback
            api_key = os.getenv('OPENAI_API_KEY')
            if api_key:
                logger.info("Challenge transcription: using OpenAI Whisper")
                from openai import OpenAI
                client = OpenAI(api_key=api_key)
                with open(tmp_path, 'rb') as f:
                    transcript = client.audio.transcriptions.create(
                        model='whisper-1',
                        file=f,
                        response_format='text'
                    )
                if transcript:
                    result = {'text': transcript.strip()}

        if result and (result.get('text') or result.get('en')):
            # Check if provider returned bilingual
            if result.get('en') and result.get('ar'):
                return result['en'], result['ar']

            # Single-language result — auto-translate
            text = result.get('text', result.get('en', ''))
            from app.services.translation_service import TranslationService
            translated = TranslationService.auto_translate(text)
            return translated.get('en') or text, translated.get('ar')

    finally:
        os.unlink(tmp_path)

    return None, None


def send_job_start_notification(job_type, job_id, user_id):
    """
    Send automatic notification when a job starts.
    Reminds specialist/engineer to take a show-up photo and record challenges.
    Called from the job start endpoints.
    """
    from app.services.notification_service import NotificationService

    try:
        NotificationService.create_notification(
            user_id=user_id,
            type='job_showup_reminder',
            title='Take a Show-Up Photo & Record Challenges',
            message='Please take a photo to show up your job, and record voice for any challenges you face.',
            related_type=f'{job_type}_job',
            related_id=job_id,
            priority='info',
            title_ar='التقط صورة الحضور وسجل التحديات',
            message_ar='يرجى التقاط صورة لإثبات حضورك في موقع العمل، وتسجيل صوتي لأي تحديات تواجهها.'
        )
        logger.info(f"Show-up notification sent for {job_type} job {job_id} to user {user_id}")
    except Exception as e:
        logger.warning(f"Failed to send show-up notification: {e}")
