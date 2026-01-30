"""
Core business logic for inspection workflow.
This is the heart of the application.
"""

from app.models import Inspection, InspectionAnswer, Equipment, ChecklistTemplate, ChecklistItem, User
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import datetime, timedelta
from app.services.defect_service import DefectService


class InspectionService:
    """Service for managing inspection lifecycle and workflow."""
    
    @staticmethod
    def start_inspection(equipment_id, technician_id):
        """
        Start a new inspection (creates draft).
        
        Args:
            equipment_id: ID of equipment to inspect
            technician_id: ID of technician performing inspection
        
        Returns:
            Created Inspection dict with checklist items in user's language
        
        Raises:
            NotFoundError: If equipment or template not found
            ValidationError: If equipment not assigned to technician
            ConflictError: If draft already exists for this equipment
        """
        # Validate equipment exists
        equipment = Equipment.query.get(equipment_id)
        if not equipment:
            raise NotFoundError(f"Equipment with ID {equipment_id} not found")
        
        # Validate technician
        technician = User.query.get(technician_id)
        if not technician or technician.role != 'technician':
            raise ValidationError("Invalid technician")
        
        # Check if equipment is assigned to this technician
        if equipment.assigned_technician_id != technician_id:
            raise ForbiddenError("Equipment not assigned to this technician")
        
        # Check for existing draft inspection
        existing_draft = Inspection.query.filter_by(
            equipment_id=equipment_id,
            technician_id=technician_id,
            status='draft'
        ).first()
        
        if existing_draft:
            raise ValidationError("Draft inspection already exists for this equipment")
        
        # Get active checklist template for equipment type
        template = ChecklistTemplate.query.filter_by(
            equipment_type=equipment.equipment_type,
            is_active=True
        ).first()
        
        if not template:
            raise NotFoundError(f"No active checklist template found for {equipment.equipment_type}")
        
        # Create new inspection
        inspection = Inspection(
            equipment_id=equipment_id,
            template_id=template.id,
            technician_id=technician_id,
            status='draft',
            started_at=datetime.utcnow()
        )
        
        db.session.add(inspection)
        db.session.commit()
        
        # Get user's language preference
        language = technician.language if hasattr(technician, 'language') and technician.language else 'en'
        
        # Add template items with correct language
        inspection_dict = inspection.to_dict(include_answers=True)
        template_items = ChecklistItem.query.filter_by(template_id=template.id).order_by(ChecklistItem.order_index).all()
        inspection_dict['checklist_items'] = [item.to_dict(language=language) for item in template_items]
        
        return inspection_dict
    
    @staticmethod
    def answer_question(inspection_id, checklist_item_id, answer_value, comment=None, photo_path=None, current_user_id=None):
        """
        Record or update an answer to a checklist item.
        
        Args:
            inspection_id: ID of inspection
            checklist_item_id: ID of checklist item being answered
            answer_value: The answer value
            comment: Optional comment
            photo_path: Optional photo path
            current_user_id: ID of current user (for authorization)
        
        Returns:
            Created/updated InspectionAnswer object
        
        Raises:
            NotFoundError: If inspection or item not found
            ValidationError: If inspection not in draft status
            ForbiddenError: If user not authorized
        """
        # Validate inspection exists
        inspection = Inspection.query.get(inspection_id)
        if not inspection:
            raise NotFoundError(f"Inspection with ID {inspection_id} not found")
        
        # Only allow answering draft inspections
        if inspection.status != 'draft':
            raise ValidationError("Cannot modify inspection that is not in draft status")
        
        # Verify user is the assigned technician (unless admin)
        if current_user_id:
            user = User.query.get(int(current_user_id))
            if user.role != 'admin' and inspection.technician_id != int(current_user_id):
                raise ForbiddenError("You can only answer your own inspections")
        
        # Validate checklist item exists and belongs to the template
        item = ChecklistItem.query.get(checklist_item_id)
        if not item:
            raise NotFoundError(f"Checklist item with ID {checklist_item_id} not found")
        
        if item.template_id != inspection.template_id:
            raise ValidationError("Checklist item does not belong to inspection template")
        
        # Validate answer based on type
        InspectionService._validate_answer_value(item.answer_type, answer_value)
        
        # Check if critical failure requires photo
        if item.critical_failure and answer_value.lower() == 'fail' and not photo_path:
            raise ValidationError("Photo is required for critical failures")
        
        # Check if answer already exists
        existing_answer = InspectionAnswer.query.filter_by(
            inspection_id=inspection_id,
            checklist_item_id=checklist_item_id
        ).first()
        
        if existing_answer:
            # Update existing answer
            existing_answer.answer_value = answer_value
            existing_answer.comment = comment
            existing_answer.photo_path = photo_path
            existing_answer.answered_at = datetime.utcnow()
            answer = existing_answer
        else:
            # Create new answer
            answer = InspectionAnswer(
                inspection_id=inspection_id,
                checklist_item_id=checklist_item_id,
                answer_value=answer_value,
                comment=comment,
                photo_path=photo_path
            )
            db.session.add(answer)
        
        db.session.commit()
        return answer
    
    @staticmethod
    def _validate_answer_value(answer_type, answer_value):
        """
        Validate answer value matches expected type.
        
        Args:
            answer_type: Expected answer type
            answer_value: Value to validate
        
        Raises:
            ValidationError: If value doesn't match type
        """
        if answer_type == 'pass_fail':
            if answer_value.lower() not in ['pass', 'fail']:
                raise ValidationError("Answer must be 'pass' or 'fail'")
        elif answer_type == 'yes_no':
            if answer_value.lower() not in ['yes', 'no']:
                raise ValidationError("Answer must be 'yes' or 'no'")
        elif answer_type == 'numeric':
            try:
                float(answer_value)
            except ValueError:
                raise ValidationError("Answer must be a numeric value")
        # text type accepts any value
    
    @staticmethod
    def get_inspection_progress(inspection_id):
        """
        Calculate inspection progress.
        
        Args:
            inspection_id: ID of inspection
        
        Returns:
            Dictionary with progress information
        """
        inspection = Inspection.query.get(inspection_id)
        if not inspection:
            raise NotFoundError(f"Inspection with ID {inspection_id} not found")
        
        # Get all items in template
        all_items = ChecklistItem.query.filter_by(
            template_id=inspection.template_id
        ).all()
        
        # Get answered items
        answered_items = InspectionAnswer.query.filter_by(
            inspection_id=inspection_id
        ).count()
        
        # Get required items
        required_items = [item for item in all_items if item.is_required]
        answered_required = InspectionAnswer.query.join(ChecklistItem).filter(
            InspectionAnswer.inspection_id == inspection_id,
            ChecklistItem.is_required == True
        ).count()
        
        return {
            'total_items': len(all_items),
            'answered_items': answered_items,
            'required_items': len(required_items),
            'answered_required': answered_required,
            'is_complete': answered_required == len(required_items),
            'progress_percentage': round((answered_items / len(all_items)) * 100) if all_items else 0
        }
    
    @staticmethod
    def submit_inspection(inspection_id, current_user_id=None):
        """
        Submit inspection (draft → submitted).
        This triggers auto-defect creation for failures.
        
        Args:
            inspection_id: ID of inspection
            current_user_id: ID of current user (for authorization)
        
        Returns:
            Updated Inspection object
        
        Raises:
            NotFoundError: If inspection not found
            ValidationError: If validation fails
            ForbiddenError: If user not authorized
        """
        # Validate inspection exists
        inspection = Inspection.query.get(inspection_id)
        if not inspection:
            raise NotFoundError(f"Inspection with ID {inspection_id} not found")
        
        # Only allow submitting draft inspections
        if inspection.status != 'draft':
            raise ValidationError("Can only submit inspections in draft status")
        
        # Verify user is the assigned technician (unless admin)
        if current_user_id:
            user = User.query.get(int(current_user_id))
            if user.role != 'admin' and inspection.technician_id != int(current_user_id):
                raise ForbiddenError("You can only submit your own inspections")
        
        # Validate all required questions are answered
        InspectionService._validate_completeness(inspection)
        
        # Check for failed items and create defects
        failed_answers = InspectionService._get_failed_answers(inspection_id)
        
        for answer in failed_answers:
            # Auto-create defect for each failure
            DefectService.create_defect_from_failure(
                inspection_id=inspection_id,
                checklist_item_id=answer.checklist_item_id,
                technician_id=inspection.technician_id
            )
        
        # Update inspection status
        inspection.status = 'submitted'
        inspection.result = 'fail' if failed_answers else 'pass'
        inspection.submitted_at = datetime.utcnow()
        
        db.session.commit()
        
        # Update weekly completion tracking
        from app.services.schedule_service import ScheduleService
        ScheduleService.update_completion(inspection.id)
        
        # Create notification for admin (NEW - ADD THIS)
        from app.services.notification_service import NotificationService
        
        # Get all admins
        admins = User.query.filter_by(role='admin', is_active=True).all()
        for admin in admins:
            NotificationService.create_notification(
                user_id=admin.id,
                type='inspection_submitted',
                title='New Inspection Submitted',
                message=f'{inspection.technician.full_name} submitted inspection for {inspection.equipment.name}',
                related_type='inspection',
                related_id=inspection.id
            )
        
        return inspection
    
    @staticmethod
    def _validate_completeness(inspection):
        """
        Validate that all required questions are answered.
        
        Args:
            inspection: Inspection object
        
        Raises:
            ValidationError: If required questions are missing
        """
        # Get all required items
        required_items = ChecklistItem.query.filter_by(
            template_id=inspection.template_id,
            is_required=True
        ).all()
        
        # Get answered item IDs
        answered_item_ids = [
            answer.checklist_item_id
            for answer in inspection.answers.all()
        ]
        
        # Find missing required items
        missing_items = [
            item for item in required_items
            if item.id not in answered_item_ids
        ]
        
        if missing_items:
            missing_questions = [item.question_text[:50] for item in missing_items]
            raise ValidationError(
                f"Missing {len(missing_items)} required answer(s). "
                f"Please answer: {', '.join(missing_questions)}"
            )
        
        # Validate critical failures have photos
        critical_failures = InspectionAnswer.query.join(ChecklistItem).filter(
            InspectionAnswer.inspection_id == inspection.id,
            ChecklistItem.critical_failure == True,
            InspectionAnswer.answer_value == 'fail',
            InspectionAnswer.photo_path.is_(None)
        ).all()
        
        if critical_failures:
            raise ValidationError("All critical failures must have photos attached")
    
    @staticmethod
    def _get_failed_answers(inspection_id):
        """
        Get all failed answers (pass_fail or yes_no type).
        
        Args:
            inspection_id: ID of inspection
        
        Returns:
            List of failed InspectionAnswer objects
        """
        failed_answers = InspectionAnswer.query.join(ChecklistItem).filter(
            InspectionAnswer.inspection_id == inspection_id,
            ChecklistItem.answer_type.in_(['pass_fail', 'yes_no']),
            db.or_(
                InspectionAnswer.answer_value == 'fail',
                InspectionAnswer.answer_value == 'no'
            )
        ).all()
        
        return failed_answers
    
    @staticmethod
    def review_inspection(inspection_id, reviewer_id, notes=None):
        """
        Review inspection (submitted → reviewed). Admin only.
        
        Args:
            inspection_id: ID of inspection
            reviewer_id: ID of admin reviewing
            notes: Optional review notes
        
        Returns:
            Updated Inspection object
        
        Raises:
            NotFoundError: If inspection not found
            ValidationError: If inspection not submitted
            ForbiddenError: If reviewer not admin
        """
        # Validate inspection exists
        inspection = Inspection.query.get(inspection_id)
        if not inspection:
            raise NotFoundError(f"Inspection with ID {inspection_id} not found")
        
        # Only allow reviewing submitted inspections
        if inspection.status != 'submitted':
            raise ValidationError("Can only review inspections in submitted status")
        
        # Validate reviewer is admin
        reviewer = User.query.get(int(reviewer_id))
        if not reviewer or reviewer.role != 'admin':
            raise ForbiddenError("Only admins can review inspections")
        
        # Update inspection
        inspection.status = 'reviewed'
        inspection.reviewed_at = datetime.utcnow()
        inspection.reviewed_by_id = int(reviewer_id)
        if notes:
            inspection.notes = notes
        
        db.session.commit()
        return inspection
    
    @staticmethod
    def delete_inspection(inspection_id, current_user_id):
        """
        Delete inspection. Only drafts can be deleted.
        
        Args:
            inspection_id: ID of inspection
            current_user_id: ID of current user
        
        Raises:
            NotFoundError: If inspection not found
            ValidationError: If inspection not draft
            ForbiddenError: If user not authorized
        """
        inspection = Inspection.query.get(inspection_id)
        if not inspection:
            raise NotFoundError(f"Inspection with ID {inspection_id} not found")
        
        if inspection.status != 'draft':
            raise ValidationError("Can only delete draft inspections")
        
        user = User.query.get(int(current_user_id))
        if user.role != 'admin' and inspection.technician_id != int(current_user_id):
            raise ForbiddenError("You can only delete your own inspections")
        
        db.session.delete(inspection)
        db.session.commit()