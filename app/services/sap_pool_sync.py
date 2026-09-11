"""
Write the parsed SAP candidates into the job pool.

The courier delivers files, the parser reads them, and this puts the result in
the box. It is the last link in the chain and the only part that writes.

Two safety rules shape everything here:

  1. It NEVER touches a scheduled order. Anything with a work_plan_id has been
     planned into a week, possibly worked on, and belongs to the removal rules
     (scenarios 7-12), not to a bulk sync.

  2. Unmatched equipment is REPORTED, never silently dropped. This is the one
     failure in the whole pipeline that would otherwise be invisible: orders
     that match no equipment simply vanish, and the planner looks empty with
     nothing explaining why.
"""

import gc
import logging
import os
import re
from datetime import date, datetime
from collections import Counter, defaultdict

from flask import current_app

from app.extensions import db
from app.models import Equipment, SapSyncFile, SAPWorkOrder
from app.services.job_durations import family_from_plant_code, hours_for
from app.models.maintenance_cycle import MaintenanceCycle
from app.services.sap_order_parser import (
    build_breakdown_index,
    build_order_status_index,
    load_iw39,
    build_last_completion_index,
    build_meter_index,
    corrective_priority,
    hourly_pm_priority,
    hours_run_since,
    load_maintenance_plan_types,
    parse_open_orders,
    parse_operation_hours,
    parse_operations,
    pm_interval_hours,
)
from app.services.sap_removal_rules import _Reporter, reconcile_scheduled_orders
from app.utils.decorators import planning_today

logger = logging.getLogger(__name__)

# Which delivered file plays which role. Matched on sheet_name for the SAP
# transactions; the maintenance-plan classification is a file Ali maintains by
# hand, so it is found by filename instead.
MAINTENANCE_PLAN_FILENAME_HINT = 'maintenance plan'

# Machines SAP still writes orders for, that the terminal no longer has.
#
# They are NOT equipment rows, so an order on one is dropped exactly like an
# order on a machine nobody has added yet — the two are indistinguishable to the
# skip below, and that is the problem: a genuinely new machine hides inside the
# noise of sold ones. Listing them here separates "deliberately not imported"
# from "nobody knows about this yet", so the warning stays worth reading.
#
# Sold. Ali, 2026-09-03. The real cleanup is on the SAP side — an order still
# open against a machine that no longer exists should be TECO'd there, not
# imported here.
RETIRED_PLANT_CODES = frozenset({'TT004', 'TT005', 'TT080'})


def _current_file_bytes(sheet_name=None, filename_contains=None):
    """Read the newest delivered copy of a file, or None if it never arrived."""
    query = SapSyncFile.query.filter(SapSyncFile.is_current.is_(True),
                                     SapSyncFile.stored_path.isnot(None))
    if sheet_name:
        query = query.filter(SapSyncFile.sheet_name == sheet_name)
    if filename_contains:
        query = query.filter(SapSyncFile.source_filename.ilike(f'%{filename_contains}%'))

    record = query.order_by(SapSyncFile.received_at.desc()).first()
    if not record:
        return None, None

    path = os.path.join(current_app.config['UPLOAD_FOLDER'], record.stored_path)
    try:
        with open(path, 'rb') as handle:
            return handle.read(), record
    except OSError as e:
        logger.warning('SAP pool sync: cannot read %s: %s', record.stored_path, e)
        return None, record


def _equipment_lookup(plant_codes):
    """plant code -> equipment id, matching serial number OR name.

    import_sap_orders resolves the same two columns, so a code that works there
    works here. Ali's equipment screen shows the plant code (ECH02) as the name,
    with the manufacturer serial alongside.
    """
    if not plant_codes:
        return {}
    rows = Equipment.query.filter(
        (Equipment.serial_number.in_(plant_codes)) | (Equipment.name.in_(plant_codes))
    ).all()
    lookup = {}
    for equipment in rows:
        for key in (equipment.serial_number, equipment.name):
            if key in plant_codes:
                lookup[key] = equipment.id
    return lookup


def _rss_mb():
    """Resident memory, for the log line either side of the parse.

    The container ceiling is 512 MB and an OOM kill produces no traceback — so
    without a number before and after, "it stopped" and "it was killed" are
    indistinguishable. Returns None rather than raising on a platform without
    the counter.
    """
    try:
        import resource
        import sys
        value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return round(value / 1e6 if sys.platform == 'darwin' else value / 1e3)
    except Exception:  # noqa: BLE001
        return None


def _app_work_state_for(plan_id, order_number):
    """What the APP recorded a worker doing on this order, or None.

    Shares job_work_state with the removal rules so "has anyone touched this"
    has exactly one definition. ANY of the jobs, not the first: a 12h PM is
    planned as part 1/2 and part 2/2, and .first() could return the untouched
    half while the other is half done.
    """
    from app.api.work_plans import job_work_state
    from app.models import WorkPlanDay, WorkPlanJob
    jobs = (WorkPlanJob.query
            .join(WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id)
            .filter(WorkPlanDay.work_plan_id == plan_id,
                    WorkPlanJob.sap_order_number == order_number).all())
    for job in jobs:
        state = job_work_state(job)
        if state:
            return state
    return None


