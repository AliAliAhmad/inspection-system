"""
Services module - contains all business logic.
"""

from app.services.leave_ai_service import LeaveAIService
from app.services.work_plan_ai_service import WorkPlanAIService
from app.services.work_plan_service import WorkPlanService

# AI Base Service (reusable patterns)
from app.services.ai_base_service import (
    RiskScorer,
    AnomalyDetector,
    Predictor,
    RecommendationEngine,
    TrendAnalyzer,
    NLPQueryParser,
    AIServiceWrapper,
    ScoringUtils,
)

# Unified AI Services (use base classes - no duplication)
from app.services.unified_ai_services import (
    ApprovalAIService,
    QualityReviewAIService,
    InspectionRoutineAIService,
)

# Enhanced AI Services (5 new modules)
from app.services.defect_ai_service import DefectAIService
from app.services.overdue_ai_service import OverdueAIService
from app.services.daily_review_ai_service import DailyReviewAIService
from app.services.performance_ai_service import PerformanceAIService
from app.services.reports_ai_service import ReportsAIService

# Shared Services
from app.services.shared import (
    NotificationPatterns,
    EscalationEngine,
    EscalationRule,
    PointCalculator,
    PointRule,
    PointAction,
    SLATracker,
    SLAConfig,
)

__all__ = [
    # Existing services
    'LeaveAIService',
    'WorkPlanAIService',
    'WorkPlanService',
    # AI Base classes (for extending)
    'RiskScorer',
    'AnomalyDetector',
    'Predictor',
    'RecommendationEngine',
    'TrendAnalyzer',
    'NLPQueryParser',
    'AIServiceWrapper',
    'ScoringUtils',
    # Unified AI Services
    'ApprovalAIService',
    'QualityReviewAIService',
    'InspectionRoutineAIService',
    # Enhanced AI Services (5 modules)
    'DefectAIService',
    'OverdueAIService',
    'DailyReviewAIService',
    'PerformanceAIService',
    'ReportsAIService',
    # Shared Services
    'NotificationPatterns',
    'EscalationEngine',
    'EscalationRule',
    'PointCalculator',
    'PointRule',
    'PointAction',
    'SLATracker',
    'SLAConfig',
]