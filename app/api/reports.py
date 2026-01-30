"""
Dashboard and reporting endpoints.
Role-based dashboards with comprehensive analytics.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.utils.decorators import admin_required, get_current_user, role_required
from app.services.analytics_service import AnalyticsService

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
    stats = AnalyticsService.admin_dashboard()
    return jsonify({
        'status': 'success',
        'stats': stats
    }), 200


@bp.route('/pause-analytics', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def pause_analytics():
    """Pause pattern analysis."""
    analytics = AnalyticsService.pause_analytics()
    return jsonify({
        'status': 'success',
        'data': analytics
    }), 200


@bp.route('/defect-analytics', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer', 'quality_engineer')
def defect_analytics():
    """Defect pattern analysis."""
    analytics = AnalyticsService.defect_analytics()
    return jsonify({
        'status': 'success',
        'data': analytics
    }), 200


@bp.route('/capacity', methods=['GET'])
@jwt_required()
@admin_required()
def capacity_report():
    """Workforce capacity report."""
    from app.services.coverage_service import CoverageService
    shift = request.args.get('shift')
    analysis = CoverageService.get_capacity_analysis(shift)
    return jsonify({
        'status': 'success',
        'data': analysis
    }), 200
