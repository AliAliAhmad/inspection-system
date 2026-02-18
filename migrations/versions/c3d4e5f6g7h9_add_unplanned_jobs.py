"""Add unplanned_jobs table

Revision ID: c3d4e5f6g7h9
Revises: b2c3d4e5f6g8
Create Date: 2026-02-18
"""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f6g7h9'
down_revision = 'b2c3d4e5f6g8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'unplanned_jobs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('equipment_name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('work_done', sa.Text(), nullable=False),
        sa.Column('job_type', sa.String(30), nullable=False, server_default='requested_job'),
        sa.Column('requested_by', sa.String(255), nullable=True),
        sa.Column('voice_note_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "job_type IN ('assist_team', 'requested_job')",
            name='check_valid_unplanned_job_type',
        ),
    )


def downgrade():
    op.drop_table('unplanned_jobs')
