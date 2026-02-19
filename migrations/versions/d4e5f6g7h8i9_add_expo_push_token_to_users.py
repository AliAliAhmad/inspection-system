"""Add expo_push_token to users table

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h9
Create Date: 2026-02-19
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = 'd4e5f6g7h8i9'
down_revision = 'z4a5b6c7d8e9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('expo_push_token', sa.String(255), nullable=True))


def downgrade():
    op.drop_column('users', 'expo_push_token')
