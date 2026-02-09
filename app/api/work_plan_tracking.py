"""
Work Plan Tracking API.
Handles job execution (start/pause/resume/complete), daily reviews,
ratings, carry-overs, and performance reporting.
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.utils.decorators import get_current_user
from app.exceptions.api_exceptions import (
    ValidationError, NotFoundError, ForbiddenError, BusinessError, ConflictError
)
from app.models import (
    WorkPlanJob, WorkPlanAssignment, WorkPlanDay, WorkPlan, WorkPlanMaterial, User
)
from app.models.work_plan_job_tracking import WorkPlanJobTracking
from app.models.work_plan_job_log import WorkPlanJobLog
from app.models.work_plan_pause_request import WorkPlanPauseRequest
from app.models.work_plan_job_rating import WorkPlanJobRating
from app.models.work_plan_daily_review import WorkPlanDailyReview
from app.models.work_plan_carry_over import WorkPlanCarryOver
from app.models.work_plan_performance import WorkPlanPerformance
from app.services.notification_service import NotificationService
from datetime import datetime, date, timedelta
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('work_plan_tracking', __name__)


# ─── Helper Functions ───────────────────────────────────────────────

def get_authenticated_user():
    """Get current user with validation."""
    user = get_current_user()
    if not user:
        raise ForbiddenError("Authentication required")
    return user


def engineer_or_admin_required():
    """Check if user is engineer or admin."""
    user = get_authenticated_user()
    if user.role not in ['admin', 'engineer', 'quality_engineer']:
        raise ForbiddenError("Only engineers and admins can access this resource")
    return user


def get_job_or_404(job_id):
    """Get a work plan job or raise 404."""
    job = db.session.get(WorkPlanJob, job_id)
    if not job:
        raise NotFoundError("Work plan job not found")
    return job


def get_or_create_tracking(job_id):
    """Get existing tracking or create new one for a job."""
    tracking = WorkPlanJobTracking.query.filter_by(work_plan_job_id=job_id).first()
    if not tracking:
        tracking = WorkPlanJobTracking(
            work_plan_job_id=job_id,
            status='pending'
        )
        db.session.add(tracking)
        db.session.flush()
    return tracking


def check_user_assigned_to_job(user_id, job_id):
    """Verify user is assigned to this job."""
    assignment = WorkPlanAssignment.query.filter_by(
        work_plan_job_id=job_id,
        user_id=user_id
    ).first()
    if not assignment:
        raise ForbiddenError("You are not assigned to this job")
    return assignment


def create_log_entry(job_id, user_id, event_type, event_data=None, notes=None):
    """Create a job log entry."""
    log = WorkPlanJobLog(
        work_plan_job_id=job_id,
        user_id=user_id,
        event_type=event_type,
        event_data=event_data,
        notes=notes
    )
    db.session.add(log)
    return log


def notify_engineers_for_job(job, notification_type, title, message, priority='info'):
    """Send notification to the engineer responsible for a job's work plan."""
    day = db.session.get(WorkPlanDay, job.work_plan_day_id)
    if not day:
        return
    plan = db.session.get(WorkPlan, day.work_plan_id)
    if not plan:
        return
    # Notify the plan creator (engineer)
    if plan.created_by_id:
        NotificationService.create_notification(
            user_id=plan.created_by_id,
            type=notification_type,
            title=title,
            message=message,
            related_type='work_plan_job',
            related_id=job.id,
            priority=priority
        )


# ─── Worker Endpoints: Job Execution ───────────────────────────────

@bp.route('/jobs/<int:job_id>/start', methods=['POST'])
@jwt_required()
def start_job(job_id):
    """Worker starts a job. Creates tracking record and begins timer."""
    user = get_authenticated_user()
    job = get_job_or_404(job_id)

    # Allow assigned workers, engineers, and admins
    if user.role not in ['admin', 'engineer']:
        check_user_assigned_to_job(user.id, job_id)

    tracking = get_or_create_tracking(job_id)

    if tracking.status not in ['pending', 'not_started']:
        raise BusinessError(f"Cannot start job in '{tracking.status}' status")

    now = datetime.utcnow()
    tracking.status = 'in_progress'
    tracking.started_at = now

    # Determine shift type based on time
    hour = now.hour
    tracking.shift_type = 'night' if (hour >= 19 or hour < 7) else 'day'

    create_log_entry(job_id, user.id, 'started')
    db.session.commit()

    logger.info("Job %s started by user %s", job_id, user.id)
    return jsonify({
        'status': 'success',
        'message': 'Job started',
        'tracking': tracking.to_dict()
    }), 200


@bp.route('/jobs/<int:job_id>/pause', methods=['POST'])
@jwt_required()
def pause_job(job_id):
    """Worker pauses a job. Takes effect immediately, engineer reviews later."""
    user = get_authenticated_user()
    job = get_job_or_404(job_id)

    if user.role not in ['admin', 'engineer']:
        check_user_assigned_to_job(user.id, job_id)

    tracking = get_or_create_tracking(job_id)
    if tracking.status != 'in_progress':
        raise BusinessError("Can only pause an in-progress job")

    data = request.get_json() or {}
    reason_category = data.get('reason_category')
    if not reason_category:
        raise ValidationError("reason_category is required")

    valid_reasons = ['break', 'waiting_for_materials', 'urgent_task', 'waiting_for_access', 'other']
    if reason_category not in valid_reasons:
        raise ValidationError(f"reason_category must be one of: {', '.join(valid_reasons)}")

    now = datetime.utcnow()
    tracking.status = 'paused'
    tracking.paused_at = now

    # Create pause request
    pause_request = WorkPlanPauseRequest(
        work_plan_job_id=job_id,
        requested_by_id=user.id,
        reason_category=reason_category,
        reason_details=data.get('reason_details'),
        status='pending'
    )
    db.session.add(pause_request)

    create_log_entry(job_id, user.id, 'paused', {
        'reason_category': reason_category,
        'reason_details': data.get('reason_details')
    })

    # Send immediate high-priority notification to engineer
    notify_engineers_for_job(
        job,
        'work_plan_pause_request',
        'Job Paused - Review Required',
        f'{user.full_name} paused job (Reason: {reason_category})',
        priority='urgent'
    )

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Job paused. Engineer will be notified.',
        'tracking': tracking.to_dict(),
        'pause_request': pause_request.to_dict()
    }), 200


