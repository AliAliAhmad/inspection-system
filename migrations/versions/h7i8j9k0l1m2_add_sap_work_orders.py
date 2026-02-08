"""Add SAP Work Orders staging table

Revision ID: h7i8j9k0l1m2
Revises: 01aae023bd34
Create Date: 2026-02-09 02:45:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'h7i8j9k0l1m2'
down_revision = '01aae023bd34'
branch_labels = None
depends_on = None


def upgrade():
    # Create sap_work_orders table
    op.create_table('sap_work_orders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('work_plan_id', sa.Integer(), nullable=False),
        sa.Column('order_number', sa.String(length=50), nullable=False),
        sa.Column('order_type', sa.String(length=20), nullable=False),
        sa.Column('job_type', sa.String(length=20), nullable=False),
        sa.Column('equipment_id', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('estimated_hours', sa.Float(), nullable=True, server_default='4.0'),
        sa.Column('priority', sa.String(length=20), nullable=True, server_default='normal'),
        sa.Column('berth', sa.String(length=10), nullable=True),
        sa.Column('cycle_id', sa.Integer(), nullable=True),
        sa.Column('maintenance_base', sa.String(length=100), nullable=True),
        sa.Column('required_date', sa.Date(), nullable=True),
        sa.Column('planned_date', sa.Date(), nullable=True),
        sa.Column('overdue_value', sa.Float(), nullable=True),
        sa.Column('overdue_unit', sa.String(length=10), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['work_plan_id'], ['work_plans.id'], ),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], ),
        sa.ForeignKeyConstraint(['cycle_id'], ['maintenance_cycles.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('work_plan_id', 'order_number', name='unique_order_per_plan'),
        sa.CheckConstraint("job_type IN ('pm', 'defect', 'inspection')", name='check_sap_job_type'),
        sa.CheckConstraint("status IN ('pending', 'scheduled')", name='check_sap_order_status')
    )
    op.create_index('ix_sap_work_orders_work_plan_id', 'sap_work_orders', ['work_plan_id'])
    op.create_index('ix_sap_work_orders_status', 'sap_work_orders', ['status'])


def downgrade():
    op.drop_index('ix_sap_work_orders_status', table_name='sap_work_orders')
    op.drop_index('ix_sap_work_orders_work_plan_id', table_name='sap_work_orders')
    op.drop_table('sap_work_orders')
