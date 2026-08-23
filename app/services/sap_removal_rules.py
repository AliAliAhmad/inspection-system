"""
What the robot does when SAP closes a job that is already on the plan.

The pool sync handles the box: orders waiting, nobody depending on them, safe to
add and remove in bulk. This handles the other side — an order that has left the
box and is sitting on somebody's Tuesday. Removing one of those changes a day,
and possibly erases a record of work, so every case is decided explicitly.

    SAP says      nobody touched it     someone is on it     the app finished it
    -----------   -------------------   ------------------   -------------------
    done          remove + report       DON'T TOUCH,         keep as the record,
    cancelled     (scenario 7 / 10)     report to Ali only   clean the staging row
                                        (scenario 8)         (scenario 9)
    still open    nothing               nothing              ASK — somebody
                                                             probably forgot to
                                                             confirm (scenario 12)

Two rules hold everywhere:

  * ABSENCE IS NOT EVIDENCE. An order missing from the export changes nothing.
    Exports get truncated, filters get changed, a work centre gets reassigned —
    none of those mean the work is done. Only an order FOUND in IW39 carrying a
    closed or cancelled status can move anything.

  * ONE EVENT PER SITUATION. The sync runs daily and scenario 8 and 12
    situations persist for days. Re-reporting them every morning is how a robot
    becomes something Ali stops reading, which costs more than saying nothing.
"""

import logging
from datetime import date, datetime

from app.extensions import db
from app.models import (
    Notification,
    SapReconciliationEvent,
    SAPWorkOrder,
    User,
    WorkPlan,
    WorkPlanDay,
    WorkPlanJob,
)

logger = logging.getLogger(__name__)

# SAP states that mean the order is finished with, one way or another.
CLOSED_SAP_STATES = ('done', 'cancelled')

# Tracking statuses that mean the app already recorded an outcome. 'incomplete'
# is deliberately NOT here for the scenario-12 question: the worker said they
# did not finish, so SAP still showing the order open is correct, not a
# missing confirmation.
APP_FINISHED_STATES = ('completed', 'rated')
APP_RECORDED_STATES = ('completed', 'incomplete', 'rated')
APP_IN_PROGRESS_STATES = ('in_progress', 'paused')

# Events that are a RECORD, not a message. Ali's rule was "copy everything,
# shout about almost nothing": a job both sides agree is finished breaks nobody's
# day, and the team finishes jobs every week. Notifying the whole planning staff
# each time — and leaving an open event nobody will ever resolve — would bury the
# two things that DO need an answer under a weekly pile of good news.
#
# Born resolved, so they are still there as history without ever sitting in the
# "needs attention" list that /sap and the pushes read from.
QUIET_EVENT_TYPES = ('job_completion_confirmed',)


def _job_work_state(job):
    """Imported lazily from the API module, which owns this definition.

    Deliberately not re-implemented: the manual removal rules (scenarios 1-6)
    decide "has a human touched this job" from exactly this function, and two
    copies of that judgement would drift apart the first time one is changed.
    """
    from app.api.work_plans import job_work_state
    return job_work_state(job)


def _active_plans(today):
    """Plans whose week has not finished yet.

    A plan for a week that is already over is a historical record. Editing it
    retroactively would change what the yard is on paper recorded as having
    done, which is the opposite of the point.
    """
    # Callers pass whatever they were passing the parser — a date, a datetime, or
    # a pandas Timestamp. week_end is a DATE column, and comparing it against a
    # timestamp silently excludes the current week on some drivers.
    if hasattr(today, 'date') and not isinstance(today, date):
        today = today.date()
    return WorkPlan.query.filter(WorkPlan.week_end >= today).all()


def _open_event_keys():
    """(order_number, event_type) for every event still awaiting attention."""
    rows = db.session.query(
        SapReconciliationEvent.order_number, SapReconciliationEvent.event_type
    ).filter(SapReconciliationEvent.status == 'open').all()
    return {(order, kind) for order, kind in rows}


