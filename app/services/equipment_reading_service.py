"""
Equipment Reading service — validation and admin edit helpers for the
running-hours / twistlock-count tracking pipeline.

The main job here is `validate_reading_against_history()`, which catches
typo'd readings (e.g. an inspector typing 9000 when the meter shows 900)
BEFORE they get saved into the database.

The validation is two-sided:
    - Lower bound: a new reading cannot be LESS than the last reading
                   (running hours and twistlock counts only ever increase).
    - Upper bound: a new reading cannot be HIGHER than what's physically
                   possible since the last reading. The constraint comes
                   from the equipment's maximum daily duty cycle:
                       max_increase = days_elapsed * MAX_PER_DAY
                   plus a small tolerance buffer to handle edge cases.
"""

from datetime import date
from typing import Optional, Tuple

from app.models.equipment_reading import EquipmentReading


# ── Tunable thresholds ──────────────────────────────────────────────────
# These represent the realistic physical maximum, NOT the theoretical max.
# Running equipment in a port can theoretically run 24h/day, but in practice
# they don't (breakdowns, maintenance, breaks, shifts). The user picked 20
# as a comfortable upper bound that catches typos but doesn't reject normal
# heavy-use readings.
MAX_RUNNING_HOURS_PER_DAY = 20

# Twistlock count is per-truck and is generous because it depends on the
# number of containers handled per shift. 200/day is a high but reachable
# number for a busy port truck.
MAX_TWL_PER_DAY = 200

# Buffers handle edge cases where the actual usage briefly spiked above
# the per-day average (e.g. 22h shift instead of 20h).
TOLERANCE_BUFFER_RNR = 20    # +20 hours of slack
TOLERANCE_BUFFER_TWL = 50    # +50 twistlock count of slack


def validate_reading_against_history(
    equipment_id: int,
    reading_type: str,
    new_value: float,
) -> Tuple[bool, Optional[str], Optional[float]]:
    """
    Decide whether a candidate reading is plausible given the equipment's
    history. Used both at write time (inspection upload, manual entry) and
    at edit time (admin correction).

    Args:
        equipment_id: The equipment whose reading is being checked.
        reading_type: 'rnr' (running hours) or 'twl' (twistlock count).
        new_value: The numeric reading the user wants to save.

    Returns:
        A tuple of (is_valid, reason, max_realistic):
            - is_valid (bool): True if the reading is plausible.
            - reason (str | None): Human-readable rejection reason if invalid.
            - max_realistic (float | None): The computed upper bound, useful
                                            for showing in error messages and
                                            for the admin edit modal.
    """
    # First reading ever for this equipment+type → no history to check.
    last = EquipmentReading.get_latest_reading(equipment_id, reading_type)
    if not last or last.is_faulty or last.reading_value is None:
        return True, None, None

    last_value = float(last.reading_value)

    # ── Lower bound: new reading cannot decrease ──
    if new_value < last_value:
        return (
            False,
            (
                f"Reading {new_value:g} is less than the last reading "
                f"{last_value:g}. Running hours and twistlock counts can "
                f"only increase over time."
            ),
            None,
        )

    # ── Upper bound: physical max based on time elapsed ──
    # max(1, ...) ensures even same-day readings get at least 1 day of
    # allowance, otherwise two readings on the same day would always reject.
    days_elapsed = max(1, (date.today() - last.reading_date).days)

    if reading_type == 'rnr':
        per_day = MAX_RUNNING_HOURS_PER_DAY
        buffer = TOLERANCE_BUFFER_RNR
        unit_label = 'h/day'
    elif reading_type == 'twl':
        per_day = MAX_TWL_PER_DAY
        buffer = TOLERANCE_BUFFER_TWL
        unit_label = '/day'
    else:
        # Unknown reading type → only the lower-bound check applies.
        return True, None, None

    max_realistic = last_value + (days_elapsed * per_day) + buffer

    if new_value > max_realistic:
        return (
            False,
            (
                f"Reading {new_value:g} exceeds the realistic maximum of "
                f"{max_realistic:g} (last reading was {last_value:g} "
                f"{days_elapsed} day{'s' if days_elapsed != 1 else ''} ago, "
                f"max {per_day}{unit_label}). Please double-check the meter — "
                f"this looks like a typo."
            ),
            max_realistic,
        )

    return True, None, max_realistic
