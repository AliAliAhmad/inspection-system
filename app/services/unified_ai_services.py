"""
Unified AI Services for Approvals, Quality Reviews, and Inspection Routines.
Uses the AI Base Service to avoid code duplication.
"""

from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Any, Tuple
from sqlalchemy import func, and_

from app.extensions import db
from app.services.ai_base_service import (
    RiskScorer, AnomalyDetector, Predictor, RecommendationEngine,
    TrendAnalyzer, NLPQueryParser, AIServiceWrapper,
    RiskFactor, RiskResult, Anomaly, AnomalyResult, Prediction,
    Recommendation, Trend, RiskLevel, Severity, Priority,
    ScoringUtils
)


# ============================================================================
# APPROVAL AI SERVICE
# ============================================================================

class ApprovalRiskScorer(RiskScorer):
    """Risk scorer for all approval types (Leave, Pause, Takeover, Bonus)."""

    APPROVAL_WEIGHTS = {
        'historical_approval_rate': 0.25,
        'requester_track_record': 0.20,
        'timing_risk': 0.15,
        'workload_impact': 0.20,
        'policy_compliance': 0.20,
    }

    def __init__(self, approval_type: str):
        self.approval_type = approval_type

    def get_entity(self, entity_id: int) -> Optional[Any]:
        """Get the approval entity based on type."""
        if self.approval_type == 'leave':
            from app.models import Leave
            return db.session.get(Leave, entity_id)
        elif self.approval_type == 'pause':
            from app.models import PauseRequest
            return db.session.get(PauseRequest, entity_id)
        elif self.approval_type == 'takeover':
            from app.models import TakeoverRequest
            return db.session.get(TakeoverRequest, entity_id)
        elif self.approval_type == 'bonus':
            from app.models import BonusStar
            return db.session.get(BonusStar, entity_id)
        return None

    def get_factors(self, entity: Any) -> List[RiskFactor]:
        """Calculate risk factors for approval."""
        factors = []

        # Factor 1: Historical approval rate for this user
        user_id = getattr(entity, 'user_id', None) or getattr(entity, 'requested_by_id', None)
        if user_id:
            approval_rate = self._get_user_approval_rate(user_id)
            # High approval rate = low risk
            score = max(0, 100 - approval_rate)
            factors.append(RiskFactor(
                name='historical_approval_rate',
                value=f"{approval_rate}%",
                raw_score=score,
                weight=self.APPROVAL_WEIGHTS['historical_approval_rate'],
                description=f"User has {approval_rate}% approval rate"
            ))

        # Factor 2: Requester track record
        track_record_score = self._get_track_record_score(entity)
        factors.append(RiskFactor(
            name='requester_track_record',
            value=track_record_score,
            raw_score=100 - track_record_score,  # Good track record = low risk
            weight=self.APPROVAL_WEIGHTS['requester_track_record'],
            description="Based on past behavior and compliance"
        ))

        # Factor 3: Timing risk (short notice, peak period, etc.)
        timing_score = self._calculate_timing_risk(entity)
        factors.append(RiskFactor(
            name='timing_risk',
            value=timing_score,
            raw_score=timing_score,
            weight=self.APPROVAL_WEIGHTS['timing_risk'],
            description="Risk based on timing and notice period"
        ))

        # Factor 4: Workload impact
        impact_score = self._calculate_workload_impact(entity)
        factors.append(RiskFactor(
            name='workload_impact',
            value=impact_score,
            raw_score=impact_score,
            weight=self.APPROVAL_WEIGHTS['workload_impact'],
            description="Impact on team workload if approved"
        ))

        # Factor 5: Policy compliance
        compliance_score = self._check_policy_compliance(entity)
        factors.append(RiskFactor(
            name='policy_compliance',
            value=compliance_score,
            raw_score=100 - compliance_score,  # Compliant = low risk
            weight=self.APPROVAL_WEIGHTS['policy_compliance'],
            description="Compliance with approval policies"
        ))

        return factors

    def _get_user_approval_rate(self, user_id: int) -> float:
        """Get historical approval rate for user."""
        # Query based on approval type
        if self.approval_type == 'leave':
            from app.models import Leave
            total = Leave.query.filter_by(user_id=user_id).count()
            approved = Leave.query.filter_by(user_id=user_id, status='approved').count()
        else:
            total = 10  # Default
            approved = 8

        return round((approved / total * 100) if total > 0 else 80, 1)

    def _get_track_record_score(self, entity: Any) -> float:
        """Score based on user's track record (0-100, higher is better)."""
        # Default good score - would check for policy violations, etc.
        return 85

    def _calculate_timing_risk(self, entity: Any) -> float:
        """Calculate risk based on timing (0-100, higher is riskier)."""
        # Check for short notice
        created_at = getattr(entity, 'created_at', None)
        start_date = getattr(entity, 'from_date', None) or getattr(entity, 'start_date', None)

        if created_at and start_date:
            if isinstance(start_date, date) and isinstance(created_at, datetime):
                notice_days = (start_date - created_at.date()).days
                if notice_days < 1:
                    return 80  # Same day = high risk
                elif notice_days < 3:
                    return 50
                elif notice_days < 7:
                    return 25
        return 10  # Default low risk

    def _calculate_workload_impact(self, entity: Any) -> float:
        """Calculate impact on team workload (0-100, higher is riskier)."""
        # Would check team capacity, concurrent leaves, etc.
        return 20  # Default low impact

    def _check_policy_compliance(self, entity: Any) -> float:
        """Check policy compliance (0-100, higher is more compliant)."""
        # Would check balance, blackout periods, etc.
        return 90  # Default compliant


