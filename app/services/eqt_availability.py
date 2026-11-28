"""The planning team's daily equipment availability, as the courier delivers it.

Source: the planners' "Equipment Availability" mail, turned into
`Source file / EQT_Availability.xlsx` on the courier PC (note:
tasks/pc-note-eqt-availability.md). First delivered 2026-11-27: 185 machines,
11 not available.

Rule 2 (Ali, 2026-11-27). SHOWN on the board only, for now: the planner does
not skip anything because of this file yet. The hold rule needs SAP's parts
data to know WHY a machine is stopped — the mail gives a status only, so
`Stop type` is almost always OTHER. "Parked" counts as available (Ali).

The same rules as the PRM list (prm_overdue.py), each load-bearing:
  * Found by exact (source_folder, source_filename) — never sheet_name ('OTHER')
    and never LIKE (`_` is a SQL wildcard).
  * A new upload REPLACES the list. Header only = every machine available.
  * Headers read by NAME. Rows with no Equipment are skipped.
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
SOURCE_FILENAME = "EQT_Availability.xlsx"

# A daily mail. Older than this and the board says so: a machine marked
# "not available" four days ago may well be working again.
STALE_AFTER_DAYS = 3

_IRAQ_OFFSET = timedelta(hours=3)

_COLUMNS = {
    "equipment": "equipment",
    "available": "available",
    "stop type": "stop_type",
    "reason": "reason",
    "mail received": "mail_received",
}

_STOP_TYPES = ("WAITING_PARTS", "IN_PROGRESS", "OTHER")

_cache = {}


def current_record():
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
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M")
    text = " ".join(str(value).split())
    return text or None


def _is_available(value):
    """Yes -> True, No -> False. Anything else is unknown, shown as available:
    a typo must never mark a working machine as stopped."""
    text = (_text(value) or "").lower()
    if text in ("no", "n", "false", "0"):
        return False
    return True


def parse(xlsx_bytes):
    """Rows of the sheet, stopped machines first. Pure — no database."""
    from openpyxl import load_workbook

    book = load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)
    sheet = book.worksheets[0]
    lines = sheet.iter_rows(values_only=True)
    header = next(lines, None) or ()
    keys = [_COLUMNS.get(" ".join(str(h or "").lower().split())) for h in header]
    missing = {"equipment", "available"} - set(keys)
    if missing:
        book.close()
        raise ValueError(
            f"{SOURCE_FILENAME}: missing column(s) {sorted(missing)}; found {list(header)}"
        )

    rows = []
    for line in lines:
        raw = {key: value for key, value in zip(keys, line) if key}
        equipment = _text(raw.get("equipment"))
        if not equipment:
            continue
        available = _is_available(raw.get("available"))
        stop_type = (_text(raw.get("stop_type")) or "").upper() or None
        if available:
            stop_type = None
        elif stop_type not in _STOP_TYPES:
            stop_type = "OTHER"  # never invent a reason the mail did not give
        rows.append(
            {
                "equipment": equipment.upper(),
                "available": available,
                "stop_type": stop_type,
                "reason": _text(raw.get("reason")),
                "mail_received": _text(raw.get("mail_received")),
            }
        )
    book.close()
    rows.sort(key=lambda r: (r["available"], r["equipment"]))
    return rows


def _received_utc(text):
    try:
        return datetime.strptime(text, "%Y-%m-%d %H:%M") - _IRAQ_OFFSET
    except (TypeError, ValueError):
        return None


def build_payload(rows, now=None):
    now = now or datetime.utcnow()
    received = next((r["mail_received"] for r in rows if r["mail_received"]), None)
    received_utc = _received_utc(received)
    age_days = (
        None
        if received_utc is None
        else round((now - received_utc).total_seconds() / 86400, 1)
    )
    return {
        "mail_received": received,
        "mail_age_days": age_days,
        "is_stale": age_days is not None and age_days > STALE_AFTER_DAYS,
        "machines": len(rows),
        "not_available_count": sum(1 for r in rows if not r["available"]),
        "rows": rows,
    }


def current_list():
    """The payload for the newest delivered file; `available` False = never delivered."""
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
        logger.info(
            "EQT availability: parsed %s (%d rows)", record.stored_path, len(rows)
        )

    return {
        **build_payload(rows),
        "available": True,
        "file_received_at": record.received_at.isoformat()
        if record.received_at
        else None,
    }
