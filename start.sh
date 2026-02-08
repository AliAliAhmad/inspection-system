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

    # Add missing columns to specialist_jobs
    specialist_job_cols = [
        ('wrong_finding_reason', 'TEXT'),
        ('wrong_finding_photo', 'VARCHAR(500)'),
        ('incomplete_notes', 'TEXT'),
        ('incomplete_at', 'TIMESTAMP'),
        ('incomplete_acknowledged_by', 'INTEGER REFERENCES users(id)'),
        ('incomplete_acknowledged_at', 'TIMESTAMP'),
    ]
    for col_name, col_type in specialist_job_cols:
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

    # Drop unique constraint/index on specialist_jobs.defect_id to allow multiple specialists per defect
    try:
        # First try to find and drop a unique constraint
        result = db.session.execute(text('''
            SELECT con.conname
            FROM pg_catalog.pg_constraint con
            JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
            JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
            WHERE rel.relname = 'specialist_jobs'
              AND att.attname = 'defect_id'
              AND con.contype = 'u'
        '''))
        row = result.fetchone()
        if row:
            constraint_name = row[0]
            db.session.execute(text(f'ALTER TABLE specialist_jobs DROP CONSTRAINT {constraint_name}'))
            db.session.commit()
            print(f'Dropped unique constraint {constraint_name} from specialist_jobs.defect_id')
        else:
            print('No unique constraint found on specialist_jobs.defect_id')
    except Exception as e:
        db.session.rollback()
        print(f'specialist_jobs.defect_id constraint drop skipped: {e}')

    # Create role_swap_logs table if not exists
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS role_swap_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                admin_id INTEGER NOT NULL REFERENCES users(id),
                old_role VARCHAR(50) NOT NULL,
                old_role_id VARCHAR(20) NOT NULL,
                old_minor_role VARCHAR(50),
                old_minor_role_id VARCHAR(20),
                new_role VARCHAR(50) NOT NULL,
                new_role_id VARCHAR(20) NOT NULL,
                new_minor_role VARCHAR(50),
                new_minor_role_id VARCHAR(20),
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            )
        '''))
        db.session.commit()
        print('Created role_swap_logs table')
    except Exception:
        db.session.rollback()
        print('role_swap_logs table already exists')

    # Add missing columns to leaves table
    leave_cols = [
        ('scope', \"VARCHAR(20) DEFAULT 'major_only'\"),
        ('coverage_user_id', 'INTEGER REFERENCES users(id)'),
        ('other_reason', 'TEXT'),
        ('rejection_reason', 'TEXT'),
    ]
    for col_name, col_type in leave_cols:
        try:
            db.session.execute(text(f'ALTER TABLE leaves ADD COLUMN {col_name} {col_type}'))
            db.session.commit()
            print(f'Added {col_name} column to leaves')
        except Exception:
            db.session.rollback()
            print(f'leaves.{col_name} already exists')

    # Reset password for sara@company.com
    try:
        from werkzeug.security import generate_password_hash
        new_hash = generate_password_hash('sara123')
        db.session.execute(text(\"UPDATE users SET password_hash = :hash WHERE email = 'sara@company.com'\"), {'hash': new_hash})
        db.session.commit()
        print('Reset password for sara@company.com')
    except Exception as e:
        db.session.rollback()
        print(f'Password reset skipped: {e}')

    # Also try to find and drop any unique index on defect_id
    try:
        result = db.session.execute(text('''
            SELECT i.relname as index_name
            FROM pg_class t
            JOIN pg_index ix ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            WHERE t.relname = 'specialist_jobs'
              AND a.attname = 'defect_id'
              AND ix.indisunique = true
              AND NOT ix.indisprimary
        '''))
        for row in result.fetchall():
            index_name = row[0]
            db.session.execute(text(f'DROP INDEX IF EXISTS {index_name}'))
            db.session.commit()
            print(f'Dropped unique index {index_name} from specialist_jobs')
    except Exception as e:
        db.session.rollback()
        print(f'specialist_jobs.defect_id index drop skipped: {e}')

    # Add new columns to checklist_items for import feature
    checklist_item_cols = [
        ('item_code', 'VARCHAR(20)'),
        ('action', 'TEXT'),
        ('action_ar', 'TEXT'),
        ('numeric_rule', 'VARCHAR(20)'),
        ('min_value', 'FLOAT'),
        ('max_value', 'FLOAT'),
    ]
    for col_name, col_type in checklist_item_cols:
        try:
            db.session.execute(text(f'ALTER TABLE checklist_items ADD COLUMN {col_name} {col_type}'))
            db.session.commit()
            print(f'Added {col_name} column to checklist_items')
        except Exception:
            db.session.rollback()
            print(f'checklist_items.{col_name} already exists')

    # Update berth constraints to include 'both' option
    try:
        db.session.execute(text('ALTER TABLE equipment DROP CONSTRAINT IF EXISTS check_valid_berth'))
        db.session.execute(text(\"\"\"ALTER TABLE equipment ADD CONSTRAINT check_valid_berth CHECK (berth IN ('east', 'west', 'both') OR berth IS NULL)\"\"\"))
        db.session.commit()
        print('Updated berth constraint to include both')
    except Exception:
        db.session.rollback()
        print('berth constraint already up to date')

    try:
        db.session.execute(text('ALTER TABLE equipment DROP CONSTRAINT IF EXISTS check_valid_home_berth'))
        db.session.execute(text(\"\"\"ALTER TABLE equipment ADD CONSTRAINT check_valid_home_berth CHECK (home_berth IN ('east', 'west', 'both') OR home_berth IS NULL)\"\"\"))
        db.session.commit()
        print('Updated home_berth constraint to include both')
    except Exception:
        db.session.rollback()
        print('home_berth constraint already up to date')

    # Update user role constraints to include 'maintenance'
    try:
        db.session.execute(text('ALTER TABLE users DROP CONSTRAINT IF EXISTS check_valid_role'))
        db.session.execute(text(\"\"\"ALTER TABLE users ADD CONSTRAINT check_valid_role CHECK (role IN ('admin', 'inspector', 'specialist', 'engineer', 'quality_engineer', 'maintenance'))\"\"\"))
        db.session.commit()
        print('Updated role constraint to include maintenance')
    except Exception:
        db.session.rollback()
        print('role constraint already up to date')

    try:
        db.session.execute(text('ALTER TABLE users DROP CONSTRAINT IF EXISTS check_valid_minor_role'))
        db.session.execute(text(\"\"\"ALTER TABLE users ADD CONSTRAINT check_valid_minor_role CHECK (minor_role IN ('inspector', 'specialist', 'engineer', 'quality_engineer', 'maintenance') OR minor_role IS NULL)\"\"\"))
        db.session.commit()
        print('Updated minor_role constraint to include maintenance')
    except Exception:
        db.session.rollback()
        print('minor_role constraint already up to date')

    # Update specialization constraint to include 'hvac'
    try:
        db.session.execute(text('ALTER TABLE users DROP CONSTRAINT IF EXISTS check_valid_specialization'))
        db.session.execute(text(\"\"\"ALTER TABLE users ADD CONSTRAINT check_valid_specialization CHECK (specialization IN ('mechanical', 'electrical', 'hvac') OR specialization IS NULL)\"\"\"))
        db.session.commit()
        print('Updated specialization constraint to include hvac')
    except Exception:
        db.session.rollback()
        print('specialization constraint already up to date')

    # Add new columns to equipment for dashboard
    equipment_dashboard_cols = [
        ('stopped_at', 'TIMESTAMP'),
        ('current_reason', 'TEXT'),
        ('current_next_action', 'TEXT'),
    ]
    for col_name, col_type in equipment_dashboard_cols:
        try:
            db.session.execute(text(f'ALTER TABLE equipment ADD COLUMN {col_name} {col_type}'))
            db.session.commit()
            print(f'Added {col_name} column to equipment')
        except Exception:
            db.session.rollback()
            print(f'equipment.{col_name} already exists')

    # Create equipment_status_logs table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS equipment_status_logs (
                id SERIAL PRIMARY KEY,
                equipment_id INTEGER NOT NULL REFERENCES equipment(id),
                old_status VARCHAR(30),
                new_status VARCHAR(30) NOT NULL,
                reason TEXT NOT NULL,
                next_action TEXT NOT NULL,
                source_type VARCHAR(20) NOT NULL DEFAULT 'manual',
                source_id INTEGER,
                changed_by_id INTEGER NOT NULL REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            )
        '''))
        db.session.commit()
        print('Created equipment_status_logs table')
    except Exception:
        db.session.rollback()
        print('equipment_status_logs table already exists')

    # ========== WORK PLANNING TABLES ==========

    # Create materials table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS materials (
                id SERIAL PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                name_ar VARCHAR(255),
                category VARCHAR(50) NOT NULL,
                unit VARCHAR(20) NOT NULL,
                current_stock FLOAT DEFAULT 0 NOT NULL,
                min_stock FLOAT DEFAULT 0 NOT NULL,
                total_consumed FLOAT DEFAULT 0 NOT NULL,
                consumption_start_date DATE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
                CONSTRAINT check_material_category CHECK (category IN ('lubricant', 'filter', 'spare_part', 'consumable', 'electrical', 'mechanical', 'hvac', 'other'))
            )
        '''))
        db.session.commit()
        print('Created materials table')
    except Exception:
        db.session.rollback()
        print('materials table already exists')

    # Create material_kits table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS material_kits (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                name_ar VARCHAR(255),
                description TEXT,
                equipment_type VARCHAR(100),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW() NOT NULL
            )
        '''))
        db.session.commit()
        print('Created material_kits table')
    except Exception:
        db.session.rollback()
        print('material_kits table already exists')

    # Create material_kit_items table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS material_kit_items (
                id SERIAL PRIMARY KEY,
                kit_id INTEGER NOT NULL REFERENCES material_kits(id) ON DELETE CASCADE,
                material_id INTEGER NOT NULL REFERENCES materials(id),
                quantity FLOAT NOT NULL DEFAULT 1
            )
        '''))
        db.session.commit()
        print('Created material_kit_items table')
    except Exception:
        db.session.rollback()
        print('material_kit_items table already exists')

    # Create work_plans table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS work_plans (
                id SERIAL PRIMARY KEY,
                week_start DATE NOT NULL UNIQUE,
                week_end DATE NOT NULL,
                status VARCHAR(20) DEFAULT 'draft' NOT NULL,
                created_by_id INTEGER NOT NULL REFERENCES users(id),
                published_at TIMESTAMP,
                published_by_id INTEGER REFERENCES users(id),
                pdf_file_id INTEGER REFERENCES files(id),
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
                CONSTRAINT check_work_plan_status CHECK (status IN ('draft', 'published'))
            )
        '''))
        db.session.commit()
        print('Created work_plans table')
    except Exception:
        db.session.rollback()
        print('work_plans table already exists')

    # Create work_plan_days table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS work_plan_days (
                id SERIAL PRIMARY KEY,
                work_plan_id INTEGER NOT NULL REFERENCES work_plans(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
                UNIQUE(work_plan_id, date)
            )
        '''))
        db.session.commit()
        print('Created work_plan_days table')
    except Exception:
        db.session.rollback()
        print('work_plan_days table already exists')

    # Create work_plan_jobs table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS work_plan_jobs (
                id SERIAL PRIMARY KEY,
                work_plan_day_id INTEGER NOT NULL REFERENCES work_plan_days(id) ON DELETE CASCADE,
                job_type VARCHAR(20) NOT NULL,
                berth VARCHAR(10),
                equipment_id INTEGER REFERENCES equipment(id),
                defect_id INTEGER REFERENCES defects(id),
                inspection_assignment_id INTEGER REFERENCES inspection_assignments(id),
                sap_order_number VARCHAR(50),
                estimated_hours FLOAT NOT NULL,
                position INTEGER DEFAULT 0,
                priority VARCHAR(20) DEFAULT 'normal',
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
                CONSTRAINT check_job_type CHECK (job_type IN ('pm', 'defect', 'inspection')),
                CONSTRAINT check_job_berth CHECK (berth IN ('east', 'west', 'both') OR berth IS NULL),
                CONSTRAINT check_job_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
            )
        '''))
        db.session.commit()
        print('Created work_plan_jobs table')
    except Exception:
        db.session.rollback()
        print('work_plan_jobs table already exists')

    # Create work_plan_assignments table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS work_plan_assignments (
                id SERIAL PRIMARY KEY,
                work_plan_job_id INTEGER NOT NULL REFERENCES work_plan_jobs(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id),
                is_lead BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                UNIQUE(work_plan_job_id, user_id)
            )
        '''))
        db.session.commit()
        print('Created work_plan_assignments table')
    except Exception:
        db.session.rollback()
        print('work_plan_assignments table already exists')

    # Create work_plan_materials table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS work_plan_materials (
                id SERIAL PRIMARY KEY,
                work_plan_job_id INTEGER NOT NULL REFERENCES work_plan_jobs(id) ON DELETE CASCADE,
                material_id INTEGER NOT NULL REFERENCES materials(id),
                quantity FLOAT NOT NULL DEFAULT 1,
                from_kit_id INTEGER REFERENCES material_kits(id),
                actual_quantity FLOAT,
                consumed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            )
        '''))
        db.session.commit()
        print('Created work_plan_materials table')
    except Exception:
        db.session.rollback()
        print('work_plan_materials table already exists')

    # Create maintenance_cycles table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS maintenance_cycles (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                name_ar VARCHAR(100),
                cycle_type VARCHAR(20) NOT NULL,
                hours_value INTEGER,
                calendar_value INTEGER,
                calendar_unit VARCHAR(20),
                display_label VARCHAR(50),
                is_active BOOLEAN DEFAULT TRUE,
                is_system BOOLEAN DEFAULT TRUE,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                CONSTRAINT check_cycle_type CHECK (cycle_type IN ('running_hours', 'calendar'))
            )
        '''))
        db.session.commit()
        print('Created maintenance_cycles table')
    except Exception:
        db.session.rollback()
        print('maintenance_cycles table already exists')

    # Create pm_templates table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS pm_templates (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                name_ar VARCHAR(255),
                description TEXT,
                equipment_type VARCHAR(100),
                cycle_id INTEGER REFERENCES maintenance_cycles(id),
                is_active BOOLEAN DEFAULT TRUE,
                created_by_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW() NOT NULL
            )
        '''))
        db.session.commit()
        print('Created pm_templates table')
    except Exception:
        db.session.rollback()
        print('pm_templates table already exists')

    # Create pm_template_checklist_items table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS pm_template_checklist_items (
                id SERIAL PRIMARY KEY,
                template_id INTEGER NOT NULL REFERENCES pm_templates(id) ON DELETE CASCADE,
                item_code VARCHAR(20),
                question_text TEXT NOT NULL,
                question_text_ar TEXT,
                answer_type VARCHAR(20) DEFAULT 'pass_fail',
                category VARCHAR(50),
                is_required BOOLEAN DEFAULT TRUE,
                order_index INTEGER DEFAULT 0,
                action TEXT,
                action_ar TEXT
            )
        '''))
        db.session.commit()
        print('Created pm_template_checklist_items table')
    except Exception:
        db.session.rollback()
        print('pm_template_checklist_items table already exists')

    # Create pm_template_materials table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS pm_template_materials (
                id SERIAL PRIMARY KEY,
                template_id INTEGER NOT NULL REFERENCES pm_templates(id) ON DELETE CASCADE,
                material_id INTEGER NOT NULL REFERENCES materials(id),
                quantity FLOAT NOT NULL DEFAULT 1
            )
        '''))
        db.session.commit()
        print('Created pm_template_materials table')
    except Exception:
        db.session.rollback()
        print('pm_template_materials table already exists')

    # Add missing columns to work_plan_jobs table
    work_plan_job_cols = [
        ('sap_order_type', 'VARCHAR(20)'),
        ('description', 'TEXT'),
        ('cycle_id', 'INTEGER'),
        ('pm_template_id', 'INTEGER'),
        ('overdue_value', 'FLOAT'),
        ('overdue_unit', 'VARCHAR(10)'),
        ('maintenance_base', 'VARCHAR(100)'),
        ('planned_date', 'DATE'),
        ('start_time', 'TIME'),
        ('end_time', 'TIME'),
    ]
    for col_name, col_type in work_plan_job_cols:
        try:
            db.session.execute(text(f'ALTER TABLE work_plan_jobs ADD COLUMN {col_name} {col_type}'))
            db.session.commit()
            print(f'Added {col_name} column to work_plan_jobs')
        except Exception:
            db.session.rollback()
            print(f'work_plan_jobs.{col_name} already exists')
"

echo "Starting gunicorn..."
exec gunicorn -c gunicorn.conf.py "app:create_app('production')"
