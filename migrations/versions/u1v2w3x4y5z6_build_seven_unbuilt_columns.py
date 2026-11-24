"""Build the seven model columns that no migration ever created

Found 2026-11-25 by tests/test_schema_is_built_somewhere.py (knot report,
knot 5). All seven arrived in one commit on 2026-02-10 (b977943, "Leaves +
Work Planning enhancement"): the models gained them, the migration did not.
The app reads EVERY column a model lists, so one missing column fails the
whole table's screen — conflicts, equipment restrictions, template checklists.

Production may already hold some of them (added by hand or an old create_all),
so each column is added ONLY when it is missing. Running this twice, or on a
database that already has all seven, changes nothing.

No row's meaning changes:
- the two flags get server default FALSE, so existing rows read False. Left
  NULL they would vanish from `SchedulingConflict.is_ignored == False`
  (app/api/work_plans.py), because NULL is not equal to False in SQL.
- `frequency` stays NULL on existing routines rather than inventing a value;
  the web already reads a missing one as 'daily' (ConflictWarning.tsx).
- the text columns stay NULL.

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
"""
import logging

import sqlalchemy as sa
from alembic import op

revision = 'u1v2w3x4y5z6'
down_revision = 't0u1v2w3x4y5'
branch_labels = None
depends_on = None

logger = logging.getLogger('alembic.runtime.migration')

COLUMNS = (
    ('inspection_routines', 'frequency', sa.String(20), None),
    ('job_template_checklists', 'question_ar', sa.Text(), None),
    ('job_template_checklists', 'fail_action', sa.Text(), None),
    ('job_template_checklists', 'fail_action_ar', sa.Text(), None),
    ('equipment_restrictions', 'is_permanent', sa.Boolean(), sa.false()),
    ('scheduling_conflicts', 'resolution', sa.Text(), None),
    ('scheduling_conflicts', 'is_ignored', sa.Boolean(), sa.false()),
)


def _existing(table):
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table):
        return None
    return {column['name'] for column in inspector.get_columns(table)}


def upgrade():
    for table, name, type_, server_default in COLUMNS:
        present = _existing(table)
        if present is None:
            logger.info('%s: table missing, %s not added', table, name)
            continue
        if name in present:
            logger.info('%s.%s: already present', table, name)
            continue
        op.add_column(table, sa.Column(name, type_, nullable=True,
                                       server_default=server_default))
        logger.info('%s.%s: ADDED', table, name)


def downgrade():
    # Deliberately empty. Some of these columns may have existed in production
    # BEFORE this migration, and dropping them on a downgrade would destroy
    # real data this migration never created.
    pass
