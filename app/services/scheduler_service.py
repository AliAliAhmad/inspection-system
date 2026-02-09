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

    # 7. Auto-flag work plan jobs at end of day shift (7 PM)
    @run_with_context
    def auto_flag_day_shift():
        from app.api.work_plan_tracking import _auto_flag_jobs
        from datetime import date
        logger.info("Running: auto_flag_day_shift")
        flagged = _auto_flag_jobs(date.today(), 'day')
        if flagged:
            logger.info(f"Auto-flagged {flagged} day shift jobs")

    # 8. Auto-flag work plan jobs at end of night shift (7 AM)
    @run_with_context
    def auto_flag_night_shift():
        from app.api.work_plan_tracking import _auto_flag_jobs
        from datetime import date, timedelta
        logger.info("Running: auto_flag_night_shift")
        # Night shift date is the previous day (started 7 PM yesterday)
        flagged = _auto_flag_jobs(date.today() - timedelta(days=1), 'night')
        if flagged:
            logger.info(f"Auto-flagged {flagged} night shift jobs")

    # 9. Send daily review reminders (hourly check)
    @run_with_context
    def send_review_reminders():
        from app.models.work_plan_daily_review import WorkPlanDailyReview
        from app.services.notification_service import NotificationService
        from datetime import date, datetime
        logger.info("Running: send_review_reminders")

        now = datetime.utcnow()
        hour = now.hour
        today = date.today()

        # Day shift review window: 5 PM (17:00) - 1 AM (01:00)
        # Night shift review window: 3 AM (03:00) - 6 AM (06:00)
        if 17 <= hour or hour < 1:
            # Check day shift reviews
            reviews = WorkPlanDailyReview.query.filter_by(
                date=today, shift_type='day'
            ).filter(WorkPlanDailyReview.status != 'submitted').all()
            for review in reviews:
                review.reminders_sent = (review.reminders_sent or 0) + 1
                review.last_reminder_at = now
                NotificationService.create_notification(
                    user_id=review.engineer_id,
                    type='review_reminder',
                    title='Daily Review Reminder',
                    message=f'Your day shift review for {today.isoformat()} is still pending. Please complete it.',
                    related_type='work_plan_daily_review',
                    related_id=review.id,
                    priority='critical' if review.reminders_sent > 2 else 'urgent'
                )
            db.session.commit()

        if 3 <= hour < 6:
            # Check night shift reviews
            yesterday = today - timedelta(days=1)
            reviews = WorkPlanDailyReview.query.filter_by(
                date=yesterday, shift_type='night'
            ).filter(WorkPlanDailyReview.status != 'submitted').all()
            for review in reviews:
                review.reminders_sent = (review.reminders_sent or 0) + 1
                review.last_reminder_at = now
                NotificationService.create_notification(
                    user_id=review.engineer_id,
                    type='review_reminder',
                    title='Night Shift Review Reminder',
                    message=f'Your night shift review for {yesterday.isoformat()} is still pending.',
                    related_type='work_plan_daily_review',
                    related_id=review.id,
                    priority='critical' if review.reminders_sent > 2 else 'urgent'
                )
            db.session.commit()

    # 10. Compute daily performance at midnight
    @run_with_context
    def compute_daily_performance():
        from app.api.work_plan_tracking import _compute_daily_performance
        from datetime import date, timedelta
        logger.info("Running: compute_daily_performance")
        yesterday = date.today() - timedelta(days=1)
        computed = _compute_daily_performance(yesterday)
        logger.info(f"Computed performance for {computed} workers")

    # 11. Send morning job notifications (7 AM)
    @run_with_context
    def send_morning_notifications():
        from app.models import WorkPlanAssignment, WorkPlanJob, WorkPlanDay
        from app.models.work_plan_job_tracking import WorkPlanJobTracking
        from app.models.work_plan_performance import WorkPlanPerformance
        from app.services.notification_service import NotificationService
        from datetime import date, timedelta
        logger.info("Running: send_morning_notifications")

        today = date.today()
        yesterday = today - timedelta(days=1)

        # Get all users with assignments today
        assignments = db.session.query(
            WorkPlanAssignment.user_id
        ).join(
            WorkPlanJob, WorkPlanAssignment.work_plan_job_id == WorkPlanJob.id
        ).join(
            WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id
        ).filter(
            WorkPlanDay.date == today
        ).distinct().all()

        for (user_id,) in assignments:
            # Count today's jobs
            today_count = db.session.query(WorkPlanAssignment).join(
                WorkPlanJob, WorkPlanAssignment.work_plan_job_id == WorkPlanJob.id
            ).join(
                WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id
            ).filter(
                WorkPlanAssignment.user_id == user_id,
                WorkPlanDay.date == today
            ).count()

            # Count carry-overs
            carry_over_count = db.session.query(WorkPlanJobTracking).join(
                WorkPlanJob, WorkPlanJobTracking.work_plan_job_id == WorkPlanJob.id
            ).join(
                WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id
            ).filter(
                WorkPlanDay.date == today,
                WorkPlanJobTracking.is_carry_over == True
            ).count()

            # Yesterday's stats
            yesterday_perf = WorkPlanPerformance.query.filter_by(
                user_id=user_id,
                period_type='daily',
                period_start=yesterday
            ).first()

            msg = f"Today: {today_count} jobs assigned"
            if carry_over_count:
                msg += f" ({carry_over_count} carry-over)"
            if yesterday_perf:
                msg += f". Yesterday: {yesterday_perf.completion_rate}% completion"

            NotificationService.create_notification(
                user_id=user_id,
                type='morning_briefing',
                title='Good Morning - Daily Briefing',
                message=msg,
                priority='info'
            )

        logger.info(f"Sent morning notifications to {len(assignments)} workers")

    # 12. Red zone alert - check jobs exceeding 80% estimated time
    @run_with_context
    def check_red_zone():
        from app.models import WorkPlanJob, WorkPlanDay, WorkPlan
        from app.models.work_plan_job_tracking import WorkPlanJobTracking
        from app.services.notification_service import NotificationService
        from datetime import date, datetime
        logger.info("Running: check_red_zone")

        today = date.today()
        now = datetime.utcnow()

        # Get all in-progress jobs
        in_progress = db.session.query(WorkPlanJobTracking).join(
            WorkPlanJob, WorkPlanJobTracking.work_plan_job_id == WorkPlanJob.id
        ).join(
            WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id
        ).filter(
            WorkPlanDay.date == today,
            WorkPlanJobTracking.status == 'in_progress'
        ).all()

        for tracking in in_progress:
            job = tracking.work_plan_job
            if not job.estimated_hours or not tracking.started_at:
                continue

            elapsed_seconds = (now - tracking.started_at).total_seconds()
            paused_seconds = (tracking.total_paused_minutes or 0) * 60
            working_seconds = elapsed_seconds - paused_seconds
            working_hours = working_seconds / 3600

            threshold = float(job.estimated_hours) * 0.8
            if working_hours >= threshold:
                # Already sent alert? Check logs
                from app.models.work_plan_job_log import WorkPlanJobLog
                already_alerted = WorkPlanJobLog.query.filter_by(
                    work_plan_job_id=job.id,
                    event_type='auto_flagged'
                ).filter(
                    WorkPlanJobLog.event_data.contains({'type': 'red_zone'})
                ).first()

                if not already_alerted:
                    day = db.session.get(WorkPlanDay, job.work_plan_day_id)
                    plan = db.session.get(WorkPlan, day.work_plan_id) if day else None

                    if plan and plan.created_by_id:
                        NotificationService.create_notification(
                            user_id=plan.created_by_id,
                            type='red_zone_alert',
                            title='Red Zone Alert',
                            message=f'Job on {job.equipment.name if job.equipment else "unknown"} has exceeded 80% of estimated time ({round(working_hours, 1)}h / {job.estimated_hours}h)',
                            related_type='work_plan_job',
                            related_id=job.id,
                            priority='urgent'
                        )

                        # Log the alert
                        log = WorkPlanJobLog(
                            work_plan_job_id=job.id,
                            user_id=plan.created_by_id,
                            event_type='auto_flagged',
                            event_data={'type': 'red_zone', 'working_hours': round(working_hours, 1)}
                        )
                        db.session.add(log)

        db.session.commit()
        logger.info(f"Red zone check completed for {len(in_progress)} in-progress jobs")

    # 13. Generate daily leaderboard snapshot (midnight)
    @run_with_context
    def generate_leaderboard_snapshot():
        from app.services.leaderboard_ai_service import LeaderboardAIService
        logger.info("Running: generate_leaderboard_snapshot")
        service = LeaderboardAIService()
        count = service.generate_daily_snapshot()
        logger.info(f"Generated leaderboard snapshots for {count} users")

    # 14. Create weekly challenges (Sunday night at 11 PM)
    @run_with_context
    def create_weekly_challenges():
        from app.services.gamification_service import GamificationService
        logger.info("Running: create_weekly_challenges")
        service = GamificationService()
        count = service.create_weekly_challenges()
        if count:
            logger.info(f"Created {count} weekly challenges")
        else:
            logger.info("Weekly challenges already exist or none created")

    # 15. Check for broken streaks and send reminders
    @run_with_context
    def check_broken_streaks():
        from app.services.gamification_service import GamificationService
        logger.info("Running: check_broken_streaks")
        service = GamificationService()
        at_risk = service.check_broken_streaks()
        if at_risk:
            logger.info(f"Sent {at_risk} streak reminder notifications")

    # 16. Update achievement progress periodically
    @run_with_context
    def update_achievement_progress():
        from app.services.gamification_service import GamificationService
        logger.info("Running: update_achievement_progress")
        service = GamificationService()
        updated = service.update_achievement_progress()
        logger.info(f"Updated progress for {updated} achievements")

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

    # Work Plan Tracking jobs
    scheduler.add_job(
        auto_flag_day_shift,
        CronTrigger(hour=19, minute=0),
        id='auto_flag_day_shift',
        name='Auto-flag unfinished day shift jobs at 7 PM',
        replace_existing=True
    )

    scheduler.add_job(
        auto_flag_night_shift,
        CronTrigger(hour=7, minute=0),
        id='auto_flag_night_shift',
        name='Auto-flag unfinished night shift jobs at 7 AM',
        replace_existing=True
    )

    scheduler.add_job(
        send_review_reminders,
        IntervalTrigger(hours=1),
        id='send_review_reminders',
        name='Send hourly review reminders during review windows',
        replace_existing=True
    )

    scheduler.add_job(
        compute_daily_performance,
        CronTrigger(hour=0, minute=45),
        id='compute_daily_performance',
        name='Compute daily performance at 00:45',
        replace_existing=True
    )

    scheduler.add_job(
        send_morning_notifications,
        CronTrigger(hour=7, minute=0),
        id='send_morning_notifications',
        name='Send morning job briefing at 7 AM',
        replace_existing=True
    )

    scheduler.add_job(
        check_red_zone,
        IntervalTrigger(minutes=30),
        id='check_red_zone',
        name='Check for jobs exceeding 80% estimated time every 30 min',
        replace_existing=True
    )

    # Leaderboard & Gamification jobs
    scheduler.add_job(
        generate_leaderboard_snapshot,
        CronTrigger(hour=0, minute=0),
        id='generate_leaderboard_snapshot',
        name='Generate daily leaderboard snapshot at midnight',
        replace_existing=True
    )

    scheduler.add_job(
        create_weekly_challenges,
        CronTrigger(day_of_week='sun', hour=23, minute=0),
        id='create_weekly_challenges',
        name='Create weekly challenges Sunday at 11 PM',
        replace_existing=True
    )

    scheduler.add_job(
        check_broken_streaks,
        CronTrigger(hour=8, minute=0),
        id='check_broken_streaks',
        name='Check for broken streaks daily at 8 AM',
        replace_existing=True
    )

    scheduler.add_job(
        update_achievement_progress,
        IntervalTrigger(hours=6),
        id='update_achievement_progress',
        name='Update achievement progress every 6 hours',
        replace_existing=True
    )

    # =========================================================================
    # Material/Stock Management Jobs
    # =========================================================================

    # 17. Daily low stock check (6 AM)
    @run_with_context
    def check_daily_low_stock():
        from app.services.stock_alert_service import StockAlertService
        logger.info("Running: check_daily_low_stock")
        alerts = StockAlertService.send_stock_alerts()
        logger.info(f"Sent {alerts} stock alerts")

    # 18. Weekly expiry check (Monday 7 AM)
    @run_with_context
    def check_weekly_expiry():
        from app.services.stock_alert_service import StockAlertService
        from app.services.notification_service import NotificationService
        from app.models import User
        from sqlalchemy import or_
        logger.info("Running: check_weekly_expiry")

        expiring = StockAlertService.check_expiring_batches(days_ahead=30)

        if expiring:
            # Notify warehouse managers and admins
            users = User.query.filter(
                User.is_active == True,
                or_(User.role == 'admin', User.role == 'warehouse')
            ).all()

            for user in users:
                NotificationService.create_notification(
                    user_id=user.id,
                    type='weekly_expiry_report',
                    title='Weekly Expiry Report',
                    message=f'{len(expiring)} batches will expire within the next 30 days',
                    related_type='batch_expiry',
                    priority='warning',
                    action_url='/materials/batches?filter=expiring'
                )

            logger.info(f"Found {len(expiring)} expiring batches, notified {len(users)} users")

    # 19. Monthly consumption report (1st of month at 6 AM)
    @run_with_context
    def generate_monthly_consumption_report():
        from app.services.material_ai_service import MaterialAIService
        from app.services.notification_service import NotificationService
        from app.models import User
        from sqlalchemy import or_
        logger.info("Running: generate_monthly_consumption_report")

        service = MaterialAIService()
        report = service.generate_consumption_report(period='monthly')

        # Notify admins and warehouse managers
        users = User.query.filter(
            User.is_active == True,
            or_(User.role == 'admin', User.role == 'warehouse')
        ).all()

        for user in users:
            NotificationService.create_notification(
                user_id=user.id,
                type='monthly_consumption_report',
                title=f'Monthly Consumption Report - {report.get("period", "This Month")}',
                message=f'Total consumed: {report.get("total_consumed", 0)} units, Value: ${report.get("total_value", 0):.2f}',
                related_type='consumption_report',
                priority='info',
                action_url='/materials/reports/consumption'
            )

        logger.info(f"Generated monthly consumption report, notified {len(users)} users")

    # 20. Daily reorder point check (8 AM)
    @run_with_context
    def check_daily_reorder():
        from app.services.stock_alert_service import StockAlertService
        from app.services.notification_service import NotificationService
        from app.models import User
        from sqlalchemy import or_
        logger.info("Running: check_daily_reorder")

        needs_reorder = StockAlertService.check_reorder_needed()
        critical = [r for r in needs_reorder if r['urgency'] == 'critical']
        high = [r for r in needs_reorder if r['urgency'] == 'high']

        if critical or high:
            users = User.query.filter(
                User.is_active == True,
                or_(User.role == 'admin', User.role == 'warehouse')
            ).all()

            for user in users:
                message = f'{len(critical)} critical and {len(high)} high priority materials need reordering'
                NotificationService.create_notification(
                    user_id=user.id,
                    type='reorder_check',
                    title='Daily Reorder Check',
                    message=message,
                    related_type='reorder_alert',
                    priority='urgent' if critical else 'warning',
                    action_url='/materials?filter=reorder_needed'
                )

            logger.info(f"Found {len(needs_reorder)} materials needing reorder ({len(critical)} critical)")

    # Schedule Material/Stock jobs
    scheduler.add_job(
        check_daily_low_stock,
        CronTrigger(hour=6, minute=0),
        id='check_daily_low_stock',
        name='Check low stock daily at 6 AM',
        replace_existing=True
    )

    scheduler.add_job(
        check_weekly_expiry,
        CronTrigger(day_of_week='mon', hour=7, minute=0),
        id='check_weekly_expiry',
        name='Check expiring batches weekly on Monday at 7 AM',
        replace_existing=True
    )

    scheduler.add_job(
        generate_monthly_consumption_report,
        CronTrigger(day=1, hour=6, minute=0),
        id='generate_monthly_consumption_report',
        name='Generate monthly consumption report on 1st at 6 AM',
        replace_existing=True
    )

    scheduler.add_job(
        check_daily_reorder,
        CronTrigger(hour=8, minute=0),
        id='check_daily_reorder',
        name='Check reorder needs daily at 8 AM',
        replace_existing=True
    )

    scheduler.start()
    atexit.register(lambda: scheduler.shutdown(wait=False))
    logger.info("Background scheduler started with 20 scheduled jobs")

    return scheduler
