"""Add checklist_item_equipment_types junction table

Allows each checklist question to be tagged with specific equipment sub-types.
Questions with no rows apply to ALL types (backward compatible).

Revision ID: c9d0e1f2a3b4
Revises: e5f6g7h8i9j0
Create Date: 2026-02-28 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'c9d0e1f2a3b4'
down_revision = 'e5f6g7h8i9j0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'checklist_item_equipment_types',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('checklist_item_id', sa.Integer(), nullable=False),
        sa.Column('equipment_type', sa.String(length=100), nullable=False),
        sa.ForeignKeyConstraint(
            ['checklist_item_id'], ['checklist_items.id'],
            name='fk_ciet_checklist_item',
            ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('checklist_item_id', 'equipment_type', name='uq_ciet_item_type'),
    )
    op.create_index('ix_ciet_item_id', 'checklist_item_equipment_types', ['checklist_item_id'])


def downgrade():
    op.drop_index('ix_ciet_item_id', table_name='checklist_item_equipment_types')
    op.drop_table('checklist_item_equipment_types')
