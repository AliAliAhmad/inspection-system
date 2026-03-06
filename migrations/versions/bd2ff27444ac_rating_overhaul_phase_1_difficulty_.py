"""Rating overhaul Phase 1: difficulty, engineer_id, found_during_repair_by, duration_seconds, repair followup, star_history, epi_snapshots

Revision ID: bd2ff27444ac
Revises: e1f2a3b4c5d6
Create Date: 2026-03-06 01:26:21.374678

"""
from alembic import op
import sqlalchemy as sa
from alembic import context

revision = 'bd2ff27444ac'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def _is_sqlite():
    return context.get_bind().dialect.name == 'sqlite'


def upgrade():
    # --- New tables ---

    op.create_table('star_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('target_type', sa.String(length=30), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=True),
        sa.Column('target_date', sa.Date(), nullable=True),
        sa.Column('star_1', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('star_2', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('star_3', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('star_4', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('star_5', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('star_1_name', sa.String(length=50), nullable=True),
        sa.Column('star_2_name', sa.String(length=50), nullable=True),
        sa.Column('star_3_name', sa.String(length=50), nullable=True),
        sa.Column('star_4_name', sa.String(length=50), nullable=True),
        sa.Column('star_5_name', sa.String(length=50), nullable=True),
        sa.Column('total_stars', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('auto_stars', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('manual_stars', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table('epi_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('week_start', sa.Date(), nullable=False),
        sa.Column('week_end', sa.Date(), nullable=False),
        sa.Column('completion_score', sa.Float(), nullable=False, server_default='0'),
        sa.Column('quality_score', sa.Float(), nullable=False, server_default='0'),
        sa.Column('timeliness_score', sa.Float(), nullable=False, server_default='0'),
        sa.Column('contribution_score', sa.Float(), nullable=False, server_default='0'),
        sa.Column('safety_score', sa.Float(), nullable=False, server_default='0'),
        sa.Column('total_epi', sa.Float(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'week_start', name='uq_epi_user_week')
    )

    # --- Add columns to existing tables ---
    # Use add_column only (no FK constraints for SQLite compat)
    # Production (PostgreSQL) will handle FKs via the model definitions

    op.add_column('work_plan_jobs', sa.Column('difficulty', sa.String(length=10), nullable=True))
    op.add_column('work_plan_jobs', sa.Column('engineer_id', sa.Integer(), nullable=True))
    op.add_column('defects', sa.Column('found_during_repair_by', sa.Integer(), nullable=True))
    op.add_column('files', sa.Column('duration_seconds', sa.Integer(), nullable=True))
    op.add_column('monitor_followups', sa.Column('followup_question', sa.Text(), nullable=True))
    op.add_column('monitor_followups', sa.Column('linked_specialist_job_id', sa.Integer(), nullable=True))
    op.add_column('monitor_followups', sa.Column('repair_verified', sa.Boolean(), nullable=True))

    # Add FK constraints only on PostgreSQL
    if not _is_sqlite():
        op.create_foreign_key('fk_work_plan_jobs_engineer', 'work_plan_jobs', 'users', ['engineer_id'], ['id'])
        op.create_foreign_key('fk_defects_found_by', 'defects', 'users', ['found_during_repair_by'], ['id'])
        op.create_foreign_key('fk_followup_specialist_job', 'monitor_followups', 'specialist_jobs', ['linked_specialist_job_id'], ['id'])


def downgrade():
    if not _is_sqlite():
        op.drop_constraint('fk_followup_specialist_job', 'monitor_followups', type_='foreignkey')
        op.drop_constraint('fk_defects_found_by', 'defects', type_='foreignkey')
        op.drop_constraint('fk_work_plan_jobs_engineer', 'work_plan_jobs', type_='foreignkey')

    op.drop_column('monitor_followups', 'repair_verified')
    op.drop_column('monitor_followups', 'linked_specialist_job_id')
    op.drop_column('monitor_followups', 'followup_question')
    op.drop_column('files', 'duration_seconds')
    op.drop_column('defects', 'found_during_repair_by')
    op.drop_column('work_plan_jobs', 'engineer_id')
    op.drop_column('work_plan_jobs', 'difficulty')
    op.drop_table('epi_snapshots')
    op.drop_table('star_history')
