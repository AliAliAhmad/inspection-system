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

from app.extensions import db
from app.services.ai_base_service import (
    AIServiceWrapper, RiskScorer, Predictor, RecommendationEngine,
    RiskFactor, RiskResult, RiskLevel, Prediction, PredictionResult,
    Recommendation, Priority, ScoringUtils
)
from app.services.shared import (
    NotificationPatterns, EscalationEngine, EscalationRule, SLATracker, SLAConfig,
    overdue_risk_scorer, overdue_insight_generator
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

    def get_summary(self) -> Dict[str, Any]:
        """
        Get summary of all overdue items across inspections, defects, and reviews.

        Returns:
            Dict with counts and oldest days for each category
        """
        inspections = self.get_overdue_inspections()
        defects = self.get_overdue_defects()
        reviews = self.get_overdue_reviews()

        # Calculate oldest days for each category
        def get_oldest_days(items: List[Dict]) -> int:
            if not items:
                return 0
            days_list = [item.get('days_overdue', 0) for item in items]
            return max(days_list) if days_list else 0

        return {
            'inspections': {
                'count': len(inspections),
                'oldest_days': get_oldest_days(inspections),
                'items': inspections[:5]  # Top 5 most overdue
            },
            'defects': {
                'count': len(defects),
                'oldest_days': get_oldest_days(defects),
                'items': defects[:5]
            },
            'reviews': {
                'count': len(reviews),
                'oldest_days': get_oldest_days(reviews),
                'items': reviews[:5]
            },
            'total': len(inspections) + len(defects) + len(reviews),
            'generated_at': datetime.utcnow().isoformat()
        }

    def get_overdue_inspections(self) -> List[Dict[str, Any]]:
        """
        Get overdue inspection assignments from database.
        Inspections are overdue when deadline has passed and status is not completed.

        Returns:
            List of overdue inspection dicts with details
        """
        from app.models import InspectionAssignment, User, Equipment

        today = date.today()
        now = datetime.utcnow()

        # Query inspection assignments where deadline has passed and not completed
        overdue_assignments = InspectionAssignment.query.filter(
            InspectionAssignment.status.notin_(['completed', 'both_complete']),
            db.or_(
                InspectionAssignment.deadline < now,
                db.and_(
                    InspectionAssignment.deadline.is_(None),
                    InspectionAssignment.created_at < now - timedelta(days=1)
                )
            )
        ).order_by(InspectionAssignment.deadline.asc()).all()

        results = []
        for assignment in overdue_assignments:
            # Calculate days overdue
            if assignment.deadline:
                days_overdue = max(0, (now - assignment.deadline).days)
            else:
                days_overdue = max(0, (now - assignment.created_at).days - 1)

            # Get risk assessment using shared scorer
            risk_context = {
                'days_overdue': days_overdue,
                'severity': 'normal',
                'current_workload': 0,
                'completion_rate': 100
            }

            # Check inspector workload
            inspector_id = assignment.mechanical_inspector_id or assignment.electrical_inspector_id
            if inspector_id:
                workload = InspectionAssignment.query.filter(
                    db.or_(
                        InspectionAssignment.mechanical_inspector_id == inspector_id,
                        InspectionAssignment.electrical_inspector_id == inspector_id
                    ),
                    InspectionAssignment.status.notin_(['completed', 'both_complete'])
                ).count()
                risk_context['current_workload'] = workload

            risk_result = overdue_risk_scorer.calculate(risk_context)

            results.append({
                'id': assignment.id,
                'type': 'inspection_assignment',
                'equipment_id': assignment.equipment_id,
                'equipment_name': assignment.equipment.name if assignment.equipment else None,
                'mechanical_inspector_id': assignment.mechanical_inspector_id,
                'mechanical_inspector': assignment.mechanical_inspector.full_name if assignment.mechanical_inspector else None,
                'electrical_inspector_id': assignment.electrical_inspector_id,
                'electrical_inspector': assignment.electrical_inspector.full_name if assignment.electrical_inspector else None,
                'status': assignment.status,
                'deadline': assignment.deadline.isoformat() if assignment.deadline else None,
                'days_overdue': days_overdue,
                'risk_score': risk_result.total_score,
                'risk_level': risk_result.level.value,
                'created_at': assignment.created_at.isoformat() if assignment.created_at else None
            })

        # Sort by days overdue descending
        results.sort(key=lambda x: x['days_overdue'], reverse=True)
        return results

    def get_overdue_defects(self) -> List[Dict[str, Any]]:
        """
        Get SLA-breached defects from database.
        Defects are overdue when SLA deadline has passed based on severity.

        Returns:
            List of overdue defect dicts with SLA details
        """
        from app.models import Defect

        # Query open/in_progress defects
        open_defects = Defect.query.filter(
            Defect.status.in_(['open', 'in_progress'])
        ).all()

        results = []
        for defect in open_defects:
            # Check SLA status using the tracker
            sla_status = self.sla_trackers['defect'].get_status(
                created_at=defect.created_at,
                severity=defect.severity or 'medium',
                completed_at=None
            )

            # Only include if SLA is breached
            if sla_status['is_breached']:
                days_overdue = int(sla_status['elapsed_hours'] / 24)

                # Get risk assessment
                risk_context = {
                    'days_overdue': days_overdue,
                    'severity': defect.severity or 'medium',
                    'current_workload': 0,
                    'completion_rate': 100
                }
                risk_result = overdue_risk_scorer.calculate(risk_context)

                results.append({
                    'id': defect.id,
                    'type': 'defect',
                    'description': defect.description[:100] + '...' if len(defect.description) > 100 else defect.description,
                    'severity': defect.severity,
                    'priority': defect.priority,
                    'status': defect.status,
                    'assigned_to_id': defect.assigned_to_id,
                    'assigned_to': defect.assigned_to.full_name if defect.assigned_to else None,
                    'due_date': defect.due_date.isoformat() if defect.due_date else None,
                    'days_overdue': days_overdue,
                    'sla_percentage': sla_status['percentage'],
                    'sla_status': sla_status['status'],
                    'risk_score': risk_result.total_score,
                    'risk_level': risk_result.level.value,
                    'created_at': defect.created_at.isoformat() if defect.created_at else None
                })

        # Sort by days overdue descending
        results.sort(key=lambda x: x['days_overdue'], reverse=True)
        return results

    def get_overdue_reviews(self) -> List[Dict[str, Any]]:
        """
        Get overdue quality reviews from database.
        Reviews are overdue when SLA deadline has passed for pending reviews.

        Returns:
            List of overdue review dicts with SLA details
        """
        from app.models import QualityReview

        # Query pending reviews
        pending_reviews = QualityReview.query.filter(
            QualityReview.status == 'pending'
        ).all()

        results = []
        for review in pending_reviews:
            # Check SLA status using the tracker
            sla_status = self.sla_trackers['review'].get_status(
                created_at=review.created_at,
                severity='normal',
                completed_at=None
            )

            # Only include if SLA is breached
            if sla_status['is_breached']:
                days_overdue = int(sla_status['elapsed_hours'] / 24)

                results.append({
                    'id': review.id,
                    'type': 'quality_review',
                    'job_type': review.job_type,
                    'job_id': review.job_id,
                    'qe_id': review.qe_id,
                    'quality_engineer': review.quality_engineer.full_name if review.quality_engineer else None,
                    'status': review.status,
                    'sla_deadline': review.sla_deadline.isoformat() if review.sla_deadline else sla_status.get('deadline'),
                    'days_overdue': days_overdue,
                    'sla_percentage': sla_status['percentage'],
                    'sla_status': sla_status['status'],
                    'created_at': review.created_at.isoformat() if review.created_at else None
                })

        # Sort by days overdue descending
        results.sort(key=lambda x: x['days_overdue'], reverse=True)
        return results

    def bulk_reschedule(
        self,
        entity_type: str,
        entity_ids: List[int],
        new_date: str
    ) -> Dict[str, Any]:
        """
        Reschedule multiple overdue items to a new date.

        Args:
            entity_type: Type of entity ('inspection', 'defect', 'review')
            entity_ids: List of entity IDs to reschedule
            new_date: New due date in ISO format (YYYY-MM-DD)

        Returns:
            Dict with success count, failed items, and details
        """
        from app.models import InspectionAssignment, Defect, QualityReview
        from app.extensions import db

        # Parse new date
        try:
            if isinstance(new_date, str):
                new_date_parsed = datetime.fromisoformat(new_date.replace('Z', '+00:00'))
                if new_date_parsed.tzinfo:
                    new_date_parsed = new_date_parsed.replace(tzinfo=None)
            else:
                new_date_parsed = new_date
        except ValueError:
            return {
                'success': False,
                'error': 'Invalid date format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)',
                'updated': 0,
                'failed': entity_ids
            }

        updated = []
        failed = []

        for entity_id in entity_ids:
            try:
                if entity_type == 'inspection':
                    entity = InspectionAssignment.query.get(entity_id)
                    if entity:
                        entity.deadline = new_date_parsed
                        entity.backlog_triggered = False
                        entity.backlog_triggered_at = None
                        updated.append(entity_id)
                    else:
                        failed.append({'id': entity_id, 'reason': 'Not found'})

                elif entity_type == 'defect':
                    entity = Defect.query.get(entity_id)
                    if entity:
                        entity.due_date = new_date_parsed.date() if isinstance(new_date_parsed, datetime) else new_date_parsed
                        updated.append(entity_id)
                    else:
                        failed.append({'id': entity_id, 'reason': 'Not found'})

                elif entity_type == 'review':
                    entity = QualityReview.query.get(entity_id)
                    if entity:
                        entity.sla_deadline = new_date_parsed
                        updated.append(entity_id)
                    else:
                        failed.append({'id': entity_id, 'reason': 'Not found'})
                else:
                    failed.append({'id': entity_id, 'reason': f'Unknown entity type: {entity_type}'})

            except Exception as e:
                logger.error(f"Failed to reschedule {entity_type} {entity_id}: {e}")
                failed.append({'id': entity_id, 'reason': str(e)})

        # Commit all changes
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.error(f"Failed to commit bulk reschedule: {e}")
            return {
                'success': False,
                'error': f'Database error: {str(e)}',
                'updated': 0,
                'failed': [{'id': eid, 'reason': 'Rollback'} for eid in entity_ids]
            }

        return {
            'success': True,
            'entity_type': entity_type,
            'new_date': new_date_parsed.isoformat() if isinstance(new_date_parsed, datetime) else str(new_date_parsed),
            'updated': len(updated),
            'updated_ids': updated,
            'failed': len(failed),
            'failed_items': failed
        }

    def get_calendar_data(
        self,
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> List[Dict[str, Any]]:
        """
        Get overdue items grouped by date for calendar view.

        Args:
            start_date: Start date in ISO format (defaults to 30 days ago)
            end_date: End date in ISO format (defaults to today)

        Returns:
            List of calendar entries with date and items
        """
        from app.models import InspectionAssignment, Defect, QualityReview
        from collections import defaultdict

        # Parse dates
        today = date.today()
        if start_date:
            try:
                start = datetime.fromisoformat(start_date.replace('Z', '+00:00')).date()
            except ValueError:
                start = today - timedelta(days=30)
        else:
            start = today - timedelta(days=30)

        if end_date:
            try:
                end = datetime.fromisoformat(end_date.replace('Z', '+00:00')).date()
            except ValueError:
                end = today
        else:
            end = today

        # Group items by original due date
        calendar_data = defaultdict(lambda: {'inspections': [], 'defects': [], 'reviews': []})

        # Get overdue inspections
        overdue_assignments = InspectionAssignment.query.filter(
            InspectionAssignment.status.notin_(['completed', 'both_complete']),
            InspectionAssignment.deadline.isnot(None)
        ).all()

        for assignment in overdue_assignments:
            due_date = assignment.deadline.date()
            if start <= due_date <= end and assignment.deadline < datetime.utcnow():
                days_overdue = (datetime.utcnow() - assignment.deadline).days
                calendar_data[due_date.isoformat()]['inspections'].append({
                    'id': assignment.id,
                    'equipment_name': assignment.equipment.name if assignment.equipment else f'Equipment #{assignment.equipment_id}',
                    'days_overdue': days_overdue,
                    'status': assignment.status
                })

        # Get overdue defects
        open_defects = Defect.query.filter(
            Defect.status.in_(['open', 'in_progress']),
            Defect.due_date.isnot(None)
        ).all()

        for defect in open_defects:
            if start <= defect.due_date <= end and defect.due_date < today:
                days_overdue = (today - defect.due_date).days
                calendar_data[defect.due_date.isoformat()]['defects'].append({
                    'id': defect.id,
                    'description': defect.description[:50] + '...' if len(defect.description) > 50 else defect.description,
                    'severity': defect.severity,
                    'days_overdue': days_overdue,
                    'status': defect.status
                })

        # Get overdue reviews
        pending_reviews = QualityReview.query.filter(
            QualityReview.status == 'pending',
            QualityReview.sla_deadline.isnot(None)
        ).all()

        for review in pending_reviews:
            due_date = review.sla_deadline.date()
            if start <= due_date <= end and review.sla_deadline < datetime.utcnow():
                days_overdue = (datetime.utcnow() - review.sla_deadline).days
                calendar_data[due_date.isoformat()]['reviews'].append({
                    'id': review.id,
                    'job_type': review.job_type,
                    'job_id': review.job_id,
                    'days_overdue': days_overdue
                })

        # Convert to list format
        result = []
        for date_str, items in sorted(calendar_data.items()):
            total = len(items['inspections']) + len(items['defects']) + len(items['reviews'])
            if total > 0:
                result.append({
                    'date': date_str,
                    'inspections': items['inspections'],
                    'defects': items['defects'],
                    'reviews': items['reviews'],
                    'total': total,
                    'breakdown': {
                        'inspections': len(items['inspections']),
                        'defects': len(items['defects']),
                        'reviews': len(items['reviews'])
                    }
                })

        return result

    def analyze_patterns(self) -> Dict[str, Any]:
        """
        Analyze overdue patterns. Alias for analyze_overdue_patterns().

        Returns:
            PatternAnalysis as dict
        """
        return self.analyze_overdue_patterns().to_dict()

    def predict_overdue_risk(self, entity_type: str, entity_id: int) -> Dict[str, Any]:
        """
        Predict the risk of an entity becoming overdue.

        Args:
            entity_type: Type of entity ('inspection', 'defect', 'review')
            entity_id: ID of the entity to analyze

        Returns:
            Risk prediction result with risk score, level, and recommendations
        """
        from app.models import InspectionAssignment, Defect, QualityReview

        result = {
            'entity_type': entity_type,
            'entity_id': entity_id,
        }

        if entity_type == 'inspection':
            entity = InspectionAssignment.query.get(entity_id)
            if not entity:
                return {'error': f'Inspection assignment {entity_id} not found'}

            # Calculate days overdue or days until due
            now = datetime.utcnow()
            if entity.deadline:
                if entity.deadline < now:
                    days_overdue = (now - entity.deadline).days
                    is_overdue = True
                else:
                    days_overdue = 0
                    is_overdue = False
            else:
                days_overdue = 0
                is_overdue = False

            # Calculate workload
            inspector_id = entity.mechanical_inspector_id or entity.electrical_inspector_id
            workload = 0
            if inspector_id:
                workload = InspectionAssignment.query.filter(
                    db.or_(
                        InspectionAssignment.mechanical_inspector_id == inspector_id,
                        InspectionAssignment.electrical_inspector_id == inspector_id
                    ),
                    InspectionAssignment.status.notin_(['completed', 'both_complete'])
                ).count()

            risk_context = {
                'days_overdue': days_overdue,
                'severity': 'normal',
                'current_workload': workload,
                'completion_rate': 100
            }
            risk_result = overdue_risk_scorer.calculate(risk_context)

            result.update({
                'is_overdue': is_overdue,
                'days_overdue': days_overdue,
                'deadline': entity.deadline.isoformat() if entity.deadline else None,
                'status': entity.status,
                'risk': risk_result.to_dict(),
                'escalation': self._get_escalation_status(entity_id) if is_overdue else None
            })

        elif entity_type == 'defect':
            entity = Defect.query.get(entity_id)
            if not entity:
                return {'error': f'Defect {entity_id} not found'}

            sla_status = self.sla_trackers['defect'].get_status(
                created_at=entity.created_at,
                severity=entity.severity or 'medium',
                completed_at=entity.resolved_at
            )

            days_overdue = int(sla_status['elapsed_hours'] / 24) if sla_status['is_breached'] else 0

            risk_context = {
                'days_overdue': days_overdue,
                'severity': entity.severity or 'medium',
                'current_workload': 0,
                'completion_rate': 100
            }
            risk_result = overdue_risk_scorer.calculate(risk_context)

            result.update({
                'is_overdue': sla_status['is_breached'],
                'days_overdue': days_overdue,
                'due_date': entity.due_date.isoformat() if entity.due_date else None,
                'severity': entity.severity,
                'status': entity.status,
                'sla': sla_status,
                'risk': risk_result.to_dict()
            })

        elif entity_type == 'review':
            entity = QualityReview.query.get(entity_id)
            if not entity:
                return {'error': f'Quality review {entity_id} not found'}

            sla_status = self.sla_trackers['review'].get_status(
                created_at=entity.created_at,
                severity='normal',
                completed_at=entity.reviewed_at
            )

            days_overdue = int(sla_status['elapsed_hours'] / 24) if sla_status['is_breached'] else 0

            risk_context = {
                'days_overdue': days_overdue,
                'severity': 'normal',
                'current_workload': 0,
                'completion_rate': 100
            }
            risk_result = overdue_risk_scorer.calculate(risk_context)

            result.update({
                'is_overdue': sla_status['is_breached'],
                'days_overdue': days_overdue,
                'sla_deadline': entity.sla_deadline.isoformat() if entity.sla_deadline else None,
                'status': entity.status,
                'sla': sla_status,
                'risk': risk_result.to_dict()
            })

        else:
            return {'error': f'Unknown entity type: {entity_type}'}

        return result

    def _get_escalation_status(self, assignment_id: int) -> Dict[str, Any]:
        """Get escalation status for an inspection assignment."""
        from app.models import InspectionAssignment

        assignment = InspectionAssignment.query.get(assignment_id)
        if not assignment:
            return {'error': 'Assignment not found'}

        days_overdue = 0
        now = datetime.utcnow()
        if assignment.deadline and assignment.status not in ['completed', 'both_complete']:
            if assignment.deadline < now:
                days_overdue = (now - assignment.deadline).days

        # Get the primary inspector ID (mechanical or electrical)
        owner_id = assignment.mechanical_inspector_id or assignment.electrical_inspector_id

        context = {
            'entity_id': assignment_id,
            'days_overdue': days_overdue,
            'owner_id': owner_id,
            'description': f"Inspection Assignment #{assignment_id}",
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

            # Get the primary inspector ID (mechanical or electrical)
            inspector_id = assignment.mechanical_inspector_id or assignment.electrical_inspector_id

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
                if inspector_id:
                    roster = RosterEntry.query.filter(
                        RosterEntry.user_id == inspector_id,
                        RosterEntry.date == check_date
                    ).first()

                    if roster and roster.shift_type == 'off':
                        continue

                    # Calculate workload for this date (check deadline date)
                    workload = InspectionAssignment.query.filter(
                        db.or_(
                            InspectionAssignment.mechanical_inspector_id == inspector_id,
                            InspectionAssignment.electrical_inspector_id == inspector_id
                        ),
                        db.func.date(InspectionAssignment.deadline) == check_date,
                        InspectionAssignment.status.notin_(['completed', 'both_complete'])
                    ).count()

                    if workload < best_score:
                        best_score = workload
                        best_date = check_date
                        best_conflicts = workload
                else:
                    # No inspector assigned, just find a day
                    if best_date is None:
                        best_date = check_date
                        best_conflicts = 0

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

        today = date.today()
        now = datetime.utcnow()
        thirty_days_ago = today - timedelta(days=30)
        thirty_days_ago_dt = datetime.combine(thirty_days_ago, datetime.min.time())

        # Analyze completed assignments that were overdue (completed after deadline)
        overdue_assignments = InspectionAssignment.query.filter(
            InspectionAssignment.status.in_(['completed', 'both_complete']),
            InspectionAssignment.deadline.isnot(None),
            InspectionAssignment.deadline >= thirty_days_ago_dt,
            db.or_(
                InspectionAssignment.mech_completed_at > InspectionAssignment.deadline,
                InspectionAssignment.elec_completed_at > InspectionAssignment.deadline
            )
        ).all()

        # Common reasons (days of week with most overdue)
        day_counts = {}
        for a in overdue_assignments:
            if a.deadline:
                day_name = a.deadline.strftime('%A')
                day_counts[day_name] = day_counts.get(day_name, 0) + 1

        peak_days = sorted(day_counts.keys(), key=lambda x: day_counts.get(x, 0), reverse=True)[:3]

        # Inspector patterns - check both mechanical and electrical inspectors
        inspector_overdue = {}
        for a in overdue_assignments:
            # Check mechanical inspector
            if a.mechanical_inspector_id and a.mech_completed_at and a.deadline:
                if a.mech_completed_at > a.deadline:
                    inspector_overdue[a.mechanical_inspector_id] = inspector_overdue.get(a.mechanical_inspector_id, 0) + 1
            # Check electrical inspector
            if a.electrical_inspector_id and a.elec_completed_at and a.deadline:
                if a.elec_completed_at > a.deadline:
                    inspector_overdue[a.electrical_inspector_id] = inspector_overdue.get(a.electrical_inspector_id, 0) + 1

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
            if a.equipment_id:
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