class ApprovalAnomalyDetector(AnomalyDetector):
    """Detect anomalies in approval patterns."""

    def __init__(self, approval_type: str):
        self.approval_type = approval_type

    def get_entity(self, entity_id: int) -> Optional[Any]:
        """Get approval entity."""
        scorer = ApprovalRiskScorer(self.approval_type)
        return scorer.get_entity(entity_id)

    def get_time_series_data(self, entity: Any, lookback_days: int = 30) -> List[Tuple[datetime, float]]:
        """Get approval request frequency over time."""
        user_id = getattr(entity, 'user_id', None) or getattr(entity, 'requested_by_id', None)
        if not user_id:
            return []

        # Get daily request counts for the user
        cutoff = datetime.utcnow() - timedelta(days=lookback_days)

        if self.approval_type == 'leave':
            from app.models import Leave
            requests = Leave.query.filter(
                Leave.user_id == user_id,
                Leave.created_at >= cutoff
            ).all()
        else:
            return []

        # Group by date
        daily_counts: Dict[date, int] = {}
        for req in requests:
            if req.created_at:
                d = req.created_at.date()
                daily_counts[d] = daily_counts.get(d, 0) + 1

        return [(datetime.combine(d, datetime.min.time()), float(c)) for d, c in daily_counts.items()]

    def get_additional_anomalies(self, entity: Any) -> List[Anomaly]:
        """Check for entity-specific anomalies."""
        anomalies = []

        # Check for unusual patterns
        user_id = getattr(entity, 'user_id', None)
        if user_id and self.approval_type == 'leave':
            from app.models import Leave

            # Check for frequent Monday/Friday leaves (potential abuse)
            recent_leaves = Leave.query.filter(
                Leave.user_id == user_id,
                Leave.created_at >= datetime.utcnow() - timedelta(days=90)
            ).all()

            mon_fri_count = sum(
                1 for l in recent_leaves
                if l.from_date and l.from_date.weekday() in (0, 4)  # Monday or Friday
            )

            if len(recent_leaves) >= 3 and mon_fri_count / len(recent_leaves) > 0.6:
                anomalies.append(Anomaly(
                    anomaly_type='frequent_mon_fri',
                    severity=Severity.MEDIUM,
                    description=f'{mon_fri_count} of {len(recent_leaves)} leaves on Monday/Friday',
                    value=mon_fri_count,
                    baseline=len(recent_leaves)
                ))

        return anomalies


