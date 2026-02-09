"""Add gamification and leaderboard models

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7
Create Date: 2026-02-09 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime


# revision identifiers, used by Alembic.
revision = 'n3o4p5q6r7s8'
down_revision = 'm2n3o4p5q6r7'
branch_labels = None
depends_on = None


def upgrade():
    # =============================================
    # 1. Create achievements table
    # =============================================
    op.create_table('achievements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('name_ar', sa.String(length=100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('description_ar', sa.Text(), nullable=True),
        sa.Column('icon', sa.String(length=50), nullable=True),
        sa.Column('category', sa.String(length=50), nullable=True),
        sa.Column('points_reward', sa.Integer(), nullable=True, default=0),
        sa.Column('criteria_type', sa.String(length=50), nullable=True),
        sa.Column('criteria_target', sa.Integer(), nullable=True),
        sa.Column('criteria_field', sa.String(length=100), nullable=True),
        sa.Column('tier', sa.String(length=20), nullable=True, default='bronze'),
        sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
        sa.Column('is_hidden', sa.Boolean(), nullable=True, default=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
        sa.CheckConstraint(
            "category IN ('milestone', 'streak', 'quality', 'speed', 'special') OR category IS NULL",
            name='check_valid_achievement_category'
        ),
        sa.CheckConstraint(
            "criteria_type IN ('count', 'streak', 'rating', 'time', 'manual') OR criteria_type IS NULL",
            name='check_valid_criteria_type'
        ),
        sa.CheckConstraint(
            "tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond')",
            name='check_valid_achievement_tier'
        ),
    )
    op.create_index('ix_achievements_code', 'achievements', ['code'])
    op.create_index('ix_achievements_category', 'achievements', ['category'])
    op.create_index('ix_achievements_is_active', 'achievements', ['is_active'])

    # =============================================
    # 2. Create user_achievements table
    # =============================================
    op.create_table('user_achievements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('achievement_id', sa.Integer(), nullable=False),
        sa.Column('earned_at', sa.DateTime(), nullable=True),
        sa.Column('progress', sa.Integer(), nullable=True, default=0),
        sa.Column('is_notified', sa.Boolean(), nullable=True, default=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['achievement_id'], ['achievements.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'achievement_id', name='unique_user_achievement'),
    )
    op.create_index('ix_user_achievements_user', 'user_achievements', ['user_id'])
    op.create_index('ix_user_achievements_achievement', 'user_achievements', ['achievement_id'])

    # =============================================
    # 3. Create user_streaks table
    # =============================================
    op.create_table('user_streaks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('current_streak', sa.Integer(), nullable=True, default=0),
        sa.Column('longest_streak', sa.Integer(), nullable=True, default=0),
        sa.Column('last_activity_date', sa.Date(), nullable=True),
        sa.Column('streak_start_date', sa.Date(), nullable=True),
        sa.Column('total_active_days', sa.Integer(), nullable=True, default=0),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', name='unique_user_streak'),
    )
    op.create_index('ix_user_streaks_user', 'user_streaks', ['user_id'])

    # =============================================
    # 4. Create challenges table
    # =============================================
    op.create_table('challenges',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('name_ar', sa.String(length=100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('description_ar', sa.Text(), nullable=True),
        sa.Column('challenge_type', sa.String(length=20), nullable=True),
        sa.Column('target_type', sa.String(length=50), nullable=True),
        sa.Column('target_value', sa.Integer(), nullable=False),
        sa.Column('points_reward', sa.Integer(), nullable=True, default=100),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('eligible_roles', sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
        sa.CheckConstraint(
            "challenge_type IN ('weekly', 'monthly', 'special') OR challenge_type IS NULL",
            name='check_valid_challenge_type'
        ),
        sa.CheckConstraint(
            "target_type IN ('inspections', 'jobs', 'defects', 'rating') OR target_type IS NULL",
            name='check_valid_target_type'
        ),
    )
    op.create_index('ix_challenges_code', 'challenges', ['code'])
    op.create_index('ix_challenges_type', 'challenges', ['challenge_type'])
    op.create_index('ix_challenges_is_active', 'challenges', ['is_active'])
    op.create_index('ix_challenges_dates', 'challenges', ['start_date', 'end_date'])

    # =============================================
    # 5. Create user_challenges table
    # =============================================
    op.create_table('user_challenges',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('challenge_id', sa.Integer(), nullable=False),
        sa.Column('progress', sa.Integer(), nullable=True, default=0),
        sa.Column('is_completed', sa.Boolean(), nullable=True, default=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('joined_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['challenge_id'], ['challenges.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'challenge_id', name='unique_user_challenge'),
    )
    op.create_index('ix_user_challenges_user', 'user_challenges', ['user_id'])
    op.create_index('ix_user_challenges_challenge', 'user_challenges', ['challenge_id'])
    op.create_index('ix_user_challenges_completed', 'user_challenges', ['is_completed'])

    # =============================================
    # 6. Create user_levels table
    # =============================================
    op.create_table('user_levels',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('level', sa.Integer(), nullable=True, default=1),
        sa.Column('current_xp', sa.Integer(), nullable=True, default=0),
        sa.Column('total_xp', sa.Integer(), nullable=True, default=0),
        sa.Column('tier', sa.String(length=20), nullable=True, default='bronze'),
        sa.Column('total_points', sa.Integer(), nullable=True, default=0),
        sa.Column('inspections_count', sa.Integer(), nullable=True, default=0),
        sa.Column('jobs_count', sa.Integer(), nullable=True, default=0),
        sa.Column('defects_found', sa.Integer(), nullable=True, default=0),
        sa.Column('avg_rating', sa.Float(), nullable=True, default=0.0),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', name='unique_user_level'),
        sa.CheckConstraint(
            "tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond')",
            name='check_valid_user_level_tier'
        ),
    )
    op.create_index('ix_user_levels_user', 'user_levels', ['user_id'])
    op.create_index('ix_user_levels_level', 'user_levels', ['level'])
    op.create_index('ix_user_levels_tier', 'user_levels', ['tier'])

    # =============================================
    # 7. Create point_history table
    # =============================================
    op.create_table('point_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('points', sa.Integer(), nullable=False),
        sa.Column('reason', sa.String(length=100), nullable=False),
        sa.Column('reason_ar', sa.String(length=100), nullable=True),
        sa.Column('source_type', sa.String(length=50), nullable=True),
        sa.Column('source_id', sa.Integer(), nullable=True),
        sa.Column('multiplier', sa.Float(), nullable=True, default=1.0),
        sa.Column('base_points', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "source_type IN ('inspection', 'job', 'defect', 'achievement', 'challenge', 'manual', 'bonus', 'streak') OR source_type IS NULL",
            name='check_valid_source_type'
        ),
    )
    op.create_index('ix_point_history_user', 'point_history', ['user_id'])
    op.create_index('ix_point_history_created_at', 'point_history', ['created_at'])
    op.create_index('ix_point_history_source', 'point_history', ['source_type', 'source_id'])

    # =============================================
    # 8. Create leaderboard_snapshots table
    # =============================================
    op.create_table('leaderboard_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.Column('period_type', sa.String(length=20), nullable=False),
        sa.Column('rank', sa.Integer(), nullable=True),
        sa.Column('points', sa.Integer(), nullable=True),
        sa.Column('role', sa.String(length=50), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'snapshot_date', 'period_type', name='unique_user_snapshot_period'),
    )
    op.create_index('ix_leaderboard_snapshots_user', 'leaderboard_snapshots', ['user_id'])
    op.create_index('idx_snapshot_date_period', 'leaderboard_snapshots', ['snapshot_date', 'period_type'])
    op.create_index('ix_leaderboard_snapshots_role', 'leaderboard_snapshots', ['role'])

    # =============================================
    # 9. Seed default achievements
    # =============================================
    achievements_table = sa.table('achievements',
        sa.column('code', sa.String),
        sa.column('name', sa.String),
        sa.column('name_ar', sa.String),
        sa.column('description', sa.Text),
        sa.column('description_ar', sa.Text),
        sa.column('icon', sa.String),
        sa.column('category', sa.String),
        sa.column('points_reward', sa.Integer),
        sa.column('criteria_type', sa.String),
        sa.column('criteria_target', sa.Integer),
        sa.column('criteria_field', sa.String),
        sa.column('tier', sa.String),
        sa.column('is_active', sa.Boolean),
        sa.column('is_hidden', sa.Boolean),
        sa.column('created_at', sa.DateTime),
    )

    op.bulk_insert(achievements_table, [
        {
            'code': 'first_blood',
            'name': 'First Blood',
            'name_ar': 'الإنجاز الأول',
            'description': 'Complete your first inspection',
            'description_ar': 'أكمل أول فحص لك',
            'icon': 'trophy',
            'category': 'milestone',
            'points_reward': 50,
            'criteria_type': 'count',
            'criteria_target': 1,
            'criteria_field': 'inspections',
            'tier': 'bronze',
            'is_active': True,
            'is_hidden': False,
            'created_at': datetime.utcnow(),
        },
        {
            'code': 'speed_demon',
            'name': 'Speed Demon',
            'name_ar': 'سريع البرق',
            'description': 'Complete 5 jobs under estimated time',
            'description_ar': 'أكمل 5 مهام قبل الوقت المقدر',
            'icon': 'bolt',
            'category': 'speed',
            'points_reward': 100,
            'criteria_type': 'count',
            'criteria_target': 5,
            'criteria_field': 'fast_jobs',
            'tier': 'silver',
            'is_active': True,
            'is_hidden': False,
            'created_at': datetime.utcnow(),
        },
        {
            'code': 'perfect_score',
            'name': 'Perfect Score',
            'name_ar': 'درجة مثالية',
            'description': 'Achieve 100% quality rating',
            'description_ar': 'احصل على تقييم جودة 100%',
            'icon': 'star',
            'category': 'quality',
            'points_reward': 150,
            'criteria_type': 'rating',
            'criteria_target': 100,
            'criteria_field': 'quality_rating',
            'tier': 'gold',
            'is_active': True,
            'is_hidden': False,
            'created_at': datetime.utcnow(),
        },
        {
            'code': 'streak_7',
            'name': 'Week Warrior',
            'name_ar': 'محارب الأسبوع',
            'description': 'Maintain a 7-day work streak',
            'description_ar': 'حافظ على سلسلة عمل لمدة 7 أيام',
            'icon': 'fire',
            'category': 'streak',
            'points_reward': 75,
            'criteria_type': 'streak',
            'criteria_target': 7,
            'criteria_field': 'current_streak',
            'tier': 'bronze',
            'is_active': True,
            'is_hidden': False,
            'created_at': datetime.utcnow(),
        },
        {
            'code': 'streak_30',
            'name': 'Month Master',
            'name_ar': 'سيد الشهر',
            'description': 'Maintain a 30-day work streak',
            'description_ar': 'حافظ على سلسلة عمل لمدة 30 يوم',
            'icon': 'flame',
            'category': 'streak',
            'points_reward': 250,
            'criteria_type': 'streak',
            'criteria_target': 30,
            'criteria_field': 'current_streak',
            'tier': 'gold',
            'is_active': True,
            'is_hidden': False,
            'created_at': datetime.utcnow(),
        },
        {
            'code': 'century',
            'name': 'Century Club',
            'name_ar': 'نادي المئة',
            'description': 'Complete 100 inspections',
            'description_ar': 'أكمل 100 فحص',
            'icon': 'medal',
            'category': 'milestone',
            'points_reward': 500,
            'criteria_type': 'count',
            'criteria_target': 100,
            'criteria_field': 'inspections',
            'tier': 'platinum',
            'is_active': True,
            'is_hidden': False,
            'created_at': datetime.utcnow(),
        },
        {
            'code': 'quality_king',
            'name': 'Quality King',
            'name_ar': 'ملك الجودة',
            'description': 'Achieve best monthly quality rating',
            'description_ar': 'احصل على أفضل تقييم جودة شهري',
            'icon': 'crown',
            'category': 'quality',
            'points_reward': 300,
            'criteria_type': 'manual',
            'criteria_target': 1,
            'criteria_field': 'monthly_rating_rank',
            'tier': 'diamond',
            'is_active': True,
            'is_hidden': False,
            'created_at': datetime.utcnow(),
        },
        {
            'code': 'team_player',
            'name': 'Team Player',
            'name_ar': 'لاعب فريق',
            'description': 'Help 10 colleagues with their tasks',
            'description_ar': 'ساعد 10 زملاء في مهامهم',
            'icon': 'users',
            'category': 'special',
            'points_reward': 200,
            'criteria_type': 'count',
            'criteria_target': 10,
            'criteria_field': 'colleagues_helped',
            'tier': 'silver',
            'is_active': True,
            'is_hidden': False,
            'created_at': datetime.utcnow(),
        },
    ])


def downgrade():
    # Drop tables in reverse order (respecting foreign key dependencies)

    # 8. Drop leaderboard_snapshots
    op.drop_index('ix_leaderboard_snapshots_role', table_name='leaderboard_snapshots')
    op.drop_index('idx_snapshot_date_period', table_name='leaderboard_snapshots')
    op.drop_index('ix_leaderboard_snapshots_user', table_name='leaderboard_snapshots')
    op.drop_table('leaderboard_snapshots')

    # 7. Drop point_history
    op.drop_index('ix_point_history_source', table_name='point_history')
    op.drop_index('ix_point_history_created_at', table_name='point_history')
    op.drop_index('ix_point_history_user', table_name='point_history')
    op.drop_table('point_history')

    # 6. Drop user_levels
    op.drop_index('ix_user_levels_tier', table_name='user_levels')
    op.drop_index('ix_user_levels_level', table_name='user_levels')
    op.drop_index('ix_user_levels_user', table_name='user_levels')
    op.drop_table('user_levels')

    # 5. Drop user_challenges
    op.drop_index('ix_user_challenges_completed', table_name='user_challenges')
    op.drop_index('ix_user_challenges_challenge', table_name='user_challenges')
    op.drop_index('ix_user_challenges_user', table_name='user_challenges')
    op.drop_table('user_challenges')

    # 4. Drop challenges
    op.drop_index('ix_challenges_dates', table_name='challenges')
    op.drop_index('ix_challenges_is_active', table_name='challenges')
    op.drop_index('ix_challenges_type', table_name='challenges')
    op.drop_index('ix_challenges_code', table_name='challenges')
    op.drop_table('challenges')

    # 3. Drop user_streaks
    op.drop_index('ix_user_streaks_user', table_name='user_streaks')
    op.drop_table('user_streaks')

    # 2. Drop user_achievements
    op.drop_index('ix_user_achievements_achievement', table_name='user_achievements')
    op.drop_index('ix_user_achievements_user', table_name='user_achievements')
    op.drop_table('user_achievements')

    # 1. Drop achievements (last, because user_achievements references it)
    op.drop_index('ix_achievements_is_active', table_name='achievements')
    op.drop_index('ix_achievements_category', table_name='achievements')
    op.drop_index('ix_achievements_code', table_name='achievements')
    op.drop_table('achievements')
