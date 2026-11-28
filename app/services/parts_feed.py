"""Which open orders are waiting for parts — read from SAP each night.

Steps 1 and 2 of tasks/parts-hold-plan.md (Ali's OK 2026-11-28, a/b/c/d yes).
SHADOW ONLY: the result is saved and reported, nothing reads it to hold work yet.

The chain:
    order -> PR + item   IW49 operations (in the sync) + ME5K (today and remembered)
    PR + item -> PO      ME5A (also its Deletion Indicator) or ME5K
    PO + item -> arrived ME2L 'Still to be delivered (qty)'
The decisions themselves live in parts_status.py (pure, tested on their own).

Memory: ME5A is ~23,000 rows and ME2L ~27,000 lines. Both are read one row at a
time straight from the file on disk, and a row is dropped the moment its PR / PO
is not one we asked for, so only a few hundred rows are ever kept.

Two files on the persistent disk, no table (no schema change):
    parts_links.json   every ME5K row ever seen (Ali: a PR can leave ME5K once
                       its PO exists, so the server must remember it)
    parts_status.json  order -> status + its parts, rebuilt every night

Never raises into the sync: a missing or broken file means "nothing known".
"""

import json
import logging
import os
from collections import Counter, defaultdict
from datetime import datetime

from flask import current_app

from app.models import SapSyncFile
from app.services.parts_status import (
    CHECK,
    CLEAR,
    WAITING,
    _item,
    _number,
    _text,
    is_deleted,
    order_status,
    part_key,
    part_state,
    po_key,
)
from app.services.sap_order_parser import _match_header

logger = logging.getLogger(__name__)

LINKS_FILENAME = "parts_links.json"
STATUS_FILENAME = "parts_status.json"

# A remembered ME5K row not seen for this long is forgotten.
FORGET_AFTER_DAYS = 400

ME5K_COLUMNS = {
    "order": ["Order"],
    "pr": ["Purchase Requisition"],
    "pr_item": ["Item of Requisition"],
    "po": ["Purchase Order"],
    "po_item": ["Purchase Order Item"],
    "text": ["Short Text"],
}
ME5A_COLUMNS = {
    "pr": ["Purchase Requisition"],
    "pr_item": ["Item of Requisition"],
    "po": ["Purchase Order"],
    "deleted": ["Deletion Indicator"],
    "text": ["Short Text"],
}
ME2L_COLUMNS = {
    "po": ["Purchasing Document"],
    "po_item": ["Item"],
    "still": ["Still to be delivered (qty)"],
    "deleted": ["Deletion Indicator"],
}


# ---------------------------------------------------------------- the reader


def current_file(sheet_name=None, filename_contains=None):
    """(path, record) of the newest delivered copy, WITHOUT reading it."""
    query = SapSyncFile.query.filter(
        SapSyncFile.is_current.is_(True), SapSyncFile.stored_path.isnot(None)
    )
    if sheet_name:
        query = query.filter(SapSyncFile.sheet_name == sheet_name)
    if filename_contains:
        query = query.filter(
            SapSyncFile.source_filename.ilike(f"%{filename_contains}%")
        )
    record = query.order_by(SapSyncFile.received_at.desc()).first()
    if record is None:
        return None, None
    return os.path.join(current_app.config["UPLOAD_FOLDER"], record.stored_path), record


def stream_rows(source, columns, keep=None):
    """Yield {key: value} for the wanted columns, one row at a time.

    source   a file path (or a file-like object, for tests)
    columns  {key: [header names SAP may use]}
    keep     optional row -> bool; a row it refuses is dropped at once

    Raises ValueError naming the columns it could not find.
    """
    from openpyxl import load_workbook

    book = load_workbook(source, read_only=True, data_only=True)
    try:
        lines = book.worksheets[0].iter_rows(values_only=True)
        header = list(next(lines, None) or ())
        found = {key: _match_header(header, names) for key, names in columns.items()}
        missing = sorted(key for key, name in found.items() if name is None)
        if missing:
            raise ValueError(f"missing column(s) {missing}")
        slot = {}
        for position, name in enumerate(header):
            if name is not None:
                slot.setdefault(str(name), position)
        where = {key: slot[name] for key, name in found.items()}
        for line in lines:
            row = {
                key: (line[i] if i < len(line) else None) for key, i in where.items()
            }
            if keep is None or keep(row):
                yield row
    finally:
        book.close()


# ------------------------------------------------------- the three SAP files


def read_me5k(source):
    links = []
    for row in stream_rows(source, ME5K_COLUMNS):
        order, pr = _text(row["order"]), _text(row["pr"])
        if not order or not pr:
            continue
        links.append(
            {
                "order": order,
                "pr": pr,
                "pr_item": _item(row["pr_item"]),
                "po": _text(row["po"]),
                "po_item": _item(row["po_item"]),
                "text": _text(row["text"]),
            }
        )
    return links