def _planners():
    """Who gets told. Everyone who could act on it."""
    return User.query.filter(
        User.role.in_(('admin', 'engineer')),
        User.is_active.is_(True),
    ).all()


class _Reporter:
    """Collects events and notifications, and writes nothing on a dry run."""

    def __init__(self, dry_run):
        self.dry_run = dry_run
        # Open events only. A quiet event is born resolved and so cannot be found
        # here — but it also cannot recur, because the staging row it records is
        # deleted in the same pass and the order never comes back.
        self.existing = _open_event_keys()
        self.events = []
        self.suppressed = 0
        self._recipients = None

    def report(self, *, event_type, order_number, sap_state, summary,
               summary_ar, work_plan_id=None, work_plan_job_id=None,
               details=None, priority='warning'):
        key = (order_number, event_type)
        if key in self.existing:
            # Already reported and still not dealt with. Saying it again every
            # morning trains Ali to skim past the whole channel.
            self.suppressed += 1
            return None
        self.existing.add(key)

        quiet = event_type in QUIET_EVENT_TYPES
        event = SapReconciliationEvent(
            event_type=event_type,
            order_number=order_number,
            sap_state=sap_state,
            work_plan_id=work_plan_id,
            work_plan_job_id=work_plan_job_id,
            summary=summary,
            details=details or {},
            status='resolved' if quiet else 'open',
            resolved_at=datetime.utcnow() if quiet else None,
        )
        self.events.append(event)

        if not self.dry_run:
            db.session.add(event)
            if not quiet:
                self._notify(event_type, summary, summary_ar, priority)
        return event

    def _notify(self, event_type, summary, summary_ar, priority):
        """In-app notification, built directly rather than via NotificationService.

        That service auto-translates any message without an Arabic version, which
        means a network call. This runs inside an unattended background sync over
        potentially dozens of orders, so both languages are supplied up front and
        nothing here can hang on an external API.
        """
        if self._recipients is None:
            self._recipients = _planners()
        for user in self._recipients:
            db.session.add(Notification(
                user_id=user.id,
                type=f'sap_{event_type}',
                title='SAP update',
                title_ar='تحديث من SAP',
                message=summary,
                message_ar=summary_ar,
                priority=priority,
                source_type='system',
            ))


def reconcile_scheduled_orders(status_index, today, dry_run=False):
    """Apply scenarios 7-12 against what SAP now says.

    `status_index` is build_order_status_index()'s output: every MES order in the
    export mapped to done / cancelled / open / unknown. Returns a report; writes
    nothing when `dry_run` is set.
    """
    plans = _active_plans(today)
    if not plans:
        return _empty_report(dry_run)

    plan_ids = [plan.id for plan in plans]

    jobs = (WorkPlanJob.query
            .join(WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id)
            .filter(WorkPlanDay.work_plan_id.in_(plan_ids),
                    WorkPlanJob.sap_order_number.isnot(None))
            .all())

    reporter = _Reporter(dry_run)
    counts = {
        'jobs_checked': len(jobs),
        'jobs_removed': 0,
        'jobs_left_in_progress': 0,
        'completions_confirmed': 0,
        'questions_raised': 0,
        'not_in_export': 0,
        'sap_state_unknown': 0,
        'pool_rows_cleaned': 0,
    }
    handled_orders = set()

    for job in jobs:
        order_number = str(job.sap_order_number).strip()
        entry = status_index.get(order_number)
        if entry is None:
            # Absence is not evidence. Reported as a number only — a name-by-name
            # list would be noise, since a fresh export routinely omits orders
            # for reasons that have nothing to do with the work.
            counts['not_in_export'] += 1
            continue

        sap_state = entry['state']
        if sap_state == 'unknown':
            counts['sap_state_unknown'] += 1
            continue

        handled_orders.add(order_number)
        plan_id = job.day.work_plan_id if job.day else None
        work_state = _job_work_state(job)

        if sap_state in CLOSED_SAP_STATES:
            _handle_closed(job, order_number, sap_state, plan_id, work_state,
                           entry, reporter, counts, dry_run)
        elif sap_state == 'open' and work_state in APP_FINISHED_STATES:
            _handle_unconfirmed(job, order_number, plan_id, reporter, counts)

    counts['pool_rows_cleaned'] = _clean_untouched_pool_rows(
        plan_ids, status_index, handled_orders, dry_run)

    if not dry_run:
        db.session.commit()

    report = {
        'dry_run': dry_run,
        'plans_checked': len(plans),
        'events_created': len(reporter.events),
        'events_suppressed_as_duplicate': reporter.suppressed,
        **counts,
    }
    logger.info('SAP removal rules: %s', report)
    return report


