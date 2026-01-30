"""
Leaderboard and Rankings endpoints.
Overall and per-role rankings.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.services.analytics_service import AnalyticsService

bp = Blueprint('leaderboards', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
def overall_leaderboard():
    """
    Get overall leaderboard.
    Query params: role (inspector/specialist/engineer/quality_engineer), period (all_time/monthly/weekly/daily)
    """
    role = request.args.get('role')
    period = request.args.get('period', 'all_time')

    rankings = AnalyticsService.leaderboard(role=role, period=period)

    return jsonify({
        'status': 'success',
        'data': rankings
    }), 200


@bp.route('/inspectors', methods=['GET'])
@jwt_required()
def inspector_leaderboard():
    """Inspector rankings."""
    rankings = AnalyticsService.leaderboard(role='inspector')
    return jsonify({
        'status': 'success',
        'data': rankings
    }), 200


@bp.route('/specialists', methods=['GET'])
@jwt_required()
def specialist_leaderboard():
    """Specialist rankings."""
    rankings = AnalyticsService.leaderboard(role='specialist')
    return jsonify({
        'status': 'success',
        'data': rankings
    }), 200


@bp.route('/engineers', methods=['GET'])
@jwt_required()
def engineer_leaderboard():
    """Engineer rankings."""
    rankings = AnalyticsService.leaderboard(role='engineer')
    return jsonify({
        'status': 'success',
        'data': rankings
    }), 200


@bp.route('/quality-engineers', methods=['GET'])
@jwt_required()
def qe_leaderboard():
    """Quality Engineer rankings."""
    rankings = AnalyticsService.leaderboard(role='quality_engineer')
    return jsonify({
        'status': 'success',
        'data': rankings
    }), 200
