"""Add all missing columns to job_checklist_responses

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-02-28 20:45:00.000000

Uses IF NOT EXISTS so it is safe to run even if some columns were already
added by a previous partial migration.
"""
from alembic import op

revision = 'd6e7f8a9b0c1'
down_revision = 'c5d6e7f8a9b0'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE job_checklist_responses
            ADD COLUMN IF NOT EXISTS question       TEXT,
            ADD COLUMN IF NOT EXISTS answer_type    VARCHAR(20),
            ADD COLUMN IF NOT EXISTS answer_value   VARCHAR(500),
            ADD COLUMN IF NOT EXISTS is_passed      BOOLEAN,
            ADD COLUMN IF NOT EXISTS notes          TEXT,
            ADD COLUMN IF NOT EXISTS photo_file_id  INTEGER REFERENCES files(id),
            ADD COLUMN IF NOT EXISTS answered_by_id INTEGER REFERENCES users(id),
            ADD COLUMN IF NOT EXISTS answered_at    TIMESTAMP DEFAULT NOW()
    """)


def downgrade():
    pass  # Not reversible — columns may already have data
