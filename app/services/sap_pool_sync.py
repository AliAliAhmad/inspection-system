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
from datetime import datetime
from collections import Counter

from flask import current_app

from app.extensions import db
from app.models import Equipment, SapSyncFile, SAPWorkOrder
from app.services.sap_order_parser import (
    build_breakdown_index,
    build_order_status_index,
    load_iw39,
    build_duration_index,
    build_last_completion_index,
    build_meter_index,
    corrective_priority,
    estimate_hours,
    hourly_pm_priority,
    hours_run_since,
    load_maintenance_plan_types,
    parse_open_orders,
    parse_operation_hours,
)
from app.services.sap_removal_rules import reconcile_scheduled_orders

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
    durations = build_duration_index(iw39_frame, hours_by_order)

    candidates, parse_report = parse_open_orders(
        iw39_frame, hours_by_order, plan_types, last_completion, today=today)

    # Cluster count feeds the corrective rule: a machine carrying many open
    # faults is in a different condition from one with a single broken window.
    cluster = Counter(c['plant_code'] for c in candidates if c['pm_basis'] is None)

    codes = {c['plant_code'] for c in candidates if c['plant_code']}
    equipment_by_code = _equipment_lookup(codes)

    existing = {o.order_number: o
                for o in SAPWorkOrder.query.filter(SAPWorkOrder.work_plan_id.is_(None)).all()}

    created = updated = skipped_no_equipment = 0
    unmatched_codes = set()
    seen = set()

    for candidate in candidates:
        equipment_id = equipment_by_code.get(candidate['plant_code'])
        if not equipment_id:
            skipped_no_equipment += 1
            if candidate['plant_code']:
                unmatched_codes.add(candidate['plant_code'])
            continue

        priority = _priority_for(candidate, meters, last_completion, breakdowns, cluster)
        hours = (candidate['estimated_hours'] if candidate['hours_from_iw49']
                 else estimate_hours(durations, candidate['activity_type'], candidate['plant_code']))

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
        }

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
    from app.utils.decorators import planning_today
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


def _priority_for(candidate, meters, last_completion, breakdowns, cluster):
    """Route a candidate to the rule for its kind of work."""
    basis = candidate['pm_basis']

    if basis == 'calendar':
        return candidate['priority']

    if basis == 'hourly':
        hours_run = hours_run_since(meters, candidate['plant_code'],
                                    last_completion.get(candidate['maintenance_plan']))
        priority, _ = hourly_pm_priority(hours_run)
        # None means the meter was replaced and the figure is unknowable. Leave
        # it at normal rather than guessing — reported, not hidden.
        return priority or 'normal'

    priority, _ = corrective_priority(
        is_released=candidate['is_released'],
        breakdowns_30d=breakdowns.get(candidate['plant_code'], 0),
        open_defects_on_equipment=cluster.get(candidate['plant_code'], 0),
        description=candidate['description'],
    )
    return priority
