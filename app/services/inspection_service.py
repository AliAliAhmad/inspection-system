"""
Core business logic for inspection workflow.
This is the heart of the application.
"""

import logging
from app.models import Inspection, InspectionAnswer, InspectionAssignment, Equipment, ChecklistTemplate, ChecklistItem, User
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import datetime, timedelta
from app.services.defect_service import DefectService

logger = logging.getLogger(__name__)


class InspectionService:
    """Service for managing inspection lifecycle and workflow."""
    
    @staticmethod
    def start_inspection(equipment_id, technician_id, template_id=None, assignment_id=None):
        """
        Start a new inspection (creates draft).

        Args:
            equipment_id: ID of equipment to inspect
            technician_id: ID of technician performing inspection
            template_id: ID of checklist template (from assignment/routine)
            assignment_id: ID of inspection assignment

        Returns:
            Created Inspection dict with checklist items in user's language

        Raises:
            NotFoundError: If equipment or template not found
            ValidationError: If equipment not assigned to technician
        """
        # Validate equipment exists
        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            raise NotFoundError(f"Equipment with ID {equipment_id} not found")

        # Validate inspector
        technician = db.session.get(User, technician_id)
        if not technician or not technician.has_role('inspector'):
            raise ValidationError("Invalid inspector")

        # Check if inspector is assigned to this equipment via InspectionAssignment
        # If assignment_id is given, use it directly; otherwise search by equipment
        if assignment_id:
            assignment = db.session.get(InspectionAssignment, assignment_id)
            if not assignment:
                raise NotFoundError(f"Assignment {assignment_id} not found")
            if technician_id not in (assignment.mechanical_inspector_id, assignment.electrical_inspector_id):
                raise ForbiddenError("You are not assigned to this inspection")
            # Allow starting inspection for active assignments
            active_statuses = ['assigned', 'in_progress', 'mech_complete', 'elec_complete']
            if assignment.status not in active_statuses:
                raise ForbiddenError(
                    f"Cannot start inspection - assignment status is '{assignment.status}'"
                )
        else:
            assignment = InspectionAssignment.query.filter(
                InspectionAssignment.equipment_id == equipment_id,
                db.or_(
                    InspectionAssignment.mechanical_inspector_id == technician_id,
                    InspectionAssignment.electrical_inspector_id == technician_id
                ),
                InspectionAssignment.status.in_(['assigned', 'in_progress', 'mech_complete', 'elec_complete'])
            ).first()
            if not assignment:
                raise ForbiddenError("You are not assigned to inspect this equipment")

        # Check for existing draft inspection
        # If assignment_id is provided, check by assignment; otherwise by equipment
        if assignment_id:
            existing_draft = Inspection.query.filter_by(
                assignment_id=assignment_id,
                technician_id=technician_id,
                status='draft'
            ).first()
        else:
            existing_draft = Inspection.query.filter_by(
                equipment_id=equipment_id,
                technician_id=technician_id,
                status='draft'
            ).first()

        if existing_draft:
            raise ValidationError("Draft inspection already exists for this assignment")

        # Get template: prefer explicit template_id (from assignment), then assignment's template_id
        if not template_id and assignment.template_id:
            template_id = assignment.template_id

        if template_id:
            template = db.session.get(ChecklistTemplate, template_id)
            if not template:
                raise NotFoundError(f"Checklist template with ID {template_id} not found")
        else:
            # Fallback 1: look up by equipment type on ChecklistTemplate
            template = ChecklistTemplate.query.filter_by(
                equipment_type=equipment.equipment_type,
                is_active=True
            ).first()

            # Fallback 2: look up via InspectionRoutine that covers this equipment type
            if not template:
                from app.models.schedule import InspectionRoutine
                routines = InspectionRoutine.query.filter_by(is_active=True).all()
                for routine in routines:
                    if equipment.equipment_type in (routine.asset_types or []):
                        template = db.session.get(ChecklistTemplate, routine.template_id)
                        if template:
                            # Also fix the assignment so this lookup isn't needed again
                            assignment.template_id = template.id
                            break

            if not template:
                raise NotFoundError(
                    f"No checklist template found for equipment type '{equipment.equipment_type}'. "
                    f"Please assign a template in the inspection routine."
                )

        # Generate inspection code: ASSET-ORDER-DATE
        # Use a unique counter that accounts for ALL inspections for this equipment (not just today)
        # to avoid UNIQUE constraint violations
        now = datetime.utcnow()
        date_str = now.strftime('%Y%m%d')
        asset_code = equipment.serial_number if equipment.serial_number else f'EQ{equipment_id}'

        # Get the highest order number for this asset code prefix to avoid collisions
        import re
        existing_codes = db.session.query(Inspection.inspection_code).filter(
            Inspection.inspection_code.like(f'{asset_code}-%')
        ).all()
        max_order = 0
        for (code,) in existing_codes:
            if code:
                match = re.search(rf'^{re.escape(asset_code)}-(\d+)-', code)
                if match:
                    max_order = max(max_order, int(match.group(1)))
        order_num = max_order + 1
        inspection_code = f'{asset_code}-{order_num:03d}-{date_str}'

        # Create new inspection
        inspection = Inspection(
            equipment_id=equipment_id,
            template_id=template.id,
            technician_id=technician_id,
            assignment_id=assignment_id,
            inspection_code=inspection_code,
            status='draft',
            started_at=datetime.utcnow()
        )
        
        db.session.add(inspection)
        db.session.commit()

        logger.info("Inspection started: inspection_id=%s equipment_id=%s technician_id=%s", inspection.id, equipment_id, technician_id)

        # Get user's language preference
        language = technician.language if hasattr(technician, 'language') and technician.language else 'en'
        
        # Add template items with correct language
        inspection_dict = inspection.to_dict(include_answers=True)
        template_items = ChecklistItem.query.filter_by(template_id=template.id).order_by(ChecklistItem.order_index).all()
        inspection_dict['checklist_items'] = [item.to_dict(language=language) for item in template_items]
        
        return inspection_dict
    
    @staticmethod
    def answer_question(inspection_id, checklist_item_id, answer_value, comment=None, photo_path=None, voice_note_id=None, current_user_id=None):
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
        inspection = db.session.get(Inspection, inspection_id)
        if not inspection:
            raise NotFoundError(f"Inspection with ID {inspection_id} not found")
        
        # Only allow answering draft inspections
        if inspection.status != 'draft':
            raise ValidationError("Cannot modify inspection that is not in draft status")
        
        # Verify user is the assigned inspector (unless admin)
        if current_user_id:
            user = db.session.get(User, int(current_user_id))
            if user.role != 'admin' and inspection.technician_id != int(current_user_id):
                raise ForbiddenError("You can only answer your own inspections")

        # Validate checklist item exists and belongs to the template
        item = db.session.get(ChecklistItem, checklist_item_id)
        if not item:
            raise NotFoundError(f"Checklist item with ID {checklist_item_id} not found")
        
        if item.template_id != inspection.template_id:
            raise ValidationError("Checklist item does not belong to inspection template")
        
        # Check if answer already exists
        existing_answer = InspectionAnswer.query.filter_by(
            inspection_id=inspection_id,
            checklist_item_id=checklist_item_id
        ).first()

        if existing_answer:
            # Update existing answer - only update fields that are explicitly provided
            # If answer_value is non-empty, validate and update it
            # If empty, keep the existing answer_value (allows saving just comment/voice)
            if answer_value:
                InspectionService._validate_answer_value(item.answer_type, answer_value)
                existing_answer.answer_value = answer_value
            # Only update comment if explicitly provided (not None)
            # to avoid wiping AI analysis when just changing answer value
            if comment is not None:
                existing_answer.comment = comment
            # Only update photo_path if explicitly provided
            if photo_path is not None:
                existing_answer.photo_path = photo_path
            if voice_note_id:
                existing_answer.voice_note_id = voice_note_id
            existing_answer.answered_at = datetime.utcnow()
            answer = existing_answer
        else:
            # Create new answer - validate answer_value if non-empty
            if answer_value:
                InspectionService._validate_answer_value(item.answer_type, answer_value)
            answer = InspectionAnswer(
                inspection_id=inspection_id,
                checklist_item_id=checklist_item_id,
                answer_value=answer_value or '',
                comment=comment,
                photo_path=photo_path,
                voice_note_id=voice_note_id
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
    def get_inspection_progress(inspection_id, inspector_category=None):
        """
        Calculate inspection progress, optionally filtered by inspector category.

        Args:
            inspection_id: ID of inspection
            inspector_category: Optional category filter ('mechanical' or 'electrical')

        Returns:
            Dictionary with progress information
        """
        inspection = db.session.get(Inspection, inspection_id)
        if not inspection:
            raise NotFoundError(f"Inspection with ID {inspection_id} not found")

        # Get items in template, filtered by category if provided
        items_query = ChecklistItem.query.filter_by(template_id=inspection.template_id)
        if inspector_category:
            items_query = items_query.filter_by(category=inspector_category)
        all_items = items_query.all()
        all_item_ids = [item.id for item in all_items]

        # Get answered items (only counting items in this category)
        if all_item_ids:
            answered_items = InspectionAnswer.query.filter(
                InspectionAnswer.inspection_id == inspection_id,
                InspectionAnswer.checklist_item_id.in_(all_item_ids)
            ).count()
        else:
            answered_items = 0

        # Required items in this category
        required_items = [item for item in all_items if item.is_required]
        if all_item_ids:
            answered_required = InspectionAnswer.query.join(ChecklistItem).filter(
                InspectionAnswer.inspection_id == inspection_id,
                ChecklistItem.is_required == True,
                ChecklistItem.id.in_(all_item_ids)
            ).count()
        else:
            answered_required = 0

        pct = round((answered_items / len(all_items)) * 100) if all_items else 0

        return {
            'total_items': len(all_items),
            'answered_items': answered_items,
            'required_items': len(required_items),
            'answered_required': answered_required,
            'is_complete': answered_required == len(required_items),
            'progress_percentage': pct,
            'percentage': pct,
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
        inspection = db.session.get(Inspection, inspection_id)
        if not inspection:
            raise NotFoundError(f"Inspection with ID {inspection_id} not found")
        
        # Only allow submitting draft inspections
        if inspection.status != 'draft':
            raise ValidationError("Can only submit inspections in draft status")
        
        # Verify user is the assigned technician (unless admin)
        if current_user_id:
            user = db.session.get(User, int(current_user_id))
            if user.role != 'admin' and inspection.technician_id != int(current_user_id):
                raise ForbiddenError("You can only submit your own inspections")
        
        # Validate required questions for this inspector's category
        InspectionService._validate_completeness(inspection)

        # Check for failed items and create defects (only for inspector's category)
        inspector_category = InspectionService._get_inspector_category(inspection)
        failed_answers = InspectionService._get_failed_answers(inspection_id, inspector_category)
        
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

        # Mark this inspector's part as complete on the assignment
        if inspection.assignment_id:
            try:
                from app.services.inspection_list_service import InspectionListService
                InspectionListService.mark_inspector_complete(
                    inspection.assignment_id,
                    inspection.technician_id
                )
            except Exception as e:
                logger.warning("Could not update assignment status: %s", e)

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
        
        logger.info("Inspection submitted: inspection_id=%s result=%s technician_id=%s", inspection.id, inspection.result, inspection.technician_id)
        return inspection

    @staticmethod
    def _get_inspector_category(inspection):
        """
        Determine which category (mechanical/electrical) the inspector
        is responsible for, based on their assignment slot.
        """
        if not inspection.assignment_id:
            return None
        assignment = db.session.get(InspectionAssignment, inspection.assignment_id)
        if not assignment:
            return None
        if inspection.technician_id == assignment.mechanical_inspector_id:
            return 'mechanical'
        elif inspection.technician_id == assignment.electrical_inspector_id:
            return 'electrical'
        return None

    @staticmethod
    def _validate_completeness(inspection):
        """
        Validate that all required questions are answered for the inspector's category.

        Args:
            inspection: Inspection object

        Raises:
            ValidationError: If required questions are missing
        """
        # Determine inspector's category from assignment
        inspector_category = InspectionService._get_inspector_category(inspection)

        # Get required items filtered by inspector's category
        required_query = ChecklistItem.query.filter_by(
            template_id=inspection.template_id,
            is_required=True
        )
        if inspector_category:
            required_query = required_query.filter_by(category=inspector_category)
        required_items = required_query.all()

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

        # Validate fail/no answers have voice note + (photo or video) — only for inspector's category
        evidence_query = InspectionAnswer.query.join(ChecklistItem).filter(
            InspectionAnswer.inspection_id == inspection.id,
            ChecklistItem.answer_type.in_(['pass_fail', 'yes_no']),
            db.or_(
                InspectionAnswer.answer_value == 'fail',
                InspectionAnswer.answer_value == 'no'
            )
        )
        if inspector_category:
            evidence_query = evidence_query.filter(ChecklistItem.category == inspector_category)
        failed_without_evidence = evidence_query.all()

        for answer in failed_without_evidence:
            if not answer.voice_note_id:
                item = answer.checklist_item
                raise ValidationError(
                    f"Voice recording is required for failed item: {item.question_text[:50] if item else 'Unknown'}"
                )
            # Check for photo/video - either via file_id (new Cloudinary) or path (legacy)
            has_photo = answer.photo_file_id or answer.photo_path
            has_video = answer.video_file_id or answer.video_path
            if not has_photo and not has_video:
                item = answer.checklist_item
                raise ValidationError(
                    f"Photo or video is required for failed item: {item.question_text[:50] if item else 'Unknown'}"
                )
    
    @staticmethod
    def _get_failed_answers(inspection_id, inspector_category=None):
        """
        Get all failed answers (pass_fail or yes_no type).

        Args:
            inspection_id: ID of inspection
            inspector_category: Optional category filter ('mechanical' or 'electrical')

        Returns:
            List of failed InspectionAnswer objects
        """
        query = InspectionAnswer.query.join(ChecklistItem).filter(
            InspectionAnswer.inspection_id == inspection_id,
            ChecklistItem.answer_type.in_(['pass_fail', 'yes_no']),
            db.or_(
                InspectionAnswer.answer_value == 'fail',
                InspectionAnswer.answer_value == 'no'
            )
        )
        if inspector_category:
            query = query.filter(ChecklistItem.category == inspector_category)

        return query.all()
    
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
        inspection = db.session.get(Inspection, inspection_id)
        if not inspection:
            raise NotFoundError(f"Inspection with ID {inspection_id} not found")
        
        # Only allow reviewing submitted inspections
        if inspection.status != 'submitted':
            raise ValidationError("Can only review inspections in submitted status")
        
        # Validate reviewer is admin
        reviewer = db.session.get(User, int(reviewer_id))
        if not reviewer or reviewer.role != 'admin':
            raise ForbiddenError("Only admins can review inspections")
        
        # Update inspection
        inspection.status = 'reviewed'
        inspection.reviewed_at = datetime.utcnow()
        inspection.reviewed_by_id = int(reviewer_id)
        if notes:
            inspection.notes = notes
        
        db.session.commit()
        logger.info("Inspection reviewed: inspection_id=%s reviewer_id=%s", inspection.id, reviewer_id)
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
        inspection = db.session.get(Inspection, inspection_id)
        if not inspection:
            raise NotFoundError(f"Inspection with ID {inspection_id} not found")
        
        if inspection.status != 'draft':
            raise ValidationError("Can only delete draft inspections")
        
        user = db.session.get(User, int(current_user_id))
        if user.role != 'admin' and inspection.technician_id != int(current_user_id):
            raise ForbiddenError("You can only delete your own inspections")
        
        db.session.delete(inspection)
        db.session.commit()
        logger.warning("Inspection deleted: inspection_id=%s by user_id=%s", inspection_id, current_user_id)