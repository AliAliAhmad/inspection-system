"""Is a work order waiting for parts? The decision rules, with no file reading.

The chain (Ali, 2026-11-27):
    ME5K  work order -- purchase request (PR + item) -- PO + PO item, once ordered
    ME5A  PR + item  -- Deletion Indicator: the request was cancelled
    ME2L  PO + item  -- 'Still to be delivered (qty)' = 0 means RECEIVED;
                        its own Deletion Indicator: the PO line was cancelled

What gets held (Ali): a machine NOT available in the planners' daily mail AND
waiting for parts -> hold the WHOLE machine. A machine that is available but has
an order waiting for parts -> hold ONLY that order.

These are pure functions on plain rows so the rules can be tested and agreed
before the files are wired in. Reading ME2L (~27,000 lines) and ME5A (~23,000)
waits for the bites reader (tasks/bites-reader-plan.md). NOT CONNECTED to the
generator yet.

A request that leaves ME5K before any PO was ever seen is UNKNOWN, never
"waiting": the app must not block a job for ever on a guess. The planner sees
a question mark and decides.
"""

# Per part
REQUESTED = "requested"  # PR exists, no PO yet
ORDERED = "ordered"  # PO exists, still something to deliver
RECEIVED = "received"  # PO line fully delivered
CANCELLED = "cancelled"  # PR deleted, or PO line deleted
UNKNOWN = "unknown"  # cannot tell: PO not found in ME2L, or PR vanished unseen

# Per work order
WAITING = "waiting"  # at least one part requested or ordered
CHECK = "check"  # nothing waiting, but something unknown
CLEAR = "clear"  # every part received or cancelled

# What the planner holds back
HOLD_MACHINE = "machine"
HOLD_ORDER = "order"


def _text(value):
    """'1000409875 ', 1000409875.0, '\\xa0' -> '1000409875'; empty -> None."""
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = " ".join(str(value).split())
    return text or None


def _item(value):
    """'00010', '10', 10.0 -> '10'. '0' and empty mean 'no item' (ME5K writes
    PO item 0 when no PO exists yet)."""
    text = _text(value)
    if text is None:
        return None
    stripped = text.lstrip("0")
    return stripped or None


def is_deleted(value):
    """ME5A/ME2L deletion flag: 'true', 'X', 'L' -> True. 'false', '' -> False."""
    text = (_text(value) or "").lower()
    return text in ("true", "x", "l", "yes", "1")


def _number(value):
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def part_key(pr, pr_item):
    return (_text(pr), _item(pr_item))


def po_key(po, po_item):
    return (_text(po), _item(po_item))


def _line_state(line):
    if line.get("deleted"):
        return CANCELLED
    still = _number(line.get("still_to_deliver"))
    if still is None:
        return UNKNOWN
    return RECEIVED if still <= 0 else ORDERED


def whole_po_state(lines):
    """Decision c (Ali, 2026-11-28): when the PO ITEM is not known (ME5A carries
    the PO number but not its item), judge the PO as a whole. Any live line still
    open -> ORDERED; every live line delivered -> RECEIVED; every line deleted ->
    CANCELLED. A PO that holds other jobs' parts can only HOLD a job a little
    longer, never plan it blind."""
    if not lines:
        return UNKNOWN
    states = {_line_state(line) for line in lines} - {CANCELLED}
    if not states:
        return CANCELLED
    if ORDERED in states:
        return ORDERED
    if UNKNOWN in states:
        return UNKNOWN
    return RECEIVED


def part_state(link, cancelled_prs, po_lines, lines_by_po=None):
    """The state of ONE requested part.

    link          {'pr', 'pr_item', 'po', 'po_item', 'in_me5k_today'} — the newest
                  thing known about this request. `in_me5k_today` means "the
                  request was seen open TODAY" (in ME5K or ME5A); False + no PO
                  ever seen = UNKNOWN (decision d: never a silent block).
    cancelled_prs set of part_key()s with ME5A's Deletion Indicator set
    po_lines      {po_key(): {'still_to_deliver': qty, 'deleted': bool}} from ME2L
    lines_by_po   {po: [line, ...]} from ME2L, for a PO whose item is unknown
    """
    if part_key(link.get("pr"), link.get("pr_item")) in cancelled_prs:
        return CANCELLED
    po = _text(link.get("po"))
    if not po:
        return REQUESTED if link.get("in_me5k_today", True) else UNKNOWN
    if _item(link.get("po_item")) is None:
        return whole_po_state((lines_by_po or {}).get(po))
    line = po_lines.get(po_key(po, link.get("po_item")))
    if line is None:
        return UNKNOWN
    return _line_state(line)


def order_status(part_states):
    """One work order from the states of its parts."""
    states = set(part_states)
    if states & {REQUESTED, ORDERED}:
        return WAITING
    if UNKNOWN in states:
        return CHECK
    return CLEAR


def hold(status, machine_available):
    """What the planner holds back for one work order.

    machine_available: True / False from the planners' daily mail, or None when
    there is no fresh mail — then only the order is held, never the whole
    machine on an old guess.
    """
    if status != WAITING:
        return None
    if machine_available is False:
        return HOLD_MACHINE
    return HOLD_ORDER


def mail_disagrees(stop_type, status):
    """The mail says 'waiting for parts' but SAP shows nothing waiting.
    Planned anyway, with a warning on the board — the planner decides."""
    return stop_type == "WAITING_PARTS" and status == CLEAR
