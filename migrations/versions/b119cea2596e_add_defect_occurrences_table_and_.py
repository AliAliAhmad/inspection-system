"""Add defect_occurrences table and occurrence_count to defects

Revision ID: b119cea2596e
Revises: d1e2f3g4h5i6
Create Date: 2026-02-06 00:25:02.823185

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b119cea2596e'
down_revision = 'd1e2f3g4h5i6'
branch_labels = None
depends_on = None


def upgrade():
    # Create defect_occurrences table
    op.create_table('defect_occurrences',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('defect_id', sa.Integer(), nullable=False),
    sa.Column('inspection_id', sa.Integer(), nullable=False),
    sa.Column('occurrence_number', sa.Integer(), nullable=False),
    sa.Column('found_by_id', sa.Integer(), nullable=True),
    sa.Column('found_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['defect_id'], ['defects.id'], ),
    sa.ForeignKeyConstraint(['found_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['inspection_id'], ['inspections.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    # Add occurrence_count to defects
    with op.batch_alter_table('defects', schema=None) as batch_op:
        batch_op.add_column(sa.Column('occurrence_count', sa.Integer(), nullable=True, server_default='1'))


def downgrade():
    with op.batch_alter_table('defects', schema=None) as batch_op:
        batch_op.drop_column('occurrence_count')

    op.drop_table('defect_occurrences')
