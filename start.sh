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

    # Add missing columns to users table
    user_cols = [
        ('sap_id', 'VARCHAR(6) UNIQUE'),
        ('username', 'VARCHAR(100) UNIQUE'),
        ('must_change_password', 'BOOLEAN DEFAULT FALSE NOT NULL'),
        ('created_by_id', 'INTEGER REFERENCES users(id)'),
        ('expo_push_token', 'VARCHAR(255)'),
        ('annual_leave_balance', 'INTEGER DEFAULT 24 NOT NULL'),
    ]
    for col_name, col_type in user_cols:
        try:
            db.session.execute(text(f'ALTER TABLE users ADD COLUMN {col_name} {col_type}'))
            db.session.commit()
            print(f'Added {col_name} column to users')
        except Exception:
            db.session.rollback()
            print(f'users.{col_name} already exists')

    # Make users.email nullable (model allows login by username)
    try:
        db.session.execute(text('ALTER TABLE users ALTER COLUMN email DROP NOT NULL'))
        db.session.commit()
        print('Made users.email nullable')
    except Exception:
        db.session.rollback()
        print('users.email already nullable')

    # Add username index if missing
    try:
        db.session.execute(text('CREATE INDEX IF NOT EXISTS ix_users_username ON users (username)'))
        db.session.commit()
        print('Added username index')
    except Exception:
        db.session.rollback()
        print('username index already exists')

    # Add sap_id index if missing
    try:
        db.session.execute(text('CREATE INDEX IF NOT EXISTS ix_users_sap_id ON users (sap_id)'))
        db.session.commit()
        print('Added sap_id index')
    except Exception:
        db.session.rollback()
        print('sap_id index already exists')

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

    # Create sap_work_orders table for staging imported SAP orders
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS sap_work_orders (
                id SERIAL PRIMARY KEY,
                work_plan_id INTEGER NOT NULL REFERENCES work_plans(id) ON DELETE CASCADE,
                order_number VARCHAR(50) NOT NULL,
                order_type VARCHAR(20) NOT NULL,
                job_type VARCHAR(20) NOT NULL,
                equipment_id INTEGER NOT NULL REFERENCES equipment(id),
                description TEXT,
                estimated_hours FLOAT DEFAULT 4.0,
                priority VARCHAR(20) DEFAULT 'normal',
                berth VARCHAR(10),
                cycle_id INTEGER,
                maintenance_base VARCHAR(100),
                required_date DATE,
                planned_date DATE,
                overdue_value FLOAT,
                overdue_unit VARCHAR(10),
                notes TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                UNIQUE(work_plan_id, order_number),
                CONSTRAINT check_sap_job_type CHECK (job_type IN ('pm', 'defect', 'inspection')),
                CONSTRAINT check_sap_order_status CHECK (status IN ('pending', 'scheduled'))
            )
        '''))
        db.session.commit()
        print('Created sap_work_orders table')
    except Exception:
        db.session.rollback()
        print('sap_work_orders table already exists')

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
        ('actual_start_time', 'TIME'),
        ('actual_end_time', 'TIME'),
        ('template_id', 'INTEGER REFERENCES job_templates(id)'),
        ('checklist_required', 'BOOLEAN DEFAULT FALSE'),
        ('checklist_completed', 'BOOLEAN DEFAULT FALSE'),
        ('completion_photo_required', 'BOOLEAN DEFAULT FALSE'),
        ('weather_sensitive', 'BOOLEAN DEFAULT FALSE'),
        ('is_split', 'BOOLEAN DEFAULT FALSE'),
        ('split_from_id', 'INTEGER REFERENCES work_plan_jobs(id)'),
        ('split_part', 'INTEGER'),
    ]
    for col_name, col_type in work_plan_job_cols:
        try:
            db.session.execute(text(f'ALTER TABLE work_plan_jobs ADD COLUMN {col_name} {col_type}'))
            db.session.commit()
            print(f'Added {col_name} column to work_plan_jobs')
        except Exception:
            db.session.rollback()
            print(f'work_plan_jobs.{col_name} already exists')

    # ========== AUTH-CRITICAL: token_blocklist ==========
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS token_blocklist (
                id SERIAL PRIMARY KEY,
                jti VARCHAR(36) UNIQUE NOT NULL,
                token_type VARCHAR(10) NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id),
                revoked_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP NOT NULL
            )
        '''))
        db.session.commit()
        print('Created token_blocklist table')
    except Exception:
        db.session.rollback()
        print('token_blocklist table already exists')

    # ========== CRITICAL MISSING TABLES ==========

    # Translations table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS translations (
                id SERIAL PRIMARY KEY,
                model_type VARCHAR(50) NOT NULL,
                model_id INTEGER NOT NULL,
                field_name VARCHAR(50) NOT NULL,
                original_lang VARCHAR(2) DEFAULT 'en',
                translated_text TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created translations table')
    except Exception:
        db.session.rollback()
        print('translations table already exists')

    # Import logs table
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS import_logs (
                id SERIAL PRIMARY KEY,
                import_type VARCHAR(20) NOT NULL,
                admin_id INTEGER REFERENCES users(id),
                file_name VARCHAR(255),
                total_rows INTEGER DEFAULT 0,
                created_count INTEGER DEFAULT 0,
                updated_count INTEGER DEFAULT 0,
                failed_count INTEGER DEFAULT 0,
                details TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created import_logs table')
    except Exception:
        db.session.rollback()
        print('import_logs table already exists')

    # Team communication tables
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS team_channels (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                channel_type VARCHAR(30) DEFAULT 'general',
                shift VARCHAR(20),
                role_filter VARCHAR(30),
                job_id INTEGER,
                is_active BOOLEAN DEFAULT TRUE,
                is_default BOOLEAN DEFAULT FALSE,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created team_channels table')
    except Exception:
        db.session.rollback()
        print('team_channels table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS channel_members (
                id SERIAL PRIMARY KEY,
                channel_id INTEGER NOT NULL REFERENCES team_channels(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id),
                role VARCHAR(20) DEFAULT 'member',
                is_muted BOOLEAN DEFAULT FALSE,
                last_read_at TIMESTAMP,
                joined_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(channel_id, user_id)
            )
        '''))
        db.session.commit()
        print('Created channel_members table')
    except Exception:
        db.session.rollback()
        print('channel_members table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS team_messages (
                id SERIAL PRIMARY KEY,
                channel_id INTEGER NOT NULL REFERENCES team_channels(id) ON DELETE CASCADE,
                sender_id INTEGER NOT NULL REFERENCES users(id),
                message_type VARCHAR(20) DEFAULT 'text',
                content TEXT,
                media_url VARCHAR(500),
                media_thumbnail VARCHAR(500),
                duration_seconds INTEGER,
                location_lat FLOAT,
                location_lng FLOAT,
                location_label VARCHAR(200),
                is_priority BOOLEAN DEFAULT FALSE,
                is_translated BOOLEAN DEFAULT FALSE,
                original_language VARCHAR(5),
                translated_content TEXT,
                reply_to_id INTEGER REFERENCES team_messages(id),
                is_deleted BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created team_messages table')
    except Exception:
        db.session.rollback()
        print('team_messages table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS message_read_receipts (
                id SERIAL PRIMARY KEY,
                message_id INTEGER NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id),
                read_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(message_id, user_id)
            )
        '''))
        db.session.commit()
        print('Created message_read_receipts table')
    except Exception:
        db.session.rollback()
        print('message_read_receipts table already exists')

    # Shift handover
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS shift_handovers (
                id SERIAL PRIMARY KEY,
                shift_date DATE NOT NULL,
                shift_type VARCHAR(10) NOT NULL,
                outgoing_user_id INTEGER NOT NULL REFERENCES users(id),
                notes TEXT,
                pending_items JSON,
                safety_alerts JSON,
                equipment_issues JSON,
                voice_file_id INTEGER REFERENCES files(id),
                voice_transcription JSON,
                acknowledged_by_id INTEGER REFERENCES users(id),
                acknowledged_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created shift_handovers table')
    except Exception:
        db.session.rollback()
        print('shift_handovers table already exists')

    # Monitor followups
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS monitor_followups (
                id SERIAL PRIMARY KEY,
                assessment_id INTEGER REFERENCES final_assessments(id),
                equipment_id INTEGER REFERENCES equipment(id),
                parent_followup_id INTEGER REFERENCES monitor_followups(id),
                followup_date DATE,
                followup_type VARCHAR(30) DEFAULT 'scheduled',
                location VARCHAR(20),
                shift VARCHAR(20),
                mechanical_inspector_id INTEGER REFERENCES users(id),
                electrical_inspector_id INTEGER REFERENCES users(id),
                scheduled_by INTEGER REFERENCES users(id),
                scheduled_by_role VARCHAR(20),
                notes TEXT,
                inspection_assignment_id INTEGER REFERENCES inspection_assignments(id),
                status VARCHAR(30) DEFAULT 'scheduled',
                result_verdict VARCHAR(20),
                result_assessment_id INTEGER REFERENCES final_assessments(id),
                is_overdue BOOLEAN DEFAULT FALSE,
                overdue_since TIMESTAMP,
                overdue_notifications_sent INTEGER DEFAULT 0,
                last_notification_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                completed_at TIMESTAMP
            )
        '''))
        db.session.commit()
        print('Created monitor_followups table')
    except Exception:
        db.session.rollback()
        print('monitor_followups table already exists')

    # Unplanned jobs
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS unplanned_jobs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                equipment_name VARCHAR(255),
                description TEXT,
                work_done TEXT,
                job_type VARCHAR(30) DEFAULT 'repair',
                requested_by VARCHAR(255),
                voice_note_url VARCHAR(500),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created unplanned_jobs table')
    except Exception:
        db.session.rollback()
        print('unplanned_jobs table already exists')

    # Quick report fields on defects
    defect_cols = [
        ('reported_by_id', 'INTEGER REFERENCES users(id)'),
        ('report_source', 'VARCHAR(30)'),
        ('voice_note_url', 'VARCHAR(500)'),
        ('photo_url', 'VARCHAR(500)'),
        ('location_description', 'TEXT'),
        ('hazard_type', 'VARCHAR(30)'),
    ]
    for col_name, col_type in defect_cols:
        try:
            db.session.execute(text(f'ALTER TABLE defects ADD COLUMN {col_name} {col_type}'))
            db.session.commit()
            print(f'Added {col_name} column to defects')
        except Exception:
            db.session.rollback()
            print(f'defects.{col_name} already exists')

    # Urgency level on inspection_answers
    try:
        db.session.execute(text('ALTER TABLE inspection_answers ADD COLUMN urgency_level VARCHAR(20)'))
        db.session.commit()
        print('Added urgency_level to inspection_answers')
    except Exception:
        db.session.rollback()
        print('inspection_answers.urgency_level already exists')

    # Multi-layer assessment columns on final_assessments
    assessment_cols = [
        ('system_verdict', 'VARCHAR(20)'),
        ('system_urgency_score', 'INTEGER'),
        ('system_has_critical', 'BOOLEAN DEFAULT FALSE'),
        ('system_has_fail_urgency', 'BOOLEAN DEFAULT FALSE'),
        ('engineer_id', 'INTEGER REFERENCES users(id)'),
        ('engineer_verdict', 'VARCHAR(20)'),
        ('engineer_notes', 'TEXT'),
        ('engineer_reviewed_at', 'TIMESTAMP'),
        ('escalation_level', \"VARCHAR(20) DEFAULT 'none'\"),
        ('escalation_reason', 'TEXT'),
        ('monitor_reason', 'TEXT'),
        ('stop_reason', 'TEXT'),
        ('assessment_version', 'INTEGER DEFAULT 1'),
    ]
    for col_name, col_type in assessment_cols:
        try:
            db.session.execute(text(f'ALTER TABLE final_assessments ADD COLUMN {col_name} {col_type}'))
            db.session.commit()
            print(f'Added {col_name} to final_assessments')
        except Exception:
            db.session.rollback()
            print(f'final_assessments.{col_name} already exists')

    # Gamification tables
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                snapshot_date DATE NOT NULL,
                period_type VARCHAR(20) NOT NULL,
                rank INTEGER NOT NULL,
                points INTEGER DEFAULT 0,
                role VARCHAR(50),
                UNIQUE(user_id, snapshot_date, period_type)
            )
        '''))
        db.session.commit()
        print('Created leaderboard_snapshots table')
    except Exception:
        db.session.rollback()
        print('leaderboard_snapshots table already exists')

    # Admin activity logs
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS admin_activity_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                action VARCHAR(50) NOT NULL,
                entity_type VARCHAR(50),
                entity_id INTEGER,
                entity_name VARCHAR(200),
                details JSON,
                ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created admin_activity_logs table')
    except Exception:
        db.session.rollback()
        print('admin_activity_logs table already exists')

    # Running hours tables
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS running_hours_readings (
                id SERIAL PRIMARY KEY,
                equipment_id INTEGER NOT NULL REFERENCES equipment(id),
                hours FLOAT NOT NULL,
                recorded_at TIMESTAMP DEFAULT NOW(),
                recorded_by_id INTEGER REFERENCES users(id),
                notes TEXT,
                source VARCHAR(20) DEFAULT 'manual'
            )
        '''))
        db.session.commit()
        print('Created running_hours_readings table')
    except Exception:
        db.session.rollback()
        print('running_hours_readings table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS service_intervals (
                id SERIAL PRIMARY KEY,
                equipment_id INTEGER UNIQUE NOT NULL REFERENCES equipment(id),
                service_interval_hours FLOAT,
                alert_threshold_hours FLOAT,
                last_service_date TIMESTAMP,
                last_service_hours FLOAT,
                next_service_hours FLOAT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created service_intervals table')
    except Exception:
        db.session.rollback()
        print('service_intervals table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS running_hours_alerts (
                id SERIAL PRIMARY KEY,
                equipment_id INTEGER NOT NULL REFERENCES equipment(id),
                alert_type VARCHAR(30) NOT NULL,
                severity VARCHAR(10) DEFAULT 'warning',
                message TEXT,
                hours_value FLOAT,
                threshold_value FLOAT,
                created_at TIMESTAMP DEFAULT NOW(),
                acknowledged_at TIMESTAMP,
                acknowledged_by_id INTEGER REFERENCES users(id)
            )
        '''))
        db.session.commit()
        print('Created running_hours_alerts table')
    except Exception:
        db.session.rollback()
        print('running_hours_alerts table already exists')

    # Answer templates
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS answer_templates (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                name VARCHAR(100) NOT NULL,
                name_ar VARCHAR(100),
                category VARCHAR(50),
                content JSON,
                is_favorite BOOLEAN DEFAULT FALSE,
                usage_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created answer_templates table')
    except Exception:
        db.session.rollback()
        print('answer_templates table already exists')

    # Job show-up photos, challenge voices, review marks
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS job_showup_photos (
                id SERIAL PRIMARY KEY,
                job_type VARCHAR(20) NOT NULL,
                job_id INTEGER NOT NULL,
                file_id INTEGER REFERENCES files(id),
                uploaded_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created job_showup_photos table')
    except Exception:
        db.session.rollback()
        print('job_showup_photos table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS job_challenge_voices (
                id SERIAL PRIMARY KEY,
                job_type VARCHAR(20) NOT NULL,
                job_id INTEGER NOT NULL,
                file_id INTEGER REFERENCES files(id),
                transcription_en TEXT,
                transcription_ar TEXT,
                duration_seconds INTEGER,
                recorded_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created job_challenge_voices table')
    except Exception:
        db.session.rollback()
        print('job_challenge_voices table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS job_review_marks (
                id SERIAL PRIMARY KEY,
                job_type VARCHAR(20) NOT NULL,
                job_id INTEGER NOT NULL,
                mark_type VARCHAR(10) NOT NULL,
                note TEXT,
                marked_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created job_review_marks table')
    except Exception:
        db.session.rollback()
        print('job_review_marks table already exists')

    # ========== NOTIFICATION SYSTEM (7 tables) ==========
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS notification_groups (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                group_key VARCHAR(200) NOT NULL,
                group_type VARCHAR(50) NOT NULL,
                notification_ids JSON,
                summary_title VARCHAR(500) NOT NULL,
                summary_title_ar VARCHAR(500),
                summary_message TEXT,
                summary_message_ar TEXT,
                is_expanded BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created notification_groups table')
    except Exception:
        db.session.rollback()
        print('notification_groups table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS notification_preferences (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                notification_type VARCHAR(100) NOT NULL,
                channels JSON,
                is_enabled BOOLEAN DEFAULT TRUE,
                sound_type VARCHAR(20) DEFAULT 'default',
                do_not_disturb_start TIME,
                do_not_disturb_end TIME,
                digest_mode VARCHAR(20) DEFAULT 'instant',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, notification_type)
            )
        '''))
        db.session.commit()
        print('Created notification_preferences table')
    except Exception:
        db.session.rollback()
        print('notification_preferences table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS notification_schedules (
                id SERIAL PRIMARY KEY,
                notification_id INTEGER NOT NULL REFERENCES notifications(id),
                scheduled_for TIMESTAMP,
                snooze_until TIMESTAMP,
                is_delivered BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created notification_schedules table')
    except Exception:
        db.session.rollback()
        print('notification_schedules table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS notification_escalations (
                id SERIAL PRIMARY KEY,
                notification_id INTEGER NOT NULL REFERENCES notifications(id),
                escalation_level INTEGER DEFAULT 1,
                escalated_to_user_id INTEGER NOT NULL REFERENCES users(id),
                escalated_at TIMESTAMP DEFAULT NOW(),
                acknowledged_at TIMESTAMP,
                escalation_reason VARCHAR(50)
            )
        '''))
        db.session.commit()
        print('Created notification_escalations table')
    except Exception:
        db.session.rollback()
        print('notification_escalations table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS notification_rules (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                name_ar VARCHAR(200),
                trigger_type VARCHAR(50) NOT NULL,
                trigger_config JSON,
                action_config JSON,
                target_users JSON,
                is_active BOOLEAN DEFAULT TRUE,
                created_by_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created notification_rules table')
    except Exception:
        db.session.rollback()
        print('notification_rules table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS notification_analytics (
                id SERIAL PRIMARY KEY,
                notification_id INTEGER NOT NULL REFERENCES notifications(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                delivered_at TIMESTAMP DEFAULT NOW(),
                read_at TIMESTAMP,
                clicked_at TIMESTAMP,
                action_taken VARCHAR(50),
                action_taken_at TIMESTAMP,
                response_time_seconds INTEGER,
                channel VARCHAR(20)
            )
        '''))
        db.session.commit()
        print('Created notification_analytics table')
    except Exception:
        db.session.rollback()
        print('notification_analytics table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS notification_templates (
                id SERIAL PRIMARY KEY,
                notification_type VARCHAR(100) UNIQUE NOT NULL,
                title_template VARCHAR(500) NOT NULL,
                title_template_ar VARCHAR(500),
                message_template TEXT NOT NULL,
                message_template_ar TEXT,
                default_priority VARCHAR(20) DEFAULT 'info',
                default_channels JSON,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created notification_templates table')
    except Exception:
        db.session.rollback()
        print('notification_templates table already exists')

    # ========== GAMIFICATION (8 tables) ==========
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS achievements (
                id SERIAL PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                name_ar VARCHAR(100),
                description TEXT,
                description_ar TEXT,
                icon VARCHAR(50),
                category VARCHAR(50),
                points_reward INTEGER DEFAULT 0,
                criteria_type VARCHAR(50),
                criteria_target INTEGER,
                criteria_field VARCHAR(100),
                tier VARCHAR(20) DEFAULT 'bronze',
                is_active BOOLEAN DEFAULT TRUE,
                is_hidden BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created achievements table')
    except Exception:
        db.session.rollback()
        print('achievements table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS user_achievements (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                achievement_id INTEGER NOT NULL REFERENCES achievements(id),
                earned_at TIMESTAMP DEFAULT NOW(),
                progress INTEGER DEFAULT 0,
                is_notified BOOLEAN DEFAULT FALSE,
                UNIQUE(user_id, achievement_id)
            )
        '''))
        db.session.commit()
        print('Created user_achievements table')
    except Exception:
        db.session.rollback()
        print('user_achievements table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS user_streaks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
                current_streak INTEGER DEFAULT 0,
                longest_streak INTEGER DEFAULT 0,
                last_activity_date DATE,
                streak_start_date DATE,
                total_active_days INTEGER DEFAULT 0
            )
        '''))
        db.session.commit()
        print('Created user_streaks table')
    except Exception:
        db.session.rollback()
        print('user_streaks table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS challenges (
                id SERIAL PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                name_ar VARCHAR(100),
                description TEXT,
                description_ar TEXT,
                challenge_type VARCHAR(20),
                target_type VARCHAR(50),
                target_value INTEGER NOT NULL,
                points_reward INTEGER DEFAULT 100,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_by_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW(),
                eligible_roles JSON
            )
        '''))
        db.session.commit()
        print('Created challenges table')
    except Exception:
        db.session.rollback()
        print('challenges table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS user_challenges (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                challenge_id INTEGER NOT NULL REFERENCES challenges(id),
                progress INTEGER DEFAULT 0,
                is_completed BOOLEAN DEFAULT FALSE,
                completed_at TIMESTAMP,
                joined_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, challenge_id)
            )
        '''))
        db.session.commit()
        print('Created user_challenges table')
    except Exception:
        db.session.rollback()
        print('user_challenges table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS user_levels (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
                level INTEGER DEFAULT 1,
                current_xp INTEGER DEFAULT 0,
                total_xp INTEGER DEFAULT 0,
                tier VARCHAR(20) DEFAULT 'bronze',
                total_points INTEGER DEFAULT 0,
                inspections_count INTEGER DEFAULT 0,
                jobs_count INTEGER DEFAULT 0,
                defects_found INTEGER DEFAULT 0,
                avg_rating FLOAT DEFAULT 0.0,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created user_levels table')
    except Exception:
        db.session.rollback()
        print('user_levels table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS point_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                points INTEGER NOT NULL,
                reason VARCHAR(100) NOT NULL,
                reason_ar VARCHAR(100),
                source_type VARCHAR(50),
                source_id INTEGER,
                multiplier FLOAT DEFAULT 1.0,
                base_points INTEGER,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created point_history table')
    except Exception:
        db.session.rollback()
        print('point_history table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS performance_goals (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                goal_type VARCHAR(50) NOT NULL,
                target_value FLOAT NOT NULL,
                current_value FLOAT DEFAULT 0,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                completed_at TIMESTAMP
            )
        '''))
        db.session.commit()
        print('Created performance_goals table')
    except Exception:
        db.session.rollback()
        print('performance_goals table already exists')

    # ========== LEAVE MANAGEMENT ENHANCEMENT (8 tables) ==========
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS leave_types (
                id SERIAL PRIMARY KEY,
                code VARCHAR(20) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                name_ar VARCHAR(100),
                description TEXT,
                color VARCHAR(7) DEFAULT '#1976D2',
                icon VARCHAR(50),
                requires_certificate BOOLEAN DEFAULT FALSE,
                certificate_after_days INTEGER DEFAULT 3,
                max_consecutive_days INTEGER,
                max_per_year INTEGER,
                advance_notice_days INTEGER DEFAULT 0,
                is_paid BOOLEAN DEFAULT TRUE,
                is_active BOOLEAN DEFAULT TRUE,
                is_system BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created leave_types table')
    except Exception:
        db.session.rollback()
        print('leave_types table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS leave_policies (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                role VARCHAR(50),
                min_tenure_months INTEGER DEFAULT 0,
                annual_allowance INTEGER DEFAULT 24,
                sick_allowance INTEGER DEFAULT 15,
                emergency_allowance INTEGER DEFAULT 5,
                carry_over_enabled BOOLEAN DEFAULT FALSE,
                carry_over_max_days INTEGER DEFAULT 5,
                carry_over_expiry_months INTEGER DEFAULT 3,
                probation_months INTEGER DEFAULT 3,
                probation_allowance INTEGER DEFAULT 0,
                accrual_type VARCHAR(20) DEFAULT 'yearly',
                accrual_rate FLOAT,
                negative_balance_allowed BOOLEAN DEFAULT FALSE,
                negative_balance_max INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created leave_policies table')
    except Exception:
        db.session.rollback()
        print('leave_policies table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS leave_calendar (
                id SERIAL PRIMARY KEY,
                date DATE UNIQUE NOT NULL,
                year INTEGER NOT NULL,
                name VARCHAR(100) NOT NULL,
                name_ar VARCHAR(100),
                holiday_type VARCHAR(30),
                is_working_day BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created leave_calendar table')
    except Exception:
        db.session.rollback()
        print('leave_calendar table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS leave_blackouts (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                name_ar VARCHAR(100),
                date_from DATE NOT NULL,
                date_to DATE NOT NULL,
                reason TEXT,
                applies_to_roles JSON,
                exception_user_ids JSON,
                is_active BOOLEAN DEFAULT TRUE,
                created_by_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created leave_blackouts table')
    except Exception:
        db.session.rollback()
        print('leave_blackouts table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS leave_balance_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                leave_type_id INTEGER REFERENCES leave_types(id),
                change_type VARCHAR(30) NOT NULL,
                amount FLOAT NOT NULL,
                balance_before FLOAT,
                balance_after FLOAT,
                leave_id INTEGER REFERENCES leaves(id),
                reason TEXT,
                adjusted_by_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created leave_balance_history table')
    except Exception:
        db.session.rollback()
        print('leave_balance_history table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS leave_approval_levels (
                id SERIAL PRIMARY KEY,
                leave_id INTEGER NOT NULL REFERENCES leaves(id),
                level INTEGER NOT NULL,
                approver_role VARCHAR(50),
                approver_id INTEGER REFERENCES users(id),
                status VARCHAR(20) DEFAULT 'pending',
                decision_at TIMESTAMP,
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(leave_id, level)
            )
        '''))
        db.session.commit()
        print('Created leave_approval_levels table')
    except Exception:
        db.session.rollback()
        print('leave_approval_levels table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS compensatory_leaves (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                work_date DATE NOT NULL,
                hours_worked FLOAT NOT NULL,
                comp_days_earned FLOAT NOT NULL,
                reason TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                approved_by_id INTEGER REFERENCES users(id),
                approved_at TIMESTAMP,
                used_in_leave_id INTEGER REFERENCES leaves(id),
                expires_at DATE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created compensatory_leaves table')
    except Exception:
        db.session.rollback()
        print('compensatory_leaves table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS leave_encashments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                leave_type_id INTEGER REFERENCES leave_types(id),
                days_encashed FLOAT NOT NULL,
                amount_per_day FLOAT,
                total_amount FLOAT,
                status VARCHAR(20) DEFAULT 'pending',
                requested_at TIMESTAMP DEFAULT NOW(),
                approved_by_id INTEGER REFERENCES users(id),
                approved_at TIMESTAMP,
                paid_at TIMESTAMP,
                notes TEXT
            )
        '''))
        db.session.commit()
        print('Created leave_encashments table')
    except Exception:
        db.session.rollback()
        print('leave_encashments table already exists')

    # ========== WORK PLAN TRACKING (8 tables) ==========
    # daily_reviews must be created before job_ratings (FK dependency)
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS work_plan_daily_reviews (
                id SERIAL PRIMARY KEY,
                engineer_id INTEGER NOT NULL REFERENCES users(id),
                date DATE NOT NULL,
                shift_type VARCHAR(10) NOT NULL,
                status VARCHAR(20) DEFAULT 'open',
                opened_at TIMESTAMP,
                submitted_at TIMESTAMP,
                last_saved_at TIMESTAMP,
                total_jobs INTEGER DEFAULT 0,
                approved_jobs INTEGER DEFAULT 0,
                incomplete_jobs INTEGER DEFAULT 0,
                not_started_jobs INTEGER DEFAULT 0,
                carry_over_jobs INTEGER DEFAULT 0,
                total_pause_requests INTEGER DEFAULT 0,
                resolved_pause_requests INTEGER DEFAULT 0,
                materials_reviewed BOOLEAN DEFAULT FALSE,
                notes TEXT,
                reminders_sent INTEGER DEFAULT 0,
                last_reminder_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(engineer_id, date, shift_type)
            )
        '''))
        db.session.commit()
        print('Created work_plan_daily_reviews table')
    except Exception:
        db.session.rollback()
        print('work_plan_daily_reviews table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS work_plan_job_trackings (
                id SERIAL PRIMARY KEY,
                work_plan_job_id INTEGER NOT NULL UNIQUE REFERENCES work_plan_jobs(id),
                status VARCHAR(30) DEFAULT 'pending',
                shift_type VARCHAR(10) DEFAULT 'day',
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                paused_at TIMESTAMP,
                total_paused_minutes INTEGER DEFAULT 0,
                actual_hours NUMERIC(5,2),
                is_carry_over BOOLEAN DEFAULT FALSE,
                original_job_id INTEGER REFERENCES work_plan_jobs(id),
                carry_over_count INTEGER DEFAULT 0,
                completion_photo_id INTEGER REFERENCES files(id),
                work_notes TEXT,
                handover_voice_file_id INTEGER REFERENCES files(id),
                handover_transcription TEXT,
                engineer_handover_voice_file_id INTEGER REFERENCES files(id),
                engineer_handover_transcription TEXT,
                incomplete_reason_category VARCHAR(30),
                incomplete_reason_details TEXT,
                auto_flagged BOOLEAN DEFAULT FALSE,
                auto_flagged_at TIMESTAMP,
                auto_flag_type VARCHAR(30),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created work_plan_job_trackings table')
    except Exception:
        db.session.rollback()
        print('work_plan_job_trackings table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS work_plan_job_logs (
                id SERIAL PRIMARY KEY,
                work_plan_job_id INTEGER NOT NULL REFERENCES work_plan_jobs(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                event_type VARCHAR(30) NOT NULL,
                event_data JSON,
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created work_plan_job_logs table')
    except Exception:
        db.session.rollback()
        print('work_plan_job_logs table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS work_plan_pause_requests (
                id SERIAL PRIMARY KEY,
                work_plan_job_id INTEGER NOT NULL REFERENCES work_plan_jobs(id),
                requested_by_id INTEGER NOT NULL REFERENCES users(id),
                requested_at TIMESTAMP DEFAULT NOW(),
                reason_category VARCHAR(30) NOT NULL,
                reason_details TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                reviewed_by_id INTEGER REFERENCES users(id),
                reviewed_at TIMESTAMP,
                review_notes TEXT,
                resumed_at TIMESTAMP,
                duration_minutes INTEGER,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created work_plan_pause_requests table')
    except Exception:
        db.session.rollback()
        print('work_plan_pause_requests table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS work_plan_job_ratings (
                id SERIAL PRIMARY KEY,
                work_plan_job_id INTEGER NOT NULL REFERENCES work_plan_jobs(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                is_lead BOOLEAN DEFAULT FALSE,
                time_rating NUMERIC(3,1),
                time_rating_override NUMERIC(3,1),
                time_rating_override_reason TEXT,
                time_rating_override_by_id INTEGER REFERENCES users(id),
                time_rating_override_approved BOOLEAN,
                time_rating_override_approved_by_id INTEGER REFERENCES users(id),
                time_rating_override_approved_at TIMESTAMP,
                qc_rating NUMERIC(3,1),
                qc_reason TEXT,
                qc_voice_file_id INTEGER REFERENCES files(id),
                cleaning_rating INTEGER,
                admin_bonus INTEGER DEFAULT 0,
                admin_bonus_by_id INTEGER REFERENCES users(id),
                admin_bonus_notes TEXT,
                points_earned INTEGER DEFAULT 0,
                is_disputed BOOLEAN DEFAULT FALSE,
                dispute_reason TEXT,
                dispute_filed_at TIMESTAMP,
                dispute_resolved BOOLEAN,
                dispute_resolved_by_id INTEGER REFERENCES users(id),
                dispute_resolved_at TIMESTAMP,
                dispute_resolution TEXT,
                rated_by_id INTEGER REFERENCES users(id),
                rated_at TIMESTAMP,
                daily_review_id INTEGER REFERENCES work_plan_daily_reviews(id),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(work_plan_job_id, user_id)
            )
        '''))
        db.session.commit()
        print('Created work_plan_job_ratings table')
    except Exception:
        db.session.rollback()
        print('work_plan_job_ratings table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS work_plan_carry_overs (
                id SERIAL PRIMARY KEY,
                original_job_id INTEGER NOT NULL REFERENCES work_plan_jobs(id),
                new_job_id INTEGER NOT NULL REFERENCES work_plan_jobs(id),
                reason_category VARCHAR(30) NOT NULL,
                reason_details TEXT,
                worker_voice_file_id INTEGER REFERENCES files(id),
                worker_transcription TEXT,
                engineer_voice_file_id INTEGER REFERENCES files(id),
                engineer_transcription TEXT,
                hours_spent_original NUMERIC(5,2),
                carried_over_by_id INTEGER NOT NULL REFERENCES users(id),
                carried_over_at TIMESTAMP DEFAULT NOW(),
                daily_review_id INTEGER REFERENCES work_plan_daily_reviews(id),
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created work_plan_carry_overs table')
    except Exception:
        db.session.rollback()
        print('work_plan_carry_overs table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS work_plan_performances (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                period_type VARCHAR(10) NOT NULL,
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                total_jobs_assigned INTEGER DEFAULT 0,
                total_jobs_completed INTEGER DEFAULT 0,
                total_jobs_incomplete INTEGER DEFAULT 0,
                total_jobs_not_started INTEGER DEFAULT 0,
                total_jobs_carried_over INTEGER DEFAULT 0,
                total_estimated_hours NUMERIC(7,2) DEFAULT 0,
                total_actual_hours NUMERIC(7,2) DEFAULT 0,
                avg_time_rating NUMERIC(3,1),
                avg_qc_rating NUMERIC(3,1),
                avg_cleaning_rating NUMERIC(3,1),
                completion_rate NUMERIC(5,2) DEFAULT 0,
                total_points_earned INTEGER DEFAULT 0,
                current_streak_days INTEGER DEFAULT 0,
                max_streak_days INTEGER DEFAULT 0,
                total_pauses INTEGER DEFAULT 0,
                total_pause_minutes INTEGER DEFAULT 0,
                late_starts INTEGER DEFAULT 0,
                materials_planned INTEGER DEFAULT 0,
                materials_consumed INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, period_type, period_start)
            )
        '''))
        db.session.commit()
        print('Created work_plan_performances table')
    except Exception:
        db.session.rollback()
        print('work_plan_performances table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS work_plan_versions (
                id SERIAL PRIMARY KEY,
                work_plan_id INTEGER NOT NULL REFERENCES work_plans(id),
                version_number INTEGER NOT NULL,
                snapshot_data JSON NOT NULL,
                change_summary TEXT,
                change_type VARCHAR(30),
                created_by_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(work_plan_id, version_number)
            )
        '''))
        db.session.commit()
        print('Created work_plan_versions table')
    except Exception:
        db.session.rollback()
        print('work_plan_versions table already exists')

    # ========== ENHANCED WORK PLANNING (4 tables) ==========
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS job_templates (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                name_ar VARCHAR(200),
                job_type VARCHAR(20) NOT NULL,
                equipment_id INTEGER REFERENCES equipment(id),
                equipment_type VARCHAR(50),
                berth VARCHAR(10),
                estimated_hours FLOAT NOT NULL,
                priority VARCHAR(20) DEFAULT 'normal',
                description TEXT,
                description_ar TEXT,
                recurrence_type VARCHAR(20),
                recurrence_day INTEGER,
                default_team_size INTEGER DEFAULT 1,
                required_certifications JSON,
                is_active BOOLEAN DEFAULT TRUE,
                created_by_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created job_templates table')
    except Exception:
        db.session.rollback()
        print('job_templates table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS job_dependencies (
                id SERIAL PRIMARY KEY,
                job_id INTEGER NOT NULL REFERENCES work_plan_jobs(id),
                depends_on_job_id INTEGER NOT NULL REFERENCES work_plan_jobs(id),
                dependency_type VARCHAR(20) DEFAULT 'finish_to_start',
                lag_minutes INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(job_id, depends_on_job_id)
            )
        '''))
        db.session.commit()
        print('Created job_dependencies table')
    except Exception:
        db.session.rollback()
        print('job_dependencies table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS capacity_configs (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                role VARCHAR(50),
                shift VARCHAR(20),
                max_hours_per_day FLOAT DEFAULT 8,
                max_jobs_per_day INTEGER DEFAULT 5,
                min_rest_hours FLOAT DEFAULT 12,
                overtime_threshold_hours FLOAT DEFAULT 8,
                max_overtime_hours FLOAT DEFAULT 4,
                break_duration_minutes INTEGER DEFAULT 60,
                break_after_hours FLOAT DEFAULT 4,
                concurrent_jobs_allowed INTEGER DEFAULT 1,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created capacity_configs table')
    except Exception:
        db.session.rollback()
        print('capacity_configs table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS worker_skills (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                skill_name VARCHAR(100) NOT NULL,
                skill_level INTEGER DEFAULT 1,
                certification_name VARCHAR(200),
                certification_number VARCHAR(100),
                issued_date DATE,
                expiry_date DATE,
                issuing_authority VARCHAR(200),
                document_file_id INTEGER REFERENCES files(id),
                is_verified BOOLEAN DEFAULT FALSE,
                verified_by_id INTEGER REFERENCES users(id),
                verified_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, skill_name)
            )
        '''))
        db.session.commit()
        print('Created worker_skills table')
    except Exception:
        db.session.rollback()
        print('worker_skills table already exists')

    # ========== EQUIPMENT ADVANCED (4 tables) ==========
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS equipment_watches (
                id SERIAL PRIMARY KEY,
                equipment_id INTEGER NOT NULL REFERENCES equipment(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                notify_status_change BOOLEAN DEFAULT TRUE,
                notify_high_risk BOOLEAN DEFAULT TRUE,
                notify_anomaly BOOLEAN DEFAULT TRUE,
                notify_maintenance BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(equipment_id, user_id)
            )
        '''))
        db.session.commit()
        print('Created equipment_watches table')
    except Exception:
        db.session.rollback()
        print('equipment_watches table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS equipment_notes (
                id SERIAL PRIMARY KEY,
                equipment_id INTEGER NOT NULL REFERENCES equipment(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                content TEXT NOT NULL,
                content_ar TEXT,
                is_pinned BOOLEAN DEFAULT FALSE,
                note_type VARCHAR(50) DEFAULT 'general',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created equipment_notes table')
    except Exception:
        db.session.rollback()
        print('equipment_notes table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS equipment_certifications (
                id SERIAL PRIMARY KEY,
                equipment_id INTEGER NOT NULL REFERENCES equipment(id),
                name VARCHAR(200) NOT NULL,
                name_ar VARCHAR(200),
                description TEXT,
                certification_type VARCHAR(100),
                issuing_authority VARCHAR(200),
                certificate_number VARCHAR(100),
                issued_date DATE NOT NULL,
                expiry_date DATE,
                document_url VARCHAR(500),
                document_file_id INTEGER REFERENCES files(id),
                status VARCHAR(30) DEFAULT 'active',
                created_by_id INTEGER NOT NULL REFERENCES users(id),
                last_notified_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created equipment_certifications table')
    except Exception:
        db.session.rollback()
        print('equipment_certifications table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS equipment_readings (
                id SERIAL PRIMARY KEY,
                equipment_id INTEGER NOT NULL REFERENCES equipment(id),
                reading_type VARCHAR(10) NOT NULL,
                reading_value FLOAT,
                is_faulty BOOLEAN DEFAULT FALSE,
                reading_date DATE DEFAULT CURRENT_DATE,
                recorded_at TIMESTAMP DEFAULT NOW(),
                recorded_by_id INTEGER REFERENCES users(id),
                inspection_id INTEGER REFERENCES inspections(id),
                checklist_item_id INTEGER REFERENCES checklist_items(id),
                photo_file_id INTEGER REFERENCES files(id),
                ai_analysis JSON
            )
        '''))
        db.session.commit()
        print('Created equipment_readings table')
    except Exception:
        db.session.rollback()
        print('equipment_readings table already exists')

    # ========== MATERIALS ENHANCEMENT (8 tables) ==========
    # storage_locations and vendors must come before material_batches
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS storage_locations (
                id SERIAL PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                name_ar VARCHAR(100),
                warehouse VARCHAR(50),
                zone VARCHAR(50),
                aisle VARCHAR(20),
                shelf VARCHAR(20),
                bin VARCHAR(20),
                description TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                max_capacity FLOAT,
                current_usage FLOAT DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created storage_locations table')
    except Exception:
        db.session.rollback()
        print('storage_locations table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS vendors (
                id SERIAL PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(200) NOT NULL,
                name_ar VARCHAR(200),
                contact_person VARCHAR(100),
                email VARCHAR(100),
                phone VARCHAR(50),
                address TEXT,
                payment_terms VARCHAR(100),
                lead_time_days INTEGER,
                rating FLOAT,
                notes TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created vendors table')
    except Exception:
        db.session.rollback()
        print('vendors table already exists')

    # Add enhanced columns to materials table
    materials_extra_cols = [
        ('barcode', 'VARCHAR(100)'),
        ('qr_code', 'VARCHAR(100)'),
        ('default_location_id', 'INTEGER REFERENCES storage_locations(id)'),
        ('preferred_vendor_id', 'INTEGER REFERENCES vendors(id)'),
        ('reorder_point', 'FLOAT'),
        ('reorder_quantity', 'FLOAT'),
        ('safety_stock', 'FLOAT'),
        ('last_count_date', 'DATE'),
        ('last_restock_date', 'DATE'),
        ('avg_monthly_usage', 'FLOAT'),
        ('avg_lead_time_days', 'INTEGER'),
        ('cost_per_unit', 'FLOAT'),
        ('currency', \"VARCHAR(10) DEFAULT 'USD'\"),
        ('image_url', 'VARCHAR(500)'),
    ]
    for col_name, col_type in materials_extra_cols:
        try:
            db.session.execute(text(f'ALTER TABLE materials ADD COLUMN {col_name} {col_type}'))
            db.session.commit()
            print(f'Added {col_name} to materials')
        except Exception:
            db.session.rollback()
            print(f'materials.{col_name} already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS material_batches (
                id SERIAL PRIMARY KEY,
                material_id INTEGER NOT NULL REFERENCES materials(id),
                batch_number VARCHAR(100) NOT NULL,
                lot_number VARCHAR(100),
                quantity FLOAT DEFAULT 0,
                received_date DATE,
                expiry_date DATE,
                manufacture_date DATE,
                vendor_id INTEGER REFERENCES vendors(id),
                purchase_price FLOAT,
                location_id INTEGER REFERENCES storage_locations(id),
                status VARCHAR(20) DEFAULT 'available',
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created material_batches table')
    except Exception:
        db.session.rollback()
        print('material_batches table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS stock_history (
                id SERIAL PRIMARY KEY,
                material_id INTEGER NOT NULL REFERENCES materials(id),
                change_type VARCHAR(30) NOT NULL,
                quantity_before FLOAT NOT NULL,
                quantity_change FLOAT NOT NULL,
                quantity_after FLOAT NOT NULL,
                reason VARCHAR(200),
                reason_ar VARCHAR(200),
                source_type VARCHAR(50),
                source_id INTEGER,
                user_id INTEGER REFERENCES users(id),
                batch_id INTEGER REFERENCES material_batches(id),
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created stock_history table')
    except Exception:
        db.session.rollback()
        print('stock_history table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS stock_reservations (
                id SERIAL PRIMARY KEY,
                material_id INTEGER NOT NULL REFERENCES materials(id),
                quantity FLOAT NOT NULL,
                reservation_type VARCHAR(50),
                job_id INTEGER,
                work_plan_id INTEGER,
                reserved_by_id INTEGER REFERENCES users(id),
                reserved_at TIMESTAMP DEFAULT NOW(),
                needed_by_date DATE,
                status VARCHAR(20) DEFAULT 'active',
                fulfilled_at TIMESTAMP,
                notes TEXT
            )
        '''))
        db.session.commit()
        print('Created stock_reservations table')
    except Exception:
        db.session.rollback()
        print('stock_reservations table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS inventory_counts (
                id SERIAL PRIMARY KEY,
                count_date DATE NOT NULL,
                count_type VARCHAR(30),
                status VARCHAR(20) DEFAULT 'draft',
                created_by_id INTEGER REFERENCES users(id),
                approved_by_id INTEGER REFERENCES users(id),
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                completed_at TIMESTAMP
            )
        '''))
        db.session.commit()
        print('Created inventory_counts table')
    except Exception:
        db.session.rollback()
        print('inventory_counts table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS inventory_count_items (
                id SERIAL PRIMARY KEY,
                count_id INTEGER NOT NULL REFERENCES inventory_counts(id),
                material_id INTEGER NOT NULL REFERENCES materials(id),
                system_quantity FLOAT,
                counted_quantity FLOAT,
                variance FLOAT,
                counted_by_id INTEGER REFERENCES users(id),
                counted_at TIMESTAMP,
                notes TEXT
            )
        '''))
        db.session.commit()
        print('Created inventory_count_items table')
    except Exception:
        db.session.rollback()
        print('inventory_count_items table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS price_history (
                id SERIAL PRIMARY KEY,
                material_id INTEGER NOT NULL REFERENCES materials(id),
                vendor_id INTEGER REFERENCES vendors(id),
                old_price FLOAT,
                new_price FLOAT NOT NULL,
                currency VARCHAR(10) DEFAULT 'USD',
                change_reason VARCHAR(200),
                effective_date DATE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created price_history table')
    except Exception:
        db.session.rollback()
        print('price_history table already exists')

    # ========== REMAINING TABLES ==========
    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS shift_swap_requests (
                id SERIAL PRIMARY KEY,
                requester_id INTEGER NOT NULL REFERENCES users(id),
                requester_date DATE NOT NULL,
                requester_shift VARCHAR(20) NOT NULL,
                target_user_id INTEGER NOT NULL REFERENCES users(id),
                target_date DATE NOT NULL,
                target_shift VARCHAR(20) NOT NULL,
                reason TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                target_response VARCHAR(20),
                target_response_at TIMESTAMP,
                approved_by_id INTEGER REFERENCES users(id),
                approved_at TIMESTAMP,
                rejection_reason TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created shift_swap_requests table')
    except Exception:
        db.session.rollback()
        print('shift_swap_requests table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS toolkit_preferences (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
                simple_mode_enabled BOOLEAN DEFAULT FALSE,
                fab_enabled BOOLEAN DEFAULT TRUE,
                fab_position VARCHAR(20) DEFAULT 'bottom-right',
                persistent_notification BOOLEAN DEFAULT TRUE,
                voice_commands_enabled BOOLEAN DEFAULT FALSE,
                voice_language VARCHAR(5) DEFAULT 'en',
                shake_to_pause BOOLEAN DEFAULT FALSE,
                nfc_enabled BOOLEAN DEFAULT TRUE,
                widget_enabled BOOLEAN DEFAULT TRUE,
                smartwatch_enabled BOOLEAN DEFAULT FALSE,
                quick_camera_enabled BOOLEAN DEFAULT TRUE,
                barcode_scanner_enabled BOOLEAN DEFAULT TRUE,
                voice_checklist_enabled BOOLEAN DEFAULT FALSE,
                auto_location_enabled BOOLEAN DEFAULT TRUE,
                team_map_enabled BOOLEAN DEFAULT FALSE,
                voice_review_enabled BOOLEAN DEFAULT FALSE,
                red_zone_alerts BOOLEAN DEFAULT TRUE,
                photo_compare_enabled BOOLEAN DEFAULT TRUE,
                voice_rating_enabled BOOLEAN DEFAULT FALSE,
                punch_list_enabled BOOLEAN DEFAULT TRUE,
                morning_brief_enabled BOOLEAN DEFAULT TRUE,
                kpi_alerts_enabled BOOLEAN DEFAULT TRUE,
                emergency_broadcast BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created toolkit_preferences table')
    except Exception:
        db.session.rollback()
        print('toolkit_preferences table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS engineer_job_voice_notes (
                id SERIAL PRIMARY KEY,
                engineer_job_id INTEGER NOT NULL REFERENCES engineer_jobs(id),
                file_id INTEGER NOT NULL REFERENCES files(id),
                duration_seconds INTEGER,
                transcription TEXT,
                transcription_ar TEXT,
                note_type VARCHAR(50) DEFAULT 'general',
                created_by INTEGER NOT NULL REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created engineer_job_voice_notes table')
    except Exception:
        db.session.rollback()
        print('engineer_job_voice_notes table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS engineer_job_locations (
                id SERIAL PRIMARY KEY,
                engineer_job_id INTEGER NOT NULL REFERENCES engineer_jobs(id),
                latitude NUMERIC(10,8) NOT NULL,
                longitude NUMERIC(11,8) NOT NULL,
                accuracy_meters FLOAT,
                altitude_meters FLOAT,
                location_type VARCHAR(50) DEFAULT 'tracking',
                address VARCHAR(500),
                user_id INTEGER NOT NULL REFERENCES users(id),
                recorded_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created engineer_job_locations table')
    except Exception:
        db.session.rollback()
        print('engineer_job_locations table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS assignment_templates (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                shift VARCHAR(10),
                is_active BOOLEAN DEFAULT TRUE,
                created_by_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created assignment_templates table')
    except Exception:
        db.session.rollback()
        print('assignment_templates table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS assignment_template_items (
                id SERIAL PRIMARY KEY,
                template_id INTEGER NOT NULL REFERENCES assignment_templates(id),
                equipment_id INTEGER NOT NULL REFERENCES equipment(id),
                berth VARCHAR(50),
                mechanical_inspector_id INTEGER REFERENCES users(id),
                electrical_inspector_id INTEGER REFERENCES users(id)
            )
        '''))
        db.session.commit()
        print('Created assignment_template_items table')
    except Exception:
        db.session.rollback()
        print('assignment_template_items table already exists')

    try:
        db.session.execute(text('''
            CREATE TABLE IF NOT EXISTS defect_occurrences (
                id SERIAL PRIMARY KEY,
                defect_id INTEGER NOT NULL REFERENCES defects(id),
                inspection_id INTEGER NOT NULL REFERENCES inspections(id),
                occurrence_number INTEGER NOT NULL,
                found_by_id INTEGER REFERENCES users(id),
                found_at TIMESTAMP DEFAULT NOW(),
                created_at TIMESTAMP DEFAULT NOW()
            )
        '''))
        db.session.commit()
        print('Created defect_occurrences table')
    except Exception:
        db.session.rollback()
        print('defect_occurrences table already exists')

    print('Schema patches complete.')
"

echo "Ensuring admin user exists..."
python -c "
from app import create_app
from app.extensions import db
from app.models.user import User
app = create_app('production')
with app.app_context():
    admin = User.query.filter_by(email='admin@company.com').first()
    if not admin:
        admin = User(
            email='admin@company.com',
            full_name='Ahmad Al-Rashid',
            role='admin',
            role_id='ADM001',
            phone='+966501234567',
            language='en',
            is_active=True
        )
        admin.set_password('admin123')
        db.session.add(admin)
        db.session.commit()
        print('Admin user created: admin@company.com / admin123')
    else:
        print('Admin user already exists.')
"

echo "Starting gunicorn..."
exec gunicorn -c gunicorn.conf.py "app:create_app('production')"
