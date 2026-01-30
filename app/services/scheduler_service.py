"""
Background scheduled tasks using APScheduler.
Handles: daily list generation, backlog detection, stalled jobs,
expired leaves, QE SLA monitoring.
"""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
import atexit
import logging

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler()


def init_scheduler(app):
    """Initialize and start the background scheduler."""

    def run_with_context(fn):
        """Wrapper to run jobs within Flask app context."""
        def wrapper():
            with app.app_context():
                try:
                    fn()
                except Exception as e:
                    logger.error(f"Scheduled task {fn.__name__} failed: {e}")
        return wrapper

    # 1. Generate daily inspection lists at 1:00 PM
    @run_with_context
    def generate_daily_lists():
        from app.services.inspection_list_service import InspectionListService
        from datetime import date, timedelta
        logger.info("Running: generate_daily_lists")

        tomorrow = date.today() + timedelta(days=1)
        for shift in ['day', 'night']:
            try:
                il = InspectionListService.generate_daily_list(tomorrow, shift)
                logger.info(f"Generated {il.total_assets} assignments for {tomorrow} {shift}")
            except Exception as e:
                logger.warning(f"List generation for {tomorrow} {shift}: {e}")

    # 2. Check for backlog (assignments past 30-hour deadline)
    @run_with_context
    def check_backlog():
        from app.services.inspection_list_service import InspectionListService
        logger.info("Running: check_backlog")
        overdue = InspectionListService.check_backlog()
        if overdue:
            logger.warning(f"Found {len(overdue)} overdue assignments")

    # 3. Detect stalled jobs (paused 3+ days) and notify
    @run_with_context
    def detect_stalled_jobs():
        from app.services.takeover_service import TakeoverService
        from app.services.notification_service import NotificationService
        from app.models import User
        logger.info("Running: detect_stalled_jobs")

        stalled = TakeoverService.get_stalled_jobs()
        if stalled:
            # Notify all same-role users
            users = User.query.filter_by(is_active=True, is_on_leave=False).all()
            for job_info in stalled:
                for u in users:
                    if u.has_role('specialist') and job_info['job_type'] == 'specialist':
                        NotificationService.create_notification(
                            user_id=u.id,
                            type='stalled_job_available',
                            title='Stalled Job Available for Takeover',
                            message=f'{job_info["job_type"]} job #{job_info["job_id"]} is available for takeover',
                            related_type='job_takeover',
                            related_id=job_info['job_id'],
                            priority='warning'
                        )
            logger.info(f"Found {len(stalled)} stalled jobs, notifications sent")

    # 4. End expired leaves
    @run_with_context
    def check_expired_leaves():
        from app.services.leave_service import LeaveService
        logger.info("Running: check_expired_leaves")
        expired = LeaveService.check_expired_leaves()
        if expired:
            logger.info(f"Ended {len(expired)} expired leaves")

    # 5. Activate leaves that start today
    @run_with_context
    def activate_starting_leaves():
        from app.models import Leave, User
        from app.extensions import db
        from datetime import date
        logger.info("Running: activate_starting_leaves")

        today = date.today()
        starting = Leave.query.filter(
            Leave.status == 'approved',
            Leave.date_from == today
        ).all()
        for leave in starting:
            user = db.session.get(User, leave.user_id)
            if user and not user.is_on_leave:
                user.is_on_leave = True
                logger.info(f"Activated leave for {user.full_name}")
        db.session.commit()

    # 6. Monitor QE SLA deadlines
    @run_with_context
    def monitor_qe_sla():
        from app.services.quality_service import QualityService
        from app.services.notification_service import NotificationService
        logger.info("Running: monitor_qe_sla")

        overdue = QualityService.get_overdue_reviews()
        for review in overdue:
            NotificationService.create_notification(
                user_id=review.qe_id,
                type='sla_warning',
                title='SLA Deadline Exceeded',
                message=f'Quality review #{review.id} has passed its SLA deadline',
                related_type='quality_review',
                related_id=review.id,
                priority='urgent'
            )
        if overdue:
            logger.warning(f"Found {len(overdue)} overdue QE reviews")

    # Schedule jobs
    scheduler.add_job(
        generate_daily_lists,
        CronTrigger(hour=13, minute=0),
        id='generate_daily_lists',
        name='Generate daily inspection lists at 1:00 PM',
        replace_existing=True
    )

    scheduler.add_job(
        check_backlog,
        IntervalTrigger(hours=1),
        id='check_backlog',
        name='Check for overdue assignments every hour',
        replace_existing=True
    )

    scheduler.add_job(
        detect_stalled_jobs,
        IntervalTrigger(hours=6),
        id='detect_stalled_jobs',
        name='Detect stalled jobs every 6 hours',
        replace_existing=True
    )

    scheduler.add_job(
        check_expired_leaves,
        CronTrigger(hour=0, minute=30),
        id='check_expired_leaves',
        name='Check expired leaves daily at 00:30',
        replace_existing=True
    )

    scheduler.add_job(
        activate_starting_leaves,
        CronTrigger(hour=0, minute=15),
        id='activate_starting_leaves',
        name='Activate starting leaves daily at 00:15',
        replace_existing=True
    )

    scheduler.add_job(
        monitor_qe_sla,
        IntervalTrigger(hours=4),
        id='monitor_qe_sla',
        name='Monitor QE SLA every 4 hours',
        replace_existing=True
    )

    scheduler.start()
    atexit.register(lambda: scheduler.shutdown(wait=False))
    logger.info("Background scheduler started with 6 scheduled jobs")

    return scheduler
