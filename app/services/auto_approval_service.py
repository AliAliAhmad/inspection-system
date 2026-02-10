"""
Unified Auto-Approval Service - Reusable AI-powered auto-approval logic.
Supports: Leave, Pause, Takeover, Bonus approvals with configurable rules.
"""

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field

from app.extensions import db
from app.models import User

logger = logging.getLogger(__name__)


@dataclass
class ApprovalRule:
    """A single approval rule with name, check function, and impact."""
    name: str
    check: Callable[..., bool]  # Returns True if rule passes
    blocking: bool = False  # If True, failure blocks auto-approval
    risk_weight: int = 0  # Risk score added if rule fails (0-25)
    message_pass: str = ""
    message_fail: str = ""


@dataclass
class ApprovalResult:
    """Result of auto-approval evaluation."""
    can_auto_approve: bool
    risk_score: int
    reasons: List[str] = field(default_factory=list)
    recommendation: str = ""
    checks: Dict[str, bool] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'can_auto_approve': self.can_auto_approve,
            'risk_score': self.risk_score,
            'reasons': self.reasons,
            'recommendation': self.recommendation,
            'checks': self.checks,
            'metadata': self.metadata
        }


class ApprovalEvaluator(ABC):
    """
    Base class for approval evaluators.
    Subclass this for each approval type (Leave, Pause, Takeover, Bonus).
    """

    # Default thresholds - can be overridden
    MAX_AUTO_APPROVE_RISK = 50

    def __init__(self):
        self.rules: List[ApprovalRule] = []
        self._setup_rules()

    @abstractmethod
    def _setup_rules(self) -> None:
        """Setup approval rules. Override in subclasses."""
        pass

    @abstractmethod
    def _load_entity(self, entity_id: int) -> Any:
        """Load the entity (leave, pause, takeover, etc.) by ID."""
        pass

    @abstractmethod
    def _get_requester(self, entity: Any) -> Optional[User]:
        """Get the user who requested this approval."""
        pass

    def add_rule(self, rule: ApprovalRule) -> None:
        """Add a rule to the evaluator."""
        self.rules.append(rule)

    def evaluate(self, entity_id: int, context: Optional[Dict] = None) -> ApprovalResult:
        """
        Evaluate if an entity can be auto-approved.

        Args:
            entity_id: ID of the entity to evaluate
            context: Optional additional context for rules

        Returns:
            ApprovalResult with decision and details
        """
        entity = self._load_entity(entity_id)
        if not entity:
            return ApprovalResult(
                can_auto_approve=False,
                risk_score=0,
                reasons=['Entity not found'],
                recommendation='Manual review required'
            )

        requester = self._get_requester(entity)
        context = context or {}
        context['entity'] = entity
        context['requester'] = requester

        risk_score = 0
        reasons = []
        checks = {}
        can_approve = True

        for rule in self.rules:
            try:
                passed = rule.check(entity, requester, context)
                checks[rule.name] = passed

                if passed:
                    if rule.message_pass:
                        reasons.append(rule.message_pass)
                else:
                    if rule.blocking:
                        can_approve = False
                    risk_score += rule.risk_weight
                    if rule.message_fail:
                        reasons.append(rule.message_fail)

            except Exception as e:
                logger.warning(f"Rule '{rule.name}' failed with error: {e}")
                checks[rule.name] = False
                risk_score += 10  # Add some risk for failed checks

        # Final decision
        if risk_score > self.MAX_AUTO_APPROVE_RISK:
            can_approve = False
            reasons.append(f'Risk score ({risk_score}) exceeds threshold ({self.MAX_AUTO_APPROVE_RISK})')

        recommendation = 'Auto-approve' if can_approve else 'Manual review required'

        return ApprovalResult(
            can_auto_approve=can_approve,
            risk_score=min(risk_score, 100),
            reasons=reasons,
            recommendation=recommendation,
            checks=checks,
            metadata={
                'entity_id': entity_id,
                'evaluated_at': datetime.utcnow().isoformat(),
                'rules_count': len(self.rules)
            }
        )


# ========================================
# PAUSE APPROVAL EVALUATOR
# ========================================

