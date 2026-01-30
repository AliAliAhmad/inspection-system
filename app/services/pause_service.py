"""
Service for managing job pause/resume workflow.
Specialist must provide mandatory reason for pausing.
Admin or delegated engineer can approve.
"""

import logging
from app.models import PauseLog, SpecialistJob, EngineerJob, User
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import datetime

logger = logging.getLogger(__name__)


class PauseService:
    """Service for managing job pause requests and approvals."""

    @staticmethod
    def request_pause(job_type, job_id, requested_by, reason_category, reason_details=None):
        """
        Request a pause for a specialist or engineer job.

        Args:
            job_type: 'specialist' or 'engineer'
            job_id: ID of the job
            requested_by: User ID requesting pause
            reason_category: parts, duty_finish, tools, manpower, oem, other
            reason_details: Optional additional details
        """
        valid_categories = ['parts', 'duty_finish', 'tools', 'manpower', 'oem', 'other']
        if reason_category not in valid_categories:
            raise ValidationError(f"Reason must be one of: {', '.join(valid_categories)}")

        if reason_category == 'other' and not reason_details:
            raise ValidationError("Details required when reason is 'other'")

        # Validate job exists and is in progress
        if job_type == 'specialist':
            job = db.session.get(SpecialistJob, job_id)
        elif job_type == 'engineer':
            job = db.session.get(EngineerJob, job_id)
        else:
            raise ValidationError("job_type must be 'specialist' or 'engineer'")

        if not job:
            raise NotFoundError(f"Job {job_id} not found")
        if job.status != 'in_progress':
            raise ValidationError("Can only pause in-progress jobs")

        # Check for existing pending pause
        existing = PauseLog.query.filter_by(
            job_type=job_type,
            job_id=job_id,
            status='pending'
        ).first()
        if existing:
            raise ValidationError("A pause request is already pending for this job")

        pause = PauseLog(
            job_type=job_type,
            job_id=job_id,
            requested_by=requested_by,
            reason_category=reason_category,
            reason_details=reason_details,
            status='pending'
        )
        db.session.add(pause)
        db.session.commit()
        logger.info("Pause requested: pause_id=%s job_type=%s job_id=%s by user_id=%s reason=%s", pause.id, job_type, job_id, requested_by, reason_category)

        # Notify admins and engineers
        from app.services.notification_service import NotificationService
        admins = User.query.filter_by(role='admin', is_active=True).all()
        for admin in admins:
            NotificationService.create_notification(
                user_id=admin.id,
                type='pause_requested',
                title='Job Pause Requested',
                message=f'Pause requested for {job_type} job #{job_id}: {reason_category}',
                related_type='pause_log',
                related_id=pause.id
            )

        return pause

    @staticmethod
    def approve_pause(pause_id, approved_by):
        """Approve a pause request. Admin or delegated engineer."""
        pause = db.session.get(PauseLog, pause_id)
        if not pause:
            raise NotFoundError(f"Pause request {pause_id} not found")
        if pause.status != 'pending':
            raise ValidationError("Pause request is not pending")

        approver = db.session.get(User, approved_by)
        if not approver or approver.role not in ('admin', 'engineer'):
            raise ForbiddenError("Only admins or engineers can approve pauses")

        pause.status = 'approved'
        pause.approved_by = approved_by
        pause.approved_at = datetime.utcnow()

        # Update job status
        if pause.job_type == 'specialist':
            job = db.session.get(SpecialistJob, pause.job_id)
        else:
            job = db.session.get(EngineerJob, pause.job_id)

        if job:
            job.status = 'paused'
            job.paused_at = datetime.utcnow()

        db.session.commit()
        logger.info("Pause approved: pause_id=%s job_type=%s job_id=%s approved_by=%s", pause_id, pause.job_type, pause.job_id, approved_by)

        # Notify requester
        from app.services.notification_service import NotificationService
        NotificationService.create_notification(
            user_id=pause.requested_by,
            type='pause_approved',
            title='Pause Request Approved',
            message=f'Your pause request for job #{pause.job_id} has been approved',
            related_type='pause_log',
            related_id=pause.id
        )

        return pause

    @staticmethod
    def deny_pause(pause_id, denied_by):
        """Deny a pause request."""
        pause = db.session.get(PauseLog, pause_id)
        if not pause:
            raise NotFoundError(f"Pause request {pause_id} not found")
        if pause.status != 'pending':
            raise ValidationError("Pause request is not pending")

        pause.status = 'denied'
        pause.approved_by = denied_by
        pause.approved_at = datetime.utcnow()
        db.session.commit()

        from app.services.notification_service import NotificationService
        NotificationService.create_notification(
            user_id=pause.requested_by,
            type='pause_denied',
            title='Pause Request Denied',
            message=f'Your pause request for job #{pause.job_id} has been denied',
            related_type='pause_log',
            related_id=pause.id
        )

        return pause

    @staticmethod
    def resume_job(pause_id, resumed_by):
        """Resume a paused job."""
        pause = db.session.get(PauseLog, pause_id)
        if not pause:
            raise NotFoundError(f"Pause request {pause_id} not found")
        if pause.status != 'approved':
            raise ValidationError("Can only resume approved pauses")

        now = datetime.utcnow()
        pause.resumed_at = now

        # Calculate pause duration
        if pause.approved_at:
            duration = (now - pause.approved_at).total_seconds() / 60
            pause.duration_minutes = int(duration)

        # Update job
        if pause.job_type == 'specialist':
            job = db.session.get(SpecialistJob, pause.job_id)
        else:
            job = db.session.get(EngineerJob, pause.job_id)

        if job:
            job.status = 'in_progress'
            job.paused_at = None
            # Accumulate pause duration
            job.paused_duration_minutes = (job.paused_duration_minutes or 0) + (pause.duration_minutes or 0)

        db.session.commit()
        logger.info("Job resumed: pause_id=%s job_type=%s job_id=%s duration_minutes=%s", pause_id, pause.job_type, pause.job_id, pause.duration_minutes)
        return pause

    @staticmethod
    def admin_force_pause(job_type, job_id, admin_id, reason='Admin forced pause'):
        """Admin force-pauses a job without approval flow."""
        if job_type == 'specialist':
            job = db.session.get(SpecialistJob, job_id)
        else:
            job = db.session.get(EngineerJob, job_id)

        if not job:
            raise NotFoundError(f"Job {job_id} not found")

        pause = PauseLog(
            job_type=job_type,
            job_id=job_id,
            requested_by=admin_id,
            reason_category='other',
            reason_details=reason,
            status='approved',
            approved_by=admin_id,
            approved_at=datetime.utcnow()
        )
        db.session.add(pause)

        job.status = 'paused'
        job.paused_at = datetime.utcnow()
        db.session.commit()
        logger.info("Admin force-paused: job_type=%s job_id=%s admin_id=%s reason=%s", job_type, job_id, admin_id, reason)

        return pause

    @staticmethod
    def get_pause_history(job_type, job_id):
        """Get all pause logs for a job."""
        return PauseLog.query.filter_by(
            job_type=job_type,
            job_id=job_id
        ).order_by(PauseLog.requested_at.desc()).all()

    @staticmethod
    def get_pending_pauses():
        """Get all pending pause requests."""
        return PauseLog.query.filter_by(status='pending').order_by(
            PauseLog.requested_at.asc()
        ).all()
