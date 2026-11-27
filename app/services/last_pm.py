"""When each machine last had a finished PM (Rule 1, Ali 2026-11-27).

Among jobs with the SAME score, the machine with the oldest last PM goes first,
because a machine nobody has serviced for a long time may be hiding damage. It
never changes a score, so an overdue or urgent job always still wins.

The nightly SAP sync builds the list from IW39 and saves it here; the generator
and the board read it. A file on the persistent disk (beside the sync's own
report), not a table: no schema change, and the list is rebuilt every night.

Failure is quiet on purpose: a missing or broken file means "no dates known",
every machine ties, and the plan comes out exactly as it did before this rule.
"""

import json
import logging
import os
import re
from datetime import datetime

from flask import current_app

logger = logging.getLogger(__name__)

FILENAME = "last_pm.json"

# 'TT058', 'TT058 - Terminal Tractor', 'tt058' -> 'TT058'. The same rule the
# board uses to match the planner's PRM list (PrmOverdue.tsx machineCode).
_CODE_RE = re.compile(r"^[A-Z]{2,4}\d{2,4}")


def machine_code(name):
    match = _CODE_RE.match((name or "").strip().upper())
    return match.group(0) if match else None


def _path():
    folder = os.path.join(current_app.config["UPLOAD_FOLDER"], "sap_sync")
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, FILENAME)


def save(by_machine):
    """Write the list. Never raises — a sync that worked must not fail here."""
    try:
        path = _path()
        tmp = f"{path}.tmp"
        with open(tmp, "w") as handle:
            json.dump(
                {"written_at": datetime.utcnow().isoformat(), "by_machine": by_machine},
                handle,
            )
        os.replace(tmp, path)
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not save the last-PM list: %s", e)


def load():
    """{'available': bool, 'written_at': str|None, 'by_machine': {code: date}}."""
    try:
        with open(_path()) as handle:
            data = json.load(handle)
        by_machine = data.get("by_machine")
        if not isinstance(by_machine, dict):
            raise ValueError("by_machine is not a mapping")
        return {
            "available": True,
            "written_at": data.get("written_at"),
            "by_machine": by_machine,
        }
    except FileNotFoundError:
        return {"available": False, "written_at": None, "by_machine": {}}
    except Exception:
        logger.warning("Last-PM list unreadable, ignored", exc_info=True)
        return {"available": False, "written_at": None, "by_machine": {}}


def summary(by_machine):
    """For the sync report: how many machines, and how far back IW39 reaches."""
    dates = sorted(by_machine.values())
    return {
        "machines": len(dates),
        "oldest": dates[0] if dates else None,
        "newest": dates[-1] if dates else None,
    }
