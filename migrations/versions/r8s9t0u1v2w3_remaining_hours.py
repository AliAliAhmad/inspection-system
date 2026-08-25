"""The worker says how many hours are left

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-08-25

Ali's rule ("C", 2026-08-24): the man who touched the machine states the
remaining hours when he cannot finish; the engineer corrects him at the
review. Until now the carry-over copied the FULL original estimate, so every
carried job over-booked the next day by exactly the work already done.
Nullable, no backfill — old rows simply fall back to (estimated - actual).
"""
from alembic import op
import sqlalchemy as sa

revision = 'r8s9t0u1v2w3'
down_revision = 'q7r8s9t0u1v2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('work_plan_job_trackings',
                  sa.Column('remaining_hours', sa.Numeric(5, 2), nullable=True))


def downgrade():
    op.drop_column('work_plan_job_trackings', 'remaining_hours')