@bp.route('/jobs/<int:job_id>/resume', methods=['POST'])
@jwt_required()
def resume_job(job_id):
    """Worker resumes a paused job."""
    user = get_authenticated_user()
    job = get_job_or_404(job_id)

    if user.role not in ['admin', 'engineer']:
        check_user_assigned_to_job(user.id, job_id)

    tracking = get_or_create_tracking(job_id)
    if tracking.status != 'paused':
        raise BusinessError("Can only resume a paused job")

    now = datetime.utcnow()

    # Calculate pause duration
    if tracking.paused_at:
        pause_duration = int((now - tracking.paused_at).total_seconds() / 60)
        tracking.total_paused_minutes = (tracking.total_paused_minutes or 0) + pause_duration

        # Update the latest pending pause request
        latest_pause = WorkPlanPauseRequest.query.filter_by(
            work_plan_job_id=job_id,
            status='pending'
        ).order_by(WorkPlanPauseRequest.created_at.desc()).first()
        if latest_pause:
            latest_pause.resumed_at = now
            latest_pause.duration_minutes = pause_duration

    tracking.status = 'in_progress'
    tracking.paused_at = None

    create_log_entry(job_id, user.id, 'resumed', {
        'pause_duration_minutes': pause_duration if tracking.paused_at else 0
    })

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Job resumed',
        'tracking': tracking.to_dict()
    }), 200


@bp.route('/jobs/<int:job_id>/complete', methods=['POST'])
@jwt_required()
def complete_job(job_id):
    """Worker completes a job. Requires cleaning photo."""
    user = get_authenticated_user()
    job = get_job_or_404(job_id)

    if user.role not in ['admin', 'engineer']:
        check_user_assigned_to_job(user.id, job_id)

    tracking = get_or_create_tracking(job_id)
    if tracking.status not in ['in_progress', 'paused']:
        raise BusinessError(f"Cannot complete job in '{tracking.status}' status")

    data = request.get_json() or {}

    now = datetime.utcnow()

    # If was paused, add remaining pause time
    if tracking.status == 'paused' and tracking.paused_at:
        pause_duration = int((now - tracking.paused_at).total_seconds() / 60)
        tracking.total_paused_minutes = (tracking.total_paused_minutes or 0) + pause_duration
        tracking.paused_at = None

    tracking.status = 'completed'
    tracking.completed_at = now
    tracking.work_notes = data.get('work_notes')
    tracking.completion_photo_id = data.get('completion_photo_id')

    # Calculate actual hours
    tracking.actual_hours = tracking.calculate_actual_hours()

    create_log_entry(job_id, user.id, 'completed', {
        'actual_hours': float(tracking.actual_hours) if tracking.actual_hours else None,
        'work_notes': data.get('work_notes')
    })

    db.session.commit()

    logger.info("Job %s completed by user %s. Actual hours: %s", job_id, user.id, tracking.actual_hours)
    return jsonify({
        'status': 'success',
        'message': 'Job completed',
        'tracking': tracking.to_dict()
    }), 200


@bp.route('/jobs/<int:job_id>/incomplete', methods=['POST'])
@jwt_required()
def mark_incomplete(job_id):
    """Worker marks job as incomplete. Requires reason and optional voice handover."""
    user = get_authenticated_user()
    job = get_job_or_404(job_id)

    if user.role not in ['admin', 'engineer']:
        check_user_assigned_to_job(user.id, job_id)

    tracking = get_or_create_tracking(job_id)
    if tracking.status not in ['in_progress', 'paused', 'pending']:
        raise BusinessError(f"Cannot mark job incomplete in '{tracking.status}' status")

    data = request.get_json() or {}
    reason_category = data.get('reason_category')
    if not reason_category:
        raise ValidationError("reason_category is required for incomplete jobs")

    valid_reasons = ['missing_parts', 'equipment_not_accessible', 'time_ran_out', 'safety_concern', 'other']
    if reason_category not in valid_reasons:
        raise ValidationError(f"reason_category must be one of: {', '.join(valid_reasons)}")

    now = datetime.utcnow()

    # If was paused, add remaining pause time
    if tracking.status == 'paused' and tracking.paused_at:
        pause_duration = int((now - tracking.paused_at).total_seconds() / 60)
        tracking.total_paused_minutes = (tracking.total_paused_minutes or 0) + pause_duration
        tracking.paused_at = None

    tracking.status = 'incomplete'
    tracking.completed_at = now
    tracking.incomplete_reason_category = reason_category
    tracking.incomplete_reason_details = data.get('reason_details')
    tracking.handover_voice_file_id = data.get('handover_voice_file_id')
    tracking.handover_transcription = data.get('handover_transcription')

    # Calculate actual hours if job was started
    if tracking.started_at:
        tracking.actual_hours = tracking.calculate_actual_hours()

    create_log_entry(job_id, user.id, 'marked_incomplete', {
        'reason_category': reason_category,
        'reason_details': data.get('reason_details'),
        'actual_hours': float(tracking.actual_hours) if tracking.actual_hours else None
    })

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Job marked as incomplete',
        'tracking': tracking.to_dict()
    }), 200


@bp.route('/jobs/<int:job_id>/tracking', methods=['GET'])
@jwt_required()
def get_job_tracking(job_id):
    """Get tracking status for a specific job."""
    user = get_authenticated_user()
    job = get_job_or_404(job_id)

    tracking = WorkPlanJobTracking.query.filter_by(work_plan_job_id=job_id).first()
    logs = WorkPlanJobLog.query.filter_by(work_plan_job_id=job_id).order_by(
        WorkPlanJobLog.created_at.desc()
    ).all()
    pause_requests = WorkPlanPauseRequest.query.filter_by(work_plan_job_id=job_id).order_by(
        WorkPlanPauseRequest.created_at.desc()
    ).all()
    ratings = WorkPlanJobRating.query.filter_by(work_plan_job_id=job_id).all()

    # Check for carry-over info
    carry_over_from = WorkPlanCarryOver.query.filter_by(new_job_id=job_id).first()
    carry_over_to = WorkPlanCarryOver.query.filter_by(original_job_id=job_id).first()

    return jsonify({
        'status': 'success',
        'tracking': tracking.to_dict() if tracking else None,
        'logs': [log.to_dict() for log in logs],
        'pause_requests': [pr.to_dict() for pr in pause_requests],
        'ratings': [r.to_dict() for r in ratings],
        'carry_over_from': carry_over_from.to_dict() if carry_over_from else None,
        'carry_over_to': carry_over_to.to_dict() if carry_over_to else None,
    }), 200


# ─── Worker Endpoints: My Jobs & Performance ───────────────────────

