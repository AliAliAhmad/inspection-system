"""
How long a job takes, and how many people it needs.

Every number here came from Ali on 2026-08-24, after the alternatives were
measured against 8,904 finished MES orders. It is deliberately ONE small module
with no logic worth arguing about, because the numbers are the part that will
change and they should be changeable in one line.

WHERE THE MEASUREMENT CAME FROM  (full workings in docs/job-durations.md)

The app used to take SAP's planned `Work` from IW49. That figure is inflated and
in one case invented: a trailer PM planned at 18.0h really holds the machine 2.0h,
so the planner was reserving most of a day for a two-hour job.

Three candidates were measured before Ali chose:

  * SAP planned Work (IW49)      — what the app used. RS PRM = 14.0h.
  * Confirmed Actual work (IW49) — MAN-hours, `Work = crew x duration` on 20,640
                                   of 30,840 MES operations. RS PRM = 24.0h. And
                                   worthless for faults: the confirmation is a
                                   copy of the plan, 1,122 of 1,122 breakdowns
                                   agreeing to the decimal.
  * ELAPSED, from IW39           — Ali's choice. Actual finish (date+time) minus
                                   actual start (date+time). RS PRM = 7.6h.

Ali then set the PM figures himself against a stated crew, and they run slightly
above the measured medians — which is right, because a median plans the middle
job and half of them are longer.

THE ONE RULE THAT IS NOT JUST A NUMBER

A fault costs less when it rides along with a PM than when it stands alone. The
team is already on the machine, it is already stopped and already open; a
standalone fault pays for its own trip. Ali's rule, and the reason `with_pm` is
a parameter rather than a single figure per activity type.

WHAT WAS TESTED AND REJECTED, so nobody re-proposes it:

  * Per-component estimates (HYDR, BRAK, SPDR, OCAB...). Real in the history —
    operator cabin 1.0h against lifting 9.5h — and worth only +5% on held-out
    data, over 20 random splits, even when restricted to orders that name a
    component. Worse, only 5 of the 128 open COM orders name one at all, and the
    naming rate has swung from 78% to 17% and back inside two years.
  * Description keywords: +4% held out. The word table looks like knowledge and
    does not survive being shown a job it has not seen.
  * Machine family for faults: +1%. It matters enormously for PM (2.0h on a
    trailer against 7.6h on a reach stacker) and not at all for a fault.
  * Operation count / planned crew: the strongest signal found anywhere, a 128x
    spread — and unusable, because operations are created during execution. Zero
    of the 208 open orders have any. Ali's point, confirmed in the data.

  A PM's length is a property of the job. A fault's length is a property of the
  situation, and 13% of faults run for days because they are waiting for a part.
  No estimate fixes those; the carry-to-tomorrow rule does.
"""

import re
import unicodedata

# Ali's minimum. No job is ever planned for one person.
MIN_CREW = 2

# Regular PM, per machine family: (crew, hours). Ali, 2026-08-24.
PM_BY_FAMILY = {
    'truck': (2, 4.5),
    'reach_stacker': (2, 12.0),
    'ech': (2, 8.0),
    'forklift': (2, 4.0),
    'trailer': (2, 3.0),
}


# A BIGGER SERVICE PACKAGE COSTS MORE. Ali, 2026-09-12.
#
# PM_BY_FAMILY above is the ORDINARY service — the 250-hour one, which is what
# almost every PM order in the yard is. This table is only for packages that
# differ, keyed by family then by package hours.
#
#   "18 hours with 2 men"  — Ali, on the reach stacker's 2000HR
#
# He had already said the 2000HR "contain the 250 hrs task and addtional tasks",
# and 18h against 12h is those additional tasks, measured.
#
# A family or a package missing here falls back to PM_BY_FAMILY. That fallback is
# deliberate and it UNDER-prices: a 2000HR on a machine whose figure nobody has
# given is booked as an ordinary service. It is the honest direction — a number
# invented by multiplying 12 by something would look just as confident and be
# wrong in a way nobody could see.
PM_BY_PACKAGE = {
    'reach_stacker': {2000: (2, 18.0)},
}