def _handle_closed(job, order_number, sap_state, plan_id, work_state,
                   entry, reporter, counts, dry_run):
    """SAP is finished with this order. What happens depends on the app's record."""
    verb = 'cancelled' if sap_state == 'cancelled' else 'closed'
    verb_ar = 'ألغى' if sap_state == 'cancelled' else 'أغلق'
    equipment = job.equipment.name if job.equipment else None
    day = job.day.date.isoformat() if job.day and job.day.date else None
    details = {
        'equipment': equipment,
        'day': day,
        'description': job.description,
        'finished_on': entry['finished_on'].isoformat() if entry.get('finished_on') else None,
        'system_status': entry.get('system_status'),
        'app_status': work_state,
    }

    if work_state in APP_IN_PROGRESS_STATES:
        # Scenario 8. The worker keeps working — they may be finishing the very
        # job SAP has already been told about, and an interruption from a robot
        # mid-task helps nobody. Ali is the filter; he decides whether to stop them.
        counts['jobs_left_in_progress'] += 1
        reporter.report(
            event_type='job_in_progress_conflict',
            order_number=order_number, sap_state=sap_state,
            work_plan_id=plan_id, work_plan_job_id=job.id, details=details,
            priority='urgent',
            summary=(f'SAP {verb} order {order_number}'
                     f'{" on " + equipment if equipment else ""}, but it is '
                     f'{work_state.replace("_", " ")} in the app right now. '
                     f'Nothing was changed.'),
            summary_ar=(f'SAP {verb_ar} الأمر {order_number}'
                        f'{" على " + equipment if equipment else ""}، لكن العمل '
                        f'جارٍ عليه الآن في التطبيق. لم يتم تغيير أي شيء.'),
        )
        return

    if work_state in APP_RECORDED_STATES:
        # Scenario 9. Both sides agree the work happened. The job stays exactly
        # where it is — it is the record of what the yard did that week — and
        # only the staging row is cleaned up.
        counts['completions_confirmed'] += 1
        details['app_actual_hours'] = _actual_hours(job)
        reporter.report(
            event_type='job_completion_confirmed',
            order_number=order_number, sap_state=sap_state,
            work_plan_id=plan_id, work_plan_job_id=job.id, details=details,
            priority='info',
            summary=(f'Order {order_number}'
                     f'{" on " + equipment if equipment else ""} is {verb} in SAP '
                     f'and already recorded as {work_state} in the app.'),
            summary_ar=(f'الأمر {order_number}'
                        f'{" على " + equipment if equipment else ""} مغلق في SAP '
                        f'ومسجل مسبقاً في التطبيق.'),
        )
        if not dry_run:
            _delete_staging_row(order_number)
        return

    # Scenario 7 / 10-untouched. Nobody has touched it, so it comes off the day.
    # Reported rather than silent: the job WAS on somebody's Tuesday, and a day
    # that quietly loses work looks the same as a day that never had it.
    counts['jobs_removed'] += 1
    reporter.report(
        event_type='job_removed',
        order_number=order_number, sap_state=sap_state,
        work_plan_id=plan_id, work_plan_job_id=job.id, details=details,
        priority='warning',
        summary=(f'SAP {verb} order {order_number}'
                 f'{" on " + equipment if equipment else ""}'
                 f'{" planned for " + day if day else ""}. '
                 f'Nobody had started it, so it was removed from the plan.'),
        summary_ar=(f'SAP {verb_ar} الأمر {order_number}'
                    f'{" على " + equipment if equipment else ""}. '
                    f'لم يبدأ أحد العمل عليه، لذلك تم حذفه من الخطة.'),
    )
    if not dry_run:
        from app.api.work_plans import purge_job_rows
        purge_job_rows(job)
        _delete_staging_row(order_number)