@bp.route('/my-jobs', methods=['GET'])
@jwt_required()
def get_my_jobs():
    """Get current user's assigned jobs for today with tracking status."""
    user = get_authenticated_user()
    target_date = request.args.get('date')

    if target_date:
        try:
            target_date = date.fromisoformat(target_date)
        except ValueError:
            raise ValidationError("Invalid date format. Use YYYY-MM-DD")
    else:
        target_date = date.today()

    # Get assignments for this user on the target date
    assignments = db.session.query(WorkPlanAssignment).join(
        WorkPlanJob, WorkPlanAssignment.work_plan_job_id == WorkPlanJob.id
    ).join(
        WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id
    ).filter(
        WorkPlanAssignment.user_id == user.id,
        WorkPlanDay.date == target_date
    ).all()

    jobs_data = []
    for assignment in assignments:
        job = assignment.job
        tracking = WorkPlanJobTracking.query.filter_by(work_plan_job_id=job.id).first()

        # Check for carry-over info
        carry_over = WorkPlanCarryOver.query.filter_by(new_job_id=job.id).first()

        job_dict = job.to_dict(compact=True) if hasattr(job.to_dict, '__code__') and 'compact' in job.to_dict.__code__.co_varnames else job.to_dict()
        job_dict['tracking'] = tracking.to_dict() if tracking else None
        job_dict['is_lead'] = assignment.is_lead
        job_dict['carry_over_from'] = carry_over.to_dict() if carry_over else None

        jobs_data.append(job_dict)

    return jsonify({
        'status': 'success',
        'date': target_date.isoformat(),
        'jobs': jobs_data,
        'count': len(jobs_data)
    }), 200


@bp.route('/my-performance', methods=['GET'])
@jwt_required()
def get_my_performance():
    """Get current user's performance stats."""
    user = get_authenticated_user()
    period_type = request.args.get('period', 'daily')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    query = WorkPlanPerformance.query.filter_by(
        user_id=user.id,
        period_type=period_type
    )

    if start_date:
        try:
            query = query.filter(WorkPlanPerformance.period_start >= date.fromisoformat(start_date))
        except ValueError:
            raise ValidationError("Invalid start_date format")

    if end_date:
        try:
            query = query.filter(WorkPlanPerformance.period_end <= date.fromisoformat(end_date))
        except ValueError:
            raise ValidationError("Invalid end_date format")

    performances = query.order_by(WorkPlanPerformance.period_start.desc()).all()

    # Get current streak
    latest_daily = WorkPlanPerformance.query.filter_by(
        user_id=user.id,
        period_type='daily'
    ).order_by(WorkPlanPerformance.period_start.desc()).first()

    return jsonify({
        'status': 'success',
        'performances': [p.to_dict() for p in performances],
        'current_streak': latest_daily.current_streak_days if latest_daily else 0,
        'max_streak': latest_daily.max_streak_days if latest_daily else 0,
    }), 200


# ─── Engineer Endpoints: Pause Management ──────────────────────────

@bp.route('/pause-requests', methods=['GET'])
@jwt_required()
def get_pause_requests():
    """Get pending pause requests for engineer's team."""
    user = engineer_or_admin_required()
    status_filter = request.args.get('status', 'pending')

    query = WorkPlanPauseRequest.query
    if status_filter != 'all':
        query = query.filter_by(status=status_filter)

    # Filter by engineer's work plans if not admin
    if user.role != 'admin':
        query = query.join(
            WorkPlanJob, WorkPlanPauseRequest.work_plan_job_id == WorkPlanJob.id
        ).join(
            WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id
        ).join(
            WorkPlan, WorkPlanDay.work_plan_id == WorkPlan.id
        ).filter(WorkPlan.created_by_id == user.id)

    requests = query.order_by(WorkPlanPauseRequest.created_at.desc()).all()

    return jsonify({
        'status': 'success',
        'pause_requests': [pr.to_dict() for pr in requests],
        'count': len(requests)
    }), 200


@bp.route('/pause-requests/<int:request_id>/approve', methods=['POST'])
@jwt_required()
def approve_pause(request_id):
    """Engineer approves a pause request."""
    user = engineer_or_admin_required()

    pause_req = db.session.get(WorkPlanPauseRequest, request_id)
    if not pause_req:
        raise NotFoundError("Pause request not found")

    if pause_req.status != 'pending':
        raise BusinessError("Pause request already reviewed")

    data = request.get_json() or {}

    pause_req.status = 'approved'
    pause_req.reviewed_by_id = user.id
    pause_req.reviewed_at = datetime.utcnow()
    pause_req.review_notes = data.get('notes')

    create_log_entry(pause_req.work_plan_job_id, user.id, 'pause_approved', {
        'pause_request_id': request_id
    })

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Pause request approved',
        'pause_request': pause_req.to_dict()
    }), 200


@bp.route('/pause-requests/<int:request_id>/reject', methods=['POST'])
@jwt_required()
def reject_pause(request_id):
    """Engineer rejects a pause request."""
    user = engineer_or_admin_required()

    pause_req = db.session.get(WorkPlanPauseRequest, request_id)
    if not pause_req:
        raise NotFoundError("Pause request not found")

    if pause_req.status != 'pending':
        raise BusinessError("Pause request already reviewed")

    data = request.get_json() or {}

    pause_req.status = 'rejected'
    pause_req.reviewed_by_id = user.id
    pause_req.reviewed_at = datetime.utcnow()
    pause_req.review_notes = data.get('notes')

    create_log_entry(pause_req.work_plan_job_id, user.id, 'pause_rejected', {
        'pause_request_id': request_id,
        'reason': data.get('notes')
    })

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Pause request rejected',
        'pause_request': pause_req.to_dict()
    }), 200


# ─── Engineer Endpoints: Daily Review ──────────────────────────────