# Where a bigger crew genuinely releases the machine sooner — one row per
# MEASURED crew size, never a formula. The points are not linear: on a reach
# stacker the third man buys 4 hours of machine time and the fourth buys
# nothing (Ali: "if 3 will be 8 hrs") — he is insurance for an urgent machine,
# not speed. The ECH 4-man figure is the 3-man one until Ali measures it.
PM_CREW_CURVE = {
    'reach_stacker': {2: 12.0, 3: 8.0, 4: 8.0},
    'ech': {2: 8.0, 3: 7.0, 4: 7.0},
}

# Ali, 2026-08-24: "if TT or FL, TR is urgent always keep 2, RS AND ECHs put
# maximum up to 4." More men never help a small machine; they only rescue a
# big one — urgency buys POSITION for small machines, men only for these two.
URGENT_MAX_CREW = {'reach_stacker': 4, 'ech': 4}

# A man's plan-day. Night shift exists but is for breakdowns only and never
# counts toward the plan's budget (Ali, 2026-08-24).
MAN_HOURS_PER_DAY = 8

# A family nobody has given a number for. Deliberately the smallest PM figure
# rather than a guess in the middle: an unknown machine that turns out to be big
# shows up as a day running over, which the carry-over already handles. An
# over-estimate silently refuses real work and nobody ever sees why.
PM_DEFAULT = (2, 3.0)

# Faults. Ali, 2026-08-24 — the with-PM column is what the measurement showed and
# he accepted; the alone column he set.
#
# INS WAS 3.0 AND THE MEASUREMENT SAYS 1.5. Corrected 2026-09-12 on Ali's word.
#
# Three of the four with-PM figures match docs/job-durations.md EXACTLY — COM 2.0,
# DAM 1.0, ACD 2.5, each the median of thousands of finished orders. INS was the
# only mismatch, and it was exactly double its measured 1.5h. The document's own
# summary line names only three letters as settled ("COM 2.0h · DAM 1.0h ·
# ACD 2.5h"); INS is absent from it and was never confirmed.
#
# One number explained two complaints. At 3.0 an INS cost LESS on its own trip
# (2.0) than riding with a PM, which is backwards from the rule below. At 1.5 it
# costs more alone, exactly like COM and DAM.
#
# ⚠️ ACD IS STILL THE WRONG WAY ROUND: 2.5 riding, 2.0 alone. Its 2.5 IS the
# measurement, so it is the ALONE figure that wants checking. Nobody has said.
FAULT_HOURS = {
    #            with a PM   alone
    'COM':      (2.0,        3.0),
    'DAM':      (1.0,        3.0),
    'INS':      (1.5,        2.0),
    'ACD':      (2.5,        2.0),
}
FAULT_DEFAULT = (2.0, 3.0)


# AC service is a different job from the full PM, and a big share of the work:
# 33 of the 78 open PRM orders are AC. Measured across 204 finished AC PMs the
# answer is the same wherever it lands — TT 2.0h, RS 2.0h, ECH 2.0h, ~92% inside
# a shift — because the AC team does the AC and nothing else. Pricing one at the
# family's full-service figure would have booked 12 hours for a 2-hour visit on
# four of every ten open PMs.
AC_PM_HOURS = 2.0
AC_PM_CREW = 2


def is_ac_service(description):
    """AC work is recognised by its description; SAP carries no flag for it.

    Same test the generator uses to route a PM to the AC team, kept here so the
    price and the routing can never disagree about what an AC job is.
    """
    text = (description or '').upper()
    return (' AC ' in f' {text} ' or 'AC SYSTEM' in text
            or text.startswith('AC ') or text.endswith(' AC'))


def urgent_max_crew(family):
    """The biggest crew an URGENT PM on this family may be given."""
    return URGENT_MAX_CREW.get(family, MIN_CREW)


