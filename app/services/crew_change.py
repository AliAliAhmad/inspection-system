"""Changing who is on a job after the week has been published.

Ali, 2026-09-23, three answers that make this module:

  1. A PLANNER may change the crew of a job in a PUBLISHED plan without Revise —
     but only while nobody has started it. Revise turns the whole week back into
     a draft, and /my-plan shows only published weeks, so one name change used
     to blank the ENTIRE week on every worker's phone until it was re-published.
  2. A job's SUPERVISOR who is not a planner may only ASK. Any engineer or admin
     approves; the first press wins.
  3. If the job starts while a request waits, the request cancels itself. A crew
     that has started keeps its men.

Everything that decides "may this crew still change" lives here, so the direct
swap, the approval and the auto-cancel can never disagree about it.
"""

from datetime import datetime, time

from app.extensions import db
from app.exceptions.api_exceptions import (ForbiddenError, NotFoundError,
                                           ValidationError)
from app.models import (Leave, User, WorkPlan, WorkPlanAssignment,
                        WorkPlanCrewChangeRequest, WorkPlanDay, WorkPlanJob)
from app.services.notification_service import NotificationService

# The people the board lets a planner drag onto a job. Kept equal to
# /users/for-assignment — offering a man the save would refuse is the bug that
# cost a morning on the inspection assignment page.
CREW_ROLES = ('inspector', 'specialist', 'maintenance', 'engineer', 'admin')

PLANNING_ROLES = ('admin', 'engineer')


# ─── "Has this job started?" — the one answer ──────────────────────────────

def job_has_started(job):
    """True once anybody has done anything on this job, this week.

    Two records say so, and BOTH must be read:

      * the job's own tracking row (the Start button on the card), and
      * its OPERATIONS. A line's timer deliberately does not touch the job's
        tracking (see job_task_timer), so a man can run a three-hour timer on
        line 0020 while the job itself still reads "not started". Reading only
        tracking would let a planner swap him off mid-work.

    Operations hang on the SAP ORDER and survive from one week to the next. A
    carried-over order that was half done last week must not lock THIS week's
    crew for ever, so a line counts only if it is running now, or was started
    or ticked on or after this job's own day.
    """
    from app.api.work_plans import job_work_state
    if job_work_state(job) is not None:
        return True

    from app.models.work_plan_job_task import WorkPlanJobTask, anchor_for
    kind, key = anchor_for(job)
    day = db.session.get(WorkPlanDay, job.work_plan_day_id)
    since = datetime.combine(day.date, time.min) if day and day.date else None

    ops = WorkPlanJobTask.query.filter_by(anchor_kind=kind, anchor_key=key).all()
    for op in ops:
        if not ((op.source or 'manual') == 'sap' or op.operation_number):
            continue  # a written note, not a line of work
        if (op.status or '') in ('in_progress', 'paused'):
            return True
        if since is None:
            if op.started_at or op.is_done:
                return True
            continue
        if op.started_at and op.started_at >= since:
            return True
        if op.is_done and op.done_at and op.done_at >= since:
            return True
    return False


def plan_of(job):
    day = db.session.get(WorkPlanDay, job.work_plan_day_id)
    return db.session.get(WorkPlan, day.work_plan_id) if day else None


def assert_crew_editable(plan, job):
    """A draft is open. A published week is open only for an untouched job."""
    if plan.status != 'published':
        return
    if job_has_started(job):
        raise ForbiddenError(
            f"Job #{job.id} has already started — its crew cannot change now.")


def on_leave(user_id, job):
    """The same conditions the inspection assignment uses: approved leave that
    covers the JOB's day — not today, which is the mistake that made the
    engineer's inspection page offer men the server then refused."""
    day = db.session.get(WorkPlanDay, job.work_plan_day_id)
    if not day or not day.date:
        return False
    return Leave.query.filter(
        Leave.user_id == user_id,
        Leave.status == 'approved',
        Leave.date_from <= day.date,
        Leave.date_to >= day.date,
    ).first() is not None


def validate_new_member(user_id, job):
    user = db.session.get(User, user_id)
    if not user or not user.is_active:
        raise NotFoundError("User not found")
    if user.role not in CREW_ROLES:
        raise ValidationError(f"{user.full_name} cannot be put on a job")
    if on_leave(user_id, job):
        day = db.session.get(WorkPlanDay, job.work_plan_day_id)
        raise ValidationError(f"{user.full_name} is on leave on {day.date}")
    return user


