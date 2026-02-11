"""
Unified AI Insight Generator.
Reusable across Reports, Performance, Defects, Daily Review, etc.
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class InsightType(Enum):
    """Types of insights that can be generated."""
    TREND = 'trend'
    ANOMALY = 'anomaly'
    RECOMMENDATION = 'recommendation'
    PREDICTION = 'prediction'
    KPI = 'kpi'
    WARNING = 'warning'
    SUCCESS = 'success'


class InsightCategory(Enum):
    """Categories of insights."""
    OPERATIONAL = 'operational'
    WORKFORCE = 'workforce'
    MAINTENANCE = 'maintenance'
    MANAGEMENT = 'management'
    QUALITY = 'quality'
    SAFETY = 'safety'
    PERFORMANCE = 'performance'


class InsightSeverity(Enum):
    """Severity levels for insights."""
    INFO = 'info'
    WARNING = 'warning'
    CRITICAL = 'critical'


@dataclass
class Insight:
    """
    Represents an AI-generated insight.
    """
    id: str
    type: InsightType
    category: InsightCategory
    title: str
    description: str
    severity: InsightSeverity = InsightSeverity.INFO
    priority: int = 5  # 1-10, lower is higher priority
    value: Optional[float] = None
    change_percentage: Optional[float] = None
    action_items: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    generated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'type': self.type.value,
            'category': self.category.value,
            'title': self.title,
            'description': self.description,
            'severity': self.severity.value,
            'priority': self.priority,
            'value': self.value,
            'change_percentage': self.change_percentage,
            'action_items': self.action_items,
            'metadata': self.metadata,
            'generated_at': self.generated_at.isoformat(),
        }


class AIInsightGenerator:
    """
    Unified insight generator that can be used across all modules.

    Usage:
        generator = AIInsightGenerator(module='defects')
        insights = generator.generate_insights(data)
    """

    def __init__(self, module: str):
        """
        Initialize insight generator.

        Args:
            module: Module name (defects, overdue, reports, performance, daily_review)
        """
        self.module = module
        self._insight_counter = 0

    def _generate_id(self) -> str:
        """Generate unique insight ID."""
        self._insight_counter += 1
        return f"{self.module}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{self._insight_counter}"

    def create_insight(
        self,
        type: InsightType,
        category: InsightCategory,
        title: str,
        description: str,
        severity: InsightSeverity = InsightSeverity.INFO,
        priority: int = 5,
        value: Optional[float] = None,
        change_percentage: Optional[float] = None,
        action_items: List[str] = None,
        metadata: Dict[str, Any] = None,
    ) -> Insight:
        """Create a single insight."""
        return Insight(
            id=self._generate_id(),
            type=type,
            category=category,
            title=title,
            description=description,
            severity=severity,
            priority=priority,
            value=value,
            change_percentage=change_percentage,
            action_items=action_items or [],
            metadata=metadata or {},
        )

    def generate_trend_insight(
        self,
        metric_name: str,
        current_value: float,
        previous_value: float,
        category: InsightCategory = InsightCategory.OPERATIONAL,
        threshold_good: float = 0.1,
        threshold_bad: float = -0.1,
    ) -> Optional[Insight]:
        """
        Generate a trend insight based on value comparison.

        Args:
            metric_name: Name of the metric being tracked
            current_value: Current period value
            previous_value: Previous period value
            category: Insight category
            threshold_good: Percentage increase considered good
            threshold_bad: Percentage decrease considered bad

        Returns:
            Insight if significant change detected, None otherwise
        """
        if previous_value == 0:
            return None

        change = (current_value - previous_value) / previous_value

        if change >= threshold_good:
            return self.create_insight(
                type=InsightType.TREND,
                category=category,
                title=f"{metric_name} Improving",
                description=f"{metric_name} increased by {abs(change)*100:.1f}% compared to last period.",
                severity=InsightSeverity.INFO,
                priority=4,
                value=current_value,
                change_percentage=change * 100,
                action_items=["Continue current practices", "Document successful strategies"],
                metadata={'metric': metric_name, 'direction': 'up'},
            )
        elif change <= threshold_bad:
            return self.create_insight(
                type=InsightType.TREND,
                category=category,
                title=f"{metric_name} Declining",
                description=f"{metric_name} decreased by {abs(change)*100:.1f}% compared to last period.",
                severity=InsightSeverity.WARNING,
                priority=2,
                value=current_value,
                change_percentage=change * 100,
                action_items=["Investigate root causes", "Implement corrective actions"],
                metadata={'metric': metric_name, 'direction': 'down'},
            )
        return None

    def generate_anomaly_insight(
        self,
        metric_name: str,
        current_value: float,
        baseline_value: float,
        std_dev: float,
        category: InsightCategory = InsightCategory.OPERATIONAL,
        z_threshold: float = 2.0,
    ) -> Optional[Insight]:
        """
        Generate an anomaly insight using z-score detection.

        Args:
            metric_name: Name of the metric
            current_value: Current value
            baseline_value: Historical average
            std_dev: Standard deviation
            category: Insight category
            z_threshold: Z-score threshold for anomaly detection

        Returns:
            Insight if anomaly detected, None otherwise
        """
        if std_dev == 0:
            return None

        z_score = abs(current_value - baseline_value) / std_dev

        if z_score >= z_threshold:
            is_spike = current_value > baseline_value
            severity = InsightSeverity.CRITICAL if z_score >= 3.0 else InsightSeverity.WARNING

            return self.create_insight(
                type=InsightType.ANOMALY,
                category=category,
                title=f"{'Spike' if is_spike else 'Drop'} Detected in {metric_name}",
                description=f"{metric_name} is {'above' if is_spike else 'below'} normal by {z_score:.1f} standard deviations. Current: {current_value:.1f}, Baseline: {baseline_value:.1f}",
                severity=severity,
                priority=1 if severity == InsightSeverity.CRITICAL else 2,
                value=current_value,
                metadata={
                    'metric': metric_name,
                    'z_score': z_score,
                    'baseline': baseline_value,
                    'is_spike': is_spike,
                },
                action_items=[
                    f"Investigate {'spike' if is_spike else 'drop'} root cause",
                    "Review recent changes or events",
                    "Monitor closely for the next 24 hours",
                ],
            )
        return None

    def generate_threshold_insight(
        self,
        metric_name: str,
        current_value: float,
        threshold: float,
        direction: str = 'above',
        category: InsightCategory = InsightCategory.OPERATIONAL,
        is_good: bool = False,
    ) -> Optional[Insight]:
        """
        Generate an insight when a threshold is crossed.

        Args:
            metric_name: Name of the metric
            current_value: Current value
            threshold: Threshold value
            direction: 'above' or 'below'
            category: Insight category
            is_good: Whether crossing this threshold is positive

        Returns:
            Insight if threshold crossed, None otherwise
        """
        crossed = (
            (direction == 'above' and current_value > threshold) or
            (direction == 'below' and current_value < threshold)
        )

        if not crossed:
            return None

        return self.create_insight(
            type=InsightType.SUCCESS if is_good else InsightType.WARNING,
            category=category,
            title=f"{metric_name} {'Exceeded' if direction == 'above' else 'Below'} Threshold",
            description=f"{metric_name} is {current_value:.1f}, which is {direction} the threshold of {threshold:.1f}.",
            severity=InsightSeverity.INFO if is_good else InsightSeverity.WARNING,
            priority=3 if is_good else 2,
            value=current_value,
            metadata={'metric': metric_name, 'threshold': threshold, 'direction': direction},
            action_items=[
                "Review contributing factors",
                "Adjust strategy if needed",
            ] if not is_good else [
                "Recognize team performance",
                "Document successful practices",
            ],
        )

    def generate_recommendation(
        self,
        title: str,
        description: str,
        action_items: List[str],
        category: InsightCategory = InsightCategory.OPERATIONAL,
        priority: int = 3,
        metadata: Dict[str, Any] = None,
    ) -> Insight:
        """Generate a recommendation insight."""
        return self.create_insight(
            type=InsightType.RECOMMENDATION,
            category=category,
            title=title,
            description=description,
            severity=InsightSeverity.INFO,
            priority=priority,
            action_items=action_items,
            metadata=metadata or {},
        )

    def generate_prediction(
        self,
        metric_name: str,
        predicted_value: float,
        confidence: float,
        horizon_days: int,
        category: InsightCategory = InsightCategory.OPERATIONAL,
        reasoning: str = None,
    ) -> Insight:
        """Generate a prediction insight."""
        return self.create_insight(
            type=InsightType.PREDICTION,
            category=category,
            title=f"{metric_name} Forecast",
            description=reasoning or f"Predicted {metric_name} in {horizon_days} days: {predicted_value:.1f} (Confidence: {confidence*100:.0f}%)",
            severity=InsightSeverity.INFO,
            priority=4,
            value=predicted_value,
            metadata={
                'metric': metric_name,
                'confidence': confidence,
                'horizon_days': horizon_days,
            },
            action_items=[
                "Plan resources accordingly",
                "Review forecast assumptions",
            ],
        )

    def sort_by_priority(self, insights: List[Insight]) -> List[Insight]:
        """Sort insights by priority (lower number = higher priority)."""
        return sorted(insights, key=lambda x: (x.priority, -x.severity.value == 'critical'))

    def filter_by_severity(
        self,
        insights: List[Insight],
        min_severity: InsightSeverity
    ) -> List[Insight]:
        """Filter insights by minimum severity."""
        severity_order = [InsightSeverity.INFO, InsightSeverity.WARNING, InsightSeverity.CRITICAL]
        min_index = severity_order.index(min_severity)
        return [i for i in insights if severity_order.index(i.severity) >= min_index]

    def to_dict_list(self, insights: List[Insight]) -> List[Dict[str, Any]]:
        """Convert list of insights to list of dicts."""
        return [i.to_dict() for i in insights]


# Pre-configured generators for common modules
defect_insight_generator = AIInsightGenerator(module='defects')
overdue_insight_generator = AIInsightGenerator(module='overdue')
reports_insight_generator = AIInsightGenerator(module='reports')
performance_insight_generator = AIInsightGenerator(module='performance')
daily_review_insight_generator = AIInsightGenerator(module='daily_review')
