"""Charging an order's hours to the trade that actually does the work.

Ali, 2026-09-11, on an order holding both mechanical and electrical operations:
"split by operation work centre — the mechanical team sees its lines and the
electrical team sees its own."

WHAT THIS IS FOR, AND WHY IT SHIPS SWITCHED OFF
===============================================

Ali asked for a VISIBILITY split, and that is Phase 1: each man sees his own
operations. Splitting the day's BUDGET by trade is the consequence I inferred,
and I told him it was the expensive half.

Today `day_budget.team_pools()` merges `defect_mech` and `defect_elec` rules
into ONE `spec` wallet. Both crews already exist as separate team rules — the
wallet is what collapses them. Splitting that wallet changes how every day in
every week is priced, and it feeds the generator, the day ripple, the Telegram
proposals and the capacity warnings on the board.

That is not a change to switch on for a real yard while nobody is watching. So:

  * the numbers are computed and EXPOSED now — the board can show
    "MECH 5.0h / ELEC 4.0h" on any order, which is the useful half and is safe
  * the wallet split itself is behind TRADE_SPLIT_BUDGET, default OFF
  * with it off, every wallet behaves exactly as it does today

Turning it on is one environment variable, and Ali can watch one week with it
before trusting it.
"""

import os


TRADES = ('MECH', 'ELEC')


def trade_split_enabled():
    """Is the per-trade WALLET split switched on?

    Off by default. See the module docstring — this changes how every day in
    every week is priced, so it is a decision to take with eyes open, not a
    side effect of a deploy.
    """
    return str(os.getenv('TRADE_SPLIT_BUDGET', '')).strip().lower() in (
        '1', 'true', 'yes', 'on')


def _operations_of(job):
    """The SAP operations on this job, or [] when it has none."""
    from app.models.work_plan_job_task import WorkPlanJobTask, anchor_for
    kind, key = anchor_for(job)
    return (WorkPlanJobTask.query
            .filter_by(anchor_kind=kind, anchor_key=key, source='sap')
            .order_by(WorkPlanJobTask.position, WorkPlanJobTask.id)
            .all())


def hours_by_trade(job, operations=None):
    """{'MECH': h, 'ELEC': h, 'UNSET': h} for one job.

    An order with no operations, or operations carrying no work centre, falls
    back to the JOB's own work_center — and to 'UNSET' when even that is absent.
    Nothing is invented: an order nobody has told us the trade of is reported as
    unknown rather than guessed into one of the two crews' budgets.
    """
    result = {'MECH': 0.0, 'ELEC': 0.0, 'UNSET': 0.0}

    ops = _operations_of(job) if operations is None else operations
    priced = [op for op in ops if op.planned_hours is not None]

    if priced:
        for op in priced:
            trade = (op.work_center or '').upper()
            bucket = trade if trade in TRADES else _job_trade(job)
            result[bucket] += float(op.planned_hours or 0)
        return result

    # No operations, or none of them priced: the whole order sits with its own
    # trade. This is every order in the system until an IW49 with a recognised
    # layout has been imported, so it is the NORMAL path, not the edge case.
    result[_job_trade(job)] += float(job.estimated_hours or 0)
    return result


def _job_trade(job):
    """The order's own trade, as a bucket name.

    ELME means both, and there is no way to divide it without operations — so it
    is reported as UNSET rather than being pushed arbitrarily onto one crew.
    """
    work_center = (getattr(job, 'work_center', None) or '').upper()
    if work_center in TRADES:
        return work_center
    return 'UNSET'


def wallet_key_for_trade(trade):
    """'MECH' -> 'spec_mech'. Only meaningful while the split is on."""
    return f'spec_{trade.lower()}' if trade in TRADES else 'spec'


def describe(job):
    """A small payload the board can render without doing the sums itself."""
    split = hours_by_trade(job)
    total = sum(split.values())
    return {
        'mech_hours': round(split['MECH'], 2),
        'elec_hours': round(split['ELEC'], 2),
        'unset_hours': round(split['UNSET'], 2),
        'total_hours': round(total, 2),
        # True when this order genuinely needs both crews — the case that made
        # Ali ask for the split in the first place.
        'is_mixed': split['MECH'] > 0 and split['ELEC'] > 0,
        'budget_split_active': trade_split_enabled(),
    }
