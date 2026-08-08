"""Add team_number to worker_assignment_rules

Revision ID: h9i0j1k2l3m4
Revises: g8h9i0j1k2l3
Create Date: 2026-04-07 23:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'h9i0j1k2l3m4'
down_revision = 'g8h9i0j1k2l3'
branch_labels = None
depends_on = None


TABLE = 'worker_assignment_rules'
NEW_UNIQUE = ['berth', 'team_type', 'equipment_category', 'team_number']


def upgrade():
    """Idempotent + SQLite-safe.

    Some databases already grew `team_number` outside Alembic (e.g. via
    db.create_all() on a dev machine), leaving the version table behind. Running
    this unguarded then died with "duplicate column name: team_number" and
    blocked every later migration. Both steps below are therefore skipped if
    already applied.
    """
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    columns = [c['name'] for c in inspector.get_columns(TABLE)]
    if 'team_number' not in columns:
        op.add_column(
            TABLE,
            sa.Column('team_number', sa.Integer(), nullable=False, server_default='1'),
        )
    else:
        print(f'{TABLE}.team_number already exists — skipping add_column')

    # Widen the unique constraint from 3 keys to 4 so two teams can share a
    # berth/team_type/equipment_category.
    existing = inspector.get_unique_constraints(TABLE)
    if any(sorted(u['column_names']) == sorted(NEW_UNIQUE) for u in existing):
        print('uq_worker_assignment_rule already covers team_number — skipping')
        return

    if conn.dialect.name == 'sqlite':
        # SQLite cannot ALTER a table-level UNIQUE (it is an unnamed
        # sqlite_autoindex). Rebuilding via batch mode is not viable either:
        # it reflects foreign keys and blows up on any table missing from a
        # partially-built dev database. Production is PostgreSQL, so this only
        # affects local SQLite dev, where the leftover 3-key constraint is
        # merely stricter than intended.
        print(
            'SQLite: leaving the 3-key uq_worker_assignment_rule in place '
            '(cannot ALTER a table-level UNIQUE). Rules that differ ONLY by '
            'team_number cannot be inserted locally; PostgreSQL is unaffected.'
        )
        return

    op.drop_constraint('uq_worker_assignment_rule', TABLE, type_='unique')
    op.create_unique_constraint('uq_worker_assignment_rule', TABLE, NEW_UNIQUE)


def downgrade():
    op.drop_constraint('uq_worker_assignment_rule', 'worker_assignment_rules', type_='unique')
    op.create_unique_constraint(
        'uq_worker_assignment_rule',
        'worker_assignment_rules',
        ['berth', 'team_type', 'equipment_category'],
    )
    op.drop_column('worker_assignment_rules', 'team_number')
