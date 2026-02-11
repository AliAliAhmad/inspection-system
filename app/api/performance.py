"""
Performance AI API Endpoints.
Provides AI-powered performance management features.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.services.performance_ai_service import performance_ai_service
from app.utils.decorators import get_current_user, role_required, admin_required
from app.extensions import db, safe_commit

bp = Blueprint('performance', __name__)


@bp.route('/trajectory/<int:user_id>', methods=['GET'])
@jwt_required()
def get_trajectory(user_id: int):
    """Get performance trajectory prediction for a user."""
    current_user = get_current_user()

    # Users can see their own trajectory, admins/engineers can see anyone
    if current_user.role not in ['admin', 'engineer'] and current_user.id != user_id:
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    months = request.args.get('months', 3, type=int)
    result = performance_ai_service.predict_performance_trajectory(user_id, months)

    if 'error' in result:
        return jsonify({'status': 'error', 'message': result['error']}), 404

    return jsonify({'status': 'success', 'data': result})


@bp.route('/skill-gaps/<int:user_id>', methods=['GET'])
@jwt_required()
def get_skill_gaps(user_id: int):
    """Get skill gap analysis for a user."""
    current_user = get_current_user()

    if current_user.role not in ['admin', 'engineer'] and current_user.id != user_id:
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    result = performance_ai_service.analyze_skill_gaps(user_id)
    return jsonify({'status': 'success', 'data': result})


@bp.route('/burnout-risk/<int:user_id>', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_burnout_risk(user_id: int):
    """Get burnout risk assessment for a user."""
    result = performance_ai_service.detect_burnout_risk(user_id)

    if 'error' in result:
        return jsonify({'status': 'error', 'message': result['error']}), 404

    return jsonify({'status': 'success', 'data': result})


@bp.route('/coaching-tips/<int:user_id>', methods=['GET'])
@jwt_required()
def get_coaching_tips(user_id: int):
    """Get personalized coaching tips for a user."""
    current_user = get_current_user()

    if current_user.role not in ['admin', 'engineer'] and current_user.id != user_id:
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    result = performance_ai_service.get_coaching_tips(user_id)
    return jsonify({'status': 'success', 'data': result})


@bp.route('/peer-comparison/<int:user_id>', methods=['GET'])
@jwt_required()
def get_peer_comparison(user_id: int):
    """Get anonymous peer comparison for a user."""
    current_user = get_current_user()

    if current_user.role not in ['admin', 'engineer'] and current_user.id != user_id:
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    result = performance_ai_service.get_peer_comparison(user_id)

    if 'error' in result:
        return jsonify({'status': 'error', 'message': result['error']}), 404

    return jsonify({'status': 'success', 'data': result})


@bp.route('/learning-path/<int:user_id>', methods=['GET'])
@jwt_required()
def get_learning_path(user_id: int):
    """Get personalized learning path for a user."""
    current_user = get_current_user()

    if current_user.role not in ['admin', 'engineer'] and current_user.id != user_id:
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    result = performance_ai_service.suggest_learning_path(user_id)

    if 'error' in result:
        return jsonify({'status': 'error', 'message': result['error']}), 404

    return jsonify({'status': 'success', 'data': result})


# Goals CRUD
@bp.route('/goals', methods=['GET'])
@jwt_required()
def list_goals():
    """List user's performance goals."""
    from app.models import PerformanceGoal

    current_user = get_current_user()
    user_id = request.args.get('user_id', type=int)

    # Default to current user
    if not user_id:
        user_id = current_user.id

    # Check access
    if current_user.role not in ['admin', 'engineer'] and current_user.id != user_id:
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    goals = PerformanceGoal.query.filter_by(user_id=user_id).all()

    return jsonify({
        'status': 'success',
        'data': [g.to_dict() for g in goals]
    })


@bp.route('/goals', methods=['POST'])
@jwt_required()
def create_goal():
    """Create a new performance goal."""
    from app.models import PerformanceGoal
    from datetime import datetime

    current_user = get_current_user()
    data = request.get_json()

    if not data:
        return jsonify({'status': 'error', 'message': 'Request body required'}), 400

    goal_type = data.get('goal_type')
    target_value = data.get('target_value')
    end_date = data.get('end_date')

    if not goal_type or not target_value or not end_date:
        return jsonify({
            'status': 'error',
            'message': 'goal_type, target_value, and end_date are required'
        }), 400

    goal = PerformanceGoal(
        user_id=current_user.id,
        goal_type=goal_type,
        target_value=target_value,
        current_value=data.get('current_value', 0),
        start_date=datetime.utcnow().date(),
        end_date=datetime.strptime(end_date, '%Y-%m-%d').date(),
        status='active'
    )

    db.session.add(goal)
    safe_commit()

    return jsonify({
        'status': 'success',
        'data': goal.to_dict()
    }), 201


@bp.route('/goals/<int:goal_id>', methods=['PUT'])
@jwt_required()
def update_goal(goal_id: int):
    """Update a performance goal."""
    from app.models import PerformanceGoal

    current_user = get_current_user()
    goal = db.session.get(PerformanceGoal, goal_id)

    if not goal:
        return jsonify({'status': 'error', 'message': 'Goal not found'}), 404

    if goal.user_id != current_user.id and current_user.role != 'admin':
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    data = request.get_json() or {}

    if 'current_value' in data:
        goal.current_value = data['current_value']
    if 'status' in data:
        goal.status = data['status']
    if 'target_value' in data:
        goal.target_value = data['target_value']

    safe_commit()

    return jsonify({
        'status': 'success',
        'data': goal.to_dict()
    })


@bp.route('/goals/<int:goal_id>', methods=['DELETE'])
@jwt_required()
def delete_goal(goal_id: int):
    """Delete a performance goal."""
    from app.models import PerformanceGoal

    current_user = get_current_user()
    goal = db.session.get(PerformanceGoal, goal_id)

    if not goal:
        return jsonify({'status': 'error', 'message': 'Goal not found'}), 404

    if goal.user_id != current_user.id and current_user.role != 'admin':
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    db.session.delete(goal)
    safe_commit()

    return jsonify({'status': 'success', 'message': 'Goal deleted'})
