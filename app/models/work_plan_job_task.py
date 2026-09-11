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


def anchor_for_values(sap_order_number, defect_id, inspection_assignment_id,
                      job_id):
    """The anchor rule, on plain values.

    Split out so callers can ask "what WOULD this job's anchor be if its order
    number were X" without building a throwaway WorkPlanJob to ask with — which
    is what re-anchoring on link needs, and what a scratch model object should
    never be used for.
    """
    sap = (sap_order_number or '').strip()
    if sap:
        return 'sap', _SPLIT_SUFFIX.sub('', sap)
    if defect_id:
        return 'defect', str(defect_id)
    if inspection_assignment_id:
        return 'inspection', str(inspection_assignment_id)
    return 'job', str(job_id)


def anchor_for(job):
    """(kind, key) — the durable identity this job's list hangs on.

    Order matters: a SAP order number outlives everything else, and a job that
    has one is the same job wherever it turns up.
    """
    return anchor_for_values(job.sap_order_number, job.defect_id,
                             job.inspection_assignment_id, job.id)


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

    # A line may be words, a photo, a voice note, or words WITH one attached.
    #
    # Ali, 2026-09-09: "in the work details i need to be able to add photo and
    # voice". They hang here rather than on the tracking row because a photo of
    # a cracked glass is about the JOB, and this list is the one thing that
    # already survives the job going back to the pool and coming out again.
    content = db.Column(db.Text, nullable=False)
    attachment_file_id = db.Column(db.Integer, db.ForeignKey('files.id'),
                                   nullable=True)
    attachment_kind = db.Column(db.String(10), nullable=True)  # photo | voice

    # ── SAP operations live in this same list ──────────────────────────────
    #
    # Ali, 2026-09-10: "inside a general refurbishment order you can check the
    # spreader, replace or repair harness, open telescopic chain ... user should
    # see the operations inside the order and he can deal with each same as he
    # deal with the order".
    #
    # WHY HERE AND NOT IN A TABLE OF THEIR OWN
    #
    # Ali's own words settle it: a line HE typed and a line SAP sent must behave
    # identically. One table with `source` gives that; two tables leave a
    # hand-typed operation homeless between them.
    #
    # And the durability of this table — surviving the pool, carry-over, split
    # and purge_job_rows, plus for_jobs() batching — was expensive to get right.
    # A second table re-implements all of it, and would re-earn the same bugs.
    source = db.Column(db.String(10), default='manual', nullable=False)  # manual | sap
    operation_number = db.Column(db.String(10), nullable=True)  # SAP 0010, 0020
    # An order can hold MECH and ELEC operations. This is what splits them
    # between the two teams INSIDE one order (Ali, 2026-09-11).
    work_center = db.Column(db.String(10), nullable=True)
    planned_hours = db.Column(db.Numeric(6, 2), nullable=True)

    # ── One timer per operation ────────────────────────────────────────────
    #
    # Ali chose start/pause/finish per operation over a simple tick, knowing it
    # was the bigger build. These columns are nullable: a plain written note
    # never uses them, and `is_done` alone still works for one.
    #
    # These sit on the ANCHOR, so they follow the order through the pool and
    # across weeks. That is correct — half-finished work is half-finished in
    # January and in March. Nothing person-bound is stored here for the same
    # reason inverted: the electrician assigned in week 37 must not silently own
    # it in week 40, so assignment stays on the job row.
    status = db.Column(db.String(20), nullable=True)  # pending|in_progress|paused|completed
    started_at = db.Column(db.DateTime, nullable=True)
    paused_at = db.Column(db.DateTime, nullable=True)
    total_paused_minutes = db.Column(db.Integer, default=0, nullable=False)
    actual_hours = db.Column(db.Numeric(6, 2), nullable=True)

    is_done = db.Column(db.Boolean, default=False, nullable=False)
    done_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    done_at = db.Column(db.DateTime, nullable=True)

    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'),
                              nullable=False)

    position = db.Column(db.Integer, default=0, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow,
                           onupdate=datetime.utcnow, nullable=False)

    attachment = db.relationship('File', foreign_keys=[attachment_file_id])
    created_by = db.relationship('User', foreign_keys=[created_by_id])
    done_by = db.relationship('User', foreign_keys=[done_by_id])

    __table_args__ = (
        db.Index('ix_work_plan_job_tasks_anchor', 'anchor_kind', 'anchor_key'),
        # One row per SAP operation per order. The sync upserts on this.
        db.UniqueConstraint('anchor_kind', 'anchor_key', 'operation_number',
                            name='uq_work_plan_job_task_operation'),
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

    def to_dict(self, language='en'):
        return {
            'id': self.id,
            'content': self.content,
            'is_done': bool(self.is_done),
            'position': self.position,
            'anchor_kind': self.anchor_kind,
            'anchor_key': self.anchor_key,
            'attachment_kind': self.attachment_kind,
            'source': self.source or 'manual',
            'operation_number': self.operation_number,
            'work_center': self.work_center,
            'planned_hours': (float(self.planned_hours)
                              if self.planned_hours is not None else None),
            'status': self.status or ('completed' if self.is_done else 'pending'),
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'paused_at': self.paused_at.isoformat() if self.paused_at else None,
            'actual_hours': (float(self.actual_hours)
                             if self.actual_hours is not None else None),
            'attachment_url': (self.attachment.get_url()
                               if self.attachment else None),
            'created_by_id': self.created_by_id,
            'created_by_name': (self.created_by.display_name(language)
                                if self.created_by else None),
            'done_by_id': self.done_by_id,
            'done_by_name': (self.done_by.display_name(language)
                             if self.done_by else None),
            'done_at': self.done_at.isoformat() if self.done_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        state = 'x' if self.is_done else ' '
        return f'<WorkPlanJobTask [{state}] {self.anchor_kind}:{self.anchor_key}>'