def _handle_unconfirmed(job, order_number, plan_id, reporter, counts):
    """Scenario 12. The app says done, SAP still shows it open.

    Neither side wins. The general rule is that SAP is the authority, but here
    SAP is only SLOWER, not more right — letting it win would un-finish real
    work. The message matters more than the data: somebody forgot to confirm,
    and unconfirmed work is hours that will not reconcile at month end.
    """
    counts['questions_raised'] += 1
    equipment = job.equipment.name if job.equipment else None
    reporter.report(
        event_type='completion_not_confirmed',
        order_number=order_number, sap_state='open',
        work_plan_id=plan_id, work_plan_job_id=job.id,
        priority='warning',
        details={
            'equipment': equipment,
            'day': job.day.date.isoformat() if job.day and job.day.date else None,
            'description': job.description,
            'app_actual_hours': _actual_hours(job),
            'completed_at': _completed_at(job),
        },
        summary=(f'Order {order_number}'
                 f'{" on " + equipment if equipment else ""} is finished in the '
                 f'app but still open in SAP. Is the confirmation missing?'),
        summary_ar=(f'الأمر {order_number}'
                    f'{" على " + equipment if equipment else ""} منتهٍ في التطبيق '
                    f'لكنه ما زال مفتوحاً في SAP. هل التأكيد ناقص؟'),
    )


def _clean_untouched_pool_rows(plan_ids, status_index, handled_orders, dry_run):
    """Staging rows tied to a plan but never placed on a day.

    These are invisible to both halves of the sync — the box query only matches
    work_plan_id IS NULL, and the rules above only see orders that became jobs.
    They belong to a week but sit on nobody's day, so removing a closed one
    changes nothing a person can see, and is done silently.
    """
    rows = SAPWorkOrder.query.filter(
        SAPWorkOrder.work_plan_id.in_(plan_ids),
        SAPWorkOrder.status == 'pending',
    ).all()

    stale = [row.id for row in rows
             if row.order_number not in handled_orders
             and (status_index.get(row.order_number) or {}).get('state') in CLOSED_SAP_STATES]

    if stale and not dry_run:
        SAPWorkOrder.query.filter(SAPWorkOrder.id.in_(stale)).delete(
            synchronize_session=False)
    return len(stale)


def _delete_staging_row(order_number):
    """Drop the sap_work_orders row for a finished order.

    Deleted rather than marked: the status CHECK allows only pending/scheduled,
    and the record of the work lives on the WorkPlanJob and its tracking row,
    which are untouched.
    """
    SAPWorkOrder.query.filter(
        SAPWorkOrder.order_number == order_number
    ).delete(synchronize_session=False)


def _actual_hours(job):
    tracking = getattr(job, 'tracking', None)
    if tracking is None or tracking.actual_hours is None:
        return None
    return float(tracking.actual_hours)


def _completed_at(job):
    tracking = getattr(job, 'tracking', None)
    if tracking is None or tracking.completed_at is None:
        return None
    return tracking.completed_at.isoformat()


def _empty_report(dry_run):
    return {
        'dry_run': dry_run,
        'plans_checked': 0,
        'events_created': 0,
        'events_suppressed_as_duplicate': 0,
        'jobs_checked': 0,
        'jobs_removed': 0,
        'jobs_left_in_progress': 0,
        'completions_confirmed': 0,
        'questions_raised': 0,
        'not_in_export': 0,
        'sap_state_unknown': 0,
        'pool_rows_cleaned': 0,
    }


def resolve_event(event, resolved_at=None):
    """Mark a question as dealt with, so it stops being suppressed as a duplicate."""
    event.status = 'resolved'
    event.resolved_at = resolved_at or datetime.utcnow()
    return event