def _delivered_summary(limit=12):
    """What the courier has actually delivered, as the rebuild sees it.

    Deliberately reports is_current and whether the bytes are still ON DISK.
    The freshness stamp only asks "is there an IW39 row", while the rebuild also
    needs the row to be current and the file readable — so the two could
    disagree, and did: the bot said "SAP data: today 12:44" while the rebuild
    found nothing to read.
    """
    rows = (SapSyncFile.query.order_by(SapSyncFile.received_at.desc())
            .limit(limit).all())
    folder = current_app.config['UPLOAD_FOLDER']
    out = []
    for row in rows:
        on_disk = bool(row.stored_path) and os.path.exists(
            os.path.join(folder, row.stored_path))
        out.append({
            'sheet': row.sheet_name,
            'file': row.source_filename,
            'received_at': row.received_at.isoformat() if row.received_at else None,
            'size': row.file_size,
            'is_current': bool(row.is_current),
            'on_disk': on_disk,
        })
    return out


def sync_pool_from_delivered_files(today=None, dry_run=False):
    """Refresh the job pool from the most recent delivered SAP files.

    Returns a report. Nothing is written when `dry_run` is set, which is how a
    change gets inspected before it touches a live pool.
    """
    logger.info('SAP pool sync: starting (dry_run=%s, rss=%s MB)', dry_run, _rss_mb())

    iw39, iw39_record = _current_file_bytes(sheet_name='IW39')
    if not iw39:
        # This return used to save nothing, so /pool reported "never run" — the
        # same words a crash produces. A rebuild that decided not to run has a
        # reason, and that reason is the answer.
        reason = ('IW39 has been delivered but its stored file is missing or '
                  'unreadable' if iw39_record else
                  'no file labelled IW39 has been delivered yet')
        report = {'status': 'skipped', 'reason': reason,
                  'dry_run': dry_run, 'delivered': _delivered_summary()}
        logger.warning('SAP pool sync skipped: %s', reason)
        _save_report(report)
        return report

    # IW39 feeds four separate steps. Parse it ONCE and share the frame —
    # re-reading a 10 MB, 144-column workbook four times dominated the runtime.
    iw39_frame = load_iw39(iw39)
    del iw39

    # Each raw workbook is 10-25 MB and is needed only until it is parsed.
    # Holding all four for the whole run added ~50 MB of dead weight to a
    # process with a 512 MB ceiling, so each is released as soon as it is read.
    iw49, _ = _current_file_bytes(sheet_name='IW49')
    had_iw49 = bool(iw49)
    hours_by_order, _ = parse_operation_hours(iw49) if iw49 else ({}, {})
    # The same file, read a second time for the individual operations.
    #
    # Ali, 2026-09-10: "user should see the operations inside the order and he
    # can deal with each". They were always in this file — parse_operation_hours
    # summed them and threw every row away, 56,131 rows a run.
    #
    # parse_operations NEVER raises for an unrecognised layout: it returns
    # nothing and reports the headers it saw. We do not have a real export, and
    # a guessed column name in the strict reader would take this whole sync down
    # rather than just skipping the operations.
    operations_by_order, operations_report = (
        parse_operations(iw49) if iw49 else ({}, {}))
    del iw49

    ik17, _ = _current_file_bytes(sheet_name='IK17')
    had_ik17 = bool(ik17)
    meters = build_meter_index(ik17) if ik17 else {}
    del ik17

    plan_file, _ = _current_file_bytes(filename_contains=MAINTENANCE_PLAN_FILENAME_HINT)
    had_plan_file = bool(plan_file)
    plan_types = load_maintenance_plan_types(plan_file) if plan_file else {}
    del plan_file

    gc.collect()
    last_completion = build_last_completion_index(iw39_frame)
    breakdowns = build_breakdown_index(iw39_frame, today=today)
    # No duration index any more. It learned medians from SAP's PLANNED hours in
    # IW49 — which exist for 5,539 of 5,548 FINISHED orders and for NONE of the
    # open ones, so every job in the pool was priced by a median of a figure that
    # is inflated and, for a trailer PM, invented: 18.0h planned against 2.0h
    # really held. Hours now come from app/services/job_durations.py.

    candidates, parse_report = parse_open_orders(
        iw39_frame, hours_by_order, plan_types, last_completion, today=today)

    # Cluster count feeds the corrective rule: a machine carrying many open
    # faults is in a different condition from one with a single broken window.
    cluster = Counter(c['plant_code'] for c in candidates if c['pm_basis'] is None)

    codes = {c['plant_code'] for c in candidates if c['plant_code']}
    equipment_by_code = _equipment_lookup(codes)
    # The app already stores which berth a machine works — the asset list maps
    # every plant number to East or West. Copying it onto the order is what lets
    # the planner split a day into two crews.
    berth_by_equipment = {}
    if equipment_by_code:
        for equipment in Equipment.query.filter(
                Equipment.id.in_(set(equipment_by_code.values()))).all():
            berth_by_equipment[equipment.id] = equipment.berth

    # Keyed on order number across ALL rows, not just the box.
    #
    # Matching only box rows meant an order currently scheduled into a week was
    # not found, so the sync created a SECOND row for it. The same order number
    # then existed twice — once at work_plan_id NULL, once at the plan — and the
    # moment the generator tried to stamp the box copy with that plan it hit
    # UniqueConstraint('work_plan_id', 'order_number'). That is where 2,375 rows
    # came from, and why /generate died with a UniqueViolation.
    numbers = [c['order_number'] for c in candidates]

    # BEFORE the box snapshot, deliberately. Released rows have to land in
    # `existing` so the candidate loop refreshes their fields and stale-removal
    # can drop the ones SAP has closed. Running it afterwards would leave them
    # invisible until tomorrow — and manufacture a duplicate for each one.
    carry_over = {'skipped': 'disabled'}
    if current_app.config.get('SAP_CARRY_OVER_ENABLED'):
        from app.services.sap_carry_over import release_dead_week_orders
        carry_over = release_dead_week_orders(today=today, dry_run=dry_run)

    # EVERY box row, not just the candidates' — staleness is decided by what is
    # in the box and NOT in today's export, so narrowing this to the candidate
    # numbers would mean an order that left SAP could never be detected.
    existing = {row.order_number: row
                for row in SAPWorkOrder.query.filter(
                    SAPWorkOrder.work_plan_id.is_(None)).all()}

    # Planned work, possibly already started. Never touched here — it belongs to
    # the removal rules.
    #
    # "Planned" means there is a REAL JOB on a day of a week that has not ended.
    # An earlier version asked only "does this row carry a work_plan_id", which
    # is a completely different question: ~2,000 rows are legacy per-week
    # imports stamped to plans from weeks long gone (6, 7, 8, 9, 11, ...). That
    # read every one of them as "already planned" and deleted the fresh box copy
    # — the pool collapsed from 202 to 21 in a single rebuild.
    from app.models import WorkPlan, WorkPlanDay, WorkPlanJob
    from app.services.sap_carry_over import live_week_filter

    # live_week_filter is shared with the carry-over, which releases orders held
    # by a DEAD week. The two must be exact complements, or an order on the
    # boundary is either protected by both rules or claimed by both.
    scheduled_numbers = {row[0] for row in db.session.query(WorkPlanJob.sap_order_number)
                         .join(WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id)
                         .join(WorkPlan, WorkPlanDay.work_plan_id == WorkPlan.id)
                         .filter(live_week_filter(today),
                                 WorkPlanJob.sap_order_number.isnot(None))
                         .all()}

    # Self-heal the duplicates already created. A box row whose order number is
    # ALSO stamped to a plan is the spurious copy: the planned one is the record
    # of real work, so the box copy is the one that goes.
    duplicates = [row.id for number, row in existing.items()
                  if number in scheduled_numbers]
    if duplicates and not dry_run:
        SAPWorkOrder.query.filter(SAPWorkOrder.id.in_(duplicates)).delete(
            synchronize_session=False)
    for number in list(existing):
        if number in scheduled_numbers:
            del existing[number]

    # STRANDED rows: stamped to a plan but with no job on any day of it. Plan 40
    # had 69 this morning, left behind when its jobs were cleared.
    #
    # They are not protected (no job to protect) and not in the box, so the
    # candidate loop below would CREATE a second row — which UNIQUE(order_number)
    # now rejects, taking the whole rebuild down with it. Reclaiming them is both
    # the fix and the honest behaviour: a row nobody has a job for is not planned
    # work, it is pool stock wearing the wrong label.
    stranded = [row for row in SAPWorkOrder.query.filter(
        SAPWorkOrder.work_plan_id.isnot(None),
        SAPWorkOrder.order_number.in_(numbers)).all()
        if row.order_number not in scheduled_numbers]
    for row in stranded:
        if row.order_number in existing:
            # A box copy already exists from before the constraint. Drop the
            # stranded one rather than end up with two.
            if not dry_run:
                db.session.delete(row)
            continue
        if not dry_run:
            # Snapshot what a worker actually did BEFORE the link to that job is
            # gone. The job sits on a week that has ended, and finished weeks
            # get cleaned up — computing this later from the job would lose the
            # badge the moment those plans are deleted.
            state = _app_work_state_for(row.work_plan_id, row.order_number)
            if state:
                row.app_work_state = state
            row.work_plan_id = None
            row.status = 'pending'
        existing[row.order_number] = row
    if stranded and not dry_run:
        db.session.flush()

    created = updated = skipped_no_equipment = skipped_scheduled = 0
    skipped_retired = 0
    unmatched_codes = set()
    # code -> the order numbers dropped for it, so the warning can say WHICH
    # orders were lost rather than only how many.
    dropped_by_code = defaultdict(list)
    retired_hits = Counter()
    seen = set()

    # {250: id, 500: id, ...}. Read once — the loop below runs over every open
    # order. A missing row simply means no kit for that package; the order still
    # lands in the box, because one unusual description must never stop the
    # whole nightly rebuild.
    cycle_ids = {c.hours_value: c.id for c in MaintenanceCycle.query.filter_by(
        cycle_type='running_hours', is_active=True).all() if c.hours_value}

    for candidate in candidates:
        equipment_id = equipment_by_code.get(candidate['plant_code'])
        if not equipment_id:
            # `continue` drops THIS order only — the rest of the export is
            # unaffected. But it drops EVERY order on that machine, so one
            # unknown machine makes itself completely invisible to the planner.
            code = (candidate['plant_code'] or '').strip().upper()
            if code in RETIRED_PLANT_CODES:
                skipped_retired += 1
                retired_hits[code] += 1
            else:
                skipped_no_equipment += 1
                if code:
                    unmatched_codes.add(code)
                    dropped_by_code[code].append(candidate['order_number'])
            continue

        priority, overdue_value, overdue_unit = _priority_for(
            candidate, meters, last_completion, breakdowns, cluster)
        # Ali's table, 2026-08-24 — see app/services/job_durations.py for how the
        # figures were arrived at and what was measured and rejected.
        #
        # SAP's own planned hours are not used, and neither are the medians the
        # app used to learn from them: IW49 has hours for 5,539 of 5,548 FINISHED
        # orders and ZERO of the open ones, so every open order was priced by a
        # median of SAP's PLANNED figure — which is inflated, and in the trailer's
        # case invented (18.0h planned against 2.0h really held).
        #
        # The pool stores the STANDALONE price. A fault costs less when it rides
        # along with a PM, but whether it does is a question only the generator
        # can answer, when it bundles the machine's work onto a day.
        hours = hours_for(
            candidate['job_type'],
            activity_type=candidate['activity_type'],
            family=family_from_plant_code(candidate['plant_code']),
            with_pm=False,
            description=candidate['description'],
        )

        order_number = candidate['order_number']
        seen.add(order_number)
        fields = {
            'order_type': candidate['activity_type'],
            'job_type': candidate['job_type'],
            'equipment_id': equipment_id,
            'description': candidate['description'],
            'estimated_hours': hours,
            'priority': priority,
            'work_center': candidate['work_center'],
            'status': 'pending',
            # The fifth field the parser computed and this dict threw away.
            # Ali, 2026-09-04: REL without CNF means the work has STARTED, and
            # without storing it the app could only ever see the half of that
            # question its own tracking answers.
            'system_status': candidate.get('system_status'),
            # Everything below was computed by the parser and then thrown away,
            # which quietly disabled four things in the planner:
            #
            #   maintenance_base -> the PRM pool's Hourly sub-tab filters on
            #     'running_hours', so every hourly PM was invisible there.
            #   overdue_value/unit -> the red overdue heat scale reads these, so
            #     nothing ever ran hot however late it was.
            #   required_date -> the pool sorts by it, and an all-NULL column
            #     means the order on screen is arbitrary.
            #   berth -> the planner splits east/west, and NULL cannot.
            'maintenance_base': _maintenance_base(candidate),
            'overdue_value': overdue_value,
            'overdue_unit': overdue_unit,
            'required_date': _as_date(candidate.get('required_date')),
            'berth': berth_by_equipment.get(equipment_id),
            # WHICH service package this is — the 250-hour, the 4000-hour. The
            # fifth thing the parser computed and this dict threw away, and the
            # one that quietly disabled the material kits: `place_one` copies
            # `cycle_id` onto the job, `find_matching_kit(equipment_id,
            # job.cycle_id)` is the only route a kit reaches a job, and with
            # NULL the matcher falls to its last rule — which demands a kit with
            # NO interval and NO model. Every one of Ali's saved kits has both,
            # so not one of them could ever fire.
            'cycle_id': cycle_ids.get(pm_interval_hours(candidate['description']))
                        if candidate['job_type'] == 'pm' else None,
        }

        if order_number in scheduled_numbers:
            # Already planned into a week. Leave it exactly as it is.
            skipped_scheduled += 1
            continue

        order = existing.get(order_number)
        if order is None:
            if not dry_run:
                db.session.add(SAPWorkOrder(work_plan_id=None, order_number=order_number, **fields))
            created += 1
        else:
            # Ali: "copy everything" — the app must mirror SAP, so a corrected
            # estimate or a changed work centre actually lands. The previous
            # importer skipped duplicates silently, which defeats a daily sync.
            if not dry_run:
                for key, value in fields.items():
                    setattr(order, key, value)
            updated += 1

    # Orders that have left SAP's open list are done or cancelled: out of the
    # box. Only untouched box entries are removed — a scheduled order is
    # somebody's planned work and is governed by the removal rules instead.
    stale = [number for number in existing if number not in seen]
    if not dry_run and stale:
        SAPWorkOrder.query.filter(
            SAPWorkOrder.work_plan_id.is_(None),
            SAPWorkOrder.order_number.in_(stale),
        ).delete(synchronize_session=False)

    # An unknown machine is the one failure in this pipeline that leaves the
    # planner simply LOOKING empty. Until now it only incremented a counter in a
    # report that the Telegram /pool command was the sole reader of — so when the
    # bot went quiet, 38 orders could vanish nightly with nothing to notice.
    #
    # _Reporter is reused rather than reimplemented because it already carries
    # the three things this needs: de-duplication on (order_number, event_type)
    # so an unresolved machine is not re-announced every morning, a bilingual
    # in-app notification to the planners, and dry-run suppression.
    #
    # RETIRED_PLANT_CODES are deliberately NOT reported: they are a known,
    # decided exclusion, and mixing them in is what would make this warning
    # background noise within a week.
    if dropped_by_code:
        reporter = _Reporter(dry_run)
        for code, numbers in sorted(dropped_by_code.items()):
            reporter.report(
                event_type='orders_skipped_no_equipment',
                # The PLANT CODE, not an order number — see the comment on the
                # event type. One open question per machine, not per order.
                order_number=code,
                sap_state='open',
                summary=(f"{len(numbers)} SAP orders for {code} were not imported: "
                         f"{code} is not in the app's equipment list. Add the machine "
                         f"and its orders appear on the next rebuild."),
                summary_ar=(f"لم يتم استيراد {len(numbers)} أمر عمل للمعدة {code}: "
                            f"{code} غير موجودة في قائمة المعدات. أضف المعدة "
                            f"وستظهر أوامرها في التحديث القادم."),
                details={
                    'plant_code': code,
                    'order_count': len(numbers),
                    # Capped: the point is to identify the work, not to store
                    # an unbounded list in a JSON column.
                    'order_numbers': numbers[:50],
                },
                priority='warning',
            )

    if not dry_run:
        db.session.commit()

    # The box is now current. The other half of the job is the orders that have
    # already LEFT the box and are sitting on somebody's day — the removal rules.
    # Run second so that a closed order is never re-created by the box sync after
    # reconciliation has just taken it off a plan.
    removal = reconcile_scheduled_orders(
        build_order_status_index(iw39_frame),
        today=today or planning_today(),
        dry_run=dry_run,
    )

    logger.info('SAP pool sync: parse done (peak rss=%s MB)', _rss_mb())
    # Counted directly rather than by subtraction: `codes` also holds the
    # retired machines, so `len(codes) - len(unmatched_codes)` would quietly
    # count a sold machine as successfully matched.
    matched = len(codes & set(equipment_by_code))
    report = {
        'status': 'ok',
        'dry_run': dry_run,
        'source_file': iw39_record.source_filename if iw39_record else None,
        'source_received_at': iw39_record.received_at.isoformat() if iw39_record else None,
        'candidates': len(candidates),
        'created': created,
        'updated': updated,
        'removed_from_pool': len(stale),
        'left_alone_because_scheduled': skipped_scheduled,
        'stranded_reclaimed': len(stranded),
        'carry_over': carry_over,
        'duplicate_box_rows_removed': len(duplicates),
        'equipment_matched': matched,
        'equipment_unmatched': len(unmatched_codes),
        'unmatched_codes': sorted(unmatched_codes),
        'orders_skipped_no_equipment': skipped_no_equipment,
        # Which machine cost which orders. Without this the report says 38 were
        # lost across four codes and leaves you to guess how they split — and
        # adding one machine back then looks like it did not work.
        'orders_skipped_by_code': {c: len(n) for c, n in sorted(dropped_by_code.items())},
        'retired_codes': sorted(retired_hits),
        'orders_skipped_retired': skipped_retired,
        'inputs': {'iw49': had_iw49, 'ik17': had_ik17, 'maintenance_plan': had_plan_file},
        # What the operation import actually managed. `usable: false` with the
        # real headers listed is how we learn this export's column names.
        'operations': dict(operations_report,
                           stored=sync_order_operations(operations_by_order,
                                                        dry_run=dry_run)),
        'delivered': _delivered_summary(),
        'removal_rules': removal,
        'parse': parse_report,
    }
    logger.info('SAP pool sync: %s',
                {k: v for k, v in report.items() if k not in ('parse', 'removal_rules')})
    _save_report(report)
    return report


