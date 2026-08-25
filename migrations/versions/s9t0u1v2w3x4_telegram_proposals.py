"""The bot learns to ask: questions and the phones they landed on

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-08-25

Two tables. `telegram_proposals` is one row per question the bot asked;
`telegram_proposal_messages` is one row per phone it landed on, which is the
only way to grey out the other copies once somebody has decided.

Both are new tables — nothing to backfill, nothing existing to break.
"""
from alembic import op
import sqlalchemy as sa

revision = 's9t0u1v2w3x4'
down_revision = 'r8s9t0u1v2w3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'telegram_proposals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=40), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('options', sa.JSON(), nullable=False),
        sa.Column('work_plan_id', sa.Integer(), nullable=True),
        sa.Column('target_day_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False,
                  server_default='open'),
        sa.Column('decided_by_id', sa.Integer(), nullable=True),
        sa.Column('decided_option', sa.String(length=40), nullable=True),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('result', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['work_plan_id'], ['work_plans.id']),
        sa.ForeignKeyConstraint(['target_day_id'], ['work_plan_days.id']),
        sa.ForeignKeyConstraint(['decided_by_id'], ['users.id']),
        sa.CheckConstraint(
            "status IN ('open', 'accepted', 'declined', 'expired', 'failed')",
            name='check_telegram_proposal_status'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_telegram_proposals_kind', 'telegram_proposals', ['kind'])
    op.create_index('ix_telegram_proposals_status', 'telegram_proposals', ['status'])
    op.create_index('ix_telegram_proposals_expires_at', 'telegram_proposals',
                    ['expires_at'])
    op.create_index('ix_telegram_proposals_created_at', 'telegram_proposals',
                    ['created_at'])
    op.create_index('ix_telegram_proposals_work_plan_id', 'telegram_proposals',
                    ['work_plan_id'])

    op.create_table(
        'telegram_proposal_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('proposal_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('chat_id', sa.BigInteger(), nullable=False),
        sa.Column('message_id', sa.BigInteger(), nullable=True),
        sa.Column('language', sa.String(length=2), nullable=False,
                  server_default='en'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['proposal_id'], ['telegram_proposals.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_telegram_proposal_messages_proposal_id',
                    'telegram_proposal_messages', ['proposal_id'])


def downgrade():
    op.drop_index('ix_telegram_proposal_messages_proposal_id',
                  table_name='telegram_proposal_messages')
    op.drop_table('telegram_proposal_messages')
    for name in ('ix_telegram_proposals_work_plan_id',
                 'ix_telegram_proposals_created_at',
                 'ix_telegram_proposals_expires_at',
                 'ix_telegram_proposals_status',
                 'ix_telegram_proposals_kind'):
        op.drop_index(name, table_name='telegram_proposals')
    op.drop_table('telegram_proposals')
