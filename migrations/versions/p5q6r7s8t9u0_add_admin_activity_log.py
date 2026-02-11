"""Add admin activity log table

Revision ID: p5q6r7s8t9u0
Revises: 04104edfacd6
Create Date: 2026-02-11
"""
from alembic import op
import sqlalchemy as sa

revision = 'p5q6r7s8t9u0'
down_revision = '04104edfacd6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'admin_activity_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('entity_name', sa.String(200), nullable=True),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_admin_activity_logs_user_id', 'admin_activity_logs', ['user_id'])
    op.create_index('ix_admin_activity_logs_entity_type', 'admin_activity_logs', ['entity_type'])
    op.create_index('ix_admin_activity_logs_action', 'admin_activity_logs', ['action'])
    op.create_index('ix_admin_activity_logs_created_at', 'admin_activity_logs', ['created_at'])


def downgrade():
    op.drop_index('ix_admin_activity_logs_created_at')
    op.drop_index('ix_admin_activity_logs_action')
    op.drop_index('ix_admin_activity_logs_entity_type')
    op.drop_index('ix_admin_activity_logs_user_id')
    op.drop_table('admin_activity_logs')
