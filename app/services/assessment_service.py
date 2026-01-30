"""
Service for final equipment assessment by both inspectors.
Safety-first: if either inspector says URGENT, equipment stops.
"""

import logging
from app.models import FinalAssessment, InspectionAssignment, Equipment, User
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import datetime

logger = logging.getLogger(__name__)


class AssessmentService:
    """Service for managing final equipment assessments."""

    @staticmethod
    def create_assessment(assignment_id):
        """
        Create a final assessment record when both inspectors complete their checklists.
        """
        assignment = db.session.get(InspectionAssignment, assignment_id)
        if not assignment:
            raise NotFoundError(f"Assignment {assignment_id} not found")

        if assignment.status != 'both_complete':
            raise ValidationError("Both inspectors must complete their checklists first")

        # Check if assessment already exists
        existing = FinalAssessment.query.filter_by(
            inspection_assignment_id=assignment_id
        ).first()
        if existing:
            return existing

        assessment = FinalAssessment(
            equipment_id=assignment.equipment_id,
            inspection_assignment_id=assignment_id,
            mechanical_inspector_id=assignment.mechanical_inspector_id,
            electrical_inspector_id=assignment.electrical_inspector_id
        )
        db.session.add(assessment)
        assignment.status = 'assessment_pending'
        db.session.commit()
        logger.info("Assessment created: assessment_id=%s assignment_id=%s equipment_id=%s", assessment.id, assignment_id, assignment.equipment_id)

        # Notify both inspectors
        from app.services.notification_service import NotificationService
        for uid in [assignment.mechanical_inspector_id, assignment.electrical_inspector_id]:
            NotificationService.create_notification(
                user_id=uid,
                type='assessment_required',
                title='Final Assessment Required',
                message=f'Please submit your final verdict for {assignment.equipment.name}',
                related_type='final_assessment',
                related_id=assessment.id
            )

        return assessment

    @staticmethod
    def submit_verdict(assessment_id, inspector_id, verdict, urgent_reason=None):
        """
        Submit inspector verdict (operational or urgent).

        Args:
            assessment_id: FinalAssessment ID
            inspector_id: User ID of inspector
            verdict: 'operational' or 'urgent'
            urgent_reason: Required if verdict is 'urgent' (min 50 chars)
        """
        assessment = db.session.get(FinalAssessment, assessment_id)
        if not assessment:
            raise NotFoundError(f"Assessment {assessment_id} not found")

        if verdict not in ('operational', 'urgent'):
            raise ValidationError("Verdict must be 'operational' or 'urgent'")

        if verdict == 'urgent':
            if not urgent_reason or len(urgent_reason) < 50:
                raise ValidationError("Urgent reason must be at least 50 characters")

        now = datetime.utcnow()

        if inspector_id == assessment.mechanical_inspector_id:
            if assessment.mech_verdict:
                raise ValidationError("Mechanical inspector has already submitted verdict")
            assessment.mech_verdict = verdict
            assessment.mech_assessed_at = now
        elif inspector_id == assessment.electrical_inspector_id:
            if assessment.elec_verdict:
                raise ValidationError("Electrical inspector has already submitted verdict")
            assessment.elec_verdict = verdict
            assessment.elec_assessed_at = now
        else:
            raise ForbiddenError("You are not assigned to this assessment")

        if verdict == 'urgent' and urgent_reason:
            existing_reason = assessment.urgent_reason or ''
            if existing_reason:
                assessment.urgent_reason = existing_reason + '\n---\n' + urgent_reason
            else:
                assessment.urgent_reason = urgent_reason

        # Evaluate if both verdicts are in
        if assessment.mech_verdict and assessment.elec_verdict:
            assessment.evaluate_status()
            AssessmentService._apply_final_status(assessment)

        db.session.commit()
        logger.info("Verdict submitted: assessment_id=%s inspector_id=%s verdict=%s", assessment_id, inspector_id, verdict)
        return assessment

    @staticmethod
    def _apply_final_status(assessment):
        """Apply the final assessment status to equipment and assignment."""
        equipment = db.session.get(Equipment, assessment.equipment_id)
        assignment = db.session.get(InspectionAssignment, assessment.inspection_assignment_id)

        if assessment.final_status == 'urgent':
            equipment.status = 'stopped'
            logger.warning("Equipment stopped due to urgent assessment: equipment_id=%s assessment_id=%s", assessment.equipment_id, assessment.id)
            # Notify admins
            from app.services.notification_service import NotificationService
            admins = User.query.filter_by(role='admin', is_active=True).all()
            for admin in admins:
                NotificationService.create_notification(
                    user_id=admin.id,
                    type='equipment_stopped',
                    title='URGENT: Equipment Stopped',
                    message=f'{equipment.name} has been stopped due to urgent assessment',
                    related_type='final_assessment',
                    related_id=assessment.id,
                    priority='critical'
                )

        # Mark assignment complete
        assignment.status = 'completed'

        # Award points
        AssessmentService._award_inspection_points(assignment)

        # Update list completion count
        il = assignment.inspection_list
        il.completed_assets = InspectionAssignment.query.filter_by(
            inspection_list_id=il.id,
            status='completed'
        ).count()
        if il.completed_assets >= il.total_assets:
            il.status = 'completed'

    @staticmethod
    def _award_inspection_points(assignment):
        """Award points to inspectors based on completion."""
        base_points = 1  # 1 point per completed asset

        mech = db.session.get(User, assignment.mechanical_inspector_id)
        elec = db.session.get(User, assignment.electrical_inspector_id)

        if mech:
            mech.add_points(base_points, 'inspector')
            assignment.mech_points_awarded = base_points
        if elec:
            elec.add_points(base_points, 'inspector')
            assignment.elec_points_awarded = base_points

    @staticmethod
    def admin_resolve(assessment_id, admin_id, decision, notes=None):
        """
        Admin resolves a disagreement or overrides assessment.

        Args:
            assessment_id: FinalAssessment ID
            admin_id: Admin user ID
            decision: 'operational' or 'urgent'
            notes: Admin notes
        """
        assessment = db.session.get(FinalAssessment, assessment_id)
        if not assessment:
            raise NotFoundError(f"Assessment {assessment_id} not found")

        admin = db.session.get(User, admin_id)
        if not admin or admin.role != 'admin':
            raise ForbiddenError("Admin access required")

        assessment.final_status = decision
        assessment.resolved_by = 'admin'
        assessment.admin_decision_by = admin_id
        assessment.admin_decision_notes = notes
        assessment.finalized_at = datetime.utcnow()

        AssessmentService._apply_final_status(assessment)
        db.session.commit()
        return assessment

    @staticmethod
    def get_pending_assessments(inspector_id=None):
        """Get assessments pending verdict."""
        query = FinalAssessment.query.filter(FinalAssessment.finalized_at.is_(None))

        if inspector_id:
            query = query.filter(
                db.or_(
                    db.and_(
                        FinalAssessment.mechanical_inspector_id == inspector_id,
                        FinalAssessment.mech_verdict.is_(None)
                    ),
                    db.and_(
                        FinalAssessment.electrical_inspector_id == inspector_id,
                        FinalAssessment.elec_verdict.is_(None)
                    )
                )
            )

        return query.all()
