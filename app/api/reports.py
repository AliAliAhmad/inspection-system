"""
Dashboard and reporting endpoints.
Role-based dashboards with comprehensive analytics.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.utils.decorators import admin_required, get_current_user, role_required
from app.services.analytics_service import AnalyticsService
from app.services.reports_ai_service import reports_ai_service
from app.extensions import db

bp = Blueprint('reports', __name__)


@bp.route('/dashboard', methods=['GET'])
@jwt_required()
def dashboard():
    """
    Get role-appropriate dashboard.
    Returns normalized stats: total_inspections, pending_defects, active_jobs,
    completion_rate, total_stars, incomplete_rate, plus role-specific extras.
    """
    from app.models import Inspection, Defect, SpecialistJob, EngineerJob, InspectionAssignment, InspectionList
    from datetime import date as date_type

    user = get_current_user()
    today = date_type.today()

    # Base: role-specific raw stats
    if user.role == 'admin':
        raw = AnalyticsService.admin_dashboard()
    elif user.has_role('engineer'):
        raw = AnalyticsService.engineer_dashboard(user.id)
    elif user.has_role('inspector'):
        raw = AnalyticsService.inspector_dashboard(user.id)
    elif user.has_role('specialist'):
        raw = AnalyticsService.specialist_dashboard(user.id)
    elif user.has_role('quality_engineer'):
        raw = AnalyticsService.qe_dashboard(user.id)
    else:
        raw = AnalyticsService.admin_dashboard()

    # Normalize into common dashboard format
    data = _normalize_dashboard(user, raw, today)

    return jsonify({
        'status': 'success',
        'data': data
    }), 200


def _normalize_dashboard(user, raw, today):
    """Normalize role-specific stats into common dashboard keys."""
    from app.models import Inspection, Defect, SpecialistJob, EngineerJob, InspectionAssignment, InspectionList, WorkPlanJob
    from app.models.work_plan_day import WorkPlanDay

    role = user.role
    data = {**raw}  # include all role-specific data too

    if role == 'inspector':
        # Inspector: count their assignments
        from sqlalchemy import or_
        my_assignments = InspectionAssignment.query.filter(
            or_(
                InspectionAssignment.mechanical_inspector_id == user.id,
                InspectionAssignment.electrical_inspector_id == user.id,
            )
        )
        total = my_assignments.count()
        completed = my_assignments.filter(InspectionAssignment.status.in_(['completed', 'mech_complete', 'elec_complete', 'both_complete'])).count()
        incomplete = my_assignments.filter(InspectionAssignment.status == 'incomplete').count()

        data['total_inspections'] = total
        # Only count defects reported by this inspector or from their inspections
        my_inspection_ids = [i.id for i in Inspection.query.filter_by(technician_id=user.id).with_entities(Inspection.id).all()]
        data['pending_defects'] = Defect.query.filter(
            Defect.status.in_(['open', 'in_progress']),
            or_(
                Defect.reported_by_id == user.id,
                Defect.inspection_id.in_(my_inspection_ids) if my_inspection_ids else False,
            )
        ).count()
        data['active_jobs'] = my_assignments.filter(InspectionAssignment.status == 'assigned').count()
        data['completion_rate'] = round((completed / total * 100) if total > 0 else 0)
        data['incomplete_rate'] = round((incomplete / total * 100) if total > 0 else 0)
        data['total_stars'] = user.inspector_points or 0

    elif role == 'specialist':
        from sqlalchemy import or_
        my_jobs = raw.get('my_jobs', {})
        total = my_jobs.get('total', 0)
        completed = my_jobs.get('completed', 0)
        incomplete = total - completed - my_jobs.get('in_progress', 0) - my_jobs.get('paused', 0)

        data['total_inspections'] = total
        # Only count defects assigned to this specialist
        data['pending_defects'] = Defect.query.filter(
            Defect.status.in_(['open', 'in_progress']),
            Defect.assigned_to_id == user.id,
        ).count()
        data['active_jobs'] = my_jobs.get('in_progress', 0) + my_jobs.get('paused', 0)
        data['completion_rate'] = round((completed / total * 100) if total > 0 else 0)
        data['incomplete_rate'] = round((incomplete / total * 100) if total > 0 else 0) if incomplete > 0 else 0
        data['total_stars'] = user.specialist_points or 0

    elif role == 'engineer':
        my_jobs = raw.get('my_jobs', {})
        total = my_jobs.get('total', 0)
        completed = my_jobs.get('completed', 0)

        data['total_inspections'] = raw.get('assignments_today', 0)
        data['pending_defects'] = Defect.query.filter(Defect.status.in_(['open', 'in_progress'])).count()
        data['active_jobs'] = my_jobs.get('in_progress', 0)
        data['completion_rate'] = round((completed / total * 100) if total > 0 else 0)
        data['incomplete_rate'] = round(((total - completed - my_jobs.get('in_progress', 0)) / total * 100) if total > 0 else 0)
        data['total_stars'] = user.engineer_points if hasattr(user, 'engineer_points') and user.engineer_points else 0

    elif role == 'quality_engineer':
        total_reviews = raw.get('pending_reviews', 0) + raw.get('approved', 0) + raw.get('rejected', 0)
        completed_reviews = raw.get('approved', 0) + raw.get('rejected', 0)

        data['total_inspections'] = total_reviews
        data['pending_defects'] = raw.get('pending_reviews', 0)
        data['active_jobs'] = raw.get('pending_reviews', 0)
        data['completion_rate'] = round((completed_reviews / total_reviews * 100) if total_reviews > 0 else 0)
        data['incomplete_rate'] = round((raw.get('overdue', 0) / total_reviews * 100) if total_reviews > 0 else 0)
        data['total_stars'] = raw.get('total_points', 0)

    else:
        # Admin fallback
        data['total_inspections'] = Inspection.query.count()
        data['pending_defects'] = Defect.query.filter(Defect.status.in_(['open', 'in_progress'])).count()
        data['active_jobs'] = SpecialistJob.query.filter(SpecialistJob.status.in_(['pending', 'in_progress'])).count()
        total_insp = Inspection.query.count()
        completed_insp = Inspection.query.filter_by(status='completed').count()
        data['completion_rate'] = round((completed_insp / total_insp * 100) if total_insp > 0 else 0)
        data['incomplete_rate'] = 0
        data['total_stars'] = 0

    return data


@bp.route('/admin-dashboard', methods=['GET'])
@jwt_required()
@admin_required()
def admin_dashboard():
    """Full admin dashboard with all metrics."""
    from app.models import User, Equipment, Inspection, Defect, Leave
    from datetime import date

    today = date.today()
    stats = {
        'users_count': User.query.filter_by(is_active=True).count(),
        'equipment_count': Equipment.query.count(),
        'inspections_today': Inspection.query.filter(
            db.func.date(Inspection.created_at) == today
        ).count(),
        'open_defects': Defect.query.filter(
            Defect.status.in_(['open', 'in_progress'])
        ).count(),
        'active_leaves': Leave.query.filter_by(status='approved').filter(
            Leave.date_from <= today, Leave.date_to >= today
        ).count(),
    }
    return jsonify({
        'status': 'success',
        'data': stats
    }), 200


@bp.route('/pause-analytics', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def pause_analytics():
    """Pause pattern analysis."""
    analytics = AnalyticsService.pause_analytics()
    # Flatten by_category to {key: count} for frontend
    by_category = {}
    for cat, info in analytics.get('by_category', {}).items():
        by_category[cat] = info['count'] if isinstance(info, dict) else info
    return jsonify({
        'status': 'success',
        'data': {
            'total_pauses': analytics.get('total_pauses', 0),
            'average_duration_minutes': analytics.get('average_duration_minutes', 0),
            'by_category': by_category,
        }
    }), 200


@bp.route('/defect-analytics', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer', 'quality_engineer')
def defect_analytics():
    """Defect pattern analysis."""
    analytics = AnalyticsService.defect_analytics()
    # Flatten by_severity to {key: count} for frontend
    by_severity = {}
    for sev, info in analytics.get('by_severity', {}).items():
        by_severity[sev] = info['count'] if isinstance(info, dict) else info
    # Build by_status from defects
    from app.models import Defect
    by_status = {}
    for status in ['open', 'in_progress', 'resolved', 'closed']:
        count = Defect.query.filter_by(status=status).count()
        if count > 0:
            by_status[status] = count
    return jsonify({
        'status': 'success',
        'data': {
            'total_defects': analytics.get('total', 0),
            'by_severity': by_severity,
            'by_status': by_status,
        }
    }), 200


@bp.route('/capacity', methods=['GET'])
@jwt_required()
@admin_required()
def capacity_report():
    """Workforce capacity report."""
    from app.services.coverage_service import CoverageService
    shift = request.args.get('shift')
    analysis = CoverageService.get_capacity_analysis(shift)
    total = analysis.get('total', 0)
    available = analysis.get('available', 0)
    on_leave = analysis.get('on_leave', 0)
    return jsonify({
        'status': 'success',
        'data': {
            'total_staff': total,
            'available': available,
            'on_leave': on_leave,
            'utilization_rate': available / total if total > 0 else 0,
        }
    }), 200


@bp.route('/work-plan-stats', methods=['GET'])
@jwt_required()
def work_plan_stats():
    """
    Get work plan statistics for dashboard widget.
    Returns current week's plan status, job counts, overdue counts, and team workload.
    """
    from app.models import WorkPlan, WorkPlanJob, WorkPlanDay, SAPWorkOrder, Leave
    from datetime import date, timedelta

    user = get_current_user()

    # Get current week start (Monday)
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    # Get current week's plan
    plan = WorkPlan.query.filter_by(week_start=week_start).first()

    if not plan:
        return jsonify({
            'status': 'success',
            'data': {
                'has_plan': False,
                'week_start': week_start.isoformat(),
                'week_end': week_end.isoformat(),
                'plan_status': None,
                'total_jobs': 0,
                'jobs_in_pool': 0,
                'scheduled_jobs': 0,
                'completed_jobs': 0,
                'in_progress_jobs': 0,
                'overdue_jobs': 0,
                'critical_jobs': 0,
                'today_jobs': [],
                'team_workload': [],
                'jobs_by_type': {'pm': 0, 'defect': 0, 'inspection': 0},
                'jobs_by_day': []
            }
        }), 200

    # Count jobs in pool (SAP orders pending)
    jobs_in_pool = SAPWorkOrder.query.filter_by(
        work_plan_id=plan.id,
        status='pending'
    ).count()

    # Get all scheduled jobs
    all_jobs = []
    for day in plan.days:
        for job in day.jobs:
            all_jobs.append(job)

    total_jobs = len(all_jobs)

    # Count by status using tracking table
    completed_jobs = 0
    in_progress_jobs = 0
    for job in all_jobs:
        if job.tracking and len(job.tracking) > 0:
            # job.tracking is a list, get the first (latest) tracking record
            latest_tracking = job.tracking[0]
            if latest_tracking.status == 'completed':
                completed_jobs += 1
            elif latest_tracking.status in ['in_progress', 'paused']:
                in_progress_jobs += 1

    # Count overdue and critical jobs
    overdue_jobs = 0
    critical_jobs = 0
    for job in all_jobs:
        if job.overdue_value and job.overdue_value > 0:
            overdue_jobs += 1
            # Critical: >100 hours or >7 days overdue
            if job.overdue_unit == 'hours' and job.overdue_value > 100:
                critical_jobs += 1
            elif job.overdue_unit == 'days' and job.overdue_value > 7:
                critical_jobs += 1

    # Jobs by type
    jobs_by_type = {'pm': 0, 'defect': 0, 'inspection': 0}
    for job in all_jobs:
        if job.job_type in jobs_by_type:
            jobs_by_type[job.job_type] += 1

    # Jobs by day
    jobs_by_day = []
    for day in sorted(plan.days, key=lambda d: d.date):
        day_jobs = len(day.jobs)
        jobs_by_day.append({
            'date': day.date.isoformat(),
            'day_name': day.date.strftime('%a'),
            'count': day_jobs,
            'is_today': day.date == today
        })

    # Today's jobs for quick view
    today_jobs = []
    today_day = next((d for d in plan.days if d.date == today), None)
    if today_day:
        for job in today_day.jobs[:5]:  # Limit to 5 for widget
            today_jobs.append({
                'id': job.id,
                'job_type': job.job_type,
                'equipment_name': job.equipment.name if job.equipment else 'N/A',
                'equipment_serial': job.equipment.serial_number if job.equipment else None,
                'estimated_hours': job.estimated_hours,
                'priority': job.computed_priority or job.priority,
                'status': job.tracking.status if job.tracking else 'pending',
                'team_count': len(job.assignments)
            })

    # Team workload (hours per user this week)
    team_workload = []
    user_hours = {}
    for job in all_jobs:
        for assignment in job.assignments:
            uid = assignment.user_id
            if uid not in user_hours:
                user_hours[uid] = {
                    'user_id': uid,
                    'name': assignment.user.full_name if assignment.user else f'User {uid}',
                    'hours': 0,
                    'job_count': 0,
                    'on_leave': False
                }
            user_hours[uid]['hours'] += job.estimated_hours
            user_hours[uid]['job_count'] += 1

    # Check who's on leave this week
    leaves = Leave.query.filter(
        Leave.status == 'approved',
        Leave.date_from <= week_end,
        Leave.date_to >= week_start
    ).all()
    leave_user_ids = set(l.user_id for l in leaves)

    for uid in user_hours:
        if uid in leave_user_ids:
            user_hours[uid]['on_leave'] = True

    team_workload = sorted(user_hours.values(), key=lambda x: x['hours'], reverse=True)[:10]

    return jsonify({
        'status': 'success',
        'data': {
            'has_plan': True,
            'plan_id': plan.id,
            'plan_status': plan.status,
            'week_start': week_start.isoformat(),
            'week_end': week_end.isoformat(),
            'total_jobs': total_jobs,
            'jobs_in_pool': jobs_in_pool,
            'scheduled_jobs': total_jobs,
            'completed_jobs': completed_jobs,
            'in_progress_jobs': in_progress_jobs,
            'overdue_jobs': overdue_jobs,
            'critical_jobs': critical_jobs,
            'today_jobs': today_jobs,
            'team_workload': team_workload,
            'jobs_by_type': jobs_by_type,
            'jobs_by_day': jobs_by_day
        }
    }), 200


# ============================================================================
# AI-POWERED REPORTS
# ============================================================================

@bp.route('/ai/executive-summary', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def executive_summary():
    """
    Generate AI-powered executive summary for a period.
    Query params: period (daily|weekly|monthly)
    """
    period = request.args.get('period', 'weekly')
    if period not in ['daily', 'weekly', 'monthly']:
        period = 'weekly'

    summary = reports_ai_service.generate_executive_summary(period)
    return jsonify({
        'status': 'success',
        'data': summary.to_dict()
    })


@bp.route('/ai/anomalies', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def detect_anomalies():
    """
    Detect anomalies in metrics.
    Query params: lookback_days (default: 30)
    """
    lookback_days = request.args.get('lookback_days', 30, type=int)
    result = reports_ai_service.detect_metric_anomalies(lookback_days)

    return jsonify({
        'status': 'success',
        'data': {
            'status': result.status,
            'max_severity': result.max_severity.value,
            'total_severity_score': result.total_severity_score,
            'anomalies': [
                {
                    'type': a.anomaly_type,
                    'severity': a.severity.value,
                    'description': a.description,
                    'value': a.value,
                    'baseline': a.baseline,
                    'metadata': a.metadata,
                }
                for a in result.anomalies
            ]
        }
    })


@bp.route('/ai/forecast', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def forecast_metrics():
    """
    Forecast metrics for future periods.
    Query params: metric (inspections|defects|jobs|completion_rate), periods (default: 4)
    """
    metric = request.args.get('metric', 'inspections')
    periods = request.args.get('periods', 4, type=int)

    result = reports_ai_service.forecast_metrics(metric, periods)

    return jsonify({
        'status': 'success',
        'data': {
            'metric': metric,
            'predictions': [
                {
                    'predicted_value': p.predicted_value,
                    'confidence': p.confidence,
                    'horizon_days': p.horizon_days,
                    'reasoning': p.reasoning,
                    'metadata': p.metadata,
                }
                for p in result.predictions
            ]
        }
    })


@bp.route('/ai/query', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def natural_language_query():
    """
    Process a natural language query about reports.
    Body: { "question": "How many inspections this week?" }
    """
    data = request.get_json()
    if not data or 'question' not in data:
        return jsonify({
            'status': 'error',
            'message': 'question is required'
        }), 400

    result = reports_ai_service.query_reports(data['question'])

    return jsonify({
        'status': 'success',
        'data': result.to_dict()
    })


@bp.route('/ai/insights', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def auto_insights():
    """
    Get AI-generated insights across all categories.
    Query params: limit (default: 10)
    """
    limit = request.args.get('limit', 10, type=int)
    insights = reports_ai_service.get_auto_insights(limit)

    return jsonify({
        'status': 'success',
        'data': [i.to_dict() for i in insights]
    })
