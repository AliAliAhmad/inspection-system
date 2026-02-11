"""
Defect AI Service - AI-powered defect management features.
Uses shared services for SLA tracking, escalation, and notifications.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta
from app.services.ai_base_service import (
    AIServiceWrapper, RiskScorer, AnomalyDetector, Predictor,
    RecommendationEngine, RiskFactor, RiskResult, Prediction,
    PredictionResult, Recommendation, ScoringUtils
)
from app.services.shared import (
    SLATracker, SLAConfig, EscalationEngine, EscalationRule,
    PointCalculator, PointAction, NotificationPatterns
)
from app.extensions import db
import logging

logger = logging.getLogger(__name__)


class DefectAIService(AIServiceWrapper):
    """
    AI-powered defect management service.
    Provides risk scoring, SLA tracking, escalation, and recommendations.
    """

    def __init__(self):
        super().__init__()

        # Configure SLA tracker for defects
        self.sla_tracker = SLATracker(SLAConfig(
            entity_type='defect',
            severity_sla_hours={
                'critical': 4,
                'high': 24,
                'medium': 72,
                'low': 168,
            },
            warning_threshold=0.5,
            at_risk_threshold=0.75,
        ))

        # Configure escalation engine
        self.escalation_engine = EscalationEngine('defect')
        self.escalation_engine.use_default_overdue_rules()
        self.escalation_engine.use_default_severity_rules()

        # Point calculator
        self.point_calculator = PointCalculator()

    def get_impact_risk(self, defect_id: int) -> Dict[str, Any]:
        """
        Calculate risk score for defect impact on operations.

        Args:
            defect_id: Defect ID

        Returns:
            RiskResult with factors and recommendations
        """
        from app.models import Defect, Equipment

        defect = db.session.get(Defect, defect_id)
        if not defect:
            return {'error': 'Defect not found'}

        factors = []

        # Factor 1: Severity
        severity_scores = {'critical': 40, 'high': 30, 'medium': 15, 'low': 5}
        factors.append(RiskFactor(
            name='severity',
            value=defect.severity,
            score=severity_scores.get(defect.severity, 15),
            weight=0.3,
            description=f'Defect severity: {defect.severity}'
        ))

        # Factor 2: Occurrence count (recurring defect)
        occurrence_score = min(defect.occurrence_count * 10, 40)
        factors.append(RiskFactor(
            name='recurrence',
            value=defect.occurrence_count,
            score=occurrence_score,
            weight=0.25,
            description=f'Found {defect.occurrence_count} time(s)'
        ))

        # Factor 3: Days open
        days_open = (date.today() - defect.created_at.date()).days if defect.created_at else 0
        age_score = min(days_open * 2, 30)
        factors.append(RiskFactor(
            name='age',
            value=days_open,
            score=age_score,
            weight=0.2,
            description=f'Open for {days_open} days'
        ))

        # Factor 4: Equipment criticality
        equipment = defect.inspection.equipment if defect.inspection else None
        if equipment:
            criticality_scores = {'critical': 30, 'high': 20, 'medium': 10, 'low': 5}
            eq_criticality = getattr(equipment, 'criticality', 'medium')
            factors.append(RiskFactor(
                name='equipment_criticality',
                value=eq_criticality,
                score=criticality_scores.get(eq_criticality, 10),
                weight=0.25,
                description=f'Equipment criticality: {eq_criticality}'
            ))

        # Calculate total risk
        total_score = sum(f.score * f.weight for f in factors)
        risk_level = ScoringUtils.score_to_level(total_score)

        # Generate recommendations
        recommendations = []
        if total_score >= 70:
            recommendations.append(Recommendation(
                action='immediate_attention',
                priority='critical',
                description='This defect requires immediate attention due to high risk.',
                impact='Prevents equipment failure and safety issues'
            ))
        if defect.occurrence_count >= 3:
            recommendations.append(Recommendation(
                action='root_cause_analysis',
                priority='high',
                description='Recurring defect - investigate root cause.',
                impact='Prevent future occurrences'
            ))
        if days_open > 7:
            recommendations.append(Recommendation(
                action='escalate',
                priority='medium',
                description='Defect has been open too long - consider escalation.',
                impact='Faster resolution'
            ))

        return {
            'entity_id': defect_id,
            'entity_type': 'defect',
            'risk_score': round(total_score, 1),
            'risk_level': risk_level,
            'factors': [f.__dict__ for f in factors],
            'recommendations': [r.__dict__ for r in recommendations],
            'calculated_at': datetime.utcnow().isoformat()
        }

    def get_sla_status(self, defect_id: int) -> Dict[str, Any]:
        """Get SLA status for a defect."""
        from app.models import Defect

        defect = db.session.get(Defect, defect_id)
        if not defect:
            return {'error': 'Defect not found'}

        return self.sla_tracker.get_status(
            created_at=defect.created_at,
            severity=defect.severity,
            completed_at=defect.resolved_at
        )

    def check_escalation(self, defect_id: int) -> Dict[str, Any]:
        """Check if defect should be escalated."""
        from app.models import Defect

        defect = db.session.get(Defect, defect_id)
        if not defect:
            return {'error': 'Defect not found'}

        # Calculate days overdue
        sla_status = self.get_sla_status(defect_id)
        days_overdue = 0
        if sla_status.get('is_breached'):
            days_overdue = int(sla_status.get('elapsed_hours', 0) / 24)

        context = {
            'entity_id': defect_id,
            'entity_type': 'defect',
            'severity': defect.severity,
            'occurrence_count': defect.occurrence_count,
            'days_overdue': days_overdue,
            'sla_percentage': sla_status.get('percentage', 0),
            'owner_id': defect.assigned_to_id,
            'description': defect.description[:100] if defect.description else '',
        }

        return self.escalation_engine.evaluate(context)

    def predict_resolution_time(self, defect_id: int) -> Dict[str, Any]:
        """Predict time to resolve defect based on historical data."""
        from app.models import Defect
        from sqlalchemy import func

        defect = db.session.get(Defect, defect_id)
        if not defect:
            return {'error': 'Defect not found'}

        # Get historical resolution times for similar defects
        similar_defects = Defect.query.filter(
            Defect.severity == defect.severity,
            Defect.category == defect.category,
            Defect.status == 'closed',
            Defect.resolved_at.isnot(None)
        ).limit(50).all()

        if not similar_defects:
            # Default prediction based on severity
            default_hours = {
                'critical': 4, 'high': 24, 'medium': 72, 'low': 168
            }
            return {
                'predicted_hours': default_hours.get(defect.severity, 72),
                'confidence': 0.3,
                'sample_size': 0,
                'method': 'default_sla'
            }

        # Calculate average resolution time
        resolution_times = []
        for d in similar_defects:
            if d.resolved_at and d.created_at:
                hours = (d.resolved_at - d.created_at).total_seconds() / 3600
                resolution_times.append(hours)

        if resolution_times:
            avg_hours = sum(resolution_times) / len(resolution_times)
            confidence = min(len(resolution_times) / 50, 0.9)

            return {
                'predicted_hours': round(avg_hours, 1),
                'confidence': round(confidence, 2),
                'sample_size': len(resolution_times),
                'method': 'historical_average',
                'prediction_range': {
                    'min': round(min(resolution_times), 1),
                    'max': round(max(resolution_times), 1)
                }
            }

        return {
            'predicted_hours': 72,
            'confidence': 0.3,
            'sample_size': 0,
            'method': 'fallback'
        }

    def find_similar_defects(self, defect_id: int, limit: int = 5) -> List[Dict[str, Any]]:
        """Find similar defects based on equipment, category, and description."""
        from app.models import Defect, Inspection

        defect = db.session.get(Defect, defect_id)
        if not defect:
            return []

        equipment_id = defect.inspection.equipment_id if defect.inspection else None

        query = Defect.query.filter(
            Defect.id != defect_id,
            Defect.category == defect.category
        )

        # Prioritize same equipment
        if equipment_id:
            query = query.join(Inspection).filter(
                Inspection.equipment_id == equipment_id
            )

        similar = query.order_by(Defect.created_at.desc()).limit(limit).all()

        return [{
            'id': d.id,
            'description': d.description[:100] if d.description else '',
            'severity': d.severity,
            'status': d.status,
            'created_at': d.created_at.isoformat() if d.created_at else None,
            'resolution_notes': d.resolution_notes[:100] if d.resolution_notes else None,
            'similarity_score': 0.8 if d.checklist_item_id == defect.checklist_item_id else 0.5
        } for d in similar]

    def analyze_root_cause(self, defect_id: int) -> List[Dict[str, Any]]:
        """Analyze potential root causes for recurring defects."""
        from app.models import Defect

        defect = db.session.get(Defect, defect_id)
        if not defect:
            return []

        recommendations = []

        # Check for recurring pattern
        if defect.occurrence_count >= 2:
            recommendations.append({
                'cause': 'recurring_failure',
                'confidence': 0.8,
                'description': f'This defect has occurred {defect.occurrence_count} times on the same equipment.',
                'suggestion': 'Investigate underlying equipment issue or maintenance procedure.',
                'priority': 'high'
            })

        # Check if category has high failure rate
        from app.models import Inspection
        if defect.category:
            category_defects = Defect.query.filter_by(
                category=defect.category,
                status='open'
            ).count()

            if category_defects > 10:
                recommendations.append({
                    'cause': 'category_pattern',
                    'confidence': 0.6,
                    'description': f'{category_defects} open defects in {defect.category} category.',
                    'suggestion': f'Review {defect.category} maintenance procedures.',
                    'priority': 'medium'
                })

        # Check equipment age/condition
        equipment = defect.inspection.equipment if defect.inspection else None
        if equipment and getattr(equipment, 'age_years', 0) > 10:
            recommendations.append({
                'cause': 'equipment_age',
                'confidence': 0.5,
                'description': 'Equipment is over 10 years old.',
                'suggestion': 'Consider equipment replacement or major overhaul.',
                'priority': 'low'
            })

        return recommendations

    def get_prevention_recommendations(self, equipment_id: int) -> List[Dict[str, Any]]:
        """Get recommendations to prevent defects on equipment."""
        from app.models import Defect, Inspection, Equipment

        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            return []

        # Get defect history for this equipment
        defects = Defect.query.join(Inspection).filter(
            Inspection.equipment_id == equipment_id
        ).order_by(Defect.created_at.desc()).limit(20).all()

        recommendations = []

        if not defects:
            recommendations.append({
                'type': 'continue_monitoring',
                'priority': 'low',
                'description': 'No recent defects. Continue regular inspections.',
                'impact': 'Maintain equipment reliability'
            })
            return recommendations

        # Analyze patterns
        severity_counts = {}
        category_counts = {}
        for d in defects:
            severity_counts[d.severity] = severity_counts.get(d.severity, 0) + 1
            if d.category:
                category_counts[d.category] = category_counts.get(d.category, 0) + 1

        # High severity trend
        if severity_counts.get('critical', 0) + severity_counts.get('high', 0) >= 3:
            recommendations.append({
                'type': 'increase_inspection_frequency',
                'priority': 'high',
                'description': 'Multiple high-severity defects detected. Increase inspection frequency.',
                'impact': 'Early detection of critical issues'
            })

        # Category-specific recommendations
        for category, count in category_counts.items():
            if count >= 3:
                recommendations.append({
                    'type': f'specialized_{category}_check',
                    'priority': 'medium',
                    'description': f'Frequent {category} defects. Schedule specialized {category} inspection.',
                    'impact': f'Reduce {category} failures'
                })

        return recommendations

    def get_dashboard_insights(self) -> Dict[str, Any]:
        """Get AI insights for defect dashboard."""
        from app.models import Defect

        today = date.today()

        # Get counts
        total_open = Defect.query.filter(
            Defect.status.in_(['open', 'in_progress'])
        ).count()

        critical_open = Defect.query.filter(
            Defect.severity == 'critical',
            Defect.status.in_(['open', 'in_progress'])
        ).count()

        overdue = Defect.query.filter(
            Defect.due_date < today,
            Defect.status.in_(['open', 'in_progress'])
        ).count()

        recurring = Defect.query.filter(
            Defect.occurrence_count >= 2,
            Defect.status.in_(['open', 'in_progress'])
        ).count()

        insights = []

        if critical_open > 0:
            insights.append({
                'type': 'warning',
                'title': f'{critical_open} Critical Defects',
                'description': 'Immediate attention required for critical defects.',
                'action': 'View critical defects'
            })

        if overdue > 0:
            insights.append({
                'type': 'alert',
                'title': f'{overdue} Overdue Defects',
                'description': 'Some defects have passed their SLA deadline.',
                'action': 'View overdue defects'
            })

        if recurring > 0:
            insights.append({
                'type': 'info',
                'title': f'{recurring} Recurring Defects',
                'description': 'These defects may need root cause analysis.',
                'action': 'View recurring defects'
            })

        return {
            'summary': {
                'total_open': total_open,
                'critical': critical_open,
                'overdue': overdue,
                'recurring': recurring
            },
            'insights': insights,
            'generated_at': datetime.utcnow().isoformat()
        }


# Singleton instance
defect_ai_service = DefectAIService()