# The rebuild runs unattended in a background thread, so its report has nowhere
# to be returned to. Kept as a file on the persistent disk rather than a table:
# start.sh runs `flask db upgrade || echo WARNING`, so a migration that fails
# does not stop the boot and the table would silently not exist.
REPORT_FILENAME = 'last_report.json'
DRY_RUN_REPORT_FILENAME = 'last_dry_run.json'


_SPLIT_SUFFIX_RE = re.compile(r'-P\d+$')


def _orders_the_app_knows():
    """Order numbers worth keeping operations for.

    WHY THIS FILTER EXISTS

    The first real run imported 56,941 operations across 19,375 orders — every
    order in the year-to-date export, including thousands closed months ago. The
    pool holds 183. It added six and a half minutes to a three-and-a-half minute
    sync, and would have re-written all 56,941 rows every night, for data nobody
    can ever open: an order that is not in the pool and not on a plan has no
    screen to appear on.

    So: the pool, plus anything already placed on a week. Roughly 200 orders.
    """
    known = set()
    for (number,) in db.session.query(SAPWorkOrder.order_number).all():
        if number:
            known.add(str(number).strip())
    from app.models import WorkPlanJob
    for (number,) in (db.session.query(WorkPlanJob.sap_order_number)
                      .filter(WorkPlanJob.sap_order_number.isnot(None)).all()):
        if number:
            # A split job carries '<order>-P2'; its operations hang on the parent.
            known.add(_SPLIT_SUFFIX_RE.sub('', str(number).strip()))
    return known


