"""
SLA (Service Level Agreement) tracking for any entity type.
Reusable across Defects, Inspections, Reviews, etc.
"""

from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from datetime import datetime, date, timedelta
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class SLAStatus(Enum):
    """SLA status levels."""
    ON_TRACK = 'on_track'       # < 50% of time used
    WARNING = 'warning'          # 50-75% of time used
    AT_RISK = 'at_risk'         # 75-100% of time used
    BREACHED = 'breached'       # > 100% of time used
    CRITICAL = 'critical'       # Severely breached


@dataclass
class SLAConfig:
    """
    Configuration for SLA tracking.
    """
    entity_type: str
    severity_sla_hours: Dict[str, int]  # severity -> hours
    warning_threshold: float = 0.5      # 50% of SLA time
    at_risk_threshold: float = 0.75     # 75% of SLA time
    exclude_weekends: bool = False
    exclude_holidays: bool = False
    business_hours_only: bool = False   # Only count 8am-6pm
    business_start_hour: int = 8
    business_end_hour: int = 18

    @classmethod
    def default_defect_config(cls) -> 'SLAConfig':
        """Default SLA config for defects."""
        return cls(
            entity_type='defect',
            severity_sla_hours={
                'critical': 4,      # 4 hours
                'high': 24,         # 1 day
                'medium': 72,       # 3 days
                'low': 168,         # 7 days
            },
        )

    @classmethod
    def default_review_config(cls) -> 'SLAConfig':
        """Default SLA config for quality reviews."""
        return cls(
            entity_type='quality_review',
            severity_sla_hours={
                'urgent': 2,
                'high': 8,
                'normal': 24,
                'low': 48,
            },
        )

    @classmethod
    def default_inspection_config(cls) -> 'SLAConfig':
        """Default SLA config for inspections."""
        return cls(
            entity_type='inspection',
            severity_sla_hours={
                'urgent': 24,
                'normal': 72,
            },
        )


