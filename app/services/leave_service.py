"""
Service for leave management.
Handles leave requests, approvals, and company-wide notifications.
Enhanced with policy management, balance tracking, encashment, compensatory leave,
half-day/hourly leave, multi-level approvals, team calendar, and reports.
"""

import logging
from app.models import Leave, User
from app.models.leave_type import LeaveType
from app.models.leave_policy import LeavePolicy
from app.models.leave_balance_history import LeaveBalanceHistory
from app.models.leave_blackout import LeaveBlackout
from app.models.leave_calendar import LeaveCalendar
from app.models.leave_approval_level import LeaveApprovalLevel
from app.models.leave_encashment import LeaveEncashment
from app.models.compensatory_leave import CompensatoryLeave
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta
from sqlalchemy import func, and_, or_
from collections import defaultdict

logger = logging.getLogger(__name__)


class LeaveService:
    """Service for managing leave requests and approvals."""

    VALID_TYPES = ['sick', 'annual', 'emergency', 'training', 'other']
    VALID_SCOPES = ['major_only', 'full']

    @staticmethod
    def request_leave(user_id, leave_type, date_from, date_to, reason, scope='full', coverage_user_id=None):
        """
        Submit a leave request.

        Args:
            user_id: User requesting leave
            leave_type: sick, annual, emergency, training, other
            date_from: Start date
            date_to: End date
            reason: Reason for leave
            scope: major_only (only major role covered) or full (all duties)
            coverage_user_id: Required — the user who will cover during leave
        """
        if leave_type not in LeaveService.VALID_TYPES:
            raise ValidationError(f"Leave type must be one of: {', '.join(LeaveService.VALID_TYPES)}")
        if scope not in LeaveService.VALID_SCOPES:
            raise ValidationError(f"Scope must be one of: {', '.join(LeaveService.VALID_SCOPES)}")

        if date_from > date_to:
            raise ValidationError("Start date must be before end date")

        # Coverage employee is mandatory
        if not coverage_user_id:
            raise ValidationError("A coverage employee must be assigned before requesting leave")

        coverage_user = db.session.get(User, coverage_user_id)
        if not coverage_user:
            raise ValidationError("Coverage user not found")
        if coverage_user.id == user_id:
            raise ValidationError("Coverage user cannot be the same as the requesting user")

        # Cross-coverage rule: inspectors covered by specialists, specialists covered by inspectors
        # Same specialization required (mechanical↔mechanical, electrical↔electrical)
        user = db.session.get(User, user_id)
        if not user:
            raise ValidationError("User not found")
        if user.role == 'inspector':
            if coverage_user.role != 'specialist':
                raise ValidationError("Inspectors can only be covered by specialists")
            if user.specialization and coverage_user.specialization and user.specialization != coverage_user.specialization:
                raise ValidationError(f"Coverage specialist must have the same specialization ({user.specialization})")
        elif user.role == 'specialist':
            if coverage_user.role != 'inspector':
                raise ValidationError("Specialists can only be covered by inspectors")
            if user.specialization and coverage_user.specialization and user.specialization != coverage_user.specialization:
                raise ValidationError(f"Coverage inspector must have the same specialization ({user.specialization})")

        # Check for overlapping leaves
        overlap = Leave.query.filter(
            Leave.user_id == user_id,
            Leave.status.in_(['pending', 'approved']),
            Leave.date_from <= date_to,
            Leave.date_to >= date_from
        ).first()
        if overlap:
            raise ValidationError("You have an overlapping leave request")

        # Calculate used leave days this year
        from datetime import date as date_type
        current_year_start = date_type(date_from.year, 1, 1)
        current_year_end = date_type(date_from.year, 12, 31)
        used_leaves = db.session.query(
            db.func.coalesce(db.func.sum(Leave.total_days), 0)
        ).filter(
            Leave.user_id == user_id,
            Leave.status.in_(['pending', 'approved']),
            Leave.date_from >= current_year_start,
            Leave.date_to <= current_year_end
        ).scalar()

        total_days = (date_to - date_from).days + 1

        remaining = (user.annual_leave_balance or 24) - used_leaves
        if remaining < total_days:
            raise ValidationError(f"Insufficient leave balance. Remaining: {remaining} days, Requested: {total_days} days")

        leave = Leave(
            user_id=user_id,
            leave_type=leave_type,
            date_from=date_from,
            date_to=date_to,
            total_days=total_days,
            reason=reason,
            scope=scope,
            coverage_user_id=coverage_user_id,
            status='pending'
        )
        db.session.add(leave)
        db.session.commit()
        logger.info("Leave requested: leave_id=%s user_id=%s type=%s from=%s to=%s coverage=%s",
                     leave.id, user_id, leave_type, date_from, date_to, coverage_user_id)

        # Notify admins
        from app.services.notification_service import NotificationService
        user = db.session.get(User, user_id)
        admins = User.query.filter_by(role='admin', is_active=True).all()
        for admin in admins:
            NotificationService.create_notification(
                user_id=admin.id,
                type='leave_requested',
                title='Leave Request',
                message=f'{user.full_name} requests {leave_type} leave: {date_from} to {date_to}',
                related_type='leave',
                related_id=leave.id
            )

        # Notify coverage employee
        NotificationService.create_notification(
            user_id=coverage_user_id,
            type='leave_coverage_assigned',
            title='Leave Coverage Assigned',
            message=f'You have been assigned as coverage for {user.full_name} from {date_from} to {date_to}',
            related_type='leave',
            related_id=leave.id
        )

        return leave

    @staticmethod
    def approve_leave(leave_id, approved_by, coverage_user_id=None):
        """
        Approve a leave request.
        Optionally assign coverage.
        """
        leave = db.session.get(Leave, leave_id)
        if not leave:
            raise NotFoundError(f"Leave {leave_id} not found")
        if leave.status != 'pending':
            raise ValidationError("Leave is not pending")

        approver = db.session.get(User, approved_by)
        if not approver or approver.role != 'admin':
            raise ForbiddenError("Admin access required")

        leave.status = 'approved'
        leave.approved_by_id = approved_by
        leave.approved_at = datetime.utcnow()

        if coverage_user_id:
            coverage_user = db.session.get(User, coverage_user_id)
            if not coverage_user:
                raise ValidationError("Coverage user not found")
            leave.coverage_user_id = coverage_user_id

        # Mark user as on leave if leave starts today or earlier
        user = db.session.get(User, leave.user_id)
        if leave.date_from <= date.today():
            user.is_on_leave = True

        db.session.commit()

        logger.info("Leave approved: leave_id=%s user_id=%s approved_by=%s", leave_id, leave.user_id, approved_by)

        # Company-wide notification
        from app.services.notification_service import NotificationService
        all_active = User.query.filter_by(is_active=True).all()
        for u in all_active:
            if u.id != leave.user_id:
                NotificationService.create_notification(
                    user_id=u.id,
                    type='leave_notification',
                    title='Team Member on Leave',
                    message=f'{user.full_name} will be on leave from {leave.date_from} to {leave.date_to}',
                    related_type='leave',
                    related_id=leave.id
                )

        return leave

    @staticmethod
    def reject_leave(leave_id, rejected_by, reason=None):
        """Reject a leave request."""
        leave = db.session.get(Leave, leave_id)
        if not leave:
            raise NotFoundError(f"Leave {leave_id} not found")
        if leave.status != 'pending':
            raise ValidationError("Leave is not pending")

        leave.status = 'rejected'
        leave.approved_by_id = rejected_by
        leave.approved_at = datetime.utcnow()
        db.session.commit()
        logger.info("Leave rejected: leave_id=%s user_id=%s rejected_by=%s", leave_id, leave.user_id, rejected_by)

        from app.services.notification_service import NotificationService
        NotificationService.create_notification(
            user_id=leave.user_id,
            type='leave_rejected',
            title='Leave Request Rejected',
            message=f'Your leave request has been rejected' + (f': {reason}' if reason else ''),
            related_type='leave',
            related_id=leave.id
        )

        return leave

    @staticmethod
    def end_leave(leave_id):
        """
        End a leave (called when leave period expires or manually).
        Restores user status.
        """
        leave = db.session.get(Leave, leave_id)
        if not leave:
            raise NotFoundError(f"Leave {leave_id} not found")

        user = db.session.get(User, leave.user_id)
        user.is_on_leave = False
        user.leave_coverage_for = None

        # Restore coverage user if any
        if leave.coverage_user_id:
            coverage = db.session.get(User, leave.coverage_user_id)
            if coverage:
                coverage.leave_coverage_for = None

        db.session.commit()
        logger.info("Leave ended: leave_id=%s user_id=%s", leave_id, leave.user_id)
        return leave

    @staticmethod
    def check_expired_leaves():
        """Check and end expired leaves. Run daily."""
        today = date.today()
        expired = Leave.query.filter(
            Leave.status == 'approved',
            Leave.date_to < today
        ).all()

        for leave in expired:
            LeaveService.end_leave(leave.id)

        return expired

    @staticmethod
    def get_active_leaves():
        """Get currently active leaves."""
        today = date.today()
        return Leave.query.filter(
            Leave.status == 'approved',
            Leave.date_from <= today,
            Leave.date_to >= today
        ).all()

    @staticmethod
    def get_user_leaves(user_id, status=None):
        """Get all leaves for a user."""
        query = Leave.query.filter_by(user_id=user_id)
        if status:
            query = query.filter_by(status=status)
        return query.order_by(Leave.date_from.desc()).all()

    # =========================================================================
    # POLICY MANAGEMENT
    # =========================================================================

    @staticmethod
    def get_effective_policy(user_id: int) -> LeavePolicy:
        """
        Get the most applicable policy for a user based on role and tenure.

        Priority: role-specific + tenure match > role-specific > general policy

        Args:
            user_id: The user ID

        Returns:
            LeavePolicy: The most applicable policy for the user

        Raises:
            NotFoundError: If no policy is found
        """
        user = db.session.get(User, user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")

        # Calculate tenure in months
        tenure_months = 0
        if user.created_at:
            tenure_delta = relativedelta(datetime.utcnow(), user.created_at)
            tenure_months = tenure_delta.years * 12 + tenure_delta.months

        # Find policies that match role and tenure
        # First try role-specific policies with tenure requirement
        policy = LeavePolicy.query.filter(
            LeavePolicy.is_active == True,
            LeavePolicy.role == user.role,
            LeavePolicy.min_tenure_months <= tenure_months
        ).order_by(LeavePolicy.min_tenure_months.desc()).first()

        if policy:
            return policy

        # Try role-specific policy without tenure requirement
        policy = LeavePolicy.query.filter(
            LeavePolicy.is_active == True,
            LeavePolicy.role == user.role
        ).first()

        if policy:
            return policy

        # Fall back to general policy (role is null)
        policy = LeavePolicy.query.filter(
            LeavePolicy.is_active == True,
            LeavePolicy.role == None,
            LeavePolicy.min_tenure_months <= tenure_months
        ).order_by(LeavePolicy.min_tenure_months.desc()).first()

        if policy:
            return policy

        # Last resort: any active general policy
        policy = LeavePolicy.query.filter(
            LeavePolicy.is_active == True,
            LeavePolicy.role == None
        ).first()

        if not policy:
            raise NotFoundError(f"No active leave policy found for user {user_id}")

        return policy

    @staticmethod
    def calculate_accrued_days(user_id: int, leave_type_code: str) -> float:
        """
        Calculate accrued leave days based on policy accrual settings.

        Args:
            user_id: The user ID
            leave_type_code: The leave type code (annual, sick, emergency)

        Returns:
            float: Number of accrued days
        """
        user = db.session.get(User, user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")

        try:
            policy = LeaveService.get_effective_policy(user_id)
        except NotFoundError:
            # No policy, return 0
            return 0.0

        # Get allowance based on leave type
        if leave_type_code == 'annual':
            yearly_allowance = policy.annual_allowance or 0
        elif leave_type_code == 'sick':
            yearly_allowance = policy.sick_allowance or 0
        elif leave_type_code == 'emergency':
            yearly_allowance = policy.emergency_allowance or 0
        else:
            yearly_allowance = 0

        # Check probation period
        tenure_months = 0
        if user.created_at:
            tenure_delta = relativedelta(datetime.utcnow(), user.created_at)
            tenure_months = tenure_delta.years * 12 + tenure_delta.months

        if tenure_months < (policy.probation_months or 0):
            # During probation, limited allowance
            if leave_type_code == 'annual':
                return float(policy.probation_allowance or 0)
            return 0.0

        # Calculate based on accrual type
        accrual_type = policy.accrual_type or 'yearly'

        if accrual_type == 'yearly':
            # Full allowance at year start
            return float(yearly_allowance)

        # Calculate periods elapsed this year
        now = datetime.utcnow()
        year_start = datetime(now.year, 1, 1)
        months_elapsed = now.month

        if accrual_type == 'monthly':
            # Accrual rate per month
            monthly_rate = policy.accrual_rate or (yearly_allowance / 12)
            return round(monthly_rate * months_elapsed, 2)

        elif accrual_type == 'quarterly':
            # Accrual rate per quarter
            quarterly_rate = policy.accrual_rate or (yearly_allowance / 4)
            quarters_elapsed = (months_elapsed - 1) // 3 + 1
            return round(quarterly_rate * quarters_elapsed, 2)

        return float(yearly_allowance)

    @staticmethod
    def process_year_end_rollover() -> dict:
        """
        Process carry-over at year end for all users.

        Checks each user's policy for carry-over rules, moves eligible days,
        expires the rest, and creates LeaveBalanceHistory entries.

        Returns:
            dict: {processed: int, carried_over: int, expired: int}
        """
        from app.services.notification_service import NotificationService

        results = {
            'processed': 0,
            'carried_over': 0,
            'expired': 0,
            'details': []
        }

        current_year = datetime.utcnow().year
        previous_year_start = date(current_year - 1, 1, 1)
        previous_year_end = date(current_year - 1, 12, 31)

        # Get all active users
        users = User.query.filter_by(is_active=True).all()

        for user in users:
            try:
                policy = LeaveService.get_effective_policy(user.id)
            except NotFoundError:
                continue

            results['processed'] += 1

            if not policy.carry_over_enabled:
                # No carry-over, expire all unused balance
                balance_info = LeaveService.get_detailed_balance(user.id)
                for leave_type_code, balance in balance_info.items():
                    if isinstance(balance, dict) and balance.get('remaining', 0) > 0:
                        remaining = balance['remaining']

                        # Get leave type
                        leave_type = LeaveType.query.filter_by(code=leave_type_code).first()

                        # Create expired history entry
                        history = LeaveBalanceHistory(
                            user_id=user.id,
                            leave_type_id=leave_type.id if leave_type else None,
                            change_type='expired',
                            amount=-remaining,
                            balance_before=remaining,
                            balance_after=0,
                            reason=f'Year-end expiry - no carry-over allowed'
                        )
                        db.session.add(history)
                        results['expired'] += remaining

                continue

            # Process carry-over for annual leave
            annual_type = LeaveType.query.filter_by(code='annual').first()
            if annual_type:
                balance_info = LeaveService.get_detailed_balance(user.id)
                annual_balance = balance_info.get('annual', {})
                remaining = annual_balance.get('remaining', 0)

                if remaining > 0:
                    max_carry = policy.carry_over_max_days or 0
                    carry_amount = min(remaining, max_carry)
                    expire_amount = remaining - carry_amount

                    # Create carry-over entry
                    if carry_amount > 0:
                        expiry_date = date(current_year, 1, 1) + relativedelta(
                            months=policy.carry_over_expiry_months or 3
                        )

                        history = LeaveBalanceHistory(
                            user_id=user.id,
                            leave_type_id=annual_type.id,
                            change_type='carry_over',
                            amount=carry_amount,
                            balance_before=0,
                            balance_after=carry_amount,
                            reason=f'Year-end carry-over from {current_year - 1}, expires {expiry_date}'
                        )
                        db.session.add(history)
                        results['carried_over'] += carry_amount

                        # Notify user
                        NotificationService.create_notification(
                            user_id=user.id,
                            type='leave_balance',
                            title='Leave Balance Carried Over',
                            message=f'{carry_amount} day(s) carried over to {current_year}. Expires {expiry_date}.',
                            title_ar='ترحيل رصيد الإجازات',
                            message_ar=f'تم ترحيل {carry_amount} يوم إلى {current_year}. تنتهي الصلاحية في {expiry_date}.'
                        )

                    # Create expired entry
                    if expire_amount > 0:
                        history = LeaveBalanceHistory(
                            user_id=user.id,
                            leave_type_id=annual_type.id,
                            change_type='expired',
                            amount=-expire_amount,
                            balance_before=remaining,
                            balance_after=carry_amount,
                            reason=f'Year-end expiry - exceeded max carry-over of {max_carry} days'
                        )
                        db.session.add(history)
                        results['expired'] += expire_amount

                    results['details'].append({
                        'user_id': user.id,
                        'user_name': user.full_name,
                        'carried_over': carry_amount,
                        'expired': expire_amount
                    })

        db.session.commit()
        logger.info("Year-end rollover processed: %s", results)
        return results

    # =========================================================================
    # BALANCE MANAGEMENT
    # =========================================================================

    @staticmethod
    def get_detailed_balance(user_id: int) -> dict:
        """
        Get balance breakdown by leave type.

        Args:
            user_id: The user ID

        Returns:
            dict: {annual: {total, used, pending, remaining}, sick: {...}, etc}
        """
        user = db.session.get(User, user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")

        # Get effective policy
        try:
            policy = LeaveService.get_effective_policy(user_id)
        except NotFoundError:
            policy = None

        current_year = datetime.utcnow().year
        year_start = date(current_year, 1, 1)
        year_end = date(current_year, 12, 31)

        result = {}

        # Get all active leave types
        leave_types = LeaveType.query.filter_by(is_active=True).all()

        for lt in leave_types:
            # Get allowance from policy
            if lt.code == 'annual':
                allowance = policy.annual_allowance if policy else 24
            elif lt.code == 'sick':
                allowance = policy.sick_allowance if policy else 15
            elif lt.code == 'emergency':
                allowance = policy.emergency_allowance if policy else 5
            else:
                allowance = 0

            # Calculate accrued if policy uses accrual
            if policy and policy.accrual_type != 'yearly':
                total = LeaveService.calculate_accrued_days(user_id, lt.code)
            else:
                total = float(allowance)

            # Add carry-over balance
            carry_over = db.session.query(
                func.coalesce(func.sum(LeaveBalanceHistory.amount), 0)
            ).filter(
                LeaveBalanceHistory.user_id == user_id,
                LeaveBalanceHistory.leave_type_id == lt.id,
                LeaveBalanceHistory.change_type == 'carry_over',
                LeaveBalanceHistory.created_at >= year_start
            ).scalar() or 0

            total += float(carry_over)

            # Calculate used (approved leaves)
            used = db.session.query(
                func.coalesce(func.sum(Leave.total_days), 0)
            ).filter(
                Leave.user_id == user_id,
                Leave.status == 'approved',
                Leave.date_from >= year_start,
                Leave.date_to <= year_end,
                or_(
                    Leave.leave_type == lt.code,
                    Leave.leave_type_id == lt.id
                )
            ).scalar() or 0

            # Calculate pending
            pending = db.session.query(
                func.coalesce(func.sum(Leave.total_days), 0)
            ).filter(
                Leave.user_id == user_id,
                Leave.status == 'pending',
                Leave.date_from >= year_start,
                Leave.date_to <= year_end,
                or_(
                    Leave.leave_type == lt.code,
                    Leave.leave_type_id == lt.id
                )
            ).scalar() or 0

            # Calculate adjustments
            adjustments = db.session.query(
                func.coalesce(func.sum(LeaveBalanceHistory.amount), 0)
            ).filter(
                LeaveBalanceHistory.user_id == user_id,
                LeaveBalanceHistory.leave_type_id == lt.id,
                LeaveBalanceHistory.change_type == 'adjustment',
                LeaveBalanceHistory.created_at >= year_start
            ).scalar() or 0

            # Calculate encashment deductions
            encashed = db.session.query(
                func.coalesce(func.sum(LeaveEncashment.days_encashed), 0)
            ).filter(
                LeaveEncashment.user_id == user_id,
                LeaveEncashment.leave_type_id == lt.id,
                LeaveEncashment.status == 'paid',
                LeaveEncashment.paid_at >= year_start
            ).scalar() or 0

            total += float(adjustments)
            remaining = total - float(used) - float(encashed)

            result[lt.code] = {
                'leave_type_id': lt.id,
                'name': lt.name,
                'name_ar': lt.name_ar,
                'total': round(total, 2),
                'used': round(float(used), 2),
                'pending': round(float(pending), 2),
                'encashed': round(float(encashed), 2),
                'adjustments': round(float(adjustments), 2),
                'carry_over': round(float(carry_over), 2),
                'remaining': round(remaining, 2)
            }

        # Add compensatory leave balance
        comp_balance = db.session.query(
            func.coalesce(func.sum(CompensatoryLeave.comp_days_earned), 0)
        ).filter(
            CompensatoryLeave.user_id == user_id,
            CompensatoryLeave.status == 'approved'
        ).scalar() or 0

        comp_used = db.session.query(
            func.coalesce(func.sum(CompensatoryLeave.comp_days_earned), 0)
        ).filter(
            CompensatoryLeave.user_id == user_id,
            CompensatoryLeave.status == 'used'
        ).scalar() or 0

        result['compensatory'] = {
            'total': round(float(comp_balance) + float(comp_used), 2),
            'used': round(float(comp_used), 2),
            'remaining': round(float(comp_balance), 2)
        }

        return result

    @staticmethod
    def adjust_balance(user_id: int, leave_type_id: int, amount: float, reason: str, adjusted_by_id: int) -> LeaveBalanceHistory:
        """
        Manually adjust leave balance with audit trail.

        Args:
            user_id: The user ID
            leave_type_id: The leave type ID
            amount: Adjustment amount (positive to add, negative to deduct)
            reason: Reason for adjustment
            adjusted_by_id: ID of user making the adjustment

        Returns:
            LeaveBalanceHistory: The created history entry
        """
        from app.services.notification_service import NotificationService

        user = db.session.get(User, user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")

        leave_type = db.session.get(LeaveType, leave_type_id)
        if not leave_type:
            raise NotFoundError(f"Leave type {leave_type_id} not found")

        adjuster = db.session.get(User, adjusted_by_id)
        if not adjuster:
            raise NotFoundError(f"Adjusting user {adjusted_by_id} not found")

        # Get current balance
        balance_info = LeaveService.get_detailed_balance(user_id)
        current_balance = balance_info.get(leave_type.code, {}).get('remaining', 0)

        # Create history entry
        history = LeaveBalanceHistory(
            user_id=user_id,
            leave_type_id=leave_type_id,
            change_type='adjustment',
            amount=amount,
            balance_before=current_balance,
            balance_after=current_balance + amount,
            reason=reason,
            adjusted_by_id=adjusted_by_id
        )

        db.session.add(history)
        db.session.commit()

        logger.info("Balance adjusted: user_id=%s leave_type=%s amount=%s by=%s",
                   user_id, leave_type.code, amount, adjusted_by_id)

        # Notify user
        action = 'increased' if amount > 0 else 'decreased'
        NotificationService.create_notification(
            user_id=user_id,
            type='leave_balance',
            title='Leave Balance Adjusted',
            message=f'Your {leave_type.name} balance has been {action} by {abs(amount)} day(s). Reason: {reason}',
            title_ar='تعديل رصيد الإجازات',
            message_ar=f'تم تعديل رصيد {leave_type.name_ar or leave_type.name} بمقدار {abs(amount)} يوم. السبب: {reason}'
        )

        return history

    @staticmethod
    def get_balance_history(user_id: int, filters: dict = None) -> list:
        """
        Get balance change history with optional filters.

        Args:
            user_id: The user ID
            filters: Optional filters - leave_type_id, change_type, date_from, date_to

        Returns:
            list: List of LeaveBalanceHistory records
        """
        user = db.session.get(User, user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")

        query = LeaveBalanceHistory.query.filter_by(user_id=user_id)

        if filters:
            if filters.get('leave_type_id'):
                query = query.filter_by(leave_type_id=filters['leave_type_id'])

            if filters.get('change_type'):
                query = query.filter_by(change_type=filters['change_type'])

            if filters.get('date_from'):
                date_from = filters['date_from']
                if isinstance(date_from, str):
                    date_from = datetime.fromisoformat(date_from)
                query = query.filter(LeaveBalanceHistory.created_at >= date_from)

            if filters.get('date_to'):
                date_to = filters['date_to']
                if isinstance(date_to, str):
                    date_to = datetime.fromisoformat(date_to)
                query = query.filter(LeaveBalanceHistory.created_at <= date_to)

        return query.order_by(LeaveBalanceHistory.created_at.desc()).all()

    # =========================================================================
    # BLACKOUT & CALENDAR
    # =========================================================================

    @staticmethod
    def check_blackout_conflict(user_id: int, date_from: date, date_to: date) -> dict:
        """
        Check if dates conflict with any blackout period.

        Args:
            user_id: The user ID
            date_from: Start date
            date_to: End date

        Returns:
            dict: {has_conflict: bool, blackouts: [...]}
        """
        user = db.session.get(User, user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")

        # Find active blackouts that overlap with the date range
        blackouts = LeaveBlackout.query.filter(
            LeaveBlackout.is_active == True,
            LeaveBlackout.date_from <= date_to,
            LeaveBlackout.date_to >= date_from
        ).all()

        conflicting_blackouts = []
        for blackout in blackouts:
            if blackout.applies_to_user(user):
                conflicting_blackouts.append(blackout)

        return {
            'has_conflict': len(conflicting_blackouts) > 0,
            'blackouts': [b.to_dict() for b in conflicting_blackouts]
        }

    @staticmethod
    def count_working_days(date_from: date, date_to: date, exclude_weekends: bool = True) -> int:
        """
        Count working days excluding holidays and optionally weekends.

        Args:
            date_from: Start date
            date_to: End date
            exclude_weekends: Whether to exclude weekends (default True)

        Returns:
            int: Number of working days
        """
        if date_from > date_to:
            return 0

        # Get holidays in range
        holiday_dates = set()
        holidays = LeaveCalendar.get_holidays_in_range(date_from, date_to)
        for h in holidays:
            holiday_dates.add(h.date)

        # Count days
        working_days = 0
        current = date_from
        while current <= date_to:
            is_weekend = current.weekday() >= 5  # Saturday = 5, Sunday = 6
            is_holiday = current in holiday_dates

            if not is_holiday:
                if exclude_weekends:
                    if not is_weekend:
                        working_days += 1
                else:
                    working_days += 1

            current += timedelta(days=1)

        return working_days

    @staticmethod
    def get_holidays_in_range(date_from: date, date_to: date) -> list:
        """
        Get all holidays within a date range.

        Args:
            date_from: Start date
            date_to: End date

        Returns:
            list: List of LeaveCalendar records
        """
        return LeaveCalendar.get_holidays_in_range(date_from, date_to)

    # =========================================================================
    # LEAVE OPERATIONS
    # =========================================================================

    @staticmethod
    def request_cancellation(leave_id: int, user_id: int, reason: str) -> Leave:
        """
        Request cancellation of an approved leave.

        Args:
            leave_id: The leave ID
            user_id: The user requesting cancellation
            reason: Reason for cancellation

        Returns:
            Leave: The updated leave record
        """
        from app.services.notification_service import NotificationService

        leave = db.session.get(Leave, leave_id)
        if not leave:
            raise NotFoundError(f"Leave {leave_id} not found")

        if leave.user_id != user_id:
            raise ForbiddenError("You can only request cancellation of your own leave")

        if leave.status != 'approved':
            raise ValidationError("Only approved leaves can be cancelled")

        if leave.cancellation_requested:
            raise ValidationError("Cancellation already requested")

        # Check if leave has already started
        today = date.today()
        if leave.date_from <= today:
            raise ValidationError("Cannot cancel leave that has already started")

        leave.cancellation_requested = True
        leave.cancellation_reason = reason
        db.session.commit()

        logger.info("Cancellation requested: leave_id=%s user_id=%s", leave_id, user_id)

        # Notify admins
        user = db.session.get(User, user_id)
        admins = User.query.filter_by(role='admin', is_active=True).all()
        for admin in admins:
            NotificationService.create_notification(
                user_id=admin.id,
                type='leave_cancellation_requested',
                title='Leave Cancellation Request',
                message=f'{user.full_name} has requested to cancel their leave ({leave.date_from} to {leave.date_to}). Reason: {reason}',
                related_type='leave',
                related_id=leave.id,
                title_ar='طلب إلغاء إجازة',
                message_ar=f'{user.full_name} طلب إلغاء إجازته ({leave.date_from} إلى {leave.date_to}). السبب: {reason}'
            )

        return leave

    @staticmethod
    def approve_cancellation(leave_id: int, approved_by_id: int) -> Leave:
        """
        Approve a cancellation request.

        Args:
            leave_id: The leave ID
            approved_by_id: ID of user approving the cancellation

        Returns:
            Leave: The updated leave record
        """
        from app.services.notification_service import NotificationService

        leave = db.session.get(Leave, leave_id)
        if not leave:
            raise NotFoundError(f"Leave {leave_id} not found")

        if not leave.cancellation_requested:
            raise ValidationError("No cancellation request pending")

        approver = db.session.get(User, approved_by_id)
        if not approver or approver.role != 'admin':
            raise ForbiddenError("Admin access required")

        # Update leave status
        leave.status = 'cancelled'
        leave.cancelled_at = datetime.utcnow()

        # Clear is_on_leave if applicable
        user = db.session.get(User, leave.user_id)
        today = date.today()
        if leave.date_from <= today <= leave.date_to:
            user.is_on_leave = False

        # Create balance restoration history
        leave_type = LeaveType.query.filter_by(code=leave.leave_type).first()
        if leave_type:
            balance_info = LeaveService.get_detailed_balance(leave.user_id)
            current_balance = balance_info.get(leave.leave_type, {}).get('remaining', 0)

            history = LeaveBalanceHistory(
                user_id=leave.user_id,
                leave_type_id=leave_type.id,
                change_type='adjustment',
                amount=leave.total_days,
                balance_before=current_balance,
                balance_after=current_balance + leave.total_days,
                leave_id=leave.id,
                reason=f'Balance restored due to leave cancellation'
            )
            db.session.add(history)

        db.session.commit()

        logger.info("Cancellation approved: leave_id=%s approved_by=%s", leave_id, approved_by_id)

        # Notify user
        NotificationService.create_notification(
            user_id=leave.user_id,
            type='leave_cancellation_approved',
            title='Leave Cancellation Approved',
            message=f'Your leave cancellation request has been approved. {leave.total_days} day(s) restored to your balance.',
            related_type='leave',
            related_id=leave.id,
            title_ar='تمت الموافقة على إلغاء الإجازة',
            message_ar=f'تمت الموافقة على طلب إلغاء إجازتك. تم إعادة {leave.total_days} يوم إلى رصيدك.'
        )

        # Notify coverage user if any
        if leave.coverage_user_id:
            NotificationService.create_notification(
                user_id=leave.coverage_user_id,
                type='leave_coverage_cancelled',
                title='Coverage Assignment Cancelled',
                message=f'The leave you were covering for {user.full_name} has been cancelled.',
                related_type='leave',
                related_id=leave.id,
                title_ar='إلغاء تغطية الإجازة',
                message_ar=f'تم إلغاء الإجازة التي كنت تغطيها لـ {user.full_name}.'
            )

        return leave

    @staticmethod
    def reject_cancellation(leave_id: int, rejected_by_id: int, reason: str) -> Leave:
        """
        Reject a cancellation request.

        Args:
            leave_id: The leave ID
            rejected_by_id: ID of user rejecting the cancellation
            reason: Reason for rejection

        Returns:
            Leave: The updated leave record
        """
        from app.services.notification_service import NotificationService

        leave = db.session.get(Leave, leave_id)
        if not leave:
            raise NotFoundError(f"Leave {leave_id} not found")

        if not leave.cancellation_requested:
            raise ValidationError("No cancellation request pending")

        rejector = db.session.get(User, rejected_by_id)
        if not rejector or rejector.role != 'admin':
            raise ForbiddenError("Admin access required")

        # Clear cancellation request
        leave.cancellation_requested = False
        leave.cancellation_reason = None
        db.session.commit()

        logger.info("Cancellation rejected: leave_id=%s rejected_by=%s", leave_id, rejected_by_id)

        # Notify user
        NotificationService.create_notification(
            user_id=leave.user_id,
            type='leave_cancellation_rejected',
            title='Leave Cancellation Rejected',
            message=f'Your leave cancellation request has been rejected. Reason: {reason}',
            related_type='leave',
            related_id=leave.id,
            title_ar='رفض طلب إلغاء الإجازة',
            message_ar=f'تم رفض طلب إلغاء إجازتك. السبب: {reason}'
        )

        return leave

    @staticmethod
    def request_extension(leave_id: int, new_date_to: date, reason: str) -> Leave:
        """
        Request extension of existing leave.

        Args:
            leave_id: The original leave ID
            new_date_to: New end date
            reason: Reason for extension

        Returns:
            Leave: The new extension leave record
        """
        from app.services.notification_service import NotificationService

        original_leave = db.session.get(Leave, leave_id)
        if not original_leave:
            raise NotFoundError(f"Leave {leave_id} not found")

        if original_leave.status != 'approved':
            raise ValidationError("Only approved leaves can be extended")

        if new_date_to <= original_leave.date_to:
            raise ValidationError("Extension date must be after current end date")

        user = db.session.get(User, original_leave.user_id)

        # Calculate extension days
        extension_days = (new_date_to - original_leave.date_to).days

        # Create extension leave request
        extension = Leave(
            user_id=original_leave.user_id,
            leave_type=original_leave.leave_type,
            leave_type_id=original_leave.leave_type_id,
            date_from=original_leave.date_to + timedelta(days=1),
            date_to=new_date_to,
            total_days=extension_days,
            reason=reason,
            scope=original_leave.scope,
            coverage_user_id=original_leave.coverage_user_id,
            extension_of_id=original_leave.id,
            status='pending'
        )

        db.session.add(extension)
        db.session.commit()

        logger.info("Extension requested: original_leave_id=%s new_leave_id=%s extension_days=%s",
                   leave_id, extension.id, extension_days)

        # Notify admins
        admins = User.query.filter_by(role='admin', is_active=True).all()
        for admin in admins:
            NotificationService.create_notification(
                user_id=admin.id,
                type='leave_extension_requested',
                title='Leave Extension Request',
                message=f'{user.full_name} requests to extend their leave until {new_date_to}. Reason: {reason}',
                related_type='leave',
                related_id=extension.id,
                title_ar='طلب تمديد إجازة',
                message_ar=f'{user.full_name} يطلب تمديد إجازته حتى {new_date_to}. السبب: {reason}'
            )

        return extension

    @staticmethod
    def bulk_approve(leave_ids: list, approved_by_id: int) -> dict:
        """
        Bulk approve multiple leaves.

        Args:
            leave_ids: List of leave IDs to approve
            approved_by_id: ID of user approving

        Returns:
            dict: {approved: int, failed: [{id, error}]}
        """
        results = {
            'approved': 0,
            'failed': []
        }

        for leave_id in leave_ids:
            try:
                LeaveService.approve_leave(leave_id, approved_by_id)
                results['approved'] += 1
            except Exception as e:
                results['failed'].append({
                    'id': leave_id,
                    'error': str(e)
                })

        logger.info("Bulk approve completed: approved=%s failed=%s",
                   results['approved'], len(results['failed']))

        return results

    @staticmethod
    def bulk_reject(leave_ids: list, rejected_by_id: int, reason: str) -> dict:
        """
        Bulk reject multiple leaves.

        Args:
            leave_ids: List of leave IDs to reject
            rejected_by_id: ID of user rejecting
            reason: Rejection reason

        Returns:
            dict: {rejected: int, failed: [{id, error}]}
        """
        results = {
            'rejected': 0,
            'failed': []
        }

        for leave_id in leave_ids:
            try:
                LeaveService.reject_leave(leave_id, rejected_by_id, reason)
                results['rejected'] += 1
            except Exception as e:
                results['failed'].append({
                    'id': leave_id,
                    'error': str(e)
                })

        logger.info("Bulk reject completed: rejected=%s failed=%s",
                   results['rejected'], len(results['failed']))

        return results

    # =========================================================================
    # COMPENSATORY LEAVE
    # =========================================================================

    @staticmethod
    def request_comp_off(user_id: int, work_date: date, hours_worked: float, reason: str, requested_by_id: int) -> CompensatoryLeave:
        """
        Request compensatory leave for overtime work.

        Args:
            user_id: The user ID who worked overtime
            work_date: Date when overtime was worked
            hours_worked: Hours worked
            reason: Reason for overtime
            requested_by_id: ID of user making the request (can be same as user_id)

        Returns:
            CompensatoryLeave: The created comp-off request
        """
        from app.services.notification_service import NotificationService

        user = db.session.get(User, user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")

        if hours_worked <= 0:
            raise ValidationError("Hours worked must be positive")

        if work_date > date.today():
            raise ValidationError("Work date cannot be in the future")

        # Check for duplicate
        existing = CompensatoryLeave.query.filter_by(
            user_id=user_id,
            work_date=work_date
        ).first()
        if existing:
            raise ValidationError(f"Comp-off already requested for {work_date}")

        # Calculate comp days earned (8 hours = 1 day)
        comp_days_earned = round(hours_worked / 8, 2)
        if comp_days_earned < 0.5:
            comp_days_earned = 0.5  # Minimum half day

        # Set expiry date (3 months from approval)
        expires_at = date.today() + relativedelta(months=3)

        comp = CompensatoryLeave(
            user_id=user_id,
            work_date=work_date,
            hours_worked=hours_worked,
            comp_days_earned=comp_days_earned,
            reason=reason,
            expires_at=expires_at,
            status='pending'
        )

        db.session.add(comp)
        db.session.commit()

        logger.info("Comp-off requested: user_id=%s work_date=%s hours=%s days=%s",
                   user_id, work_date, hours_worked, comp_days_earned)

        # Notify admins
        admins = User.query.filter_by(role='admin', is_active=True).all()
        for admin in admins:
            NotificationService.create_notification(
                user_id=admin.id,
                type='comp_off_requested',
                title='Comp-Off Request',
                message=f'{user.full_name} requests comp-off for {hours_worked} hours worked on {work_date}.',
                related_type='compensatory_leave',
                related_id=comp.id,
                title_ar='طلب إجازة تعويضية',
                message_ar=f'{user.full_name} يطلب إجازة تعويضية عن {hours_worked} ساعة عمل في {work_date}.'
            )

        return comp

    @staticmethod
    def approve_comp_off(comp_id: int, approved_by_id: int) -> CompensatoryLeave:
        """
        Approve comp-off request.

        Args:
            comp_id: The compensatory leave ID
            approved_by_id: ID of user approving

        Returns:
            CompensatoryLeave: The updated record
        """
        from app.services.notification_service import NotificationService

        comp = db.session.get(CompensatoryLeave, comp_id)
        if not comp:
            raise NotFoundError(f"Compensatory leave {comp_id} not found")

        if comp.status != 'pending':
            raise ValidationError("Comp-off is not pending approval")

        approver = db.session.get(User, approved_by_id)
        if not approver or approver.role != 'admin':
            raise ForbiddenError("Admin access required")

        comp.status = 'approved'
        comp.approved_by_id = approved_by_id
        comp.approved_at = datetime.utcnow()

        # Update expiry from approval date
        comp.expires_at = date.today() + relativedelta(months=3)

        db.session.commit()

        logger.info("Comp-off approved: comp_id=%s approved_by=%s", comp_id, approved_by_id)

        # Notify user
        user = db.session.get(User, comp.user_id)
        NotificationService.create_notification(
            user_id=comp.user_id,
            type='comp_off_approved',
            title='Comp-Off Approved',
            message=f'Your comp-off request for {comp.work_date} has been approved. {comp.comp_days_earned} day(s) added to your balance. Expires: {comp.expires_at}',
            related_type='compensatory_leave',
            related_id=comp.id,
            title_ar='تمت الموافقة على الإجازة التعويضية',
            message_ar=f'تمت الموافقة على طلب الإجازة التعويضية ليوم {comp.work_date}. تمت إضافة {comp.comp_days_earned} يوم إلى رصيدك. تنتهي الصلاحية: {comp.expires_at}'
        )

        return comp

    @staticmethod
    def get_available_comp_off(user_id: int) -> list:
        """
        Get available (approved, not used, not expired) comp-off days.

        Args:
            user_id: The user ID

        Returns:
            list: List of available CompensatoryLeave records
        """
        today = date.today()

        return CompensatoryLeave.query.filter(
            CompensatoryLeave.user_id == user_id,
            CompensatoryLeave.status == 'approved',
            or_(
                CompensatoryLeave.expires_at == None,
                CompensatoryLeave.expires_at >= today
            )
        ).order_by(CompensatoryLeave.expires_at.asc()).all()

    @staticmethod
    def use_comp_off(comp_id: int, leave_id: int) -> CompensatoryLeave:
        """
        Mark comp-off as used in a leave request.

        Args:
            comp_id: The compensatory leave ID
            leave_id: The leave ID it's being used for

        Returns:
            CompensatoryLeave: The updated record
        """
        comp = db.session.get(CompensatoryLeave, comp_id)
        if not comp:
            raise NotFoundError(f"Compensatory leave {comp_id} not found")

        if not comp.is_available():
            raise ValidationError("Comp-off is not available for use")

        leave = db.session.get(Leave, leave_id)
        if not leave:
            raise NotFoundError(f"Leave {leave_id} not found")

        if comp.user_id != leave.user_id:
            raise ValidationError("Comp-off and leave must belong to the same user")

        comp.mark_used(leave_id)
        db.session.commit()

        logger.info("Comp-off used: comp_id=%s leave_id=%s", comp_id, leave_id)

        return comp

    # =========================================================================
    # ENCASHMENT
    # =========================================================================

    @staticmethod
    def request_encashment(user_id: int, leave_type_id: int, days: float) -> LeaveEncashment:
        """
        Request leave encashment.

        Args:
            user_id: The user ID
            leave_type_id: The leave type ID
            days: Number of days to encash

        Returns:
            LeaveEncashment: The created encashment request
        """
        from app.services.notification_service import NotificationService

        user = db.session.get(User, user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")

        leave_type = db.session.get(LeaveType, leave_type_id)
        if not leave_type:
            raise NotFoundError(f"Leave type {leave_type_id} not found")

        if days <= 0:
            raise ValidationError("Days to encash must be positive")

        # Validate sufficient balance
        balance_info = LeaveService.get_detailed_balance(user_id)
        current_balance = balance_info.get(leave_type.code, {}).get('remaining', 0)

        if current_balance < days:
            raise ValidationError(f"Insufficient balance. Available: {current_balance}, Requested: {days}")

        encashment = LeaveEncashment(
            user_id=user_id,
            leave_type_id=leave_type_id,
            days_encashed=days,
            status='pending'
        )

        db.session.add(encashment)
        db.session.commit()

        logger.info("Encashment requested: user_id=%s leave_type=%s days=%s",
                   user_id, leave_type.code, days)

        # Notify admins
        admins = User.query.filter_by(role='admin', is_active=True).all()
        for admin in admins:
            NotificationService.create_notification(
                user_id=admin.id,
                type='leave_encashment_requested',
                title='Leave Encashment Request',
                message=f'{user.full_name} requests to encash {days} day(s) of {leave_type.name}.',
                related_type='leave_encashment',
                related_id=encashment.id,
                title_ar='طلب صرف رصيد إجازات',
                message_ar=f'{user.full_name} يطلب صرف {days} يوم من {leave_type.name_ar or leave_type.name}.'
            )

        return encashment

    @staticmethod
    def approve_encashment(encash_id: int, approved_by_id: int, amount_per_day: float) -> LeaveEncashment:
        """
        Approve encashment with rate.

        Args:
            encash_id: The encashment ID
            approved_by_id: ID of user approving
            amount_per_day: Rate per day

        Returns:
            LeaveEncashment: The updated record
        """
        from app.services.notification_service import NotificationService

        encashment = db.session.get(LeaveEncashment, encash_id)
        if not encashment:
            raise NotFoundError(f"Encashment {encash_id} not found")

        if encashment.status != 'pending':
            raise ValidationError("Encashment is not pending approval")

        approver = db.session.get(User, approved_by_id)
        if not approver or approver.role != 'admin':
            raise ForbiddenError("Admin access required")

        if amount_per_day <= 0:
            raise ValidationError("Amount per day must be positive")

        encashment.amount_per_day = amount_per_day
        encashment.calculate_total()
        encashment.approve(approved_by_id)

        db.session.commit()

        logger.info("Encashment approved: encash_id=%s approved_by=%s total=%s",
                   encash_id, approved_by_id, encashment.total_amount)

        # Notify user
        NotificationService.create_notification(
            user_id=encashment.user_id,
            type='leave_encashment_approved',
            title='Leave Encashment Approved',
            message=f'Your encashment request has been approved. Total amount: {encashment.total_amount}',
            related_type='leave_encashment',
            related_id=encashment.id,
            title_ar='تمت الموافقة على صرف الإجازات',
            message_ar=f'تمت الموافقة على طلب صرف إجازاتك. المبلغ الإجمالي: {encashment.total_amount}'
        )

        return encashment

    @staticmethod
    def mark_encashment_paid(encash_id: int) -> LeaveEncashment:
        """
        Mark encashment as paid.

        Args:
            encash_id: The encashment ID

        Returns:
            LeaveEncashment: The updated record
        """
        from app.services.notification_service import NotificationService

        encashment = db.session.get(LeaveEncashment, encash_id)
        if not encashment:
            raise NotFoundError(f"Encashment {encash_id} not found")

        if encashment.status != 'approved':
            raise ValidationError("Encashment must be approved before marking as paid")

        # Get current balance before deduction
        balance_info = LeaveService.get_detailed_balance(encashment.user_id)
        leave_type = db.session.get(LeaveType, encashment.leave_type_id)
        current_balance = balance_info.get(leave_type.code, {}).get('remaining', 0) if leave_type else 0

        # Create balance deduction history
        history = LeaveBalanceHistory(
            user_id=encashment.user_id,
            leave_type_id=encashment.leave_type_id,
            change_type='encashment',
            amount=-encashment.days_encashed,
            balance_before=current_balance,
            balance_after=current_balance - encashment.days_encashed,
            reason=f'Leave encashment - {encashment.days_encashed} days at {encashment.amount_per_day} per day'
        )
        db.session.add(history)

        encashment.mark_paid()
        db.session.commit()

        logger.info("Encashment paid: encash_id=%s", encash_id)

        # Notify user
        NotificationService.create_notification(
            user_id=encashment.user_id,
            type='leave_encashment_paid',
            title='Leave Encashment Paid',
            message=f'Your leave encashment of {encashment.total_amount} has been processed.',
            related_type='leave_encashment',
            related_id=encashment.id,
            title_ar='تم صرف مستحقات الإجازات',
            message_ar=f'تم صرف مستحقات إجازاتك بمبلغ {encashment.total_amount}.'
        )

        return encashment

    # =========================================================================
    # HALF-DAY & HOURLY LEAVE
    # =========================================================================

    @staticmethod
    def request_half_day_leave(user_id: int, leave_date: date, period: str, leave_type_id: int, reason: str, coverage_user_id: int) -> Leave:
        """
        Request half-day leave.

        Args:
            user_id: The user ID
            leave_date: The date of leave
            period: 'morning' or 'afternoon'
            leave_type_id: The leave type ID
            reason: Reason for leave
            coverage_user_id: ID of coverage user

        Returns:
            Leave: The created leave record
        """
        from app.services.notification_service import NotificationService

        if period not in ['morning', 'afternoon']:
            raise ValidationError("Period must be 'morning' or 'afternoon'")

        leave_type = db.session.get(LeaveType, leave_type_id)
        if not leave_type:
            raise NotFoundError(f"Leave type {leave_type_id} not found")

        user = db.session.get(User, user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")

        # Check for overlapping leaves on the same day
        overlap = Leave.query.filter(
            Leave.user_id == user_id,
            Leave.status.in_(['pending', 'approved']),
            Leave.date_from <= leave_date,
            Leave.date_to >= leave_date
        ).first()

        if overlap:
            # Check if it's a half-day leave on the other period
            if overlap.is_half_day and overlap.half_day_period != period:
                pass  # OK - different periods
            else:
                raise ValidationError("You have an overlapping leave on this date")

        # Validate coverage
        coverage_user = db.session.get(User, coverage_user_id)
        if not coverage_user:
            raise ValidationError("Coverage user not found")
        if coverage_user.id == user_id:
            raise ValidationError("Coverage user cannot be the same as the requesting user")

        leave = Leave(
            user_id=user_id,
            leave_type=leave_type.code,
            leave_type_id=leave_type_id,
            date_from=leave_date,
            date_to=leave_date,
            total_days=0.5,
            is_half_day=True,
            half_day_period=period,
            reason=reason,
            scope='full',
            coverage_user_id=coverage_user_id,
            status='pending'
        )

        db.session.add(leave)
        db.session.commit()

        logger.info("Half-day leave requested: leave_id=%s user_id=%s date=%s period=%s",
                   leave.id, user_id, leave_date, period)

        # Notify admins
        admins = User.query.filter_by(role='admin', is_active=True).all()
        period_text = 'morning' if period == 'morning' else 'afternoon'
        period_text_ar = 'صباحاً' if period == 'morning' else 'مساءً'

        for admin in admins:
            NotificationService.create_notification(
                user_id=admin.id,
                type='leave_requested',
                title='Half-Day Leave Request',
                message=f'{user.full_name} requests half-day ({period_text}) leave on {leave_date}',
                related_type='leave',
                related_id=leave.id,
                title_ar='طلب إجازة نصف يوم',
                message_ar=f'{user.full_name} يطلب إجازة نصف يوم ({period_text_ar}) في {leave_date}'
            )

        return leave

    @staticmethod
    def request_hourly_leave(user_id: int, leave_date: date, hours: float, leave_type_id: int, reason: str) -> Leave:
        """
        Request hourly leave (for policies that allow it).

        Args:
            user_id: The user ID
            leave_date: The date of leave
            hours: Number of hours
            leave_type_id: The leave type ID
            reason: Reason for leave

        Returns:
            Leave: The created leave record
        """
        from app.services.notification_service import NotificationService

        if hours <= 0 or hours > 8:
            raise ValidationError("Hours must be between 0 and 8")

        leave_type = db.session.get(LeaveType, leave_type_id)
        if not leave_type:
            raise NotFoundError(f"Leave type {leave_type_id} not found")

        user = db.session.get(User, user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")

        # Convert hours to days for balance calculation
        days_equivalent = round(hours / 8, 3)

        leave = Leave(
            user_id=user_id,
            leave_type=leave_type.code,
            leave_type_id=leave_type_id,
            date_from=leave_date,
            date_to=leave_date,
            total_days=days_equivalent,
            requested_hours=hours,
            reason=reason,
            scope='full',
            status='pending'
        )

        db.session.add(leave)
        db.session.commit()

        logger.info("Hourly leave requested: leave_id=%s user_id=%s date=%s hours=%s",
                   leave.id, user_id, leave_date, hours)

        # Notify admins
        admins = User.query.filter_by(role='admin', is_active=True).all()
        for admin in admins:
            NotificationService.create_notification(
                user_id=admin.id,
                type='leave_requested',
                title='Hourly Leave Request',
                message=f'{user.full_name} requests {hours} hour(s) leave on {leave_date}',
                related_type='leave',
                related_id=leave.id,
                title_ar='طلب إجازة بالساعات',
                message_ar=f'{user.full_name} يطلب إجازة {hours} ساعة في {leave_date}'
            )

        return leave

    # =========================================================================
    # APPROVAL WORKFLOW
    # =========================================================================

    @staticmethod
    def get_pending_approval_levels(leave_id: int) -> list:
        """
        Get pending approval levels for a leave.

        Args:
            leave_id: The leave ID

        Returns:
            list: List of pending LeaveApprovalLevel records
        """
        leave = db.session.get(Leave, leave_id)
        if not leave:
            raise NotFoundError(f"Leave {leave_id} not found")

        return LeaveApprovalLevel.query.filter(
            LeaveApprovalLevel.leave_id == leave_id,
            LeaveApprovalLevel.status == 'pending'
        ).order_by(LeaveApprovalLevel.level.asc()).all()

    @staticmethod
    def approve_level(leave_id: int, level: int, approver_id: int, notes: str = None) -> LeaveApprovalLevel:
        """
        Approve at a specific level.

        Args:
            leave_id: The leave ID
            level: The approval level
            approver_id: ID of the approver
            notes: Optional notes

        Returns:
            LeaveApprovalLevel: The updated approval level
        """
        from app.services.notification_service import NotificationService

        leave = db.session.get(Leave, leave_id)
        if not leave:
            raise NotFoundError(f"Leave {leave_id} not found")

        approval = LeaveApprovalLevel.query.filter_by(
            leave_id=leave_id,
            level=level
        ).first()

        if not approval:
            # Create approval level if not exists
            approval = LeaveApprovalLevel(
                leave_id=leave_id,
                level=level,
                status='pending'
            )
            db.session.add(approval)

        if approval.status != 'pending':
            raise ValidationError(f"Level {level} is not pending approval")

        approval.approve(approver_id, notes)
        db.session.commit()

        logger.info("Approval level approved: leave_id=%s level=%s approver=%s",
                   leave_id, level, approver_id)

        # Check if all levels are approved
        pending_levels = LeaveApprovalLevel.query.filter_by(
            leave_id=leave_id,
            status='pending'
        ).count()

        if pending_levels == 0:
            # All levels approved, approve the leave
            LeaveService.approve_leave(leave_id, approver_id)
        else:
            # Notify about next level
            next_level = LeaveApprovalLevel.query.filter_by(
                leave_id=leave_id,
                status='pending'
            ).order_by(LeaveApprovalLevel.level.asc()).first()

            if next_level:
                NotificationService.create_notification(
                    user_id=leave.user_id,
                    type='leave_approval_progress',
                    title='Leave Approval Progress',
                    message=f'Your leave request has been approved at level {level}. Pending level {next_level.level} approval.',
                    related_type='leave',
                    related_id=leave.id,
                    title_ar='تقدم الموافقة على الإجازة',
                    message_ar=f'تمت الموافقة على طلب إجازتك في المستوى {level}. في انتظار الموافقة على المستوى {next_level.level}.'
                )

        return approval

    @staticmethod
    def reject_level(leave_id: int, level: int, rejector_id: int, notes: str) -> LeaveApprovalLevel:
        """
        Reject at a specific level.

        Args:
            leave_id: The leave ID
            level: The approval level
            rejector_id: ID of the rejector
            notes: Rejection notes (required)

        Returns:
            LeaveApprovalLevel: The updated approval level
        """
        if not notes:
            raise ValidationError("Rejection notes are required")

        leave = db.session.get(Leave, leave_id)
        if not leave:
            raise NotFoundError(f"Leave {leave_id} not found")

        approval = LeaveApprovalLevel.query.filter_by(
            leave_id=leave_id,
            level=level
        ).first()

        if not approval:
            approval = LeaveApprovalLevel(
                leave_id=leave_id,
                level=level,
                status='pending'
            )
            db.session.add(approval)

        if approval.status != 'pending':
            raise ValidationError(f"Level {level} is not pending approval")

        approval.reject(rejector_id, notes)

        # Reject the entire leave
        LeaveService.reject_leave(leave_id, rejector_id, notes)

        db.session.commit()

        logger.info("Approval level rejected: leave_id=%s level=%s rejector=%s",
                   leave_id, level, rejector_id)

        return approval

    # =========================================================================
    # TEAM CALENDAR
    # =========================================================================

    @staticmethod
    def get_team_calendar(month: int, year: int, role: str = None) -> list:
        """
        Get all leaves for calendar view.

        Args:
            month: Month (1-12)
            year: Year
            role: Optional role filter

        Returns:
            list: [{date, leaves: [{user_id, user_name, leave_type, status, scope}]}]
        """
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(year, month + 1, 1) - timedelta(days=1)

        # Get leaves in range
        query = Leave.query.filter(
            Leave.status.in_(['pending', 'approved']),
            Leave.date_from <= end_date,
            Leave.date_to >= start_date
        )

        if role:
            query = query.join(User).filter(User.role == role)

        leaves = query.all()

        # Group by date
        calendar_data = defaultdict(list)

        for leave in leaves:
            current = max(leave.date_from, start_date)
            end = min(leave.date_to, end_date)

            user = db.session.get(User, leave.user_id)

            while current <= end:
                calendar_data[current.isoformat()].append({
                    'user_id': leave.user_id,
                    'user_name': user.full_name if user else 'Unknown',
                    'role': user.role if user else None,
                    'leave_type': leave.leave_type,
                    'leave_type_id': leave.leave_type_id,
                    'status': leave.status,
                    'scope': leave.scope,
                    'is_half_day': leave.is_half_day,
                    'half_day_period': leave.half_day_period,
                    'leave_id': leave.id
                })
                current += timedelta(days=1)

        # Add holidays
        holidays = LeaveCalendar.get_holidays_in_range(start_date, end_date)
        for holiday in holidays:
            if holiday.date.isoformat() not in calendar_data:
                calendar_data[holiday.date.isoformat()] = []
            calendar_data[holiday.date.isoformat()].append({
                'is_holiday': True,
                'holiday_name': holiday.name,
                'holiday_name_ar': holiday.name_ar,
                'holiday_type': holiday.holiday_type
            })

        # Convert to list
        result = []
        current = start_date
        while current <= end_date:
            result.append({
                'date': current.isoformat(),
                'day_of_week': current.strftime('%A'),
                'is_weekend': current.weekday() >= 5,
                'leaves': calendar_data.get(current.isoformat(), [])
            })
            current += timedelta(days=1)

        return result

    # =========================================================================
    # REPORTS
    # =========================================================================

    @staticmethod
    def get_leave_summary(date_from: date, date_to: date, role: str = None) -> dict:
        """
        Generate leave summary report.

        Args:
            date_from: Start date
            date_to: End date
            role: Optional role filter

        Returns:
            dict: {total_requests, approved, rejected, pending, by_type, by_role, avg_duration}
        """
        query = Leave.query.filter(
            Leave.date_from >= date_from,
            Leave.date_to <= date_to
        )

        if role:
            query = query.join(User).filter(User.role == role)

        leaves = query.all()

        total = len(leaves)
        approved = sum(1 for l in leaves if l.status == 'approved')
        rejected = sum(1 for l in leaves if l.status == 'rejected')
        pending = sum(1 for l in leaves if l.status == 'pending')
        cancelled = sum(1 for l in leaves if l.status == 'cancelled')

        # By type
        by_type = defaultdict(int)
        for leave in leaves:
            by_type[leave.leave_type] += 1

        # By role
        by_role = defaultdict(int)
        for leave in leaves:
            user = db.session.get(User, leave.user_id)
            if user:
                by_role[user.role] += 1

        # Average duration
        total_days = sum(l.total_days for l in leaves if l.total_days)
        avg_duration = round(total_days / total, 2) if total > 0 else 0

        return {
            'period': {
                'from': date_from.isoformat(),
                'to': date_to.isoformat()
            },
            'total_requests': total,
            'approved': approved,
            'rejected': rejected,
            'pending': pending,
            'cancelled': cancelled,
            'by_type': dict(by_type),
            'by_role': dict(by_role),
            'total_days': total_days,
            'avg_duration': avg_duration
        }

    @staticmethod
    def get_utilization_report(year: int = None) -> list:
        """
        Get leave utilization per user.

        Args:
            year: Optional year (defaults to current year)

        Returns:
            list: [{user_id, user_name, role, total_allowance, used, remaining, utilization_rate}]
        """
        if year is None:
            year = datetime.utcnow().year

        year_start = date(year, 1, 1)
        year_end = date(year, 12, 31)

        users = User.query.filter_by(is_active=True).all()
        result = []

        for user in users:
            # Get balance info
            try:
                balance_info = LeaveService.get_detailed_balance(user.id)
            except Exception:
                continue

            # Calculate totals
            total_allowance = 0
            total_used = 0

            for leave_type_code, balance in balance_info.items():
                if isinstance(balance, dict):
                    total_allowance += balance.get('total', 0)
                    total_used += balance.get('used', 0)

            utilization_rate = round(total_used / total_allowance * 100, 2) if total_allowance > 0 else 0

            result.append({
                'user_id': user.id,
                'user_name': user.full_name,
                'role': user.role,
                'total_allowance': total_allowance,
                'used': total_used,
                'remaining': total_allowance - total_used,
                'utilization_rate': utilization_rate,
                'balance_breakdown': balance_info
            })

        # Sort by utilization rate descending
        result.sort(key=lambda x: x['utilization_rate'], reverse=True)

        return result
