"""Migration u1v2w3x4y5z6 adds the seven unbuilt columns — only where missing.

Run against a throwaway database shaped like the worst case (tables present,
columns absent) and like the best case (everything already there), because
production may be either for each column.
"""

import importlib.util
import pathlib

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = pathlib.Path(__file__).resolve().parents[1]
PATH = ROOT / 'migrations/versions/u1v2w3x4y5z6_build_seven_unbuilt_columns.py'
spec = importlib.util.spec_from_file_location('seven_columns', PATH)
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)

TABLES = ('inspection_routines', 'job_template_checklists',
          'equipment_restrictions', 'scheduling_conflicts')


def _upgrade(engine):
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            migration.upgrade()


def _columns(engine, table):
    return {c['name'] for c in sa.inspect(engine).get_columns(table)}


@pytest.fixture
def bare_db():
    """The four tables with only an id and one old row each."""
    engine = sa.create_engine('sqlite://')
    with engine.begin() as conn:
        for table in TABLES:
            conn.execute(sa.text(f'CREATE TABLE {table} (id INTEGER PRIMARY KEY)'))
            conn.execute(sa.text(f'INSERT INTO {table} (id) VALUES (1)'))
    return engine


def test_every_missing_column_is_added(bare_db):
    _upgrade(bare_db)

    for table, name, _type, _default in migration.COLUMNS:
        assert name in _columns(bare_db, table), f'{table}.{name}'


def test_old_rows_read_false_for_the_flags_and_empty_for_the_rest(bare_db):
    """Left NULL, an old conflict would drop out of `is_ignored == False`."""
    _upgrade(bare_db)

    with bare_db.connect() as conn:
        assert conn.execute(sa.text(
            'SELECT is_ignored FROM scheduling_conflicts')).scalar() in (False, 0)
        assert conn.execute(sa.text(
            'SELECT count(*) FROM scheduling_conflicts WHERE is_ignored = 0'
        )).scalar() == 1
        assert conn.execute(sa.text(
            'SELECT is_permanent FROM equipment_restrictions')).scalar() in (False, 0)
        assert conn.execute(sa.text(
            'SELECT frequency FROM inspection_routines')).scalar() is None


def test_running_it_twice_changes_nothing(bare_db):
    _upgrade(bare_db)
    before = {t: _columns(bare_db, t) for t in TABLES}

    _upgrade(bare_db)

    assert {t: _columns(bare_db, t) for t in TABLES} == before


def test_a_column_already_present_keeps_its_data():
    engine = sa.create_engine('sqlite://')
    with engine.begin() as conn:
        for table in TABLES:
            conn.execute(sa.text(f'CREATE TABLE {table} (id INTEGER PRIMARY KEY)'))
        conn.execute(sa.text('ALTER TABLE inspection_routines ADD COLUMN frequency VARCHAR(20)'))
        conn.execute(sa.text("INSERT INTO inspection_routines (id, frequency) VALUES (1, 'weekly')"))

    _upgrade(engine)

    with engine.connect() as conn:
        assert conn.execute(sa.text(
            'SELECT frequency FROM inspection_routines')).scalar() == 'weekly'


def test_a_missing_table_is_skipped_not_created():
    engine = sa.create_engine('sqlite://')

    _upgrade(engine)

    assert sa.inspect(engine).get_table_names() == []
