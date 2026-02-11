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


# ==================== New Endpoints ====================

@bp.route('/my-goals', methods=['GET'])
@jwt_required()
def get_my_goals():
    """Get current user's goals without needing user_id parameter."""
    from app.models import PerformanceGoal

    current_user = get_current_user()
    status = request.args.get('status')

    query = PerformanceGoal.query.filter_by(user_id=current_user.id)

    if status:
        query = query.filter_by(status=status)

    goals = query.order_by(PerformanceGoal.end_date.asc()).all()

    return jsonify({
        'status': 'success',
        'data': [g.to_dict() for g in goals]
    })


@bp.route('/my-ranking', methods=['GET'])
@jwt_required()
def get_my_ranking():
    """Get current user's ranking among peers."""
    from app.models import User, LeaderboardSnapshot
    from sqlalchemy import func

    current_user = get_current_user()

    # Get the latest leaderboard snapshot for current user
    latest_snapshot = LeaderboardSnapshot.query.filter_by(
        user_id=current_user.id
    ).order_by(LeaderboardSnapshot.snapshot_date.desc()).first()

    if latest_snapshot:
        rank = latest_snapshot.rank
        # Get total users with the same role
        total = User.query.filter_by(role=current_user.role, is_active=True).count()
        percentile = round((1 - (rank - 1) / max(1, total)) * 100) if total > 0 else 100
    else:
        # Calculate rank from total points
        users_with_higher_points = User.query.filter(
            User.role == current_user.role,
            User.is_active == True,
            User.total_points > (current_user.total_points or 0)
        ).count()

        rank = users_with_higher_points + 1
        total = User.query.filter_by(role=current_user.role, is_active=True).count()
        percentile = round((1 - (rank - 1) / max(1, total)) * 100) if total > 0 else 100

    return jsonify({
        'status': 'success',
        'data': {
            'rank': rank,
            'total': total,
            'percentile': percentile
        }
    })


@bp.route('/summary/<int:user_id>', methods=['GET'])
@jwt_required()
def get_performance_summary(user_id: int):
    """
    Dashboard summary endpoint - combines trajectory, goals, skill gaps into one response.
    """
    from app.models import PerformanceGoal
    from app.services.shared import (
        performance_risk_scorer,
        performance_insight_generator,
        performance_recommendation_engine
    )

    current_user = get_current_user()

    # Access check
    if current_user.role not in ['admin', 'engineer'] and current_user.id != user_id:
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    # Get trajectory
    trajectory = performance_ai_service.predict_performance_trajectory(user_id, months=3)

    # Get skill gaps
    skill_gaps = performance_ai_service.analyze_skill_gaps(user_id)

    # Get burnout risk
    burnout = performance_ai_service.detect_burnout_risk(user_id)

    # Get active goals
    goals = PerformanceGoal.query.filter_by(
        user_id=user_id,
        status='active'
    ).order_by(PerformanceGoal.end_date.asc()).all()

    # Get coaching tips
    coaching_tips = performance_ai_service.get_coaching_tips(user_id)

    # Generate AI insights using shared service
    insights = []

    # Performance trend insight
    if trajectory.get('avg_monthly_growth'):
        from app.services.shared import InsightType, InsightCategory, InsightSeverity
        growth = trajectory['avg_monthly_growth']
        if abs(growth) > 10:
            insight = performance_insight_generator.create_insight(
                type=InsightType.TREND,
                category=InsightCategory.PERFORMANCE,
                title='Performance Trend' if growth > 0 else 'Performance Decline',
                description=f"Monthly growth rate: {growth:+.1f} points",
                severity=InsightSeverity.INFO if growth > 0 else InsightSeverity.WARNING,
                priority=3 if growth > 0 else 2,
                change_percentage=growth / 10 if trajectory.get('current_points') else None,
            )
            insights.append(insight.to_dict())

    # Burnout risk insight
    if burnout.get('risk_level') in ['high', 'critical']:
        from app.services.shared import InsightType, InsightCategory, InsightSeverity
        insight = performance_insight_generator.create_insight(
            type=InsightType.WARNING,
            category=InsightCategory.WORKFORCE,
            title='Burnout Risk Alert',
            description=f"Risk level: {burnout['risk_level']}. Score: {burnout.get('risk_score', 0)}%",
            severity=InsightSeverity.CRITICAL if burnout['risk_level'] == 'critical' else InsightSeverity.WARNING,
            priority=1,
            action_items=burnout.get('recommendations', []),
        )
        insights.append(insight.to_dict())

    return jsonify({
        'status': 'success',
        'data': {
            'user_id': user_id,
            'trajectory': trajectory,
            'skill_gaps': skill_gaps,
            'burnout_risk': burnout,
            'goals': [g.to_dict() for g in goals],
            'coaching_tips': coaching_tips,
            'insights': insights,
        }
    })


