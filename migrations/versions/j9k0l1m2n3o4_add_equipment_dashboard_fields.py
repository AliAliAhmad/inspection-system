"""Add equipment dashboard fields (hourly_cost, criticality_level, risk_score)

Revision ID: j9k0l1m2n3o4
Revises: i8j9k0l1m2n3
Create Date: 2026-02-09 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'j9k0l1m2n3o4'
down_revision = 'i8j9k0l1m2n3'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns for equipment dashboard
    # Note: SQLite doesn't support adding constraints, so we skip the check constraint
    op.add_column('equipment', sa.Column('hourly_cost', sa.Numeric(10, 2), nullable=True))
    op.add_column('equipment', sa.Column('criticality_level', sa.String(20), nullable=True))
    op.add_column('equipment', sa.Column('last_risk_score', sa.Numeric(5, 2), nullable=True))
    op.add_column('equipment', sa.Column('risk_score_updated_at', sa.DateTime(), nullable=True))


def downgrade():
    # Remove columns
    op.drop_column('equipment', 'risk_score_updated_at')
    op.drop_column('equipment', 'last_risk_score')
    op.drop_column('equipment', 'criticality_level')
    op.drop_column('equipment', 'hourly_cost')
