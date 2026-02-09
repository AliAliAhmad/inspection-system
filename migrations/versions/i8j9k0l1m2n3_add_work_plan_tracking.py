"""Add work plan tracking, rating, review, carry-over, and performance tables

Revision ID: i8j9k0l1m2n3
Revises: h7i8j9k0l1m2
Create Date: 2026-02-09 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'i8j9k0l1m2n3'
down_revision = 'h7i8j9k0l1m2'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Work Plan Daily Reviews (must be created before ratings which reference it)
    op.create_table('work_plan_daily_reviews',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('engineer_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('shift_type', sa.String(10), nullable=False),
        sa.Column('status', sa.String(20), server_default='open', nullable=False),
        sa.Column('opened_at', sa.DateTime(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
        sa.Column('last_saved_at', sa.DateTime(), nullable=True),
        sa.Column('total_jobs', sa.Integer(), server_default='0', nullable=False),
        sa.Column('approved_jobs', sa.Integer(), server_default='0', nullable=False),
        sa.Column('incomplete_jobs', sa.Integer(), server_default='0', nullable=False),
        sa.Column('not_started_jobs', sa.Integer(), server_default='0', nullable=False),
        sa.Column('carry_over_jobs', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_pause_requests', sa.Integer(), server_default='0', nullable=False),
        sa.Column('resolved_pause_requests', sa.Integer(), server_default='0', nullable=False),
        sa.Column('materials_reviewed', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('reminders_sent', sa.Integer(), server_default='0', nullable=False),
        sa.Column('last_reminder_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['engineer_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('engineer_id', 'date', 'shift_type', name='unique_engineer_date_shift_review'),
        sa.CheckConstraint("shift_type IN ('day', 'night')", name='check_valid_review_shift_type'),
        sa.CheckConstraint("status IN ('open', 'partial', 'submitted')", name='check_valid_review_status'),
    )
    op.create_index('ix_work_plan_daily_reviews_engineer_id', 'work_plan_daily_reviews', ['engineer_id'])
    op.create_index('ix_work_plan_daily_reviews_date', 'work_plan_daily_reviews', ['date'])
    op.create_index('ix_work_plan_daily_reviews_status', 'work_plan_daily_reviews', ['status'])

    # 2. Work Plan Job Trackings
    op.create_table('work_plan_job_trackings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('work_plan_job_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(30), server_default='pending', nullable=False),
        sa.Column('shift_type', sa.String(10), server_default='day', nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('paused_at', sa.DateTime(), nullable=True),
        sa.Column('total_paused_minutes', sa.Integer(), server_default='0', nullable=False),
        sa.Column('actual_hours', sa.Numeric(5, 2), nullable=True),
        sa.Column('is_carry_over', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('original_job_id', sa.Integer(), nullable=True),
        sa.Column('carry_over_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('completion_photo_id', sa.Integer(), nullable=True),
        sa.Column('work_notes', sa.Text(), nullable=True),
        sa.Column('handover_voice_file_id', sa.Integer(), nullable=True),
        sa.Column('handover_transcription', sa.Text(), nullable=True),
        sa.Column('engineer_handover_voice_file_id', sa.Integer(), nullable=True),
        sa.Column('engineer_handover_transcription', sa.Text(), nullable=True),
        sa.Column('incomplete_reason_category', sa.String(30), nullable=True),
        sa.Column('incomplete_reason_details', sa.Text(), nullable=True),
        sa.Column('auto_flagged', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('auto_flagged_at', sa.DateTime(), nullable=True),
        sa.Column('auto_flag_type', sa.String(30), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['work_plan_job_id'], ['work_plan_jobs.id']),
        sa.ForeignKeyConstraint(['original_job_id'], ['work_plan_jobs.id']),
        sa.ForeignKeyConstraint(['completion_photo_id'], ['files.id']),
        sa.ForeignKeyConstraint(['handover_voice_file_id'], ['files.id']),
        sa.ForeignKeyConstraint(['engineer_handover_voice_file_id'], ['files.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('work_plan_job_id'),
        sa.CheckConstraint(
            "status IN ('pending', 'in_progress', 'paused', 'completed', 'incomplete', 'not_started')",
            name='check_valid_tracking_status'
        ),
        sa.CheckConstraint("shift_type IN ('day', 'night')", name='check_valid_shift_type'),
        sa.CheckConstraint(
            "incomplete_reason_category IN ('missing_parts', 'equipment_not_accessible', 'time_ran_out', 'safety_concern', 'other') OR incomplete_reason_category IS NULL",
            name='check_valid_incomplete_reason'
        ),
    )
    op.create_index('ix_work_plan_job_trackings_work_plan_job_id', 'work_plan_job_trackings', ['work_plan_job_id'], unique=True)
    op.create_index('ix_work_plan_job_trackings_status', 'work_plan_job_trackings', ['status'])

    # 3. Work Plan Job Logs
    op.create_table('work_plan_job_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('work_plan_job_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(30), nullable=False),
        sa.Column('event_data', sa.JSON(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['work_plan_job_id'], ['work_plan_jobs.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "event_type IN ('started', 'paused', 'resumed', 'completed', 'marked_incomplete', "
            "'carry_over_created', 'auto_flagged', 'rating_given', 'rating_disputed', "
            "'rating_override', 'pause_approved', 'pause_rejected', 'material_consumed', "
            "'engineer_override')",
            name='check_valid_log_event_type'
        ),
    )
    op.create_index('ix_work_plan_job_logs_work_plan_job_id', 'work_plan_job_logs', ['work_plan_job_id'])
    op.create_index('ix_work_plan_job_logs_event_type', 'work_plan_job_logs', ['event_type'])
    op.create_index('ix_work_plan_job_logs_created_at', 'work_plan_job_logs', ['created_at'])

    # 4. Work Plan Pause Requests
    op.create_table('work_plan_pause_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('work_plan_job_id', sa.Integer(), nullable=False),
        sa.Column('requested_by_id', sa.Integer(), nullable=False),
        sa.Column('requested_at', sa.DateTime(), nullable=False),
        sa.Column('reason_category', sa.String(30), nullable=False),
        sa.Column('reason_details', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), server_default='pending', nullable=False),
        sa.Column('reviewed_by_id', sa.Integer(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('review_notes', sa.Text(), nullable=True),
        sa.Column('resumed_at', sa.DateTime(), nullable=True),
        sa.Column('duration_minutes', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['work_plan_job_id'], ['work_plan_jobs.id']),
        sa.ForeignKeyConstraint(['requested_by_id'], ['users.id']),
        sa.ForeignKeyConstraint(['reviewed_by_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "reason_category IN ('break', 'waiting_for_materials', 'urgent_task', 'waiting_for_access', 'other')",
            name='check_valid_wp_pause_reason'
        ),
        sa.CheckConstraint("status IN ('pending', 'approved', 'rejected')", name='check_valid_wp_pause_status'),
    )
    op.create_index('ix_work_plan_pause_requests_work_plan_job_id', 'work_plan_pause_requests', ['work_plan_job_id'])
    op.create_index('ix_work_plan_pause_requests_status', 'work_plan_pause_requests', ['status'])

    # 5. Work Plan Job Ratings
    op.create_table('work_plan_job_ratings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('work_plan_job_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('is_lead', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('time_rating', sa.Numeric(3, 1), nullable=True),
        sa.Column('time_rating_override', sa.Numeric(3, 1), nullable=True),
        sa.Column('time_rating_override_reason', sa.Text(), nullable=True),
        sa.Column('time_rating_override_by_id', sa.Integer(), nullable=True),
        sa.Column('time_rating_override_approved', sa.Boolean(), nullable=True),
        sa.Column('time_rating_override_approved_by_id', sa.Integer(), nullable=True),
        sa.Column('time_rating_override_approved_at', sa.DateTime(), nullable=True),
        sa.Column('qc_rating', sa.Numeric(3, 1), nullable=True),
        sa.Column('qc_reason', sa.Text(), nullable=True),
        sa.Column('qc_voice_file_id', sa.Integer(), nullable=True),
        sa.Column('cleaning_rating', sa.Integer(), nullable=True),
        sa.Column('admin_bonus', sa.Integer(), server_default='0', nullable=False),
        sa.Column('admin_bonus_by_id', sa.Integer(), nullable=True),
        sa.Column('admin_bonus_notes', sa.Text(), nullable=True),
        sa.Column('points_earned', sa.Integer(), server_default='0', nullable=False),
        sa.Column('is_disputed', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('dispute_reason', sa.Text(), nullable=True),
        sa.Column('dispute_filed_at', sa.DateTime(), nullable=True),
        sa.Column('dispute_resolved', sa.Boolean(), nullable=True),
        sa.Column('dispute_resolved_by_id', sa.Integer(), nullable=True),
        sa.Column('dispute_resolved_at', sa.DateTime(), nullable=True),
        sa.Column('dispute_resolution', sa.Text(), nullable=True),
        sa.Column('rated_by_id', sa.Integer(), nullable=True),
        sa.Column('rated_at', sa.DateTime(), nullable=True),
        sa.Column('daily_review_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['work_plan_job_id'], ['work_plan_jobs.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['time_rating_override_by_id'], ['users.id']),
        sa.ForeignKeyConstraint(['time_rating_override_approved_by_id'], ['users.id']),
        sa.ForeignKeyConstraint(['admin_bonus_by_id'], ['users.id']),
        sa.ForeignKeyConstraint(['dispute_resolved_by_id'], ['users.id']),
        sa.ForeignKeyConstraint(['rated_by_id'], ['users.id']),
        sa.ForeignKeyConstraint(['qc_voice_file_id'], ['files.id']),
        sa.ForeignKeyConstraint(['daily_review_id'], ['work_plan_daily_reviews.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('work_plan_job_id', 'user_id', name='unique_wp_job_user_rating'),
        sa.CheckConstraint("(time_rating >= 1 AND time_rating <= 7) OR time_rating IS NULL", name='check_valid_wp_time_rating'),
        sa.CheckConstraint("(time_rating_override >= 1 AND time_rating_override <= 7) OR time_rating_override IS NULL", name='check_valid_wp_time_rating_override'),
        sa.CheckConstraint("(qc_rating >= 1 AND qc_rating <= 5) OR qc_rating IS NULL", name='check_valid_wp_qc_rating'),
        sa.CheckConstraint("(cleaning_rating >= 0 AND cleaning_rating <= 2) OR cleaning_rating IS NULL", name='check_valid_wp_cleaning_rating'),
        sa.CheckConstraint("admin_bonus >= 0 AND admin_bonus <= 10", name='check_valid_wp_admin_bonus'),
    )
    op.create_index('ix_work_plan_job_ratings_work_plan_job_id', 'work_plan_job_ratings', ['work_plan_job_id'])
    op.create_index('ix_work_plan_job_ratings_user_id', 'work_plan_job_ratings', ['user_id'])

    # 6. Work Plan Carry Overs
    op.create_table('work_plan_carry_overs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('original_job_id', sa.Integer(), nullable=False),
        sa.Column('new_job_id', sa.Integer(), nullable=False),
        sa.Column('reason_category', sa.String(30), nullable=False),
        sa.Column('reason_details', sa.Text(), nullable=True),
        sa.Column('worker_voice_file_id', sa.Integer(), nullable=True),
        sa.Column('worker_transcription', sa.Text(), nullable=True),
        sa.Column('engineer_voice_file_id', sa.Integer(), nullable=True),
        sa.Column('engineer_transcription', sa.Text(), nullable=True),
        sa.Column('hours_spent_original', sa.Numeric(5, 2), nullable=True),
        sa.Column('carried_over_by_id', sa.Integer(), nullable=False),
        sa.Column('carried_over_at', sa.DateTime(), nullable=False),
        sa.Column('daily_review_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['original_job_id'], ['work_plan_jobs.id']),
        sa.ForeignKeyConstraint(['new_job_id'], ['work_plan_jobs.id']),
        sa.ForeignKeyConstraint(['carried_over_by_id'], ['users.id']),
        sa.ForeignKeyConstraint(['worker_voice_file_id'], ['files.id']),
        sa.ForeignKeyConstraint(['engineer_voice_file_id'], ['files.id']),
        sa.ForeignKeyConstraint(['daily_review_id'], ['work_plan_daily_reviews.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "reason_category IN ('missing_parts', 'equipment_not_accessible', 'time_ran_out', 'safety_concern', 'day_ended', 'other')",
            name='check_valid_carry_over_reason'
        ),
    )
    op.create_index('ix_work_plan_carry_overs_original_job_id', 'work_plan_carry_overs', ['original_job_id'])
    op.create_index('ix_work_plan_carry_overs_new_job_id', 'work_plan_carry_overs', ['new_job_id'])

    # 7. Work Plan Performances
    op.create_table('work_plan_performances',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('period_type', sa.String(10), nullable=False),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('period_end', sa.Date(), nullable=False),
        sa.Column('total_jobs_assigned', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_jobs_completed', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_jobs_incomplete', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_jobs_not_started', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_jobs_carried_over', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_estimated_hours', sa.Numeric(7, 2), server_default='0', nullable=False),
        sa.Column('total_actual_hours', sa.Numeric(7, 2), server_default='0', nullable=False),
        sa.Column('avg_time_rating', sa.Numeric(3, 1), nullable=True),
        sa.Column('avg_qc_rating', sa.Numeric(3, 1), nullable=True),
        sa.Column('avg_cleaning_rating', sa.Numeric(3, 1), nullable=True),
        sa.Column('completion_rate', sa.Numeric(5, 2), server_default='0', nullable=False),
        sa.Column('total_points_earned', sa.Integer(), server_default='0', nullable=False),
        sa.Column('current_streak_days', sa.Integer(), server_default='0', nullable=False),
        sa.Column('max_streak_days', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_pauses', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_pause_minutes', sa.Integer(), server_default='0', nullable=False),
        sa.Column('late_starts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('materials_planned', sa.Integer(), server_default='0', nullable=False),
        sa.Column('materials_consumed', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'period_type', 'period_start', name='unique_user_period_performance'),
        sa.CheckConstraint("period_type IN ('daily', 'weekly', 'monthly')", name='check_valid_performance_period_type'),
    )
    op.create_index('ix_work_plan_performances_user_id', 'work_plan_performances', ['user_id'])
    op.create_index('ix_work_plan_performances_period_type', 'work_plan_performances', ['period_type'])


def downgrade():
    op.drop_table('work_plan_performances')
    op.drop_table('work_plan_carry_overs')
    op.drop_table('work_plan_job_ratings')
    op.drop_table('work_plan_pause_requests')
    op.drop_table('work_plan_job_logs')
    op.drop_table('work_plan_job_trackings')
    op.drop_table('work_plan_daily_reviews')
