"""standardize_approval_status_to_rejected

Revision ID: 04104edfacd6
Revises: 20260210_leaves_workplan
Create Date: 2026-02-11 00:31:23.820965

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '04104edfacd6'
down_revision = '20260210_leaves_workplan'
branch_labels = None
depends_on = None


def upgrade():
    # Update pause_logs: 'denied' -> 'rejected'
    op.execute("UPDATE pause_logs SET status = 'rejected' WHERE status = 'denied'")

    # Update bonus_stars: 'denied' -> 'rejected'
    op.execute("UPDATE bonus_stars SET request_status = 'rejected' WHERE request_status = 'denied'")

    # Update job_takeovers: 'denied' -> 'rejected'
    op.execute("UPDATE job_takeovers SET status = 'rejected' WHERE status = 'denied'")

    # Note: CHECK constraints are updated in the model files.
    # SQLite doesn't support ALTER constraints, but it also doesn't enforce them at runtime.
    # For PostgreSQL deployments, the constraints will be applied when the tables are recreated.


def downgrade():
    # Revert pause_logs: 'rejected' -> 'denied'
    op.execute("UPDATE pause_logs SET status = 'denied' WHERE status = 'rejected'")

    # Revert bonus_stars: 'rejected' -> 'denied'
    op.execute("UPDATE bonus_stars SET request_status = 'denied' WHERE request_status = 'rejected'")

    # Revert job_takeovers: 'rejected' -> 'denied'
    op.execute("UPDATE job_takeovers SET status = 'denied' WHERE status = 'rejected'")
