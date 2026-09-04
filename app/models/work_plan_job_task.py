"""Sub-tasks / team notes that stick to a job, not to a row in a plan.

WHY THIS IS NOT A COLUMN ON work_plan_jobs, AND NOT A CHILD OF IT
=================================================================

Ali's requirement, 2026-09-05: "kept with it even when back to pool or
transferred to another job".

`work_plan_jobs` cannot carry that. Two paths, measured in the code:

  * MOVE to another day  — `work_plans.move_job` only changes
    `work_plan_day_id`. Same row, same id. A child row WOULD survive this.
  * BACK TO THE POOL     — `work_plans.purge_job_rows` runs
    `DELETE FROM work_plan_jobs WHERE id = :jid` plus a delete on every table
    in JOB_CHILD_TABLES. A child row would be DESTROYED here.

So the list hangs on the job's DURABLE identity instead — the thing that is
still the same after the row is deleted and a new row is created later:

    sap_order_number  ->  defect_id  ->  inspection_assignment_id  ->  job id

That identity is copied verbatim by every path that re-creates a job:
`work_plan_tracking` carry-over to the next day, `work_plan_service` split,
`place_one` for the Telegram bot, and the pool -> plan add. Pull the same SAP
order out of the pool three weeks later and the same list comes back with it.

THE ONLY ROWS THAT CARRY work_plan_job_id
=========================================

Rows anchored to 'sap' / 'defect' / 'inspection' leave `work_plan_job_id`
NULL. Only a MANUAL job — one with no SAP order, no defect and no inspection
behind it — anchors on the row itself, and a manual job has nothing to return
to in the pool anyway.

That is deliberate, and it is what makes it SAFE to add this table to
JOB_CHILD_TABLES: `DELETE ... WHERE work_plan_job_id = :jid` then removes the
manual-job lists (correct — that job ceases to exist) and cannot touch the
anchored ones (correct — Ali's requirement). It also stops the final
`DELETE FROM work_plan_jobs` from tripping the foreign key.

See tests/test_work_plan_job_tasks.py — a SAP job is returned to the pool and
its list is asserted to survive.
"""

import re
import unicodedata

from datetime import datetime

from app.extensions import db

# `work_plans.split_job` mints a synthetic order number for each part:
#     f"{job.sap_order_number}-P{i+1}"
# A real SAP order number is digits. Stripping the suffix means the parts of a
# split job share the parent's list, which is what a person expects: part 2 of
# the 250HR service is the same service.
_SPLIT_SUFFIX = re.compile(r'-P\d+$')

ANCHOR_KINDS = ('sap', 'defect', 'inspection', 'job')


def anchor_for(job):
    """(kind, key) — the durable identity this job's list hangs on.

    Order matters: a SAP order number outlives everything else, and a job that
    has one is the same job wherever it turns up.
    """
    sap = (job.sap_order_number or '').strip()
    if sap:
        return 'sap', _SPLIT_SUFFIX.sub('', sap)
    if job.defect_id:
        return 'defect', str(job.defect_id)
    if job.inspection_assignment_id:
        return 'inspection', str(job.inspection_assignment_id)
    return 'job', str(job.id)


def normalise_text(value):
    """NFC, trimmed. Arabic typed on two different keyboards must compare equal."""
    return unicodedata.normalize('NFC', str(value or '')).strip()


class WorkPlanJobTask(db.Model):
    """One line in a job's sub-task / note list."""

    __tablename__ = 'work_plan_job_tasks'

    id = db.Column(db.Integer, primary_key=True)

    # The durable identity — see anchor_for().
    anchor_kind = db.Column(db.String(12), nullable=False)
    anchor_key = db.Column(db.String(64), nullable=False)

    # Set ONLY when anchor_kind == 'job'. Read the module docstring before
    # changing this — it is what keeps anchored lists alive through
    # purge_job_rows().
    work_plan_job_id = db.Column(db.Integer,
                                 db.ForeignKey('work_plan_jobs.id'),
                                 nullable=True, index=True)

    content = db.Column(db.Text, nullable=False)

    is_done = db.Column(db.Boolean, default=False, nullable=False)
    done_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    done_at = db.Column(db.DateTime, nullable=True)

    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'),
                              nullable=False)

    position = db.Column(db.Integer, default=0, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow,
                           onupdate=datetime.utcnow, nullable=False)

    created_by = db.relationship('User', foreign_keys=[created_by_id])
    done_by = db.relationship('User', foreign_keys=[done_by_id])

    __table_args__ = (
        db.Index('ix_work_plan_job_tasks_anchor', 'anchor_kind', 'anchor_key'),
        db.CheckConstraint(
            "anchor_kind IN ('sap', 'defect', 'inspection', 'job')",
            name='check_work_plan_job_task_anchor_kind'
        ),
    )

    @classmethod
    def for_jobs(cls, jobs):
        """{job_id: [task, ...]} for many jobs in ONE query.

        The plan board draws ~100 jobs at a time. Asking per job is the same
        N+1 that made the pool take 30 queries to answer one screen.
        """
        if not jobs:
            return {}

        anchors = {}
        for job in jobs:
            anchors.setdefault(anchor_for(job), []).append(job.id)

        keys = {key for _, key in anchors}
        kinds = {kind for kind, _ in anchors}
        rows = (cls.query
                .filter(cls.anchor_kind.in_(kinds), cls.anchor_key.in_(keys))
                .order_by(cls.position, cls.id)
                .all())

        # The IN..IN above is a cross product, so re-check the exact pair.
        by_anchor = {}
        for row in rows:
            by_anchor.setdefault((row.anchor_kind, row.anchor_key), []).append(row)

        result = {}
        for anchor, job_ids in anchors.items():
            found = by_anchor.get(anchor, [])
            for job_id in job_ids:
                result[job_id] = found
        return result

    def to_dict(self):
        return {
            'id': self.id,
            'content': self.content,
            'is_done': bool(self.is_done),
            'position': self.position,
            'anchor_kind': self.anchor_kind,
            'anchor_key': self.anchor_key,
            'created_by_id': self.created_by_id,
            'created_by_name': self.created_by.full_name if self.created_by else None,
            'done_by_id': self.done_by_id,
            'done_by_name': self.done_by.full_name if self.done_by else None,
            'done_at': self.done_at.isoformat() if self.done_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        state = 'x' if self.is_done else ' '
        return f'<WorkPlanJobTask [{state}] {self.anchor_kind}:{self.anchor_key}>'
