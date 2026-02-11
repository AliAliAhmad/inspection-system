"""
Centralized point calculation engine.
Used across all modules for consistent gamification scoring.
"""

from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class PointAction(Enum):
    """Standard point-earning actions."""
    # Inspection actions
    INSPECTION_COMPLETE = 'inspection_complete'
    INSPECTION_QUALITY_BONUS = 'inspection_quality_bonus'
    DEFECT_FOUND = 'defect_found'
    CRITICAL_DEFECT_FOUND = 'critical_defect_found'

    # Defect actions
    DEFECT_RESOLVED = 'defect_resolved'
    DEFECT_RESOLVED_EARLY = 'defect_resolved_early'
    DEFECT_VERIFIED = 'defect_verified'

    # Job actions
    JOB_COMPLETED = 'job_completed'
    JOB_COMPLETED_EARLY = 'job_completed_early'
    JOB_QUALITY_BONUS = 'job_quality_bonus'

    # QC actions
    REVIEW_COMPLETED = 'review_completed'
    REVIEW_THOROUGH = 'review_thorough'

    # Streak and achievements
    STREAK_MAINTAINED = 'streak_maintained'
    STREAK_MILESTONE = 'streak_milestone'
    ACHIEVEMENT_UNLOCKED = 'achievement_unlocked'
    CHALLENGE_COMPLETED = 'challenge_completed'

    # Bonus actions
    BONUS_STAR_EARNED = 'bonus_star_earned'
    PEER_RECOGNITION = 'peer_recognition'

    # Penalties
    OVERDUE_PENALTY = 'overdue_penalty'
    QUALITY_PENALTY = 'quality_penalty'
    STREAK_BROKEN = 'streak_broken'


@dataclass
class PointRule:
    """
    Defines how points are calculated for an action.
    """
    action: PointAction
    base_points: int
    multiplier_conditions: List[Dict[str, Any]] = field(default_factory=list)
    max_daily_occurrences: Optional[int] = None  # Limit daily earnings
    cooldown_minutes: int = 0  # Minimum time between point awards
    role_specific: Optional[str] = None  # Only applies to this role
    description: str = ""

    def calculate(self, context: Dict[str, Any] = None) -> int:
        """Calculate points with multipliers applied."""
        context = context or {}
        points = self.base_points

        for condition in self.multiplier_conditions:
            field_name = condition.get('field')
            operator = condition.get('operator', '==')
            value = condition.get('value')
            multiplier = condition.get('multiplier', 1.0)

            if field_name and field_name in context:
                field_value = context[field_name]

                if operator == '==' and field_value == value:
                    points = int(points * multiplier)
                elif operator == '>=' and field_value >= value:
                    points = int(points * multiplier)
                elif operator == '<=' and field_value <= value:
                    points = int(points * multiplier)
                elif operator == '>' and field_value > value:
                    points = int(points * multiplier)
                elif operator == '<' and field_value < value:
                    points = int(points * multiplier)
                elif operator == 'in' and field_value in value:
                    points = int(points * multiplier)

        return max(points, 0)  # Never negative from multipliers


