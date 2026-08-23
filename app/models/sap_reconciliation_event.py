"""
What the robot found when SAP disagreed with the plan.

The daily sync runs unattended in a background thread, so there is no caller to
hand a report to and nobody watching a log. Anything worth a human's attention
has to survive until that human looks — this is where it waits.

Two consumers: the Telegram push reads undelivered rows to build its message,
and the question rows (scenario 12) stay open until Ali answers them.
"""

from datetime import datetime

from app.extensions import db


# What the robot DID, not what SAP said — sap_state carries that separately, so
# "done" and "cancelled" share one event type and differ only in wording.
EVENT_TYPES = (
    # Scenario 7/10-untouched: nobody had touched the job, so it was removed.
    'job_removed',
    # Scenario 8/10-touched: a worker is on it right now. Nothing was touched.
    'job_in_progress_conflict',
    # Scenario 9: the app had already finished it. Kept as the record.
    'job_completion_confirmed',
    # Scenario 12: the app says done, SAP still shows it open. A question.
    'completion_not_confirmed',
)


class SapReconciliationEvent(db.Model):
    """One thing the robot noticed that a person needs to know about."""

    __tablename__ = 'sap_reconciliation_events'

    id = db.Column(db.Integer, primary_key=True)

    event_type = db.Column(db.String(40), nullable=False, index=True)

    # The SAP order this is about. Kept as the natural key rather than an FK:
    # scenario 7 deletes the staging row, and the event has to outlive it.
    order_number = db.Column(db.String(50), nullable=False, index=True)

    # What SAP said: done | cancelled | open
    sap_state = db.Column(db.String(20), nullable=False)

    # Where it was in the plan. Nullable because the job may have been removed
    # (scenario 7) or may never have existed (a pool-only order).
    work_plan_id = db.Column(db.Integer, db.ForeignKey('work_plans.id'), nullable=True, index=True)
    work_plan_job_id = db.Column(db.Integer, nullable=True)

    # One line a person can read without opening anything.
    summary = db.Column(db.Text, nullable=False)

    # Everything else: equipment, day, worker, hour figures. Free-form on
    # purpose — the useful fields differ per scenario and will keep changing.
    details = db.Column(db.JSON, nullable=True)

    # open -> waiting to be seen or answered; resolved -> dealt with.
    status = db.Column(db.String(20), nullable=False, default='open', index=True)

    # When the bot actually delivered it. Separate from status because a
    # question can be delivered and still be open.
    notified_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    resolved_at = db.Column(db.DateTime, nullable=True)

    work_plan = db.relationship('WorkPlan')

    __table_args__ = (
        db.CheckConstraint(
            "status IN ('open', 'resolved')",
            name='check_sap_event_status'
        ),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'event_type': self.event_type,
            'order_number': self.order_number,
            'sap_state': self.sap_state,
            'work_plan_id': self.work_plan_id,
            'work_plan_job_id': self.work_plan_job_id,
            'summary': self.summary,
            'details': self.details or {},
            'status': self.status,
            'notified_at': self.notified_at.isoformat() if self.notified_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
        }

    def __repr__(self):
        return f'<SapReconciliationEvent {self.event_type} {self.order_number} ({self.status})>'
