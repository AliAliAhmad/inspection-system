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
FAULT_HOURS = {
    #            with a PM   alone
    'COM':      (2.0,        3.0),
    'DAM':      (1.0,        3.0),
    'INS':      (3.0,        2.0),
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
    """(crew, hours) for a regular PM on this machine family.

    Pass `crew` to ask for a specific crew size; without it, the standard pair.
    A crew size between measured points takes the LARGEST measured point at or
    below it, never an interpolation — the points are Ali's measurements, and a
    line drawn through them is a guess wearing a chart. A family with no curve
    keeps its pair figure whatever the crew.
    """
    if is_ac_service(description):
        return (AC_PM_CREW, AC_PM_HOURS)
    standard = PM_BY_FAMILY.get(family, PM_DEFAULT)
    if crew is None:
        return standard
    curve = PM_CREW_CURVE.get(family)
    if curve:
        eligible = [size for size in sorted(curve) if size <= crew]
        if eligible:
            best = eligible[-1]
            if best > MIN_CREW:
                return (best, curve[best])
    return standard


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
