"""Add question column to job_checklist_responses

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-02-28 20:30:00.000000
"""
import sqlalchemy as sa
from alembic import op

revision = 'c5d6e7f8a9b0'
down_revision = 'b4c5d6e7f8a9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'job_checklist_responses',
        sa.Column('question', sa.Text(), nullable=True)
    )


def downgrade():
    op.drop_column('job_checklist_responses', 'question')
