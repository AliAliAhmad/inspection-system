"""
Daily Review AI Service - AI-powered daily review features.
Provides rating suggestions, bias detection, and feedback generation.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta
from dataclasses import dataclass
from app.services.ai_base_service import (
    AIServiceWrapper, AnomalyDetector, ScoringUtils
)
from app.services.shared import PointCalculator, PointAction, NotificationPatterns
from app.extensions import db
import logging

logger = logging.getLogger(__name__)


@dataclass
class RatingSuggestion:
    """AI-suggested rating for a worker."""
    job_id: int
    user_id: int
    user_name: str
    suggested_qc_rating: int
    suggested_cleaning_rating: int
    confidence: float
    reasoning: str
    factors: List[Dict[str, Any]]


class DailyReviewAIService(AIServiceWrapper):
    """
    AI-powered daily review assistance.
    Suggests ratings, detects bias, generates feedback.
    """

    def __init__(self):
        super().__init__()
        self.point_calculator = PointCalculator()

    def suggest_ratings(self, review_id: int) -> List[Dict[str, Any]]:
        """
        Generate AI-suggested ratings for all jobs in a review.

        Args:
            review_id: Daily review ID

        Returns:
            List of rating suggestions per worker
        """
        from app.models import WorkPlanDailyReview, WorkPlanJob, WorkPlanJobTracking

        review = db.session.get(WorkPlanDailyReview, review_id)
        if not review:
            return []

        suggestions = []

        # Get all jobs for this review date
        jobs = WorkPlanJob.query.join(WorkPlanJobTracking).filter(
            WorkPlanJobTracking.date == review.date,
            WorkPlanJobTracking.shift == review.shift
        ).all()

        for job in jobs:
            if not job.tracking or job.tracking.status != 'completed':
                continue

            # Get workers assigned to this job
            for assignment in job.assignments:
                user = assignment.user
                if not user:
                    continue

                suggestion = self._generate_rating_suggestion(job, user)
                suggestions.append(suggestion)

        return suggestions

    def _generate_rating_suggestion(self, job, user) -> Dict[str, Any]:
        """Generate rating suggestion for a single worker on a job."""
        factors = []
        total_score = 0

        # Factor 1: Time efficiency
        if job.tracking and job.estimated_hours and job.tracking.actual_hours:
            efficiency = job.estimated_hours / max(job.tracking.actual_hours, 0.1)
            time_score = ScoringUtils.tiered_score(
                efficiency,
                [(0.5, 2), (0.8, 3), (1.0, 4), (1.2, 5)]
            )
            factors.append({
                'name': 'time_efficiency',
                'value': round(efficiency, 2),
                'contribution': time_score,
                'description': f'Completed in {efficiency:.0%} of estimated time'
            })
            total_score += time_score * 0.4

        # Factor 2: Historical performance
        historical_avg = self._get_user_historical_rating(user.id)
        if historical_avg:
            factors.append({
                'name': 'historical_performance',
                'value': historical_avg,
                'contribution': historical_avg,
                'description': f'Historical average: {historical_avg:.1f}/5'
            })
            total_score += historical_avg * 0.3

        # Factor 3: Job complexity
        job_type_multiplier = {'pm': 1.0, 'defect': 1.1, 'inspection': 0.9}
        complexity = job_type_multiplier.get(job.job_type, 1.0)
        factors.append({
            'name': 'job_complexity',
            'value': complexity,
            'contribution': 4 * complexity,
            'description': f'Job type: {job.job_type}'
        })
        total_score += 4 * complexity * 0.3

        # Calculate suggested ratings
        qc_rating = min(5, max(1, round(total_score)))
        cleaning_rating = 1 if qc_rating >= 4 else 0

        # Calculate confidence
        confidence = 0.5
        if len(factors) >= 3:
            confidence = 0.7
        if historical_avg:
            confidence += 0.15

        reasoning = self._generate_reasoning(factors, qc_rating)

        return {
            'job_id': job.id,
            'user_id': user.id,
            'user_name': user.full_name,
            'suggested_qc_rating': qc_rating,
            'suggested_cleaning_rating': cleaning_rating,
            'confidence': round(confidence, 2),
            'reasoning': reasoning,
            'factors': factors
        }

    def _get_user_historical_rating(self, user_id: int) -> Optional[float]:
        """Get user's historical average QC rating."""
        from app.models import WorkPlanJobRating
        from sqlalchemy import func

        result = db.session.query(
            func.avg(WorkPlanJobRating.qc_rating)
        ).filter(
            WorkPlanJobRating.user_id == user_id,
            WorkPlanJobRating.qc_rating.isnot(None)
        ).scalar()

        return float(result) if result else None

    def _generate_reasoning(self, factors: List[Dict], rating: int) -> str:
        """Generate human-readable reasoning for the rating."""
        parts = []

        for f in factors:
            if f['name'] == 'time_efficiency':
                if f['value'] >= 1.2:
                    parts.append('Completed ahead of schedule')
                elif f['value'] >= 1.0:
                    parts.append('On-time completion')
                else:
                    parts.append('Took longer than estimated')

            elif f['name'] == 'historical_performance':
                if f['value'] >= 4.0:
                    parts.append('Consistently high performer')
                elif f['value'] >= 3.0:
                    parts.append('Reliable performer')

        if rating >= 4:
            return 'Excellent work. ' + '. '.join(parts)
        elif rating >= 3:
            return 'Good work. ' + '. '.join(parts)
        else:
            return 'Needs improvement. ' + '. '.join(parts)

    def detect_rating_bias(self, engineer_id: int, days: int = 30) -> Dict[str, Any]:
        """
        Detect potential rating bias for an engineer.

        Args:
            engineer_id: Engineer who gives ratings
            days: Days to analyze

        Returns:
            Bias analysis with anomalies
        """
        from app.models import WorkPlanJobRating, WorkPlanDailyReview
        from sqlalchemy import func

        cutoff = datetime.utcnow() - timedelta(days=days)

        # Get ratings given by this engineer
        ratings = WorkPlanJobRating.query.join(WorkPlanDailyReview).filter(
            WorkPlanDailyReview.reviewed_by_id == engineer_id,
            WorkPlanJobRating.created_at >= cutoff
        ).all()

        if len(ratings) < 10:
            return {
                'has_sufficient_data': False,
                'message': 'Insufficient data for bias analysis',
                'sample_size': len(ratings)
            }

        # Analyze rating distribution
        qc_ratings = [r.qc_rating for r in ratings if r.qc_rating]

        if not qc_ratings:
            return {'has_sufficient_data': False, 'sample_size': 0}

        avg_rating = sum(qc_ratings) / len(qc_ratings)
        rating_dist = {}
        for r in qc_ratings:
            rating_dist[r] = rating_dist.get(r, 0) + 1

        # Detect anomalies
        anomalies = []

        # Check for too many high ratings (leniency bias)
        high_pct = (rating_dist.get(5, 0) + rating_dist.get(4, 0)) / len(qc_ratings)
        if high_pct > 0.8:
            anomalies.append({
                'type': 'leniency_bias',
                'severity': 'medium',
                'description': f'{high_pct:.0%} of ratings are 4 or 5 stars',
                'recommendation': 'Consider more critical evaluation'
            })

        # Check for too many low ratings (severity bias)
        low_pct = (rating_dist.get(1, 0) + rating_dist.get(2, 0)) / len(qc_ratings)
        if low_pct > 0.3:
            anomalies.append({
                'type': 'severity_bias',
                'severity': 'medium',
                'description': f'{low_pct:.0%} of ratings are 1 or 2 stars',
                'recommendation': 'Review rating criteria'
            })

        # Check for central tendency (always giving 3)
        middle_pct = rating_dist.get(3, 0) / len(qc_ratings)
        if middle_pct > 0.5:
            anomalies.append({
                'type': 'central_tendency',
                'severity': 'low',
                'description': f'{middle_pct:.0%} of ratings are exactly 3 stars',
                'recommendation': 'Differentiate between performance levels'
            })

        return {
            'has_sufficient_data': True,
            'engineer_id': engineer_id,
            'sample_size': len(qc_ratings),
            'average_rating': round(avg_rating, 2),
            'distribution': rating_dist,
            'anomalies': anomalies,
            'has_bias': len(anomalies) > 0,
            'analyzed_at': datetime.utcnow().isoformat()
        }

    def generate_feedback_summary(self, user_id: int, period: str = 'weekly') -> Dict[str, Any]:
        """
        Generate feedback summary for a worker.

        Args:
            user_id: Worker user ID
            period: 'daily', 'weekly', or 'monthly'

        Returns:
            Feedback summary with insights
        """
        from app.models import WorkPlanJobRating, User
        from sqlalchemy import func

        user = db.session.get(User, user_id)
        if not user:
            return {'error': 'User not found'}

        # Calculate date range
        if period == 'daily':
            start_date = date.today()
        elif period == 'weekly':
            start_date = date.today() - timedelta(days=7)
        else:
            start_date = date.today() - timedelta(days=30)

        # Get ratings
        ratings = WorkPlanJobRating.query.filter(
            WorkPlanJobRating.user_id == user_id,
            WorkPlanJobRating.created_at >= datetime.combine(start_date, datetime.min.time())
        ).all()

        if not ratings:
            return {
                'user_id': user_id,
                'user_name': user.full_name,
                'period': period,
                'message': 'No ratings in this period',
                'jobs_completed': 0
            }

        # Calculate stats
        qc_ratings = [r.qc_rating for r in ratings if r.qc_rating]
        cleaning_ratings = [r.cleaning_rating for r in ratings if r.cleaning_rating is not None]

        avg_qc = sum(qc_ratings) / len(qc_ratings) if qc_ratings else 0
        avg_cleaning = sum(cleaning_ratings) / len(cleaning_ratings) if cleaning_ratings else 0

        # Generate feedback
        feedback_points = []

        if avg_qc >= 4.5:
            feedback_points.append('Outstanding quality work this period!')
        elif avg_qc >= 4.0:
            feedback_points.append('Great quality ratings - keep it up!')
        elif avg_qc >= 3.0:
            feedback_points.append('Good work, with room for improvement.')
        else:
            feedback_points.append('Quality ratings need attention.')

        if avg_cleaning >= 1.5:
            feedback_points.append('Excellent attention to cleanliness.')

        # Streak info
        streak = self._get_user_streak(user_id)
        if streak and streak > 5:
            feedback_points.append(f'Great {streak}-day completion streak!')

        return {
            'user_id': user_id,
            'user_name': user.full_name,
            'period': period,
            'start_date': start_date.isoformat(),
            'jobs_completed': len(ratings),
            'average_qc_rating': round(avg_qc, 2),
            'average_cleaning_rating': round(avg_cleaning, 2),
            'feedback': feedback_points,
            'generated_at': datetime.utcnow().isoformat()
        }

    def _get_user_streak(self, user_id: int) -> int:
        """Get user's current completion streak."""
        from app.models import WorkPlanJobTracking
        from sqlalchemy import func

        # Simple streak calculation
        result = db.session.query(
            func.count(WorkPlanJobTracking.id)
        ).filter(
            WorkPlanJobTracking.status == 'completed',
            WorkPlanJobTracking.completed_at >= datetime.utcnow() - timedelta(days=30)
        ).scalar()

        return result or 0

    def predict_incomplete_jobs(self, target_date: date = None) -> List[Dict[str, Any]]:
        """Predict which jobs might not be completed."""
        from app.models import WorkPlanJob, WorkPlanJobTracking, WorkPlanDay

        target_date = target_date or date.today()

        # Get jobs for target date
        jobs = WorkPlanJob.query.join(WorkPlanDay).filter(
            WorkPlanDay.date == target_date
        ).all()

        predictions = []

        for job in jobs:
            risk_factors = []
            risk_score = 0

            # Factor 1: Not started yet
            if not job.tracking or job.tracking.status == 'pending':
                now = datetime.utcnow()
                if now.hour >= 14:  # After 2 PM
                    risk_factors.append('Not started, late in the day')
                    risk_score += 30

            # Factor 2: Long estimated time
            if job.estimated_hours and job.estimated_hours > 6:
                risk_factors.append('Long job (6+ hours)')
                risk_score += 20

            # Factor 3: Worker history
            for assignment in job.assignments:
                if assignment.user:
                    completion_rate = self._get_worker_completion_rate(assignment.user_id)
                    if completion_rate and completion_rate < 0.8:
                        risk_factors.append(f'Worker completion rate: {completion_rate:.0%}')
                        risk_score += 25

            if risk_score > 20:
                predictions.append({
                    'job_id': job.id,
                    'job_type': job.job_type,
                    'equipment_name': job.equipment.name if job.equipment else 'Unknown',
                    'risk_score': risk_score,
                    'risk_factors': risk_factors,
                    'prediction': 'high_risk' if risk_score > 50 else 'medium_risk'
                })

        return sorted(predictions, key=lambda x: x['risk_score'], reverse=True)

    def _get_worker_completion_rate(self, user_id: int) -> Optional[float]:
        """Get worker's job completion rate."""
        from app.models import WorkPlanJobAssignment, WorkPlanJobTracking
        from sqlalchemy import func

        total = WorkPlanJobAssignment.query.filter_by(user_id=user_id).count()
        if total == 0:
            return None

        completed = WorkPlanJobAssignment.query.join(
            WorkPlanJobTracking,
            WorkPlanJobAssignment.job_id == WorkPlanJobTracking.job_id
        ).filter(
            WorkPlanJobAssignment.user_id == user_id,
            WorkPlanJobTracking.status == 'completed'
        ).count()

        return completed / total if total > 0 else None

    def analyze_time_accuracy(self, days: int = 30) -> Dict[str, Any]:
        """Analyze time estimation accuracy."""
        from app.models import WorkPlanJob, WorkPlanJobTracking
        from sqlalchemy import func

        cutoff = datetime.utcnow() - timedelta(days=days)

        # Get completed jobs with time data
        jobs = WorkPlanJob.query.join(WorkPlanJobTracking).filter(
            WorkPlanJobTracking.status == 'completed',
            WorkPlanJobTracking.completed_at >= cutoff,
            WorkPlanJob.estimated_hours.isnot(None),
            WorkPlanJobTracking.actual_hours.isnot(None)
        ).all()

        if not jobs:
            return {'message': 'No data available', 'sample_size': 0}

        # Calculate accuracy metrics
        by_job_type = {}
        total_variance = 0
        overruns = []

        for job in jobs:
            estimated = float(job.estimated_hours)
            actual = float(job.tracking.actual_hours)
            variance = (actual - estimated) / estimated if estimated > 0 else 0

            total_variance += abs(variance)

            # By job type
            jt = job.job_type or 'other'
            if jt not in by_job_type:
                by_job_type[jt] = {'count': 0, 'total_variance': 0}
            by_job_type[jt]['count'] += 1
            by_job_type[jt]['total_variance'] += abs(variance)

            # Track overruns
            if variance > 0.2:  # >20% overrun
                overruns.append({
                    'job_id': job.id,
                    'job_type': job.job_type,
                    'variance': round(variance * 100, 1)
                })

        # Calculate overall accuracy
        avg_variance = total_variance / len(jobs)
        overall_accuracy = max(0, 1 - avg_variance)

        # Calculate by job type
        for jt in by_job_type:
            by_job_type[jt]['accuracy'] = round(
                max(0, 1 - by_job_type[jt]['total_variance'] / by_job_type[jt]['count']),
                2
            )

        return {
            'overall_accuracy': round(overall_accuracy, 2),
            'sample_size': len(jobs),
            'by_job_type': by_job_type,
            'common_overruns': sorted(overruns, key=lambda x: x['variance'], reverse=True)[:5],
            'analyzed_at': datetime.utcnow().isoformat()
        }


# Singleton instance
daily_review_ai_service = DailyReviewAIService()
