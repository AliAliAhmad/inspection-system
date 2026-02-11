"""Add morning, afternoon, night shift support

Revision ID: w1x2y3z4a5b6
Revises: p5q6r7s8t9u0
Create Date: 2026-02-12

This migration documents the shift value changes:
- Previously: 'day' or 'night'
- Now: 'morning' (06:00-14:00), 'afternoon' (14:00-22:00), 'night' (22:00-06:00)
- Legacy 'day' value is still supported for backward compatibility

No schema changes needed - shift columns already support these string values.
"""
from alembic import op
import sqlalchemy as sa

revision = 'w1x2y3z4a5b6'
down_revision = 'p5q6r7s8t9u0'
branch_labels = None
depends_on = None


def upgrade():
    # No schema changes needed - just documenting the shift value changes
    # The shift column in inspection_lists and inspection_schedules already supports
    # varchar(20) which can hold 'morning', 'afternoon', 'night', or legacy 'day'
    pass


def downgrade():
    # No schema changes to revert
    pass
