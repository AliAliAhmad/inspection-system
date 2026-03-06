"""Multi-layer assessment system: operational/monitor/stop verdicts with engineer escalation

Revision ID: z4a5b6c7d8e9
Revises: y3z4a5b6c7d8
Create Date: 2026-02-17 18:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'z4a5b6c7d8e9'
down_revision = 'y3z4a5b6c7d8'
branch_labels = None
depends_on = None


def upgrade():
    # Use batch mode for SQLite compatibility
    with op.batch_alter_table('final_assessments') as batch_op:
        # Add new columns
        batch_op.add_column(sa.Column('system_verdict', sa.String(20), nullable=True))
        batch_op.add_column(sa.Column('system_urgency_score', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('system_has_critical', sa.Boolean(), default=False))
        batch_op.add_column(sa.Column('system_has_fail_urgency', sa.Boolean(), default=False))
        batch_op.add_column(sa.Column('engineer_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('engineer_verdict', sa.String(20), nullable=True))
        batch_op.add_column(sa.Column('engineer_notes', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('engineer_reviewed_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('escalation_level', sa.String(20), server_default='none', nullable=False))
        batch_op.add_column(sa.Column('escalation_reason', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('monitor_reason', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('stop_reason', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('assessment_version', sa.Integer(), server_default='2', nullable=False))
        batch_op.create_foreign_key('fk_assessment_engineer', 'users', ['engineer_id'], ['id'])

    # Update existing rows to version 1
    op.execute("UPDATE final_assessments SET assessment_version = 1 WHERE assessment_version = 2")


def downgrade():
    with op.batch_alter_table('final_assessments') as batch_op:
        batch_op.drop_column('assessment_version')
        batch_op.drop_column('stop_reason')
        batch_op.drop_column('monitor_reason')
        batch_op.drop_column('escalation_reason')
        batch_op.drop_column('escalation_level')
        batch_op.drop_column('engineer_reviewed_at')
        batch_op.drop_column('engineer_notes')
        batch_op.drop_column('engineer_verdict')
        batch_op.drop_column('engineer_id')
        batch_op.drop_column('system_has_fail_urgency')
        batch_op.drop_column('system_has_critical')
        batch_op.drop_column('system_urgency_score')
        batch_op.drop_column('system_verdict')
