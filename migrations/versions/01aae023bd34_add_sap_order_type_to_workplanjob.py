"""Add sap_order_type to WorkPlanJob

Revision ID: 01aae023bd34
Revises: g6h7i8j9k0l1
Create Date: 2026-02-09 00:35:50.260481

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '01aae023bd34'
down_revision = 'g6h7i8j9k0l1'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('work_plan_jobs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('sap_order_type', sa.String(length=20), nullable=True))


def downgrade():
    with op.batch_alter_table('work_plan_jobs', schema=None) as batch_op:
        batch_op.drop_column('sap_order_type')
