"""
Service for Quality Engineer review workflow.
QE reviews completed specialist/engineer jobs.
Admin validates QE rejections.
"""

import logging
from app.models import QualityReview, SpecialistJob, EngineerJob, User
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class QualityService:
    """Service for managing quality engineer reviews."""

    REJECTION_CATEGORIES = [
        'incomplete_work', 'poor_quality', 'safety_violation',
        'missing_documentation', 'wrong_procedure', 'other'
    ]

    @staticmethod
    def create_review(job_type, job_id, qe_id):
        """
        Create a quality review when a specialist/engineer job is completed.
        Auto-assigns QE and sets SLA deadline.

        Args:
            job_type: 'specialist' or 'engineer'
            job_id: ID of completed job
            qe_id: Quality engineer user ID
        """
        if job_type not in ('specialist', 'engineer'):
            raise ValidationError("job_type must be 'specialist' or 'engineer'")

        qe = db.session.get(User, qe_id)
        if not qe or not qe.has_role('quality_engineer'):
            raise ValidationError("Invalid quality engineer")

        # Verify job exists and is completed
        if job_type == 'specialist':
            job = db.session.get(SpecialistJob, job_id)
        else:
            job = db.session.get(EngineerJob, job_id)

        if not job:
            raise NotFoundError(f"Job {job_id} not found")
        if job.status != 'completed':
            raise ValidationError("Job must be completed before quality review")

        # Check for existing review
        existing = QualityReview.query.filter_by(
            job_type=job_type,
            job_id=job_id
        ).first()
        if existing:
            raise ValidationError("Quality review already exists for this job")

        # SLA: 48 hours to complete review
        sla_deadline = datetime.utcnow() + timedelta(hours=48)

        review = QualityReview(
            job_type=job_type,
            job_id=job_id,
            qe_id=qe_id,
            status='pending',
            sla_deadline=sla_deadline
        )
        db.session.add(review)

        # Update job QE reference
        if job_type == 'specialist':
            job.qe_id = qe_id
        else:
            job.qe_id = qe_id

        db.session.commit()

        from app.services.notification_service import NotificationService
        NotificationService.create_notification(
            user_id=qe_id,
            type='quality_review_assigned',
            title='New Quality Review',
            message=f'Please review {job_type} job #{job_id}. SLA: 48 hours',
            related_type='quality_review',
            related_id=review.id
        )

        return review

    @staticmethod
    def approve_review(review_id, qe_id, qc_rating, notes=None):
        """
        QE approves a job quality review.

        Args:
            review_id: QualityReview ID
            qe_id: QE user ID
            qc_rating: Quality rating (1-5)
            notes: Optional notes
        """
        review = db.session.get(QualityReview, review_id)
        if not review:
            raise NotFoundError(f"Review {review_id} not found")
        if review.qe_id != qe_id:
            raise ForbiddenError("This review is not assigned to you")
        if review.status != 'pending':
            raise ValidationError("Review is not pending")

        if not isinstance(qc_rating, int) or qc_rating < 1 or qc_rating > 5:
            raise ValidationError("QC rating must be between 1 and 5")

        review.status = 'approved'
        review.reviewed_at = datetime.utcnow()
        review.notes = notes
        review.sla_met = datetime.utcnow() <= review.sla_deadline if review.sla_deadline else True

        # Update job QC rating
        if review.job_type == 'specialist':
            job = db.session.get(SpecialistJob, review.job_id)
            if job:
                job.qc_rating = qc_rating
                job.status = 'qc_approved'
        else:
            job = db.session.get(EngineerJob, review.job_id)
            if job:
                job.qc_rating = qc_rating
                job.status = 'qc_approved'

        db.session.commit()
        logger.info("Quality review approved: review_id=%s qe_id=%s rating=%s job_type=%s job_id=%s", review_id, qe_id, qc_rating, review.job_type, review.job_id)

        # Notify the worker
        if review.job_type == 'specialist':
            worker_id = db.session.get(SpecialistJob, review.job_id).specialist_id
        else:
            worker_id = db.session.get(EngineerJob, review.job_id).engineer_id

        from app.services.notification_service import NotificationService
        NotificationService.create_notification(
            user_id=worker_id,
            type='quality_approved',
            title='Quality Review Approved',
            message=f'Your {review.job_type} job has been approved with QC rating: {qc_rating}',
            related_type='quality_review',
            related_id=review.id
        )

        return review

    @staticmethod
    def reject_review(review_id, qe_id, rejection_reason, rejection_category, evidence_photos=None):
        """
        QE rejects a job quality review.
        Rejection goes to admin for validation.

        Args:
            review_id: QualityReview ID
            qe_id: QE user ID
            rejection_reason: Detailed rejection reason
            rejection_category: Predefined category
            evidence_photos: Optional JSON list of photo paths
        """
        review = db.session.get(QualityReview, review_id)
        if not review:
            raise NotFoundError(f"Review {review_id} not found")
        if review.qe_id != qe_id:
            raise ForbiddenError("This review is not assigned to you")
        if review.status != 'pending':
            raise ValidationError("Review is not pending")

        if rejection_category not in QualityService.REJECTION_CATEGORIES:
            raise ValidationError(f"Invalid rejection category. Must be one of: {', '.join(QualityService.REJECTION_CATEGORIES)}")

        if not rejection_reason or len(rejection_reason) < 20:
            raise ValidationError("Rejection reason must be at least 20 characters")

        review.status = 'rejected'
        review.rejection_reason = rejection_reason
        review.rejection_category = rejection_category
        review.evidence_photos = evidence_photos
        review.reviewed_at = datetime.utcnow()
        review.sla_met = datetime.utcnow() <= review.sla_deadline if review.sla_deadline else True

        db.session.commit()
        logger.info("Quality review rejected: review_id=%s qe_id=%s category=%s job_type=%s job_id=%s", review_id, qe_id, rejection_category, review.job_type, review.job_id)

        # Notify admins for validation
        from app.services.notification_service import NotificationService
        admins = User.query.filter_by(role='admin', is_active=True).all()
        for admin in admins:
            NotificationService.create_notification(
                user_id=admin.id,
                type='quality_rejection_pending',
                title='QE Rejection Needs Validation',
                message=f'QE rejected {review.job_type} job #{review.job_id}: {rejection_category}',
                related_type='quality_review',
                related_id=review.id,
                priority='warning'
            )

        return review

    @staticmethod
    def validate_rejection(review_id, admin_id, is_valid):
        """
        Admin validates whether QE rejection was correct.

        If valid: specialist loses 2 points, QE gains 2 points
        If wrong: QE loses 2 points

        Args:
            review_id: QualityReview ID
            admin_id: Admin user ID
            is_valid: True if QE rejection was valid, False if wrong
        """
        review = db.session.get(QualityReview, review_id)
        if not review:
            raise NotFoundError(f"Review {review_id} not found")
        if review.status != 'rejected':
            raise ValidationError("Only rejected reviews can be validated")

        admin = db.session.get(User, admin_id)
        if not admin or admin.role != 'admin':
            raise ForbiddenError("Admin access required")

        review.admin_validation = 'valid' if is_valid else 'wrong'
        review.admin_validation_by = admin_id
        review.admin_validated_at = datetime.utcnow()

        qe = db.session.get(User, review.qe_id)

        if is_valid:
            # QE was right: specialist -2, QE +2
            if review.job_type == 'specialist':
                worker = db.session.get(User, db.session.get(SpecialistJob, review.job_id).specialist_id)
                if worker:
                    worker.add_points(-2, 'specialist')
            else:
                worker = db.session.get(User, db.session.get(EngineerJob, review.job_id).engineer_id)
                if worker:
                    worker.add_points(-2, 'engineer')
            if qe:
                qe.add_points(2, 'quality_engineer')
        else:
            # QE was wrong: QE -2
            if qe:
                qe.add_points(-2, 'quality_engineer')

        db.session.commit()
        logger.info("Rejection validated: review_id=%s admin_id=%s is_valid=%s qe_id=%s", review_id, admin_id, is_valid, review.qe_id)

        # Notify QE of validation result
        from app.services.notification_service import NotificationService
        NotificationService.create_notification(
            user_id=review.qe_id,
            type='rejection_validated',
            title='Rejection Validation Result',
            message=f'Your rejection was deemed {"valid" if is_valid else "invalid"} by admin',
            related_type='quality_review',
            related_id=review.id
        )

        return review

    @staticmethod
    def get_pending_reviews(qe_id=None):
        """Get pending quality reviews, optionally filtered by QE."""
        query = QualityReview.query.filter_by(status='pending')
        if qe_id:
            query = query.filter_by(qe_id=qe_id)
        return query.order_by(QualityReview.sla_deadline.asc()).all()

    @staticmethod
    def get_overdue_reviews():
        """Get reviews past their SLA deadline."""
        now = datetime.utcnow()
        overdue = QualityReview.query.filter(
            QualityReview.status == 'pending',
            QualityReview.sla_deadline < now
        ).all()
        if overdue:
            logger.warning("Overdue quality reviews detected: count=%s review_ids=%s", len(overdue), [r.id for r in overdue])
        return overdue
