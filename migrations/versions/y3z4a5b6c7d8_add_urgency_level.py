"""Add urgency_level to inspection_answers

Revision ID: y3z4a5b6c7d8
Revises: x2y3z4a5b6c7
Create Date: 2026-02-17 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'y3z4a5b6c7d8'
down_revision = 'x2y3z4a5b6c7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('inspection_answers', sa.Column('urgency_level', sa.Integer(), nullable=False, server_default='0'))


def downgrade():
    op.drop_column('inspection_answers', 'urgency_level')
