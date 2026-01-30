"""Make equipment location nullable

Revision ID: a1b2c3d4e5f6
Revises: 0cacb96c705f
Create Date: 2026-01-30 20:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '0cacb96c705f'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('equipment', schema=None) as batch_op:
        batch_op.alter_column('location',
                              existing_type=sa.String(length=100),
                              nullable=True)


def downgrade():
    with op.batch_alter_table('equipment', schema=None) as batch_op:
        batch_op.alter_column('location',
                              existing_type=sa.String(length=100),
                              nullable=False)