@bp.route('/daily-review', methods=['GET'])
@jwt_required()
def get_daily_review():
    """Get or create daily review for the engineer."""
    user = engineer_or_admin_required()
    target_date = request.args.get('date')
    shift_type = request.args.get('shift', 'day')

    if target_date:
        try:
            target_date = date.fromisoformat(target_date)
        except ValueError:
            raise ValidationError("Invalid date format")
    else:
        target_date = date.today()

    # Get or create the review
    review = WorkPlanDailyReview.query.filter_by(
        engineer_id=user.id,
        date=target_date,
        shift_type=shift_type
    ).first()

    if not review:
        review = WorkPlanDailyReview(
            engineer_id=user.id,
            date=target_date,
            shift_type=shift_type,
            status='open',
            opened_at=datetime.utcnow()
        )
        db.session.add(review)
        db.session.flush()

    # Get all jobs for this date from plans created by this engineer (or all if admin)
    jobs_query = db.session.query(WorkPlanJob).join(
        WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id
    ).join(
        WorkPlan, WorkPlanDay.work_plan_id == WorkPlan.id
    ).filter(
        WorkPlanDay.date == target_date
    )

    if user.role != 'admin':
        jobs_query = jobs_query.filter(WorkPlan.created_by_id == user.id)

    jobs = jobs_query.all()

    # Build job data with tracking info
    jobs_data = []
    completed_count = 0
    incomplete_count = 0
    not_started_count = 0

    for job in jobs:
        tracking = WorkPlanJobTracking.query.filter_by(work_plan_job_id=job.id).first()
        ratings = WorkPlanJobRating.query.filter_by(work_plan_job_id=job.id).all()
        pause_requests = WorkPlanPauseRequest.query.filter_by(
            work_plan_job_id=job.id
        ).all()

        # Count by status
        if tracking:
            if tracking.status == 'completed':
                completed_count += 1
            elif tracking.status == 'incomplete':
                incomplete_count += 1
            elif tracking.status in ('pending', 'not_started'):
                not_started_count += 1

        job_dict = job.to_dict()
        job_dict['tracking'] = tracking.to_dict() if tracking else None
        job_dict['ratings'] = [r.to_dict() for r in ratings]
        job_dict['pause_requests'] = [pr.to_dict() for pr in pause_requests]
        job_dict['materials'] = [m.to_dict() for m in job.materials] if hasattr(job, 'materials') else []
        jobs_data.append(job_dict)

    # Update review counts
    review.total_jobs = len(jobs)
    review.approved_jobs = completed_count
    review.incomplete_jobs = incomplete_count
    review.not_started_jobs = not_started_count

    # Count pending pause requests
    pending_pauses = sum(
        1 for j in jobs_data
        for pr in j.get('pause_requests', [])
        if pr.get('status') == 'pending'
    )
    total_pauses = sum(len(j.get('pause_requests', [])) for j in jobs_data)
    review.total_pause_requests = total_pauses
    review.resolved_pause_requests = total_pauses - pending_pauses

    db.session.commit()

    return jsonify({
        'status': 'success',
        'review': review.to_dict(),
        'jobs': jobs_data,
    }), 200


@bp.route('/daily-review/<int:review_id>/rate-job', methods=['POST'])
@jwt_required()
def rate_job(review_id):
    """Engineer rates a job for a specific worker during daily review."""
    user = engineer_or_admin_required()

    review = db.session.get(WorkPlanDailyReview, review_id)
    if not review:
        raise NotFoundError("Daily review not found")

    if review.status == 'submitted':
        raise BusinessError("Review already submitted")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body required")

    job_id = data.get('job_id')
    worker_id = data.get('user_id')
    if not job_id or not worker_id:
        raise ValidationError("job_id and user_id are required")

    job = get_job_or_404(job_id)
    tracking = WorkPlanJobTracking.query.filter_by(work_plan_job_id=job_id).first()

    # Get or create rating
    rating = WorkPlanJobRating.query.filter_by(
        work_plan_job_id=job_id,
        user_id=worker_id
    ).first()

    if not rating:
        # Check if worker is lead
        assignment = WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job_id,
            user_id=worker_id
        ).first()

        rating = WorkPlanJobRating(
            work_plan_job_id=job_id,
            user_id=worker_id,
            is_lead=assignment.is_lead if assignment else False,
            daily_review_id=review_id
        )
        db.session.add(rating)

    # Auto-calculate time rating if tracking has actual hours
    if tracking and tracking.actual_hours and job.estimated_hours:
        rating.time_rating = WorkPlanJobRating.calculate_time_rating(
            job.estimated_hours, tracking.actual_hours
        )

    # QC rating (required reason if < 3 or > 4)
    if 'qc_rating' in data:
        qc = data['qc_rating']
        if qc is not None and (qc < 3 or qc > 4):
            if not data.get('qc_reason'):
                raise ValidationError("qc_reason is required when QC rating is below 3 or above 4")
        rating.qc_rating = qc
        rating.qc_reason = data.get('qc_reason')
        rating.qc_voice_file_id = data.get('qc_voice_file_id')

    # Cleaning rating
    if 'cleaning_rating' in data:
        rating.cleaning_rating = data['cleaning_rating']

    rating.rated_by_id = user.id
    rating.rated_at = datetime.utcnow()

    # Calculate points
    points = 0
    if rating.time_rating:
        points += int(float(rating.time_rating) * 10)
    if rating.qc_rating:
        points += int(float(rating.qc_rating) * 10)
    if rating.cleaning_rating:
        points += rating.cleaning_rating * 5
    rating.points_earned = points

    create_log_entry(job_id, user.id, 'rating_given', {
        'worker_id': worker_id,
        'time_rating': float(rating.time_rating) if rating.time_rating else None,
        'qc_rating': float(rating.qc_rating) if rating.qc_rating else None,
        'cleaning_rating': rating.cleaning_rating,
        'points': points
    })

    # Update review status to partial if not yet submitted
    if review.status == 'open':
        review.status = 'partial'
    review.last_saved_at = datetime.utcnow()

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Rating saved',
        'rating': rating.to_dict()
    }), 200


@bp.route('/daily-review/<int:review_id>/consume-materials', methods=['POST'])
@jwt_required()
def consume_materials(review_id):
    """Engineer ticks materials as consumed during daily review."""
    user = engineer_or_admin_required()

    review = db.session.get(WorkPlanDailyReview, review_id)
    if not review:
        raise NotFoundError("Daily review not found")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body required")

    materials = data.get('materials', [])
    # materials: [{material_id: int, job_id: int, consumed: bool}]

    for item in materials:
        mat = WorkPlanMaterial.query.filter_by(
            id=item.get('material_id'),
            work_plan_job_id=item.get('job_id')
        ).first()
        if mat and item.get('consumed'):
            mat.actual_quantity = mat.quantity
            mat.consumed_at = datetime.utcnow()

            create_log_entry(item['job_id'], user.id, 'material_consumed', {
                'material_id': mat.id,
                'quantity': float(mat.quantity) if mat.quantity else None
            })

    review.materials_reviewed = True
    review.last_saved_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Materials consumption recorded'
    }), 200