# ─── Telling people ────────────────────────────────────────────────────────
#
# Arabic is written here, never left to create_notification: its automatic
# translation goes through the AI chain that is mostly down, and a worker who
# reads Arabic would get English about his own day.

def _job_label(job):
    eq = getattr(job, 'equipment', None)
    return (eq.name if eq else None) or job.sap_order_number or f'#{job.id}'


def _notify(user_id, job, title, message, title_ar, message_ar,
            priority='info'):
    if not user_id:
        return
    NotificationService.create_notification(
        user_id=user_id, type='work_plan', title=title, message=message,
        title_ar=title_ar, message_ar=message_ar,
        related_type='work_plan_job', related_id=job.id, priority=priority)


def notify_crew_moved(job, added_id=None, removed_id=None):
    """On a PUBLISHED week only. In a draft nobody has seen the crew yet, and
    publishing already tells every assigned man."""
    label = _job_label(job)
    if added_id:
        _notify(added_id, job,
                'Added to a job', f'You have been added to {label}.',
                'أُضفت إلى عمل', f'تمت إضافتك إلى {label}.')
    if removed_id:
        _notify(removed_id, job,
                'Removed from a job', f'You are no longer on {label}.',
                'أُزلت من عمل', f'لم تعد ضمن فريق {label}.')


def notify_supervisor_moved(job, new_id=None, old_id=None):
    """A published job's supervisor changed (Ali, 2026-09-24)."""
    label = _job_label(job)
    if new_id:
        _notify(new_id, job,
                'You supervise a job', f'You are now the supervisor of {label}.',
                'أنت مشرف على عمل', f'أصبحت مشرفاً على {label}.')
    if old_id:
        _notify(old_id, job,
                'No longer supervising', f'You no longer supervise {label}.',
                'لم تعد مشرفاً', f'لم تعد مشرفاً على {label}.')


# ─── Applying a change ─────────────────────────────────────────────────────

def apply_change(job, remove_user_id=None, add_user_id=None):
    """Take one man off and/or put one man on. Does NOT commit.

    A replacement takes the lead role of the man he replaces — the job keeps a
    lead instead of silently losing one.

    The removed man's OPERATION lines are cleared, and deliberately NOT handed
    to the replacement. Under Rule A a line with no name belongs to the team,
    which is exactly right for a man who has just arrived; moving the names
    would be the app deciding who does which line.
    """
    from app.api.work_plans import (_assign_user_to_job,
                                    _clear_operation_assignments)
    was_lead = False
    if remove_user_id:
        row = WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job.id, user_id=remove_user_id).first()
        if row:
            was_lead = bool(row.is_lead)
            _clear_operation_assignments(job.id, remove_user_id)
            db.session.delete(row)
    if add_user_id:
        _assign_user_to_job(job.id, add_user_id, True if was_lead else None)


# ─── Requests ──────────────────────────────────────────────────────────────

def planner_ids():
    return [u.id for u in User.query.filter(
        User.role.in_(PLANNING_ROLES), User.is_active == True).all()]  # noqa: E712


def create_request(user, job, remove_user_id=None, add_user_id=None,
                   reason=None):
    """The supervisor asks. Commits and tells every planner."""
    if user.role in PLANNING_ROLES:
        raise ValidationError("You are a planner — change the crew directly.")
    if job.engineer_id != user.id:
        raise ForbiddenError("Only this job's supervisor can ask to change its crew")
    if not remove_user_id and not add_user_id:
        raise ValidationError("Choose someone to take off, someone to put on, or both")
    if remove_user_id and remove_user_id == add_user_id:
        raise ValidationError("That is the same person")
    if job_has_started(job):
        raise ForbiddenError(
            f"Job #{job.id} has already started — its crew cannot change now.")

    team = {a.user_id for a in job.assignments}
    if remove_user_id and remove_user_id not in team:
        raise ValidationError("That person is not on this job")
    if add_user_id:
        if add_user_id in team:
            raise ValidationError("That person is already on this job")
        validate_new_member(add_user_id, job)

    duplicate = WorkPlanCrewChangeRequest.query.filter_by(
        work_plan_job_id=job.id, status='pending',
        remove_user_id=remove_user_id, add_user_id=add_user_id).first()
    if duplicate:
        raise ValidationError("You have already asked for this change")

    req = WorkPlanCrewChangeRequest(
        work_plan_job_id=job.id, requested_by_id=user.id,
        remove_user_id=remove_user_id, add_user_id=add_user_id,
        reason=(reason or '').strip() or None)
    db.session.add(req)
    db.session.commit()

    label = _job_label(job)
    who = user.full_name
    for pid in planner_ids():
        _notify(pid, job,
                'Crew change requested',
                f'{who} asks to change the crew on {label}. See Approvals.',
                'طلب تغيير فريق',
                f'{user.display_name("ar")} يطلب تغيير فريق {label}. راجع الموافقات.',
                priority='warning')
    return req


