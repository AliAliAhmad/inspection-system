"""
Final Assessment model.
Both inspectors assess equipment status after completing all questions.
Safety-first: if one says URGENT, equipment stops.
"""

from app.extensions import db
from datetime import datetime


class FinalAssessment(db.Model):
    """
    Final equipment assessment by both inspectors.
    Both must select OPERATIONAL for equipment to continue.
    If at least one selects URGENT, equipment is STOPPED (safety first).
    """
    __tablename__ = 'final_assessments'

    id = db.Column(db.Integer, primary_key=True)

    # References
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False)
    inspection_assignment_id = db.Column(db.Integer, db.ForeignKey('inspection_assignments.id'), nullable=False)

    # Inspector verdicts
    mechanical_inspector_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    electrical_inspector_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    mech_verdict = db.Column(db.String(20), nullable=True)  # 'operational' or 'urgent'
    elec_verdict = db.Column(db.String(20), nullable=True)  # 'operational' or 'urgent'

    # Final status
    final_status = db.Column(db.String(20), nullable=True)  # 'operational' or 'urgent'

    # Urgent details
    urgent_reason = db.Column(db.Text, nullable=True)  # min 50 chars

    # Disagreement resolution
    resolved_by = db.Column(db.String(20), nullable=True)  # 'agreement', 'safety_rule', 'admin'
    admin_decision_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    admin_decision_notes = db.Column(db.Text, nullable=True)

    # Timestamps
    mech_assessed_at = db.Column(db.DateTime, nullable=True)
    elec_assessed_at = db.Column(db.DateTime, nullable=True)
    finalized_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    equipment = db.relationship('Equipment')
    assignment = db.relationship('InspectionAssignment', backref='final_assessment')
    mechanical_inspector = db.relationship('User', foreign_keys=[mechanical_inspector_id])
    electrical_inspector = db.relationship('User', foreign_keys=[electrical_inspector_id])
    admin_decider = db.relationship('User', foreign_keys=[admin_decision_by])

    __table_args__ = (
        db.CheckConstraint(
            "mech_verdict IN ('operational', 'urgent') OR mech_verdict IS NULL",
            name='check_valid_mech_verdict'
        ),
        db.CheckConstraint(
            "elec_verdict IN ('operational', 'urgent') OR elec_verdict IS NULL",
            name='check_valid_elec_verdict'
        ),
        db.CheckConstraint(
            "final_status IN ('operational', 'urgent') OR final_status IS NULL",
            name='check_valid_final_status'
        ),
    )

    def evaluate_status(self):
        """
        Evaluate final status based on both verdicts.
        Safety-first: if either is urgent, equipment stops.
        """
        if self.mech_verdict and self.elec_verdict:
            if self.mech_verdict == 'urgent' or self.elec_verdict == 'urgent':
                self.final_status = 'urgent'
                if self.mech_verdict == self.elec_verdict:
                    self.resolved_by = 'agreement'
                else:
                    self.resolved_by = 'safety_rule'
            else:
                self.final_status = 'operational'
                self.resolved_by = 'agreement'
            self.finalized_at = datetime.utcnow()

    def to_dict(self, language='en'):
        from app.utils.bilingual import get_bilingual_fields
        text_fields = {}
        if self.urgent_reason:
            text_fields['urgent_reason'] = self.urgent_reason
        if self.admin_decision_notes:
            text_fields['admin_decision_notes'] = self.admin_decision_notes

        translated = get_bilingual_fields('final_assessment', self.id, text_fields, language) if text_fields else {}

        return {
            'id': self.id,
            'equipment_id': self.equipment_id,
            'inspection_assignment_id': self.inspection_assignment_id,
            'mechanical_inspector_id': self.mechanical_inspector_id,
            'electrical_inspector_id': self.electrical_inspector_id,
            'mech_verdict': self.mech_verdict,
            'elec_verdict': self.elec_verdict,
            'final_status': self.final_status,
            'urgent_reason': translated.get('urgent_reason', self.urgent_reason),
            'resolved_by': self.resolved_by,
            'admin_decision_by': self.admin_decision_by,
            'admin_decision_notes': translated.get('admin_decision_notes', self.admin_decision_notes),
            'finalized_at': self.finalized_at.isoformat() if self.finalized_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<FinalAssessment Equipment:{self.equipment_id} - {self.final_status}>'