@bp.route('/daily-review/<int:review_id>/carry-over', methods=['POST'])
@jwt_required()
def create_carry_over(review_id):
    """Engineer creates a carry-over for an incomplete job."""
    user = engineer_or_admin_required()

    review = db.session.get(WorkPlanDailyReview, review_id)
    if not review:
        raise NotFoundError("Daily review not found")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body required")

    original_job_id = data.get('original_job_id')
    if not original_job_id:
        raise ValidationError("original_job_id is required")

    original_job = get_job_or_404(original_job_id)
    original_tracking = WorkPlanJobTracking.query.filter_by(
        work_plan_job_id=original_job_id
    ).first()

    if not original_tracking or original_tracking.status not in ['incomplete', 'not_started']:
        raise BusinessError("Can only carry over incomplete or not-started jobs")

    # Check if already carried over
    existing = WorkPlanCarryOver.query.filter_by(original_job_id=original_job_id).first()
    if existing:
        raise ConflictError("This job has already been carried over")

    # Find the next day in the work plan
    day = db.session.get(WorkPlanDay, original_job.work_plan_day_id)
    if not day:
        raise NotFoundError("Work plan day not found")

    next_date = day.date + timedelta(days=1)
    next_day = WorkPlanDay.query.filter_by(
        work_plan_id=day.work_plan_id,
        date=next_date
    ).first()

    # If next day doesn't exist in current plan, find it in next week's plan
    target_day_id = None
    if next_day:
        target_day_id = next_day.id
    else:
        # Look for next week's plan
        next_plan = WorkPlan.query.filter(
            WorkPlan.week_start > day.date
        ).order_by(WorkPlan.week_start).first()
        if next_plan:
            next_day = WorkPlanDay.query.filter_by(
                work_plan_id=next_plan.id,
                date=next_date
            ).first()
            if next_day:
                target_day_id = next_day.id

    if not target_day_id:
        raise BusinessError("No target day found for carry-over. Create next week's plan first.")

    # Create the new job on the next day (copy from original)
    new_job = WorkPlanJob(
        work_plan_day_id=target_day_id,
        job_type=original_job.job_type,
        berth=original_job.berth,
        priority=original_job.priority,
        estimated_hours=original_job.estimated_hours,
        equipment_id=original_job.equipment_id,
        defect_id=original_job.defect_id,
        inspection_assignment_id=original_job.inspection_assignment_id,
        cycle_id=original_job.cycle_id,
        pm_template_id=original_job.pm_template_id,
        sap_order_number=original_job.sap_order_number,
        sap_order_type=original_job.sap_order_type,
        description=original_job.description,
        notes=f"[CARRY-OVER] {original_job.notes or ''}".strip(),
    )
    db.session.add(new_job)
    db.session.flush()

    # Copy assignments (same workers by default, or reassign)
    reassign_to = data.get('reassign_to_ids')
    if reassign_to:
        for uid in reassign_to:
            assignment = WorkPlanAssignment(
                work_plan_job_id=new_job.id,
                user_id=uid,
                is_lead=(uid == reassign_to[0])
            )
            db.session.add(assignment)
    else:
        # Keep same assignments
        original_assignments = WorkPlanAssignment.query.filter_by(
            work_plan_job_id=original_job_id
        ).all()
        for oa in original_assignments:
            assignment = WorkPlanAssignment(
                work_plan_job_id=new_job.id,
                user_id=oa.user_id,
                is_lead=oa.is_lead
            )
            db.session.add(assignment)

    # Create tracking for new job (marked as carry-over)
    carry_over_count = (original_tracking.carry_over_count or 0) + 1
    new_tracking = WorkPlanJobTracking(
        work_plan_job_id=new_job.id,
        status='pending',
        is_carry_over=True,
        original_job_id=original_job_id,
        carry_over_count=carry_over_count,
    )
    db.session.add(new_tracking)

    # Create carry-over record
    carry_over = WorkPlanCarryOver(
        original_job_id=original_job_id,
        new_job_id=new_job.id,
        reason_category=data.get('reason_category', original_tracking.incomplete_reason_category or 'other'),
        reason_details=data.get('reason_details', original_tracking.incomplete_reason_details),
        worker_voice_file_id=original_tracking.handover_voice_file_id,
        worker_transcription=original_tracking.handover_transcription,
        engineer_voice_file_id=data.get('engineer_voice_file_id'),
        engineer_transcription=data.get('engineer_transcription'),
        hours_spent_original=original_tracking.actual_hours,
        carried_over_by_id=user.id,
        daily_review_id=review_id,
    )
    db.session.add(carry_over)

    review.carry_over_jobs = (review.carry_over_jobs or 0) + 1
    review.last_saved_at = datetime.utcnow()

    create_log_entry(original_job_id, user.id, 'carry_over_created', {
        'new_job_id': new_job.id,
        'target_date': next_date.isoformat(),
        'carry_over_count': carry_over_count
    })

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Job carried over to next day',
        'carry_over': carry_over.to_dict(),
        'new_job': new_job.to_dict()
    }), 201


@bp.route('/daily-review/<int:review_id>/submit', methods=['POST'])
@jwt_required()
def submit_review(review_id):
    """Engineer submits the daily review. All pause requests must be resolved."""
    user = engineer_or_admin_required()

    review = db.session.get(WorkPlanDailyReview, review_id)
    if not review:
        raise NotFoundError("Daily review not found")

    if review.status == 'submitted':
        raise BusinessError("Review already submitted")

    if not review.can_submit:
        raise BusinessError("Cannot submit: unresolved pause requests exist. Review all pause requests first.")

    review.status = 'submitted'
    review.submitted_at = datetime.utcnow()

    # Award points to all rated workers
    ratings = WorkPlanJobRating.query.filter_by(daily_review_id=review_id).all()
    for rating in ratings:
        if rating.points_earned > 0:
            worker = db.session.get(User, rating.user_id)
            if worker:
                worker.add_points(rating.points_earned, worker.role)

    db.session.commit()

    logger.info("Daily review %s submitted by engineer %s", review_id, user.id)
    return jsonify({
        'status': 'success',
        'message': 'Daily review submitted',
        'review': review.to_dict()
    }), 200


# ─── Engineer Endpoints: Rating Override ───────────────────────────

@bp.route('/ratings/<int:rating_id>/override-time', methods=['POST'])
@jwt_required()
def override_time_rating(rating_id):
    """Engineer overrides time rating (requires admin approval)."""
    user = engineer_or_admin_required()

    rating = db.session.get(WorkPlanJobRating, rating_id)
    if not rating:
        raise NotFoundError("Rating not found")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body required")

    new_rating = data.get('time_rating')
    reason = data.get('reason')
    if new_rating is None or not reason:
        raise ValidationError("time_rating and reason are required")

    if new_rating < 1 or new_rating > 7:
        raise ValidationError("time_rating must be between 1 and 7")

    rating.time_rating_override = new_rating
    rating.time_rating_override_reason = reason
    rating.time_rating_override_by_id = user.id
    rating.time_rating_override_approved = None  # Pending admin approval

    create_log_entry(rating.work_plan_job_id, user.id, 'rating_override', {
        'original_rating': float(rating.time_rating) if rating.time_rating else None,
        'new_rating': new_rating,
        'reason': reason
    })

    # Notify admins
    admins = User.query.filter_by(role='admin', is_active=True).all()
    for admin in admins:
        NotificationService.create_notification(
            user_id=admin.id,
            type='time_rating_override_request',
            title='Time Rating Override Request',
            message=f'Engineer {user.full_name} requests time rating override for job #{rating.work_plan_job_id}',
            related_type='work_plan_job_rating',
            related_id=rating.id,
            priority='warning'
        )

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Time rating override submitted for admin approval',
        'rating': rating.to_dict()
    }), 200


