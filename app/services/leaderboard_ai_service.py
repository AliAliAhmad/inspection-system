"""
LeaderboardAIService - AI-powered leaderboard intelligence and gamification.
Provides point awarding, rank tracking, predictions, and personalized insights.
"""

from datetime import datetime, timedelta, date
from sqlalchemy import func, desc, and_, or_, text
from app.extensions import db
from app.models import User, Inspection, EngineerJob, SpecialistJob, Defect
from app.models.point_history import PointHistory
from app.models.user_level import UserLevel
from app.models.user_streak import UserStreak
from app.models.achievement import Achievement
from app.models.user_achievement import UserAchievement
from app.models.leaderboard_snapshot import LeaderboardSnapshot
import logging

logger = logging.getLogger(__name__)


class LeaderboardAIService:
    """AI-powered leaderboard intelligence and gamification"""

    # Point values for different actions
    POINT_VALUES = {
        'inspection_complete': 10,
        'inspection_rated_5': 5,  # Bonus for 5-star rating
        'inspection_rated_4': 3,
        'job_complete': 15,
        'job_under_time': 10,  # Bonus for finishing early
        'defect_found': 8,
        'defect_critical': 5,  # Bonus for critical defect
        'takeover_job': 12,
        'achievement_earned': 0,  # Points from achievement itself
        'challenge_complete': 0,  # Points from challenge itself
        'streak_7': 50,
        'streak_30': 200,
    }

    # Level thresholds (XP needed to reach each level)
    LEVEL_XP = [0, 150, 350, 600, 900, 1250, 1650, 2100, 2600, 3150]  # Level 1-10

    # Tier thresholds (level ranges for each tier)
    TIER_LEVELS = {
        'bronze': (1, 10),
        'silver': (11, 20),
        'gold': (21, 30),
        'platinum': (31, 40),
        'diamond': (41, 50),
    }

    def award_points(self, user_id: int, points: int, reason: str,
                     source_type: str = None, source_id: int = None,
                     multiplier: float = 1.0) -> dict:
        """
        Award points to a user and update their level.

        Args:
            user_id: The user receiving points
            points: Base points to award
            reason: Reason for the points (displayed to user)
            source_type: Type of source ('inspection', 'job', 'defect', etc.)
            source_id: ID of the related record
            multiplier: Quality/speed multiplier to apply

        Returns:
            {'points_awarded': X, 'new_total': Y, 'level_up': bool, 'new_level': Z}
        """
        user = db.session.get(User, user_id)
        if not user:
            logger.warning(f"Cannot award points: user {user_id} not found")
            return {'error': 'User not found'}

        # Calculate final points with multiplier
        base_points = points
        final_points = int(points * multiplier)

        # Create point history record
        point_history = PointHistory(
            user_id=user_id,
            points=final_points,
            reason=reason,
            source_type=source_type,
            source_id=source_id,
            multiplier=multiplier,
            base_points=base_points
        )
        db.session.add(point_history)

        # Update user's total points
        old_total = user.total_points or 0
        user.total_points = old_total + final_points

        # Update role-specific points based on source_type
        if source_type == 'inspection':
            user.inspector_points = (user.inspector_points or 0) + final_points
        elif source_type == 'job':
            user.specialist_points = (user.specialist_points or 0) + final_points
        elif source_type in ('defect', 'engineer_job'):
            user.engineer_points = (user.engineer_points or 0) + final_points

        # Get or create user level
        user_level = UserLevel.query.filter_by(user_id=user_id).first()
        if not user_level:
            user_level = UserLevel(user_id=user_id, level=1, current_xp=0, total_xp=0)
            db.session.add(user_level)

        old_level = user_level.level

        # Add XP (points are also XP in this system)
        user_level.add_xp(final_points)
        user_level.total_points = user.total_points

        level_up = user_level.level > old_level

        db.session.commit()

        result = {
            'points_awarded': final_points,
            'base_points': base_points,
            'multiplier': multiplier,
            'new_total': user.total_points,
            'level_up': level_up,
            'new_level': user_level.level,
            'new_tier': user_level.tier,
            'current_xp': user_level.current_xp,
            'xp_for_next_level': user_level.xp_for_next_level,
        }

        logger.info(f"Awarded {final_points} points to user {user_id}: {reason}")

        return result

    def calculate_quality_multiplier(self, rating: float) -> float:
        """
        Calculate point multiplier based on quality rating.
        5 stars = 1.5x, 4 stars = 1.25x, 3 stars = 1.0x, below = 0.75x
        """
        if rating >= 4.5:
            return 1.5
        elif rating >= 4.0:
            return 1.25
        elif rating >= 3.0:
            return 1.0
        else:
            return 0.75

    def calculate_speed_bonus(self, estimated_hours: float, actual_hours: float) -> int:
        """
        Calculate bonus points for completing under estimated time.
        >20% faster = 10 points, >10% faster = 5 points
        """
        if actual_hours <= 0 or estimated_hours <= 0:
            return 0
        time_saved_percent = (estimated_hours - actual_hours) / estimated_hours
        if time_saved_percent >= 0.2:
            return 10
        elif time_saved_percent >= 0.1:
            return 5
        return 0

    def update_streak(self, user_id: int) -> dict:
        """
        Update user's work streak. Call when user completes any activity.

        Returns:
            {'current_streak': X, 'longest_streak': Y, 'streak_bonus': Z}
        """
        user_streak = UserStreak.query.filter_by(user_id=user_id).first()
        if not user_streak:
            user_streak = UserStreak(user_id=user_id)
            db.session.add(user_streak)

        old_streak = user_streak.current_streak
        user_streak.update_streak(date.today())

        streak_bonus = 0

        # Check for streak milestones
        if user_streak.current_streak >= 30 and old_streak < 30:
            streak_bonus = self.POINT_VALUES['streak_30']
            self.award_points(
                user_id=user_id,
                points=streak_bonus,
                reason='30-day streak achievement',
                source_type='streak'
            )
        elif user_streak.current_streak >= 7 and old_streak < 7:
            streak_bonus = self.POINT_VALUES['streak_7']
            self.award_points(
                user_id=user_id,
                points=streak_bonus,
                reason='7-day streak achievement',
                source_type='streak'
            )

        db.session.commit()

        return {
            'current_streak': user_streak.current_streak,
            'longest_streak': user_streak.longest_streak,
            'streak_bonus': streak_bonus,
            'total_active_days': user_streak.total_active_days,
        }

    def check_achievements(self, user_id: int) -> list:
        """
        Check if user has earned any new achievements.

        Returns:
            List of newly earned achievements.
        """
        user = db.session.get(User, user_id)
        if not user:
            return []

        newly_earned = []

        # Get all active achievements user hasn't earned yet
        earned_ids = db.session.query(UserAchievement.achievement_id).filter_by(
            user_id=user_id
        ).all()
        earned_ids = [a[0] for a in earned_ids]

        unearned = Achievement.query.filter(
            Achievement.is_active == True,
            ~Achievement.id.in_(earned_ids) if earned_ids else True
        ).all()

        # Get user stats
        user_level = UserLevel.query.filter_by(user_id=user_id).first()
        user_streak = UserStreak.query.filter_by(user_id=user_id).first()

        inspection_count = Inspection.query.filter_by(
            technician_id=user_id, status='completed'
        ).count()

        job_count = SpecialistJob.query.filter_by(
            specialist_id=user_id, status='completed'
        ).count() + EngineerJob.query.filter_by(
            engineer_id=user_id, status='completed'
        ).count()

        defect_count = Defect.query.join(Inspection).filter(Inspection.technician_id == user_id).count()

        for achievement in unearned:
            earned = False

            if achievement.criteria_type == 'count':
                if achievement.criteria_field == 'inspections':
                    earned = inspection_count >= (achievement.criteria_target or 0)
                elif achievement.criteria_field == 'jobs':
                    earned = job_count >= (achievement.criteria_target or 0)
                elif achievement.criteria_field == 'defects':
                    earned = defect_count >= (achievement.criteria_target or 0)
                elif achievement.criteria_field == 'points':
                    earned = (user.total_points or 0) >= (achievement.criteria_target or 0)
                elif achievement.criteria_field == 'level':
                    earned = (user_level.level if user_level else 1) >= (achievement.criteria_target or 0)

            elif achievement.criteria_type == 'streak':
                if user_streak:
                    earned = user_streak.current_streak >= (achievement.criteria_target or 0)

            if earned:
                # Award the achievement
                user_achievement = UserAchievement(
                    user_id=user_id,
                    achievement_id=achievement.id,
                    earned_at=datetime.utcnow(),
                    progress=achievement.criteria_target
                )
                db.session.add(user_achievement)

                # Award achievement points if any
                if achievement.points_reward > 0:
                    self.award_points(
                        user_id=user_id,
                        points=achievement.points_reward,
                        reason=f'Achievement unlocked: {achievement.name}',
                        source_type='achievement',
                        source_id=achievement.id
                    )

                newly_earned.append(achievement.to_dict())

        if newly_earned:
            db.session.commit()
            logger.info(f"User {user_id} earned {len(newly_earned)} new achievements")

        return newly_earned

    def get_user_stats(self, user_id: int) -> dict:
        """
        Get comprehensive user stats for leaderboard.

        Returns:
            {
                'level': 5,
                'tier': 'silver',
                'current_xp': 450,
                'xp_to_next': 150,
                'total_points': 2500,
                'rank': 12,
                'rank_change': +3,
                'streak': 7,
                'achievements_count': 5,
                'inspections': 45,
                'jobs': 30,
                'avg_rating': 4.5
            }
        """
        user = db.session.get(User, user_id)
        if not user:
            return {'error': 'User not found'}

        # Get or create user level
        user_level = UserLevel.query.filter_by(user_id=user_id).first()
        if not user_level:
            user_level = UserLevel(user_id=user_id)
            db.session.add(user_level)
            db.session.commit()

        # Get streak info
        user_streak = UserStreak.query.filter_by(user_id=user_id).first()

        # Count achievements
        achievements_count = UserAchievement.query.filter_by(user_id=user_id).count()

        # Count inspections and jobs
        inspection_count = Inspection.query.filter_by(
            technician_id=user_id, status='completed'
        ).count()

        job_count = SpecialistJob.query.filter_by(
            specialist_id=user_id, status='completed'
        ).count() + EngineerJob.query.filter_by(
            engineer_id=user_id, status='completed'
        ).count()

        # Calculate rank
        rank = self._calculate_rank(user_id)
        rank_change = self.get_rank_change(user_id)

        return {
            'level': user_level.level,
            'tier': user_level.tier,
            'current_xp': user_level.current_xp,
            'xp_to_next': user_level.xp_for_next_level - user_level.current_xp,
            'xp_for_next_level': user_level.xp_for_next_level,
            'level_progress_percent': user_level.level_progress_percent,
            'total_points': user.total_points or 0,
            'rank': rank,
            'rank_change': rank_change,
            'streak': user_streak.current_streak if user_streak else 0,
            'longest_streak': user_streak.longest_streak if user_streak else 0,
            'achievements_count': achievements_count,
            'inspections': inspection_count,
            'jobs': job_count,
            'avg_rating': user_level.avg_rating or 0.0,
            'total_xp': user_level.total_xp,
        }

    def _calculate_rank(self, user_id: int, role: str = None) -> int:
        """Calculate current rank for a user."""
        user = db.session.get(User, user_id)
        if not user:
            return 0

        # Get the relevant points field
        if role == 'inspector':
            user_points = user.inspector_points or 0
            query = User.query.filter(
                User.is_active == True,
                or_(User.role == 'inspector', User.minor_role == 'inspector'),
                User.inspector_points > user_points
            )
        elif role == 'specialist':
            user_points = user.specialist_points or 0
            query = User.query.filter(
                User.is_active == True,
                or_(User.role == 'specialist', User.minor_role == 'specialist'),
                User.specialist_points > user_points
            )
        elif role == 'engineer':
            user_points = user.engineer_points or 0
            query = User.query.filter(
                User.is_active == True,
                or_(User.role == 'engineer', User.minor_role == 'engineer'),
                User.engineer_points > user_points
            )
        else:
            user_points = user.total_points or 0
            query = User.query.filter(
                User.is_active == True,
                User.total_points > user_points
            )

        # Rank is count of users with more points + 1
        return query.count() + 1

    def get_rank_prediction(self, user_id: int) -> dict:
        """
        AI predicts where user will rank by end of period.
        Based on current trajectory and historical patterns.

        Returns:
            {
                'predicted_rank': 5,
                'confidence': 0.75,
                'reasoning': "At current rate, you'll earn ~150 more points"
            }
        """
        user = db.session.get(User, user_id)
        if not user:
            return {'error': 'User not found'}

        # Get last 7 days of point history
        week_ago = datetime.utcnow() - timedelta(days=7)
        recent_points = db.session.query(func.sum(PointHistory.points)).filter(
            PointHistory.user_id == user_id,
            PointHistory.created_at >= week_ago
        ).scalar() or 0

        # Calculate daily average
        daily_avg = recent_points / 7

        # Predict points by end of month
        today = date.today()
        days_left_in_month = (date(today.year, today.month + 1, 1) - today).days if today.month < 12 else (date(today.year + 1, 1, 1) - today).days

        predicted_additional_points = int(daily_avg * days_left_in_month)
        predicted_total = (user.total_points or 0) + predicted_additional_points

        # Count users who would have less points
        users_below = User.query.filter(
            User.is_active == True,
            User.total_points < predicted_total
        ).count()

        total_active_users = User.query.filter_by(is_active=True).count()
        predicted_rank = total_active_users - users_below

        # Confidence based on consistency of point earning
        if daily_avg > 0:
            # Get standard deviation to calculate confidence
            confidence = min(0.9, 0.5 + (daily_avg / 50) * 0.3)
        else:
            confidence = 0.3

        return {
            'predicted_rank': max(1, predicted_rank),
            'confidence': round(confidence, 2),
            'predicted_points': predicted_total,
            'points_per_day_avg': round(daily_avg, 1),
            'days_remaining': days_left_in_month,
            'reasoning': f"At your current rate of {round(daily_avg, 1)} points/day, you'll earn ~{predicted_additional_points} more points this month."
        }

    def get_performance_insights(self, user_id: int) -> list:
        """
        AI-generated insights about user's performance.

        Returns:
            [
                {'insight': 'Your best day is Tuesday', 'type': 'pattern'},
                {'insight': 'Focus on quality - your rating improved 10%', 'type': 'improvement'},
                {'insight': "You're 50 points from Gold tier!", 'type': 'goal'}
            ]
        """
        insights = []
        user = db.session.get(User, user_id)
        if not user:
            return insights

        user_level = UserLevel.query.filter_by(user_id=user_id).first()
        user_streak = UserStreak.query.filter_by(user_id=user_id).first()

        # Pattern: Best day of week
        best_day = self._get_best_day(user_id)
        if best_day:
            insights.append({
                'insight': f'Your best day is {best_day["day_name"]} ({best_day["avg_points"]:.0f} avg points)',
                'type': 'pattern'
            })

        # Improvement: Compare last week to previous week
        week_comparison = self._compare_weeks(user_id)
        if week_comparison:
            if week_comparison['change'] > 0:
                insights.append({
                    'insight': f'Great progress! You earned {week_comparison["change"]}% more points this week',
                    'type': 'improvement'
                })
            elif week_comparison['change'] < -20:
                insights.append({
                    'insight': f'Activity dip: {abs(week_comparison["change"])}% fewer points this week',
                    'type': 'warning'
                })

        # Goal: Tier progress
        if user_level:
            next_tier_info = self._get_next_tier_info(user_level)
            if next_tier_info:
                insights.append({
                    'insight': f"You're {next_tier_info['points_needed']} points from {next_tier_info['next_tier'].title()} tier!",
                    'type': 'goal'
                })

        # Streak insight
        if user_streak and user_streak.current_streak >= 3:
            next_milestone = 7 if user_streak.current_streak < 7 else 30
            days_to_milestone = next_milestone - user_streak.current_streak
            if days_to_milestone > 0:
                insights.append({
                    'insight': f'{days_to_milestone} more days to reach your {next_milestone}-day streak!',
                    'type': 'streak'
                })

        # Rank trend
        rank_change = self.get_rank_change(user_id)
        if rank_change and rank_change > 0:
            insights.append({
                'insight': f'You moved up {rank_change} positions this week!',
                'type': 'rank'
            })

        return insights

    def _get_best_day(self, user_id: int) -> dict:
        """Get the user's best performing day of week."""
        # Get point history from last 30 days grouped by day of week
        month_ago = datetime.utcnow() - timedelta(days=30)

        results = db.session.query(
            func.extract('dow', PointHistory.created_at).label('day_of_week'),
            func.avg(PointHistory.points).label('avg_points')
        ).filter(
            PointHistory.user_id == user_id,
            PointHistory.created_at >= month_ago
        ).group_by(
            func.extract('dow', PointHistory.created_at)
        ).all()

        if not results:
            return None

        day_names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        best = max(results, key=lambda x: x.avg_points or 0)

        return {
            'day_of_week': int(best.day_of_week or 0),
            'day_name': day_names[int(best.day_of_week or 0)],
            'avg_points': float(best.avg_points or 0)
        }

    def _compare_weeks(self, user_id: int) -> dict:
        """Compare this week's performance to last week's."""
        now = datetime.utcnow()
        week_ago = now - timedelta(days=7)
        two_weeks_ago = now - timedelta(days=14)

        this_week = db.session.query(func.sum(PointHistory.points)).filter(
            PointHistory.user_id == user_id,
            PointHistory.created_at >= week_ago
        ).scalar() or 0

        last_week = db.session.query(func.sum(PointHistory.points)).filter(
            PointHistory.user_id == user_id,
            PointHistory.created_at >= two_weeks_ago,
            PointHistory.created_at < week_ago
        ).scalar() or 0

        if last_week == 0:
            return None

        change = ((this_week - last_week) / last_week) * 100

        return {
            'this_week': this_week,
            'last_week': last_week,
            'change': round(change, 1)
        }

    def _get_next_tier_info(self, user_level: UserLevel) -> dict:
        """Get info about next tier."""
        tier_order = ['bronze', 'silver', 'gold', 'platinum', 'diamond']
        current_tier = user_level.tier

        try:
            current_index = tier_order.index(current_tier)
        except ValueError:
            current_index = 0

        if current_index >= len(tier_order) - 1:
            return None  # Already at max tier

        next_tier = tier_order[current_index + 1]
        next_level_required = UserLevel.TIER_THRESHOLDS.get(next_tier, 100)
        levels_needed = next_level_required - user_level.level

        # Rough estimate: each level needs ~100 XP on average
        points_needed = levels_needed * 100

        return {
            'next_tier': next_tier,
            'levels_needed': levels_needed,
            'points_needed': points_needed
        }

    def get_personalized_tips(self, user_id: int) -> list:
        """
        AI suggests how to improve ranking.

        Returns:
            [
                {'tip': 'Complete 3 more inspections to reach #10', 'priority': 'high'},
                {'tip': 'Maintain your 7-day streak for 50 bonus points', 'priority': 'medium'}
            ]
        """
        tips = []
        user = db.session.get(User, user_id)
        if not user:
            return tips

        current_rank = self._calculate_rank(user_id)
        user_streak = UserStreak.query.filter_by(user_id=user_id).first()

        # Tip: How to move up in rank
        if current_rank > 1:
            # Find the user just above
            users_above = User.query.filter(
                User.is_active == True,
                User.total_points > (user.total_points or 0)
            ).order_by(User.total_points.asc()).first()

            if users_above:
                points_gap = (users_above.total_points or 0) - (user.total_points or 0)
                inspections_needed = max(1, points_gap // self.POINT_VALUES['inspection_complete'])
                tips.append({
                    'tip': f'Complete {inspections_needed} more inspection(s) to reach #{current_rank - 1}',
                    'priority': 'high',
                    'points_needed': points_gap
                })

        # Tip: Streak maintenance
        if user_streak:
            if user_streak.current_streak >= 5 and user_streak.current_streak < 7:
                tips.append({
                    'tip': f'Maintain your streak for {7 - user_streak.current_streak} more day(s) for 50 bonus points!',
                    'priority': 'high'
                })
            elif user_streak.current_streak >= 25 and user_streak.current_streak < 30:
                tips.append({
                    'tip': f'Only {30 - user_streak.current_streak} days to hit 30-day streak for 200 bonus points!',
                    'priority': 'high'
                })

        # Tip: Quality bonus
        tips.append({
            'tip': 'Aim for 5-star ratings to get 1.5x point multiplier on tasks',
            'priority': 'medium'
        })

        # Tip: Speed bonus
        tips.append({
            'tip': 'Complete jobs 20% faster than estimated for 10 bonus points each',
            'priority': 'medium'
        })

        # Tip: Achievements
        unearned_count = Achievement.query.filter(
            Achievement.is_active == True,
            ~Achievement.id.in_(
                db.session.query(UserAchievement.achievement_id).filter_by(user_id=user_id)
            )
        ).count()

        if unearned_count > 0:
            tips.append({
                'tip': f'You have {unearned_count} achievements waiting to be unlocked',
                'priority': 'low'
            })

        return tips

    def detect_anomalies(self, user_id: int = None) -> list:
        """
        Detect unusual patterns (gaming the system, sudden spikes).

        Args:
            user_id: If provided, check specific user. Otherwise check all users.

        Returns:
            List of anomalies for admin review.
        """
        anomalies = []

        if user_id:
            users = [db.session.get(User, user_id)]
        else:
            users = User.query.filter_by(is_active=True).all()

        for user in users:
            if not user:
                continue

            # Check for sudden point spikes (5x normal)
            week_ago = datetime.utcnow() - timedelta(days=7)
            two_weeks_ago = datetime.utcnow() - timedelta(days=14)

            this_week = db.session.query(func.sum(PointHistory.points)).filter(
                PointHistory.user_id == user.id,
                PointHistory.created_at >= week_ago
            ).scalar() or 0

            last_week = db.session.query(func.sum(PointHistory.points)).filter(
                PointHistory.user_id == user.id,
                PointHistory.created_at >= two_weeks_ago,
                PointHistory.created_at < week_ago
            ).scalar() or 0

            if last_week > 0 and this_week > last_week * 5:
                anomalies.append({
                    'user_id': user.id,
                    'user_name': user.full_name,
                    'type': 'sudden_spike',
                    'severity': 'high',
                    'details': f'Points increased {this_week/last_week:.1f}x from last week ({last_week} -> {this_week})',
                    'detected_at': datetime.utcnow().isoformat()
                })

            # Check for unusual activity times (e.g., 100+ points at 3 AM)
            night_points = db.session.query(func.sum(PointHistory.points)).filter(
                PointHistory.user_id == user.id,
                PointHistory.created_at >= week_ago,
                func.extract('hour', PointHistory.created_at).between(0, 5)
            ).scalar() or 0

            if night_points > 100:
                anomalies.append({
                    'user_id': user.id,
                    'user_name': user.full_name,
                    'type': 'unusual_hours',
                    'severity': 'medium',
                    'details': f'{night_points} points earned between midnight and 5 AM this week',
                    'detected_at': datetime.utcnow().isoformat()
                })

        return anomalies

    def get_leaderboard(self, role: str = None, period: str = 'all_time',
                        limit: int = 50) -> list:
        """
        Get leaderboard with enhanced data.

        Args:
            role: Filter by role ('inspector', 'specialist', 'engineer', etc.)
            period: Time period ('all_time', 'monthly', 'weekly', 'daily')
            limit: Max number of results

        Returns:
            List with rank, user info, points, level, tier, streak, trend.
        """
        query = User.query.filter_by(is_active=True)

        if role:
            query = query.filter(or_(User.role == role, User.minor_role == role))

        users = query.all()

        # Build rankings
        rankings = []
        for u in users:
            # Determine points based on role or total
            if role == 'inspector':
                points = u.inspector_points or 0
            elif role == 'specialist':
                points = u.specialist_points or 0
            elif role == 'engineer':
                points = u.engineer_points or 0
            elif role == 'quality_engineer':
                points = u.qe_points or 0
            else:
                points = u.total_points or 0

            # Filter by period if needed
            if period != 'all_time':
                if period == 'daily':
                    start_date = datetime.combine(date.today(), datetime.min.time())
                elif period == 'weekly':
                    start_date = datetime.utcnow() - timedelta(days=7)
                elif period == 'monthly':
                    start_date = datetime.utcnow() - timedelta(days=30)
                else:
                    start_date = None

                if start_date:
                    period_points = db.session.query(func.sum(PointHistory.points)).filter(
                        PointHistory.user_id == u.id,
                        PointHistory.created_at >= start_date
                    ).scalar() or 0
                    points = period_points

            # Get user level and streak
            user_level = UserLevel.query.filter_by(user_id=u.id).first()
            user_streak = UserStreak.query.filter_by(user_id=u.id).first()
            achievements_count = UserAchievement.query.filter_by(user_id=u.id).count()

            rankings.append({
                'user_id': u.id,
                'full_name': u.full_name,
                'role': u.role,
                'role_id': u.role_id,
                'employee_id': u.role_id,
                'points': points,
                'total_points': u.total_points or 0,
                'specialization': u.specialization,
                'level': user_level.level if user_level else 1,
                'tier': user_level.tier if user_level else 'bronze',
                'streak': user_streak.current_streak if user_streak else 0,
                'achievements_count': achievements_count,
            })

        # Sort by points descending
        rankings.sort(key=lambda x: x['points'], reverse=True)

        # Add ranks and rank changes
        for i, r in enumerate(rankings[:limit]):
            r['rank'] = i + 1
            r['rank_change'] = self.get_rank_change(r['user_id'], period)

        return rankings[:limit]

    def get_rank_change(self, user_id: int, period: str = 'weekly') -> int:
        """
        Get rank change from previous period.
        Positive = moved up, negative = moved down.
        """
        return LeaderboardSnapshot.get_rank_change(user_id, period) or 0

    def generate_daily_snapshot(self):
        """
        Save daily leaderboard snapshot for historical tracking.
        Should be called by scheduler daily.
        """
        today = date.today()

        # Get all active users with their current rankings
        users = User.query.filter_by(is_active=True).all()
        rankings = []

        for u in users:
            rankings.append({
                'user_id': u.id,
                'points': u.total_points or 0,
                'role': u.role
            })

        # Sort by points
        rankings.sort(key=lambda x: x['points'], reverse=True)

        # Save snapshots
        for rank, entry in enumerate(rankings, 1):
            # Check if snapshot already exists
            existing = LeaderboardSnapshot.query.filter_by(
                user_id=entry['user_id'],
                snapshot_date=today,
                period_type='daily'
            ).first()

            if not existing:
                snapshot = LeaderboardSnapshot(
                    user_id=entry['user_id'],
                    snapshot_date=today,
                    period_type='daily',
                    rank=rank,
                    points=entry['points'],
                    role=entry['role']
                )
                db.session.add(snapshot)

        # Also save weekly snapshot if it's Sunday
        if today.weekday() == 6:  # Sunday
            for rank, entry in enumerate(rankings, 1):
                existing = LeaderboardSnapshot.query.filter_by(
                    user_id=entry['user_id'],
                    snapshot_date=today,
                    period_type='weekly'
                ).first()

                if not existing:
                    snapshot = LeaderboardSnapshot(
                        user_id=entry['user_id'],
                        snapshot_date=today,
                        period_type='weekly',
                        rank=rank,
                        points=entry['points'],
                        role=entry['role']
                    )
                    db.session.add(snapshot)

        # Monthly snapshot on first of month
        if today.day == 1:
            for rank, entry in enumerate(rankings, 1):
                existing = LeaderboardSnapshot.query.filter_by(
                    user_id=entry['user_id'],
                    snapshot_date=today,
                    period_type='monthly'
                ).first()

                if not existing:
                    snapshot = LeaderboardSnapshot(
                        user_id=entry['user_id'],
                        snapshot_date=today,
                        period_type='monthly',
                        rank=rank,
                        points=entry['points'],
                        role=entry['role']
                    )
                    db.session.add(snapshot)

        db.session.commit()
        logger.info(f"Generated daily leaderboard snapshot for {len(rankings)} users")

        return len(rankings)

    def get_team_leaderboard(self) -> list:
        """
        Get team-based rankings (average points per team).
        Teams are based on shift assignments.
        """
        # Group users by shift
        shifts = ['day', 'night']
        team_rankings = []

        for shift in shifts:
            users = User.query.filter_by(is_active=True, shift=shift).all()
            if not users:
                continue

            total_points = sum(u.total_points or 0 for u in users)
            avg_points = total_points / len(users) if users else 0

            team_rankings.append({
                'team': f'{shift.title()} Shift',
                'member_count': len(users),
                'total_points': total_points,
                'avg_points': round(avg_points, 1),
                'top_performer': max(users, key=lambda u: u.total_points or 0).full_name if users else None
            })

        # Sort by average points
        team_rankings.sort(key=lambda x: x['avg_points'], reverse=True)

        for i, team in enumerate(team_rankings):
            team['rank'] = i + 1

        return team_rankings

    def suggest_challenges(self, user_id: int) -> list:
        """
        AI suggests appropriate challenges for user based on skill level.

        Returns:
            [{'challenge_id': 1, 'match_score': 0.9, 'reason': '...'}]
        """
        from app.models.challenge import Challenge
        from app.models.user_challenge import UserChallenge

        user = db.session.get(User, user_id)
        if not user:
            return []

        user_level = UserLevel.query.filter_by(user_id=user_id).first()
        user_level_num = user_level.level if user_level else 1

        # Get active challenges user hasn't joined
        joined_ids = db.session.query(UserChallenge.challenge_id).filter_by(
            user_id=user_id
        ).all()
        joined_ids = [c[0] for c in joined_ids]

        today = date.today()
        active_challenges = Challenge.query.filter(
            Challenge.is_active == True,
            Challenge.start_date <= today,
            Challenge.end_date >= today,
            ~Challenge.id.in_(joined_ids) if joined_ids else True
        ).all()

        suggestions = []
        for challenge in active_challenges:
            # Check role eligibility
            if challenge.eligible_roles:
                if user.role not in challenge.eligible_roles and user.minor_role not in challenge.eligible_roles:
                    continue

            # Calculate match score based on difficulty vs user level
            difficulty = challenge.target_value / 10  # Rough difficulty estimate
            level_match = 1.0 - abs(user_level_num - difficulty) / 10
            level_match = max(0.3, min(1.0, level_match))

            # Bonus for matching user's active role
            role_bonus = 0.1 if challenge.target_type in ['inspections', 'jobs', 'defects'] else 0

            match_score = level_match + role_bonus

            reason = ""
            if match_score > 0.8:
                reason = "Perfect difficulty for your current level"
            elif match_score > 0.6:
                reason = "Good challenge to push your limits"
            else:
                reason = "A bit outside your comfort zone"

            suggestions.append({
                'challenge_id': challenge.id,
                'challenge': challenge.to_dict(),
                'match_score': round(match_score, 2),
                'reason': reason
            })

        # Sort by match score
        suggestions.sort(key=lambda x: x['match_score'], reverse=True)

        return suggestions[:5]  # Return top 5 suggestions

    def get_point_breakdown(self, user_id: int, period: str = 'monthly') -> dict:
        """
        Break down where points came from.

        Returns:
            {'inspections': 500, 'jobs': 300, 'achievements': 100, ...}
        """
        if period == 'daily':
            start_date = datetime.combine(date.today(), datetime.min.time())
        elif period == 'weekly':
            start_date = datetime.utcnow() - timedelta(days=7)
        elif period == 'monthly':
            start_date = datetime.utcnow() - timedelta(days=30)
        else:
            start_date = None

        query = db.session.query(
            PointHistory.source_type,
            func.sum(PointHistory.points).label('total')
        ).filter(
            PointHistory.user_id == user_id
        )

        if start_date:
            query = query.filter(PointHistory.created_at >= start_date)

        results = query.group_by(PointHistory.source_type).all()

        breakdown = {}
        total = 0
        for source_type, points in results:
            key = source_type or 'other'
            breakdown[key] = points
            total += points

        breakdown['total'] = total
        breakdown['period'] = period

        return breakdown

    def natural_language_query(self, query: str) -> dict:
        """
        Parse natural language queries about leaderboard.
        'Who had the best week?' -> query leaderboard with weekly filter
        'Show top inspectors' -> query with role=inspector

        Returns:
            Query results based on parsed intent.
        """
        query_lower = query.lower()

        # Determine role filter
        role = None
        if 'inspector' in query_lower:
            role = 'inspector'
        elif 'specialist' in query_lower:
            role = 'specialist'
        elif 'engineer' in query_lower:
            role = 'engineer'

        # Determine period
        period = 'all_time'
        if 'week' in query_lower or 'weekly' in query_lower:
            period = 'weekly'
        elif 'month' in query_lower or 'monthly' in query_lower:
            period = 'monthly'
        elif 'today' in query_lower or 'daily' in query_lower:
            period = 'daily'

        # Determine limit
        limit = 10
        if 'top 5' in query_lower:
            limit = 5
        elif 'top 20' in query_lower:
            limit = 20
        elif 'all' in query_lower:
            limit = 100

        # Get leaderboard data
        results = self.get_leaderboard(role=role, period=period, limit=limit)

        # Format response
        return {
            'query': query,
            'parsed': {
                'role': role,
                'period': period,
                'limit': limit
            },
            'results': results,
            'summary': f"Showing top {len(results)} {role or 'users'} for {period.replace('_', ' ')}"
        }
