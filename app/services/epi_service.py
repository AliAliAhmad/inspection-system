"""
EPIService — Employee Performance Index calculation.

EPI = 5 components x 20 points each = 0-100 total.

Components:
  1. Completion (0-20): % of assigned work completed
  2. Quality (0-20): avg star rating scaled to 20
  3. Timeliness (0-20): % of work done within time window
  4. Contribution (0-20): defects found / additional findings / plans published
  5. Safety Record (0-20): deductions for critical misses

Calculated over rolling 30 days. Weekly snapshots stored for history.
"""

from datetime import date, datetime, timedelta
from sqlalchemy import func, and_, or_
from app.extensions import db
import logging

logger = logging.getLogger(__name__)


class EPIService:
    """Calculate Employee Performance Index for all roles."""

    # Deduction amounts for safety component
    SAFETY_DEDUCTIONS = {
        'missed_critical': 5,     # Inspector missed a critical defect
        'qe_rejection': 3,        # Specialist QE rejection
        'stop_machine': 10,       # Engineer had a machine go to STOP
    }

    def calculate_epi(self, user_id: int, role: str, days: int = 30) -> dict:
        """
        Calculate EPI for a user over a rolling period.

        Returns:
            {
                'completion': float (0-20),
                'quality': float (0-20),
                'timeliness': float (0-20),
                'contribution': float (0-20),
                'safety': float (0-20),
                'total_epi': float (0-100),
            }
        """
        start_date = date.today() - timedelta(days=days)

        if role == 'inspector':
            return self._calc_inspector_epi(user_id, start_date)
        elif role == 'specialist':
            return self._calc_specialist_epi(user_id, start_date)
        elif role == 'engineer':
            return self._calc_engineer_epi(user_id, start_date)
        else:
            return self._empty_epi()

    def _calc_inspector_epi(self, user_id: int, start_date: date) -> dict:
        """Calculate EPI for an inspector."""
        from app.models import Inspection, InspectionAssignment, Defect, FinalAssessment
        from app.models.inspection_list import InspectionList
        from app.models.star_history import StarHistory

        start_dt = datetime.combine(start_date, datetime.min.time())

        # Completion: % of assigned inspections completed
        lists = InspectionList.query.filter(InspectionList.target_date >= start_date).all()
        list_ids = [il.id for il in lists]

        total_assigned = 0
        total_completed = 0
        if list_ids:
            assignments = InspectionAssignment.query.filter(
                InspectionAssignment.inspection_list_id.in_(list_ids),
                or_(
                    InspectionAssignment.mechanical_inspector_id == user_id,
                    InspectionAssignment.electrical_inspector_id == user_id
                )
            ).all()
            total_assigned = len(assignments)
            total_completed = sum(1 for a in assignments
                                  if a.status in ('completed', 'both_complete'))

        completion = (total_completed / total_assigned * 20) if total_assigned > 0 else 0

        # Quality: avg star rating scaled to 20
        avg_stars = db.session.query(
            func.avg(StarHistory.total_stars)
        ).filter(
            StarHistory.user_id == user_id,
            StarHistory.role == 'inspector',
            StarHistory.created_at >= start_dt
        ).scalar() or 0
        quality = min(20, (float(avg_stars) / 5.0) * 20)

        # Timeliness: % of inspections in 15-20 min window
        inspections = Inspection.query.filter(
            Inspection.technician_id == user_id,
            Inspection.submitted_at >= start_dt,
            Inspection.started_at.isnot(None),
            Inspection.submitted_at.isnot(None)
        ).all()

        timely = 0
        timed = 0
        for i in inspections:
            if i.started_at and i.submitted_at:
                dur = (i.submitted_at - i.started_at).total_seconds() / 60
                timed += 1
                if 15 <= dur <= 20:
                    timely += 1
        timeliness = (timely / timed * 20) if timed > 0 else 0

        # Contribution: defects found + safety hazards
        defect_count = Defect.query.join(Inspection).filter(
            Inspection.technician_id == user_id,
            Defect.created_at >= start_dt
        ).count()
        # Cap contribution at 20 (scale: each defect = 2 points, max 10 defects)
        contribution = min(20, defect_count * 2)

        # Safety: 20 minus deductions for missed critical defects
        # A "miss" = inspector verdict softer than system verdict on a critical item
        safety = 20.0
        if list_ids:
            for a in (assignments if total_assigned > 0 else []):
                assessment = FinalAssessment.query.filter_by(
                    inspection_assignment_id=a.id
                ).first()
                if not assessment:
                    continue
                sys_strict = self._verdict_level(assessment.system_verdict)
                if a.mechanical_inspector_id == user_id:
                    user_strict = self._verdict_level(assessment.mech_verdict)
                elif a.electrical_inspector_id == user_id:
                    user_strict = self._verdict_level(assessment.elec_verdict)
                else:
                    continue

                if sys_strict >= 3 and user_strict < sys_strict:  # Missed critical
                    safety -= self.SAFETY_DEDUCTIONS['missed_critical']

        safety = max(0, safety)

        total = completion + quality + timeliness + contribution + safety
        return self._build_result(completion, quality, timeliness, contribution, safety)

    def _calc_specialist_epi(self, user_id: int, start_date: date) -> dict:
        """Calculate EPI for a specialist."""
        from app.models import SpecialistJob, QualityReview
        from app.models.star_history import StarHistory

        start_dt = datetime.combine(start_date, datetime.min.time())

        # Completion: % of assigned jobs completed
        jobs = SpecialistJob.query.filter(
            SpecialistJob.specialist_id == user_id,
            SpecialistJob.created_at >= start_dt
        ).all()
        total_jobs = len(jobs)
        completed_jobs = sum(1 for j in jobs if j.status in ('completed', 'qc_approved'))
        completion = (completed_jobs / total_jobs * 20) if total_jobs > 0 else 0

        # Quality: avg star rating
        avg_stars = db.session.query(
            func.avg(StarHistory.total_stars)
        ).filter(
            StarHistory.user_id == user_id,
            StarHistory.role == 'specialist',
            StarHistory.created_at >= start_dt
        ).scalar() or 0
        quality = min(20, (float(avg_stars) / 5.0) * 20)

        # Timeliness: % of jobs under estimated time
        timed_jobs = [j for j in jobs if j.actual_time_hours and j.planned_time_hours]
        under_time = sum(1 for j in timed_jobs
                         if float(j.actual_time_hours) <= float(j.planned_time_hours))
        timeliness = (under_time / len(timed_jobs) * 20) if timed_jobs else 0

        # Contribution: additional findings + discovery points
        from app.models import Defect
        findings = Defect.query.filter(
            Defect.found_during_repair_by == user_id,
            Defect.created_at >= start_dt
        ).count()
        contribution = min(20, findings * 4)  # Each finding = 4 pts, max 5 findings

        # Safety: 20 minus QE rejections
        safety = 20.0
        for j in jobs:
            qe = QualityReview.query.filter_by(
                job_id=j.id, job_type='specialist', status='rejected'
            ).first()
            if qe and qe.admin_validation != 'wrong':  # Real rejection
                safety -= self.SAFETY_DEDUCTIONS['qe_rejection']
        safety = max(0, safety)

        return self._build_result(completion, quality, timeliness, contribution, safety)

    def _calc_engineer_epi(self, user_id: int, start_date: date) -> dict:
        """Calculate EPI for an engineer."""
        from app.models import WorkPlanJob, FinalAssessment
        from app.models.work_plan_day import WorkPlanDay
        from app.models.work_plan_daily_review import WorkPlanDailyReview
        from app.models.star_history import StarHistory

        start_dt = datetime.combine(start_date, datetime.min.time())

        # Completion: % of work plan jobs completed
        days = WorkPlanDay.query.filter(WorkPlanDay.plan_date >= start_date).all()
        day_ids = [d.id for d in days]

        total_jobs = 0
        completed_jobs = 0
        equipment_ids = set()
        if day_ids:
            jobs = WorkPlanJob.query.filter(
                WorkPlanJob.day_id.in_(day_ids),
                WorkPlanJob.engineer_id == user_id
            ).all()
            total_jobs = len(jobs)
            completed_jobs = sum(1 for j in jobs if j.status in ('completed', 'verified'))
            equipment_ids = set(j.equipment_id for j in jobs if j.equipment_id)

        completion = (completed_jobs / total_jobs * 20) if total_jobs > 0 else 0

        # Quality: avg star rating
        avg_stars = db.session.query(
            func.avg(StarHistory.total_stars)
        ).filter(
            StarHistory.user_id == user_id,
            StarHistory.role == 'engineer',
            StarHistory.created_at >= start_dt
        ).scalar() or 0
        quality = min(20, (float(avg_stars) / 5.0) * 20)

        # Timeliness: % of reviews done same-day
        reviews = WorkPlanDailyReview.query.filter(
            WorkPlanDailyReview.reviewer_id == user_id,
            WorkPlanDailyReview.created_at >= start_dt
        ).all()
        same_day = sum(1 for r in reviews
                       if r.created_at and r.review_date
                       and r.created_at.date() == r.review_date)
        timeliness = (same_day / len(reviews) * 20) if reviews else 0

        # Contribution: plans published + escalations resolved
        from app.models.work_plan import WorkPlan
        plans_published = WorkPlan.query.filter(
            WorkPlan.created_by_id == user_id,
            WorkPlan.status == 'published',
            WorkPlan.created_at >= start_dt
        ).count()
        contribution = min(20, plans_published * 5)  # Each plan = 5 pts

        # Safety: 20 minus stop machines
        safety = 20.0
        if equipment_ids:
            stop_count = FinalAssessment.query.filter(
                FinalAssessment.equipment_id.in_(list(equipment_ids)),
                FinalAssessment.created_at >= start_dt,
                or_(
                    FinalAssessment.system_verdict == 'stop',
                    FinalAssessment.mech_verdict == 'stop',
                    FinalAssessment.elec_verdict == 'stop',
                )
            ).count()
            safety -= stop_count * self.SAFETY_DEDUCTIONS['stop_machine']
        safety = max(0, safety)

        return self._build_result(completion, quality, timeliness, contribution, safety)

    # ───────────────────────── Snapshots ─────────────────────────

    def generate_weekly_snapshots(self) -> int:
        """
        Generate weekly EPI snapshots for all active users.
        Called by scheduler on Sunday at 11:30 PM.
        """
        from app.models import User
        from app.models.epi_snapshot import EPISnapshot

        today = date.today()
        week_start = today - timedelta(days=today.weekday())  # Monday
        week_end = week_start + timedelta(days=6)  # Sunday

        users = User.query.filter_by(is_active=True).all()
        count = 0

        for user in users:
            role = user.role
            if role not in ('inspector', 'specialist', 'engineer'):
                continue

            # Skip if snapshot already exists for this week
            existing = EPISnapshot.query.filter_by(
                user_id=user.id,
                week_start=week_start
            ).first()
            if existing:
                continue

            try:
                epi = self.calculate_epi(user.id, role, days=7)

                snapshot = EPISnapshot(
                    user_id=user.id,
                    role=role,
                    week_start=week_start,
                    week_end=week_end,
                    completion_score=epi['completion'],
                    quality_score=epi['quality'],
                    timeliness_score=epi['timeliness'],
                    contribution_score=epi['contribution'],
                    safety_score=epi['safety'],
                    total_epi=epi['total_epi'],
                    created_at=datetime.utcnow()
                )
                db.session.add(snapshot)
                count += 1
            except Exception as e:
                logger.warning(f"EPI snapshot failed for user {user.id}: {e}")

        db.session.commit()
        return count

    # ───────────────────────── Helpers ─────────────────────────

    def _verdict_level(self, verdict: str) -> int:
        return {'operational': 1, 'monitor': 2, 'stop': 3}.get(verdict or '', 0)

    def _empty_epi(self) -> dict:
        return self._build_result(0, 0, 0, 0, 20)

    def _build_result(self, completion, quality, timeliness, contribution, safety) -> dict:
        completion = round(min(20, max(0, completion)), 1)
        quality = round(min(20, max(0, quality)), 1)
        timeliness = round(min(20, max(0, timeliness)), 1)
        contribution = round(min(20, max(0, contribution)), 1)
        safety = round(min(20, max(0, safety)), 1)
        total = round(completion + quality + timeliness + contribution + safety, 1)
        return {
            'completion': completion,
            'quality': quality,
            'timeliness': timeliness,
            'contribution': contribution,
            'safety': safety,
            'total_epi': total,
        }
