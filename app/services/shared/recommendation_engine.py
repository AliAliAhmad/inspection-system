"""
AI-Powered Recommendation Engine.
Reusable across all modules for generating smart suggestions.
"""

from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class RecommendationType(Enum):
    """Types of recommendations."""
    ASSIGNMENT = 'assignment'
    SCHEDULING = 'scheduling'
    PRIORITY = 'priority'
    RESOURCE = 'resource'
    TRAINING = 'training'
    PROCESS = 'process'
    ESCALATION = 'escalation'
    PREVENTIVE = 'preventive'


class Urgency(Enum):
    """Urgency levels for recommendations."""
    LOW = 'low'
    MEDIUM = 'medium'
    HIGH = 'high'
    CRITICAL = 'critical'


@dataclass
class Recommendation:
    """A single recommendation."""
    id: str
    type: RecommendationType
    title: str
    description: str
    urgency: Urgency = Urgency.MEDIUM
    confidence: float = 0.8  # 0.0 to 1.0
    action: str = ""  # Specific action to take
    action_params: Dict[str, Any] = field(default_factory=dict)
    impact: str = ""  # Expected impact
    effort: str = "medium"  # low, medium, high
    metadata: Dict[str, Any] = field(default_factory=dict)
    generated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'type': self.type.value,
            'title': self.title,
            'description': self.description,
            'urgency': self.urgency.value,
            'confidence': round(self.confidence, 2),
            'action': self.action,
            'action_params': self.action_params,
            'impact': self.impact,
            'effort': self.effort,
            'metadata': self.metadata,
            'generated_at': self.generated_at.isoformat(),
        }


