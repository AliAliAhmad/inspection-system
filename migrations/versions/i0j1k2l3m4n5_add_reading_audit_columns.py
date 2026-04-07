"""Add audit columns to equipment_readings for admin edit support

Revision ID: i0j1k2l3m4n5
Revises: h9i0j1k2l3m4
Create Date: 2026-04-07 22:35:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'i0j1k2l3m4n5'
down_revision = 'h9i0j1k2l3m4'
branch_labels = None
depends_on = None


def upgrade():
    """Add 5 audit columns to equipment_readings.

    These let an admin correct a wrong reading (e.g. inspector typo of 9000
    when meter showed 900) while preserving a full audit trail:
        - updated_at      : when the row was last edited
        - updated_by_id   : which user (admin) made the edit
        - original_value  : the very first value saved (set on first edit only)
        - edit_reason     : why the admin edited it
        - edit_count      : how many times the row has been edited

    All columns are nullable / default 0 so this migration is non-blocking
    and safe to run on a populated table.
    """
    with op.batch_alter_table('equipment_readings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('updated_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('updated_by_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('original_value', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('edit_reason', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column(
            'edit_count', sa.Integer(), nullable=False, server_default='0',
        ))
        batch_op.create_foreign_key(
            'fk_equipment_readings_updated_by_id',
            'users',
            ['updated_by_id'], ['id'],
        )


def downgrade():
    """Remove the audit columns added by this migration."""
    with op.batch_alter_table('equipment_readings', schema=None) as batch_op:
        batch_op.drop_constraint('fk_equipment_readings_updated_by_id', type_='foreignkey')
        batch_op.drop_column('edit_count')
        batch_op.drop_column('edit_reason')
        batch_op.drop_column('original_value')
        batch_op.drop_column('updated_by_id')
        batch_op.drop_column('updated_at')