class SLATracker:
    """
    Generic SLA tracking for any entity type.

    Usage:
        tracker = SLATracker(SLAConfig.default_defect_config())
        status = tracker.get_status(
            created_at=datetime(2024, 1, 1, 10, 0),
            severity='high',
            completed_at=None  # Not completed yet
        )
    """

    def __init__(self, config: SLAConfig):
        """Initialize SLA tracker with configuration."""
        self.config = config
        self._holidays: List[date] = []

    def set_holidays(self, holidays: List[date]) -> 'SLATracker':
        """Set holiday dates to exclude from SLA calculation."""
        self._holidays = holidays
        return self

    def get_sla_hours(self, severity: str) -> int:
        """Get SLA hours for a severity level."""
        return self.config.severity_sla_hours.get(severity, 72)  # Default 3 days

    def get_sla_deadline(self, created_at: datetime, severity: str) -> datetime:
        """
        Calculate SLA deadline from creation time.

        Args:
            created_at: When the entity was created
            severity: Severity level

        Returns:
            SLA deadline datetime
        """
        sla_hours = self.get_sla_hours(severity)

        if not self.config.business_hours_only:
            # Simple calculation
            deadline = created_at + timedelta(hours=sla_hours)
        else:
            # Business hours calculation
            deadline = self._calculate_business_hours_deadline(created_at, sla_hours)

        if self.config.exclude_weekends:
            deadline = self._adjust_for_weekends(deadline)

        if self.config.exclude_holidays:
            deadline = self._adjust_for_holidays(deadline)

        return deadline

    def _calculate_business_hours_deadline(
        self,
        start: datetime,
        hours: int
    ) -> datetime:
        """Calculate deadline counting only business hours."""
        current = start
        remaining_hours = hours

        business_hours_per_day = self.config.business_end_hour - self.config.business_start_hour

        while remaining_hours > 0:
            # If before business hours, move to start
            if current.hour < self.config.business_start_hour:
                current = current.replace(hour=self.config.business_start_hour, minute=0)
            # If after business hours, move to next day
            elif current.hour >= self.config.business_end_hour:
                current = (current + timedelta(days=1)).replace(
                    hour=self.config.business_start_hour, minute=0
                )
                continue

            # Calculate hours remaining today
            hours_today = self.config.business_end_hour - current.hour

            if remaining_hours <= hours_today:
                current = current + timedelta(hours=remaining_hours)
                remaining_hours = 0
            else:
                remaining_hours -= hours_today
                current = (current + timedelta(days=1)).replace(
                    hour=self.config.business_start_hour, minute=0
                )

        return current

    def _adjust_for_weekends(self, deadline: datetime) -> datetime:
        """Push deadline forward if it falls on a weekend."""
        while deadline.weekday() >= 5:  # Saturday = 5, Sunday = 6
            deadline += timedelta(days=1)
        return deadline

    def _adjust_for_holidays(self, deadline: datetime) -> datetime:
        """Push deadline forward if it falls on a holiday."""
        while deadline.date() in self._holidays:
            deadline += timedelta(days=1)
        return deadline

    def get_elapsed_time(
        self,
        created_at: datetime,
        completed_at: datetime = None
    ) -> timedelta:
        """Get elapsed time (from creation to now or completion)."""
        end_time = completed_at or datetime.utcnow()
        return end_time - created_at

    def get_remaining_time(
        self,
        created_at: datetime,
        severity: str,
        completed_at: datetime = None
    ) -> timedelta:
        """Get remaining time until SLA breach."""
        if completed_at:
            return timedelta(0)  # Already completed

        deadline = self.get_sla_deadline(created_at, severity)
        remaining = deadline - datetime.utcnow()
        return remaining if remaining.total_seconds() > 0 else timedelta(0)

    def get_sla_percentage(
        self,
        created_at: datetime,
        severity: str,
        completed_at: datetime = None
    ) -> float:
        """
        Get percentage of SLA time used.

        Returns:
            Percentage (0-100+). Over 100 means breached.
        """
        sla_hours = self.get_sla_hours(severity)
        sla_seconds = sla_hours * 3600

        elapsed = self.get_elapsed_time(created_at, completed_at)
        elapsed_seconds = elapsed.total_seconds()

        if sla_seconds == 0:
            return 100.0 if elapsed_seconds > 0 else 0.0

        return (elapsed_seconds / sla_seconds) * 100

    def get_status(
        self,
        created_at: datetime,
        severity: str,
        completed_at: datetime = None,
    ) -> Dict[str, Any]:
        """
        Get comprehensive SLA status for an entity.

        Args:
            created_at: When entity was created
            severity: Severity level
            completed_at: When entity was completed (None if not complete)

        Returns:
            Dict with status, percentage, remaining time, etc.
        """
        sla_hours = self.get_sla_hours(severity)
        deadline = self.get_sla_deadline(created_at, severity)
        percentage = self.get_sla_percentage(created_at, severity, completed_at)
        remaining = self.get_remaining_time(created_at, severity, completed_at)
        elapsed = self.get_elapsed_time(created_at, completed_at)

        # Determine status
        if completed_at:
            status = SLAStatus.ON_TRACK if percentage <= 100 else SLAStatus.BREACHED
        elif percentage >= 150:
            status = SLAStatus.CRITICAL
        elif percentage >= 100:
            status = SLAStatus.BREACHED
        elif percentage >= self.config.at_risk_threshold * 100:
            status = SLAStatus.AT_RISK
        elif percentage >= self.config.warning_threshold * 100:
            status = SLAStatus.WARNING
        else:
            status = SLAStatus.ON_TRACK

        # Format remaining time for display
        remaining_hours = remaining.total_seconds() / 3600
        if remaining_hours >= 24:
            remaining_display = f"{int(remaining_hours / 24)}d {int(remaining_hours % 24)}h"
        elif remaining_hours >= 1:
            remaining_display = f"{int(remaining_hours)}h {int((remaining_hours % 1) * 60)}m"
        else:
            remaining_display = f"{int(remaining_hours * 60)}m"

        return {
            'entity_type': self.config.entity_type,
            'severity': severity,
            'status': status.value,
            'status_level': list(SLAStatus).index(status),
            'sla_hours': sla_hours,
            'deadline': deadline.isoformat(),
            'deadline_display': deadline.strftime('%Y-%m-%d %H:%M'),
            'percentage': round(percentage, 1),
            'remaining_seconds': remaining.total_seconds(),
            'remaining_display': remaining_display if not completed_at else 'Completed',
            'elapsed_hours': round(elapsed.total_seconds() / 3600, 1),
            'is_completed': completed_at is not None,
            'is_breached': percentage > 100,
            'is_at_risk': percentage >= self.config.at_risk_threshold * 100,
            'color': self._get_status_color(status),
        }

    def _get_status_color(self, status: SLAStatus) -> str:
        """Get color code for status."""
        colors = {
            SLAStatus.ON_TRACK: '#52c41a',   # Green
            SLAStatus.WARNING: '#faad14',     # Yellow
            SLAStatus.AT_RISK: '#fa8c16',     # Orange
            SLAStatus.BREACHED: '#ff4d4f',    # Red
            SLAStatus.CRITICAL: '#cf1322',    # Dark red
        }
        return colors.get(status, '#999999')

    def bulk_check(
        self,
        entities: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Check SLA status for multiple entities.

        Args:
            entities: List of dicts with created_at, severity, completed_at

        Returns:
            Summary with counts and individual statuses
        """
        results = []
        summary = {
            'total': len(entities),
            'on_track': 0,
            'warning': 0,
            'at_risk': 0,
            'breached': 0,
            'critical': 0,
        }

        for entity in entities:
            status = self.get_status(
                created_at=entity.get('created_at'),
                severity=entity.get('severity', 'medium'),
                completed_at=entity.get('completed_at'),
            )
            status['entity_id'] = entity.get('id')
            results.append(status)

            status_key = status['status']
            if status_key in summary:
                summary[status_key] += 1

        return {
            'summary': summary,
            'results': results,
            'breach_rate': round(
                (summary['breached'] + summary['critical']) / summary['total'] * 100, 1
            ) if summary['total'] > 0 else 0,
        }


# Pre-configured trackers for common use cases
defect_sla_tracker = SLATracker(SLAConfig.default_defect_config())
review_sla_tracker = SLATracker(SLAConfig.default_review_config())
inspection_sla_tracker = SLATracker(SLAConfig.default_inspection_config())