def pm_hours(family, crew=None, description=None):
    """(crew, hours) for a PM on this machine family.

    A package with its own price (PM_BY_PACKAGE — the reach stacker's 2000HR)
    beats the family figure. The crew CURVE is not applied to it: the curve
    points were measured on ordinary services, and stretching them over a
    service half again as long would be a guess wearing a chart, which is the
    one thing this module refuses to do.

    Pass `crew` to ask for a specific crew size; without it, the standard pair.
    A crew size between measured points takes the LARGEST measured point at or
    below it, never an interpolation — the points are Ali's measurements, and a
    line drawn through them is a guess wearing a chart. A family with no curve
    keeps its pair figure whatever the crew.
    """
    if is_ac_service(description):
        return (AC_PM_CREW, AC_PM_HOURS)
    # A 2000HR is not an ordinary service. Read from the description rather than
    # taken as an argument, so a caller cannot forget to pass it and quietly get
    # the 250-hour price for a job that takes six hours longer.
    package = PM_BY_PACKAGE.get(family, {}).get(pm_interval_hours(description))
    standard = package or PM_BY_FAMILY.get(family, PM_DEFAULT)
    if crew is None:
        return standard
    curve = None if package else PM_CREW_CURVE.get(family)
    if curve:
        eligible = [size for size in sorted(curve) if size <= crew]
        if eligible:
            best = eligible[-1]
            if best > MIN_CREW:
                return (best, curve[best])
    return standard


# ---------------------------------------------------------------------------
# Which service package an order is
# ---------------------------------------------------------------------------
#
# Moved here from sap_order_parser 2026-09-12. It reads as parsing, but it is a
# PRICING question: a 2000HR takes 18h where a 250HR takes 12h, so the package is
# what selects the number. Keeping it in the parser meant either importing pandas
# into this module or writing a second regex that would drift — and the `25/5H`
# special case is exactly the kind of detail one copy would forget.

# Ali's fleet is serviced at these five points and no others. A stray `750HR`
# is a typo, and a kit keyed to it would match nothing anyway — the
# `maintenance_cycles` table has no 750 row.
PM_PACKAGE_HOURS = (250, 500, 1000, 2000, 4000)

# `25/5H` is the 250-hour service. Ali confirmed 2026-08-26; the data had
# already proved it, with 448 `25/5H` orders and 30 `250H` orders sharing six
# core materials at six identical quantities and nothing in one absent from the
# other. Matched BEFORE the number search, which cannot see it: `25` and `5`
# are too short for the three-digit minimum that keeps machine numbers out.
_25_5H = re.compile(r'25\s*/\s*5\s*H', re.I)

# Three digits minimum, so `RS115` and `TT028` are never read as the service.
# `H(?:OUR|R)?S?` covers H / HR / HRS / HOUR / HOURS — RS119 alone is written
# `250Hrs`, and an `HR?\b` that demands a boundary straight after `HR` refuses
# every one of them. `\s*` covers `500 HR` and `PM-250 Hrs`.
_PACKAGE = re.compile(r'(\d{3,5})\s*H(?:OUR|R)?S?\b', re.I)


def pm_interval_hours(description):
    """Which service package this order is, in hours, or None.

    None means SAP did not say — a forklift's `FL327-HOURLY SERVICE`, a
    calendar `3-Week INSPECTION_RS`, an AC inspection. Returning a guess there
    would put a 250-hour kit on a machine SAP has never described that way.
    """
    text = unicodedata.normalize('NFC', str(description or '')).strip()
    if not text:
        return None
    if _25_5H.search(text):
        return 250
    match = _PACKAGE.search(text)
    if not match:
        return None
    hours = int(match.group(1))
    return hours if hours in PM_PACKAGE_HOURS else None


# ---------------------------------------------------------------------------
# Nested service packages
# ---------------------------------------------------------------------------

# The trade a PM description names, if any: RS109-250HR-MECH.
_TRADE_IN_TEXT = re.compile(r'\b(MECH|ELEC|ELME)\b', re.I)


def trade_in_description(description):
    """'RS109-250HR-MECH' -> 'MECH'. None when the text does not say."""
    match = _TRADE_IN_TEXT.search(str(description or ''))
    return match.group(1).upper() if match else None


