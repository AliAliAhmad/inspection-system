"""Add AI analysis fields to inspection answers

Revision ID: 11f207522193
Revises: dc264ac526ee
Create Date: 2026-02-13 21:22:44.054942

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '11f207522193'
down_revision = 'dc264ac526ee'
branch_labels = None
depends_on = None


def upgrade():
    # Add AI analysis fields to inspection_answers table
    op.add_column('inspection_answers', sa.Column('photo_ai_analysis', sa.JSON(), nullable=True))
    op.add_column('inspection_answers', sa.Column('video_ai_analysis', sa.JSON(), nullable=True))


def downgrade():
    # Remove AI analysis fields
    op.drop_column('inspection_answers', 'video_ai_analysis')
    op.drop_column('inspection_answers', 'photo_ai_analysis')
