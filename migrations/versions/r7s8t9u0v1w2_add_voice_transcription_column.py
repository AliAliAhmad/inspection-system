"""add voice_transcription column to inspection_answers

Revision ID: r7s8t9u0v1w2
Revises: q6r7s8t9u0v1
Create Date: 2026-02-14

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'r7s8t9u0v1w2'
down_revision = 'q6r7s8t9u0v1'
branch_labels = None
depends_on = None


def upgrade():
    # Add voice_transcription column to inspection_answers
    op.add_column('inspection_answers',
        sa.Column('voice_transcription', sa.JSON(), nullable=True)
    )


def downgrade():
    op.drop_column('inspection_answers', 'voice_transcription')
