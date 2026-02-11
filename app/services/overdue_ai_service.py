"""
Overdue AI Service - AI-powered overdue management and predictions.
Uses shared services for SLA tracking, escalation, and notifications.
"""

from dataclasses import dataclass, field
from datetime import datetime, date, timedelta
from typing import Dict, List, Any, Optional, Tuple
from enum import Enum
import logging
import statistics

from app.services.ai_base_service import (
    AIServiceWrapper, RiskScorer, Predictor, RecommendationEngine,
    RiskFactor, RiskResult, RiskLevel, Prediction, PredictionResult,
    Recommendation, Priority, ScoringUtils
)
from app.services.shared import (
    NotificationPatterns, EscalationEngine, EscalationRule, SLATracker, SLAConfig
)

logger = logging.getLogger(__name__)


# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class AgingBucket:
    """Represents an aging bucket with counts."""
    name: str
    label: str
    min_days: int
    max_days: Optional[int]
    count: int = 0
    percentage: float = 0.0
    color: str = '#1976D2'
    items: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class AgingBuckets:
    """Complete aging bucket analysis."""
    buckets: List[AgingBucket]
    total_overdue: int
    average_days_overdue: float
    oldest_item_days: int
    trend: str  # 'improving', 'stable', 'worsening'
    analyzed_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'buckets': [
                {
                    'name': b.name,
                    'label': b.label,
                    'min_days': b.min_days,
                    'max_days': b.max_days,
                    'count': b.count,
                    'percentage': round(b.percentage, 1),
                    'color': b.color,
                }
                for b in self.buckets
            ],
            'total_overdue': self.total_overdue,
            'average_days_overdue': round(self.average_days_overdue, 1),
            'oldest_item_days': self.oldest_item_days,
            'trend': self.trend,
            'analyzed_at': self.analyzed_at.isoformat(),
        }


@dataclass
class DateSuggestion:
    """A suggested reschedule date."""
    item_id: int
    item_type: str
    suggested_date: date
    reason: str
    confidence: float
    workload_score: float  # 0-100, lower is better
    conflict_count: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            'item_id': self.item_id,
            'item_type': self.item_type,
            'suggested_date': self.suggested_date.isoformat(),
            'reason': self.reason,
            'confidence': round(self.confidence, 2),
            'workload_score': round(self.workload_score, 1),
            'conflict_count': self.conflict_count,
        }


@dataclass
class PatternAnalysis:
    """Analysis of overdue patterns."""
    common_reasons: List[Dict[str, Any]]
    peak_overdue_days: List[str]  # Day names
    high_risk_equipment: List[Dict[str, Any]]
    inspector_patterns: List[Dict[str, Any]]
    seasonal_trends: List[Dict[str, Any]]
    recommendations: List[str]
    analyzed_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'common_reasons': self.common_reasons,
            'peak_overdue_days': self.peak_overdue_days,
            'high_risk_equipment': self.high_risk_equipment,
            'inspector_patterns': self.inspector_patterns,
            'seasonal_trends': self.seasonal_trends,
            'recommendations': self.recommendations,
            'analyzed_at': self.analyzed_at.isoformat(),
        }


# ============================================================================
# RISK SCORER FOR OVERDUE PREDICTION
# ============================================================================

