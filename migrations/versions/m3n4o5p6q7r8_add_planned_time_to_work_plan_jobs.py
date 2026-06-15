"""Add worker planned_time fields to work_plan_jobs

Worker's committed planned time (entered before starting, AI-assisted),
distinct from the engineer's estimated_hours. Used as the basis for time_rating.

Revision ID: m3n4o5p6q7r8
Revises: i0j1k2l3m4n5
Create Date: 2026-06-16 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'm3n4o5p6q7r8'
down_revision = 'i0j1k2l3m4n5'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'work_plan_jobs',
        sa.Column('planned_time_hours', sa.Numeric(5, 2), nullable=True),
    )
    op.add_column(
        'work_plan_jobs',
        sa.Column('planned_time_entered_at', sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_column('work_plan_jobs', 'planned_time_entered_at')
    op.drop_column('work_plan_jobs', 'planned_time_hours')
