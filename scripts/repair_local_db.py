"""Repair the drifted local SQLite dev database.

The DB fell behind the models: some tables were never created and some existing
tables are missing columns, so `flask db upgrade` dies part-way through the
chain. Rather than hand-patch 55 migrations, bring the schema up to the models
directly and then stamp Alembic as current.

Existing data is preserved — create_all() only creates MISSING tables, and
columns are added with ALTER TABLE ADD COLUMN.

Usage:
    python repair_local_db.py --dry-run    # show what would change
    python repair_local_db.py --apply      # do it
"""
import os
import sys
import sqlite3

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'instance', 'inspection.db')
APPLY = '--apply' in sys.argv

from app import create_app, db  # noqa: E402
from sqlalchemy.schema import CreateColumn  # noqa: E402

app = create_app()

with app.app_context():
    meta = db.metadata
    dialect = db.engine.dialect

    con = sqlite3.connect(DB_PATH)
    db_tables = {r[0] for r in con.execute("select name from sqlite_master where type='table'")}

    missing_tables = sorted(set(meta.tables) - db_tables)

    column_plan = []   # (table, column_name, DDL)
    skipped = []       # (table, column, reason)

    for tname, table in meta.tables.items():
        if tname not in db_tables:
            continue
        have = {r[1] for r in con.execute(f'PRAGMA table_info("{tname}")')}
        for col in table.columns:
            if col.name in have:
                continue
            # SQLite cannot ADD a NOT NULL column without a default to a table
            # that may already hold rows.
            has_default = col.server_default is not None or col.default is not None
            if not col.nullable and not has_default:
                skipped.append((tname, col.name, 'NOT NULL without default'))
                continue
            ddl = str(CreateColumn(col).compile(dialect=dialect))
            column_plan.append((tname, col.name, ddl))
    con.close()

    print(f'MISSING TABLES ({len(missing_tables)}):')
    for t in missing_tables:
        print(f'   + {t}')
    print(f'\nMISSING COLUMNS ({len(column_plan)}):')
    for t, c, ddl in column_plan:
        print(f'   + {t}.{c}')
    if skipped:
        print(f'\nSKIPPED ({len(skipped)}) — need a manual decision:')
        for t, c, why in skipped:
            print(f'   ! {t}.{c}  ({why})')

    if not APPLY:
        print('\nDRY RUN — nothing changed. Re-run with --apply to execute.')
        sys.exit(0)

    print('\nApplying...')
    db.create_all()
    print(f'  created {len(missing_tables)} missing table(s)')

    con = sqlite3.connect(DB_PATH)
    added = 0
    for tname, cname, ddl in column_plan:
        # create_all may already have handled some if the table was new
        have = {r[1] for r in con.execute(f'PRAGMA table_info("{tname}")')}
        if cname in have:
            continue
        try:
            con.execute(f'ALTER TABLE "{tname}" ADD COLUMN {ddl}')
            added += 1
        except Exception as exc:  # noqa: BLE001
            print(f'  ! {tname}.{cname}: {exc}')
    con.commit()
    con.close()
    print(f'  added {added} missing column(s)')
    print('\nDone. Next: flask db stamp head')
