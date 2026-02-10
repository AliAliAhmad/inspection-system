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
]