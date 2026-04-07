"""Add team_number to worker_assignment_rules

Revision ID: h9i0j1k2l3m4
Revises: g8h9i0j1k2l3
Create Date: 2026-04-07 23:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'h9i0j1k2l3m4'
down_revision = 'g8h9i0j1k2l3'
branch_labels = None
depends_on = None


def upgrade():
    # Add team_number column with default 1 so existing rows stay valid
    op.add_column(
        'worker_assignment_rules',
        sa.Column('team_number', sa.Integer(), nullable=False, server_default='1'),
    )

    # Drop the old 3-key unique constraint and add the new 4-key version
    op.drop_constraint('uq_worker_assignment_rule', 'worker_assignment_rules', type_='unique')
    op.create_unique_constraint(
        'uq_worker_assignment_rule',
        'worker_assignment_rules',
        ['berth', 'team_type', 'equipment_category', 'team_number'],
    )


def downgrade():
    op.drop_constraint('uq_worker_assignment_rule', 'worker_assignment_rules', type_='unique')
    op.create_unique_constraint(
        'uq_worker_assignment_rule',
        'worker_assignment_rules',
        ['berth', 'team_type', 'equipment_category'],
    )
    op.drop_column('worker_assignment_rules', 'team_number')