def _cancel(req, why):
    req.status = 'cancelled'
    req.reviewed_at = datetime.utcnow()
    req.review_notes = why


def approve_request(req, reviewer):
    """Any engineer or admin. Does NOT commit — the approvals endpoint commits
    once for a whole bulk action.

    Re-checks everything, because time has passed since the supervisor asked:
    the job may have started (→ cancelled, Ali's rule), a man may have gone on
    leave, or a planner may already have made the change by hand.
    """
    if reviewer.role not in PLANNING_ROLES:
        raise ForbiddenError("Only engineers and admins can approve this")
    if req.status != 'pending':
        raise ValidationError(f"Request {req.id} is no longer pending")

    job = db.session.get(WorkPlanJob, req.work_plan_job_id)
    if not job:
        raise NotFoundError("Job not found")

    if job_has_started(job):
        _cancel(req, 'job_started')
        _tell_requester(req, job)
        raise ValidationError(
            "The job has already started, so the request was cancelled")

    if req.add_user_id:
        validate_new_member(req.add_user_id, job)

    apply_change(job, req.remove_user_id, req.add_user_id)
    req.status = 'approved'
    req.reviewed_by_id = reviewer.id
    req.reviewed_at = datetime.utcnow()

    plan = plan_of(job)
    if plan and plan.status == 'published':
        notify_crew_moved(job, req.add_user_id, req.remove_user_id)
    _tell_requester(req, job)
    return req


def reject_request(req, reviewer, notes=None):
    if reviewer.role not in PLANNING_ROLES:
        raise ForbiddenError("Only engineers and admins can reject this")
    if req.status != 'pending':
        raise ValidationError(f"Request {req.id} is no longer pending")
    req.status = 'rejected'
    req.reviewed_by_id = reviewer.id
    req.reviewed_at = datetime.utcnow()
    req.review_notes = (notes or '').strip() or None
    job = db.session.get(WorkPlanJob, req.work_plan_job_id)
    if job:
        _tell_requester(req, job)
    return req


def withdraw_request(req, user):
    if req.requested_by_id != user.id:
        raise ForbiddenError("You can only withdraw your own request")
    if req.status != 'pending':
        raise ValidationError("This request is no longer pending")
    _cancel(req, 'withdrawn')
    return req


def cancel_pending_for_started_job(job):
    """Called when the job starts. Commits. Tells each supervisor who was waiting."""
    pending = WorkPlanCrewChangeRequest.query.filter_by(
        work_plan_job_id=job.id, status='pending').all()
    for req in pending:
        _cancel(req, 'job_started')
    if pending:
        db.session.commit()
        for req in pending:
            _tell_requester(req, job)
    return len(pending)


def _tell_requester(req, job):
    label = _job_label(job)
    if req.status == 'approved':
        _notify(req.requested_by_id, job,
                'Crew change approved', f'The crew on {label} has been changed.',
                'تمت الموافقة على تغيير الفريق', f'تم تغيير فريق {label}.')
    elif req.status == 'rejected':
        _notify(req.requested_by_id, job,
                'Crew change refused', f'Your crew change on {label} was refused.',
                'رُفض تغيير الفريق', f'رُفض طلب تغيير فريق {label}.')
    elif req.status == 'cancelled' and req.review_notes == 'job_started':
        _notify(req.requested_by_id, job,
                'Crew change cancelled',
                f'{label} started before your request was approved, so the crew stays.',
                'أُلغي طلب تغيير الفريق',
                f'بدأ العمل على {label} قبل الموافقة، لذلك يبقى الفريق كما هو.')
