"""
RatingCalculationService — Auto-star calculation for all roles.

Inspector stars (per inspection day):
  1. Completion: finished all assigned inspections for the day
  2. Timeliness: each inspection 15-20 minutes
  3. Quality: (a) photos not blurry, (b) voice > 5s, (c) verdict >= system verdict
  4-5. Engineer manual review (from InspectionRating)

Specialist stars (per job):
  1. Timeliness: finished within estimated time
  2. Repair Verified: next inspection confirms fix (MonitorFollowup.repair_verified)
     — auto-lost if Star 3 is lost
  3. QE Approved: QualityReview.status='approved' or (rejected + admin_validation='wrong')
  4. Cleaning: cleaning_rating > 0
  5. Engineer manual review

Engineer stars (daily):
  1. Plan Completion: >= 90% of work plan jobs completed
  2. Reviews Complete: 100% of assigned reviews done
  3. No Stop Machines: no 'stop' verdicts on engineer's machines today
  4. Team Quality: avg star rating of team >= 4.0/5.0
  5. Admin manual review
"""

from datetime import date, datetime, timedelta
from sqlalchemy import func, and_, or_
from app.extensions import db
import logging

logger = logging.getLogger(__name__)


class RatingCalculationService:
    """Calculate auto-stars for all roles and update avg_rating."""

    VERDICT_STRICTNESS = {'operational': 1, 'monitor': 2, 'stop': 3}

    # ───────────────────────── Inspector Stars ─────────────────────────

    def calculate_inspector_stars(self, user_id: int, target_date: date) -> dict:
        """
        Calculate 5 inspector stars for a given day.
        Returns dict with star_1..star_5 booleans + names.
        """
        from app.models import InspectionAssignment, Inspection, FinalAssessment, File
        from app.models.inspection_list import InspectionList
        from app.models.rating import InspectionRating

        stars = {
            'star_1': False, 'star_1_name': 'Completion',
            'star_2': False, 'star_2_name': 'Timeliness',
            'star_3': False, 'star_3_name': 'Inspection Quality',
            'star_4': False, 'star_4_name': 'Engineer Review 1',
            'star_5': False, 'star_5_name': 'Engineer Review 2',
        }

        # Get all assignments for this inspector on target_date
        lists = InspectionList.query.filter_by(target_date=target_date).all()
        list_ids = [il.id for il in lists]
        if not list_ids:
            return stars

        assignments = InspectionAssignment.query.filter(
            InspectionAssignment.inspection_list_id.in_(list_ids),
            or_(
                InspectionAssignment.mechanical_inspector_id == user_id,
                InspectionAssignment.electrical_inspector_id == user_id
            )
        ).all()

        if not assignments:
            return stars

        # Star 1: Completion — all assignments completed
        total = len(assignments)
        completed = sum(1 for a in assignments if a.status in ('completed', 'both_complete'))
        stars['star_1'] = (total > 0 and completed == total)

        # Star 2: Timeliness — inspections between 15-20 minutes
        inspections = []
        for a in assignments:
            # Get inspections linked to this assignment
            insp = Inspection.query.filter_by(assignment_id=a.id).all()
            inspections.extend(insp)

        timely_count = 0
        timed_count = 0
        for insp in inspections:
            if insp.started_at and insp.submitted_at:
                duration_min = (insp.submitted_at - insp.started_at).total_seconds() / 60
                timed_count += 1
                if 15 <= duration_min <= 20:
                    timely_count += 1

        if timed_count > 0:
            stars['star_2'] = (timely_count / timed_count) >= 0.7  # 70% within window

        # Star 3: Quality — verdict matches or stricter than system
        quality_checks = {'verdict_ok': True, 'has_verdicts': False}
        for a in assignments:
            assessment = FinalAssessment.query.filter_by(
                inspection_assignment_id=a.id
            ).first()
            if not assessment or not assessment.system_verdict:
                continue

            quality_checks['has_verdicts'] = True
            system_strict = self.VERDICT_STRICTNESS.get(assessment.system_verdict, 0)

            # Check which verdict this user gave (mech or elec)
            if a.mechanical_inspector_id == user_id and assessment.mech_verdict:
                user_strict = self.VERDICT_STRICTNESS.get(assessment.mech_verdict, 0)
                if user_strict < system_strict:
                    quality_checks['verdict_ok'] = False
            elif a.electrical_inspector_id == user_id and assessment.elec_verdict:
                user_strict = self.VERDICT_STRICTNESS.get(assessment.elec_verdict, 0)
                if user_strict < system_strict:
                    quality_checks['verdict_ok'] = False

        if quality_checks['has_verdicts']:
            stars['star_3'] = quality_checks['verdict_ok']

        # Stars 4-5: Engineer manual review (from InspectionRating)
        # Get average engineer rating for this user's inspections today
        inspection_ids = [i.id for i in inspections]
        if inspection_ids:
            ratings = InspectionRating.query.filter(
                InspectionRating.inspection_id.in_(inspection_ids)
            ).all()
            if ratings:
                avg_rating = sum(r.rating for r in ratings) / len(ratings)
                stars['star_4'] = avg_rating >= 1  # At least 1 star from engineer
                stars['star_5'] = avg_rating >= 2  # At least 2 stars from engineer

        return stars

    # ───────────────────────── Specialist Stars ─────────────────────────

    def calculate_specialist_stars(self, specialist_job_id: int) -> dict:
        """
        Calculate 5 specialist stars for a specific job.
        Returns dict with star_1..star_5 booleans + names.
        """
        from app.models import SpecialistJob, WorkPlanJob, QualityReview
        from app.models.work_plan_job_rating import WorkPlanJobRating
        from app.models.monitor_followup import MonitorFollowup

        stars = {
            'star_1': False, 'star_1_name': 'Timeliness',
            'star_2': False, 'star_2_name': 'Repair Verified',
            'star_3': False, 'star_3_name': 'QE Approved',
            'star_4': False, 'star_4_name': 'Cleaning',
            'star_5': False, 'star_5_name': 'Engineer Review',
        }

        job = db.session.get(SpecialistJob, specialist_job_id)
        if not job or job.status not in ('completed', 'qc_approved'):
            return stars

        # Star 1: Timeliness — finished within estimated time
        if job.actual_time_hours and job.planned_time_hours:
            stars['star_1'] = float(job.actual_time_hours) <= float(job.planned_time_hours)

        # Star 3: QE Approved (check before Star 2 due to dependency)
        qe_review = QualityReview.query.filter_by(
            job_id=specialist_job_id,
            job_type='specialist'
        ).order_by(QualityReview.id.desc()).first()

        if qe_review:
            if qe_review.status == 'approved':
                stars['star_3'] = True
            elif qe_review.status == 'rejected' and qe_review.admin_validation == 'wrong':
                stars['star_3'] = True  # QE was wrong, admin overruled

        # Star 2: Repair Verified (auto-lost if Star 3 is lost)
        if stars['star_3']:
            followup = MonitorFollowup.query.filter_by(
                linked_specialist_job_id=specialist_job_id
            ).first()
            if followup and followup.repair_verified is True:
                stars['star_2'] = True

        # Star 4: Cleaning — from job rating or specialist job itself
        wpj_rating = WorkPlanJobRating.query.filter_by(
            specialist_job_id=specialist_job_id
        ).first()
        if wpj_rating and wpj_rating.cleaning_rating and float(wpj_rating.cleaning_rating) > 0:
            stars['star_4'] = True
        elif job.cleaning_rating and job.cleaning_rating > 0:
            stars['star_4'] = True

        # Star 5: Engineer manual review
        if wpj_rating and wpj_rating.admin_bonus and wpj_rating.admin_bonus > 0:
            stars['star_5'] = True

        return stars

    # ───────────────────────── Engineer Stars ─────────────────────────

    def calculate_engineer_daily_stars(self, engineer_id: int, target_date: date) -> dict:
        """
        Calculate 5 engineer stars for a given day.
        Returns dict with star_1..star_5 booleans + names.
        """
        from app.models import User, WorkPlanJob, FinalAssessment
        from app.models.work_plan_day import WorkPlanDay
        from app.models.star_history import StarHistory

        stars = {
            'star_1': False, 'star_1_name': 'Plan Completion',
            'star_2': False, 'star_2_name': 'Reviews Complete',
            'star_3': False, 'star_3_name': 'No Stop Machines',
            'star_4': False, 'star_4_name': 'Team Quality',
            'star_5': False, 'star_5_name': 'Admin Review',
        }

        # Star 1: Plan Completion >= 90%
        days = WorkPlanDay.query.filter_by(plan_date=target_date).all()
        day_ids = [d.id for d in days]

        if day_ids:
            jobs = WorkPlanJob.query.filter(
                WorkPlanJob.day_id.in_(day_ids),
                WorkPlanJob.engineer_id == engineer_id
            ).all()

            if jobs:
                total = len(jobs)
                completed = sum(1 for j in jobs if j.status in ('completed', 'verified'))
                completion_rate = completed / total
                stars['star_1'] = completion_rate >= 0.9

        # Star 2: Reviews Complete — all assigned reviews done today
        # Check work plan daily reviews for this engineer
        from app.models.work_plan_daily_review import WorkPlanDailyReview
        reviews = WorkPlanDailyReview.query.filter(
            WorkPlanDailyReview.reviewer_id == engineer_id,
            func.date(WorkPlanDailyReview.created_at) == target_date
        ).all()
        # If there are any reviews, consider this done (engineer reviewed)
        if reviews:
            stars['star_2'] = True

        # Star 3: No Stop Machines
        # Check if any assessment on this engineer's machines went to 'stop' today
        if day_ids:
            engineer_jobs = WorkPlanJob.query.filter(
                WorkPlanJob.day_id.in_(day_ids),
                WorkPlanJob.engineer_id == engineer_id
            ).all()
            equipment_ids = list(set(j.equipment_id for j in engineer_jobs if j.equipment_id))

            stop_count = 0
            if equipment_ids:
                stop_count = FinalAssessment.query.filter(
                    FinalAssessment.equipment_id.in_(equipment_ids),
                    func.date(FinalAssessment.created_at) == target_date,
                    or_(
                        FinalAssessment.system_verdict == 'stop',
                        FinalAssessment.mech_verdict == 'stop',
                        FinalAssessment.elec_verdict == 'stop',
                    )
                ).count()

            stars['star_3'] = (stop_count == 0)
        else:
            stars['star_3'] = True  # No jobs = no stops

        # Star 4: Team Quality — avg stars of team >= 4.0/5.0
        # Get all users assigned to this engineer's jobs today
        if day_ids:
            from app.models.work_plan_assignment import WorkPlanAssignment
            engineer_job_ids = [j.id for j in (engineer_jobs if 'engineer_jobs' in dir() else [])]
            if engineer_job_ids:
                team_user_ids = db.session.query(
                    WorkPlanAssignment.user_id
                ).filter(
                    WorkPlanAssignment.job_id.in_(engineer_job_ids)
                ).distinct().all()
                team_user_ids = [u[0] for u in team_user_ids]

                if team_user_ids:
                    # Get recent star history for team members
                    week_ago = target_date - timedelta(days=7)
                    team_stars = StarHistory.query.filter(
                        StarHistory.user_id.in_(team_user_ids),
                        StarHistory.created_at >= datetime.combine(week_ago, datetime.min.time())
                    ).all()

                    if team_stars:
                        avg_stars = sum(s.total_stars for s in team_stars) / len(team_stars)
                        stars['star_4'] = avg_stars >= 4.0

        # Star 5: Admin manual — checked separately via admin UI
        # (populated when admin rates the engineer)

        return stars

    # ───────────────────────── Batch Processing ─────────────────────────

    def calculate_all_daily_stars(self, target_date: date) -> dict:
        """
        Calculate stars for all users for a given day.
        Called by scheduler at 11 PM.
        """
        from app.models import User
        from app.models.star_history import StarHistory

        results = {'inspector_count': 0, 'specialist_count': 0, 'engineer_count': 0}

        # --- Inspectors ---
        inspectors = User.query.filter(
            User.is_active == True,
            or_(User.role == 'inspector', User.minor_role == 'inspector')
        ).all()

        for user in inspectors:
            try:
                stars = self.calculate_inspector_stars(user.id, target_date)
                self._save_star_history(
                    user_id=user.id,
                    role='inspector',
                    target_type='inspector_daily',
                    target_date=target_date,
                    stars=stars
                )
                results['inspector_count'] += 1
            except Exception as e:
                logger.warning(f"Inspector star calc failed for user {user.id}: {e}")

        # --- Specialists (stars are per-job, already calculated on completion) ---
        # Just log count of specialist star records created today
        today_start = datetime.combine(target_date, datetime.min.time())
        today_end = today_start + timedelta(days=1)
        results['specialist_count'] = StarHistory.query.filter(
            StarHistory.role == 'specialist',
            StarHistory.created_at >= today_start,
            StarHistory.created_at < today_end
        ).count()

        # --- Engineers ---
        engineers = User.query.filter(
            User.is_active == True,
            or_(User.role == 'engineer', User.minor_role == 'engineer')
        ).all()

        for user in engineers:
            try:
                stars = self.calculate_engineer_daily_stars(user.id, target_date)
                self._save_star_history(
                    user_id=user.id,
                    role='engineer',
                    target_type='engineer_daily',
                    target_date=target_date,
                    stars=stars
                )
                results['engineer_count'] += 1
            except Exception as e:
                logger.warning(f"Engineer star calc failed for user {user.id}: {e}")

        db.session.commit()
        return results

    def _save_star_history(self, user_id: int, role: str, target_type: str,
                           target_date: date, stars: dict,
                           target_id: int = None) -> None:
        """Save or update a StarHistory record and recalculate avg_rating."""
        from app.models.star_history import StarHistory

        # Check for existing record (avoid duplicates)
        existing = StarHistory.query.filter_by(
            user_id=user_id,
            target_type=target_type,
            target_date=target_date,
            target_id=target_id
        ).first()

        if existing:
            record = existing
        else:
            record = StarHistory(user_id=user_id, role=role,
                                 target_type=target_type,
                                 target_id=target_id,
                                 target_date=target_date)
            db.session.add(record)

        record.star_1 = stars.get('star_1', False)
        record.star_2 = stars.get('star_2', False)
        record.star_3 = stars.get('star_3', False)
        record.star_4 = stars.get('star_4', False)
        record.star_5 = stars.get('star_5', False)
        record.star_1_name = stars.get('star_1_name', '')
        record.star_2_name = stars.get('star_2_name', '')
        record.star_3_name = stars.get('star_3_name', '')
        record.star_4_name = stars.get('star_4_name', '')
        record.star_5_name = stars.get('star_5_name', '')
        record.recalculate_totals()
        record.updated_at = datetime.utcnow()

        db.session.flush()

        # Recalculate avg_rating for this user
        self.recalculate_avg_rating(user_id)

    def recalculate_avg_rating(self, user_id: int) -> float:
        """
        Aggregate all star_history records for a user → avg → save to UserLevel.avg_rating.
        Called after every star record insert + daily safety net.
        """
        from app.models.star_history import StarHistory
        from app.models.user_level import UserLevel

        # Get average total_stars across all records for this user
        result = db.session.query(
            func.avg(StarHistory.total_stars)
        ).filter(
            StarHistory.user_id == user_id
        ).scalar()

        avg_rating = float(result) if result else 0.0

        user_level = UserLevel.query.filter_by(user_id=user_id).first()
        if not user_level:
            user_level = UserLevel(user_id=user_id, level=1, current_xp=0, total_xp=0)
            db.session.add(user_level)

        user_level.avg_rating = round(avg_rating, 2)
        db.session.flush()

        return avg_rating
