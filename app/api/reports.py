"""
Dashboard and reporting endpoints.
Role-based dashboards with comprehensive analytics.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.utils.decorators import admin_required, get_current_user, role_required
from app.services.analytics_service import AnalyticsService
from app.extensions import db

bp = Blueprint('reports', __name__)


@bp.route('/dashboard', methods=['GET'])
@jwt_required()
def dashboard():
    """
    Get role-appropriate dashboard.
    Returns different stats based on user role.
    """
    user = get_current_user()

    if user.role == 'admin':
        stats = AnalyticsService.admin_dashboard()
    elif user.has_role('engineer'):
        stats = AnalyticsService.engineer_dashboard(user.id)
    elif user.has_role('inspector'):
        stats = AnalyticsService.inspector_dashboard(user.id)
    elif user.has_role('specialist'):
        stats = AnalyticsService.specialist_dashboard(user.id)
    elif user.has_role('quality_engineer'):
        stats = AnalyticsService.qe_dashboard(user.id)
    else:
        stats = AnalyticsService.admin_dashboard()

    return jsonify({
        'status': 'success',
        'role': user.role,
        'stats': stats
    }), 200


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