class PauseApprovalEvaluator(ApprovalEvaluator):
    """Evaluator for job pause requests."""

    def _setup_rules(self) -> None:
        from app.models import PauseLog

        # Rule 1: Valid reason category
        self.add_rule(ApprovalRule(
            name='valid_reason',
            check=lambda e, u, c: e.reason_category in ['parts', 'duty_finish', 'tools', 'manpower', 'oem'],
            blocking=False,
            risk_weight=10,
            message_pass='Valid pause reason provided',
            message_fail='Reason category requires review'
        ))

        # Rule 2: Not too many recent pauses by same user
        def check_pause_frequency(entity, user, ctx):
            recent = PauseLog.query.filter(
                PauseLog.requested_by == entity.requested_by,
                PauseLog.requested_at >= datetime.utcnow() - timedelta(days=7)
            ).count()
            return recent < 3

        self.add_rule(ApprovalRule(
            name='pause_frequency',
            check=check_pause_frequency,
            blocking=False,
            risk_weight=15,
            message_pass='Normal pause frequency',
            message_fail='High pause frequency in last 7 days'
        ))

        # Rule 3: Job is actually in progress
        def check_job_status(entity, user, ctx):
            from app.models import SpecialistJob, EngineerJob
            if entity.job_type == 'specialist':
                job = db.session.get(SpecialistJob, entity.job_id)
            else:
                job = db.session.get(EngineerJob, entity.job_id)
            return job and job.status == 'in_progress'

        self.add_rule(ApprovalRule(
            name='job_in_progress',
            check=check_job_status,
            blocking=True,
            risk_weight=0,
            message_pass='Job is in progress',
            message_fail='Job is not in progress'
        ))

        # Rule 4: Parts-related pauses are usually valid
        self.add_rule(ApprovalRule(
            name='parts_reason',
            check=lambda e, u, c: e.reason_category == 'parts',
            blocking=False,
            risk_weight=-10,  # Negative = reduces risk
            message_pass='Parts-related pause (common reason)'
        ))

        # Rule 5: Duty finish is always valid
        self.add_rule(ApprovalRule(
            name='duty_finish',
            check=lambda e, u, c: e.reason_category == 'duty_finish',
            blocking=False,
            risk_weight=-15,
            message_pass='Duty finish pause (auto-approve)'
        ))

    def _load_entity(self, entity_id: int):
        from app.models import PauseLog
        return db.session.get(PauseLog, entity_id)

    def _get_requester(self, entity) -> Optional[User]:
        return db.session.get(User, entity.requested_by)


# ========================================
# TAKEOVER APPROVAL EVALUATOR
# ========================================

class TakeoverApprovalEvaluator(ApprovalEvaluator):
    """Evaluator for job takeover requests."""

    MAX_AUTO_APPROVE_RISK = 40  # Stricter for takeovers

    def _setup_rules(self) -> None:
        from app.models import SpecialistJob, EngineerJob

        # Rule 1: Job is actually stalled (paused 3+ days)
        def check_stalled(entity, user, ctx):
            if entity.job_type == 'specialist':
                job = db.session.get(SpecialistJob, entity.job_id)
            else:
                job = db.session.get(EngineerJob, entity.job_id)
            if not job or not job.paused_at:
                return False
            return (datetime.utcnow() - job.paused_at).days >= 3

        self.add_rule(ApprovalRule(
            name='job_stalled',
            check=check_stalled,
            blocking=True,
            risk_weight=0,
            message_pass='Job has been stalled for 3+ days',
            message_fail='Job is not stalled long enough'
        ))

        # Rule 2: Requester has required skills
        def check_skills(entity, user, ctx):
            if not user:
                return False
            # Check if user is same role as job type
            if entity.job_type == 'specialist':
                return user.role == 'specialist'
            elif entity.job_type == 'engineer':
                return user.role == 'engineer'
            elif entity.job_type == 'inspection':
                return user.role == 'inspector'
            return False

        self.add_rule(ApprovalRule(
            name='has_skills',
            check=check_skills,
            blocking=True,
            risk_weight=0,
            message_pass='Requester has required role',
            message_fail='Requester does not have required role'
        ))

        # Rule 3: Queue position = 1 (first in line)
        self.add_rule(ApprovalRule(
            name='first_in_queue',
            check=lambda e, u, c: e.queue_position == 1,
            blocking=False,
            risk_weight=20,
            message_pass='First in takeover queue',
            message_fail='Not first in queue - others ahead'
        ))

        # Rule 4: User doesn't have too many active jobs
        def check_workload(entity, user, ctx):
            if not user:
                return False
            if entity.job_type == 'specialist':
                active = SpecialistJob.query.filter_by(
                    specialist_id=user.id,
                    status='in_progress'
                ).count()
            else:
                active = EngineerJob.query.filter_by(
                    engineer_id=user.id,
                    status='in_progress'
                ).count()
            return active < 3

        self.add_rule(ApprovalRule(
            name='workload_ok',
            check=check_workload,
            blocking=False,
            risk_weight=15,
            message_pass='Requester has capacity',
            message_fail='Requester already has 3+ active jobs'
        ))

    def _load_entity(self, entity_id: int):
        from app.models import JobTakeover
        return db.session.get(JobTakeover, entity_id)

    def _get_requester(self, entity) -> Optional[User]:
        return db.session.get(User, entity.requested_by)


