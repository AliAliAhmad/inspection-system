"""Add running hours tables and answer templates table

Revision ID: a1b2c3d4e5f6
Revises: s8t9u0v1w2x3
Create Date: 2026-02-15
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = 'a1b2c3d4e5f6'
down_revision = 's8t9u0v1w2x3'
branch_labels = None
depends_on = None


def upgrade():
    # Running Hours Readings
    op.create_table(
        'running_hours_readings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('equipment_id', sa.Integer(), nullable=False),
        sa.Column('hours', sa.Float(), nullable=False),
        sa.Column('recorded_at', sa.DateTime(), nullable=False),
        sa.Column('recorded_by_id', sa.Integer(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('source', sa.String(length=20), nullable=False, server_default='manual'),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['recorded_by_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("source IN ('manual', 'meter', 'estimated')", name='ck_rhr_source'),
    )
    op.create_index('ix_running_hours_readings_equipment_id', 'running_hours_readings', ['equipment_id'])

    # Service Intervals
    op.create_table(
        'service_intervals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('equipment_id', sa.Integer(), nullable=False),
        sa.Column('service_interval_hours', sa.Float(), nullable=False, server_default='500'),
        sa.Column('alert_threshold_hours', sa.Float(), nullable=False, server_default='50'),
        sa.Column('last_service_date', sa.DateTime(), nullable=True),
        sa.Column('last_service_hours', sa.Float(), nullable=False, server_default='0'),
        sa.Column('next_service_hours', sa.Float(), nullable=False, server_default='500'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('equipment_id'),
    )
    op.create_index('ix_service_intervals_equipment_id', 'service_intervals', ['equipment_id'])

    # Running Hours Alerts
    op.create_table(
        'running_hours_alerts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('equipment_id', sa.Integer(), nullable=False),
        sa.Column('alert_type', sa.String(length=30), nullable=False),
        sa.Column('severity', sa.String(length=10), nullable=False, server_default='warning'),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('hours_value', sa.Float(), nullable=True),
        sa.Column('threshold_value', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('acknowledged_at', sa.DateTime(), nullable=True),
        sa.Column('acknowledged_by_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['acknowledged_by_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "alert_type IN ('approaching_service', 'overdue_service', 'hours_spike', 'reading_gap')",
            name='ck_rha_type'
        ),
        sa.CheckConstraint("severity IN ('warning', 'critical')", name='ck_rha_severity'),
    )
    op.create_index('ix_running_hours_alerts_equipment_id', 'running_hours_alerts', ['equipment_id'])

    # Answer Templates
    op.create_table(
        'answer_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('name_ar', sa.String(length=200), nullable=True),
        sa.Column('category', sa.String(length=50), nullable=False, server_default='general'),
        sa.Column('content', sa.JSON(), nullable=True),
        sa.Column('is_favorite', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('usage_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_answer_templates_user_id', 'answer_templates', ['user_id'])


def downgrade():
    op.drop_table('answer_templates')
    op.drop_table('running_hours_alerts')
    op.drop_table('service_intervals')
    op.drop_table('running_hours_readings')
