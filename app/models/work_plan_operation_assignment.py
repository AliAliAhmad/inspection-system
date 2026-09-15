"""Who does WHICH LINE of an order.

Ali, 2026-09-15: "now the operation is showing inside the job detail, is thier a
way to be shown also when under the job father with an indent, so i can easly
assign people".

He was offered three shapes and picked per-operation assignment with the
carry-over warning in front of him. THIS DESIGN REMOVES THAT WARNING, and the
whole reason is one column.

WHY work_plan_job_id IS HERE
============================

An operation lives in `work_plan_job_tasks`, anchored to the SAP ORDER. That is
what lets a half-finished operation survive a trip through the pool and come back
next week with its tick and its timer intact — the app's ticks are the only record
of partial progress anywhere, because SAP closes an order only once every
operation in it is done.

A PERSON must not survive that trip. Rosters change weekly: shifts move, men take
leave, a crew is re-cut. A name that followed an order across weeks would be a
quietly wrong answer on a Monday morning.

So this row carries `work_plan_job_id` — the WEEK's row — and the table is listed
in JOB_CHILD_TABLES. `purge_job_rows` deletes it exactly as it already deletes
`work_plan_assignments`. The work persists; the roster does not. Nothing new had
to be written to make that true: it is how job-level assignment has always
behaved, and this simply joins it.

ASSIGNING TO AN OPERATION ALSO ASSIGNS TO THE JOB
================================================

`/my-plan` selects a worker's jobs through `WorkPlanJob.assignments`. A man
assigned only to a line would therefore see NOTHING on his phone — assigned and
unaware. So the endpoint creates the job-level assignment too.

The reverse is deliberately NOT symmetric: taking a man off his last operation
leaves him on the job. He may have been put there before the operations arrived,
or put there on purpose to help. Taking him off the JOB does remove his lines,
because otherwise his face sits on a line of a job he is not on.
"""

from datetime import datetime

from app.extensions import db


class WorkPlanOperationAssignment(db.Model):
    """One person on one operation, for one week."""

    __tablename__ = 'work_plan_operation_assignments'

    id = db.Column(db.Integer, primary_key=True)

    # The operation. CASCADE because an operation is deleted in three places —
    # the nightly sync dropping an untouched line, prune-orphan-operations
    # bulk-deleting by id, and a planner removing one he typed. None of them
    # should have to know this table exists.
    task_id = db.Column(db.Integer,
                        db.ForeignKey('work_plan_job_tasks.id',
                                      ondelete='CASCADE'),
                        nullable=False, index=True)

    # The WEEK. This is the whole design — see the module docstring.
    work_plan_job_id = db.Column(db.Integer,
                                 db.ForeignKey('work_plan_jobs.id'),
                                 nullable=False, index=True)

    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    task = db.relationship('WorkPlanJobTask', backref=db.backref(
        'assignees', cascade='all, delete-orphan', passive_deletes=True))
    user = db.relationship('User')

    __table_args__ = (
        db.UniqueConstraint('task_id', 'user_id',
                            name='uq_operation_assignment'),
    )

    def to_dict(self, language='en'):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'user_id': self.user_id,
            # display_name, not full_name: an Arabic crew reads the name a
            # person typed, never a machine transliteration.
            'user_name': (self.user.display_name(language)
                          if self.user else None),
        }
