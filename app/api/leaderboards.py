"""
Enhanced Leaderboard and Gamification API endpoints.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.leaderboard_ai_service import LeaderboardAIService
from app.services.gamification_service import GamificationService
from app.utils.decorators import get_current_user
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from app.extensions import db, safe_commit, limiter

bp = Blueprint('leaderboards', __name__)
leaderboard_ai = LeaderboardAIService()
gamification = GamificationService()

# ==================== LEADERBOARD ====================

@bp.route('', methods=['GET'])
@jwt_required()
def get_leaderboard():
    """
    Get enhanced leaderboard with gamification data.
    Query params: role, period (daily/weekly/monthly/all_time), limit
    """
    role = request.args.get('role')
    period = request.args.get('period', 'all_time')
    limit = request.args.get('limit', 50, type=int)

    data = leaderboard_ai.get_leaderboard(role=role, period=period, limit=limit)
    return jsonify({'status': 'success', 'data': data})


@bp.route('/my-rank', methods=['GET'])
@jwt_required()
def get_my_rank():
    """Get current user's rank and stats."""
    user = get_current_user()
    stats = leaderboard_ai.get_user_stats(user.id)
    return jsonify({'status': 'success', 'data': stats})


@bp.route('/user/<int:user_id>', methods=['GET'])
@jwt_required()
def get_user_stats(user_id):
    """Get specific user's leaderboard stats."""
    stats = leaderboard_ai.get_user_stats(user_id)
    if 'error' in stats:
        raise NotFoundError(f"User {user_id} not found")
    return jsonify({'status': 'success', 'data': stats})


@bp.route('/teams', methods=['GET'])
@jwt_required()
def get_team_leaderboard():
    """Get team-based leaderboard."""
    data = leaderboard_ai.get_team_leaderboard()
    return jsonify({'status': 'success', 'data': data})


@bp.route('/historical', methods=['GET'])
@jwt_required()
def get_historical():
    """Get historical rankings for a user."""
    from app.models.leaderboard_snapshot import LeaderboardSnapshot

    user_id = request.args.get('user_id', type=int) or get_current_user().id
    period = request.args.get('period', 'weekly')
    days = request.args.get('days', 30, type=int)

    # Query LeaderboardSnapshot for historical data
    from datetime import datetime, timedelta
    start_date = datetime.utcnow().date() - timedelta(days=days)

    snapshots = LeaderboardSnapshot.query.filter(
        LeaderboardSnapshot.user_id == user_id,
        LeaderboardSnapshot.period_type == period,
        LeaderboardSnapshot.snapshot_date >= start_date
    ).order_by(LeaderboardSnapshot.snapshot_date.desc()).all()

    return jsonify({
        'status': 'success',
        'data': [s.to_dict() for s in snapshots]
    })


# ==================== ROLE-SPECIFIC LEADERBOARDS ====================

@bp.route('/inspectors', methods=['GET'])
@jwt_required()
def inspector_leaderboard():
    """Inspector rankings."""
    period = request.args.get('period', 'all_time')
    limit = request.args.get('limit', 50, type=int)
    data = leaderboard_ai.get_leaderboard(role='inspector', period=period, limit=limit)
    return jsonify({'status': 'success', 'data': data})


@bp.route('/specialists', methods=['GET'])
@jwt_required()
def specialist_leaderboard():
    """Specialist rankings."""
    period = request.args.get('period', 'all_time')
    limit = request.args.get('limit', 50, type=int)
    data = leaderboard_ai.get_leaderboard(role='specialist', period=period, limit=limit)
    return jsonify({'status': 'success', 'data': data})


@bp.route('/engineers', methods=['GET'])
@jwt_required()
def engineer_leaderboard():
    """Engineer rankings."""
    period = request.args.get('period', 'all_time')
    limit = request.args.get('limit', 50, type=int)
    data = leaderboard_ai.get_leaderboard(role='engineer', period=period, limit=limit)
    return jsonify({'status': 'success', 'data': data})


@bp.route('/quality-engineers', methods=['GET'])
@jwt_required()
def qe_leaderboard():
    """Quality Engineer rankings."""
    period = request.args.get('period', 'all_time')
    limit = request.args.get('limit', 50, type=int)
    data = leaderboard_ai.get_leaderboard(role='quality_engineer', period=period, limit=limit)
    return jsonify({'status': 'success', 'data': data})


# ==================== ACHIEVEMENTS ====================

@bp.route('/achievements', methods=['GET'])
@jwt_required()
def list_achievements():
    """Get all achievements with user's progress."""
    user = get_current_user()
    data = gamification.get_user_achievements(user.id)
    return jsonify({'status': 'success', 'data': data})


@bp.route('/achievements/<int:achievement_id>', methods=['GET'])
@jwt_required()
def get_achievement(achievement_id):
    """Get achievement details."""
    from app.models import Achievement
    achievement = db.session.get(Achievement, achievement_id)
    if not achievement:
        raise NotFoundError(f"Achievement {achievement_id} not found")
    return jsonify({'status': 'success', 'data': achievement.to_dict()})


