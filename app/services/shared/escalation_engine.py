"""
Reusable escalation engine for automatic escalation based on rules.
Used by Defects, Overdue, SLA tracking, etc.
"""

from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class EscalationLevel(Enum):
    """Standard escalation levels."""
    NONE = 0
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4
    EMERGENCY = 5


@dataclass
class EscalationRule:
    """
    Defines when and how to escalate.
    """
    name: str
    condition: Callable[[Dict[str, Any]], bool]  # Function to check if rule applies
    new_level: EscalationLevel
    actions: List[str] = field(default_factory=list)  # Actions to take
    notify_roles: List[str] = field(default_factory=list)  # Roles to notify
    auto_assign_to: Optional[str] = None  # Role to auto-assign to
    priority_override: Optional[str] = None  # Override priority

    def check(self, context: Dict[str, Any]) -> bool:
        """Check if this rule's condition is met."""
        try:
            return self.condition(context)
        except Exception as e:
            logger.warning(f"Escalation rule {self.name} check failed: {e}")
            return False


class EscalationEngine:
    """
    Generic escalation engine that can be used for any entity type.

    Usage:
        engine = EscalationEngine(entity_type='defect')
        engine.add_rule(EscalationRule(
            name='critical_overdue',
            condition=lambda ctx: ctx['days_overdue'] > 7,
            new_level=EscalationLevel.CRITICAL,
            actions=['notify', 'reassign'],
            notify_roles=['admin', 'engineer'],
        ))

        result = engine.evaluate(context={'days_overdue': 10, 'entity_id': 123})
    """

    # Default rules for common scenarios
    DEFAULT_OVERDUE_RULES = [
        EscalationRule(
            name='warning_1_day',
            condition=lambda ctx: 1 <= ctx.get('days_overdue', 0) < 3,
            new_level=EscalationLevel.LOW,
            actions=['notify_owner'],
            notify_roles=['owner'],
        ),
        EscalationRule(
            name='escalate_3_days',
            condition=lambda ctx: 3 <= ctx.get('days_overdue', 0) < 7,
            new_level=EscalationLevel.MEDIUM,
            actions=['notify_owner', 'notify_supervisor'],
            notify_roles=['owner', 'engineer'],
        ),
        EscalationRule(
            name='critical_7_days',
            condition=lambda ctx: 7 <= ctx.get('days_overdue', 0) < 14,
            new_level=EscalationLevel.HIGH,
            actions=['notify_all', 'flag_critical'],
            notify_roles=['owner', 'engineer', 'admin'],
        ),
        EscalationRule(
            name='emergency_14_days',
            condition=lambda ctx: ctx.get('days_overdue', 0) >= 14,
            new_level=EscalationLevel.EMERGENCY,
            actions=['notify_all', 'auto_reassign', 'block_new_assignments'],
            notify_roles=['owner', 'engineer', 'admin'],
            auto_assign_to='admin',
        ),
    ]

    DEFAULT_SEVERITY_RULES = [
        EscalationRule(
            name='recurring_defect',
            condition=lambda ctx: ctx.get('occurrence_count', 1) >= 3,
            new_level=EscalationLevel.HIGH,
            actions=['upgrade_priority', 'notify_supervisor'],
            notify_roles=['engineer', 'admin'],
            priority_override='high',
        ),
        EscalationRule(
            name='critical_sla_breach',
            condition=lambda ctx: (
                ctx.get('severity') == 'critical' and
                ctx.get('sla_percentage', 0) >= 75
            ),
            new_level=EscalationLevel.CRITICAL,
            actions=['notify_all', 'flag_sla_risk'],
            notify_roles=['owner', 'engineer', 'admin'],
        ),
    ]

    def __init__(self, entity_type: str, rules: List[EscalationRule] = None):
        """
        Initialize escalation engine.

        Args:
            entity_type: Type of entity (defect, inspection, job, etc.)
            rules: List of escalation rules (uses defaults if None)
        """
        self.entity_type = entity_type
        self.rules: List[EscalationRule] = rules or []
        self._action_handlers: Dict[str, Callable] = {}

        # Register default action handlers
        self._register_default_handlers()

    def _register_default_handlers(self):
        """Register default action handlers."""
        self._action_handlers = {
            'notify_owner': self._action_notify_owner,
            'notify_supervisor': self._action_notify_supervisor,
            'notify_all': self._action_notify_all,
            'upgrade_priority': self._action_upgrade_priority,
            'flag_critical': self._action_flag_critical,
            'flag_sla_risk': self._action_flag_sla_risk,
            'auto_reassign': self._action_auto_reassign,
            'block_new_assignments': self._action_block_new_assignments,
        }

    def add_rule(self, rule: EscalationRule) -> 'EscalationEngine':
        """Add an escalation rule. Returns self for chaining."""
        self.rules.append(rule)
        return self

    def add_rules(self, rules: List[EscalationRule]) -> 'EscalationEngine':
        """Add multiple rules. Returns self for chaining."""
        self.rules.extend(rules)
        return self

    def use_default_overdue_rules(self) -> 'EscalationEngine':
        """Add default overdue escalation rules."""
        self.rules.extend(self.DEFAULT_OVERDUE_RULES)
        return self

    def use_default_severity_rules(self) -> 'EscalationEngine':
        """Add default severity escalation rules."""
        self.rules.extend(self.DEFAULT_SEVERITY_RULES)
        return self

    def register_action_handler(
        self,
        action_name: str,
        handler: Callable[[Dict[str, Any], EscalationRule], None]
    ) -> None:
        """Register a custom action handler."""
        self._action_handlers[action_name] = handler

    def evaluate(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluate all rules against the context and return escalation result.

        Args:
            context: Dictionary with entity data for evaluation

        Returns:
            Dict with escalation_level, triggered_rules, actions_taken
        """
        triggered_rules: List[EscalationRule] = []
        max_level = EscalationLevel.NONE
        all_actions = set()
        all_notify_roles = set()

        for rule in self.rules:
            if rule.check(context):
                triggered_rules.append(rule)
                if rule.new_level.value > max_level.value:
                    max_level = rule.new_level
                all_actions.update(rule.actions)
                all_notify_roles.update(rule.notify_roles)

        result = {
            'entity_type': self.entity_type,
            'entity_id': context.get('entity_id'),
            'escalation_level': max_level.name,
            'escalation_value': max_level.value,
            'triggered_rules': [r.name for r in triggered_rules],
            'actions': list(all_actions),
            'notify_roles': list(all_notify_roles),
            'priority_override': None,
            'auto_assign_to': None,
            'evaluated_at': datetime.utcnow().isoformat(),
        }

        # Get highest priority override and auto-assign
        for rule in triggered_rules:
            if rule.priority_override:
                result['priority_override'] = rule.priority_override
            if rule.auto_assign_to:
                result['auto_assign_to'] = rule.auto_assign_to

        return result

    def evaluate_and_execute(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluate rules and execute triggered actions.

        Args:
            context: Dictionary with entity data

        Returns:
            Evaluation result with executed actions
        """
        result = self.evaluate(context)

        if result['escalation_value'] > 0:
            executed_actions = []
            for action in result['actions']:
                handler = self._action_handlers.get(action)
                if handler:
                    try:
                        handler(context, result)
                        executed_actions.append(action)
                    except Exception as e:
                        logger.error(f"Failed to execute action {action}: {e}")
            result['executed_actions'] = executed_actions

        return result

    # Default action handlers
    def _action_notify_owner(self, context: Dict, result: Dict) -> None:
        """Notify the entity owner."""
        from app.services.shared.notification_patterns import NotificationPatterns
        owner_id = context.get('owner_id')
        if owner_id:
            NotificationPatterns.send_notification(
                user_id=owner_id,
                template_key='overdue_warning',
                item_type=self.entity_type,
                item_description=context.get('description', f'{self.entity_type} #{context.get("entity_id")}'),
                days=context.get('days_overdue', 0),
            )

    def _action_notify_supervisor(self, context: Dict, result: Dict) -> None:
        """Notify the supervisor (engineer)."""
        from app.services.shared.notification_patterns import NotificationPatterns
        from app.models import User

        engineers = User.query.filter_by(role='engineer', is_active=True).all()
        for eng in engineers:
            NotificationPatterns.send_notification(
                user_id=eng.id,
                template_key='overdue_warning',
                item_type=self.entity_type,
                item_description=context.get('description', ''),
                days=context.get('days_overdue', 0),
            )

    def _action_notify_all(self, context: Dict, result: Dict) -> None:
        """Notify all relevant roles."""
        from app.services.shared.notification_patterns import NotificationPatterns
        from app.models import User

        for role in result.get('notify_roles', []):
            if role == 'owner':
                owner_id = context.get('owner_id')
                if owner_id:
                    NotificationPatterns.send_notification(
                        user_id=owner_id,
                        template_key='overdue_critical',
                        item_type=self.entity_type,
                        item_description=context.get('description', ''),
                        days=context.get('days_overdue', 0),
                    )
            else:
                users = User.query.filter_by(role=role, is_active=True).all()
                for user in users:
                    NotificationPatterns.send_notification(
                        user_id=user.id,
                        template_key='overdue_critical',
                        item_type=self.entity_type,
                        item_description=context.get('description', ''),
                        days=context.get('days_overdue', 0),
                    )

    def _action_upgrade_priority(self, context: Dict, result: Dict) -> None:
        """Upgrade entity priority."""
        logger.info(f"Upgrading priority for {self.entity_type} #{context.get('entity_id')} to {result.get('priority_override')}")

    def _action_flag_critical(self, context: Dict, result: Dict) -> None:
        """Flag entity as critical."""
        logger.info(f"Flagging {self.entity_type} #{context.get('entity_id')} as critical")

    def _action_flag_sla_risk(self, context: Dict, result: Dict) -> None:
        """Flag entity as SLA risk."""
        logger.info(f"Flagging {self.entity_type} #{context.get('entity_id')} as SLA risk")

    def _action_auto_reassign(self, context: Dict, result: Dict) -> None:
        """Auto-reassign entity."""
        logger.info(f"Auto-reassigning {self.entity_type} #{context.get('entity_id')} to {result.get('auto_assign_to')}")

    def _action_block_new_assignments(self, context: Dict, result: Dict) -> None:
        """Block new assignments for owner."""
        logger.info(f"Blocking new assignments for owner of {self.entity_type} #{context.get('entity_id')}")
