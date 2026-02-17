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
    # --- Drop old CHECK constraints ---
    op.drop_constraint('check_valid_mech_verdict', 'final_assessments', type_='check')
    op.drop_constraint('check_valid_elec_verdict', 'final_assessments', type_='check')
    op.drop_constraint('check_valid_final_status', 'final_assessments', type_='check')

    # --- Add new columns ---
    # System auto-assessment
    op.add_column('final_assessments', sa.Column('system_verdict', sa.String(20), nullable=True))
    op.add_column('final_assessments', sa.Column('system_urgency_score', sa.Integer(), nullable=True))
    op.add_column('final_assessments', sa.Column('system_has_critical', sa.Boolean(), default=False))
    op.add_column('final_assessments', sa.Column('system_has_fail_urgency', sa.Boolean(), default=False))

    # Engineer review
    op.add_column('final_assessments', sa.Column('engineer_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('final_assessments', sa.Column('engineer_verdict', sa.String(20), nullable=True))
    op.add_column('final_assessments', sa.Column('engineer_notes', sa.Text(), nullable=True))
    op.add_column('final_assessments', sa.Column('engineer_reviewed_at', sa.DateTime(), nullable=True))

    # Escalation tracking
    op.add_column('final_assessments', sa.Column('escalation_level', sa.String(20), server_default='none', nullable=False))
    op.add_column('final_assessments', sa.Column('escalation_reason', sa.Text(), nullable=True))

    # Reason fields for monitor/stop
    op.add_column('final_assessments', sa.Column('monitor_reason', sa.Text(), nullable=True))
    op.add_column('final_assessments', sa.Column('stop_reason', sa.Text(), nullable=True))

    # Assessment version
    op.add_column('final_assessments', sa.Column('assessment_version', sa.Integer(), server_default='2', nullable=False))

    # --- New CHECK constraints for 3 verdicts ---
    op.create_check_constraint(
        'check_valid_mech_verdict',
        'final_assessments',
        "mech_verdict IN ('operational', 'monitor', 'stop') OR mech_verdict IS NULL"
    )
    op.create_check_constraint(
        'check_valid_elec_verdict',
        'final_assessments',
        "elec_verdict IN ('operational', 'monitor', 'stop') OR elec_verdict IS NULL"
    )
    op.create_check_constraint(
        'check_valid_final_status',
        'final_assessments',
        "final_status IN ('operational', 'monitor', 'stop') OR final_status IS NULL"
    )
    op.create_check_constraint(
        'check_valid_system_verdict',
        'final_assessments',
        "system_verdict IN ('operational', 'monitor', 'stop') OR system_verdict IS NULL"
    )
    op.create_check_constraint(
        'check_valid_engineer_verdict',
        'final_assessments',
        "engineer_verdict IN ('operational', 'monitor', 'stop') OR engineer_verdict IS NULL"
    )
    op.create_check_constraint(
        'check_valid_escalation_level',
        'final_assessments',
        "escalation_level IN ('none', 'engineer', 'admin')"
    )

    # Update existing rows to version 1
    op.execute("UPDATE final_assessments SET assessment_version = 1 WHERE assessment_version = 2")


def downgrade():
    # Drop new constraints
    op.drop_constraint('check_valid_system_verdict', 'final_assessments', type_='check')
    op.drop_constraint('check_valid_engineer_verdict', 'final_assessments', type_='check')
    op.drop_constraint('check_valid_escalation_level', 'final_assessments', type_='check')
    op.drop_constraint('check_valid_mech_verdict', 'final_assessments', type_='check')
    op.drop_constraint('check_valid_elec_verdict', 'final_assessments', type_='check')
    op.drop_constraint('check_valid_final_status', 'final_assessments', type_='check')

    # Drop new columns
    op.drop_column('final_assessments', 'assessment_version')
    op.drop_column('final_assessments', 'stop_reason')
    op.drop_column('final_assessments', 'monitor_reason')
    op.drop_column('final_assessments', 'escalation_reason')
    op.drop_column('final_assessments', 'escalation_level')
    op.drop_column('final_assessments', 'engineer_reviewed_at')
    op.drop_column('final_assessments', 'engineer_notes')
    op.drop_column('final_assessments', 'engineer_verdict')
    op.drop_column('final_assessments', 'engineer_id')
    op.drop_column('final_assessments', 'system_has_fail_urgency')
    op.drop_column('final_assessments', 'system_has_critical')
    op.drop_column('final_assessments', 'system_urgency_score')
    op.drop_column('final_assessments', 'system_verdict')

    # Restore old constraints
    op.create_check_constraint(
        'check_valid_mech_verdict', 'final_assessments',
        "mech_verdict IN ('operational', 'urgent') OR mech_verdict IS NULL"
    )
    op.create_check_constraint(
        'check_valid_elec_verdict', 'final_assessments',
        "elec_verdict IN ('operational', 'urgent') OR elec_verdict IS NULL"
    )
    op.create_check_constraint(
        'check_valid_final_status', 'final_assessments',
        "final_status IN ('operational', 'urgent') OR final_status IS NULL"
    )
