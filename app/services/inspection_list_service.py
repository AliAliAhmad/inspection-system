"""
Service for auto-generating daily inspection lists from routines.
Triggered daily at 1:00 PM for next shift inspections.
"""

from app.models import (
    InspectionList, InspectionAssignment, InspectionRoutine,
    Equipment, User
)
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from datetime import datetime, date, timedelta


class InspectionListService:
    """Service for managing inspection list generation and assignment."""

    @staticmethod
    def generate_daily_list(target_date, shift):
        """
        Generate inspection list for a specific date and shift.
        Finds equipment matching active routines for this shift/day.

        Args:
            target_date: Date for inspections
            shift: 'day' or 'night'

        Returns:
            Created InspectionList with unassigned assignments
        """
        # Check if list already exists
        existing = InspectionList.query.filter_by(
            target_date=target_date,
            shift=shift
        ).first()
        if existing:
            raise ValidationError(f"Inspection list already exists for {target_date} {shift} shift")

        # Get day of week (0=Monday, 6=Sunday)
        day_of_week = target_date.weekday()

        # Find active routines for this shift and day
        routines = InspectionRoutine.query.filter_by(
            shift=shift,
            is_active=True
        ).all()

        # Filter routines that include this day of week
        applicable_routines = []
        for routine in routines:
            days = routine.days_of_week or []
            if day_of_week in days:
                applicable_routines.append(routine)

        # Collect all asset types from applicable routines
        asset_types = set()
        for routine in applicable_routines:
            for at in (routine.asset_types or []):
                asset_types.add(at)

        # Find equipment matching these asset types
        equipment_list = Equipment.query.filter(
            Equipment.equipment_type.in_(list(asset_types)),
            Equipment.status.in_(['active', 'under_maintenance'])
        ).all()

        # Create inspection list
        inspection_list = InspectionList(
            shift=shift,
            target_date=target_date,
            status='generated',
            total_assets=len(equipment_list),
            assigned_assets=0,
            completed_assets=0
        )
        db.session.add(inspection_list)
        db.session.flush()

        # Create unassigned assignments for each equipment
        for equip in equipment_list:
            assignment = InspectionAssignment(
                inspection_list_id=inspection_list.id,
                equipment_id=equip.id,
                berth=equip.berth,
                shift=shift,
                status='unassigned'
            )
            db.session.add(assignment)

        db.session.commit()
        return inspection_list

    @staticmethod
    def get_list(list_id):
        """Get inspection list with assignments."""
        inspection_list = db.session.get(InspectionList, list_id)
        if not inspection_list:
            raise NotFoundError(f"Inspection list {list_id} not found")
        return inspection_list

    @staticmethod
    def get_lists_for_date(target_date):
        """Get all inspection lists for a specific date."""
        return InspectionList.query.filter_by(target_date=target_date).all()

    @staticmethod
    def assign_team(assignment_id, mechanical_inspector_id, electrical_inspector_id, assigned_by_id):
        """
        Assign a 2-person team to an equipment asset.
        Validates same shift and correct specializations.

        Args:
            assignment_id: InspectionAssignment ID
            mechanical_inspector_id: User ID of mechanical inspector
            electrical_inspector_id: User ID of electrical inspector
            assigned_by_id: Engineer assigning the team
        """
        assignment = db.session.get(InspectionAssignment, assignment_id)
        if not assignment:
            raise NotFoundError(f"Assignment {assignment_id} not found")

        if assignment.status not in ('unassigned', 'assigned'):
            raise ValidationError("Assignment cannot be reassigned in current status")

        # Validate mechanical inspector
        mech = db.session.get(User, mechanical_inspector_id)
        if not mech or not mech.has_role('inspector'):
            raise ValidationError("Invalid mechanical inspector")
        if mech.specialization != 'mechanical':
            raise ValidationError("Inspector must have mechanical specialization")
        if mech.is_on_leave:
            raise ValidationError(f"{mech.full_name} is currently on leave")

        # Validate electrical inspector
        elec = db.session.get(User, electrical_inspector_id)
        if not elec or not elec.has_role('inspector'):
            raise ValidationError("Invalid electrical inspector")
        if elec.specialization != 'electrical':
            raise ValidationError("Inspector must have electrical specialization")
        if elec.is_on_leave:
            raise ValidationError(f"{elec.full_name} is currently on leave")

        # Validate same shift
        if mech.shift != assignment.shift or elec.shift != assignment.shift:
            raise ValidationError("Both inspectors must be on the same shift as the assignment")

        # Calculate deadline (30 hours from shift start)
        if assignment.shift == 'day':
            shift_start = datetime.combine(assignment.inspection_list.target_date, datetime.min.time().replace(hour=7))
        else:
            shift_start = datetime.combine(assignment.inspection_list.target_date, datetime.min.time().replace(hour=19))
        deadline = shift_start + timedelta(hours=30)

        # Assign
        assignment.mechanical_inspector_id = mechanical_inspector_id
        assignment.electrical_inspector_id = electrical_inspector_id
        assignment.assigned_by = assigned_by_id
        assignment.assigned_at = datetime.utcnow()
        assignment.deadline = deadline
        assignment.status = 'assigned'

        # Update list stats
        il = assignment.inspection_list
        il.assigned_assets = InspectionAssignment.query.filter_by(
            inspection_list_id=il.id
        ).filter(InspectionAssignment.status != 'unassigned').count() + 1

        if il.assigned_assets >= il.total_assets:
            il.status = 'fully_assigned'
        else:
            il.status = 'partially_assigned'

        db.session.commit()

        # Send notifications
        from app.services.notification_service import NotificationService
        for user_id in [mechanical_inspector_id, electrical_inspector_id]:
            NotificationService.create_notification(
                user_id=user_id,
                type='inspection_assigned',
                title='New Inspection Assignment',
                message=f'You have been assigned to inspect {assignment.equipment.name}',
                related_type='inspection_assignment',
                related_id=assignment.id
            )

        return assignment

    @staticmethod
    def update_berth(assignment_id, new_berth, engineer_id):
        """Engineer updates the verified berth during assignment."""
        assignment = db.session.get(InspectionAssignment, assignment_id)
        if not assignment:
            raise NotFoundError(f"Assignment {assignment_id} not found")

        assignment.berth = new_berth
        db.session.commit()
        return assignment

    @staticmethod
    def check_backlog():
        """
        Check for assignments past deadline (30 hours).
        Mark as backlog and make visible for takeover.
        """
        now = datetime.utcnow()
        overdue = InspectionAssignment.query.filter(
            InspectionAssignment.deadline < now,
            InspectionAssignment.status.in_(['assigned', 'in_progress']),
            InspectionAssignment.backlog_triggered == False
        ).all()

        for assignment in overdue:
            assignment.backlog_triggered = True
            assignment.backlog_triggered_at = now

            # Notify admins
            from app.services.notification_service import NotificationService
            admins = User.query.filter_by(role='admin', is_active=True).all()
            for admin in admins:
                NotificationService.create_notification(
                    user_id=admin.id,
                    type='backlog_triggered',
                    title='Inspection Backlog Alert',
                    message=f'Assignment for {assignment.equipment.name} has exceeded deadline',
                    related_type='inspection_assignment',
                    related_id=assignment.id,
                    priority='warning'
                )

        db.session.commit()
        return overdue

    @staticmethod
    def mark_inspector_complete(assignment_id, inspector_id):
        """
        Mark one inspector's portion as complete.
        Updates status based on which inspectors have finished.
        """
        assignment = db.session.get(InspectionAssignment, assignment_id)
        if not assignment:
            raise NotFoundError(f"Assignment {assignment_id} not found")

        now = datetime.utcnow()

        if inspector_id == assignment.mechanical_inspector_id:
            assignment.mech_completed_at = now
        elif inspector_id == assignment.electrical_inspector_id:
            assignment.elec_completed_at = now
        else:
            raise ValidationError("Inspector not assigned to this assignment")

        # Update status
        if assignment.mech_completed_at and assignment.elec_completed_at:
            assignment.status = 'both_complete'
        elif assignment.mech_completed_at:
            assignment.status = 'mech_complete'
        elif assignment.elec_completed_at:
            assignment.status = 'elec_complete'

        db.session.commit()
        return assignment
