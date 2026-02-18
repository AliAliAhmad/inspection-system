"""
Service for Monitor Follow-Up scheduling and lifecycle management.

When an assessment finalizes with final_status='monitor', a follow-up is created.
Engineers schedule it, and on the target date a new InspectionAssignment is generated.
Results cycle: operational -> resolved, monitor -> new follow-up, stop -> equipment stopped.
"""

import logging
from datetime import datetime, date, timedelta

from app.extensions import db
from app.models import (
    FinalAssessment, InspectionAssignment, InspectionList,
    Equipment, User, ChecklistTemplate,
)
from app.models.monitor_followup import MonitorFollowup
from app.models.leave import Leave
from app.models.roster import RosterEntry
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from sqlalchemy import func, or_

logger = logging.getLogger(__name__)


class MonitorFollowupService:
    """Service for managing monitor follow-up scheduling and lifecycle."""

    # ------------------------------------------------------------------
    # 1. Create a pending follow-up after 'monitor' verdict
    # ------------------------------------------------------------------

    @staticmethod
    def create_pending_followup(assessment_id):
        """
        Called when an assessment finalizes with final_status='monitor'.
        Creates a pending follow-up record and notifies all active engineers.

        Args:
            assessment_id: ID of the finalized FinalAssessment.

        Returns:
            The created MonitorFollowup instance.
        """
        assessment = db.session.get(FinalAssessment, assessment_id)
        if not assessment:
            raise NotFoundError(f"Assessment {assessment_id} not found")

        equipment = db.session.get(Equipment, assessment.equipment_id)
        if not equipment:
            raise NotFoundError(f"Equipment {assessment.equipment_id} not found")

        followup = MonitorFollowup(
            assessment_id=assessment_id,
            equipment_id=assessment.equipment_id,
            followup_date=date.today() + timedelta(days=7),
            followup_type='routine_check',
            location=equipment.berth or 'east',
            status='pending_schedule',
        )
        db.session.add(followup)

        assessment.requires_followup = True

        # Notify all active engineers
        from app.services.notification_service import NotificationService

        eq_name = equipment.name or f"Equipment #{equipment.id}"
        engineers = User.query.filter_by(role='engineer', is_active=True).all()
        for eng in engineers:
            NotificationService.create_notification(
                user_id=eng.id,
                type='monitor_followup_required',
                title='Monitor Follow-Up Required',
                message=(
                    f'{eq_name} assessed as MONITOR. '
                    f'Please schedule a follow-up inspection.'
                ),
                related_type='monitor_followup',
                related_id=followup.id,
                priority='urgent',
            )

        db.session.commit()
        logger.info(
            "Pending follow-up created: followup_id=%s assessment=%s equipment=%s",
            followup.id, assessment_id, assessment.equipment_id,
        )
        return followup

    # ------------------------------------------------------------------
    # 2. Schedule an existing pending follow-up
    # ------------------------------------------------------------------

    @staticmethod
    def schedule_followup(followup_id, scheduled_by_id, data):
        """
        Engineer or admin fills the scheduling form for a pending follow-up.

        Args:
            followup_id: ID of the MonitorFollowup to schedule.
            scheduled_by_id: User ID of the person scheduling.
            data: dict with keys:
                followup_date, followup_type, location, shift,
                mechanical_inspector_id, electrical_inspector_id, notes

        Returns:
            The updated MonitorFollowup instance.
        """
        followup = db.session.get(MonitorFollowup, followup_id)
        if not followup:
            raise NotFoundError(f"Follow-up {followup_id} not found")

        if followup.status != 'pending_schedule':
            raise ValidationError(
                f"Follow-up is already '{followup.status}', cannot schedule."
            )

        # --- Validate fields ---

        followup_date = data.get('followup_date')
        if isinstance(followup_date, str):
            try:
                followup_date = datetime.strptime(followup_date, '%Y-%m-%d').date()
            except ValueError:
                raise ValidationError("followup_date must be in YYYY-MM-DD format")
        if not followup_date or followup_date <= date.today():
            raise ValidationError("followup_date must be in the future")

        followup_type = data.get('followup_type', 'routine_check')
        if followup_type not in MonitorFollowup.VALID_TYPES:
            raise ValidationError(
                f"followup_type must be one of: {', '.join(MonitorFollowup.VALID_TYPES)}"
            )

        location = data.get('location', 'east')
        if location not in MonitorFollowup.VALID_LOCATIONS:
            raise ValidationError(
                f"location must be one of: {', '.join(MonitorFollowup.VALID_LOCATIONS)}"
            )

        # Validate inspectors
        mech_id = data.get('mechanical_inspector_id')
        elec_id = data.get('electrical_inspector_id')

        if mech_id:
            mech_user = db.session.get(User, mech_id)
            if not mech_user:
                raise NotFoundError(f"Mechanical inspector {mech_id} not found")
            if mech_user.specialization != 'mechanical':
                raise ValidationError(
                    f"User {mech_user.full_name} is not a mechanical inspector "
                    f"(specialization: {mech_user.specialization})"
                )

        if elec_id:
            elec_user = db.session.get(User, elec_id)
            if not elec_user:
                raise NotFoundError(f"Electrical inspector {elec_id} not found")
            if elec_user.specialization != 'electrical':
                raise ValidationError(
                    f"User {elec_user.full_name} is not an electrical inspector "
                    f"(specialization: {elec_user.specialization})"
                )

        # --- Apply updates ---

        followup.followup_date = followup_date
        followup.followup_type = followup_type
        followup.location = location
        followup.shift = data.get('shift') or 'day'
        followup.mechanical_inspector_id = mech_id
        followup.electrical_inspector_id = elec_id
        followup.notes = data.get('notes')
        followup.scheduled_by = scheduled_by_id
        followup.status = 'scheduled'

        # Record scheduler role
        scheduler = db.session.get(User, scheduled_by_id)
        followup.scheduled_by_role = scheduler.role if scheduler else None

        # Mark assessment as follow-up scheduled
        assessment = db.session.get(FinalAssessment, followup.assessment_id)
        if assessment:
            assessment.followup_scheduled = True

        # Notify assigned inspectors
        from app.services.notification_service import NotificationService

        equipment = db.session.get(Equipment, followup.equipment_id)
        eq_name = equipment.name if equipment else f"Equipment #{followup.equipment_id}"
        scheduler_name = scheduler.full_name if scheduler else 'Unknown'

        for uid in [mech_id, elec_id]:
            if uid:
                NotificationService.create_notification(
                    user_id=uid,
                    type='monitor_followup_assigned',
                    title='Follow-Up Inspection Assigned',
                    message=(
                        f'You have been assigned a follow-up inspection for {eq_name} '
                        f'on {followup_date.isoformat()} ({followup_type}). '
                        f'Scheduled by {scheduler_name}.'
                    ),
                    related_type='monitor_followup',
                    related_id=followup.id,
                    priority='info',
                )

        db.session.commit()
        logger.info(
            "Follow-up scheduled: followup_id=%s by=%s date=%s type=%s",
            followup.id, scheduled_by_id, followup_date, followup_type,
        )
        return followup

    # ------------------------------------------------------------------
    # 3. Inline scheduling (monitor verdict + form in one step)
    # ------------------------------------------------------------------

    @staticmethod
    def schedule_followup_inline(assessment_id, scheduled_by_id, data):
        """
        Called when an engineer/admin picks 'monitor' and fills the scheduling
        form in a single step. Creates a MonitorFollowup directly in 'scheduled'
        status. Does NOT commit -- the caller is responsible for committing.

        Args:
            assessment_id: ID of the FinalAssessment.
            scheduled_by_id: User ID of the person scheduling.
            data: dict with scheduling fields (same as schedule_followup).

        Returns:
            The created MonitorFollowup instance.
        """
        assessment = db.session.get(FinalAssessment, assessment_id)
        if not assessment:
            raise NotFoundError(f"Assessment {assessment_id} not found")

        followup_date = data.get('followup_date')
        if isinstance(followup_date, str):
            try:
                followup_date = datetime.strptime(followup_date, '%Y-%m-%d').date()
            except ValueError:
                raise ValidationError("followup_date must be in YYYY-MM-DD format")

        followup_type = data.get('followup_type', 'routine_check')
        location = data.get('location', 'east')

        scheduler = db.session.get(User, scheduled_by_id)

        followup = MonitorFollowup(
            assessment_id=assessment_id,
            equipment_id=assessment.equipment_id,
            followup_date=followup_date or (date.today() + timedelta(days=7)),
            followup_type=followup_type,
            location=location,
            shift=data.get('shift') or 'day',
            mechanical_inspector_id=data.get('mechanical_inspector_id'),
            electrical_inspector_id=data.get('electrical_inspector_id'),
            scheduled_by=scheduled_by_id,
            scheduled_by_role=scheduler.role if scheduler else None,
            notes=data.get('notes'),
            status='scheduled',
        )
        db.session.add(followup)

        assessment.requires_followup = True
        assessment.followup_scheduled = True

        # Notify assigned inspectors
        from app.services.notification_service import NotificationService

        equipment = db.session.get(Equipment, assessment.equipment_id)
        eq_name = equipment.name if equipment else f"Equipment #{assessment.equipment_id}"
        scheduler_name = scheduler.full_name if scheduler else 'Unknown'

        for uid in [data.get('mechanical_inspector_id'), data.get('electrical_inspector_id')]:
            if uid:
                NotificationService.create_notification(
                    user_id=uid,
                    type='monitor_followup_assigned',
                    title='Follow-Up Inspection Assigned',
                    message=(
                        f'You have been assigned a follow-up inspection for {eq_name} '
                        f'on {followup.followup_date.isoformat()} ({followup_type}). '
                        f'Scheduled by {scheduler_name}.'
                    ),
                    related_type='monitor_followup',
                    related_id=followup.id,
                    priority='info',
                )

        logger.info(
            "Inline follow-up created: assessment=%s by=%s date=%s type=%s",
            assessment_id, scheduled_by_id, followup.followup_date, followup_type,
        )
        return followup

    # ------------------------------------------------------------------
    # 4. Get available inspectors for a given date
    # ------------------------------------------------------------------

    @staticmethod
    def get_available_inspectors(target_date, shift=None, location=None):
        """
        Get inspectors available on a given date, grouped by specialization.

        Args:
            target_date: date object or ISO string.
            shift: Optional shift filter ('day' or 'night').
            location: Optional location filter (unused for filtering users
                      but kept for API symmetry).

        Returns:
            dict with 'mechanical' and 'electrical' lists, each item:
            { id, full_name, specialization, shift, workload_count }
        """
        if isinstance(target_date, str):
            try:
                target_date = datetime.strptime(target_date, '%Y-%m-%d').date()
            except ValueError:
                raise ValidationError("target_date must be in YYYY-MM-DD format")

        # 1. All active inspectors
        inspectors = User.query.filter_by(
            role='inspector', is_active=True
        ).all()

        # 2. Filter out those on approved leave
        on_leave_ids = set()
        leave_records = Leave.query.filter(
            Leave.status == 'approved',
            Leave.date_from <= target_date,
            Leave.date_to >= target_date,
        ).all()
        for lr in leave_records:
            on_leave_ids.add(lr.user_id)

        inspectors = [i for i in inspectors if i.id not in on_leave_ids]

        # 3. If shift is specified, check RosterEntry
        if shift:
            roster_entries = RosterEntry.query.filter_by(date=target_date).all()
            roster_map = {re.user_id: re.shift for re in roster_entries}

            filtered = []
            for inspector in inspectors:
                roster_shift = roster_map.get(inspector.id)
                # Include if no roster entry exists (unscheduled) or shift matches
                if roster_shift is None or roster_shift == shift:
                    filtered.append(inspector)
            inspectors = filtered

        # 4. Count active assignments per inspector for workload
        active_statuses = ('assigned', 'in_progress')
        workload_counts = dict(
            db.session.query(
                InspectionAssignment.mechanical_inspector_id,
                func.count(InspectionAssignment.id),
            )
            .filter(InspectionAssignment.status.in_(active_statuses))
            .group_by(InspectionAssignment.mechanical_inspector_id)
            .all()
        )
        elec_workload = dict(
            db.session.query(
                InspectionAssignment.electrical_inspector_id,
                func.count(InspectionAssignment.id),
            )
            .filter(InspectionAssignment.status.in_(active_statuses))
            .group_by(InspectionAssignment.electrical_inspector_id)
            .all()
        )
        # Merge electrical counts into workload_counts
        for uid, cnt in elec_workload.items():
            workload_counts[uid] = workload_counts.get(uid, 0) + cnt

        # 5. Group by specialization
        result = {'mechanical': [], 'electrical': []}
        for inspector in inspectors:
            spec = inspector.specialization or 'mechanical'
            roster_entry = RosterEntry.query.filter_by(
                user_id=inspector.id, date=target_date
            ).first()
            entry = {
                'id': inspector.id,
                'full_name': inspector.full_name,
                'specialization': spec,
                'shift': roster_entry.shift if roster_entry else (inspector.shift or 'day'),
                'workload_count': workload_counts.get(inspector.id, 0),
            }
            if spec in result:
                result[spec].append(entry)
            else:
                result.setdefault(spec, []).append(entry)

        # 6. Sort each group by workload (lowest first)
        for spec in result:
            result[spec].sort(key=lambda x: x['workload_count'])

        return result

    # ------------------------------------------------------------------
    # 5. Daily job: create InspectionAssignment for scheduled follow-ups
    # ------------------------------------------------------------------

    @staticmethod
    def create_followup_assignments_for_date(target_date):
        """
        Daily scheduler job. Creates InspectionAssignment records for all
        MonitorFollowups scheduled on the given date.

        Args:
            target_date: date object for which to generate assignments.

        Returns:
            int: Number of assignments created.
        """
        if isinstance(target_date, str):
            target_date = datetime.strptime(target_date, '%Y-%m-%d').date()

        followups = MonitorFollowup.query.filter(
            MonitorFollowup.followup_date == target_date,
            MonitorFollowup.status == 'scheduled',
        ).all()

        if not followups:
            logger.info("No scheduled follow-ups for %s", target_date)
            return 0

        from app.services.notification_service import NotificationService

        created_count = 0

        for followup in followups:
            try:
                shift = followup.shift or 'day'

                # Find or create InspectionList for this date/shift
                inspection_list = InspectionList.query.filter_by(
                    target_date=target_date, shift=shift
                ).first()

                if not inspection_list:
                    inspection_list = InspectionList(
                        target_date=target_date,
                        shift=shift,
                        status='generated',
                        total_assets=0,
                    )
                    db.session.add(inspection_list)
                    db.session.flush()

                # Determine template for the equipment
                equipment = db.session.get(Equipment, followup.equipment_id)
                template = None
                if equipment:
                    template = ChecklistTemplate.query.filter_by(
                        equipment_type=equipment.equipment_type,
                        is_active=True,
                    ).first()

                # Create InspectionAssignment
                assignment = InspectionAssignment(
                    inspection_list_id=inspection_list.id,
                    equipment_id=followup.equipment_id,
                    template_id=template.id if template else None,
                    berth=followup.location,
                    mechanical_inspector_id=followup.mechanical_inspector_id,
                    electrical_inspector_id=followup.electrical_inspector_id,
                    shift=shift,
                    assigned_by=followup.scheduled_by,
                    assigned_at=datetime.utcnow(),
                    status='assigned',
                )
                db.session.add(assignment)
                db.session.flush()

                # Update inspection list stats
                inspection_list.total_assets += 1
                inspection_list.assigned_assets += 1

                # Link assignment to follow-up and update status
                followup.inspection_assignment_id = assignment.id
                followup.status = 'assignment_created'

                # Notify assigned inspectors
                eq_name = equipment.name if equipment else f"Equipment #{followup.equipment_id}"
                for uid in [followup.mechanical_inspector_id, followup.electrical_inspector_id]:
                    if uid:
                        NotificationService.create_notification(
                            user_id=uid,
                            type='followup_inspection_due',
                            title='Follow-Up Inspection Due Today',
                            message=(
                                f'Follow-up inspection for {eq_name} is due today. '
                                f'Type: {followup.followup_type}, Location: {followup.location}.'
                            ),
                            related_type='inspection_assignment',
                            related_id=assignment.id,
                            priority='urgent',
                        )

                created_count += 1
                logger.info(
                    "Follow-up assignment created: followup=%s assignment=%s equipment=%s",
                    followup.id, assignment.id, followup.equipment_id,
                )

            except Exception as e:
                logger.error(
                    "Error creating follow-up assignment for followup=%s: %s",
                    followup.id, str(e),
                )
                continue

        db.session.commit()
        logger.info(
            "Follow-up assignments created for %s: %d of %d",
            target_date, created_count, len(followups),
        )
        return created_count

    # ------------------------------------------------------------------
    # 6. Daily job: check and mark overdue follow-ups
    # ------------------------------------------------------------------

    @staticmethod
    def check_overdue_followups():
        """
        Daily scheduler job. Marks overdue follow-ups and sends critical
        notifications to engineers and admins.

        Returns:
            int: Number of newly overdue follow-ups.
        """
        today = date.today()
        now = datetime.utcnow()

        overdue_followups = MonitorFollowup.query.filter(
            MonitorFollowup.followup_date < today,
            MonitorFollowup.status.in_(('scheduled', 'assignment_created')),
        ).all()

        if not overdue_followups:
            return 0

        from app.services.notification_service import NotificationService

        overdue_count = 0

        for followup in overdue_followups:
            followup.is_overdue = True
            if not followup.overdue_since:
                followup.overdue_since = now
            followup.status = 'overdue'
            followup.overdue_notifications_sent = (followup.overdue_notifications_sent or 0) + 1
            followup.last_notification_at = now

            equipment = db.session.get(Equipment, followup.equipment_id)
            eq_name = equipment.name if equipment else f"Equipment #{followup.equipment_id}"
            days_overdue = (today - followup.followup_date).days

            # Notify all active engineers and admins
            notify_users = User.query.filter(
                User.is_active.is_(True),
                or_(User.role == 'engineer', User.role == 'admin'),
            ).all()

            for user in notify_users:
                NotificationService.create_notification(
                    user_id=user.id,
                    type='monitor_followup_overdue',
                    title='OVERDUE: Monitor Follow-Up',
                    message=(
                        f'Follow-up inspection for {eq_name} is {days_overdue} day(s) '
                        f'overdue (was due {followup.followup_date.isoformat()}). '
                        f'Immediate action required.'
                    ),
                    related_type='monitor_followup',
                    related_id=followup.id,
                    priority='critical',
                )

            overdue_count += 1
            logger.warning(
                "Follow-up overdue: followup=%s equipment=%s days_overdue=%d",
                followup.id, followup.equipment_id, days_overdue,
            )

        db.session.commit()
        logger.info("Overdue follow-ups processed: %d", overdue_count)
        return overdue_count

    # ------------------------------------------------------------------
    # 7. Complete a follow-up after its inspection is finalized
    # ------------------------------------------------------------------

    @staticmethod
    def complete_followup(followup_id, result_assessment_id):
        """
        Called when the follow-up inspection's assessment is finalized.
        Records the result and, if the verdict is 'monitor', creates a new
        pending follow-up to continue the cycle.

        Args:
            followup_id: ID of the MonitorFollowup.
            result_assessment_id: ID of the new FinalAssessment from the
                                  follow-up inspection.

        Returns:
            The updated MonitorFollowup instance.
        """
        followup = db.session.get(MonitorFollowup, followup_id)
        if not followup:
            raise NotFoundError(f"Follow-up {followup_id} not found")

        result_assessment = db.session.get(FinalAssessment, result_assessment_id)
        if not result_assessment:
            raise NotFoundError(f"Result assessment {result_assessment_id} not found")

        followup.result_verdict = result_assessment.final_status
        followup.result_assessment_id = result_assessment_id
        followup.completed_at = datetime.utcnow()
        followup.status = 'completed'
        followup.is_overdue = False

        # If result is 'monitor', create a NEW pending follow-up (cycle continues)
        if result_assessment.final_status == 'monitor':
            equipment = db.session.get(Equipment, followup.equipment_id)

            child_followup = MonitorFollowup(
                assessment_id=result_assessment_id,
                equipment_id=followup.equipment_id,
                parent_followup_id=followup.id,
                followup_date=date.today() + timedelta(days=7),
                followup_type='routine_check',
                location=equipment.berth or followup.location or 'east',
                status='pending_schedule',
            )
            db.session.add(child_followup)

            result_assessment.requires_followup = True

            # Notify engineers about the new cycle
            from app.services.notification_service import NotificationService

            eq_name = equipment.name if equipment else f"Equipment #{followup.equipment_id}"
            engineers = User.query.filter_by(role='engineer', is_active=True).all()
            for eng in engineers:
                NotificationService.create_notification(
                    user_id=eng.id,
                    type='monitor_followup_required',
                    title='Recurring Monitor Follow-Up Required',
                    message=(
                        f'{eq_name} re-assessed as MONITOR after follow-up. '
                        f'A new follow-up inspection must be scheduled.'
                    ),
                    related_type='monitor_followup',
                    related_id=child_followup.id,
                    priority='urgent',
                )

            logger.info(
                "Follow-up cycle: completed=%s result=monitor new_followup=%s",
                followup.id, child_followup.id,
            )

        elif result_assessment.final_status == 'stop':
            # Equipment status is already handled by AssessmentService._apply_final_status
            logger.warning(
                "Follow-up resulted in STOP: followup=%s equipment=%s",
                followup.id, followup.equipment_id,
            )
        else:
            # operational -- cycle ends
            logger.info(
                "Follow-up resolved: followup=%s result=operational equipment=%s",
                followup.id, followup.equipment_id,
            )

        db.session.commit()
        return followup

    # ------------------------------------------------------------------
    # 8. Simple queries
    # ------------------------------------------------------------------

    @staticmethod
    def get_pending_followups():
        """Get all follow-ups with status='pending_schedule', ordered by creation date."""
        return MonitorFollowup.query.filter_by(
            status='pending_schedule'
        ).order_by(MonitorFollowup.created_at.desc()).all()

    @staticmethod
    def get_followup_history(equipment_id):
        """
        Get all follow-ups for a specific equipment, ordered by creation
        date descending.

        Args:
            equipment_id: ID of the equipment.

        Returns:
            List of MonitorFollowup instances.
        """
        equipment = db.session.get(Equipment, equipment_id)
        if not equipment:
            raise NotFoundError(f"Equipment {equipment_id} not found")

        return MonitorFollowup.query.filter_by(
            equipment_id=equipment_id
        ).order_by(MonitorFollowup.created_at.desc()).all()

    # ------------------------------------------------------------------
    # 9. Cancel a follow-up (admin only)
    # ------------------------------------------------------------------

    @staticmethod
    def cancel_followup(followup_id, cancelled_by_id):
        """
        Cancel a scheduled follow-up. Only admins may cancel.

        Args:
            followup_id: ID of the MonitorFollowup.
            cancelled_by_id: User ID of the admin cancelling.

        Returns:
            The updated MonitorFollowup instance.
        """
        followup = db.session.get(MonitorFollowup, followup_id)
        if not followup:
            raise NotFoundError(f"Follow-up {followup_id} not found")

        admin = db.session.get(User, cancelled_by_id)
        if not admin or admin.role != 'admin':
            raise ForbiddenError("Only admins can cancel follow-ups")

        if followup.status in ('completed', 'cancelled'):
            raise ValidationError(
                f"Cannot cancel a follow-up that is already '{followup.status}'"
            )

        followup.status = 'cancelled'
        followup.updated_at = datetime.utcnow()

        # Notify assigned inspectors about cancellation
        from app.services.notification_service import NotificationService

        equipment = db.session.get(Equipment, followup.equipment_id)
        eq_name = equipment.name if equipment else f"Equipment #{followup.equipment_id}"
        admin_name = admin.full_name

        for uid in [followup.mechanical_inspector_id, followup.electrical_inspector_id]:
            if uid:
                NotificationService.create_notification(
                    user_id=uid,
                    type='monitor_followup_cancelled',
                    title='Follow-Up Inspection Cancelled',
                    message=(
                        f'The follow-up inspection for {eq_name} on '
                        f'{followup.followup_date.isoformat()} has been cancelled '
                        f'by {admin_name}.'
                    ),
                    related_type='monitor_followup',
                    related_id=followup.id,
                    priority='info',
                )

        db.session.commit()
        logger.info(
            "Follow-up cancelled: followup_id=%s by=%s",
            followup_id, cancelled_by_id,
        )
        return followup

    # ------------------------------------------------------------------
    # 10. Dashboard statistics
    # ------------------------------------------------------------------

    @staticmethod
    def get_dashboard_stats():
        """
        Return aggregate counts of follow-ups by status.

        Returns:
            dict: { pending_schedule, scheduled, overdue, completed, total }
        """
        counts = dict(
            db.session.query(
                MonitorFollowup.status,
                func.count(MonitorFollowup.id),
            )
            .group_by(MonitorFollowup.status)
            .all()
        )

        return {
            'pending_schedule': counts.get('pending_schedule', 0),
            'scheduled': counts.get('scheduled', 0) + counts.get('assignment_created', 0),
            'overdue': counts.get('overdue', 0),
            'completed': counts.get('completed', 0),
            'cancelled': counts.get('cancelled', 0),
            'total': sum(counts.values()),
        }
