"""Add lag_minutes column to job_dependencies

Revision ID: b4c5d6e7f8a9
Revises: a33572cecbae
Create Date: 2026-02-28 20:00:00.000000
"""
import sqlalchemy as sa
from alembic import op

revision = 'b4c5d6e7f8a9'
down_revision = 'a33572cecbae'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'job_dependencies',
        sa.Column('lag_minutes', sa.Integer(), server_default='0', nullable=True)
    )


def downgrade():
    op.drop_column('job_dependencies', 'lag_minutes')
