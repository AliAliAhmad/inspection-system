"""
Inspection Assignment model.
Tracks 2-person team assignments (Mechanical + Electrical) per asset.
"""

from app.extensions import db
from datetime import datetime


class InspectionAssignment(db.Model):
    """
    Assignment of 2-person inspection team to an equipment asset.
    Engineer assigns 1 Mechanical + 1 Electrical inspector.
    Both must be on same shift.
    """
    __tablename__ = 'inspection_assignments'

    id = db.Column(db.Integer, primary_key=True)

    # Link to daily inspection list
    inspection_list_id = db.Column(db.Integer, db.ForeignKey('inspection_lists.id'), nullable=False)

    # Equipment
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False)

    # Checklist template (from routine)
    template_id = db.Column(db.Integer, db.ForeignKey('checklist_templates.id'), nullable=True)

    # Verified berth (engineer can update during assignment)
    berth = db.Column(db.String(20), nullable=True)

    # Two-person team
    mechanical_inspector_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    electrical_inspector_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Assignment details
    shift = db.Column(db.String(20), nullable=False)  # 'day' or 'night'
    assigned_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    assigned_at = db.Column(db.DateTime, nullable=True)

    # Deadline (30 hours from shift start)
    deadline = db.Column(db.DateTime, nullable=True)
    backlog_triggered = db.Column(db.Boolean, default=False)
    backlog_triggered_at = db.Column(db.DateTime, nullable=True)

    # Status
    status = db.Column(db.String(30), default='unassigned')
    # unassigned, assigned, in_progress, mech_complete, elec_complete, both_complete, assessment_pending, completed

    # Completion tracking
    mech_completed_at = db.Column(db.DateTime, nullable=True)
    elec_completed_at = db.Column(db.DateTime, nullable=True)

    # Takeover
    is_takeover = db.Column(db.Boolean, default=False)
    original_assignment_id = db.Column(db.Integer, db.ForeignKey('inspection_assignments.id'), nullable=True)

    # Points awarded
    mech_points_awarded = db.Column(db.Integer, default=0)
    elec_points_awarded = db.Column(db.Integer, default=0)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    equipment = db.relationship('Equipment')
    template = db.relationship('ChecklistTemplate')
    mechanical_inspector = db.relationship('User', foreign_keys=[mechanical_inspector_id])
    electrical_inspector = db.relationship('User', foreign_keys=[electrical_inspector_id])
    assigner = db.relationship('User', foreign_keys=[assigned_by])
    original_assignment = db.relationship('InspectionAssignment', remote_side=[id])

    def _compute_pending_on(self):
        """Compute what this assignment is currently waiting on."""
        if self.status in ('assigned', 'in_progress'):
            return 'both_inspections'
        elif self.status == 'mech_complete':
            return 'electrical_inspection'
        elif self.status == 'elec_complete':
            return 'mechanical_inspection'
        elif self.status in ('both_complete', 'assessment_pending'):
            from app.models.assessment import FinalAssessment
            fa = FinalAssessment.query.filter_by(
                inspection_assignment_id=self.id
            ).first()
            if fa:
                if not fa.mech_verdict and not fa.elec_verdict:
                    return 'both_verdicts'
                elif not fa.mech_verdict:
                    return 'mechanical_verdict'
                elif not fa.elec_verdict:
                    return 'electrical_verdict'
            return 'both_verdicts'
        return None

    def to_dict(self, language='en'):
        return {
            'id': self.id,
            'inspection_list_id': self.inspection_list_id,
            'equipment_id': self.equipment_id,
            'equipment': self.equipment.to_dict(language=language) if self.equipment else None,
            'template_id': self.template_id,
            'berth': self.berth,
            'mechanical_inspector_id': self.mechanical_inspector_id,
            'mechanical_inspector': self.mechanical_inspector.to_dict() if self.mechanical_inspector else None,
            'electrical_inspector_id': self.electrical_inspector_id,
            'electrical_inspector': self.electrical_inspector.to_dict() if self.electrical_inspector else None,
            'shift': self.shift,
            'assigned_by': self.assigned_by,
            'assigned_at': self.assigned_at.isoformat() if self.assigned_at else None,
            'deadline': self.deadline.isoformat() if self.deadline else None,
            'backlog_triggered': self.backlog_triggered,
            'status': self.status,
            'pending_on': self._compute_pending_on(),
            'mech_completed_at': self.mech_completed_at.isoformat() if self.mech_completed_at else None,
            'elec_completed_at': self.elec_completed_at.isoformat() if self.elec_completed_at else None,
            'is_takeover': self.is_takeover,
            'mech_points_awarded': self.mech_points_awarded,
            'elec_points_awarded': self.elec_points_awarded,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<InspectionAssignment Equipment:{self.equipment_id} - {self.status}>'
