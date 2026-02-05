"""
Service for job takeover workflow.
Stalled jobs (paused 3+ days) become available for takeover.
Queue-based: first come first serve, admin approves.
+3 stars bonus for successful completion.
"""

import logging
from app.models import JobTakeover, SpecialistJob, EngineerJob, InspectionAssignment, User, PauseLog
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class TakeoverService:
    """Service for managing job takeover requests."""

    @staticmethod
    def get_stalled_jobs():
        """
        Find jobs that have been paused for 3+ days.
        These become available for takeover.
        """
        threshold = datetime.utcnow() - timedelta(days=3)

        stalled_specialist = SpecialistJob.query.filter(
            SpecialistJob.status == 'paused',
            SpecialistJob.paused_at <= threshold
        ).all()

        stalled_engineer = EngineerJob.query.filter(
            EngineerJob.status == 'paused',
            EngineerJob.paused_at <= threshold
        ).all()

        results = []
        for job in stalled_specialist:
            results.append({
                'job_type': 'specialist',
                'job_id': job.id,
                'job': job.to_dict(include_details=False),
                'paused_since': job.paused_at.isoformat() if job.paused_at else None
            })
        for job in stalled_engineer:
            results.append({
                'job_type': 'engineer',
                'job_id': job.id,
                'job': job.to_dict(),
                'paused_since': job.paused_at.isoformat() if job.paused_at else None
            })

        return results

    @staticmethod
    def get_backlog_inspections():
        """Get inspection assignments that have triggered backlog."""
        return InspectionAssignment.query.filter_by(
            backlog_triggered=True
        ).filter(
            InspectionAssignment.status.in_(['assigned', 'in_progress'])
        ).all()

    @staticmethod
    def request_takeover(job_type, job_id, requested_by, reason=None, partner_id=None):
        """
        Request to take over a stalled/backlog job.
        Queue position is auto-assigned.

        Args:
            job_type: 'specialist', 'engineer', or 'inspection'
            job_id: ID of the job
            requested_by: User ID requesting takeover
            reason: Optional reason
            partner_id: Required for inspection takeover (need a pair)
        """
        if job_type not in ('specialist', 'engineer', 'inspection'):
            raise ValidationError("Invalid job type")

        if job_type == 'inspection' and not partner_id:
            raise ValidationError("Inspection takeover requires a partner")

        # Check for duplicate pending request
        existing = JobTakeover.query.filter_by(
            job_type=job_type,
            job_id=job_id,
            requested_by=requested_by,
            status='pending'
        ).first()
        if existing:
            raise ValidationError("You already have a pending takeover request for this job")

        # Calculate queue position
        current_max = db.session.query(db.func.max(JobTakeover.queue_position)).filter_by(
            job_type=job_type,
            job_id=job_id,
            status='pending'
        ).scalar() or 0

        takeover = JobTakeover(
            job_type=job_type,
            job_id=job_id,
            requested_by=requested_by,
            partner_id=partner_id,
            reason=reason,
            queue_position=current_max + 1
        )
        db.session.add(takeover)
        db.session.commit()
        logger.info("Takeover requested: takeover_id=%s job_type=%s job_id=%s by user_id=%s queue_pos=%s", takeover.id, job_type, job_id, requested_by, takeover.queue_position)

        # Notify admins
        from app.services.notification_service import NotificationService
        admins = User.query.filter_by(role='admin', is_active=True).all()
        requester = db.session.get(User, requested_by)
        for admin in admins:
            NotificationService.create_notification(
                user_id=admin.id,
                type='takeover_requested',
                title='Job Takeover Requested',
                message=f'{requester.full_name} requests takeover of {job_type} job #{job_id} (Queue #{current_max + 1})',
                related_type='job_takeover',
                related_id=takeover.id
            )

        return takeover

    @staticmethod
    def approve_takeover(takeover_id, admin_id):
        """
        Approve a takeover request.
        Reassigns the job to the new person.
        Denies all other pending requests for the same job.
        """
        takeover = db.session.get(JobTakeover, takeover_id)
        if not takeover:
            raise NotFoundError(f"Takeover request {takeover_id} not found")
        if takeover.status != 'pending':
            raise ValidationError("Takeover request is not pending")

        admin = db.session.get(User, admin_id)
        if not admin or admin.role != 'admin':
            raise ForbiddenError("Admin access required")

        takeover.status = 'approved'
        takeover.approved_by = admin_id
        takeover.approved_at = datetime.utcnow()

        # Reassign job
        if takeover.job_type == 'specialist':
            job = db.session.get(SpecialistJob, takeover.job_id)
            if job:
                job.specialist_id = takeover.requested_by
                job.status = 'assigned'
                job.paused_at = None
        elif takeover.job_type == 'engineer':
            job = db.session.get(EngineerJob, takeover.job_id)
            if job:
                job.engineer_id = takeover.requested_by
                job.status = 'assigned'
                job.paused_at = None
        elif takeover.job_type == 'inspection':
            assignment = db.session.get(InspectionAssignment, takeover.job_id)
            if assignment:
                # Create new assignment as takeover
                new_assignment = InspectionAssignment(
                    inspection_list_id=assignment.inspection_list_id,
                    equipment_id=assignment.equipment_id,
                    template_id=assignment.template_id,
                    berth=assignment.berth,
                    mechanical_inspector_id=takeover.requested_by,
                    electrical_inspector_id=takeover.partner_id,
                    shift=assignment.shift,
                    assigned_by=admin_id,
                    assigned_at=datetime.utcnow(),
                    deadline=datetime.utcnow() + timedelta(hours=30),
                    status='assigned',
                    is_takeover=True,
                    original_assignment_id=assignment.id
                )
                db.session.add(new_assignment)

        # Deny all other pending requests for the same job
        other_requests = JobTakeover.query.filter(
            JobTakeover.job_type == takeover.job_type,
            JobTakeover.job_id == takeover.job_id,
            JobTakeover.id != takeover.id,
            JobTakeover.status == 'pending'
        ).all()
        for req in other_requests:
            req.status = 'denied'
            req.approved_by = admin_id
            req.approved_at = datetime.utcnow()

        db.session.commit()
        logger.info("Takeover approved: takeover_id=%s job_type=%s job_id=%s admin_id=%s new_owner=%s", takeover_id, takeover.job_type, takeover.job_id, admin_id, takeover.requested_by)

        # Notify requester
        from app.services.notification_service import NotificationService
        NotificationService.create_notification(
            user_id=takeover.requested_by,
            type='takeover_approved',
            title='Takeover Request Approved',
            message=f'Your takeover request for {takeover.job_type} job #{takeover.job_id} has been approved',
            related_type='job_takeover',
            related_id=takeover.id
        )

        return takeover

    @staticmethod
    def deny_takeover(takeover_id, admin_id):
        """Deny a takeover request."""
        takeover = db.session.get(JobTakeover, takeover_id)
        if not takeover:
            raise NotFoundError(f"Takeover request {takeover_id} not found")
        if takeover.status != 'pending':
            raise ValidationError("Takeover request is not pending")

        takeover.status = 'denied'
        takeover.approved_by = admin_id
        takeover.approved_at = datetime.utcnow()
        db.session.commit()

        from app.services.notification_service import NotificationService
        NotificationService.create_notification(
            user_id=takeover.requested_by,
            type='takeover_denied',
            title='Takeover Request Denied',
            message=f'Your takeover request for {takeover.job_type} job #{takeover.job_id} has been denied',
            related_type='job_takeover',
            related_id=takeover.id
        )

        return takeover

    @staticmethod
    def complete_takeover(takeover_id):
        """
        Mark takeover as completed and award +3 bonus stars.
        Called when the taken-over job is completed.
        """
        takeover = db.session.get(JobTakeover, takeover_id)
        if not takeover:
            raise NotFoundError(f"Takeover request {takeover_id} not found")
        if takeover.status != 'approved':
            raise ValidationError("Takeover must be approved first")

        takeover.status = 'completed'
        takeover.completed_at = datetime.utcnow()
        takeover.bonus_awarded = True

        # Award +3 bonus stars
        user = db.session.get(User, takeover.requested_by)
        if user:
            role = 'specialist' if takeover.job_type == 'specialist' else 'inspector'
            user.add_points(3, role)

        db.session.commit()
        logger.info("Takeover completed: takeover_id=%s job_type=%s job_id=%s user_id=%s bonus=+3", takeover_id, takeover.job_type, takeover.job_id, takeover.requested_by)

        from app.services.notification_service import NotificationService
        NotificationService.create_notification(
            user_id=takeover.requested_by,
            type='takeover_bonus',
            title='Takeover Bonus Awarded!',
            message='You earned +3 bonus stars for completing a takeover job!',
            related_type='job_takeover',
            related_id=takeover.id
        )

        return takeover

    @staticmethod
    def get_takeover_queue(job_type, job_id):
        """Get pending takeover requests for a job, ordered by queue position."""
        return JobTakeover.query.filter_by(
            job_type=job_type,
            job_id=job_id,
            status='pending'
        ).order_by(JobTakeover.queue_position.asc()).all()
