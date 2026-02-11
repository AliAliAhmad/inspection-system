"""
Performance AI Service - AI-powered performance management features.
Provides trajectory prediction, skill gap analysis, burnout detection.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta
from dataclasses import dataclass
from app.services.ai_base_service import (
    AIServiceWrapper, RiskScorer, Predictor, RecommendationEngine,
    RiskFactor, RiskResult, Recommendation, ScoringUtils
)
from app.services.shared import PointCalculator, PointAction, NotificationPatterns
from app.extensions import db
import logging

logger = logging.getLogger(__name__)


@dataclass
class SkillGap:
    """Represents a skill gap for a worker."""
    skill: str
    current_level: float
    target_level: float
    gap: float
    improvement_tips: List[str]


@dataclass
class CoachingTip:
    """AI-generated coaching tip."""
    category: str
    tip: str
    priority: str
    related_skill: Optional[str] = None


class PerformanceAIService(AIServiceWrapper):
    """
    AI-powered performance management.
    Extends leaderboard capabilities with predictions and coaching.
    """

    def __init__(self):
        super().__init__()
        self.point_calculator = PointCalculator()

    def predict_performance_trajectory(
        self,
        user_id: int,
        months: int = 3
    ) -> Dict[str, Any]:
        """
        Predict user's performance trajectory.

        Args:
            user_id: User ID
            months: Months to predict

        Returns:
            Trajectory prediction with confidence
        """
        from app.models import User, WorkPlanPerformance, LeaderboardSnapshot
        from sqlalchemy import func

        user = db.session.get(User, user_id)
        if not user:
            return {'error': 'User not found'}

        # Get historical performance data
        performances = WorkPlanPerformance.query.filter(
            WorkPlanPerformance.user_id == user_id,
            WorkPlanPerformance.period_type == 'monthly'
        ).order_by(WorkPlanPerformance.period_start.desc()).limit(6).all()

        # Get historical ranks
        snapshots = LeaderboardSnapshot.query.filter(
            LeaderboardSnapshot.user_id == user_id
        ).order_by(LeaderboardSnapshot.snapshot_date.desc()).limit(6).all()

        if len(performances) < 2:
            return {
                'user_id': user_id,
                'has_sufficient_data': False,
                'message': 'Need more historical data for prediction',
                'current_rank': snapshots[0].rank if snapshots else None
            }

        # Calculate trend
        points_trend = []
        for p in reversed(performances):
            points_trend.append(p.total_points_earned)

        # Simple linear projection
        if len(points_trend) >= 2:
            avg_growth = (points_trend[-1] - points_trend[0]) / len(points_trend)
        else:
            avg_growth = 0

        # Project future months
        current_rank = snapshots[0].rank if snapshots else 50
        predictions = []
        projected_points = user.total_points or 0

        for i in range(1, months + 1):
            projected_points += int(avg_growth)
            # Estimate rank change based on points
            rank_change = -int(avg_growth / 100)  # Rough estimate
            predicted_rank = max(1, current_rank + rank_change * i)

            predictions.append({
                'month': i,
                'date': (date.today() + timedelta(days=30*i)).strftime('%Y-%m'),
                'predicted_points': projected_points,
                'predicted_rank': predicted_rank
            })

        # Calculate confidence
        confidence = min(0.9, 0.3 + len(performances) * 0.1)

        return {
            'user_id': user_id,
            'user_name': user.full_name,
            'current_rank': current_rank,
            'current_points': user.total_points or 0,
            'trend': 'improving' if avg_growth > 0 else 'declining' if avg_growth < 0 else 'stable',
            'avg_monthly_growth': round(avg_growth, 1),
            'predictions': predictions,
            'confidence': round(confidence, 2),
            'generated_at': datetime.utcnow().isoformat()
        }

    def analyze_skill_gaps(self, user_id: int) -> List[Dict[str, Any]]:
        """
        Analyze skill gaps for a worker.

        Args:
            user_id: User ID

        Returns:
            List of skill gaps with improvement tips
        """
        from app.models import User, WorkPlanPerformance, WorkPlanJobRating
        from sqlalchemy import func

        user = db.session.get(User, user_id)
        if not user:
            return []

        gaps = []

        # Get recent performance data
        recent_perf = WorkPlanPerformance.query.filter(
            WorkPlanPerformance.user_id == user_id,
            WorkPlanPerformance.period_type == 'monthly'
        ).order_by(WorkPlanPerformance.period_start.desc()).first()

        # Skill 1: Time Management
        if recent_perf:
            time_efficiency = float(recent_perf.time_efficiency or 1.0) if recent_perf.total_actual_hours else 1.0
            if time_efficiency < 0.9:
                gaps.append({
                    'skill': 'Time Management',
                    'current_level': round(time_efficiency * 5, 1),
                    'target_level': 4.5,
                    'gap': round(4.5 - time_efficiency * 5, 1),
                    'improvement_tips': [
                        'Plan tasks before starting',
                        'Minimize interruptions',
                        'Use time tracking tools'
                    ]
                })

        # Skill 2: Quality (from QC ratings)
        avg_qc = db.session.query(
            func.avg(WorkPlanJobRating.qc_rating)
        ).filter(
            WorkPlanJobRating.user_id == user_id,
            WorkPlanJobRating.qc_rating.isnot(None)
        ).scalar()

        if avg_qc and float(avg_qc) < 4.0:
            gaps.append({
                'skill': 'Work Quality',
                'current_level': round(float(avg_qc), 1),
                'target_level': 4.5,
                'gap': round(4.5 - float(avg_qc), 1),
                'improvement_tips': [
                    'Double-check work before marking complete',
                    'Follow checklists carefully',
                    'Ask for feedback on completed work'
                ]
            })

        # Skill 3: Consistency (from completion rate)
        if recent_perf and recent_perf.completion_rate:
            completion_rate = float(recent_perf.completion_rate)
            if completion_rate < 90:
                gaps.append({
                    'skill': 'Consistency',
                    'current_level': round(completion_rate / 20, 1),  # Scale to 5
                    'target_level': 4.5,
                    'gap': round(4.5 - completion_rate / 20, 1),
                    'improvement_tips': [
                        'Complete all assigned tasks daily',
                        'Communicate early if facing blockers',
                        'Prioritize critical tasks'
                    ]
                })

        # Skill 4: Cleanliness (from cleaning ratings)
        avg_cleaning = db.session.query(
            func.avg(WorkPlanJobRating.cleaning_rating)
        ).filter(
            WorkPlanJobRating.user_id == user_id,
            WorkPlanJobRating.cleaning_rating.isnot(None)
        ).scalar()

        if avg_cleaning is not None and float(avg_cleaning) < 1.5:
            gaps.append({
                'skill': 'Workspace Cleanliness',
                'current_level': round(float(avg_cleaning) * 2.5, 1),  # Scale to 5
                'target_level': 4.0,
                'gap': round(4.0 - float(avg_cleaning) * 2.5, 1),
                'improvement_tips': [
                    'Clean as you work',
                    'Return tools to proper locations',
                    'Leave work area better than found'
                ]
            })

        return sorted(gaps, key=lambda x: x['gap'], reverse=True)

    def detect_burnout_risk(self, user_id: int) -> Dict[str, Any]:
        """
        Detect burnout risk for a worker.

        Args:
            user_id: User ID

        Returns:
            Burnout risk assessment
        """
        from app.models import User, WorkPlanJobAssignment, WorkPlanPerformance, Leave
        from sqlalchemy import func

        user = db.session.get(User, user_id)
        if not user:
            return {'error': 'User not found'}

        risk_factors = []
        risk_score = 0

        # Factor 1: High workload (jobs in last 7 days)
        week_ago = datetime.utcnow() - timedelta(days=7)
        jobs_count = WorkPlanJobAssignment.query.filter(
            WorkPlanJobAssignment.user_id == user_id,
            WorkPlanJobAssignment.created_at >= week_ago
        ).count()

        if jobs_count > 25:  # More than 5 per day average
            risk_factors.append({
                'factor': 'high_workload',
                'value': jobs_count,
                'description': f'{jobs_count} jobs in the last week',
                'contribution': 25
            })
            risk_score += 25
        elif jobs_count > 15:
            risk_factors.append({
                'factor': 'moderate_workload',
                'value': jobs_count,
                'description': f'{jobs_count} jobs in the last week',
                'contribution': 10
            })
            risk_score += 10

        # Factor 2: No recent leave
        last_leave = Leave.query.filter(
            Leave.user_id == user_id,
            Leave.status == 'approved',
            Leave.date_to >= date.today() - timedelta(days=90)
        ).first()

        if not last_leave:
            risk_factors.append({
                'factor': 'no_recent_break',
                'value': True,
                'description': 'No approved leave in last 90 days',
                'contribution': 20
            })
            risk_score += 20

        # Factor 3: Performance decline
        recent_perfs = WorkPlanPerformance.query.filter(
            WorkPlanPerformance.user_id == user_id,
            WorkPlanPerformance.period_type == 'weekly'
        ).order_by(WorkPlanPerformance.period_start.desc()).limit(4).all()

        if len(recent_perfs) >= 2:
            if recent_perfs[0].completion_rate and recent_perfs[-1].completion_rate:
                decline = float(recent_perfs[-1].completion_rate) - float(recent_perfs[0].completion_rate)
                if decline > 10:
                    risk_factors.append({
                        'factor': 'performance_decline',
                        'value': decline,
                        'description': f'Completion rate dropped {decline:.0f}%',
                        'contribution': 15
                    })
                    risk_score += 15

        # Factor 4: Many pauses
        from app.models import WorkPlanPauseRequest
        pause_count = WorkPlanPauseRequest.query.filter(
            WorkPlanPauseRequest.requested_by_id == user_id,
            WorkPlanPauseRequest.created_at >= week_ago
        ).count()

        if pause_count > 5:
            risk_factors.append({
                'factor': 'frequent_pauses',
                'value': pause_count,
                'description': f'{pause_count} pause requests in last week',
                'contribution': 15
            })
            risk_score += 15

        # Determine risk level
        if risk_score >= 50:
            risk_level = 'high'
            recommendations = [
                'Consider reducing workload',
                'Schedule a break or short leave',
                'Have a one-on-one check-in'
            ]
        elif risk_score >= 25:
            risk_level = 'medium'
            recommendations = [
                'Monitor workload closely',
                'Encourage regular breaks'
            ]
        else:
            risk_level = 'low'
            recommendations = ['Continue normal monitoring']

        return {
            'user_id': user_id,
            'user_name': user.full_name,
            'risk_score': risk_score,
            'risk_level': risk_level,
            'factors': risk_factors,
            'recommendations': recommendations,
            'assessed_at': datetime.utcnow().isoformat()
        }

    def get_coaching_tips(self, user_id: int) -> List[Dict[str, Any]]:
        """
        Generate personalized coaching tips.

        Args:
            user_id: User ID

        Returns:
            List of coaching tips
        """
        tips = []

        # Get skill gaps
        skill_gaps = self.analyze_skill_gaps(user_id)

        for gap in skill_gaps[:2]:  # Top 2 gaps
            tips.append({
                'category': 'skill_development',
                'tip': f"Focus on improving {gap['skill']}: {gap['improvement_tips'][0]}",
                'priority': 'high' if gap['gap'] > 1 else 'medium',
                'related_skill': gap['skill']
            })

        # Check burnout risk
        burnout = self.detect_burnout_risk(user_id)
        if burnout.get('risk_level') in ['medium', 'high']:
            tips.append({
                'category': 'wellbeing',
                'tip': 'Consider taking a short break to recharge.',
                'priority': 'high' if burnout['risk_level'] == 'high' else 'medium',
                'related_skill': None
            })

        # General tips based on role
        from app.models import User
        user = db.session.get(User, user_id)
        if user:
            if user.role == 'inspector':
                tips.append({
                    'category': 'efficiency',
                    'tip': 'Group inspections by location to save travel time.',
                    'priority': 'low',
                    'related_skill': 'Time Management'
                })
            elif user.role == 'specialist':
                tips.append({
                    'category': 'quality',
                    'tip': 'Document your repairs with photos for future reference.',
                    'priority': 'low',
                    'related_skill': 'Work Quality'
                })

        return tips

    def get_peer_comparison(self, user_id: int) -> Dict[str, Any]:
        """
        Get anonymous peer comparison (percentile ranking).

        Args:
            user_id: User ID

        Returns:
            Peer comparison with percentiles
        """
        from app.models import User, WorkPlanPerformance
        from sqlalchemy import func

        user = db.session.get(User, user_id)
        if not user:
            return {'error': 'User not found'}

        # Get user's latest performance
        user_perf = WorkPlanPerformance.query.filter(
            WorkPlanPerformance.user_id == user_id,
            WorkPlanPerformance.period_type == 'monthly'
        ).order_by(WorkPlanPerformance.period_start.desc()).first()

        if not user_perf:
            return {'message': 'No performance data available'}

        # Get all users' performance for comparison
        all_perfs = WorkPlanPerformance.query.filter(
            WorkPlanPerformance.period_type == 'monthly',
            WorkPlanPerformance.period_start == user_perf.period_start
        ).all()

        if len(all_perfs) < 2:
            return {'message': 'Not enough peers for comparison'}

        # Calculate percentiles
        def calculate_percentile(value, all_values):
            if not all_values:
                return 50
            below = sum(1 for v in all_values if v < value)
            return round((below / len(all_values)) * 100)

        completion_rates = [float(p.completion_rate or 0) for p in all_perfs]
        points = [p.total_points_earned or 0 for p in all_perfs]

        return {
            'user_id': user_id,
            'period': user_perf.period_start.isoformat(),
            'peer_count': len(all_perfs),
            'metrics': {
                'completion_rate': {
                    'value': float(user_perf.completion_rate or 0),
                    'percentile': calculate_percentile(
                        float(user_perf.completion_rate or 0),
                        completion_rates
                    )
                },
                'points_earned': {
                    'value': user_perf.total_points_earned or 0,
                    'percentile': calculate_percentile(
                        user_perf.total_points_earned or 0,
                        points
                    )
                }
            },
            'overall_percentile': calculate_percentile(
                user.total_points or 0,
                [u.total_points or 0 for u in User.query.filter_by(role=user.role, is_active=True).all()]
            ),
            'generated_at': datetime.utcnow().isoformat()
        }

    def suggest_learning_path(self, user_id: int) -> Dict[str, Any]:
        """
        Suggest personalized learning path based on skill gaps.

        Args:
            user_id: User ID

        Returns:
            Learning path with resources
        """
        from app.models import User

        user = db.session.get(User, user_id)
        if not user:
            return {'error': 'User not found'}

        skill_gaps = self.analyze_skill_gaps(user_id)

        learning_path = {
            'user_id': user_id,
            'user_name': user.full_name,
            'role': user.role,
            'modules': []
        }

        # Map skill gaps to learning modules
        skill_modules = {
            'Time Management': {
                'module': 'Effective Time Management',
                'duration': '2 hours',
                'topics': ['Task prioritization', 'Avoiding distractions', 'Planning techniques']
            },
            'Work Quality': {
                'module': 'Quality Excellence',
                'duration': '3 hours',
                'topics': ['Quality standards', 'Attention to detail', 'Self-inspection']
            },
            'Consistency': {
                'module': 'Building Work Consistency',
                'duration': '1.5 hours',
                'topics': ['Daily routines', 'Goal setting', 'Progress tracking']
            },
            'Workspace Cleanliness': {
                'module': '5S Workplace Organization',
                'duration': '1 hour',
                'topics': ['Sort, Set, Shine, Standardize, Sustain']
            }
        }

        for gap in skill_gaps:
            skill_name = gap['skill']
            if skill_name in skill_modules:
                module = skill_modules[skill_name].copy()
                module['priority'] = 'high' if gap['gap'] > 1.5 else 'medium'
                module['skill'] = skill_name
                learning_path['modules'].append(module)

        # Add role-specific modules
        role_modules = {
            'inspector': {
                'module': 'Advanced Inspection Techniques',
                'duration': '4 hours',
                'topics': ['Defect identification', 'Documentation', 'Safety protocols']
            },
            'specialist': {
                'module': 'Specialist Technical Skills',
                'duration': '4 hours',
                'topics': ['Troubleshooting', 'Repair techniques', 'Equipment knowledge']
            }
        }

        if user.role in role_modules:
            role_module = role_modules[user.role].copy()
            role_module['priority'] = 'medium'
            role_module['skill'] = 'Role-specific'
            learning_path['modules'].append(role_module)

        learning_path['total_duration'] = sum(
            float(m['duration'].split()[0]) for m in learning_path['modules']
        )

        return learning_path


# Singleton instance
performance_ai_service = PerformanceAIService()
