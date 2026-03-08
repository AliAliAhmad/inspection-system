"""add engineer_id to inspection_assignments

Revision ID: 52fc8ee11957
Revises: bd2ff27444ac
Create Date: 2026-03-08 10:49:52.895292

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '52fc8ee11957'
down_revision = 'bd2ff27444ac'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('inspection_assignments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('engineer_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_inspection_assignments_engineer_id', 'users', ['engineer_id'], ['id'])


def downgrade():
    with op.batch_alter_table('inspection_assignments', schema=None) as batch_op:
        batch_op.drop_constraint('fk_inspection_assignments_engineer_id', type_='foreignkey')
        batch_op.drop_column('engineer_id')