def apply_order_trade(order_key):
    """Give an order the trade label its OPERATIONS say it needs.

    TWO HOLES, ONE FIX
    ==================

    1. A job sits in a team's column by its own work_center, and nothing was
       reconciling that with the operations inside it. An order SAP labels MECH
       containing an electrical operation showed only to the mechanical team —
       the electrician never saw it, and the line he was supposed to do was
       invisible to the only man who could do it.

    2. Worse, and only visible once the real data was read (2026-09-11):
       195 of 196 pool orders have NO work centre at all. IW39 simply does not
       fill it. The operations DO — IW49 carries MES-MECH / MES-ELEC / MES-ELME
       per line — which makes IW49 a better source of trade than IW39.

    FILL, OR WIDEN. NEVER NARROW.
    =============================

      * no label at all -> take what the operations say
      * label already covers what the operations need -> leave it alone
      * operations need something the label does not cover -> ELME

    Re-labelling an order because our reading of the file differs would be
    overruling SAP about its own order. Making it reach one more crew is not the
    same claim.

    MES-SUPV is supervision, not a trade (Ali, 2026-09-12), so it never pushes an
    order into a trade and never makes one "both".

    Returns how many rows changed.
    """
    from app.models.work_plan_job_task import WorkPlanJobTask
    from app.models import WorkPlanJob
    from app.services.sap_order_parser import trade_label_for

    needed = trade_label_for(
        row.work_center for row in WorkPlanJobTask.query.filter_by(
            anchor_kind='sap', anchor_key=order_key).all())
    if not needed:
        return 0

    def settle(current):
        if not current:
            return needed
        if current == needed or current == 'ELME':
            return current
        # The label and the operations disagree: reach both crews rather than
        # pick a winner.
        return 'ELME'

    changed = 0
    for order in SAPWorkOrder.query.filter_by(order_number=order_key).all():
        wanted = settle(order.work_center)
        if order.work_center != wanted:
            order.work_center = wanted
            changed += 1
    for job in WorkPlanJob.query.filter(
            WorkPlanJob.sap_order_number == order_key).all():
        wanted = settle(job.work_center)
        if job.work_center != wanted:
            job.work_center = wanted
            changed += 1
    return changed


