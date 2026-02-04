"""Ensure all columns exist - safe migration

Revision ID: d1e2f3g4h5i6
Revises: b9d8a4a0f4db
Create Date: 2026-02-04 08:00:00.000000

This migration safely adds columns that might be missing from the database.
It uses PostgreSQL's "ADD COLUMN IF NOT EXISTS" syntax to avoid errors
if columns already exist.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = 'd1e2f3g4h5i6'
down_revision = 'b9d8a4a0f4db'
branch_labels = None
depends_on = None


def safe_add_column(table, column, column_type):
    """Safely add a column if it doesn't exist (PostgreSQL only)"""
    try:
        conn = op.get_bind()
        # Check if PostgreSQL
        if conn.dialect.name == 'postgresql':
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {column_type}"))
        else:
            # For SQLite, we need to check if column exists first
            result = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            existing_columns = [row[1] for row in result]
            if column not in existing_columns:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}"))
    except Exception as e:
        print(f"Note: Could not add {table}.{column}: {e}")


def upgrade():
    # Files table - AI features
    safe_add_column('files', 'ai_tags', 'JSON')
    safe_add_column('files', 'ocr_text', 'TEXT')

    # Inspections table
    safe_add_column('inspections', 'assignment_id', 'INTEGER')
    safe_add_column('inspections', 'inspection_code', 'VARCHAR(100)')

    # Inspection answers table
    safe_add_column('inspection_answers', 'photo_file_id', 'INTEGER')
    safe_add_column('inspection_answers', 'video_path', 'VARCHAR(500)')
    safe_add_column('inspection_answers', 'video_file_id', 'INTEGER')
    safe_add_column('inspection_answers', 'voice_note_id', 'INTEGER')

    # Inspection schedules table
    safe_add_column('inspection_schedules', 'shift', 'VARCHAR(20)')
    safe_add_column('inspection_schedules', 'berth', 'VARCHAR(50)')

    # Inspection assignments table
    safe_add_column('inspection_assignments', 'template_id', 'INTEGER')

    # Specialist jobs table
    safe_add_column('specialist_jobs', 'wrong_finding_reason', 'TEXT')
    safe_add_column('specialist_jobs', 'wrong_finding_photo', 'VARCHAR(500)')

    # Checklist templates table
    safe_add_column('checklist_templates', 'description', 'TEXT')
    safe_add_column('checklist_templates', 'function', 'VARCHAR(200)')
    safe_add_column('checklist_templates', 'assembly', 'VARCHAR(200)')
    safe_add_column('checklist_templates', 'part', 'VARCHAR(200)')

    # Create roster_entries table if not exists
    try:
        conn = op.get_bind()
        if conn.dialect.name == 'postgresql':
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS roster_entries (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    date DATE NOT NULL,
                    shift VARCHAR(20),
                    created_at TIMESTAMP,
                    UNIQUE(user_id, date)
                )
            """))
        else:
            # SQLite
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS roster_entries (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    date DATE NOT NULL,
                    shift VARCHAR(20),
                    created_at DATETIME,
                    FOREIGN KEY (user_id) REFERENCES users (id),
                    UNIQUE (user_id, date)
                )
            """))
    except Exception as e:
        print(f"Note: roster_entries table: {e}")


def downgrade():
    # This migration is additive and safe - no downgrade needed
    pass
