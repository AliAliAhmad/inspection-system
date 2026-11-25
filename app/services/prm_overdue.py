"""The planner's list of overdue PRM services, as the courier delivers it.

Source: the planner's weekly PM-MES-WEEK mail, turned into `PRM_Overdue.xlsx`
on the terminal PC and uploaded by the courier (spec: SERVER_PRM_OVERDUE.md,
delivered 2026-11-25). The PC already drops orders SAP has closed, so the
numbers here are the PLANNER's, not ours — shown beside the app's own overdue
badge, never merged into it (Ali, 2026-11-25: "both, side by side").

Rules from the spec, each one load-bearing:
  * The file is found by its exact (source_folder, source_filename). Never by
    sheet_name — it is 'OTHER', shared with other files — and never by a LIKE:
    in SQL `_` matches any character, so '%PRM_Overdue%' also matches
    'SERVER_PRM_OVERDUE.md' (it did, the first time this was looked up).
  * A new upload REPLACES the list. Rows from two uploads are never merged.
  * A file with only the header row is valid and means "nothing overdue".
  * Headers are read by NAME, not position. Rows with no Equipment are skipped.
  * The order number stays text — 12 digits must not become a float.
"""

import io
import logging
import os
from datetime import datetime, timedelta

from flask import current_app
from sqlalchemy import func

from app.extensions import db
from app.models import SapSyncFile

logger = logging.getLogger(__name__)

SOURCE_FOLDER = "Source file"
SOURCE_FILENAME = "PRM_Overdue.xlsx"
SHEET = "PRM Overdue"

# "warn if older than 8 days" — a weekly mail that missed one week.
STALE_AFTER_DAYS = 8

# The mail's time is Iraq local (UTC+3), written as text.
_IRAQ_OFFSET = timedelta(hours=3)

# Header (lower-cased, spaces squeezed) -> key in the API row.
_COLUMNS = {
    "equipment": "equipment",
    "functional location": "functional_location",
    "order": "order",
    "cycle (h)": "cycle_hours",
    "hours overdue": "hours_overdue",
    "planned rh": "planned_rh",
    "sap status": "sap_status",
    "plan week": "plan_week",
    "plan mail received": "plan_received",
}

# One parse per delivered file: (record id, sha256) -> rows. The file is
# ~5 KB and changes about once a week; the board asks on every refresh.
_cache = {}


def current_record():
    """The newest delivered copy of the file, or None if it never arrived."""
    return (
        SapSyncFile.query.filter(
            SapSyncFile.is_current.is_(True),
            SapSyncFile.stored_path.isnot(None),
            SapSyncFile.source_folder == SOURCE_FOLDER,
            func.lower(SapSyncFile.source_filename) == SOURCE_FILENAME.lower(),
        )
        .order_by(SapSyncFile.received_at.desc())
        .first()
    )


def _text(value):
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = str(value).strip()
    return text or None


def _number(value):
    if value is None or str(value).strip() == "":
        return None
    try:
        number = float(str(value).strip())
    except ValueError:
        return None
    return int(number) if number.is_integer() else round(number, 1)


def parse(xlsx_bytes):
    """Rows of the sheet, most overdue first. Pure — no database."""
    from openpyxl import load_workbook

    book = load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)
    sheet = book[SHEET] if SHEET in book.sheetnames else book.worksheets[0]
    lines = sheet.iter_rows(values_only=True)
    header = next(lines, None) or ()
    keys = [_COLUMNS.get(" ".join(str(h or "").lower().split())) for h in header]
    missing = {"equipment", "order", "hours_overdue"} - set(keys)
    if missing:
        book.close()
        raise ValueError(
            f"{SOURCE_FILENAME}: missing column(s) {sorted(missing)}; "
            f"found {list(header)}"
        )

    rows = []
    for line in lines:
        raw = {key: value for key, value in zip(keys, line) if key}
        equipment = _text(raw.get("equipment"))
        if not equipment:
            continue
        rows.append(
            {
                "equipment": equipment.upper(),
                "functional_location": _text(raw.get("functional_location")),
                "order": _text(raw.get("order")),
                "cycle_hours": _number(raw.get("cycle_hours")),
                "hours_overdue": _number(raw.get("hours_overdue")),
                "planned_rh": _number(raw.get("planned_rh")),
                "sap_status": _text(raw.get("sap_status")),
                "plan_week": _number(raw.get("plan_week")),
                "plan_received": _text(raw.get("plan_received")),
            }
        )
    book.close()
    rows.sort(key=lambda r: r["hours_overdue"] or 0, reverse=True)
    return rows


def _received_utc(text):
    try:
        return datetime.strptime(text, "%Y-%m-%d %H:%M") - _IRAQ_OFFSET
    except (TypeError, ValueError):
        return None


def build_payload(rows, now=None):
    """What GET /api/prm-overdue returns, from parsed rows."""
    now = now or datetime.utcnow()
    received = next((r["plan_received"] for r in rows if r["plan_received"]), None)
    week = next((r["plan_week"] for r in rows if r["plan_week"] is not None), None)
    received_utc = _received_utc(received)
    age_days = (
        None
        if received_utc is None
        else round((now - received_utc).total_seconds() / 86400, 1)
    )
    return {
        "plan_week": week,
        "plan_received": received,
        "plan_received_age_days": age_days,
        "is_stale": age_days is not None and age_days > STALE_AFTER_DAYS,
        "rows": rows,
    }


def current_list():
    """The payload for the newest delivered file.

    `available` is False when the courier never delivered the file, so the
    board can say "no list yet" instead of "nothing overdue" — those are
    different facts and must not look alike.
    """
    record = current_record()
    if record is None:
        return {**build_payload([]), "available": False, "file_received_at": None}

    key = (record.id, record.sha256)
    rows = _cache.get(key)
    if rows is None:
        path = os.path.join(current_app.config["UPLOAD_FOLDER"], record.stored_path)
        with open(path, "rb") as handle:
            rows = parse(handle.read())
        _cache.clear()  # a new upload replaces the list, never merges
        _cache[key] = rows
        if record.parsed_at is None:
            record.parsed_at = datetime.utcnow()
            db.session.commit()
        logger.info("PRM overdue: parsed %s (%d rows)", record.stored_path, len(rows))

    return {
        **build_payload(rows),
        "available": True,
        "file_received_at": record.received_at.isoformat()
        if record.received_at
        else None,
    }
