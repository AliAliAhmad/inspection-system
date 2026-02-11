"""
Universal Risk Scoring Engine.
Reusable across Defects, Overdue, Performance, etc.
"""

from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class RiskLevel(Enum):
    """Risk level classifications."""
    MINIMAL = 'minimal'      # 0-19
    LOW = 'low'              # 20-39
    MEDIUM = 'medium'        # 40-59
    HIGH = 'high'            # 60-79
    CRITICAL = 'critical'    # 80-100


@dataclass
class RiskFactor:
    """
    Defines a risk factor with weight and scoring function.
    """
    name: str
    weight: float  # 0.0 to 1.0, all weights should sum to 1.0
    score_fn: Callable[[Dict[str, Any]], float]  # Returns 0-100
    description: str = ""
    max_contribution: float = 100.0  # Maximum score this factor can contribute

    def calculate(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate this factor's contribution."""
        try:
            raw_score = min(self.score_fn(context), self.max_contribution)
            weighted_score = raw_score * self.weight
            return {
                'name': self.name,
                'description': self.description,
                'raw_score': round(raw_score, 1),
                'weight': self.weight,
                'weighted_score': round(weighted_score, 1),
            }
        except Exception as e:
            logger.warning(f"Risk factor {self.name} calculation failed: {e}")
            return {
                'name': self.name,
                'description': self.description,
                'raw_score': 0,
                'weight': self.weight,
                'weighted_score': 0,
                'error': str(e),
            }


@dataclass
class RiskResult:
    """Result of risk assessment."""
    total_score: float
    level: RiskLevel
    factors: List[Dict[str, Any]]
    recommendations: List[str]
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'score': round(self.total_score, 1),
            'level': self.level.value,
            'factors': self.factors,
            'recommendations': self.recommendations,
            'metadata': self.metadata,
            'color': self._get_color(),
        }

    def _get_color(self) -> str:
        """Get color for risk level."""
        colors = {
            RiskLevel.MINIMAL: '#52c41a',
            RiskLevel.LOW: '#73d13d',
            RiskLevel.MEDIUM: '#faad14',
            RiskLevel.HIGH: '#fa8c16',
            RiskLevel.CRITICAL: '#ff4d4f',
        }
        return colors.get(self.level, '#999999')