# ─── Admin Endpoints ───────────────────────────────────────────────

@bp.route('/ratings/<int:rating_id>/approve-override', methods=['POST'])
@jwt_required()
def approve_override(rating_id):
    """Admin approves or rejects a time rating override."""
    user = get_authenticated_user()
    if user.role != 'admin':
        raise ForbiddenError("Only admins can approve overrides")

    rating = db.session.get(WorkPlanJobRating, rating_id)
    if not rating:
        raise NotFoundError("Rating not found")

    if rating.time_rating_override is None:
        raise BusinessError("No override to approve")

    data = request.get_json() or {}
    approved = data.get('approved', True)

    rating.time_rating_override_approved = approved
    rating.time_rating_override_approved_by_id = user.id
    rating.time_rating_override_approved_at = datetime.utcnow()

    if approved:
        # Recalculate points with new rating
        old_points = rating.points_earned
        points = 0
        effective_rating = float(rating.time_rating_override)
        points += int(effective_rating * 10)
        if rating.qc_rating:
            points += int(float(rating.qc_rating) * 10)
        if rating.cleaning_rating:
            points += rating.cleaning_rating * 5
        points += rating.admin_bonus
        rating.points_earned = points

        # Update worker's total points
        worker = db.session.get(User, rating.user_id)
        if worker:
            diff = points - old_points
            if diff != 0:
                worker.add_points(diff, worker.role)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Override {"approved" if approved else "rejected"}',
        'rating': rating.to_dict()
    }), 200


@bp.route('/ratings/<int:rating_id>/admin-bonus', methods=['POST'])
@jwt_required()
def give_admin_bonus(rating_id):
    """Admin gives bonus points (0-10) to a worker."""
    user = get_authenticated_user()
    if user.role != 'admin':
        raise ForbiddenError("Only admins can give bonus points")

    rating = db.session.get(WorkPlanJobRating, rating_id)
    if not rating:
        raise NotFoundError("Rating not found")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body required")

    bonus = data.get('bonus', 0)
    if bonus < 0 or bonus > 10:
        raise ValidationError("Bonus must be between 0 and 10")

    old_bonus = rating.admin_bonus
    rating.admin_bonus = bonus
    rating.admin_bonus_by_id = user.id
    rating.admin_bonus_notes = data.get('notes')

    # Update points
    diff = bonus - old_bonus
    rating.points_earned = (rating.points_earned or 0) + diff

    if diff != 0:
        worker = db.session.get(User, rating.user_id)
        if worker:
            worker.add_points(diff, worker.role)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Admin bonus of {bonus} given',
        'rating': rating.to_dict()
    }), 200


# ─── Worker Endpoints: Dispute ─────────────────────────────────────

@bp.route('/ratings/<int:rating_id>/dispute', methods=['POST'])
@jwt_required()
def dispute_rating(rating_id):
    """Worker disputes their rating."""
    user = get_authenticated_user()

    rating = db.session.get(WorkPlanJobRating, rating_id)
    if not rating:
        raise NotFoundError("Rating not found")

    if rating.user_id != user.id:
        raise ForbiddenError("You can only dispute your own ratings")

    if rating.is_disputed:
        raise BusinessError("Rating already disputed")

    data = request.get_json()
    if not data or not data.get('reason'):
        raise ValidationError("Dispute reason is required")

    rating.is_disputed = True
    rating.dispute_reason = data['reason']
    rating.dispute_filed_at = datetime.utcnow()

    create_log_entry(rating.work_plan_job_id, user.id, 'rating_disputed', {
        'rating_id': rating.id,
        'reason': data['reason']
    })

    # Notify admins
    admins = User.query.filter_by(role='admin', is_active=True).all()
    for admin in admins:
        NotificationService.create_notification(
            user_id=admin.id,
            type='rating_dispute',
            title='Rating Dispute',
            message=f'{user.full_name} disputed their rating for job #{rating.work_plan_job_id}',
            related_type='work_plan_job_rating',
            related_id=rating.id,
            priority='warning'
        )

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Dispute filed',
        'rating': rating.to_dict()
    }), 200


@bp.route('/ratings/<int:rating_id>/resolve-dispute', methods=['POST'])
@jwt_required()
def resolve_dispute(rating_id):
    """Admin resolves a rating dispute."""
    user = get_authenticated_user()
    if user.role != 'admin':
        raise ForbiddenError("Only admins can resolve disputes")

    rating = db.session.get(WorkPlanJobRating, rating_id)
    if not rating:
        raise NotFoundError("Rating not found")

    if not rating.is_disputed:
        raise BusinessError("Rating is not disputed")

    data = request.get_json()
    if not data or not data.get('resolution'):
        raise ValidationError("Resolution is required")

    rating.dispute_resolved = True
    rating.dispute_resolved_by_id = user.id
    rating.dispute_resolved_at = datetime.utcnow()
    rating.dispute_resolution = data['resolution']

    # Admin can adjust ratings as part of resolution
    if 'time_rating' in data:
        rating.time_rating = data['time_rating']
    if 'qc_rating' in data:
        rating.qc_rating = data['qc_rating']
    if 'cleaning_rating' in data:
        rating.cleaning_rating = data['cleaning_rating']

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Dispute resolved',
        'rating': rating.to_dict()
    }), 200


# ─── Performance & Reporting ───────────────────────────────────────

@bp.route('/performance', methods=['GET'])
@jwt_required()
def get_performance_report():
    """Get performance report for team or specific worker."""
    user = engineer_or_admin_required()

    period_type = request.args.get('period', 'daily')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    worker_id = request.args.get('worker_id', type=int)

    query = WorkPlanPerformance.query.filter_by(period_type=period_type)

    if worker_id:
        query = query.filter_by(user_id=worker_id)

    if start_date:
        try:
            query = query.filter(WorkPlanPerformance.period_start >= date.fromisoformat(start_date))
        except ValueError:
            raise ValidationError("Invalid start_date format")

    if end_date:
        try:
            query = query.filter(WorkPlanPerformance.period_end <= date.fromisoformat(end_date))
        except ValueError:
            raise ValidationError("Invalid end_date format")

    performances = query.order_by(
        WorkPlanPerformance.period_start.desc()
    ).all()

    return jsonify({
        'status': 'success',
        'performances': [p.to_dict() for p in performances],
        'count': len(performances)
    }), 200


