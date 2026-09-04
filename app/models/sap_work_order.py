"""
SAP Work Order model for staging imported orders.
Orders are stored here until scheduled to a specific day.
"""

from app.extensions import db
from datetime import datetime


def sap_says_started(system_status):
    """True when SAP's System status means the work is under way.

    Ali's rule, 2026-09-04, in his words: "rel in the status (sure without CNF)
    means in progress ... cnf/teco/clsd means finish ... PCNF means partially
    finish but we do not use it".

    Tokenised on whitespace, never substring — 'REL' must not match inside
    'RELEASED_X', the same trap is_plannable_status() documents.

    Deliberately NOT folded into order_sap_state(): its vocabulary is
    open/done/cancelled/unknown, which has no room for "started", and
    overloading it would change what the removal rules mean by 'open'.
    """
    if not system_status or isinstance(system_status, float):
        return False
    tokens = set(str(system_status).upper().split())
    if 'CNF' in tokens:
        return False
    return 'REL' in tokens


class SAPWorkOrder(db.Model):
    """
    Staging table for imported SAP work orders.
    Orders here are "in the pool" and can be dragged to days to schedule.
    """
    __tablename__ = 'sap_work_orders'

    id = db.Column(db.Integer, primary_key=True)

    # Work plan this order belongs to
    # NULL means "in the global pool" — outstanding work belonging to no
    # particular week. A value means the order is currently scheduled INTO that
    # week's plan.
    #
    # Ali's model: "The job pool is the big box that has all jobs from SAP and
    # inspection results. When it is planned in the week it is removed from the
    # box. If the week finishes and the job is not done, it goes back to the box."
    #
    # Previously this was NOT NULL, so every week had its OWN separate pool. An
    # order dropped into week 34's pool and never planned was invisible in week
    # 35 — still open in SAP, seen by nobody, able to hide for months. One shared
    # box means a job can only ever be planned or waiting, never lost.
    work_plan_id = db.Column(db.Integer, db.ForeignKey('work_plans.id'), nullable=True, index=True)

    # SAP information
    order_number = db.Column(db.String(50), nullable=False)
    order_type = db.Column(db.String(20), nullable=False)  # PRM, COM, INS, etc.

    # Job type (our internal mapping)
    job_type = db.Column(db.String(20), nullable=False)  # pm, defect, inspection, corrective

    # Equipment
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False)

    # Description
    description = db.Column(db.Text)

    # Planning info
    estimated_hours = db.Column(db.Float, default=4.0)
    priority = db.Column(db.String(20), default='normal')
    berth = db.Column(db.String(10))  # east, west, both

    # Cycle info (for PM)
    cycle_id = db.Column(db.Integer, db.ForeignKey('maintenance_cycles.id'))
    maintenance_base = db.Column(db.String(100))

    # Dates
    required_date = db.Column(db.Date)  # SAP required date
    planned_date = db.Column(db.Date)

    # Overdue tracking
    overdue_value = db.Column(db.Float)
    overdue_unit = db.Column(db.String(10))

    # Notes
    notes = db.Column(db.Text)

    # Work center: ELEC (electrical), MECH (mechanical), ELME (both)
    # Drives sub-team assignment in the auto-planner and bundle card view
    work_center = db.Column(db.String(10))  # ELEC, MECH, ELME

    # Status: pending (in pool), scheduled (moved to a day)
    status = db.Column(db.String(20), default='pending')

    # SAP's own System status for this order, e.g. 'REL CSER NMAT PRC'.
    #
    # Ali, 2026-09-04: REL without CNF means the work has STARTED; CNF, TECO or
    # CLSD mean finished; PCNF exists but the yard does not use it. The parser
    # has always read this field and sap_pool_sync then discarded it — the fifth
    # thing thrown away in that dict — so the app could only ever see half of
    # "has anyone begun this". Refreshed on every rebuild.
    system_status = db.Column(db.String(64), nullable=True)

    # What the APP recorded a worker doing, SNAPSHOT at the moment this order
    # went back in the box.
    #
    # Not computed at read time from the old WorkPlanJob: that job sits on a
    # week that has ended, and finished weeks are cleanup targets. Deleting old
    # plans would silently erase the badge from every half-done job — exactly
    # the loss Ali meant by "we cannot drop starting from sap or from the app".
    # Stamped by the reclaim paths, never cleared by the nightly sync.
    app_work_state = db.Column(db.String(20), nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    work_plan = db.relationship('WorkPlan')
    equipment = db.relationship('Equipment')
    cycle = db.relationship('MaintenanceCycle')

    # Constraints
    __table_args__ = (
        # ONE order number, ONE row — wherever it currently sits.
        #
        # This used to be UNIQUE(work_plan_id, order_number), from when every
        # week owned its own pool and the same order legitimately appeared once
        # per week. Since the pool became a single global box that is no longer
        # true: an order is either waiting or planned, never both and never
        # twice. Leaving the old shape in place let 2,242 duplicate rows build
        # up across ten finished weeks, then fired as a UniqueViolation the
        # moment the generator tried to place one — killing /generate.
        db.UniqueConstraint('order_number', name='unique_sap_order_number'),
        db.CheckConstraint(
            "job_type IN ('pm', 'defect', 'inspection', 'corrective')",
            name='check_sap_job_type'
        ),
        db.CheckConstraint(
            "status IN ('pending', 'scheduled')",
            name='check_sap_order_status'
        ),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary for API response."""
        return {
            'id': self.id,
            'work_plan_id': self.work_plan_id,
            'order_number': self.order_number,
            'order_type': self.order_type,
            'job_type': self.job_type,
            'equipment_id': self.equipment_id,
            'equipment': self.equipment.to_dict() if self.equipment else None,
            'description': self.description,
            'estimated_hours': self.estimated_hours,
            'priority': self.priority,
            'berth': self.berth,
            'cycle_id': self.cycle_id,
            'cycle': self.cycle.to_dict(language) if self.cycle else None,
            'maintenance_base': self.maintenance_base,
            'required_date': self.required_date.isoformat() if self.required_date else None,
            'planned_date': self.planned_date.isoformat() if self.planned_date else None,
            'overdue_value': self.overdue_value,
            'overdue_unit': self.overdue_unit,
            'notes': self.notes,
            'work_center': self.work_center,
            'status': self.status,
            'system_status': self.system_status,
            'app_work_state': self.app_work_state,
            # Decided HERE, never in the browser: the rule is Ali's and one copy
            # of it in the backend cannot drift from another in the frontend.
            'started': self.has_started(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def has_started(self):
        """Has anyone begun this work — according to SAP or to the app?

        EITHER source counts. Ali, 2026-09-04: "we cannot drop starting from sap
        or from the app itself." SAP only learns once someone books time in SAP,
        which may be days later or never; the app knows the second a worker
        presses Start. Neither alone is enough.
        """
        return sap_says_started(self.system_status) or bool(self.app_work_state)

    def __repr__(self):
        return f'<SAPWorkOrder {self.order_number} ({self.status})>'
