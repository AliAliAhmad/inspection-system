"""
Reports AI Service - AI-powered reporting and analytics.
Extends AIServiceWrapper for executive summaries, anomaly detection,
metric forecasting, natural language queries, and auto-generated insights.
"""

from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, date, timedelta
from dataclasses import dataclass, field
import logging
import statistics

from app.services.ai_base_service import (
    AIServiceWrapper,
    AnomalyDetector,
    Predictor,
    TrendAnalyzer,
    NLPQueryParser,
    Anomaly,
    AnomalyResult,
    Prediction,
    PredictionResult,
    Trend,
    NLPParseResult,
    Severity,
    Priority,
    ScoringUtils,
)
from app.services.shared.point_calculator import PointCalculator
from app.services.shared.sla_tracker import SLATracker, SLAConfig
from app.extensions import db

logger = logging.getLogger(__name__)


# ============================================================================
# DATA CLASSES FOR REPORTS
# ============================================================================

@dataclass
class Insight:
    """A single AI-generated insight."""
    insight_id: str
    insight_type: str  # 'trend', 'anomaly', 'recommendation', 'prediction', 'kpi'
    category: str  # 'operational', 'workforce', 'maintenance', 'management'
    title: str
    description: str
    value: Optional[Any] = None
    change_percentage: Optional[float] = None
    severity: Optional[str] = None  # 'info', 'warning', 'critical'
    priority: int = 0  # 0-10, higher = more important
    action_items: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    generated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.insight_id,
            'type': self.insight_type,
            'category': self.category,
            'title': self.title,
            'description': self.description,
            'value': self.value,
            'change_percentage': self.change_percentage,
            'severity': self.severity,
            'priority': self.priority,
            'action_items': self.action_items,
            'metadata': self.metadata,
            'generated_at': self.generated_at.isoformat(),
        }


@dataclass
class NLQueryResult:
    """Result of a natural language query on reports."""
    query: str
    understood: bool
    intent: str  # 'metric_query', 'comparison', 'trend', 'filter', 'unknown'
    data: Optional[Dict[str, Any]] = None
    summary: str = ""
    sql_equivalent: str = ""
    suggestions: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'query': self.query,
            'understood': self.understood,
            'intent': self.intent,
            'data': self.data,
            'summary': self.summary,
            'sql_equivalent': self.sql_equivalent,
            'suggestions': self.suggestions,
        }


@dataclass
class ExecutiveSummary:
    """Executive summary for a reporting period."""
    period: str
    period_start: date
    period_end: date
    kpis: Dict[str, Any]
    highlights: List[str]
    concerns: List[str]
    trends: List[Dict[str, Any]]
    recommendations: List[str]
    comparison: Optional[Dict[str, Any]] = None
    generated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'period': self.period,
            'period_start': self.period_start.isoformat(),
            'period_end': self.period_end.isoformat(),
            'kpis': self.kpis,
            'highlights': self.highlights,
            'concerns': self.concerns,
            'trends': self.trends,
            'recommendations': self.recommendations,
            'comparison': self.comparison,
            'generated_at': self.generated_at.isoformat(),
        }


# ============================================================================
# REPORT ANOMALY DETECTOR
# ============================================================================

