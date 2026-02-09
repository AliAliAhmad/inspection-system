"""
Notification AI Service for intelligent notification processing.
Provides AI-powered insights for notification management and user engagement.
"""

import re
import logging
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Any
from collections import Counter, defaultdict
from sqlalchemy import func, and_, or_

from app.extensions import db
from app.models import (
    Notification, User, Equipment, Inspection, Defect,
    InspectionAssignment, InspectionList, SpecialistJob, EngineerJob,
    Leave, WorkPlanJob, WorkPlanAssignment
)

logger = logging.getLogger(__name__)


class NotificationAIService:
    """
    AI-powered notification intelligence service.

    Provides methods for:
    - Smart ranking of notifications by relevance
    - Summarization of multiple notifications
    - Prediction of upcoming notifications
    - Anomaly detection in notification patterns
    - Natural language query parsing
    - Smart filtering based on user behavior
    - Action suggestions
    - Optimal delivery timing
    - Duplicate detection
    - Context-aware bundling
    - Impact prediction
    - Daily summary generation
    - Auto-categorization
    - Smart snooze suggestions
    - Sentiment analysis
    """

    # Priority weights for ranking
    PRIORITY_WEIGHTS = {
        'critical': 10,
        'urgent': 7,
        'warning': 4,
        'info': 1
    }

    # Notification type categories
    TYPE_CATEGORIES = {
        'equipment': ['equipment_stopped', 'equipment_maintenance', 'equipment_alert', 'equipment_risk'],
        'inspection': ['inspection_assigned', 'inspection_due', 'inspection_completed', 'inspection_failed'],
        'defect': ['defect_created', 'defect_assigned', 'defect_escalated', 'defect_resolved'],
        'job': ['job_assigned', 'job_started', 'job_completed', 'job_paused'],
        'leave': ['leave_requested', 'leave_approved', 'leave_rejected', 'leave_starting'],
        'quality': ['qc_review_needed', 'qc_approved', 'qc_rejected'],
        'system': ['system_alert', 'system_maintenance', 'announcement'],
        'work_plan': ['work_plan_assigned', 'work_plan_updated', 'work_plan_job_assigned']
    }

    # Urgency keywords for sentiment analysis
    URGENCY_KEYWORDS = {
        'high': ['urgent', 'critical', 'immediate', 'emergency', 'asap', 'failed', 'stopped', 'down'],
        'medium': ['important', 'attention', 'required', 'overdue', 'pending', 'waiting'],
        'low': ['reminder', 'info', 'update', 'notice', 'fyi']
    }

    # Negative sentiment keywords
    NEGATIVE_KEYWORDS = ['failed', 'rejected', 'stopped', 'error', 'problem', 'issue', 'overdue', 'critical', 'urgent']
    POSITIVE_KEYWORDS = ['approved', 'completed', 'resolved', 'success', 'passed', 'active']

    # ========================================
    # 1. SMART RANKING
    # ========================================

    @staticmethod
    def rank_notifications(user_id: int, notifications: list) -> list:
        """
        Rank notifications by relevance to user.

        Factors:
        - Priority weight (critical=10, urgent=7, warning=4, info=1)
        - Recency (newer = higher)
        - User's historical interaction with this type
        - Related to user's current assignments
        - Escalation status

        Args:
            user_id: ID of the user
            notifications: List of notification dicts or Notification objects

        Returns:
            Sorted list with 'relevance_score' added to each notification
        """
        if not notifications:
            return []

        now = datetime.utcnow()
        user = db.session.get(User, user_id)

        # Get user's interaction history
        interaction_stats = NotificationAIService._get_user_interaction_stats(user_id)

        # Get user's current assignments
        user_assignments = NotificationAIService._get_user_active_assignments(user_id)

        ranked = []
        for notif in notifications:
            # Handle both dict and Notification object
            if isinstance(notif, Notification):
                notif_dict = notif.to_dict()
                notif_dict['_obj'] = notif
            else:
                notif_dict = notif.copy()

            # Calculate relevance score
            score = 0.0

            # Factor 1: Priority weight (40%)
            priority = notif_dict.get('priority', 'info')
            priority_score = NotificationAIService.PRIORITY_WEIGHTS.get(priority, 1) * 10
            score += priority_score * 0.4

            # Factor 2: Recency (25%)
            created_at = notif_dict.get('created_at')
            if created_at:
                if isinstance(created_at, str):
                    created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                hours_old = (now - created_at.replace(tzinfo=None)).total_seconds() / 3600
                recency_score = max(0, 100 - (hours_old * 2))  # Decays over 50 hours
            else:
                recency_score = 50
            score += recency_score * 0.25

            # Factor 3: User's historical interaction rate (15%)
            notif_type = notif_dict.get('type', '')
            type_stats = interaction_stats.get(notif_type, {})
            action_rate = type_stats.get('action_rate', 0.5)
            interaction_score = action_rate * 100
            score += interaction_score * 0.15

            # Factor 4: Related to current assignments (15%)
            related_type = notif_dict.get('related_type')
            related_id = notif_dict.get('related_id')
            assignment_match = False

            if related_type and related_id:
                if related_type in user_assignments:
                    if related_id in user_assignments[related_type]:
                        assignment_match = True
                        score += 100 * 0.15

            if not assignment_match:
                score += 30 * 0.15  # Base score for non-assignment related

            # Factor 5: Escalation/persistence bonus (5%)
            is_persistent = notif_dict.get('is_persistent', False)
            is_read = notif_dict.get('is_read', False)

            if is_persistent and not is_read:
                score += 100 * 0.05
            elif not is_read:
                score += 50 * 0.05

            notif_dict['relevance_score'] = round(score, 2)
            ranked.append(notif_dict)

        # Sort by relevance score descending
        ranked.sort(key=lambda x: x['relevance_score'], reverse=True)

        return ranked

    # ========================================
    # 2. SUMMARIZATION
    # ========================================

    @staticmethod
    def summarize_notifications(notifications: list) -> dict:
        """
        Summarize 5+ related notifications into a digest.

        Args:
            notifications: List of notifications to summarize

        Returns:
            Dict containing:
            - summary_title: English summary title
            - summary_title_ar: Arabic summary title
            - summary_message: English summary message
            - summary_message_ar: Arabic summary message
            - notification_count: Number of notifications
            - top_priority: Highest priority among notifications
            - action_items: List of suggested actions
        """
        if not notifications:
            return {
                'summary_title': 'No notifications',
                'summary_title_ar': 'لا توجد إشعارات',
                'summary_message': 'You have no notifications to summarize.',
                'summary_message_ar': 'ليس لديك إشعارات للتلخيص.',
                'notification_count': 0,
                'top_priority': None,
                'action_items': []
            }

        count = len(notifications)

        # Group by type
        by_type = defaultdict(list)
        for notif in notifications:
            if isinstance(notif, Notification):
                notif_type = notif.type
                priority = notif.priority
            else:
                notif_type = notif.get('type', 'unknown')
                priority = notif.get('priority', 'info')

            by_type[notif_type].append(notif)

        # Find top priority
        priority_order = {'critical': 0, 'urgent': 1, 'warning': 2, 'info': 3}
        top_priority = 'info'
        for notif in notifications:
            if isinstance(notif, Notification):
                p = notif.priority
            else:
                p = notif.get('priority', 'info')
            if priority_order.get(p, 3) < priority_order.get(top_priority, 3):
                top_priority = p

        # Generate summary based on grouping
        type_summaries = []
        type_summaries_ar = []
        action_items = []

        for notif_type, items in sorted(by_type.items(), key=lambda x: len(x[1]), reverse=True):
            item_count = len(items)
            category = NotificationAIService._get_category_for_type(notif_type)

            # English summary
            if category == 'equipment':
                type_summaries.append(f'{item_count} equipment alert(s)')
                type_summaries_ar.append(f'{item_count} تنبيه(ات) للمعدات')
                action_items.append('Review equipment status')
            elif category == 'inspection':
                type_summaries.append(f'{item_count} inspection notification(s)')
                type_summaries_ar.append(f'{item_count} إشعار(ات) للفحص')
                action_items.append('Check inspection queue')
            elif category == 'defect':
                type_summaries.append(f'{item_count} defect update(s)')
                type_summaries_ar.append(f'{item_count} تحديث(ات) للعيوب')
                action_items.append('Review defect reports')
            elif category == 'job':
                type_summaries.append(f'{item_count} job notification(s)')
                type_summaries_ar.append(f'{item_count} إشعار(ات) للمهام')
                action_items.append('Check job assignments')
            elif category == 'leave':
                type_summaries.append(f'{item_count} leave request(s)')
                type_summaries_ar.append(f'{item_count} طلب(ات) إجازة')
                action_items.append('Review leave requests')
            elif category == 'quality':
                type_summaries.append(f'{item_count} quality review(s)')
                type_summaries_ar.append(f'{item_count} مراجعة(ات) جودة')
                action_items.append('Process quality reviews')
            elif category == 'work_plan':
                type_summaries.append(f'{item_count} work plan update(s)')
                type_summaries_ar.append(f'{item_count} تحديث(ات) خطة العمل')
                action_items.append('Review work plan')
            else:
                type_summaries.append(f'{item_count} {notif_type} notification(s)')
                type_summaries_ar.append(f'{item_count} إشعار(ات) {notif_type}')

        # Construct final summary
        summary_title = f'You have {count} notifications'
        summary_title_ar = f'لديك {count} إشعار'

        if count == 1:
            summary_title = f'You have {count} notification'
            summary_title_ar = f'لديك {count} إشعار'

        summary_message = ', '.join(type_summaries[:3])
        if len(type_summaries) > 3:
            summary_message += f' and {len(type_summaries) - 3} more type(s)'

        summary_message_ar = '، '.join(type_summaries_ar[:3])
        if len(type_summaries_ar) > 3:
            summary_message_ar += f' و {len(type_summaries_ar) - 3} نوع(أنواع) أخرى'

        return {
            'summary_title': summary_title,
            'summary_title_ar': summary_title_ar,
            'summary_message': summary_message,
            'summary_message_ar': summary_message_ar,
            'notification_count': count,
            'top_priority': top_priority,
            'action_items': list(set(action_items))[:5]
        }

    # ========================================
    # 3. PREDICTION
    # ========================================

    @staticmethod
    def predict_notifications(user_id: int) -> list:
        """
        Predict what notifications user will receive soon.

        Based on:
        - Scheduled maintenance
        - SLA deadlines approaching
        - Historical patterns (daily inspection assignments)
        - Equipment risk scores

        Args:
            user_id: ID of the user

        Returns:
            List of predicted notifications with probability scores
        """
        predictions = []
        now = datetime.utcnow()
        today = date.today()
        tomorrow = today + timedelta(days=1)
        next_week = today + timedelta(days=7)

        user = db.session.get(User, user_id)
        if not user:
            return predictions

        # Prediction 1: Upcoming inspection assignments
        # Check if user is an inspector
        if user.role in ('inspector', 'engineer') or user.minor_role == 'inspector':
            # Check inspection lists for tomorrow
            tomorrow_lists = InspectionList.query.filter(
                InspectionList.target_date == tomorrow
            ).all()

            if tomorrow_lists:
                predictions.append({
                    'type': 'inspection_assigned',
                    'likely_time': tomorrow.isoformat() + 'T08:00:00',
                    'probability': 0.85,
                    'description': f'You may receive inspection assignments for {tomorrow.strftime("%B %d")}'
                })

        # Prediction 2: Equipment alerts based on risk scores
        if user.role in ('engineer', 'admin', 'quality_engineer'):
            high_risk_equipment = Equipment.query.filter(
                Equipment.last_risk_score >= 70,
                Equipment.is_scrapped == False
            ).limit(5).all()

            if high_risk_equipment:
                predictions.append({
                    'type': 'equipment_risk',
                    'likely_time': (now + timedelta(days=1)).isoformat(),
                    'probability': 0.70,
                    'description': f'{len(high_risk_equipment)} equipment(s) with high risk scores may require attention'
                })

        # Prediction 3: Leave approval notifications (for engineers/admins)
        if user.role in ('engineer', 'admin'):
            pending_leaves = Leave.query.filter(
                Leave.status == 'pending'
            ).count()

            if pending_leaves > 0:
                predictions.append({
                    'type': 'leave_requested',
                    'likely_time': now.isoformat(),
                    'probability': 0.95,
                    'description': f'{pending_leaves} pending leave request(s) waiting for approval'
                })

        # Prediction 4: Job completion notifications
        user_jobs = []
        if user.role == 'specialist' or user.minor_role == 'specialist':
            user_jobs = SpecialistJob.query.filter(
                SpecialistJob.specialist_id == user_id,
                SpecialistJob.status == 'in_progress'
            ).all()

        for job in user_jobs[:3]:
            if job.estimated_hours and job.started_at:
                estimated_end = job.started_at + timedelta(hours=float(job.estimated_hours))
                if estimated_end <= now + timedelta(hours=24):
                    predictions.append({
                        'type': 'job_completion_reminder',
                        'likely_time': estimated_end.isoformat(),
                        'probability': 0.75,
                        'description': f'Job #{job.id} may be due for completion'
                    })

        # Prediction 5: Work plan assignments
        upcoming_work_plan_assignments = WorkPlanAssignment.query.filter(
            WorkPlanAssignment.user_id == user_id
        ).join(WorkPlanJob).filter(
            WorkPlanJob.scheduled_date.between(today, next_week)
        ).count()

        if upcoming_work_plan_assignments > 0:
            predictions.append({
                'type': 'work_plan_assigned',
                'likely_time': (today + timedelta(days=1)).isoformat() + 'T07:00:00',
                'probability': 0.80,
                'description': f'{upcoming_work_plan_assignments} work plan job(s) scheduled this week'
            })

        # Prediction 6: Historical pattern - daily notifications
        # Check if user typically gets notifications at certain times
        historical_pattern = NotificationAIService._analyze_notification_time_patterns(user_id)
        if historical_pattern.get('peak_hour'):
            peak_hour = historical_pattern['peak_hour']
            next_peak = now.replace(hour=peak_hour, minute=0, second=0, microsecond=0)
            if next_peak <= now:
                next_peak += timedelta(days=1)

            predictions.append({
                'type': 'daily_notifications',
                'likely_time': next_peak.isoformat(),
                'probability': historical_pattern.get('confidence', 0.60),
                'description': f'You typically receive notifications around {peak_hour}:00'
            })

        # Sort by probability descending
        predictions.sort(key=lambda x: x['probability'], reverse=True)

        return predictions[:10]

    # ========================================
    # 4. ANOMALY DETECTION
    # ========================================

    @staticmethod
    def detect_anomalies(user_id: int = None) -> list:
        """
        Detect unusual notification patterns.

        Analyzes:
        - Sudden spike in defect notifications
        - Unusual time of notifications
        - Repeated escalations for same issue

        Args:
            user_id: Optional user ID to filter by

        Returns:
            List of detected anomalies with severity
        """
        anomalies = []
        now = datetime.utcnow()
        today = date.today()
        last_24_hours = now - timedelta(hours=24)
        last_7_days = now - timedelta(days=7)
        last_30_days = now - timedelta(days=30)

        # Build base query
        base_query = Notification.query
        if user_id:
            base_query = base_query.filter(Notification.user_id == user_id)

        # Anomaly 1: Spike in notifications (last 24h vs weekly average)
        recent_count = base_query.filter(
            Notification.created_at >= last_24_hours
        ).count()

        weekly_total = base_query.filter(
            Notification.created_at >= last_7_days
        ).count()

        daily_avg = weekly_total / 7 if weekly_total > 0 else 0

        if recent_count > daily_avg * 2.5 and recent_count >= 10:
            anomalies.append({
                'anomaly_type': 'notification_spike',
                'severity': 'high' if recent_count > daily_avg * 4 else 'medium',
                'details': f'Received {recent_count} notifications in last 24h vs {round(daily_avg, 1)} daily average',
                'value': recent_count,
                'baseline': round(daily_avg, 1),
                'detected_at': now.isoformat()
            })

        # Anomaly 2: Critical/urgent notification spike
        critical_recent = base_query.filter(
            Notification.created_at >= last_24_hours,
            Notification.priority.in_(['critical', 'urgent'])
        ).count()

        critical_weekly = base_query.filter(
            Notification.created_at >= last_7_days,
            Notification.priority.in_(['critical', 'urgent'])
        ).count()

        critical_daily_avg = critical_weekly / 7 if critical_weekly > 0 else 0

        if critical_recent > critical_daily_avg * 2 and critical_recent >= 3:
            anomalies.append({
                'anomaly_type': 'critical_spike',
                'severity': 'critical',
                'details': f'{critical_recent} critical/urgent notifications in last 24h',
                'value': critical_recent,
                'baseline': round(critical_daily_avg, 1),
                'detected_at': now.isoformat()
            })

        # Anomaly 3: Defect notification cluster
        defect_notifications = base_query.filter(
            Notification.created_at >= last_24_hours,
            Notification.type.like('%defect%')
        ).all()

        if len(defect_notifications) >= 5:
            # Check if they're related to same equipment
            equipment_ids = set()
            for notif in defect_notifications:
                if notif.related_type == 'equipment' and notif.related_id:
                    equipment_ids.add(notif.related_id)

            if len(equipment_ids) <= 2 and len(equipment_ids) > 0:
                anomalies.append({
                    'anomaly_type': 'defect_cluster',
                    'severity': 'high',
                    'details': f'{len(defect_notifications)} defect notifications for {len(equipment_ids)} equipment(s)',
                    'equipment_ids': list(equipment_ids),
                    'detected_at': now.isoformat()
                })

        # Anomaly 4: Repeated escalations
        escalation_notifications = base_query.filter(
            Notification.created_at >= last_7_days,
            Notification.type.like('%escalat%')
        ).all()

        if escalation_notifications:
            # Group by related_id
            escalation_by_item = defaultdict(list)
            for notif in escalation_notifications:
                key = f"{notif.related_type}:{notif.related_id}"
                escalation_by_item[key].append(notif)

            for key, items in escalation_by_item.items():
                if len(items) >= 3:
                    anomalies.append({
                        'anomaly_type': 'repeated_escalation',
                        'severity': 'high',
                        'details': f'Same item escalated {len(items)} times in 7 days',
                        'related_key': key,
                        'escalation_count': len(items),
                        'detected_at': now.isoformat()
                    })

        # Anomaly 5: Unusual timing (notifications outside normal hours)
        off_hours_notifications = base_query.filter(
            Notification.created_at >= last_7_days,
            db.or_(
                func.extract('hour', Notification.created_at) < 6,
                func.extract('hour', Notification.created_at) > 22
            )
        ).count()

        total_recent = base_query.filter(
            Notification.created_at >= last_7_days
        ).count()

        off_hours_ratio = off_hours_notifications / total_recent if total_recent > 0 else 0

        if off_hours_ratio > 0.15 and off_hours_notifications >= 10:
            anomalies.append({
                'anomaly_type': 'unusual_timing',
                'severity': 'low',
                'details': f'{round(off_hours_ratio * 100, 1)}% of notifications sent outside normal hours',
                'off_hours_count': off_hours_notifications,
                'detected_at': now.isoformat()
            })

        # Sort by severity
        severity_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        anomalies.sort(key=lambda x: severity_order.get(x['severity'], 4))

        return anomalies

    # ========================================
    # 5. NATURAL LANGUAGE QUERY PARSING
    # ========================================

    @staticmethod
    def parse_query(query: str) -> dict:
        """
        Parse natural language notification queries.

        Examples:
        - 'show me critical alerts from last week' ->
          {'priority': 'critical', 'date_from': '2026-02-02', 'date_to': '2026-02-09'}
        - 'unread equipment notifications' ->
          {'is_read': False, 'type_category': 'equipment'}

        Args:
            query: Natural language query string

        Returns:
            Dict of parsed filters
        """
        query_lower = query.lower().strip()
        filters = {}
        today = date.today()

        # Priority detection
        priority_keywords = {
            'critical': 'critical',
            'urgent': 'urgent',
            'important': 'urgent',
            'warning': 'warning',
            'info': 'info',
            'normal': 'info'
        }

        for keyword, priority in priority_keywords.items():
            if keyword in query_lower:
                filters['priority'] = priority
                break

        # Read status
        if 'unread' in query_lower or 'new' in query_lower:
            filters['is_read'] = False
        elif 'read' in query_lower and 'unread' not in query_lower:
            filters['is_read'] = True

        # Date/time parsing
        if 'today' in query_lower:
            filters['date_from'] = today.isoformat()
            filters['date_to'] = today.isoformat()
        elif 'yesterday' in query_lower:
            yesterday = today - timedelta(days=1)
            filters['date_from'] = yesterday.isoformat()
            filters['date_to'] = yesterday.isoformat()
        elif 'last week' in query_lower or 'past week' in query_lower:
            filters['date_from'] = (today - timedelta(days=7)).isoformat()
            filters['date_to'] = today.isoformat()
        elif 'this week' in query_lower:
            start_of_week = today - timedelta(days=today.weekday())
            filters['date_from'] = start_of_week.isoformat()
            filters['date_to'] = today.isoformat()
        elif 'last month' in query_lower or 'past month' in query_lower:
            filters['date_from'] = (today - timedelta(days=30)).isoformat()
            filters['date_to'] = today.isoformat()
        elif 'this month' in query_lower:
            start_of_month = today.replace(day=1)
            filters['date_from'] = start_of_month.isoformat()
            filters['date_to'] = today.isoformat()

        # Specific date pattern (e.g., "from 2026-02-01")
        date_pattern = r'(\d{4}-\d{2}-\d{2})'
        dates_found = re.findall(date_pattern, query_lower)
        if dates_found:
            if len(dates_found) >= 2:
                filters['date_from'] = dates_found[0]
                filters['date_to'] = dates_found[1]
            elif 'from' in query_lower or 'since' in query_lower:
                filters['date_from'] = dates_found[0]
            elif 'until' in query_lower or 'to' in query_lower:
                filters['date_to'] = dates_found[0]

        # Type category detection
        for category, types in NotificationAIService.TYPE_CATEGORIES.items():
            if category in query_lower:
                filters['type_category'] = category
                break
            # Also check plural forms
            if category + 's' in query_lower:
                filters['type_category'] = category
                break

        # Specific type detection
        type_keywords = {
            'alert': ['equipment_alert', 'system_alert'],
            'assignment': ['inspection_assigned', 'job_assigned', 'work_plan_assigned'],
            'approval': ['leave_approved', 'qc_approved'],
            'rejection': ['leave_rejected', 'qc_rejected'],
            'escalation': ['defect_escalated'],
            'completion': ['job_completed', 'inspection_completed']
        }

        for keyword, types in type_keywords.items():
            if keyword in query_lower:
                filters['types'] = types
                break

        # Persistent/sticky notifications
        if 'persistent' in query_lower or 'sticky' in query_lower or 'pinned' in query_lower:
            filters['is_persistent'] = True

        # Limit/count parsing
        limit_match = re.search(r'(last|top|first)\s+(\d+)', query_lower)
        if limit_match:
            filters['limit'] = int(limit_match.group(2))

        return {
            'original_query': query,
            'filters': filters,
            'understood': bool(filters),
            'parsed_at': datetime.utcnow().isoformat()
        }

    # ========================================
    # 6. SMART FILTERING
    # ========================================

    @staticmethod
    def get_smart_filters(user_id: int) -> dict:
        """
        Learn what notifications user cares about.

        Based on: read rate, action rate, response time by type.

        Args:
            user_id: ID of the user

        Returns:
            Dict containing:
            - important_types: Types user frequently reads/acts on
            - often_ignored: Types user rarely reads
            - suggested_mute: Types that could be muted
        """
        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)

        # Get all notifications for this user in last 30 days
        notifications = Notification.query.filter(
            Notification.user_id == user_id,
            Notification.created_at >= thirty_days_ago
        ).all()

        if not notifications:
            return {
                'important_types': [],
                'often_ignored': [],
                'suggested_mute': [],
                'engagement_summary': {}
            }

        # Group by type
        type_stats = defaultdict(lambda: {
            'total': 0,
            'read': 0,
            'unread': 0,
            'avg_read_time_hours': [],
            'is_persistent_rate': 0
        })

        for notif in notifications:
            stats = type_stats[notif.type]
            stats['total'] += 1

            if notif.is_read:
                stats['read'] += 1
                if notif.read_at and notif.created_at:
                    read_time = (notif.read_at - notif.created_at).total_seconds() / 3600
                    stats['avg_read_time_hours'].append(read_time)
            else:
                stats['unread'] += 1

            if notif.is_persistent:
                stats['is_persistent_rate'] += 1

        # Calculate engagement metrics
        important_types = []
        often_ignored = []
        suggested_mute = []
        engagement_summary = {}

        for notif_type, stats in type_stats.items():
            read_rate = stats['read'] / stats['total'] if stats['total'] > 0 else 0
            avg_read_time = sum(stats['avg_read_time_hours']) / len(stats['avg_read_time_hours']) if stats['avg_read_time_hours'] else None

            engagement_summary[notif_type] = {
                'total': stats['total'],
                'read_rate': round(read_rate, 2),
                'avg_read_time_hours': round(avg_read_time, 2) if avg_read_time else None
            }

            # Classify based on engagement
            if read_rate >= 0.8 and stats['total'] >= 3:
                important_types.append({
                    'type': notif_type,
                    'read_rate': round(read_rate, 2),
                    'avg_read_time_hours': round(avg_read_time, 2) if avg_read_time else None
                })
            elif read_rate <= 0.3 and stats['total'] >= 5:
                often_ignored.append({
                    'type': notif_type,
                    'read_rate': round(read_rate, 2),
                    'total': stats['total']
                })
                if read_rate <= 0.1:
                    suggested_mute.append(notif_type)

        # Sort by read rate
        important_types.sort(key=lambda x: x['read_rate'], reverse=True)
        often_ignored.sort(key=lambda x: x['read_rate'])

        return {
            'important_types': important_types[:10],
            'often_ignored': often_ignored[:10],
            'suggested_mute': suggested_mute[:5],
            'engagement_summary': engagement_summary
        }

    # ========================================
    # 7. SUGGESTED ACTIONS
    # ========================================

    @staticmethod
    def suggest_actions(notification: dict, user_id: int) -> list:
        """
        Suggest actions based on notification type and user history.

        Args:
            notification: Notification dict
            user_id: User ID

        Returns:
            List of suggested actions with confidence scores
        """
        actions = []
        notif_type = notification.get('type', '')
        related_type = notification.get('related_type')
        related_id = notification.get('related_id')
        priority = notification.get('priority', 'info')

        # Get user's historical actions for this type
        historical_actions = NotificationAIService._get_user_action_history(user_id, notif_type)

        # Type-specific suggestions
        if 'leave' in notif_type:
            if 'request' in notif_type:
                # Check user's approval rate
                approval_rate = historical_actions.get('approval_rate', 0.5)
                if approval_rate > 0.8:
                    actions.append({
                        'action': 'approve',
                        'confidence': round(approval_rate, 2),
                        'reason': f'You approve {round(approval_rate * 100)}% of similar requests'
                    })
                else:
                    actions.append({
                        'action': 'review',
                        'confidence': 0.9,
                        'reason': 'Review leave request details'
                    })

        elif 'inspection' in notif_type:
            if 'assigned' in notif_type:
                actions.append({
                    'action': 'view_assignment',
                    'confidence': 0.95,
                    'reason': 'View your inspection assignment details'
                })
                actions.append({
                    'action': 'start_inspection',
                    'confidence': 0.7,
                    'reason': 'Begin the assigned inspection'
                })

        elif 'defect' in notif_type:
            if 'escalated' in notif_type:
                actions.append({
                    'action': 'review_urgently',
                    'confidence': 0.95,
                    'reason': 'Escalated defects require immediate attention'
                })
            elif 'assigned' in notif_type:
                actions.append({
                    'action': 'acknowledge',
                    'confidence': 0.85,
                    'reason': 'Acknowledge defect assignment'
                })

        elif 'equipment' in notif_type:
            if 'stopped' in notif_type or 'alert' in notif_type:
                actions.append({
                    'action': 'investigate',
                    'confidence': 0.9,
                    'reason': 'Equipment alerts should be investigated'
                })
                if priority in ('critical', 'urgent'):
                    actions.append({
                        'action': 'create_job',
                        'confidence': 0.75,
                        'reason': 'Create maintenance job for equipment'
                    })

        elif 'job' in notif_type:
            if 'assigned' in notif_type:
                actions.append({
                    'action': 'view_job',
                    'confidence': 0.95,
                    'reason': 'View job details'
                })
                actions.append({
                    'action': 'start_job',
                    'confidence': 0.7,
                    'reason': 'Start working on the job'
                })
            elif 'paused' in notif_type:
                actions.append({
                    'action': 'review_pause',
                    'confidence': 0.9,
                    'reason': 'Review pause request'
                })

        elif 'qc' in notif_type or 'quality' in notif_type:
            actions.append({
                'action': 'review_quality',
                'confidence': 0.9,
                'reason': 'Quality review required'
            })

        # Generic actions based on priority
        if not actions:
            if priority == 'critical':
                actions.append({
                    'action': 'review_immediately',
                    'confidence': 0.95,
                    'reason': 'Critical notifications require immediate attention'
                })
            elif priority == 'urgent':
                actions.append({
                    'action': 'review_soon',
                    'confidence': 0.85,
                    'reason': 'Urgent notification'
                })
            else:
                actions.append({
                    'action': 'mark_as_read',
                    'confidence': 0.6,
                    'reason': 'Acknowledge notification'
                })

        # Sort by confidence
        actions.sort(key=lambda x: x['confidence'], reverse=True)

        return actions[:5]

    # ========================================
    # 8. OPTIMAL DELIVERY TIME
    # ========================================

    @staticmethod
    def get_optimal_delivery_time(user_id: int, priority: str = 'info') -> dict:
        """
        Determine when user is most responsive to notifications.

        Args:
            user_id: User ID
            priority: Notification priority

        Returns:
            Dict with optimal delivery time information
        """
        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)

        # Get notifications with read times
        notifications = Notification.query.filter(
            Notification.user_id == user_id,
            Notification.created_at >= thirty_days_ago,
            Notification.is_read == True,
            Notification.read_at.isnot(None)
        ).all()

        if not notifications:
            # Return default optimal times
            return {
                'optimal_hour': 9,
                'optimal_day': 'Monday',
                'response_rate': 0.0,
                'avg_response_time_hours': None,
                'message': 'Not enough data to determine optimal time'
            }

        # Analyze read times by hour
        hour_stats = defaultdict(lambda: {'read_count': 0, 'response_times': []})
        day_stats = defaultdict(lambda: {'read_count': 0, 'response_times': []})

        for notif in notifications:
            read_hour = notif.read_at.hour
            read_day = notif.read_at.strftime('%A')
            response_time = (notif.read_at - notif.created_at).total_seconds() / 3600

            hour_stats[read_hour]['read_count'] += 1
            hour_stats[read_hour]['response_times'].append(response_time)

            day_stats[read_day]['read_count'] += 1
            day_stats[read_day]['response_times'].append(response_time)

        # Find optimal hour (most reads with fastest response)
        optimal_hour = 9
        best_hour_score = 0

        for hour, stats in hour_stats.items():
            if stats['response_times']:
                avg_response = sum(stats['response_times']) / len(stats['response_times'])
                score = stats['read_count'] / (1 + avg_response)  # Balance reads and speed
                if score > best_hour_score:
                    best_hour_score = score
                    optimal_hour = hour

        # Find optimal day
        optimal_day = 'Monday'
        best_day_score = 0

        for day, stats in day_stats.items():
            if stats['response_times']:
                avg_response = sum(stats['response_times']) / len(stats['response_times'])
                score = stats['read_count'] / (1 + avg_response)
                if score > best_day_score:
                    best_day_score = score
                    optimal_day = day

        # Calculate overall response rate
        total_notifications = Notification.query.filter(
            Notification.user_id == user_id,
            Notification.created_at >= thirty_days_ago
        ).count()

        response_rate = len(notifications) / total_notifications if total_notifications > 0 else 0

        # Calculate average response time
        all_response_times = []
        for notif in notifications:
            response_time = (notif.read_at - notif.created_at).total_seconds() / 3600
            all_response_times.append(response_time)

        avg_response_time = sum(all_response_times) / len(all_response_times) if all_response_times else None

        # For high priority, we might recommend immediate delivery
        if priority in ('critical', 'urgent'):
            return {
                'optimal_hour': now.hour,
                'optimal_day': now.strftime('%A'),
                'response_rate': round(response_rate, 2),
                'avg_response_time_hours': round(avg_response_time, 2) if avg_response_time else None,
                'message': f'{priority.capitalize()} notifications should be sent immediately'
            }

        return {
            'optimal_hour': optimal_hour,
            'optimal_day': optimal_day,
            'response_rate': round(response_rate, 2),
            'avg_response_time_hours': round(avg_response_time, 2) if avg_response_time else None,
            'message': f'User most responsive on {optimal_day}s around {optimal_hour}:00'
        }

    # ========================================
    # 9. DUPLICATE DETECTION
    # ========================================

    @staticmethod
    def find_duplicates(notification: dict) -> list:
        """
        Find similar/duplicate notifications.

        Args:
            notification: Notification dict to check

        Returns:
            List of notification IDs that are potential duplicates
        """
        user_id = notification.get('user_id')
        notif_type = notification.get('type')
        title = notification.get('title', '')
        message = notification.get('message', '')
        related_type = notification.get('related_type')
        related_id = notification.get('related_id')
        notif_id = notification.get('id')

        if not user_id:
            return []

        now = datetime.utcnow()
        one_day_ago = now - timedelta(hours=24)

        # Find notifications of same type in last 24 hours
        query = Notification.query.filter(
            Notification.user_id == user_id,
            Notification.type == notif_type,
            Notification.created_at >= one_day_ago
        )

        if notif_id:
            query = query.filter(Notification.id != notif_id)

        similar = query.all()

        duplicates = []
        for notif in similar:
            similarity_score = 0

            # Same related item = high likelihood of duplicate
            if related_type and related_id:
                if notif.related_type == related_type and notif.related_id == related_id:
                    similarity_score += 50

            # Title similarity
            if title and notif.title:
                title_similarity = NotificationAIService._calculate_text_similarity(title, notif.title)
                similarity_score += title_similarity * 25

            # Message similarity
            if message and notif.message:
                message_similarity = NotificationAIService._calculate_text_similarity(message, notif.message)
                similarity_score += message_similarity * 25

            if similarity_score >= 60:
                duplicates.append({
                    'notification_id': notif.id,
                    'similarity_score': round(similarity_score, 2),
                    'created_at': notif.created_at.isoformat() if notif.created_at else None
                })

        # Sort by similarity score
        duplicates.sort(key=lambda x: x['similarity_score'], reverse=True)

        return duplicates[:10]

    # ========================================
    # 10. CONTEXT-AWARE BUNDLING
    # ========================================

    @staticmethod
    def bundle_notifications(user_id: int) -> list:
        """
        Group related unread notifications intelligently.

        Args:
            user_id: User ID

        Returns:
            List of notification bundles
        """
        # Get unread notifications
        notifications = Notification.query.filter(
            Notification.user_id == user_id,
            Notification.is_read == False
        ).order_by(Notification.created_at.desc()).all()

        if not notifications:
            return []

        bundles = []

        # Group by related item
        by_related = defaultdict(list)
        by_type_category = defaultdict(list)
        ungrouped = []

        for notif in notifications:
            if notif.related_type and notif.related_id:
                key = f"{notif.related_type}:{notif.related_id}"
                by_related[key].append(notif)
            else:
                category = NotificationAIService._get_category_for_type(notif.type)
                if category:
                    by_type_category[category].append(notif)
                else:
                    ungrouped.append(notif)

        # Create bundles for related items
        for key, notifs in by_related.items():
            if len(notifs) >= 2:
                related_type, related_id = key.split(':')
                bundles.append({
                    'group_key': key,
                    'group_type': 'related_item',
                    'related_type': related_type,
                    'related_id': int(related_id),
                    'notifications': [n.to_dict() for n in notifs],
                    'count': len(notifs),
                    'summary': f'{len(notifs)} notifications about {related_type} #{related_id}',
                    'top_priority': max((n.priority for n in notifs), key=lambda p: NotificationAIService.PRIORITY_WEIGHTS.get(p, 0))
                })
            else:
                # Only 1 notification, add to category grouping
                for notif in notifs:
                    category = NotificationAIService._get_category_for_type(notif.type)
                    if category:
                        by_type_category[category].append(notif)
                    else:
                        ungrouped.append(notif)

        # Create bundles for type categories
        for category, notifs in by_type_category.items():
            if len(notifs) >= 3:
                bundles.append({
                    'group_key': f'category:{category}',
                    'group_type': 'category',
                    'category': category,
                    'notifications': [n.to_dict() for n in notifs],
                    'count': len(notifs),
                    'summary': f'{len(notifs)} {category} notifications',
                    'top_priority': max((n.priority for n in notifs), key=lambda p: NotificationAIService.PRIORITY_WEIGHTS.get(p, 0))
                })
            else:
                ungrouped.extend(notifs)

        # Add ungrouped notifications as individual items
        for notif in ungrouped:
            bundles.append({
                'group_key': f'single:{notif.id}',
                'group_type': 'single',
                'notifications': [notif.to_dict()],
                'count': 1,
                'summary': notif.title,
                'top_priority': notif.priority
            })

        # Sort bundles by priority and count
        priority_order = {'critical': 0, 'urgent': 1, 'warning': 2, 'info': 3}
        bundles.sort(key=lambda x: (priority_order.get(x['top_priority'], 4), -x['count']))

        return bundles

    # ========================================
    # 11. IMPACT PREDICTION
    # ========================================

    @staticmethod
    def predict_impact(notification: dict) -> dict:
        """
        Predict impact of this notification.

        Args:
            notification: Notification dict

        Returns:
            Dict with impact prediction
        """
        notif_type = notification.get('type', '')
        related_type = notification.get('related_type')
        related_id = notification.get('related_id')
        priority = notification.get('priority', 'info')

        impact = {
            'affected_jobs': [],
            'affected_users': [],
            'severity': 'low',
            'description': ''
        }

        # Equipment-related impacts
        if related_type == 'equipment' and related_id:
            equipment = db.session.get(Equipment, related_id)
            if equipment:
                # Find jobs related to this equipment
                specialist_jobs = SpecialistJob.query.filter(
                    SpecialistJob.equipment_id == related_id,
                    SpecialistJob.status.in_(['in_progress', 'paused'])
                ).all()

                engineer_jobs = EngineerJob.query.filter(
                    EngineerJob.equipment_id == related_id,
                    EngineerJob.status == 'in_progress'
                ).all()

                for job in specialist_jobs:
                    impact['affected_jobs'].append({
                        'job_type': 'specialist',
                        'job_id': job.id,
                        'status': job.status
                    })
                    if job.specialist_id and job.specialist_id not in [u['user_id'] for u in impact['affected_users']]:
                        impact['affected_users'].append({
                            'user_id': job.specialist_id,
                            'role': 'specialist'
                        })

                for job in engineer_jobs:
                    impact['affected_jobs'].append({
                        'job_type': 'engineer',
                        'job_id': job.id,
                        'status': job.status
                    })
                    if job.engineer_id and job.engineer_id not in [u['user_id'] for u in impact['affected_users']]:
                        impact['affected_users'].append({
                            'user_id': job.engineer_id,
                            'role': 'engineer'
                        })

                # Find upcoming inspections
                upcoming_inspections = InspectionAssignment.query.join(InspectionList).filter(
                    InspectionAssignment.equipment_id == related_id,
                    InspectionList.target_date >= date.today(),
                    InspectionAssignment.status != 'completed'
                ).all()

                for assignment in upcoming_inspections:
                    impact['affected_jobs'].append({
                        'job_type': 'inspection',
                        'assignment_id': assignment.id,
                        'target_date': assignment.inspection_list.target_date.isoformat() if assignment.inspection_list else None
                    })

                if equipment.status in ('stopped', 'out_of_service'):
                    impact['severity'] = 'critical' if priority == 'critical' else 'high'
                    impact['description'] = f'Equipment {equipment.name} is {equipment.status}. {len(impact["affected_jobs"])} jobs and {len(impact["affected_users"])} users affected.'
                else:
                    impact['severity'] = 'medium' if impact['affected_jobs'] else 'low'
                    impact['description'] = f'{len(impact["affected_jobs"])} jobs related to equipment {equipment.name}'

        # Defect-related impacts
        elif related_type == 'defect' and related_id:
            defect = db.session.get(Defect, related_id)
            if defect:
                if defect.severity in ('critical', 'high'):
                    impact['severity'] = 'high'

                # Find assigned users
                if defect.assigned_to:
                    impact['affected_users'].append({
                        'user_id': defect.assigned_to,
                        'role': 'assignee'
                    })

                impact['description'] = f'{defect.severity.capitalize()} severity defect affecting operations'

        # Job-related impacts
        elif related_type in ('specialist_job', 'engineer_job') and related_id:
            impact['severity'] = 'medium'
            impact['description'] = 'Job status change may affect schedule'

        # Leave-related impacts
        elif 'leave' in notif_type and related_type == 'leave' and related_id:
            leave = db.session.get(Leave, related_id)
            if leave:
                # Check for affected assignments during leave period
                if leave.start_date and leave.end_date:
                    affected_assignments = InspectionAssignment.query.join(InspectionList).filter(
                        or_(
                            InspectionAssignment.mechanical_inspector_id == leave.user_id,
                            InspectionAssignment.electrical_inspector_id == leave.user_id
                        ),
                        InspectionList.target_date.between(leave.start_date, leave.end_date)
                    ).count()

                    if affected_assignments > 0:
                        impact['severity'] = 'medium'
                        impact['description'] = f'Leave may affect {affected_assignments} inspection assignment(s)'

        if not impact['description']:
            impact['description'] = 'No significant impact predicted'

        return impact

    # ========================================
    # 12. DAILY SUMMARY
    # ========================================

    @staticmethod
    def generate_daily_summary(user_id: int) -> dict:
        """
        AI-generated daily summary based on role.

        Args:
            user_id: User ID

        Returns:
            Dict with personalized daily summary
        """
        user = db.session.get(User, user_id)
        if not user:
            return {'error': 'User not found'}

        now = datetime.utcnow()
        today = date.today()
        yesterday = today - timedelta(days=1)

        # Get user's name for greeting
        first_name = user.full_name.split()[0] if user.full_name else 'there'

        # Time-based greeting
        hour = now.hour
        if hour < 12:
            greeting = f'Good morning, {first_name}!'
            greeting_ar = f'صباح الخير، {first_name}!'
        elif hour < 17:
            greeting = f'Good afternoon, {first_name}!'
            greeting_ar = f'مساء الخير، {first_name}!'
        else:
            greeting = f'Good evening, {first_name}!'
            greeting_ar = f'مساء الخير، {first_name}!'

        # Yesterday's notifications
        yesterday_start = datetime.combine(yesterday, datetime.min.time())
        yesterday_end = datetime.combine(yesterday, datetime.max.time())

        yesterday_notifications = Notification.query.filter(
            Notification.user_id == user_id,
            Notification.created_at.between(yesterday_start, yesterday_end)
        ).all()

        yesterday_count = len(yesterday_notifications)
        yesterday_read = sum(1 for n in yesterday_notifications if n.is_read)

        # Today's unread
        today_unread = Notification.query.filter(
            Notification.user_id == user_id,
            Notification.is_read == False
        ).count()

        # Critical/urgent pending
        critical_pending = Notification.query.filter(
            Notification.user_id == user_id,
            Notification.is_read == False,
            Notification.priority.in_(['critical', 'urgent'])
        ).count()

        # Build summary based on role
        summary_parts = []
        summary_parts_ar = []

        if yesterday_count > 0:
            summary_parts.append(f'Yesterday you received {yesterday_count} notifications and read {yesterday_read}.')
            summary_parts_ar.append(f'أمس تلقيت {yesterday_count} إشعار وقرأت {yesterday_read}.')

        if today_unread > 0:
            summary_parts.append(f'You have {today_unread} unread notification(s) today.')
            summary_parts_ar.append(f'لديك {today_unread} إشعار(ات) غير مقروءة اليوم.')

        if critical_pending > 0:
            summary_parts.append(f'{critical_pending} require immediate attention!')
            summary_parts_ar.append(f'{critical_pending} تتطلب اهتمامًا فوريًا!')

        # Pending actions based on role
        pending_actions = []

        if user.role in ('inspector', ) or user.minor_role == 'inspector':
            # Check today's assignments
            today_assignments = InspectionAssignment.query.join(InspectionList).filter(
                or_(
                    InspectionAssignment.mechanical_inspector_id == user_id,
                    InspectionAssignment.electrical_inspector_id == user_id
                ),
                InspectionList.target_date == today,
                InspectionAssignment.status != 'completed'
            ).count()

            if today_assignments > 0:
                pending_actions.append({
                    'action': f'Complete {today_assignments} inspection assignment(s)',
                    'priority': 'high'
                })

        if user.role == 'specialist' or user.minor_role == 'specialist':
            in_progress_jobs = SpecialistJob.query.filter(
                SpecialistJob.specialist_id == user_id,
                SpecialistJob.status == 'in_progress'
            ).count()

            if in_progress_jobs > 0:
                pending_actions.append({
                    'action': f'Continue working on {in_progress_jobs} job(s)',
                    'priority': 'medium'
                })

        if user.role == 'engineer':
            pending_approvals = Leave.query.filter(
                Leave.status == 'pending'
            ).count()

            if pending_approvals > 0:
                pending_actions.append({
                    'action': f'Review {pending_approvals} pending leave request(s)',
                    'priority': 'medium'
                })

        # Get predictions
        predictions = NotificationAIService.predict_notifications(user_id)[:3]

        # Tips based on behavior
        tips = []
        smart_filters = NotificationAIService.get_smart_filters(user_id)

        if smart_filters.get('suggested_mute'):
            tips.append(f"Consider muting {smart_filters['suggested_mute'][0]} notifications - you rarely read them")

        optimal_time = NotificationAIService.get_optimal_delivery_time(user_id)
        if optimal_time.get('avg_response_time_hours') and optimal_time['avg_response_time_hours'] > 4:
            tips.append('Try checking notifications more frequently for faster response times')

        return {
            'greeting': greeting,
            'greeting_ar': greeting_ar,
            'summary': ' '.join(summary_parts) if summary_parts else 'No activity yesterday.',
            'summary_ar': ' '.join(summary_parts_ar) if summary_parts_ar else 'لا يوجد نشاط بالأمس.',
            'stats': {
                'yesterday_received': yesterday_count,
                'yesterday_read': yesterday_read,
                'today_unread': today_unread,
                'critical_pending': critical_pending
            },
            'pending_actions': pending_actions,
            'predictions': predictions,
            'tips': tips,
            'generated_at': now.isoformat()
        }

    # ========================================
    # 13. AUTO-CATEGORIZATION
    # ========================================

    @staticmethod
    def categorize_notification(notification: dict) -> str:
        """
        Auto-categorize uncategorized notifications.

        Args:
            notification: Notification dict

        Returns:
            Category string
        """
        notif_type = notification.get('type', '').lower()
        title = notification.get('title', '').lower()
        message = notification.get('message', '').lower()

        # First check by type
        for category, types in NotificationAIService.TYPE_CATEGORIES.items():
            for t in types:
                if t.lower() in notif_type:
                    return category

        # Then check by keywords in title/message
        all_text = f"{title} {message}"

        keyword_categories = {
            'equipment': ['equipment', 'machine', 'crane', 'pump', 'motor', 'device'],
            'inspection': ['inspection', 'inspect', 'check', 'audit'],
            'defect': ['defect', 'issue', 'problem', 'fault', 'damage'],
            'job': ['job', 'task', 'work', 'assignment'],
            'leave': ['leave', 'vacation', 'absence', 'time off'],
            'quality': ['quality', 'review', 'qc', 'qa'],
            'work_plan': ['work plan', 'schedule', 'planning'],
            'system': ['system', 'maintenance', 'update', 'announcement']
        }

        for category, keywords in keyword_categories.items():
            for keyword in keywords:
                if keyword in all_text:
                    return category

        return 'general'

    # ========================================
    # 14. SMART SNOOZE SUGGESTION
    # ========================================

    @staticmethod
    def suggest_snooze_duration(notification: dict, user_id: int) -> dict:
        """
        Suggest snooze duration based on patterns.

        Args:
            notification: Notification dict
            user_id: User ID

        Returns:
            Dict with suggested snooze duration and reason
        """
        notif_type = notification.get('type', '')
        priority = notification.get('priority', 'info')

        # Don't suggest snoozing critical/urgent
        if priority in ('critical', 'urgent'):
            return {
                'suggested_hours': 0,
                'reason': 'Critical and urgent notifications should not be snoozed',
                'allow_snooze': False
            }

        now = datetime.utcnow()
        hour = now.hour

        # Get user's typical response patterns
        optimal_time = NotificationAIService.get_optimal_delivery_time(user_id, priority)
        optimal_hour = optimal_time.get('optimal_hour', 9)

        # Calculate hours until optimal time
        if hour < optimal_hour:
            hours_until_optimal = optimal_hour - hour
        else:
            hours_until_optimal = (24 - hour) + optimal_hour

        # Type-specific suggestions
        if 'leave' in notif_type:
            return {
                'suggested_hours': min(hours_until_optimal, 4),
                'reason': 'Leave requests can typically wait a few hours',
                'allow_snooze': True
            }

        if 'info' == priority:
            return {
                'suggested_hours': min(hours_until_optimal, 8),
                'reason': 'Low priority - snooze until you have time',
                'allow_snooze': True
            }

        if 'warning' == priority:
            return {
                'suggested_hours': min(hours_until_optimal, 2),
                'reason': 'Warning priority - review within a couple hours',
                'allow_snooze': True
            }

        # Default suggestion
        return {
            'suggested_hours': 1,
            'reason': 'Default snooze duration',
            'allow_snooze': True
        }

    # ========================================
    # 15. SENTIMENT ANALYSIS
    # ========================================

    @staticmethod
    def analyze_sentiment(message: str) -> dict:
        """
        Detect urgency/sentiment in notification text.

        Args:
            message: Notification message text

        Returns:
            Dict with urgency, sentiment, and keywords found
        """
        if not message:
            return {
                'urgency': 'unknown',
                'sentiment': 'neutral',
                'keywords': []
            }

        message_lower = message.lower()

        # Detect urgency
        urgency = 'low'
        urgency_keywords_found = []

        for level, keywords in NotificationAIService.URGENCY_KEYWORDS.items():
            for keyword in keywords:
                if keyword in message_lower:
                    urgency_keywords_found.append(keyword)
                    if level == 'high':
                        urgency = 'high'
                    elif level == 'medium' and urgency != 'high':
                        urgency = 'medium'

        # Detect sentiment
        negative_count = sum(1 for kw in NotificationAIService.NEGATIVE_KEYWORDS if kw in message_lower)
        positive_count = sum(1 for kw in NotificationAIService.POSITIVE_KEYWORDS if kw in message_lower)

        if negative_count > positive_count:
            sentiment = 'negative'
        elif positive_count > negative_count:
            sentiment = 'positive'
        else:
            sentiment = 'neutral'

        # Collect all found keywords
        all_keywords = urgency_keywords_found
        for kw in NotificationAIService.NEGATIVE_KEYWORDS:
            if kw in message_lower and kw not in all_keywords:
                all_keywords.append(kw)
        for kw in NotificationAIService.POSITIVE_KEYWORDS:
            if kw in message_lower and kw not in all_keywords:
                all_keywords.append(kw)

        return {
            'urgency': urgency,
            'sentiment': sentiment,
            'keywords': all_keywords[:10]
        }

    # ========================================
    # HELPER METHODS
    # ========================================

    @staticmethod
    def _get_user_interaction_stats(user_id: int) -> dict:
        """Get user's notification interaction statistics by type."""
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)

        notifications = Notification.query.filter(
            Notification.user_id == user_id,
            Notification.created_at >= thirty_days_ago
        ).all()

        stats = defaultdict(lambda: {'total': 0, 'read': 0, 'action_rate': 0.5})

        for notif in notifications:
            stats[notif.type]['total'] += 1
            if notif.is_read:
                stats[notif.type]['read'] += 1

        for notif_type, data in stats.items():
            if data['total'] > 0:
                data['action_rate'] = data['read'] / data['total']

        return dict(stats)

    @staticmethod
    def _get_user_active_assignments(user_id: int) -> dict:
        """Get user's currently active assignments."""
        user = db.session.get(User, user_id)
        if not user:
            return {}

        assignments = {'equipment': set(), 'inspection': set(), 'defect': set(), 'job': set()}

        # Equipment assignments
        if user.role in ('inspector', 'engineer') or user.minor_role == 'inspector':
            inspection_assignments = InspectionAssignment.query.filter(
                or_(
                    InspectionAssignment.mechanical_inspector_id == user_id,
                    InspectionAssignment.electrical_inspector_id == user_id
                )
            ).all()

            for a in inspection_assignments:
                if a.equipment_id:
                    assignments['equipment'].add(a.equipment_id)

        # Job assignments
        if user.role == 'specialist' or user.minor_role == 'specialist':
            jobs = SpecialistJob.query.filter(
                SpecialistJob.specialist_id == user_id,
                SpecialistJob.status.in_(['in_progress', 'paused'])
            ).all()

            for j in jobs:
                assignments['job'].add(j.id)
                if j.equipment_id:
                    assignments['equipment'].add(j.equipment_id)

        return {k: v for k, v in assignments.items() if v}

    @staticmethod
    def _get_category_for_type(notif_type: str) -> Optional[str]:
        """Get category for a notification type."""
        for category, types in NotificationAIService.TYPE_CATEGORIES.items():
            for t in types:
                if t in notif_type or notif_type in t:
                    return category
        return None

    @staticmethod
    def _get_user_action_history(user_id: int, notif_type: str) -> dict:
        """Get user's historical action patterns for a notification type."""
        # Simplified implementation - would be enhanced with actual action tracking
        return {
            'approval_rate': 0.5,
            'avg_response_time_hours': 2.0
        }

    @staticmethod
    def _analyze_notification_time_patterns(user_id: int) -> dict:
        """Analyze when user typically receives/reads notifications."""
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)

        notifications = Notification.query.filter(
            Notification.user_id == user_id,
            Notification.created_at >= thirty_days_ago,
            Notification.is_read == True,
            Notification.read_at.isnot(None)
        ).all()

        if not notifications:
            return {}

        hour_counts = Counter()
        for notif in notifications:
            hour_counts[notif.read_at.hour] += 1

        if not hour_counts:
            return {}

        peak_hour = hour_counts.most_common(1)[0][0]
        total = sum(hour_counts.values())
        confidence = hour_counts[peak_hour] / total if total > 0 else 0

        return {
            'peak_hour': peak_hour,
            'confidence': round(confidence, 2)
        }

    @staticmethod
    def _calculate_text_similarity(text1: str, text2: str) -> float:
        """Calculate simple text similarity between two strings."""
        if not text1 or not text2:
            return 0.0

        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())

        intersection = words1.intersection(words2)
        union = words1.union(words2)

        if not union:
            return 0.0

        return len(intersection) / len(union)