class RiskScorer:
    """
    Universal risk scoring engine.

    Usage:
        scorer = RiskScorer(entity_type='defect')
        scorer.add_factor(RiskFactor(
            name='severity',
            weight=0.4,
            score_fn=lambda ctx: {'critical': 100, 'high': 75, 'medium': 50, 'low': 25}.get(ctx.get('severity'), 0)
        ))
        result = scorer.calculate(context={'severity': 'high', 'days_open': 5})
    """

    # Pre-defined factor functions
    @staticmethod
    def severity_score(severity_map: Dict[str, float] = None) -> Callable:
        """Create a severity scoring function."""
        default_map = {'critical': 100, 'high': 75, 'medium': 50, 'low': 25}
        mapping = severity_map or default_map
        return lambda ctx: mapping.get(ctx.get('severity', '').lower(), 0)

    @staticmethod
    def age_score(max_days: int = 30) -> Callable:
        """Create an age-based scoring function."""
        return lambda ctx: min(100, (ctx.get('days_old', 0) / max_days) * 100)

    @staticmethod
    def recurrence_score(max_occurrences: int = 5) -> Callable:
        """Create a recurrence scoring function."""
        return lambda ctx: min(100, (ctx.get('occurrence_count', 1) / max_occurrences) * 100)

    @staticmethod
    def workload_score(max_load: int = 20) -> Callable:
        """Create a workload scoring function."""
        return lambda ctx: min(100, (ctx.get('current_workload', 0) / max_load) * 100)

    @staticmethod
    def sla_score() -> Callable:
        """Create an SLA-based scoring function."""
        return lambda ctx: min(100, ctx.get('sla_percentage', 0))

    @staticmethod
    def completion_rate_score() -> Callable:
        """Create a completion rate inverse scoring (lower completion = higher risk)."""
        return lambda ctx: 100 - min(100, ctx.get('completion_rate', 100))

    def __init__(self, entity_type: str):
        """
        Initialize risk scorer.

        Args:
            entity_type: Type of entity being scored (defect, inspection, job, etc.)
        """
        self.entity_type = entity_type
        self.factors: List[RiskFactor] = []
        self._recommendations: Dict[RiskLevel, List[str]] = {
            RiskLevel.MINIMAL: ["Continue monitoring"],
            RiskLevel.LOW: ["Schedule for regular review"],
            RiskLevel.MEDIUM: ["Prioritize within current sprint", "Assign dedicated resource"],
            RiskLevel.HIGH: ["Immediate attention required", "Escalate to supervisor"],
            RiskLevel.CRITICAL: ["Stop other work", "Emergency response required", "Notify management"],
        }

    def add_factor(self, factor: RiskFactor) -> 'RiskScorer':
        """Add a risk factor. Returns self for chaining."""
        self.factors.append(factor)
        return self

    def add_factors(self, factors: List[RiskFactor]) -> 'RiskScorer':
        """Add multiple factors. Returns self for chaining."""
        self.factors.extend(factors)
        return self

    def set_recommendations(self, level: RiskLevel, recommendations: List[str]) -> 'RiskScorer':
        """Set custom recommendations for a risk level."""
        self._recommendations[level] = recommendations
        return self

    def _validate_weights(self) -> bool:
        """Validate that weights sum to approximately 1.0."""
        total = sum(f.weight for f in self.factors)
        if not (0.95 <= total <= 1.05):
            logger.warning(f"Risk factor weights sum to {total}, should be ~1.0")
            return False
        return True

    def _get_risk_level(self, score: float) -> RiskLevel:
        """Determine risk level from score."""
        if score >= 80:
            return RiskLevel.CRITICAL
        elif score >= 60:
            return RiskLevel.HIGH
        elif score >= 40:
            return RiskLevel.MEDIUM
        elif score >= 20:
            return RiskLevel.LOW
        return RiskLevel.MINIMAL

    def calculate(self, context: Dict[str, Any]) -> RiskResult:
        """
        Calculate risk score for given context.

        Args:
            context: Dictionary with data for risk calculation

        Returns:
            RiskResult with score, level, factors, and recommendations
        """
        self._validate_weights()

        factor_results = []
        total_score = 0

        for factor in self.factors:
            result = factor.calculate(context)
            factor_results.append(result)
            total_score += result['weighted_score']

        level = self._get_risk_level(total_score)

        return RiskResult(
            total_score=total_score,
            level=level,
            factors=factor_results,
            recommendations=self._recommendations.get(level, []),
            metadata={
                'entity_type': self.entity_type,
                'calculated_at': datetime.utcnow().isoformat(),
                'context_keys': list(context.keys()),
            },
        )

    @classmethod
    def create_defect_scorer(cls) -> 'RiskScorer':
        """Create a pre-configured defect risk scorer."""
        scorer = cls(entity_type='defect')
        scorer.add_factors([
            RiskFactor(
                name='severity',
                weight=0.35,
                score_fn=cls.severity_score(),
                description='Defect severity level',
            ),
            RiskFactor(
                name='age',
                weight=0.25,
                score_fn=cls.age_score(max_days=14),
                description='Days since defect was reported',
            ),
            RiskFactor(
                name='recurrence',
                weight=0.20,
                score_fn=cls.recurrence_score(),
                description='Number of times this defect has occurred',
            ),
            RiskFactor(
                name='sla_status',
                weight=0.20,
                score_fn=cls.sla_score(),
                description='SLA time consumed percentage',
            ),
        ])
        return scorer

    @classmethod
    def create_overdue_scorer(cls) -> 'RiskScorer':
        """Create a pre-configured overdue risk scorer."""
        scorer = cls(entity_type='overdue')
        scorer.add_factors([
            RiskFactor(
                name='days_overdue',
                weight=0.40,
                score_fn=lambda ctx: min(100, ctx.get('days_overdue', 0) * 7),  # 14+ days = 100
                description='Number of days past due date',
            ),
            RiskFactor(
                name='priority',
                weight=0.25,
                score_fn=cls.severity_score({'critical': 100, 'high': 75, 'normal': 50, 'low': 25}),
                description='Task priority level',
            ),
            RiskFactor(
                name='workload',
                weight=0.20,
                score_fn=cls.workload_score(),
                description='Assignee current workload',
            ),
            RiskFactor(
                name='completion_history',
                weight=0.15,
                score_fn=cls.completion_rate_score(),
                description='Historical completion rate',
            ),
        ])
        return scorer

    @classmethod
    def create_performance_scorer(cls) -> 'RiskScorer':
        """Create a pre-configured performance risk scorer (burnout risk)."""
        scorer = cls(entity_type='performance')
        scorer.add_factors([
            RiskFactor(
                name='workload',
                weight=0.30,
                score_fn=lambda ctx: min(100, max(0, (ctx.get('weekly_jobs', 0) - 15) * 5)),  # 35+ jobs = 100
                description='Weekly job assignment count',
            ),
            RiskFactor(
                name='leave_gap',
                weight=0.25,
                score_fn=lambda ctx: min(100, ctx.get('days_since_leave', 0) / 0.9),  # 90+ days = 100
                description='Days since last leave',
            ),
            RiskFactor(
                name='performance_decline',
                weight=0.25,
                score_fn=lambda ctx: min(100, max(0, -ctx.get('performance_change', 0) * 5)),  # -20% = 100
                description='Recent performance decline',
            ),
            RiskFactor(
                name='pause_frequency',
                weight=0.20,
                score_fn=lambda ctx: min(100, ctx.get('weekly_pauses', 0) * 15),  # 7+ pauses = 100
                description='Frequency of work pauses',
            ),
        ])
        scorer.set_recommendations(RiskLevel.HIGH, [
            "Consider reducing workload",
            "Encourage taking leave",
            "Schedule 1-on-1 check-in",
        ])
        scorer.set_recommendations(RiskLevel.CRITICAL, [
            "Immediate workload reduction required",
            "Mandatory leave recommendation",
            "HR intervention may be needed",
        ])
        return scorer


# Pre-configured scorers for common use cases
defect_risk_scorer = RiskScorer.create_defect_scorer()
overdue_risk_scorer = RiskScorer.create_overdue_scorer()
performance_risk_scorer = RiskScorer.create_performance_scorer()
