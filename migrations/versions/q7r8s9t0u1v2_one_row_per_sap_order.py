"""One order number, one row — wherever it currently sits

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-08-24

UniqueConstraint('work_plan_id', 'order_number') is a leftover from when every
week owned its own pool: the same SAP order legitimately appeared once per week
back then. Since the pool became one global box, that is no longer true — an
order is either waiting or planned, never both, and never twice.

Leaving it in place cost real money in bugs. It let 2,242 duplicate rows
accumulate across ten finished weeks, and then fired as a UniqueViolation the
moment the generator tried to place one, killing /generate.

Applied only after the duplicates were cleared and verified: 2,436 rows down to
194, and a GROUP BY order_number HAVING count > 1 returning nothing. This
migration would fail loudly on a table that still had duplicates, which is the
correct behaviour but a bad surprise — hence the check first.

The old constraint's real name in production is the Postgres default
(sap_work_orders_work_plan_id_order_number_key), not the name declared on the
model, because the table predates that declaration. Both are attempted.
"""
from alembic import op
import sqlalchemy as sa


revision = 'q7r8s9t0u1v2'
down_revision = 'p6q7r8s9t0u1'
branch_labels = None
depends_on = None

OLD_NAMES = (
    'sap_work_orders_work_plan_id_order_number_key',  # Postgres default
    'unique_order_per_plan',                          # as declared on the model
)
NEW_NAME = 'unique_sap_order_number'


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != 'postgresql':
        # SQLite cannot ALTER constraints; the test database is built from the
        # model, which already carries the new shape.
        return

    for name in OLD_NAMES:
        op.execute(f'ALTER TABLE sap_work_orders DROP CONSTRAINT IF EXISTS "{name}"')

    op.execute(
        f'ALTER TABLE sap_work_orders ADD CONSTRAINT "{NEW_NAME}" '
        f'UNIQUE (order_number)'
    )


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name != 'postgresql':
        return

    op.execute(f'ALTER TABLE sap_work_orders DROP CONSTRAINT IF EXISTS "{NEW_NAME}"')
    op.execute(
        f'ALTER TABLE sap_work_orders ADD CONSTRAINT "{OLD_NAMES[0]}" '
        f'UNIQUE (work_plan_id, order_number)'
    )