@bp.route('/interventions/leave', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def suggest_leave_intervention():
    """
    Suggest leave for user with burnout risk.
    Creates a leave request draft for the user.
    """
    from app.models import User, Leave
    from datetime import datetime, timedelta, date
    from app.services.shared import performance_recommendation_engine, RecommendationType, Urgency

    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': 'Request body required'}), 400

    user_id = data.get('user_id')
    days = data.get('days', 3)  # Default 3 days leave
    reason = data.get('reason', 'Recommended rest period due to high workload')

    if not user_id:
        return jsonify({'status': 'error', 'message': 'user_id is required'}), 400

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404

    # Check burnout risk first
    burnout = performance_ai_service.detect_burnout_risk(user_id)

    if burnout.get('risk_level') not in ['medium', 'high', 'critical']:
        return jsonify({
            'status': 'warning',
            'message': 'User does not have elevated burnout risk',
            'data': {'risk_level': burnout.get('risk_level')}
        })

    # Calculate leave dates (starting next business day)
    start_date = date.today() + timedelta(days=1)
    # Skip weekends
    while start_date.weekday() >= 5:
        start_date += timedelta(days=1)

    end_date = start_date + timedelta(days=days - 1)
    # Adjust end date to skip weekends
    weekend_days = sum(1 for d in range((end_date - start_date).days + 1)
                       if (start_date + timedelta(days=d)).weekday() >= 5)
    end_date += timedelta(days=weekend_days)

    # Create leave request draft
    leave = Leave(
        user_id=user_id,
        leave_type='annual',
        date_from=start_date,
        date_to=end_date,
        total_days=days,
        reason=reason,
        status='pending',
        scope='full'
    )

    db.session.add(leave)
    safe_commit()

    # Generate recommendation
    recommendation = performance_recommendation_engine.create_recommendation(
        type=RecommendationType.RESOURCE,
        title='Leave Intervention Created',
        description=f'Leave request created for {user.full_name} from {start_date} to {end_date}',
        urgency=Urgency.HIGH if burnout['risk_level'] == 'critical' else Urgency.MEDIUM,
        confidence=0.9,
        action='approve_leave',
        action_params={'leave_id': leave.id, 'user_id': user_id},
        impact='Reduce burnout risk and improve long-term productivity',
        effort='low',
    )

    return jsonify({
        'status': 'success',
        'data': {
            'leave': leave.to_dict(),
            'burnout_risk': burnout,
            'recommendation': recommendation.to_dict(),
        }
    }), 201


@bp.route('/interventions/workload', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def reduce_workload_intervention():
    """
    Reduce workload for user with high burnout risk.
    Reassigns some jobs to other available workers.
    """
    from app.models import User, WorkPlanJobAssignment
    from datetime import datetime, timedelta, date
    from sqlalchemy import func
    from app.services.shared import performance_recommendation_engine, RecommendationType, Urgency

    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': 'Request body required'}), 400

    user_id = data.get('user_id')
    reduction_percentage = data.get('reduction_percentage', 30)  # Default 30% reduction
    target_user_id = data.get('target_user_id')  # Optional: specific user to reassign to

    if not user_id:
        return jsonify({'status': 'error', 'message': 'user_id is required'}), 400

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404

    # Check burnout risk
    burnout = performance_ai_service.detect_burnout_risk(user_id)

    # Get pending/upcoming jobs for this user
    today = date.today()
    pending_jobs = WorkPlanJobAssignment.query.filter(
        WorkPlanJobAssignment.user_id == user_id,
        WorkPlanJobAssignment.status.in_(['pending', 'not_started']),
    ).order_by(WorkPlanJobAssignment.created_at.desc()).all()

    if not pending_jobs:
        return jsonify({
            'status': 'warning',
            'message': 'No pending jobs to reassign',
            'data': {'burnout_risk': burnout}
        })

    # Calculate how many jobs to reassign
    jobs_to_reassign_count = max(1, int(len(pending_jobs) * reduction_percentage / 100))
    jobs_to_reassign = pending_jobs[:jobs_to_reassign_count]

    # Find available users to reassign to
    if target_user_id:
        target_users = [db.session.get(User, target_user_id)]
        if not target_users[0]:
            return jsonify({'status': 'error', 'message': 'Target user not found'}), 404
    else:
        # Find users with same role and lower workload
        target_users = User.query.filter(
            User.role == user.role,
            User.is_active == True,
            User.id != user_id
        ).all()

    if not target_users:
        return jsonify({
            'status': 'error',
            'message': 'No available users to reassign jobs to'
        }), 400

    # Get workload for each target user
    user_workloads = {}
    for u in target_users:
        count = WorkPlanJobAssignment.query.filter(
            WorkPlanJobAssignment.user_id == u.id,
            WorkPlanJobAssignment.status.in_(['pending', 'not_started', 'in_progress'])
        ).count()
        user_workloads[u.id] = count

    # Sort by workload (lowest first)
    sorted_users = sorted(target_users, key=lambda u: user_workloads.get(u.id, 0))

    # Reassign jobs
    reassigned_jobs = []
    for i, job in enumerate(jobs_to_reassign):
        # Round-robin assignment to users with lowest workload
        target = sorted_users[i % len(sorted_users)]
        old_user_id = job.user_id
        job.user_id = target.id
        reassigned_jobs.append({
            'job_id': job.id,
            'from_user_id': old_user_id,
            'to_user_id': target.id,
            'to_user_name': target.full_name,
        })

    safe_commit()

    # Generate recommendation
    recommendation = performance_recommendation_engine.create_recommendation(
        type=RecommendationType.RESOURCE,
        title='Workload Reduction Completed',
        description=f'Reassigned {len(reassigned_jobs)} jobs from {user.full_name}',
        urgency=Urgency.HIGH if burnout.get('risk_level') == 'critical' else Urgency.MEDIUM,
        confidence=0.85,
        action='monitor_workload',
        action_params={'user_id': user_id, 'reassigned_count': len(reassigned_jobs)},
        impact=f'Workload reduced by {reduction_percentage}%',
        effort='low',
    )

    return jsonify({
        'status': 'success',
        'data': {
            'user_id': user_id,
            'user_name': user.full_name,
            'jobs_reassigned': reassigned_jobs,
            'reduction_percentage': reduction_percentage,
            'burnout_risk': burnout,
            'recommendation': recommendation.to_dict(),
        }
    })
