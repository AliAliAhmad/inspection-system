"""
Leave AI Service - AI-powered leave management intelligence.
Provides predictions, optimization, analysis, automation, and insights for leave management.
"""

import logging
import json
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Any, Tuple
from collections import Counter, defaultdict
from functools import lru_cache
import hashlib

from sqlalchemy import func, and_, or_, extract
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models import (
    Leave, User, WorkPlanJob, WorkPlanAssignment, WorkPlanDay, WorkPlan
)
from app.models.leave_blackout import LeaveBlackout
from app.models.leave_policy import LeavePolicy
from app.services.openai_service import ReportService

logger = logging.getLogger(__name__)


# Simple in-memory cache with expiration
_cache: Dict[str, Tuple[Any, datetime]] = {}
CACHE_EXPIRY_HOURS = 1


def _get_cache(key: str) -> Optional[Any]:
    """Get cached value if not expired."""
    if key in _cache:
        value, expiry = _cache[key]
        if datetime.utcnow() < expiry:
            return value
        del _cache[key]
    return None


def _set_cache(key: str, value: Any, hours: int = CACHE_EXPIRY_HOURS) -> None:
    """Set cache with expiration."""
    expiry = datetime.utcnow() + timedelta(hours=hours)
    _cache[key] = (value, expiry)


def _cache_key(*args) -> str:
    """Generate cache key from arguments."""
    return hashlib.md5(str(args).encode()).hexdigest()


