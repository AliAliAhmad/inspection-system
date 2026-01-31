"""
Service for leave management.
Handles leave requests, approvals, and company-wide notifications.
"""

import logging
from app.models import Leave, User
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import datetime, date

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

        # Check for overlapping leaves
        overlap = Leave.query.filter(
            Leave.user_id == user_id,
            Leave.status.in_(['pending', 'approved']),
            Leave.date_from <= date_to,
            Leave.date_to >= date_from
        ).first()
        if overlap:
            raise ValidationError("You have an overlapping leave request")

        total_days = (date_to - date_from).days + 1

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
