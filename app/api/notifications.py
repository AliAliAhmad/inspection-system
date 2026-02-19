"""
Notification endpoints.
Enhanced with preferences, snooze, scheduling, AI, analytics, escalation, and more.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Notification
from app.services.notification_service import NotificationService
from app.utils.pagination import paginate
from app.utils.decorators import get_language, admin_required
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from app.extensions import db
from datetime import datetime, timedelta
import logging

bp = Blueprint('notifications', __name__)
logger = logging.getLogger(__name__)


# =============================================================================
# Basic Notification Endpoints (existing)
# =============================================================================

@bp.route('', methods=['GET'])
@jwt_required()
def get_notifications():
    """
    Get user's notifications.

    Query Parameters:
        unread_only: true/false (default: false)
        priority: filter by priority level
        type: filter by notification type

    Returns:
        {
            "status": "success",
            "unread_count": 5,
            "notifications": [...]
        }
    """
    current_user_id = get_jwt_identity()
    unread_only = request.args.get('unread_only', 'false').lower() == 'true'
    priority = request.args.get('priority')
    notification_type = request.args.get('type')

    query = Notification.query.filter_by(user_id=int(current_user_id))
    if unread_only:
        query = query.filter_by(is_read=False)
    if priority:
        query = query.filter_by(priority=priority)
    if notification_type:
        query = query.filter_by(type=notification_type)
    query = query.order_by(Notification.created_at.desc())

    items, pagination_meta = paginate(query)
    unread_count = NotificationService.get_unread_count(int(current_user_id))
    lang = get_language()

    return jsonify({
        'status': 'success',
        'unread_count': unread_count,
        'data': [n.to_dict(language=lang) for n in items],
        'pagination': pagination_meta
    }), 200


@bp.route('/unread-count', methods=['GET'])
@jwt_required()
def get_unread_count():
    """
    Get count of unread notifications for current user.

    Returns:
        {
            "status": "success",
            "count": 5
        }
    """
    current_user_id = get_jwt_identity()
    unread_count = NotificationService.get_unread_count(int(current_user_id))

    # Also get unread counts by priority for stat cards
    by_priority = {}
    for priority in ['critical', 'urgent', 'warning', 'info']:
        by_priority[priority] = Notification.query.filter_by(
            user_id=int(current_user_id),
            is_read=False,
            priority=priority
        ).count()

    return jsonify({
        'status': 'success',
        'count': unread_count,
        'by_priority': by_priority,
    }), 200


@bp.route('/<int:notification_id>/read', methods=['POST'])
@jwt_required()
def mark_notification_read(notification_id):
    """
    Mark notification as read.

    Returns:
        {
            "status": "success",
            "notification": {...}
        }
    """
    current_user_id = get_jwt_identity()

    notification = NotificationService.mark_as_read(
        notification_id=notification_id,
        user_id=current_user_id
    )

    return jsonify({
        'status': 'success',
        'message': 'Notification marked as read',
        'notification': notification.to_dict()
    }), 200


@bp.route('/read-all', methods=['POST'])
@jwt_required()
def mark_all_read():
    """
    Mark all notifications as read.

    Returns:
        {
            "status": "success",
            "count": 5
        }
    """
    current_user_id = get_jwt_identity()

    count = NotificationService.mark_all_as_read(current_user_id)

    return jsonify({
        'status': 'success',
        'message': f'{count} notifications marked as read',
        'count': count
    }), 200


@bp.route('/<int:notification_id>', methods=['DELETE'])
@jwt_required()
def delete_notification(notification_id):
    """
    Delete notification.

    Returns:
        {
            "status": "success",
            "message": "Notification deleted"
        }
    """
    current_user_id = get_jwt_identity()

    NotificationService.delete_notification(
        notification_id=notification_id,
        user_id=current_user_id
    )

    return jsonify({
        'status': 'success',
        'message': 'Notification deleted'
    }), 200


# =============================================================================
# Preferences Management
# =============================================================================

@bp.route('/preferences', methods=['GET'])
@jwt_required()
def get_preferences():
    """
    Get user's notification preferences.

    Returns:
        {
            "status": "success",
            "preferences": {
                "inspection_assigned": { "push": true, "email": true, "sms": false },
                "defect_reported": { "push": true, "email": false, "sms": false },
                ...
            }
        }
    """
    current_user_id = get_jwt_identity()
    preferences = NotificationService.get_user_preferences(int(current_user_id))

    return jsonify({
        'status': 'success',
        'preferences': preferences
    }), 200


@bp.route('/preferences', methods=['POST'])
@jwt_required()
def update_preferences_bulk():
    """
    Update notification preferences (bulk).

    Request Body:
        {
            "preferences": {
                "inspection_assigned": { "push": true, "email": true, "sms": false },
                "defect_reported": { "push": true, "email": false, "sms": false }
            }
        }

    Returns:
        {
            "status": "success",
            "message": "Preferences updated"
        }
    """
    current_user_id = get_jwt_identity()
    data = request.get_json()

    if not data or 'preferences' not in data:
        raise ValidationError("Preferences data is required")

    NotificationService.update_user_preferences(int(current_user_id), data['preferences'])

    return jsonify({
        'status': 'success',
        'message': 'Preferences updated'
    }), 200


@bp.route('/preferences/<notification_type>', methods=['PUT'])
@jwt_required()
def update_single_preference(notification_type):
    """
    Update a single notification type preference.

    Request Body:
        { "push": true, "email": true, "sms": false }

    Returns:
        {
            "status": "success",
            "message": "Preference updated"
        }
    """
    current_user_id = get_jwt_identity()
    data = request.get_json()

    if not data:
        raise ValidationError("Preference data is required")

    NotificationService.update_single_preference(
        int(current_user_id),
        notification_type,
        data
    )

    return jsonify({
        'status': 'success',
        'message': f'Preference for {notification_type} updated'
    }), 200


# =============================================================================
# Snooze & Schedule
# =============================================================================

@bp.route('/<int:notification_id>/snooze', methods=['POST'])
@jwt_required()
def snooze_notification(notification_id):
    """
    Snooze a notification.

    Request Body:
        { "duration_hours": 4 }
        OR
        { "until": "2026-02-10T09:00:00" }

    Returns:
        {
            "status": "success",
            "snoozed_until": "2026-02-10T09:00:00"
        }
    """
    current_user_id = get_jwt_identity()
    data = request.get_json()

    if not data:
        raise ValidationError("Snooze data is required")

    duration_hours = data.get('duration_hours')
    until = data.get('until')

    if duration_hours:
        snooze_until = datetime.utcnow() + timedelta(hours=int(duration_hours))
    elif until:
        try:
            snooze_until = datetime.fromisoformat(until.replace('Z', '+00:00'))
        except ValueError:
            raise ValidationError("Invalid datetime format for 'until'")
    else:
        raise ValidationError("Either 'duration_hours' or 'until' is required")

    notification = NotificationService.snooze_notification(
        notification_id=notification_id,
        user_id=int(current_user_id),
        snooze_until=snooze_until
    )

    return jsonify({
        'status': 'success',
        'message': 'Notification snoozed',
        'snoozed_until': snooze_until.isoformat()
    }), 200


@bp.route('/<int:notification_id>/snooze', methods=['DELETE'])
@jwt_required()
def cancel_snooze(notification_id):
    """
    Cancel snooze for a notification.

    Returns:
        {
            "status": "success",
            "message": "Snooze cancelled"
        }
    """
    current_user_id = get_jwt_identity()

    NotificationService.cancel_snooze(
        notification_id=notification_id,
        user_id=int(current_user_id)
    )

    return jsonify({
        'status': 'success',
        'message': 'Snooze cancelled'
    }), 200


@bp.route('/<int:notification_id>/schedule', methods=['POST'])
@jwt_required()
def schedule_notification(notification_id):
    """
    Schedule notification delivery.

    Request Body:
        { "deliver_at": "2026-02-10T09:00:00" }

    Returns:
        {
            "status": "success",
            "scheduled_for": "2026-02-10T09:00:00"
        }
    """
    current_user_id = get_jwt_identity()
    data = request.get_json()

    if not data or 'deliver_at' not in data:
        raise ValidationError("'deliver_at' is required")

    try:
        deliver_at = datetime.fromisoformat(data['deliver_at'].replace('Z', '+00:00'))
    except ValueError:
        raise ValidationError("Invalid datetime format for 'deliver_at'")

    NotificationService.schedule_notification(
        notification_id=notification_id,
        user_id=int(current_user_id),
        deliver_at=deliver_at
    )

    return jsonify({
        'status': 'success',
        'message': 'Notification scheduled',
        'scheduled_for': deliver_at.isoformat()
    }), 200


# =============================================================================
# Acknowledgment
# =============================================================================

@bp.route('/<int:notification_id>/acknowledge', methods=['POST'])
@jwt_required()
def acknowledge_notification(notification_id):
    """
    Acknowledge a critical notification.
    Required for critical/urgent notifications before they can be dismissed.

    Returns:
        {
            "status": "success",
            "message": "Notification acknowledged"
        }
    """
    current_user_id = get_jwt_identity()

    notification = NotificationService.acknowledge_notification(
        notification_id=notification_id,
        user_id=int(current_user_id)
    )

    return jsonify({
        'status': 'success',
        'message': 'Notification acknowledged',
        'notification': notification.to_dict()
    }), 200


# =============================================================================
# Bulk Operations
# =============================================================================

@bp.route('/bulk/read', methods=['POST'])
@jwt_required()
def bulk_mark_read():
    """
    Mark multiple notifications as read.

    Request Body:
        { "notification_ids": [1, 2, 3] }

    Returns:
        {
            "status": "success",
            "count": 3
        }
    """
    current_user_id = get_jwt_identity()
    data = request.get_json()

    if not data or 'notification_ids' not in data:
        raise ValidationError("'notification_ids' is required")

    notification_ids = data['notification_ids']
    if not isinstance(notification_ids, list):
        raise ValidationError("'notification_ids' must be a list")

    count = NotificationService.bulk_mark_read(
        notification_ids=notification_ids,
        user_id=int(current_user_id)
    )

    return jsonify({
        'status': 'success',
        'message': f'{count} notifications marked as read',
        'count': count
    }), 200


@bp.route('/bulk/delete', methods=['POST'])
@jwt_required()
def bulk_delete():
    """
    Delete multiple notifications.

    Request Body:
        { "notification_ids": [1, 2, 3] }

    Returns:
        {
            "status": "success",
            "count": 3
        }
    """
    current_user_id = get_jwt_identity()
    data = request.get_json()

    if not data or 'notification_ids' not in data:
        raise ValidationError("'notification_ids' is required")

    notification_ids = data['notification_ids']
    if not isinstance(notification_ids, list):
        raise ValidationError("'notification_ids' must be a list")

    count = NotificationService.bulk_delete(
        notification_ids=notification_ids,
        user_id=int(current_user_id)
    )

    return jsonify({
        'status': 'success',
        'message': f'{count} notifications deleted',
        'count': count
    }), 200


@bp.route('/bulk/snooze', methods=['POST'])
@jwt_required()
def bulk_snooze():
    """
    Snooze multiple notifications.

    Request Body:
        { "notification_ids": [1, 2, 3], "duration_hours": 4 }

    Returns:
        {
            "status": "success",
            "count": 3,
            "snoozed_until": "2026-02-10T09:00:00"
        }
    """
    current_user_id = get_jwt_identity()
    data = request.get_json()

    if not data or 'notification_ids' not in data:
        raise ValidationError("'notification_ids' is required")

    notification_ids = data['notification_ids']
    duration_hours = data.get('duration_hours', 4)

    if not isinstance(notification_ids, list):
        raise ValidationError("'notification_ids' must be a list")

    snooze_until = datetime.utcnow() + timedelta(hours=int(duration_hours))

    count = NotificationService.bulk_snooze(
        notification_ids=notification_ids,
        user_id=int(current_user_id),
        snooze_until=snooze_until
    )

    return jsonify({
        'status': 'success',
        'message': f'{count} notifications snoozed',
        'count': count,
        'snoozed_until': snooze_until.isoformat()
    }), 200


# =============================================================================
# Groups & Digest
# =============================================================================

@bp.route('/grouped', methods=['GET'])
@jwt_required()
def get_grouped_notifications():
    """
    Get notifications grouped by type or category.

    Query Parameters:
        group_by: type, priority, date (default: type)

    Returns:
        {
            "status": "success",
            "groups": [
                {
                    "id": "inspection_assigned",
                    "label": "Inspection Assignments",
                    "count": 5,
                    "unread_count": 3,
                    "latest": {...}
                }
            ]
        }
    """
    current_user_id = get_jwt_identity()
    group_by = request.args.get('group_by', 'type')

    groups = NotificationService.get_grouped_notifications(
        user_id=int(current_user_id),
        group_by=group_by
    )

    return jsonify({
        'status': 'success',
        'groups': groups
    }), 200


@bp.route('/groups/<group_id>/expand', methods=['POST'])
@jwt_required()
def expand_notification_group(group_id):
    """
    Expand a notification group to get all notifications in it.

    Returns:
        {
            "status": "success",
            "notifications": [...]
        }
    """
    current_user_id = get_jwt_identity()
    lang = get_language()

    notifications = NotificationService.expand_group(
        user_id=int(current_user_id),
        group_id=group_id
    )

    return jsonify({
        'status': 'success',
        'notifications': [n.to_dict(language=lang) for n in notifications]
    }), 200


@bp.route('/digest', methods=['GET'])
@jwt_required()
def get_digest():
    """
    Get a digest summary of notifications.

    Query Parameters:
        period: day, week, month (default: day)

    Returns:
        {
            "status": "success",
            "digest": {
                "period": "day",
                "total": 25,
                "unread": 10,
                "by_priority": { "critical": 2, "urgent": 5, "warning": 8, "info": 10 },
                "by_type": { "inspection_assigned": 5, ... },
                "highlights": [...]
            }
        }
    """
    current_user_id = get_jwt_identity()
    period = request.args.get('period', 'day')

    digest = NotificationService.get_digest(
        user_id=int(current_user_id),
        period=period
    )

    return jsonify({
        'status': 'success',
        'digest': digest
    }), 200


# =============================================================================
# AI Endpoints
# =============================================================================

@bp.route('/ai/ranked', methods=['GET'])
@jwt_required()
def get_ai_ranked_notifications():
    """
    Get AI-ranked notifications based on relevance and urgency.

    Returns:
        {
            "status": "success",
            "notifications": [...],
            "ranking_factors": {
                "priority_weight": 0.4,
                "recency_weight": 0.3,
                "relevance_weight": 0.3
            }
        }
    """
    current_user_id = get_jwt_identity()
    lang = get_language()

    result = NotificationService.get_ai_ranked_notifications(int(current_user_id))

    return jsonify({
        'status': 'success',
        'notifications': [n.to_dict(language=lang) for n in result['notifications']],
        'ranking_factors': result['ranking_factors']
    }), 200


@bp.route('/ai/summary', methods=['GET'])
@jwt_required()
def get_ai_summary():
    """
    Get AI-generated summary of unread notifications.

    Returns:
        {
            "status": "success",
            "summary": "You have 3 critical alerts requiring attention...",
            "action_items": [
                { "priority": "high", "action": "Review defect #123", "notification_id": 456 }
            ]
        }
    """
    current_user_id = get_jwt_identity()

    summary = NotificationService.get_ai_summary(int(current_user_id))

    return jsonify({
        'status': 'success',
        'summary': summary['text'],
        'action_items': summary['action_items']
    }), 200


@bp.route('/ai/predictions', methods=['GET'])
@jwt_required()
def get_ai_predictions():
    """
    Get predicted notifications based on patterns.

    Returns:
        {
            "status": "success",
            "predictions": [
                {
                    "type": "inspection_due",
                    "probability": 0.85,
                    "expected_time": "2026-02-10T14:00:00",
                    "context": "Equipment PM-001 is due for inspection"
                }
            ]
        }
    """
    current_user_id = get_jwt_identity()

    predictions = NotificationService.get_ai_predictions(int(current_user_id))

    return jsonify({
        'status': 'success',
        'predictions': predictions
    }), 200


@bp.route('/ai/smart-filters', methods=['GET'])
@jwt_required()
def get_smart_filters():
    """
    Get AI-suggested smart filters based on user behavior.

    Returns:
        {
            "status": "success",
            "filters": [
                {
                    "id": "high_priority_unread",
                    "label": "High Priority Unread",
                    "query": { "priority": ["critical", "urgent"], "is_read": false },
                    "count": 5
                }
            ]
        }
    """
    current_user_id = get_jwt_identity()

    filters = NotificationService.get_smart_filters(int(current_user_id))

    return jsonify({
        'status': 'success',
        'filters': filters
    }), 200


@bp.route('/ai/query', methods=['POST'])
@jwt_required()
def ai_natural_language_query():
    """
    Query notifications using natural language.

    Request Body:
        { "query": "show critical alerts from last week" }

    Returns:
        {
            "status": "success",
            "interpreted_query": { "priority": "critical", "date_range": "last_week" },
            "notifications": [...]
        }
    """
    current_user_id = get_jwt_identity()
    data = request.get_json()
    lang = get_language()

    if not data or 'query' not in data:
        raise ValidationError("'query' is required")

    result = NotificationService.ai_query(
        user_id=int(current_user_id),
        query=data['query']
    )

    return jsonify({
        'status': 'success',
        'interpreted_query': result['interpreted_query'],
        'notifications': [n.to_dict(language=lang) for n in result['notifications']]
    }), 200


@bp.route('/<int:notification_id>/ai/suggestions', methods=['GET'])
@jwt_required()
def get_ai_suggestions(notification_id):
    """
    Get AI-suggested actions for a notification.

    Returns:
        {
            "status": "success",
            "suggestions": [
                {
                    "action": "assign_to_specialist",
                    "label": "Assign to Specialist",
                    "confidence": 0.9,
                    "reason": "Based on defect severity and type"
                }
            ]
        }
    """
    current_user_id = get_jwt_identity()

    suggestions = NotificationService.get_ai_suggestions(
        notification_id=notification_id,
        user_id=int(current_user_id)
    )

    return jsonify({
        'status': 'success',
        'suggestions': suggestions
    }), 200


@bp.route('/<int:notification_id>/ai/impact', methods=['GET'])
@jwt_required()
def get_ai_impact(notification_id):
    """
    Get AI prediction of notification impact.

    Returns:
        {
            "status": "success",
            "impact": {
                "severity": "high",
                "affected_areas": ["production", "safety"],
                "estimated_resolution_time": "2 hours",
                "recommended_priority": "urgent"
            }
        }
    """
    current_user_id = get_jwt_identity()

    impact = NotificationService.get_ai_impact(
        notification_id=notification_id,
        user_id=int(current_user_id)
    )

    return jsonify({
        'status': 'success',
        'impact': impact
    }), 200


@bp.route('/ai/daily-summary', methods=['GET'])
@jwt_required()
def get_daily_summary():
    """
    Get personalized daily summary of notifications.

    Returns:
        {
            "status": "success",
            "summary": {
                "greeting": "Good morning, John!",
                "overview": "You have 5 new notifications since yesterday.",
                "priorities": [
                    { "level": "critical", "count": 1, "message": "1 critical issue needs your attention" }
                ],
                "trends": "Defect reports are 20% lower than last week.",
                "recommendations": ["Review pending inspections", "Check escalated items"]
            }
        }
    """
    current_user_id = get_jwt_identity()

    summary = NotificationService.get_daily_summary(int(current_user_id))

    return jsonify({
        'status': 'success',
        'summary': summary
    }), 200


# =============================================================================
# Analytics Endpoints
# =============================================================================

@bp.route('/analytics/dashboard', methods=['GET'])
@jwt_required()
def get_analytics_dashboard():
    """
    Get notification analytics dashboard data.

    Returns:
        {
            "status": "success",
            "dashboard": {
                "total_notifications": 1000,
                "read_rate": 0.85,
                "avg_response_time_minutes": 15,
                "by_priority": {...},
                "by_type": {...},
                "trends": {...}
            }
        }
    """
    current_user_id = get_jwt_identity()

    dashboard = NotificationService.get_analytics_dashboard(int(current_user_id))

    return jsonify({
        'status': 'success',
        'dashboard': dashboard
    }), 200


@bp.route('/analytics/response-times', methods=['GET'])
@jwt_required()
def get_response_time_analytics():
    """
    Get response time analytics.

    Query Parameters:
        period: day, week, month (default: week)

    Returns:
        {
            "status": "success",
            "analytics": {
                "average_minutes": 12,
                "median_minutes": 8,
                "by_priority": {...},
                "by_type": {...},
                "trend": [...]
            }
        }
    """
    current_user_id = get_jwt_identity()
    period = request.args.get('period', 'week')

    analytics = NotificationService.get_response_time_analytics(
        user_id=int(current_user_id),
        period=period
    )

    return jsonify({
        'status': 'success',
        'analytics': analytics
    }), 200


@bp.route('/analytics/engagement', methods=['GET'])
@jwt_required()
def get_engagement_metrics():
    """
    Get user engagement metrics.

    Returns:
        {
            "status": "success",
            "engagement": {
                "read_rate": 0.85,
                "action_rate": 0.6,
                "dismiss_rate": 0.1,
                "avg_time_to_read": 5,
                "most_engaged_types": [...]
            }
        }
    """
    current_user_id = get_jwt_identity()

    engagement = NotificationService.get_engagement_metrics(int(current_user_id))

    return jsonify({
        'status': 'success',
        'engagement': engagement
    }), 200


@bp.route('/analytics/effectiveness', methods=['GET'])
@jwt_required()
def get_notification_effectiveness():
    """
    Get notification effectiveness analytics.

    Returns:
        {
            "status": "success",
            "effectiveness": {
                "overall_score": 0.75,
                "by_type": {...},
                "recommendations": [...]
            }
        }
    """
    current_user_id = get_jwt_identity()

    effectiveness = NotificationService.get_effectiveness_analytics(int(current_user_id))

    return jsonify({
        'status': 'success',
        'effectiveness': effectiveness
    }), 200


@bp.route('/analytics/peak-hours', methods=['GET'])
@jwt_required()
def get_peak_hours():
    """
    Get peak hours analysis.

    Returns:
        {
            "status": "success",
            "peak_hours": {
                "most_active_hour": 10,
                "most_active_day": "Monday",
                "hourly_distribution": [...],
                "daily_distribution": [...]
            }
        }
    """
    current_user_id = get_jwt_identity()

    peak_hours = NotificationService.get_peak_hours_analytics(int(current_user_id))

    return jsonify({
        'status': 'success',
        'peak_hours': peak_hours
    }), 200


@bp.route('/analytics/escalations', methods=['GET'])
@jwt_required()
def get_escalation_report():
    """
    Get escalation report.

    Query Parameters:
        period: day, week, month (default: week)

    Returns:
        {
            "status": "success",
            "report": {
                "total_escalations": 15,
                "escalation_rate": 0.05,
                "by_type": {...},
                "by_reason": {...},
                "avg_time_to_escalate": 120
            }
        }
    """
    current_user_id = get_jwt_identity()
    period = request.args.get('period', 'week')

    report = NotificationService.get_escalation_report(
        user_id=int(current_user_id),
        period=period
    )

    return jsonify({
        'status': 'success',
        'report': report
    }), 200


@bp.route('/analytics/sla', methods=['GET'])
@jwt_required()
def get_sla_compliance():
    """
    Get SLA compliance analytics.

    Returns:
        {
            "status": "success",
            "sla": {
                "overall_compliance": 0.92,
                "by_priority": {...},
                "breaches": [...],
                "at_risk": [...]
            }
        }
    """
    current_user_id = get_jwt_identity()

    sla = NotificationService.get_sla_compliance(int(current_user_id))

    return jsonify({
        'status': 'success',
        'sla': sla
    }), 200


@bp.route('/analytics/load', methods=['GET'])
@jwt_required()
def get_load_distribution():
    """
    Get load distribution analytics.

    Returns:
        {
            "status": "success",
            "load": {
                "current_queue": 25,
                "processing_rate": 10,
                "backlog_trend": "decreasing",
                "estimated_clear_time": "2 hours"
            }
        }
    """
    current_user_id = get_jwt_identity()

    load = NotificationService.get_load_distribution(int(current_user_id))

    return jsonify({
        'status': 'success',
        'load': load
    }), 200


# =============================================================================
# Escalation Endpoints
# =============================================================================

@bp.route('/<int:notification_id>/escalate', methods=['POST'])
@jwt_required()
def escalate_notification(notification_id):
    """
    Manually escalate a notification.

    Request Body:
        {
            "reason": "No response after 2 hours",
            "escalate_to": "supervisor"  # optional
        }

    Returns:
        {
            "status": "success",
            "escalation": {...}
        }
    """
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}

    escalation = NotificationService.escalate_notification(
        notification_id=notification_id,
        user_id=int(current_user_id),
        reason=data.get('reason'),
        escalate_to=data.get('escalate_to')
    )

    return jsonify({
        'status': 'success',
        'message': 'Notification escalated',
        'escalation': escalation
    }), 200


@bp.route('/escalations', methods=['GET'])
@jwt_required()
def get_escalations():
    """
    Get escalation history.

    Query Parameters:
        status: pending, acknowledged, resolved
        period: day, week, month (default: week)

    Returns:
        {
            "status": "success",
            "escalations": [...]
        }
    """
    current_user_id = get_jwt_identity()
    status = request.args.get('status')
    period = request.args.get('period', 'week')

    escalations = NotificationService.get_escalations(
        user_id=int(current_user_id),
        status=status,
        period=period
    )

    return jsonify({
        'status': 'success',
        'escalations': escalations
    }), 200


@bp.route('/escalations/<int:escalation_id>/acknowledge', methods=['POST'])
@jwt_required()
def acknowledge_escalation(escalation_id):
    """
    Acknowledge an escalation.

    Returns:
        {
            "status": "success",
            "message": "Escalation acknowledged"
        }
    """
    current_user_id = get_jwt_identity()

    NotificationService.acknowledge_escalation(
        escalation_id=escalation_id,
        user_id=int(current_user_id)
    )

    return jsonify({
        'status': 'success',
        'message': 'Escalation acknowledged'
    }), 200


# =============================================================================
# Rules Management (Admin only)
# =============================================================================

@bp.route('/rules', methods=['GET'])
@jwt_required()
@admin_required()
def get_notification_rules():
    """
    List all notification rules.

    Returns:
        {
            "status": "success",
            "rules": [
                {
                    "id": 1,
                    "name": "Critical Alert Rule",
                    "conditions": {...},
                    "actions": {...},
                    "is_active": true
                }
            ]
        }
    """
    rules = NotificationService.get_rules()

    return jsonify({
        'status': 'success',
        'rules': rules
    }), 200


@bp.route('/rules', methods=['POST'])
@jwt_required()
@admin_required()
def create_notification_rule():
    """
    Create a notification rule.

    Request Body:
        {
            "name": "Critical Alert Rule",
            "conditions": {
                "priority": "critical",
                "type": ["defect_reported", "safety_alert"]
            },
            "actions": {
                "escalate_after_minutes": 30,
                "notify_roles": ["supervisor", "engineer"]
            }
        }

    Returns:
        {
            "status": "success",
            "rule": {...}
        }
    """
    data = request.get_json()

    if not data:
        raise ValidationError("Rule data is required")

    if not data.get('name'):
        raise ValidationError("Rule name is required")

    rule = NotificationService.create_rule(data)

    return jsonify({
        'status': 'success',
        'message': 'Rule created',
        'rule': rule
    }), 201


@bp.route('/rules/<int:rule_id>', methods=['PUT'])
@jwt_required()
@admin_required()
def update_notification_rule(rule_id):
    """
    Update a notification rule.

    Returns:
        {
            "status": "success",
            "rule": {...}
        }
    """
    data = request.get_json()

    if not data:
        raise ValidationError("Rule data is required")

    rule = NotificationService.update_rule(rule_id, data)

    return jsonify({
        'status': 'success',
        'message': 'Rule updated',
        'rule': rule
    }), 200


@bp.route('/rules/<int:rule_id>', methods=['DELETE'])
@jwt_required()
@admin_required()
def delete_notification_rule(rule_id):
    """
    Delete a notification rule.

    Returns:
        {
            "status": "success",
            "message": "Rule deleted"
        }
    """
    NotificationService.delete_rule(rule_id)

    return jsonify({
        'status': 'success',
        'message': 'Rule deleted'
    }), 200


@bp.route('/rules/<int:rule_id>/toggle', methods=['POST'])
@jwt_required()
@admin_required()
def toggle_notification_rule(rule_id):
    """
    Enable or disable a notification rule.

    Returns:
        {
            "status": "success",
            "is_active": true
        }
    """
    rule = NotificationService.toggle_rule(rule_id)

    return jsonify({
        'status': 'success',
        'message': f"Rule {'enabled' if rule['is_active'] else 'disabled'}",
        'is_active': rule['is_active']
    }), 200


# =============================================================================
# Templates Management (Admin only)
# =============================================================================

@bp.route('/templates', methods=['GET'])
@jwt_required()
@admin_required()
def get_notification_templates():
    """
    List notification templates.

    Returns:
        {
            "status": "success",
            "templates": [
                {
                    "type": "inspection_assigned",
                    "title_template": "New Inspection Assigned: {equipment_name}",
                    "message_template": "You have been assigned to inspect {equipment_name}...",
                    "channels": ["push", "email"]
                }
            ]
        }
    """
    templates = NotificationService.get_templates()

    return jsonify({
        'status': 'success',
        'templates': templates
    }), 200


@bp.route('/templates/<notification_type>', methods=['PUT'])
@jwt_required()
@admin_required()
def update_notification_template(notification_type):
    """
    Update a notification template.

    Request Body:
        {
            "title_template": "New Inspection Assigned: {equipment_name}",
            "message_template": "You have been assigned...",
            "title_template_ar": "...",
            "message_template_ar": "...",
            "channels": ["push", "email"]
        }

    Returns:
        {
            "status": "success",
            "template": {...}
        }
    """
    data = request.get_json()

    if not data:
        raise ValidationError("Template data is required")

    template = NotificationService.update_template(notification_type, data)

    return jsonify({
        'status': 'success',
        'message': 'Template updated',
        'template': template
    }), 200


# =============================================================================
# Archive
# =============================================================================

@bp.route('/<int:notification_id>/archive', methods=['POST'])
@jwt_required()
def archive_notification(notification_id):
    """
    Archive a notification.

    Returns:
        {
            "status": "success",
            "message": "Notification archived"
        }
    """
    current_user_id = get_jwt_identity()

    NotificationService.archive_notification(
        notification_id=notification_id,
        user_id=int(current_user_id)
    )

    return jsonify({
        'status': 'success',
        'message': 'Notification archived'
    }), 200


@bp.route('/archived', methods=['GET'])
@jwt_required()
def get_archived_notifications():
    """
    Get archived notifications.

    Returns:
        {
            "status": "success",
            "data": [...]
        }
    """
    current_user_id = get_jwt_identity()
    lang = get_language()

    notifications = NotificationService.get_archived_notifications(int(current_user_id))
    items, pagination_meta = paginate(notifications)

    return jsonify({
        'status': 'success',
        'data': [n.to_dict(language=lang) for n in items],
        'pagination': pagination_meta
    }), 200


@bp.route('/<int:notification_id>/unarchive', methods=['POST'])
@jwt_required()
def unarchive_notification(notification_id):
    """
    Restore notification from archive.

    Returns:
        {
            "status": "success",
            "message": "Notification restored"
        }
    """
    current_user_id = get_jwt_identity()

    NotificationService.unarchive_notification(
        notification_id=notification_id,
        user_id=int(current_user_id)
    )

    return jsonify({
        'status': 'success',
        'message': 'Notification restored from archive'
    }), 200


# =============================================================================
# Do Not Disturb
# =============================================================================

@bp.route('/dnd', methods=['GET'])
@jwt_required()
def get_dnd_status():
    """
    Get Do Not Disturb status.

    Returns:
        {
            "status": "success",
            "dnd": {
                "enabled": true,
                "until": "2026-02-10T09:00:00",
                "schedule": null
            }
        }
    """
    current_user_id = get_jwt_identity()

    dnd = NotificationService.get_dnd_status(int(current_user_id))

    return jsonify({
        'status': 'success',
        'dnd': dnd
    }), 200


@bp.route('/dnd', methods=['POST'])
@jwt_required()
def set_dnd():
    """
    Set Do Not Disturb.

    Request Body:
        { "enabled": true, "until": "2026-02-10T09:00:00" }
        OR
        { "schedule": { "start": "22:00", "end": "07:00" } }

    Returns:
        {
            "status": "success",
            "message": "DND enabled"
        }
    """
    current_user_id = get_jwt_identity()
    data = request.get_json()

    if not data:
        raise ValidationError("DND data is required")

    dnd = NotificationService.set_dnd(
        user_id=int(current_user_id),
        enabled=data.get('enabled', True),
        until=data.get('until'),
        schedule=data.get('schedule')
    )

    return jsonify({
        'status': 'success',
        'message': 'DND settings updated',
        'dnd': dnd
    }), 200


@bp.route('/dnd', methods=['DELETE'])
@jwt_required()
def clear_dnd():
    """
    Clear Do Not Disturb.

    Returns:
        {
            "status": "success",
            "message": "DND cleared"
        }
    """
    current_user_id = get_jwt_identity()

    NotificationService.clear_dnd(int(current_user_id))

    return jsonify({
        'status': 'success',
        'message': 'DND cleared'
    }), 200


# ==================== ROUTE ALIASES (frontend compatibility) ====================

@bp.route('/ai/prioritize', methods=['GET'])
@jwt_required()
def ai_prioritize_alias():
    """Alias for /ai/ranked - frontend uses /ai/prioritize."""
    current_user_id = get_jwt_identity()
    lang = get_language()

    result = NotificationService.get_ai_ranked_notifications(int(current_user_id))

    return jsonify({
        'status': 'success',
        'notifications': [n.to_dict(language=lang) for n in result['notifications']],
        'ranking_factors': result['ranking_factors']
    }), 200


@bp.route('/preferences/reset', methods=['POST'])
@jwt_required()
def reset_preferences():
    """Reset notification preferences to defaults."""
    from app.models import NotificationPreference
    current_user_id = int(get_jwt_identity())

    # Delete all custom preferences for user
    NotificationPreference.query.filter_by(user_id=current_user_id).delete()
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Notification preferences reset to defaults'
    }), 200