def widen_order_trade_to_both(order_key):
    """Kept as the old name. See apply_order_trade()."""
    return apply_order_trade(order_key)


def find_orphan_operations(known_orders=None):
    """(safe_to_remove, kept_because_work_was_done) among SAP operation rows.

    The first production import ran before the scope filter and stored
    operations for every order in the year-to-date export — 56,941 rows across
    19,375 orders, while the pool held 183. The filter stops NEW ones; it cannot
    reach the ones already written, because the sync now skips those orders
    entirely. They would sit in work_plan_job_tasks forever.

    Three things are never returned as removable:
      * anything a person typed (source != 'sap')
      * any operation with work on it — ticked, started, or with real hours
      * any order still in the pool or on a plan
    """
    from app.models.work_plan_job_task import WorkPlanJobTask

    if known_orders is None:
        known_orders = _orders_the_app_knows()

    safe, kept = [], []
    for row in WorkPlanJobTask.query.filter_by(source='sap').all():
        if row.anchor_kind != 'sap' or row.anchor_key in known_orders:
            continue
        if row.is_done or row.started_at or row.actual_hours or row.children:
            kept.append(row)
        else:
            safe.append(row)
    return safe, kept


def orphan_operation_ids(known_orders=None, limit=None):
    """Just the ids, chosen in SQL. No ORM objects loaded.

    The first version of the cleanup loaded all 56,941 rows as objects and then
    deleted them one at a time — one database round trip PER ROW. On production
    it managed 2,500 before the Render shell gave up, and the progress line made
    it look finished when it was not.

    This asks the database the same question and gets back only the ids, so the
    delete can be one statement per batch instead of one per row.

    The three exclusions are identical to find_orphan_operations(), expressed as
    a WHERE clause: SAP-authored only, order not known, and no work recorded.
    """
    from app.models.work_plan_job_task import WorkPlanJobTask

    if known_orders is None:
        known_orders = _orders_the_app_knows()

    # Anything with media hung on it is excluded the same way work is: the
    # children subquery is the SQL spelling of `or row.children`.
    has_children = (db.session.query(WorkPlanJobTask.parent_task_id)
                    .filter(WorkPlanJobTask.parent_task_id.isnot(None))
                    .subquery())

    query = (db.session.query(WorkPlanJobTask.id)
             .filter(WorkPlanJobTask.source == 'sap',
                     WorkPlanJobTask.anchor_kind == 'sap',
                     WorkPlanJobTask.is_done.is_(False),
                     WorkPlanJobTask.started_at.is_(None),
                     WorkPlanJobTask.actual_hours.is_(None),
                     ~WorkPlanJobTask.id.in_(db.session.query(has_children))))
    if known_orders:
        query = query.filter(~WorkPlanJobTask.anchor_key.in_(known_orders))
    if limit:
        query = query.limit(limit)
    return [row_id for (row_id,) in query.all()]


