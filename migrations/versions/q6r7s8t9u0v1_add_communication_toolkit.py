"""Add team communication and toolkit tables.

Revision ID: q6r7s8t9u0v1
Revises: p5q6r7s8t9u0
Create Date: 2026-02-12 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'q6r7s8t9u0v1'
down_revision = 'p5q6r7s8t9u0'
branch_labels = None
depends_on = None


def upgrade():
    # Team Channels
    op.create_table('team_channels',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('channel_type', sa.String(length=30), nullable=False, server_default='general'),
        sa.Column('shift', sa.String(length=20), nullable=True),
        sa.Column('role_filter', sa.String(length=30), nullable=True),
        sa.Column('job_id', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('is_default', sa.Boolean(), server_default='false'),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_team_channels_type', 'team_channels', ['channel_type'])
    op.create_index('ix_team_channels_active', 'team_channels', ['is_active'])

    # Channel Members
    op.create_table('channel_members',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('channel_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=20), server_default='member'),
        sa.Column('is_muted', sa.Boolean(), server_default='false'),
        sa.Column('last_read_at', sa.DateTime(), nullable=True),
        sa.Column('joined_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['channel_id'], ['team_channels.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('channel_id', 'user_id', name='uq_channel_member')
    )
    op.create_index('ix_channel_members_user', 'channel_members', ['user_id'])
    op.create_index('ix_channel_members_channel', 'channel_members', ['channel_id'])

    # Team Messages
    op.create_table('team_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('channel_id', sa.Integer(), nullable=False),
        sa.Column('sender_id', sa.Integer(), nullable=False),
        sa.Column('message_type', sa.String(length=20), nullable=False, server_default='text'),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('media_url', sa.String(length=500), nullable=True),
        sa.Column('media_thumbnail', sa.String(length=500), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('location_lat', sa.Float(), nullable=True),
        sa.Column('location_lng', sa.Float(), nullable=True),
        sa.Column('location_label', sa.String(length=200), nullable=True),
        sa.Column('is_priority', sa.Boolean(), server_default='false'),
        sa.Column('is_translated', sa.Boolean(), server_default='false'),
        sa.Column('original_language', sa.String(length=5), nullable=True),
        sa.Column('translated_content', sa.Text(), nullable=True),
        sa.Column('reply_to_id', sa.Integer(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['channel_id'], ['team_channels.id'], ),
        sa.ForeignKeyConstraint(['sender_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['reply_to_id'], ['team_messages.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_team_messages_channel', 'team_messages', ['channel_id'])
    op.create_index('ix_team_messages_sender', 'team_messages', ['sender_id'])
    op.create_index('ix_team_messages_created', 'team_messages', ['created_at'])

    # Message Read Receipts
    op.create_table('message_read_receipts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('message_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('read_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['message_id'], ['team_messages.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('message_id', 'user_id', name='uq_message_read')
    )

    # Toolkit Preferences
    op.create_table('toolkit_preferences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('simple_mode_enabled', sa.Boolean(), server_default='false'),
        sa.Column('fab_enabled', sa.Boolean(), server_default='true'),
        sa.Column('fab_position', sa.String(length=20), server_default='bottom-right'),
        sa.Column('persistent_notification', sa.Boolean(), server_default='true'),
        sa.Column('voice_commands_enabled', sa.Boolean(), server_default='false'),
        sa.Column('voice_language', sa.String(length=5), server_default='en'),
        sa.Column('shake_to_pause', sa.Boolean(), server_default='false'),
        sa.Column('nfc_enabled', sa.Boolean(), server_default='true'),
        sa.Column('widget_enabled', sa.Boolean(), server_default='true'),
        sa.Column('smartwatch_enabled', sa.Boolean(), server_default='false'),
        sa.Column('quick_camera_enabled', sa.Boolean(), server_default='true'),
        sa.Column('barcode_scanner_enabled', sa.Boolean(), server_default='true'),
        sa.Column('voice_checklist_enabled', sa.Boolean(), server_default='false'),
        sa.Column('auto_location_enabled', sa.Boolean(), server_default='true'),
        sa.Column('team_map_enabled', sa.Boolean(), server_default='false'),
        sa.Column('voice_review_enabled', sa.Boolean(), server_default='false'),
        sa.Column('red_zone_alerts', sa.Boolean(), server_default='true'),
        sa.Column('photo_compare_enabled', sa.Boolean(), server_default='true'),
        sa.Column('voice_rating_enabled', sa.Boolean(), server_default='false'),
        sa.Column('punch_list_enabled', sa.Boolean(), server_default='true'),
        sa.Column('morning_brief_enabled', sa.Boolean(), server_default='true'),
        sa.Column('kpi_alerts_enabled', sa.Boolean(), server_default='true'),
        sa.Column('emergency_broadcast', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )


def downgrade():
    op.drop_table('toolkit_preferences')
    op.drop_table('message_read_receipts')
    op.drop_table('team_messages')
    op.drop_table('channel_members')
    op.drop_table('team_channels')
