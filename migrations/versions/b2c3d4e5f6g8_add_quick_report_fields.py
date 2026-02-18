"""Add quick report fields to defects table.

Makes inspection_id nullable and adds reported_by_id, report_source, voice_note_url,
location_description, hazard_type columns for field-reported defects.

Revision ID: b2c3d4e5f6g8
Revises: a1b2c3d4e5f7
Create Date: 2026-02-18
"""

from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6g8'
down_revision = 'a1b2c3d4e5f7'
branch_labels = None
depends_on = None


def upgrade():
    # Make inspection_id nullable for field-reported defects
    op.alter_column('defects', 'inspection_id',
                    existing_type=sa.Integer(),
                    nullable=True)

    # Add quick report fields
    op.add_column('defects', sa.Column('reported_by_id', sa.Integer(),
                                        sa.ForeignKey('users.id'), nullable=True))
    op.add_column('defects', sa.Column('report_source', sa.String(30), nullable=True,
                                        server_default='inspection'))
    op.add_column('defects', sa.Column('voice_note_url', sa.Text(), nullable=True))
    op.add_column('defects', sa.Column('photo_url', sa.Text(), nullable=True))
    op.add_column('defects', sa.Column('location_description', sa.Text(), nullable=True))
    op.add_column('defects', sa.Column('hazard_type', sa.String(30), nullable=True))
    op.add_column('defects', sa.Column('equipment_id_direct', sa.Integer(),
                                        sa.ForeignKey('equipment.id'), nullable=True))


def downgrade():
    op.drop_column('defects', 'equipment_id_direct')
    op.drop_column('defects', 'hazard_type')
    op.drop_column('defects', 'location_description')
    op.drop_column('defects', 'photo_url')
    op.drop_column('defects', 'voice_note_url')
    op.drop_column('defects', 'report_source')
    op.drop_column('defects', 'reported_by_id')
    op.alter_column('defects', 'inspection_id',
                    existing_type=sa.Integer(),
                    nullable=False)
