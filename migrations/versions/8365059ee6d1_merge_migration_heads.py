"""Merge migration heads

Revision ID: 8365059ee6d1
Revises: u0v1w2x3y4z5, v1w2x3y4z5a6
Create Date: 2026-02-16 15:05:49.234103

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8365059ee6d1'
down_revision = ('u0v1w2x3y4z5', 'v1w2x3y4z5a6')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
