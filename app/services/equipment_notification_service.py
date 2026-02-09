"""
Equipment Notification Service for managing equipment-related notifications.
Handles status changes, high-risk alerts, anomaly detection, and watcher notifications.
"""

import logging
from datetime import datetime, date, timedelta
from app.models import (
    Equipment, User, Notification, EquipmentWatch, EquipmentCertification
)
from app.extensions import db
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)


class EquipmentNotificationService:
    """Service for managing equipment-related notifications."""

    @staticmethod
    def notify_status_change(equipment_id, old_status, new_status, user_id, reason=None):
        """
        Send notification to watchers when equipment status changes.

        Args:
            equipment_id: ID of equipment
            old_status: Previous status
            new_status: New status
            user_id: ID of user who made the change
            reason: Optional reason for the change

        Returns:
            List of created notifications
        """
        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            logger.warning(f"Equipment {equipment_id} not found for status notification")
            return []

        # Get watchers who want status change notifications
        watchers = EquipmentWatch.query.filter_by(
            equipment_id=equipment_id,
            notify_status_change=True
        ).all()

        if not watchers:
            return []

        # Determine notification priority based on new status
        priority = 'info'
        if new_status in ('stopped', 'out_of_service'):
            priority = 'warning'
        elif new_status == 'active' and old_status in ('stopped', 'out_of_service'):
            priority = 'info'  # Good news

        # Build notification message
        changed_by = db.session.get(User, user_id)
        changed_by_name = changed_by.full_name if changed_by else 'System'

        title = f"Equipment Status Changed: {equipment.name}"
        message = f"{equipment.name} status changed from '{old_status}' to '{new_status}' by {changed_by_name}."
        if reason:
            message += f" Reason: {reason}"

        # Create notifications for watchers (excluding the user who made the change)
        user_ids = [w.user_id for w in watchers if w.user_id != user_id]

        if not user_ids:
            return []

        notifications = NotificationService.create_bulk_notification(
            user_ids=user_ids,
            type='equipment_status_change',
            title=title,
            message=message,
            related_type='equipment',
            related_id=equipment_id,
            priority=priority,
            action_url=f'/equipment/{equipment_id}'
        )

        logger.info(f"Sent status change notifications for equipment {equipment_id} to {len(user_ids)} watchers")
        return notifications

    @staticmethod
    def notify_high_risk(equipment_id, risk_score, risk_level):
        """
        Alert watchers when equipment becomes high risk.

        Args:
            equipment_id: ID of equipment
            risk_score: Current risk score (0-100)
            risk_level: Risk level (low, medium, high, critical)

        Returns:
            List of created notifications
        """
        if risk_level not in ('high', 'critical'):
            return []

        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            return []

        # Get watchers who want high risk notifications
        watchers = EquipmentWatch.query.filter_by(
            equipment_id=equipment_id,
            notify_high_risk=True
        ).all()

        if not watchers:
            return []

        # Determine priority
        priority = 'urgent' if risk_level == 'critical' else 'warning'

        title = f"High Risk Alert: {equipment.name}"
        message = f"{equipment.name} has reached {risk_level.upper()} risk level with a score of {risk_score:.1f}. Immediate attention may be required."

        user_ids = [w.user_id for w in watchers]

        notifications = NotificationService.create_bulk_notification(
            user_ids=user_ids,
            type='equipment_high_risk',
            title=title,
            message=message,
            related_type='equipment',
            related_id=equipment_id,
            priority=priority,
            is_persistent=risk_level == 'critical',
            action_url=f'/equipment/{equipment_id}'
        )

        logger.info(f"Sent high risk notifications for equipment {equipment_id} to {len(user_ids)} watchers")
        return notifications

    @staticmethod
    def notify_anomaly(equipment_id, anomaly_type, anomaly_data, severity='medium'):
        """
        Alert watchers on anomaly detection.

        Args:
            equipment_id: ID of equipment
            anomaly_type: Type of anomaly (e.g., 'defect_spike', 'downtime_pattern', 'cost_surge')
            anomaly_data: Dictionary with anomaly details
            severity: low, medium, high

        Returns:
            List of created notifications
        """
        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            return []

        # Get watchers who want anomaly notifications
        watchers = EquipmentWatch.query.filter_by(
            equipment_id=equipment_id,
            notify_anomaly=True
        ).all()

        if not watchers:
            return []

        # Build message based on anomaly type
        anomaly_messages = {
            'defect_spike': f"Unusual increase in defects detected for {equipment.name}.",
            'downtime_pattern': f"Recurring downtime pattern detected for {equipment.name}.",
            'cost_surge': f"Unexpected cost increase detected for {equipment.name}.",
            'inspection_overdue': f"Inspection is overdue for {equipment.name}.",
            'maintenance_pattern': f"Abnormal maintenance pattern detected for {equipment.name}.",
        }

        title = f"Anomaly Detected: {equipment.name}"
        message = anomaly_messages.get(anomaly_type, f"Anomaly detected for {equipment.name}.")

        if anomaly_data and isinstance(anomaly_data, dict):
            details = anomaly_data.get('details')
            if details:
                message += f" Details: {details}"

        priority_map = {'low': 'info', 'medium': 'warning', 'high': 'urgent'}
        priority = priority_map.get(severity, 'warning')

        user_ids = [w.user_id for w in watchers]

        notifications = NotificationService.create_bulk_notification(
            user_ids=user_ids,
            type='equipment_anomaly',
            title=title,
            message=message,
            related_type='equipment',
            related_id=equipment_id,
            priority=priority,
            action_url=f'/equipment/{equipment_id}'
        )

        logger.info(f"Sent anomaly notifications for equipment {equipment_id} to {len(user_ids)} watchers")
        return notifications

    @staticmethod
    def notify_certification_expiring(days_threshold=30):
        """
        Send notifications for certifications expiring within the threshold.

        Args:
            days_threshold: Number of days before expiry to send notification

        Returns:
            List of created notifications
        """
        threshold_date = date.today() + timedelta(days=days_threshold)

        expiring_certs = EquipmentCertification.query.filter(
            EquipmentCertification.expiry_date <= threshold_date,
            EquipmentCertification.expiry_date >= date.today(),
            EquipmentCertification.status.in_(['active', 'pending_renewal']),
            db.or_(
                EquipmentCertification.last_notified_at.is_(None),
                EquipmentCertification.last_notified_at < datetime.utcnow() - timedelta(days=7)  # Don't spam
            )
        ).all()

        all_notifications = []

        for cert in expiring_certs:
            equipment = cert.equipment
            if not equipment:
                continue

            # Get watchers who want maintenance notifications (certification falls under maintenance)
            watchers = EquipmentWatch.query.filter_by(
                equipment_id=equipment.id,
                notify_maintenance=True
            ).all()

            if not watchers:
                continue

            days_left = cert.days_until_expiry
            priority = 'urgent' if days_left <= 7 else 'warning'

            title = f"Certification Expiring: {cert.name}"
            message = f"Certification '{cert.name}' for {equipment.name} expires in {days_left} days ({cert.expiry_date.isoformat()})."

            user_ids = [w.user_id for w in watchers]

            notifications = NotificationService.create_bulk_notification(
                user_ids=user_ids,
                type='certification_expiring',
                title=title,
                message=message,
                related_type='equipment',
                related_id=equipment.id,
                priority=priority,
                action_url=f'/equipment/{equipment.id}'
            )

            # Update last notified timestamp
            cert.last_notified_at = datetime.utcnow()
            all_notifications.extend(notifications)

        if all_notifications:
            db.session.commit()

        logger.info(f"Sent {len(all_notifications)} certification expiry notifications")
        return all_notifications

    @staticmethod
    def get_watchers(equipment_id):
        """
        Get users watching specific equipment.

        Args:
            equipment_id: ID of equipment

        Returns:
            List of EquipmentWatch objects
        """
        return EquipmentWatch.query.filter_by(equipment_id=equipment_id).all()

    @staticmethod
    def add_watcher(equipment_id, user_id, preferences=None):
        """
        Subscribe user to equipment notifications.

        Args:
            equipment_id: ID of equipment
            user_id: ID of user
            preferences: Dictionary with notification preferences

        Returns:
            Created EquipmentWatch object
        """
        # Check if already watching
        existing = EquipmentWatch.query.filter_by(
            equipment_id=equipment_id,
            user_id=user_id
        ).first()

        if existing:
            # Update preferences if provided
            if preferences:
                if 'notify_status_change' in preferences:
                    existing.notify_status_change = preferences['notify_status_change']
                if 'notify_high_risk' in preferences:
                    existing.notify_high_risk = preferences['notify_high_risk']
                if 'notify_anomaly' in preferences:
                    existing.notify_anomaly = preferences['notify_anomaly']
                if 'notify_maintenance' in preferences:
                    existing.notify_maintenance = preferences['notify_maintenance']
                db.session.commit()
            return existing

        # Create new watch
        watch = EquipmentWatch(
            equipment_id=equipment_id,
            user_id=user_id,
            notify_status_change=preferences.get('notify_status_change', True) if preferences else True,
            notify_high_risk=preferences.get('notify_high_risk', True) if preferences else True,
            notify_anomaly=preferences.get('notify_anomaly', True) if preferences else True,
            notify_maintenance=preferences.get('notify_maintenance', True) if preferences else True,
        )

        db.session.add(watch)
        db.session.commit()

        logger.info(f"User {user_id} is now watching equipment {equipment_id}")
        return watch

    @staticmethod
    def remove_watcher(equipment_id, user_id):
        """
        Unsubscribe user from equipment notifications.

        Args:
            equipment_id: ID of equipment
            user_id: ID of user

        Returns:
            True if removed, False if not found
        """
        watch = EquipmentWatch.query.filter_by(
            equipment_id=equipment_id,
            user_id=user_id
        ).first()

        if not watch:
            return False

        db.session.delete(watch)
        db.session.commit()

        logger.info(f"User {user_id} stopped watching equipment {equipment_id}")
        return True

    @staticmethod
    def is_watching(equipment_id, user_id):
        """
        Check if user is watching equipment.

        Args:
            equipment_id: ID of equipment
            user_id: ID of user

        Returns:
            EquipmentWatch object if watching, None otherwise
        """
        return EquipmentWatch.query.filter_by(
            equipment_id=equipment_id,
            user_id=user_id
        ).first()

    @staticmethod
    def get_user_watched_equipment(user_id):
        """
        Get all equipment being watched by a user.

        Args:
            user_id: ID of user

        Returns:
            List of EquipmentWatch objects
        """
        return EquipmentWatch.query.filter_by(user_id=user_id).all()
