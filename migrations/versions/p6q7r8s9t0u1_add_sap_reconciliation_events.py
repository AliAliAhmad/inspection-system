"""Somewhere for the robot to leave a note

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-08-23

The daily pool sync runs in a background thread with nobody watching. When SAP
closes an order that is sitting on Tuesday's plan, that fact has to survive
until a human looks at it — a log line does not.

order_number is stored as a plain string rather than an FK: the sync deletes the
staging sap_work_orders row for a finished order, and the note has to outlive it.
"""
from alembic import op
import sqlalchemy as sa


revision = 'p6q7r8s9t0u1'
down_revision = 'o5p6q7r8s9t0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'sap_reconciliation_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(length=40), nullable=False),
        sa.Column('order_number', sa.String(length=50), nullable=False),
        sa.Column('sap_state', sa.String(length=20), nullable=False),
        sa.Column('work_plan_id', sa.Integer(), nullable=True),
        sa.Column('work_plan_job_id', sa.Integer(), nullable=True),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='open'),
        sa.Column('notified_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['work_plan_id'], ['work_plans.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("status IN ('open', 'resolved')", name='check_sap_event_status'),
    )
    op.create_index('ix_sap_reconciliation_events_event_type',
                    'sap_reconciliation_events', ['event_type'])
    op.create_index('ix_sap_reconciliation_events_order_number',
                    'sap_reconciliation_events', ['order_number'])
    op.create_index('ix_sap_reconciliation_events_status',
                    'sap_reconciliation_events', ['status'])
    op.create_index('ix_sap_reconciliation_events_work_plan_id',
                    'sap_reconciliation_events', ['work_plan_id'])
    op.create_index('ix_sap_reconciliation_events_created_at',
                    'sap_reconciliation_events', ['created_at'])


def downgrade():
    op.drop_index('ix_sap_reconciliation_events_created_at',
                  table_name='sap_reconciliation_events')
    op.drop_index('ix_sap_reconciliation_events_work_plan_id',
                  table_name='sap_reconciliation_events')
    op.drop_index('ix_sap_reconciliation_events_status',
                  table_name='sap_reconciliation_events')
    op.drop_index('ix_sap_reconciliation_events_order_number',
                  table_name='sap_reconciliation_events')
    op.drop_index('ix_sap_reconciliation_events_event_type',
                  table_name='sap_reconciliation_events')
    op.drop_table('sap_reconciliation_events')