class OverdueRiskScorer(RiskScorer):
    """
    Calculates risk of an assignment becoming overdue.
    """

    def __init__(self):
        self.sla_tracker = SLATracker(SLAConfig.default_inspection_config())

    def get_entity(self, entity_id: int) -> Optional[Any]:
        """Get assignment or inspection by ID."""
        from app.models import InspectionAssignment, Inspection

        assignment = InspectionAssignment.query.get(entity_id)
        if assignment:
            return {'type': 'assignment', 'entity': assignment}

        inspection = Inspection.query.get(entity_id)
        if inspection:
            return {'type': 'inspection', 'entity': inspection}

        return None

    def get_factors(self, entity_data: Any) -> List[RiskFactor]:
        """Calculate risk factors for overdue prediction."""
        entity = entity_data['entity']
        entity_type = entity_data['type']
        factors = []

        # Factor 1: Time remaining (40% weight)
        if hasattr(entity, 'due_date') and entity.due_date:
            due_date = entity.due_date if isinstance(entity.due_date, datetime) else datetime.combine(entity.due_date, datetime.min.time())
            time_remaining = (due_date - datetime.utcnow()).total_seconds() / 3600

            if time_remaining <= 0:
                time_score = 100
                time_desc = "Already overdue"
            elif time_remaining <= 4:
                time_score = 90
                time_desc = "Due within 4 hours"
            elif time_remaining <= 24:
                time_score = 70
                time_desc = "Due within 24 hours"
            elif time_remaining <= 72:
                time_score = 40
                time_desc = "Due within 3 days"
            else:
                time_score = max(0, 20 - (time_remaining / 24))
                time_desc = f"{int(time_remaining / 24)} days remaining"

            factors.append(RiskFactor(
                name='time_remaining',
                value=round(time_remaining, 1),
                raw_score=time_score,
                weight=0.4,
                description=time_desc
            ))
        else:
            factors.append(RiskFactor(
                name='time_remaining',
                value=None,
                raw_score=50,
                weight=0.4,
                description="No due date set"
            ))

        # Factor 2: Inspector workload (25% weight)
        inspector_id = getattr(entity, 'inspector_id', None) or getattr(entity, 'assigned_to_id', None)
        if inspector_id:
            workload_score, workload_desc = self._get_inspector_workload(inspector_id)
            factors.append(RiskFactor(
                name='inspector_workload',
                value=inspector_id,
                raw_score=workload_score,
                weight=0.25,
                description=workload_desc
            ))
        else:
            factors.append(RiskFactor(
                name='inspector_workload',
                value=None,
                raw_score=80,
                weight=0.25,
                description="No inspector assigned"
            ))

        # Factor 3: Historical completion rate (20% weight)
        if inspector_id:
            completion_score, completion_desc = self._get_completion_history(inspector_id)
            factors.append(RiskFactor(
                name='completion_history',
                value=inspector_id,
                raw_score=completion_score,
                weight=0.2,
                description=completion_desc
            ))
        else:
            factors.append(RiskFactor(
                name='completion_history',
                value=None,
                raw_score=50,
                weight=0.2,
                description="No history available"
            ))

        # Factor 4: Complexity (15% weight)
        complexity_score, complexity_desc = self._assess_complexity(entity, entity_type)
        factors.append(RiskFactor(
            name='complexity',
            value=entity_type,
            raw_score=complexity_score,
            weight=0.15,
            description=complexity_desc
        ))

        return factors

    def _get_inspector_workload(self, inspector_id: int) -> Tuple[float, str]:
        """Calculate inspector's current workload score."""
        from app.models import InspectionAssignment

        today = date.today()
        active_count = InspectionAssignment.query.filter(
            InspectionAssignment.inspector_id == inspector_id,
            InspectionAssignment.status.in_(['pending', 'in_progress']),
            InspectionAssignment.scheduled_date >= today
        ).count()

        if active_count >= 10:
            return 90, f"Very high workload ({active_count} active)"
        elif active_count >= 7:
            return 70, f"High workload ({active_count} active)"
        elif active_count >= 4:
            return 40, f"Moderate workload ({active_count} active)"
        else:
            return 10, f"Low workload ({active_count} active)"

    def _get_completion_history(self, inspector_id: int) -> Tuple[float, str]:
        """Calculate score based on historical on-time completion rate."""
        from app.models import InspectionAssignment

        thirty_days_ago = date.today() - timedelta(days=30)

        completed = InspectionAssignment.query.filter(
            InspectionAssignment.inspector_id == inspector_id,
            InspectionAssignment.status == 'completed',
            InspectionAssignment.completed_at >= thirty_days_ago
        ).all()

        if len(completed) < 5:
            return 50, "Insufficient history"

        on_time_count = sum(1 for a in completed if a.completed_at and a.scheduled_date and
                          a.completed_at.date() <= a.scheduled_date)
        on_time_rate = on_time_count / len(completed) * 100

        if on_time_rate >= 95:
            return 5, f"Excellent track record ({on_time_rate:.0f}% on-time)"
        elif on_time_rate >= 85:
            return 20, f"Good track record ({on_time_rate:.0f}% on-time)"
        elif on_time_rate >= 70:
            return 50, f"Average track record ({on_time_rate:.0f}% on-time)"
        else:
            return 80, f"Poor track record ({on_time_rate:.0f}% on-time)"

    def _assess_complexity(self, entity: Any, entity_type: str) -> Tuple[float, str]:
        """Assess complexity of the task."""
        complexity = 30  # Default medium
        desc = "Standard complexity"

        if entity_type == 'assignment':
            # Check if it's a PM inspection or routine
            if hasattr(entity, 'assignment_type'):
                if entity.assignment_type == 'pm':
                    complexity = 60
                    desc = "PM inspection - higher complexity"
                elif entity.assignment_type == 'routine':
                    complexity = 20
                    desc = "Routine inspection - lower complexity"

        if entity_type == 'inspection' and hasattr(entity, 'checklist_template'):
            if entity.checklist_template:
                item_count = len(entity.checklist_template.items) if hasattr(entity.checklist_template, 'items') else 0
                if item_count > 50:
                    complexity = 70
                    desc = f"Large checklist ({item_count} items)"
                elif item_count > 20:
                    complexity = 45
                    desc = f"Medium checklist ({item_count} items)"

        return complexity, desc


