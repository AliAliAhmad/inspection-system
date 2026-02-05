"""
Service for managing defects and corrective actions.
"""

from app.models import Defect, DefectOccurrence, ChecklistItem, Inspection, User
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import datetime, date, timedelta


class DefectService:
    """Service for managing defect lifecycle."""
    
    @staticmethod
    def create_defect_from_failure(inspection_id, checklist_item_id, technician_id):
        """
        Auto-create defect from failed inspection item, or increment occurrence
        if the same defect already exists (open/in_progress) on the same equipment.

        Args:
            inspection_id: ID of inspection
            checklist_item_id: ID of failed item
            technician_id: ID of technician to assign

        Returns:
            Created or updated Defect object
        """
        item = db.session.get(ChecklistItem, checklist_item_id)
        if not item:
            raise NotFoundError("Checklist item not found")

        inspection = db.session.get(Inspection, inspection_id)
        if not inspection:
            raise NotFoundError("Inspection not found")

        # Check for existing open/in_progress defect for same checklist item + equipment
        existing = Defect.query.join(Inspection).filter(
            Defect.checklist_item_id == checklist_item_id,
            Inspection.equipment_id == inspection.equipment_id,
            Defect.status.in_(['open', 'in_progress'])
        ).first()

        from app.services.notification_service import NotificationService

        if existing:
            # Increment occurrence count on existing defect
            existing.occurrence_count += 1
            occ = DefectOccurrence(
                defect_id=existing.id,
                inspection_id=inspection_id,
                occurrence_number=existing.occurrence_count,
                found_by_id=technician_id,
                found_at=datetime.utcnow()
            )
            db.session.add(occ)
            db.session.commit()

            # Notify about recurring defect
            if existing.assigned_to_id:
                NotificationService.create_notification(
                    user_id=existing.assigned_to_id,
                    type='defect_recurring',
                    title=f'Recurring Defect (x{existing.occurrence_count})',
                    message=f'Defect found again: {existing.description}. Occurrence #{existing.occurrence_count}.',
                    related_type='defect',
                    related_id=existing.id
                )

            return existing

        # No existing defect — create new one
        severity = 'critical' if item.critical_failure else 'medium'
        due_date = DefectService._calculate_due_date(severity)

        description_ar = None
        if item.question_text_ar:
            description_ar = f"فشل: {item.question_text_ar}"

        defect = Defect(
            inspection_id=inspection_id,
            checklist_item_id=checklist_item_id,
            severity=severity,
            description=f"Failed: {item.question_text}",
            description_ar=description_ar,
            status='open',
            assigned_to_id=technician_id,
            due_date=due_date,
            occurrence_count=1
        )
        db.session.add(defect)
        db.session.commit()

        # Create first occurrence record
        occ = DefectOccurrence(
            defect_id=defect.id,
            inspection_id=inspection_id,
            occurrence_number=1,
            found_by_id=technician_id,
            found_at=datetime.utcnow()
        )
        db.session.add(occ)
        db.session.commit()

        # Notify technician
        NotificationService.create_notification(
            user_id=technician_id,
            type='defect_created',
            title=f'New Defect Assigned: {defect.severity.title()}',
            message=f'Defect created from inspection: {defect.description}. Due: {defect.due_date.strftime("%B %d, %Y")}',
            related_type='defect',
            related_id=defect.id
        )

        return defect
    
    @staticmethod
    def _calculate_due_date(severity):
        """
        Calculate due date based on severity.
        
        Args:
            severity: Defect severity
        
        Returns:
            Due date
        """
        days_map = {
            'critical': 1,
            'high': 3,
            'medium': 7,
            'low': 14
        }
        days = days_map.get(severity, 7)
        return date.today() + timedelta(days=days)
    
    @staticmethod
    def update_defect(defect_id, severity=None, due_date=None, description=None, current_user_id=None):
        """
        Update defect details. Admin only.
        
        Args:
            defect_id: ID of defect
            severity: New severity
            due_date: New due date
            description: New description
            current_user_id: ID of current user
        
        Returns:
            Updated Defect object
        """
        defect = db.session.get(Defect, defect_id)
        if not defect:
            raise NotFoundError(f"Defect with ID {defect_id} not found")
        
        # Only admin can update
        user = db.session.get(User, current_user_id)
        if user.role != 'admin':
            raise ForbiddenError("Only admins can update defects")
        
        if severity:
            defect.severity = severity
        if due_date:
            defect.due_date = due_date
        if description:
            defect.description = description
        
        db.session.commit()
        return defect
    
    @staticmethod
    def assign_defect(defect_id, technician_id, current_user_id):
        """
        Assign defect to technician. Admin only.
        
        Args:
            defect_id: ID of defect
            technician_id: ID of technician
            current_user_id: ID of current user
        
        Returns:
            Updated Defect object
        """
        defect = db.session.get(Defect, defect_id)
        if not defect:
            raise NotFoundError(f"Defect with ID {defect_id} not found")
        
        technician = db.session.get(User, technician_id)
        if not technician or technician.role != 'technician':
            raise ValidationError("Invalid technician")
        
        user = db.session.get(User, current_user_id)
        if user.role != 'admin':
            raise ForbiddenError("Only admins can assign defects")
        
        defect.assigned_to_id = technician_id
        db.session.commit()
        return defect
    
    @staticmethod
    def resolve_defect(defect_id, resolution_notes, current_user_id):
        """
        Mark defect as resolved.
        
        Args:
            defect_id: ID of defect
            resolution_notes: Notes on resolution
            current_user_id: ID of current user
        
        Returns:
            Updated Defect object
        """
        defect = db.session.get(Defect, defect_id)
        if not defect:
            raise NotFoundError(f"Defect with ID {defect_id} not found")
        
        user = db.session.get(User, current_user_id)
        
        # Technician can only resolve their assigned defects
        if user.role == 'technician' and defect.assigned_to_id != current_user_id:
            raise ForbiddenError("You can only resolve defects assigned to you")
        
        if not resolution_notes:
            raise ValidationError("Resolution notes are required")
        
        defect.status = 'resolved'
        defect.resolved_at = datetime.utcnow()
        defect.resolution_notes = resolution_notes
        
        db.session.commit()
        
        # Create notification for admins
        from app.services.notification_service import NotificationService

        admins = User.query.filter_by(role='admin', is_active=True).all()
        for admin in admins:
            NotificationService.create_notification(
                user_id=admin.id,
                type='defect_resolved',
                title='Defect Resolved',
                message=f'{user.full_name} resolved defect: {defect.description[:50]}...',
                related_type='defect',
                related_id=defect.id
            )
        
        return defect
    
    @staticmethod
    def close_defect(defect_id, current_user_id):
        """
        Close defect. Admin only. Can only close resolved defects.
        
        Args:
            defect_id: ID of defect
            current_user_id: ID of current user
        
        Returns:
            Updated Defect object
        """
        defect = db.session.get(Defect, defect_id)
        if not defect:
            raise NotFoundError(f"Defect with ID {defect_id} not found")
        
        user = db.session.get(User, current_user_id)
        if user.role != 'admin':
            raise ForbiddenError("Only admins can close defects")
        
        if defect.status != 'resolved':
            raise ValidationError("Can only close resolved defects")
        
        defect.status = 'closed'
        db.session.commit()
        return defect