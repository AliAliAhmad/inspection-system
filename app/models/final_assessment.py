"""
Final Assessment model — Multi-Layer Assessment System.
4-layer flow: System Auto → Inspector → Engineer → Admin
3 verdicts: operational / monitor / stop
"""

from app.extensions import db
from datetime import datetime


class FinalAssessment(db.Model):
    """
    Multi-layer equipment assessment.
    Layer 1: System auto-calculates from answers
    Layer 2: Both inspectors give verdict (see system recommendation)
    Layer 3: Engineer reviews on disagreement
    Layer 4: Admin final authority on escalation
    """
    __tablename__ = 'final_assessments'

    id = db.Column(db.Integer, primary_key=True)

    # References
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False)
    inspection_assignment_id = db.Column(db.Integer, db.ForeignKey('inspection_assignments.id'), nullable=False)

    # Inspector verdicts
    mechanical_inspector_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    electrical_inspector_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    mech_verdict = db.Column(db.String(20), nullable=True)
    elec_verdict = db.Column(db.String(20), nullable=True)

    # System auto-assessment (Layer 1)
    system_verdict = db.Column(db.String(20), nullable=True)
    system_urgency_score = db.Column(db.Integer, nullable=True)
    system_has_critical = db.Column(db.Boolean, default=False)
    system_has_fail_urgency = db.Column(db.Boolean, default=False)

    # Final status
    final_status = db.Column(db.String(20), nullable=True)

    # Reason fields
    urgent_reason = db.Column(db.Text, nullable=True)
    monitor_reason = db.Column(db.Text, nullable=True)
    stop_reason = db.Column(db.Text, nullable=True)

    # Disagreement resolution
    resolved_by = db.Column(db.String(20), nullable=True)  # 'agreement', 'escalation', 'engineer', 'admin'
    admin_decision_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    admin_decision_notes = db.Column(db.Text, nullable=True)

    # Engineer review (Layer 3)
    engineer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    engineer_verdict = db.Column(db.String(20), nullable=True)
    engineer_notes = db.Column(db.Text, nullable=True)
    engineer_reviewed_at = db.Column(db.DateTime, nullable=True)

    # Escalation tracking
    escalation_level = db.Column(db.String(20), default='none', nullable=False)
    escalation_reason = db.Column(db.Text, nullable=True)

    # Follow-up tracking
    requires_followup = db.Column(db.Boolean, default=False, nullable=False)
    followup_scheduled = db.Column(db.Boolean, default=False, nullable=False)

    # Version
    assessment_version = db.Column(db.Integer, default=2, nullable=False)

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
    engineer = db.relationship('User', foreign_keys=[engineer_id])

    __table_args__ = (
        db.CheckConstraint(
            "mech_verdict IN ('operational', 'monitor', 'stop') OR mech_verdict IS NULL",
            name='check_valid_mech_verdict'
        ),
        db.CheckConstraint(
            "elec_verdict IN ('operational', 'monitor', 'stop') OR elec_verdict IS NULL",
            name='check_valid_elec_verdict'
        ),
        db.CheckConstraint(
            "final_status IN ('operational', 'monitor', 'stop') OR final_status IS NULL",
            name='check_valid_final_status'
        ),
        db.CheckConstraint(
            "system_verdict IN ('operational', 'monitor', 'stop') OR system_verdict IS NULL",
            name='check_valid_system_verdict'
        ),
        db.CheckConstraint(
            "engineer_verdict IN ('operational', 'monitor', 'stop') OR engineer_verdict IS NULL",
            name='check_valid_engineer_verdict'
        ),
        db.CheckConstraint(
            "escalation_level IN ('none', 'engineer', 'admin')",
            name='check_valid_escalation_level'
        ),
    )

    # ── Urgency weights: 0=OK → 0pts, 1=Monitor → 1pt, 2=Needs Attention → 3pts, 3=Critical → 5pts
    URGENCY_WEIGHTS = {0: 0, 1: 1, 2: 3, 3: 5}

    @staticmethod
    def compute_system_verdict(answers):
        """
        Auto-calculate system verdict from inspection answers.
        Args:
            answers: list of InspectionAnswer objects
        Returns:
            dict with verdict, score, has_critical, has_fail_urgency
        """
        if not answers:
            return {'verdict': 'operational', 'score': 0, 'has_critical': False, 'has_fail_urgency': False}

        total_score = 0
        has_critical = False
        has_fail_urgency = False
        has_needs_attention = False  # any urgency == 2

        for ans in answers:
            urgency = getattr(ans, 'urgency_level', 0) or 0
            weight = FinalAssessment.URGENCY_WEIGHTS.get(urgency, 0)
            total_score += weight

            if urgency >= 3:
                has_critical = True
            if urgency >= 2:
                has_needs_attention = True

            # Fail answer with urgency >= 2
            answer_val = (getattr(ans, 'answer_value', '') or '').lower()
            if answer_val == 'fail' and urgency >= 2:
                has_fail_urgency = True

        # Decision rules
        if has_fail_urgency or total_score >= 5:
            verdict = 'stop'
        elif has_critical:
            verdict = 'stop'
        elif has_needs_attention and not has_fail_urgency:
            # Urgency 2 without fail → monitor
            verdict = 'monitor'
        elif total_score >= 3:
            verdict = 'monitor'
        else:
            verdict = 'operational'

        return {
            'verdict': verdict,
            'score': total_score,
            'has_critical': has_critical,
            'has_fail_urgency': has_fail_urgency
        }

    def apply_system_verdict(self, answers):
        """Calculate and store system verdict from answers."""
        result = self.compute_system_verdict(answers)
        self.system_verdict = result['verdict']
        self.system_urgency_score = result['score']
        self.system_has_critical = result['has_critical']
        self.system_has_fail_urgency = result['has_fail_urgency']
        return result

    def evaluate_multi_layer(self):
        """
        Evaluate after both inspectors submit.
        If all 3 (system + mech + elec) agree → auto-finalize.
        Any disagreement → escalate to engineer.
        """
        if not self.mech_verdict or not self.elec_verdict:
            return  # Wait for both

        all_verdicts = [self.system_verdict, self.mech_verdict, self.elec_verdict]
        all_agree = len(set(v for v in all_verdicts if v)) == 1

        if all_agree:
            # All agree → auto-finalize
            self.final_status = self.mech_verdict
            self.resolved_by = 'agreement'
            self.finalized_at = datetime.utcnow()
        else:
            # Disagreement → escalate to engineer
            self.escalation_level = 'engineer'
            disagreeing = set(v for v in all_verdicts if v)
            self.escalation_reason = f"Disagreement: system={self.system_verdict}, mech={self.mech_verdict}, elec={self.elec_verdict}"

    def evaluate_engineer_review(self):
        """
        After engineer submits verdict.
        If engineer agrees with system → finalize.
        If engineer disagrees OR anyone said stop → escalate to admin.
        """
        if not self.engineer_verdict:
            return

        any_stop = 'stop' in [self.system_verdict, self.mech_verdict, self.elec_verdict, self.engineer_verdict]

        if self.engineer_verdict == self.system_verdict and not any_stop:
            # Engineer agrees with system, no stop → finalize
            self.final_status = self.engineer_verdict
            self.resolved_by = 'engineer'
            self.finalized_at = datetime.utcnow()
        else:
            # Disagreement or stop present → escalate to admin
            self.escalation_level = 'admin'
            self.escalation_reason = (
                f"Engineer review: engineer={self.engineer_verdict}, "
                f"system={self.system_verdict}, mech={self.mech_verdict}, elec={self.elec_verdict}"
            )

    def evaluate_status(self):
        """Legacy compatibility: redirect to multi-layer evaluation."""
        self.evaluate_multi_layer()

    def to_dict(self, language='en'):
        from app.utils.bilingual import get_bilingual_fields
        text_fields = {}
        if self.urgent_reason:
            text_fields['urgent_reason'] = self.urgent_reason
        if self.admin_decision_notes:
            text_fields['admin_decision_notes'] = self.admin_decision_notes
        if self.monitor_reason:
            text_fields['monitor_reason'] = self.monitor_reason
        if self.stop_reason:
            text_fields['stop_reason'] = self.stop_reason
        if self.engineer_notes:
            text_fields['engineer_notes'] = self.engineer_notes
        if self.escalation_reason:
            text_fields['escalation_reason'] = self.escalation_reason

        translated = get_bilingual_fields('final_assessment', self.id, text_fields, language) if text_fields else {}

        return {
            'id': self.id,
            'equipment_id': self.equipment_id,
            'equipment_name': self.equipment.name if self.equipment else None,
            'inspection_assignment_id': self.inspection_assignment_id,
            'mechanical_inspector_id': self.mechanical_inspector_id,
            'electrical_inspector_id': self.electrical_inspector_id,
            'mech_verdict': self.mech_verdict,
            'elec_verdict': self.elec_verdict,
            'final_status': self.final_status,
            # System auto-assessment
            'system_verdict': self.system_verdict,
            'system_urgency_score': self.system_urgency_score,
            'system_has_critical': self.system_has_critical or False,
            'system_has_fail_urgency': self.system_has_fail_urgency or False,
            # Reasons
            'urgent_reason': translated.get('urgent_reason', self.urgent_reason),
            'monitor_reason': translated.get('monitor_reason', self.monitor_reason),
            'stop_reason': translated.get('stop_reason', self.stop_reason),
            # Resolution
            'resolved_by': self.resolved_by,
            'admin_decision_by': self.admin_decision_by,
            'admin_decision_notes': translated.get('admin_decision_notes', self.admin_decision_notes),
            # Engineer
            'engineer_id': self.engineer_id,
            'engineer_verdict': self.engineer_verdict,
            'engineer_notes': translated.get('engineer_notes', self.engineer_notes),
            'engineer_reviewed_at': self.engineer_reviewed_at.isoformat() if self.engineer_reviewed_at else None,
            # Escalation
            'escalation_level': self.escalation_level or 'none',
            'escalation_reason': translated.get('escalation_reason', self.escalation_reason),
            # Meta
            'assessment_version': self.assessment_version or 1,
            'requires_followup': self.requires_followup or False,
            'followup_scheduled': self.followup_scheduled or False,
            'finalized_at': self.finalized_at.isoformat() if self.finalized_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<FinalAssessment Equipment:{self.equipment_id} - {self.final_status} (escalation:{self.escalation_level})>'