class ReportAnomalyDetector(AnomalyDetector):
    """Detects anomalies in metrics for reports."""

    def get_entity(self, entity_id: int) -> Optional[Any]:
        # For reports, entity_id is not used - we analyze global metrics
        return {'id': entity_id}

    def get_time_series_data(
        self,
        entity: Any,
        lookback_days: int = 30
    ) -> List[Tuple[datetime, float]]:
        # Override in subclass for specific metrics
        return []

    def detect_metric_anomalies(self, lookback_days: int = 30) -> AnomalyResult:
        """Detect anomalies across all key metrics."""
        from app.models import Inspection, Defect, SpecialistJob, EngineerJob

        anomalies = []
        today = date.today()
        start_date = today - timedelta(days=lookback_days)

        # Get daily counts for the lookback period
        daily_inspections = self._get_daily_counts(
            Inspection, 'created_at', start_date, today
        )
        daily_defects = self._get_daily_counts(
            Defect, 'created_at', start_date, today
        )

        # Check for inspection anomalies
        insp_anomalies = self._detect_count_anomalies(
            daily_inspections, 'inspections'
        )
        anomalies.extend(insp_anomalies)

        # Check for defect anomalies
        defect_anomalies = self._detect_count_anomalies(
            daily_defects, 'defects'
        )
        anomalies.extend(defect_anomalies)

        # Check for SLA breach rate anomalies
        sla_anomalies = self._detect_sla_anomalies()
        anomalies.extend(sla_anomalies)

        # Calculate severity scores
        severity_scores = {'low': 1, 'medium': 2, 'high': 3, 'critical': 4}
        if anomalies:
            max_severity_score = max(
                severity_scores.get(a.severity.value, 1) for a in anomalies
            )
            total_severity = sum(
                severity_scores.get(a.severity.value, 1) for a in anomalies
            )
            max_severity = Severity(
                [k for k, v in severity_scores.items() if v == max_severity_score][0]
            )
        else:
            max_severity = Severity.LOW
            total_severity = 0

        return AnomalyResult(
            entity_id=0,
            entity_type='reports',
            anomalies=anomalies,
            max_severity=max_severity,
            total_severity_score=total_severity,
            status='anomalies_detected' if anomalies else 'normal'
        )

    def _get_daily_counts(
        self,
        model: Any,
        date_field: str,
        start_date: date,
        end_date: date
    ) -> Dict[date, int]:
        """Get daily counts for a model."""
        from sqlalchemy import func

        counts = {}
        query = db.session.query(
            func.date(getattr(model, date_field)),
            func.count(model.id)
        ).filter(
            getattr(model, date_field) >= start_date,
            getattr(model, date_field) <= end_date
        ).group_by(
            func.date(getattr(model, date_field))
        ).all()

        for dt, count in query:
            counts[dt] = count

        return counts

    def _detect_count_anomalies(
        self,
        daily_counts: Dict[date, int],
        metric_name: str
    ) -> List[Anomaly]:
        """Detect anomalies in daily count data."""
        anomalies = []

        if len(daily_counts) < 5:
            return anomalies

        values = list(daily_counts.values())
        mean = statistics.mean(values)
        std_dev = statistics.stdev(values) if len(values) >= 2 else 0

        if mean == 0 or std_dev == 0:
            return anomalies

        for dt, count in daily_counts.items():
            z_score = ScoringUtils.calculate_z_score(count, mean, std_dev)

            if abs(z_score) >= 2.0:
                if z_score > 0:
                    pct_above = int((count / mean - 1) * 100)
                    severity = Severity.HIGH if z_score >= 3 else Severity.MEDIUM
                    anomalies.append(Anomaly(
                        anomaly_type='spike',
                        severity=severity,
                        description=f'{metric_name.title()} {pct_above}% above normal on {dt}',
                        value=count,
                        baseline=round(mean, 1),
                        metadata={'date': dt.isoformat(), 'metric': metric_name}
                    ))
                else:
                    pct_below = int((1 - count / mean) * 100)
                    severity = Severity.MEDIUM if z_score <= -3 else Severity.LOW
                    anomalies.append(Anomaly(
                        anomaly_type='drop',
                        severity=severity,
                        description=f'{metric_name.title()} {pct_below}% below normal on {dt}',
                        value=count,
                        baseline=round(mean, 1),
                        metadata={'date': dt.isoformat(), 'metric': metric_name}
                    ))

        return anomalies

    def _detect_sla_anomalies(self) -> List[Anomaly]:
        """Detect SLA-related anomalies."""
        from app.models import Defect

        anomalies = []
        today = date.today()

        # Check SLA breach rate
        tracker = SLATracker(SLAConfig.default_defect_config())
        open_defects = Defect.query.filter(
            Defect.status.in_(['open', 'in_progress'])
        ).all()

        if not open_defects:
            return anomalies

        breached_count = 0
        critical_breached = 0

        for defect in open_defects:
            status = tracker.get_status(
                created_at=defect.created_at,
                severity=defect.severity or 'medium',
                completed_at=None
            )
            if status['is_breached']:
                breached_count += 1
                if defect.severity == 'critical':
                    critical_breached += 1

        breach_rate = breached_count / len(open_defects) * 100

        if breach_rate > 30:
            anomalies.append(Anomaly(
                anomaly_type='high_sla_breach_rate',
                severity=Severity.CRITICAL if breach_rate > 50 else Severity.HIGH,
                description=f'SLA breach rate at {breach_rate:.1f}% ({breached_count} of {len(open_defects)} defects)',
                value=round(breach_rate, 1),
                baseline=15,  # Target breach rate
                metadata={'breached_count': breached_count, 'total': len(open_defects)}
            ))

        if critical_breached > 0:
            anomalies.append(Anomaly(
                anomaly_type='critical_sla_breaches',
                severity=Severity.CRITICAL,
                description=f'{critical_breached} critical defects have breached SLA',
                value=critical_breached,
                metadata={'severity': 'critical'}
            ))

        return anomalies


# ============================================================================
# REPORT PREDICTOR
# ============================================================================

