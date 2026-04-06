"""
Work Plan Job model for individual jobs within a day plan.
Supports PM, defect repair, and inspection job types.
"""

from app.extensions import db
from datetime import datetime


class WorkPlanJob(db.Model):
    """
    A job within a work plan day.
    Can be a PM job, defect repair, or inspection.
    """
    __tablename__ = 'work_plan_jobs'

    id = db.Column(db.Integer, primary_key=True)

    # Parent day
    work_plan_day_id = db.Column(db.Integer, db.ForeignKey('work_plan_days.id'), nullable=False)

    # Job type
    job_type = db.Column(db.String(20), nullable=False)  # pm, defect, inspection

    # Berth assignment
    berth = db.Column(db.String(10))  # east, west, both

    # Equipment (for PM and defect jobs)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'))

    # Defect reference (for defect jobs)
    defect_id = db.Column(db.Integer, db.ForeignKey('defects.id'))

    # Inspection reference (for inspection jobs)
    inspection_assignment_id = db.Column(db.Integer, db.ForeignKey('inspection_assignments.id'))

    # SAP integration
    sap_order_number = db.Column(db.String(50))
    sap_order_type = db.Column(db.String(20))  # Original SAP order type (PRM, COM, etc.)

    # Description from SAP or manual entry
    description = db.Column(db.Text)

    # PM Template and Cycle (for PM jobs)
    cycle_id = db.Column(db.Integer, db.ForeignKey('maintenance_cycles.id'))
    pm_template_id = db.Column(db.Integer, db.ForeignKey('pm_templates.id'))

    # Job Template reference (for template-based jobs)
    template_id = db.Column(db.Integer, db.ForeignKey('job_templates.id'))

    # Overdue tracking
    overdue_value = db.Column(db.Float)  # Number of hours or days overdue
    overdue_unit = db.Column(db.String(10))  # hours, days

    # Maintenance base from SAP
    maintenance_base = db.Column(db.String(100))  # running_hours, calendar, condition

    # Planned date from SAP
    planned_date = db.Column(db.Date)

    # Time slots for timeline view
    start_time = db.Column(db.DateTime)
    end_time = db.Column(db.DateTime)

    # Actual time tracking
    actual_start_time = db.Column(db.DateTime)
    actual_end_time = db.Column(db.DateTime)

    # Time estimate (required when adding job)
    estimated_hours = db.Column(db.Float, nullable=False)

    # Display order
    position = db.Column(db.Integer, default=0)

    # Priority
    priority = db.Column(db.String(20), default='normal')  # low, normal, high, urgent

    # Job difficulty classification (for points system)
    difficulty = db.Column(db.String(10), nullable=True)  # 'minor' or 'major'

    # Responsible engineer (reviews this job)
    engineer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Checklist requirements
    checklist_required = db.Column(db.Boolean, default=False)
    checklist_completed = db.Column(db.Boolean, default=False)

    # Photo requirements
    completion_photo_required = db.Column(db.Boolean, default=False)

    # Weather sensitivity
    weather_sensitive = db.Column(db.Boolean, default=False)

    # Job splitting
    is_split = db.Column(db.Boolean, default=False)
    split_from_id = db.Column(db.Integer, db.ForeignKey('work_plan_jobs.id'))
    split_part = db.Column(db.Integer)  # 1, 2, 3 for split parts

    # Notes
    notes = db.Column(db.Text)

    # Work center: ELEC (electrical), MECH (mechanical), ELME (both)
    # Used by the bundle card view to split jobs into mech/elec sub-teams
    work_center = db.Column(db.String(10))

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    day = db.relationship('WorkPlanDay', back_populates='jobs')
    equipment = db.relationship('Equipment')
    defect = db.relationship('Defect')
    inspection_assignment = db.relationship('InspectionAssignment')
    cycle = db.relationship('MaintenanceCycle')
    pm_template = db.relationship('PMTemplate')
    template = db.relationship('JobTemplate')
    split_from = db.relationship('WorkPlanJob', remote_side='WorkPlanJob.id', backref='split_jobs')
    engineer = db.relationship('User', foreign_keys=[engineer_id])
    assignments = db.relationship('WorkPlanAssignment', back_populates='job', cascade='all, delete-orphan')
    materials = db.relationship('WorkPlanMaterial', back_populates='job', cascade='all, delete-orphan')

    @property
    def computed_priority(self):
        """
        Calculate priority based on overdue status.
        Returns: 'normal' (on time), 'high' (overdue), 'critical' (severely overdue)
        """
        if not self.overdue_value or self.overdue_value <= 0:
            return 'normal'

        if self.overdue_unit == 'hours':
            if self.overdue_value > 100:
                return 'critical'
            return 'high'
        else:  # days
            if self.overdue_value > 7:
                return 'critical'
            return 'high'

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "job_type IN ('pm', 'defect', 'inspection')",
            name='check_job_type'
        ),
        db.CheckConstraint(
            "berth IN ('east', 'west', 'both') OR berth IS NULL",
            name='check_job_berth'
        ),
        db.CheckConstraint(
            "priority IN ('low', 'normal', 'high', 'urgent')",
            name='check_job_priority'
        ),
    )

    def get_related_defects(self):
        """For PM jobs, get related open defects for the same equipment."""
        if self.job_type != 'pm' or not self.equipment_id:
            return []

        from app.models.defect import Defect
        from app.models.inspection import Inspection

        return Defect.query.join(Inspection).filter(
            Inspection.equipment_id == self.equipment_id,
            Defect.status.in_(['open', 'in_progress'])
        ).all()

    def to_dict(self, language='en', compact=False):
        """Convert to dictionary.

        Args:
            language: Language code for translations
            compact: If True, return minimal data for list views (faster)
        """
        # Compact mode for large lists - just essential fields
        if compact:
            # For inspection jobs, equipment lives on the assignment, not directly on the job
            if self.job_type == 'inspection' and self.inspection_assignment:
                insp_eq = self.inspection_assignment.equipment
                _eq_name = insp_eq.name if insp_eq else None
                _eq_serial = insp_eq.serial_number if insp_eq else None
                _eq_type = insp_eq.equipment_type if insp_eq else None
                _insp_assignment_id = self.inspection_assignment_id
            else:
                _eq_name = self.equipment.name if self.equipment else None
                _eq_serial = self.equipment.serial_number if self.equipment else None
                _eq_type = self.equipment.equipment_type if self.equipment else None
                _insp_assignment_id = self.inspection_assignment_id
            return {
                'id': self.id,
                'work_plan_day_id': self.work_plan_day_id,
                'job_type': self.job_type,
                'berth': self.berth,
                'equipment_id': self.equipment_id,
                'equipment_name': _eq_name,
                'equipment_serial': _eq_serial,
                'equipment_type': _eq_type,
                'defect_id': self.defect_id,
                'defect': self.defect.to_dict(language) if self.defect else None,
                'inspection_assignment_id': _insp_assignment_id,
                'sap_order_number': self.sap_order_number,
                'sap_order_type': self.sap_order_type,
                'description': self.description,
                'overdue_value': self.overdue_value,
                'overdue_unit': self.overdue_unit,
                'computed_priority': self.computed_priority,
                'estimated_hours': self.estimated_hours,
                'priority': self.priority,
                'checklist_required': self.checklist_required,
                'checklist_completed': self.checklist_completed,
                'is_split': self.is_split,
                'split_part': self.split_part,
                'difficulty': self.difficulty,
                'engineer_id': self.engineer_id,
                'assigned_users_count': len(self.assignments),
                'assignments': [a.to_dict() for a in self.assignments],
            }

        data = {
            'id': self.id,
            'work_plan_day_id': self.work_plan_day_id,
            'job_type': self.job_type,
            'berth': self.berth,
            'equipment_id': self.equipment_id,
            'equipment': self.equipment.to_dict() if self.equipment else None,
            'defect_id': self.defect_id,
            'defect': self.defect.to_dict(language) if self.defect else None,
            'inspection_assignment_id': self.inspection_assignment_id,
            'inspection_assignment': self.inspection_assignment.to_dict() if self.inspection_assignment else None,
            'sap_order_number': self.sap_order_number,
            'sap_order_type': self.sap_order_type,
            'description': self.description,
            'cycle_id': self.cycle_id,
            'cycle': self.cycle.to_dict(language) if self.cycle else None,
            'pm_template_id': self.pm_template_id,
            'pm_template': self.pm_template.to_dict(language, include_items=False) if self.pm_template else None,
            'template_id': self.template_id,
            'template': self.template.to_dict(language, include_materials=False, include_checklist=False) if self.template else None,
            'overdue_value': self.overdue_value,
            'overdue_unit': self.overdue_unit,
            'computed_priority': self.computed_priority,
            'maintenance_base': self.maintenance_base,
            'planned_date': self.planned_date.isoformat() if self.planned_date else None,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'actual_start_time': self.actual_start_time.isoformat() if self.actual_start_time else None,
            'actual_end_time': self.actual_end_time.isoformat() if self.actual_end_time else None,
            'estimated_hours': self.estimated_hours,
            'position': self.position,
            'priority': self.priority,
            'checklist_required': self.checklist_required,
            'checklist_completed': self.checklist_completed,
            'completion_photo_required': self.completion_photo_required,
            'weather_sensitive': self.weather_sensitive,
            'is_split': self.is_split,
            'split_from_id': self.split_from_id,
            'split_part': self.split_part,
            'notes': self.notes,
            'work_center': self.work_center,
            'difficulty': self.difficulty,
            'engineer_id': self.engineer_id,
            'engineer_name': self.engineer.full_name if self.engineer else None,
            'assignments': [a.to_dict() for a in self.assignments],
            'materials': [m.to_dict(language) for m in self.materials],
            'assigned_users_count': len(self.assignments),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

        # Skip related_defects in list view - too expensive (N+1 queries)
        # Fetch separately when viewing single job detail if needed
        if self.job_type == 'pm':
            data['related_defects'] = []
            data['related_defects_count'] = 0

        return data

    def __repr__(self):
        return f'<WorkPlanJob {self.job_type} equipment={self.equipment_id}>'