class ApprovalPredictor(Predictor):
    """Predict approval outcomes and processing times."""

    def __init__(self, approval_type: str):
        self.approval_type = approval_type

    def get_entity(self, entity_id: int) -> Optional[Any]:
        scorer = ApprovalRiskScorer(self.approval_type)
        return scorer.get_entity(entity_id)

    def get_historical_data(self, entity: Any, lookback_days: int = 90) -> List[float]:
        """Get historical approval processing times."""
        if self.approval_type == 'leave':
            from app.models import Leave

            approved = Leave.query.filter(
                Leave.status == 'approved',
                Leave.updated_at >= datetime.utcnow() - timedelta(days=lookback_days)
            ).all()

            # Calculate processing times in hours
            times = []
            for l in approved:
                if l.created_at and l.updated_at:
                    hours = (l.updated_at - l.created_at).total_seconds() / 3600
                    times.append(hours)
            return times

        return []

    def generate_predictions(
        self,
        entity: Any,
        baseline: float,
        variance: float,
        confidence: float,
        horizon_days: int
    ) -> List[Prediction]:
        """Generate approval predictions."""
        predictions = []

        # Predict processing time
        predictions.append(Prediction(
            metric='processing_time_hours',
            predicted_value=round(baseline, 1),
            confidence=confidence,
            horizon_days=1,
            reasoning=f"Based on {self.approval_type} approval history",
            factors=['historical_average', 'admin_workload']
        ))

        # Predict approval likelihood
        scorer = ApprovalRiskScorer(self.approval_type)
        risk_result = scorer.calculate(entity.id)
        approval_likelihood = max(0, 100 - risk_result.risk_score)

        predictions.append(Prediction(
            metric='approval_likelihood',
            predicted_value=round(approval_likelihood, 1),
            confidence=0.8,
            horizon_days=1,
            reasoning=f"Based on risk score of {risk_result.risk_score}",
            factors=['risk_score', 'policy_compliance', 'track_record']
        ))

        return predictions


class ApprovalRecommendationEngine(RecommendationEngine):
    """Generate recommendations for approval decisions."""

    def __init__(self, approval_type: str):
        self.approval_type = approval_type

    def get_entity(self, entity_id: int) -> Optional[Any]:
        scorer = ApprovalRiskScorer(self.approval_type)
        return scorer.get_entity(entity_id)

    def gather_context(self, entity: Any) -> Dict[str, Any]:
        """Gather context for recommendations."""
        scorer = ApprovalRiskScorer(self.approval_type)
        risk_result = scorer.calculate(entity.id)

        return {
            'risk_result': risk_result,
            'approval_type': self.approval_type,
            'entity': entity,
        }

    def generate_recommendations(self, entity: Any, context: Dict[str, Any]) -> List[Recommendation]:
        """Generate approval recommendations."""
        recommendations = []
        risk_result = context['risk_result']

        # Auto-approval recommendation
        if risk_result.risk_score <= 25:
            recommendations.append(Recommendation(
                rec_type='auto_approve',
                priority=Priority.HIGH,
                message=f'Low risk ({risk_result.risk_score}/100) - Safe for auto-approval',
                action='auto_approve'
            ))
        elif risk_result.risk_score <= 50:
            recommendations.append(Recommendation(
                rec_type='review',
                priority=Priority.MEDIUM,
                message=f'Medium risk ({risk_result.risk_score}/100) - Quick review recommended',
                action='quick_review'
            ))
        else:
            recommendations.append(Recommendation(
                rec_type='detailed_review',
                priority=Priority.HIGH,
                message=f'High risk ({risk_result.risk_score}/100) - Detailed review required',
                action='detailed_review'
            ))

        # Add factor-specific recommendations
        for factor_name, factor in risk_result.factors.items():
            if factor.raw_score >= 60:
                recommendations.append(Recommendation(
                    rec_type='risk_factor',
                    priority=Priority.MEDIUM,
                    message=f'Check {factor_name.replace("_", " ")}: {factor.description}',
                    action='investigate'
                ))

        return recommendations


# ============================================================================
# QUALITY REVIEW AI SERVICE
# ============================================================================

