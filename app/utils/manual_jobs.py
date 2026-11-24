"""Is this job, or this pool order, one a planner typed in by hand?

ONE answer, used by the delete rules on the server AND sent to the web as
`is_manual` on every job and pool order — the board used to re-derive it in
two places of its own (knot report 2026-11-24). Plain functions, no imports, so
models can call them inside `to_dict` without an import cycle.
"""

# A hand-typed job that has been returned to the pool comes back wearing one of
# these. It is NOT a SAP order — _delete_job_record mints it so the job can sit
# in the pool like anything else. `MAN-{plan_id}-{job_id}`, and split_job may
# append `-P2`, so this is a PREFIX test.
MANUAL_ORDER_PREFIX = 'MAN-'


def is_manual_order_number(order_number):
    return bool(order_number) and str(order_number).startswith(MANUAL_ORDER_PREFIX)


def is_manual_order(order_number, order_type):
    """A pool order the app minted for a hand-typed job, not one SAP sent."""
    return is_manual_order_number(order_number) or order_type == 'MANUAL'


def is_manually_added(job):
    """True when a planner typed this job in by hand.

    A manual job has no origin outside the plan: no defect, no inspection, and
    no SAP order — or an order number the app minted for it ITSELF.

    That last clause is the whole of Ali's 2026-09-09 report: "SOME have the
    option some do not have, and the do not have app gives them a sap order i do
    not know why". Removing a hand-typed job parks it in the pool as
    `MAN-<plan>-<job>` so the work is not lost. When it is scheduled again — by
    hand, or by _auto_group_equipment_jobs sweeping up everything pending for
    that machine — the new row carries that number, and a plain "has a
    sap_order_number" test then calls it a SAP job. It stopped being deletable
    and it displayed an order Ali never created.
    """
    if job.defect_id or job.inspection_assignment_id:
        return False
    if not job.sap_order_number:
        return True
    return is_manual_order(job.sap_order_number, job.sap_order_type)
