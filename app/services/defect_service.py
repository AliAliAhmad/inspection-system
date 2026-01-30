"""
Service for managing defects and corrective actions.
"""

from app.models import Defect, ChecklistItem, Inspection, User
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import datetime, date, timedelta


class DefectService:
    """Service for managing defect lifecycle."""
    
    @staticmethod
    def create_defect_from_failure(inspection_id, checklist_item_id, technician_id):
        """
        Auto-create defect from failed inspection item.
        Called automatically when inspection is submitted.
        
        Args:
            inspection_id: ID of inspection
            checklist_item_id: ID of failed item
            technician_id: ID of technician to assign
        
        Returns:
            Created Defect object
        """
        item = ChecklistItem.query.get(checklist_item_id)
        if not item:
            raise NotFoundError("Checklist item not found")
        
        # Determine severity
        severity = 'critical' if item.critical_failure else 'medium'
        
        # Calculate due date based on severity
        due_date = DefectService._calculate_due_date(severity)
        
        # Create defect
        # Build Arabic description from checklist item if available
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
            due_date=due_date
        )
        
        db.session.add(defect)
        db.session.commit()
        
        # Create notification for technician (NEW - ADD THIS)
        from app.services.notification_service import NotificationService
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
        defect = Defect.query.get(defect_id)
        if not defect:
            raise NotFoundError(f"Defect with ID {defect_id} not found")
        
        # Only admin can update
        user = User.query.get(current_user_id)
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
        defect = Defect.query.get(defect_id)
        if not defect:
            raise NotFoundError(f"Defect with ID {defect_id} not found")
        
        technician = User.query.get(technician_id)
        if not technician or technician.role != 'technician':
            raise ValidationError("Invalid technician")
        
        user = User.query.get(current_user_id)
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
        defect = Defect.query.get(defect_id)
        if not defect:
            raise NotFoundError(f"Defect with ID {defect_id} not found")
        
        user = User.query.get(current_user_id)
        
        # Technician can only resolve their assigned defects
        if user.role == 'technician' and defect.assigned_to_id != current_user_id:
            raise ForbiddenError("You can only resolve defects assigned to you")
        
        if not resolution_notes:
            raise ValidationError("Resolution notes are required")
        
        defect.status = 'resolved'
        defect.resolved_at = datetime.utcnow()
        defect.resolution_notes = resolution_notes
        
        db.session.commit()
        
        # Create notification for admins (NEW - ADD THIS)
        from app.services.notification_service import NotificationService
        from app.models import User
        
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
        defect = Defect.query.get(defect_id)
        if not defect:
            raise NotFoundError(f"Defect with ID {defect_id} not found")
        
        user = User.query.get(current_user_id)
        if user.role != 'admin':
            raise ForbiddenError("Only admins can close defects")
        
        if defect.status != 'resolved':
            raise ValidationError("Can only close resolved defects")
        
        defect.status = 'closed'
        db.session.commit()
        return defect