def contained_packages(entries):
    """Which service packages are ALREADY DONE by doing a bigger one.

    Ali, 2026-09-12: "2000 hrs service is a service that contain the 250 hrs
    task and addtional tasks".

    So RS109 carrying an open 250HR and an open 2000HR is ONE visit, not two.
    The app priced 12h + 12h = 24h, booking a day and a half of a crew's week for
    work that happens once.

    `entries` is [(key, interval_hours, trade), ...] for ONE machine. Returns
    {contained_key: containing_key} — only the ones that ride along. A key absent
    from the result is charged normally.

    WHY "DIVIDES EVENLY" AND NOT "IS SMALLER"
    =========================================

    The ladder is 250 / 500 / 1000 / 2000 / 4000 and every step is a multiple of
    the one below. That is not decoration — it is WHY they fall due together: at
    2,000 running hours the 250-hour service is due for the eighth time. A package
    that did not divide evenly would come due on its own schedule and would not be
    swallowed, so the test is divisibility, not size.

    TRADES DO NOT NEST
    ==================

    A 2000HR-MECH does not contain a 250HR-ELEC's tasks — different men, different
    work. Zeroing the electrical package against a mechanical visit would silently
    under-book real work, which is the dangerous direction. Nesting needs the
    trades to AGREE, or both to be silent.

    An interval of None (a calendar PM, an AC inspection, a forklift's
    `HOURLY SERVICE`) never nests and never swallows. SAP did not say which package
    it is, and a guess here takes real hours out of a real day.
    """
    known = [(key, interval, trade) for key, interval, trade in entries if interval]
    contained = {}
    for key, interval, trade in known:
        best_key, best_interval = None, None
        for other_key, other_interval, other_trade in known:
            if other_key == key or other_interval <= interval:
                continue
            if other_interval % interval:
                continue
            if trade and other_trade and trade != other_trade:
                continue
            if best_interval is None or other_interval > best_interval:
                best_key, best_interval = other_key, other_interval
        if best_key is not None:
            contained[key] = best_key
    return contained


def fault_hours(activity_type, with_pm):
    """Hours for a COM / DAM / INS / ACD.

    `with_pm` is the whole rule: True when this fault is riding along with a PM
    on the same machine, False when the defect team makes its own trip for it.
    """
    pair = FAULT_HOURS.get((activity_type or '').strip().upper(), FAULT_DEFAULT)
    return pair[0] if with_pm else pair[1]


def crew_for(activity_type, family=None, is_pm=False, crew=None):
    """How many people. Never fewer than MIN_CREW."""
    if is_pm:
        return max(MIN_CREW, pm_hours(family, crew)[0])
    return MIN_CREW


# SAP plant-code prefix -> the app's equipment category. The pool sync knows the
# plant code (RS110) and not the equipment_type, so it needs this; the generator
# has _get_category for the other direction. Both land on the same family names.
PLANT_PREFIX_TO_FAMILY = {
    'TT': 'truck',
    # RET01 is a terminal tractor that SAP codes RET, not TT (Ali, 2026-09-03).
    # Without this line family_from_plant_code returns None for it and its PMs
    # fall back to a default price instead of the truck figures.
    'RET': 'truck',
    'RS': 'reach_stacker',
    'ECH': 'ech',
    'FL': 'forklift',
    'BFL': 'forklift',
    'MFL': 'forklift',
    'TR': 'trailer',
}


def family_from_plant_code(plant_code):
    """RS110 -> reach_stacker. Longest prefix wins, so ECH08 is not read as E."""
    code = (plant_code or '').strip().upper()
    for prefix in sorted(PLANT_PREFIX_TO_FAMILY, key=len, reverse=True):
        if code.startswith(prefix):
            return PLANT_PREFIX_TO_FAMILY[prefix]
    return None


def hours_for(job_type, activity_type=None, family=None, with_pm=False,
              crew=None, description=None):
    """The single entry point. Hours for any job the planner handles.

    `with_pm` only means anything for a fault, and it is the rule Ali stated:
    a fault done while the PM team is already on the machine costs less than one
    that needs its own trip.
    """
    if job_type == 'pm':
        return pm_hours(family, crew, description)[1]
    return fault_hours(activity_type, with_pm)
