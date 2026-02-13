"""Merge migration heads

Revision ID: dc264ac526ee
Revises: q6r7s8t9u0v1, w1x2y3z4a5b6
Create Date: 2026-02-13 21:22:38.159980

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'dc264ac526ee'
down_revision = ('q6r7s8t9u0v1', 'w1x2y3z4a5b6')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
