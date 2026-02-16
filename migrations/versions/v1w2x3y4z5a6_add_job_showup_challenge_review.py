"""Add job show-up photos, challenge voices, and review marks tables.

Revision ID: v1w2x3y4z5a6
Revises: s8t9u0v1w2x3
Create Date: 2026-02-16 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'v1w2x3y4z5a6'
down_revision = 's8t9u0v1w2x3'
branch_labels = None
depends_on = None


def upgrade():
    # Show-up photos table
    op.create_table('job_showup_photos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('job_type', sa.String(length=20), nullable=False),
        sa.Column('job_id', sa.Integer(), nullable=False),
        sa.Column('file_id', sa.Integer(), nullable=False),
        sa.Column('uploaded_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['file_id'], ['files.id']),
        sa.ForeignKeyConstraint(['uploaded_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("job_type IN ('specialist', 'engineer')", name='check_showup_photo_job_type'),
    )
    op.create_index('ix_showup_photos_job', 'job_showup_photos', ['job_type', 'job_id'])

    # Challenge voice notes table
    op.create_table('job_challenge_voices',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('job_type', sa.String(length=20), nullable=False),
        sa.Column('job_id', sa.Integer(), nullable=False),
        sa.Column('file_id', sa.Integer(), nullable=False),
        sa.Column('transcription_en', sa.Text(), nullable=True),
        sa.Column('transcription_ar', sa.Text(), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('recorded_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['file_id'], ['files.id']),
        sa.ForeignKeyConstraint(['recorded_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("job_type IN ('specialist', 'engineer')", name='check_challenge_voice_job_type'),
    )
    op.create_index('ix_challenge_voices_job', 'job_challenge_voices', ['job_type', 'job_id'])

    # Review marks table (star / point)
    op.create_table('job_review_marks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('job_type', sa.String(length=20), nullable=False),
        sa.Column('job_id', sa.Integer(), nullable=False),
        sa.Column('mark_type', sa.String(length=10), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('marked_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['marked_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("job_type IN ('specialist', 'engineer')", name='check_review_mark_job_type'),
        sa.CheckConstraint("mark_type IN ('star', 'point')", name='check_review_mark_type'),
    )
    op.create_index('ix_review_marks_job', 'job_review_marks', ['job_type', 'job_id'])


def downgrade():
    op.drop_index('ix_review_marks_job', table_name='job_review_marks')
    op.drop_table('job_review_marks')
    op.drop_index('ix_challenge_voices_job', table_name='job_challenge_voices')
    op.drop_table('job_challenge_voices')
    op.drop_index('ix_showup_photos_job', table_name='job_showup_photos')
    op.drop_table('job_showup_photos')