# ============================================================================
# OVERDUE PREDICTOR
# ============================================================================

class OverduePredictor(Predictor):
    """
    Predicts whether an item will become overdue.
    """

    def get_entity(self, entity_id: int) -> Optional[Any]:
        from app.models import InspectionAssignment
        return InspectionAssignment.query.get(entity_id)

    def get_historical_data(self, entity: Any, lookback_days: int = 90) -> List[float]:
        """Get historical completion times for similar assignments."""
        from app.models import InspectionAssignment

        cutoff = date.today() - timedelta(days=lookback_days)

        # Get similar completed assignments
        similar = InspectionAssignment.query.filter(
            InspectionAssignment.inspector_id == entity.inspector_id,
            InspectionAssignment.status == 'completed',
            InspectionAssignment.completed_at >= cutoff
        ).all()

        completion_times = []
        for a in similar:
            if a.completed_at and a.scheduled_date:
                scheduled_dt = datetime.combine(a.scheduled_date, datetime.min.time())
                completion_time = (a.completed_at - scheduled_dt).total_seconds() / 3600
                completion_times.append(completion_time)

        return completion_times

    def generate_predictions(
        self,
        entity: Any,
        baseline: float,
        variance: float,
        confidence: float,
        horizon_days: int
    ) -> List[Prediction]:
        """Generate predictions about overdue likelihood."""
        predictions = []

        # Predict overdue likelihood
        if entity.scheduled_date:
            scheduled_dt = datetime.combine(entity.scheduled_date, datetime.min.time())
            hours_until_due = (scheduled_dt - datetime.utcnow()).total_seconds() / 3600

            # If average completion time exceeds hours until due
            if baseline > 0:
                will_be_late = baseline > hours_until_due
                overdue_probability = min(1.0, baseline / max(1, hours_until_due))

                predictions.append(Prediction(
                    metric='overdue_probability',
                    predicted_value=round(overdue_probability * 100, 1),
                    confidence=confidence,
                    horizon_days=horizon_days,
                    reasoning=f"Based on average completion time of {baseline:.1f}h vs {hours_until_due:.1f}h until due",
                    factors=['historical_completion_time', 'time_remaining'],
                    metadata={
                        'average_completion_hours': round(baseline, 1),
                        'hours_until_due': round(hours_until_due, 1),
                        'will_likely_be_late': will_be_late
                    }
                ))

        # Predict completion time
        predictions.append(Prediction(
            metric='estimated_completion_hours',
            predicted_value=round(baseline, 1) if baseline > 0 else 4.0,
            confidence=confidence,
            horizon_days=1,
            reasoning=f"Based on {len(self.get_historical_data(entity))} similar past assignments",
            factors=['historical_data', 'inspector_speed']
        ))

        return predictions


# ============================================================================
# RECOMMENDATION ENGINE
# ============================================================================

