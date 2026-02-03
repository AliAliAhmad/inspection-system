"""Add ai_tags and ocr_text columns to files table

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2024-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3d4e5f6g7h8'
down_revision = 'b2c3d4e5f6g7'
branch_labels = None
depends_on = None


def upgrade():
    # Add ai_tags (JSON) and ocr_text (Text) columns to files table
    op.add_column('files', sa.Column('ai_tags', sa.JSON(), nullable=True))
    op.add_column('files', sa.Column('ocr_text', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('files', 'ocr_text')
    op.drop_column('files', 'ai_tags')
