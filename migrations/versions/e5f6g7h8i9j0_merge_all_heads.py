"""Merge all migration heads into single branch

Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9, 0d1d1babcd7c, u0v1w2x3y4z5, v1w2x3y4z5a6, q6r7s8t9u0v1, c3d4e5f6g7h9, k0l1m2n3o4p5, w1x2y3z4a5b6
Create Date: 2026-02-19
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = 'e5f6g7h8i9j0'
down_revision = ('d4e5f6g7h8i9', '0d1d1babcd7c', 'u0v1w2x3y4z5', 'v1w2x3y4z5a6', 'q6r7s8t9u0v1', 'c3d4e5f6g7h9', 'k0l1m2n3o4p5', 'w1x2y3z4a5b6')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
