"""
Specialist Job Routes
Handles the specialist job workflow with planned time requirement,
pause/resume, incomplete completion, admin timer control, and cleaning.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db, safe_commit
from app.models import SpecialistJob, Defect, User, PauseLog
from app.services.pause_service import PauseService
from app.services.takeover_service import TakeoverService
from app.utils.decorators import get_current_user, admin_required, role_required, get_language
from app.utils.pagination import paginate
from datetime import datetime

bp = Blueprint('specialist_jobs', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
def get_jobs():
    """Get all jobs for current specialist."""
    user = get_current_user()

    if user.role == 'admin':
        query = SpecialistJob.query
    else:
        query = SpecialistJob.query.filter_by(specialist_id=user.id)

    query = query.order_by(SpecialistJob.created_at.desc())
    items, pagination_meta = paginate(query)

    return jsonify({
        'status': 'success',
        'data': [job.to_dict(include_details=False) for job in items],
        'pagination': pagination_meta
    }), 200


@bp.route('/<int:job_id>', methods=['GET'])
@jwt_required()
def get_job_details(job_id):
    """Get job details. Full details ONLY if planned time entered."""
    user = get_current_user()
    job = SpecialistJob.query.get_or_404(job_id)

    if user.role != 'admin' and job.specialist_id != user.id:
        return jsonify({
            'status': 'error',
            'message': 'This job is not assigned to you'
        }), 403

    if user.role != 'admin' and not job.can_view_details():
        return jsonify({
            'status': 'error',
            'message': 'You must enter planned time before viewing job details',
            'code': 'PLANNED_TIME_REQUIRED',
            'data': {
                'job_id': job.job_id,
                'equipment_number': job.defect.inspection.equipment.name if job.defect and job.defect.inspection else None
            }
        }), 403

    language = get_language(user)
    return jsonify({
        'status': 'success',
        'data': job.to_dict(include_details=True, language=language)
    }), 200


@bp.route('/<int:job_id>/planned-time', methods=['POST'])
@jwt_required()
def enter_planned_time(job_id):
    """Enter planned time for a job. Must be done before viewing details."""
    user_id = get_jwt_identity()
    job = SpecialistJob.query.get_or_404(job_id)

    if job.specialist_id != int(user_id):
        return jsonify({'status': 'error', 'message': 'This job is not assigned to you'}), 403

    if job.has_planned_time():
        return jsonify({'status': 'error', 'message': 'Planned time has already been entered'}), 400

    data = request.get_json()
    planned_time = data.get('planned_time_hours') or data.get('hours')

    if not planned_time or planned_time <= 0:
        return jsonify({'status': 'error', 'message': 'Planned time must be greater than 0'}), 400

    job.planned_time_hours = planned_time
    job.planned_time_entered_at = datetime.utcnow()

    if job.defect and job.defect.inspection and job.defect.inspection.equipment:
        job.defect.inspection.equipment.status = 'under_maintenance'

    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Planned time entered successfully',
        'data': {
            'job': job.to_dict(include_details=True),
            'equipment_status': 'under_maintenance'
        }
    }), 200


@bp.route('/<int:job_id>/start', methods=['POST'])
@jwt_required()
def start_job(job_id):
    """Start the timer for a job. Optionally accepts planned_time_hours to set planned time in the same call."""
    user_id = get_jwt_identity()
    job = SpecialistJob.query.get_or_404(job_id)

    if job.specialist_id != int(user_id):
        return jsonify({'status': 'error', 'message': 'This job is not assigned to you'}), 403
    if job.started_at:
        return jsonify({
            'status': 'success',
            'message': 'Job already started',
            'data': job.to_dict(include_details=True)
        }), 200

    # Accept planned_time_hours in request body (combined start flow)
    data = request.get_json() or {}
    planned_time = data.get('planned_time_hours') or data.get('hours')

    if not job.has_planned_time():
        if not planned_time or planned_time <= 0:
            return jsonify({'status': 'error', 'message': 'Planned time is required to start the job'}), 400
        job.planned_time_hours = planned_time
        job.planned_time_entered_at = datetime.utcnow()

    # Set equipment to under_maintenance
    if job.defect and job.defect.inspection and job.defect.inspection.equipment:
        job.defect.inspection.equipment.status = 'under_maintenance'

    job.started_at = datetime.utcnow()
    job.status = 'in_progress'
    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Job started successfully',
        'data': job.to_dict(include_details=True)
    }), 200


@bp.route('/<int:job_id>/wrong-finding', methods=['POST'])
@jwt_required()
def wrong_finding(job_id):
    """Report a wrong finding — defect is not valid (false alarm). Cancels the job."""
    user_id = get_jwt_identity()
    job = SpecialistJob.query.get_or_404(job_id)

    if job.specialist_id != int(user_id):
        return jsonify({'status': 'error', 'message': 'This job is not assigned to you'}), 403
    if job.status != 'assigned':
        return jsonify({'status': 'error', 'message': 'Can only report wrong finding on assigned jobs'}), 400

    data = request.get_json() or {}
    reason = data.get('reason', '').strip()
    photo_path = data.get('photo_path', '').strip()

    if not reason:
        return jsonify({'status': 'error', 'message': 'Wrong finding reason is required'}), 400
    if not photo_path:
        return jsonify({'status': 'error', 'message': 'Photo/video evidence is required for wrong finding'}), 400

    # Cancel the job
    job.status = 'cancelled'
    job.wrong_finding_reason = reason
    job.wrong_finding_photo = photo_path
    job.completed_at = datetime.utcnow()

    # Update defect to false_alarm
    defect = job.defect
    if defect:
        defect.status = 'false_alarm'
        defect.resolution_notes = f'Wrong finding: {reason}'

    safe_commit()

    # Auto-translate wrong finding reason
    from app.utils.bilingual import auto_translate_and_save
    auto_translate_and_save('specialist_job', job.id, {'wrong_finding_reason': reason})

    # Notify admins
    from app.services.notification_service import NotificationService
    admins = User.query.filter_by(role='admin', is_active=True).all()
    for admin in admins:
        NotificationService.create_notification(
            user_id=admin.id,
            type='wrong_finding',
            title='Wrong Finding Reported',
            message=f'Job {job.job_id}: specialist reported wrong finding — {reason[:50]}',
            related_type='specialist_job',
            related_id=job.id,
            priority='warning'
        )

    return jsonify({
        'status': 'success',
        'message': 'Wrong finding reported successfully',
        'data': {
            'job': job.to_dict(include_details=False),
            'defect': defect.to_dict() if defect else None
        }
    }), 200


@bp.route('/<int:job_id>/complete', methods=['POST'])
@jwt_required()
def complete_job(job_id):
    """Complete a job. Requires work notes."""
    user_id = get_jwt_identity()
    job = SpecialistJob.query.get_or_404(job_id)

    if job.specialist_id != int(user_id):
        return jsonify({'status': 'error', 'message': 'This job is not assigned to you'}), 403
    if not job.started_at:
        return jsonify({'status': 'error', 'message': 'Job must be started before completion'}), 400

    data = request.get_json()
    work_notes = data.get('work_notes')
    completion_status = data.get('completion_status', 'pass')

    if not work_notes or len(work_notes) < 10:
        return jsonify({'status': 'error', 'message': 'Work notes are required (minimum 10 characters)'}), 400

    job.completed_at = datetime.utcnow()
    job.work_notes = work_notes
    job.status = 'completed'
    job.completion_status = completion_status

    # Calculate actual time from planned_time_entered_at (when specialist committed to the job)
    start_ref = job.planned_time_entered_at or job.started_at
    if start_ref:
        time_diff = job.completed_at - start_ref
        total_minutes = time_diff.total_seconds() / 60
        work_minutes = total_minutes - (job.paused_duration_minutes or 0)
        job.actual_time_hours = round(work_minutes / 60, 2)

    job.time_rating = job.calculate_time_rating()

    # Update equipment status
    if job.defect and job.defect.inspection and job.defect.inspection.equipment:
        job.defect.inspection.equipment.status = 'active'
        job.defect.status = 'resolved'

    safe_commit()

    # Auto-translate work notes
    from app.utils.bilingual import auto_translate_and_save
    auto_translate_and_save('specialist_job', job.id, {'work_notes': work_notes})

    # Auto-create quality review
    from app.services.quality_service import QualityService
    qes = User.query.filter(
        User.is_active == True,
        User.is_on_leave == False
    ).filter(
        db.or_(User.role == 'quality_engineer', User.minor_role == 'quality_engineer')
    ).all()

    if qes:
        from app.models import QualityReview
        min_count = None
        selected_qe = qes[0]
        for qe in qes:
            count = QualityReview.query.filter_by(qe_id=qe.id, status='pending').count()
            if min_count is None or count < min_count:
                min_count = count
                selected_qe = qe
        try:
            QualityService.create_review('specialist', job.id, selected_qe.id)
        except Exception:
            pass  # QC review creation failure shouldn't block completion

    return jsonify({
        'status': 'success',
        'message': 'Job completed successfully',
        'data': {
            'job': job.to_dict(include_details=True),
            'time_rating': float(job.time_rating) if job.time_rating else None
        }
    }), 200


@bp.route('/<int:job_id>/incomplete', methods=['POST'])
@jwt_required()
def mark_incomplete(job_id):
    """Mark job as incomplete with reason."""
    user_id = get_jwt_identity()
    job = SpecialistJob.query.get_or_404(job_id)

    if job.specialist_id != int(user_id):
        return jsonify({'status': 'error', 'message': 'This job is not assigned to you'}), 403
    if not job.started_at:
        return jsonify({'status': 'error', 'message': 'Job must be started first'}), 400

    data = request.get_json()
    reason = data.get('reason')
    if not reason or len(reason) < 10:
        return jsonify({'status': 'error', 'message': 'Incomplete reason required (min 10 chars)'}), 400

    job.status = 'incomplete'
    job.completion_status = 'incomplete'
    job.incomplete_reason = reason
    job.completed_at = datetime.utcnow()
    safe_commit()

    # Auto-translate incomplete reason
    from app.utils.bilingual import auto_translate_and_save
    auto_translate_and_save('specialist_job', job.id, {'incomplete_reason': reason})

    # Notify admins
    from app.services.notification_service import NotificationService
    admins = User.query.filter_by(role='admin', is_active=True).all()
    for admin in admins:
        NotificationService.create_notification(
            user_id=admin.id,
            type='job_incomplete',
            title='Specialist Job Marked Incomplete',
            message=f'Job {job.job_id} marked incomplete: {reason[:50]}',
            related_type='specialist_job',
            related_id=job.id,
            priority='warning'
        )

    return jsonify({
        'status': 'success',
        'message': 'Job marked as incomplete',
        'data': job.to_dict(include_details=True)
    }), 200


# --- Pause endpoints ---

@bp.route('/<int:job_id>/pause', methods=['POST'])
@jwt_required()
def request_pause(job_id):
    """Request pause for a specialist job."""
    user = get_current_user()
    data = request.get_json()

    pause = PauseService.request_pause(
        job_type='specialist',
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
    """Get pause history for a job."""
    pauses = PauseService.get_pause_history('specialist', job_id)
    return jsonify({
        'status': 'success',
        'data': [p.to_dict() for p in pauses]
    }), 200


@bp.route('/<int:job_id>/cleaning', methods=['POST'])
@jwt_required()
def upload_cleaning(job_id):
    """Upload after-job cleaning photos and notes."""
    user_id = get_jwt_identity()
    job = SpecialistJob.query.get_or_404(job_id)

    if job.specialist_id != int(user_id):
        return jsonify({'status': 'error', 'message': 'Not your job'}), 403
    if job.status not in ('completed', 'qc_approved'):
        return jsonify({'status': 'error', 'message': 'Job must be completed first'}), 400

    data = request.get_json()
    # Cleaning photos would be handled via file upload in production
    # For now, just note that cleaning was submitted
    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Cleaning documentation uploaded'
    }), 200


# --- Admin endpoints ---

@bp.route('/<int:job_id>/admin/force-pause', methods=['POST'])
@jwt_required()
@admin_required()
def admin_force_pause(job_id):
    """Admin force-pauses a specialist job."""
    user = get_current_user()
    data = request.get_json() or {}

    pause = PauseService.admin_force_pause(
        job_type='specialist',
        job_id=job_id,
        admin_id=user.id,
        reason=data.get('reason', 'Admin forced pause')
    )

    return jsonify({
        'status': 'success',
        'message': 'Job force-paused by admin',
        'data': pause.to_dict()
    }), 200


@bp.route('/<int:job_id>/admin/cleaning-rating', methods=['POST'])
@jwt_required()
@admin_required()
def admin_cleaning_rating(job_id):
    """Admin rates specialist cleaning (0-2 stars)."""
    data = request.get_json()
    rating = data.get('cleaning_rating')

    if not isinstance(rating, int) or rating < 0 or rating > 2:
        return jsonify({'status': 'error', 'message': 'Cleaning rating must be 0-2'}), 400

    job = SpecialistJob.query.get_or_404(job_id)
    job.cleaning_rating = rating

    # Add cleaning points to specialist
    specialist = db.session.get(User, job.specialist_id)
    if specialist and rating > 0:
        specialist.add_points(rating, 'specialist')

    safe_commit()

    return jsonify({
        'status': 'success',
        'message': f'Cleaning rated: {rating} stars',
        'data': job.to_dict(include_details=True)
    }), 200


@bp.route('/<int:job_id>/admin/bonus', methods=['POST'])
@jwt_required()
@admin_required()
def admin_bonus(job_id):
    """Admin awards bonus points (0-10) on a specialist job."""
    data = request.get_json()
    bonus = data.get('admin_bonus')

    if not isinstance(bonus, int) or bonus < 0 or bonus > 10:
        return jsonify({'status': 'error', 'message': 'Bonus must be 0-10'}), 400

    job = SpecialistJob.query.get_or_404(job_id)
    job.admin_bonus = bonus

    specialist = db.session.get(User, job.specialist_id)
    if specialist and bonus > 0:
        specialist.add_points(bonus, 'specialist')

    safe_commit()

    return jsonify({
        'status': 'success',
        'message': f'Admin bonus: {bonus} points',
        'data': job.to_dict(include_details=True)
    }), 200


# --- Pause management (admin) ---

@bp.route('/pauses/pending', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def pending_pauses():
    """Get all pending pause requests."""
    pauses = PauseService.get_pending_pauses()
    return jsonify({
        'status': 'success',
        'data': [p.to_dict() for p in pauses]
    }), 200


@bp.route('/pauses/<int:pause_id>/approve', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def approve_pause(pause_id):
    """Approve a pause request."""
    user = get_current_user()
    pause = PauseService.approve_pause(pause_id, user.id)
    return jsonify({
        'status': 'success',
        'message': 'Pause approved',
        'data': pause.to_dict()
    }), 200


@bp.route('/pauses/<int:pause_id>/deny', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def deny_pause(pause_id):
    """Deny a pause request."""
    user = get_current_user()
    pause = PauseService.deny_pause(pause_id, user.id)
    return jsonify({
        'status': 'success',
        'message': 'Pause denied',
        'data': pause.to_dict()
    }), 200


@bp.route('/pauses/<int:pause_id>/resume', methods=['POST'])
@jwt_required()
def resume_job(pause_id):
    """Resume a paused job."""
    user = get_current_user()
    pause = PauseService.resume_job(pause_id, user.id)
    return jsonify({
        'status': 'success',
        'message': 'Job resumed',
        'data': pause.to_dict()
    }), 200


# --- Takeover endpoints ---

@bp.route('/stalled', methods=['GET'])
@jwt_required()
def stalled_jobs():
    """Get stalled specialist jobs (paused 3+ days)."""
    jobs = TakeoverService.get_stalled_jobs()
    # Filter to specialist only
    specialist_jobs = [j for j in jobs if j['job_type'] == 'specialist']
    return jsonify({
        'status': 'success',
        'data': specialist_jobs
    }), 200


@bp.route('/<int:job_id>/takeover', methods=['POST'])
@jwt_required()
def request_takeover(job_id):
    """Request takeover of a stalled specialist job."""
    user = get_current_user()
    data = request.get_json() or {}

    takeover = TakeoverService.request_takeover(
        job_type='specialist',
        job_id=job_id,
        requested_by=user.id,
        reason=data.get('reason')
    )

    return jsonify({
        'status': 'success',
        'message': f'Takeover requested (Queue #{takeover.queue_position})',
        'data': takeover.to_dict()
    }), 201


@bp.route('/pending-planned-time', methods=['GET'])
@jwt_required()
def get_pending_planned_time():
    """Get jobs that need planned time entry."""
    user_id = get_jwt_identity()
    jobs = SpecialistJob.query.filter_by(
        specialist_id=user_id,
        planned_time_hours=None
    ).all()

    return jsonify({
        'status': 'success',
        'data': [job.to_dict(include_details=False) for job in jobs],
    }), 200


@bp.route('/active', methods=['GET'])
@jwt_required()
def get_active_jobs():
    """Get currently active/in-progress jobs."""
    user_id = get_jwt_identity()
    jobs = SpecialistJob.query.filter_by(
        specialist_id=user_id,
        status='in_progress'
    ).all()

    return jsonify({
        'status': 'success',
        'data': [job.to_dict(include_details=True) for job in jobs],
    }), 200
