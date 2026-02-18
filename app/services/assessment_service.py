"""
Service for multi-layer equipment assessment.
4-layer flow: System Auto → Inspector → Engineer → Admin
3 verdicts: operational / monitor / stop
"""

import logging
from app.models import FinalAssessment, InspectionAssignment, Equipment, User
from app.models.inspection import InspectionAnswer
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import datetime

logger = logging.getLogger(__name__)


class AssessmentService:
    """Service for managing multi-layer equipment assessments."""

    @staticmethod
    def create_assessment(assignment_id):
        """
        Create a final assessment record and compute system verdict from answers.
        """
        assignment = db.session.get(InspectionAssignment, assignment_id)
        if not assignment:
            raise NotFoundError(f"Assignment {assignment_id} not found")

        allowed_statuses = ['mech_complete', 'elec_complete', 'both_complete', 'assessment_pending', 'completed']
        if assignment.status not in allowed_statuses:
            raise ValidationError(
                f"At least one inspector must complete their checklist first. "
                f"Current status: {assignment.status}"
            )

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

        # Compute system verdict from all answers for this assignment
        from app.models.inspection import Inspection
        inspections = Inspection.query.filter_by(assignment_id=assignment_id).all()
        answers = []
        for insp in inspections:
            answers.extend(InspectionAnswer.query.filter_by(inspection_id=insp.id).all())
        assessment.apply_system_verdict(answers)

        # Only set assessment_pending when both checklists are done
        if assignment.status == 'both_complete':
            assignment.status = 'assessment_pending'
        db.session.commit()
        logger.info(
            "Assessment created: id=%s assignment=%s equipment=%s system_verdict=%s",
            assessment.id, assignment_id, assignment.equipment_id, assessment.system_verdict
        )

        # Notify both inspectors
        from app.services.notification_service import NotificationService
        for uid in [assignment.mechanical_inspector_id, assignment.electrical_inspector_id]:
            NotificationService.create_notification(
                user_id=uid,
                type='assessment_required',
                title='Final Assessment Required',
                message=f'Please submit your final verdict for {assignment.equipment.name}. System recommends: {assessment.system_verdict}',
                related_type='final_assessment',
                related_id=assessment.id
            )

        return assessment

    @staticmethod
    def submit_verdict(assessment_id, inspector_id, verdict, monitor_reason=None, stop_reason=None, urgent_reason=None):
        """
        Submit inspector verdict (operational, monitor, or stop).
        """
        assessment = db.session.get(FinalAssessment, assessment_id)
        if not assessment:
            raise NotFoundError(f"Assessment {assessment_id} not found")

        if verdict not in ('operational', 'monitor', 'stop'):
            raise ValidationError("Verdict must be 'operational', 'monitor', or 'stop'")

        if verdict == 'monitor':
            if not monitor_reason or len(monitor_reason.strip()) < 30:
                raise ValidationError("Monitor reason must be at least 30 characters")

        if verdict == 'stop':
            if not stop_reason or len(stop_reason.strip()) < 50:
                raise ValidationError("Stop reason must be at least 50 characters")

        # Legacy support: urgent_reason maps to stop_reason
        if verdict == 'stop' and urgent_reason and not stop_reason:
            stop_reason = urgent_reason

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

        # Store reasons
        if verdict == 'monitor' and monitor_reason:
            existing = assessment.monitor_reason or ''
            assessment.monitor_reason = (existing + '\n---\n' + monitor_reason) if existing else monitor_reason

        if verdict == 'stop' and stop_reason:
            existing = assessment.stop_reason or ''
            assessment.stop_reason = (existing + '\n---\n' + stop_reason) if existing else stop_reason

        # Legacy urgent_reason field
        if verdict == 'stop' and stop_reason:
            existing = assessment.urgent_reason or ''
            assessment.urgent_reason = (existing + '\n---\n' + stop_reason) if existing else stop_reason

        # Evaluate multi-layer after both verdicts are in
        if assessment.mech_verdict and assessment.elec_verdict:
            assessment.evaluate_multi_layer()

            if assessment.finalized_at:
                # All agreed → apply final status
                AssessmentService._apply_final_status(assessment)
            elif assessment.escalation_level == 'engineer':
                # Disagreement → notify engineers
                AssessmentService._notify_engineers_for_review(assessment)

        db.session.commit()
        logger.info(
            "Verdict submitted: assessment=%s inspector=%s verdict=%s escalation=%s",
            assessment_id, inspector_id, verdict, assessment.escalation_level
        )
        return assessment

    @staticmethod
    def submit_engineer_verdict(assessment_id, engineer_id, verdict, notes=None, followup_data=None):
        """
        Engineer submits review verdict after escalation.
        If verdict is 'monitor' and followup_data is provided, schedules inline follow-up.
        """
        assessment = db.session.get(FinalAssessment, assessment_id)
        if not assessment:
            raise NotFoundError(f"Assessment {assessment_id} not found")

        if assessment.escalation_level != 'engineer':
            raise ValidationError("This assessment is not pending engineer review")

        if assessment.engineer_verdict:
            raise ValidationError("Engineer has already submitted verdict")

        engineer = db.session.get(User, engineer_id)
        if not engineer or engineer.role != 'engineer':
            raise ForbiddenError("Engineer access required")

        if verdict not in ('operational', 'monitor', 'stop'):
            raise ValidationError("Verdict must be 'operational', 'monitor', or 'stop'")

        assessment.engineer_id = engineer_id
        assessment.engineer_verdict = verdict
        assessment.engineer_notes = notes
        assessment.engineer_reviewed_at = datetime.utcnow()

        # Evaluate engineer decision
        assessment.evaluate_engineer_review()

        if assessment.finalized_at:
            # Engineer agrees with system → finalize
            AssessmentService._apply_final_status(assessment)
            # If engineer picked 'monitor' with inline follow-up data, schedule it
            if verdict == 'monitor' and followup_data:
                try:
                    from app.services.monitor_followup_service import MonitorFollowupService
                    MonitorFollowupService.schedule_followup_inline(
                        assessment.id, engineer_id, followup_data
                    )
                except Exception as e:
                    logger.error("Failed to schedule inline followup: %s", e)
        elif assessment.escalation_level == 'admin':
            # Escalate to admin
            AssessmentService._notify_admins_for_review(assessment)

        db.session.commit()
        logger.info(
            "Engineer verdict: assessment=%s engineer=%s verdict=%s escalation=%s",
            assessment_id, engineer_id, verdict, assessment.escalation_level
        )
        return assessment

    @staticmethod
    def _apply_final_status(assessment):
        """Apply the final assessment status to equipment and assignment."""
        equipment = db.session.get(Equipment, assessment.equipment_id)
        assignment = db.session.get(InspectionAssignment, assessment.inspection_assignment_id)

        if assessment.final_status == 'stop':
            equipment.status = 'stopped'
            logger.warning(
                "Equipment STOPPED: equipment_id=%s assessment_id=%s",
                assessment.equipment_id, assessment.id
            )
        elif assessment.final_status == 'monitor':
            # Keep active but flag for monitoring
            if equipment.status != 'stopped':
                equipment.status = 'active'
            logger.info(
                "Equipment MONITOR: equipment_id=%s assessment_id=%s",
                assessment.equipment_id, assessment.id
            )
            # Trigger follow-up scheduling for engineers
            try:
                from app.services.monitor_followup_service import MonitorFollowupService
                MonitorFollowupService.create_pending_followup(assessment.id)
            except Exception as e:
                logger.error("Failed to create pending followup: %s", e)
        else:
            # Operational
            if equipment.status != 'stopped':
                equipment.status = 'active'

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

        # Notify both inspectors + engineer of finalization
        AssessmentService._notify_finalization(assessment)

    @staticmethod
    def _notify_finalization(assessment):
        """Notify both inspectors and engineer that assessment is finalized."""
        from app.services.notification_service import NotificationService
        equipment = db.session.get(Equipment, assessment.equipment_id)
        eq_name = equipment.name if equipment else f"Equipment #{assessment.equipment_id}"

        verdict_label = (assessment.final_status or 'unknown').upper()
        notify_ids = [assessment.mechanical_inspector_id, assessment.electrical_inspector_id]
        if assessment.engineer_id:
            notify_ids.append(assessment.engineer_id)

        for uid in notify_ids:
            NotificationService.create_notification(
                user_id=uid,
                type='assessment_finalized',
                title=f'Assessment Finalized: {verdict_label}',
                message=f'{eq_name} assessment finalized as {verdict_label}. Resolved by: {assessment.resolved_by}',
                related_type='final_assessment',
                related_id=assessment.id,
                priority='critical' if assessment.final_status == 'stop' else 'info'
            )

        # If stop → also notify admins
        if assessment.final_status == 'stop':
            admins = User.query.filter_by(role='admin', is_active=True).all()
            for admin in admins:
                NotificationService.create_notification(
                    user_id=admin.id,
                    type='equipment_stopped',
                    title='URGENT: Equipment Stopped',
                    message=f'{eq_name} has been STOPPED. Assessment verdict: {verdict_label}',
                    related_type='final_assessment',
                    related_id=assessment.id,
                    priority='critical'
                )

    @staticmethod
    def _notify_engineers_for_review(assessment):
        """Notify engineers that assessment needs their review."""
        from app.services.notification_service import NotificationService
        equipment = db.session.get(Equipment, assessment.equipment_id)
        eq_name = equipment.name if equipment else f"Equipment #{assessment.equipment_id}"

        engineers = User.query.filter_by(role='engineer', is_active=True).all()
        for eng in engineers:
            NotificationService.create_notification(
                user_id=eng.id,
                type='engineer_review_required',
                title='Engineer Review Required',
                message=f'{eq_name}: Inspector disagreement. System={assessment.system_verdict}, Mech={assessment.mech_verdict}, Elec={assessment.elec_verdict}',
                related_type='final_assessment',
                related_id=assessment.id,
                priority='urgent'
            )

    @staticmethod
    def _notify_admins_for_review(assessment):
        """Notify admins that assessment needs their final decision."""
        from app.services.notification_service import NotificationService
        equipment = db.session.get(Equipment, assessment.equipment_id)
        eq_name = equipment.name if equipment else f"Equipment #{assessment.equipment_id}"

        admins = User.query.filter_by(role='admin', is_active=True).all()
        for admin in admins:
            NotificationService.create_notification(
                user_id=admin.id,
                type='admin_review_required',
                title='Admin Decision Required',
                message=f'{eq_name}: Escalated from engineer review. Verdicts: system={assessment.system_verdict}, mech={assessment.mech_verdict}, elec={assessment.elec_verdict}, engineer={assessment.engineer_verdict}',
                related_type='final_assessment',
                related_id=assessment.id,
                priority='critical'
            )

    @staticmethod
    def _award_inspection_points(assignment):
        """Award points to inspectors based on completion."""
        base_points = 1
        mech = db.session.get(User, assignment.mechanical_inspector_id)
        elec = db.session.get(User, assignment.electrical_inspector_id)
        if mech:
            mech.add_points(base_points, 'inspector')
            assignment.mech_points_awarded = base_points
        if elec:
            elec.add_points(base_points, 'inspector')
            assignment.elec_points_awarded = base_points

    @staticmethod
    def admin_resolve(assessment_id, admin_id, decision, notes=None, followup_data=None):
        """
        Admin resolves escalation with final decision.
        Accepts operational/monitor/stop. Notes required.
        If decision is 'monitor' and followup_data is provided, schedules inline follow-up.
        """
        assessment = db.session.get(FinalAssessment, assessment_id)
        if not assessment:
            raise NotFoundError(f"Assessment {assessment_id} not found")

        admin = db.session.get(User, admin_id)
        if not admin or admin.role != 'admin':
            raise ForbiddenError("Admin access required")

        if decision not in ('operational', 'monitor', 'stop'):
            raise ValidationError("Decision must be 'operational', 'monitor', or 'stop'")

        assessment.final_status = decision
        assessment.resolved_by = 'admin'
        assessment.admin_decision_by = admin_id
        assessment.admin_decision_notes = notes
        assessment.finalized_at = datetime.utcnow()

        AssessmentService._apply_final_status(assessment)

        # If admin picked 'monitor' with inline follow-up data, schedule it
        if decision == 'monitor' and followup_data:
            try:
                from app.services.monitor_followup_service import MonitorFollowupService
                MonitorFollowupService.schedule_followup_inline(
                    assessment.id, admin_id, followup_data
                )
            except Exception as e:
                logger.error("Failed to schedule admin inline followup: %s", e)

        db.session.commit()
        logger.info(
            "Admin resolved: assessment=%s admin=%s decision=%s",
            assessment_id, admin_id, decision
        )
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

    @staticmethod
    def get_pending_engineer_reviews():
        """Get assessments escalated to engineer, awaiting review."""
        return FinalAssessment.query.filter(
            FinalAssessment.escalation_level == 'engineer',
            FinalAssessment.engineer_verdict.is_(None),
            FinalAssessment.finalized_at.is_(None)
        ).order_by(FinalAssessment.created_at.desc()).all()

    @staticmethod
    def get_pending_admin_reviews():
        """Get assessments escalated to admin, awaiting final decision."""
        return FinalAssessment.query.filter(
            FinalAssessment.escalation_level == 'admin',
            FinalAssessment.finalized_at.is_(None)
        ).order_by(FinalAssessment.created_at.desc()).all()

    @staticmethod
    def get_shared_answers(assessment_id, requesting_inspector_id):
        """
        Get first inspector's answers for the second inspector to see.
        Returns answers from the inspector who completed their checklist first.
        """
        from app.models.inspection import Inspection

        assessment = db.session.get(FinalAssessment, assessment_id)
        if not assessment:
            raise NotFoundError(f"Assessment {assessment_id} not found")

        # Determine which inspector completed first
        assignment = db.session.get(InspectionAssignment, assessment.inspection_assignment_id)
        if not assignment:
            return []

        # Find the first inspector's inspection
        first_inspector_id = None
        if assignment.mech_completed_at and not assignment.elec_completed_at:
            if requesting_inspector_id != assessment.electrical_inspector_id:
                raise ForbiddenError("Only the second inspector can view shared answers")
            first_inspector_id = assessment.mechanical_inspector_id
        elif assignment.elec_completed_at and not assignment.mech_completed_at:
            if requesting_inspector_id != assessment.mechanical_inspector_id:
                raise ForbiddenError("Only the second inspector can view shared answers")
            first_inspector_id = assessment.electrical_inspector_id
        elif assignment.mech_completed_at and assignment.elec_completed_at:
            # Both completed — show the first one's answers
            if assignment.mech_completed_at <= assignment.elec_completed_at:
                first_inspector_id = assessment.mechanical_inspector_id
            else:
                first_inspector_id = assessment.electrical_inspector_id
        else:
            return []

        # Get inspection by this inspector for this assignment
        inspection = Inspection.query.filter_by(
            assignment_id=assessment.inspection_assignment_id,
            technician_id=first_inspector_id
        ).first()

        if not inspection:
            return []

        answers = InspectionAnswer.query.filter_by(
            inspection_id=inspection.id
        ).all()

        return [a.to_dict() for a in answers]