class ReportPredictor(Predictor):
    """Generates forecasts for report metrics."""

    def get_entity(self, entity_id: int) -> Optional[Any]:
        return {'id': entity_id}

    def get_historical_data(
        self,
        entity: Any,
        lookback_days: int = 90
    ) -> List[float]:
        return []

    def forecast_metric(
        self,
        metric_name: str,
        periods: int = 4,
        period_type: str = 'weekly'
    ) -> PredictionResult:
        """Forecast a specific metric for future periods."""
        from app.models import Inspection, Defect, SpecialistJob

        predictions = []
        today = date.today()

        # Get historical data based on metric
        if metric_name == 'inspections':
            historical = self._get_weekly_counts(Inspection, 'created_at', 12)
        elif metric_name == 'defects':
            historical = self._get_weekly_counts(Defect, 'created_at', 12)
        elif metric_name == 'completion_rate':
            historical = self._get_weekly_completion_rates(12)
        elif metric_name == 'jobs':
            historical = self._get_weekly_counts(SpecialistJob, 'created_at', 12)
        else:
            historical = []

        if len(historical) < 4:
            return PredictionResult(
                entity_id=0,
                entity_type='forecast',
                predictions=[Prediction(
                    metric=metric_name,
                    predicted_value=0,
                    confidence=0.3,
                    horizon_days=7 * periods,
                    reasoning='Insufficient historical data for prediction',
                    factors=['limited_data']
                )]
            )

        # Simple moving average prediction with trend
        recent_avg = statistics.mean(historical[-4:])
        older_avg = statistics.mean(historical[:4]) if len(historical) >= 8 else recent_avg

        trend = (recent_avg - older_avg) / older_avg if older_avg > 0 else 0
        confidence = ScoringUtils.variance_to_confidence(historical)

        for i in range(1, periods + 1):
            predicted = recent_avg * (1 + trend * i)
            horizon = 7 * i if period_type == 'weekly' else 30 * i

            direction = 'increase' if trend > 0.05 else 'decrease' if trend < -0.05 else 'stable'

            predictions.append(Prediction(
                metric=metric_name,
                predicted_value=round(predicted, 1),
                confidence=max(0.3, confidence - 0.1 * i),  # Confidence decreases with horizon
                horizon_days=horizon,
                reasoning=f'Expected {direction} based on {len(historical)} weeks of data',
                factors=['historical_trend', 'seasonality'],
                metadata={
                    'period': i,
                    'period_type': period_type,
                    'trend_percentage': round(trend * 100, 1)
                }
            ))

        return PredictionResult(
            entity_id=0,
            entity_type='forecast',
            predictions=predictions
        )

    def _get_weekly_counts(
        self,
        model: Any,
        date_field: str,
        weeks: int
    ) -> List[float]:
        """Get weekly counts for a model."""
        from sqlalchemy import func

        today = date.today()
        counts = []

        for i in range(weeks, 0, -1):
            week_end = today - timedelta(days=7 * (i - 1))
            week_start = week_end - timedelta(days=7)

            count = model.query.filter(
                getattr(model, date_field) >= week_start,
                getattr(model, date_field) < week_end
            ).count()

            counts.append(float(count))

        return counts

    def _get_weekly_completion_rates(self, weeks: int) -> List[float]:
        """Get weekly job completion rates."""
        from app.models import SpecialistJob

        today = date.today()
        rates = []

        for i in range(weeks, 0, -1):
            week_end = today - timedelta(days=7 * (i - 1))
            week_start = week_end - timedelta(days=7)

            total = SpecialistJob.query.filter(
                SpecialistJob.created_at >= week_start,
                SpecialistJob.created_at < week_end
            ).count()

            completed = SpecialistJob.query.filter(
                SpecialistJob.created_at >= week_start,
                SpecialistJob.created_at < week_end,
                SpecialistJob.status == 'completed'
            ).count()

            rate = (completed / total * 100) if total > 0 else 0
            rates.append(rate)

        return rates

    def generate_predictions(
        self,
        entity: Any,
        baseline: float,
        variance: float,
        confidence: float,
        horizon_days: int
    ) -> List[Prediction]:
        # Not used directly - use forecast_metric instead
        return []


# ============================================================================
# REPORT TREND ANALYZER
# ============================================================================

