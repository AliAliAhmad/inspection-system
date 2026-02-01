"""add voice_note_id to inspection_answers

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-02
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6g7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('inspection_answers', sa.Column('voice_note_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_inspection_answers_voice_note_id',
        'inspection_answers', 'files',
        ['voice_note_id'], ['id']
    )


def downgrade():
    op.drop_constraint('fk_inspection_answers_voice_note_id', 'inspection_answers', type_='foreignkey')
    op.drop_column('inspection_answers', 'voice_note_id')