@bp.route('/achievements/recent', methods=['GET'])
@jwt_required()
def get_recent_achievements():
    """Get recently earned achievements across all users."""
    from app.models import UserAchievement
    recent = UserAchievement.query.order_by(UserAchievement.earned_at.desc()).limit(20).all()
    return jsonify({'status': 'success', 'data': [ua.to_dict() for ua in recent]})


# ==================== CHALLENGES ====================

@bp.route('/challenges', methods=['GET'])
@jwt_required()
def list_challenges():
    """Get active challenges."""
    user = get_current_user()
    data = gamification.get_active_challenges(user_id=user.id, role=user.role)
    return jsonify({'status': 'success', 'data': data})


@bp.route('/challenges/<int:challenge_id>', methods=['GET'])
@jwt_required()
def get_challenge(challenge_id):
    """Get challenge details with leaderboard."""
    from app.models import Challenge
    challenge = db.session.get(Challenge, challenge_id)
    if not challenge:
        raise NotFoundError(f"Challenge {challenge_id} not found")
    leaderboard = gamification.get_challenge_leaderboard(challenge_id)
    return jsonify({
        'status': 'success',
        'challenge': challenge.to_dict(),
        'leaderboard': leaderboard
    })


@bp.route('/challenges/<int:challenge_id>/join', methods=['POST'])
@limiter.limit("20 per minute")
@jwt_required()
def join_challenge(challenge_id):
    """Join a challenge."""
    user = get_current_user()
    result = gamification.join_challenge(user.id, challenge_id)
    if not result.get('success'):
        raise ValidationError(result.get('error', 'Failed to join challenge'))
    return jsonify({'status': 'success', 'data': result})


@bp.route('/challenges', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def create_challenge():
    """Create a new challenge (admin only)."""
    user = get_current_user()
    if user.role != 'admin':
        raise ForbiddenError("Admin access required")

    data = request.get_json()

    # Validate required fields
    required_fields = ['code', 'name', 'target_type', 'target_value', 'start_date', 'end_date']
    for field in required_fields:
        if not data.get(field):
            raise ValidationError(f"{field} is required")

    # Create challenge
    from app.models import Challenge
    from datetime import datetime

    # Parse dates
    try:
        start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
        end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date()
    except ValueError:
        raise ValidationError("Dates must be in YYYY-MM-DD format")

    challenge = Challenge(
        code=data['code'],
        name=data['name'],
        name_ar=data.get('name_ar'),
        description=data.get('description'),
        description_ar=data.get('description_ar'),
        challenge_type=data.get('challenge_type', 'weekly'),
        target_type=data['target_type'],
        target_value=data['target_value'],
        points_reward=data.get('points_reward', 100),
        start_date=start_date,
        end_date=end_date,
        eligible_roles=data.get('eligible_roles'),
        created_by_id=user.id
    )
    db.session.add(challenge)
    safe_commit()
    return jsonify({'status': 'success', 'data': challenge.to_dict()}), 201


# ==================== STREAKS ====================

@bp.route('/streaks', methods=['GET'])
@jwt_required()
def get_my_streak():
    """Get current user's streak info."""
    user = get_current_user()
    data = gamification.get_streak_info(user.id)
    return jsonify({'status': 'success', 'data': data})


@bp.route('/streaks/leaderboard', methods=['GET'])
@jwt_required()
def get_streak_leaderboard():
    """Get users with longest streaks."""
    from app.models import UserStreak
    streaks = UserStreak.query.order_by(UserStreak.current_streak.desc()).limit(20).all()
    return jsonify({'status': 'success', 'data': [s.to_dict() for s in streaks]})


# ==================== POINTS ====================

@bp.route('/points/history', methods=['GET'])
@jwt_required()
def get_point_history():
    """Get user's point history."""
    user = get_current_user()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    from app.models import PointHistory
    query = PointHistory.query.filter_by(user_id=user.id).order_by(PointHistory.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page)

    return jsonify({
        'status': 'success',
        'data': [p.to_dict() for p in pagination.items],
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': pagination.total,
            'pages': pagination.pages
        }
    })


@bp.route('/points/breakdown', methods=['GET'])
@jwt_required()
def get_point_breakdown():
    """Get breakdown of where points came from."""
    user = get_current_user()
    period = request.args.get('period', 'monthly')
    data = leaderboard_ai.get_point_breakdown(user.id, period)
    return jsonify({'status': 'success', 'data': data})


@bp.route('/points/award', methods=['POST'])
@limiter.limit("20 per minute")
@jwt_required()
def manual_award_points():
    """Manually award points (admin only)."""
    user = get_current_user()
    if user.role != 'admin':
        raise ForbiddenError("Admin access required")

    data = request.get_json()

    # Validate required fields
    if not data.get('user_id'):
        raise ValidationError("user_id is required")
    if not data.get('points'):
        raise ValidationError("points is required")
    if not data.get('reason'):
        raise ValidationError("reason is required")

    result = leaderboard_ai.award_points(
        user_id=data['user_id'],
        points=data['points'],
        reason=data['reason'],
        source_type='manual'
    )

    if 'error' in result:
        raise NotFoundError(result['error'])

    return jsonify({'status': 'success', 'data': result})


