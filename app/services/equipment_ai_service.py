"""
Equipment AI Service for risk scoring, predictions, and anomaly detection.
Provides AI-powered insights for equipment maintenance and monitoring.
"""

from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Dict, List, Optional, Any, Tuple
from sqlalchemy import func, and_, or_

from app.extensions import db
from app.models import Equipment, Inspection, Defect, EquipmentStatusLog


class EquipmentAIService:
    """
    AI-powered service for equipment analytics, risk assessment, and predictions.

    Provides methods for:
    - Risk score calculation based on multiple factors
    - Failure prediction using historical patterns
    - Anomaly detection in equipment behavior
    - Pattern analysis across equipment types
    - Similar equipment identification
    - Equipment summary generation
    """

    # Risk score weights
    WEIGHT_INSPECTION_DAYS = 0.30  # 30% - days since last inspection
    WEIGHT_DEFECT_COUNT = 0.25    # 25% - defects in last 90 days
    WEIGHT_STATUS_CHANGES = 0.20  # 20% - status change frequency
    WEIGHT_EQUIPMENT_AGE = 0.15   # 15% - equipment age
    WEIGHT_CURRENT_STATUS = 0.10  # 10% - current status

    # Status risk multipliers
    STATUS_RISK_MAP = {
        'active': 0.0,
        'paused': 0.3,
        'under_maintenance': 0.5,
        'stopped': 0.8,
        'out_of_service': 1.0
    }

    # Criticality multipliers for risk
    CRITICALITY_MULTIPLIER = {
        'low': 0.8,
        'medium': 1.0,
        'high': 1.2,
        'critical': 1.5
    }

    @staticmethod
    def calculate_risk_score(equipment_id: int) -> Dict[str, Any]:
        """
        Calculate comprehensive risk score for equipment (0-100).

        Scoring factors:
        - Days since last inspection (30%): Higher days = higher risk
        - Number of defects in last 90 days (25%): More defects = higher risk
        - Status change frequency (20%): More changes = higher risk
        - Equipment age (15%): Older equipment = higher risk
        - Current status (10%): Non-active status = higher risk

        Args:
            equipment_id: ID of the equipment to analyze

        Returns:
            Dict containing:
            - risk_score: Overall risk score (0-100)
            - risk_level: 'low', 'medium', 'high', or 'critical'
            - factors: Breakdown of contributing factors
            - recommendations: List of recommended actions
        """
        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            return {'error': 'Equipment not found'}

        today = date.today()
        now = datetime.utcnow()
        factors = {}
        recommendations = []

        # Factor 1: Days since last inspection (30%)
        last_inspection = Inspection.query.filter_by(
            equipment_id=equipment_id
        ).order_by(Inspection.submitted_at.desc()).first()

        if last_inspection and last_inspection.submitted_at:
            days_since_inspection = (now - last_inspection.submitted_at).days
        else:
            days_since_inspection = 365  # Default to 1 year if never inspected

        # Score: 0-30 days = low risk, 31-60 = medium, 61-90 = high, >90 = critical
        if days_since_inspection <= 30:
            inspection_score = (days_since_inspection / 30) * 25
        elif days_since_inspection <= 60:
            inspection_score = 25 + ((days_since_inspection - 30) / 30) * 25
        elif days_since_inspection <= 90:
            inspection_score = 50 + ((days_since_inspection - 60) / 30) * 25
        else:
            inspection_score = 75 + min((days_since_inspection - 90) / 90, 1) * 25

        factors['inspection_days'] = {
            'value': days_since_inspection,
            'score': round(inspection_score, 2),
            'weight': EquipmentAIService.WEIGHT_INSPECTION_DAYS,
            'weighted_score': round(inspection_score * EquipmentAIService.WEIGHT_INSPECTION_DAYS, 2)
        }

        if days_since_inspection > 60:
            recommendations.append('Schedule an inspection - last inspection was over 60 days ago')

        # Factor 2: Defects in last 90 days (25%)
        ninety_days_ago = now - timedelta(days=90)
        defect_count = Defect.query.join(Inspection).filter(
            Inspection.equipment_id == equipment_id,
            Defect.created_at >= ninety_days_ago
        ).count()

        # Score: 0 defects = 0, 1-2 = 25, 3-5 = 50, 6-10 = 75, >10 = 100
        if defect_count == 0:
            defect_score = 0
        elif defect_count <= 2:
            defect_score = defect_count * 12.5
        elif defect_count <= 5:
            defect_score = 25 + ((defect_count - 2) / 3) * 25
        elif defect_count <= 10:
            defect_score = 50 + ((defect_count - 5) / 5) * 25
        else:
            defect_score = 75 + min((defect_count - 10) / 10, 1) * 25

        factors['defect_count'] = {
            'value': defect_count,
            'score': round(defect_score, 2),
            'weight': EquipmentAIService.WEIGHT_DEFECT_COUNT,
            'weighted_score': round(defect_score * EquipmentAIService.WEIGHT_DEFECT_COUNT, 2)
        }

        if defect_count > 3:
            recommendations.append(f'High defect rate: {defect_count} defects in last 90 days - consider preventive maintenance')

        # Factor 3: Status change frequency (20%)
        status_changes = EquipmentStatusLog.query.filter(
            EquipmentStatusLog.equipment_id == equipment_id,
            EquipmentStatusLog.created_at >= ninety_days_ago
        ).count()

        # Score: 0-1 changes = low, 2-3 = medium, 4-6 = high, >6 = critical
        if status_changes <= 1:
            status_change_score = status_changes * 15
        elif status_changes <= 3:
            status_change_score = 15 + ((status_changes - 1) / 2) * 25
        elif status_changes <= 6:
            status_change_score = 40 + ((status_changes - 3) / 3) * 30
        else:
            status_change_score = 70 + min((status_changes - 6) / 4, 1) * 30

        factors['status_changes'] = {
            'value': status_changes,
            'score': round(status_change_score, 2),
            'weight': EquipmentAIService.WEIGHT_STATUS_CHANGES,
            'weighted_score': round(status_change_score * EquipmentAIService.WEIGHT_STATUS_CHANGES, 2)
        }

        if status_changes > 4:
            recommendations.append('Equipment showing instability - investigate root cause of frequent status changes')

        # Factor 4: Equipment age (15%)
        if equipment.installation_date:
            age_years = (today - equipment.installation_date).days / 365.25
        else:
            age_years = 5  # Default assumption

        # Score: <2 years = low, 2-5 = medium, 5-10 = high, >10 = critical
        if age_years <= 2:
            age_score = (age_years / 2) * 25
        elif age_years <= 5:
            age_score = 25 + ((age_years - 2) / 3) * 25
        elif age_years <= 10:
            age_score = 50 + ((age_years - 5) / 5) * 25
        else:
            age_score = 75 + min((age_years - 10) / 10, 1) * 25

        factors['equipment_age'] = {
            'value': round(age_years, 1),
            'score': round(age_score, 2),
            'weight': EquipmentAIService.WEIGHT_EQUIPMENT_AGE,
            'weighted_score': round(age_score * EquipmentAIService.WEIGHT_EQUIPMENT_AGE, 2)
        }

        if age_years > 7:
            recommendations.append(f'Equipment is {round(age_years, 1)} years old - consider lifecycle review')

        # Factor 5: Current status (10%)
        current_status = equipment.status or 'active'
        status_risk = EquipmentAIService.STATUS_RISK_MAP.get(current_status, 0.5)
        status_score = status_risk * 100

        factors['current_status'] = {
            'value': current_status,
            'score': round(status_score, 2),
            'weight': EquipmentAIService.WEIGHT_CURRENT_STATUS,
            'weighted_score': round(status_score * EquipmentAIService.WEIGHT_CURRENT_STATUS, 2)
        }

        if current_status in ('stopped', 'out_of_service'):
            recommendations.append(f'Equipment currently {current_status} - prioritize repair')

        # Calculate total risk score
        raw_score = sum(f['weighted_score'] for f in factors.values())

        # Apply criticality multiplier
        criticality = equipment.criticality_level or 'medium'
        criticality_mult = EquipmentAIService.CRITICALITY_MULTIPLIER.get(criticality, 1.0)
        final_score = min(raw_score * criticality_mult, 100)  # Cap at 100

        # Determine risk level
        if final_score <= 25:
            risk_level = 'low'
        elif final_score <= 50:
            risk_level = 'medium'
        elif final_score <= 75:
            risk_level = 'high'
        else:
            risk_level = 'critical'

        # Update equipment with calculated risk score
        equipment.last_risk_score = Decimal(str(round(final_score, 2)))
        equipment.risk_score_updated_at = now
        db.session.commit()

        return {
            'equipment_id': equipment_id,
            'risk_score': round(final_score, 2),
            'risk_level': risk_level,
            'criticality_level': criticality,
            'criticality_multiplier': criticality_mult,
            'raw_score': round(raw_score, 2),
            'factors': factors,
            'recommendations': recommendations,
            'calculated_at': now.isoformat()
        }

    @staticmethod
    def predict_failure(equipment_id: int) -> Dict[str, Any]:
        """
        Predict equipment failure probability and maintenance needs.

        Uses historical patterns to estimate:
        - Probability of failure in next 30/60/90 days
        - Recommended maintenance date
        - Estimated remaining useful life

        Args:
            equipment_id: ID of the equipment to analyze

        Returns:
            Dict containing failure predictions and recommendations
        """
        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            return {'error': 'Equipment not found'}

        today = date.today()
        now = datetime.utcnow()

        # Get historical data
        one_year_ago = now - timedelta(days=365)

        # Count failures (defects with severity critical/high in past year)
        failures = Defect.query.join(Inspection).filter(
            Inspection.equipment_id == equipment_id,
            Defect.severity.in_(['critical', 'high']),
            Defect.created_at >= one_year_ago
        ).count()

        # Get status log for downtime analysis
        status_logs = EquipmentStatusLog.query.filter(
            EquipmentStatusLog.equipment_id == equipment_id,
            EquipmentStatusLog.created_at >= one_year_ago
        ).order_by(EquipmentStatusLog.created_at).all()

        # Calculate mean time between failures (MTBF)
        if failures > 1:
            mtbf_days = 365 / failures
        elif failures == 1:
            mtbf_days = 365
        else:
            mtbf_days = 730  # Default to 2 years if no failures

        # Calculate equipment age factor
        if equipment.installation_date:
            age_years = (today - equipment.installation_date).days / 365.25
            age_factor = 1 + (age_years / 10) * 0.5  # 50% increase per 10 years
        else:
            age_factor = 1.2

        # Base failure probability (simplified Weibull-like model)
        days_since_last_failure = mtbf_days  # Default
        last_failure = Defect.query.join(Inspection).filter(
            Inspection.equipment_id == equipment_id,
            Defect.severity.in_(['critical', 'high'])
        ).order_by(Defect.created_at.desc()).first()

        if last_failure and last_failure.created_at:
            days_since_last_failure = (now - last_failure.created_at).days

        # Probability increases as we approach MTBF
        base_prob_30 = min((days_since_last_failure / mtbf_days) * 0.3 * age_factor, 0.6)
        base_prob_60 = min((days_since_last_failure / mtbf_days) * 0.5 * age_factor, 0.8)
        base_prob_90 = min((days_since_last_failure / mtbf_days) * 0.7 * age_factor, 0.95)

        # Adjust based on current status
        status_multiplier = EquipmentAIService.STATUS_RISK_MAP.get(equipment.status, 0.5) + 1

        failure_prob_30 = min(base_prob_30 * status_multiplier, 1.0)
        failure_prob_60 = min(base_prob_60 * status_multiplier, 1.0)
        failure_prob_90 = min(base_prob_90 * status_multiplier, 1.0)

        # Recommended maintenance date (when probability hits 50%)
        if failure_prob_30 >= 0.5:
            recommended_date = today + timedelta(days=7)
            urgency = 'urgent'
        elif failure_prob_60 >= 0.5:
            recommended_date = today + timedelta(days=30)
            urgency = 'high'
        elif failure_prob_90 >= 0.5:
            recommended_date = today + timedelta(days=60)
            urgency = 'medium'
        else:
            recommended_date = today + timedelta(days=90)
            urgency = 'low'

        # Estimated remaining life (years) - simplified calculation
        if equipment.installation_date:
            expected_life = 15  # Default expected lifespan in years
            remaining_life = max(expected_life - age_years, 0)
            remaining_life_adjusted = remaining_life * (1 - (failures / 10))  # Reduce by failures
        else:
            remaining_life_adjusted = 10  # Default

        return {
            'equipment_id': equipment_id,
            'failure_probability': {
                '30_days': round(failure_prob_30 * 100, 1),
                '60_days': round(failure_prob_60 * 100, 1),
                '90_days': round(failure_prob_90 * 100, 1)
            },
            'mtbf_days': round(mtbf_days, 0),
            'days_since_last_failure': days_since_last_failure,
            'historical_failures': failures,
            'recommended_maintenance_date': recommended_date.isoformat(),
            'maintenance_urgency': urgency,
            'estimated_remaining_life_years': round(max(remaining_life_adjusted, 0), 1),
            'age_years': round(age_years if equipment.installation_date else 5, 1),
            'age_factor': round(age_factor, 2),
            'current_status': equipment.status,
            'calculated_at': now.isoformat()
        }

    @staticmethod
    def detect_anomalies(equipment_id: int) -> Dict[str, Any]:
        """
        Detect anomalies in equipment behavior patterns.

        Analyzes:
        - Unusual inspection failure patterns
        - Status change frequency spikes
        - Defect clustering
        - Deviation from similar equipment

        Args:
            equipment_id: ID of the equipment to analyze

        Returns:
            Dict containing detected anomalies and severity
        """
        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            return {'error': 'Equipment not found'}

        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)
        ninety_days_ago = now - timedelta(days=90)
        anomalies = []

        # Anomaly 1: Sudden spike in status changes
        recent_changes = EquipmentStatusLog.query.filter(
            EquipmentStatusLog.equipment_id == equipment_id,
            EquipmentStatusLog.created_at >= thirty_days_ago
        ).count()

        prev_changes = EquipmentStatusLog.query.filter(
            EquipmentStatusLog.equipment_id == equipment_id,
            EquipmentStatusLog.created_at >= ninety_days_ago,
            EquipmentStatusLog.created_at < thirty_days_ago
        ).count()

        # Calculate average monthly rate
        prev_monthly_rate = prev_changes / 2 if prev_changes > 0 else 0.5
        if recent_changes > prev_monthly_rate * 2 and recent_changes >= 3:
            anomalies.append({
                'type': 'status_change_spike',
                'severity': 'high' if recent_changes > prev_monthly_rate * 3 else 'medium',
                'description': f'Status changes increased from {round(prev_monthly_rate, 1)}/month to {recent_changes}/month',
                'value': recent_changes,
                'baseline': round(prev_monthly_rate, 1)
            })

        # Anomaly 2: Failed inspection streak
        recent_inspections = Inspection.query.filter(
            Inspection.equipment_id == equipment_id,
            Inspection.submitted_at >= thirty_days_ago,
            Inspection.status == 'submitted'
        ).order_by(Inspection.submitted_at.desc()).limit(5).all()

        if len(recent_inspections) >= 3:
            failed_count = sum(1 for i in recent_inspections if i.result == 'fail')
            if failed_count >= 3:
                anomalies.append({
                    'type': 'inspection_failure_streak',
                    'severity': 'critical' if failed_count >= 4 else 'high',
                    'description': f'{failed_count} out of last {len(recent_inspections)} inspections failed',
                    'value': failed_count,
                    'total_inspections': len(recent_inspections)
                })

        # Anomaly 3: Defect clustering (multiple defects in short time)
        recent_defects = Defect.query.join(Inspection).filter(
            Inspection.equipment_id == equipment_id,
            Defect.created_at >= thirty_days_ago
        ).all()

        if len(recent_defects) >= 3:
            # Check if defects are clustered (within 7 days of each other)
            defect_dates = sorted([d.created_at for d in recent_defects])
            clusters = 0
            for i in range(len(defect_dates) - 2):
                if (defect_dates[i + 2] - defect_dates[i]).days <= 7:
                    clusters += 1

            if clusters > 0:
                anomalies.append({
                    'type': 'defect_clustering',
                    'severity': 'high' if clusters > 1 else 'medium',
                    'description': f'Multiple defects occurring in short time spans ({clusters} cluster(s) detected)',
                    'value': clusters,
                    'total_defects': len(recent_defects)
                })

        # Anomaly 4: Extended downtime
        if equipment.stopped_at and equipment.status in ('stopped', 'out_of_service'):
            days_stopped = (now - equipment.stopped_at).days
            if days_stopped > 7:
                anomalies.append({
                    'type': 'extended_downtime',
                    'severity': 'critical' if days_stopped > 30 else ('high' if days_stopped > 14 else 'medium'),
                    'description': f'Equipment has been stopped for {days_stopped} days',
                    'value': days_stopped,
                    'stopped_since': equipment.stopped_at.isoformat()
                })

        # Anomaly 5: Compare with similar equipment
        similar_avg = EquipmentAIService._get_similar_equipment_baseline(equipment)
        if similar_avg:
            recent_defect_count = len(recent_defects)
            if recent_defect_count > similar_avg['avg_defects'] * 2 and recent_defect_count >= 3:
                anomalies.append({
                    'type': 'above_peer_average',
                    'severity': 'medium',
                    'description': f'Defect rate ({recent_defect_count}/30 days) is {round(recent_defect_count / max(similar_avg["avg_defects"], 0.1), 1)}x higher than similar equipment',
                    'value': recent_defect_count,
                    'peer_average': round(similar_avg['avg_defects'], 1)
                })

        # Calculate overall anomaly score
        severity_scores = {'low': 1, 'medium': 2, 'high': 3, 'critical': 4}
        if anomalies:
            max_severity = max(severity_scores.get(a['severity'], 1) for a in anomalies)
            total_severity = sum(severity_scores.get(a['severity'], 1) for a in anomalies)
        else:
            max_severity = 0
            total_severity = 0

        return {
            'equipment_id': equipment_id,
            'anomaly_count': len(anomalies),
            'anomalies': anomalies,
            'max_severity': ['none', 'low', 'medium', 'high', 'critical'][max_severity],
            'total_severity_score': total_severity,
            'status': 'anomalies_detected' if anomalies else 'normal',
            'analyzed_at': now.isoformat()
        }

    @staticmethod
    def _get_similar_equipment_baseline(equipment: Equipment) -> Optional[Dict[str, float]]:
        """Get baseline metrics from similar equipment."""
        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)

        # Find similar equipment by type
        similar = Equipment.query.filter(
            Equipment.equipment_type == equipment.equipment_type,
            Equipment.id != equipment.id,
            Equipment.is_scrapped == False
        ).all()

        if len(similar) < 2:
            return None

        # Calculate average defects for similar equipment
        total_defects = 0
        for eq in similar:
            defect_count = Defect.query.join(Inspection).filter(
                Inspection.equipment_id == eq.id,
                Defect.created_at >= thirty_days_ago
            ).count()
            total_defects += defect_count

        return {
            'avg_defects': total_defects / len(similar),
            'sample_size': len(similar)
        }

    @staticmethod
    def analyze_failure_patterns(equipment_type: str) -> Dict[str, Any]:
        """
        Analyze failure patterns across all equipment of a given type.

        Identifies:
        - Common failure modes
        - Time-based patterns
        - Risk factors
        - Preventive maintenance opportunities

        Args:
            equipment_type: Equipment type to analyze

        Returns:
            Dict containing pattern analysis results
        """
        now = datetime.utcnow()
        one_year_ago = now - timedelta(days=365)

        # Get all equipment of this type
        equipment_list = Equipment.query.filter(
            Equipment.equipment_type == equipment_type,
            Equipment.is_scrapped == False
        ).all()

        if not equipment_list:
            return {'error': f'No equipment found for type: {equipment_type}'}

        equipment_ids = [eq.id for eq in equipment_list]

        # Get all defects for this equipment type in past year
        defects = Defect.query.join(Inspection).filter(
            Inspection.equipment_id.in_(equipment_ids),
            Defect.created_at >= one_year_ago
        ).all()

        # Analyze by severity
        severity_counts = {}
        for d in defects:
            severity_counts[d.severity] = severity_counts.get(d.severity, 0) + 1

        # Analyze by month
        monthly_pattern = {}
        for d in defects:
            if d.created_at:
                month_key = d.created_at.strftime('%Y-%m')
                monthly_pattern[month_key] = monthly_pattern.get(month_key, 0) + 1

        # Analyze by category
        category_counts = {}
        for d in defects:
            cat = d.category or 'unspecified'
            category_counts[cat] = category_counts.get(cat, 0) + 1

        # Calculate metrics
        total_equipment = len(equipment_list)
        total_defects = len(defects)
        defects_per_equipment = total_defects / total_equipment if total_equipment > 0 else 0

        # Find highest risk equipment
        equipment_defect_counts = {}
        for d in defects:
            eq_id = d.inspection.equipment_id if d.inspection else None
            if eq_id:
                equipment_defect_counts[eq_id] = equipment_defect_counts.get(eq_id, 0) + 1

        high_risk_equipment = sorted(
            equipment_defect_counts.items(),
            key=lambda x: x[1],
            reverse=True
        )[:5]

        # Identify patterns
        patterns = []

        # Seasonal pattern check
        sorted_months = sorted(monthly_pattern.items())
        if len(sorted_months) >= 6:
            avg_monthly = sum(v for _, v in sorted_months) / len(sorted_months)
            for month, count in sorted_months:
                if count > avg_monthly * 1.5:
                    patterns.append({
                        'type': 'seasonal_spike',
                        'period': month,
                        'value': count,
                        'average': round(avg_monthly, 1)
                    })

        # Category concentration check
        if category_counts:
            total_cat = sum(category_counts.values())
            for cat, count in category_counts.items():
                if count / total_cat > 0.5:
                    patterns.append({
                        'type': 'category_concentration',
                        'category': cat,
                        'percentage': round(count / total_cat * 100, 1)
                    })

        return {
            'equipment_type': equipment_type,
            'total_equipment': total_equipment,
            'total_defects': total_defects,
            'defects_per_equipment': round(defects_per_equipment, 2),
            'severity_distribution': severity_counts,
            'category_distribution': category_counts,
            'monthly_trend': dict(sorted(monthly_pattern.items())),
            'high_risk_equipment': [
                {'equipment_id': eq_id, 'defect_count': count}
                for eq_id, count in high_risk_equipment
            ],
            'patterns': patterns,
            'analyzed_at': now.isoformat()
        }

    @staticmethod
    def find_similar_equipment(equipment_id: int) -> Dict[str, Any]:
        """
        Find equipment similar to the specified equipment.

        Similarity based on:
        - Same equipment type
        - Similar age (+/- 2 years)
        - Similar usage patterns (inspection frequency)

        Args:
            equipment_id: ID of the reference equipment

        Returns:
            Dict containing similar equipment with risk warnings
        """
        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            return {'error': 'Equipment not found'}

        today = date.today()
        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)

        # Calculate reference equipment age
        if equipment.installation_date:
            ref_age_years = (today - equipment.installation_date).days / 365.25
        else:
            ref_age_years = None

        # Find similar equipment by type
        similar_query = Equipment.query.filter(
            Equipment.equipment_type == equipment.equipment_type,
            Equipment.id != equipment_id,
            Equipment.is_scrapped == False
        )

        similar_equipment = similar_query.all()
        results = []

        for eq in similar_equipment:
            # Calculate similarity score
            similarity_score = 100  # Start at 100%

            # Age similarity (if both have installation dates)
            if ref_age_years is not None and eq.installation_date:
                eq_age = (today - eq.installation_date).days / 365.25
                age_diff = abs(ref_age_years - eq_age)
                if age_diff > 5:
                    similarity_score -= 30
                elif age_diff > 2:
                    similarity_score -= 15
            else:
                similarity_score -= 10  # Slight penalty for missing data

            # Same berth bonus
            if eq.berth == equipment.berth:
                similarity_score += 5

            # Same manufacturer bonus
            if eq.manufacturer == equipment.manufacturer:
                similarity_score += 10

            # Check if this similar equipment has recent issues
            recent_defects = Defect.query.join(Inspection).filter(
                Inspection.equipment_id == eq.id,
                Defect.created_at >= thirty_days_ago
            ).count()

            has_warning = False
            warning_message = None

            # If reference equipment has issues, warn about similar equipment
            ref_defects = Defect.query.join(Inspection).filter(
                Inspection.equipment_id == equipment_id,
                Defect.created_at >= thirty_days_ago
            ).count()

            if ref_defects > 0 and eq.status == 'active':
                has_warning = True
                warning_message = f'Reference equipment has {ref_defects} recent defects - monitor this similar equipment'
            elif recent_defects > 3:
                has_warning = True
                warning_message = f'This equipment has {recent_defects} recent defects'

            results.append({
                'equipment_id': eq.id,
                'name': eq.name,
                'name_ar': eq.name_ar,
                'serial_number': eq.serial_number,
                'status': eq.status,
                'berth': eq.berth,
                'installation_date': eq.installation_date.isoformat() if eq.installation_date else None,
                'manufacturer': eq.manufacturer,
                'similarity_score': min(max(similarity_score, 0), 100),
                'recent_defects': recent_defects,
                'has_warning': has_warning,
                'warning_message': warning_message,
                'last_risk_score': float(eq.last_risk_score) if eq.last_risk_score else None
            })

        # Sort by similarity score
        results.sort(key=lambda x: x['similarity_score'], reverse=True)

        # Add warning if reference equipment is problematic
        ref_status_warning = None
        if equipment.status in ('stopped', 'out_of_service'):
            ref_status_warning = f'Reference equipment is {equipment.status} - consider preventive action on similar equipment'

        return {
            'reference_equipment_id': equipment_id,
            'reference_equipment_name': equipment.name,
            'reference_equipment_type': equipment.equipment_type,
            'reference_status': equipment.status,
            'reference_status_warning': ref_status_warning,
            'similar_equipment': results,
            'total_similar': len(results),
            'with_warnings': sum(1 for r in results if r['has_warning']),
            'found_at': now.isoformat()
        }

    @staticmethod
    def generate_summary(equipment_id: int) -> Dict[str, Any]:
        """
        Generate a comprehensive summary of equipment health and history.

        Includes:
        - Current status and metrics
        - Recent activity summary
        - Risk assessment
        - Recommendations

        Args:
            equipment_id: ID of the equipment to summarize

        Returns:
            Dict containing comprehensive equipment summary
        """
        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            return {'error': 'Equipment not found'}

        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)
        ninety_days_ago = now - timedelta(days=90)
        today = date.today()

        # Get risk score
        risk_data = EquipmentAIService.calculate_risk_score(equipment_id)

        # Get predictions
        prediction_data = EquipmentAIService.predict_failure(equipment_id)

        # Get anomalies
        anomaly_data = EquipmentAIService.detect_anomalies(equipment_id)

        # Recent inspections summary
        recent_inspections = Inspection.query.filter(
            Inspection.equipment_id == equipment_id,
            Inspection.submitted_at >= ninety_days_ago
        ).all()

        inspection_summary = {
            'total': len(recent_inspections),
            'passed': sum(1 for i in recent_inspections if i.result == 'pass'),
            'failed': sum(1 for i in recent_inspections if i.result == 'fail'),
            'last_inspection_date': max(
                (i.submitted_at for i in recent_inspections if i.submitted_at),
                default=None
            )
        }
        if inspection_summary['last_inspection_date']:
            inspection_summary['last_inspection_date'] = inspection_summary['last_inspection_date'].isoformat()

        # Recent defects summary
        recent_defects = Defect.query.join(Inspection).filter(
            Inspection.equipment_id == equipment_id,
            Defect.created_at >= ninety_days_ago
        ).all()

        defect_summary = {
            'total': len(recent_defects),
            'by_severity': {},
            'open_count': sum(1 for d in recent_defects if d.status in ('open', 'in_progress'))
        }
        for d in recent_defects:
            defect_summary['by_severity'][d.severity] = defect_summary['by_severity'].get(d.severity, 0) + 1

        # Status history summary
        status_logs = EquipmentStatusLog.query.filter(
            EquipmentStatusLog.equipment_id == equipment_id,
            EquipmentStatusLog.created_at >= ninety_days_ago
        ).order_by(EquipmentStatusLog.created_at.desc()).all()

        status_history = [
            {
                'old_status': log.old_status,
                'new_status': log.new_status,
                'reason': log.reason,
                'date': log.created_at.isoformat()
            }
            for log in status_logs[:5]
        ]

        # Calculate uptime percentage
        uptime_days = 0
        if status_logs:
            current_time = now
            for log in status_logs:
                if log.old_status == 'active':
                    uptime_days += (current_time - log.created_at).days
                current_time = log.created_at
        else:
            uptime_days = 90  # Assume 100% uptime if no status changes

        uptime_percentage = min((uptime_days / 90) * 100, 100)

        # Generate health score (0-100)
        health_score = 100 - (risk_data.get('risk_score', 50) if isinstance(risk_data, dict) else 50)

        # Compile recommendations
        all_recommendations = []
        if isinstance(risk_data, dict) and 'recommendations' in risk_data:
            all_recommendations.extend(risk_data['recommendations'])
        if isinstance(anomaly_data, dict) and anomaly_data.get('anomalies'):
            for anomaly in anomaly_data['anomalies']:
                all_recommendations.append(f"Anomaly: {anomaly['description']}")

        return {
            'equipment_id': equipment_id,
            'equipment_name': equipment.name,
            'equipment_type': equipment.equipment_type,
            'serial_number': equipment.serial_number,
            'current_status': equipment.status,
            'criticality_level': equipment.criticality_level or 'medium',
            'health_score': round(health_score, 1),
            'risk_score': risk_data.get('risk_score', 0) if isinstance(risk_data, dict) else 0,
            'risk_level': risk_data.get('risk_level', 'unknown') if isinstance(risk_data, dict) else 'unknown',
            'uptime_percentage_90_days': round(uptime_percentage, 1),
            'inspection_summary': inspection_summary,
            'defect_summary': defect_summary,
            'status_history': status_history,
            'failure_prediction': {
                '30_day_probability': prediction_data.get('failure_probability', {}).get('30_days', 0) if isinstance(prediction_data, dict) else 0,
                'recommended_maintenance': prediction_data.get('recommended_maintenance_date') if isinstance(prediction_data, dict) else None,
                'maintenance_urgency': prediction_data.get('maintenance_urgency', 'unknown') if isinstance(prediction_data, dict) else 'unknown'
            },
            'anomaly_status': anomaly_data.get('status', 'unknown') if isinstance(anomaly_data, dict) else 'unknown',
            'anomaly_count': anomaly_data.get('anomaly_count', 0) if isinstance(anomaly_data, dict) else 0,
            'recommendations': all_recommendations[:5],  # Top 5 recommendations
            'generated_at': now.isoformat()
        }

    # ========================================
    # NATURAL LANGUAGE QUERY PARSER
    # ========================================

    @staticmethod
    def parse_natural_query(query: str) -> Dict[str, Any]:
        """
        Parse natural language equipment queries.

        Examples:
        - "cranes that stopped last week" -> {type: 'CRANE', status: 'stopped', period: 'last_week'}
        - "equipment with high risk" -> {risk_level: 'high'}
        - "pumps needing maintenance" -> {type: 'PUMP', needs_maintenance: true}

        Returns: { filters: {...}, sort: {...}, understood: bool }
        """
        import re
        query_lower = query.lower().strip()
        filters = {}
        sort = {}
        understood = True

        # Equipment type detection
        equipment_types = db.session.query(Equipment.equipment_type).distinct().all()
        type_list = [t[0].lower() for t in equipment_types if t[0]]

        for eq_type in type_list:
            # Match type or plural form
            if eq_type.lower() in query_lower or eq_type.lower().rstrip('s') in query_lower:
                filters['equipment_type'] = eq_type.upper()
                break

        # Status detection
        status_keywords = {
            'stopped': 'stopped',
            'stop': 'stopped',
            'down': 'stopped',
            'out of service': 'out_of_service',
            'decommissioned': 'out_of_service',
            'active': 'active',
            'working': 'active',
            'running': 'active',
            'operational': 'active',
            'maintenance': 'under_maintenance',
            'being repaired': 'under_maintenance',
            'paused': 'paused',
        }

        for keyword, status in status_keywords.items():
            if keyword in query_lower:
                filters['status'] = status
                break

        # Time period detection
        if 'today' in query_lower:
            filters['period'] = 'today'
        elif 'yesterday' in query_lower:
            filters['period'] = 'yesterday'
        elif 'last week' in query_lower or 'past week' in query_lower:
            filters['period'] = 'last_week'
        elif 'last month' in query_lower or 'past month' in query_lower:
            filters['period'] = 'last_month'
        elif 'this week' in query_lower:
            filters['period'] = 'this_week'
        elif 'this month' in query_lower:
            filters['period'] = 'this_month'

        # Risk level detection
        if 'high risk' in query_lower or 'high-risk' in query_lower:
            filters['risk_level'] = 'high'
        elif 'critical risk' in query_lower or 'critical' in query_lower:
            filters['risk_level'] = 'critical'
        elif 'medium risk' in query_lower:
            filters['risk_level'] = 'medium'
        elif 'low risk' in query_lower:
            filters['risk_level'] = 'low'
        elif 'risky' in query_lower or 'at risk' in query_lower:
            filters['risk_level'] = 'high'

        # Maintenance needs detection
        maintenance_keywords = ['need maintenance', 'needs maintenance', 'needing maintenance',
                                'require maintenance', 'due for maintenance', 'overdue']
        for keyword in maintenance_keywords:
            if keyword in query_lower:
                filters['needs_maintenance'] = True
                break

        # Inspection status
        if 'not inspected' in query_lower or 'without inspection' in query_lower:
            filters['needs_inspection'] = True
        elif 'recently inspected' in query_lower:
            filters['recently_inspected'] = True

        # Berth/location detection
        if 'east' in query_lower:
            filters['berth'] = 'east'
        elif 'west' in query_lower:
            filters['berth'] = 'west'

        # Sort detection
        if 'oldest' in query_lower:
            sort['field'] = 'installation_date'
            sort['order'] = 'asc'
        elif 'newest' in query_lower:
            sort['field'] = 'installation_date'
            sort['order'] = 'desc'
        elif 'most stopped' in query_lower or 'longest stopped' in query_lower:
            sort['field'] = 'days_stopped'
            sort['order'] = 'desc'

        # Check if we understood anything
        if not filters and not sort:
            understood = False

        return {
            'original_query': query,
            'filters': filters,
            'sort': sort,
            'understood': understood,
            'parsed_at': datetime.utcnow().isoformat()
        }

    # ========================================
    # SMART RECOMMENDATIONS
    # ========================================

    @staticmethod
    def get_recommendations(equipment_id: int) -> List[Dict[str, Any]]:
        """
        Get AI-powered recommendations for equipment.

        Returns: [
            { type: 'maintenance', priority: 'high', message: 'Schedule inspection within 5 days' },
            { type: 'risk', priority: 'medium', message: 'Similar equipment Pump-002 failed recently' },
            ...
        ]
        """
        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            return []

        recommendations = []
        now = datetime.utcnow()

        # Get risk score
        risk_data = EquipmentAIService.calculate_risk_score(equipment_id)

        # Recommendation 1: Based on risk score
        if isinstance(risk_data, dict) and 'risk_level' in risk_data:
            if risk_data['risk_level'] == 'critical':
                recommendations.append({
                    'type': 'risk',
                    'priority': 'critical',
                    'message': f'Critical risk score ({risk_data["risk_score"]}). Immediate maintenance inspection required.',
                    'action': 'schedule_inspection'
                })
            elif risk_data['risk_level'] == 'high':
                recommendations.append({
                    'type': 'risk',
                    'priority': 'high',
                    'message': f'High risk score ({risk_data["risk_score"]}). Schedule inspection within 5 days.',
                    'action': 'schedule_inspection'
                })

        # Recommendation 2: Based on inspection age
        last_inspection = Inspection.query.filter_by(
            equipment_id=equipment_id,
            status='submitted'
        ).order_by(Inspection.submitted_at.desc()).first()

        if last_inspection and last_inspection.submitted_at:
            days_since = (now - last_inspection.submitted_at).days
            if days_since > 60:
                recommendations.append({
                    'type': 'maintenance',
                    'priority': 'high',
                    'message': f'No inspection for {days_since} days. Schedule inspection immediately.',
                    'action': 'schedule_inspection'
                })
            elif days_since > 30:
                recommendations.append({
                    'type': 'maintenance',
                    'priority': 'medium',
                    'message': f'Last inspection was {days_since} days ago. Consider scheduling routine inspection.',
                    'action': 'schedule_inspection'
                })
        else:
            recommendations.append({
                'type': 'maintenance',
                'priority': 'high',
                'message': 'No inspection records found. Initial inspection recommended.',
                'action': 'schedule_inspection'
            })

        # Recommendation 3: Similar equipment failures
        similar_data = EquipmentAIService.find_similar_equipment(equipment_id)
        if isinstance(similar_data, dict) and 'similar_equipment' in similar_data:
            for sim in similar_data['similar_equipment'][:3]:
                if sim.get('status') in ('stopped', 'out_of_service'):
                    recommendations.append({
                        'type': 'warning',
                        'priority': 'medium',
                        'message': f'Similar equipment {sim["name"]} is currently {sim["status"]}. '
                                  f'Review for potential shared issues.',
                        'related_equipment_id': sim['equipment_id'],
                        'action': 'review_similar'
                    })
                    break  # Only add one similar equipment warning

        # Recommendation 4: Based on anomalies
        anomaly_data = EquipmentAIService.detect_anomalies(equipment_id)
        if isinstance(anomaly_data, dict) and 'anomalies' in anomaly_data:
            for anomaly in anomaly_data['anomalies']:
                if anomaly['severity'] == 'critical':
                    recommendations.append({
                        'type': 'anomaly',
                        'priority': 'critical',
                        'message': anomaly['description'],
                        'anomaly_type': anomaly['type'],
                        'action': 'investigate'
                    })
                elif anomaly['severity'] == 'high' and len(recommendations) < 5:
                    recommendations.append({
                        'type': 'anomaly',
                        'priority': 'high',
                        'message': anomaly['description'],
                        'anomaly_type': anomaly['type'],
                        'action': 'investigate'
                    })

        # Recommendation 5: Based on equipment age
        if equipment.installation_date:
            age_years = (date.today() - equipment.installation_date).days / 365.25
            if age_years > 15:
                recommendations.append({
                    'type': 'lifecycle',
                    'priority': 'medium',
                    'message': f'Equipment is {age_years:.1f} years old. Consider replacement planning.',
                    'action': 'plan_replacement'
                })
            elif age_years > 10:
                recommendations.append({
                    'type': 'lifecycle',
                    'priority': 'low',
                    'message': f'Equipment is {age_years:.1f} years old. Monitor for increased maintenance needs.',
                    'action': 'monitor'
                })

        # Recommendation 6: Based on current status
        if equipment.status == 'under_maintenance':
            if equipment.current_next_action:
                recommendations.append({
                    'type': 'status',
                    'priority': 'info',
                    'message': f'Next action: {equipment.current_next_action}',
                    'action': 'follow_up'
                })

        # Recommendation 7: Predictive maintenance
        prediction = EquipmentAIService.predict_failure(equipment_id)
        if isinstance(prediction, dict):
            prob_30 = prediction.get('failure_probability', {}).get('30_days', 0)
            if prob_30 >= 50:
                recommendations.append({
                    'type': 'prediction',
                    'priority': 'high' if prob_30 >= 70 else 'medium',
                    'message': f'{prob_30}% failure probability in next 30 days. '
                              f'Recommended maintenance by: {prediction.get("recommended_maintenance_date", "soon")}',
                    'action': 'preventive_maintenance'
                })

        # Sort by priority
        priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3, 'info': 4}
        recommendations.sort(key=lambda x: priority_order.get(x['priority'], 5))

        return recommendations[:10]  # Limit to 10 recommendations

    # ========================================
    # EQUIPMENT ASSISTANT (Chat)
    # ========================================

    @staticmethod
    def ask_assistant(equipment_id: int, question: str) -> Dict[str, Any]:
        """
        Answer questions about specific equipment using AI.

        Args:
            equipment_id: The equipment to ask about
            question: The user's question

        Returns:
            { answer: str, sources: [...], confidence: int }
        """
        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            return {
                'answer': f'Equipment {equipment_id} not found.',
                'sources': [],
                'confidence': 0
            }

        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)

        # Gather context
        summary = EquipmentAIService.generate_summary(equipment_id)
        risk = EquipmentAIService.calculate_risk_score(equipment_id)
        anomaly_data = EquipmentAIService.detect_anomalies(equipment_id)
        recommendations = EquipmentAIService.get_recommendations(equipment_id)

        # Get recent status changes
        recent_logs = EquipmentStatusLog.query.filter_by(
            equipment_id=equipment_id
        ).order_by(EquipmentStatusLog.created_at.desc()).limit(5).all()

        # Get recent defects
        recent_defects = Defect.query.join(Inspection).filter(
            Inspection.equipment_id == equipment_id
        ).order_by(Defect.created_at.desc()).limit(5).all()

        question_lower = question.lower()
        sources = []

        # Question: Why did it stop?
        if any(kw in question_lower for kw in ['why', 'reason', 'stopped', 'stop', 'down']):
            if equipment.current_reason:
                answer = f"{equipment.name} stopped because: {equipment.current_reason}"
                if equipment.current_next_action:
                    answer += f"\nNext action: {equipment.current_next_action}"
                sources = ['Equipment status log']
            elif recent_logs:
                stop_log = next(
                    (log for log in recent_logs if log.new_status in ('stopped', 'out_of_service')),
                    None
                )
                if stop_log:
                    answer = f"{equipment.name} stopped on {stop_log.created_at.strftime('%Y-%m-%d')}. "
                    answer += f"Reason: {stop_log.reason}"
                    if stop_log.next_action:
                        answer += f"\nNext action: {stop_log.next_action}"
                    sources = ['Status history']
                else:
                    answer = f"{equipment.name} has no recorded stops in recent history."
            else:
                answer = f"No stop records found for {equipment.name}."
            return {'answer': answer, 'sources': sources, 'confidence': 85}

        # Question: What's the status?
        if any(kw in question_lower for kw in ['status', 'condition', 'health', 'state']):
            if isinstance(summary, dict):
                answer = f"{equipment.name} is currently {equipment.status}.\n"
                answer += f"Health Score: {summary.get('health_score', 'N/A')}/100\n"
                answer += f"Risk Level: {summary.get('risk_level', 'N/A')}\n"
                answer += f"Uptime (90 days): {summary.get('uptime_percentage_90_days', 'N/A')}%"
            else:
                answer = f"{equipment.name} is currently {equipment.status}."
            return {
                'answer': answer,
                'sources': ['Equipment summary', 'Risk analysis'],
                'confidence': 95
            }

        # Question: What's wrong? / Issues?
        if any(kw in question_lower for kw in ['wrong', 'issue', 'problem', 'defect', 'anomal']):
            issues = []
            anomalies = anomaly_data.get('anomalies', []) if isinstance(anomaly_data, dict) else []
            if anomalies:
                issues.append(f"Detected anomalies: {len(anomalies)}")
                for a in anomalies[:3]:
                    issues.append(f"- {a['description']}")
            if recent_defects:
                issues.append(f"\nRecent defects: {len(recent_defects)}")
                for d in recent_defects[:3]:
                    issues.append(f"- {d.description[:100]}...")
            if not issues:
                answer = f"No significant issues detected for {equipment.name}."
            else:
                answer = f"Issues for {equipment.name}:\n" + "\n".join(issues)
            return {
                'answer': answer,
                'sources': ['Anomaly detection', 'Defect records'],
                'confidence': 90
            }

        # Question: Risk assessment
        if any(kw in question_lower for kw in ['risk', 'danger', 'safe', 'score']):
            if isinstance(risk, dict):
                answer = f"{equipment.name} risk assessment:\n"
                answer += f"- Risk Score: {risk.get('risk_score', 'N/A')}/100 ({risk.get('risk_level', 'unknown')})\n"
                if 'factors' in risk:
                    answer += "Contributing factors:\n"
                    for factor, details in risk['factors'].items():
                        if isinstance(details, dict):
                            answer += f"- {factor.replace('_', ' ').title()}: {details.get('value', 'N/A')}\n"
            else:
                answer = f"Could not calculate risk for {equipment.name}."
            return {
                'answer': answer,
                'sources': ['Risk scoring algorithm'],
                'confidence': 95
            }

        # Question: What should I do? / Recommendations
        if any(kw in question_lower for kw in ['recommend', 'should', 'action', 'do', 'next', 'suggestion']):
            if recommendations:
                answer = f"Recommendations for {equipment.name}:\n"
                for i, rec in enumerate(recommendations[:5], 1):
                    answer += f"{i}. [{rec['priority'].upper()}] {rec['message']}\n"
            else:
                answer = f"No specific recommendations for {equipment.name} at this time."
            return {
                'answer': answer,
                'sources': ['Recommendation engine'],
                'confidence': 90
            }

        # Question: When was last inspection?
        if any(kw in question_lower for kw in ['inspection', 'inspected', 'checked']):
            last_inspection = Inspection.query.filter_by(
                equipment_id=equipment_id,
                status='submitted'
            ).order_by(Inspection.submitted_at.desc()).first()
            if last_inspection:
                days_ago = (datetime.utcnow() - last_inspection.submitted_at).days
                answer = f"Last inspection for {equipment.name}:\n"
                answer += f"- Date: {last_inspection.submitted_at.strftime('%Y-%m-%d')}\n"
                answer += f"- Result: {last_inspection.result or 'Not recorded'}\n"
                answer += f"- Days ago: {days_ago}"
            else:
                answer = f"No inspection records found for {equipment.name}."
            return {
                'answer': answer,
                'sources': ['Inspection history'],
                'confidence': 95
            }

        # Default: return summary
        if isinstance(summary, dict):
            answer = f"Here's what I know about {equipment.name}:\n\n"
            answer += f"Type: {equipment.equipment_type}\n"
            answer += f"Status: {equipment.status}\n"
            answer += f"Health Score: {summary.get('health_score', 'N/A')}/100\n"
            answer += f"Risk Level: {summary.get('risk_level', 'N/A')}"
        else:
            answer = f"{equipment.name} is a {equipment.equipment_type} currently {equipment.status}."

        return {
            'answer': answer,
            'sources': ['Equipment summary', 'Risk analysis'],
            'confidence': 75
        }

    # ========================================
    # FLEET HEALTH SUMMARY
    # ========================================

    @staticmethod
    def get_fleet_health_summary() -> Dict[str, Any]:
        """Get overall fleet health summary."""
        equipment_list = Equipment.query.filter_by(is_scrapped=False).all()

        total = len(equipment_list)
        by_status = {}
        by_risk = {'low': 0, 'medium': 0, 'high': 0, 'critical': 0}
        total_risk_score = 0
        high_risk_equipment = []

        for eq in equipment_list:
            # Count by status
            status = eq.status or 'unknown'
            by_status[status] = by_status.get(status, 0) + 1

            # Use cached risk score if available
            if eq.last_risk_score is not None:
                score = float(eq.last_risk_score)
                if score <= 25:
                    level = 'low'
                elif score <= 50:
                    level = 'medium'
                elif score <= 75:
                    level = 'high'
                else:
                    level = 'critical'
            else:
                # Calculate risk scores only if not cached
                risk_data = EquipmentAIService.calculate_risk_score(eq.id)
                score = risk_data.get('risk_score', 0) if isinstance(risk_data, dict) else 0
                level = risk_data.get('risk_level', 'low') if isinstance(risk_data, dict) else 'low'

            total_risk_score += score
            by_risk[level] = by_risk.get(level, 0) + 1

            if level in ('high', 'critical'):
                high_risk_equipment.append({
                    'equipment_id': eq.id,
                    'equipment_name': eq.name,
                    'equipment_type': eq.equipment_type,
                    'risk_score': round(score, 1),
                    'risk_level': level,
                    'status': eq.status
                })

        avg_risk_score = total_risk_score / total if total > 0 else 0

        # Determine fleet health
        critical_pct = by_risk['critical'] / total * 100 if total > 0 else 0
        high_pct = by_risk['high'] / total * 100 if total > 0 else 0

        if critical_pct > 10 or high_pct > 25:
            fleet_health = 'poor'
        elif critical_pct > 5 or high_pct > 15:
            fleet_health = 'fair'
        elif high_pct > 5:
            fleet_health = 'good'
        else:
            fleet_health = 'excellent'

        return {
            'total_equipment': total,
            'by_status': by_status,
            'by_risk': by_risk,
            'average_risk_score': round(avg_risk_score, 1),
            'fleet_health': fleet_health,
            'high_risk_equipment': sorted(
                high_risk_equipment,
                key=lambda x: x['risk_score'],
                reverse=True
            )[:10],
            'calculated_at': datetime.utcnow().isoformat()
        }
