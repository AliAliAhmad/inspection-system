"""
Shared reusable service patterns.
These services are used across multiple modules to avoid duplication.
"""

from app.services.shared.notification_patterns import NotificationPatterns
from app.services.shared.escalation_engine import EscalationEngine, EscalationRule, EscalationLevel
from app.services.shared.point_calculator import PointCalculator, PointRule, PointAction
from app.services.shared.sla_tracker import SLATracker, SLAConfig, SLAStatus
from app.services.shared.ai_insight_generator import (
    AIInsightGenerator,
    Insight,
    InsightType,
    InsightCategory,
    InsightSeverity,
    defect_insight_generator,
    overdue_insight_generator,
    reports_insight_generator,
    performance_insight_generator,
    daily_review_insight_generator,
)
from app.services.shared.risk_scorer import (
    RiskScorer,
    RiskFactor,
    RiskResult,
    RiskLevel,
    defect_risk_scorer,
    overdue_risk_scorer,
    performance_risk_scorer,
)
from app.services.shared.recommendation_engine import (
    RecommendationEngine,
    Recommendation,
    RecommendationType,
    Urgency,
    defect_recommendation_engine,
    overdue_recommendation_engine,
    performance_recommendation_engine,
    daily_review_recommendation_engine,
)

__all__ = [
    # Notification
    'NotificationPatterns',
    # Escalation
    'EscalationEngine',
    'EscalationRule',
    'EscalationLevel',
    # Points
    'PointCalculator',
    'PointRule',
    'PointAction',
    # SLA
    'SLATracker',
    'SLAConfig',
    'SLAStatus',
    # AI Insights
    'AIInsightGenerator',
    'Insight',
    'InsightType',
    'InsightCategory',
    'InsightSeverity',
    'defect_insight_generator',
    'overdue_insight_generator',
    'reports_insight_generator',
    'performance_insight_generator',
    'daily_review_insight_generator',
    # Risk Scoring
    'RiskScorer',
    'RiskFactor',
    'RiskResult',
    'RiskLevel',
    'defect_risk_scorer',
    'overdue_risk_scorer',
    'performance_risk_scorer',
    # Recommendations
    'RecommendationEngine',
    'Recommendation',
    'RecommendationType',
    'Urgency',
    'defect_recommendation_engine',
    'overdue_recommendation_engine',
    'performance_recommendation_engine',
    'daily_review_recommendation_engine',
]