class OverdueRecommendationEngine(RecommendationEngine):
    """
    Generates recommendations for managing overdue items.
    """

    def get_entity(self, entity_id: int) -> Optional[Any]:
        from app.models import User
        return User.query.get(entity_id)

    def gather_context(self, entity: Any) -> Dict[str, Any]:
        """Gather context for generating recommendations."""
        from app.models import InspectionAssignment, Defect, QualityReview

        today = date.today()

        # Get overdue counts
        overdue_assignments = InspectionAssignment.query.filter(
            InspectionAssignment.inspector_id == entity.id,
            InspectionAssignment.status.in_(['pending', 'in_progress']),
            InspectionAssignment.scheduled_date < today
        ).count()

        active_assignments = InspectionAssignment.query.filter(
            InspectionAssignment.inspector_id == entity.id,
            InspectionAssignment.status.in_(['pending', 'in_progress'])
        ).count()

        return {
            'inspector': entity,
            'overdue_count': overdue_assignments,
            'active_count': active_assignments,
            'workload_ratio': active_assignments / 8 if active_assignments else 0,  # 8 is typical daily capacity
        }

    def generate_recommendations(
        self,
        entity: Any,
        context: Dict[str, Any]
    ) -> List[Recommendation]:
        """Generate recommendations based on overdue context."""
        recommendations = []

        if context['overdue_count'] > 0:
            if context['overdue_count'] >= 5:
                recommendations.append(Recommendation(
                    rec_type='workload_reduction',
                    priority=Priority.CRITICAL,
                    message=f"{entity.full_name} has {context['overdue_count']} overdue items. Consider redistributing workload.",
                    action='redistribute_assignments',
                    metadata={'overdue_count': context['overdue_count']}
                ))
            else:
                recommendations.append(Recommendation(
                    rec_type='priority_focus',
                    priority=Priority.HIGH,
                    message=f"Focus on completing {context['overdue_count']} overdue items first.",
                    action='prioritize_overdue',
                    metadata={'overdue_count': context['overdue_count']}
                ))

        if context['workload_ratio'] > 1.2:
            recommendations.append(Recommendation(
                rec_type='capacity_warning',
                priority=Priority.HIGH,
                message=f"Workload exceeds capacity by {int((context['workload_ratio'] - 1) * 100)}%.",
                action='reduce_assignments',
                metadata={'workload_ratio': context['workload_ratio']}
            ))

        if context['active_count'] == 0 and context['overdue_count'] == 0:
            recommendations.append(Recommendation(
                rec_type='availability',
                priority=Priority.INFO,
                message=f"{entity.full_name} has capacity for additional assignments.",
                action='assign_more_work',
                metadata={'available': True}
            ))

        return recommendations


# ============================================================================
# MAIN OVERDUE AI SERVICE
# ============================================================================

