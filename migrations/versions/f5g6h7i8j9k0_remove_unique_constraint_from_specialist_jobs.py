"""Remove unique constraint from specialist_jobs defect_id

Revision ID: f5g6h7i8j9k0
Revises: aafab42eb030
Create Date: 2026-02-07 22:07:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f5g6h7i8j9k0'
down_revision = 'aafab42eb030'
branch_labels = None
depends_on = None


def upgrade():
    # Get the database dialect
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'postgresql':
        # PostgreSQL: try to drop both constraint and index variants
        # The constraint name could be tablename_columnname_key or uq_tablename_columnname
        op.execute('ALTER TABLE specialist_jobs DROP CONSTRAINT IF EXISTS specialist_jobs_defect_id_key')
        op.execute('ALTER TABLE specialist_jobs DROP CONSTRAINT IF EXISTS uq_specialist_jobs_defect_id')
        # Also try dropping any unique index on defect_id
        op.execute('DROP INDEX IF EXISTS specialist_jobs_defect_id_key')
        op.execute('DROP INDEX IF EXISTS ix_specialist_jobs_defect_id')
    else:
        # SQLite: need to recreate the table without the unique constraint
        op.execute('''
            CREATE TABLE specialist_jobs_new (
                id INTEGER NOT NULL PRIMARY KEY,
                universal_id INTEGER NOT NULL,
                job_id VARCHAR(50) NOT NULL,
                defect_id INTEGER NOT NULL,
                specialist_id INTEGER NOT NULL,
                assigned_by INTEGER NOT NULL,
                assigned_at DATETIME NOT NULL,
                category VARCHAR(20),
                major_reason TEXT,
                planned_time_hours NUMERIC(5, 2),
                planned_time_entered_at DATETIME,
                details_viewed_at DATETIME,
                started_at DATETIME,
                paused_at DATETIME,
                paused_duration_minutes INTEGER,
                completed_at DATETIME,
                actual_time_hours NUMERIC(5, 2),
                work_notes TEXT,
                status VARCHAR(50) NOT NULL,
                completion_status VARCHAR(50),
                incomplete_reason VARCHAR(100),
                qe_id INTEGER,
                time_rating NUMERIC(3, 1),
                qc_rating NUMERIC(3, 1),
                cleaning_rating INTEGER,
                admin_bonus INTEGER,
                assessment_id INTEGER,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                wrong_finding_reason TEXT,
                wrong_finding_photo VARCHAR(500),
                incomplete_notes TEXT,
                incomplete_at DATETIME,
                incomplete_acknowledged_by INTEGER,
                incomplete_acknowledged_at DATETIME,
                CONSTRAINT check_valid_cleaning_rating CHECK (cleaning_rating >= 0 AND cleaning_rating <= 2 OR cleaning_rating IS NULL),
                CONSTRAINT check_positive_planned_time CHECK (planned_time_hours > 0 OR planned_time_hours IS NULL),
                CONSTRAINT check_valid_job_status CHECK (status IN ('assigned', 'in_progress', 'paused', 'completed', 'incomplete', 'qc_approved', 'cancelled')),
                CONSTRAINT check_valid_completion_status CHECK (completion_status IN ('pass', 'incomplete') OR completion_status IS NULL),
                CONSTRAINT check_valid_admin_bonus CHECK (admin_bonus >= 0 AND admin_bonus <= 10),
                CONSTRAINT check_valid_job_category CHECK (category IN ('major', 'minor') OR category IS NULL),
                FOREIGN KEY(assigned_by) REFERENCES users (id),
                FOREIGN KEY(qe_id) REFERENCES users (id),
                FOREIGN KEY(specialist_id) REFERENCES users (id),
                FOREIGN KEY(defect_id) REFERENCES defects (id),
                FOREIGN KEY(incomplete_acknowledged_by) REFERENCES users (id),
                UNIQUE (universal_id),
                UNIQUE (job_id)
            )
        ''')

        # Copy data from old table to new table
        op.execute('INSERT INTO specialist_jobs_new SELECT * FROM specialist_jobs')

        # Drop old table
        op.execute('DROP TABLE specialist_jobs')

        # Rename new table to original name
        op.execute('ALTER TABLE specialist_jobs_new RENAME TO specialist_jobs')

        # Recreate indexes
        op.execute('CREATE INDEX ix_specialist_jobs_universal_id ON specialist_jobs (universal_id)')
        op.execute('CREATE INDEX ix_specialist_jobs_job_id ON specialist_jobs (job_id)')
        op.execute('CREATE INDEX ix_specialist_jobs_status ON specialist_jobs (status)')


def downgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'postgresql':
        op.execute('ALTER TABLE specialist_jobs ADD CONSTRAINT specialist_jobs_defect_id_key UNIQUE (defect_id)')
    else:
        pass  # SQLite would need table recreation
