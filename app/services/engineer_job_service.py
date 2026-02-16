"""
Service for engineer job lifecycle.
Three job types: custom_project, system_review, special_task.
"""

import logging
from app.models import EngineerJob, User, Equipment
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import datetime

logger = logging.getLogger(__name__)


class EngineerJobService:
    """Service for managing engineer jobs."""

    @staticmethod
    def _generate_job_id(engineer):
        """Generate role-based job ID like ENG001-089."""
        count = EngineerJob.query.filter_by(engineer_id=engineer.id).count()
        eng_num = engineer.role_id or f'ENG{engineer.id:03d}'
        return f'{eng_num}-{count + 1:03d}'

    @staticmethod
    def _next_universal_id():
        """Get next universal sequential ID."""
        max_id = db.session.query(db.func.max(EngineerJob.universal_id)).scalar()
        return (max_id or 0) + 1

    @staticmethod
    def create_job(engineer_id, job_type, title, description, equipment_id=None, category='minor', major_reason=None):
        """
        Create a new engineer job.

        Args:
            engineer_id: User ID of engineer
            job_type: custom_project, system_review, special_task
            title: Job title
            description: Job description
            equipment_id: Optional equipment reference
            category: major or minor
            major_reason: Required if category is major
        """
        engineer = db.session.get(User, engineer_id)
        if not engineer or not engineer.has_role('engineer'):
            raise ValidationError("Invalid engineer")

        valid_types = ['custom_project', 'system_review', 'special_task']
        if job_type not in valid_types:
            raise ValidationError(f"Job type must be one of: {', '.join(valid_types)}")

        if category == 'major' and not major_reason:
            raise ValidationError("Reason required for major category jobs")

        if equipment_id:
            equip = db.session.get(Equipment, equipment_id)
            if not equip:
                raise NotFoundError(f"Equipment {equipment_id} not found")

        job = EngineerJob(
            universal_id=EngineerJobService._next_universal_id(),
            job_id=EngineerJobService._generate_job_id(engineer),
            engineer_id=engineer_id,
            job_type=job_type,
            equipment_id=equipment_id,
            title=title,
            description=description,
            category=category,
            major_reason=major_reason,
            status='assigned'
        )
        db.session.add(job)
        db.session.commit()
        logger.info("Engineer job created: job_id=%s engineer_id=%s type=%s category=%s", job.id, engineer_id, job_type, category)

        from app.services.notification_service import NotificationService
        NotificationService.create_notification(
            user_id=engineer_id,
            type='engineer_job_created',
            title='New Engineer Job',
            message=f'Job {job.job_id}: {title}',
            related_type='engineer_job',
            related_id=job.id
        )

        return job

    @staticmethod
    def enter_planned_time(job_id, engineer_id, planned_time_days, planned_time_hours):
        """Enter planned time estimate before viewing job details."""
        job = db.session.get(EngineerJob, job_id)
        if not job:
            raise NotFoundError(f"Job {job_id} not found")
        if job.engineer_id != engineer_id:
            raise ForbiddenError("Not your job")
        if job.planned_time_hours:
            raise ValidationError("Planned time already entered")

        job.planned_time_days = planned_time_days
        job.planned_time_hours = planned_time_hours
        job.planned_time_entered_at = datetime.utcnow()
        db.session.commit()
        return job

    @staticmethod
    def start_job(job_id, engineer_id):
        """Start the engineer job timer."""
        job = db.session.get(EngineerJob, job_id)
        if not job:
            raise NotFoundError(f"Job {job_id} not found")
        if job.engineer_id != engineer_id:
            raise ForbiddenError("Not your job")
        if not job.planned_time_hours:
            raise ValidationError("Must enter planned time first")
        if job.started_at:
            raise ValidationError("Job already started")

        job.started_at = datetime.utcnow()
        job.status = 'in_progress'
        db.session.commit()
        logger.info("Engineer job started: job_id=%s engineer_id=%s", job_id, engineer_id)

        # Auto-notification: take show-up photo + record challenges
        from app.api.job_showup import send_job_start_notification
        send_job_start_notification('engineer', job.id, job.engineer_id)

        return job

    @staticmethod
    def complete_job(job_id, engineer_id, work_notes):
        """Complete an engineer job."""
        job = db.session.get(EngineerJob, job_id)
        if not job:
            raise NotFoundError(f"Job {job_id} not found")
        if job.engineer_id != engineer_id:
            raise ForbiddenError("Not your job")
        if not job.started_at:
            raise ValidationError("Job must be started first")
        if not work_notes or len(work_notes) < 10:
            raise ValidationError("Work notes required (min 10 characters)")

        now = datetime.utcnow()
        job.completed_at = now
        job.work_notes = work_notes
        job.status = 'completed'

        # Calculate actual time
        time_diff = now - job.started_at
        total_minutes = time_diff.total_seconds() / 60
        work_minutes = total_minutes - (job.paused_duration_minutes or 0)
        job.actual_time_hours = round(work_minutes / 60, 2)

        # Calculate time rating
        job.time_rating = job.calculate_time_rating()

        db.session.commit()
        logger.info("Engineer job completed: job_id=%s engineer_id=%s actual_hours=%s time_rating=%s", job_id, engineer_id, job.actual_time_hours, job.time_rating)

        # Auto-create quality review
        from app.services.quality_service import QualityService
        qes = User.query.filter(
            User.is_active == True,
            User.is_on_leave == False
        ).filter(
            db.or_(User.role == 'quality_engineer', User.minor_role == 'quality_engineer')
        ).all()

        if qes:
            # Assign to QE with fewest pending reviews
            from app.models import QualityReview
            min_count = None
            selected_qe = qes[0]
            for qe in qes:
                count = QualityReview.query.filter_by(qe_id=qe.id, status='pending').count()
                if min_count is None or count < min_count:
                    min_count = count
                    selected_qe = qe
            QualityService.create_review('engineer', job.id, selected_qe.id)

        return job

    @staticmethod
    def get_engineer_jobs(engineer_id, status=None):
        """Get all jobs for an engineer."""
        query = EngineerJob.query.filter_by(engineer_id=engineer_id)
        if status:
            query = query.filter_by(status=status)
        return query.order_by(EngineerJob.created_at.desc()).all()
