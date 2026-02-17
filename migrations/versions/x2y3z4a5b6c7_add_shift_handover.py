"""Add shift handover model

Revision ID: x2y3z4a5b6c7
Revises: w1x2y3z4a5b6
Create Date: 2026-02-17 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'x2y3z4a5b6c7'
down_revision = 'w1x2y3z4a5b6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'shift_handovers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('shift_date', sa.Date(), nullable=False),
        sa.Column('shift_type', sa.String(10), nullable=False),
        sa.Column('outgoing_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('pending_items', sa.JSON(), nullable=True),
        sa.Column('safety_alerts', sa.JSON(), nullable=True),
        sa.Column('equipment_issues', sa.JSON(), nullable=True),
        sa.Column('voice_file_id', sa.Integer(), sa.ForeignKey('files.id'), nullable=True),
        sa.Column('voice_transcription', sa.JSON(), nullable=True),
        sa.Column('acknowledged_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('acknowledged_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_shift_handovers_date', 'shift_handovers', ['shift_date'])
    op.create_index('ix_shift_handovers_outgoing', 'shift_handovers', ['outgoing_user_id'])


def downgrade():
    op.drop_index('ix_shift_handovers_outgoing')
    op.drop_index('ix_shift_handovers_date')
    op.drop_table('shift_handovers')
