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
            shift: 'morning', 'afternoon', 'night', or legacy 'day'

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
            # Also match 'day' routines for 'morning'/'afternoon' and vice versa
            if routine.shift and routine.shift != shift:
                if not (routine.shift == 'day' and shift in ('morning', 'afternoon')):
                    if not (shift == 'day' and routine.shift in ('morning', 'afternoon')):
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

        # Match shift values — imported schedules may use 'day' (legacy) which covers
        # both 'morning' and 'afternoon' in the new shift system
        shift_values = [shift]
        if shift in ('morning', 'afternoon'):
            shift_values.append('day')
        elif shift == 'day':
            shift_values.extend(['morning', 'afternoon'])

        schedule_entries = InspectionSchedule.query.filter(
            InspectionSchedule.day_of_week == day_of_week,
            InspectionSchedule.shift.in_(shift_values),
            InspectionSchedule.is_active == True
        ).all()

        scheduled_equipment_ids = {se.equipment_id for se in schedule_entries}

        if asset_types:
            # Routines exist — filter equipment by asset type AND schedule
            equipment_candidates = Equipment.query.filter(
                Equipment.equipment_type.in_(list(asset_types)),
                Equipment.status.in_(['active', 'under_maintenance'])
            ).all()

            equipment_list = [
                eq for eq in equipment_candidates
                if eq.id in scheduled_equipment_ids
            ]

            if not equipment_list:
                if equipment_candidates:
                    day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
                    raise ValidationError(
                        f"No equipment scheduled for {day_names[day_of_week]} {shift} shift. "
                        f"Found {len(equipment_candidates)} equipment with matching asset types, "
                        f"but none are scheduled for this day/shift in the imported schedule. "
                        f"Please import an inspection schedule first."
                    )
                else:
                    raise ValidationError(
                        f"No equipment found matching asset types: {', '.join(asset_types)}. "
                        f"Check that equipment exists with these types and is active."
                    )
        else:
            # No routines configured — fall back to schedule-only mode.
            # Use ALL equipment from the imported schedule for this day/shift.
            if not scheduled_equipment_ids:
                day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
                raise ValidationError(
                    f"No equipment scheduled for {day_names[day_of_week]} {shift} shift. "
                    f"Please import an inspection schedule first."
                )

            equipment_list = Equipment.query.filter(
                Equipment.id.in_(list(scheduled_equipment_ids)),
                Equipment.status.in_(['active', 'under_maintenance'])
            ).all()

            if not equipment_list:
                raise ValidationError(
                    f"Scheduled equipment not found or not active. "
                    f"Check equipment status in the system."
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

        # Build berth lookup from imported schedule (berth is per-equipment, not per day/shift)
        schedule_berth_map = {}
        schedule_entries = InspectionSchedule.query.filter(
            InspectionSchedule.equipment_id.in_([e.id for e in equipment_list]),
            InspectionSchedule.berth.isnot(None),
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
        if not mech:
            raise ValidationError("Mechanical inspector not found")
        if not (mech.has_role('inspector') or mech.has_role('specialist')):
            raise ValidationError("User is not an inspector or specialist")
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
        if not elec:
            raise ValidationError("Electrical inspector not found")
        if not (elec.has_role('inspector') or elec.has_role('specialist')):
            raise ValidationError("User is not an inspector or specialist")
        elec_leave = Leave.query.filter(
            Leave.user_id == electrical_inspector_id,
            Leave.status == 'approved',
            Leave.date_from <= target_date,
            Leave.date_to >= target_date
        ).first()
        if elec_leave:
            raise ValidationError(f"{elec.full_name} is on leave on {target_date}")

        # Validate same shift using roster for the assignment date
        # Cross-match: 'day' roster covers 'morning'/'afternoon' assignments
        def shifts_compatible(user_shift, assignment_shift):
            if not user_shift:
                return True  # No roster = allow assignment
            if user_shift == assignment_shift:
                return True
            if user_shift == 'day' and assignment_shift in ('morning', 'afternoon', 'day'):
                return True
            if assignment_shift == 'day' and user_shift in ('morning', 'afternoon', 'day'):
                return True
            return False

        mech_roster = RosterEntry.query.filter_by(user_id=mechanical_inspector_id, date=target_date).first()
        elec_roster = RosterEntry.query.filter_by(user_id=electrical_inspector_id, date=target_date).first()
        mech_shift = mech_roster.shift if mech_roster else mech.shift
        elec_shift = elec_roster.shift if elec_roster else elec.shift
        if not shifts_compatible(mech_shift, assignment.shift) or not shifts_compatible(elec_shift, assignment.shift):
            raise ValidationError(
                f"Both inspectors must be on the {assignment.shift} shift for {target_date}. "
                f"Mechanical inspector is on '{mech_shift or 'unknown'}', "
                f"Electrical inspector is on '{elec_shift or 'unknown'}'"
            )

        # Calculate deadline (30 hours from shift start)
        shift_hours = {'morning': 6, 'day': 7, 'afternoon': 14, 'night': 22}
        start_hour = shift_hours.get(assignment.shift, 7)
        shift_start = datetime.combine(assignment.inspection_list.target_date, datetime.min.time().replace(hour=start_hour))
        deadline = shift_start + timedelta(hours=30)

        # Assign
        assignment.mechanical_inspector_id = mechanical_inspector_id
        assignment.electrical_inspector_id = electrical_inspector_id
        assignment.assigned_by = assigned_by_id
        assignment.assigned_at = datetime.utcnow()
        assignment.deadline = deadline
        assignment.status = 'assigned'

        # Auto-assign same inspector pair to other unassigned equipment at the same berth
        auto_assigned = []
        if assignment.berth:
            same_berth = InspectionAssignment.query.filter(
                InspectionAssignment.inspection_list_id == assignment.inspection_list_id,
                InspectionAssignment.berth == assignment.berth,
                InspectionAssignment.status == 'unassigned',
                InspectionAssignment.id != assignment.id,
            ).all()
            for sa in same_berth:
                sa.mechanical_inspector_id = mechanical_inspector_id
                sa.electrical_inspector_id = electrical_inspector_id
                sa.assigned_by = assigned_by_id
                sa.assigned_at = datetime.utcnow()
                sa.deadline = deadline
                sa.status = 'assigned'
                auto_assigned.append(sa)

        # Update list stats
        il = assignment.inspection_list
        il.assigned_assets = InspectionAssignment.query.filter_by(
            inspection_list_id=il.id
        ).filter(InspectionAssignment.status != 'unassigned').count()

        if il.assigned_assets >= il.total_assets:
            il.status = 'fully_assigned'
        else:
            il.status = 'partially_assigned'

        db.session.commit()

        # Send notifications
        from app.services.notification_service import NotificationService
        all_assigned = [assignment] + auto_assigned
        equipment_names = [a.equipment.name for a in all_assigned]
        notify_msg = f'You have been assigned to inspect: {", ".join(equipment_names)}'
        for user_id in [mechanical_inspector_id, electrical_inspector_id]:
            NotificationService.create_notification(
                user_id=user_id,
                type='inspection_assigned',
                title='New Inspection Assignment',
                message=notify_msg,
                related_type='inspection_assignment',
                related_id=assignment.id
            )

        # Auto-add inspection assignments to work plan
        try:
            InspectionListService._sync_to_work_plan(all_assigned, assigned_by_id)
        except Exception as e:
            # Don't fail the assignment if work plan sync fails
            import logging
            logging.getLogger(__name__).warning(f'Work plan auto-sync failed: {e}')

        # Attach auto-assigned count for API response (not persisted)
        assignment._auto_assigned_count = len(auto_assigned)
        return assignment

    @staticmethod
    def _sync_to_work_plan(assignments, assigned_by_id):
        """
        Auto-create WorkPlanJob entries for assigned inspections.
        Finds or creates the weekly WorkPlan and daily WorkPlanDay,
        then creates inspection jobs for each assignment.
        """
        from app.models.work_plan import WorkPlan
        from app.models.work_plan_day import WorkPlanDay
        from app.models.work_plan_job import WorkPlanJob

        if not assignments:
            return

        target_date = assignments[0].inspection_list.target_date

        # Find or create weekly work plan
        week_start, week_end = WorkPlan.get_week_bounds(target_date)
        work_plan = WorkPlan.query.filter_by(week_start=week_start).first()
        if not work_plan:
            work_plan = WorkPlan(
                week_start=week_start,
                week_end=week_end,
                status='draft',
                created_by_id=assigned_by_id,
            )
            db.session.add(work_plan)
            db.session.flush()

        # Find or create day within the plan
        work_day = WorkPlanDay.query.filter_by(
            work_plan_id=work_plan.id, date=target_date
        ).first()
        if not work_day:
            work_day = WorkPlanDay(
                work_plan_id=work_plan.id,
                date=target_date,
            )
            db.session.add(work_day)
            db.session.flush()

        # Create inspection jobs for each assignment (skip duplicates)
        existing_ids = {
            j.inspection_assignment_id
            for j in WorkPlanJob.query.filter(
                WorkPlanJob.work_plan_day_id == work_day.id,
                WorkPlanJob.job_type == 'inspection',
                WorkPlanJob.inspection_assignment_id.in_([a.id for a in assignments])
            ).all()
        }

        for assignment in assignments:
            if assignment.id in existing_ids:
                continue

            equip_name = assignment.equipment.name if assignment.equipment else 'Equipment'
            job = WorkPlanJob(
                work_plan_day_id=work_day.id,
                job_type='inspection',
                inspection_assignment_id=assignment.id,
                equipment_id=assignment.equipment_id,
                berth=assignment.berth,
                description=f'Inspection: {equip_name}',
                estimated_hours=1.0,
                priority='normal',
            )
            db.session.add(job)

        db.session.commit()

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
