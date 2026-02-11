"""
Shared reusable service patterns.
These services are used across multiple modules to avoid duplication.
"""

from app.services.shared.notification_patterns import NotificationPatterns
from app.services.shared.escalation_engine import EscalationEngine, EscalationRule
from app.services.shared.point_calculator import PointCalculator, PointRule, PointAction
from app.services.shared.sla_tracker import SLATracker, SLAConfig

__all__ = [
    'NotificationPatterns',
    'EscalationEngine',
    'EscalationRule',
    'PointCalculator',
    'PointRule',
    'PointAction',
    'SLATracker',
    'SLAConfig',
]
