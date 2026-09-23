"""A supervisor asking a planner to change who is on a job.

Ali, 2026-09-23: "how the supervisor can change the employee already assigned to a
job" — and then, "this need the admin or the planner approval".

A job's supervisor may be a specialist or a maintenance man (SUPERVISOR_ROLES is
wider than PLANNING_ROLES). He is at the machine and sees the crew is wrong, but
changing a crew is planning: the man he wants may already be booked elsewhere
that day, and only the board shows that. So he ASKS, and any engineer or admin
decides. Nothing on the job changes until one of them says yes.

ONE REQUEST = ONE CHANGE
========================

`remove_user_id` and `add_user_id` are both optional, and at least one is set:

  * remove + add -> swap one man for another (the replacement takes his lead role)
  * remove only  -> take a man off
  * add only     -> put another man on

A list of changes in one request would let half of it be right and half wrong,
with one Approve button for both.

STATUS
======

  pending   -> waiting for a planner
  approved  -> applied
  rejected  -> a planner said no
  cancelled -> the job started first, or the supervisor withdrew it

`cancelled` is not `rejected` on purpose: nobody refused him. A crew that has
started keeps its men (Ali's rule), so the question simply stopped being open.

This table is in JOB_CHILD_TABLES, so purging a job row clears its requests —
a request is about THIS week's crew and means nothing once the row is gone.
"""

from datetime import datetime

from app.extensions import db


CREW_CHANGE_STATUSES = ('pending', 'approved', 'rejected', 'cancelled')


class WorkPlanCrewChangeRequest(db.Model):
    __tablename__ = 'work_plan_crew_change_requests'

    id = db.Column(db.Integer, primary_key=True)

    work_plan_job_id = db.Column(db.Integer, db.ForeignKey('work_plan_jobs.id'),
                                 nullable=False, index=True)

    requested_by_id = db.Column(db.Integer, db.ForeignKey('users.id'),
                                nullable=False)
    remove_user_id = db.Column(db.Integer, db.ForeignKey('users.id'),
                               nullable=True)
    add_user_id = db.Column(db.Integer, db.ForeignKey('users.id'),
                            nullable=True)
    reason = db.Column(db.Text, nullable=True)

    status = db.Column(db.String(20), default='pending', nullable=False,
                       index=True)

    reviewed_by_id = db.Column(db.Integer, db.ForeignKey('users.id'),
                               nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    review_notes = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    job = db.relationship('WorkPlanJob')
    requester = db.relationship('User', foreign_keys=[requested_by_id])
    remove_user = db.relationship('User', foreign_keys=[remove_user_id])
    add_user = db.relationship('User', foreign_keys=[add_user_id])
    reviewer = db.relationship('User', foreign_keys=[reviewed_by_id])

    __table_args__ = (
        db.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'cancelled')",
            name='check_valid_crew_change_status'),
        db.CheckConstraint(
            'remove_user_id IS NOT NULL OR add_user_id IS NOT NULL',
            name='check_crew_change_has_a_change'),
    )

    def to_dict(self, language='en'):
        def person(user):
            if not user:
                return None
            return {'id': user.id, 'name': user.display_name(language),
                    'role': user.role}

        return {
            'id': self.id,
            'work_plan_job_id': self.work_plan_job_id,
            'requested_by': person(self.requester),
            'remove_user': person(self.remove_user),
            'add_user': person(self.add_user),
            'reason': self.reason,
            'status': self.status,
            'reviewed_by': person(self.reviewer),
            'reviewed_at': (self.reviewed_at.isoformat() + 'Z')
            if self.reviewed_at else None,
            'review_notes': self.review_notes,
            'created_at': (self.created_at.isoformat() + 'Z')
            if self.created_at else None,
        }
