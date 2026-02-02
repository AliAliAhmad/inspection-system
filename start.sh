#!/bin/bash
set -e

# Fix Render's postgres:// URI scheme for SQLAlchemy 2.x
if [ -n "$DATABASE_URL" ]; then
  export DATABASE_URL="${DATABASE_URL/postgres:\/\//postgresql:\/\/}"
fi

# Set FLASK_APP for CLI commands
export FLASK_APP="app:create_app('production')"

echo "Running database migrations..."
flask db upgrade || echo "WARNING: Migration failed, continuing with schema patches..."

echo "Applying schema patches..."
python -c "
from app import create_app
from app.extensions import db
from sqlalchemy import text
app = create_app('production')
with app.app_context():
    cols = [
        ('description', 'TEXT'),
        ('function', 'VARCHAR(200)'),
        ('assembly', 'VARCHAR(200)'),
        ('part', 'VARCHAR(200)'),
    ]
    for col_name, col_type in cols:
        try:
            db.session.execute(text(f'ALTER TABLE checklist_templates ADD COLUMN {col_name} {col_type}'))
            db.session.commit()
            print(f'Added {col_name} column')
        except Exception:
            db.session.rollback()
            print(f'{col_name} column already exists')
    # Make equipment_type nullable
    try:
        db.session.execute(text('ALTER TABLE checklist_templates ALTER COLUMN equipment_type DROP NOT NULL'))
        db.session.commit()
        print('Made equipment_type nullable')
    except Exception:
        db.session.rollback()
        print('equipment_type already nullable')

    # Make inspection_routines shift and days_of_week nullable
    for col in ['shift', 'days_of_week']:
        try:
            db.session.execute(text(f'ALTER TABLE inspection_routines ALTER COLUMN {col} DROP NOT NULL'))
            db.session.commit()
            print(f'Made inspection_routines.{col} nullable')
        except Exception:
            db.session.rollback()
            print(f'inspection_routines.{col} already nullable')

    # Add shift column to inspection_schedules
    try:
        db.session.execute(text(\"ALTER TABLE inspection_schedules ADD COLUMN shift VARCHAR(20) DEFAULT 'day'\"))
        db.session.commit()
        print('Added shift column to inspection_schedules')
    except Exception:
        db.session.rollback()
        print('inspection_schedules.shift already exists')

    # Add berth column to inspection_schedules
    try:
        db.session.execute(text(\"ALTER TABLE inspection_schedules ADD COLUMN berth VARCHAR(50)\"))
        db.session.commit()
        print('Added berth column to inspection_schedules')
    except Exception:
        db.session.rollback()
        print('inspection_schedules.berth already exists')

    # Add template_id column to inspection_assignments
    try:
        db.session.execute(text(\"ALTER TABLE inspection_assignments ADD COLUMN template_id INTEGER REFERENCES checklist_templates(id)\"))
        db.session.commit()
        print('Added template_id column to inspection_assignments')
    except Exception:
        db.session.rollback()
        print('inspection_assignments.template_id already exists')

    # Create roster_entries table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS roster_entries (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                date DATE NOT NULL,
                shift VARCHAR(20),
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, date)
            )
        '''))
        db.session.commit()
        print('Created roster_entries table')
    except Exception:
        db.session.rollback()
        print('roster_entries table already exists')

    # Add wrong_finding columns to specialist_jobs
    for col_name, col_type in [('wrong_finding_reason', 'TEXT'), ('wrong_finding_photo', 'VARCHAR(500)')]:
        try:
            db.session.execute(text(f'ALTER TABLE specialist_jobs ADD COLUMN {col_name} {col_type}'))
            db.session.commit()
            print(f'Added {col_name} column to specialist_jobs')
        except Exception:
            db.session.rollback()
            print(f'specialist_jobs.{col_name} already exists')

    # Update specialist_jobs status constraint to include cancelled
    try:
        db.session.execute(text('ALTER TABLE specialist_jobs DROP CONSTRAINT IF EXISTS check_valid_job_status'))
        constraint_sql = 'ALTER TABLE specialist_jobs ADD CONSTRAINT check_valid_job_status '
        constraint_sql += \"CHECK (status IN ('assigned', 'in_progress', 'paused', 'completed', 'incomplete', 'qc_approved', 'cancelled'))\"
        db.session.execute(text(constraint_sql))
        db.session.commit()
        print('Updated specialist_jobs status constraint')
    except Exception:
        db.session.rollback()
        print('specialist_jobs status constraint already up to date')

    # Add annual_leave_balance column to users
    try:
        db.session.execute(text('ALTER TABLE users ADD COLUMN annual_leave_balance INTEGER DEFAULT 24 NOT NULL'))
        db.session.commit()
        print('Added annual_leave_balance column')
    except Exception:
        db.session.rollback()
        print('annual_leave_balance column already exists')

    # Add voice_note_id column to inspection_answers
    try:
        db.session.execute(text('ALTER TABLE inspection_answers ADD COLUMN voice_note_id INTEGER REFERENCES files(id)'))
        db.session.commit()
        print('Added voice_note_id column to inspection_answers')
    except Exception:
        db.session.rollback()
        print('inspection_answers.voice_note_id already exists')

    # Add assignment_id and inspection_code to inspections
    try:
        db.session.execute(text('ALTER TABLE inspections ADD COLUMN assignment_id INTEGER REFERENCES inspection_assignments(id)'))
        db.session.commit()
        print('Added assignment_id column to inspections')
    except Exception:
        db.session.rollback()
        print('inspections.assignment_id already exists')

    try:
        db.session.execute(text('ALTER TABLE inspections ADD COLUMN inspection_code VARCHAR(100) UNIQUE'))
        db.session.commit()
        print('Added inspection_code column to inspections')
    except Exception:
        db.session.rollback()
        print('inspections.inspection_code already exists')

    # Add video_path and video_file_id to inspection_answers
    try:
        db.session.execute(text('ALTER TABLE inspection_answers ADD COLUMN video_path VARCHAR(500)'))
        db.session.commit()
        print('Added video_path column to inspection_answers')
    except Exception:
        db.session.rollback()
        print('inspection_answers.video_path already exists')

    try:
        db.session.execute(text('ALTER TABLE inspection_answers ADD COLUMN video_file_id INTEGER REFERENCES files(id)'))
        db.session.commit()
        print('Added video_file_id column to inspection_answers')
    except Exception:
        db.session.rollback()
        print('inspection_answers.video_file_id already exists')

    # Add photo_file_id to inspection_answers
    try:
        db.session.execute(text('ALTER TABLE inspection_answers ADD COLUMN photo_file_id INTEGER REFERENCES files(id)'))
        db.session.commit()
        print('Added photo_file_id column to inspection_answers')
    except Exception:
        db.session.rollback()
        print('inspection_answers.photo_file_id already exists')

    # Backfill photo_file_id from existing files table
    try:
        db.session.execute(text('''
            UPDATE inspection_answers ia
            SET photo_file_id = f.id
            FROM files f
            WHERE ia.photo_path = f.stored_filename
              AND ia.photo_file_id IS NULL
              AND ia.photo_path IS NOT NULL
        '''))
        db.session.commit()
        print('Backfilled photo_file_id from files table')
    except Exception:
        db.session.rollback()
        print('photo_file_id backfill skipped or already done')
"

echo "Starting gunicorn..."
exec gunicorn -c gunicorn.conf.py "app:create_app('production')"