class PointCalculator:
    """
    Centralized point calculation engine.

    Usage:
        calculator = PointCalculator()
        calculator.add_rule(PointRule(
            action=PointAction.JOB_COMPLETED,
            base_points=10,
            multiplier_conditions=[
                {'field': 'time_efficiency', 'operator': '>=', 'value': 1.2, 'multiplier': 1.5},
            ]
        ))

        points = calculator.calculate(PointAction.JOB_COMPLETED, context={'time_efficiency': 1.3})
    """

    # Default point rules
    DEFAULT_RULES = [
        # Inspection points
        PointRule(
            action=PointAction.INSPECTION_COMPLETE,
            base_points=5,
            description="Complete an inspection",
            role_specific='inspector',
        ),
        PointRule(
            action=PointAction.DEFECT_FOUND,
            base_points=3,
            description="Find a defect during inspection",
            role_specific='inspector',
        ),
        PointRule(
            action=PointAction.CRITICAL_DEFECT_FOUND,
            base_points=10,
            description="Find a critical defect",
            role_specific='inspector',
        ),

        # Job completion points
        PointRule(
            action=PointAction.JOB_COMPLETED,
            base_points=10,
            multiplier_conditions=[
                {'field': 'qc_rating', 'operator': '>=', 'value': 4, 'multiplier': 1.5},
                {'field': 'qc_rating', 'operator': '==', 'value': 5, 'multiplier': 2.0},
                {'field': 'time_efficiency', 'operator': '>=', 'value': 1.2, 'multiplier': 1.3},
            ],
            description="Complete a job",
        ),
        PointRule(
            action=PointAction.JOB_COMPLETED_EARLY,
            base_points=5,
            description="Complete a job ahead of schedule",
        ),
        PointRule(
            action=PointAction.JOB_QUALITY_BONUS,
            base_points=5,
            multiplier_conditions=[
                {'field': 'cleaning_rating', 'operator': '==', 'value': 2, 'multiplier': 2.0},
            ],
            description="Receive quality bonus for excellent work",
        ),

        # Defect resolution points
        PointRule(
            action=PointAction.DEFECT_RESOLVED,
            base_points=15,
            multiplier_conditions=[
                {'field': 'severity', 'operator': '==', 'value': 'critical', 'multiplier': 2.0},
                {'field': 'severity', 'operator': '==', 'value': 'high', 'multiplier': 1.5},
            ],
            description="Resolve a defect",
        ),
        PointRule(
            action=PointAction.DEFECT_RESOLVED_EARLY,
            base_points=10,
            description="Resolve a defect before SLA deadline",
        ),

        # QC review points
        PointRule(
            action=PointAction.REVIEW_COMPLETED,
            base_points=5,
            description="Complete a quality review",
            role_specific='quality_engineer',
        ),
        PointRule(
            action=PointAction.REVIEW_THOROUGH,
            base_points=5,
            description="Thorough review with detailed feedback",
            role_specific='quality_engineer',
        ),

        # Streak points
        PointRule(
            action=PointAction.STREAK_MAINTAINED,
            base_points=2,
            multiplier_conditions=[
                {'field': 'streak_days', 'operator': '>=', 'value': 7, 'multiplier': 1.5},
                {'field': 'streak_days', 'operator': '>=', 'value': 30, 'multiplier': 2.0},
            ],
            description="Maintain daily streak",
        ),
        PointRule(
            action=PointAction.STREAK_MILESTONE,
            base_points=50,
            multiplier_conditions=[
                {'field': 'milestone', 'operator': '==', 'value': 30, 'multiplier': 2.0},
                {'field': 'milestone', 'operator': '==', 'value': 100, 'multiplier': 5.0},
            ],
            description="Reach streak milestone",
        ),

        # Achievement points
        PointRule(
            action=PointAction.ACHIEVEMENT_UNLOCKED,
            base_points=25,
            description="Unlock an achievement",
        ),
        PointRule(
            action=PointAction.CHALLENGE_COMPLETED,
            base_points=100,
            description="Complete a challenge",
        ),

        # Bonus points
        PointRule(
            action=PointAction.BONUS_STAR_EARNED,
            base_points=20,
            description="Earn a bonus star",
        ),
        PointRule(
            action=PointAction.PEER_RECOGNITION,
            base_points=5,
            description="Receive peer recognition",
            max_daily_occurrences=3,
        ),

        # Penalties
        PointRule(
            action=PointAction.OVERDUE_PENALTY,
            base_points=-5,
            multiplier_conditions=[
                {'field': 'days_overdue', 'operator': '>=', 'value': 3, 'multiplier': 2.0},
                {'field': 'days_overdue', 'operator': '>=', 'value': 7, 'multiplier': 3.0},
            ],
            description="Overdue item penalty",
        ),
        PointRule(
            action=PointAction.QUALITY_PENALTY,
            base_points=-10,
            description="Low quality rating penalty",
        ),
        PointRule(
            action=PointAction.STREAK_BROKEN,
            base_points=-20,
            description="Break a long streak",
        ),
    ]

    def __init__(self, rules: List[PointRule] = None, use_defaults: bool = True):
        """
        Initialize point calculator.

        Args:
            rules: Custom rules to use
            use_defaults: Whether to include default rules
        """
        self.rules: Dict[PointAction, PointRule] = {}

        if use_defaults:
            for rule in self.DEFAULT_RULES:
                self.rules[rule.action] = rule

        if rules:
            for rule in rules:
                self.rules[rule.action] = rule

    def add_rule(self, rule: PointRule) -> 'PointCalculator':
        """Add or override a point rule."""
        self.rules[rule.action] = rule
        return self

    def calculate(
        self,
        action: PointAction,
        context: Dict[str, Any] = None,
        role: str = None
    ) -> int:
        """
        Calculate points for an action.

        Args:
            action: The action being performed
            context: Context data for multipliers
            role: User role (for role-specific rules)

        Returns:
            Points to award (can be negative for penalties)
        """
        rule = self.rules.get(action)
        if not rule:
            logger.warning(f"No point rule for action: {action}")
            return 0

        # Check role-specific
        if rule.role_specific and role and rule.role_specific != role:
            return 0

        return rule.calculate(context)

    def calculate_and_award(
        self,
        user_id: int,
        action: PointAction,
        context: Dict[str, Any] = None,
        source_type: str = None,
        source_id: int = None,
    ) -> Dict[str, Any]:
        """
        Calculate points and award them to a user.

        Args:
            user_id: User to award points to
            action: The action performed
            context: Context data
            source_type: Type of source entity
            source_id: ID of source entity

        Returns:
            Dict with points awarded and new total
        """
        from app.models import User, PointHistory
        from app.extensions import db, safe_commit

        user = db.session.get(User, user_id)
        if not user:
            return {'error': 'User not found', 'points': 0}

        points = self.calculate(action, context, user.role)

        if points == 0:
            return {'points': 0, 'reason': 'No points for this action'}

        # Get the appropriate points field based on role
        if user.role == 'inspector':
            user.inspector_points = (user.inspector_points or 0) + points
        elif user.role == 'specialist':
            user.specialist_points = (user.specialist_points or 0) + points
        elif user.role == 'engineer':
            user.engineer_points = (user.engineer_points or 0) + points
        elif user.role == 'quality_engineer':
            user.qe_points = (user.qe_points or 0) + points

        user.total_points = (user.total_points or 0) + points

        # Record in history
        rule = self.rules.get(action)
        history = PointHistory(
            user_id=user_id,
            points=points,
            reason=rule.description if rule else action.value,
            source_type=source_type or action.value,
            source_id=source_id,
        )
        db.session.add(history)
        safe_commit()

        return {
            'points': points,
            'action': action.value,
            'new_total': user.total_points,
        }

    def get_rule_info(self, action: PointAction) -> Optional[Dict[str, Any]]:
        """Get information about a point rule."""
        rule = self.rules.get(action)
        if not rule:
            return None

        return {
            'action': action.value,
            'base_points': rule.base_points,
            'description': rule.description,
            'role_specific': rule.role_specific,
            'max_daily': rule.max_daily_occurrences,
            'multipliers': rule.multiplier_conditions,
        }

    def get_all_rules(self) -> List[Dict[str, Any]]:
        """Get information about all rules."""
        return [self.get_rule_info(action) for action in self.rules.keys()]


# Global instance for convenience
default_calculator = PointCalculator()
