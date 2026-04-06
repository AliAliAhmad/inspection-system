"""
Worker Assignment Rule model.
Configurable rules for the auto-planner: which workers handle which equipment
on which berth, with primary lead and successors.
"""

from app.extensions import db
from datetime import datetime


class WorkerAssignmentRule(db.Model):
    """
    Defines team composition + leads for a specific (berth, team_type, equipment_category) combo.

    Used by the auto-planner to assign workers to generated jobs.
    Manual overrides via the work plan editor are always permitted.
    """
    __tablename__ = 'worker_assignment_rules'

    id = db.Column(db.Integer, primary_key=True)

    # The 3-key composite that identifies a rule
    berth = db.Column(db.String(10), nullable=False)  # east, west
    team_type = db.Column(db.String(20), nullable=False)  # regular_pm, ac_pm, defect_mech, defect_elec
    equipment_category = db.Column(db.String(30), nullable=False)  # reach_stacker, ech, truck, forklift, trailer, all

    # Worker counts
    mech_count = db.Column(db.Integer, default=0, nullable=False)
    elec_count = db.Column(db.Integer, default=0, nullable=False)

    # Primary leads (one for mech, one for elec — either can be NULL if not applicable)
    primary_mech_lead_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    successor_mech_lead_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    primary_elec_lead_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    successor_elec_lead_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    # Pool of candidate workers (rotated by the generator) — JSON array of user IDs
    candidate_mech_workers = db.Column(db.JSON)  # [user_id, ...]
    candidate_elec_workers = db.Column(db.JSON)  # [user_id, ...]

    # Active flag
    is_active = db.Column(db.Boolean, default=True, nullable=False)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    primary_mech_lead = db.relationship('User', foreign_keys=[primary_mech_lead_id])
    successor_mech_lead = db.relationship('User', foreign_keys=[successor_mech_lead_id])
    primary_elec_lead = db.relationship('User', foreign_keys=[primary_elec_lead_id])
    successor_elec_lead = db.relationship('User', foreign_keys=[successor_elec_lead_id])

    __table_args__ = (
        db.UniqueConstraint('berth', 'team_type', 'equipment_category', name='uq_worker_assignment_rule'),
        db.CheckConstraint("berth IN ('east', 'west')", name='check_war_berth'),
        db.CheckConstraint(
            "team_type IN ('regular_pm', 'ac_pm', 'defect_mech', 'defect_elec')",
            name='check_war_team_type'
        ),
    )

    def to_dict(self):
        def user_summary(u):
            if not u:
                return None
            return {'id': u.id, 'full_name': u.full_name, 'role': u.role}

        return {
            'id': self.id,
            'berth': self.berth,
            'team_type': self.team_type,
            'equipment_category': self.equipment_category,
            'mech_count': self.mech_count,
            'elec_count': self.elec_count,
            'primary_mech_lead_id': self.primary_mech_lead_id,
            'primary_mech_lead': user_summary(self.primary_mech_lead),
            'successor_mech_lead_id': self.successor_mech_lead_id,
            'successor_mech_lead': user_summary(self.successor_mech_lead),
            'primary_elec_lead_id': self.primary_elec_lead_id,
            'primary_elec_lead': user_summary(self.primary_elec_lead),
            'successor_elec_lead_id': self.successor_elec_lead_id,
            'successor_elec_lead': user_summary(self.successor_elec_lead),
            'candidate_mech_workers': self.candidate_mech_workers or [],
            'candidate_elec_workers': self.candidate_elec_workers or [],
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    @classmethod
    def find_rule(cls, berth, team_type, equipment_category):
        """Find a matching rule. Falls back to 'all' equipment_category if specific not found."""
        rule = cls.query.filter_by(
            berth=berth,
            team_type=team_type,
            equipment_category=equipment_category,
            is_active=True,
        ).first()
        if rule:
            return rule
        # Fallback: rule for 'all' equipment categories
        return cls.query.filter_by(
            berth=berth,
            team_type=team_type,
            equipment_category='all',
            is_active=True,
        ).first()

    def __repr__(self):
        return f'<WorkerAssignmentRule {self.berth}/{self.team_type}/{self.equipment_category}>'
