"""
Service for leave coverage assignment.
Smart prioritization: specialists with 0 active defects preferred.
Handles temporary role switching for coverage.
"""

from app.models import User, Leave, Defect, SpecialistJob
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from datetime import datetime


class CoverageService:
    """Service for managing leave coverage assignments."""

    @staticmethod
    def get_coverage_candidates(leave_id):
        """
        Get ranked list of potential coverage candidates.
        Priority: same shift > same specialization > fewest active defects.
        Specialists with 0 defects are preferred for inspector coverage.
        """
        leave = Leave.query.get(leave_id)
        if not leave:
            raise NotFoundError(f"Leave {leave_id} not found")

        absent_user = User.query.get(leave.user_id)

        # Find available users (same shift, not on leave, active)
        candidates = User.query.filter(
            User.is_active == True,
            User.is_on_leave == False,
            User.id != absent_user.id
        ).all()

        scored = []
        for c in candidates:
            score = 0

            # Same shift bonus
            if c.shift == absent_user.shift:
                score += 10

            # Role compatibility
            if absent_user.role == 'inspector':
                # For inspector coverage, prefer specialists with 0 active defects
                if c.has_role('specialist'):
                    active_defects = Defect.query.join(SpecialistJob).filter(
                        SpecialistJob.specialist_id == c.id,
                        Defect.status.in_(['open', 'in_progress'])
                    ).count()
                    if active_defects == 0:
                        score += 5
                    else:
                        score += 2
                if c.has_role('inspector'):
                    score += 8
                    if c.specialization == absent_user.specialization:
                        score += 3
            elif absent_user.role == 'specialist':
                if c.has_role('specialist'):
                    score += 8
            elif absent_user.role == 'engineer':
                if c.has_role('engineer'):
                    score += 8

            # Fewer active jobs = more available
            active_jobs = SpecialistJob.query.filter_by(
                specialist_id=c.id,
                status='in_progress'
            ).count()
            score -= active_jobs

            scored.append({
                'user': c.to_dict(),
                'score': score,
                'active_jobs': active_jobs,
                'same_shift': c.shift == absent_user.shift,
                'same_role': c.has_role(absent_user.role)
            })

        # Sort by score descending
        scored.sort(key=lambda x: x['score'], reverse=True)
        return scored

    @staticmethod
    def assign_coverage(leave_id, coverage_user_id):
        """
        Assign a coverage user for a leave.
        May temporarily switch their role if needed.
        """
        leave = Leave.query.get(leave_id)
        if not leave:
            raise NotFoundError(f"Leave {leave_id} not found")
        if leave.status != 'approved':
            raise ValidationError("Leave must be approved first")

        absent_user = User.query.get(leave.user_id)
        coverage_user = User.query.get(coverage_user_id)

        if not coverage_user:
            raise NotFoundError(f"Coverage user {coverage_user_id} not found")
        if coverage_user.is_on_leave:
            raise ValidationError("Coverage user is on leave")

        # Assign coverage
        leave.coverage_user_id = coverage_user_id
        coverage_user.leave_coverage_for = absent_user.id

        # If specialist covering as inspector, set minor role
        if absent_user.role == 'inspector' and coverage_user.role == 'specialist':
            if not coverage_user.minor_role:
                coverage_user.minor_role = 'inspector'
                coverage_user.minor_role_id = f'COV-{coverage_user.role_id}'

        db.session.commit()

        # Notify coverage user
        from app.services.notification_service import NotificationService
        NotificationService.create_notification(
            user_id=coverage_user_id,
            type='coverage_assigned',
            title='Coverage Assignment',
            message=f'You have been assigned to cover for {absent_user.full_name} during their leave',
            related_type='leave',
            related_id=leave.id
        )

        return leave

    @staticmethod
    def end_coverage(leave_id):
        """
        End coverage assignment. Restore original roles.
        Called when leave ends.
        """
        leave = Leave.query.get(leave_id)
        if not leave:
            raise NotFoundError(f"Leave {leave_id} not found")

        if leave.coverage_user_id:
            coverage_user = User.query.get(leave.coverage_user_id)
            if coverage_user:
                coverage_user.leave_coverage_for = None
                # Remove temporary minor role if it was for coverage
                if coverage_user.minor_role_id and coverage_user.minor_role_id.startswith('COV-'):
                    coverage_user.minor_role = None
                    coverage_user.minor_role_id = None

        leave.coverage_user_id = None
        db.session.commit()
        return leave

    @staticmethod
    def get_capacity_analysis(shift=None):
        """
        Analyze current workforce capacity.
        Shows available vs on-leave counts per role and shift.
        """
        query = User.query.filter_by(is_active=True)
        if shift:
            query = query.filter_by(shift=shift)

        users = query.all()

        analysis = {
            'total': len(users),
            'available': 0,
            'on_leave': 0,
            'by_role': {},
            'by_shift': {}
        }

        for u in users:
            role = u.role
            s = u.shift or 'unassigned'

            if role not in analysis['by_role']:
                analysis['by_role'][role] = {'total': 0, 'available': 0, 'on_leave': 0}
            if s not in analysis['by_shift']:
                analysis['by_shift'][s] = {'total': 0, 'available': 0, 'on_leave': 0}

            analysis['by_role'][role]['total'] += 1
            analysis['by_shift'][s]['total'] += 1

            if u.is_on_leave:
                analysis['on_leave'] += 1
                analysis['by_role'][role]['on_leave'] += 1
                analysis['by_shift'][s]['on_leave'] += 1
            else:
                analysis['available'] += 1
                analysis['by_role'][role]['available'] += 1
                analysis['by_shift'][s]['available'] += 1

        return analysis
