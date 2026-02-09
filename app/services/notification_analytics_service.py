"""
Notification Analytics Service for reporting and metrics.
Provides comprehensive analytics for notification system performance.
"""

import logging
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Any
from collections import defaultdict
from sqlalchemy import func, and_, or_, case

from app.extensions import db
from app.models import Notification, User

logger = logging.getLogger(__name__)


class NotificationAnalyticsService:
    """
    Analytics service for notification system.

    Provides methods for:
    - Dashboard statistics
    - Response time analytics
    - User engagement metrics
    - Effectiveness reporting
    - Peak hours analysis
    - Escalation reporting
    - SLA compliance
    - Load distribution
    """

    # SLA targets (hours) by priority
    SLA_TARGETS = {
        'critical': 1,     # 1 hour
        'urgent': 4,       # 4 hours
        'warning': 24,     # 24 hours
        'info': 72         # 72 hours (3 days)
    }

    # ========================================
    # DASHBOARD STATS
    # ========================================

    @staticmethod
    def get_dashboard_stats(date_from: date = None, date_to: date = None) -> dict:
        """
        Get overall notification dashboard statistics.

        Args:
            date_from: Start date for filtering (optional)
            date_to: End date for filtering (optional)

        Returns:
            Dict containing comprehensive dashboard stats
        """
        now = datetime.utcnow()
        today = date.today()

        # Default date range: last 30 days
        if not date_from:
            date_from = today - timedelta(days=30)
        if not date_to:
            date_to = today

        date_from_dt = datetime.combine(date_from, datetime.min.time())
        date_to_dt = datetime.combine(date_to, datetime.max.time())

        # Base query for date range
        base_query = Notification.query.filter(
            Notification.created_at.between(date_from_dt, date_to_dt)
        )

        # Total counts
        total_sent = base_query.count()
        total_read = base_query.filter(Notification.is_read == True).count()
        total_unread = total_sent - total_read

        # Read rate
        read_rate = (total_read / total_sent * 100) if total_sent > 0 else 0

        # Average response time (time to read)
        read_notifications = base_query.filter(
            Notification.is_read == True,
            Notification.read_at.isnot(None)
        ).all()

        response_times = []
        for notif in read_notifications:
            if notif.read_at and notif.created_at:
                response_time = (notif.read_at - notif.created_at).total_seconds() / 3600  # hours
                response_times.append(response_time)

        avg_response_time = sum(response_times) / len(response_times) if response_times else None

        # By priority
        priority_stats = {}
        for priority in ['critical', 'urgent', 'warning', 'info']:
            priority_query = base_query.filter(Notification.priority == priority)
            count = priority_query.count()
            read = priority_query.filter(Notification.is_read == True).count()
            priority_stats[priority] = {
                'total': count,
                'read': read,
                'unread': count - read,
                'read_rate': round((read / count * 100) if count > 0 else 0, 1)
            }

        # By type (top 10)
        type_counts = db.session.query(
            Notification.type,
            func.count(Notification.id).label('count')
        ).filter(
            Notification.created_at.between(date_from_dt, date_to_dt)
        ).group_by(Notification.type).order_by(func.count(Notification.id).desc()).limit(10).all()

        by_type = {t: c for t, c in type_counts}

        # Daily trend
        daily_trend = db.session.query(
            func.date(Notification.created_at).label('date'),
            func.count(Notification.id).label('count')
        ).filter(
            Notification.created_at.between(date_from_dt, date_to_dt)
        ).group_by(func.date(Notification.created_at)).order_by(func.date(Notification.created_at)).all()

        daily_data = {str(d): c for d, c in daily_trend}

        # Today's stats
        today_start = datetime.combine(today, datetime.min.time())
        today_query = Notification.query.filter(Notification.created_at >= today_start)
        today_sent = today_query.count()
        today_critical = today_query.filter(Notification.priority == 'critical').count()

        # Active users (users who received notifications)
        active_users = db.session.query(
            func.count(func.distinct(Notification.user_id))
        ).filter(
            Notification.created_at.between(date_from_dt, date_to_dt)
        ).scalar() or 0

        return {
            'period': {
                'from': date_from.isoformat(),
                'to': date_to.isoformat()
            },
            'totals': {
                'sent': total_sent,
                'read': total_read,
                'unread': total_unread,
                'read_rate': round(read_rate, 1)
            },
            'avg_response_time_hours': round(avg_response_time, 2) if avg_response_time else None,
            'by_priority': priority_stats,
            'by_type': by_type,
            'daily_trend': daily_data,
            'today': {
                'sent': today_sent,
                'critical': today_critical
            },
            'active_users': active_users,
            'generated_at': now.isoformat()
        }

    # ========================================
    # RESPONSE TIME ANALYTICS
    # ========================================

    @staticmethod
    def get_response_time_analytics(user_id: int = None) -> dict:
        """
        Get response time analytics by type, priority, and optionally by user.

        Args:
            user_id: Optional user ID to filter by

        Returns:
            Dict containing response time analytics
        """
        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)

        # Base query
        query = Notification.query.filter(
            Notification.created_at >= thirty_days_ago,
            Notification.is_read == True,
            Notification.read_at.isnot(None)
        )

        if user_id:
            query = query.filter(Notification.user_id == user_id)

        notifications = query.all()

        if not notifications:
            return {
                'message': 'No read notifications found',
                'by_priority': {},
                'by_type': {},
                'overall': None
            }

        # Group by priority
        by_priority = defaultdict(list)
        by_type = defaultdict(list)
        all_times = []

        for notif in notifications:
            response_time = (notif.read_at - notif.created_at).total_seconds() / 3600  # hours
            by_priority[notif.priority].append(response_time)
            by_type[notif.type].append(response_time)
            all_times.append(response_time)

        # Calculate statistics for priority
        priority_stats = {}
        for priority, times in by_priority.items():
            priority_stats[priority] = {
                'count': len(times),
                'avg_hours': round(sum(times) / len(times), 2),
                'min_hours': round(min(times), 2),
                'max_hours': round(max(times), 2),
                'median_hours': round(sorted(times)[len(times) // 2], 2),
                'sla_target_hours': NotificationAnalyticsService.SLA_TARGETS.get(priority),
                'within_sla': sum(1 for t in times if t <= NotificationAnalyticsService.SLA_TARGETS.get(priority, 72)),
                'sla_compliance_rate': round(
                    sum(1 for t in times if t <= NotificationAnalyticsService.SLA_TARGETS.get(priority, 72)) / len(times) * 100, 1
                )
            }

        # Calculate statistics for type (top 10 by count)
        type_stats = {}
        sorted_types = sorted(by_type.items(), key=lambda x: len(x[1]), reverse=True)[:10]

        for notif_type, times in sorted_types:
            type_stats[notif_type] = {
                'count': len(times),
                'avg_hours': round(sum(times) / len(times), 2),
                'min_hours': round(min(times), 2),
                'max_hours': round(max(times), 2)
            }

        # Overall statistics
        overall_stats = {
            'total_notifications': len(all_times),
            'avg_hours': round(sum(all_times) / len(all_times), 2),
            'min_hours': round(min(all_times), 2),
            'max_hours': round(max(all_times), 2),
            'median_hours': round(sorted(all_times)[len(all_times) // 2], 2)
        }

        return {
            'period_days': 30,
            'by_priority': priority_stats,
            'by_type': type_stats,
            'overall': overall_stats,
            'user_id': user_id,
            'generated_at': now.isoformat()
        }

    # ========================================
    # USER ENGAGEMENT
    # ========================================

    @staticmethod
    def get_user_engagement(user_id: int) -> dict:
        """
        Get user's notification engagement metrics.

        Args:
            user_id: User ID

        Returns:
            Dict containing user engagement metrics
        """
        user = db.session.get(User, user_id)
        if not user:
            return {'error': 'User not found'}

        now = datetime.utcnow()
        today = date.today()
        thirty_days_ago = now - timedelta(days=30)
        seven_days_ago = now - timedelta(days=7)

        # Last 30 days notifications
        thirty_day_query = Notification.query.filter(
            Notification.user_id == user_id,
            Notification.created_at >= thirty_days_ago
        )

        total_30d = thirty_day_query.count()
        read_30d = thirty_day_query.filter(Notification.is_read == True).count()

        # Last 7 days
        seven_day_query = Notification.query.filter(
            Notification.user_id == user_id,
            Notification.created_at >= seven_days_ago
        )

        total_7d = seven_day_query.count()
        read_7d = seven_day_query.filter(Notification.is_read == True).count()

        # Current unread
        unread = Notification.query.filter(
            Notification.user_id == user_id,
            Notification.is_read == False
        ).count()

        # Unread by priority
        unread_by_priority = {}
        for priority in ['critical', 'urgent', 'warning', 'info']:
            count = Notification.query.filter(
                Notification.user_id == user_id,
                Notification.is_read == False,
                Notification.priority == priority
            ).count()
            unread_by_priority[priority] = count

        # Average response time
        read_notifications = thirty_day_query.filter(
            Notification.is_read == True,
            Notification.read_at.isnot(None)
        ).all()

        response_times = []
        for notif in read_notifications:
            if notif.read_at and notif.created_at:
                response_time = (notif.read_at - notif.created_at).total_seconds() / 3600
                response_times.append(response_time)

        avg_response_time = sum(response_times) / len(response_times) if response_times else None

        # Most engaged types
        type_engagement = db.session.query(
            Notification.type,
            func.count(Notification.id).label('total'),
            func.sum(case((Notification.is_read == True, 1), else_=0)).label('read')
        ).filter(
            Notification.user_id == user_id,
            Notification.created_at >= thirty_days_ago
        ).group_by(Notification.type).all()

        type_stats = []
        for notif_type, total, read in type_engagement:
            type_stats.append({
                'type': notif_type,
                'total': total,
                'read': read or 0,
                'read_rate': round((read or 0) / total * 100, 1) if total > 0 else 0
            })

        type_stats.sort(key=lambda x: x['read_rate'], reverse=True)

        # Peak activity hours
        hour_activity = db.session.query(
            func.extract('hour', Notification.read_at).label('hour'),
            func.count(Notification.id).label('count')
        ).filter(
            Notification.user_id == user_id,
            Notification.is_read == True,
            Notification.read_at.isnot(None),
            Notification.created_at >= thirty_days_ago
        ).group_by(func.extract('hour', Notification.read_at)).order_by(
            func.count(Notification.id).desc()
        ).limit(3).all()

        peak_hours = [{'hour': int(h), 'read_count': c} for h, c in hour_activity]

        # Engagement score (0-100)
        read_rate_30d = (read_30d / total_30d * 100) if total_30d > 0 else 0
        response_score = max(0, 100 - (avg_response_time or 0) * 10) if avg_response_time else 50

        engagement_score = (read_rate_30d * 0.6) + (response_score * 0.4)

        return {
            'user_id': user_id,
            'user_name': user.full_name,
            'engagement_score': round(engagement_score, 1),
            'last_30_days': {
                'received': total_30d,
                'read': read_30d,
                'read_rate': round(read_rate_30d, 1)
            },
            'last_7_days': {
                'received': total_7d,
                'read': read_7d,
                'read_rate': round((read_7d / total_7d * 100) if total_7d > 0 else 0, 1)
            },
            'current_unread': unread,
            'unread_by_priority': unread_by_priority,
            'avg_response_time_hours': round(avg_response_time, 2) if avg_response_time else None,
            'type_engagement': type_stats[:10],
            'peak_hours': peak_hours,
            'generated_at': now.isoformat()
        }

    # ========================================
    # EFFECTIVENESS REPORT
    # ========================================

    @staticmethod
    def get_effectiveness_report() -> dict:
        """
        Get report on which notifications lead to action.

        Returns:
            Dict containing notification effectiveness metrics
        """
        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)

        # Get all notifications from last 30 days
        notifications = Notification.query.filter(
            Notification.created_at >= thirty_days_ago
        ).all()

        if not notifications:
            return {
                'message': 'No notifications in the last 30 days',
                'effectiveness_by_type': {},
                'effectiveness_by_priority': {}
            }

        # Effectiveness by type
        type_effectiveness = defaultdict(lambda: {
            'total': 0,
            'read': 0,
            'with_action_url': 0,
            'persistent': 0
        })

        priority_effectiveness = defaultdict(lambda: {
            'total': 0,
            'read': 0,
            'read_within_1_hour': 0,
            'read_within_24_hours': 0
        })

        for notif in notifications:
            # By type
            type_effectiveness[notif.type]['total'] += 1
            if notif.is_read:
                type_effectiveness[notif.type]['read'] += 1
            if notif.action_url:
                type_effectiveness[notif.type]['with_action_url'] += 1
            if notif.is_persistent:
                type_effectiveness[notif.type]['persistent'] += 1

            # By priority
            priority_effectiveness[notif.priority]['total'] += 1
            if notif.is_read:
                priority_effectiveness[notif.priority]['read'] += 1
                if notif.read_at and notif.created_at:
                    response_hours = (notif.read_at - notif.created_at).total_seconds() / 3600
                    if response_hours <= 1:
                        priority_effectiveness[notif.priority]['read_within_1_hour'] += 1
                    if response_hours <= 24:
                        priority_effectiveness[notif.priority]['read_within_24_hours'] += 1

        # Calculate effectiveness metrics
        type_stats = {}
        for notif_type, stats in type_effectiveness.items():
            type_stats[notif_type] = {
                'total': stats['total'],
                'read_rate': round(stats['read'] / stats['total'] * 100, 1) if stats['total'] > 0 else 0,
                'action_url_rate': round(stats['with_action_url'] / stats['total'] * 100, 1) if stats['total'] > 0 else 0,
                'persistent_rate': round(stats['persistent'] / stats['total'] * 100, 1) if stats['total'] > 0 else 0
            }

        priority_stats = {}
        for priority, stats in priority_effectiveness.items():
            priority_stats[priority] = {
                'total': stats['total'],
                'read_rate': round(stats['read'] / stats['total'] * 100, 1) if stats['total'] > 0 else 0,
                'quick_response_rate': round(stats['read_within_1_hour'] / stats['total'] * 100, 1) if stats['total'] > 0 else 0,
                'same_day_response_rate': round(stats['read_within_24_hours'] / stats['total'] * 100, 1) if stats['total'] > 0 else 0
            }

        # Most effective types (by read rate)
        sorted_types = sorted(type_stats.items(), key=lambda x: x[1]['read_rate'], reverse=True)
        most_effective = dict(sorted_types[:5])
        least_effective = dict(sorted_types[-5:])

        # Overall effectiveness
        total = len(notifications)
        total_read = sum(1 for n in notifications if n.is_read)

        return {
            'period_days': 30,
            'total_notifications': total,
            'overall_read_rate': round(total_read / total * 100, 1) if total > 0 else 0,
            'effectiveness_by_type': type_stats,
            'effectiveness_by_priority': priority_stats,
            'most_effective_types': most_effective,
            'least_effective_types': least_effective,
            'recommendations': NotificationAnalyticsService._generate_effectiveness_recommendations(type_stats, priority_stats),
            'generated_at': now.isoformat()
        }

    # ========================================
    # PEAK HOURS
    # ========================================

    @staticmethod
    def get_peak_hours() -> dict:
        """
        Analyze when notifications are sent and read most frequently.

        Returns:
            Dict containing peak hours analysis
        """
        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)

        # Notifications sent by hour
        sent_by_hour = db.session.query(
            func.extract('hour', Notification.created_at).label('hour'),
            func.count(Notification.id).label('count')
        ).filter(
            Notification.created_at >= thirty_days_ago
        ).group_by(func.extract('hour', Notification.created_at)).all()

        # Notifications read by hour
        read_by_hour = db.session.query(
            func.extract('hour', Notification.read_at).label('hour'),
            func.count(Notification.id).label('count')
        ).filter(
            Notification.created_at >= thirty_days_ago,
            Notification.is_read == True,
            Notification.read_at.isnot(None)
        ).group_by(func.extract('hour', Notification.read_at)).all()

        # Sent by day of week
        sent_by_day = db.session.query(
            func.extract('dow', Notification.created_at).label('day'),
            func.count(Notification.id).label('count')
        ).filter(
            Notification.created_at >= thirty_days_ago
        ).group_by(func.extract('dow', Notification.created_at)).all()

        # Convert to dictionaries
        sent_hours = {int(h): c for h, c in sent_by_hour}
        read_hours = {int(h): c for h, c in read_by_hour}

        day_names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        sent_days = {day_names[int(d)]: c for d, c in sent_by_day}

        # Find peak hours
        peak_send_hour = max(sent_hours.items(), key=lambda x: x[1])[0] if sent_hours else None
        peak_read_hour = max(read_hours.items(), key=lambda x: x[1])[0] if read_hours else None
        peak_day = max(sent_days.items(), key=lambda x: x[1])[0] if sent_days else None

        # Calculate hourly distribution
        hourly_distribution = []
        for hour in range(24):
            hourly_distribution.append({
                'hour': hour,
                'sent': sent_hours.get(hour, 0),
                'read': read_hours.get(hour, 0)
            })

        return {
            'period_days': 30,
            'peak_send_hour': peak_send_hour,
            'peak_read_hour': peak_read_hour,
            'peak_day': peak_day,
            'hourly_distribution': hourly_distribution,
            'daily_distribution': sent_days,
            'insights': [
                f'Most notifications are sent at {peak_send_hour}:00' if peak_send_hour else None,
                f'Users are most active reading at {peak_read_hour}:00' if peak_read_hour else None,
                f'{peak_day} has the highest notification volume' if peak_day else None
            ],
            'generated_at': now.isoformat()
        }

    # ========================================
    # ESCALATION REPORT
    # ========================================

    @staticmethod
    def get_escalation_report() -> dict:
        """
        Get escalation frequency and resolution metrics.

        Returns:
            Dict containing escalation analytics
        """
        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)

        # Find escalation-related notifications
        escalation_notifications = Notification.query.filter(
            Notification.created_at >= thirty_days_ago,
            Notification.type.like('%escalat%')
        ).all()

        if not escalation_notifications:
            return {
                'message': 'No escalation notifications in the last 30 days',
                'total_escalations': 0,
                'by_related_type': {},
                'resolution_stats': {}
            }

        total = len(escalation_notifications)

        # Group by related type
        by_related_type = defaultdict(lambda: {'count': 0, 'read': 0})
        for notif in escalation_notifications:
            related_type = notif.related_type or 'unknown'
            by_related_type[related_type]['count'] += 1
            if notif.is_read:
                by_related_type[related_type]['read'] += 1

        related_type_stats = {}
        for related_type, stats in by_related_type.items():
            related_type_stats[related_type] = {
                'count': stats['count'],
                'read': stats['read'],
                'acknowledgment_rate': round(stats['read'] / stats['count'] * 100, 1) if stats['count'] > 0 else 0
            }

        # Response time for escalations
        read_escalations = [n for n in escalation_notifications if n.is_read and n.read_at]
        response_times = []
        for notif in read_escalations:
            response_time = (notif.read_at - notif.created_at).total_seconds() / 3600
            response_times.append(response_time)

        avg_response_time = sum(response_times) / len(response_times) if response_times else None

        # Repeated escalations (same related item)
        escalation_by_item = defaultdict(list)
        for notif in escalation_notifications:
            if notif.related_type and notif.related_id:
                key = f"{notif.related_type}:{notif.related_id}"
                escalation_by_item[key].append(notif)

        repeated_escalations = {
            key: len(items) for key, items in escalation_by_item.items() if len(items) > 1
        }

        # Daily trend
        daily_escalations = defaultdict(int)
        for notif in escalation_notifications:
            day = notif.created_at.date().isoformat()
            daily_escalations[day] += 1

        return {
            'period_days': 30,
            'total_escalations': total,
            'by_related_type': related_type_stats,
            'avg_response_time_hours': round(avg_response_time, 2) if avg_response_time else None,
            'acknowledgment_rate': round(len(read_escalations) / total * 100, 1) if total > 0 else 0,
            'repeated_escalations': repeated_escalations,
            'repeated_escalation_count': len(repeated_escalations),
            'daily_trend': dict(sorted(daily_escalations.items())),
            'generated_at': now.isoformat()
        }

    # ========================================
    # SLA COMPLIANCE
    # ========================================

    @staticmethod
    def get_sla_compliance() -> dict:
        """
        Get response time vs SLA targets.

        Returns:
            Dict containing SLA compliance metrics
        """
        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)

        compliance = {}

        for priority, target_hours in NotificationAnalyticsService.SLA_TARGETS.items():
            # Get notifications for this priority
            notifications = Notification.query.filter(
                Notification.created_at >= thirty_days_ago,
                Notification.priority == priority
            ).all()

            total = len(notifications)
            read = sum(1 for n in notifications if n.is_read)
            within_sla = 0
            breached_sla = 0
            pending = 0

            for notif in notifications:
                if not notif.is_read:
                    # Check if already breached SLA
                    hours_since_created = (now - notif.created_at).total_seconds() / 3600
                    if hours_since_created > target_hours:
                        breached_sla += 1
                    else:
                        pending += 1
                else:
                    # Check response time
                    if notif.read_at:
                        response_hours = (notif.read_at - notif.created_at).total_seconds() / 3600
                        if response_hours <= target_hours:
                            within_sla += 1
                        else:
                            breached_sla += 1

            compliance[priority] = {
                'sla_target_hours': target_hours,
                'total': total,
                'within_sla': within_sla,
                'breached_sla': breached_sla,
                'pending': pending,
                'compliance_rate': round(within_sla / (within_sla + breached_sla) * 100, 1) if (within_sla + breached_sla) > 0 else 100,
                'breach_rate': round(breached_sla / total * 100, 1) if total > 0 else 0
            }

        # Overall SLA compliance
        total_within = sum(c['within_sla'] for c in compliance.values())
        total_breached = sum(c['breached_sla'] for c in compliance.values())
        overall_compliance = round(total_within / (total_within + total_breached) * 100, 1) if (total_within + total_breached) > 0 else 100

        # Currently at risk (pending that will breach soon)
        at_risk_query = Notification.query.filter(
            Notification.is_read == False,
            Notification.priority == 'critical',
            Notification.created_at <= now - timedelta(minutes=30)
        ).count()

        return {
            'period_days': 30,
            'sla_targets': NotificationAnalyticsService.SLA_TARGETS,
            'by_priority': compliance,
            'overall_compliance_rate': overall_compliance,
            'at_risk_critical': at_risk_query,
            'recommendations': [
                'Focus on critical notifications - they have the tightest SLA',
                'Consider automation for urgent notifications',
                'Review processes for frequently breached SLAs'
            ],
            'generated_at': now.isoformat()
        }

    # ========================================
    # LOAD DISTRIBUTION
    # ========================================

    @staticmethod
    def get_load_distribution() -> dict:
        """
        Get notification load per user to identify who's overloaded.

        Returns:
            Dict containing load distribution analytics
        """
        now = datetime.utcnow()
        today = date.today()
        thirty_days_ago = now - timedelta(days=30)
        seven_days_ago = now - timedelta(days=7)

        # Get notification counts per user (last 30 days)
        user_loads = db.session.query(
            Notification.user_id,
            func.count(Notification.id).label('total'),
            func.sum(case((Notification.is_read == False, 1), else_=0)).label('unread'),
            func.sum(case((Notification.priority == 'critical', 1), else_=0)).label('critical'),
            func.sum(case((Notification.priority == 'urgent', 1), else_=0)).label('urgent')
        ).filter(
            Notification.created_at >= thirty_days_ago
        ).group_by(Notification.user_id).all()

        if not user_loads:
            return {
                'message': 'No notifications in the last 30 days',
                'users': [],
                'summary': {}
            }

        # Calculate statistics
        totals = [u.total for u in user_loads]
        avg_load = sum(totals) / len(totals) if totals else 0
        max_load = max(totals) if totals else 0
        min_load = min(totals) if totals else 0

        # Identify overloaded users (>2x average)
        overload_threshold = avg_load * 2

        user_details = []
        overloaded = []
        underloaded = []

        for user_load in user_loads:
            user = db.session.get(User, user_load.user_id)
            if not user:
                continue

            is_overloaded = user_load.total > overload_threshold
            is_underloaded = user_load.total < avg_load * 0.5

            user_info = {
                'user_id': user_load.user_id,
                'user_name': user.full_name,
                'role': user.role,
                'total_30d': user_load.total,
                'unread': user_load.unread or 0,
                'critical': user_load.critical or 0,
                'urgent': user_load.urgent or 0,
                'load_ratio': round(user_load.total / avg_load, 2) if avg_load > 0 else 0,
                'is_overloaded': is_overloaded,
                'is_underloaded': is_underloaded
            }

            user_details.append(user_info)

            if is_overloaded:
                overloaded.append(user_info)
            elif is_underloaded:
                underloaded.append(user_info)

        # Sort by total load descending
        user_details.sort(key=lambda x: x['total_30d'], reverse=True)
        overloaded.sort(key=lambda x: x['total_30d'], reverse=True)

        # Load by role
        role_loads = defaultdict(lambda: {'count': 0, 'total_notifications': 0})
        for user in user_details:
            role = user['role'] or 'unknown'
            role_loads[role]['count'] += 1
            role_loads[role]['total_notifications'] += user['total_30d']

        role_stats = {}
        for role, stats in role_loads.items():
            role_stats[role] = {
                'user_count': stats['count'],
                'total_notifications': stats['total_notifications'],
                'avg_per_user': round(stats['total_notifications'] / stats['count'], 1) if stats['count'] > 0 else 0
            }

        return {
            'period_days': 30,
            'summary': {
                'total_users': len(user_loads),
                'avg_load_per_user': round(avg_load, 1),
                'max_load': max_load,
                'min_load': min_load,
                'overloaded_users': len(overloaded),
                'underloaded_users': len(underloaded)
            },
            'by_role': role_stats,
            'overloaded_users': overloaded[:10],
            'underloaded_users': underloaded[:10],
            'all_users': user_details[:50],
            'recommendations': NotificationAnalyticsService._generate_load_recommendations(overloaded, avg_load),
            'generated_at': now.isoformat()
        }

    # ========================================
    # HELPER METHODS
    # ========================================

    @staticmethod
    def _generate_effectiveness_recommendations(type_stats: dict, priority_stats: dict) -> list:
        """Generate recommendations based on effectiveness metrics."""
        recommendations = []

        # Find low-performing types
        for notif_type, stats in type_stats.items():
            if stats['read_rate'] < 30 and stats['total'] >= 10:
                recommendations.append(
                    f"Consider revising '{notif_type}' notifications - only {stats['read_rate']}% are read"
                )

        # Check priority performance
        if priority_stats.get('critical', {}).get('quick_response_rate', 100) < 70:
            recommendations.append(
                "Critical notifications have low quick response rate - consider push notifications"
            )

        if not recommendations:
            recommendations.append("Notification effectiveness is within acceptable ranges")

        return recommendations[:5]

    @staticmethod
    def _generate_load_recommendations(overloaded: list, avg_load: float) -> list:
        """Generate recommendations based on load distribution."""
        recommendations = []

        if len(overloaded) > 0:
            recommendations.append(
                f"{len(overloaded)} user(s) have notification load more than 2x the average"
            )

            # Specific user recommendations
            for user in overloaded[:3]:
                recommendations.append(
                    f"Review notification settings for {user['user_name']} ({user['total_30d']} notifications)"
                )

        if avg_load > 100:
            recommendations.append(
                "High average notification volume - consider notification consolidation"
            )

        if not recommendations:
            recommendations.append("Notification load is evenly distributed")

        return recommendations[:5]
