"""Make equipment location nullable, add missing tables

Revision ID: a1b2c3d4e5f6
Revises: 0cacb96c705f
Create Date: 2026-01-30 20:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '0cacb96c705f'
branch_labels = None
depends_on = None


def upgrade():
    # Create missing token_blocklist table
    op.create_table('token_blocklist',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('jti', sa.String(length=36), nullable=False),
        sa.Column('token_type', sa.String(length=10), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('jti'),
    )
    op.create_index('ix_token_blocklist_jti', 'token_blocklist', ['jti'])

    # Create missing translations table
    op.create_table('translations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('model_type', sa.String(length=50), nullable=False),
        sa.Column('model_id', sa.Integer(), nullable=False),
        sa.Column('field_name', sa.String(length=50), nullable=False),
        sa.Column('original_lang', sa.String(length=2), nullable=False),
        sa.Column('translated_text', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('model_type', 'model_id', 'field_name', name='uq_translation_model_field'),
    )
    op.create_index('ix_translation_lookup', 'translations', ['model_type', 'model_id'])
    op.create_index('ix_translations_model_type', 'translations', ['model_type'])
    op.create_index('ix_translations_model_id', 'translations', ['model_id'])

    # Make equipment location nullable
    with op.batch_alter_table('equipment', schema=None) as batch_op:
        batch_op.alter_column('location',
                              existing_type=sa.String(length=100),
                              nullable=True)


def downgrade():
    with op.batch_alter_table('equipment', schema=None) as batch_op:
        batch_op.alter_column('location',
                              existing_type=sa.String(length=100),
                              nullable=False)

    op.drop_table('translations')
    op.drop_index('ix_token_blocklist_jti', table_name='token_blocklist')
    op.drop_table('token_blocklist')
