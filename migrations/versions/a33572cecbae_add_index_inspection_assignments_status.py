"""Add index on inspection_assignments.status for faster unassigned queries

Revision ID: a33572cecbae
Revises: c9d0e1f2a3b4
Create Date: 2026-02-28 14:00:00.000000
"""
from alembic import op

revision = 'a33572cecbae'
down_revision = 'c9d0e1f2a3b4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        'ix_inspection_assignments_status',
        'inspection_assignments',
        ['status']
    )


def downgrade():
    op.drop_index('ix_inspection_assignments_status', table_name='inspection_assignments')
