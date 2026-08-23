"""SAP work orders become one global pool instead of one pool per week

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-08-23

work_plan_id becomes nullable. NULL means "in the box" — outstanding work that
belongs to no particular week. A value means the order is currently scheduled
into that week.

Existing rows are deliberately NOT migrated here. Rows already carrying a
work_plan_id keep it and continue to behave exactly as before; the pool queries
match "NULL OR this plan", so nothing that works today stops working. New
robot-fed orders arrive with NULL and land in the shared box.

The unique constraint is left alone on purpose. Tightening it to order_number
alone requires deduplicating rows where the same SAP order was imported into
several weeks, and that is a data decision, not a schema one.
"""
from alembic import op
import sqlalchemy as sa

revision = 'o5p6q7r8s9t0'
down_revision = 'n4o5p6q7r8s9'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == 'sqlite':
        # SQLite cannot ALTER a column; batch mode rebuilds the table.
        with op.batch_alter_table('sap_work_orders') as batch:
            batch.alter_column('work_plan_id', existing_type=sa.Integer(), nullable=True)
    else:
        op.alter_column('sap_work_orders', 'work_plan_id',
                        existing_type=sa.Integer(), nullable=True)
    try:
        op.create_index('ix_sap_work_orders_work_plan_id', 'sap_work_orders', ['work_plan_id'])
    except Exception:
        pass  # already present


def downgrade():
    # Orders sitting in the global pool have no week to belong to, so they are
    # released rather than forced into an arbitrary plan.
    op.execute('DELETE FROM sap_work_orders WHERE work_plan_id IS NULL')
    op.alter_column('sap_work_orders', 'work_plan_id',
                    existing_type=sa.Integer(), nullable=False)