class ReportTrendAnalyzer(TrendAnalyzer):
    """Analyzes trends for reports."""

    def get_period_data(
        self,
        entity_id: int,
        current_start: date,
        current_end: date,
        previous_start: date,
        previous_end: date
    ) -> Tuple[Dict[str, float], Dict[str, float]]:
        """Get data for current and previous periods."""
        from app.models import Inspection, Defect, SpecialistJob, EngineerJob

        current_metrics = self._get_metrics_for_period(current_start, current_end)
        previous_metrics = self._get_metrics_for_period(previous_start, previous_end)

        return current_metrics, previous_metrics

    def _get_metrics_for_period(
        self,
        start_date: date,
        end_date: date
    ) -> Dict[str, float]:
        """Get all key metrics for a period."""
        from app.models import Inspection, Defect, SpecialistJob, EngineerJob

        return {
            'inspections': float(Inspection.query.filter(
                Inspection.created_at >= start_date,
                Inspection.created_at <= end_date
            ).count()),
            'defects_found': float(Defect.query.filter(
                Defect.created_at >= start_date,
                Defect.created_at <= end_date
            ).count()),
            'defects_resolved': float(Defect.query.filter(
                Defect.resolved_at >= start_date,
                Defect.resolved_at <= end_date
            ).count()),
            'specialist_jobs': float(SpecialistJob.query.filter(
                SpecialistJob.created_at >= start_date,
                SpecialistJob.created_at <= end_date
            ).count()),
            'engineer_jobs': float(EngineerJob.query.filter(
                EngineerJob.created_at >= start_date,
                EngineerJob.created_at <= end_date
            ).count()),
        }


# ============================================================================
# REPORT NLP QUERY PARSER
# ============================================================================