class QualityReviewRiskScorer(RiskScorer):
    """Risk scorer for quality reviews."""

    WEIGHTS = {
        'inspector_experience': 0.20,
        'equipment_criticality': 0.25,
        'inspection_complexity': 0.20,
        'defect_history': 0.20,
        'time_pressure': 0.15,
    }

    def get_entity(self, entity_id: int) -> Optional[Any]:
        from app.models import QualityReview
        return db.session.get(QualityReview, entity_id)

    def get_factors(self, entity: Any) -> List[RiskFactor]:
        """Calculate risk factors for quality review."""
        factors = []

        # Factor 1: Inspector experience
        exp_score = self._get_inspector_experience_score(entity)
        factors.append(RiskFactor(
            name='inspector_experience',
            value=exp_score,
            raw_score=100 - exp_score,  # More experience = lower risk
            weight=self.WEIGHTS['inspector_experience'],
            description="Based on inspector's experience level"
        ))

        # Factor 2: Equipment criticality
        crit_score = self._get_equipment_criticality(entity)
        factors.append(RiskFactor(
            name='equipment_criticality',
            value=crit_score,
            raw_score=crit_score,
            weight=self.WEIGHTS['equipment_criticality'],
            description="Critical equipment requires closer review"
        ))

        # Factor 3: Inspection complexity
        complexity = self._get_inspection_complexity(entity)
        factors.append(RiskFactor(
            name='inspection_complexity',
            value=complexity,
            raw_score=complexity,
            weight=self.WEIGHTS['inspection_complexity'],
            description="Based on checklist items and findings"
        ))

        # Factor 4: Equipment defect history
        defect_score = self._get_defect_history_score(entity)
        factors.append(RiskFactor(
            name='defect_history',
            value=defect_score,
            raw_score=defect_score,
            weight=self.WEIGHTS['defect_history'],
            description="Equipment's past defect rate"
        ))

        # Factor 5: Time pressure
        time_score = self._get_time_pressure_score(entity)
        factors.append(RiskFactor(
            name='time_pressure',
            value=time_score,
            raw_score=time_score,
            weight=self.WEIGHTS['time_pressure'],
            description="Rushed inspections may have issues"
        ))

        return factors

    def _get_inspector_experience_score(self, entity: Any) -> float:
        """Get inspector experience score (0-100, higher is more experienced)."""
        from app.models import Inspection

        if entity.inspection and entity.inspection.inspector_id:
            inspector_id = entity.inspection.inspector_id
            total_inspections = Inspection.query.filter_by(
                inspector_id=inspector_id,
                status='submitted'
            ).count()

            if total_inspections >= 100:
                return 95
            elif total_inspections >= 50:
                return 80
            elif total_inspections >= 20:
                return 60
            elif total_inspections >= 5:
                return 40
        return 30  # New inspector

    def _get_equipment_criticality(self, entity: Any) -> float:
        """Get equipment criticality score (0-100)."""
        if entity.inspection and entity.inspection.equipment:
            crit = entity.inspection.equipment.criticality_level
            return {'critical': 100, 'high': 75, 'medium': 50, 'low': 25}.get(crit, 50)
        return 50

    def _get_inspection_complexity(self, entity: Any) -> float:
        """Get inspection complexity score (0-100)."""
        if entity.inspection:
            # More findings = more complex
            from app.models import InspectionFinding
            findings = InspectionFinding.query.filter_by(
                inspection_id=entity.inspection.id
            ).count()

            if findings >= 10:
                return 80
            elif findings >= 5:
                return 50
            elif findings >= 2:
                return 30
        return 20

    def _get_defect_history_score(self, entity: Any) -> float:
        """Get equipment defect history score (0-100)."""
        if entity.inspection and entity.inspection.equipment_id:
            from app.models import Defect, Inspection

            defects = Defect.query.join(Inspection).filter(
                Inspection.equipment_id == entity.inspection.equipment_id,
                Defect.created_at >= datetime.utcnow() - timedelta(days=90)
            ).count()

            return min(100, defects * 15)
        return 20

    def _get_time_pressure_score(self, entity: Any) -> float:
        """Get time pressure score (0-100)."""
        if entity.inspection:
            insp = entity.inspection
            if insp.started_at and insp.submitted_at:
                duration_mins = (insp.submitted_at - insp.started_at).total_seconds() / 60
                expected_mins = 30  # Default expected duration

                if duration_mins < expected_mins * 0.5:
                    return 80  # Very rushed
                elif duration_mins < expected_mins * 0.75:
                    return 50
        return 20


class QualityReviewPredictor(Predictor):
    """Predict quality review outcomes."""

    def get_entity(self, entity_id: int) -> Optional[Any]:
        from app.models import QualityReview
        return db.session.get(QualityReview, entity_id)

    def get_historical_data(self, entity: Any, lookback_days: int = 90) -> List[float]:
        """Get historical review scores."""
        from app.models import QualityReview

        reviews = QualityReview.query.filter(
            QualityReview.status == 'approved',
            QualityReview.updated_at >= datetime.utcnow() - timedelta(days=lookback_days)
        ).all()

        return [r.quality_score or 0 for r in reviews if r.quality_score]

    def generate_predictions(
        self,
        entity: Any,
        baseline: float,
        variance: float,
        confidence: float,
        horizon_days: int
    ) -> List[Prediction]:
        """Generate quality predictions."""
        predictions = []

        # Predict defects likely to be found
        scorer = QualityReviewRiskScorer()
        risk = scorer.calculate(entity.id)

        predicted_defects = round(risk.risk_score / 25)  # 0-4 defects based on risk

        predictions.append(Prediction(
            metric='expected_defects',
            predicted_value=predicted_defects,
            confidence=confidence,
            horizon_days=1,
            reasoning=f"Based on risk score of {risk.risk_score}",
            factors=['equipment_history', 'inspector_experience', 'complexity']
        ))

        # Predict approval likelihood
        approval_likelihood = max(0, 100 - risk.risk_score)
        predictions.append(Prediction(
            metric='approval_likelihood',
            predicted_value=round(approval_likelihood, 1),
            confidence=0.75,
            horizon_days=1,
            reasoning="Based on quality risk factors",
            factors=['inspector_experience', 'equipment_criticality']
        ))

        return predictions


