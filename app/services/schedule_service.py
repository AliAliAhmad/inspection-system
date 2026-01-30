"""
Service for managing weekly inspection schedules.
"""

from app.models import InspectionSchedule, WeeklyCompletion, Equipment, Inspection
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from datetime import datetime, date, timedelta


class ScheduleService:
    """Service for managing inspection schedules and tracking weekly completions."""
    
    @staticmethod
    def create_schedule(equipment_id, day_of_week):
        """
        Create a schedule entry for equipment on a specific day.
        
        Args:
            equipment_id: ID of equipment
            day_of_week: Day number (0=Monday, 6=Sunday)
        
        Returns:
            Created InspectionSchedule object
        
        Raises:
            NotFoundError: If equipment not found
            ValidationError: If day_of_week invalid or schedule exists
        """
        # Validate equipment exists
        equipment = Equipment.query.get(equipment_id)
        if not equipment:
            raise NotFoundError(f"Equipment with ID {equipment_id} not found")
        
        # Validate day_of_week
        if not isinstance(day_of_week, int) or day_of_week < 0 or day_of_week > 6:
            raise ValidationError("day_of_week must be between 0 (Monday) and 6 (Sunday)")
        
        # Check if schedule already exists
        existing = InspectionSchedule.query.filter_by(
            equipment_id=equipment_id,
            day_of_week=day_of_week,
            is_active=True
        ).first()
        
        if existing:
            raise ValidationError(f"Schedule already exists for this equipment on {existing.get_day_name()}")
        
        # Create schedule
        schedule = InspectionSchedule(
            equipment_id=equipment_id,
            day_of_week=day_of_week,
            is_active=True
        )
        
        db.session.add(schedule)
        db.session.commit()
        
        return schedule
    
    @staticmethod
    def get_todays_equipment():
        """
        Get all equipment scheduled for today plus overdue equipment.
        
        Returns:
            Dictionary with scheduled and overdue equipment lists
        """
        today = datetime.now()
        day_of_week = today.weekday()  # 0=Monday, 6=Sunday
        current_week = today.isocalendar()[1]
        current_year = today.year
        
        # Get equipment scheduled for today
        scheduled_today = InspectionSchedule.query.filter_by(
            day_of_week=day_of_week,
            is_active=True
        ).all()
        
        scheduled_equipment = []
        overdue_equipment = []
        
        for schedule in scheduled_today:
            equipment = schedule.equipment
            
            # Check if already inspected this week
            completion = WeeklyCompletion.query.filter_by(
                equipment_id=equipment.id,
                year=current_year,
                week_number=current_week
            ).first()
            
            inspection_status = {
                'equipment': equipment.to_dict(),
                'schedule': schedule.to_dict(),
                'inspected_this_week': completion.completion_count if completion else 0,
                'last_inspection_date': completion.last_inspection_date.isoformat() if completion and completion.last_inspection_date else None
            }
            
            scheduled_equipment.append(inspection_status)
        
        # Get overdue equipment (scheduled for earlier this week but not inspected)
        for past_day in range(day_of_week):
            past_schedules = InspectionSchedule.query.filter_by(
                day_of_week=past_day,
                is_active=True
            ).all()
            
            for schedule in past_schedules:
                equipment = schedule.equipment
                
                # Check if inspected this week
                completion = WeeklyCompletion.query.filter_by(
                    equipment_id=equipment.id,
                    year=current_year,
                    week_number=current_week
                ).first()
                
                if not completion or completion.completion_count == 0:
                    # Not inspected yet - it's overdue
                    overdue_info = {
                        'equipment': equipment.to_dict(),
                        'schedule': schedule.to_dict(),
                        'scheduled_day': schedule.get_day_name(),
                        'days_overdue': day_of_week - past_day
                    }
                    overdue_equipment.append(overdue_info)
        
        return {
            'scheduled_today': scheduled_equipment,
            'overdue': overdue_equipment,
            'today': today.strftime('%A, %B %d, %Y'),
            'week_number': current_week
        }
    
    @staticmethod
    def get_weekly_schedule():
        """
        Get complete weekly schedule for all equipment.
        
        Returns:
            Dictionary with schedule organized by day
        """
        schedules = InspectionSchedule.query.filter_by(is_active=True).all()
        
        weekly_schedule = {
            0: {'day': 'Monday', 'equipment': []},
            1: {'day': 'Tuesday', 'equipment': []},
            2: {'day': 'Wednesday', 'equipment': []},
            3: {'day': 'Thursday', 'equipment': []},
            4: {'day': 'Friday', 'equipment': []},
            5: {'day': 'Saturday', 'equipment': []},
            6: {'day': 'Sunday', 'equipment': []}
        }
        
        for schedule in schedules:
            weekly_schedule[schedule.day_of_week]['equipment'].append({
                'id': schedule.id,
                'equipment': schedule.equipment.to_dict()
            })
        
        return weekly_schedule
    
    @staticmethod
    def update_completion(inspection_id):
        """
        Update weekly completion when an inspection is submitted.
        Called automatically when inspection is submitted.
        
        Args:
            inspection_id: ID of submitted inspection
        """
        inspection = Inspection.query.get(inspection_id)
        if not inspection:
            return
        
        submitted_date = inspection.submitted_at.date() if inspection.submitted_at else date.today()
        week_number = submitted_date.isocalendar()[1]
        year = submitted_date.year
        
        # Get or create weekly completion record
        completion = WeeklyCompletion.query.filter_by(
            equipment_id=inspection.equipment_id,
            year=year,
            week_number=week_number
        ).first()
        
        if completion:
            # Update existing
            completion.completion_count += 1
            completion.last_inspection_id = inspection_id
            completion.last_inspection_date = submitted_date
        else:
            # Create new
            completion = WeeklyCompletion(
                equipment_id=inspection.equipment_id,
                year=year,
                week_number=week_number,
                completion_count=1,
                last_inspection_id=inspection_id,
                last_inspection_date=submitted_date
            )
            db.session.add(completion)
        
        db.session.commit()
    
    @staticmethod
    def delete_schedule(schedule_id, current_user_id):
        """
        Delete a schedule entry. Admin only.
        
        Args:
            schedule_id: ID of schedule
            current_user_id: ID of current user
        
        Raises:
            NotFoundError: If schedule not found
            ForbiddenError: If user not admin
        """
        from app.models import User
        from app.exceptions.api_exceptions import ForbiddenError
        
        schedule = InspectionSchedule.query.get(schedule_id)
        if not schedule:
            raise NotFoundError(f"Schedule with ID {schedule_id} not found")
        
        user = User.query.get(int(current_user_id))
        if user.role != 'admin':
            raise ForbiddenError("Only admins can delete schedules")
        
        db.session.delete(schedule)
        db.session.commit()