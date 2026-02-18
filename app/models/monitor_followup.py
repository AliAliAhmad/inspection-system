"""
Monitor Follow-Up model — tracks scheduled re-inspections after "monitor" verdict.

When an assessment finalizes as "monitor", engineers must schedule a follow-up.
The follow-up creates an inspection assignment on the scheduled date.
Results cycle: operational → resolved, monitor → new follow-up, stop → equipment stopped.
"""

from app.extensions import db
from datetime import datetime


class MonitorFollowup(db.Model):
    __tablename__ = 'monitor_followups'

    id = db.Column(db.Integer, primary_key=True)

    # Links
    assessment_id = db.Column(db.Integer, db.ForeignKey('final_assessments.id'), nullable=False)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False)
    parent_followup_id = db.Column(db.Integer, db.ForeignKey('monitor_followups.id'), nullable=True)

    # Scheduling
    followup_date = db.Column(db.Date, nullable=False)
    followup_type = db.Column(db.String(30), nullable=False)  # routine_check, detailed_inspection, operational_test
    location = db.Column(db.String(20), nullable=False)  # east, west
    shift = db.Column(db.String(20), nullable=True)  # day, night

    # Assigned inspectors
    mechanical_inspector_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    electrical_inspector_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Who scheduled it
    scheduled_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    scheduled_by_role = db.Column(db.String(20), nullable=True)  # engineer, admin
    notes = db.Column(db.Text, nullable=True)

    # Resulting assignment (created on follow-up date by scheduler)
    inspection_assignment_id = db.Column(db.Integer, db.ForeignKey('inspection_assignments.id'), nullable=True)

    # Status tracking
    status = db.Column(db.String(30), default='pending_schedule', nullable=False)
    # pending_schedule → scheduled → assignment_created → in_progress → completed / overdue / cancelled

    # Result (after follow-up inspection completes)
    result_verdict = db.Column(db.String(20), nullable=True)  # operational, monitor, stop
    result_assessment_id = db.Column(db.Integer, db.ForeignKey('final_assessments.id'), nullable=True)

    # Overdue tracking
    is_overdue = db.Column(db.Boolean, default=False)
    overdue_since = db.Column(db.DateTime, nullable=True)
    overdue_notifications_sent = db.Column(db.Integer, default=0)
    last_notification_at = db.Column(db.DateTime, nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)

    # Relationships
    assessment = db.relationship('FinalAssessment', foreign_keys=[assessment_id], backref='followups')
    equipment = db.relationship('Equipment')
    parent_followup = db.relationship('MonitorFollowup', remote_side=[id], backref='child_followups')
    mechanical_inspector = db.relationship('User', foreign_keys=[mechanical_inspector_id])
    electrical_inspector = db.relationship('User', foreign_keys=[electrical_inspector_id])
    scheduler = db.relationship('User', foreign_keys=[scheduled_by])
    inspection_assignment = db.relationship('InspectionAssignment')
    result_assessment = db.relationship('FinalAssessment', foreign_keys=[result_assessment_id])

    VALID_TYPES = ('routine_check', 'detailed_inspection', 'operational_test')
    VALID_LOCATIONS = ('east', 'west')
    VALID_STATUSES = (
        'pending_schedule', 'scheduled', 'assignment_created',
        'in_progress', 'completed', 'overdue', 'cancelled'
    )

    def to_dict(self):
        return {
            'id': self.id,
            'assessment_id': self.assessment_id,
            'equipment_id': self.equipment_id,
            'equipment_name': self.equipment.name if self.equipment else None,
            'equipment_number': self.equipment.equipment_number if self.equipment else None,
            'parent_followup_id': self.parent_followup_id,
            # Scheduling
            'followup_date': self.followup_date.isoformat() if self.followup_date else None,
            'followup_type': self.followup_type,
            'location': self.location,
            'shift': self.shift,
            # Inspectors
            'mechanical_inspector_id': self.mechanical_inspector_id,
            'mechanical_inspector_name': self.mechanical_inspector.full_name if self.mechanical_inspector else None,
            'electrical_inspector_id': self.electrical_inspector_id,
            'electrical_inspector_name': self.electrical_inspector.full_name if self.electrical_inspector else None,
            # Scheduler
            'scheduled_by': self.scheduled_by,
            'scheduled_by_name': self.scheduler.full_name if self.scheduler else None,
            'scheduled_by_role': self.scheduled_by_role,
            'notes': self.notes,
            # Assignment
            'inspection_assignment_id': self.inspection_assignment_id,
            # Status
            'status': self.status,
            'result_verdict': self.result_verdict,
            'result_assessment_id': self.result_assessment_id,
            # Overdue
            'is_overdue': self.is_overdue or False,
            'overdue_since': self.overdue_since.isoformat() if self.overdue_since else None,
            'overdue_notifications_sent': self.overdue_notifications_sent or 0,
            # Timestamps
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }

    def __repr__(self):
        return f'<MonitorFollowup #{self.id} Equipment:{self.equipment_id} Status:{self.status} Date:{self.followup_date}>'
