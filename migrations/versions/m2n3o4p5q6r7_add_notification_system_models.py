"""Add notification system models and enhanced fields

Revision ID: m2n3o4p5q6r7
Revises: l1m2n3o4p5q6
Create Date: 2025-02-09 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'm2n3o4p5q6r7'
down_revision = 'l1m2n3o4p5q6'
branch_labels = None
depends_on = None


def upgrade():
    # =============================================
    # 1. Create notification_groups table FIRST (Notification depends on it)
    # =============================================
    op.create_table('notification_groups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('group_key', sa.String(length=200), nullable=False),
        sa.Column('group_type', sa.String(length=50), nullable=False),
        sa.Column('notification_ids', sa.JSON(), nullable=False),
        sa.Column('summary_title', sa.String(length=500), nullable=False),
        sa.Column('summary_title_ar', sa.String(length=500), nullable=True),
        sa.Column('summary_message', sa.Text(), nullable=True),
        sa.Column('summary_message_ar', sa.Text(), nullable=True),
        sa.Column('is_expanded', sa.Boolean(), nullable=True, default=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("group_type IN ('similar', 'related', 'digest')", name='check_valid_group_type')
    )
    op.create_index('ix_notification_groups_user', 'notification_groups', ['user_id'])
    op.create_index('ix_notification_groups_key', 'notification_groups', ['group_key'])
    op.create_index('ix_notification_groups_user_key', 'notification_groups', ['user_id', 'group_key'])

    # =============================================
    # 2. Add new columns to notifications table (using batch mode for SQLite)
    # =============================================
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.add_column(sa.Column('snoozed_until', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('scheduled_for', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('expires_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('acknowledged_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('requires_acknowledgment', sa.Boolean(), nullable=True, default=False))
        batch_op.add_column(sa.Column('source_type', sa.String(length=20), nullable=True, server_default='system'))
        batch_op.add_column(sa.Column('group_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('parent_notification_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('extra_data', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('delivery_status', sa.String(length=20), nullable=True, server_default='pending'))
        batch_op.add_column(sa.Column('channel', sa.String(length=20), nullable=True))
        batch_op.create_index('ix_notifications_user_delivery_status', ['user_id', 'delivery_status'])
        batch_op.create_index('ix_notifications_expires_at', ['expires_at'])
        batch_op.create_index('ix_notifications_scheduled_for', ['scheduled_for'])
        batch_op.create_foreign_key('fk_notifications_group_id', 'notification_groups', ['group_id'], ['id'])
        batch_op.create_foreign_key('fk_notifications_parent_id', 'notifications', ['parent_notification_id'], ['id'])

    # =============================================
    # 3. Create notification_preferences table
    # =============================================
    op.create_table('notification_preferences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('notification_type', sa.String(length=100), nullable=False),
        sa.Column('channels', sa.JSON(), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), nullable=True, default=True),
        sa.Column('sound_type', sa.String(length=20), nullable=True, default='default'),
        sa.Column('do_not_disturb_start', sa.Time(), nullable=True),
        sa.Column('do_not_disturb_end', sa.Time(), nullable=True),
        sa.Column('digest_mode', sa.String(length=20), nullable=True, default='instant'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'notification_type', name='unique_user_notification_type'),
        sa.CheckConstraint("sound_type IN ('default', 'chime', 'urgent', 'silent')", name='check_valid_sound_type'),
        sa.CheckConstraint("digest_mode IN ('instant', 'hourly', 'daily', 'weekly')", name='check_valid_digest_mode')
    )
    op.create_index('ix_notification_preferences_user_type', 'notification_preferences', ['user_id', 'notification_type'])

    # =============================================
    # 4. Create notification_schedules table
    # =============================================
    op.create_table('notification_schedules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('notification_id', sa.Integer(), nullable=False),
        sa.Column('scheduled_for', sa.DateTime(), nullable=True),
        sa.Column('snooze_until', sa.DateTime(), nullable=True),
        sa.Column('is_delivered', sa.Boolean(), nullable=True, default=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['notification_id'], ['notifications.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_notification_schedules_scheduled_for', 'notification_schedules', ['scheduled_for'])
    op.create_index('ix_notification_schedules_snooze_until', 'notification_schedules', ['snooze_until'])
    op.create_index('ix_notification_schedules_pending', 'notification_schedules', ['is_delivered', 'scheduled_for'])

    # =============================================
    # 5. Create notification_escalations table
    # =============================================
    op.create_table('notification_escalations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('notification_id', sa.Integer(), nullable=False),
        sa.Column('escalation_level', sa.Integer(), nullable=False, default=1),
        sa.Column('escalated_to_user_id', sa.Integer(), nullable=False),
        sa.Column('escalated_at', sa.DateTime(), nullable=True),
        sa.Column('acknowledged_at', sa.DateTime(), nullable=True),
        sa.Column('escalation_reason', sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(['notification_id'], ['notifications.id'], ),
        sa.ForeignKeyConstraint(['escalated_to_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("escalation_reason IN ('unread_timeout', 'manual', 'critical_priority')", name='check_valid_escalation_reason')
    )
    op.create_index('ix_notification_escalations_notification', 'notification_escalations', ['notification_id'])
    op.create_index('ix_notification_escalations_user', 'notification_escalations', ['escalated_to_user_id'])

    # =============================================
    # 6. Create notification_rules table
    # =============================================
    op.create_table('notification_rules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('name_ar', sa.String(length=200), nullable=True),
        sa.Column('trigger_type', sa.String(length=50), nullable=False),
        sa.Column('trigger_config', sa.JSON(), nullable=False),
        sa.Column('action_config', sa.JSON(), nullable=False),
        sa.Column('target_users', sa.JSON(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
        sa.Column('created_by_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("trigger_type IN ('threshold', 'condition', 'schedule')", name='check_valid_trigger_type')
    )
    op.create_index('ix_notification_rules_active', 'notification_rules', ['is_active'])
    op.create_index('ix_notification_rules_trigger_type', 'notification_rules', ['trigger_type'])

    # =============================================
    # 7. Create notification_analytics table
    # =============================================
    op.create_table('notification_analytics',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('notification_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('delivered_at', sa.DateTime(), nullable=False),
        sa.Column('read_at', sa.DateTime(), nullable=True),
        sa.Column('clicked_at', sa.DateTime(), nullable=True),
        sa.Column('action_taken', sa.String(length=50), nullable=True),
        sa.Column('action_taken_at', sa.DateTime(), nullable=True),
        sa.Column('response_time_seconds', sa.Integer(), nullable=True),
        sa.Column('channel', sa.String(length=20), nullable=False),
        sa.ForeignKeyConstraint(['notification_id'], ['notifications.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("channel IN ('in_app', 'email', 'sms', 'push')", name='check_valid_analytics_channel'),
        sa.CheckConstraint("action_taken IN ('approved', 'rejected', 'navigated', 'dismissed') OR action_taken IS NULL", name='check_valid_action_taken')
    )
    op.create_index('ix_notification_analytics_notification', 'notification_analytics', ['notification_id'])
    op.create_index('ix_notification_analytics_user_delivered', 'notification_analytics', ['user_id', 'delivered_at'])
    op.create_index('ix_notification_analytics_channel', 'notification_analytics', ['channel'])

    # =============================================
    # 8. Create notification_templates table
    # =============================================
    op.create_table('notification_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('notification_type', sa.String(length=100), nullable=False),
        sa.Column('title_template', sa.String(length=500), nullable=False),
        sa.Column('title_template_ar', sa.String(length=500), nullable=True),
        sa.Column('message_template', sa.Text(), nullable=False),
        sa.Column('message_template_ar', sa.Text(), nullable=True),
        sa.Column('default_priority', sa.String(length=20), nullable=True, default='info'),
        sa.Column('default_channels', sa.JSON(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('notification_type', name='unique_notification_type'),
        sa.CheckConstraint("default_priority IN ('info', 'warning', 'urgent', 'critical')", name='check_valid_template_priority')
    )
    op.create_index('ix_notification_templates_type', 'notification_templates', ['notification_type'])
    op.create_index('ix_notification_templates_active', 'notification_templates', ['is_active'])


def downgrade():
    # Drop tables in reverse order (respecting foreign key dependencies)

    # 8. Drop notification_templates
    op.drop_index('ix_notification_templates_active', table_name='notification_templates')
    op.drop_index('ix_notification_templates_type', table_name='notification_templates')
    op.drop_table('notification_templates')

    # 7. Drop notification_analytics
    op.drop_index('ix_notification_analytics_channel', table_name='notification_analytics')
    op.drop_index('ix_notification_analytics_user_delivered', table_name='notification_analytics')
    op.drop_index('ix_notification_analytics_notification', table_name='notification_analytics')
    op.drop_table('notification_analytics')

    # 6. Drop notification_rules
    op.drop_index('ix_notification_rules_trigger_type', table_name='notification_rules')
    op.drop_index('ix_notification_rules_active', table_name='notification_rules')
    op.drop_table('notification_rules')

    # 5. Drop notification_escalations
    op.drop_index('ix_notification_escalations_user', table_name='notification_escalations')
    op.drop_index('ix_notification_escalations_notification', table_name='notification_escalations')
    op.drop_table('notification_escalations')

    # 4. Drop notification_schedules
    op.drop_index('ix_notification_schedules_pending', table_name='notification_schedules')
    op.drop_index('ix_notification_schedules_snooze_until', table_name='notification_schedules')
    op.drop_index('ix_notification_schedules_scheduled_for', table_name='notification_schedules')
    op.drop_table('notification_schedules')

    # 3. Drop notification_preferences
    op.drop_index('ix_notification_preferences_user_type', table_name='notification_preferences')
    op.drop_table('notification_preferences')

    # 2. Remove new columns from notifications table (using batch mode for SQLite)
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.drop_index('ix_notifications_scheduled_for')
        batch_op.drop_index('ix_notifications_expires_at')
        batch_op.drop_index('ix_notifications_user_delivery_status')
        batch_op.drop_constraint('fk_notifications_parent_id', type_='foreignkey')
        batch_op.drop_constraint('fk_notifications_group_id', type_='foreignkey')
        batch_op.drop_column('channel')
        batch_op.drop_column('delivery_status')
        batch_op.drop_column('extra_data')
        batch_op.drop_column('parent_notification_id')
        batch_op.drop_column('group_id')
        batch_op.drop_column('source_type')
        batch_op.drop_column('requires_acknowledgment')
        batch_op.drop_column('acknowledged_at')
        batch_op.drop_column('expires_at')
        batch_op.drop_column('scheduled_for')
        batch_op.drop_column('snoozed_until')

    # 1. Drop notification_groups (last, because notifications references it)
    op.drop_index('ix_notification_groups_user_key', table_name='notification_groups')
    op.drop_index('ix_notification_groups_key', table_name='notification_groups')
    op.drop_index('ix_notification_groups_user', table_name='notification_groups')
    op.drop_table('notification_groups')
