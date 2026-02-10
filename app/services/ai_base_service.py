"""
AI Base Service - Reusable AI patterns and base classes.
Provides common functionality for risk scoring, anomaly detection,
predictions, recommendations, trend analysis, and NLP parsing.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Any, Callable, Tuple, TypeVar, Generic
from enum import Enum
import statistics
import math
import logging

logger = logging.getLogger(__name__)


# ============================================================================
# ENUMS AND DATA CLASSES
# ============================================================================

class RiskLevel(Enum):
    """Standard risk levels."""
    LOW = 'low'
    MEDIUM = 'medium'
    HIGH = 'high'
    CRITICAL = 'critical'


class Severity(Enum):
    """Standard severity levels."""
    LOW = 'low'
    MEDIUM = 'medium'
    HIGH = 'high'
    CRITICAL = 'critical'


class Priority(Enum):
    """Standard priority levels."""
    INFO = 'info'
    LOW = 'low'
    MEDIUM = 'medium'
    HIGH = 'high'
    CRITICAL = 'critical'


@dataclass
class RiskFactor:
    """A single factor contributing to risk score."""
    name: str
    value: Any
    raw_score: float  # 0-100
    weight: float  # 0-1
    weighted_score: float = field(init=False)
    description: str = ""

    def __post_init__(self):
        self.weighted_score = round(self.raw_score * self.weight, 2)


@dataclass
class RiskResult:
    """Result of a risk score calculation."""
    entity_id: int
    entity_type: str
    risk_score: float
    risk_level: RiskLevel
    raw_score: float
    multiplier: float
    factors: Dict[str, RiskFactor]
    recommendations: List[str]
    calculated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'entity_id': self.entity_id,
            'entity_type': self.entity_type,
            'risk_score': round(self.risk_score, 2),
            'risk_level': self.risk_level.value,
            'raw_score': round(self.raw_score, 2),
            'multiplier': round(self.multiplier, 2),
            'factors': {
                name: {
                    'value': f.value,
                    'score': round(f.raw_score, 2),
                    'weight': f.weight,
                    'weighted_score': f.weighted_score,
                    'description': f.description
                }
                for name, f in self.factors.items()
            },
            'recommendations': self.recommendations,
            'calculated_at': self.calculated_at.isoformat()
        }


@dataclass
class Anomaly:
    """A detected anomaly."""
    anomaly_type: str
    severity: Severity
    description: str
    value: Any
    baseline: Any = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'type': self.anomaly_type,
            'severity': self.severity.value,
            'description': self.description,
            'value': self.value,
            'baseline': self.baseline,
            **self.metadata
        }


@dataclass
class AnomalyResult:
    """Result of anomaly detection."""
    entity_id: int
    entity_type: str
    anomalies: List[Anomaly]
    max_severity: Severity
    total_severity_score: int
    status: str  # 'normal' or 'anomalies_detected'
    analyzed_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        severity_scores = {'low': 1, 'medium': 2, 'high': 3, 'critical': 4}
        return {
            'entity_id': self.entity_id,
            'entity_type': self.entity_type,
            'anomaly_count': len(self.anomalies),
            'anomalies': [a.to_dict() for a in self.anomalies],
            'max_severity': self.max_severity.value,
            'total_severity_score': self.total_severity_score,
            'status': self.status,
            'analyzed_at': self.analyzed_at.isoformat()
        }


@dataclass
class Prediction:
    """A prediction result."""
    metric: str
    predicted_value: Any
    confidence: float  # 0-1
    horizon_days: int
    reasoning: str
    factors: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'metric': self.metric,
            'predicted_value': self.predicted_value,
            'confidence': round(self.confidence, 2),
            'horizon_days': self.horizon_days,
            'reasoning': self.reasoning,
            'factors': self.factors,
            **self.metadata
        }


@dataclass
class PredictionResult:
    """Result of prediction analysis."""
    entity_id: int
    entity_type: str
    predictions: List[Prediction]
    predicted_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'entity_id': self.entity_id,
            'entity_type': self.entity_type,
            'predictions': [p.to_dict() for p in self.predictions],
            'predicted_at': self.predicted_at.isoformat()
        }


@dataclass
class Recommendation:
    """An AI-generated recommendation."""
    rec_type: str
    priority: Priority
    message: str
    action: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'type': self.rec_type,
            'priority': self.priority.value,
            'message': self.message,
            'action': self.action,
            **self.metadata
        }


@dataclass
class Trend:
    """A trend analysis result."""
    metric: str
    current_value: float
    previous_value: float
    change_percentage: float
    direction: str  # 'up', 'down', 'flat'
    period: str
    insight: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            'metric': self.metric,
            'current_value': self.current_value,
            'previous_value': self.previous_value,
            'change_percentage': round(self.change_percentage, 1),
            'direction': self.direction,
            'period': self.period,
            'insight': self.insight
        }


@dataclass
class NLPParseResult:
    """Result of natural language query parsing."""
    original_query: str
    filters: Dict[str, Any]
    sort: Dict[str, str]
    understood: bool
    parsed_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'original_query': self.original_query,
            'filters': self.filters,
            'sort': self.sort,
            'understood': self.understood,
            'parsed_at': self.parsed_at.isoformat()
        }


# ============================================================================
# SCORING UTILITIES
# ============================================================================

class ScoringUtils:
    """Utility functions for scoring calculations."""

    @staticmethod
    def tiered_score(value: float, tiers: List[Tuple[float, float]]) -> float:
        """
        Calculate score based on value tiers.

        Args:
            value: The value to score
            tiers: List of (threshold, score_at_threshold) tuples, in ascending order

        Example:
            tiers = [(30, 25), (60, 50), (90, 75), (float('inf'), 100)]
            tiered_score(45, tiers) -> 37.5 (interpolated between 25 and 50)
        """
        prev_threshold = 0
        prev_score = 0

        for threshold, score in tiers:
            if value <= threshold:
                # Interpolate between previous and current tier
                range_size = threshold - prev_threshold
                range_progress = (value - prev_threshold) / range_size if range_size > 0 else 0
                return prev_score + (score - prev_score) * range_progress
            prev_threshold = threshold
            prev_score = score

        return tiers[-1][1]  # Return max score if above all thresholds

    @staticmethod
    def calculate_risk_level(score: float) -> RiskLevel:
        """Convert numeric score (0-100) to risk level."""
        if score <= 25:
            return RiskLevel.LOW
        elif score <= 50:
            return RiskLevel.MEDIUM
        elif score <= 75:
            return RiskLevel.HIGH
        else:
            return RiskLevel.CRITICAL

    @staticmethod
    def calculate_z_score(value: float, mean: float, std_dev: float) -> float:
        """Calculate z-score for anomaly detection."""
        if std_dev == 0:
            return 0
        return (value - mean) / std_dev

    @staticmethod
    def calculate_confidence(
        data_points: int,
        min_points: int = 5,
        max_confidence: float = 0.95,
        base_confidence: float = 0.5
    ) -> float:
        """
        Calculate confidence based on data availability.
        More data points = higher confidence.
        """
        if data_points < min_points:
            return base_confidence

        # Increase confidence with more data points
        confidence_boost = min(0.05 * (data_points - min_points + 1), max_confidence - base_confidence)
        return min(max_confidence, base_confidence + confidence_boost)

    @staticmethod
    def variance_to_confidence(
        values: List[float],
        max_confidence: float = 0.95,
        min_confidence: float = 0.4
    ) -> float:
        """
        Calculate confidence based on variance.
        Lower variance = higher confidence.
        """
        if len(values) < 2:
            return 0.5

        mean = statistics.mean(values)
        if mean == 0:
            return min_confidence

        std_dev = statistics.stdev(values)
        cv = std_dev / mean  # Coefficient of variation

        # Lower CV = higher confidence
        return max(min_confidence, min(max_confidence, 1.0 - cv))


# ============================================================================
# BASE CLASSES
# ============================================================================

class RiskScorer(ABC):
    """
    Abstract base class for risk scoring.

    Implement this class to create risk scorers for any entity type.
    Override get_factors() to define the risk factors and their weights.
    """

    @abstractmethod
    def get_entity(self, entity_id: int) -> Optional[Any]:
        """Get the entity to score."""
        pass

    @abstractmethod
    def get_factors(self, entity: Any) -> List[RiskFactor]:
        """
        Calculate and return all risk factors for the entity.
        Each factor should have a weight, and all weights should sum to 1.0.
        """
        pass

    def get_multiplier(self, entity: Any) -> float:
        """
        Get a multiplier to apply to the raw score.
        Override this to add entity-specific adjustments (e.g., criticality).
        Default is 1.0 (no adjustment).
        """
        return 1.0

    def generate_recommendations(
        self,
        entity: Any,
        factors: List[RiskFactor],
        risk_level: RiskLevel
    ) -> List[str]:
        """
        Generate recommendations based on factors and risk level.
        Override to customize recommendations.
        """
        recommendations = []

        # Add recommendations for high-scoring factors
        for factor in factors:
            if factor.raw_score >= 75:
                recommendations.append(
                    f"High risk in {factor.name.replace('_', ' ')}: {factor.description}"
                )

        return recommendations

    def calculate(self, entity_id: int) -> RiskResult:
        """Calculate risk score for an entity."""
        entity = self.get_entity(entity_id)
        if not entity:
            raise ValueError(f"Entity {entity_id} not found")

        factors = self.get_factors(entity)
        factors_dict = {f.name: f for f in factors}

        # Calculate raw score (sum of weighted scores)
        raw_score = sum(f.weighted_score for f in factors)

        # Apply multiplier
        multiplier = self.get_multiplier(entity)
        final_score = min(raw_score * multiplier, 100)  # Cap at 100

        risk_level = ScoringUtils.calculate_risk_level(final_score)
        recommendations = self.generate_recommendations(entity, factors, risk_level)

        return RiskResult(
            entity_id=entity_id,
            entity_type=self.__class__.__name__.replace('RiskScorer', '').lower(),
            risk_score=final_score,
            risk_level=risk_level,
            raw_score=raw_score,
            multiplier=multiplier,
            factors=factors_dict,
            recommendations=recommendations
        )


class AnomalyDetector(ABC):
    """
    Abstract base class for anomaly detection.
    Uses z-score based statistical deviation detection.
    """

    # Default threshold for anomaly detection (standard deviations)
    Z_SCORE_THRESHOLD = 2.0

    @abstractmethod
    def get_entity(self, entity_id: int) -> Optional[Any]:
        """Get the entity to analyze."""
        pass

    @abstractmethod
    def get_time_series_data(
        self,
        entity: Any,
        lookback_days: int = 30
    ) -> List[Tuple[datetime, float]]:
        """
        Get time series data for anomaly detection.
        Returns list of (timestamp, value) tuples.
        """
        pass

    def get_additional_anomalies(self, entity: Any) -> List[Anomaly]:
        """
        Override to add entity-specific anomaly checks beyond statistical detection.
        """
        return []

    def detect(self, entity_id: int, lookback_days: int = 30) -> AnomalyResult:
        """Detect anomalies for an entity."""
        entity = self.get_entity(entity_id)
        if not entity:
            raise ValueError(f"Entity {entity_id} not found")

        anomalies = []

        # Get time series data
        time_series = self.get_time_series_data(entity, lookback_days)

        if len(time_series) >= 5:
            values = [v for _, v in time_series]
            mean = statistics.mean(values)

            if len(values) >= 2:
                std_dev = statistics.stdev(values)

                if mean > 0 and std_dev > 0:
                    for timestamp, value in time_series:
                        z_score = ScoringUtils.calculate_z_score(value, mean, std_dev)

                        if abs(z_score) >= self.Z_SCORE_THRESHOLD:
                            if z_score > 0:
                                pct_above = int((value / mean - 1) * 100)
                                severity = Severity.HIGH if z_score >= 3 else Severity.MEDIUM
                                anomalies.append(Anomaly(
                                    anomaly_type='spike',
                                    severity=severity,
                                    description=f'Value {pct_above}% above normal on {timestamp.date()}',
                                    value=value,
                                    baseline=round(mean, 2),
                                    metadata={'date': timestamp.isoformat()}
                                ))
                            else:
                                pct_below = int((1 - value / mean) * 100)
                                severity = Severity.MEDIUM if z_score <= -3 else Severity.LOW
                                anomalies.append(Anomaly(
                                    anomaly_type='drop',
                                    severity=severity,
                                    description=f'Value {pct_below}% below normal on {timestamp.date()}',
                                    value=value,
                                    baseline=round(mean, 2),
                                    metadata={'date': timestamp.isoformat()}
                                ))

        # Add entity-specific anomalies
        anomalies.extend(self.get_additional_anomalies(entity))

        # Calculate severity scores
        severity_scores = {'low': 1, 'medium': 2, 'high': 3, 'critical': 4}
        if anomalies:
            max_severity_score = max(severity_scores.get(a.severity.value, 1) for a in anomalies)
            total_severity = sum(severity_scores.get(a.severity.value, 1) for a in anomalies)
            max_severity = Severity([k for k, v in severity_scores.items() if v == max_severity_score][0])
        else:
            max_severity = Severity.LOW
            total_severity = 0

        return AnomalyResult(
            entity_id=entity_id,
            entity_type=self.__class__.__name__.replace('AnomalyDetector', '').lower(),
            anomalies=anomalies,
            max_severity=max_severity,
            total_severity_score=total_severity,
            status='anomalies_detected' if anomalies else 'normal'
        )


class Predictor(ABC):
    """
    Abstract base class for predictions and forecasting.
    """

    @abstractmethod
    def get_entity(self, entity_id: int) -> Optional[Any]:
        """Get the entity to predict for."""
        pass

    @abstractmethod
    def get_historical_data(
        self,
        entity: Any,
        lookback_days: int = 90
    ) -> List[float]:
        """Get historical data for prediction."""
        pass

    def calculate_baseline(self, data: List[float]) -> Tuple[float, float]:
        """Calculate baseline (mean) and variance (std_dev) from historical data."""
        if not data:
            return 0, 0

        mean = statistics.mean(data)
        std_dev = statistics.stdev(data) if len(data) >= 2 else 0
        return mean, std_dev

    def predict(
        self,
        entity_id: int,
        horizon_days: int = 30,
        lookback_days: int = 90
    ) -> PredictionResult:
        """Generate predictions for an entity."""
        entity = self.get_entity(entity_id)
        if not entity:
            raise ValueError(f"Entity {entity_id} not found")

        historical_data = self.get_historical_data(entity, lookback_days)
        baseline, variance = self.calculate_baseline(historical_data)

        # Calculate confidence based on data availability
        confidence = ScoringUtils.calculate_confidence(
            len(historical_data),
            min_points=5,
            max_confidence=0.95,
            base_confidence=0.3
        )

        # If we have enough data, adjust confidence by variance
        if len(historical_data) >= 2:
            confidence = ScoringUtils.variance_to_confidence(historical_data)

        predictions = self.generate_predictions(
            entity, baseline, variance, confidence, horizon_days
        )

        return PredictionResult(
            entity_id=entity_id,
            entity_type=self.__class__.__name__.replace('Predictor', '').lower(),
            predictions=predictions
        )

    @abstractmethod
    def generate_predictions(
        self,
        entity: Any,
        baseline: float,
        variance: float,
        confidence: float,
        horizon_days: int
    ) -> List[Prediction]:
        """Generate specific predictions. Override this method."""
        pass


class RecommendationEngine(ABC):
    """
    Abstract base class for generating recommendations.
    """

    @abstractmethod
    def get_entity(self, entity_id: int) -> Optional[Any]:
        """Get the entity to recommend for."""
        pass

    @abstractmethod
    def gather_context(self, entity: Any) -> Dict[str, Any]:
        """Gather all context needed for recommendations."""
        pass

    @abstractmethod
    def generate_recommendations(
        self,
        entity: Any,
        context: Dict[str, Any]
    ) -> List[Recommendation]:
        """Generate recommendations based on entity and context."""
        pass

    def get_recommendations(
        self,
        entity_id: int,
        max_recommendations: int = 10
    ) -> List[Recommendation]:
        """Get prioritized recommendations for an entity."""
        entity = self.get_entity(entity_id)
        if not entity:
            return []

        context = self.gather_context(entity)
        recommendations = self.generate_recommendations(entity, context)

        # Sort by priority
        priority_order = {
            Priority.CRITICAL: 0,
            Priority.HIGH: 1,
            Priority.MEDIUM: 2,
            Priority.LOW: 3,
            Priority.INFO: 4
        }
        recommendations.sort(key=lambda x: priority_order.get(x.priority, 5))

        return recommendations[:max_recommendations]


class TrendAnalyzer(ABC):
    """
    Abstract base class for trend analysis.
    """

    @abstractmethod
    def get_period_data(
        self,
        entity_id: int,
        current_start: date,
        current_end: date,
        previous_start: date,
        previous_end: date
    ) -> Tuple[Dict[str, float], Dict[str, float]]:
        """
        Get data for current and previous periods.
        Returns (current_metrics, previous_metrics) as dicts of metric_name -> value.
        """
        pass

    def analyze(
        self,
        entity_id: int,
        period_type: str = 'monthly'
    ) -> List[Trend]:
        """Analyze trends for an entity."""
        today = date.today()

        # Calculate period boundaries
        if period_type == 'monthly':
            current_start = today.replace(day=1)
            current_end = today
            previous_end = current_start - timedelta(days=1)
            previous_start = previous_end.replace(day=1)
            period = today.strftime('%B %Y')
        elif period_type == 'weekly':
            current_start = today - timedelta(days=today.weekday())
            current_end = today
            previous_end = current_start - timedelta(days=1)
            previous_start = previous_end - timedelta(days=6)
            period = f'Week of {current_start.isoformat()}'
        else:  # daily
            current_start = today
            current_end = today
            previous_start = today - timedelta(days=1)
            previous_end = previous_start
            period = today.isoformat()

        current_data, previous_data = self.get_period_data(
            entity_id, current_start, current_end, previous_start, previous_end
        )

        trends = []
        for metric, current_value in current_data.items():
            previous_value = previous_data.get(metric, 0)

            if previous_value > 0:
                change_pct = ((current_value - previous_value) / previous_value) * 100
            else:
                change_pct = 0 if current_value == 0 else 100

            if abs(change_pct) < 5:
                direction = 'flat'
            elif change_pct > 0:
                direction = 'up'
            else:
                direction = 'down'

            insight = self.generate_insight(metric, current_value, previous_value, change_pct, direction)

            trends.append(Trend(
                metric=metric,
                current_value=round(current_value, 2),
                previous_value=round(previous_value, 2),
                change_percentage=change_pct,
                direction=direction,
                period=period,
                insight=insight
            ))

        return trends

    def generate_insight(
        self,
        metric: str,
        current: float,
        previous: float,
        change_pct: float,
        direction: str
    ) -> str:
        """Generate human-readable insight. Override for custom messages."""
        if direction == 'flat':
            return f'{metric} remained stable'
        elif direction == 'up':
            return f'{metric} increased by {abs(int(change_pct))}%'
        else:
            return f'{metric} decreased by {abs(int(change_pct))}%'


class NLPQueryParser:
    """
    Base class for natural language query parsing.
    Subclass and override the keyword mappings for entity-specific parsing.
    """

    def __init__(self):
        self.status_keywords: Dict[str, str] = {}
        self.type_keywords: List[str] = []
        self.time_keywords: Dict[str, str] = {
            'today': 'today',
            'yesterday': 'yesterday',
            'last week': 'last_week',
            'past week': 'last_week',
            'this week': 'this_week',
            'last month': 'last_month',
            'past month': 'last_month',
            'this month': 'this_month',
        }
        self.risk_keywords: Dict[str, str] = {
            'high risk': 'high',
            'high-risk': 'high',
            'critical risk': 'critical',
            'critical': 'critical',
            'medium risk': 'medium',
            'low risk': 'low',
            'risky': 'high',
            'at risk': 'high',
        }
        self.sort_keywords: Dict[str, Dict[str, str]] = {
            'oldest': {'field': 'created_at', 'order': 'asc'},
            'newest': {'field': 'created_at', 'order': 'desc'},
            'highest': {'field': 'value', 'order': 'desc'},
            'lowest': {'field': 'value', 'order': 'asc'},
        }

    def parse(self, query: str) -> NLPParseResult:
        """Parse a natural language query into filters and sort options."""
        query_lower = query.lower().strip()
        filters = {}
        sort = {}

        # Detect entity type
        for type_kw in self.type_keywords:
            if type_kw.lower() in query_lower:
                filters['type'] = type_kw
                break

        # Detect status
        for keyword, status in self.status_keywords.items():
            if keyword in query_lower:
                filters['status'] = status
                break

        # Detect time period
        for keyword, period in self.time_keywords.items():
            if keyword in query_lower:
                filters['period'] = period
                break

        # Detect risk level
        for keyword, level in self.risk_keywords.items():
            if keyword in query_lower:
                filters['risk_level'] = level
                break

        # Detect sort
        for keyword, sort_config in self.sort_keywords.items():
            if keyword in query_lower:
                sort = sort_config.copy()
                break

        understood = bool(filters or sort)

        return NLPParseResult(
            original_query=query,
            filters=filters,
            sort=sort,
            understood=understood
        )


# ============================================================================
# UNIFIED AI SERVICE WRAPPER
# ============================================================================

T = TypeVar('T')


class AIServiceWrapper(Generic[T]):
    """
    A wrapper that combines multiple AI capabilities for an entity type.

    Usage:
        class EquipmentAI(AIServiceWrapper[Equipment]):
            def __init__(self):
                super().__init__(
                    risk_scorer=EquipmentRiskScorer(),
                    anomaly_detector=EquipmentAnomalyDetector(),
                    predictor=EquipmentPredictor(),
                    recommendation_engine=EquipmentRecommendationEngine(),
                    trend_analyzer=EquipmentTrendAnalyzer(),
                    nlp_parser=EquipmentNLPParser()
                )
    """

    def __init__(
        self,
        risk_scorer: Optional[RiskScorer] = None,
        anomaly_detector: Optional[AnomalyDetector] = None,
        predictor: Optional[Predictor] = None,
        recommendation_engine: Optional[RecommendationEngine] = None,
        trend_analyzer: Optional[TrendAnalyzer] = None,
        nlp_parser: Optional[NLPQueryParser] = None
    ):
        self.risk_scorer = risk_scorer
        self.anomaly_detector = anomaly_detector
        self.predictor = predictor
        self.recommendation_engine = recommendation_engine
        self.trend_analyzer = trend_analyzer
        self.nlp_parser = nlp_parser

    def calculate_risk(self, entity_id: int) -> Dict[str, Any]:
        """Calculate risk score for an entity."""
        if not self.risk_scorer:
            return {'error': 'Risk scoring not configured'}
        try:
            result = self.risk_scorer.calculate(entity_id)
            return result.to_dict()
        except ValueError as e:
            return {'error': str(e)}

    def detect_anomalies(self, entity_id: int, lookback_days: int = 30) -> Dict[str, Any]:
        """Detect anomalies for an entity."""
        if not self.anomaly_detector:
            return {'error': 'Anomaly detection not configured'}
        try:
            result = self.anomaly_detector.detect(entity_id, lookback_days)
            return result.to_dict()
        except ValueError as e:
            return {'error': str(e)}

    def predict(
        self,
        entity_id: int,
        horizon_days: int = 30,
        lookback_days: int = 90
    ) -> Dict[str, Any]:
        """Generate predictions for an entity."""
        if not self.predictor:
            return {'error': 'Prediction not configured'}
        try:
            result = self.predictor.predict(entity_id, horizon_days, lookback_days)
            return result.to_dict()
        except ValueError as e:
            return {'error': str(e)}

    def get_recommendations(
        self,
        entity_id: int,
        max_recommendations: int = 10
    ) -> List[Dict[str, Any]]:
        """Get recommendations for an entity."""
        if not self.recommendation_engine:
            return []
        recommendations = self.recommendation_engine.get_recommendations(
            entity_id, max_recommendations
        )
        return [r.to_dict() for r in recommendations]

    def analyze_trends(
        self,
        entity_id: int,
        period_type: str = 'monthly'
    ) -> List[Dict[str, Any]]:
        """Analyze trends for an entity."""
        if not self.trend_analyzer:
            return []
        trends = self.trend_analyzer.analyze(entity_id, period_type)
        return [t.to_dict() for t in trends]

    def parse_query(self, query: str) -> Dict[str, Any]:
        """Parse a natural language query."""
        if not self.nlp_parser:
            return {
                'original_query': query,
                'filters': {},
                'sort': {},
                'understood': False
            }
        result = self.nlp_parser.parse(query)
        return result.to_dict()

    def get_comprehensive_analysis(self, entity_id: int) -> Dict[str, Any]:
        """Get a comprehensive AI analysis of an entity."""
        return {
            'entity_id': entity_id,
            'risk': self.calculate_risk(entity_id),
            'anomalies': self.detect_anomalies(entity_id),
            'predictions': self.predict(entity_id),
            'recommendations': self.get_recommendations(entity_id),
            'trends': self.analyze_trends(entity_id),
            'analyzed_at': datetime.utcnow().isoformat()
        }