# ========================================
# BONUS APPROVAL EVALUATOR
# ========================================

class BonusApprovalEvaluator(ApprovalEvaluator):
    """Evaluator for bonus star requests."""

    def _setup_rules(self) -> None:
        from app.models import BonusStar

        # Rule 1: Has photo evidence
        self.add_rule(ApprovalRule(
            name='has_evidence',
            check=lambda e, u, c: bool(e.photo_url),
            blocking=False,
            risk_weight=20,
            message_pass='Photo evidence provided',
            message_fail='No photo evidence'
        ))

        # Rule 2: Related job is completed
        def check_job_completed(entity, user, ctx):
            from app.models import SpecialistJob, EngineerJob
            if entity.job_type == 'specialist' and entity.job_id:
                job = db.session.get(SpecialistJob, entity.job_id)
                return job and job.status == 'completed'
            elif entity.job_type == 'engineer' and entity.job_id:
                job = db.session.get(EngineerJob, entity.job_id)
                return job and job.status == 'completed'
            return True  # No linked job is OK

        self.add_rule(ApprovalRule(
            name='job_completed',
            check=check_job_completed,
            blocking=False,
            risk_weight=15,
            message_pass='Related job is completed',
            message_fail='Related job not completed'
        ))

        # Rule 3: Reasonable star amount (1-3)
        self.add_rule(ApprovalRule(
            name='reasonable_amount',
            check=lambda e, u, c: 1 <= (e.stars_requested or 1) <= 3,
            blocking=False,
            risk_weight=25,
            message_pass='Reasonable bonus amount requested',
            message_fail='High bonus amount requires review'
        ))

        # Rule 4: Not too many bonus requests recently
        def check_bonus_frequency(entity, user, ctx):
            recent = BonusStar.query.filter(
                BonusStar.user_id == entity.user_id,
                BonusStar.created_at >= datetime.utcnow() - timedelta(days=7),
                BonusStar.request_status == 'approved'
            ).count()
            return recent < 5

        self.add_rule(ApprovalRule(
            name='bonus_frequency',
            check=check_bonus_frequency,
            blocking=False,
            risk_weight=20,
            message_pass='Normal bonus request frequency',
            message_fail='High bonus request frequency'
        ))

        # Rule 5: Has reason/comment
        self.add_rule(ApprovalRule(
            name='has_reason',
            check=lambda e, u, c: bool(e.reason or e.comment),
            blocking=False,
            risk_weight=10,
            message_pass='Reason provided',
            message_fail='No reason provided'
        ))

    def _load_entity(self, entity_id: int):
        from app.models import BonusStar
        return db.session.get(BonusStar, entity_id)

    def _get_requester(self, entity) -> Optional[User]:
        return db.session.get(User, entity.user_id)


# ========================================
# UNIFIED AUTO-APPROVAL SERVICE
# ========================================