@bp.route('/performance/compute', methods=['POST'])
@jwt_required()
def compute_performance():
    """Trigger performance computation for a date range. Admin/engineer only."""
    user = engineer_or_admin_required()

    data = request.get_json() or {}
    target_date = data.get('date')
    period = data.get('period', 'daily')

    if target_date:
        try:
            target_date = date.fromisoformat(target_date)
        except ValueError:
            raise ValidationError("Invalid date format")
    else:
        target_date = date.today()

    computed = _compute_daily_performance(target_date)

    return jsonify({
        'status': 'success',
        'message': f'Performance computed for {target_date.isoformat()}',
        'records_computed': computed
    }), 200


@bp.route('/performance/comparison', methods=['GET'])
@jwt_required()
def get_performance_comparison():
    """Compare workers' performance over a period."""
    user = engineer_or_admin_required()

    period_type = request.args.get('period', 'weekly')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if not start_date or not end_date:
        raise ValidationError("start_date and end_date are required")

    try:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
    except ValueError:
        raise ValidationError("Invalid date format")

    performances = WorkPlanPerformance.query.filter(
        WorkPlanPerformance.period_type == period_type,
        WorkPlanPerformance.period_start >= start,
        WorkPlanPerformance.period_end <= end
    ).all()

    # Group by user
    by_user = {}
    for p in performances:
        uid = p.user_id
        if uid not in by_user:
            by_user[uid] = {
                'user': p.to_dict()['user'],
                'periods': [],
                'totals': {
                    'jobs_assigned': 0,
                    'jobs_completed': 0,
                    'estimated_hours': 0,
                    'actual_hours': 0,
                    'points': 0,
                    'ratings': []
                }
            }
        by_user[uid]['periods'].append(p.to_dict())
        by_user[uid]['totals']['jobs_assigned'] += p.total_jobs_assigned
        by_user[uid]['totals']['jobs_completed'] += p.total_jobs_completed
        by_user[uid]['totals']['estimated_hours'] += float(p.total_estimated_hours or 0)
        by_user[uid]['totals']['actual_hours'] += float(p.total_actual_hours or 0)
        by_user[uid]['totals']['points'] += p.total_points_earned
        if p.avg_time_rating:
            by_user[uid]['totals']['ratings'].append(float(p.avg_time_rating))

    # Calculate averages
    for uid in by_user:
        totals = by_user[uid]['totals']
        ratings = totals.pop('ratings')
        totals['avg_time_rating'] = round(sum(ratings) / len(ratings), 1) if ratings else None
        totals['completion_rate'] = round(
            (totals['jobs_completed'] / totals['jobs_assigned'] * 100), 1
        ) if totals['jobs_assigned'] > 0 else 0

    return jsonify({
        'status': 'success',
        'comparison': list(by_user.values()),
        'period': {'start': start.isoformat(), 'end': end.isoformat(), 'type': period_type}
    }), 200


@bp.route('/performance/heat-map', methods=['GET'])
@jwt_required()
def get_heat_map():
    """Weekly heat map of worker performance (green/yellow/red per day)."""
    user = engineer_or_admin_required()

    week_start = request.args.get('week_start')
    if not week_start:
        # Default to current week Monday
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
    else:
        try:
            week_start = date.fromisoformat(week_start)
        except ValueError:
            raise ValidationError("Invalid week_start format")

    week_end = week_start + timedelta(days=6)

    performances = WorkPlanPerformance.query.filter(
        WorkPlanPerformance.period_type == 'daily',
        WorkPlanPerformance.period_start >= week_start,
        WorkPlanPerformance.period_end <= week_end
    ).all()

    # Build heat map: user -> day -> color
    heat_map = {}
    for p in performances:
        uid = p.user_id
        if uid not in heat_map:
            heat_map[uid] = {
                'user': p.to_dict()['user'],
                'days': {}
            }

        day_key = p.period_start.isoformat()
        rate = float(p.completion_rate) if p.completion_rate else 0

        # Green >= 90%, Yellow >= 70%, Red < 70%
        if rate >= 90:
            color = 'green'
        elif rate >= 70:
            color = 'yellow'
        else:
            color = 'red'

        heat_map[uid]['days'][day_key] = {
            'completion_rate': rate,
            'color': color,
            'jobs_completed': p.total_jobs_completed,
            'jobs_assigned': p.total_jobs_assigned,
            'avg_rating': float(p.avg_time_rating) if p.avg_time_rating else None
        }

    return jsonify({
        'status': 'success',
        'heat_map': list(heat_map.values()),
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat()
    }), 200


@bp.route('/streaks', methods=['GET'])
@jwt_required()
def get_streaks():
    """Get streak information for workers."""
    user = get_authenticated_user()
    worker_id = request.args.get('worker_id', type=int)

    if worker_id and user.role not in ['admin', 'engineer']:
        raise ForbiddenError("Only engineers and admins can view other workers' streaks")

    target_id = worker_id or user.id

    latest = WorkPlanPerformance.query.filter_by(
        user_id=target_id,
        period_type='daily'
    ).order_by(WorkPlanPerformance.period_start.desc()).first()

    return jsonify({
        'status': 'success',
        'user_id': target_id,
        'current_streak': latest.current_streak_days if latest else 0,
        'max_streak': latest.max_streak_days if latest else 0,
    }), 200


# ─── Auto-flag & Scheduled Tasks ──────────────────────────────────

@bp.route('/auto-flag', methods=['POST'])
@jwt_required()
def trigger_auto_flag():
    """Manually trigger auto-flag for a date (admin only). Usually runs via scheduler."""
    user = get_authenticated_user()
    if user.role != 'admin':
        raise ForbiddenError("Only admins can trigger auto-flag")

    data = request.get_json() or {}
    target_date = data.get('date')
    shift = data.get('shift', 'day')

    if target_date:
        try:
            target_date = date.fromisoformat(target_date)
        except ValueError:
            raise ValidationError("Invalid date format")
    else:
        target_date = date.today()

    flagged = _auto_flag_jobs(target_date, shift)

    return jsonify({
        'status': 'success',
        'message': f'Auto-flagged {flagged} jobs for {target_date.isoformat()} ({shift} shift)',
        'flagged_count': flagged
    }), 200


# ─── Internal Functions ────────────────────────────────────────────

