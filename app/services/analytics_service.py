"""
Service for analytics and reporting.
Aggregation queries for dashboards and performance metrics.
"""

from app.models import (
    Inspection, Defect, Equipment, User, SpecialistJob, EngineerJob,
    InspectionAssignment, InspectionList, PauseLog, Leave,
    QualityReview, FinalAssessment, BonusStar
)
from app.extensions import db
from datetime import datetime, date, timedelta
from sqlalchemy import func, case


class AnalyticsService:
    """Service for aggregated analytics and reporting."""

    @staticmethod
    def admin_dashboard():
        """Comprehensive admin dashboard stats."""
        today = date.today()

        return {
            'inspections': {
                'total': Inspection.query.count(),
                'passed': Inspection.query.filter_by(result='pass').count(),
                'failed': Inspection.query.filter_by(result='fail').count(),
                'in_progress': Inspection.query.filter_by(status='draft').count(),
            },
            'defects': {
                'total': Defect.query.count(),
                'open': Defect.query.filter_by(status='open').count(),
                'in_progress': Defect.query.filter_by(status='in_progress').count(),
                'resolved': Defect.query.filter_by(status='resolved').count(),
                'critical_open': Defect.query.filter(
                    Defect.severity == 'critical',
                    Defect.status.in_(['open', 'in_progress'])
                ).count(),
                'overdue': Defect.query.filter(
                    Defect.due_date < today,
                    Defect.status.in_(['open', 'in_progress'])
                ).count(),
            },
            'equipment': {
                'total': Equipment.query.count(),
                'active': Equipment.query.filter_by(status='active').count(),
                'under_maintenance': Equipment.query.filter_by(status='under_maintenance').count(),
                'stopped': Equipment.query.filter_by(status='stopped').count(),
                'out_of_service': Equipment.query.filter_by(status='out_of_service').count(),
            },
            'specialist_jobs': {
                'total': SpecialistJob.query.count(),
                'in_progress': SpecialistJob.query.filter_by(status='in_progress').count(),
                'paused': SpecialistJob.query.filter_by(status='paused').count(),
                'completed': SpecialistJob.query.filter_by(status='completed').count(),
            },
            'engineer_jobs': {
                'total': EngineerJob.query.count(),
                'in_progress': EngineerJob.query.filter_by(status='in_progress').count(),
                'completed': EngineerJob.query.filter_by(status='completed').count(),
            },
            'workforce': {
                'total_users': User.query.filter_by(is_active=True).count(),
                'on_leave': User.query.filter_by(is_on_leave=True).count(),
                'inspectors': User.query.filter(
                    User.is_active == True,
                    db.or_(User.role == 'inspector', User.minor_role == 'inspector')
                ).count(),
                'specialists': User.query.filter(
                    User.is_active == True,
                    db.or_(User.role == 'specialist', User.minor_role == 'specialist')
                ).count(),
            },
            'today': {
                'assignments': InspectionAssignment.query.join(InspectionList).filter(
                    InspectionList.target_date == today
                ).count(),
                'completed_assignments': InspectionAssignment.query.join(InspectionList).filter(
                    InspectionList.target_date == today,
                    InspectionAssignment.status == 'completed'
                ).count(),
            }
        }

    @staticmethod
    def engineer_dashboard(engineer_id):
        """Dashboard stats for engineers."""
        return {
            'my_jobs': {
                'total': EngineerJob.query.filter_by(engineer_id=engineer_id).count(),
                'in_progress': EngineerJob.query.filter_by(engineer_id=engineer_id, status='in_progress').count(),
                'completed': EngineerJob.query.filter_by(engineer_id=engineer_id, status='completed').count(),
            },
            'assignments_today': InspectionAssignment.query.filter_by(
                assigned_by=engineer_id
            ).join(InspectionList).filter(
                InspectionList.target_date == date.today()
            ).count(),
            'pending_pauses': PauseLog.query.filter_by(status='pending').count(),
        }

    @staticmethod
    def inspector_dashboard(inspector_id):
        """Dashboard stats for inspectors."""
        user = User.query.get(inspector_id)
        today = date.today()

        # Get assignments for this inspector
        mech_assignments = InspectionAssignment.query.filter_by(
            mechanical_inspector_id=inspector_id
        )
        elec_assignments = InspectionAssignment.query.filter_by(
            electrical_inspector_id=inspector_id
        )

        return {
            'today_assignments': mech_assignments.join(InspectionList).filter(
                InspectionList.target_date == today
            ).count() + elec_assignments.join(InspectionList).filter(
                InspectionList.target_date == today
            ).count(),
            'pending_assessments': FinalAssessment.query.filter(
                FinalAssessment.finalized_at.is_(None),
                db.or_(
                    db.and_(FinalAssessment.mechanical_inspector_id == inspector_id, FinalAssessment.mech_verdict.is_(None)),
                    db.and_(FinalAssessment.electrical_inspector_id == inspector_id, FinalAssessment.elec_verdict.is_(None))
                )
            ).count(),
            'total_points': user.inspector_points if user else 0,
            'specialization': user.specialization if user else None,
        }

    @staticmethod
    def specialist_dashboard(specialist_id):
        """Dashboard stats for specialists."""
        user = User.query.get(specialist_id)
        return {
            'my_jobs': {
                'total': SpecialistJob.query.filter_by(specialist_id=specialist_id).count(),
                'in_progress': SpecialistJob.query.filter_by(specialist_id=specialist_id, status='in_progress').count(),
                'paused': SpecialistJob.query.filter_by(specialist_id=specialist_id, status='paused').count(),
                'completed': SpecialistJob.query.filter_by(specialist_id=specialist_id, status='completed').count(),
                'pending_planned_time': SpecialistJob.query.filter_by(
                    specialist_id=specialist_id,
                    planned_time_hours=None
                ).filter(SpecialistJob.status != 'completed').count(),
            },
            'total_points': user.specialist_points if user else 0,
            'pending_qc': QualityReview.query.filter_by(
                job_type='specialist',
                status='pending'
            ).join(SpecialistJob, SpecialistJob.id == QualityReview.job_id).filter(
                SpecialistJob.specialist_id == specialist_id
            ).count(),
        }

    @staticmethod
    def qe_dashboard(qe_id):
        """Dashboard stats for quality engineers."""
        return {
            'pending_reviews': QualityReview.query.filter_by(qe_id=qe_id, status='pending').count(),
            'approved': QualityReview.query.filter_by(qe_id=qe_id, status='approved').count(),
            'rejected': QualityReview.query.filter_by(qe_id=qe_id, status='rejected').count(),
            'overdue': QualityReview.query.filter(
                QualityReview.qe_id == qe_id,
                QualityReview.status == 'pending',
                QualityReview.sla_deadline < datetime.utcnow()
            ).count(),
            'total_points': User.query.get(qe_id).qe_points if User.query.get(qe_id) else 0,
        }

    @staticmethod
    def pause_analytics():
        """Analyze pause patterns across all jobs."""
        pauses = PauseLog.query.filter_by(status='approved').all()

        by_category = {}
        total_duration = 0
        count = 0

        for p in pauses:
            cat = p.reason_category
            if cat not in by_category:
                by_category[cat] = {'count': 0, 'total_minutes': 0}
            by_category[cat]['count'] += 1
            if p.duration_minutes:
                by_category[cat]['total_minutes'] += p.duration_minutes
                total_duration += p.duration_minutes
                count += 1

        return {
            'total_pauses': len(pauses),
            'average_duration_minutes': round(total_duration / count, 1) if count > 0 else 0,
            'by_category': by_category,
            'pending_count': PauseLog.query.filter_by(status='pending').count(),
        }

    @staticmethod
    def defect_analytics():
        """Analyze defect patterns."""
        defects = Defect.query.all()

        by_severity = {}
        by_category = {}

        for d in defects:
            sev = d.severity
            if sev not in by_severity:
                by_severity[sev] = {'count': 0, 'open': 0, 'resolved': 0}
            by_severity[sev]['count'] += 1
            if d.status in ('open', 'in_progress'):
                by_severity[sev]['open'] += 1
            elif d.status in ('resolved', 'closed'):
                by_severity[sev]['resolved'] += 1

            cat = d.category or 'unspecified'
            if cat not in by_category:
                by_category[cat] = 0
            by_category[cat] += 1

        return {
            'total': len(defects),
            'by_severity': by_severity,
            'by_category': by_category,
        }

    @staticmethod
    def leaderboard(role=None, period='all_time'):
        """
        Get user rankings by points.

        Args:
            role: Filter by role (inspector, specialist, engineer, quality_engineer)
            period: all_time, monthly, weekly, daily
        """
        query = User.query.filter_by(is_active=True)

        if role:
            query = query.filter(db.or_(User.role == role, User.minor_role == role))

        users = query.all()

        rankings = []
        for u in users:
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

            rankings.append({
                'user_id': u.id,
                'full_name': u.full_name,
                'role': u.role,
                'role_id': u.role_id,
                'points': points,
                'specialization': u.specialization,
            })

        rankings.sort(key=lambda x: x['points'], reverse=True)

        # Add rank
        for i, r in enumerate(rankings):
            r['rank'] = i + 1

        return rankings
