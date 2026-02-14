"""
Engineer Job endpoints.
Three job types: custom_project, system_review, special_task.
Enhanced with stats, performance metrics, voice notes, location tracking, and AI insights.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func, and_, or_
from datetime import datetime, date, timedelta
from app.extensions import limiter, db
from app.services.engineer_job_service import EngineerJobService
from app.utils.decorators import get_current_user, admin_required, engineer_required, role_required, get_language
from app.models import EngineerJob, QualityReview, UserStreak, PointHistory, User, File
from app.models.engineer_job_voice_note import EngineerJobVoiceNote
from app.models.engineer_job_location import EngineerJobLocation
from app.services.pause_service import PauseService
from app.services.file_service import FileService
from app.utils.pagination import paginate
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError

bp = Blueprint('engineer_jobs', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
def list_jobs():
    """List engineer jobs. Engineers see own, admins see all."""
    user = get_current_user()
    status = request.args.get('status')

    if user.role == 'admin':
        query = EngineerJob.query
        if status:
            query = query.filter_by(status=status)
        query = query.order_by(EngineerJob.created_at.desc())
    else:
        query = EngineerJob.query.filter_by(engineer_id=user.id)
        if status:
            query = query.filter_by(status=status)
        query = query.order_by(EngineerJob.created_at.desc())

    items, pagination_meta = paginate(query)
    language = get_language(user)

    return jsonify({
        'status': 'success',
        'data': [j.to_dict(language=language) for j in items],
        'pagination': pagination_meta
    }), 200


@bp.route('', methods=['POST'])
@limiter.limit("20 per minute")
@jwt_required()
@role_required('admin', 'engineer')
def create_job():
    """Create a new engineer job."""
    user = get_current_user()
    data = request.get_json()

    engineer_id = data.get('engineer_id', user.id)

    job = EngineerJobService.create_job(
        engineer_id=engineer_id,
        job_type=data['job_type'],
        title=data['title'],
        description=data['description'],
        equipment_id=data.get('equipment_id'),
        category=data.get('category', 'minor'),
        major_reason=data.get('major_reason')
    )

    # Auto-translate text fields
    from app.utils.bilingual import auto_translate_and_save
    fields_to_translate = {'title': data['title'], 'description': data['description']}
    if data.get('major_reason'):
        fields_to_translate['major_reason'] = data['major_reason']
    auto_translate_and_save('engineer_job', job.id, fields_to_translate)

    return jsonify({
        'status': 'success',
        'message': f'Engineer job {job.job_id} created',
        'data': job.to_dict()
    }), 201


@bp.route('/<int:job_id>', methods=['GET'])
@jwt_required()
def get_job(job_id):
    """Get engineer job details."""
    job = EngineerJob.query.get_or_404(job_id)
    user = get_current_user()

    if user.role != 'admin' and job.engineer_id != user.id:
        if not job.planned_time_hours:
            return jsonify({
                'status': 'error',
                'message': 'Must enter planned time first',
                'code': 'PLANNED_TIME_REQUIRED'
            }), 403

    language = get_language(user)
    return jsonify({
        'status': 'success',
        'data': job.to_dict(language=language)
    }), 200


@bp.route('/<int:job_id>/planned-time', methods=['POST'])
@jwt_required()
@engineer_required()
def enter_planned_time(job_id):
    """Enter planned time estimate."""
    user = get_current_user()
    data = request.get_json()

    job = EngineerJobService.enter_planned_time(
        job_id=job_id,
        engineer_id=user.id,
        planned_time_days=data.get('planned_time_days', 0),
        planned_time_hours=data['planned_time_hours']
    )

    return jsonify({
        'status': 'success',
        'message': 'Planned time entered',
        'data': job.to_dict()
    }), 200


@bp.route('/<int:job_id>/start', methods=['POST'])
@jwt_required()
@engineer_required()
def start_job(job_id):
    """Start engineer job timer."""
    user = get_current_user()
    job = EngineerJobService.start_job(job_id, user.id)

    return jsonify({
        'status': 'success',
        'message': 'Job started',
        'data': job.to_dict()
    }), 200


@bp.route('/<int:job_id>/complete', methods=['POST'])
@jwt_required()
@engineer_required()
def complete_job(job_id):
    """Complete an engineer job."""
    user = get_current_user()
    data = request.get_json()

    job = EngineerJobService.complete_job(
        job_id=job_id,
        engineer_id=user.id,
        work_notes=data['work_notes']
    )

    # Auto-translate work notes
    from app.utils.bilingual import auto_translate_and_save
    auto_translate_and_save('engineer_job', job.id, {'work_notes': data['work_notes']})

    return jsonify({
        'status': 'success',
        'message': 'Job completed',
        'data': job.to_dict()
    }), 200


# --- Pause endpoints ---

@bp.route('/<int:job_id>/pause', methods=['POST'])
@jwt_required()
@engineer_required()
def request_pause(job_id):
    """Request pause for an engineer job."""
    user = get_current_user()
    data = request.get_json()

    pause = PauseService.request_pause(
        job_type='engineer',
        job_id=job_id,
        requested_by=user.id,
        reason_category=data['reason_category'],
        reason_details=data.get('reason_details')
    )

    return jsonify({
        'status': 'success',
        'message': 'Pause requested',
        'data': pause.to_dict()
    }), 201


@bp.route('/<int:job_id>/pause-history', methods=['GET'])
@jwt_required()
def pause_history(job_id):
    """Get pause history for an engineer job."""
    pauses = PauseService.get_pause_history('engineer', job_id)
    return jsonify({
        'status': 'success',
        'data': [p.to_dict() for p in pauses]
    }), 200


# ============================================
# STATS & ANALYTICS
# ============================================

@bp.route('/stats', methods=['GET'])
@jwt_required()
def get_engineer_stats():
    """
    Get engineer job statistics for dashboard.

    Query params:
        engineer_id: Optional engineer ID (admins only, defaults to current user)
        period: 'week', 'month', or 'year' (default: 'week')

    Returns:
        - total_jobs, completed_jobs, in_progress_jobs, paused_jobs
        - avg_completion_time_hours
        - on_time_rate (completed within planned time)
        - efficiency_score (planned_time / actual_time * 100)
        - streak_days (consecutive days with completed jobs)
        - points_earned (from gamification)
        - trend (comparison to previous period)
    """
    user = get_current_user()

    # Determine engineer_id
    engineer_id = request.args.get('engineer_id', type=int)
    if engineer_id and user.role != 'admin' and engineer_id != user.id:
        return jsonify({
            'status': 'error',
            'message': 'Cannot view other engineer stats'
        }), 403
    if not engineer_id:
        engineer_id = user.id

    period = request.args.get('period', 'week')

    # Calculate date ranges
    today = date.today()
    if period == 'week':
        period_start = today - timedelta(days=7)
        prev_period_start = period_start - timedelta(days=7)
        prev_period_end = period_start - timedelta(days=1)
    elif period == 'month':
        period_start = today - timedelta(days=30)
        prev_period_start = period_start - timedelta(days=30)
        prev_period_end = period_start - timedelta(days=1)
    elif period == 'year':
        period_start = today - timedelta(days=365)
        prev_period_start = period_start - timedelta(days=365)
        prev_period_end = period_start - timedelta(days=1)
    else:
        period_start = today - timedelta(days=7)
        prev_period_start = period_start - timedelta(days=7)
        prev_period_end = period_start - timedelta(days=1)

    # Base query for engineer's jobs in period
    period_jobs = EngineerJob.query.filter(
        EngineerJob.engineer_id == engineer_id,
        EngineerJob.created_at >= datetime.combine(period_start, datetime.min.time())
    )

    # Status counts
    total_jobs = period_jobs.count()
    completed_jobs = period_jobs.filter(EngineerJob.status == 'completed').count()
    in_progress_jobs = period_jobs.filter(EngineerJob.status == 'in_progress').count()
    paused_jobs = period_jobs.filter(EngineerJob.status == 'paused').count()

    # Average completion time
    completed_with_time = period_jobs.filter(
        EngineerJob.status == 'completed',
        EngineerJob.actual_time_hours.isnot(None)
    ).all()

    avg_completion_time = 0
    if completed_with_time:
        total_time = sum(float(j.actual_time_hours) for j in completed_with_time)
        avg_completion_time = round(total_time / len(completed_with_time), 2)

    # On-time rate (completed within planned time)
    completed_with_both = [j for j in completed_with_time if j.planned_time_hours]
    on_time_count = sum(1 for j in completed_with_both
                        if float(j.actual_time_hours) <= float(j.planned_time_hours))
    on_time_rate = round((on_time_count / len(completed_with_both) * 100), 1) if completed_with_both else 0

    # Efficiency score (planned_time / actual_time * 100, capped at 100)
    efficiency_scores = []
    for j in completed_with_both:
        if float(j.actual_time_hours) > 0:
            eff = (float(j.planned_time_hours) / float(j.actual_time_hours)) * 100
            efficiency_scores.append(min(eff, 150))  # Cap at 150% to prevent outliers
    efficiency_score = round(sum(efficiency_scores) / len(efficiency_scores), 1) if efficiency_scores else 0

    # Streak days
    streak_info = UserStreak.query.filter_by(user_id=engineer_id).first()
    streak_days = streak_info.current_streak if streak_info else 0

    # Points earned in period
    points_query = PointHistory.query.filter(
        PointHistory.user_id == engineer_id,
        PointHistory.created_at >= datetime.combine(period_start, datetime.min.time()),
        PointHistory.source_type == 'job'
    )
    points_earned = db.session.query(func.coalesce(func.sum(PointHistory.points), 0)).filter(
        PointHistory.user_id == engineer_id,
        PointHistory.created_at >= datetime.combine(period_start, datetime.min.time()),
        PointHistory.source_type == 'job'
    ).scalar() or 0

    # Previous period stats for trend
    prev_jobs = EngineerJob.query.filter(
        EngineerJob.engineer_id == engineer_id,
        EngineerJob.created_at >= datetime.combine(prev_period_start, datetime.min.time()),
        EngineerJob.created_at <= datetime.combine(prev_period_end, datetime.max.time())
    )
    prev_completed = prev_jobs.filter(EngineerJob.status == 'completed').count()

    # Trend calculation
    if prev_completed > 0:
        trend_percent = round(((completed_jobs - prev_completed) / prev_completed) * 100, 1)
    else:
        trend_percent = 100 if completed_jobs > 0 else 0

    trend = {
        'direction': 'up' if trend_percent > 0 else ('down' if trend_percent < 0 else 'flat'),
        'percent': abs(trend_percent),
        'previous_completed': prev_completed
    }

    # Average ratings
    avg_time_rating = db.session.query(func.avg(EngineerJob.time_rating)).filter(
        EngineerJob.engineer_id == engineer_id,
        EngineerJob.created_at >= datetime.combine(period_start, datetime.min.time()),
        EngineerJob.time_rating.isnot(None)
    ).scalar()

    avg_qc_rating = db.session.query(func.avg(EngineerJob.qc_rating)).filter(
        EngineerJob.engineer_id == engineer_id,
        EngineerJob.created_at >= datetime.combine(period_start, datetime.min.time()),
        EngineerJob.qc_rating.isnot(None)
    ).scalar()

    return jsonify({
        'status': 'success',
        'data': {
            'engineer_id': engineer_id,
            'period': period,
            'period_start': period_start.isoformat(),
            'total_jobs': total_jobs,
            'completed_jobs': completed_jobs,
            'in_progress_jobs': in_progress_jobs,
            'paused_jobs': paused_jobs,
            'avg_completion_time_hours': avg_completion_time,
            'on_time_rate': on_time_rate,
            'efficiency_score': efficiency_score,
            'streak_days': streak_days,
            'points_earned': int(points_earned),
            'trend': trend,
            'avg_time_rating': round(float(avg_time_rating), 1) if avg_time_rating else None,
            'avg_qc_rating': round(float(avg_qc_rating), 1) if avg_qc_rating else None
        }
    }), 200


@bp.route('/performance', methods=['GET'])
@jwt_required()
def get_performance_metrics():
    """
    Get detailed performance metrics for an engineer.

    Query params:
        engineer_id: Optional engineer ID (admins only, defaults to current user)

    Returns:
        - daily_completions (last 30 days)
        - category_breakdown (by job category: major/minor)
        - job_type_breakdown (by job type)
        - avg_time_by_category
        - quality_score (from QC reviews)
    """
    user = get_current_user()

    engineer_id = request.args.get('engineer_id', type=int)
    if engineer_id and user.role != 'admin' and engineer_id != user.id:
        return jsonify({
            'status': 'error',
            'message': 'Cannot view other engineer performance'
        }), 403
    if not engineer_id:
        engineer_id = user.id

    today = date.today()
    thirty_days_ago = today - timedelta(days=30)

    # Daily completions (last 30 days)
    daily_completions = []
    for i in range(30):
        d = today - timedelta(days=i)
        day_start = datetime.combine(d, datetime.min.time())
        day_end = datetime.combine(d, datetime.max.time())

        count = EngineerJob.query.filter(
            EngineerJob.engineer_id == engineer_id,
            EngineerJob.completed_at >= day_start,
            EngineerJob.completed_at <= day_end
        ).count()

        daily_completions.append({
            'date': d.isoformat(),
            'day_name': d.strftime('%a'),
            'completed': count
        })

    daily_completions.reverse()  # Oldest first

    # Category breakdown (major/minor)
    category_counts = db.session.query(
        EngineerJob.category,
        func.count(EngineerJob.id)
    ).filter(
        EngineerJob.engineer_id == engineer_id,
        EngineerJob.created_at >= datetime.combine(thirty_days_ago, datetime.min.time())
    ).group_by(EngineerJob.category).all()

    category_breakdown = {cat or 'unspecified': count for cat, count in category_counts}

    # Job type breakdown
    type_counts = db.session.query(
        EngineerJob.job_type,
        func.count(EngineerJob.id)
    ).filter(
        EngineerJob.engineer_id == engineer_id,
        EngineerJob.created_at >= datetime.combine(thirty_days_ago, datetime.min.time())
    ).group_by(EngineerJob.job_type).all()

    job_type_breakdown = {job_type: count for job_type, count in type_counts}

    # Average time by category
    avg_time_by_category = {}
    for category in ['major', 'minor']:
        avg_time = db.session.query(func.avg(EngineerJob.actual_time_hours)).filter(
            EngineerJob.engineer_id == engineer_id,
            EngineerJob.category == category,
            EngineerJob.actual_time_hours.isnot(None)
        ).scalar()
        avg_time_by_category[category] = round(float(avg_time), 2) if avg_time else 0

    # Average time by job type
    avg_time_by_type = {}
    for job_type in ['custom_project', 'system_review', 'special_task']:
        avg_time = db.session.query(func.avg(EngineerJob.actual_time_hours)).filter(
            EngineerJob.engineer_id == engineer_id,
            EngineerJob.job_type == job_type,
            EngineerJob.actual_time_hours.isnot(None)
        ).scalar()
        avg_time_by_type[job_type] = round(float(avg_time), 2) if avg_time else 0

    # Quality score from QC reviews
    engineer_job_ids = [j.id for j in EngineerJob.query.filter_by(engineer_id=engineer_id).all()]

    if engineer_job_ids:
        qc_reviews = QualityReview.query.filter(
            QualityReview.job_type == 'engineer',
            QualityReview.job_id.in_(engineer_job_ids),
            QualityReview.status.in_(['approved', 'rejected'])
        ).all()

        total_reviews = len(qc_reviews)
        approved_count = sum(1 for r in qc_reviews if r.status == 'approved')
        quality_score = round((approved_count / total_reviews * 100), 1) if total_reviews > 0 else None

        # Rejection breakdown by category
        rejection_breakdown = {}
        for r in qc_reviews:
            if r.status == 'rejected' and r.rejection_category:
                rejection_breakdown[r.rejection_category] = rejection_breakdown.get(r.rejection_category, 0) + 1
    else:
        quality_score = None
        total_reviews = 0
        approved_count = 0
        rejection_breakdown = {}

    return jsonify({
        'status': 'success',
        'data': {
            'engineer_id': engineer_id,
            'daily_completions': daily_completions,
            'category_breakdown': category_breakdown,
            'job_type_breakdown': job_type_breakdown,
            'avg_time_by_category': avg_time_by_category,
            'avg_time_by_type': avg_time_by_type,
            'quality_metrics': {
                'quality_score': quality_score,
                'total_reviews': total_reviews,
                'approved_count': approved_count,
                'rejected_count': total_reviews - approved_count,
                'rejection_breakdown': rejection_breakdown
            }
        }
    }), 200


# ============================================
# VOICE NOTES
# ============================================

@bp.route('/<int:job_id>/voice-note', methods=['POST'])
@jwt_required()
@engineer_required()
def add_voice_note(job_id):
    """
    Add voice note to an engineer job.

    Accepts: multipart/form-data with 'audio' file field.
    Optional:
        - note_type: 'general', 'progress_update', 'issue', 'completion'
        - transcribe: 'true' to attempt transcription

    Returns: Voice note record with file URL.
    """
    user = get_current_user()

    # Verify job exists and belongs to user
    job = db.session.get(EngineerJob, job_id)
    if not job:
        return jsonify({
            'status': 'error',
            'message': f'Job {job_id} not found'
        }), 404

    if job.engineer_id != user.id and user.role != 'admin':
        return jsonify({
            'status': 'error',
            'message': 'Not authorized to add voice note to this job'
        }), 403

    # Check for audio file
    if 'audio' not in request.files:
        return jsonify({
            'status': 'error',
            'message': 'No audio file provided'
        }), 400

    audio_file = request.files['audio']
    if not audio_file.filename:
        return jsonify({
            'status': 'error',
            'message': 'Empty audio file'
        }), 400

    note_type = request.form.get('note_type', 'general')
    if note_type not in ['general', 'progress_update', 'issue', 'completion']:
        note_type = 'general'

    should_transcribe = request.form.get('transcribe', 'false').lower() == 'true'

    # Upload audio file
    try:
        file_record = FileService.upload_file(
            file=audio_file,
            uploaded_by=user.id,
            related_type='engineer_job_voice_note',
            related_id=job_id,
            category='voice_notes'
        )
    except ValidationError as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400

    # Attempt transcription if requested
    transcription = None
    transcription_ar = None

    if should_transcribe:
        try:
            # Multi-provider voice transcription
            # Priority: Google Cloud → Gemini → Together AI → Groq → OpenAI
            import os
            import tempfile
            import requests
            import logging as log

            from app.services.google_cloud_service import is_google_cloud_configured, get_speech_service as get_google_speech
            from app.services.gemini_service import is_gemini_configured, get_speech_service as get_gemini_speech
            from app.services.together_ai_service import is_together_configured, get_speech_service as get_together_speech
            from app.services.groq_service import is_groq_configured, get_speech_service as get_groq_speech
            from app.services.translation_service import TranslationService

            if file_record.file_path:
                # Download from Cloudinary for transcription
                response = requests.get(file_record.file_path, timeout=30)
                if response.status_code == 200:
                    audio_content = response.content

                    # Create temp file
                    suffix = '.webm'
                    if '.' in audio_file.filename:
                        suffix = '.' + audio_file.filename.rsplit('.', 1)[1].lower()

                    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                        tmp.write(audio_content)
                        tmp_path = tmp.name

                    try:
                        result = None

                        # Priority 1: Google Cloud Speech-to-Text
                        if is_google_cloud_configured():
                            log.getLogger(__name__).info("Using Google Cloud Speech-to-Text")
                            speech_service = get_google_speech()
                            result = speech_service.transcribe_file(tmp_path, 'en')

                        # Priority 2: Gemini
                        elif is_gemini_configured():
                            log.getLogger(__name__).info("Using Gemini Audio")
                            speech_service = get_gemini_speech()
                            result = speech_service.transcribe_file(tmp_path, 'en')

                        # Priority 3: Together AI
                        elif is_together_configured():
                            log.getLogger(__name__).info("Using Together AI Whisper")
                            speech_service = get_together_speech()
                            result = speech_service.transcribe_file(tmp_path, 'en')

                        # Priority 4: Groq
                        elif is_groq_configured():
                            log.getLogger(__name__).info("Using Groq Whisper")
                            speech_service = get_groq_speech()
                            result = speech_service.transcribe_file(tmp_path, 'en')

                        # Priority 5: OpenAI Whisper (paid fallback)
                        else:
                            api_key = os.getenv('OPENAI_API_KEY')
                            if api_key:
                                log.getLogger(__name__).info("Using OpenAI Whisper (paid)")
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

                        # Process result
                        if result and result.get('text'):
                            text = result['text'].strip()

                            # Check if provider returned bilingual (en/ar)
                            if result.get('en') and result.get('ar'):
                                transcription = result['en']
                                transcription_ar = result['ar']
                            else:
                                # Use translation service
                                translated = TranslationService.auto_translate(text)
                                transcription = translated.get('en') or text
                                transcription_ar = translated.get('ar')

                    finally:
                        os.unlink(tmp_path)
        except Exception as e:
            # Transcription is optional, don't fail the request
            import logging
            logging.getLogger(__name__).warning(f"Voice note transcription failed: {e}")

    # Create voice note record
    voice_note = EngineerJobVoiceNote(
        engineer_job_id=job_id,
        file_id=file_record.id,
        duration_seconds=request.form.get('duration_seconds', type=int),
        transcription=transcription,
        transcription_ar=transcription_ar,
        note_type=note_type,
        created_by=user.id
    )
    db.session.add(voice_note)
    db.session.commit()

    language = get_language(user)

    return jsonify({
        'status': 'success',
        'message': 'Voice note added',
        'data': voice_note.to_dict(language=language)
    }), 201


@bp.route('/<int:job_id>/voice-notes', methods=['GET'])
@jwt_required()
def get_voice_notes(job_id):
    """Get all voice notes for an engineer job."""
    user = get_current_user()

    job = db.session.get(EngineerJob, job_id)
    if not job:
        return jsonify({
            'status': 'error',
            'message': f'Job {job_id} not found'
        }), 404

    if job.engineer_id != user.id and user.role != 'admin':
        return jsonify({
            'status': 'error',
            'message': 'Not authorized to view this job'
        }), 403

    language = get_language(user)
    voice_notes = job.voice_notes.order_by(EngineerJobVoiceNote.created_at.desc()).all()

    return jsonify({
        'status': 'success',
        'data': [vn.to_dict(language=language) for vn in voice_notes]
    }), 200


# ============================================
# LOCATION TRACKING
# ============================================

@bp.route('/<int:job_id>/location', methods=['POST'])
@jwt_required()
@engineer_required()
def update_job_location(job_id):
    """
    Update engineer location for job tracking.

    Request body:
        latitude: float (required)
        longitude: float (required)
        accuracy_meters: float (optional)
        altitude_meters: float (optional)
        location_type: 'checkin', 'checkout', 'tracking', 'manual' (default: 'tracking')
        address: string (optional, for manual entry)

    Returns: Location record.
    """
    user = get_current_user()

    job = db.session.get(EngineerJob, job_id)
    if not job:
        return jsonify({
            'status': 'error',
            'message': f'Job {job_id} not found'
        }), 404

    if job.engineer_id != user.id and user.role != 'admin':
        return jsonify({
            'status': 'error',
            'message': 'Not authorized to track location for this job'
        }), 403

    data = request.get_json()

    if not data.get('latitude') or not data.get('longitude'):
        return jsonify({
            'status': 'error',
            'message': 'latitude and longitude are required'
        }), 400

    try:
        latitude = float(data['latitude'])
        longitude = float(data['longitude'])

        # Validate coordinates
        if not (-90 <= latitude <= 90):
            raise ValueError("Latitude must be between -90 and 90")
        if not (-180 <= longitude <= 180):
            raise ValueError("Longitude must be between -180 and 180")
    except (ValueError, TypeError) as e:
        return jsonify({
            'status': 'error',
            'message': f'Invalid coordinates: {str(e)}'
        }), 400

    location_type = data.get('location_type', 'tracking')
    if location_type not in ['checkin', 'checkout', 'tracking', 'manual']:
        location_type = 'tracking'

    location = EngineerJobLocation(
        engineer_job_id=job_id,
        latitude=latitude,
        longitude=longitude,
        accuracy_meters=data.get('accuracy_meters'),
        altitude_meters=data.get('altitude_meters'),
        location_type=location_type,
        address=data.get('address'),
        user_id=user.id
    )
    db.session.add(location)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Location recorded',
        'data': location.to_dict()
    }), 201


@bp.route('/<int:job_id>/locations', methods=['GET'])
@jwt_required()
def get_job_locations(job_id):
    """
    Get location history for an engineer job.

    Query params:
        location_type: Filter by type (optional)
        limit: Max records (default: 100)
    """
    user = get_current_user()

    job = db.session.get(EngineerJob, job_id)
    if not job:
        return jsonify({
            'status': 'error',
            'message': f'Job {job_id} not found'
        }), 404

    if job.engineer_id != user.id and user.role != 'admin':
        return jsonify({
            'status': 'error',
            'message': 'Not authorized to view this job'
        }), 403

    query = job.location_history.order_by(EngineerJobLocation.recorded_at.desc())

    location_type = request.args.get('location_type')
    if location_type:
        query = query.filter(EngineerJobLocation.location_type == location_type)

    limit = request.args.get('limit', 100, type=int)
    locations = query.limit(min(limit, 500)).all()

    return jsonify({
        'status': 'success',
        'data': [loc.to_dict() for loc in locations]
    }), 200


# ============================================
# AI INSIGHTS
# ============================================

@bp.route('/ai-insights', methods=['GET'])
@jwt_required()
def get_ai_insights():
    """
    Get AI-powered insights for engineer performance.

    Query params:
        engineer_id: Optional engineer ID (admins only, defaults to current user)

    Returns:
        - productivity_trend
        - suggested_improvements
        - optimal_work_times
        - skill_gaps
        - workload_analysis
    """
    user = get_current_user()

    engineer_id = request.args.get('engineer_id', type=int)
    if engineer_id and user.role != 'admin' and engineer_id != user.id:
        return jsonify({
            'status': 'error',
            'message': 'Cannot view other engineer insights'
        }), 403
    if not engineer_id:
        engineer_id = user.id

    today = date.today()
    thirty_days_ago = today - timedelta(days=30)
    sixty_days_ago = today - timedelta(days=60)

    # Get jobs data for analysis
    recent_jobs = EngineerJob.query.filter(
        EngineerJob.engineer_id == engineer_id,
        EngineerJob.created_at >= datetime.combine(thirty_days_ago, datetime.min.time())
    ).all()

    previous_jobs = EngineerJob.query.filter(
        EngineerJob.engineer_id == engineer_id,
        EngineerJob.created_at >= datetime.combine(sixty_days_ago, datetime.min.time()),
        EngineerJob.created_at < datetime.combine(thirty_days_ago, datetime.min.time())
    ).all()

    # Productivity trend analysis
    recent_completed = [j for j in recent_jobs if j.status == 'completed']
    previous_completed = [j for j in previous_jobs if j.status == 'completed']

    recent_count = len(recent_completed)
    previous_count = len(previous_completed)

    if previous_count > 0:
        productivity_change = round(((recent_count - previous_count) / previous_count) * 100, 1)
    else:
        productivity_change = 100 if recent_count > 0 else 0

    productivity_trend = {
        'direction': 'improving' if productivity_change > 5 else ('declining' if productivity_change < -5 else 'stable'),
        'change_percent': abs(productivity_change),
        'recent_completed': recent_count,
        'previous_completed': previous_count,
        'summary': _generate_productivity_summary(productivity_change, recent_count)
    }

    # Analyze work patterns for optimal times
    hourly_completions = {}
    for j in recent_completed:
        if j.completed_at:
            hour = j.completed_at.hour
            hourly_completions[hour] = hourly_completions.get(hour, 0) + 1

    # Find peak hours
    if hourly_completions:
        sorted_hours = sorted(hourly_completions.items(), key=lambda x: x[1], reverse=True)
        peak_hours = [h for h, _ in sorted_hours[:3]]
    else:
        peak_hours = [9, 10, 11]  # Default morning hours

    optimal_work_times = {
        'peak_hours': peak_hours,
        'hourly_distribution': hourly_completions,
        'recommendation': _generate_time_recommendation(peak_hours)
    }

    # Analyze efficiency by job type to identify skill gaps
    type_efficiency = {}
    for job_type in ['custom_project', 'system_review', 'special_task']:
        type_jobs = [j for j in recent_completed if j.job_type == job_type
                     and j.actual_time_hours and j.planned_time_hours]
        if type_jobs:
            total_efficiency = sum(
                (float(j.planned_time_hours) / float(j.actual_time_hours)) * 100
                for j in type_jobs if float(j.actual_time_hours) > 0
            )
            avg_efficiency = total_efficiency / len(type_jobs)
            type_efficiency[job_type] = round(min(avg_efficiency, 150), 1)

    # Identify skill gaps (job types with low efficiency)
    skill_gaps = []
    for job_type, efficiency in type_efficiency.items():
        if efficiency < 80:
            skill_gaps.append({
                'area': job_type.replace('_', ' ').title(),
                'efficiency': efficiency,
                'recommendation': f'Consider additional training or review best practices for {job_type.replace("_", " ")} tasks'
            })

    # Generate suggested improvements
    suggested_improvements = _generate_improvements(
        recent_jobs, recent_completed, type_efficiency, skill_gaps
    )

    # Workload analysis
    status_counts = {}
    for j in recent_jobs:
        status_counts[j.status] = status_counts.get(j.status, 0) + 1

    in_progress = status_counts.get('in_progress', 0)
    paused = status_counts.get('paused', 0)

    workload_analysis = {
        'current_in_progress': in_progress,
        'current_paused': paused,
        'status_distribution': status_counts,
        'workload_level': 'high' if in_progress > 5 else ('medium' if in_progress > 2 else 'low'),
        'recommendation': _generate_workload_recommendation(in_progress, paused)
    }

    return jsonify({
        'status': 'success',
        'data': {
            'engineer_id': engineer_id,
            'analysis_period': {
                'start': thirty_days_ago.isoformat(),
                'end': today.isoformat()
            },
            'productivity_trend': productivity_trend,
            'optimal_work_times': optimal_work_times,
            'skill_gaps': skill_gaps,
            'suggested_improvements': suggested_improvements,
            'workload_analysis': workload_analysis,
            'type_efficiency': type_efficiency
        }
    }), 200


def _generate_productivity_summary(change, recent_count):
    """Generate a human-readable productivity summary."""
    if change > 20:
        return f"Excellent progress! Completed {recent_count} jobs, significantly above your previous pace."
    elif change > 5:
        return f"Good improvement with {recent_count} completed jobs. Keep up the momentum."
    elif change > -5:
        return f"Steady performance with {recent_count} completed jobs."
    elif change > -20:
        return f"Slight decrease in completions. Consider reviewing workload distribution."
    else:
        return f"Significant decrease in completions. May need workload adjustment or support."


def _generate_time_recommendation(peak_hours):
    """Generate recommendation based on peak productivity hours."""
    if not peak_hours:
        return "Not enough data to determine optimal work times."

    hour_ranges = {
        range(6, 10): "early morning",
        range(10, 12): "mid-morning",
        range(12, 14): "around noon",
        range(14, 17): "afternoon",
        range(17, 20): "evening"
    }

    peak_period = "during business hours"
    for hour_range, period_name in hour_ranges.items():
        if peak_hours[0] in hour_range:
            peak_period = period_name
            break

    return f"You are most productive {peak_period}. Consider scheduling complex tasks during these hours."


def _generate_improvements(all_jobs, completed_jobs, type_efficiency, skill_gaps):
    """Generate suggested improvements based on analysis."""
    improvements = []

    # Completion rate improvement
    if all_jobs:
        completion_rate = len(completed_jobs) / len(all_jobs) * 100
        if completion_rate < 70:
            improvements.append({
                'category': 'Completion Rate',
                'priority': 'high',
                'suggestion': 'Focus on completing in-progress jobs before starting new ones.'
            })

    # Efficiency improvements
    if type_efficiency:
        low_efficiency_types = [t for t, e in type_efficiency.items() if e < 80]
        if low_efficiency_types:
            improvements.append({
                'category': 'Efficiency',
                'priority': 'medium',
                'suggestion': f'Review estimation accuracy for {", ".join(low_efficiency_types).replace("_", " ")} tasks.'
            })

    # Skill gap improvements
    for gap in skill_gaps[:2]:  # Top 2 skill gaps
        improvements.append({
            'category': 'Skills Development',
            'priority': 'medium',
            'suggestion': gap['recommendation']
        })

    # Time management
    paused_jobs = [j for j in all_jobs if j.status == 'paused']
    if len(paused_jobs) > 2:
        improvements.append({
            'category': 'Time Management',
            'priority': 'medium',
            'suggestion': 'Multiple paused jobs detected. Consider prioritizing and completing paused work.'
        })

    # Default improvement if none found
    if not improvements:
        improvements.append({
            'category': 'General',
            'priority': 'low',
            'suggestion': 'Performance looks good! Continue maintaining current work habits.'
        })

    return improvements


def _generate_workload_recommendation(in_progress, paused):
    """Generate workload recommendation."""
    if in_progress > 5:
        return "High workload detected. Consider completing current tasks before accepting new ones."
    elif in_progress > 2 and paused > 0:
        return "Moderate workload with paused jobs. Review paused items and resume or escalate as needed."
    elif paused > in_progress:
        return "More paused jobs than active. Consider reviewing blockers and resuming paused work."
    else:
        return "Workload is manageable. Good job maintaining a balanced queue."
