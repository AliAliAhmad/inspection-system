"""Add monitor_followups table and followup columns to final_assessments

Revision ID: a1b2c3d4e5f7
Revises: z4a5b6c7d8e9
Create Date: 2026-02-17 22:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f7'
down_revision = 'z4a5b6c7d8e9'
branch_labels = None
depends_on = None


def upgrade():
    # Add follow-up tracking columns to final_assessments
    op.add_column('final_assessments', sa.Column('requires_followup', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('final_assessments', sa.Column('followup_scheduled', sa.Boolean(), server_default='false', nullable=False))

    # Create monitor_followups table
    op.create_table(
        'monitor_followups',
        sa.Column('id', sa.Integer(), primary_key=True),
        # Links
        sa.Column('assessment_id', sa.Integer(), sa.ForeignKey('final_assessments.id'), nullable=False),
        sa.Column('equipment_id', sa.Integer(), sa.ForeignKey('equipment.id'), nullable=False),
        sa.Column('parent_followup_id', sa.Integer(), sa.ForeignKey('monitor_followups.id'), nullable=True),
        # Scheduling
        sa.Column('followup_date', sa.Date(), nullable=False),
        sa.Column('followup_type', sa.String(30), nullable=False),
        sa.Column('location', sa.String(20), nullable=False),
        sa.Column('shift', sa.String(20), nullable=True),
        # Assigned inspectors
        sa.Column('mechanical_inspector_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('electrical_inspector_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        # Who scheduled it
        sa.Column('scheduled_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('scheduled_by_role', sa.String(20), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        # Resulting assignment
        sa.Column('inspection_assignment_id', sa.Integer(), sa.ForeignKey('inspection_assignments.id'), nullable=True),
        # Status tracking
        sa.Column('status', sa.String(30), server_default='pending_schedule', nullable=False),
        # Result
        sa.Column('result_verdict', sa.String(20), nullable=True),
        sa.Column('result_assessment_id', sa.Integer(), sa.ForeignKey('final_assessments.id'), nullable=True),
        # Overdue tracking
        sa.Column('is_overdue', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('overdue_since', sa.DateTime(), nullable=True),
        sa.Column('overdue_notifications_sent', sa.Integer(), server_default='0', nullable=False),
        sa.Column('last_notification_at', sa.DateTime(), nullable=True),
        # Timestamps
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
    )

    # Indexes
    op.create_index('ix_monitor_followups_status', 'monitor_followups', ['status'])
    op.create_index('ix_monitor_followups_followup_date', 'monitor_followups', ['followup_date'])
    op.create_index('ix_monitor_followups_equipment_id', 'monitor_followups', ['equipment_id'])
    op.create_index('ix_monitor_followups_assessment_id', 'monitor_followups', ['assessment_id'])


def downgrade():
    op.drop_index('ix_monitor_followups_assessment_id', table_name='monitor_followups')
    op.drop_index('ix_monitor_followups_equipment_id', table_name='monitor_followups')
    op.drop_index('ix_monitor_followups_followup_date', table_name='monitor_followups')
    op.drop_index('ix_monitor_followups_status', table_name='monitor_followups')
    op.drop_table('monitor_followups')
    op.drop_column('final_assessments', 'followup_scheduled')
    op.drop_column('final_assessments', 'requires_followup')