class LeaveAIService:
    """AI-powered leave management intelligence."""

    def __init__(self):
        self.openai_service = ReportService()

    # ========================================
    # PREDICTION METHODS
    # ========================================

    def predict_leave_probability(self, user_id: int, date_range: Tuple[date, date]) -> Dict[str, Any]:
        """
        Predict likelihood of user taking leave in given period.
        Based on: historical patterns, upcoming holidays, workload, team leaves.

        Args:
            user_id: User to predict for
            date_range: Tuple of (start_date, end_date)

        Returns:
            {probability: 0-100, factors: [...], suggested_coverage: user_id}
        """
        user = db.session.get(User, user_id)
        if not user:
            return {'error': 'User not found', 'probability': 0, 'factors': []}

        start_date, end_date = date_range
        factors = []
        probability = 0.0

        # Get user's leave history
        leaves = Leave.query.filter(
            Leave.user_id == user_id,
            Leave.status == 'approved'
        ).all()

        if not leaves:
            return {
                'probability': 10,
                'factors': ['No historical leave data available'],
                'suggested_coverage': None,
                'confidence': 'low'
            }

        # Factor 1: Historical pattern for this time period (40% weight)
        historical_leaves_in_period = [
            leave for leave in leaves
            if (leave.date_from.month == start_date.month or
                leave.date_to.month == end_date.month)
        ]
        if historical_leaves_in_period:
            history_score = min(len(historical_leaves_in_period) * 15, 40)
            probability += history_score
            factors.append(f'Historical: User has taken leave {len(historical_leaves_in_period)} time(s) during this period in past years')

        # Factor 2: Days since last leave (20% weight)
        last_leave = Leave.query.filter(
            Leave.user_id == user_id,
            Leave.status == 'approved',
            Leave.date_to <= date.today()
        ).order_by(Leave.date_to.desc()).first()

        if last_leave:
            days_since = (date.today() - last_leave.date_to).days
            if days_since > 90:
                probability += 20
                factors.append(f'Overdue: {days_since} days since last leave')
            elif days_since > 60:
                probability += 12
                factors.append(f'Extended period: {days_since} days since last leave')
            elif days_since > 30:
                probability += 5
                factors.append(f'Normal period: {days_since} days since last leave')

        # Factor 3: Upcoming blackout check (10% weight)
        # Users often take leave before blackout periods
        upcoming_blackouts = LeaveBlackout.query.filter(
            LeaveBlackout.is_active == True,
            LeaveBlackout.date_from > date.today(),
            LeaveBlackout.date_from <= start_date + timedelta(days=30)
        ).all()

        for blackout in upcoming_blackouts:
            if blackout.applies_to_user(user):
                probability += 10
                factors.append(f'Upcoming blackout: {blackout.name} starting {blackout.date_from}')
                break

        # Factor 4: Remaining leave balance (15% weight)
        remaining_balance = self._calculate_remaining_balance(user_id)
        if remaining_balance > 15:
            probability += 15
            factors.append(f'High balance: {remaining_balance} days remaining')
        elif remaining_balance > 10:
            probability += 8
            factors.append(f'Moderate balance: {remaining_balance} days remaining')

        # Factor 5: Day of week pattern (15% weight)
        # Check if the date range includes days user frequently takes off
        dow_counter = Counter()
        for leave in leaves:
            current = leave.date_from
            while current <= leave.date_to:
                dow_counter[current.strftime('%A')] += 1
                current += timedelta(days=1)

        if dow_counter:
            most_common_day = dow_counter.most_common(1)[0]
            current = start_date
            while current <= end_date:
                if current.strftime('%A') == most_common_day[0]:
                    probability += 15
                    factors.append(f'Pattern: User frequently takes {most_common_day[0]}s off')
                    break
                current += timedelta(days=1)

        # Suggest coverage
        suggested_coverage = self._suggest_coverage_user(user_id)

        return {
            'probability': min(round(probability), 100),
            'factors': factors,
            'suggested_coverage': suggested_coverage,
            'confidence': 'high' if len(leaves) > 5 else 'medium' if len(leaves) > 2 else 'low',
            'historical_leaves_analyzed': len(leaves),
            'date_range': {
                'from': start_date.isoformat(),
                'to': end_date.isoformat()
            }
        }

    def forecast_team_capacity(self, team_role: str, days_ahead: int = 30) -> List[Dict[str, Any]]:
        """
        Forecast daily team availability for next N days.

        Args:
            team_role: Role to forecast (inspector, specialist, engineer, etc.)
            days_ahead: Number of days to forecast

        Returns:
            [{date, total, predicted_available, confidence, risk_level}]
        """
        cache_key = _cache_key('team_capacity', team_role, days_ahead)
        cached = _get_cache(cache_key)
        if cached:
            return cached

        # Get all active users with this role
        team_members = User.query.filter(
            or_(User.role == team_role, User.minor_role == team_role),
            User.is_active == True
        ).all()

        total_team = len(team_members)
        if total_team == 0:
            return []

        user_ids = [u.id for u in team_members]
        today = date.today()
        forecast = []

        for day_offset in range(days_ahead):
            forecast_date = today + timedelta(days=day_offset)

            # Get approved leaves for this date
            leaves_on_date = Leave.query.filter(
                Leave.user_id.in_(user_ids),
                Leave.status == 'approved',
                Leave.date_from <= forecast_date,
                Leave.date_to >= forecast_date
            ).count()

            # Get pending leaves (probability-weighted)
            pending_leaves = Leave.query.filter(
                Leave.user_id.in_(user_ids),
                Leave.status == 'pending',
                Leave.date_from <= forecast_date,
                Leave.date_to >= forecast_date
            ).count()

            # Predicted unavailable = approved + (pending * 0.5 probability)
            predicted_unavailable = leaves_on_date + (pending_leaves * 0.5)
            predicted_available = max(total_team - predicted_unavailable, 0)

            # Calculate confidence based on how far in the future
            if day_offset <= 7:
                confidence = 'high'
            elif day_offset <= 14:
                confidence = 'medium'
            else:
                confidence = 'low'

            # Determine risk level
            availability_pct = predicted_available / total_team * 100
            if availability_pct < 50:
                risk_level = 'critical'
            elif availability_pct < 70:
                risk_level = 'high'
            elif availability_pct < 85:
                risk_level = 'medium'
            else:
                risk_level = 'low'

            forecast.append({
                'date': forecast_date.isoformat(),
                'day_of_week': forecast_date.strftime('%A'),
                'total': total_team,
                'approved_leaves': leaves_on_date,
                'pending_leaves': pending_leaves,
                'predicted_available': round(predicted_available, 1),
                'availability_percentage': round(availability_pct, 1),
                'confidence': confidence,
                'risk_level': risk_level
            })

        _set_cache(cache_key, forecast)
        return forecast

    def predict_approval_time(self, leave_id: int) -> Dict[str, Any]:
        """
        Estimate when leave request will be processed.

        Args:
            leave_id: Leave request ID

        Returns:
            {estimated_hours, based_on: 'avg_approval_time', confidence}
        """
        leave = db.session.get(Leave, leave_id)
        if not leave:
            return {'error': 'Leave not found'}

        if leave.status != 'pending':
            return {
                'estimated_hours': 0,
                'based_on': 'already_processed',
                'confidence': 'certain',
                'status': leave.status
            }

        # Calculate average approval time from historical data
        approved_leaves = Leave.query.filter(
            Leave.status.in_(['approved', 'rejected']),
            Leave.approved_at.isnot(None)
        ).order_by(Leave.approved_at.desc()).limit(100).all()

        if not approved_leaves:
            return {
                'estimated_hours': 24,  # Default estimate
                'based_on': 'default_estimate',
                'confidence': 'low'
            }

        approval_times = []
        for l in approved_leaves:
            if l.created_at and l.approved_at:
                delta = l.approved_at - l.created_at
                hours = delta.total_seconds() / 3600
                if hours > 0 and hours < 720:  # Exclude outliers (>30 days)
                    approval_times.append(hours)

        if not approval_times:
            return {
                'estimated_hours': 24,
                'based_on': 'default_estimate',
                'confidence': 'low'
            }

        avg_hours = sum(approval_times) / len(approval_times)
        median_hours = sorted(approval_times)[len(approval_times) // 2]

        # Adjust based on factors
        adjustment = 0

        # Admin workload factor
        pending_count = Leave.query.filter_by(status='pending').count()
        if pending_count > 10:
            adjustment += pending_count * 0.5  # Add 30 min per pending request

        # Day of week factor (weekends may delay)
        if datetime.utcnow().weekday() >= 4:  # Friday or later
            adjustment += 48  # Weekend delay

        estimated = median_hours + adjustment

        return {
            'estimated_hours': round(estimated, 1),
            'estimated_date': (datetime.utcnow() + timedelta(hours=estimated)).isoformat(),
            'based_on': 'historical_average',
            'historical_average_hours': round(avg_hours, 1),
            'historical_median_hours': round(median_hours, 1),
            'pending_requests_in_queue': pending_count,
            'samples_analyzed': len(approval_times),
            'confidence': 'high' if len(approval_times) > 50 else 'medium' if len(approval_times) > 20 else 'low'
        }

    # ========================================
    # OPTIMIZATION METHODS
    # ========================================

    def suggest_optimal_coverage(self, leave_id: int) -> List[Dict[str, Any]]:
        """
        AI-ranked coverage suggestions with scoring.
        Factors: workload, skills match, previous coverage success, shift compatibility.

        Args:
            leave_id: Leave request ID

        Returns:
            [{user_id, score, reasons: [...], workload_impact}]
        """
        leave = db.session.get(Leave, leave_id)
        if not leave:
            return []

        user = db.session.get(User, leave.user_id)
        if not user:
            return []

        # Find potential coverage users based on cross-role rules
        # Inspectors covered by specialists, specialists covered by inspectors
        if user.role == 'inspector':
            coverage_role = 'specialist'
        elif user.role == 'specialist':
            coverage_role = 'inspector'
        else:
            # For other roles, find same role users
            coverage_role = user.role

        # Get eligible coverage users
        potential_users = User.query.filter(
            User.role == coverage_role,
            User.is_active == True,
            User.id != user.id,
            User.is_on_leave == False
        )

        # Match specialization if applicable
        if user.specialization:
            potential_users = potential_users.filter(
                User.specialization == user.specialization
            )

        potential_users = potential_users.all()

        if not potential_users:
            return []

        suggestions = []

        for candidate in potential_users:
            score = 100.0
            reasons = []

            # Factor 1: Check if candidate has overlapping leaves (-50 points)
            overlapping_leave = Leave.query.filter(
                Leave.user_id == candidate.id,
                Leave.status.in_(['pending', 'approved']),
                Leave.date_from <= leave.date_to,
                Leave.date_to >= leave.date_from
            ).first()

            if overlapping_leave:
                score -= 100  # Disqualify
                reasons.append('Has overlapping leave')
                continue

            # Factor 2: Workload during leave period (-0-30 points)
            workload = self._calculate_workload(candidate.id, leave.date_from, leave.date_to)
            if workload['total_jobs'] > 5:
                score -= 30
                reasons.append(f'High workload: {workload["total_jobs"]} jobs')
            elif workload['total_jobs'] > 3:
                score -= 15
                reasons.append(f'Moderate workload: {workload["total_jobs"]} jobs')
            else:
                reasons.append(f'Low workload: {workload["total_jobs"]} jobs')

            # Factor 3: Previous coverage success (+0-20 points)
            previous_coverage = Leave.query.filter(
                Leave.coverage_user_id == candidate.id,
                Leave.status == 'approved',
                Leave.date_to < date.today()
            ).count()

            if previous_coverage > 3:
                score += 20
                reasons.append(f'Experienced: {previous_coverage} previous coverage assignments')
            elif previous_coverage > 0:
                score += 10
                reasons.append(f'{previous_coverage} previous coverage assignment(s)')

            # Factor 4: Shift compatibility (+0-15 points)
            if candidate.shift == user.shift:
                score += 15
                reasons.append('Same shift')
            elif candidate.shift:
                score -= 10
                reasons.append(f'Different shift: {candidate.shift}')

            # Factor 5: Recent coverage load (-0-20 points)
            # Check if they've covered too much recently
            recent_coverage = Leave.query.filter(
                Leave.coverage_user_id == candidate.id,
                Leave.status == 'approved',
                Leave.date_from >= date.today() - timedelta(days=30)
            ).count()

            if recent_coverage > 2:
                score -= 20
                reasons.append(f'Heavy recent coverage: {recent_coverage} in last 30 days')
            elif recent_coverage > 0:
                score -= 5
                reasons.append(f'{recent_coverage} coverage in last 30 days')
            else:
                score += 5
                reasons.append('No recent coverage assignments')

            # Factor 6: Specialization match (+10 points)
            if user.specialization and candidate.specialization == user.specialization:
                score += 10
                reasons.append(f'Matching specialization: {user.specialization}')

            suggestions.append({
                'user_id': candidate.id,
                'user_name': candidate.full_name,
                'role': candidate.role,
                'specialization': candidate.specialization,
                'shift': candidate.shift,
                'score': max(round(score, 1), 0),
                'reasons': reasons,
                'workload_impact': workload,
                'previous_coverage_count': previous_coverage
            })

        # Sort by score descending
        suggestions.sort(key=lambda x: x['score'], reverse=True)

        return suggestions[:10]  # Top 10 suggestions

    def suggest_alternative_dates(
        self,
        user_id: int,
        requested_from: date,
        requested_to: date
    ) -> List[Dict[str, Any]]:
        """
        If conflict exists, suggest alternative date ranges.

        Args:
            user_id: User requesting leave
            requested_from: Originally requested start date
            requested_to: Originally requested end date

        Returns:
            [{from, to, reason, team_impact_score, approval_likelihood}]
        """
        user = db.session.get(User, user_id)
        if not user:
            return []

        duration = (requested_to - requested_from).days + 1
        suggestions = []

        # Check 4 weeks before and after the requested period
        for offset in range(-28, 29, 7):  # Weekly intervals
            if offset == 0:
                continue

            alt_from = requested_from + timedelta(days=offset)
            alt_to = alt_from + timedelta(days=duration - 1)

            # Skip if in the past
            if alt_from < date.today():
                continue

            # Check for blackouts
            blackout = LeaveBlackout.query.filter(
                LeaveBlackout.is_active == True,
                LeaveBlackout.date_from <= alt_to,
                LeaveBlackout.date_to >= alt_from
            ).first()

            if blackout and blackout.applies_to_user(user):
                continue

            # Check for overlapping leaves
            existing_leave = Leave.query.filter(
                Leave.user_id == user_id,
                Leave.status.in_(['pending', 'approved']),
                Leave.date_from <= alt_to,
                Leave.date_to >= alt_from
            ).first()

            if existing_leave:
                continue

            # Calculate team impact
            team_impact = self._calculate_team_impact(user, alt_from, alt_to)

            # Calculate approval likelihood
            coverage_options = len(self.suggest_optimal_coverage_for_dates(user_id, alt_from, alt_to))
            if coverage_options >= 3:
                approval_likelihood = 'high'
            elif coverage_options >= 1:
                approval_likelihood = 'medium'
            else:
                approval_likelihood = 'low'

            reason = []
            if offset < 0:
                reason.append(f'{abs(offset)} days earlier')
            else:
                reason.append(f'{offset} days later')

            if team_impact['score'] < 30:
                reason.append('Low team impact')
            elif team_impact['score'] < 60:
                reason.append('Moderate team impact')

            suggestions.append({
                'from': alt_from.isoformat(),
                'to': alt_to.isoformat(),
                'duration_days': duration,
                'reason': ', '.join(reason),
                'team_impact_score': team_impact['score'],
                'team_impact_details': team_impact['details'],
                'approval_likelihood': approval_likelihood,
                'coverage_options_count': coverage_options
            })

        # Sort by team impact score (lower is better)
        suggestions.sort(key=lambda x: x['team_impact_score'])

        return suggestions[:5]  # Top 5 alternatives

    def optimize_coverage_distribution(
        self,
        period_start: date,
        period_end: date
    ) -> Dict[str, Any]:
        """
        Balance coverage assignments across team.

        Args:
            period_start: Start of analysis period
            period_end: End of analysis period

        Returns:
            {recommendations: [{current_user, suggested_user, reason}], fairness_score}
        """
        # Get all approved leaves in period with coverage
        leaves = Leave.query.filter(
            Leave.status == 'approved',
            Leave.date_from >= period_start,
            Leave.date_to <= period_end,
            Leave.coverage_user_id.isnot(None)
        ).all()

        if not leaves:
            return {
                'recommendations': [],
                'fairness_score': 100,
                'message': 'No leaves with coverage in this period'
            }

        # Count coverage per user
        coverage_counts = Counter()
        coverage_days = defaultdict(int)

        for leave in leaves:
            coverage_counts[leave.coverage_user_id] += 1
            coverage_days[leave.coverage_user_id] += leave.total_days

        if not coverage_counts:
            return {
                'recommendations': [],
                'fairness_score': 100,
                'message': 'No coverage assignments found'
            }

        # Calculate fairness metrics
        counts = list(coverage_counts.values())
        avg_coverage = sum(counts) / len(counts)
        max_coverage = max(counts)
        min_coverage = min(counts)

        # Fairness score: 100 - (variance from average)
        variance = sum((c - avg_coverage) ** 2 for c in counts) / len(counts)
        fairness_score = max(0, 100 - (variance * 10))

        recommendations = []

        # Identify overloaded and underloaded users
        overloaded = [(uid, count) for uid, count in coverage_counts.items() if count > avg_coverage * 1.5]
        underloaded = [(uid, count) for uid, count in coverage_counts.items() if count < avg_coverage * 0.5]

        for over_uid, over_count in overloaded:
            over_user = db.session.get(User, over_uid)
            if not over_user:
                continue

            for under_uid, under_count in underloaded:
                under_user = db.session.get(User, under_uid)
                if not under_user:
                    continue

                # Check compatibility
                if over_user.specialization == under_user.specialization:
                    recommendations.append({
                        'current_user_id': over_uid,
                        'current_user_name': over_user.full_name,
                        'current_coverage_count': over_count,
                        'suggested_user_id': under_uid,
                        'suggested_user_name': under_user.full_name,
                        'suggested_coverage_count': under_count,
                        'reason': f'Rebalance coverage: {over_user.full_name} has {over_count} assignments vs {under_user.full_name} with {under_count}'
                    })

        # Build distribution summary
        distribution = []
        for uid, count in sorted(coverage_counts.items(), key=lambda x: x[1], reverse=True):
            user = db.session.get(User, uid)
            if user:
                distribution.append({
                    'user_id': uid,
                    'user_name': user.full_name,
                    'coverage_count': count,
                    'coverage_days': coverage_days[uid],
                    'status': 'overloaded' if count > avg_coverage * 1.5 else 'underloaded' if count < avg_coverage * 0.5 else 'balanced'
                })

        return {
            'recommendations': recommendations,
            'fairness_score': round(fairness_score, 1),
            'statistics': {
                'total_leaves': len(leaves),
                'unique_coverage_users': len(coverage_counts),
                'average_coverage_per_user': round(avg_coverage, 1),
                'max_coverage': max_coverage,
                'min_coverage': min_coverage
            },
            'distribution': distribution,
            'period': {
                'from': period_start.isoformat(),
                'to': period_end.isoformat()
            }
        }

    # ========================================
    # ANALYSIS METHODS
    # ========================================

    def analyze_leave_patterns(
        self,
        user_id: int = None,
        department: str = None
    ) -> Dict[str, Any]:
        """
        Detect patterns in leave usage.

        Args:
            user_id: Specific user (optional)
            department: Filter by role/department (optional)

        Returns:
            {
                frequent_days: ['Monday', 'Friday'],
                seasonal_peaks: ['December', 'August'],
                avg_duration: float,
                short_notice_rate: float,
                patterns: [{type, description, frequency}]
            }
        """
        cache_key = _cache_key('leave_patterns', user_id, department)
        cached = _get_cache(cache_key)
        if cached:
            return cached

        # Build query
        query = Leave.query.filter(Leave.status == 'approved')

        if user_id:
            query = query.filter(Leave.user_id == user_id)
        elif department:
            query = query.join(User).filter(User.role == department)

        leaves = query.all()

        if not leaves:
            return {
                'frequent_days': [],
                'seasonal_peaks': [],
                'avg_duration': 0,
                'short_notice_rate': 0,
                'patterns': [],
                'message': 'No leave data available'
            }

        # Analyze day of week patterns
        dow_counter = Counter()
        for leave in leaves:
            current = leave.date_from
            while current <= leave.date_to:
                dow_counter[current.strftime('%A')] += 1
                current += timedelta(days=1)

        total_days = sum(dow_counter.values())
        frequent_days = [
            day for day, count in dow_counter.most_common()
            if count > total_days / 7 * 1.3  # 30% above average
        ][:3]

        # Analyze monthly/seasonal patterns
        month_counter = Counter()
        for leave in leaves:
            month_counter[leave.date_from.strftime('%B')] += 1

        avg_monthly = len(leaves) / 12
        seasonal_peaks = [
            month for month, count in month_counter.most_common()
            if count > avg_monthly * 1.5  # 50% above average
        ][:3]

        # Calculate average duration
        durations = [leave.total_days for leave in leaves]
        avg_duration = sum(durations) / len(durations) if durations else 0

        # Calculate short notice rate
        short_notice_count = 0
        for leave in leaves:
            if leave.created_at and leave.date_from:
                notice_days = (leave.date_from - leave.created_at.date()).days
                if notice_days < 3:
                    short_notice_count += 1

        short_notice_rate = (short_notice_count / len(leaves) * 100) if leaves else 0

        # Detect specific patterns
        patterns = []

        # Pattern: Monday/Friday tendency (long weekends)
        monday_friday_pct = (dow_counter.get('Monday', 0) + dow_counter.get('Friday', 0)) / total_days * 100 if total_days > 0 else 0
        if monday_friday_pct > 35:  # Normal would be ~28.5%
            patterns.append({
                'type': 'long_weekend_tendency',
                'description': 'User tends to take leaves on Mondays and Fridays (long weekend pattern)',
                'frequency': f'{monday_friday_pct:.1f}% of leave days',
                'severity': 'info'
            })

        # Pattern: End of year spike
        if month_counter.get('December', 0) > avg_monthly * 2:
            patterns.append({
                'type': 'year_end_spike',
                'description': 'Significant spike in December leave usage',
                'frequency': f'{month_counter["December"]} leaves in December',
                'severity': 'info'
            })

        # Pattern: Frequent short leaves
        short_leaves = sum(1 for d in durations if d <= 2)
        if short_leaves / len(leaves) > 0.6:
            patterns.append({
                'type': 'frequent_short_leaves',
                'description': 'Majority of leaves are 1-2 days (possible pattern indicator)',
                'frequency': f'{short_leaves / len(leaves) * 100:.1f}% are short leaves',
                'severity': 'medium'
            })

        # Leave type distribution
        type_counter = Counter(leave.leave_type for leave in leaves)

        result = {
            'frequent_days': frequent_days,
            'seasonal_peaks': seasonal_peaks,
            'avg_duration': round(avg_duration, 1),
            'short_notice_rate': round(short_notice_rate, 1),
            'patterns': patterns,
            'day_distribution': dict(dow_counter),
            'month_distribution': dict(month_counter),
            'type_distribution': dict(type_counter),
            'total_leaves_analyzed': len(leaves),
            'total_days_taken': sum(durations)
        }

        _set_cache(cache_key, result)
        return result

    def detect_burnout_risk(self, user_id: int) -> Dict[str, Any]:
        """
        Identify employees at risk of burnout.
        Factors: days since last leave, overtime hours, workload, performance trends.

        Args:
            user_id: User to analyze

        Returns:
            {risk_level: 'low'|'medium'|'high', factors: [...], recommendation}
        """
        user = db.session.get(User, user_id)
        if not user:
            return {'error': 'User not found'}

        factors = []
        risk_score = 0

        # Factor 1: Days since last leave (max 30 points)
        last_leave = Leave.query.filter(
            Leave.user_id == user_id,
            Leave.status == 'approved',
            Leave.date_to < date.today()
        ).order_by(Leave.date_to.desc()).first()

        if last_leave:
            days_since = (date.today() - last_leave.date_to).days
            if days_since > 120:
                risk_score += 30
                factors.append({
                    'factor': 'Extended work period',
                    'description': f'{days_since} days since last leave',
                    'severity': 'high'
                })
            elif days_since > 90:
                risk_score += 20
                factors.append({
                    'factor': 'Long work period',
                    'description': f'{days_since} days since last leave',
                    'severity': 'medium'
                })
            elif days_since > 60:
                risk_score += 10
                factors.append({
                    'factor': 'Moderate work period',
                    'description': f'{days_since} days since last leave',
                    'severity': 'low'
                })
        else:
            # Never took leave
            risk_score += 30
            factors.append({
                'factor': 'No leave history',
                'description': 'User has never taken leave',
                'severity': 'high'
            })

        # Factor 2: Workload analysis (max 25 points)
        thirty_days_ago = date.today() - timedelta(days=30)
        workload = WorkPlanAssignment.query.join(WorkPlanJob).join(WorkPlanDay).filter(
            WorkPlanAssignment.user_id == user_id,
            WorkPlanDay.day_date >= thirty_days_ago
        ).count()

        if workload > 40:  # More than ~1.3 jobs per day
            risk_score += 25
            factors.append({
                'factor': 'Heavy workload',
                'description': f'{workload} job assignments in last 30 days',
                'severity': 'high'
            })
        elif workload > 25:
            risk_score += 15
            factors.append({
                'factor': 'Elevated workload',
                'description': f'{workload} job assignments in last 30 days',
                'severity': 'medium'
            })

        # Factor 3: Coverage load (max 20 points)
        coverage_count = Leave.query.filter(
            Leave.coverage_user_id == user_id,
            Leave.status == 'approved',
            Leave.date_from >= thirty_days_ago
        ).count()

        if coverage_count > 3:
            risk_score += 20
            factors.append({
                'factor': 'High coverage load',
                'description': f'Covered for {coverage_count} colleagues in last 30 days',
                'severity': 'high'
            })
        elif coverage_count > 1:
            risk_score += 10
            factors.append({
                'factor': 'Coverage duties',
                'description': f'Covered for {coverage_count} colleague(s) in last 30 days',
                'severity': 'low'
            })

        # Factor 4: Leave balance utilization (max 15 points)
        remaining_balance = self._calculate_remaining_balance(user_id)
        if remaining_balance > 20:
            risk_score += 15
            factors.append({
                'factor': 'Unused leave balance',
                'description': f'{remaining_balance} days unused leave accumulated',
                'severity': 'medium'
            })
        elif remaining_balance > 15:
            risk_score += 8
            factors.append({
                'factor': 'Moderate leave balance',
                'description': f'{remaining_balance} days unused leave',
                'severity': 'low'
            })

        # Factor 5: Consecutive workdays (max 10 points)
        # Check for extended periods without days off
        recent_leaves = Leave.query.filter(
            Leave.user_id == user_id,
            Leave.status == 'approved',
            Leave.date_from >= date.today() - timedelta(days=60)
        ).count()

        if recent_leaves == 0:
            risk_score += 10
            factors.append({
                'factor': 'No recent breaks',
                'description': 'No leave taken in last 60 days',
                'severity': 'medium'
            })

        # Determine risk level
        if risk_score >= 60:
            risk_level = 'high'
            recommendation = 'Strongly recommend taking leave soon. Consider discussing workload with supervisor.'
        elif risk_score >= 35:
            risk_level = 'medium'
            recommendation = 'Consider scheduling leave in the next few weeks to maintain work-life balance.'
        else:
            risk_level = 'low'
            recommendation = 'Healthy work-leave balance. Continue regular leave patterns.'

        return {
            'user_id': user_id,
            'user_name': user.full_name,
            'risk_level': risk_level,
            'risk_score': risk_score,
            'max_score': 100,
            'factors': factors,
            'recommendation': recommendation,
            'suggested_leave_dates': self._suggest_leave_dates(user_id) if risk_score >= 35 else None,
            'analyzed_at': datetime.utcnow().isoformat()
        }

    def detect_absenteeism_patterns(self, user_id: int = None) -> List[Dict[str, Any]]:
        """
        Flag concerning absence patterns (e.g., frequent Mondays, around holidays).

        Args:
            user_id: Specific user (optional, analyzes all if not provided)

        Returns:
            [{user_id, pattern_type, description, severity, occurrences}]
        """
        if user_id:
            users = [db.session.get(User, user_id)]
        else:
            users = User.query.filter(User.is_active == True).all()

        patterns = []

        for user in users:
            if not user:
                continue

            leaves = Leave.query.filter(
                Leave.user_id == user.id,
                Leave.status == 'approved'
            ).all()

            if len(leaves) < 3:
                continue

            # Pattern 1: Monday/Friday tendency
            dow_counter = Counter()
            for leave in leaves:
                dow_counter[leave.date_from.strftime('%A')] += 1

            total_leaves = len(leaves)
            monday_pct = dow_counter.get('Monday', 0) / total_leaves * 100
            friday_pct = dow_counter.get('Friday', 0) / total_leaves * 100

            if monday_pct > 40:
                patterns.append({
                    'user_id': user.id,
                    'user_name': user.full_name,
                    'pattern_type': 'frequent_monday_absence',
                    'description': f'{monday_pct:.0f}% of leaves start on Monday',
                    'severity': 'medium' if monday_pct > 50 else 'low',
                    'occurrences': dow_counter.get('Monday', 0)
                })

            if friday_pct > 40:
                patterns.append({
                    'user_id': user.id,
                    'user_name': user.full_name,
                    'pattern_type': 'frequent_friday_absence',
                    'description': f'{friday_pct:.0f}% of leaves end on Friday',
                    'severity': 'medium' if friday_pct > 50 else 'low',
                    'occurrences': dow_counter.get('Friday', 0)
                })

            # Pattern 2: Short notice leaves
            short_notice = 0
            for leave in leaves:
                if leave.created_at and leave.date_from:
                    notice = (leave.date_from - leave.created_at.date()).days
                    if notice < 2:
                        short_notice += 1

            if short_notice / total_leaves > 0.5:
                patterns.append({
                    'user_id': user.id,
                    'user_name': user.full_name,
                    'pattern_type': 'frequent_short_notice',
                    'description': f'{short_notice}/{total_leaves} leaves requested with <2 days notice',
                    'severity': 'high' if short_notice / total_leaves > 0.7 else 'medium',
                    'occurrences': short_notice
                })

            # Pattern 3: Sick leave clustering
            sick_leaves = [l for l in leaves if l.leave_type == 'sick']
            if len(sick_leaves) >= 3:
                sick_dates = sorted([l.date_from for l in sick_leaves])
                clusters = 0
                for i in range(len(sick_dates) - 1):
                    if (sick_dates[i + 1] - sick_dates[i]).days <= 30:
                        clusters += 1

                if clusters >= 2:
                    patterns.append({
                        'user_id': user.id,
                        'user_name': user.full_name,
                        'pattern_type': 'sick_leave_clustering',
                        'description': f'Multiple sick leaves occurring within 30 days of each other',
                        'severity': 'medium',
                        'occurrences': clusters
                    })

            # Pattern 4: Frequent single-day leaves
            single_day_leaves = sum(1 for l in leaves if l.total_days == 1)
            if single_day_leaves / total_leaves > 0.7 and single_day_leaves >= 5:
                patterns.append({
                    'user_id': user.id,
                    'user_name': user.full_name,
                    'pattern_type': 'frequent_single_day_leaves',
                    'description': f'{single_day_leaves} out of {total_leaves} leaves are single-day',
                    'severity': 'low',
                    'occurrences': single_day_leaves
                })

        # Sort by severity
        severity_order = {'high': 0, 'medium': 1, 'low': 2}
        patterns.sort(key=lambda x: severity_order.get(x['severity'], 3))

        return patterns

    def analyze_leave_impact(self, leave_id: int) -> Dict[str, Any]:
        """
        Analyze impact of leave on projects and deadlines.

        Args:
            leave_id: Leave request ID

        Returns:
            {
                affected_jobs: [{job_id, type, deadline, risk}],
                team_coverage_gap: float,
                recommendations: [...]
            }
        """
        leave = db.session.get(Leave, leave_id)
        if not leave:
            return {'error': 'Leave not found'}

        user = db.session.get(User, leave.user_id)
        if not user:
            return {'error': 'User not found'}

        # Find jobs assigned to user during leave period
        affected_jobs = []

        # Query work plan jobs during leave period
        jobs = WorkPlanJob.query.join(WorkPlanDay).join(WorkPlanAssignment).filter(
            WorkPlanAssignment.user_id == leave.user_id,
            WorkPlanDay.day_date >= leave.date_from,
            WorkPlanDay.day_date <= leave.date_to
        ).all()

        for job in jobs:
            risk = 'low'
            if job.priority in ('urgent', 'high'):
                risk = 'high'
            elif job.priority == 'normal':
                risk = 'medium'

            # Higher risk if lead assignment
            assignment = WorkPlanAssignment.query.filter_by(
                work_plan_job_id=job.id,
                user_id=leave.user_id
            ).first()

            if assignment and assignment.is_lead:
                risk = 'high'

            affected_jobs.append({
                'job_id': job.id,
                'job_type': job.job_type,
                'description': job.description,
                'equipment_id': job.equipment_id,
                'equipment_name': job.equipment.name if job.equipment else None,
                'planned_date': job.day.day_date.isoformat() if job.day else None,
                'priority': job.priority,
                'estimated_hours': job.estimated_hours,
                'is_lead': assignment.is_lead if assignment else False,
                'risk': risk
            })

        # Calculate team coverage gap
        team_role = user.role
        team_members = User.query.filter(
            or_(User.role == team_role, User.minor_role == team_role),
            User.is_active == True,
            User.is_on_leave == False
        ).count()

        # Count other leaves during same period
        concurrent_leaves = Leave.query.join(User).filter(
            Leave.status.in_(['approved', 'pending']),
            Leave.id != leave_id,
            Leave.date_from <= leave.date_to,
            Leave.date_to >= leave.date_from,
            or_(User.role == team_role, User.minor_role == team_role)
        ).count()

        if team_members > 0:
            coverage_gap = ((concurrent_leaves + 1) / team_members) * 100
        else:
            coverage_gap = 100

        # Generate recommendations
        recommendations = []

        if len(affected_jobs) > 0:
            high_risk_jobs = [j for j in affected_jobs if j['risk'] == 'high']
            if high_risk_jobs:
                recommendations.append(f'Reassign {len(high_risk_jobs)} high-priority job(s) before leave starts')

            lead_jobs = [j for j in affected_jobs if j.get('is_lead')]
            if lead_jobs:
                recommendations.append(f'Designate new lead for {len(lead_jobs)} job(s)')

        if coverage_gap > 50:
            recommendations.append('High team coverage gap - consider postponing or arranging additional coverage')

        if leave.coverage_user_id:
            coverage_user = db.session.get(User, leave.coverage_user_id)
            if coverage_user:
                recommendations.append(f'Ensure {coverage_user.full_name} is briefed on all affected tasks')
        else:
            recommendations.append('Assign coverage employee to ensure continuity')

        return {
            'leave_id': leave_id,
            'user_id': leave.user_id,
            'user_name': user.full_name,
            'leave_period': {
                'from': leave.date_from.isoformat(),
                'to': leave.date_to.isoformat(),
                'total_days': leave.total_days
            },
            'affected_jobs': affected_jobs,
            'affected_jobs_count': len(affected_jobs),
            'high_risk_jobs_count': len([j for j in affected_jobs if j['risk'] == 'high']),
            'team_coverage_gap': round(coverage_gap, 1),
            'concurrent_leaves': concurrent_leaves,
            'team_size': team_members,
            'recommendations': recommendations,
            'impact_level': 'high' if len(affected_jobs) > 5 or coverage_gap > 50 else 'medium' if len(affected_jobs) > 2 else 'low'
        }

    # ========================================
    # AUTOMATION METHODS
    # ========================================

    def evaluate_auto_approval(self, leave_id: int) -> Dict[str, Any]:
        """
        Determine if leave can be auto-approved.
        Rules: sufficient balance, no blackout, coverage available, low risk.

        Args:
            leave_id: Leave request ID

        Returns:
            {can_auto_approve: bool, reasons: [...], risk_score: 0-100}
        """
        leave = db.session.get(Leave, leave_id)
        if not leave:
            return {'error': 'Leave not found', 'can_auto_approve': False}

        if leave.status != 'pending':
            return {
                'can_auto_approve': False,
                'reasons': ['Leave is not in pending status'],
                'risk_score': 0
            }

        user = db.session.get(User, leave.user_id)
        if not user:
            return {'can_auto_approve': False, 'reasons': ['User not found']}

        reasons = []
        risk_score = 0
        can_approve = True

        # Rule 1: Sufficient leave balance
        remaining = self._calculate_remaining_balance(leave.user_id)
        if remaining < leave.total_days:
            can_approve = False
            reasons.append(f'Insufficient balance: {remaining} days remaining, {leave.total_days} requested')
            risk_score += 30

        # Rule 2: No blackout period
        blackout = LeaveBlackout.query.filter(
            LeaveBlackout.is_active == True,
            LeaveBlackout.date_from <= leave.date_to,
            LeaveBlackout.date_to >= leave.date_from
        ).first()

        if blackout and blackout.applies_to_user(user):
            can_approve = False
            reasons.append(f'Falls within blackout period: {blackout.name}')
            risk_score += 40

        # Rule 3: Coverage assigned
        if not leave.coverage_user_id:
            can_approve = False
            reasons.append('No coverage employee assigned')
            risk_score += 25
        else:
            # Check if coverage user is available
            coverage = db.session.get(User, leave.coverage_user_id)
            if coverage and coverage.is_on_leave:
                can_approve = False
                reasons.append('Assigned coverage employee is on leave')
                risk_score += 25

        # Rule 4: Advance notice
        if leave.created_at and leave.date_from:
            notice_days = (leave.date_from - leave.created_at.date()).days
            if notice_days < 1:
                risk_score += 15
                reasons.append(f'Short notice: {notice_days} days')
                # Don't block auto-approval for short notice alone

        # Rule 5: Team capacity check
        team_capacity = self.forecast_team_capacity(user.role, 7)
        for day in team_capacity:
            if leave.date_from.isoformat() <= day['date'] <= leave.date_to.isoformat():
                if day['risk_level'] == 'critical':
                    can_approve = False
                    reasons.append(f'Critical team capacity on {day["date"]}')
                    risk_score += 20
                    break
                elif day['risk_level'] == 'high':
                    risk_score += 10
                    reasons.append(f'Low team capacity on {day["date"]}')

        # Rule 6: Impact analysis
        impact = self.analyze_leave_impact(leave_id)
        if impact.get('high_risk_jobs_count', 0) > 2:
            can_approve = False
            reasons.append(f'{impact["high_risk_jobs_count"]} high-risk jobs would be affected')
            risk_score += 20

        # Rule 7: Short leave duration (more likely to auto-approve)
        if leave.total_days <= 2:
            risk_score = max(risk_score - 10, 0)
            reasons.append('Short duration leave (<=2 days)')

        # Final check
        if risk_score > 50:
            can_approve = False
            if 'Risk score exceeds threshold' not in reasons:
                reasons.append(f'Risk score ({risk_score}) exceeds auto-approval threshold (50)')

        return {
            'leave_id': leave_id,
            'can_auto_approve': can_approve and risk_score <= 50,
            'reasons': reasons,
            'risk_score': min(risk_score, 100),
            'recommendation': 'Auto-approve' if can_approve and risk_score <= 50 else 'Manual review required',
            'checks': {
                'balance_sufficient': remaining >= leave.total_days,
                'no_blackout': blackout is None or not blackout.applies_to_user(user),
                'coverage_assigned': leave.coverage_user_id is not None,
                'team_capacity_ok': risk_score < 50,
                'low_impact': impact.get('high_risk_jobs_count', 0) <= 2
            }
        }

    def process_natural_language_request(self, user_id: int, text: str) -> Dict[str, Any]:
        """
        Parse natural language leave request.
        Example: "I need next Monday off for a doctor appointment"

        Args:
            user_id: User making the request
            text: Natural language request

        Returns:
            {leave_type, date_from, date_to, reason, confidence, clarifications_needed}
        """
        text_lower = text.lower().strip()
        today = date.today()
        result = {
            'leave_type': None,
            'date_from': None,
            'date_to': None,
            'reason': None,
            'confidence': 0,
            'clarifications_needed': [],
            'original_text': text
        }

        # Detect leave type
        type_keywords = {
            'sick': ['sick', 'ill', 'unwell', 'medical', 'doctor', 'hospital', 'health', 'fever', 'flu'],
            'annual': ['annual', 'vacation', 'holiday', 'pto', 'personal day'],
            'emergency': ['emergency', 'urgent', 'family emergency', 'death', 'funeral'],
            'training': ['training', 'course', 'workshop', 'conference', 'seminar', 'learning']
        }

        for leave_type, keywords in type_keywords.items():
            if any(kw in text_lower for kw in keywords):
                result['leave_type'] = leave_type
                result['confidence'] += 25
                break

        if not result['leave_type']:
            result['leave_type'] = 'other'
            result['clarifications_needed'].append('Could not determine leave type. Please specify.')

        # Detect date references
        date_patterns = {
            'today': today,
            'tomorrow': today + timedelta(days=1),
            'day after tomorrow': today + timedelta(days=2),
            'next week': today + timedelta(days=(7 - today.weekday())),
            'this week': today,
        }

        # Day of week patterns
        days_of_week = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        for i, day in enumerate(days_of_week):
            if f'next {day}' in text_lower:
                days_ahead = (i - today.weekday()) % 7
                if days_ahead == 0:
                    days_ahead = 7
                target_date = today + timedelta(days=days_ahead)
                date_patterns[f'next {day}'] = target_date
            elif f'this {day}' in text_lower:
                days_ahead = (i - today.weekday()) % 7
                target_date = today + timedelta(days=days_ahead)
                date_patterns[f'this {day}'] = target_date

        # Find date in text
        for pattern, target_date in date_patterns.items():
            if pattern in text_lower:
                result['date_from'] = target_date.isoformat()
                result['date_to'] = target_date.isoformat()
                result['confidence'] += 30
                break

        # Detect duration
        duration_patterns = {
            'one day': 1,
            'a day': 1,
            'two days': 2,
            '2 days': 2,
            'three days': 3,
            '3 days': 3,
            'a week': 7,
            'one week': 7,
            'two weeks': 14,
            '2 weeks': 14,
        }

        duration = 1
        for pattern, days in duration_patterns.items():
            if pattern in text_lower:
                duration = days
                result['confidence'] += 15
                break

        # Adjust date_to based on duration
        if result['date_from'] and duration > 1:
            from_date = date.fromisoformat(result['date_from'])
            result['date_to'] = (from_date + timedelta(days=duration - 1)).isoformat()

        # Extract reason
        reason_starters = ['for', 'because', 'due to', 'as i have', 'need to', 'going to', 'attending']
        for starter in reason_starters:
            if starter in text_lower:
                idx = text_lower.find(starter)
                result['reason'] = text[idx:].strip()
                result['confidence'] += 15
                break

        if not result['reason']:
            result['reason'] = text
            result['clarifications_needed'].append('Please provide a reason for leave.')

        # Validate dates
        if not result['date_from']:
            result['clarifications_needed'].append('Could not determine leave dates. Please specify when you need leave.')
        else:
            result['confidence'] += 15

        # Final confidence adjustment
        result['confidence'] = min(result['confidence'], 100)

        # Generate suggested response
        if result['confidence'] >= 70 and not result['clarifications_needed']:
            result['suggested_action'] = 'ready_to_submit'
            result['summary'] = f"Leave type: {result['leave_type']}, From: {result['date_from']}, To: {result['date_to']}"
        else:
            result['suggested_action'] = 'needs_clarification'

        return result

    # ========================================
    # INSIGHTS METHODS
    # ========================================

    def get_team_wellness_score(self, team_role: str = None) -> Dict[str, Any]:
        """
        Calculate team health based on leave patterns.

        Args:
            team_role: Filter by role (optional)

        Returns:
            {score: 0-100, factors: [...], recommendations: [...]}
        """
        cache_key = _cache_key('wellness_score', team_role)
        cached = _get_cache(cache_key)
        if cached:
            return cached

        # Get team members
        query = User.query.filter(User.is_active == True)
        if team_role:
            query = query.filter(or_(User.role == team_role, User.minor_role == team_role))

        users = query.all()

        if not users:
            return {
                'score': 0,
                'factors': [],
                'recommendations': ['No active users found for this team'],
                'users_analyzed': 0
            }

        factors = []
        total_score = 100

        # Factor 1: Average days since last leave
        days_since_list = []
        for user in users:
            last_leave = Leave.query.filter(
                Leave.user_id == user.id,
                Leave.status == 'approved',
                Leave.date_to < date.today()
            ).order_by(Leave.date_to.desc()).first()

            if last_leave:
                days_since_list.append((date.today() - last_leave.date_to).days)
            else:
                days_since_list.append(365)  # Never took leave

        avg_days_since = sum(days_since_list) / len(days_since_list) if days_since_list else 0

        if avg_days_since > 90:
            total_score -= 25
            factors.append({
                'name': 'Extended work periods',
                'impact': -25,
                'description': f'Average {avg_days_since:.0f} days since last leave'
            })
        elif avg_days_since > 60:
            total_score -= 15
            factors.append({
                'name': 'Moderate work periods',
                'impact': -15,
                'description': f'Average {avg_days_since:.0f} days since last leave'
            })

        # Factor 2: Leave utilization rate
        total_balance = sum(self._calculate_remaining_balance(u.id) for u in users)
        total_annual = len(users) * 24  # Assume 24 days annual leave
        utilization = ((total_annual - total_balance) / total_annual * 100) if total_annual > 0 else 0

        if utilization < 30:
            total_score -= 20
            factors.append({
                'name': 'Low leave utilization',
                'impact': -20,
                'description': f'Only {utilization:.0f}% of leave balance used'
            })
        elif utilization < 50:
            total_score -= 10
            factors.append({
                'name': 'Moderate leave utilization',
                'impact': -10,
                'description': f'{utilization:.0f}% of leave balance used'
            })

        # Factor 3: Burnout risk distribution
        high_burnout_count = 0
        for user in users:
            burnout = self.detect_burnout_risk(user.id)
            if burnout.get('risk_level') == 'high':
                high_burnout_count += 1

        burnout_rate = high_burnout_count / len(users) * 100 if users else 0

        if burnout_rate > 25:
            total_score -= 25
            factors.append({
                'name': 'High burnout risk',
                'impact': -25,
                'description': f'{burnout_rate:.0f}% of team at high burnout risk'
            })
        elif burnout_rate > 10:
            total_score -= 15
            factors.append({
                'name': 'Elevated burnout risk',
                'impact': -15,
                'description': f'{burnout_rate:.0f}% of team at high burnout risk'
            })

        # Factor 4: Coverage fairness
        coverage_dist = self.optimize_coverage_distribution(
            date.today() - timedelta(days=90),
            date.today()
        )
        fairness = coverage_dist.get('fairness_score', 100)

        if fairness < 60:
            total_score -= 15
            factors.append({
                'name': 'Unbalanced coverage distribution',
                'impact': -15,
                'description': f'Coverage fairness score: {fairness:.0f}/100'
            })

        # Generate recommendations
        recommendations = []

        if avg_days_since > 60:
            recommendations.append('Encourage team members to take regular breaks')

        if utilization < 50:
            recommendations.append('Remind team to use their leave balance before year-end')

        if high_burnout_count > 0:
            recommendations.append(f'Prioritize leave for {high_burnout_count} team member(s) showing burnout signs')

        if fairness < 80:
            recommendations.append('Redistribute coverage assignments more evenly')

        result = {
            'score': max(round(total_score), 0),
            'max_score': 100,
            'grade': 'A' if total_score >= 85 else 'B' if total_score >= 70 else 'C' if total_score >= 55 else 'D' if total_score >= 40 else 'F',
            'factors': factors,
            'recommendations': recommendations,
            'metrics': {
                'users_analyzed': len(users),
                'avg_days_since_leave': round(avg_days_since, 1),
                'leave_utilization_pct': round(utilization, 1),
                'high_burnout_risk_count': high_burnout_count,
                'coverage_fairness': round(fairness, 1)
            },
            'team_role': team_role or 'all',
            'calculated_at': datetime.utcnow().isoformat()
        }

        _set_cache(cache_key, result)
        return result

    def get_leave_recommendations(self, user_id: int) -> List[Dict[str, Any]]:
        """
        Suggest when user should take leave for balance.

        Args:
            user_id: User to get recommendations for

        Returns:
            [{suggested_period, reason, balance_impact}]
        """
        user = db.session.get(User, user_id)
        if not user:
            return []

        recommendations = []
        today = date.today()

        # Get remaining balance
        remaining = self._calculate_remaining_balance(user_id)

        # Get burnout risk
        burnout = self.detect_burnout_risk(user_id)

        # Recommendation 1: Based on burnout risk
        if burnout.get('risk_level') == 'high':
            # Find next available period
            suggested = self._find_low_impact_period(user_id, 5)
            if suggested:
                recommendations.append({
                    'suggested_period': {
                        'from': suggested['from'].isoformat(),
                        'to': suggested['to'].isoformat(),
                        'days': (suggested['to'] - suggested['from']).days + 1
                    },
                    'reason': 'High burnout risk detected - recommend taking leave soon',
                    'priority': 'high',
                    'balance_impact': f'{(suggested["to"] - suggested["from"]).days + 1} days from {remaining} remaining'
                })

        # Recommendation 2: Based on upcoming blackouts
        upcoming_blackouts = LeaveBlackout.query.filter(
            LeaveBlackout.is_active == True,
            LeaveBlackout.date_from > today,
            LeaveBlackout.date_from <= today + timedelta(days=60)
        ).order_by(LeaveBlackout.date_from).all()

        for blackout in upcoming_blackouts:
            if blackout.applies_to_user(user):
                # Suggest taking leave before blackout
                suggested_end = blackout.date_from - timedelta(days=1)
                suggested_start = suggested_end - timedelta(days=4)

                if suggested_start > today:
                    recommendations.append({
                        'suggested_period': {
                            'from': suggested_start.isoformat(),
                            'to': suggested_end.isoformat(),
                            'days': 5
                        },
                        'reason': f'Take leave before upcoming blackout period: {blackout.name}',
                        'priority': 'medium',
                        'balance_impact': f'5 days from {remaining} remaining'
                    })
                break

        # Recommendation 3: Year-end leave (if significant balance remaining)
        if remaining > 10:
            year_end = date(today.year, 12, 31)
            days_to_year_end = (year_end - today).days

            if days_to_year_end < 90 and days_to_year_end > 0:
                recommendations.append({
                    'suggested_period': {
                        'from': (year_end - timedelta(days=6)).isoformat(),
                        'to': year_end.isoformat(),
                        'days': 7
                    },
                    'reason': f'Use leave balance before year-end ({remaining} days remaining)',
                    'priority': 'medium',
                    'balance_impact': f'7 days from {remaining} remaining'
                })

        # Recommendation 4: Regular interval suggestion
        last_leave = Leave.query.filter(
            Leave.user_id == user_id,
            Leave.status == 'approved',
            Leave.date_to < today
        ).order_by(Leave.date_to.desc()).first()

        if last_leave:
            days_since = (today - last_leave.date_to).days
            if days_since > 45:
                suggested = self._find_low_impact_period(user_id, 3)
                if suggested and len(recommendations) < 3:
                    recommendations.append({
                        'suggested_period': {
                            'from': suggested['from'].isoformat(),
                            'to': suggested['to'].isoformat(),
                            'days': (suggested['to'] - suggested['from']).days + 1
                        },
                        'reason': f'{days_since} days since last leave - consider a short break',
                        'priority': 'low',
                        'balance_impact': f'{(suggested["to"] - suggested["from"]).days + 1} days from {remaining} remaining'
                    })

        # Sort by priority
        priority_order = {'high': 0, 'medium': 1, 'low': 2}
        recommendations.sort(key=lambda x: priority_order.get(x['priority'], 3))

        return recommendations[:5]

    def get_compliance_report(self) -> Dict[str, Any]:
        """
        Check labor law compliance (e.g., minimum leave taken).

        Returns:
            {compliant: bool, violations: [...], at_risk_users: [...]}
        """
        users = User.query.filter(User.is_active == True).all()
        violations = []
        at_risk_users = []
        today = date.today()
        year_start = date(today.year, 1, 1)

        for user in users:
            # Check minimum leave requirement (example: 10 days per year)
            leaves_this_year = Leave.query.filter(
                Leave.user_id == user.id,
                Leave.status == 'approved',
                Leave.date_from >= year_start
            ).all()

            total_days = sum(l.total_days for l in leaves_this_year)

            # Calculate expected progress (pro-rata)
            days_into_year = (today - year_start).days
            expected_minimum = (10 / 365) * days_into_year  # 10 days minimum per year

            if total_days < expected_minimum * 0.5:  # Less than 50% of expected
                at_risk_users.append({
                    'user_id': user.id,
                    'user_name': user.full_name,
                    'role': user.role,
                    'days_taken': total_days,
                    'expected_minimum': round(expected_minimum, 1),
                    'shortfall': round(expected_minimum - total_days, 1),
                    'status': 'at_risk'
                })

            # Check for no leave taken in extended period
            last_leave = Leave.query.filter(
                Leave.user_id == user.id,
                Leave.status == 'approved'
            ).order_by(Leave.date_to.desc()).first()

            if last_leave:
                days_since = (today - last_leave.date_to).days
                if days_since > 180:  # 6 months without leave
                    violations.append({
                        'user_id': user.id,
                        'user_name': user.full_name,
                        'violation_type': 'extended_period_without_leave',
                        'description': f'{days_since} days since last leave',
                        'severity': 'high' if days_since > 270 else 'medium'
                    })
            else:
                # Check if user has been employed for more than 6 months
                if user.created_at and (today - user.created_at.date()).days > 180:
                    violations.append({
                        'user_id': user.id,
                        'user_name': user.full_name,
                        'violation_type': 'no_leave_history',
                        'description': 'No leave taken since employment',
                        'severity': 'high'
                    })

        # Calculate overall compliance
        total_users = len(users)
        violating_users = len(set(v['user_id'] for v in violations))
        compliance_rate = ((total_users - violating_users) / total_users * 100) if total_users > 0 else 100

        return {
            'compliant': len(violations) == 0,
            'compliance_rate': round(compliance_rate, 1),
            'violations': violations,
            'violations_count': len(violations),
            'at_risk_users': at_risk_users,
            'at_risk_count': len(at_risk_users),
            'total_users_analyzed': total_users,
            'analysis_period': {
                'from': year_start.isoformat(),
                'to': today.isoformat()
            },
            'recommendations': [
                'Review at-risk users and encourage leave usage' if at_risk_users else None,
                'Address violations to ensure labor law compliance' if violations else None,
                'Schedule quarterly compliance reviews' if compliance_rate < 90 else None
            ],
            'generated_at': datetime.utcnow().isoformat()
        }

    def get_seasonal_demand_forecast(self, months_ahead: int = 6) -> List[Dict[str, Any]]:
        """
        Predict high-leave periods.

        Args:
            months_ahead: Number of months to forecast

        Returns:
            [{month, predicted_leave_days, confidence, historical_avg}]
        """
        cache_key = _cache_key('seasonal_forecast', months_ahead)
        cached = _get_cache(cache_key)
        if cached:
            return cached

        today = date.today()
        forecast = []

        # Analyze historical data (last 2 years)
        two_years_ago = today - timedelta(days=730)
        historical_leaves = Leave.query.filter(
            Leave.status == 'approved',
            Leave.date_from >= two_years_ago
        ).all()

        # Group by month
        monthly_data = defaultdict(list)
        for leave in historical_leaves:
            month_key = leave.date_from.month
            monthly_data[month_key].append(leave.total_days)

        # Generate forecast for next N months
        current_month = today.month
        current_year = today.year

        for i in range(months_ahead):
            forecast_month = ((current_month - 1 + i) % 12) + 1
            forecast_year = current_year + ((current_month - 1 + i) // 12)

            month_name = date(forecast_year, forecast_month, 1).strftime('%B %Y')
            historical = monthly_data.get(forecast_month, [])

            if historical:
                historical_avg = sum(historical) / len(historical)
                # Simple prediction: use historical average with trend adjustment
                predicted = historical_avg

                # Adjust for known patterns
                if forecast_month == 12:  # December typically higher
                    predicted *= 1.3
                elif forecast_month in (7, 8):  # Summer months
                    predicted *= 1.2

                confidence = 'high' if len(historical) >= 4 else 'medium' if len(historical) >= 2 else 'low'
            else:
                historical_avg = 0
                predicted = 10  # Default estimate
                confidence = 'low'

            # Determine demand level
            if predicted > 20:
                demand_level = 'high'
            elif predicted > 10:
                demand_level = 'medium'
            else:
                demand_level = 'low'

            forecast.append({
                'month': month_name,
                'month_number': forecast_month,
                'year': forecast_year,
                'predicted_leave_days': round(predicted, 0),
                'historical_avg': round(historical_avg, 1),
                'historical_data_points': len(historical),
                'confidence': confidence,
                'demand_level': demand_level
            })

        _set_cache(cache_key, forecast)
        return forecast

    # ========================================
    # COVERAGE ANALYTICS METHODS
    # ========================================

    def rate_coverage_effectiveness(self, leave_id: int) -> Dict[str, Any]:
        """
        Rate how well coverage performed.

        Args:
            leave_id: Completed leave ID

        Returns:
            {score: 0-100, metrics: {tasks_completed, response_time, issues}, feedback}
        """
        leave = db.session.get(Leave, leave_id)
        if not leave:
            return {'error': 'Leave not found'}

        if leave.status != 'approved' or leave.date_to >= date.today():
            return {
                'error': 'Leave is not completed yet',
                'status': leave.status,
                'end_date': leave.date_to.isoformat() if leave.date_to else None
            }

        if not leave.coverage_user_id:
            return {
                'score': 0,
                'message': 'No coverage was assigned for this leave'
            }

        coverage_user = db.session.get(User, leave.coverage_user_id)
        if not coverage_user:
            return {'error': 'Coverage user not found'}

        metrics = {
            'tasks_completed': 0,
            'tasks_assigned': 0,
            'response_time_hours': None,
            'issues_reported': 0
        }

        score = 100

        # Check jobs assigned during coverage period
        jobs_during_leave = WorkPlanJob.query.join(WorkPlanDay).join(WorkPlanAssignment).filter(
            WorkPlanAssignment.user_id == leave.user_id,
            WorkPlanDay.day_date >= leave.date_from,
            WorkPlanDay.day_date <= leave.date_to
        ).all()

        # Check if coverage user completed any reassigned jobs
        coverage_jobs = WorkPlanJob.query.join(WorkPlanDay).join(WorkPlanAssignment).filter(
            WorkPlanAssignment.user_id == leave.coverage_user_id,
            WorkPlanDay.day_date >= leave.date_from,
            WorkPlanDay.day_date <= leave.date_to
        ).all()

        metrics['tasks_assigned'] = len(jobs_during_leave)
        metrics['tasks_completed'] = len(coverage_jobs)

        # Score adjustments
        if metrics['tasks_assigned'] > 0:
            completion_rate = metrics['tasks_completed'] / metrics['tasks_assigned']
            if completion_rate < 0.5:
                score -= 30
            elif completion_rate < 0.8:
                score -= 15
        else:
            # No tasks to cover
            score = 100

        # Generate feedback
        feedback = []
        if score >= 90:
            feedback.append('Excellent coverage performance')
        elif score >= 70:
            feedback.append('Good coverage with minor gaps')
        elif score >= 50:
            feedback.append('Adequate coverage but needs improvement')
        else:
            feedback.append('Coverage needs significant improvement')

        if metrics['tasks_completed'] > 0:
            feedback.append(f'Completed {metrics["tasks_completed"]} tasks during coverage period')

        return {
            'leave_id': leave_id,
            'coverage_user_id': leave.coverage_user_id,
            'coverage_user_name': coverage_user.full_name,
            'leave_user_id': leave.user_id,
            'score': max(score, 0),
            'grade': 'A' if score >= 90 else 'B' if score >= 80 else 'C' if score >= 70 else 'D' if score >= 60 else 'F',
            'metrics': metrics,
            'feedback': feedback,
            'coverage_period': {
                'from': leave.date_from.isoformat(),
                'to': leave.date_to.isoformat(),
                'days': leave.total_days
            }
        }

    def get_coverage_load_report(self, period: str = 'monthly') -> List[Dict[str, Any]]:
        """
        Show coverage distribution across team.

        Args:
            period: 'weekly', 'monthly', or 'quarterly'

        Returns:
            [{user_id, times_provided_coverage, total_days, fairness_score}]
        """
        # Determine date range
        today = date.today()
        if period == 'weekly':
            start_date = today - timedelta(days=7)
        elif period == 'quarterly':
            start_date = today - timedelta(days=90)
        else:  # monthly
            start_date = today - timedelta(days=30)

        # Get coverage assignments
        leaves_with_coverage = Leave.query.filter(
            Leave.status == 'approved',
            Leave.coverage_user_id.isnot(None),
            Leave.date_from >= start_date
        ).all()

        # Count coverage per user
        coverage_stats = defaultdict(lambda: {'count': 0, 'days': 0})

        for leave in leaves_with_coverage:
            coverage_stats[leave.coverage_user_id]['count'] += 1
            coverage_stats[leave.coverage_user_id]['days'] += leave.total_days

        if not coverage_stats:
            return []

        # Calculate fairness metrics
        counts = [s['count'] for s in coverage_stats.values()]
        avg_count = sum(counts) / len(counts) if counts else 0

        result = []
        for user_id, stats in coverage_stats.items():
            user = db.session.get(User, user_id)
            if not user:
                continue

            # Calculate individual fairness score
            if avg_count > 0:
                deviation = abs(stats['count'] - avg_count) / avg_count
                fairness = max(0, 100 - (deviation * 100))
            else:
                fairness = 100

            result.append({
                'user_id': user_id,
                'user_name': user.full_name,
                'role': user.role,
                'times_provided_coverage': stats['count'],
                'total_coverage_days': stats['days'],
                'fairness_score': round(fairness, 1),
                'status': 'overloaded' if stats['count'] > avg_count * 1.5 else 'underloaded' if stats['count'] < avg_count * 0.5 else 'balanced'
            })

        # Sort by coverage count descending
        result.sort(key=lambda x: x['times_provided_coverage'], reverse=True)

        return result

    # ========================================
    # SENTIMENT ANALYSIS
    # ========================================

    def analyze_leave_reasons(self, period: str = 'monthly') -> Dict[str, Any]:
        """
        Analyze leave reasons for team health insights.

        Args:
            period: 'weekly', 'monthly', or 'quarterly'

        Returns:
            {categories: {sick: 30%, personal: 40%...}, trends: [...], concerns: [...]}
        """
        # Determine date range
        today = date.today()
        if period == 'weekly':
            start_date = today - timedelta(days=7)
        elif period == 'quarterly':
            start_date = today - timedelta(days=90)
        else:  # monthly
            start_date = today - timedelta(days=30)

        # Get leaves in period
        leaves = Leave.query.filter(
            Leave.status.in_(['approved', 'pending']),
            Leave.date_from >= start_date
        ).all()

        if not leaves:
            return {
                'categories': {},
                'trends': [],
                'concerns': [],
                'message': 'No leaves in this period'
            }

        # Categorize by type
        type_counts = Counter(leave.leave_type for leave in leaves)
        total = len(leaves)

        categories = {
            leave_type: round(count / total * 100, 1)
            for leave_type, count in type_counts.items()
        }

        # Identify trends
        trends = []
        concerns = []

        # Trend: High sick leave rate
        sick_rate = categories.get('sick', 0)
        if sick_rate > 40:
            trends.append({
                'type': 'high_sick_leave',
                'description': f'Sick leave accounts for {sick_rate}% of all leaves',
                'significance': 'high'
            })
            concerns.append({
                'type': 'health_concern',
                'description': 'High sick leave rate may indicate workplace health issues',
                'recommendation': 'Consider reviewing workplace conditions and employee wellness programs'
            })
        elif sick_rate > 25:
            trends.append({
                'type': 'elevated_sick_leave',
                'description': f'Sick leave rate ({sick_rate}%) is above normal',
                'significance': 'medium'
            })

        # Trend: Emergency leave spike
        emergency_rate = categories.get('emergency', 0)
        if emergency_rate > 15:
            trends.append({
                'type': 'emergency_leave_spike',
                'description': f'Emergency leave rate ({emergency_rate}%) is elevated',
                'significance': 'medium'
            })
            concerns.append({
                'type': 'emergency_pattern',
                'description': 'Elevated emergency leave may indicate planning issues',
                'recommendation': 'Review advance notice policies and encourage early planning'
            })

        # Analyze day distribution
        day_counts = Counter()
        for leave in leaves:
            current = leave.date_from
            while current <= leave.date_to:
                day_counts[current.strftime('%A')] += 1
                current += timedelta(days=1)

        total_days = sum(day_counts.values())
        if total_days > 0:
            monday_pct = day_counts.get('Monday', 0) / total_days * 100
            friday_pct = day_counts.get('Friday', 0) / total_days * 100

            if monday_pct + friday_pct > 45:  # Normal would be ~28.5%
                trends.append({
                    'type': 'weekend_extension_pattern',
                    'description': f'Monday/Friday leaves ({monday_pct + friday_pct:.0f}%) suggest long weekend tendency',
                    'significance': 'low'
                })

        return {
            'categories': categories,
            'type_counts': dict(type_counts),
            'total_leaves': total,
            'trends': trends,
            'concerns': concerns,
            'day_distribution': dict(day_counts),
            'period': {
                'from': start_date.isoformat(),
                'to': today.isoformat()
            },
            'analysis_date': datetime.utcnow().isoformat()
        }

    # ========================================
    # HELPER METHODS
    # ========================================

    def _calculate_remaining_balance(self, user_id: int) -> int:
        """Calculate remaining leave balance for user."""
        user = db.session.get(User, user_id)
        if not user:
            return 0

        annual_allowance = user.annual_leave_balance or 24

        # Calculate used days this year
        year_start = date(date.today().year, 1, 1)
        used = db.session.query(func.coalesce(func.sum(Leave.total_days), 0)).filter(
            Leave.user_id == user_id,
            Leave.status.in_(['approved', 'pending']),
            Leave.date_from >= year_start
        ).scalar()

        return max(annual_allowance - (used or 0), 0)

    def _suggest_coverage_user(self, user_id: int) -> Optional[int]:
        """Suggest a coverage user based on role and specialization."""
        user = db.session.get(User, user_id)
        if not user:
            return None

        # Cross-role coverage
        if user.role == 'inspector':
            coverage_role = 'specialist'
        elif user.role == 'specialist':
            coverage_role = 'inspector'
        else:
            coverage_role = user.role

        candidates = User.query.filter(
            User.role == coverage_role,
            User.is_active == True,
            User.is_on_leave == False,
            User.id != user_id
        )

        if user.specialization:
            candidates = candidates.filter(User.specialization == user.specialization)

        candidate = candidates.first()
        return candidate.id if candidate else None

    def _calculate_workload(self, user_id: int, start_date: date, end_date: date) -> Dict[str, Any]:
        """Calculate user's workload during a period."""
        jobs = WorkPlanJob.query.join(WorkPlanDay).join(WorkPlanAssignment).filter(
            WorkPlanAssignment.user_id == user_id,
            WorkPlanDay.day_date >= start_date,
            WorkPlanDay.day_date <= end_date
        ).all()

        total_hours = sum(job.estimated_hours or 0 for job in jobs)

        return {
            'total_jobs': len(jobs),
            'total_hours': total_hours,
            'avg_per_day': round(total_hours / max((end_date - start_date).days + 1, 1), 1)
        }

    def _calculate_team_impact(self, user: User, start_date: date, end_date: date) -> Dict[str, Any]:
        """Calculate team impact if user takes leave."""
        team_members = User.query.filter(
            or_(User.role == user.role, User.minor_role == user.role),
            User.is_active == True,
            User.id != user.id
        ).count()

        # Count concurrent leaves
        concurrent = Leave.query.join(User).filter(
            Leave.status.in_(['approved', 'pending']),
            Leave.date_from <= end_date,
            Leave.date_to >= start_date,
            or_(User.role == user.role, User.minor_role == user.role)
        ).count()

        if team_members > 0:
            impact_score = (concurrent + 1) / team_members * 100
        else:
            impact_score = 100

        return {
            'score': round(impact_score, 1),
            'details': f'{concurrent} concurrent leaves, {team_members} team members'
        }

    def suggest_optimal_coverage_for_dates(
        self,
        user_id: int,
        start_date: date,
        end_date: date
    ) -> List[Dict[str, Any]]:
        """Suggest coverage for specific date range (helper for alternative dates)."""
        user = db.session.get(User, user_id)
        if not user:
            return []

        # Same logic as suggest_optimal_coverage but for hypothetical dates
        if user.role == 'inspector':
            coverage_role = 'specialist'
        elif user.role == 'specialist':
            coverage_role = 'inspector'
        else:
            coverage_role = user.role

        candidates = User.query.filter(
            User.role == coverage_role,
            User.is_active == True,
            User.is_on_leave == False,
            User.id != user_id
        )

        if user.specialization:
            candidates = candidates.filter(User.specialization == user.specialization)

        result = []
        for candidate in candidates.all():
            # Check for overlapping leaves
            overlap = Leave.query.filter(
                Leave.user_id == candidate.id,
                Leave.status.in_(['pending', 'approved']),
                Leave.date_from <= end_date,
                Leave.date_to >= start_date
            ).first()

            if not overlap:
                result.append({'user_id': candidate.id, 'name': candidate.full_name})

        return result

    def _find_low_impact_period(self, user_id: int, duration: int) -> Optional[Dict[str, date]]:
        """Find a low-impact period for leave."""
        user = db.session.get(User, user_id)
        if not user:
            return None

        today = date.today()

        # Check next 8 weeks
        for week_offset in range(1, 9):
            # Start on Monday
            start = today + timedelta(days=(7 - today.weekday()) + (week_offset - 1) * 7)
            end = start + timedelta(days=duration - 1)

            # Check blackouts
            blackout = LeaveBlackout.query.filter(
                LeaveBlackout.is_active == True,
                LeaveBlackout.date_from <= end,
                LeaveBlackout.date_to >= start
            ).first()

            if blackout and blackout.applies_to_user(user):
                continue

            # Check existing leaves
            existing = Leave.query.filter(
                Leave.user_id == user_id,
                Leave.status.in_(['pending', 'approved']),
                Leave.date_from <= end,
                Leave.date_to >= start
            ).first()

            if existing:
                continue

            # Calculate team impact
            impact = self._calculate_team_impact(user, start, end)
            if impact['score'] < 50:  # Less than 50% impact
                return {'from': start, 'to': end}

        return None

    def _suggest_leave_dates(self, user_id: int) -> List[Dict[str, str]]:
        """Suggest specific dates for taking leave."""
        suggestions = []

        for duration in [3, 5, 7]:
            period = self._find_low_impact_period(user_id, duration)
            if period:
                suggestions.append({
                    'from': period['from'].isoformat(),
                    'to': period['to'].isoformat(),
                    'duration': duration
                })

        return suggestions[:3]
