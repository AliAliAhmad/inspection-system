"""add sap_sync_files — record of SAP exports delivered by the Windows courier

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-08-22

NOTE: this repository's migration history has multiple heads, so `flask db upgrade`
may not reach this revision (start.sh already tolerates that failure). The table is
therefore ALSO created idempotently at startup. This file exists so the schema is
recorded properly and works once the history is repaired.
"""
from alembic import op
import sqlalchemy as sa

revision = 'n4o5p6q7r8s9'
down_revision = 'm3n4o5p6q7r8'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'sap_sync_files' in inspector.get_table_names():
        return

    op.create_table(
        'sap_sync_files',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('sheet_name', sa.String(length=20), nullable=False),
        sa.Column('source_folder', sa.String(length=100), nullable=False),
        sa.Column('source_filename', sa.String(length=255), nullable=False),
        sa.Column('sha256', sa.String(length=64), nullable=False),
        sa.Column('file_size', sa.BigInteger(), nullable=False),
        sa.Column('captured_at', sa.DateTime(), nullable=True),
        sa.Column('received_at', sa.DateTime(), nullable=False),
        sa.Column('stored_path', sa.String(length=500), nullable=True),
        sa.Column('is_current', sa.Boolean(), nullable=False),
        sa.Column('parsed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('source_folder', 'source_filename', 'sha256',
                            name='uq_sap_sync_folder_file_sha'),
    )
    op.create_index('ix_sap_sync_files_sheet_name', 'sap_sync_files', ['sheet_name'])
    op.create_index('ix_sap_sync_files_source_folder', 'sap_sync_files', ['source_folder'])
    op.create_index('ix_sap_sync_files_source_filename', 'sap_sync_files', ['source_filename'])
    op.create_index('ix_sap_sync_files_sha256', 'sap_sync_files', ['sha256'])
    op.create_index('ix_sap_sync_files_received_at', 'sap_sync_files', ['received_at'])
    op.create_index('ix_sap_sync_files_is_current', 'sap_sync_files', ['is_current'])
    op.create_index('ix_sap_sync_current', 'sap_sync_files',
                    ['source_folder', 'source_filename', 'is_current'])


def downgrade():
    op.drop_table('sap_sync_files')
