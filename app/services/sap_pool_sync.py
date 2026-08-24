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
from datetime import date, datetime
from collections import Counter

from flask import current_app

from app.extensions import db
from app.models import Equipment, SapSyncFile, SAPWorkOrder
from app.services.job_durations import family_from_plant_code, hours_for
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
)
from app.services.sap_removal_rules import reconcile_scheduled_orders
from app.utils.decorators import planning_today

logger = logging.getLogger(__name__)

# Which delivered file plays which role. Matched on sheet_name for the SAP
# transactions; the maintenance-plan classification is a file Ali maintains by
# hand, so it is found by filename instead.
MAINTENANCE_PLAN_FILENAME_HINT = 'maintenance plan'


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
            row.work_plan_id = None
            row.status = 'pending'
        existing[row.order_number] = row
    if stranded and not dry_run:
        db.session.flush()

    created = updated = skipped_no_equipment = skipped_scheduled = 0
    unmatched_codes = set()
    seen = set()

    for candidate in candidates:
        equipment_id = equipment_by_code.get(candidate['plant_code'])
        if not equipment_id:
            skipped_no_equipment += 1
            if candidate['plant_code']:
                unmatched_codes.add(candidate['plant_code'])
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
    matched = len(codes) - len(unmatched_codes)
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
        'inputs': {'iw49': had_iw49, 'ik17': had_ik17, 'maintenance_plan': had_plan_file},
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
