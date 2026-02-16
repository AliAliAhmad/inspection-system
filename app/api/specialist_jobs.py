"""
Specialist Job Routes
Handles the specialist job workflow with planned time requirement,
pause/resume, incomplete completion, admin timer control, and cleaning.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db, safe_commit
from app.models import SpecialistJob, Defect, User, PauseLog, QualityReview
from app.services.pause_service import PauseService
from app.services.takeover_service import TakeoverService
from app.utils.decorators import get_current_user, admin_required, role_required, get_language
from app.utils.pagination import paginate
from datetime import datetime, date, timedelta
from sqlalchemy import func, and_, or_

bp = Blueprint('specialist_jobs', __name__)


# ============================================
# STATS & ANALYTICS
# ============================================

@bp.route('/my-stats', methods=['GET'])
@jwt_required()
def get_my_stats():
    """
    Get personal stats for the current specialist.
    Returns: today, week, month stats, averages, ratings.
    """
    user_id = get_jwt_identity()
    today = date.today()
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    # Today's start/end
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())

    # Today's stats
    today_pending = SpecialistJob.query.filter(
        SpecialistJob.specialist_id == int(user_id),
        SpecialistJob.planned_time_hours.is_(None)
    ).count()

    today_assigned = SpecialistJob.query.filter(
        SpecialistJob.specialist_id == int(user_id),
        SpecialistJob.status == 'assigned',
        SpecialistJob.planned_time_hours.isnot(None)
    ).count()

    today_in_progress = SpecialistJob.query.filter(
        SpecialistJob.specialist_id == int(user_id),
        SpecialistJob.status == 'in_progress'
    ).count()

    today_completed = SpecialistJob.query.filter(
        SpecialistJob.specialist_id == int(user_id),
        SpecialistJob.completed_at >= today_start,
        SpecialistJob.completed_at <= today_end,
        SpecialistJob.status.in_(['completed', 'qc_approved'])
    ).count()

    today_paused = SpecialistJob.query.filter(
        SpecialistJob.specialist_id == int(user_id),
        SpecialistJob.status == 'paused'
    ).count()

    # This week stats
    week_start = today - timedelta(days=today.weekday())
    week_completed = SpecialistJob.query.filter(
        SpecialistJob.specialist_id == int(user_id),
        SpecialistJob.completed_at >= datetime.combine(week_start, datetime.min.time()),
        SpecialistJob.status.in_(['completed', 'qc_approved'])
    ).count()

    week_total = SpecialistJob.query.filter(
        SpecialistJob.specialist_id == int(user_id),
        SpecialistJob.created_at >= datetime.combine(week_start, datetime.min.time())
    ).count()

    # This month stats
    month_start = today.replace(day=1)
    month_completed = SpecialistJob.query.filter(
        SpecialistJob.specialist_id == int(user_id),
        SpecialistJob.completed_at >= datetime.combine(month_start, datetime.min.time()),
        SpecialistJob.status.in_(['completed', 'qc_approved'])
    ).count()

    month_total = SpecialistJob.query.filter(
        SpecialistJob.specialist_id == int(user_id),
        SpecialistJob.created_at >= datetime.combine(month_start, datetime.min.time())
    ).count()

    # Average completion time (hours) - last 30 days
    my_completed_jobs = SpecialistJob.query.filter(
        SpecialistJob.specialist_id == int(user_id),
        SpecialistJob.completed_at >= datetime.combine(month_ago, datetime.min.time()),
        SpecialistJob.actual_time_hours.isnot(None)
    ).all()

    avg_time = 0
    if my_completed_jobs:
        total_time = sum(j.actual_time_hours for j in my_completed_jobs if j.actual_time_hours)
        avg_time = round(total_time / len(my_completed_jobs), 1) if my_completed_jobs else 0

    # Average ratings
    my_rated_jobs = SpecialistJob.query.filter(
        SpecialistJob.specialist_id == int(user_id),
        SpecialistJob.time_rating.isnot(None)
    ).all()

    avg_time_rating = 0
    avg_qc_rating = 0
    avg_cleaning_rating = 0

    if my_rated_jobs:
        time_ratings = [j.time_rating for j in my_rated_jobs if j.time_rating is not None]
        qc_ratings = [j.qc_rating for j in my_rated_jobs if j.qc_rating is not None]
        cleaning_ratings = [j.cleaning_rating for j in my_rated_jobs if j.cleaning_rating is not None]

        avg_time_rating = round(sum(time_ratings) / len(time_ratings), 1) if time_ratings else 0
        avg_qc_rating = round(sum(qc_ratings) / len(qc_ratings), 1) if qc_ratings else 0
        avg_cleaning_rating = round(sum(cleaning_ratings) / len(cleaning_ratings), 1) if cleaning_ratings else 0

    # Total points earned
    total_points = sum(
        (j.time_rating or 0) + (j.qc_rating or 0) + (j.cleaning_rating or 0) + (j.admin_bonus or 0)
        for j in my_rated_jobs
    )

    # Incomplete count
    incomplete_count = SpecialistJob.query.filter(
        SpecialistJob.specialist_id == int(user_id),
        SpecialistJob.status == 'incomplete'
    ).count()

    # Daily trend (last 7 days)
    daily_trend = []
    for i in range(7):
        d = today - timedelta(days=i)
        d_start = datetime.combine(d, datetime.min.time())
        d_end = datetime.combine(d, datetime.max.time())

        day_completed = SpecialistJob.query.filter(
            SpecialistJob.specialist_id == int(user_id),
            SpecialistJob.completed_at >= d_start,
            SpecialistJob.completed_at <= d_end
        ).count()

        daily_trend.append({
            'date': d.isoformat(),
            'day_name': d.strftime('%a'),
            'completed': day_completed
        })

    daily_trend.reverse()

    return jsonify({
        'status': 'success',
        'data': {
            'today': {
                'pending_time': today_pending,
                'assigned': today_assigned,
                'in_progress': today_in_progress,
                'completed': today_completed,
                'paused': today_paused
            },
            'week': {
                'completed': week_completed,
                'total': week_total
            },
            'month': {
                'completed': month_completed,
                'total': month_total
            },
            'averages': {
                'completion_time_hours': avg_time,
                'time_rating': avg_time_rating,
                'qc_rating': avg_qc_rating,
                'cleaning_rating': avg_cleaning_rating
            },
            'total_points': total_points,
            'incomplete_count': incomplete_count,
            'daily_trend': daily_trend
        }
    }), 200


@bp.route('/stats', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_specialist_job_stats():
    """
    Get comprehensive specialist job statistics for admin dashboard.
    Returns counts by status, trends, performance metrics, top performers.
    """
    today = date.today()
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    # Overall counts by status
    status_counts = db.session.query(
        SpecialistJob.status,
        func.count(SpecialistJob.id)
    ).group_by(SpecialistJob.status).all()
    by_status = {status: count for status, count in status_counts}

    # Today's stats
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())

    today_assigned = SpecialistJob.query.filter(
        SpecialistJob.created_at >= today_start,
        SpecialistJob.created_at <= today_end
    ).count()

    today_completed = SpecialistJob.query.filter(
        SpecialistJob.completed_at >= today_start,
        SpecialistJob.completed_at <= today_end
    ).count()

    today_in_progress = SpecialistJob.query.filter(
        SpecialistJob.status == 'in_progress'
    ).count()

    # Active counts (current state)
    active_total = SpecialistJob.query.filter(
        SpecialistJob.status.in_(['assigned', 'in_progress', 'paused'])
    ).count()

    assigned_count = by_status.get('assigned', 0)
    in_progress_count = by_status.get('in_progress', 0)
    paused_count = by_status.get('paused', 0)
    incomplete_count = by_status.get('incomplete', 0)

    # Incomplete needing acknowledgment
    incomplete_unack = SpecialistJob.query.filter(
        SpecialistJob.status == 'incomplete',
        SpecialistJob.incomplete_acknowledged_by.is_(None)
    ).count()

    # This week stats
    week_start = today - timedelta(days=today.weekday())
    week_completed = SpecialistJob.query.filter(
        SpecialistJob.completed_at >= datetime.combine(week_start, datetime.min.time()),
        SpecialistJob.status.in_(['completed', 'qc_approved'])
    ).count()

    week_total = SpecialistJob.query.filter(
        SpecialistJob.created_at >= datetime.combine(week_start, datetime.min.time())
    ).count()

    # This month stats
    month_start = today.replace(day=1)
    month_completed = SpecialistJob.query.filter(
        SpecialistJob.completed_at >= datetime.combine(month_start, datetime.min.time()),
        SpecialistJob.status.in_(['completed', 'qc_approved'])
    ).count()

    # Average completion time (hours) - last 30 days
    completed_jobs = SpecialistJob.query.filter(
        SpecialistJob.completed_at >= datetime.combine(month_ago, datetime.min.time()),
        SpecialistJob.actual_time_hours.isnot(None)
    ).all()

    avg_time = 0
    if completed_jobs:
        total_time = sum(j.actual_time_hours for j in completed_jobs if j.actual_time_hours)
        avg_time = round(total_time / len(completed_jobs), 1) if completed_jobs else 0

    # Average ratings
    rated_jobs = SpecialistJob.query.filter(
        SpecialistJob.time_rating.isnot(None)
    ).all()

    avg_time_rating = 0
    avg_qc_rating = 0
    avg_cleaning_rating = 0

    if rated_jobs:
        time_ratings = [j.time_rating for j in rated_jobs if j.time_rating is not None]
        qc_ratings = [j.qc_rating for j in rated_jobs if j.qc_rating is not None]
        cleaning_ratings = [j.cleaning_rating for j in rated_jobs if j.cleaning_rating is not None]

        avg_time_rating = round(sum(time_ratings) / len(time_ratings), 1) if time_ratings else 0
        avg_qc_rating = round(sum(qc_ratings) / len(qc_ratings), 1) if qc_ratings else 0
        avg_cleaning_rating = round(sum(cleaning_ratings) / len(cleaning_ratings), 1) if cleaning_ratings else 0

    # Pending QC reviews
    pending_qc = QualityReview.query.filter(
        QualityReview.job_type == 'specialist',
        QualityReview.status == 'pending'
    ).count()

    # By category breakdown
    category_counts = db.session.query(
        SpecialistJob.category,
        func.count(SpecialistJob.id)
    ).filter(
        SpecialistJob.status.in_(['assigned', 'in_progress', 'paused'])
    ).group_by(SpecialistJob.category).all()
    by_category = {cat or 'unspecified': count for cat, count in category_counts}

    # Top performers (specialists with most completed jobs this month)
    top_performers = db.session.query(
        User.id,
        User.full_name,
        func.count(SpecialistJob.id).label('completed_count'),
        func.avg(SpecialistJob.time_rating).label('avg_rating')
    ).join(SpecialistJob, SpecialistJob.specialist_id == User.id).filter(
        SpecialistJob.completed_at >= datetime.combine(month_start, datetime.min.time()),
        SpecialistJob.status.in_(['completed', 'qc_approved'])
    ).group_by(User.id, User.full_name).order_by(
        func.count(SpecialistJob.id).desc()
    ).limit(5).all()

    performers_list = [
        {
            'id': uid,
            'name': name,
            'completed': count,
            'avg_rating': round(float(rating), 1) if rating else 0
        }
        for uid, name, count, rating in top_performers
    ]

    # Specialist workload (active jobs per specialist)
    workload = db.session.query(
        User.id,
        User.full_name,
        func.count(SpecialistJob.id).label('active_count')
    ).join(SpecialistJob, SpecialistJob.specialist_id == User.id).filter(
        SpecialistJob.status.in_(['assigned', 'in_progress', 'paused']),
        User.is_active == True
    ).group_by(User.id, User.full_name).order_by(
        func.count(SpecialistJob.id).desc()
    ).limit(10).all()

    workload_list = [
        {'id': uid, 'name': name, 'active_jobs': count}
        for uid, name, count in workload
    ]

    # Daily trend (last 7 days)
    daily_trend = []
    for i in range(7):
        d = today - timedelta(days=i)
        d_start = datetime.combine(d, datetime.min.time())
        d_end = datetime.combine(d, datetime.max.time())

        day_created = SpecialistJob.query.filter(
            SpecialistJob.created_at >= d_start,
            SpecialistJob.created_at <= d_end
        ).count()

        day_completed = SpecialistJob.query.filter(
            SpecialistJob.completed_at >= d_start,
            SpecialistJob.completed_at <= d_end
        ).count()

        daily_trend.append({
            'date': d.isoformat(),
            'day_name': d.strftime('%a'),
            'created': day_created,
            'completed': day_completed
        })

    daily_trend.reverse()  # Oldest first

    # Overdue jobs (started > 24h ago, not completed)
    overdue_threshold = datetime.utcnow() - timedelta(hours=24)
    overdue_count = SpecialistJob.query.filter(
        SpecialistJob.started_at < overdue_threshold,
        SpecialistJob.status.in_(['in_progress', 'paused'])
    ).count()

    return jsonify({
        'status': 'success',
        'data': {
            'by_status': by_status,
            'today': {
                'assigned': today_assigned,
                'completed': today_completed,
                'in_progress': today_in_progress
            },
            'active': {
                'total': active_total,
                'assigned': assigned_count,
                'in_progress': in_progress_count,
                'paused': paused_count
            },
            'incomplete': {
                'total': incomplete_count,
                'unacknowledged': incomplete_unack
            },
            'week': {
                'completed': week_completed,
                'total': week_total
            },
            'month': {
                'completed': month_completed
            },
            'averages': {
                'completion_time_hours': avg_time,
                'time_rating': avg_time_rating,
                'qc_rating': avg_qc_rating,
                'cleaning_rating': avg_cleaning_rating
            },
            'pending_qc': pending_qc,
            'overdue_count': overdue_count,
            'by_category': by_category,
            'top_performers': performers_list,
            'specialist_workload': workload_list,
            'daily_trend': daily_trend
        }
    }), 200


# ============================================
# AI-POWERED TIME ESTIMATION
# ============================================

@bp.route('/ai-estimate-time', methods=['POST'])
@jwt_required()
def ai_estimate_time():
    """
    AI-powered time estimation based on similar past jobs.
    Uses defect type, equipment type, and category to find similar jobs.
    """
    data = request.get_json()
    job_id = data.get('job_id')
    defect_id = data.get('defect_id')

    if not job_id and not defect_id:
        return jsonify({
            'status': 'error',
            'message': 'job_id or defect_id is required'
        }), 400

    # Get job or defect info
    job = None
    defect = None

    if job_id:
        job = db.session.get(SpecialistJob, job_id)
        if job and job.defect_id:
            defect = job.defect
    elif defect_id:
        defect = db.session.get(Defect, defect_id)

    if not defect:
        return jsonify({
            'status': 'error',
            'message': 'Could not find defect information'
        }), 404

    # Find similar completed jobs
    equipment = defect.inspection.equipment if defect.inspection else None
    equipment_type = equipment.equipment_type if equipment else None
    category = job.category if job else (defect.severity if defect.severity in ['major', 'minor'] else 'minor')

    # Build similarity query
    similar_query = SpecialistJob.query.filter(
        SpecialistJob.status.in_(['completed', 'qc_approved']),
        SpecialistJob.actual_time_hours.isnot(None),
        SpecialistJob.actual_time_hours > 0
    )

    # Filter by category if available
    if category:
        similar_query = similar_query.filter(SpecialistJob.category == category)

    # Filter by equipment type if available
    if equipment_type:
        similar_query = similar_query.join(
            Defect, SpecialistJob.defect_id == Defect.id
        ).join(
            Defect.inspection
        ).filter(
            Defect.inspection.has(equipment=equipment)
        )

    similar_jobs = similar_query.order_by(
        SpecialistJob.completed_at.desc()
    ).limit(20).all()

    if not similar_jobs:
        # Fallback: get any completed jobs with same category
        similar_jobs = SpecialistJob.query.filter(
            SpecialistJob.status.in_(['completed', 'qc_approved']),
            SpecialistJob.actual_time_hours.isnot(None),
            SpecialistJob.category == category
        ).limit(10).all()

    if not similar_jobs:
        # Default estimates by category
        default_estimates = {
            'major': 4.0,
            'minor': 2.0
        }
        estimated_hours = default_estimates.get(category, 3.0)
        confidence = 'low'
        sample_size = 0
    else:
        # Calculate statistics
        times = [j.actual_time_hours for j in similar_jobs]
        estimated_hours = round(sum(times) / len(times), 1)
        sample_size = len(times)

        # Calculate confidence based on sample size and variance
        if sample_size >= 10:
            confidence = 'high'
        elif sample_size >= 5:
            confidence = 'medium'
        else:
            confidence = 'low'

        # Adjust for variance
        if sample_size > 1:
            variance = sum((t - estimated_hours) ** 2 for t in times) / len(times)
            std_dev = variance ** 0.5
            if std_dev > estimated_hours * 0.5:
                confidence = 'low' if confidence == 'medium' else confidence

    # Get min/max range
    min_time = min(times) if similar_jobs else estimated_hours * 0.5
    max_time = max(times) if similar_jobs else estimated_hours * 1.5

    return jsonify({
        'status': 'success',
        'data': {
            'estimated_hours': estimated_hours,
            'confidence': confidence,
            'range': {
                'min': round(min_time, 1),
                'max': round(max_time, 1)
            },
            'based_on': {
                'sample_size': sample_size,
                'category': category,
                'equipment_type': equipment_type
            },
            'suggestions': [
                {'hours': round(estimated_hours * 0.75, 1), 'label': 'Optimistic'},
                {'hours': estimated_hours, 'label': 'Average'},
                {'hours': round(estimated_hours * 1.25, 1), 'label': 'Conservative'}
            ]
        }
    }), 200


@bp.route('/ai-predict-parts', methods=['POST'])
@jwt_required()
def ai_predict_parts():
    """
    AI-powered parts prediction based on similar past jobs.
    Analyzes what materials/parts were commonly used for similar repairs.
    """
    data = request.get_json()
    job_id = data.get('job_id')
    defect_id = data.get('defect_id')

    if not job_id and not defect_id:
        return jsonify({
            'status': 'error',
            'message': 'job_id or defect_id is required'
        }), 400

    # Get job or defect info
    job = None
    defect = None

    if job_id:
        job = db.session.get(SpecialistJob, job_id)
        if job and job.defect_id:
            defect = job.defect
    elif defect_id:
        defect = db.session.get(Defect, defect_id)

    if not defect:
        return jsonify({
            'status': 'error',
            'message': 'Could not find defect information'
        }), 404

    # Get equipment info
    equipment = defect.inspection.equipment if defect.inspection else None
    equipment_type = equipment.equipment_type if equipment else None
    category = job.category if job else (defect.severity if defect.severity in ['major', 'minor'] else 'minor')

    # Find similar completed jobs with work notes
    similar_query = SpecialistJob.query.filter(
        SpecialistJob.status.in_(['completed', 'qc_approved']),
        SpecialistJob.work_notes.isnot(None),
        SpecialistJob.work_notes != ''
    )

    if category:
        similar_query = similar_query.filter(SpecialistJob.category == category)

    similar_jobs = similar_query.order_by(
        SpecialistJob.completed_at.desc()
    ).limit(30).all()

    # Extract common parts/materials from work notes using keyword analysis
    parts_keywords = [
        'filter', 'oil', 'gasket', 'bearing', 'seal', 'belt', 'pump', 'valve',
        'hose', 'clamp', 'bolt', 'nut', 'washer', 'o-ring', 'lubricant',
        'grease', 'coolant', 'fuse', 'relay', 'switch', 'sensor', 'motor',
        'compressor', 'fan', 'blade', 'coupling', 'shaft', 'gear', 'chain',
        'sprocket', 'brake', 'pad', 'cylinder', 'piston', 'ring', 'liner'
    ]

    parts_count = {}
    for job_item in similar_jobs:
        notes = (job_item.work_notes or '').lower()
        for part in parts_keywords:
            if part in notes:
                parts_count[part] = parts_count.get(part, 0) + 1

    # Sort by frequency and get top parts
    sorted_parts = sorted(parts_count.items(), key=lambda x: x[1], reverse=True)

    # Build predictions with confidence
    predictions = []
    total_jobs = len(similar_jobs)

    for part, count in sorted_parts[:10]:
        frequency = count / total_jobs if total_jobs > 0 else 0
        confidence = 'high' if frequency > 0.5 else 'medium' if frequency > 0.25 else 'low'
        predictions.append({
            'part_name': part.title(),
            'frequency_percent': round(frequency * 100, 0),
            'confidence': confidence,
            'used_in_jobs': count
        })

    # Default parts based on category if no data
    if not predictions:
        if category == 'major':
            predictions = [
                {'part_name': 'Gasket Set', 'frequency_percent': 80, 'confidence': 'medium', 'used_in_jobs': 0},
                {'part_name': 'Seal Kit', 'frequency_percent': 70, 'confidence': 'medium', 'used_in_jobs': 0},
                {'part_name': 'Lubricant', 'frequency_percent': 60, 'confidence': 'medium', 'used_in_jobs': 0},
            ]
        else:
            predictions = [
                {'part_name': 'Oil Filter', 'frequency_percent': 50, 'confidence': 'low', 'used_in_jobs': 0},
                {'part_name': 'Lubricant', 'frequency_percent': 40, 'confidence': 'low', 'used_in_jobs': 0},
            ]

    return jsonify({
        'status': 'success',
        'data': {
            'predictions': predictions,
            'based_on': {
                'sample_size': total_jobs,
                'category': category,
                'equipment_type': equipment_type
            },
            'note': 'AI prediction based on similar past jobs. Verify with actual requirements.'
        }
    }), 200


@bp.route('', methods=['GET'])
@jwt_required()
def get_jobs():
    """Get all jobs for current specialist."""
    user = get_current_user()

    if user.role == 'admin':
        query = SpecialistJob.query
    else:
        query = SpecialistJob.query.filter_by(specialist_id=user.id)

    # Filter by status if provided (supports comma-separated values)
    status_param = request.args.get('status')
    if status_param:
        statuses = [s.strip() for s in status_param.split(',') if s.strip()]
        if statuses:
            query = query.filter(SpecialistJob.status.in_(statuses))

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

    # Auto-notification: take show-up photo + record challenges
    from app.api.job_showup import send_job_start_notification
    send_job_start_notification('specialist', job.id, job.specialist_id)

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
    """
    Mark job as incomplete with reason.

    Request Body:
        {
            "reason": "no_spare_parts",     // required: predefined reason code
            "notes": "Optional details..."  // optional: additional notes from specialist
        }

    Predefined reasons: no_spare_parts, waiting_for_approval, equipment_in_use,
                       safety_concern, need_assistance, other
    """
    user_id = get_jwt_identity()
    job = SpecialistJob.query.get_or_404(job_id)

    if job.specialist_id != int(user_id):
        return jsonify({'status': 'error', 'message': 'This job is not assigned to you'}), 403
    if not job.started_at:
        return jsonify({'status': 'error', 'message': 'Job must be started first'}), 400

    data = request.get_json()
    reason = data.get('reason')
    notes = data.get('notes', '').strip()

    valid_reasons = [
        'no_spare_parts', 'waiting_for_approval', 'equipment_in_use',
        'safety_concern', 'need_assistance', 'other'
    ]
    if not reason or reason not in valid_reasons:
        return jsonify({
            'status': 'error',
            'message': f'Invalid reason. Must be one of: {", ".join(valid_reasons)}'
        }), 400

    job.status = 'incomplete'
    job.completion_status = 'incomplete'
    job.incomplete_reason = reason
    job.incomplete_notes = notes if notes else None
    job.incomplete_at = datetime.utcnow()
    safe_commit()

    # Auto-translate incomplete notes if provided
    from app.utils.bilingual import auto_translate_and_save
    if notes:
        auto_translate_and_save('specialist_job', job.id, {'incomplete_notes': notes})

    # Notify admins
    from app.services.notification_service import NotificationService
    admins = User.query.filter_by(role='admin', is_active=True).all()
    reason_display = reason.replace('_', ' ').title()
    for admin in admins:
        NotificationService.create_notification(
            user_id=admin.id,
            type='job_incomplete',
            title='Specialist Job Marked Incomplete',
            message=f'Job {job.job_id} marked incomplete: {reason_display}. Needs acknowledgment.',
            related_type='specialist_job',
            related_id=job.id,
            priority='warning'
        )

    return jsonify({
        'status': 'success',
        'message': 'Job marked as incomplete. Admin acknowledgment required.',
        'data': job.to_dict(include_details=True)
    }), 200


@bp.route('/<int:job_id>/admin/acknowledge-incomplete', methods=['POST'])
@jwt_required()
@admin_required()
def admin_acknowledge_incomplete(job_id):
    """
    Admin acknowledges an incomplete job, confirming they've reviewed it.

    Request Body (optional):
        {
            "notes": "Will order parts tomorrow"
        }
    """
    user = get_current_user()
    job = SpecialistJob.query.get_or_404(job_id)

    if job.status != 'incomplete':
        return jsonify({'status': 'error', 'message': 'Job is not marked incomplete'}), 400

    if job.incomplete_acknowledged_by:
        return jsonify({
            'status': 'error',
            'message': f'Already acknowledged by {job.incomplete_acknowledger.full_name if job.incomplete_acknowledger else "admin"}'
        }), 400

    job.incomplete_acknowledged_by = user.id
    job.incomplete_acknowledged_at = datetime.utcnow()
    safe_commit()

    # Notify the specialist
    from app.services.notification_service import NotificationService
    NotificationService.create_notification(
        user_id=job.specialist_id,
        type='incomplete_acknowledged',
        title='Incomplete Job Acknowledged',
        message=f'Job {job.job_id} incomplete status acknowledged by {user.full_name}.',
        related_type='specialist_job',
        related_id=job.id,
    )

    return jsonify({
        'status': 'success',
        'message': 'Incomplete job acknowledged',
        'data': job.to_dict(include_details=True)
    }), 200


@bp.route('/incomplete', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_incomplete_jobs():
    """Get all incomplete jobs, optionally filtered by acknowledgment status."""
    acknowledged = request.args.get('acknowledged')

    query = SpecialistJob.query.filter_by(status='incomplete')

    if acknowledged == 'true':
        query = query.filter(SpecialistJob.incomplete_acknowledged_by.isnot(None))
    elif acknowledged == 'false':
        query = query.filter(SpecialistJob.incomplete_acknowledged_by.is_(None))

    query = query.order_by(SpecialistJob.incomplete_at.desc())
    jobs = query.all()

    return jsonify({
        'status': 'success',
        'data': [job.to_dict(include_details=True) for job in jobs]
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
