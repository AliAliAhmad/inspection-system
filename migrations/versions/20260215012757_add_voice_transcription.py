"""Add voice_transcription field to inspection_answers

Revision ID: a1b2c3d4e5f6
Revises: 11f207522193
Create Date: 2026-02-15
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = 'a1b2c3d4e5f6'
down_revision = '11f207522193'
branch_labels = None
depends_on = None


def upgrade():
    # Add voice_transcription JSON column to inspection_answers table
    op.add_column('inspection_answers', sa.Column('voice_transcription', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('inspection_answers', 'voice_transcription')
