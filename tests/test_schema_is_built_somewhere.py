"""Every model table and column must be built by SOMETHING on deploy.

Production's schema comes from two places: `flask db upgrade` (migrations) and
the patches in start.sh — and start.sh carries on past a failed migration with
only a WARNING. The tests build their own database with create_all(), so they
can never notice a model column that neither place creates: the deploy goes
green and the first person to open that screen gets a 500 (knot report
2026-11-24, knot 5).

This reads the two build sources as text. It is coarse on purpose — a column
counts as built when its name appears in them at all — so it never cries wolf,
and it still catches the real mistake: a brand-new column nobody wrote a
migration or a start.sh line for.
"""

import pathlib
import re

from app.extensions import db

ROOT = pathlib.Path(__file__).resolve().parents[1]

# Model columns no migration or start.sh line creates. EMPTY since 2026-11-25:
# the seven found that day are built by migration u1v2w3x4y5z6. Never ADD a
# line here to make a new column pass — write its migration instead.
KNOWN_GAPS = set()


def _build_sources():
    migrations = '\n'.join(p.read_text(encoding='utf-8')
                           for p in (ROOT / 'migrations/versions').glob('*.py'))
    return migrations, (ROOT / 'start.sh').read_text(encoding='utf-8')


def test_every_model_table_is_created_on_deploy(app):
    migrations, start_sh = _build_sources()
    created = set(re.findall(r"create_table\(\s*['\"]([a-z0-9_]+)['\"]", migrations))
    created |= set(re.findall(r'CREATE TABLE(?: IF NOT EXISTS)? "?([a-z0-9_]+)', start_sh))
    created |= {re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower() + 's'
                for name in re.findall(r'(\w+)\.__table__\.create', start_sh)}
    with app.app_context():
        missing = sorted(set(db.metadata.tables) - created)
    assert missing == [], ('no migration or start.sh line creates: '
                           + ', '.join(missing))


def test_every_model_column_is_created_on_deploy(app):
    migrations, start_sh = _build_sources()
    words = set(re.findall(r'[A-Za-z_][A-Za-z0-9_]*', migrations + '\n' + start_sh))
    with app.app_context():
        missing = {(table.name, column.name)
                   for table in db.metadata.tables.values()
                   for column in table.columns if column.name not in words}
    new = sorted(missing - KNOWN_GAPS)
    assert new == [], ('add a migration (or a start.sh patch) for: '
                       + ', '.join(f'{t}.{c}' for t, c in new))


def test_the_known_gaps_list_only_shrinks():
    """A gap that has been built must leave the list, or the list lies."""
    migrations, start_sh = _build_sources()
    words = set(re.findall(r'[A-Za-z_][A-Za-z0-9_]*', migrations + '\n' + start_sh))
    fixed = sorted(f'{t}.{c}' for t, c in KNOWN_GAPS if c in words)
    assert fixed == [], 'now built, remove from KNOWN_GAPS: ' + ', '.join(fixed)
