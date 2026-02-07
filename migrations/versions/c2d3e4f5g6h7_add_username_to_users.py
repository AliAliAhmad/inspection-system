"""Add username field to users table

Revision ID: c2d3e4f5g6h7
Revises: b119cea2596e
Create Date: 2026-02-07

"""
from alembic import op
import sqlalchemy as sa
import re

# revision identifiers, used by Alembic.
revision = 'c2d3e4f5g6h7'
down_revision = 'b119cea2596e'
branch_labels = None
depends_on = None


def _generate_username(full_name, existing_usernames):
    """Generate username from full name, handling duplicates."""
    parts = full_name.strip().lower().split()
    if len(parts) == 0:
        base = 'user'
    elif len(parts) == 1:
        base = re.sub(r'[^a-z0-9]', '', parts[0])
    else:
        first = re.sub(r'[^a-z0-9]', '', parts[0])
        last_initial = re.sub(r'[^a-z0-9]', '', parts[-1])[:1]
        base = f"{first}.{last_initial}" if last_initial else first

    if not base:
        base = 'user'

    candidate = base
    counter = 2
    while candidate in existing_usernames:
        candidate = f"{base}{counter}"
        counter += 1
    existing_usernames.add(candidate)
    return candidate


def upgrade():
    # Add username column (nullable first)
    op.add_column('users', sa.Column('username', sa.String(100), nullable=True))

    # Populate usernames for existing users
    conn = op.get_bind()
    users = conn.execute(sa.text('SELECT id, full_name FROM users')).fetchall()
    existing_usernames = set()
    for user_id, full_name in users:
        username = _generate_username(full_name or 'user', existing_usernames)
        conn.execute(
            sa.text('UPDATE users SET username = :username WHERE id = :id'),
            {'username': username, 'id': user_id}
        )

    # Now add unique index
    op.create_index('ix_users_username', 'users', ['username'], unique=True)


def downgrade():
    op.drop_index('ix_users_username', table_name='users')
    op.drop_column('users', 'username')