def _auto_flag_jobs(target_date, shift_type):
    """Auto-flag unfinished/not-started jobs at end of shift."""
    jobs = db.session.query(WorkPlanJob).join(
        WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id
    ).filter(
        WorkPlanDay.date == target_date
    ).all()

    flagged = 0
    now = datetime.utcnow()

    for job in jobs:
        tracking = WorkPlanJobTracking.query.filter_by(work_plan_job_id=job.id).first()

        if not tracking:
            # Job was never started - create tracking as not_started
            tracking = WorkPlanJobTracking(
                work_plan_job_id=job.id,
                status='not_started',
                shift_type=shift_type,
                auto_flagged=True,
                auto_flagged_at=now,
                auto_flag_type='not_started'
            )
            db.session.add(tracking)
            flagged += 1
        elif tracking.status in ('in_progress', 'paused', 'pending'):
            # Job was not completed
            if tracking.status == 'paused' and tracking.paused_at:
                pause_duration = int((now - tracking.paused_at).total_seconds() / 60)
                tracking.total_paused_minutes = (tracking.total_paused_minutes or 0) + pause_duration

            tracking.status = 'incomplete'
            tracking.completed_at = now
            tracking.incomplete_reason_category = 'time_ran_out'
            tracking.incomplete_reason_details = 'Day ended - not completed (auto-flagged)'
            tracking.auto_flagged = True
            tracking.auto_flagged_at = now
            tracking.auto_flag_type = 'not_completed'

            if tracking.started_at:
                tracking.actual_hours = tracking.calculate_actual_hours()

            flagged += 1

    if flagged > 0:
        db.session.commit()

        # Notify engineers
        plans = WorkPlan.query.join(
            WorkPlanDay, WorkPlan.id == WorkPlanDay.work_plan_id
        ).filter(WorkPlanDay.date == target_date).all()

        for plan in plans:
            if plan.created_by_id:
                NotificationService.create_notification(
                    user_id=plan.created_by_id,
                    type='auto_flag_jobs',
                    title=f'{flagged} Jobs Need Attention',
                    message=f'{flagged} job(s) for {target_date.isoformat()} were auto-flagged at end of {shift_type} shift',
                    related_type='work_plan',
                    related_id=plan.id,
                    priority='urgent'
                )

    logger.info("Auto-flagged %d jobs for %s (%s shift)", flagged, target_date, shift_type)
    return flagged


def _compute_daily_performance(target_date):
    """Compute daily performance aggregates for all workers."""
    # Get all assignments for this date
    assignments = db.session.query(
        WorkPlanAssignment.user_id,
        WorkPlanJob.id.label('job_id'),
        WorkPlanJob.estimated_hours,
        WorkPlanAssignment.is_lead
    ).join(
        WorkPlanJob, WorkPlanAssignment.work_plan_job_id == WorkPlanJob.id
    ).join(
        WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id
    ).filter(
        WorkPlanDay.date == target_date
    ).all()

    # Group by user
    user_jobs = {}
    for a in assignments:
        if a.user_id not in user_jobs:
            user_jobs[a.user_id] = []
        user_jobs[a.user_id].append(a)

    computed = 0
    for user_id, jobs in user_jobs.items():
        total_assigned = len(jobs)
        total_completed = 0
        total_incomplete = 0
        total_not_started = 0
        total_carried_over = 0
        total_estimated = Decimal('0')
        total_actual = Decimal('0')
        time_ratings = []
        qc_ratings = []
        cleaning_ratings = []
        total_points = 0
        total_pauses = 0
        total_pause_minutes = 0

        for job_info in jobs:
            tracking = WorkPlanJobTracking.query.filter_by(work_plan_job_id=job_info.job_id).first()
            rating = WorkPlanJobRating.query.filter_by(
                work_plan_job_id=job_info.job_id,
                user_id=user_id
            ).first()

            if tracking:
                if tracking.status == 'completed':
                    total_completed += 1
                elif tracking.status == 'incomplete':
                    total_incomplete += 1
                elif tracking.status in ('not_started', 'pending'):
                    total_not_started += 1

                if tracking.is_carry_over:
                    total_carried_over += 1
                if tracking.actual_hours:
                    total_actual += Decimal(str(tracking.actual_hours))
                total_pause_minutes += tracking.total_paused_minutes or 0

            if job_info.estimated_hours:
                total_estimated += Decimal(str(job_info.estimated_hours))

            if rating:
                total_points += rating.points_earned or 0
                if rating.effective_time_rating:
                    time_ratings.append(float(rating.effective_time_rating))
                if rating.qc_rating:
                    qc_ratings.append(float(rating.qc_rating))
                if rating.cleaning_rating is not None:
                    cleaning_ratings.append(rating.cleaning_rating)

            # Count pauses
            pause_count = WorkPlanPauseRequest.query.filter_by(
                work_plan_job_id=job_info.job_id,
                requested_by_id=user_id
            ).count()
            total_pauses += pause_count

        completion_rate = (total_completed / total_assigned * 100) if total_assigned > 0 else 0

        # Get previous streak
        prev_perf = WorkPlanPerformance.query.filter_by(
            user_id=user_id,
            period_type='daily'
        ).filter(
            WorkPlanPerformance.period_start < target_date
        ).order_by(WorkPlanPerformance.period_start.desc()).first()

        prev_streak = prev_perf.current_streak_days if prev_perf else 0
        prev_max = prev_perf.max_streak_days if prev_perf else 0

        # Update streak: 100% completion = streak continues
        if completion_rate >= 100 and total_assigned > 0:
            current_streak = prev_streak + 1
        else:
            current_streak = 0

        max_streak = max(prev_max, current_streak)

        # Check for streak milestone notification
        if current_streak in (5, 10, 20, 30, 50, 100):
            NotificationService.create_notification(
                user_id=user_id,
                type='streak_milestone',
                title=f'{current_streak}-Day Streak!',
                message=f'Great work! You have completed all assigned jobs for {current_streak} consecutive days.',
                priority='info'
            )

        # Upsert performance record
        perf = WorkPlanPerformance.query.filter_by(
            user_id=user_id,
            period_type='daily',
            period_start=target_date
        ).first()

        if not perf:
            perf = WorkPlanPerformance(
                user_id=user_id,
                period_type='daily',
                period_start=target_date,
                period_end=target_date
            )
            db.session.add(perf)

        perf.total_jobs_assigned = total_assigned
        perf.total_jobs_completed = total_completed
        perf.total_jobs_incomplete = total_incomplete
        perf.total_jobs_not_started = total_not_started
        perf.total_jobs_carried_over = total_carried_over
        perf.total_estimated_hours = total_estimated
        perf.total_actual_hours = total_actual
        perf.avg_time_rating = round(sum(time_ratings) / len(time_ratings), 1) if time_ratings else None
        perf.avg_qc_rating = round(sum(qc_ratings) / len(qc_ratings), 1) if qc_ratings else None
        perf.avg_cleaning_rating = round(sum(cleaning_ratings) / len(cleaning_ratings), 1) if cleaning_ratings else None
        perf.completion_rate = round(Decimal(str(completion_rate)), 2)
        perf.total_points_earned = total_points
        perf.current_streak_days = current_streak
        perf.max_streak_days = max_streak
        perf.total_pauses = total_pauses
        perf.total_pause_minutes = total_pause_minutes

        computed += 1

    db.session.commit()
    return computed
