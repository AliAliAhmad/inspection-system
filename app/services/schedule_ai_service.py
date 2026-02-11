"""
Schedule AI Service - AI-powered scheduling and inspection management features.
Uses shared services for risk scoring, SLA tracking, escalation, and recommendations.
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, date, timedelta
from app.services.ai_base_service import (
    AIServiceWrapper, RiskScorer, AnomalyDetector, Predictor,
    RecommendationEngine, RiskFactor, RiskResult, Prediction,
    PredictionResult, Recommendation, ScoringUtils, Priority, Severity
)
from app.services.shared import (
    SLATracker, SLAConfig, EscalationEngine, EscalationRule,
    EscalationLevel, PointCalculator, PointAction, NotificationPatterns,
    AIInsightGenerator, InsightType, InsightCategory, InsightSeverity,
    RecommendationType, Urgency
)
from app.services.shared.recommendation_engine import RecommendationEngine as SharedRecommendationEngine
from app.services.shared.risk_scorer import RiskScorer as SharedRiskScorer, RiskFactor as SharedRiskFactor
from app.extensions import db
from sqlalchemy import func, and_, or_
import logging
import statistics

logger = logging.getLogger(__name__)


class ScheduleAIService(AIServiceWrapper):
    """
    AI-powered scheduling service for inspection management.
    Provides risk-based scheduling, inspector intelligence, route optimization,
    proactive alerts, and analytics.
    """

    def __init__(self):
        super().__init__()

        # Configure SLA tracker for inspection assignments
        self.sla_tracker = SLATracker(SLAConfig(
            entity_type='inspection_assignment',
            severity_sla_hours={
                'urgent': 12,
                'high': 24,
                'normal': 30,  # 30 hours from shift start
                'low': 48,
            },
            warning_threshold=0.5,
            at_risk_threshold=0.75,
        ))

        # Configure escalation engine
        self.escalation_engine = EscalationEngine('inspection_assignment')
        self.escalation_engine.use_default_overdue_rules()

        # Insight generator for schedule-related insights
        self.insight_generator = AIInsightGenerator(module='schedule')

        # Recommendation engine for schedule recommendations
        self.recommendation_engine = SharedRecommendationEngine(module='schedule')

        # Risk scorer for equipment risk
        self.risk_scorer = SharedRiskScorer(entity_type='equipment')

    # =========================================================================
    # RISK-BASED SCHEDULING
    # =========================================================================

    def calculate_equipment_risk_scores(self) -> List[Dict[str, Any]]:
        """
        Calculate risk score for all equipment based on:
        - Days since last inspection
        - Historical defect count
        - Equipment criticality
        - Recent inspection results

        Returns:
            Sorted list by risk (highest first)
        """
        from app.models import Equipment, Inspection, Defect, InspectionAssignment

        equipment_list = Equipment.query.filter(
            Equipment.status.in_(['active', 'under_maintenance']),
            Equipment.is_scrapped == False
        ).all()

        results = []

        for eq in equipment_list:
            factors = []

            # Factor 1: Days since last inspection
            last_inspection = Inspection.query.filter(
                Inspection.equipment_id == eq.id,
                Inspection.status == 'reviewed'
            ).order_by(Inspection.submitted_at.desc()).first()

            if last_inspection and last_inspection.submitted_at:
                days_since = (datetime.utcnow() - last_inspection.submitted_at).days
            else:
                days_since = 365  # Assume never inspected

            # Score: 0 if inspected today, 100 if 30+ days
            days_score = min(100, (days_since / 30) * 100)
            factors.append(SharedRiskFactor(
                name='days_since_inspection',
                weight=0.35,
                score_fn=lambda ctx, s=days_score: s,
                description=f'{days_since} days since last inspection'
            ))

            # Factor 2: Historical defect count (last 90 days)
            ninety_days_ago = datetime.utcnow() - timedelta(days=90)
            defect_count = Defect.query.join(Inspection).filter(
                Inspection.equipment_id == eq.id,
                Defect.created_at >= ninety_days_ago
            ).count()

            # Score: 0-5 defects = 0-50, 5+ = 50-100
            defect_score = min(100, defect_count * 20)
            factors.append(SharedRiskFactor(
                name='defect_history',
                weight=0.25,
                score_fn=lambda ctx, s=defect_score: s,
                description=f'{defect_count} defects in last 90 days'
            ))

            # Factor 3: Equipment criticality
            criticality_scores = {'critical': 100, 'high': 75, 'medium': 50, 'low': 25}
            criticality = eq.criticality_level or 'medium'
            criticality_score = criticality_scores.get(criticality, 50)
            factors.append(SharedRiskFactor(
                name='criticality',
                weight=0.25,
                score_fn=lambda ctx, s=criticality_score: s,
                description=f'Criticality level: {criticality}'
            ))

            # Factor 4: Recent inspection results (fail rate)
            recent_inspections = Inspection.query.filter(
                Inspection.equipment_id == eq.id,
                Inspection.status == 'reviewed',
                Inspection.submitted_at >= ninety_days_ago
            ).all()

            if recent_inspections:
                fail_count = sum(1 for i in recent_inspections if i.result == 'fail')
                fail_rate = (fail_count / len(recent_inspections)) * 100
            else:
                fail_rate = 50  # Unknown, assume medium risk

            factors.append(SharedRiskFactor(
                name='fail_rate',
                weight=0.15,
                score_fn=lambda ctx, s=fail_rate: s,
                description=f'{fail_rate:.0f}% failure rate'
            ))

            # Calculate total weighted score
            total_score = sum(
                f.score_fn({}) * f.weight for f in factors
            )

            # Determine risk level
            if total_score >= 75:
                risk_level = 'critical'
            elif total_score >= 50:
                risk_level = 'high'
            elif total_score >= 25:
                risk_level = 'medium'
            else:
                risk_level = 'low'

            results.append({
                'equipment_id': eq.id,
                'equipment_name': eq.name,
                'serial_number': eq.serial_number,
                'equipment_type': eq.equipment_type,
                'berth': eq.berth,
                'risk_score': round(total_score, 1),
                'risk_level': risk_level,
                'factors': [
                    {
                        'name': f.name,
                        'description': f.description,
                        'weight': f.weight,
                        'score': round(f.score_fn({}), 1),
                        'weighted_score': round(f.score_fn({}) * f.weight, 1)
                    }
                    for f in factors
                ],
                'days_since_inspection': days_since,
                'defect_count_90d': defect_count,
                'calculated_at': datetime.utcnow().isoformat()
            })

        # Sort by risk score descending
        results.sort(key=lambda x: x['risk_score'], reverse=True)

        return results

    def get_coverage_gaps(self) -> List[Dict[str, Any]]:
        """
        Find equipment with insufficient inspection coverage:
        - Not scheduled this week
        - Overdue for inspection
        - Below recommended frequency

        Returns:
            List with equipment_id, days_uncovered, priority
        """
        from app.models import Equipment, InspectionSchedule, InspectionAssignment, InspectionList, Inspection

        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)

        # Get all active equipment
        equipment_list = Equipment.query.filter(
            Equipment.status.in_(['active', 'under_maintenance']),
            Equipment.is_scrapped == False
        ).all()

        gaps = []

        for eq in equipment_list:
            # Check if scheduled this week
            this_week_assignment = InspectionAssignment.query.join(InspectionList).filter(
                InspectionAssignment.equipment_id == eq.id,
                InspectionList.target_date >= week_start,
                InspectionList.target_date <= week_end
            ).first()

            # Get last completed inspection
            last_inspection = Inspection.query.filter(
                Inspection.equipment_id == eq.id,
                Inspection.status == 'reviewed'
            ).order_by(Inspection.submitted_at.desc()).first()

            if last_inspection and last_inspection.submitted_at:
                days_since = (datetime.utcnow() - last_inspection.submitted_at).days
            else:
                days_since = 999  # Never inspected

            # Determine recommended frequency based on criticality
            criticality = eq.criticality_level or 'medium'
            recommended_days = {
                'critical': 3,
                'high': 7,
                'medium': 14,
                'low': 30
            }.get(criticality, 14)

            is_overdue = days_since > recommended_days
            is_not_scheduled = this_week_assignment is None

            if is_overdue or (is_not_scheduled and days_since > 7):
                # Determine priority
                if days_since > recommended_days * 2:
                    priority = 'critical'
                elif days_since > recommended_days:
                    priority = 'high'
                elif is_not_scheduled:
                    priority = 'medium'
                else:
                    priority = 'low'

                gaps.append({
                    'equipment_id': eq.id,
                    'equipment_name': eq.name,
                    'serial_number': eq.serial_number,
                    'equipment_type': eq.equipment_type,
                    'berth': eq.berth,
                    'days_uncovered': days_since,
                    'recommended_frequency_days': recommended_days,
                    'is_scheduled_this_week': this_week_assignment is not None,
                    'is_overdue': is_overdue,
                    'priority': priority,
                    'criticality': criticality,
                    'last_inspection_date': last_inspection.submitted_at.isoformat() if last_inspection and last_inspection.submitted_at else None,
                    'reason': 'Never inspected' if days_since >= 999 else f'{days_since} days since last inspection'
                })

        # Sort by priority and days uncovered
        priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        gaps.sort(key=lambda x: (priority_order.get(x['priority'], 4), -x['days_uncovered']))

        return gaps

    def suggest_optimal_frequency(self, equipment_id: int) -> Dict[str, Any]:
        """
        AI suggests optimal inspection frequency based on:
        - Equipment type
        - Historical failure rate
        - Criticality level
        - Current condition trends

        Returns:
            Recommended frequency with reasoning
        """
        from app.models import Equipment, Inspection, Defect

        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            return {'error': 'Equipment not found'}

        # Get historical data (last 180 days)
        lookback = datetime.utcnow() - timedelta(days=180)

        inspections = Inspection.query.filter(
            Inspection.equipment_id == equipment_id,
            Inspection.status == 'reviewed',
            Inspection.submitted_at >= lookback
        ).order_by(Inspection.submitted_at.desc()).all()

        defects = Defect.query.join(Inspection).filter(
            Inspection.equipment_id == equipment_id,
            Defect.created_at >= lookback
        ).all()

        # Calculate metrics
        inspection_count = len(inspections)
        defect_count = len(defects)
        fail_count = sum(1 for i in inspections if i.result == 'fail')
        fail_rate = (fail_count / inspection_count * 100) if inspection_count > 0 else 0

        # Base frequency on criticality
        criticality = equipment.criticality_level or 'medium'
        base_frequency = {
            'critical': 3,
            'high': 7,
            'medium': 14,
            'low': 30
        }.get(criticality, 14)

        # Adjust based on failure rate
        adjustment_factor = 1.0
        reasons = []

        if fail_rate > 50:
            adjustment_factor = 0.5
            reasons.append(f'High failure rate ({fail_rate:.0f}%) - increase frequency')
        elif fail_rate > 25:
            adjustment_factor = 0.75
            reasons.append(f'Moderate failure rate ({fail_rate:.0f}%) - slight increase')
        elif fail_rate < 5 and inspection_count >= 5:
            adjustment_factor = 1.5
            reasons.append(f'Low failure rate ({fail_rate:.0f}%) - can reduce frequency')

        # Adjust based on defect severity
        critical_defects = sum(1 for d in defects if d.severity in ['critical', 'high'])
        if critical_defects >= 3:
            adjustment_factor *= 0.8
            reasons.append(f'{critical_defects} critical/high defects - more frequent checks needed')

        # Calculate recommended frequency
        recommended_days = max(1, int(base_frequency * adjustment_factor))

        # Confidence based on data availability
        if inspection_count >= 10:
            confidence = 0.9
        elif inspection_count >= 5:
            confidence = 0.7
        else:
            confidence = 0.5
            reasons.append('Limited historical data - recommendation may change with more inspections')

        return {
            'equipment_id': equipment_id,
            'equipment_name': equipment.name,
            'current_criticality': criticality,
            'base_frequency_days': base_frequency,
            'recommended_frequency_days': recommended_days,
            'recommended_frequency': self._days_to_frequency_label(recommended_days),
            'confidence': round(confidence, 2),
            'reasoning': reasons,
            'metrics': {
                'inspections_analyzed': inspection_count,
                'defects_found': defect_count,
                'failure_rate': round(fail_rate, 1),
                'critical_defects': critical_defects
            },
            'calculated_at': datetime.utcnow().isoformat()
        }

    def _days_to_frequency_label(self, days: int) -> str:
        """Convert days to human-readable frequency."""
        if days <= 1:
            return 'daily'
        elif days <= 3:
            return 'every 2-3 days'
        elif days <= 7:
            return 'weekly'
        elif days <= 14:
            return 'bi-weekly'
        elif days <= 30:
            return 'monthly'
        else:
            return f'every {days} days'

    # =========================================================================
    # INSPECTOR INTELLIGENCE
    # =========================================================================

    def get_inspector_quality_scores(self) -> List[Dict[str, Any]]:
        """
        Calculate quality scores for inspectors:
        - Defect detection rate
        - Inspection accuracy
        - Average duration
        - Equipment type expertise

        Returns:
            List of inspector quality profiles
        """
        from app.models import User, Inspection, InspectionAssignment, Defect

        # Get all active inspectors
        inspectors = User.query.filter(
            or_(User.role == 'inspector', User.minor_role == 'inspector'),
            User.is_active == True
        ).all()

        results = []

        for inspector in inspectors:
            # Get inspection stats (last 90 days)
            ninety_days_ago = datetime.utcnow() - timedelta(days=90)

            inspections = Inspection.query.filter(
                Inspection.technician_id == inspector.id,
                Inspection.status == 'reviewed',
                Inspection.submitted_at >= ninety_days_ago
            ).all()

            if not inspections:
                continue

            # Calculate metrics
            total_inspections = len(inspections)
            failed_inspections = sum(1 for i in inspections if i.result == 'fail')
            defect_detection_rate = (failed_inspections / total_inspections * 100) if total_inspections > 0 else 0

            # Calculate average duration
            durations = []
            for insp in inspections:
                if insp.submitted_at and insp.started_at:
                    duration = (insp.submitted_at - insp.started_at).total_seconds() / 60
                    if duration > 0 and duration < 480:  # Exclude outliers > 8 hours
                        durations.append(duration)

            avg_duration = statistics.mean(durations) if durations else 0

            # Equipment type expertise
            equipment_types = {}
            for insp in inspections:
                if insp.equipment and insp.equipment.equipment_type:
                    eq_type = insp.equipment.equipment_type
                    equipment_types[eq_type] = equipment_types.get(eq_type, 0) + 1

            top_expertise = sorted(
                equipment_types.items(),
                key=lambda x: x[1],
                reverse=True
            )[:3]

            # Calculate quality score (0-100)
            # Based on: detection rate, consistency, volume
            base_score = 50
            detection_bonus = min(20, defect_detection_rate / 5)  # Up to 20 points for detection
            volume_bonus = min(15, total_inspections / 10)  # Up to 15 points for volume
            consistency_bonus = 15 if durations and statistics.stdev(durations) < avg_duration * 0.5 else 0

            quality_score = min(100, base_score + detection_bonus + volume_bonus + consistency_bonus)

            results.append({
                'inspector_id': inspector.id,
                'inspector_name': inspector.full_name,
                'role_id': inspector.role_id,
                'specialization': inspector.specialization,
                'shift': inspector.shift,
                'quality_score': round(quality_score, 1),
                'metrics': {
                    'total_inspections': total_inspections,
                    'defect_detection_rate': round(defect_detection_rate, 1),
                    'avg_duration_minutes': round(avg_duration, 1),
                    'expertise': [{'type': t, 'count': c} for t, c in top_expertise]
                },
                'rating': self._score_to_rating(quality_score)
            })

        # Sort by quality score
        results.sort(key=lambda x: x['quality_score'], reverse=True)

        return results

    def _score_to_rating(self, score: float) -> str:
        """Convert score to rating label."""
        if score >= 90:
            return 'excellent'
        elif score >= 75:
            return 'good'
        elif score >= 60:
            return 'satisfactory'
        elif score >= 40:
            return 'needs_improvement'
        else:
            return 'poor'

    def get_team_performance(self) -> List[Dict[str, Any]]:
        """
        Analyze team combinations:
        - Which mech+elec pairs work best
        - Synergy score
        - Average quality together

        Returns:
            List of team performance data
        """
        from app.models import InspectionAssignment, Inspection

        ninety_days_ago = datetime.utcnow() - timedelta(days=90)

        # Get completed assignments with both inspectors
        assignments = InspectionAssignment.query.filter(
            InspectionAssignment.mechanical_inspector_id.isnot(None),
            InspectionAssignment.electrical_inspector_id.isnot(None),
            InspectionAssignment.status == 'completed',
            InspectionAssignment.created_at >= ninety_days_ago
        ).all()

        # Group by team pairs
        team_stats = {}

        for assignment in assignments:
            mech_id = assignment.mechanical_inspector_id
            elec_id = assignment.electrical_inspector_id
            team_key = (min(mech_id, elec_id), max(mech_id, elec_id))

            if team_key not in team_stats:
                team_stats[team_key] = {
                    'mech_id': mech_id,
                    'elec_id': elec_id,
                    'assignments': [],
                    'mech_inspector': assignment.mechanical_inspector,
                    'elec_inspector': assignment.electrical_inspector
                }

            team_stats[team_key]['assignments'].append(assignment)

        results = []

        for team_key, stats in team_stats.items():
            if len(stats['assignments']) < 3:
                continue  # Need at least 3 assignments for meaningful stats

            assignments = stats['assignments']
            total_assignments = len(assignments)

            # Calculate completion time
            completion_times = []
            for a in assignments:
                if a.mech_completed_at and a.elec_completed_at and a.assigned_at:
                    latest_completion = max(a.mech_completed_at, a.elec_completed_at)
                    duration = (latest_completion - a.assigned_at).total_seconds() / 3600
                    if duration > 0 and duration < 48:
                        completion_times.append(duration)

            avg_completion = statistics.mean(completion_times) if completion_times else 0

            # Check for any backlog triggers
            backlog_count = sum(1 for a in assignments if a.backlog_triggered)
            on_time_rate = ((total_assignments - backlog_count) / total_assignments * 100) if total_assignments > 0 else 0

            # Calculate synergy score
            synergy_score = min(100, on_time_rate * 0.7 + (30 - min(30, avg_completion)) * 1.5)

            results.append({
                'team_id': f'{stats["mech_id"]}_{stats["elec_id"]}',
                'mechanical_inspector': {
                    'id': stats['mech_id'],
                    'name': stats['mech_inspector'].full_name if stats['mech_inspector'] else 'Unknown'
                },
                'electrical_inspector': {
                    'id': stats['elec_id'],
                    'name': stats['elec_inspector'].full_name if stats['elec_inspector'] else 'Unknown'
                },
                'synergy_score': round(synergy_score, 1),
                'metrics': {
                    'total_assignments': total_assignments,
                    'avg_completion_hours': round(avg_completion, 1),
                    'on_time_rate': round(on_time_rate, 1),
                    'backlog_count': backlog_count
                },
                'recommendation': 'excellent_pairing' if synergy_score >= 80 else (
                    'good_pairing' if synergy_score >= 60 else 'needs_review'
                )
            })

        # Sort by synergy score
        results.sort(key=lambda x: x['synergy_score'], reverse=True)

        return results

    def detect_fatigue_risk(self) -> List[Dict[str, Any]]:
        """
        Find inspectors at fatigue risk:
        - Hours worked in last 7 days
        - Consecutive shifts
        - Workload intensity

        Returns:
            List of inspectors with fatigue risk assessment
        """
        from app.models import User, InspectionAssignment

        seven_days_ago = datetime.utcnow() - timedelta(days=7)

        # Get all active inspectors
        inspectors = User.query.filter(
            or_(User.role == 'inspector', User.minor_role == 'inspector'),
            User.is_active == True,
            User.is_on_leave == False
        ).all()

        results = []

        for inspector in inspectors:
            # Get assignments in last 7 days
            assignments = InspectionAssignment.query.filter(
                or_(
                    InspectionAssignment.mechanical_inspector_id == inspector.id,
                    InspectionAssignment.electrical_inspector_id == inspector.id
                ),
                InspectionAssignment.assigned_at >= seven_days_ago
            ).all()

            if not assignments:
                continue

            # Calculate workload
            total_assignments = len(assignments)

            # Group by date to find consecutive days
            work_days = set()
            for a in assignments:
                if a.assigned_at:
                    work_days.add(a.assigned_at.date())

            consecutive_days = len(work_days)

            # Estimate hours worked (assume 2 hours per assignment average)
            estimated_hours = total_assignments * 2

            # Calculate fatigue risk score (0-100)
            hours_factor = min(50, estimated_hours / 40 * 50)  # 40 hours = 50 points
            consecutive_factor = min(30, consecutive_days / 7 * 30)  # 7 days = 30 points
            intensity_factor = min(20, total_assignments / 10 * 20)  # 10 assignments = 20 points

            fatigue_score = hours_factor + consecutive_factor + intensity_factor

            if fatigue_score >= 50:  # Only report those with significant fatigue risk
                results.append({
                    'inspector_id': inspector.id,
                    'inspector_name': inspector.full_name,
                    'role_id': inspector.role_id,
                    'shift': inspector.shift,
                    'fatigue_score': round(fatigue_score, 1),
                    'risk_level': 'critical' if fatigue_score >= 80 else (
                        'high' if fatigue_score >= 65 else 'medium'
                    ),
                    'metrics': {
                        'assignments_7d': total_assignments,
                        'estimated_hours_7d': estimated_hours,
                        'consecutive_work_days': consecutive_days
                    },
                    'recommendations': self._generate_fatigue_recommendations(fatigue_score, consecutive_days, estimated_hours)
                })

        # Sort by fatigue score
        results.sort(key=lambda x: x['fatigue_score'], reverse=True)

        return results

    def _generate_fatigue_recommendations(self, score: float, consecutive_days: int, hours: float) -> List[str]:
        """Generate fatigue prevention recommendations."""
        recommendations = []

        if score >= 80:
            recommendations.append('Consider mandatory rest day')
            recommendations.append('Reduce assignment load immediately')
        if consecutive_days >= 6:
            recommendations.append(f'Working {consecutive_days} consecutive days - schedule day off')
        if hours >= 50:
            recommendations.append(f'Worked ~{hours:.0f} hours in 7 days - monitor for burnout')
        if score >= 65:
            recommendations.append('Review workload distribution')

        return recommendations or ['Continue monitoring']

    # =========================================================================
    # ROUTE OPTIMIZATION
    # =========================================================================

    def optimize_route(self, assignment_ids: List[int]) -> Dict[str, Any]:
        """
        Optimize inspection order by:
        - Berth/location clustering
        - Minimize travel time

        Returns:
            Optimized order with efficiency score
        """
        from app.models import InspectionAssignment

        if not assignment_ids:
            return {'error': 'No assignment IDs provided'}

        assignments = InspectionAssignment.query.filter(
            InspectionAssignment.id.in_(assignment_ids)
        ).all()

        if not assignments:
            return {'error': 'No assignments found'}

        # Group by berth
        berth_groups = {}
        for a in assignments:
            berth = a.berth or (a.equipment.berth if a.equipment else 'unknown')
            if berth not in berth_groups:
                berth_groups[berth] = []
            berth_groups[berth].append(a)

        # Optimize within each berth group (by equipment type for similar checks)
        optimized_order = []
        for berth in ['east', 'west', 'unknown']:
            if berth in berth_groups:
                group = berth_groups[berth]
                # Sort by equipment type within berth
                group.sort(key=lambda x: x.equipment.equipment_type if x.equipment else '')
                optimized_order.extend(group)

        # Calculate efficiency improvement
        original_switches = self._count_berth_switches([a for a in assignments])
        optimized_switches = self._count_berth_switches(optimized_order)

        if original_switches > 0:
            efficiency_improvement = ((original_switches - optimized_switches) / original_switches * 100)
        else:
            efficiency_improvement = 0

        return {
            'original_order': [a.id for a in assignments],
            'optimized_order': [a.id for a in optimized_order],
            'assignments': [
                {
                    'id': a.id,
                    'equipment_id': a.equipment_id,
                    'equipment_name': a.equipment.name if a.equipment else 'Unknown',
                    'berth': a.berth or (a.equipment.berth if a.equipment else 'unknown'),
                    'equipment_type': a.equipment.equipment_type if a.equipment else 'Unknown'
                }
                for a in optimized_order
            ],
            'stats': {
                'total_assignments': len(assignments),
                'berth_switches_original': original_switches,
                'berth_switches_optimized': optimized_switches,
                'efficiency_improvement_pct': round(efficiency_improvement, 1)
            },
            'estimated_time_saved_minutes': optimized_switches * 5,  # Assume 5 min per berth switch
            'optimized_at': datetime.utcnow().isoformat()
        }

    def _count_berth_switches(self, assignments: List) -> int:
        """Count number of berth switches in assignment order."""
        if len(assignments) <= 1:
            return 0

        switches = 0
        prev_berth = None
        for a in assignments:
            berth = a.berth or (a.equipment.berth if a.equipment else 'unknown')
            if prev_berth is not None and berth != prev_berth:
                switches += 1
            prev_berth = berth

        return switches

    # =========================================================================
    # PROACTIVE ALERTS
    # =========================================================================

    def get_sla_warnings(self) -> List[Dict[str, Any]]:
        """
        Get assignments approaching deadline:
        - 4, 8, 12 hours before deadline
        - Current status
        - Recommended action

        Returns:
            List of SLA warnings
        """
        from app.models import InspectionAssignment

        now = datetime.utcnow()
        twelve_hours_later = now + timedelta(hours=12)

        # Get in-progress assignments with upcoming deadlines
        assignments = InspectionAssignment.query.filter(
            InspectionAssignment.status.in_(['assigned', 'in_progress', 'mech_complete', 'elec_complete']),
            InspectionAssignment.deadline.isnot(None),
            InspectionAssignment.deadline <= twelve_hours_later,
            InspectionAssignment.deadline > now
        ).order_by(InspectionAssignment.deadline.asc()).all()

        warnings = []

        for a in assignments:
            hours_remaining = (a.deadline - now).total_seconds() / 3600

            if hours_remaining <= 4:
                urgency = 'critical'
                color = '#ff4d4f'
            elif hours_remaining <= 8:
                urgency = 'high'
                color = '#fa8c16'
            else:
                urgency = 'medium'
                color = '#faad14'

            # Determine recommended action
            if a.status in ['assigned', 'in_progress']:
                if hours_remaining <= 4:
                    action = 'Escalate to engineer - both inspections pending'
                else:
                    action = 'Send reminder to inspectors'
            elif a.status == 'mech_complete':
                action = 'Contact electrical inspector for completion'
            elif a.status == 'elec_complete':
                action = 'Contact mechanical inspector for completion'
            else:
                action = 'Review assignment status'

            warnings.append({
                'assignment_id': a.id,
                'equipment_id': a.equipment_id,
                'equipment_name': a.equipment.name if a.equipment else 'Unknown',
                'status': a.status,
                'deadline': a.deadline.isoformat(),
                'hours_remaining': round(hours_remaining, 1),
                'urgency': urgency,
                'color': color,
                'mechanical_inspector': a.mechanical_inspector.full_name if a.mechanical_inspector else None,
                'electrical_inspector': a.electrical_inspector.full_name if a.electrical_inspector else None,
                'recommended_action': action
            })

        # Also include already breached
        breached = InspectionAssignment.query.filter(
            InspectionAssignment.status.in_(['assigned', 'in_progress', 'mech_complete', 'elec_complete']),
            InspectionAssignment.deadline.isnot(None),
            InspectionAssignment.deadline <= now
        ).order_by(InspectionAssignment.deadline.asc()).all()

        for a in breached:
            hours_overdue = (now - a.deadline).total_seconds() / 3600
            warnings.insert(0, {  # Insert at beginning (most urgent)
                'assignment_id': a.id,
                'equipment_id': a.equipment_id,
                'equipment_name': a.equipment.name if a.equipment else 'Unknown',
                'status': a.status,
                'deadline': a.deadline.isoformat(),
                'hours_overdue': round(hours_overdue, 1),
                'urgency': 'breached',
                'color': '#cf1322',
                'mechanical_inspector': a.mechanical_inspector.full_name if a.mechanical_inspector else None,
                'electrical_inspector': a.electrical_inspector.full_name if a.electrical_inspector else None,
                'recommended_action': 'IMMEDIATE: Escalate to management and reassign if needed'
            })

        return warnings

    def get_capacity_forecast(self, days: int = 7) -> List[Dict[str, Any]]:
        """
        Forecast capacity for next N days:
        - Required inspectors per day
        - Available inspectors
        - Capacity status (sufficient/tight/insufficient)

        Returns:
            List of daily capacity forecasts
        """
        from app.models import User, InspectionSchedule, Leave, Equipment

        today = date.today()
        forecasts = []

        for i in range(days):
            target_date = today + timedelta(days=i)
            day_of_week = target_date.weekday()

            # Count scheduled equipment for this day
            scheduled_equipment = InspectionSchedule.query.filter(
                InspectionSchedule.day_of_week == day_of_week,
                InspectionSchedule.is_active == True
            ).count()

            # Get available inspectors (not on leave)
            all_inspectors = User.query.filter(
                or_(User.role == 'inspector', User.minor_role == 'inspector'),
                User.is_active == True
            ).all()

            # Check leaves for this date
            on_leave_ids = set()
            leaves = Leave.query.filter(
                Leave.status == 'approved',
                Leave.start_date <= target_date,
                Leave.end_date >= target_date
            ).all()
            for leave in leaves:
                on_leave_ids.add(leave.user_id)

            available_inspectors = [i for i in all_inspectors if i.id not in on_leave_ids]

            # Count by shift and specialization
            day_mech = sum(1 for i in available_inspectors if i.shift == 'day' and i.specialization == 'mechanical')
            day_elec = sum(1 for i in available_inspectors if i.shift == 'day' and i.specialization == 'electrical')
            night_mech = sum(1 for i in available_inspectors if i.shift == 'night' and i.specialization == 'mechanical')
            night_elec = sum(1 for i in available_inspectors if i.shift == 'night' and i.specialization == 'electrical')

            # Calculate required teams (1 mech + 1 elec per team)
            day_teams_available = min(day_mech, day_elec)
            night_teams_available = min(night_mech, night_elec)
            total_teams = day_teams_available + night_teams_available

            # Assume each team can handle 5 inspections per shift
            capacity = total_teams * 5
            required = scheduled_equipment

            if capacity >= required * 1.2:
                status = 'sufficient'
                color = '#52c41a'
            elif capacity >= required:
                status = 'tight'
                color = '#faad14'
            else:
                status = 'insufficient'
                color = '#ff4d4f'

            forecasts.append({
                'date': target_date.isoformat(),
                'day_name': target_date.strftime('%A'),
                'day_of_week': day_of_week,
                'required_inspections': required,
                'capacity': capacity,
                'utilization_pct': round((required / capacity * 100) if capacity > 0 else 100, 1),
                'status': status,
                'color': color,
                'available_teams': {
                    'day_shift': day_teams_available,
                    'night_shift': night_teams_available,
                    'total': total_teams
                },
                'inspectors': {
                    'day_mechanical': day_mech,
                    'day_electrical': day_elec,
                    'night_mechanical': night_mech,
                    'night_electrical': night_elec,
                    'on_leave': len(on_leave_ids)
                },
                'recommendations': self._generate_capacity_recommendations(status, required, capacity)
            })

        return forecasts

    def _generate_capacity_recommendations(self, status: str, required: int, capacity: int) -> List[str]:
        """Generate capacity recommendations."""
        recommendations = []

        if status == 'insufficient':
            gap = required - capacity
            recommendations.append(f'Need {gap} more inspection capacity')
            recommendations.append('Consider overtime or shift coverage')
            recommendations.append('Prioritize critical equipment')
        elif status == 'tight':
            recommendations.append('Monitor closely - limited buffer')
            recommendations.append('Prepare backup resources')
        else:
            recommendations.append('Capacity looks good')

        return recommendations

    # =========================================================================
    # ANALYTICS
    # =========================================================================

    def get_equipment_health_trends(self, equipment_id: int) -> Dict[str, Any]:
        """
        Get inspection result trends:
        - Pass/fail history
        - Defect trend
        - Condition score over time

        Returns:
            Health trend data with visualization-ready format
        """
        from app.models import Equipment, Inspection, Defect

        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            return {'error': 'Equipment not found'}

        # Get last 180 days of data
        lookback = datetime.utcnow() - timedelta(days=180)

        inspections = Inspection.query.filter(
            Inspection.equipment_id == equipment_id,
            Inspection.status == 'reviewed',
            Inspection.submitted_at >= lookback
        ).order_by(Inspection.submitted_at.asc()).all()

        # Group by month
        monthly_data = {}
        for insp in inspections:
            month_key = insp.submitted_at.strftime('%Y-%m')
            if month_key not in monthly_data:
                monthly_data[month_key] = {'pass': 0, 'fail': 0, 'total': 0}
            monthly_data[month_key]['total'] += 1
            if insp.result == 'pass':
                monthly_data[month_key]['pass'] += 1
            else:
                monthly_data[month_key]['fail'] += 1

        # Calculate monthly health scores
        timeline = []
        for month_key in sorted(monthly_data.keys()):
            data = monthly_data[month_key]
            pass_rate = (data['pass'] / data['total'] * 100) if data['total'] > 0 else 0
            timeline.append({
                'month': month_key,
                'pass_count': data['pass'],
                'fail_count': data['fail'],
                'total': data['total'],
                'pass_rate': round(pass_rate, 1),
                'health_score': round(pass_rate, 1)  # Simple health = pass rate
            })

        # Get defect counts by month
        defects = Defect.query.join(Inspection).filter(
            Inspection.equipment_id == equipment_id,
            Defect.created_at >= lookback
        ).all()

        defect_by_month = {}
        for d in defects:
            month_key = d.created_at.strftime('%Y-%m')
            if month_key not in defect_by_month:
                defect_by_month[month_key] = {'total': 0, 'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
            defect_by_month[month_key]['total'] += 1
            defect_by_month[month_key][d.severity] = defect_by_month[month_key].get(d.severity, 0) + 1

        # Add defect data to timeline
        for item in timeline:
            month_key = item['month']
            if month_key in defect_by_month:
                item['defects'] = defect_by_month[month_key]
            else:
                item['defects'] = {'total': 0, 'critical': 0, 'high': 0, 'medium': 0, 'low': 0}

        # Calculate overall trend
        if len(timeline) >= 2:
            first_half = timeline[:len(timeline)//2]
            second_half = timeline[len(timeline)//2:]

            first_avg = statistics.mean([t['health_score'] for t in first_half]) if first_half else 0
            second_avg = statistics.mean([t['health_score'] for t in second_half]) if second_half else 0

            if second_avg > first_avg + 5:
                trend = 'improving'
            elif second_avg < first_avg - 5:
                trend = 'declining'
            else:
                trend = 'stable'
        else:
            trend = 'insufficient_data'

        # Current health score
        current_score = timeline[-1]['health_score'] if timeline else 50

        return {
            'equipment_id': equipment_id,
            'equipment_name': equipment.name,
            'current_health_score': current_score,
            'trend': trend,
            'timeline': timeline,
            'summary': {
                'total_inspections': len(inspections),
                'total_defects': len(defects),
                'avg_health_score': round(statistics.mean([t['health_score'] for t in timeline]), 1) if timeline else 0,
                'critical_defects': sum(1 for d in defects if d.severity == 'critical')
            },
            'analyzed_at': datetime.utcnow().isoformat()
        }

    def detect_anomalies(self) -> List[Dict[str, Any]]:
        """
        Detect unusual patterns:
        - Sudden quality drops
        - Unusual inspection durations
        - Suspicious results

        Returns:
            List of detected anomalies
        """
        from app.models import Inspection, InspectionAssignment, User

        anomalies = []
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)

        # Anomaly 1: Sudden increase in failures
        recent_inspections = Inspection.query.filter(
            Inspection.status == 'reviewed',
            Inspection.submitted_at >= seven_days_ago
        ).all()

        baseline_inspections = Inspection.query.filter(
            Inspection.status == 'reviewed',
            Inspection.submitted_at >= thirty_days_ago,
            Inspection.submitted_at < seven_days_ago
        ).all()

        if recent_inspections and baseline_inspections:
            recent_fail_rate = sum(1 for i in recent_inspections if i.result == 'fail') / len(recent_inspections) * 100
            baseline_fail_rate = sum(1 for i in baseline_inspections if i.result == 'fail') / len(baseline_inspections) * 100

            if recent_fail_rate > baseline_fail_rate * 1.5 and recent_fail_rate > 20:
                anomalies.append({
                    'type': 'quality_drop',
                    'severity': 'high',
                    'title': 'Sudden Quality Drop Detected',
                    'description': f'Failure rate increased from {baseline_fail_rate:.1f}% to {recent_fail_rate:.1f}%',
                    'metric': 'failure_rate',
                    'baseline_value': round(baseline_fail_rate, 1),
                    'current_value': round(recent_fail_rate, 1),
                    'change_pct': round((recent_fail_rate - baseline_fail_rate) / baseline_fail_rate * 100 if baseline_fail_rate > 0 else 100, 1),
                    'recommendations': [
                        'Investigate recent equipment changes',
                        'Review inspector performance',
                        'Check for environmental factors'
                    ],
                    'detected_at': datetime.utcnow().isoformat()
                })

        # Anomaly 2: Unusually fast inspections
        fast_inspections = []
        for insp in recent_inspections:
            if insp.submitted_at and insp.started_at:
                duration = (insp.submitted_at - insp.started_at).total_seconds() / 60
                if 0 < duration < 5:  # Less than 5 minutes
                    fast_inspections.append({
                        'inspection_id': insp.id,
                        'duration_minutes': round(duration, 1),
                        'inspector': insp.technician.full_name if insp.technician else 'Unknown',
                        'equipment': insp.equipment.name if insp.equipment else 'Unknown'
                    })

        if len(fast_inspections) >= 3:
            anomalies.append({
                'type': 'suspicious_duration',
                'severity': 'medium',
                'title': 'Unusually Fast Inspections',
                'description': f'{len(fast_inspections)} inspections completed in under 5 minutes',
                'items': fast_inspections[:5],
                'recommendations': [
                    'Review inspection thoroughness',
                    'Verify checklist completion',
                    'Consider inspector training'
                ],
                'detected_at': datetime.utcnow().isoformat()
            })

        # Anomaly 3: SLA breach spike
        breached_assignments = InspectionAssignment.query.filter(
            InspectionAssignment.backlog_triggered == True,
            InspectionAssignment.backlog_triggered_at >= seven_days_ago
        ).count()

        baseline_breaches = InspectionAssignment.query.filter(
            InspectionAssignment.backlog_triggered == True,
            InspectionAssignment.backlog_triggered_at >= thirty_days_ago,
            InspectionAssignment.backlog_triggered_at < seven_days_ago
        ).count()

        # Normalize by time period
        baseline_weekly = baseline_breaches / 3.3  # ~23 days / 7
        if breached_assignments > baseline_weekly * 2 and breached_assignments >= 5:
            anomalies.append({
                'type': 'sla_breach_spike',
                'severity': 'high',
                'title': 'SLA Breach Spike',
                'description': f'{breached_assignments} SLA breaches this week vs {baseline_weekly:.1f} weekly average',
                'current_value': breached_assignments,
                'baseline_value': round(baseline_weekly, 1),
                'recommendations': [
                    'Review resource allocation',
                    'Check for bottlenecks',
                    'Consider temporary capacity increase'
                ],
                'detected_at': datetime.utcnow().isoformat()
            })

        # Sort by severity
        severity_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        anomalies.sort(key=lambda x: severity_order.get(x['severity'], 4))

        return anomalies

    def get_dashboard_summary(self) -> Dict[str, Any]:
        """Get comprehensive AI summary for scheduling dashboard."""
        try:
            risk_equipment = self.calculate_equipment_risk_scores()[:5]
            coverage_gaps = self.get_coverage_gaps()[:5]
            sla_warnings = self.get_sla_warnings()[:5]
            anomalies = self.detect_anomalies()[:3]
            capacity = self.get_capacity_forecast(3)

            return {
                'status': 'success',
                'high_risk_equipment': risk_equipment,
                'coverage_gaps': len(self.get_coverage_gaps()),
                'top_coverage_gaps': coverage_gaps,
                'sla_warnings': sla_warnings,
                'sla_warning_count': len(self.get_sla_warnings()),
                'anomalies': anomalies,
                'capacity_forecast': capacity,
                'generated_at': datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error(f"Error generating dashboard summary: {e}")
            return {
                'status': 'error',
                'error': str(e),
                'generated_at': datetime.utcnow().isoformat()
            }


# Singleton instance
schedule_ai_service = ScheduleAIService()