def delete_operation_rows(ids, batch_size=2000, on_progress=None):
    """Delete by id, one statement per batch.

    `synchronize_session=False` because nothing in this process is holding those
    objects — checking would re-load the very rows being removed.
    """
    from app.models.work_plan_job_task import WorkPlanJobTask

    removed = 0
    for start in range(0, len(ids), batch_size):
        chunk = ids[start:start + batch_size]
        (WorkPlanJobTask.query
         .filter(WorkPlanJobTask.id.in_(chunk))
         .delete(synchronize_session=False))
        db.session.commit()
        removed += len(chunk)
        if on_progress:
            on_progress(removed, len(ids))
    return removed


def sync_order_operations(operations_by_order, dry_run=False, known_orders=None):
    """Store IW49's operations as rows on each order's task list.

    Only for orders the app knows — see _orders_the_app_knows(). None asks the
    database; an explicit empty set means "no filter", which only tests want.

    UPSERT, NEVER REPLACE
    =====================

    Keyed on (anchor, operation_number). A re-sync refreshes the text, the hours
    and the work centre — and NEVER touches `is_done`, `status`, `started_at`,
    `paused_at` or `actual_hours`. A man ticked that box and a timer ran against
    that operation; a Tuesday morning file refresh must not undo either.

    An operation SAP no longer sends is kept, not deleted, when work has been
    done against it. Deleting it would erase the record that the work happened.
    An untouched one is dropped, because it is simply not part of the order any
    more.

    Returns a small report.
    """
    from app.models.work_plan_job_task import WorkPlanJobTask
    from app.models.work_plan_job_task import _SPLIT_SUFFIX

    counts = {'orders': 0, 'added': 0, 'updated': 0,
              'kept_but_gone_from_sap': 0, 'removed': 0,
              'skipped_unknown_orders': 0}
    if not operations_by_order:
        return counts

    if known_orders is None:
        known_orders = _orders_the_app_knows()

    for order_number, operations in operations_by_order.items():
        key = _SPLIT_SUFFIX.sub('', str(order_number).strip())
        if not key:
            continue
        if known_orders and key not in known_orders:
            counts['skipped_unknown_orders'] += 1
            continue
        counts['orders'] += 1

        existing = {row.operation_number: row for row in
                    WorkPlanJobTask.query.filter_by(
                        anchor_kind='sap', anchor_key=key, source='sap').all()}
        seen = set()

        for position, op in enumerate(operations):
            number = op['operation_number']
            seen.add(number)
            row = existing.get(number)
            text_ = op['description'] or f'Operation {number}'
            if row is None:
                if not dry_run:
                    db.session.add(WorkPlanJobTask(
                        anchor_kind='sap', anchor_key=key,
                        source='sap',
                        operation_number=number,
                        content=text_,
                        work_center=op['work_center'],
                        planned_hours=op['planned_hours'],
                        purchase_requisition=op.get('purchase_requisition'),
                        material_text=op.get('material_text'),
                        status='pending',
                        position=position,
                        # SAP is the author, not a person. created_by_id is NOT
                        # NULL, so the sync's own user is used where one exists.
                        created_by_id=_sync_author_id(),
                    ))
                counts['added'] += 1
            else:
                # Refresh what SAP owns. Never what a man did.
                row.content = text_
                row.work_center = op['work_center']
                row.planned_hours = op['planned_hours']
                # A part arriving CLEARS the block, so this must refresh both
                # ways — a stale requisition would leave a man thinking he is
                # still waiting for something that is already on the shelf.
                row.purchase_requisition = op.get('purchase_requisition')
                row.material_text = op.get('material_text')
                row.position = position
                counts['updated'] += 1

        for number, row in existing.items():
            if number in seen:
                continue
            # A photo or voice note hung on this operation is a person's work
            # too. SAP dropping the line does not make his evidence disposable.
            touched = bool(row.is_done or row.started_at or row.actual_hours
                           or row.children)
            if touched:
                # Keep the evidence. Flag it so the screen can say so.
                row.status = 'removed_in_sap'
                counts['kept_but_gone_from_sap'] += 1
            else:
                if not dry_run:
                    db.session.delete(row)
                counts['removed'] += 1

    # An order needing both trades must reach both teams' columns.
    if not dry_run:
        for order_number in operations_by_order:
            key = _SPLIT_SUFFIX.sub('', str(order_number).strip())
            if key and (not known_orders or key in known_orders):
                counts['trade_labels_set'] = (
                    counts.get('trade_labels_set', 0) + apply_order_trade(key))
        db.session.commit()
    return counts


