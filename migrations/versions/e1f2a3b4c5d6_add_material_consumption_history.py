"""Add material_consumption_history table

Revision ID: e1f2a3b4c5d6
Revises: d6e7f8a9b0c1
Create Date: 2026-03-01 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'e1f2a3b4c5d6'
down_revision = 'd6e7f8a9b0c1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'material_consumption_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('material_id', sa.Integer(), sa.ForeignKey('materials.id', ondelete='CASCADE'), nullable=False),
        sa.Column('period_type', sa.String(20), nullable=False),   # monthly | quarterly | yearly
        sa.Column('period_label', sa.String(20), nullable=False),  # e.g. "2025-03", "2025-Q1", "2025"
        sa.Column('quantity_consumed', sa.Float(), nullable=False, server_default='0'),
        sa.Column('source', sa.String(20), nullable=False, server_default='imported'),  # imported | system
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_mat_consumption_material_period', 'material_consumption_history',
                    ['material_id', 'period_type', 'period_label'], unique=True)


def downgrade():
    op.drop_index('ix_mat_consumption_material_period', 'material_consumption_history')
    op.drop_table('material_consumption_history')