def read_me5a(source, prs):
    """{part_key: {'po', 'deleted', 'text'}} for the PRs asked for only."""
    wanted = {_text(pr) for pr in prs if _text(pr)}
    found = {}
    for row in stream_rows(
        source, ME5A_COLUMNS, keep=lambda r: _text(r["pr"]) in wanted
    ):
        found[part_key(row["pr"], row["pr_item"])] = {
            "po": _text(row["po"]),
            "deleted": is_deleted(row["deleted"]),
            "text": _text(row["text"]),
        }
    return found


def read_me2l(source, pos):
    """(po_lines, lines_by_po) for the POs asked for only. The totals row on top
    has no document number and is dropped like any other unwanted row."""
    wanted = {_text(po) for po in pos if _text(po)}
    po_lines, lines_by_po = {}, defaultdict(list)
    for row in stream_rows(
        source, ME2L_COLUMNS, keep=lambda r: _text(r["po"]) in wanted
    ):
        line = {
            "still_to_deliver": _number(row["still"]),
            "deleted": is_deleted(row["deleted"]),
        }
        po_lines[po_key(row["po"], row["po_item"])] = line
        lines_by_po[_text(row["po"])].append(line)
    return po_lines, dict(lines_by_po)


def iw49_requests(operations_by_order, known_orders):
    """{order: {(pr, item): text}} from the IW49 operations of orders the app knows."""
    out = defaultdict(dict)
    for order, operations in (operations_by_order or {}).items():
        if order not in known_orders:
            continue
        for op in operations:
            pr = _text(op.get("purchase_requisition"))
            if pr:
                out[order][part_key(pr, op.get("requisition_item"))] = op.get(
                    "material_text"
                )
    return dict(out)


# ---------------------------------------------------------- ME5K memory


def remember(old_links, today_links, now):
    """Merge today's ME5K rows into everything seen before, keyed by PR + item.
    A row seen today replaces the old one but keeps its first_seen date."""
    stamp = now.date().isoformat()
    merged = {}
    for key, link in (old_links or {}).items():
        last = link.get("last_seen") or stamp
        if (now.date() - datetime.fromisoformat(last).date()).days <= FORGET_AFTER_DAYS:
            merged[key] = dict(link)
    for link in today_links:
        key = "|".join(str(p or "") for p in part_key(link["pr"], link["pr_item"]))
        first = merged.get(key, {}).get("first_seen", stamp)
        merged[key] = dict(link, first_seen=first, last_seen=stamp)
    return merged


# ------------------------------------------------------------ the decision


def build(iw49, links, today_keys, me5a, po_lines, lines_by_po, known_orders):
    """Pure. Returns ({order: {'status', 'parts': [...]}}, shadow counts).

    iw49        {order: {part_key: text}}
    links       remembered ME5K rows (incl. today's), {'pr|item': link}
    today_keys  part_keys present in today's ME5K
    me5a        {part_key: {'po', 'deleted', 'text'}}
    """
    cancelled = {key for key, row in me5a.items() if row["deleted"]}
    items_of_pr = defaultdict(list)
    for pr, item in me5a:
        items_of_pr[pr].append((pr, item))

    parts = defaultdict(dict)  # order -> part_key -> part
    for link in links.values():
        order = link.get("order")
        if order not in known_orders:
            continue
        key = part_key(link["pr"], link.get("pr_item"))
        po, po_item = link.get("po"), link.get("po_item")
        if not po and key in me5a:  # ME5K has no PO yet, ME5A already does
            po, po_item = me5a[key]["po"], None
        parts[order][key] = {
            "pr": key[0],
            "pr_item": key[1],
            "po": po,
            "po_item": po_item,
            "in_me5k_today": key in today_keys or key in me5a,
            "text": link.get("text"),
            "source": "ME5K",
        }

    for order, requests in iw49.items():
        for key, text in requests.items():
            keys = items_of_pr.get(key[0], [key]) if key[1] is None else [key]
            for k in keys:
                if k in parts[order]:
                    continue
                row = me5a.get(k) or {}
                parts[order][k] = {
                    "pr": k[0],
                    "pr_item": k[1],
                    "po": row.get("po"),
                    "po_item": None,
                    # Decision d: a request ME5A does not show today is UNKNOWN.
                    "in_me5k_today": k in me5a,
                    "text": text or row.get("text"),
                    "source": "IW49",
                }

    by_order, states = {}, Counter()
    for order, order_parts in parts.items():
        listed = []
        for part in order_parts.values():
            state = part_state(part, cancelled, po_lines, lines_by_po)
            states[state] += 1
            listed.append(
                {k: v for k, v in part.items() if k != "in_me5k_today"}
                | {"state": state}
            )
        by_order[order] = {
            "status": order_status([p["state"] for p in listed]),
            "parts": sorted(listed, key=lambda p: (p["pr"] or "", p["pr_item"] or "")),
        }

    me5k_prs = {
        part_key(l["pr"], l.get("pr_item"))[0]
        for l in links.values()
        if l.get("order") in known_orders
    }
    iw49_prs = {key[0] for requests in iw49.values() for key in requests}
    lines_per_po = Counter(len(v) for v in lines_by_po.values())
    shadow = {
        "orders": len(by_order),
        "waiting": sum(1 for o in by_order.values() if o["status"] == WAITING),
        "check": sum(1 for o in by_order.values() if o["status"] == CHECK),
        "clear": sum(1 for o in by_order.values() if o["status"] == CLEAR),
        "parts_by_state": dict(states),
        # The two guesses the plan must prove before ME5K memory can be dropped.
        "me5k_prs_of_known_orders": len(me5k_prs),
        "me5k_prs_also_on_iw49": len(me5k_prs & iw49_prs),
        "me5k_prs_not_on_iw49": sorted(me5k_prs - iw49_prs)[:20],
        "remembered_not_in_me5k_today": sum(
            1
            for l in links.values()
            if part_key(l["pr"], l.get("pr_item")) not in today_keys
        ),
        # Decision c's check: is a PO usually for one line?
        "pos_by_line_count": {str(k): v for k, v in sorted(lines_per_po.items())},
    }
    return by_order, shadow