def _sync_author_id():
    """A user id to stamp SAP-authored rows with.

    created_by_id is NOT NULL and the sync is a robot. Prefer any admin; fall
    back to the lowest user id so a fresh database still imports.
    """
    from app.models import User
    admin = User.query.filter_by(role='admin').order_by(User.id).first()
    if admin:
        return admin.id
    any_user = User.query.order_by(User.id).first()
    return any_user.id if any_user else None


def _report_path(dry_run=False):
    folder = os.path.join(current_app.config['UPLOAD_FOLDER'], 'sap_sync')
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder,
                        DRY_RUN_REPORT_FILENAME if dry_run else REPORT_FILENAME)


def _save_report(report):
    """Persist the report so /pool and the web can read it without a shell.

    Dry runs are kept SEPARATELY: a dry run is a diagnostic, and letting it
    overwrite the record of the last real rebuild would mean "what did the robot
    actually do last night" could be answered with "nothing, it was a rehearsal".

    Written to a temporary name and renamed, so a crash mid-write leaves the
    previous report intact rather than a half-file that parses as nothing.
    """
    try:
        import json
        stored = {k: v for k, v in report.items() if k != 'parse'}
        stored['written_at'] = datetime.utcnow().isoformat()
        path = _report_path(report.get('dry_run', False))
        tmp = f'{path}.tmp'
        with open(tmp, 'w') as handle:
            json.dump(stored, handle, default=str)
        os.replace(tmp, path)
    except Exception as e:  # noqa: BLE001
        # Never let bookkeeping fail a rebuild that already succeeded.
        logger.warning('Could not save the pool report: %s', e)