class ReportNLPParser(NLPQueryParser):
    """Parses natural language queries for reports."""

    def __init__(self):
        super().__init__()
        self.metric_keywords = {
            'inspections': ['inspection', 'inspections', 'checks', 'audit'],
            'defects': ['defect', 'defects', 'issues', 'problems', 'bugs'],
            'equipment': ['equipment', 'machines', 'assets'],
            'jobs': ['job', 'jobs', 'work', 'tasks'],
            'performance': ['performance', 'efficiency', 'productivity'],
            'sla': ['sla', 'deadline', 'overdue', 'breach'],
        }
        self.comparison_keywords = ['vs', 'versus', 'compared to', 'compare', 'comparison']
        self.aggregation_keywords = {
            'count': ['how many', 'count', 'total', 'number of'],
            'average': ['average', 'avg', 'mean'],
            'sum': ['sum', 'total'],
            'max': ['maximum', 'max', 'highest', 'most'],
            'min': ['minimum', 'min', 'lowest', 'least'],
        }

    def parse_report_query(self, query: str) -> NLQueryResult:
        """Parse a natural language query for reports."""
        query_lower = query.lower().strip()

        # Detect intent
        intent = self._detect_intent(query_lower)

        # Detect metric
        metric = self._detect_metric(query_lower)

        # Detect time period
        period = self._detect_period(query_lower)

        # Detect aggregation
        aggregation = self._detect_aggregation(query_lower)

        # Build response
        understood = intent != 'unknown' and (metric or period)

        data = None
        summary = ""
        suggestions = []

        if understood:
            data = self._execute_query(metric, period, aggregation, intent)
            summary = self._generate_summary(data, metric, period)
        else:
            suggestions = [
                "Try: 'How many inspections this week?'",
                "Try: 'Show defects trend for last month'",
                "Try: 'Compare this week vs last week'",
                "Try: 'What is the SLA breach rate?'",
            ]

        return NLQueryResult(
            query=query,
            understood=understood,
            intent=intent,
            data=data,
            summary=summary,
            sql_equivalent=self._build_sql_hint(metric, period, aggregation),
            suggestions=suggestions
        )

    def _detect_intent(self, query: str) -> str:
        """Detect the intent of the query."""
        if any(kw in query for kw in self.comparison_keywords):
            return 'comparison'
        if 'trend' in query or 'over time' in query:
            return 'trend'
        if any(kw in query for kws in self.aggregation_keywords.values() for kw in kws):
            return 'metric_query'
        if '?' in query or any(q in query for q in ['what', 'how', 'show', 'get']):
            return 'metric_query'
        return 'unknown'

    def _detect_metric(self, query: str) -> Optional[str]:
        """Detect which metric the query is about."""
        for metric, keywords in self.metric_keywords.items():
            if any(kw in query for kw in keywords):
                return metric
        return None

    def _detect_period(self, query: str) -> Optional[str]:
        """Detect time period from query."""
        for keyword, period in self.time_keywords.items():
            if keyword in query:
                return period
        return None

    def _detect_aggregation(self, query: str) -> str:
        """Detect aggregation type."""
        for agg, keywords in self.aggregation_keywords.items():
            if any(kw in query for kw in keywords):
                return agg
        return 'count'

    def _execute_query(
        self,
        metric: Optional[str],
        period: Optional[str],
        aggregation: str,
        intent: str
    ) -> Dict[str, Any]:
        """Execute the parsed query and return data."""
        from app.models import Inspection, Defect, SpecialistJob

        today = date.today()

        # Determine date range
        if period == 'today':
            start_date = today
            end_date = today
        elif period == 'yesterday':
            start_date = today - timedelta(days=1)
            end_date = start_date
        elif period in ['this_week', 'last_week']:
            start_of_week = today - timedelta(days=today.weekday())
            if period == 'last_week':
                start_date = start_of_week - timedelta(days=7)
                end_date = start_of_week - timedelta(days=1)
            else:
                start_date = start_of_week
                end_date = today
        elif period in ['this_month', 'last_month']:
            if period == 'last_month':
                first_of_month = today.replace(day=1)
                end_date = first_of_month - timedelta(days=1)
                start_date = end_date.replace(day=1)
            else:
                start_date = today.replace(day=1)
                end_date = today
        else:
            start_date = today - timedelta(days=7)
            end_date = today

        # Get data based on metric
        result = {'period': period or 'last_7_days', 'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()}

        if metric == 'inspections':
            result['count'] = Inspection.query.filter(
                Inspection.created_at >= start_date,
                Inspection.created_at <= end_date
            ).count()
        elif metric == 'defects':
            result['count'] = Defect.query.filter(
                Defect.created_at >= start_date,
                Defect.created_at <= end_date
            ).count()
            result['open'] = Defect.query.filter(Defect.status.in_(['open', 'in_progress'])).count()
        elif metric == 'jobs':
            result['count'] = SpecialistJob.query.filter(
                SpecialistJob.created_at >= start_date,
                SpecialistJob.created_at <= end_date
            ).count()
        elif metric == 'sla':
            tracker = SLATracker(SLAConfig.default_defect_config())
            defects = Defect.query.filter(Defect.status.in_(['open', 'in_progress'])).all()
            breached = sum(
                1 for d in defects
                if tracker.get_status(d.created_at, d.severity or 'medium')['is_breached']
            )
            result['total'] = len(defects)
            result['breached'] = breached
            result['breach_rate'] = round(breached / len(defects) * 100, 1) if defects else 0
        else:
            result['message'] = 'No specific metric detected'

        return result

    def _generate_summary(
        self,
        data: Dict[str, Any],
        metric: Optional[str],
        period: Optional[str]
    ) -> str:
        """Generate a human-readable summary."""
        if not data:
            return "No data available"

        period_str = period.replace('_', ' ') if period else 'the selected period'

        if metric == 'inspections':
            return f"There were {data.get('count', 0)} inspections during {period_str}."
        elif metric == 'defects':
            return f"Found {data.get('count', 0)} defects during {period_str}. Currently {data.get('open', 0)} are open."
        elif metric == 'sla':
            return f"SLA breach rate is {data.get('breach_rate', 0)}% ({data.get('breached', 0)} of {data.get('total', 0)} defects)."
        else:
            return f"Query returned: {data}"

    def _build_sql_hint(
        self,
        metric: Optional[str],
        period: Optional[str],
        aggregation: str
    ) -> str:
        """Build a SQL-like hint for developers."""
        if not metric:
            return ""

        table = {
            'inspections': 'inspections',
            'defects': 'defects',
            'jobs': 'specialist_jobs',
        }.get(metric, metric)

        return f"SELECT {aggregation.upper()}(*) FROM {table} WHERE created_at BETWEEN start AND end"


# ============================================================================
# MAIN REPORTS AI SERVICE
# ============================================================================

class ReportsAIService(AIServiceWrapper):
    """
    AI-powered reporting service.
    Provides executive summaries, anomaly detection, forecasting,
    natural language queries, and auto-generated insights.
    """

    def __init__(self):
        super().__init__(
            anomaly_detector=ReportAnomalyDetector(),
            predictor=ReportPredictor(),
            trend_analyzer=ReportTrendAnalyzer(),
            nlp_parser=ReportNLPParser()
        )
        self.point_calculator = PointCalculator()

    def generate_executive_summary(
        self,
        period: str = 'weekly'
    ) -> ExecutiveSummary:
        """
        Generate an AI-powered executive summary for the specified period.

        Args:
            period: 'daily', 'weekly', 'monthly'

        Returns:
            ExecutiveSummary with KPIs, highlights, concerns, and recommendations
        """
        from app.models import Inspection, Defect, SpecialistJob, EngineerJob, User

        today = date.today()

        # Calculate period boundaries
        if period == 'daily':
            period_start = today
            period_end = today
            prev_start = today - timedelta(days=1)
            prev_end = prev_start
            period_label = today.strftime('%B %d, %Y')
        elif period == 'monthly':
            period_start = today.replace(day=1)
            period_end = today
            prev_end = period_start - timedelta(days=1)
            prev_start = prev_end.replace(day=1)
            period_label = today.strftime('%B %Y')
        else:  # weekly
            period_start = today - timedelta(days=today.weekday())
            period_end = today
            prev_end = period_start - timedelta(days=1)
            prev_start = prev_end - timedelta(days=6)
            period_label = f"Week of {period_start.strftime('%B %d, %Y')}"

        # Gather KPIs
        kpis = self._calculate_kpis(period_start, period_end)

        # Compare with previous period
        prev_kpis = self._calculate_kpis(prev_start, prev_end)
        comparison = self._compare_periods(kpis, prev_kpis)

        # Analyze trends
        trends = self.analyze_trends(0, period)

        # Generate highlights
        highlights = self._generate_highlights(kpis, comparison)

        # Identify concerns
        concerns = self._identify_concerns(kpis)

        # Generate recommendations
        recommendations = self._generate_recommendations(kpis, comparison, concerns)

        return ExecutiveSummary(
            period=period_label,
            period_start=period_start,
            period_end=period_end,
            kpis=kpis,
            highlights=highlights,
            concerns=concerns,
            trends=trends,
            recommendations=recommendations,
            comparison=comparison
        )

    def _calculate_kpis(
        self,
        start_date: date,
        end_date: date
    ) -> Dict[str, Any]:
        """Calculate KPIs for a period."""
        from app.models import Inspection, Defect, SpecialistJob, EngineerJob, User

        # Inspection KPIs
        inspections = Inspection.query.filter(
            Inspection.created_at >= start_date,
            Inspection.created_at <= end_date
        ).count()

        passed = Inspection.query.filter(
            Inspection.created_at >= start_date,
            Inspection.created_at <= end_date,
            Inspection.result == 'pass'
        ).count()

        # Defect KPIs
        new_defects = Defect.query.filter(
            Defect.created_at >= start_date,
            Defect.created_at <= end_date
        ).count()

        resolved_defects = Defect.query.filter(
            Defect.resolved_at >= start_date,
            Defect.resolved_at <= end_date
        ).count()

        open_defects = Defect.query.filter(
            Defect.status.in_(['open', 'in_progress'])
        ).count()

        critical_defects = Defect.query.filter(
            Defect.status.in_(['open', 'in_progress']),
            Defect.severity == 'critical'
        ).count()

        # Job KPIs
        specialist_jobs_completed = SpecialistJob.query.filter(
            SpecialistJob.completed_at >= start_date,
            SpecialistJob.completed_at <= end_date
        ).count()

        engineer_jobs_completed = EngineerJob.query.filter(
            EngineerJob.completed_at >= start_date,
            EngineerJob.completed_at <= end_date
        ).count()

        # Workforce
        active_staff = User.query.filter_by(is_active=True).count()
        on_leave = User.query.filter_by(is_on_leave=True).count()

        # Calculate SLA metrics
        tracker = SLATracker(SLAConfig.default_defect_config())
        open_defect_list = Defect.query.filter(
            Defect.status.in_(['open', 'in_progress'])
        ).all()

        sla_breached = sum(
            1 for d in open_defect_list
            if tracker.get_status(d.created_at, d.severity or 'medium')['is_breached']
        )

        return {
            'inspections': {
                'total': inspections,
                'passed': passed,
                'pass_rate': round(passed / inspections * 100, 1) if inspections > 0 else 0,
            },
            'defects': {
                'new': new_defects,
                'resolved': resolved_defects,
                'open': open_defects,
                'critical': critical_defects,
                'resolution_rate': round(resolved_defects / (new_defects + 1) * 100, 1),
            },
            'jobs': {
                'specialist_completed': specialist_jobs_completed,
                'engineer_completed': engineer_jobs_completed,
                'total_completed': specialist_jobs_completed + engineer_jobs_completed,
            },
            'sla': {
                'breach_rate': round(sla_breached / len(open_defect_list) * 100, 1) if open_defect_list else 0,
                'breached_count': sla_breached,
            },
            'workforce': {
                'active': active_staff,
                'on_leave': on_leave,
                'utilization': round((active_staff - on_leave) / active_staff * 100, 1) if active_staff > 0 else 0,
            },
        }

    def _compare_periods(
        self,
        current: Dict[str, Any],
        previous: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Compare current period KPIs with previous period."""
        comparison = {}

        for category, metrics in current.items():
            comparison[category] = {}
            if category in previous:
                for metric, value in metrics.items():
                    prev_value = previous[category].get(metric, 0)
                    if isinstance(value, (int, float)) and isinstance(prev_value, (int, float)):
                        if prev_value > 0:
                            change = round((value - prev_value) / prev_value * 100, 1)
                        else:
                            change = 100 if value > 0 else 0
                        comparison[category][metric] = {
                            'current': value,
                            'previous': prev_value,
                            'change': change,
                            'direction': 'up' if change > 5 else 'down' if change < -5 else 'flat'
                        }

        return comparison

    def _generate_highlights(
        self,
        kpis: Dict[str, Any],
        comparison: Dict[str, Any]
    ) -> List[str]:
        """Generate positive highlights."""
        highlights = []

        # High pass rate
        if kpis['inspections']['pass_rate'] >= 90:
            highlights.append(
                f"Excellent inspection pass rate: {kpis['inspections']['pass_rate']}%"
            )

        # Good resolution rate
        if kpis['defects']['resolution_rate'] >= 80:
            highlights.append(
                f"Strong defect resolution rate: {kpis['defects']['resolution_rate']}%"
            )

        # Low SLA breaches
        if kpis['sla']['breach_rate'] < 10:
            highlights.append(
                f"Low SLA breach rate: {kpis['sla']['breach_rate']}%"
            )

        # Improved metrics
        for category, metrics in comparison.items():
            for metric, data in metrics.items():
                if isinstance(data, dict) and data.get('direction') == 'up':
                    if metric in ['pass_rate', 'resolution_rate', 'total_completed'] and data['change'] > 10:
                        highlights.append(
                            f"{metric.replace('_', ' ').title()} improved by {data['change']}%"
                        )

        return highlights[:5]  # Limit to top 5

    def _identify_concerns(self, kpis: Dict[str, Any]) -> List[str]:
        """Identify areas of concern."""
        concerns = []

        # Critical defects
        if kpis['defects']['critical'] > 0:
            concerns.append(
                f"{kpis['defects']['critical']} critical defects require immediate attention"
            )

        # High SLA breach rate
        if kpis['sla']['breach_rate'] > 20:
            concerns.append(
                f"SLA breach rate at {kpis['sla']['breach_rate']}% - exceeds 20% threshold"
            )

        # Low pass rate
        if kpis['inspections']['pass_rate'] < 70:
            concerns.append(
                f"Inspection pass rate at {kpis['inspections']['pass_rate']}% - below target"
            )

        # High open defects
        if kpis['defects']['open'] > 50:
            concerns.append(
                f"Backlog of {kpis['defects']['open']} open defects"
            )

        # Low workforce utilization
        if kpis['workforce']['utilization'] < 70:
            concerns.append(
                f"Workforce utilization at {kpis['workforce']['utilization']}%"
            )

        return concerns

    def _generate_recommendations(
        self,
        kpis: Dict[str, Any],
        comparison: Dict[str, Any],
        concerns: List[str]
    ) -> List[str]:
        """Generate actionable recommendations."""
        recommendations = []

        if kpis['defects']['critical'] > 0:
            recommendations.append(
                "Prioritize critical defect resolution - assign additional resources"
            )

        if kpis['sla']['breach_rate'] > 15:
            recommendations.append(
                "Review SLA tracking and escalation procedures"
            )

        if kpis['inspections']['pass_rate'] < 80:
            recommendations.append(
                "Analyze failed inspections for common patterns"
            )

        if kpis['defects']['resolution_rate'] < 70:
            recommendations.append(
                "Improve defect triage process to accelerate resolution"
            )

        if kpis['workforce']['on_leave'] > kpis['workforce']['active'] * 0.2:
            recommendations.append(
                "Review leave scheduling to maintain minimum coverage"
            )

        return recommendations

    def detect_metric_anomalies(self, lookback_days: int = 30) -> AnomalyResult:
        """Detect anomalies in metrics."""
        detector = ReportAnomalyDetector()
        return detector.detect_metric_anomalies(lookback_days)

    def forecast_metrics(
        self,
        metric_name: str,
        periods: int = 4
    ) -> PredictionResult:
        """Forecast a specific metric."""
        predictor = ReportPredictor()
        return predictor.forecast_metric(metric_name, periods)

    def query_reports(self, question: str) -> NLQueryResult:
        """Process a natural language query about reports."""
        parser = ReportNLPParser()
        return parser.parse_report_query(question)

    def get_auto_insights(self, limit: int = 10) -> List[Insight]:
        """
        Generate auto-insights by analyzing current metrics.

        Returns a prioritized list of insights across all categories.
        """
        insights = []
        today = date.today()

        # Operational insights
        insights.extend(self._get_operational_insights())

        # Workforce insights
        insights.extend(self._get_workforce_insights())

        # Maintenance insights
        insights.extend(self._get_maintenance_insights())

        # Management insights
        insights.extend(self._get_management_insights())

        # Sort by priority
        insights.sort(key=lambda x: x.priority, reverse=True)

        return insights[:limit]

    def _get_operational_insights(self) -> List[Insight]:
        """Generate operational insights."""
        from app.models import Inspection, Defect

        insights = []
        today = date.today()

        # Daily inspection count insight
        today_inspections = Inspection.query.filter(
            db.func.date(Inspection.created_at) == today
        ).count()

        avg_daily = self._get_average_daily_count(Inspection, 'created_at', 30)

        if today_inspections > 0:
            if today_inspections > avg_daily * 1.2:
                insights.append(Insight(
                    insight_id=f'op_high_inspections_{today}',
                    insight_type='kpi',
                    category='operational',
                    title='Above Average Inspection Rate',
                    description=f'{today_inspections} inspections today vs {avg_daily:.0f} daily average',
                    value=today_inspections,
                    change_percentage=round((today_inspections / avg_daily - 1) * 100, 1) if avg_daily > 0 else 0,
                    severity='info',
                    priority=3,
                ))
            elif today_inspections < avg_daily * 0.5:
                insights.append(Insight(
                    insight_id=f'op_low_inspections_{today}',
                    insight_type='anomaly',
                    category='operational',
                    title='Below Average Inspection Rate',
                    description=f'Only {today_inspections} inspections today vs {avg_daily:.0f} daily average',
                    value=today_inspections,
                    change_percentage=round((1 - today_inspections / avg_daily) * -100, 1) if avg_daily > 0 else 0,
                    severity='warning',
                    priority=6,
                    action_items=['Review inspection schedule', 'Check inspector availability'],
                ))

        return insights

    def _get_workforce_insights(self) -> List[Insight]:
        """Generate workforce insights."""
        from app.models import User, Leave

        insights = []
        today = date.today()

        # Leave coverage
        on_leave = User.query.filter_by(is_on_leave=True).count()
        total_active = User.query.filter_by(is_active=True).count()

        if total_active > 0:
            leave_rate = on_leave / total_active * 100
            if leave_rate > 20:
                insights.append(Insight(
                    insight_id=f'wf_high_leave_{today}',
                    insight_type='recommendation',
                    category='workforce',
                    title='High Leave Rate',
                    description=f'{on_leave} of {total_active} staff on leave ({leave_rate:.0f}%)',
                    value=on_leave,
                    severity='warning',
                    priority=7,
                    action_items=['Review workload distribution', 'Consider overtime authorization'],
                ))

        return insights

    def _get_maintenance_insights(self) -> List[Insight]:
        """Generate maintenance insights."""
        from app.models import Defect, Equipment

        insights = []

        # Equipment with most defects
        from sqlalchemy import func
        equipment_defects = db.session.query(
            Equipment.name,
            func.count(Defect.id).label('defect_count')
        ).join(Defect).filter(
            Defect.status.in_(['open', 'in_progress'])
        ).group_by(Equipment.id).order_by(
            func.count(Defect.id).desc()
        ).first()

        if equipment_defects and equipment_defects.defect_count > 3:
            insights.append(Insight(
                insight_id=f'maint_equipment_defects',
                insight_type='recommendation',
                category='maintenance',
                title='Equipment Requires Attention',
                description=f'{equipment_defects.name} has {equipment_defects.defect_count} open defects',
                value=equipment_defects.defect_count,
                severity='warning' if equipment_defects.defect_count < 5 else 'critical',
                priority=8,
                action_items=['Schedule comprehensive inspection', 'Review maintenance history'],
            ))

        return insights

    def _get_management_insights(self) -> List[Insight]:
        """Generate management insights."""
        from app.models import Defect

        insights = []

        # SLA breach trend
        tracker = SLATracker(SLAConfig.default_defect_config())
        open_defects = Defect.query.filter(
            Defect.status.in_(['open', 'in_progress'])
        ).all()

        if open_defects:
            breached = sum(
                1 for d in open_defects
                if tracker.get_status(d.created_at, d.severity or 'medium')['is_breached']
            )
            breach_rate = breached / len(open_defects) * 100

            if breach_rate > 15:
                insights.append(Insight(
                    insight_id='mgmt_sla_breach',
                    insight_type='trend',
                    category='management',
                    title='SLA Performance Alert',
                    description=f'{breach_rate:.0f}% of open defects have breached SLA ({breached} of {len(open_defects)})',
                    value=breach_rate,
                    severity='critical' if breach_rate > 30 else 'warning',
                    priority=9,
                    action_items=['Escalate breached defects', 'Review resource allocation'],
                ))

        return insights

    def _get_average_daily_count(
        self,
        model: Any,
        date_field: str,
        days: int
    ) -> float:
        """Get average daily count for a model."""
        from sqlalchemy import func

        today = date.today()
        start = today - timedelta(days=days)

        total = model.query.filter(
            getattr(model, date_field) >= start,
            getattr(model, date_field) < today
        ).count()

        return total / days if days > 0 else 0


# Global instance
reports_ai_service = ReportsAIService()
