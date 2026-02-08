"""Add PM Templates and Maintenance Cycles

Revision ID: g6h7i8j9k0l1
Revises: f5g6h7i8j9k0
Create Date: 2026-02-08 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'g6h7i8j9k0l1'
down_revision = 'f5g6h7i8j9k0'
branch_labels = None
depends_on = None


def upgrade():
    # Create maintenance_cycles table
    op.create_table('maintenance_cycles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('name_ar', sa.String(length=100), nullable=True),
        sa.Column('cycle_type', sa.String(length=20), nullable=False),
        sa.Column('hours_value', sa.Integer(), nullable=True),
        sa.Column('calendar_value', sa.Integer(), nullable=True),
        sa.Column('calendar_unit', sa.String(length=20), nullable=True),
        sa.Column('display_label', sa.String(length=50), nullable=True),
        sa.Column('display_label_ar', sa.String(length=50), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('sort_order', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
        sa.CheckConstraint("cycle_type IN ('running_hours', 'calendar')", name='check_cycle_type'),
        sa.CheckConstraint("calendar_unit IN ('days', 'weeks', 'months') OR calendar_unit IS NULL", name='check_calendar_unit')
    )

    # Create pm_templates table
    op.create_table('pm_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('name_ar', sa.String(length=255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('description_ar', sa.Text(), nullable=True),
        sa.Column('equipment_type', sa.String(length=100), nullable=False),
        sa.Column('cycle_id', sa.Integer(), nullable=False),
        sa.Column('estimated_hours', sa.Float(), nullable=True, server_default='4.0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['cycle_id'], ['maintenance_cycles.id'], ),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('equipment_type', 'cycle_id', name='uq_pm_template_equipment_cycle')
    )
    op.create_index('ix_pm_templates_equipment_type', 'pm_templates', ['equipment_type'])

    # Create pm_template_checklist_items table
    op.create_table('pm_template_checklist_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('template_id', sa.Integer(), nullable=False),
        sa.Column('item_code', sa.String(length=20), nullable=True),
        sa.Column('question_text', sa.Text(), nullable=False),
        sa.Column('question_text_ar', sa.Text(), nullable=True),
        sa.Column('answer_type', sa.String(length=20), nullable=True, server_default='pass_fail'),
        sa.Column('category', sa.String(length=20), nullable=True),
        sa.Column('is_required', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('action', sa.Text(), nullable=True),
        sa.Column('action_ar', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['template_id'], ['pm_templates.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("answer_type IN ('pass_fail', 'yes_no', 'numeric', 'text')", name='check_pm_item_answer_type'),
        sa.CheckConstraint("category IN ('mechanical', 'electrical') OR category IS NULL", name='check_pm_item_category')
    )

    # Create pm_template_materials table
    op.create_table('pm_template_materials',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('template_id', sa.Integer(), nullable=False),
        sa.Column('material_id', sa.Integer(), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False, server_default='1'),
        sa.ForeignKeyConstraint(['template_id'], ['pm_templates.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['material_id'], ['materials.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('template_id', 'material_id', name='uq_pm_template_material')
    )

    # Add new columns to work_plan_jobs
    with op.batch_alter_table('work_plan_jobs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('description', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('cycle_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('pm_template_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('overdue_value', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('overdue_unit', sa.String(length=10), nullable=True))
        batch_op.add_column(sa.Column('maintenance_base', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('planned_date', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('start_time', sa.Time(), nullable=True))
        batch_op.add_column(sa.Column('end_time', sa.Time(), nullable=True))
        batch_op.create_foreign_key('fk_work_plan_jobs_cycle_id', 'maintenance_cycles', ['cycle_id'], ['id'])
        batch_op.create_foreign_key('fk_work_plan_jobs_pm_template_id', 'pm_templates', ['pm_template_id'], ['id'])

    # Seed default maintenance cycles
    op.execute("""
        INSERT INTO maintenance_cycles (name, name_ar, cycle_type, hours_value, display_label, display_label_ar, is_system, sort_order, is_active, created_at)
        VALUES
        ('250h', '250 ساعة', 'running_hours', 250, '250 Hours', '250 ساعة', 1, 1, 1, CURRENT_TIMESTAMP),
        ('500h', '500 ساعة', 'running_hours', 500, '500 Hours', '500 ساعة', 1, 2, 1, CURRENT_TIMESTAMP),
        ('1000h', '1000 ساعة', 'running_hours', 1000, '1000 Hours', '1000 ساعة', 1, 3, 1, CURRENT_TIMESTAMP),
        ('1500h', '1500 ساعة', 'running_hours', 1500, '1500 Hours', '1500 ساعة', 1, 4, 1, CURRENT_TIMESTAMP),
        ('2000h', '2000 ساعة', 'running_hours', 2000, '2000 Hours', '2000 ساعة', 1, 5, 1, CURRENT_TIMESTAMP),
        ('3000h', '3000 ساعة', 'running_hours', 3000, '3000 Hours', '3000 ساعة', 1, 6, 1, CURRENT_TIMESTAMP),
        ('4000h', '4000 ساعة', 'running_hours', 4000, '4000 Hours', '4000 ساعة', 1, 7, 1, CURRENT_TIMESTAMP)
    """)

    op.execute("""
        INSERT INTO maintenance_cycles (name, name_ar, cycle_type, calendar_value, calendar_unit, display_label, display_label_ar, is_system, sort_order, is_active, created_at)
        VALUES
        ('3-weeks', '3 أسابيع', 'calendar', 3, 'weeks', '3 Weeks', '3 أسابيع', 1, 10, 1, CURRENT_TIMESTAMP),
        ('monthly', 'شهري', 'calendar', 1, 'months', 'Monthly', 'شهري', 1, 11, 1, CURRENT_TIMESTAMP),
        ('quarterly', 'ربع سنوي', 'calendar', 3, 'months', 'Quarterly', 'ربع سنوي', 1, 12, 1, CURRENT_TIMESTAMP),
        ('6-months', '6 أشهر', 'calendar', 6, 'months', '6 Months', '6 أشهر', 1, 13, 1, CURRENT_TIMESTAMP),
        ('yearly', 'سنوي', 'calendar', 12, 'months', 'Yearly', 'سنوي', 1, 14, 1, CURRENT_TIMESTAMP)
    """)


def downgrade():
    # Remove foreign keys and columns from work_plan_jobs
    with op.batch_alter_table('work_plan_jobs', schema=None) as batch_op:
        batch_op.drop_constraint('fk_work_plan_jobs_cycle_id', type_='foreignkey')
        batch_op.drop_constraint('fk_work_plan_jobs_pm_template_id', type_='foreignkey')
        batch_op.drop_column('end_time')
        batch_op.drop_column('start_time')
        batch_op.drop_column('planned_date')
        batch_op.drop_column('maintenance_base')
        batch_op.drop_column('overdue_unit')
        batch_op.drop_column('overdue_value')
        batch_op.drop_column('pm_template_id')
        batch_op.drop_column('cycle_id')
        batch_op.drop_column('description')

    # Drop tables in reverse order
    op.drop_table('pm_template_materials')
    op.drop_table('pm_template_checklist_items')
    op.drop_index('ix_pm_templates_equipment_type', table_name='pm_templates')
    op.drop_table('pm_templates')
    op.drop_table('maintenance_cycles')