class AutoApprovalService:
    """
    Unified service for auto-approval across all approval types.

    Usage:
        service = AutoApprovalService()
        result = service.evaluate('pause', pause_id)
        if result.can_auto_approve:
            PauseService.approve_pause(pause_id, system_user_id)
    """

    _evaluators = {
        'pause': PauseApprovalEvaluator,
        'takeover': TakeoverApprovalEvaluator,
        'bonus': BonusApprovalEvaluator,
        # 'leave' uses LeaveAIService.evaluate_auto_approval for now
    }

    def __init__(self):
        self._instances: Dict[str, ApprovalEvaluator] = {}

    def _get_evaluator(self, approval_type: str) -> ApprovalEvaluator:
        """Get or create evaluator for approval type."""
        if approval_type not in self._instances:
            if approval_type not in self._evaluators:
                raise ValueError(f"Unknown approval type: {approval_type}")
            self._instances[approval_type] = self._evaluators[approval_type]()
        return self._instances[approval_type]

    def evaluate(self, approval_type: str, entity_id: int, context: Optional[Dict] = None) -> ApprovalResult:
        """
        Evaluate if an approval can be auto-approved.

        Args:
            approval_type: 'pause', 'takeover', 'bonus', or 'leave'
            entity_id: ID of the entity
            context: Optional additional context

        Returns:
            ApprovalResult with decision
        """
        if approval_type == 'leave':
            # Use existing LeaveAIService for leaves
            from app.services.leave_ai_service import LeaveAIService
            leave_service = LeaveAIService()
            result = leave_service.evaluate_auto_approval(entity_id)
            return ApprovalResult(
                can_auto_approve=result.get('can_auto_approve', False),
                risk_score=result.get('risk_score', 100),
                reasons=result.get('reasons', []),
                recommendation=result.get('recommendation', 'Manual review'),
                checks=result.get('checks', {}),
                metadata={'leave_id': entity_id}
            )

        evaluator = self._get_evaluator(approval_type)
        return evaluator.evaluate(entity_id, context)

    def auto_approve_if_eligible(
        self,
        approval_type: str,
        entity_id: int,
        approver_id: int,
        context: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Evaluate and auto-approve if eligible.

        Args:
            approval_type: 'pause', 'takeover', 'bonus', or 'leave'
            entity_id: ID of the entity
            approver_id: User ID to use as approver (usually system user)
            context: Optional additional context

        Returns:
            {auto_approved: bool, result: ApprovalResult, error: str or None}
        """
        result = self.evaluate(approval_type, entity_id, context)

        if not result.can_auto_approve:
            return {
                'auto_approved': False,
                'result': result.to_dict(),
                'error': None
            }

        try:
            if approval_type == 'pause':
                from app.services.pause_service import PauseService
                PauseService.approve_pause(entity_id, approver_id)
            elif approval_type == 'takeover':
                from app.services.takeover_service import TakeoverService
                TakeoverService.approve_takeover(entity_id, approver_id)
            elif approval_type == 'bonus':
                from app.models import BonusStar
                bonus = db.session.get(BonusStar, entity_id)
                if bonus:
                    bonus.request_status = 'approved'
                    bonus.approved_by = approver_id
                    bonus.approved_at = datetime.utcnow()
                    db.session.commit()
            elif approval_type == 'leave':
                from app.services.leave_service import LeaveService
                LeaveService.approve_leave(entity_id, approver_id)

            logger.info(f"Auto-approved {approval_type} #{entity_id} with risk_score={result.risk_score}")

            return {
                'auto_approved': True,
                'result': result.to_dict(),
                'error': None
            }

        except Exception as e:
            logger.error(f"Auto-approval failed for {approval_type} #{entity_id}: {e}")
            return {
                'auto_approved': False,
                'result': result.to_dict(),
                'error': str(e)
            }

    def get_supported_types(self) -> List[str]:
        """Get list of supported approval types."""
        return list(self._evaluators.keys()) + ['leave']

    def add_custom_evaluator(self, approval_type: str, evaluator_class: type) -> None:
        """Register a custom evaluator for a new approval type."""
        if not issubclass(evaluator_class, ApprovalEvaluator):
            raise TypeError("Evaluator must be subclass of ApprovalEvaluator")
        self._evaluators[approval_type] = evaluator_class


# Create singleton instance
auto_approval_service = AutoApprovalService()
