"""Add work_center column to sap_work_orders and work_plan_jobs

Revision ID: g8h9i0j1k2l3
Revises: f7g8h9i0j1k2
Create Date: 2026-04-07 21:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'g8h9i0j1k2l3'
down_revision = 'f7g8h9i0j1k2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'sap_work_orders',
        sa.Column('work_center', sa.String(10), nullable=True),
    )
    op.add_column(
        'work_plan_jobs',
        sa.Column('work_center', sa.String(10), nullable=True),
    )


def downgrade():
    op.drop_column('work_plan_jobs', 'work_center')
    op.drop_column('sap_work_orders', 'work_center')
