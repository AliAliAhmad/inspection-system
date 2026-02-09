"""Add equipment watch, notes, certifications tables

Revision ID: k0l1m2n3o4p5
Revises: j9k0l1m2n3o4
Create Date: 2025-02-09 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'k0l1m2n3o4p5'
down_revision = 'j9k0l1m2n3o4'
branch_labels = None
depends_on = None


def upgrade():
    # Create equipment_watches table
    op.create_table('equipment_watches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('equipment_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('notify_status_change', sa.Boolean(), nullable=True, default=True),
        sa.Column('notify_high_risk', sa.Boolean(), nullable=True, default=True),
        sa.Column('notify_anomaly', sa.Boolean(), nullable=True, default=True),
        sa.Column('notify_maintenance', sa.Boolean(), nullable=True, default=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('equipment_id', 'user_id', name='unique_equipment_watch')
    )
    op.create_index('ix_equipment_watches_equipment_id', 'equipment_watches', ['equipment_id'])
    op.create_index('ix_equipment_watches_user_id', 'equipment_watches', ['user_id'])

    # Create equipment_notes table
    op.create_table('equipment_notes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('equipment_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('content_ar', sa.Text(), nullable=True),
        sa.Column('is_pinned', sa.Boolean(), nullable=True, default=False),
        sa.Column('note_type', sa.String(length=50), nullable=True, default='general'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("note_type IN ('general', 'maintenance', 'safety', 'technical', 'warning')", name='check_valid_note_type')
    )
    op.create_index('ix_equipment_notes_equipment_id', 'equipment_notes', ['equipment_id'])

    # Create equipment_certifications table
    op.create_table('equipment_certifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('equipment_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('name_ar', sa.String(length=200), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('certification_type', sa.String(length=100), nullable=True),
        sa.Column('issuing_authority', sa.String(length=200), nullable=True),
        sa.Column('certificate_number', sa.String(length=100), nullable=True),
        sa.Column('issued_date', sa.Date(), nullable=False),
        sa.Column('expiry_date', sa.Date(), nullable=True),
        sa.Column('document_url', sa.String(length=500), nullable=True),
        sa.Column('document_file_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=True, default='active'),
        sa.Column('created_by_id', sa.Integer(), nullable=False),
        sa.Column('last_notified_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], ),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['document_file_id'], ['files.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("status IN ('active', 'expired', 'revoked', 'pending_renewal')", name='check_valid_certification_status')
    )
    op.create_index('ix_equipment_certifications_equipment_id', 'equipment_certifications', ['equipment_id'])
    op.create_index('ix_equipment_certifications_expiry_date', 'equipment_certifications', ['expiry_date'])


def downgrade():
    op.drop_index('ix_equipment_certifications_expiry_date', table_name='equipment_certifications')
    op.drop_index('ix_equipment_certifications_equipment_id', table_name='equipment_certifications')
    op.drop_table('equipment_certifications')

    op.drop_index('ix_equipment_notes_equipment_id', table_name='equipment_notes')
    op.drop_table('equipment_notes')

    op.drop_index('ix_equipment_watches_user_id', table_name='equipment_watches')
    op.drop_index('ix_equipment_watches_equipment_id', table_name='equipment_watches')
    op.drop_table('equipment_watches')