def load_last_report(dry_run=False):
    """The last rebuild's report, or None if one has never finished."""
    try:
        import json
        with open(_report_path(dry_run)) as handle:
            return json.load(handle)
    except Exception:  # noqa: BLE001
        return None


def _maintenance_base(candidate):
    """The app's word for what the parser calls pm_basis.

    'running_hours' is what the planner's Hourly sub-tab filters on, so the
    exact string matters — anything else and those PMs are invisible there.
    """
    basis = candidate.get('pm_basis')
    if basis == 'hourly':
        return 'running_hours'
    if basis == 'calendar':
        return 'calendar'
    return None


def _as_date(value):
    """SAP dates arrive as '2026-08-01 00:00:00' strings; the column is a DATE."""
    if not value:
        return None
    try:
        import pandas as pd
        parsed = pd.to_datetime(value, errors='coerce')
        return None if pd.isna(parsed) else parsed.date()
    except Exception:  # noqa: BLE001
        return None


def _priority_for(candidate, meters, last_completion, breakdowns, cluster):
    """Route a candidate to the rule for its kind of work.

    Returns (priority, overdue_value, overdue_unit). The overdue figure was
    being computed and discarded, which left the planner's red heat scale dark
    no matter how late a job was.
    """
    basis = candidate['pm_basis']

    if basis == 'calendar':
        # Ali's rule counts days since the order was created, with days since
        # this service last finished as the overriding second signal. The larger
        # of the two is what the card should run hot on.
        overdue = max(candidate.get('age_days') or 0,
                      candidate.get('days_since_last_pm') or 0)
        return candidate['priority'], (overdue or None), ('days' if overdue else None)

    if basis == 'hourly':
        hours_run = hours_run_since(meters, candidate['plant_code'],
                                    last_completion.get(candidate['maintenance_plan']))
        priority, hours_past_due = hourly_pm_priority(hours_run)
        # None means the meter was replaced and the figure is unknowable. Leave
        # it at normal rather than guessing — reported, not hidden.
        if priority is None:
            return 'normal', None, None
        past = hours_past_due if (hours_past_due or 0) > 0 else None
        return priority, (round(past, 1) if past else None), ('hours' if past else None)

    priority, _ = corrective_priority(
        is_released=candidate['is_released'],
        breakdowns_30d=breakdowns.get(candidate['plant_code'], 0),
        open_defects_on_equipment=cluster.get(candidate['plant_code'], 0),
        description=candidate['description'],
    )
    # Correctives have no due date in SAP; age is the only honest number, and
    # it is the signal Ali chose for them.
    age = candidate.get('age_days') or 0
    return priority, (age or None), ('days' if age else None)
