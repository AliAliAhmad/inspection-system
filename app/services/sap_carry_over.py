"""
When a week ends, its unfinished work goes back in the box.

Ali's rule, in his words:

    "the job pool is the big box that have all jobs from sap and inspection
     result... when it is planned in the week it is removed from the box, if
     the week finish and the job not done it will back to the box"

The first half was built. The second half was not, and the cost is visible in
production: ten finished weeks are still holding 2,242 orders, going back
months —

    6:257  7:288  8:276  9:301  11:289  13:207  31:195  37:179  38:181  40:69

Nothing was lost, because the nightly rebuild notices those orders are still
open in SAP and creates FRESH copies in the box. But the originals never let
go, so every finished week leaves its rows behind forever and the same order
accumulates a copy per week it waited.

SAFETY, and it is the whole design:

  * ONLY untouched rows move. If anybody started, paused, finished or was rated
    on that job, the row is left exactly where it is and merely counted. A job
    started last week and still running must not reappear as plannable work.

  * ONE survivor per order number. A box copy already existing means the dead
    row is redundant and goes; otherwise the newest dead row is released and
    its siblings go. Postgres treats NULLs as distinct in
    UniqueConstraint('work_plan_id','order_number'), so nothing but this code
    prevents two box rows for one order.

  * Anything deleted in error is rebuilt from SAP the following night, because
    the box is a projection of SAP's open list rather than a record of work.
    The only irreversible mistake would be touching a row whose job carries
    real work — hence the first rule.
"""

import logging
from datetime import date

from app.extensions import db
from app.models import SAPWorkOrder, WorkPlan, WorkPlanDay, WorkPlanJob
from app.utils.decorators import planning_today

logger = logging.getLogger(__name__)


def as_planning_date(value=None):
    """Normalise whatever the caller passed into a plain date."""
    value = value or planning_today()
    if hasattr(value, 'date') and not isinstance(value, date):
        return value.date()
    return value


def live_week_filter(today=None):
    """The predicate for "this week has not ended yet".

    Shared deliberately. The pool sync protects orders planned into a LIVE week,
    and this module releases orders held by a DEAD one — they must be exact
    complements, or an order sitting on the boundary is either protected by both
    or claimed by both.
    """
    return WorkPlan.week_end >= as_planning_date(today)


def dead_week_plan_ids(today=None):
    """Plans whose week is over."""
    return [row[0] for row in db.session.query(WorkPlan.id)
            .filter(WorkPlan.week_end < as_planning_date(today)).all()]


def _jobs_for(plan_id, order_number):
    """ALL jobs this order became on this plan — plural since the day budget:
    a 12h reach stacker PM is planned split into part 1/2 and part 2/2, two
    rows with the same order number."""
    return (WorkPlanJob.query
            .join(WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id)
            .filter(WorkPlanDay.work_plan_id == plan_id,
                    WorkPlanJob.sap_order_number == order_number)
            .all())


def _was_worked(plan_id, order_number):
    """True if a human touched ANY job this order became.

    Uses the API module's job_work_state so this agrees exactly with the manual
    removal rules — two copies of "has anyone touched this" would drift apart
    the first time either was changed. ANY, not first: with a split PM,
    .first() could return the untouched part 2 while part 1 is half done, and
    the release would move an order somebody is standing on.
    """
    from app.api.work_plans import job_work_state
    return any(job_work_state(job) is not None
               for job in _jobs_for(plan_id, order_number))


def classify(today=None):
    """Read-only. What a release would do, without doing any of it.

    Exists because the last cleanup shipped the same afternoon it was written,
    ran unattended against production, and emptied the pool. This one gets
    looked at first.
    """
    plan_ids = dead_week_plan_ids(today)
    report = {
        'dead_weeks': len(plan_ids),
        'rows_held': 0,
        'would_release': 0,
        'would_delete_as_duplicate': 0,
        'left_alone_because_worked': 0,
        'per_plan': {},
    }
    if not plan_ids:
        return report

    rows = SAPWorkOrder.query.filter(SAPWorkOrder.work_plan_id.in_(plan_ids)).all()
    report['rows_held'] = len(rows)

    in_box = {row.order_number for row in SAPWorkOrder.query
              .filter(SAPWorkOrder.work_plan_id.is_(None)).all()}

    survivors = set()
    for row in sorted(rows, key=lambda r: r.id, reverse=True):
        bucket = report['per_plan'].setdefault(
            row.work_plan_id, {'held': 0, 'release': 0, 'duplicate': 0, 'worked': 0})
        bucket['held'] += 1

        if _was_worked(row.work_plan_id, row.order_number):
            report['left_alone_because_worked'] += 1
            bucket['worked'] += 1
        elif row.order_number in in_box or row.order_number in survivors:
            report['would_delete_as_duplicate'] += 1
            bucket['duplicate'] += 1
        else:
            survivors.add(row.order_number)
            report['would_release'] += 1
            bucket['release'] += 1

    return report


def release_dead_week_orders(today=None, dry_run=False):
    """Put unfinished work from finished weeks back in the box.

    Returns the same shape classify() does, with what actually happened.
    """
    plan_ids = dead_week_plan_ids(today)
    result = {'dead_weeks': len(plan_ids), 'carried_back': 0,
              'duplicates_deleted': 0, 'left_worked': 0}
    if not plan_ids:
        return result

    rows = SAPWorkOrder.query.filter(SAPWorkOrder.work_plan_id.in_(plan_ids)).all()
    in_box = {row.order_number for row in SAPWorkOrder.query
              .filter(SAPWorkOrder.work_plan_id.is_(None)).all()}

    doomed = []
    # Newest first, so the survivor is the most recently imported copy.
    for row in sorted(rows, key=lambda r: r.id, reverse=True):
        if _was_worked(row.work_plan_id, row.order_number):
            # Somebody started, paused, finished or was rated on this. The row
            # stays where it is; the removal rules own it.
            result['left_worked'] += 1
            continue

        if row.order_number in in_box:
            doomed.append(row.id)
            result['duplicates_deleted'] += 1
            continue

        in_box.add(row.order_number)
        result['carried_back'] += 1
        if not dry_run:
            row.work_plan_id = None
            row.status = 'pending'

    if doomed and not dry_run:
        SAPWorkOrder.query.filter(SAPWorkOrder.id.in_(doomed)).delete(
            synchronize_session=False)

    if not dry_run:
        db.session.flush()

    logger.info('SAP carry-over: %s', result)
    return result