# ==================== AI FEATURES ====================

@bp.route('/ai/insights', methods=['GET'])
@jwt_required()
def get_ai_insights():
    """Get AI-generated performance insights."""
    user = get_current_user()
    insights = leaderboard_ai.get_performance_insights(user.id)
    return jsonify({'status': 'success', 'data': insights})


@bp.route('/ai/tips', methods=['GET'])
@jwt_required()
def get_ai_tips():
    """Get AI-generated tips for improvement."""
    user = get_current_user()
    tips = leaderboard_ai.get_personalized_tips(user.id)
    return jsonify({'status': 'success', 'data': tips})


@bp.route('/ai/prediction', methods=['GET'])
@jwt_required()
def get_rank_prediction():
    """Get AI rank prediction."""
    user = get_current_user()
    prediction = leaderboard_ai.get_rank_prediction(user.id)
    return jsonify({'status': 'success', 'data': prediction})


@bp.route('/ai/suggest-challenges', methods=['GET'])
@jwt_required()
def get_suggested_challenges():
    """Get AI-suggested challenges."""
    user = get_current_user()
    suggestions = leaderboard_ai.suggest_challenges(user.id)
    return jsonify({'status': 'success', 'data': suggestions})


@bp.route('/ai/query', methods=['POST'])
@limiter.limit("30 per minute")
@jwt_required()
def natural_language_query():
    """Natural language leaderboard query."""
    data = request.get_json()
    query = data.get('query', '')
    if not query:
        raise ValidationError("query is required")
    result = leaderboard_ai.natural_language_query(query)
    return jsonify({'status': 'success', 'data': result})


@bp.route('/ai/anomalies', methods=['GET'])
@jwt_required()
def get_anomalies():
    """Get detected anomalies (admin only)."""
    user = get_current_user()
    if user.role != 'admin':
        raise ForbiddenError("Admin access required")

    anomalies = leaderboard_ai.detect_anomalies()
    return jsonify({'status': 'success', 'data': anomalies})


# ==================== LEVELS ====================

@bp.route('/levels', methods=['GET'])
@jwt_required()
def get_my_level():
    """Get current user's level and XP info."""
    user = get_current_user()
    from app.models import UserLevel
    level_info = UserLevel.query.filter_by(user_id=user.id).first()
    if level_info:
        return jsonify({'status': 'success', 'data': level_info.to_dict()})
    return jsonify({'status': 'success', 'data': {'level': 1, 'current_xp': 0, 'tier': 'bronze'}})


@bp.route('/levels/tiers', methods=['GET'])
@jwt_required()
def get_tier_info():
    """Get tier thresholds and requirements."""
    tiers = {
        'bronze': {'min_level': 1, 'max_level': 10, 'color': '#cd7f32'},
        'silver': {'min_level': 11, 'max_level': 20, 'color': '#c0c0c0'},
        'gold': {'min_level': 21, 'max_level': 30, 'color': '#ffd700'},
        'platinum': {'min_level': 31, 'max_level': 40, 'color': '#e5e4e2'},
        'diamond': {'min_level': 41, 'max_level': 50, 'color': '#b9f2ff'},
    }
    return jsonify({'status': 'success', 'data': tiers})


# ==================== ROUTE ALIASES (frontend compatibility) ====================

@bp.route('/ai/predict-rank', methods=['GET'])
@jwt_required()
def predict_rank_alias():
    """Alias for /ai/prediction - frontend uses this path."""
    user = get_current_user()
    prediction = leaderboard_ai.get_rank_prediction(user.id)
    return jsonify({'status': 'success', 'data': prediction})


@bp.route('/ai/suggested-challenges', methods=['GET'])
@jwt_required()
def suggested_challenges_alias():
    """Alias for /ai/suggest-challenges - frontend uses this path."""
    user = get_current_user()
    suggestions = leaderboard_ai.suggest_challenges(user.id)
    return jsonify({'status': 'success', 'data': suggestions})


@bp.route('/levels/me', methods=['GET'])
@jwt_required()
def get_my_level_alias():
    """Alias for /levels - frontend uses /levels/me."""
    user = get_current_user()
    from app.models import UserLevel
    level_info = UserLevel.query.filter_by(user_id=user.id).first()
    if level_info:
        return jsonify({'status': 'success', 'data': level_info.to_dict()})
    return jsonify({'status': 'success', 'data': {'level': 1, 'current_xp': 0, 'tier': 'bronze'}})


@bp.route('/streaks/me', methods=['GET'])
@jwt_required()
def get_my_streak_alias():
    """Alias for /streaks - frontend uses /streaks/me."""
    user = get_current_user()
    data = gamification.get_streak_info(user.id)
    return jsonify({'status': 'success', 'data': data})
