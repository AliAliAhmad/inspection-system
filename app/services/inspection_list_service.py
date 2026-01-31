"""
Service for auto-generating daily inspection lists from routines.
Triggered daily at 1:00 PM for next shift inspections.
"""

from app.models import (
    InspectionList, InspectionAssignment, InspectionRoutine,
    InspectionSchedule, Equipment, User, RosterEntry, Leave
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

        # Find active routines — match shift exactly or routines with no shift set
        routines = InspectionRoutine.query.filter_by(is_active=True).all()

        # Filter routines that match this shift and day
        applicable_routines = []
        for routine in routines:
            # Shift filter: match if routine shift equals requested shift, or routine has no shift
            if routine.shift and routine.shift != shift:
                continue
            # Day filter: match if routine includes this day, or routine has no days_of_week set (every day)
            days = routine.days_of_week
            if days and day_of_week not in days:
                continue
            applicable_routines.append(routine)

        # Collect all asset types from applicable routines + map asset_type → template_id
        asset_types = set()
        asset_type_template_map = {}  # equipment_type -> template_id (from routine)
        for routine in applicable_routines:
            for at in (routine.asset_types or []):
                asset_types.add(at)
                asset_type_template_map[at] = routine.template_id

        if not asset_types:
            raise ValidationError(
                f"No matching routines found for {target_date.strftime('%A')} {shift} shift. "
                f"Found {len(routines)} active routines total but none match this shift/day. "
                f"Please create inspection routines first."
            )

        # Find equipment matching these asset types
        equipment_list = Equipment.query.filter(
            Equipment.equipment_type.in_(list(asset_types)),
            Equipment.status.in_(['active', 'under_maintenance'])
        ).all()

        if not equipment_list:
            raise ValidationError(
                f"No equipment found matching asset types: {', '.join(asset_types)}. "
                f"Check that equipment exists with these types and is active."
            )

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

        # Build berth lookup from imported schedule for this day+shift
        schedule_berth_map = {}
        schedule_entries = InspectionSchedule.query.filter(
            InspectionSchedule.equipment_id.in_([e.id for e in equipment_list]),
            InspectionSchedule.day_of_week == day_of_week,
            InspectionSchedule.shift == shift,
            InspectionSchedule.is_active == True,
        ).all()
        for se in schedule_entries:
            if se.berth:
                schedule_berth_map[se.equipment_id] = se.berth

        # Create unassigned assignments for each equipment
        for equip in equipment_list:
            # Prefer berth from imported schedule, fallback to equipment record
            berth = schedule_berth_map.get(equip.id) or equip.berth
            # Get template from the routine that matched this equipment type
            tmpl_id = asset_type_template_map.get(equip.equipment_type)
            assignment = InspectionAssignment(
                inspection_list_id=inspection_list.id,
                equipment_id=equip.id,
                template_id=tmpl_id,
                berth=berth,
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

        target_date = assignment.inspection_list.target_date

        # Validate mechanical inspector
        mech = db.session.get(User, mechanical_inspector_id)
        if not mech or not mech.has_role('inspector'):
            raise ValidationError("Invalid mechanical inspector")
        if mech.specialization != 'mechanical':
            raise ValidationError("Inspector must have mechanical specialization")
        # Check leave for the assignment date, not today
        mech_leave = Leave.query.filter(
            Leave.user_id == mechanical_inspector_id,
            Leave.status == 'approved',
            Leave.date_from <= target_date,
            Leave.date_to >= target_date
        ).first()
        if mech_leave:
            raise ValidationError(f"{mech.full_name} is on leave on {target_date}")

        # Validate electrical inspector
        elec = db.session.get(User, electrical_inspector_id)
        if not elec or not elec.has_role('inspector'):
            raise ValidationError("Invalid electrical inspector")
        if elec.specialization != 'electrical':
            raise ValidationError("Inspector must have electrical specialization")
        elec_leave = Leave.query.filter(
            Leave.user_id == electrical_inspector_id,
            Leave.status == 'approved',
            Leave.date_from <= target_date,
            Leave.date_to >= target_date
        ).first()
        if elec_leave:
            raise ValidationError(f"{elec.full_name} is on leave on {target_date}")

        # Validate same shift using roster for the assignment date
        mech_roster = RosterEntry.query.filter_by(user_id=mechanical_inspector_id, date=target_date).first()
        elec_roster = RosterEntry.query.filter_by(user_id=electrical_inspector_id, date=target_date).first()
        mech_shift = mech_roster.shift if mech_roster else mech.shift
        elec_shift = elec_roster.shift if elec_roster else elec.shift
        if mech_shift != assignment.shift or elec_shift != assignment.shift:
            raise ValidationError(
                f"Both inspectors must be on the {assignment.shift} shift for {target_date}. "
                f"Mechanical inspector is on '{mech_shift or 'unknown'}', "
                f"Electrical inspector is on '{elec_shift or 'unknown'}'"
            )

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
