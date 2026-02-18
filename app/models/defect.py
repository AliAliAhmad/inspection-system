"""
Defect model for tracking corrective actions.
Enhanced with assessment workflow, priority, and categories.
"""

from app.extensions import db
from datetime import datetime


class Defect(db.Model):
    """
    Defect/corrective action created from failed inspection items.
    Supports specialist assessment workflow and priority management.
    """
    __tablename__ = 'defects'

    id = db.Column(db.Integer, primary_key=True)
    inspection_id = db.Column(db.Integer, db.ForeignKey('inspections.id'), nullable=True)
    checklist_item_id = db.Column(db.Integer, db.ForeignKey('checklist_items.id'), nullable=True)

    # Category: mechanical or electrical (from checklist item)
    category = db.Column(db.String(20), nullable=True)  # 'mechanical' or 'electrical'

    # Quick field report fields
    reported_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    report_source = db.Column(db.String(30), nullable=True, default='inspection')  # 'inspection', 'field_report', 'safety_report'
    voice_note_url = db.Column(db.Text, nullable=True)
    photo_url = db.Column(db.Text, nullable=True)
    location_description = db.Column(db.Text, nullable=True)
    hazard_type = db.Column(db.String(30), nullable=True)
    equipment_id_direct = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=True)

    severity = db.Column(db.String(20), nullable=False, default='medium')
    priority = db.Column(db.String(20), nullable=True, default='medium')  # low, medium, high, urgent

    description = db.Column(db.Text, nullable=False)
    description_ar = db.Column(db.Text, nullable=True)

    status = db.Column(db.String(20), default='open')
    # Assessment by specialist before work
    assessment_status = db.Column(db.String(20), nullable=True)  # pending, confirmed, rejected, minor

    assigned_to_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    due_date = db.Column(db.Date, nullable=False)
    sla_days = db.Column(db.Integer, nullable=True)

    resolved_at = db.Column(db.DateTime, nullable=True)
    resolution_notes = db.Column(db.Text, nullable=True)

    # Occurrence tracking
    occurrence_count = db.Column(db.Integer, default=1, nullable=False)

    # Work order grouping (for urgent multi-defect scenarios)
    work_order_id = db.Column(db.String(50), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    inspection = db.relationship('Inspection', back_populates='defects')
    checklist_item = db.relationship('ChecklistItem', back_populates='defects')
    assigned_to = db.relationship('User', foreign_keys=[assigned_to_id], backref='assigned_defects')
    reported_by = db.relationship('User', foreign_keys=[reported_by_id], backref='reported_defects')
    equipment_direct = db.relationship('Equipment', foreign_keys=[equipment_id_direct])
    occurrences = db.relationship('DefectOccurrence', back_populates='defect', order_by='DefectOccurrence.occurrence_number')

    __table_args__ = (
        db.CheckConstraint(
            "severity IN ('low', 'medium', 'high', 'critical')",
            name='check_valid_severity'
        ),
        db.CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'urgent') OR priority IS NULL",
            name='check_valid_priority'
        ),
        db.CheckConstraint(
            "status IN ('open', 'in_progress', 'resolved', 'closed', 'false_alarm')",
            name='check_valid_defect_status'
        ),
        db.CheckConstraint(
            "assessment_status IN ('pending', 'confirmed', 'rejected', 'minor') OR assessment_status IS NULL",
            name='check_valid_assessment_status'
        ),
    )

    def to_dict(self, language='en'):
        """Convert defect to dictionary."""
        data = {
            'id': self.id,
            'inspection_id': self.inspection_id,
            'checklist_item_id': self.checklist_item_id,
            'category': self.category,
            'severity': self.severity,
            'priority': self.priority,
            'description': self.description_ar if language == 'ar' and self.description_ar else self.description,
            'status': self.status,
            'assessment_status': self.assessment_status,
            'assigned_to_id': self.assigned_to_id,
            'assigned_to': self.assigned_to.to_dict() if self.assigned_to else None,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'sla_days': self.sla_days,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
            'resolution_notes': self.resolution_notes,
            'work_order_id': self.work_order_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'occurrence_count': self.occurrence_count,
            'report_source': self.report_source,
            'reported_by_id': self.reported_by_id,
            'reported_by': self.reported_by.to_dict() if self.reported_by else None,
            'photo_url': self.photo_url,
            'voice_note_url': self.voice_note_url,
            'location_description': self.location_description,
            'hazard_type': self.hazard_type,
        }

        # Include equipment info — from inspection or direct field report
        equipment = None
        if self.equipment_id_direct and self.equipment_direct:
            equipment = self.equipment_direct
        elif self.inspection:
            equipment = self.inspection.equipment

        if equipment:
            data['equipment'] = {
                'id': equipment.id,
                'name': equipment.name_ar if language == 'ar' and equipment.name_ar else equipment.name,
                'serial_number': equipment.serial_number,
                'equipment_type': equipment.equipment_type,
                'berth': equipment.berth,
            }
            data['equipment_id'] = equipment.id
        else:
            data['equipment'] = None
            data['equipment_id'] = None

        # Include the inspection answer that caused this defect (first occurrence)
        if self.inspection_id and self.checklist_item_id:
            from app.models.inspection import InspectionAnswer
            answer = InspectionAnswer.query.filter_by(
                inspection_id=self.inspection_id,
                checklist_item_id=self.checklist_item_id
            ).first()
            data['inspection_answer'] = answer.to_dict(language=language) if answer else None
        else:
            data['inspection_answer'] = None

        # Include all occurrences with their media
        data['occurrences'] = [
            occ.to_dict(language=language, checklist_item_id=self.checklist_item_id)
            for occ in self.occurrences
        ]

        return data

    def __repr__(self):
        return f'<Defect {self.id} - {self.severity}>'
