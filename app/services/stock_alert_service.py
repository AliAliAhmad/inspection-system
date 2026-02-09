"""
StockAlertService - Handle stock alerts and notifications.
Monitors inventory levels, expiring batches, and reorder needs.
"""

from datetime import datetime, timedelta, date
from app.extensions import db
from app.models import Material, User
from app.models.stock_history import StockHistory
from app.models.material_batch import MaterialBatch
from app.models.stock_reservation import StockReservation
from app.models.material_vendor import MaterialVendor
from app.services.notification_service import NotificationService
from sqlalchemy import func, and_, or_
import logging

logger = logging.getLogger(__name__)


class StockAlertService:
    """Handle stock alerts and notifications"""

    @staticmethod
    def check_low_stock() -> list:
        """
        Check all materials for low stock and create alerts.
        Returns list of low stock materials with details.
        """
        low_stock_items = []

        materials = Material.query.filter_by(is_active=True).all()

        for material in materials:
            # Check if below minimum stock
            if material.current_stock <= material.min_stock:
                severity = 'critical' if material.current_stock == 0 else 'warning'

                # Get reserved quantity
                reserved = db.session.query(
                    func.sum(StockReservation.quantity)
                ).filter(
                    StockReservation.material_id == material.id,
                    StockReservation.status == 'active'
                ).scalar() or 0

                available = material.current_stock - reserved

                low_stock_items.append({
                    'material_id': material.id,
                    'code': material.code,
                    'name': material.name,
                    'category': material.category,
                    'current_stock': material.current_stock,
                    'min_stock': material.min_stock,
                    'reserved': reserved,
                    'available': available,
                    'unit': material.unit,
                    'severity': severity,
                    'stock_months': material.get_stock_months() if material.get_stock_months() != float('inf') else None
                })

            # Also check if stock months < 3 (3-month threshold)
            elif material.is_low_stock(threshold_months=3):
                stock_months = material.get_stock_months()
                if stock_months != float('inf'):
                    low_stock_items.append({
                        'material_id': material.id,
                        'code': material.code,
                        'name': material.name,
                        'category': material.category,
                        'current_stock': material.current_stock,
                        'min_stock': material.min_stock,
                        'unit': material.unit,
                        'severity': 'info',
                        'stock_months': round(stock_months, 1),
                        'message': f'Only {round(stock_months, 1)} months of stock remaining'
                    })

        # Sort by severity
        severity_order = {'critical': 0, 'warning': 1, 'info': 2}
        low_stock_items.sort(key=lambda x: severity_order.get(x['severity'], 3))

        return low_stock_items

    @staticmethod
    def check_expiring_batches(days_ahead: int = 30) -> list:
        """
        Find batches expiring within N days.
        Returns list of expiring batches with details.
        """
        expiry_date = date.today() + timedelta(days=days_ahead)

        expiring = MaterialBatch.query.filter(
            MaterialBatch.expiry_date.isnot(None),
            MaterialBatch.expiry_date <= expiry_date,
            MaterialBatch.expiry_date >= date.today(),
            MaterialBatch.status == 'available',
            MaterialBatch.quantity > 0
        ).order_by(MaterialBatch.expiry_date).all()

        result = []

        for batch in expiring:
            material = batch.material
            days_until = batch.days_until_expiry

            if days_until is None:
                continue

            # Determine severity based on days until expiry
            if days_until <= 7:
                severity = 'critical'
            elif days_until <= 14:
                severity = 'warning'
            else:
                severity = 'info'

            result.append({
                'batch_id': batch.id,
                'batch_number': batch.batch_number,
                'material_id': material.id if material else None,
                'material_code': material.code if material else None,
                'material_name': material.name if material else None,
                'quantity': batch.quantity,
                'expiry_date': batch.expiry_date.isoformat(),
                'days_until_expiry': days_until,
                'severity': severity,
                'location_id': batch.location_id
            })

        return result

    @staticmethod
    def check_reorder_needed() -> list:
        """
        Find materials that need reordering based on:
        - Current stock below reorder point
        - Consumption rate vs available stock
        Returns list of materials needing reorder.
        """
        materials_needing_reorder = []

        materials = Material.query.filter_by(is_active=True).all()

        for material in materials:
            # Get reserved quantity
            reserved = db.session.query(
                func.sum(StockReservation.quantity)
            ).filter(
                StockReservation.material_id == material.id,
                StockReservation.status == 'active'
            ).scalar() or 0

            available = material.current_stock - reserved

            # Check against min_stock (reorder point)
            if available <= material.min_stock:
                # Get lead time from preferred vendor
                vendor_link = MaterialVendor.query.filter_by(
                    material_id=material.id,
                    is_preferred=True
                ).first()

                if not vendor_link:
                    vendor_link = MaterialVendor.query.filter_by(
                        material_id=material.id
                    ).first()

                lead_time = vendor_link.lead_time_days if vendor_link else 14
                unit_price = vendor_link.unit_price if vendor_link else None

                # Calculate suggested order quantity
                monthly = material.get_monthly_consumption()
                daily = monthly / 30.0
                suggested_qty = max(
                    material.min_stock * 2,  # At least 2x min stock
                    daily * 45  # Or 45 days supply
                )

                urgency = 'critical' if available <= 0 else 'high' if available <= material.min_stock * 0.5 else 'medium'

                materials_needing_reorder.append({
                    'material_id': material.id,
                    'code': material.code,
                    'name': material.name,
                    'category': material.category,
                    'current_stock': material.current_stock,
                    'reserved': reserved,
                    'available': available,
                    'min_stock': material.min_stock,
                    'unit': material.unit,
                    'monthly_consumption': round(monthly, 2),
                    'suggested_order_qty': round(suggested_qty, 0),
                    'lead_time_days': lead_time,
                    'unit_price': unit_price,
                    'estimated_cost': round(suggested_qty * unit_price, 2) if unit_price else None,
                    'urgency': urgency
                })

        # Sort by urgency
        urgency_order = {'critical': 0, 'high': 1, 'medium': 2}
        materials_needing_reorder.sort(key=lambda x: urgency_order.get(x['urgency'], 3))

        return materials_needing_reorder

    @staticmethod
    def send_stock_alerts():
        """
        Send notifications for all pending alerts.
        Should be called by scheduler.
        """
        alerts_sent = 0

        # Get users to notify (admins and warehouse managers)
        users = User.query.filter(
            User.is_active == True,
            or_(
                User.role == 'admin',
                User.role == 'warehouse'
            )
        ).all()

        if not users:
            logger.warning("No users found to receive stock alerts")
            return alerts_sent

        # Check low stock
        low_stock = StockAlertService.check_low_stock()
        critical_low = [item for item in low_stock if item['severity'] == 'critical']

        if critical_low:
            for user in users:
                NotificationService.create_notification(
                    user_id=user.id,
                    type='low_stock_alert',
                    title='Critical Low Stock Alert',
                    message=f'{len(critical_low)} materials are critically low on stock',
                    related_type='material_alert',
                    priority='critical',
                    is_persistent=True,
                    action_url='/materials?filter=low_stock'
                )
                alerts_sent += 1

        # Check expiring batches (7 days)
        expiring_soon = StockAlertService.check_expiring_batches(days_ahead=7)

        if expiring_soon:
            for user in users:
                NotificationService.create_notification(
                    user_id=user.id,
                    type='batch_expiry_alert',
                    title='Batch Expiry Alert',
                    message=f'{len(expiring_soon)} batches will expire within 7 days',
                    related_type='batch_alert',
                    priority='urgent',
                    action_url='/materials/batches?filter=expiring'
                )
                alerts_sent += 1

        # Check reorder needed
        needs_reorder = StockAlertService.check_reorder_needed()
        critical_reorder = [item for item in needs_reorder if item['urgency'] == 'critical']

        if critical_reorder:
            for user in users:
                NotificationService.create_notification(
                    user_id=user.id,
                    type='reorder_alert',
                    title='Urgent Reorder Required',
                    message=f'{len(critical_reorder)} materials urgently need reordering',
                    related_type='reorder_alert',
                    priority='critical',
                    is_persistent=True,
                    action_url='/materials?filter=reorder_needed'
                )
                alerts_sent += 1

        logger.info(f"Sent {alerts_sent} stock alerts")
        return alerts_sent

    @staticmethod
    def get_alert_summary() -> dict:
        """
        Get summary of all active alerts.
        Returns comprehensive alert dashboard data.
        """
        low_stock = StockAlertService.check_low_stock()
        expiring_batches = StockAlertService.check_expiring_batches(days_ahead=30)
        needs_reorder = StockAlertService.check_reorder_needed()

        # Count by severity
        low_stock_critical = len([i for i in low_stock if i['severity'] == 'critical'])
        low_stock_warning = len([i for i in low_stock if i['severity'] == 'warning'])

        expiring_critical = len([b for b in expiring_batches if b['severity'] == 'critical'])
        expiring_warning = len([b for b in expiring_batches if b['severity'] == 'warning'])

        reorder_critical = len([r for r in needs_reorder if r['urgency'] == 'critical'])
        reorder_high = len([r for r in needs_reorder if r['urgency'] == 'high'])

        # Calculate total estimated reorder cost
        total_reorder_cost = sum(
            r['estimated_cost'] for r in needs_reorder if r.get('estimated_cost')
        )

        return {
            'generated_at': datetime.utcnow().isoformat(),
            'low_stock': {
                'total': len(low_stock),
                'critical': low_stock_critical,
                'warning': low_stock_warning,
                'items': low_stock[:10]  # Top 10 most critical
            },
            'expiring_batches': {
                'total': len(expiring_batches),
                'within_7_days': expiring_critical,
                'within_14_days': expiring_warning,
                'items': expiring_batches[:10]
            },
            'needs_reorder': {
                'total': len(needs_reorder),
                'critical': reorder_critical,
                'high': reorder_high,
                'estimated_cost': round(total_reorder_cost, 2),
                'items': needs_reorder[:10]
            },
            'overall_health': StockAlertService._calculate_inventory_health(
                low_stock_critical, expiring_critical, reorder_critical
            )
        }

    @staticmethod
    def _calculate_inventory_health(low_critical: int, expiring_critical: int, reorder_critical: int) -> dict:
        """
        Calculate overall inventory health score.
        """
        # Start with 100, deduct for issues
        score = 100

        # Critical issues are major deductions
        score -= low_critical * 10
        score -= expiring_critical * 8
        score -= reorder_critical * 10

        # Cap at 0
        score = max(0, score)

        if score >= 90:
            status = 'excellent'
            color = 'green'
        elif score >= 70:
            status = 'good'
            color = 'blue'
        elif score >= 50:
            status = 'fair'
            color = 'yellow'
        elif score >= 30:
            status = 'poor'
            color = 'orange'
        else:
            status = 'critical'
            color = 'red'

        return {
            'score': score,
            'status': status,
            'color': color,
            'issues': {
                'critical_low_stock': low_critical,
                'critical_expiring': expiring_critical,
                'critical_reorder': reorder_critical
            }
        }

    @staticmethod
    def check_reservation_fulfillment() -> list:
        """
        Check reservations that are past their needed_by date but not fulfilled.
        Returns list of overdue reservations.
        """
        today = date.today()

        overdue = StockReservation.query.filter(
            StockReservation.status == 'active',
            StockReservation.needed_by_date < today
        ).all()

        result = []

        for reservation in overdue:
            material = reservation.material
            days_overdue = (today - reservation.needed_by_date).days

            result.append({
                'reservation_id': reservation.id,
                'material_id': reservation.material_id,
                'material_name': material.name if material else None,
                'quantity': reservation.quantity,
                'reservation_type': reservation.reservation_type,
                'job_id': reservation.job_id,
                'work_plan_id': reservation.work_plan_id,
                'needed_by_date': reservation.needed_by_date.isoformat(),
                'days_overdue': days_overdue,
                'reserved_at': reservation.reserved_at.isoformat() if reservation.reserved_at else None
            })

        # Sort by days overdue
        result.sort(key=lambda x: x['days_overdue'], reverse=True)

        return result

    @staticmethod
    def get_stock_turnover_alerts() -> list:
        """
        Identify materials with slow or fast turnover rates that need attention.
        """
        alerts = []

        materials = Material.query.filter_by(is_active=True).all()

        for material in materials:
            monthly_consumption = material.get_monthly_consumption()
            stock_months = material.get_stock_months()

            # Slow turnover: more than 12 months of stock
            if stock_months != float('inf') and stock_months > 12:
                alerts.append({
                    'material_id': material.id,
                    'code': material.code,
                    'name': material.name,
                    'alert_type': 'slow_turnover',
                    'current_stock': material.current_stock,
                    'monthly_consumption': round(monthly_consumption, 2),
                    'stock_months': round(stock_months, 1),
                    'recommendation': 'Consider reducing future orders or transferring stock'
                })

            # Fast turnover: less than 1 month and not already flagged as low stock
            elif stock_months != float('inf') and stock_months < 1 and material.current_stock > material.min_stock:
                alerts.append({
                    'material_id': material.id,
                    'code': material.code,
                    'name': material.name,
                    'alert_type': 'fast_turnover',
                    'current_stock': material.current_stock,
                    'monthly_consumption': round(monthly_consumption, 2),
                    'stock_months': round(stock_months, 1),
                    'recommendation': 'Consider increasing reorder quantity or frequency'
                })

        return alerts

    @staticmethod
    def generate_weekly_report() -> dict:
        """
        Generate a weekly stock alert report.
        Suitable for email digest or dashboard.
        """
        summary = StockAlertService.get_alert_summary()

        # Get consumption trends
        week_ago = datetime.utcnow() - timedelta(days=7)

        week_consumption = db.session.query(
            func.sum(func.abs(StockHistory.quantity_change))
        ).filter(
            StockHistory.change_type == 'consume',
            StockHistory.created_at >= week_ago
        ).scalar() or 0

        prev_week_start = datetime.utcnow() - timedelta(days=14)
        prev_week_end = datetime.utcnow() - timedelta(days=7)

        prev_week_consumption = db.session.query(
            func.sum(func.abs(StockHistory.quantity_change))
        ).filter(
            StockHistory.change_type == 'consume',
            StockHistory.created_at >= prev_week_start,
            StockHistory.created_at < prev_week_end
        ).scalar() or 0

        if prev_week_consumption > 0:
            consumption_change = ((week_consumption - prev_week_consumption) / prev_week_consumption) * 100
        else:
            consumption_change = 0

        # Get restocking activity
        week_restocks = db.session.query(
            func.count(StockHistory.id),
            func.sum(func.abs(StockHistory.quantity_change))
        ).filter(
            StockHistory.change_type == 'restock',
            StockHistory.created_at >= week_ago
        ).first()

        return {
            'report_date': date.today().isoformat(),
            'report_period': f'{(date.today() - timedelta(days=7)).isoformat()} to {date.today().isoformat()}',
            'alert_summary': summary,
            'consumption': {
                'this_week': round(week_consumption, 2),
                'change_vs_last_week': round(consumption_change, 1),
                'trend': 'up' if consumption_change > 5 else 'down' if consumption_change < -5 else 'stable'
            },
            'restocking': {
                'transactions': week_restocks[0] if week_restocks else 0,
                'quantity': round(week_restocks[1] or 0, 2)
            },
            'turnover_alerts': StockAlertService.get_stock_turnover_alerts()[:5],
            'overdue_reservations': StockAlertService.check_reservation_fulfillment()[:5]
        }