# ---------------------------------------------------------- files on disk


def _path(name):
    folder = os.path.join(current_app.config["UPLOAD_FOLDER"], "sap_sync")
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, name)


def _write(name, payload):
    path = _path(name)
    tmp = f"{path}.tmp"
    with open(tmp, "w") as handle:
        json.dump(payload, handle)
    os.replace(tmp, path)


def _read(name):
    try:
        with open(_path(name)) as handle:
            return json.load(handle)
    except FileNotFoundError:
        return None
    except Exception:
        logger.warning("Parts file %s unreadable, ignored", name, exc_info=True)
        return None


def load_status():
    """{'available': bool, 'written_at', 'files', 'by_order'} — for later steps."""
    data = _read(STATUS_FILENAME)
    if not isinstance(data, dict) or not isinstance(data.get("by_order"), dict):
        return {"available": False, "written_at": None, "files": {}, "by_order": {}}
    return {"available": True, **data}


# ---------------------------------------------------------------- the run


def run(operations_by_order, known_orders, dry_run=False, now=None):
    """Build and save tonight's parts status. Returns the report. Never raises."""
    now = now or datetime.utcnow()
    try:
        files, sources = {}, {}
        for name, lookup in (
            ("ME5K", {"filename_contains": "ME5K"}),
            ("ME5A", {"sheet_name": "ME5A"}),
            ("ME2L", {"sheet_name": "ME2L"}),
        ):
            path, record = current_file(**lookup)
            ok = bool(path) and os.path.exists(path)
            files[name] = (
                record.received_at.isoformat() if ok and record.received_at else None
            )
            sources[name] = path if ok else None

        today_links = read_me5k(sources["ME5K"]) if sources["ME5K"] else []
        old = (_read(LINKS_FILENAME) or {}).get("links", {})
        links = remember(old, today_links, now)
        today_keys = {part_key(l["pr"], l["pr_item"]) for l in today_links}

        iw49 = iw49_requests(operations_by_order, known_orders)
        prs = {key[0] for r in iw49.values() for key in r} | {
            l["pr"] for l in links.values() if l.get("order") in known_orders
        }
        me5a = read_me5a(sources["ME5A"], prs) if sources["ME5A"] else {}

        pos = {row["po"] for row in me5a.values() if row["po"]} | {
            l["po"] for l in links.values() if l.get("po")
        }
        po_lines, lines_by_po = (
            read_me2l(sources["ME2L"], pos) if sources["ME2L"] else ({}, {})
        )

        by_order, shadow = build(
            iw49, links, today_keys, me5a, po_lines, lines_by_po, known_orders
        )

        if not dry_run:
            _write(LINKS_FILENAME, {"written_at": now.isoformat(), "links": links})
            _write(
                STATUS_FILENAME,
                {"written_at": now.isoformat(), "files": files, "by_order": by_order},
            )
        return {
            "status": "ok",
            "shadow_only": True,
            "files": files,
            "me5k_rows_today": len(today_links),
            "remembered_links": len(links),
            **shadow,
        }
    except Exception as e:
        logger.warning("Parts status not built: %s", e, exc_info=True)
        return {"status": "failed", "error": str(e)}
