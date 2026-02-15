"""Fix job_templates schema mismatch between model and migration.

The original migration created job_templates with columns that don't match the
SQLAlchemy model. This migration adds missing columns and fixes constraints
so the model can query the table without errors.

Revision ID: u0v1w2x3y4z5
Revises: t9u0v1w2x3y4
Create Date: 2026-02-15 20:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'u0v1w2x3y4z5'
down_revision = 't9u0v1w2x3y4'
branch_labels = None
depends_on = None


def upgrade():
    """Add missing columns to job_templates that the model expects."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if 'job_templates' not in inspector.get_table_names():
        return

    existing_cols = {c['name'] for c in inspector.get_columns('job_templates')}

    # Add equipment_id FK if missing
    if 'equipment_id' not in existing_cols:
        op.add_column('job_templates',
            sa.Column('equipment_id', sa.Integer(), nullable=True))
        op.create_foreign_key(
            'fk_job_templates_equipment', 'job_templates', 'equipment',
            ['equipment_id'], ['id'])

    # Add berth if missing
    if 'berth' not in existing_cols:
        op.add_column('job_templates',
            sa.Column('berth', sa.String(length=10), nullable=True))

    # Add priority if missing
    if 'priority' not in existing_cols:
        op.add_column('job_templates',
            sa.Column('priority', sa.String(length=20), nullable=True, server_default='normal'))

    # Add recurrence_type if missing (model uses this, migration used recurrence_pattern)
    if 'recurrence_type' not in existing_cols:
        op.add_column('job_templates',
            sa.Column('recurrence_type', sa.String(length=20), nullable=True))

    # Add recurrence_day if missing
    if 'recurrence_day' not in existing_cols:
        op.add_column('job_templates',
            sa.Column('recurrence_day', sa.Integer(), nullable=True))

    # Add default_team_size if missing
    if 'default_team_size' not in existing_cols:
        op.add_column('job_templates',
            sa.Column('default_team_size', sa.Integer(), nullable=True, server_default='1'))

    # Fix the job_type CHECK constraint - original migration restricted to
    # ('maintenance', 'inspection', 'repair', ...) but model uses ('pm', 'defect', 'inspection')
    # Drop old constraint and create a permissive one
    try:
        op.drop_constraint('check_job_template_type', 'job_templates', type_='check')
    except Exception:
        pass  # Constraint may not exist

    try:
        op.create_check_constraint(
            'check_job_template_type', 'job_templates',
            "job_type IN ('pm', 'defect', 'inspection', 'maintenance', 'repair', 'installation', 'calibration', 'cleaning', 'other')")
    except Exception:
        pass  # May already exist with correct definition

    # Make code column nullable (model doesn't require it, and it blocks inserts)
    try:
        op.alter_column('job_templates', 'code',
            existing_type=sa.String(length=50),
            nullable=True)
    except Exception:
        pass  # Column may not exist or already nullable


def downgrade():
    """Remove added columns."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if 'job_templates' not in inspector.get_table_names():
        return

    existing_cols = {c['name'] for c in inspector.get_columns('job_templates')}

    for col in ['equipment_id', 'berth', 'priority', 'recurrence_type', 'recurrence_day', 'default_team_size']:
        if col in existing_cols:
            if col == 'equipment_id':
                try:
                    op.drop_constraint('fk_job_templates_equipment', 'job_templates', type_='foreignkey')
                except Exception:
                    pass
            op.drop_column('job_templates', col)