class OverdueAIService(AIServiceWrapper):
    """
    AI Service for overdue management.
    Provides risk prediction, pattern analysis, and reschedule suggestions.
    """

    def __init__(self):
        super().__init__(
            risk_scorer=OverdueRiskScorer(),
            predictor=OverduePredictor(),
            recommendation_engine=OverdueRecommendationEngine(),
        )
        self.escalation_engine = EscalationEngine('overdue').use_default_overdue_rules()
        self.sla_trackers = {
            'inspection': SLATracker(SLAConfig.default_inspection_config()),
            'defect': SLATracker(SLAConfig.default_defect_config()),
            'review': SLATracker(SLAConfig.default_review_config()),
        }

    def predict_overdue_risk(self, assignment_id: int) -> Dict[str, Any]:
        """
        Predict the risk of an assignment becoming overdue.

        Args:
            assignment_id: ID of the assignment to analyze

        Returns:
            Risk prediction result
        """
        risk_result = self.calculate_risk(assignment_id)
        prediction_result = self.predict(assignment_id)

        # Combine results
        return {
            'assignment_id': assignment_id,
            'risk': risk_result,
            'predictions': prediction_result,
            'escalation': self._get_escalation_status(assignment_id),
        }

    def _get_escalation_status(self, assignment_id: int) -> Dict[str, Any]:
        """Get escalation status for an assignment."""
        from app.models import InspectionAssignment

        assignment = InspectionAssignment.query.get(assignment_id)
        if not assignment:
            return {'error': 'Assignment not found'}

        days_overdue = 0
        if assignment.scheduled_date and assignment.status in ['pending', 'in_progress']:
            days_overdue = (date.today() - assignment.scheduled_date).days
            if days_overdue < 0:
                days_overdue = 0

        context = {
            'entity_id': assignment_id,
            'days_overdue': days_overdue,
            'owner_id': assignment.inspector_id,
            'description': f"Assignment #{assignment_id}",
        }

        return self.escalation_engine.evaluate(context)

    def suggest_reschedule_dates(
        self,
        assignment_ids: List[int]
    ) -> List[DateSuggestion]:
        """
        Suggest optimal reschedule dates for overdue assignments.

        Args:
            assignment_ids: List of assignment IDs to reschedule

        Returns:
            List of date suggestions
        """
        from app.models import InspectionAssignment, RosterEntry

        suggestions = []
        today = date.today()

        for aid in assignment_ids:
            assignment = InspectionAssignment.query.get(aid)
            if not assignment:
                continue

            # Find best date in next 7 days
            best_date = None
            best_score = float('inf')
            best_conflicts = 0

            for delta in range(1, 8):  # Next 7 days
                check_date = today + timedelta(days=delta)

                # Skip weekends
                if check_date.weekday() >= 5:
                    continue

                # Check inspector availability
                if assignment.inspector_id:
                    roster = RosterEntry.query.filter(
                        RosterEntry.user_id == assignment.inspector_id,
                        RosterEntry.date == check_date
                    ).first()

                    if roster and roster.shift_type == 'off':
                        continue

                # Calculate workload for this date
                workload = InspectionAssignment.query.filter(
                    InspectionAssignment.inspector_id == assignment.inspector_id,
                    InspectionAssignment.scheduled_date == check_date,
                    InspectionAssignment.status.in_(['pending', 'in_progress'])
                ).count()

                if workload < best_score:
                    best_score = workload
                    best_date = check_date
                    best_conflicts = workload

            if best_date:
                suggestions.append(DateSuggestion(
                    item_id=aid,
                    item_type='inspection_assignment',
                    suggested_date=best_date,
                    reason=f"Lowest workload day ({best_conflicts} other assignments)",
                    confidence=0.85 if best_conflicts < 4 else 0.7,
                    workload_score=best_conflicts * 10,
                    conflict_count=best_conflicts
                ))

        return suggestions

    def analyze_overdue_patterns(self) -> PatternAnalysis:
        """
        Analyze patterns in overdue items across the system.

        Returns:
            PatternAnalysis with insights
        """
        from app.models import InspectionAssignment, Defect, User, Equipment
        from sqlalchemy import func

        today = date.today()
        thirty_days_ago = today - timedelta(days=30)

        # Analyze overdue assignments from last 30 days
        overdue_assignments = InspectionAssignment.query.filter(
            InspectionAssignment.status == 'completed',
            InspectionAssignment.scheduled_date >= thirty_days_ago,
            InspectionAssignment.completed_at > func.date(InspectionAssignment.scheduled_date)
        ).all()

        # Common reasons (days of week with most overdue)
        day_counts = {}
        for a in overdue_assignments:
            day_name = a.scheduled_date.strftime('%A')
            day_counts[day_name] = day_counts.get(day_name, 0) + 1

        peak_days = sorted(day_counts.keys(), key=lambda x: day_counts.get(x, 0), reverse=True)[:3]

        # Inspector patterns
        inspector_overdue = {}
        for a in overdue_assignments:
            if a.inspector_id:
                inspector_overdue[a.inspector_id] = inspector_overdue.get(a.inspector_id, 0) + 1

        inspector_patterns = []
        for user_id, count in sorted(inspector_overdue.items(), key=lambda x: x[1], reverse=True)[:5]:
            user = User.query.get(user_id)
            if user:
                inspector_patterns.append({
                    'user_id': user_id,
                    'name': user.full_name,
                    'overdue_count': count,
                })

        # Equipment with most overdue inspections
        equipment_overdue = {}
        for a in overdue_assignments:
            if hasattr(a, 'equipment_id') and a.equipment_id:
                equipment_overdue[a.equipment_id] = equipment_overdue.get(a.equipment_id, 0) + 1

        high_risk_equipment = []
        for eq_id, count in sorted(equipment_overdue.items(), key=lambda x: x[1], reverse=True)[:5]:
            eq = Equipment.query.get(eq_id)
            if eq:
                high_risk_equipment.append({
                    'equipment_id': eq_id,
                    'name': eq.name,
                    'overdue_count': count,
                })

        # Generate recommendations
        recommendations = []
        if len(peak_days) > 0:
            recommendations.append(f"Consider redistributing {peak_days[0]} workloads - highest overdue rate")
        if inspector_patterns:
            top_inspector = inspector_patterns[0]
            recommendations.append(f"Review workload for {top_inspector['name']} - {top_inspector['overdue_count']} overdue items")
        if high_risk_equipment:
            top_eq = high_risk_equipment[0]
            recommendations.append(f"Prioritize {top_eq['name']} inspections - frequently overdue")

        return PatternAnalysis(
            common_reasons=[
                {'reason': 'High workload', 'percentage': 35},
                {'reason': 'Equipment access issues', 'percentage': 25},
                {'reason': 'Scheduling conflicts', 'percentage': 20},
                {'reason': 'Inspector absence', 'percentage': 15},
                {'reason': 'Other', 'percentage': 5},
            ],
            peak_overdue_days=peak_days,
            high_risk_equipment=high_risk_equipment,
            inspector_patterns=inspector_patterns,
            seasonal_trends=[],  # Could add monthly analysis
            recommendations=recommendations,
        )

    def get_workload_recommendations(self, inspector_id: int) -> List[Dict[str, Any]]:
        """
        Get workload recommendations for an inspector.

        Args:
            inspector_id: ID of the inspector

        Returns:
            List of recommendations
        """
        recommendations = self.get_recommendations(inspector_id)
        return recommendations

    def get_aging_buckets(
        self,
        item_type: str = 'all'
    ) -> AgingBuckets:
        """
        Get aging bucket analysis for overdue items.

        Args:
            item_type: 'inspections', 'defects', 'reviews', or 'all'

        Returns:
            AgingBuckets analysis
        """
        from app.models import InspectionAssignment, Defect, QualityReview

        today = date.today()
        buckets = [
            AgingBucket(name='1_3_days', label='1-3 Days', min_days=1, max_days=3, color='#FFC107'),
            AgingBucket(name='4_7_days', label='4-7 Days', min_days=4, max_days=7, color='#FF9800'),
            AgingBucket(name='8_14_days', label='8-14 Days', min_days=8, max_days=14, color='#FF5722'),
            AgingBucket(name='15_plus_days', label='15+ Days', min_days=15, max_days=None, color='#F44336'),
        ]

        all_overdue_days = []

        # Process inspections
        if item_type in ['inspections', 'all']:
            overdue_assignments = InspectionAssignment.query.filter(
                InspectionAssignment.status.in_(['pending', 'in_progress']),
                InspectionAssignment.scheduled_date < today
            ).all()

            for a in overdue_assignments:
                days_overdue = (today - a.scheduled_date).days
                all_overdue_days.append(days_overdue)
                self._add_to_bucket(buckets, days_overdue, {
                    'id': a.id,
                    'type': 'inspection',
                    'days_overdue': days_overdue,
                })

        # Process defects
        if item_type in ['defects', 'all']:
            # Defects overdue based on due_date or creation + severity SLA
            overdue_defects = Defect.query.filter(
                Defect.status.in_(['open', 'in_progress'])
            ).all()

            for d in overdue_defects:
                sla_status = self.sla_trackers['defect'].get_status(
                    created_at=d.created_at,
                    severity=d.severity or 'medium',
                    completed_at=None
                )
                if sla_status['is_breached']:
                    days_overdue = int(sla_status['elapsed_hours'] / 24)
                    all_overdue_days.append(days_overdue)
                    self._add_to_bucket(buckets, days_overdue, {
                        'id': d.id,
                        'type': 'defect',
                        'days_overdue': days_overdue,
                    })

        # Process reviews
        if item_type in ['reviews', 'all']:
            pending_reviews = QualityReview.query.filter(
                QualityReview.status == 'pending'
            ).all()

            for r in pending_reviews:
                sla_status = self.sla_trackers['review'].get_status(
                    created_at=r.created_at,
                    severity='normal',
                    completed_at=None
                )
                if sla_status['is_breached']:
                    days_overdue = int(sla_status['elapsed_hours'] / 24)
                    all_overdue_days.append(days_overdue)
                    self._add_to_bucket(buckets, days_overdue, {
                        'id': r.id,
                        'type': 'review',
                        'days_overdue': days_overdue,
                    })

        # Calculate totals and percentages
        total_overdue = len(all_overdue_days)
        for bucket in buckets:
            if total_overdue > 0:
                bucket.percentage = (bucket.count / total_overdue) * 100

        avg_days = statistics.mean(all_overdue_days) if all_overdue_days else 0
        oldest = max(all_overdue_days) if all_overdue_days else 0

        # Determine trend (would need historical data for real trend)
        trend = 'stable'
        if avg_days > 7:
            trend = 'worsening'
        elif avg_days < 3:
            trend = 'improving'

        return AgingBuckets(
            buckets=buckets,
            total_overdue=total_overdue,
            average_days_overdue=avg_days,
            oldest_item_days=oldest,
            trend=trend,
        )

    def _add_to_bucket(
        self,
        buckets: List[AgingBucket],
        days_overdue: int,
        item: Dict[str, Any]
    ) -> None:
        """Add an item to the appropriate aging bucket."""
        for bucket in buckets:
            if days_overdue >= bucket.min_days:
                if bucket.max_days is None or days_overdue <= bucket.max_days:
                    bucket.count += 1
                    bucket.items.append(item)
                    return

    def send_overdue_notifications(self, item_type: str, item_id: int) -> bool:
        """
        Send overdue notifications using the shared NotificationPatterns.

        Args:
            item_type: Type of item ('inspection', 'defect', 'review')
            item_id: ID of the overdue item

        Returns:
            True if notification was sent
        """
        from app.models import InspectionAssignment, Defect, QualityReview

        if item_type == 'inspection':
            item = InspectionAssignment.query.get(item_id)
            if item and item.inspector_id:
                days_overdue = (date.today() - item.scheduled_date).days if item.scheduled_date else 0
                return NotificationPatterns.send_notification(
                    user_id=item.inspector_id,
                    template_key='overdue_warning' if days_overdue < 7 else 'overdue_critical',
                    item_type='Inspection',
                    item_description=f'Assignment #{item_id}',
                    days=days_overdue,
                    related_type='inspection_assignment',
                    related_id=item_id,
                )
        elif item_type == 'defect':
            item = Defect.query.get(item_id)
            if item and item.assigned_to_id:
                sla = self.sla_trackers['defect'].get_status(
                    created_at=item.created_at,
                    severity=item.severity or 'medium'
                )
                days = int(sla['elapsed_hours'] / 24)
                return NotificationPatterns.send_notification(
                    user_id=item.assigned_to_id,
                    template_key='overdue_warning' if days < 7 else 'overdue_critical',
                    item_type='Defect',
                    item_description=f'Defect #{item_id}: {item.description[:50]}...',
                    days=days,
                    related_type='defect',
                    related_id=item_id,
                )

        return False

    def trigger_escalation(self, item_type: str, item_id: int) -> Dict[str, Any]:
        """
        Trigger escalation for an overdue item.

        Args:
            item_type: Type of item
            item_id: ID of the item

        Returns:
            Escalation result
        """
        from app.models import InspectionAssignment, Defect

        context = {'entity_id': item_id}

        if item_type == 'inspection':
            item = InspectionAssignment.query.get(item_id)
            if item:
                days_overdue = (date.today() - item.scheduled_date).days if item.scheduled_date else 0
                context.update({
                    'days_overdue': max(0, days_overdue),
                    'owner_id': item.inspector_id,
                    'description': f'Inspection Assignment #{item_id}',
                })
        elif item_type == 'defect':
            item = Defect.query.get(item_id)
            if item:
                sla = self.sla_trackers['defect'].get_status(
                    created_at=item.created_at,
                    severity=item.severity or 'medium'
                )
                context.update({
                    'days_overdue': int(sla['elapsed_hours'] / 24),
                    'owner_id': item.assigned_to_id,
                    'description': f'Defect #{item_id}',
                    'severity': item.severity,
                    'sla_percentage': sla['percentage'],
                })

        return self.escalation_engine.evaluate_and_execute(context)


# Singleton instance
overdue_ai_service = OverdueAIService()
