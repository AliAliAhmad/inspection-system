"""
Unplanned Jobs API.
Allows inspectors and specialists to log ad-hoc work that was not
part of their daily work plan.  No approval workflow -- purely a log
so engineers and admins have visibility into off-plan activities.
"""

from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db, safe_commit
from app.models import User
from app.models.unplanned_job import UnplannedJob
from app.utils.decorators import get_current_user
from app.services.notification_service import NotificationService
import logging

logger = logging.getLogger(__name__)

bp = Blueprint('unplanned_jobs', __name__)

VALID_JOB_TYPES = ('assist_team', 'requested_job')


# ─── POST /api/unplanned-jobs ─────────────────────────────────────

@bp.route('', methods=['POST'])
@jwt_required()
def create_unplanned_job():
    """
    Log an unplanned job.

    Request Body (JSON):
        {
            "equipment_name": "Crane #7",          // required
            "description": "Hydraulic leak found",  // required
            "work_done": "Replaced seal, tested",   // required
            "job_type": "assist_team",              // optional, default 'requested_job'
            "requested_by": "Ahmed (Shift Lead)",   // optional
            "voice_note_url": "https://..."         // optional
        }

    Returns 201 with the created record.
    """
    current_user = get_current_user()
    data = request.get_json()

    if not data:
        return jsonify({'status': 'error', 'message': 'Request body is required'}), 400

    # ── Validate required fields ──────────────────────────────────
    errors = []
    for field in ('equipment_name', 'description', 'work_done'):
        if not data.get(field, '').strip():
            errors.append(f'{field} is required')
    if errors:
        return jsonify({'status': 'error', 'message': ', '.join(errors)}), 400

    # ── Validate job_type ─────────────────────────────────────────
    job_type = data.get('job_type', 'requested_job')
    if job_type not in VALID_JOB_TYPES:
        return jsonify({
            'status': 'error',
            'message': f"job_type must be one of: {', '.join(VALID_JOB_TYPES)}"
        }), 400

    # ── Create record ─────────────────────────────────────────────
    job = UnplannedJob(
        user_id=current_user.id,
        equipment_name=data['equipment_name'].strip(),
        description=data['description'].strip(),
        work_done=data['work_done'].strip(),
        job_type=job_type,
        requested_by=data.get('requested_by', '').strip() or None,
        voice_note_url=data.get('voice_note_url', '').strip() or None,
    )
    db.session.add(job)
    safe_commit()

    # ── Notify engineers and admins ───────────────────────────────
    _notify_about_unplanned_job(job, current_user)

    logger.info(
        "Unplanned job #%s logged by user %s (%s) — %s",
        job.id, current_user.id, current_user.full_name, job.job_type,
    )

    return jsonify({
        'status': 'success',
        'message': 'Unplanned job logged successfully',
        'data': job.to_dict(),
    }), 201


# ─── GET /api/unplanned-jobs ──────────────────────────────────────

@bp.route('', methods=['GET'])
@jwt_required()
def list_unplanned_jobs():
    """
    List unplanned jobs.

    Query params:
        user_id   - filter by user (admin/engineer only)
        job_type  - 'assist_team' or 'requested_job'
        date      - ISO date string (YYYY-MM-DD) to filter by created date
        page      - page number (default 1)
        per_page  - items per page (default 20, max 100)

    Workers see only their own entries unless they are admin/engineer.
    """
    current_user = get_current_user()

    query = UnplannedJob.query

    # Role-based filtering: workers only see their own
    if current_user.role not in ('admin', 'engineer', 'quality_engineer'):
        query = query.filter(UnplannedJob.user_id == current_user.id)
    else:
        # Admin / engineer may filter by user
        user_id = request.args.get('user_id', type=int)
        if user_id:
            query = query.filter(UnplannedJob.user_id == user_id)

    # Optional filters
    job_type = request.args.get('job_type')
    if job_type and job_type in VALID_JOB_TYPES:
        query = query.filter(UnplannedJob.job_type == job_type)

    date_filter = request.args.get('date')
    if date_filter:
        try:
            from datetime import date as date_type
            target = date_type.fromisoformat(date_filter)
            query = query.filter(db.func.date(UnplannedJob.created_at) == target)
        except ValueError:
            return jsonify({'status': 'error', 'message': 'Invalid date format. Use YYYY-MM-DD'}), 400

    # Pagination
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)

    pagination = query.order_by(UnplannedJob.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    return jsonify({
        'status': 'success',
        'data': [j.to_dict() for j in pagination.items],
        'pagination': {
            'page': pagination.page,
            'per_page': pagination.per_page,
            'total': pagination.total,
            'pages': pagination.pages,
        },
    }), 200


# ─── GET /api/unplanned-jobs/<id> ────────────────────────────────

@bp.route('/<int:job_id>', methods=['GET'])
@jwt_required()
def get_unplanned_job(job_id):
    """Get a single unplanned job by ID."""
    current_user = get_current_user()

    job = db.session.get(UnplannedJob, job_id)
    if not job:
        return jsonify({'status': 'error', 'message': 'Unplanned job not found'}), 404

    # Workers can only view their own
    if current_user.role not in ('admin', 'engineer', 'quality_engineer') and job.user_id != current_user.id:
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    return jsonify({
        'status': 'success',
        'data': job.to_dict(),
    }), 200


# ─── Internal helpers ─────────────────────────────────────────────

def _notify_about_unplanned_job(job, reporter):
    """Notify engineers and admins about the unplanned work."""
    type_label = 'Team Assist' if job.job_type == 'assist_team' else 'Requested Job'

    # Notify all active admins and engineers
    recipients = User.query.filter(
        User.is_active == True,
        User.role.in_(['admin', 'engineer']),
        User.id != reporter.id,
    ).all()

    for user in recipients:
        NotificationService.create_notification(
            user_id=user.id,
            type='unplanned_job_logged',
            title=f'Unplanned Work: {type_label}',
            message=(
                f'{reporter.full_name} logged unplanned work on {job.equipment_name}: '
                f'{job.description[:80]}'
            ),
            related_type='unplanned_job',
            related_id=job.id,
            priority='info',
        )
