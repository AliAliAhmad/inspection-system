"""Add worker_assignment_rules table

Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9
Create Date: 2026-04-06 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'e5f6g7h8i9j0'
down_revision = 'd4e5f6g7h8i9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'worker_assignment_rules',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('berth', sa.String(10), nullable=False),
        sa.Column('team_type', sa.String(20), nullable=False),
        sa.Column('equipment_category', sa.String(30), nullable=False),
        sa.Column('mech_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('elec_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('primary_mech_lead_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('successor_mech_lead_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('primary_elec_lead_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('successor_elec_lead_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('candidate_mech_workers', sa.JSON(), nullable=True),
        sa.Column('candidate_elec_workers', sa.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('berth', 'team_type', 'equipment_category', name='uq_worker_assignment_rule'),
        sa.CheckConstraint("berth IN ('east', 'west')", name='check_war_berth'),
        sa.CheckConstraint(
            "team_type IN ('regular_pm', 'ac_pm', 'defect_mech', 'defect_elec')",
            name='check_war_team_type'
        ),
    )
    op.create_index('ix_war_lookup', 'worker_assignment_rules', ['berth', 'team_type', 'equipment_category'])


def downgrade():
    op.drop_index('ix_war_lookup', 'worker_assignment_rules')
    op.drop_table('worker_assignment_rules')
