"""Add Leave and Work Planning Enhancement Models

Revision ID: 20260210_leaves_workplan
Revises: o4p5q6r7s8t9
Create Date: 2026-02-10 00:00:00.000000

This migration adds:
- Leave Tables: leave_types, leave_policies, leave_balance_history, leave_blackouts,
  leave_calendar, leave_approval_levels, compensatory_leaves, leave_encashments
- Work Planning Tables: job_templates, job_template_materials, job_template_checklists,
  job_dependencies, capacity_configs, worker_skills, equipment_restrictions,
  work_plan_versions, job_checklist_responses, scheduling_conflicts
- ALTER leaves table: Add new fields for enhanced leave management
- ALTER work_plan_jobs table: Add new fields for enhanced work planning
- Seed default leave types and capacity configs
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '20260210_leaves_workplan'
down_revision = 'o4p5q6r7s8t9'
branch_labels = None
depends_on = None


def table_exists(table_name):
    """Check if a table exists in the database."""
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)
    return table_name in inspector.get_table_names()


def column_exists(table_name, column_name):
    """Check if a column exists in a table."""
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade():
    # =============================================
    # LEAVE TABLES
    # =============================================

    # 1. leave_types - Configurable leave types
    if not table_exists('leave_types'):
        op.create_table('leave_types',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('code', sa.String(length=30), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('name_ar', sa.String(length=100), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('description_ar', sa.Text(), nullable=True),
            sa.Column('color', sa.String(length=20), nullable=True),
            sa.Column('icon', sa.String(length=50), nullable=True),
            sa.Column('requires_certificate', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('certificate_after_days', sa.Integer(), nullable=True),
            sa.Column('max_days_per_year', sa.Integer(), nullable=True),
            sa.Column('max_consecutive_days', sa.Integer(), nullable=True),
            sa.Column('min_notice_days', sa.Integer(), nullable=True, server_default='0'),
            sa.Column('can_be_half_day', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('can_be_hourly', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('is_paid', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('accrual_rate', sa.Float(), nullable=True),
            sa.Column('carry_forward_allowed', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('max_carry_forward_days', sa.Integer(), nullable=True),
            sa.Column('encashment_allowed', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('requires_approval', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('approval_levels', sa.Integer(), nullable=True, server_default='1'),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('is_system', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('sort_order', sa.Integer(), nullable=True, server_default='0'),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('code', name='uq_leave_types_code')
        )
        op.create_index('ix_leave_types_code', 'leave_types', ['code'])
        op.create_index('ix_leave_types_is_active', 'leave_types', ['is_active'])

    # 2. leave_policies - Leave policies per role
    if not table_exists('leave_policies'):
        op.create_table('leave_policies',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('name_ar', sa.String(length=100), nullable=True),
            sa.Column('role', sa.String(length=50), nullable=True),
            sa.Column('leave_type_id', sa.Integer(), nullable=False),
            sa.Column('annual_entitlement', sa.Integer(), nullable=False),
            sa.Column('max_consecutive_days', sa.Integer(), nullable=True),
            sa.Column('min_service_months', sa.Integer(), nullable=True, server_default='0'),
            sa.Column('probation_allowed', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('advance_booking_days', sa.Integer(), nullable=True),
            sa.Column('max_pending_requests', sa.Integer(), nullable=True, server_default='3'),
            sa.Column('effective_from', sa.Date(), nullable=True),
            sa.Column('effective_to', sa.Date(), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['leave_type_id'], ['leave_types.id'], name='fk_leave_policies_leave_type'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('role', 'leave_type_id', name='uq_leave_policy_role_type')
        )
        op.create_index('ix_leave_policies_role', 'leave_policies', ['role'])
        op.create_index('ix_leave_policies_leave_type_id', 'leave_policies', ['leave_type_id'])

    # 3. leave_balance_history - Balance change audit trail
    if not table_exists('leave_balance_history'):
        op.create_table('leave_balance_history',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('leave_type_id', sa.Integer(), nullable=False),
            sa.Column('year', sa.Integer(), nullable=False),
            sa.Column('change_type', sa.String(length=30), nullable=False),
            sa.Column('change_amount', sa.Float(), nullable=False),
            sa.Column('balance_before', sa.Float(), nullable=False),
            sa.Column('balance_after', sa.Float(), nullable=False),
            sa.Column('reason', sa.Text(), nullable=True),
            sa.Column('reason_ar', sa.Text(), nullable=True),
            sa.Column('related_leave_id', sa.Integer(), nullable=True),
            sa.Column('related_encashment_id', sa.Integer(), nullable=True),
            sa.Column('changed_by_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_leave_balance_history_user'),
            sa.ForeignKeyConstraint(['leave_type_id'], ['leave_types.id'], name='fk_leave_balance_history_leave_type'),
            sa.ForeignKeyConstraint(['related_leave_id'], ['leaves.id'], name='fk_leave_balance_history_leave'),
            sa.ForeignKeyConstraint(['changed_by_id'], ['users.id'], name='fk_leave_balance_history_changed_by'),
            sa.PrimaryKeyConstraint('id'),
            sa.CheckConstraint(
                "change_type IN ('accrual', 'used', 'adjustment', 'carry_forward', 'expired', 'encashed', 'compensatory', 'cancelled')",
                name='check_leave_balance_change_type'
            )
        )
        op.create_index('ix_leave_balance_history_user_id', 'leave_balance_history', ['user_id'])
        op.create_index('ix_leave_balance_history_leave_type_id', 'leave_balance_history', ['leave_type_id'])
        op.create_index('ix_leave_balance_history_year', 'leave_balance_history', ['year'])
        op.create_index('ix_leave_balance_history_change_type', 'leave_balance_history', ['change_type'])

    # 4. leave_blackouts - Blackout periods
    if not table_exists('leave_blackouts'):
        op.create_table('leave_blackouts',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('name_ar', sa.String(length=100), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('start_date', sa.Date(), nullable=False),
            sa.Column('end_date', sa.Date(), nullable=False),
            sa.Column('applies_to_roles', sa.JSON(), nullable=True),
            sa.Column('applies_to_leave_types', sa.JSON(), nullable=True),
            sa.Column('is_soft_block', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('requires_approval_override', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('reason', sa.Text(), nullable=True),
            sa.Column('reason_ar', sa.Text(), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_by_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name='fk_leave_blackouts_created_by'),
            sa.PrimaryKeyConstraint('id'),
            sa.CheckConstraint('end_date >= start_date', name='check_blackout_dates')
        )
        op.create_index('ix_leave_blackouts_start_date', 'leave_blackouts', ['start_date'])
        op.create_index('ix_leave_blackouts_end_date', 'leave_blackouts', ['end_date'])
        op.create_index('ix_leave_blackouts_is_active', 'leave_blackouts', ['is_active'])

    # 5. leave_calendar - Public holidays
    if not table_exists('leave_calendar'):
        op.create_table('leave_calendar',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('date', sa.Date(), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('name_ar', sa.String(length=100), nullable=True),
            sa.Column('holiday_type', sa.String(length=30), nullable=True, server_default='public'),
            sa.Column('is_full_day', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('half_day_period', sa.String(length=10), nullable=True),
            sa.Column('applies_to_roles', sa.JSON(), nullable=True),
            sa.Column('year', sa.Integer(), nullable=False),
            sa.Column('is_recurring', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_by_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name='fk_leave_calendar_created_by'),
            sa.PrimaryKeyConstraint('id'),
            sa.CheckConstraint(
                "holiday_type IN ('public', 'religious', 'national', 'company', 'optional')",
                name='check_leave_calendar_holiday_type'
            ),
            sa.CheckConstraint(
                "half_day_period IN ('am', 'pm') OR half_day_period IS NULL",
                name='check_leave_calendar_half_day_period'
            )
        )
        op.create_index('ix_leave_calendar_date', 'leave_calendar', ['date'])
        op.create_index('ix_leave_calendar_year', 'leave_calendar', ['year'])
        op.create_index('ix_leave_calendar_holiday_type', 'leave_calendar', ['holiday_type'])

    # 6. leave_approval_levels - Multi-level approval
    if not table_exists('leave_approval_levels'):
        op.create_table('leave_approval_levels',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('leave_id', sa.Integer(), nullable=False),
            sa.Column('level', sa.Integer(), nullable=False),
            sa.Column('approver_role', sa.String(length=50), nullable=True),
            sa.Column('approver_id', sa.Integer(), nullable=True),
            sa.Column('status', sa.String(length=20), server_default='pending', nullable=False),
            sa.Column('comments', sa.Text(), nullable=True),
            sa.Column('actioned_at', sa.DateTime(), nullable=True),
            sa.Column('deadline', sa.DateTime(), nullable=True),
            sa.Column('reminder_sent', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['leave_id'], ['leaves.id'], name='fk_leave_approval_levels_leave', ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['approver_id'], ['users.id'], name='fk_leave_approval_levels_approver'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('leave_id', 'level', name='uq_leave_approval_level'),
            sa.CheckConstraint(
                "status IN ('pending', 'approved', 'rejected', 'skipped')",
                name='check_leave_approval_status'
            )
        )
        op.create_index('ix_leave_approval_levels_leave_id', 'leave_approval_levels', ['leave_id'])
        op.create_index('ix_leave_approval_levels_approver_id', 'leave_approval_levels', ['approver_id'])
        op.create_index('ix_leave_approval_levels_status', 'leave_approval_levels', ['status'])

    # 7. compensatory_leaves - Comp-off tracking
    if not table_exists('compensatory_leaves'):
        op.create_table('compensatory_leaves',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('earned_date', sa.Date(), nullable=False),
            sa.Column('earned_hours', sa.Float(), nullable=False),
            sa.Column('earned_days', sa.Float(), nullable=False),
            sa.Column('reason', sa.Text(), nullable=True),
            sa.Column('reason_ar', sa.Text(), nullable=True),
            sa.Column('work_type', sa.String(length=30), nullable=True),
            sa.Column('related_job_type', sa.String(length=30), nullable=True),
            sa.Column('related_job_id', sa.Integer(), nullable=True),
            sa.Column('status', sa.String(length=20), server_default='pending', nullable=False),
            sa.Column('approved_by_id', sa.Integer(), nullable=True),
            sa.Column('approved_at', sa.DateTime(), nullable=True),
            sa.Column('used_days', sa.Float(), server_default='0', nullable=False),
            sa.Column('remaining_days', sa.Float(), nullable=False),
            sa.Column('expiry_date', sa.Date(), nullable=True),
            sa.Column('is_expired', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_compensatory_leaves_user'),
            sa.ForeignKeyConstraint(['approved_by_id'], ['users.id'], name='fk_compensatory_leaves_approved_by'),
            sa.PrimaryKeyConstraint('id'),
            sa.CheckConstraint(
                "status IN ('pending', 'approved', 'rejected', 'used', 'expired')",
                name='check_compensatory_leave_status'
            ),
            sa.CheckConstraint(
                "work_type IN ('overtime', 'holiday_work', 'weekend_work', 'extra_shift') OR work_type IS NULL",
                name='check_compensatory_work_type'
            )
        )
        op.create_index('ix_compensatory_leaves_user_id', 'compensatory_leaves', ['user_id'])
        op.create_index('ix_compensatory_leaves_earned_date', 'compensatory_leaves', ['earned_date'])
        op.create_index('ix_compensatory_leaves_status', 'compensatory_leaves', ['status'])
        op.create_index('ix_compensatory_leaves_expiry_date', 'compensatory_leaves', ['expiry_date'])

    # 8. leave_encashments - Encashment requests
    if not table_exists('leave_encashments'):
        op.create_table('leave_encashments',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('leave_type_id', sa.Integer(), nullable=False),
            sa.Column('year', sa.Integer(), nullable=False),
            sa.Column('requested_days', sa.Float(), nullable=False),
            sa.Column('approved_days', sa.Float(), nullable=True),
            sa.Column('daily_rate', sa.Float(), nullable=True),
            sa.Column('total_amount', sa.Float(), nullable=True),
            sa.Column('currency', sa.String(length=10), nullable=True, server_default='SAR'),
            sa.Column('status', sa.String(length=20), server_default='pending', nullable=False),
            sa.Column('reason', sa.Text(), nullable=True),
            sa.Column('approved_by_id', sa.Integer(), nullable=True),
            sa.Column('approved_at', sa.DateTime(), nullable=True),
            sa.Column('rejection_reason', sa.Text(), nullable=True),
            sa.Column('payment_date', sa.Date(), nullable=True),
            sa.Column('payment_reference', sa.String(length=100), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_leave_encashments_user'),
            sa.ForeignKeyConstraint(['leave_type_id'], ['leave_types.id'], name='fk_leave_encashments_leave_type'),
            sa.ForeignKeyConstraint(['approved_by_id'], ['users.id'], name='fk_leave_encashments_approved_by'),
            sa.PrimaryKeyConstraint('id'),
            sa.CheckConstraint(
                "status IN ('pending', 'approved', 'rejected', 'paid', 'cancelled')",
                name='check_leave_encashment_status'
            )
        )
        op.create_index('ix_leave_encashments_user_id', 'leave_encashments', ['user_id'])
        op.create_index('ix_leave_encashments_leave_type_id', 'leave_encashments', ['leave_type_id'])
        op.create_index('ix_leave_encashments_year', 'leave_encashments', ['year'])
        op.create_index('ix_leave_encashments_status', 'leave_encashments', ['status'])

    # =============================================
    # WORK PLANNING TABLES
    # =============================================

    # 1. job_templates - Recurring job templates
    if not table_exists('job_templates'):
        op.create_table('job_templates',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('code', sa.String(length=50), nullable=False),
            sa.Column('name', sa.String(length=200), nullable=False),
            sa.Column('name_ar', sa.String(length=200), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('description_ar', sa.Text(), nullable=True),
            sa.Column('job_type', sa.String(length=30), nullable=False),
            sa.Column('equipment_type', sa.String(length=100), nullable=True),
            sa.Column('estimated_hours', sa.Float(), nullable=True, server_default='2.0'),
            sa.Column('min_workers', sa.Integer(), nullable=True, server_default='1'),
            sa.Column('max_workers', sa.Integer(), nullable=True, server_default='2'),
            sa.Column('required_skill_level', sa.String(length=20), nullable=True),
            sa.Column('requires_certification', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('required_certifications', sa.JSON(), nullable=True),
            sa.Column('safety_requirements', sa.JSON(), nullable=True),
            sa.Column('special_instructions', sa.Text(), nullable=True),
            sa.Column('special_instructions_ar', sa.Text(), nullable=True),
            sa.Column('checklist_required', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('photo_required', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('weather_sensitive', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('weather_restrictions', sa.JSON(), nullable=True),
            sa.Column('is_recurring', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('recurrence_pattern', sa.String(length=20), nullable=True),
            sa.Column('recurrence_interval', sa.Integer(), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_by_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name='fk_job_templates_created_by'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('code', name='uq_job_templates_code'),
            sa.CheckConstraint(
                "job_type IN ('maintenance', 'inspection', 'repair', 'installation', 'calibration', 'cleaning', 'other')",
                name='check_job_template_type'
            ),
            sa.CheckConstraint(
                "required_skill_level IN ('junior', 'mid', 'senior', 'expert') OR required_skill_level IS NULL",
                name='check_job_template_skill_level'
            ),
            sa.CheckConstraint(
                "recurrence_pattern IN ('daily', 'weekly', 'monthly', 'yearly') OR recurrence_pattern IS NULL",
                name='check_job_template_recurrence'
            )
        )
        op.create_index('ix_job_templates_code', 'job_templates', ['code'])
        op.create_index('ix_job_templates_job_type', 'job_templates', ['job_type'])
        op.create_index('ix_job_templates_equipment_type', 'job_templates', ['equipment_type'])
        op.create_index('ix_job_templates_is_active', 'job_templates', ['is_active'])

    # 2. job_template_materials - Template materials
    if not table_exists('job_template_materials'):
        op.create_table('job_template_materials',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('template_id', sa.Integer(), nullable=False),
            sa.Column('material_id', sa.Integer(), nullable=False),
            sa.Column('quantity', sa.Float(), nullable=False, server_default='1'),
            sa.Column('is_optional', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['template_id'], ['job_templates.id'], name='fk_job_template_materials_template', ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['material_id'], ['materials.id'], name='fk_job_template_materials_material'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('template_id', 'material_id', name='uq_job_template_material')
        )
        op.create_index('ix_job_template_materials_template_id', 'job_template_materials', ['template_id'])
        op.create_index('ix_job_template_materials_material_id', 'job_template_materials', ['material_id'])

    # 3. job_template_checklists - Template checklists
    if not table_exists('job_template_checklists'):
        op.create_table('job_template_checklists',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('template_id', sa.Integer(), nullable=False),
            sa.Column('item_code', sa.String(length=20), nullable=True),
            sa.Column('question_text', sa.Text(), nullable=False),
            sa.Column('question_text_ar', sa.Text(), nullable=True),
            sa.Column('answer_type', sa.String(length=20), nullable=False, server_default='pass_fail'),
            sa.Column('category', sa.String(length=30), nullable=True),
            sa.Column('is_required', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('is_critical', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('expected_value', sa.String(length=100), nullable=True),
            sa.Column('min_value', sa.Float(), nullable=True),
            sa.Column('max_value', sa.Float(), nullable=True),
            sa.Column('unit', sa.String(length=20), nullable=True),
            sa.Column('photo_required', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('action_if_fail', sa.Text(), nullable=True),
            sa.Column('action_if_fail_ar', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['template_id'], ['job_templates.id'], name='fk_job_template_checklists_template', ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.CheckConstraint(
                "answer_type IN ('pass_fail', 'yes_no', 'numeric', 'text', 'photo', 'signature', 'multi_choice')",
                name='check_job_template_checklist_answer_type'
            )
        )
        op.create_index('ix_job_template_checklists_template_id', 'job_template_checklists', ['template_id'])
        op.create_index('ix_job_template_checklists_category', 'job_template_checklists', ['category'])

    # 4. job_dependencies - Job dependencies
    if not table_exists('job_dependencies'):
        op.create_table('job_dependencies',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('job_id', sa.Integer(), nullable=False),
            sa.Column('depends_on_job_id', sa.Integer(), nullable=False),
            sa.Column('dependency_type', sa.String(length=30), nullable=False, server_default='finish_to_start'),
            sa.Column('lag_hours', sa.Float(), nullable=True, server_default='0'),
            sa.Column('is_mandatory', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['job_id'], ['work_plan_jobs.id'], name='fk_job_dependencies_job', ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['depends_on_job_id'], ['work_plan_jobs.id'], name='fk_job_dependencies_depends_on', ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('job_id', 'depends_on_job_id', name='uq_job_dependency'),
            sa.CheckConstraint(
                "dependency_type IN ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish')",
                name='check_job_dependency_type'
            ),
            sa.CheckConstraint('job_id != depends_on_job_id', name='check_no_self_dependency')
        )
        op.create_index('ix_job_dependencies_job_id', 'job_dependencies', ['job_id'])
        op.create_index('ix_job_dependencies_depends_on_job_id', 'job_dependencies', ['depends_on_job_id'])

    # 5. capacity_configs - Capacity planning rules
    if not table_exists('capacity_configs'):
        op.create_table('capacity_configs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('name_ar', sa.String(length=100), nullable=True),
            sa.Column('role', sa.String(length=50), nullable=True),
            sa.Column('shift_type', sa.String(length=10), nullable=True),
            sa.Column('max_hours_per_day', sa.Float(), nullable=False, server_default='8'),
            sa.Column('max_jobs_per_day', sa.Integer(), nullable=False, server_default='5'),
            sa.Column('min_rest_hours', sa.Float(), nullable=False, server_default='12'),
            sa.Column('overtime_threshold_hours', sa.Float(), nullable=False, server_default='8'),
            sa.Column('max_overtime_hours', sa.Float(), nullable=True, server_default='4'),
            sa.Column('max_consecutive_days', sa.Integer(), nullable=True, server_default='6'),
            sa.Column('buffer_percentage', sa.Float(), nullable=True, server_default='10'),
            sa.Column('priority_weight', sa.Float(), nullable=True, server_default='1.0'),
            sa.Column('is_default', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('effective_from', sa.Date(), nullable=True),
            sa.Column('effective_to', sa.Date(), nullable=True),
            sa.Column('created_by_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name='fk_capacity_configs_created_by'),
            sa.PrimaryKeyConstraint('id'),
            sa.CheckConstraint(
                "shift_type IN ('day', 'night') OR shift_type IS NULL",
                name='check_capacity_config_shift_type'
            )
        )
        op.create_index('ix_capacity_configs_role', 'capacity_configs', ['role'])
        op.create_index('ix_capacity_configs_shift_type', 'capacity_configs', ['shift_type'])
        op.create_index('ix_capacity_configs_is_active', 'capacity_configs', ['is_active'])

    # 6. worker_skills - Worker skills/certifications
    if not table_exists('worker_skills'):
        op.create_table('worker_skills',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('skill_name', sa.String(length=100), nullable=False),
            sa.Column('skill_name_ar', sa.String(length=100), nullable=True),
            sa.Column('skill_category', sa.String(length=50), nullable=True),
            sa.Column('skill_level', sa.String(length=20), nullable=False, server_default='mid'),
            sa.Column('is_certified', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('certification_name', sa.String(length=200), nullable=True),
            sa.Column('certification_number', sa.String(length=100), nullable=True),
            sa.Column('issuing_authority', sa.String(length=200), nullable=True),
            sa.Column('issued_date', sa.Date(), nullable=True),
            sa.Column('expiry_date', sa.Date(), nullable=True),
            sa.Column('certificate_file_id', sa.Integer(), nullable=True),
            sa.Column('verified', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('verified_by_id', sa.Integer(), nullable=True),
            sa.Column('verified_at', sa.DateTime(), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_worker_skills_user'),
            sa.ForeignKeyConstraint(['certificate_file_id'], ['files.id'], name='fk_worker_skills_certificate_file'),
            sa.ForeignKeyConstraint(['verified_by_id'], ['users.id'], name='fk_worker_skills_verified_by'),
            sa.PrimaryKeyConstraint('id'),
            sa.CheckConstraint(
                "skill_level IN ('junior', 'mid', 'senior', 'expert')",
                name='check_worker_skill_level'
            )
        )
        op.create_index('ix_worker_skills_user_id', 'worker_skills', ['user_id'])
        op.create_index('ix_worker_skills_skill_name', 'worker_skills', ['skill_name'])
        op.create_index('ix_worker_skills_skill_category', 'worker_skills', ['skill_category'])
        op.create_index('ix_worker_skills_expiry_date', 'worker_skills', ['expiry_date'])

    # 7. equipment_restrictions - Equipment restrictions
    if not table_exists('equipment_restrictions'):
        op.create_table('equipment_restrictions',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('equipment_id', sa.Integer(), nullable=False),
            sa.Column('restriction_type', sa.String(length=30), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('description_ar', sa.Text(), nullable=True),
            sa.Column('start_date', sa.Date(), nullable=True),
            sa.Column('end_date', sa.Date(), nullable=True),
            sa.Column('start_time', sa.Time(), nullable=True),
            sa.Column('end_time', sa.Time(), nullable=True),
            sa.Column('days_of_week', sa.JSON(), nullable=True),
            sa.Column('min_skill_level', sa.String(length=20), nullable=True),
            sa.Column('required_certifications', sa.JSON(), nullable=True),
            sa.Column('max_workers', sa.Integer(), nullable=True),
            sa.Column('safety_equipment', sa.JSON(), nullable=True),
            sa.Column('reason', sa.Text(), nullable=True),
            sa.Column('reason_ar', sa.Text(), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_by_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], name='fk_equipment_restrictions_equipment'),
            sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name='fk_equipment_restrictions_created_by'),
            sa.PrimaryKeyConstraint('id'),
            sa.CheckConstraint(
                "restriction_type IN ('time_window', 'skill_requirement', 'capacity_limit', 'certification_required', 'safety', 'operational', 'other')",
                name='check_equipment_restriction_type'
            )
        )
        op.create_index('ix_equipment_restrictions_equipment_id', 'equipment_restrictions', ['equipment_id'])
        op.create_index('ix_equipment_restrictions_restriction_type', 'equipment_restrictions', ['restriction_type'])
        op.create_index('ix_equipment_restrictions_is_active', 'equipment_restrictions', ['is_active'])

    # 8. work_plan_versions - Plan version history
    if not table_exists('work_plan_versions'):
        op.create_table('work_plan_versions',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('work_plan_id', sa.Integer(), nullable=False),
            sa.Column('version_number', sa.Integer(), nullable=False),
            sa.Column('version_type', sa.String(length=20), nullable=False, server_default='minor'),
            sa.Column('snapshot_data', sa.JSON(), nullable=False),
            sa.Column('change_summary', sa.Text(), nullable=True),
            sa.Column('change_summary_ar', sa.Text(), nullable=True),
            sa.Column('changes', sa.JSON(), nullable=True),
            sa.Column('jobs_added', sa.Integer(), server_default='0', nullable=False),
            sa.Column('jobs_removed', sa.Integer(), server_default='0', nullable=False),
            sa.Column('jobs_modified', sa.Integer(), server_default='0', nullable=False),
            sa.Column('created_by_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['work_plan_id'], ['work_plans.id'], name='fk_work_plan_versions_work_plan', ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name='fk_work_plan_versions_created_by'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('work_plan_id', 'version_number', name='uq_work_plan_version'),
            sa.CheckConstraint(
                "version_type IN ('draft', 'minor', 'major', 'published', 'archived')",
                name='check_work_plan_version_type'
            )
        )
        op.create_index('ix_work_plan_versions_work_plan_id', 'work_plan_versions', ['work_plan_id'])
        op.create_index('ix_work_plan_versions_version_number', 'work_plan_versions', ['version_number'])
        op.create_index('ix_work_plan_versions_created_at', 'work_plan_versions', ['created_at'])

    # 9. job_checklist_responses - Checklist responses
    if not table_exists('job_checklist_responses'):
        op.create_table('job_checklist_responses',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('work_plan_job_id', sa.Integer(), nullable=False),
            sa.Column('checklist_item_id', sa.Integer(), nullable=False),
            sa.Column('response_value', sa.String(length=500), nullable=True),
            sa.Column('numeric_value', sa.Float(), nullable=True),
            sa.Column('is_passed', sa.Boolean(), nullable=True),
            sa.Column('comments', sa.Text(), nullable=True),
            sa.Column('photo_file_id', sa.Integer(), nullable=True),
            sa.Column('signature_file_id', sa.Integer(), nullable=True),
            sa.Column('responded_by_id', sa.Integer(), nullable=True),
            sa.Column('responded_at', sa.DateTime(), nullable=True),
            sa.Column('reviewed_by_id', sa.Integer(), nullable=True),
            sa.Column('reviewed_at', sa.DateTime(), nullable=True),
            sa.Column('review_notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['work_plan_job_id'], ['work_plan_jobs.id'], name='fk_job_checklist_responses_job', ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['checklist_item_id'], ['job_template_checklists.id'], name='fk_job_checklist_responses_checklist_item'),
            sa.ForeignKeyConstraint(['photo_file_id'], ['files.id'], name='fk_job_checklist_responses_photo'),
            sa.ForeignKeyConstraint(['signature_file_id'], ['files.id'], name='fk_job_checklist_responses_signature'),
            sa.ForeignKeyConstraint(['responded_by_id'], ['users.id'], name='fk_job_checklist_responses_responded_by'),
            sa.ForeignKeyConstraint(['reviewed_by_id'], ['users.id'], name='fk_job_checklist_responses_reviewed_by'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('work_plan_job_id', 'checklist_item_id', name='uq_job_checklist_response')
        )
        op.create_index('ix_job_checklist_responses_work_plan_job_id', 'job_checklist_responses', ['work_plan_job_id'])
        op.create_index('ix_job_checklist_responses_checklist_item_id', 'job_checklist_responses', ['checklist_item_id'])
        op.create_index('ix_job_checklist_responses_is_passed', 'job_checklist_responses', ['is_passed'])

    # 10. scheduling_conflicts - Conflict tracking
    if not table_exists('scheduling_conflicts'):
        op.create_table('scheduling_conflicts',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('work_plan_id', sa.Integer(), nullable=False),
            sa.Column('conflict_type', sa.String(length=30), nullable=False),
            sa.Column('severity', sa.String(length=20), nullable=False, server_default='warning'),
            sa.Column('description', sa.Text(), nullable=False),
            sa.Column('description_ar', sa.Text(), nullable=True),
            sa.Column('affected_job_ids', sa.JSON(), nullable=True),
            sa.Column('affected_user_ids', sa.JSON(), nullable=True),
            sa.Column('affected_equipment_ids', sa.JSON(), nullable=True),
            sa.Column('conflict_date', sa.Date(), nullable=True),
            sa.Column('conflict_start_time', sa.Time(), nullable=True),
            sa.Column('conflict_end_time', sa.Time(), nullable=True),
            sa.Column('resolution_suggestion', sa.Text(), nullable=True),
            sa.Column('resolution_suggestion_ar', sa.Text(), nullable=True),
            sa.Column('status', sa.String(length=20), server_default='open', nullable=False),
            sa.Column('resolved_by_id', sa.Integer(), nullable=True),
            sa.Column('resolved_at', sa.DateTime(), nullable=True),
            sa.Column('resolution_notes', sa.Text(), nullable=True),
            sa.Column('auto_detected', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['work_plan_id'], ['work_plans.id'], name='fk_scheduling_conflicts_work_plan', ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['resolved_by_id'], ['users.id'], name='fk_scheduling_conflicts_resolved_by'),
            sa.PrimaryKeyConstraint('id'),
            sa.CheckConstraint(
                "conflict_type IN ('time_overlap', 'capacity_exceeded', 'skill_mismatch', 'equipment_unavailable', 'leave_conflict', 'dependency_violation', 'blackout_violation', 'other')",
                name='check_scheduling_conflict_type'
            ),
            sa.CheckConstraint(
                "severity IN ('info', 'warning', 'error', 'critical')",
                name='check_scheduling_conflict_severity'
            ),
            sa.CheckConstraint(
                "status IN ('open', 'acknowledged', 'resolved', 'ignored')",
                name='check_scheduling_conflict_status'
            )
        )
        op.create_index('ix_scheduling_conflicts_work_plan_id', 'scheduling_conflicts', ['work_plan_id'])
        op.create_index('ix_scheduling_conflicts_conflict_type', 'scheduling_conflicts', ['conflict_type'])
        op.create_index('ix_scheduling_conflicts_severity', 'scheduling_conflicts', ['severity'])
        op.create_index('ix_scheduling_conflicts_status', 'scheduling_conflicts', ['status'])
        op.create_index('ix_scheduling_conflicts_conflict_date', 'scheduling_conflicts', ['conflict_date'])

    # =============================================
    # ALTER EXISTING TABLES
    # =============================================

    # ALTER leaves table - Add new columns for enhanced leave management
    with op.batch_alter_table('leaves', schema=None) as batch_op:
        if not column_exists('leaves', 'leave_type_id'):
            batch_op.add_column(sa.Column('leave_type_id', sa.Integer(), nullable=True))
        if not column_exists('leaves', 'is_half_day'):
            batch_op.add_column(sa.Column('is_half_day', sa.Boolean(), server_default='false', nullable=False))
        if not column_exists('leaves', 'half_day_period'):
            batch_op.add_column(sa.Column('half_day_period', sa.String(length=10), nullable=True))
        if not column_exists('leaves', 'requested_hours'):
            batch_op.add_column(sa.Column('requested_hours', sa.Float(), nullable=True))
        if not column_exists('leaves', 'certificate_file_id'):
            batch_op.add_column(sa.Column('certificate_file_id', sa.Integer(), nullable=True))
        if not column_exists('leaves', 'cancellation_requested'):
            batch_op.add_column(sa.Column('cancellation_requested', sa.Boolean(), server_default='false', nullable=False))
        if not column_exists('leaves', 'cancellation_reason'):
            batch_op.add_column(sa.Column('cancellation_reason', sa.Text(), nullable=True))
        if not column_exists('leaves', 'cancelled_at'):
            batch_op.add_column(sa.Column('cancelled_at', sa.DateTime(), nullable=True))
        if not column_exists('leaves', 'extension_of_id'):
            batch_op.add_column(sa.Column('extension_of_id', sa.Integer(), nullable=True))

    # Add foreign keys for leaves table (separate batch operation for safety)
    with op.batch_alter_table('leaves', schema=None) as batch_op:
        try:
            batch_op.create_foreign_key('fk_leaves_leave_type', 'leave_types', ['leave_type_id'], ['id'])
        except:
            pass
        try:
            batch_op.create_foreign_key('fk_leaves_certificate_file', 'files', ['certificate_file_id'], ['id'])
        except:
            pass
        try:
            batch_op.create_foreign_key('fk_leaves_extension_of', 'leaves', ['extension_of_id'], ['id'])
        except:
            pass

    # Create indexes for leaves
    try:
        op.create_index('ix_leaves_leave_type_id', 'leaves', ['leave_type_id'])
    except:
        pass
    try:
        op.create_index('ix_leaves_is_half_day', 'leaves', ['is_half_day'])
    except:
        pass

    # ALTER work_plan_jobs table - Add new columns for enhanced work planning
    with op.batch_alter_table('work_plan_jobs', schema=None) as batch_op:
        if not column_exists('work_plan_jobs', 'template_id'):
            batch_op.add_column(sa.Column('template_id', sa.Integer(), nullable=True))
        if not column_exists('work_plan_jobs', 'checklist_required'):
            batch_op.add_column(sa.Column('checklist_required', sa.Boolean(), server_default='false', nullable=False))
        if not column_exists('work_plan_jobs', 'checklist_completed'):
            batch_op.add_column(sa.Column('checklist_completed', sa.Boolean(), server_default='false', nullable=False))
        if not column_exists('work_plan_jobs', 'completion_photo_required'):
            batch_op.add_column(sa.Column('completion_photo_required', sa.Boolean(), server_default='false', nullable=False))
        if not column_exists('work_plan_jobs', 'weather_sensitive'):
            batch_op.add_column(sa.Column('weather_sensitive', sa.Boolean(), server_default='false', nullable=False))
        if not column_exists('work_plan_jobs', 'is_split'):
            batch_op.add_column(sa.Column('is_split', sa.Boolean(), server_default='false', nullable=False))
        if not column_exists('work_plan_jobs', 'split_from_id'):
            batch_op.add_column(sa.Column('split_from_id', sa.Integer(), nullable=True))
        if not column_exists('work_plan_jobs', 'split_part'):
            batch_op.add_column(sa.Column('split_part', sa.Integer(), nullable=True))
        if not column_exists('work_plan_jobs', 'actual_start_time'):
            batch_op.add_column(sa.Column('actual_start_time', sa.DateTime(), nullable=True))
        if not column_exists('work_plan_jobs', 'actual_end_time'):
            batch_op.add_column(sa.Column('actual_end_time', sa.DateTime(), nullable=True))

    # Add foreign keys for work_plan_jobs table
    with op.batch_alter_table('work_plan_jobs', schema=None) as batch_op:
        try:
            batch_op.create_foreign_key('fk_work_plan_jobs_template', 'job_templates', ['template_id'], ['id'])
        except:
            pass
        try:
            batch_op.create_foreign_key('fk_work_plan_jobs_split_from', 'work_plan_jobs', ['split_from_id'], ['id'])
        except:
            pass

    # Create indexes for work_plan_jobs
    try:
        op.create_index('ix_work_plan_jobs_template_id', 'work_plan_jobs', ['template_id'])
    except:
        pass
    try:
        op.create_index('ix_work_plan_jobs_is_split', 'work_plan_jobs', ['is_split'])
    except:
        pass

    # =============================================
    # SEED DATA
    # =============================================

    # Seed default leave types
    op.execute("""
        INSERT INTO leave_types (code, name, name_ar, color, requires_certificate, certificate_after_days, max_days_per_year, is_system, sort_order, is_active, created_at, updated_at)
        VALUES
        ('sick', 'Sick Leave', 'إجازة مرضية', 'red', true, 3, NULL, true, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('annual', 'Annual Leave', 'إجازة سنوية', 'blue', false, NULL, 30, true, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('emergency', 'Emergency Leave', 'إجازة طارئة', 'orange', false, NULL, 5, true, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('training', 'Training Leave', 'إجازة تدريب', 'purple', false, NULL, NULL, true, 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('other', 'Other Leave', 'إجازة أخرى', 'gray', false, NULL, NULL, true, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (code) DO NOTHING
    """)

    # Seed default capacity config
    op.execute("""
        INSERT INTO capacity_configs (name, name_ar, max_hours_per_day, max_jobs_per_day, min_rest_hours, overtime_threshold_hours, is_default, is_active, created_at, updated_at)
        VALUES
        ('Default Configuration', 'التكوين الافتراضي', 8, 5, 12, 8, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT DO NOTHING
    """)


def downgrade():
    # =============================================
    # REMOVE INDEXES AND FOREIGN KEYS FROM ALTERED TABLES
    # =============================================

    # Remove indexes from work_plan_jobs
    try:
        op.drop_index('ix_work_plan_jobs_is_split', table_name='work_plan_jobs')
    except:
        pass
    try:
        op.drop_index('ix_work_plan_jobs_template_id', table_name='work_plan_jobs')
    except:
        pass

    # Remove foreign keys and columns from work_plan_jobs
    with op.batch_alter_table('work_plan_jobs', schema=None) as batch_op:
        try:
            batch_op.drop_constraint('fk_work_plan_jobs_split_from', type_='foreignkey')
        except:
            pass
        try:
            batch_op.drop_constraint('fk_work_plan_jobs_template', type_='foreignkey')
        except:
            pass
        try:
            batch_op.drop_column('actual_end_time')
        except:
            pass
        try:
            batch_op.drop_column('actual_start_time')
        except:
            pass
        try:
            batch_op.drop_column('split_part')
        except:
            pass
        try:
            batch_op.drop_column('split_from_id')
        except:
            pass
        try:
            batch_op.drop_column('is_split')
        except:
            pass
        try:
            batch_op.drop_column('weather_sensitive')
        except:
            pass
        try:
            batch_op.drop_column('completion_photo_required')
        except:
            pass
        try:
            batch_op.drop_column('checklist_completed')
        except:
            pass
        try:
            batch_op.drop_column('checklist_required')
        except:
            pass
        try:
            batch_op.drop_column('template_id')
        except:
            pass

    # Remove indexes from leaves
    try:
        op.drop_index('ix_leaves_is_half_day', table_name='leaves')
    except:
        pass
    try:
        op.drop_index('ix_leaves_leave_type_id', table_name='leaves')
    except:
        pass

    # Remove foreign keys and columns from leaves
    with op.batch_alter_table('leaves', schema=None) as batch_op:
        try:
            batch_op.drop_constraint('fk_leaves_extension_of', type_='foreignkey')
        except:
            pass
        try:
            batch_op.drop_constraint('fk_leaves_certificate_file', type_='foreignkey')
        except:
            pass
        try:
            batch_op.drop_constraint('fk_leaves_leave_type', type_='foreignkey')
        except:
            pass
        try:
            batch_op.drop_column('extension_of_id')
        except:
            pass
        try:
            batch_op.drop_column('cancelled_at')
        except:
            pass
        try:
            batch_op.drop_column('cancellation_reason')
        except:
            pass
        try:
            batch_op.drop_column('cancellation_requested')
        except:
            pass
        try:
            batch_op.drop_column('certificate_file_id')
        except:
            pass
        try:
            batch_op.drop_column('requested_hours')
        except:
            pass
        try:
            batch_op.drop_column('half_day_period')
        except:
            pass
        try:
            batch_op.drop_column('is_half_day')
        except:
            pass
        try:
            batch_op.drop_column('leave_type_id')
        except:
            pass

    # =============================================
    # DROP WORK PLANNING TABLES (reverse order)
    # =============================================

    # 10. scheduling_conflicts
    op.drop_index('ix_scheduling_conflicts_conflict_date', table_name='scheduling_conflicts')
    op.drop_index('ix_scheduling_conflicts_status', table_name='scheduling_conflicts')
    op.drop_index('ix_scheduling_conflicts_severity', table_name='scheduling_conflicts')
    op.drop_index('ix_scheduling_conflicts_conflict_type', table_name='scheduling_conflicts')
    op.drop_index('ix_scheduling_conflicts_work_plan_id', table_name='scheduling_conflicts')
    op.drop_table('scheduling_conflicts')

    # 9. job_checklist_responses
    op.drop_index('ix_job_checklist_responses_is_passed', table_name='job_checklist_responses')
    op.drop_index('ix_job_checklist_responses_checklist_item_id', table_name='job_checklist_responses')
    op.drop_index('ix_job_checklist_responses_work_plan_job_id', table_name='job_checklist_responses')
    op.drop_table('job_checklist_responses')

    # 8. work_plan_versions
    op.drop_index('ix_work_plan_versions_created_at', table_name='work_plan_versions')
    op.drop_index('ix_work_plan_versions_version_number', table_name='work_plan_versions')
    op.drop_index('ix_work_plan_versions_work_plan_id', table_name='work_plan_versions')
    op.drop_table('work_plan_versions')

    # 7. equipment_restrictions
    op.drop_index('ix_equipment_restrictions_is_active', table_name='equipment_restrictions')
    op.drop_index('ix_equipment_restrictions_restriction_type', table_name='equipment_restrictions')
    op.drop_index('ix_equipment_restrictions_equipment_id', table_name='equipment_restrictions')
    op.drop_table('equipment_restrictions')

    # 6. worker_skills
    op.drop_index('ix_worker_skills_expiry_date', table_name='worker_skills')
    op.drop_index('ix_worker_skills_skill_category', table_name='worker_skills')
    op.drop_index('ix_worker_skills_skill_name', table_name='worker_skills')
    op.drop_index('ix_worker_skills_user_id', table_name='worker_skills')
    op.drop_table('worker_skills')

    # 5. capacity_configs
    op.drop_index('ix_capacity_configs_is_active', table_name='capacity_configs')
    op.drop_index('ix_capacity_configs_shift_type', table_name='capacity_configs')
    op.drop_index('ix_capacity_configs_role', table_name='capacity_configs')
    op.drop_table('capacity_configs')

    # 4. job_dependencies
    op.drop_index('ix_job_dependencies_depends_on_job_id', table_name='job_dependencies')
    op.drop_index('ix_job_dependencies_job_id', table_name='job_dependencies')
    op.drop_table('job_dependencies')

    # 3. job_template_checklists
    op.drop_index('ix_job_template_checklists_category', table_name='job_template_checklists')
    op.drop_index('ix_job_template_checklists_template_id', table_name='job_template_checklists')
    op.drop_table('job_template_checklists')

    # 2. job_template_materials
    op.drop_index('ix_job_template_materials_material_id', table_name='job_template_materials')
    op.drop_index('ix_job_template_materials_template_id', table_name='job_template_materials')
    op.drop_table('job_template_materials')

    # 1. job_templates
    op.drop_index('ix_job_templates_is_active', table_name='job_templates')
    op.drop_index('ix_job_templates_equipment_type', table_name='job_templates')
    op.drop_index('ix_job_templates_job_type', table_name='job_templates')
    op.drop_index('ix_job_templates_code', table_name='job_templates')
    op.drop_table('job_templates')

    # =============================================
    # DROP LEAVE TABLES (reverse order)
    # =============================================

    # 8. leave_encashments
    op.drop_index('ix_leave_encashments_status', table_name='leave_encashments')
    op.drop_index('ix_leave_encashments_year', table_name='leave_encashments')
    op.drop_index('ix_leave_encashments_leave_type_id', table_name='leave_encashments')
    op.drop_index('ix_leave_encashments_user_id', table_name='leave_encashments')
    op.drop_table('leave_encashments')

    # 7. compensatory_leaves
    op.drop_index('ix_compensatory_leaves_expiry_date', table_name='compensatory_leaves')
    op.drop_index('ix_compensatory_leaves_status', table_name='compensatory_leaves')
    op.drop_index('ix_compensatory_leaves_earned_date', table_name='compensatory_leaves')
    op.drop_index('ix_compensatory_leaves_user_id', table_name='compensatory_leaves')
    op.drop_table('compensatory_leaves')

    # 6. leave_approval_levels
    op.drop_index('ix_leave_approval_levels_status', table_name='leave_approval_levels')
    op.drop_index('ix_leave_approval_levels_approver_id', table_name='leave_approval_levels')
    op.drop_index('ix_leave_approval_levels_leave_id', table_name='leave_approval_levels')
    op.drop_table('leave_approval_levels')

    # 5. leave_calendar
    op.drop_index('ix_leave_calendar_holiday_type', table_name='leave_calendar')
    op.drop_index('ix_leave_calendar_year', table_name='leave_calendar')
    op.drop_index('ix_leave_calendar_date', table_name='leave_calendar')
    op.drop_table('leave_calendar')

    # 4. leave_blackouts
    op.drop_index('ix_leave_blackouts_is_active', table_name='leave_blackouts')
    op.drop_index('ix_leave_blackouts_end_date', table_name='leave_blackouts')
    op.drop_index('ix_leave_blackouts_start_date', table_name='leave_blackouts')
    op.drop_table('leave_blackouts')

    # 3. leave_balance_history
    op.drop_index('ix_leave_balance_history_change_type', table_name='leave_balance_history')
    op.drop_index('ix_leave_balance_history_year', table_name='leave_balance_history')
    op.drop_index('ix_leave_balance_history_leave_type_id', table_name='leave_balance_history')
    op.drop_index('ix_leave_balance_history_user_id', table_name='leave_balance_history')
    op.drop_table('leave_balance_history')

    # 2. leave_policies
    op.drop_index('ix_leave_policies_leave_type_id', table_name='leave_policies')
    op.drop_index('ix_leave_policies_role', table_name='leave_policies')
    op.drop_table('leave_policies')

    # 1. leave_types
    op.drop_index('ix_leave_types_is_active', table_name='leave_types')
    op.drop_index('ix_leave_types_code', table_name='leave_types')
    op.drop_table('leave_types')