class RecommendationEngine:
    """
    AI-powered recommendation engine.

    Usage:
        engine = RecommendationEngine(module='defects')
        recommendations = engine.get_assignment_recommendations(defect, available_specialists)
    """

    def __init__(self, module: str):
        """Initialize recommendation engine for a module."""
        self.module = module
        self._counter = 0

    def _generate_id(self) -> str:
        """Generate unique recommendation ID."""
        self._counter += 1
        return f"rec_{self.module}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{self._counter}"

    def create_recommendation(
        self,
        type: RecommendationType,
        title: str,
        description: str,
        urgency: Urgency = Urgency.MEDIUM,
        confidence: float = 0.8,
        action: str = "",
        action_params: Dict[str, Any] = None,
        impact: str = "",
        effort: str = "medium",
        metadata: Dict[str, Any] = None,
    ) -> Recommendation:
        """Create a single recommendation."""
        return Recommendation(
            id=self._generate_id(),
            type=type,
            title=title,
            description=description,
            urgency=urgency,
            confidence=confidence,
            action=action,
            action_params=action_params or {},
            impact=impact,
            effort=effort,
            metadata=metadata or {},
        )

    # ==================== Assignment Recommendations ====================

    def recommend_assignment(
        self,
        task: Dict[str, Any],
        candidates: List[Dict[str, Any]],
        criteria: Dict[str, float] = None,
    ) -> List[Recommendation]:
        """
        Recommend best candidates for task assignment.

        Args:
            task: Task details (type, skills_needed, priority, etc.)
            candidates: List of potential assignees with their profiles
            criteria: Weighting for different factors (skills, workload, history)

        Returns:
            List of recommendations sorted by confidence
        """
        default_criteria = {
            'skill_match': 0.35,
            'workload': 0.25,
            'history': 0.20,
            'availability': 0.20,
        }
        criteria = criteria or default_criteria

        recommendations = []
        task_type = task.get('type', 'general')
        task_skills = set(task.get('skills_needed', []))

        for candidate in candidates:
            score = 0
            factors = []

            # Skill match
            candidate_skills = set(candidate.get('skills', []))
            if task_skills:
                skill_overlap = len(task_skills & candidate_skills) / len(task_skills)
            else:
                skill_overlap = 0.5  # Neutral if no specific skills needed
            score += skill_overlap * criteria['skill_match']
            factors.append(f"Skill match: {skill_overlap*100:.0f}%")

            # Workload (inverse - lower workload = higher score)
            workload = candidate.get('current_workload', 0)
            max_workload = candidate.get('max_workload', 20)
            workload_score = 1 - min(1, workload / max_workload)
            score += workload_score * criteria['workload']
            factors.append(f"Available capacity: {workload_score*100:.0f}%")

            # Historical performance
            history_score = candidate.get('success_rate', 0.8)
            score += history_score * criteria['history']
            factors.append(f"Success rate: {history_score*100:.0f}%")

            # Availability
            is_available = candidate.get('is_available', True)
            availability_score = 1.0 if is_available else 0.0
            score += availability_score * criteria['availability']
            if not is_available:
                factors.append("Currently unavailable")

            if score >= 0.3:  # Minimum threshold
                recommendations.append(self.create_recommendation(
                    type=RecommendationType.ASSIGNMENT,
                    title=f"Assign to {candidate.get('name', 'Unknown')}",
                    description=f"Best match for {task_type} task. {'; '.join(factors)}",
                    urgency=Urgency.HIGH if task.get('priority') == 'urgent' else Urgency.MEDIUM,
                    confidence=min(0.95, score),
                    action='assign',
                    action_params={
                        'task_id': task.get('id'),
                        'assignee_id': candidate.get('id'),
                    },
                    impact=f"Estimated completion: {candidate.get('avg_completion_time', 'N/A')}",
                    effort='low',
                    metadata={'candidate_id': candidate.get('id'), 'score_breakdown': factors},
                ))

        # Sort by confidence descending
        recommendations.sort(key=lambda r: r.confidence, reverse=True)
        return recommendations[:5]  # Return top 5

    # ==================== Scheduling Recommendations ====================

    def recommend_schedule(
        self,
        tasks: List[Dict[str, Any]],
        resources: List[Dict[str, Any]],
        horizon_days: int = 7,
    ) -> List[Recommendation]:
        """
        Recommend optimal scheduling for tasks.

        Args:
            tasks: List of tasks to schedule
            resources: Available resources with schedules
            horizon_days: Planning horizon in days

        Returns:
            List of scheduling recommendations
        """
        recommendations = []

        # Group tasks by priority
        urgent_tasks = [t for t in tasks if t.get('priority') == 'urgent']
        high_tasks = [t for t in tasks if t.get('priority') == 'high']
        normal_tasks = [t for t in tasks if t.get('priority') not in ['urgent', 'high']]

        # Check for capacity issues
        total_hours_needed = sum(t.get('estimated_hours', 2) for t in tasks)
        total_capacity = sum(r.get('available_hours', 8) * horizon_days for r in resources)

        if total_hours_needed > total_capacity * 0.9:
            recommendations.append(self.create_recommendation(
                type=RecommendationType.RESOURCE,
                title="Capacity Warning",
                description=f"Workload ({total_hours_needed:.0f}h) exceeds 90% of capacity ({total_capacity:.0f}h). Consider adding resources or extending timeline.",
                urgency=Urgency.HIGH,
                confidence=0.95,
                action='review_capacity',
                impact="Risk of missed deadlines",
                effort='high',
            ))

        # Recommend front-loading urgent tasks
        if urgent_tasks:
            recommendations.append(self.create_recommendation(
                type=RecommendationType.SCHEDULING,
                title=f"Prioritize {len(urgent_tasks)} Urgent Tasks",
                description="Schedule urgent tasks for immediate execution within next 24 hours.",
                urgency=Urgency.CRITICAL,
                confidence=0.9,
                action='schedule_urgent',
                action_params={'task_ids': [t.get('id') for t in urgent_tasks]},
                impact="Prevent SLA breaches",
                effort='medium',
            ))

        # Recommend load balancing
        if len(resources) > 1:
            workloads = [r.get('current_workload', 0) for r in resources]
            if max(workloads) - min(workloads) > 5:
                recommendations.append(self.create_recommendation(
                    type=RecommendationType.SCHEDULING,
                    title="Rebalance Workload",
                    description="Significant workload imbalance detected. Redistribute tasks for better efficiency.",
                    urgency=Urgency.MEDIUM,
                    confidence=0.85,
                    action='rebalance',
                    impact="Improved team efficiency",
                    effort='medium',
                ))

        return recommendations

    # ==================== Reschedule Recommendations ====================

    def recommend_reschedule_dates(
        self,
        item: Dict[str, Any],
        assignee: Dict[str, Any] = None,
        constraints: Dict[str, Any] = None,
    ) -> List[Recommendation]:
        """
        Recommend optimal reschedule dates for an overdue item.

        Args:
            item: Overdue item details
            assignee: Current assignee info
            constraints: Scheduling constraints (no_weekends, etc.)

        Returns:
            List of date recommendations
        """
        recommendations = []
        constraints = constraints or {}
        exclude_weekends = constraints.get('exclude_weekends', True)

        today = datetime.utcnow().date()
        priority = item.get('priority', 'normal')

        # Generate candidate dates
        for days_ahead in [1, 2, 3, 5, 7]:
            candidate_date = today + timedelta(days=days_ahead)

            # Skip weekends if excluded
            if exclude_weekends and candidate_date.weekday() >= 5:
                continue

            # Calculate confidence based on various factors
            confidence = 0.9 - (days_ahead * 0.05)  # Prefer sooner dates

            # Adjust for assignee workload if known
            if assignee:
                daily_load = assignee.get('daily_workload', {}).get(str(candidate_date), 0)
                if daily_load > 8:
                    confidence -= 0.2
                    reason = "High workload on this date"
                elif daily_load < 4:
                    confidence += 0.05
                    reason = "Light workload on this date"
                else:
                    reason = "Normal workload"
            else:
                reason = f"{days_ahead} day(s) from today"

            recommendations.append(self.create_recommendation(
                type=RecommendationType.SCHEDULING,
                title=f"Reschedule to {candidate_date.strftime('%B %d, %Y')}",
                description=reason,
                urgency=Urgency.HIGH if priority in ['urgent', 'critical'] else Urgency.MEDIUM,
                confidence=max(0.5, min(0.95, confidence)),
                action='reschedule',
                action_params={
                    'item_id': item.get('id'),
                    'new_date': candidate_date.isoformat(),
                },
                impact=f"New deadline: {candidate_date.strftime('%Y-%m-%d')}",
                effort='low',
            ))

        recommendations.sort(key=lambda r: r.confidence, reverse=True)
        return recommendations[:3]

    # ==================== Escalation Recommendations ====================

    def recommend_escalation(
        self,
        item: Dict[str, Any],
        current_level: int = 0,
    ) -> List[Recommendation]:
        """
        Recommend escalation actions based on item status.

        Args:
            item: Item details with status, age, priority
            current_level: Current escalation level (0-4)

        Returns:
            List of escalation recommendations
        """
        recommendations = []

        days_overdue = item.get('days_overdue', 0)
        priority = item.get('priority', 'normal')
        has_assignee = item.get('assigned_to') is not None

        # Level 1: Notify assignee
        if current_level < 1 and days_overdue >= 1:
            recommendations.append(self.create_recommendation(
                type=RecommendationType.ESCALATION,
                title="Send Reminder to Assignee",
                description="Send a reminder notification to the current assignee.",
                urgency=Urgency.LOW,
                confidence=0.9,
                action='notify_assignee',
                action_params={'item_id': item.get('id'), 'level': 1},
                impact="Prompt action from assignee",
                effort='low',
            ))

        # Level 2: Notify supervisor
        if current_level < 2 and days_overdue >= 3:
            recommendations.append(self.create_recommendation(
                type=RecommendationType.ESCALATION,
                title="Escalate to Supervisor",
                description="Notify the supervisor about this overdue item.",
                urgency=Urgency.MEDIUM,
                confidence=0.85,
                action='notify_supervisor',
                action_params={'item_id': item.get('id'), 'level': 2},
                impact="Management awareness",
                effort='low',
            ))

        # Level 3: Reassignment
        if current_level < 3 and days_overdue >= 7:
            recommendations.append(self.create_recommendation(
                type=RecommendationType.ESCALATION,
                title="Reassign to Available Resource",
                description="Current assignee may be blocked. Consider reassigning.",
                urgency=Urgency.HIGH,
                confidence=0.8,
                action='reassign',
                action_params={'item_id': item.get('id'), 'level': 3},
                impact="Fresh start with available resource",
                effort='medium',
            ))

        # Level 4: Emergency
        if current_level < 4 and (days_overdue >= 14 or priority == 'critical'):
            recommendations.append(self.create_recommendation(
                type=RecommendationType.ESCALATION,
                title="Emergency Escalation",
                description="Critical overdue item requires immediate management intervention.",
                urgency=Urgency.CRITICAL,
                confidence=0.95,
                action='emergency_escalate',
                action_params={'item_id': item.get('id'), 'level': 4},
                impact="Full management attention",
                effort='high',
            ))

        return recommendations

    # ==================== Training Recommendations ====================

    def recommend_training(
        self,
        user: Dict[str, Any],
        skill_gaps: List[Dict[str, Any]],
        available_courses: List[Dict[str, Any]] = None,
    ) -> List[Recommendation]:
        """
        Recommend training based on skill gaps.

        Args:
            user: User profile with skills
            skill_gaps: Identified skill gaps
            available_courses: List of available training courses

        Returns:
            List of training recommendations
        """
        recommendations = []

        default_courses = {
            'time_management': {'name': 'Time Management Mastery', 'duration': '2 hours', 'priority': 1},
            'quality': {'name': 'Quality Excellence', 'duration': '3 hours', 'priority': 2},
            'safety': {'name': 'Safety Fundamentals', 'duration': '4 hours', 'priority': 1},
            'communication': {'name': 'Effective Communication', 'duration': '2 hours', 'priority': 3},
            'technical': {'name': 'Technical Skills Workshop', 'duration': '8 hours', 'priority': 2},
        }

        for gap in skill_gaps[:3]:  # Top 3 gaps
            skill = gap.get('skill', '').lower()
            severity = gap.get('severity', 'medium')

            course_info = default_courses.get(skill, {
                'name': f'{skill.title()} Training',
                'duration': '2 hours',
                'priority': 2,
            })

            recommendations.append(self.create_recommendation(
                type=RecommendationType.TRAINING,
                title=f"Enroll in {course_info['name']}",
                description=f"Address {skill} skill gap (severity: {severity}). Duration: {course_info['duration']}",
                urgency=Urgency.HIGH if severity == 'high' else Urgency.MEDIUM,
                confidence=0.85,
                action='enroll_training',
                action_params={
                    'user_id': user.get('id'),
                    'course_name': course_info['name'],
                    'skill': skill,
                },
                impact=f"Improve {skill} by ~20%",
                effort='medium',
            ))

        return recommendations

    def to_dict_list(self, recommendations: List[Recommendation]) -> List[Dict[str, Any]]:
        """Convert list of recommendations to dicts."""
        return [r.to_dict() for r in recommendations]


# Pre-configured engines for common modules
defect_recommendation_engine = RecommendationEngine(module='defects')
overdue_recommendation_engine = RecommendationEngine(module='overdue')
performance_recommendation_engine = RecommendationEngine(module='performance')
daily_review_recommendation_engine = RecommendationEngine(module='daily_review')