class QualityReviewTrendAnalyzer(TrendAnalyzer):
    """Analyze quality review trends."""

    def get_period_data(
        self,
        entity_id: int,
        current_start: date,
        current_end: date,
        previous_start: date,
        previous_end: date
    ) -> Tuple[Dict[str, float], Dict[str, float]]:
        """Get quality metrics for current and previous periods."""
        from app.models import QualityReview

        def get_metrics(start: date, end: date) -> Dict[str, float]:
            reviews = QualityReview.query.filter(
                func.date(QualityReview.created_at) >= start,
                func.date(QualityReview.created_at) <= end
            ).all()

            total = len(reviews)
            approved = sum(1 for r in reviews if r.status == 'approved')
            rejected = sum(1 for r in reviews if r.status == 'rejected')
            avg_score = sum(r.quality_score or 0 for r in reviews) / total if total > 0 else 0

            return {
                'total_reviews': float(total),
                'approval_rate': (approved / total * 100) if total > 0 else 0,
                'rejection_rate': (rejected / total * 100) if total > 0 else 0,
                'average_score': avg_score,
            }

        return get_metrics(current_start, current_end), get_metrics(previous_start, previous_end)


# ============================================================================
# INSPECTION ROUTINE AI SERVICE
# ============================================================================

class InspectionRoutineRiskScorer(RiskScorer):
    """Risk scorer for inspection routines (compliance risk)."""

    WEIGHTS = {
        'schedule_adherence': 0.30,
        'equipment_criticality': 0.25,
        'overdue_inspections': 0.25,
        'inspector_availability': 0.20,
    }

    def get_entity(self, entity_id: int) -> Optional[Any]:
        from app.models import InspectionRoutine
        return db.session.get(InspectionRoutine, entity_id)

    def get_factors(self, entity: Any) -> List[RiskFactor]:
        """Calculate compliance risk factors."""
        factors = []

        # Factor 1: Schedule adherence
        adherence = self._get_schedule_adherence(entity)
        factors.append(RiskFactor(
            name='schedule_adherence',
            value=f"{adherence}%",
            raw_score=100 - adherence,
            weight=self.WEIGHTS['schedule_adherence'],
            description="Percentage of scheduled inspections completed on time"
        ))

        # Factor 2: Equipment criticality
        crit = self._get_equipment_criticality(entity)
        factors.append(RiskFactor(
            name='equipment_criticality',
            value=crit,
            raw_score=crit,
            weight=self.WEIGHTS['equipment_criticality'],
            description="Criticality of equipment in this routine"
        ))

        # Factor 3: Overdue inspections
        overdue = self._get_overdue_count(entity)
        overdue_score = min(100, overdue * 20)
        factors.append(RiskFactor(
            name='overdue_inspections',
            value=overdue,
            raw_score=overdue_score,
            weight=self.WEIGHTS['overdue_inspections'],
            description=f"{overdue} inspections overdue"
        ))

        # Factor 4: Inspector availability
        availability = self._get_inspector_availability(entity)
        factors.append(RiskFactor(
            name='inspector_availability',
            value=f"{availability}%",
            raw_score=100 - availability,
            weight=self.WEIGHTS['inspector_availability'],
            description="Available inspector capacity"
        ))

        return factors

    def _get_schedule_adherence(self, entity: Any) -> float:
        """Calculate schedule adherence percentage."""
        # Would check actual vs scheduled inspections
        return 85  # Default

    def _get_equipment_criticality(self, entity: Any) -> float:
        """Get average equipment criticality in routine."""
        if entity.equipment_schedules:
            crits = []
            for es in entity.equipment_schedules:
                if es.equipment:
                    crit = es.equipment.criticality_level
                    crits.append({'critical': 100, 'high': 75, 'medium': 50, 'low': 25}.get(crit, 50))
            return sum(crits) / len(crits) if crits else 50
        return 50

    def _get_overdue_count(self, entity: Any) -> int:
        """Count overdue inspections in this routine."""
        # Would check scheduled vs completed
        return 0

    def _get_inspector_availability(self, entity: Any) -> float:
        """Check inspector availability."""
        return 80  # Default


