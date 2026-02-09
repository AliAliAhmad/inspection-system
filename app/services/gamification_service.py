"""
GamificationService - Handle achievements, challenges, and streaks.
Provides gamification mechanics for the inspection system.
"""

from datetime import datetime, timedelta, date
from sqlalchemy import func, and_, or_
from app.extensions import db
from app.models import User, Inspection, EngineerJob, SpecialistJob, Defect
from app.models.achievement import Achievement
from app.models.user_achievement import UserAchievement
from app.models.challenge import Challenge
from app.models.user_challenge import UserChallenge
from app.models.user_streak import UserStreak
from app.models.user_level import UserLevel
from app.models.point_history import PointHistory
import logging
import random
import string

logger = logging.getLogger(__name__)


class GamificationService:
    """Handle achievements, challenges, and streaks"""

    # Achievement definitions for auto-checking
    ACHIEVEMENT_TRIGGERS = {
        'first_inspection': {'field': 'inspections', 'target': 1},
        'inspection_10': {'field': 'inspections', 'target': 10},
        'inspection_50': {'field': 'inspections', 'target': 50},
        'inspection_100': {'field': 'inspections', 'target': 100},
        'first_defect': {'field': 'defects', 'target': 1},
        'defect_hunter_25': {'field': 'defects', 'target': 25},
        'defect_hunter_100': {'field': 'defects', 'target': 100},
        'first_job': {'field': 'jobs', 'target': 1},
        'job_master_50': {'field': 'jobs', 'target': 50},
        'streak_7': {'field': 'streak', 'target': 7},
        'streak_30': {'field': 'streak', 'target': 30},
        'level_5': {'field': 'level', 'target': 5},
        'level_10': {'field': 'level', 'target': 10},
        'level_25': {'field': 'level', 'target': 25},
    }

    def check_and_award_achievements(self, user_id: int, trigger_type: str, trigger_data: dict) -> list:
        """
        Check if an action triggers any achievements.

        Args:
            user_id: The user to check
            trigger_type: Type of trigger ('inspection_complete', 'job_complete', etc.)
            trigger_data: Additional data about the trigger

        Returns:
            List of newly awarded achievements.
        """
        from app.services.leaderboard_ai_service import LeaderboardAIService

        user = db.session.get(User, user_id)
        if not user:
            return []

        newly_earned = []

        # Get user stats
        user_level = UserLevel.query.filter_by(user_id=user_id).first()
        user_streak = UserStreak.query.filter_by(user_id=user_id).first()

        # Count totals
        inspection_count = Inspection.query.filter_by(
            technician_id=user_id, status='completed'
        ).count()

        job_count = SpecialistJob.query.filter_by(
            specialist_id=user_id, status='completed'
        ).count() + EngineerJob.query.filter_by(
            engineer_id=user_id, status='completed'
        ).count()

        defect_count = Defect.query.join(Inspection).filter(Inspection.technician_id == user_id).count()

        # Build current stats dict
        stats = {
            'inspections': inspection_count,
            'jobs': job_count,
            'defects': defect_count,
            'streak': user_streak.current_streak if user_streak else 0,
            'level': user_level.level if user_level else 1,
            'points': user.total_points or 0,
            'rating': trigger_data.get('rating', 0),
        }

        # Get all active achievements user hasn't earned
        earned_ids = db.session.query(UserAchievement.achievement_id).filter_by(
            user_id=user_id
        ).subquery()

        unearned = Achievement.query.filter(
            Achievement.is_active == True,
            ~Achievement.id.in_(db.session.query(earned_ids))
        ).all()

        for achievement in unearned:
            earned = False

            # Check based on criteria type
            if achievement.criteria_type == 'count':
                field_value = stats.get(achievement.criteria_field, 0)
                earned = field_value >= (achievement.criteria_target or 0)

            elif achievement.criteria_type == 'streak':
                earned = stats['streak'] >= (achievement.criteria_target or 0)

            elif achievement.criteria_type == 'rating':
                # Check if this action's rating qualifies
                if trigger_type == 'inspection_complete' and trigger_data.get('rating'):
                    if trigger_data['rating'] >= (achievement.criteria_target or 5):
                        earned = True

            elif achievement.criteria_type == 'time':
                # Speed achievements - check if completed under time
                if trigger_data.get('time_saved_percent', 0) >= (achievement.criteria_target or 20):
                    earned = True

            if earned:
                # Award the achievement
                user_achievement = UserAchievement(
                    user_id=user_id,
                    achievement_id=achievement.id,
                    earned_at=datetime.utcnow(),
                    progress=achievement.criteria_target
                )
                db.session.add(user_achievement)

                # Award achievement points
                if achievement.points_reward > 0:
                    leaderboard_service = LeaderboardAIService()
                    leaderboard_service.award_points(
                        user_id=user_id,
                        points=achievement.points_reward,
                        reason=f'Achievement: {achievement.name}',
                        source_type='achievement',
                        source_id=achievement.id
                    )

                newly_earned.append(achievement)
                logger.info(f"User {user_id} earned achievement: {achievement.code}")

        if newly_earned:
            db.session.commit()

            # Create notifications for earned achievements
            try:
                from app.services.notification_service import NotificationService
                for achievement in newly_earned:
                    NotificationService.create_notification(
                        user_id=user_id,
                        type='achievement_earned',
                        title='Achievement Unlocked!',
                        message=f'You earned the "{achievement.name}" achievement! (+{achievement.points_reward} points)',
                        related_type='achievement',
                        related_id=achievement.id,
                        priority='info'
                    )
            except Exception as e:
                logger.warning(f"Failed to send achievement notification: {e}")

        return [a.to_dict() for a in newly_earned]

    def get_user_achievements(self, user_id: int) -> dict:
        """
        Get user's achievements with progress.

        Returns:
            {
                'earned': [...],
                'in_progress': [...],
                'locked': [...]
            }
        """
        user = db.session.get(User, user_id)
        if not user:
            return {'earned': [], 'in_progress': [], 'locked': []}

        # Get user stats for progress calculation
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

        stats = {
            'inspections': inspection_count,
            'jobs': job_count,
            'defects': defect_count,
            'streak': user_streak.current_streak if user_streak else 0,
            'level': user_level.level if user_level else 1,
            'points': user.total_points or 0,
        }

        # Get all achievements
        all_achievements = Achievement.query.filter_by(is_active=True).all()

        # Get earned achievements
        earned_achievements = UserAchievement.query.filter_by(user_id=user_id).all()
        earned_ids = [ea.achievement_id for ea in earned_achievements]

        result = {
            'earned': [],
            'in_progress': [],
            'locked': []
        }

        for achievement in all_achievements:
            achievement_data = achievement.to_dict()

            if achievement.id in earned_ids:
                # Already earned
                user_achievement = next(
                    (ea for ea in earned_achievements if ea.achievement_id == achievement.id),
                    None
                )
                achievement_data['earned_at'] = user_achievement.earned_at.isoformat() if user_achievement else None
                achievement_data['progress'] = 100
                result['earned'].append(achievement_data)
            else:
                # Calculate progress
                progress = 0
                if achievement.criteria_type == 'count' and achievement.criteria_field:
                    current = stats.get(achievement.criteria_field, 0)
                    target = achievement.criteria_target or 1
                    progress = min(100, int((current / target) * 100))
                elif achievement.criteria_type == 'streak':
                    current = stats['streak']
                    target = achievement.criteria_target or 1
                    progress = min(100, int((current / target) * 100))

                achievement_data['progress'] = progress
                achievement_data['current'] = stats.get(achievement.criteria_field, 0)

                if progress > 0 and not achievement.is_hidden:
                    result['in_progress'].append(achievement_data)
                elif not achievement.is_hidden:
                    result['locked'].append(achievement_data)

        # Sort earned by most recent
        result['earned'].sort(key=lambda x: x.get('earned_at', ''), reverse=True)

        # Sort in_progress by closest to completion
        result['in_progress'].sort(key=lambda x: x.get('progress', 0), reverse=True)

        return result

    def get_active_challenges(self, user_id: int = None, role: str = None) -> list:
        """
        Get currently active challenges.

        Args:
            user_id: If provided, include user's progress
            role: Filter by role

        Returns:
            List of active challenges with participant counts
        """
        today = date.today()

        query = Challenge.query.filter(
            Challenge.is_active == True,
            Challenge.start_date <= today,
            Challenge.end_date >= today
        )

        # Filter by role if provided
        if role:
            query = query.filter(
                or_(
                    Challenge.eligible_roles.is_(None),
                    Challenge.eligible_roles.contains([role])
                )
            )

        challenges = query.all()

        result = []
        for challenge in challenges:
            challenge_data = challenge.to_dict()

            # Count participants
            participant_count = UserChallenge.query.filter_by(
                challenge_id=challenge.id
            ).count()
            challenge_data['participant_count'] = participant_count

            # Count completions
            completion_count = UserChallenge.query.filter_by(
                challenge_id=challenge.id,
                is_completed=True
            ).count()
            challenge_data['completion_count'] = completion_count

            # Get user's participation if user_id provided
            if user_id:
                user_challenge = UserChallenge.query.filter_by(
                    user_id=user_id,
                    challenge_id=challenge.id
                ).first()

                if user_challenge:
                    challenge_data['user_progress'] = user_challenge.progress
                    challenge_data['user_joined'] = True
                    challenge_data['user_completed'] = user_challenge.is_completed
                    challenge_data['progress_percent'] = user_challenge.progress_percent
                else:
                    challenge_data['user_progress'] = 0
                    challenge_data['user_joined'] = False
                    challenge_data['user_completed'] = False
                    challenge_data['progress_percent'] = 0

            result.append(challenge_data)

        return result

    def join_challenge(self, user_id: int, challenge_id: int) -> dict:
        """
        User joins a challenge.

        Args:
            user_id: User joining
            challenge_id: Challenge to join

        Returns:
            Result dict with success status
        """
        user = db.session.get(User, user_id)
        challenge = db.session.get(Challenge, challenge_id)

        if not user:
            return {'success': False, 'error': 'User not found'}
        if not challenge:
            return {'success': False, 'error': 'Challenge not found'}

        # Check if already joined
        existing = UserChallenge.query.filter_by(
            user_id=user_id,
            challenge_id=challenge_id
        ).first()

        if existing:
            return {'success': False, 'error': 'Already joined this challenge'}

        # Check eligibility
        if challenge.eligible_roles:
            if user.role not in challenge.eligible_roles and user.minor_role not in challenge.eligible_roles:
                return {'success': False, 'error': 'Not eligible for this challenge'}

        # Check if challenge is still active
        today = date.today()
        if today < challenge.start_date:
            return {'success': False, 'error': 'Challenge has not started yet'}
        if today > challenge.end_date:
            return {'success': False, 'error': 'Challenge has ended'}

        # Create participation record
        user_challenge = UserChallenge(
            user_id=user_id,
            challenge_id=challenge_id,
            progress=0,
            joined_at=datetime.utcnow()
        )
        db.session.add(user_challenge)
        db.session.commit()

        logger.info(f"User {user_id} joined challenge {challenge_id}")

        return {
            'success': True,
            'message': f'Joined challenge: {challenge.name}',
            'challenge': challenge.to_dict(),
            'days_remaining': challenge.days_remaining
        }

    def update_challenge_progress(self, user_id: int, action_type: str, count: int = 1):
        """
        Update progress on all relevant challenges.

        Args:
            user_id: User who performed action
            action_type: Type of action ('inspections', 'jobs', 'defects', etc.)
            count: How many to add (default 1)
        """
        from app.services.leaderboard_ai_service import LeaderboardAIService

        # Get all active challenges user has joined
        today = date.today()
        user_challenges = UserChallenge.query.join(Challenge).filter(
            UserChallenge.user_id == user_id,
            UserChallenge.is_completed == False,
            Challenge.is_active == True,
            Challenge.start_date <= today,
            Challenge.end_date >= today,
            Challenge.target_type == action_type
        ).all()

        for user_challenge in user_challenges:
            old_progress = user_challenge.progress
            user_challenge.progress = (user_challenge.progress or 0) + count

            # Check if challenge completed
            challenge = user_challenge.challenge
            if user_challenge.progress >= challenge.target_value:
                user_challenge.is_completed = True
                user_challenge.completed_at = datetime.utcnow()

                # Award challenge points
                if challenge.points_reward > 0:
                    leaderboard_service = LeaderboardAIService()
                    leaderboard_service.award_points(
                        user_id=user_id,
                        points=challenge.points_reward,
                        reason=f'Challenge completed: {challenge.name}',
                        source_type='challenge',
                        source_id=challenge.id
                    )

                logger.info(f"User {user_id} completed challenge {challenge.id}")

                # Send notification
                try:
                    from app.services.notification_service import NotificationService
                    NotificationService.create_notification(
                        user_id=user_id,
                        type='challenge_complete',
                        title='Challenge Completed!',
                        message=f'You completed the "{challenge.name}" challenge! (+{challenge.points_reward} points)',
                        related_type='challenge',
                        related_id=challenge.id,
                        priority='info'
                    )
                except Exception as e:
                    logger.warning(f"Failed to send challenge notification: {e}")

        db.session.commit()

    def create_weekly_challenges(self):
        """
        Auto-generate weekly challenges. Called by scheduler.
        Creates varied challenges for different roles.
        """
        # Calculate next week's dates
        today = date.today()
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7  # Start next Monday if today is Monday
        next_monday = today + timedelta(days=days_until_monday)
        next_sunday = next_monday + timedelta(days=6)

        # Check if we already have challenges for next week
        existing = Challenge.query.filter(
            Challenge.start_date == next_monday,
            Challenge.challenge_type == 'weekly'
        ).first()

        if existing:
            logger.info(f"Weekly challenges for {next_monday} already exist")
            return

        # Generate unique code
        def generate_code(prefix):
            suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
            return f"{prefix}_{next_monday.strftime('%Y%m%d')}_{suffix}"

        challenges_to_create = [
            {
                'code': generate_code('WEEKLY_INSP'),
                'name': 'Weekly Inspector Challenge',
                'name_ar': 'تحدي المفتش الأسبوعي',
                'description': 'Complete 20 inspections this week',
                'description_ar': 'أكمل 20 فحصا هذا الأسبوع',
                'target_type': 'inspections',
                'target_value': 20,
                'points_reward': 100,
                'eligible_roles': ['inspector'],
            },
            {
                'code': generate_code('WEEKLY_DEFECT'),
                'name': 'Defect Hunter',
                'name_ar': 'صائد العيوب',
                'description': 'Find 10 defects this week',
                'description_ar': 'اكتشف 10 عيوب هذا الأسبوع',
                'target_type': 'defects',
                'target_value': 10,
                'points_reward': 75,
                'eligible_roles': ['inspector', 'specialist'],
            },
            {
                'code': generate_code('WEEKLY_JOB'),
                'name': 'Job Master',
                'name_ar': 'سيد العمل',
                'description': 'Complete 15 jobs this week',
                'description_ar': 'أكمل 15 وظيفة هذا الأسبوع',
                'target_type': 'jobs',
                'target_value': 15,
                'points_reward': 125,
                'eligible_roles': ['specialist', 'engineer'],
            },
            {
                'code': generate_code('WEEKLY_ALL'),
                'name': 'Team Player',
                'name_ar': 'لاعب الفريق',
                'description': 'Earn 200 points from any activity this week',
                'description_ar': 'اكسب 200 نقطة من أي نشاط هذا الأسبوع',
                'target_type': 'rating',  # Special type - manual tracking
                'target_value': 200,
                'points_reward': 50,
                'eligible_roles': None,  # All roles
            },
        ]

        created_count = 0
        for challenge_data in challenges_to_create:
            challenge = Challenge(
                code=challenge_data['code'],
                name=challenge_data['name'],
                name_ar=challenge_data.get('name_ar'),
                description=challenge_data['description'],
                description_ar=challenge_data.get('description_ar'),
                challenge_type='weekly',
                target_type=challenge_data['target_type'],
                target_value=challenge_data['target_value'],
                points_reward=challenge_data['points_reward'],
                start_date=next_monday,
                end_date=next_sunday,
                is_active=True,
                eligible_roles=challenge_data['eligible_roles'],
            )
            db.session.add(challenge)
            created_count += 1

        db.session.commit()
        logger.info(f"Created {created_count} weekly challenges for week of {next_monday}")

        return created_count

    def get_streak_info(self, user_id: int) -> dict:
        """
        Get user's streak information.

        Returns:
            Detailed streak information including milestones
        """
        user_streak = UserStreak.query.filter_by(user_id=user_id).first()

        if not user_streak:
            return {
                'current_streak': 0,
                'longest_streak': 0,
                'last_activity_date': None,
                'streak_start_date': None,
                'total_active_days': 0,
                'days_to_next_milestone': 7,
                'next_milestone': 7,
                'next_milestone_bonus': 50,
                'streak_at_risk': False,
            }

        # Determine next milestone
        current = user_streak.current_streak
        if current < 7:
            next_milestone = 7
            next_bonus = 50
        elif current < 30:
            next_milestone = 30
            next_bonus = 200
        elif current < 60:
            next_milestone = 60
            next_bonus = 400
        elif current < 100:
            next_milestone = 100
            next_bonus = 1000
        else:
            next_milestone = ((current // 100) + 1) * 100
            next_bonus = 1000

        days_to_milestone = next_milestone - current

        # Check if streak is at risk (no activity yesterday)
        today = date.today()
        streak_at_risk = False
        if user_streak.last_activity_date:
            days_since_activity = (today - user_streak.last_activity_date).days
            streak_at_risk = days_since_activity >= 1

        return {
            'current_streak': user_streak.current_streak,
            'longest_streak': user_streak.longest_streak,
            'last_activity_date': user_streak.last_activity_date.isoformat() if user_streak.last_activity_date else None,
            'streak_start_date': user_streak.streak_start_date.isoformat() if user_streak.streak_start_date else None,
            'total_active_days': user_streak.total_active_days,
            'days_to_next_milestone': days_to_milestone,
            'next_milestone': next_milestone,
            'next_milestone_bonus': next_bonus,
            'streak_at_risk': streak_at_risk,
        }

    def check_broken_streaks(self):
        """
        Check for users whose streaks may have broken (no activity yesterday).
        Called by scheduler to send reminders.
        """
        today = date.today()
        yesterday = today - timedelta(days=1)

        # Find users with active streaks who didn't have activity yesterday
        at_risk_streaks = UserStreak.query.filter(
            UserStreak.current_streak > 0,
            UserStreak.last_activity_date == yesterday
        ).all()

        for streak in at_risk_streaks:
            if streak.current_streak >= 3:  # Only notify for meaningful streaks
                try:
                    from app.services.notification_service import NotificationService
                    NotificationService.create_notification(
                        user_id=streak.user_id,
                        type='streak_reminder',
                        title='Streak at Risk!',
                        message=f'Your {streak.current_streak}-day streak is at risk! Complete an activity today to keep it going.',
                        priority='warning'
                    )
                except Exception as e:
                    logger.warning(f"Failed to send streak reminder: {e}")

        return len(at_risk_streaks)

    def update_achievement_progress(self):
        """
        Update progress for all users on count-based achievements.
        Called by scheduler periodically.
        """
        # Get all active count-based achievements
        achievements = Achievement.query.filter(
            Achievement.is_active == True,
            Achievement.criteria_type == 'count'
        ).all()

        updated_count = 0

        for achievement in achievements:
            # Get all user achievements that track this
            user_achievements = UserAchievement.query.filter(
                UserAchievement.achievement_id == achievement.id,
                UserAchievement.earned_at.is_(None)  # Not yet fully earned
            ).all()

            for ua in user_achievements:
                # Calculate current progress based on criteria_field
                current = 0
                if achievement.criteria_field == 'inspections':
                    current = Inspection.query.filter_by(
                        technician_id=ua.user_id, status='completed'
                    ).count()
                elif achievement.criteria_field == 'jobs':
                    current = SpecialistJob.query.filter_by(
                        specialist_id=ua.user_id, status='completed'
                    ).count() + EngineerJob.query.filter_by(
                        engineer_id=ua.user_id, status='completed'
                    ).count()
                elif achievement.criteria_field == 'defects':
                    current = Defect.query.join(Inspection).filter(Inspection.technician_id == ua.user_id).count()

                if current != ua.progress:
                    ua.progress = current
                    updated_count += 1

                    # Check if now complete
                    if current >= (achievement.criteria_target or 0):
                        ua.earned_at = datetime.utcnow()

        db.session.commit()
        logger.info(f"Updated progress for {updated_count} user achievements")

        return updated_count

    def get_challenge_leaderboard(self, challenge_id: int) -> list:
        """
        Get leaderboard for a specific challenge.

        Args:
            challenge_id: The challenge to get leaderboard for

        Returns:
            List of participants sorted by progress
        """
        participants = UserChallenge.query.filter_by(
            challenge_id=challenge_id
        ).order_by(UserChallenge.progress.desc()).all()

        result = []
        for rank, uc in enumerate(participants, 1):
            user = db.session.get(User, uc.user_id)
            result.append({
                'rank': rank,
                'user_id': uc.user_id,
                'full_name': user.full_name if user else 'Unknown',
                'progress': uc.progress,
                'progress_percent': uc.progress_percent,
                'is_completed': uc.is_completed,
                'completed_at': uc.completed_at.isoformat() if uc.completed_at else None,
                'joined_at': uc.joined_at.isoformat() if uc.joined_at else None,
            })

        return result
