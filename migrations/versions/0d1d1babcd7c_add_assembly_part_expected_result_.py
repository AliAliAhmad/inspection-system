"""Add assembly, part, expected_result, action_if_fail to checklist items

Revision ID: 0d1d1babcd7c
Revises: i8j9k0l1m2n3
Create Date: 2026-02-09 16:04:57.364448

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0d1d1babcd7c'
down_revision = 'i8j9k0l1m2n3'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns to checklist_items
    with op.batch_alter_table('checklist_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('assembly', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('part', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('expected_result', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('expected_result_ar', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('action_if_fail', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('action_if_fail_ar', sa.Text(), nullable=True))
        batch_op.create_index(batch_op.f('ix_checklist_items_assembly'), ['assembly'], unique=False)


def downgrade():
    with op.batch_alter_table('checklist_items', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_checklist_items_assembly'))
        batch_op.drop_column('action_if_fail_ar')
        batch_op.drop_column('action_if_fail')
        batch_op.drop_column('expected_result_ar')
        batch_op.drop_column('expected_result')
        batch_op.drop_column('part')
        batch_op.drop_column('assembly')