class InspectionRoutinePredictor(Predictor):
    """Predict inspection routine outcomes."""

    def get_entity(self, entity_id: int) -> Optional[Any]:
        from app.models import InspectionRoutine
        return db.session.get(InspectionRoutine, entity_id)

    def get_historical_data(self, entity: Any, lookback_days: int = 90) -> List[float]:
        """Get historical completion rates."""
        # Would return daily completion rates
        return [85, 90, 88, 92, 87, 91, 89]  # Sample data

    def generate_predictions(
        self,
        entity: Any,
        baseline: float,
        variance: float,
        confidence: float,
        horizon_days: int
    ) -> List[Prediction]:
        """Generate routine predictions."""
        predictions = []

        predictions.append(Prediction(
            metric='completion_rate',
            predicted_value=round(baseline, 1),
            confidence=confidence,
            horizon_days=horizon_days,
            reasoning="Based on historical completion rates",
            factors=['inspector_capacity', 'equipment_count', 'shift_coverage']
        ))

        # Predict equipment that may fail inspection
        scorer = InspectionRoutineRiskScorer()
        risk = scorer.calculate(entity.id)

        failure_probability = min(100, risk.risk_score * 0.5)
        predictions.append(Prediction(
            metric='failure_probability',
            predicted_value=round(failure_probability, 1),
            confidence=0.7,
            horizon_days=horizon_days,
            reasoning=f"Based on compliance risk of {risk.risk_score}",
            factors=['overdue_count', 'equipment_condition']
        ))

        return predictions


# ============================================================================
# UNIFIED AI SERVICE WRAPPERS
# ============================================================================

class ApprovalAIService(AIServiceWrapper):
    """Unified AI service for approvals."""

    def __init__(self, approval_type: str = 'leave'):
        super().__init__(
            risk_scorer=ApprovalRiskScorer(approval_type),
            anomaly_detector=ApprovalAnomalyDetector(approval_type),
            predictor=ApprovalPredictor(approval_type),
            recommendation_engine=ApprovalRecommendationEngine(approval_type),
        )
        self.approval_type = approval_type

    def can_auto_approve(self, entity_id: int, threshold: float = 25) -> Dict[str, Any]:
        """Check if an approval can be auto-approved."""
        risk = self.calculate_risk(entity_id)
        if 'error' in risk:
            return {'can_auto_approve': False, 'error': risk['error']}

        can_approve = risk['risk_score'] <= threshold
        return {
            'can_auto_approve': can_approve,
            'risk_score': risk['risk_score'],
            'risk_level': risk['risk_level'],
            'threshold': threshold,
            'recommendations': self.get_recommendations(entity_id, max_recommendations=3)
        }


class QualityReviewAIService(AIServiceWrapper):
    """Unified AI service for quality reviews."""

    def __init__(self):
        super().__init__(
            risk_scorer=QualityReviewRiskScorer(),
            predictor=QualityReviewPredictor(),
            trend_analyzer=QualityReviewTrendAnalyzer(),
        )

    def can_auto_approve(self, entity_id: int, threshold: float = 20) -> Dict[str, Any]:
        """Check if a quality review can be auto-approved."""
        risk = self.calculate_risk(entity_id)
        if 'error' in risk:
            return {'can_auto_approve': False, 'error': risk['error']}

        can_approve = risk['risk_score'] <= threshold
        return {
            'can_auto_approve': can_approve,
            'risk_score': risk['risk_score'],
            'risk_level': risk['risk_level'],
            'threshold': threshold,
        }


class InspectionRoutineAIService(AIServiceWrapper):
    """Unified AI service for inspection routines."""

    def __init__(self):
        super().__init__(
            risk_scorer=InspectionRoutineRiskScorer(),
            predictor=InspectionRoutinePredictor(),
        )

    def get_compliance_risk(self, routine_id: int) -> Dict[str, Any]:
        """Get compliance risk assessment for a routine."""
        return self.calculate_risk(routine_id)

    def predict_completion(self, routine_id: int, days: int = 7) -> Dict[str, Any]:
        """Predict completion rate for upcoming period."""
        return self.predict(routine_id, horizon_days=days)
