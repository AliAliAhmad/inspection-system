"""
Leave Policy Model
Leave policies per role and seniority level.
"""

from app.extensions import db
from datetime import datetime


class LeavePolicy(db.Model):
    """
    Leave policies defining allowances and rules per role/seniority.
    Supports different policies for different roles and tenure levels.
    """
    __tablename__ = 'leave_policies'

    id = db.Column(db.Integer, primary_key=True)

    # Policy identification
    name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(50), index=True)  # null = applies to all roles

    # Seniority requirements
    min_tenure_months = db.Column(db.Integer, default=0)  # minimum months of employment

    # Leave allowances (days per year)
    annual_allowance = db.Column(db.Integer, default=24)
    sick_allowance = db.Column(db.Integer, default=15)
    emergency_allowance = db.Column(db.Integer, default=5)

    # Carry over settings
    carry_over_enabled = db.Column(db.Boolean, default=False)
    carry_over_max_days = db.Column(db.Integer, default=5)  # max days that can be carried over
    carry_over_expiry_months = db.Column(db.Integer, default=3)  # months until carry-over expires

    # Probation period
    probation_months = db.Column(db.Integer, default=3)
    probation_allowance = db.Column(db.Integer, default=0)  # leave days during probation

    # Accrual settings
    accrual_type = db.Column(db.String(20), default='yearly')  # yearly, monthly, quarterly
    accrual_rate = db.Column(db.Float)  # days per period if monthly/quarterly

    # Negative balance
    negative_balance_allowed = db.Column(db.Boolean, default=False)
    negative_balance_max = db.Column(db.Integer, default=0)  # max negative days allowed

    # Status
    is_active = db.Column(db.Boolean, default=True, index=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.CheckConstraint(
            "min_tenure_months >= 0",
            name='check_min_tenure_months_non_negative'
        ),
        db.CheckConstraint(
            "annual_allowance >= 0",
            name='check_annual_allowance_non_negative'
        ),
        db.CheckConstraint(
            "sick_allowance >= 0",
            name='check_sick_allowance_non_negative'
        ),
        db.CheckConstraint(
            "emergency_allowance >= 0",
            name='check_emergency_allowance_non_negative'
        ),
        db.CheckConstraint(
            "carry_over_max_days >= 0",
            name='check_carry_over_max_days_non_negative'
        ),
        db.CheckConstraint(
            "carry_over_expiry_months >= 0",
            name='check_carry_over_expiry_months_non_negative'
        ),
        db.CheckConstraint(
            "probation_months >= 0",
            name='check_probation_months_non_negative'
        ),
        db.CheckConstraint(
            "probation_allowance >= 0",
            name='check_probation_allowance_non_negative'
        ),
        db.CheckConstraint(
            "accrual_type IN ('yearly', 'monthly', 'quarterly')",
            name='check_valid_accrual_type'
        ),
        db.CheckConstraint(
            "negative_balance_max >= 0",
            name='check_negative_balance_max_non_negative'
        ),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary with language support."""
        return {
            'id': self.id,
            'name': self.name,
            'role': self.role,
            'min_tenure_months': self.min_tenure_months,
            'annual_allowance': self.annual_allowance,
            'sick_allowance': self.sick_allowance,
            'emergency_allowance': self.emergency_allowance,
            'carry_over_enabled': self.carry_over_enabled,
            'carry_over_max_days': self.carry_over_max_days,
            'carry_over_expiry_months': self.carry_over_expiry_months,
            'probation_months': self.probation_months,
            'probation_allowance': self.probation_allowance,
            'accrual_type': self.accrual_type,
            'accrual_rate': self.accrual_rate,
            'negative_balance_allowed': self.negative_balance_allowed,
            'negative_balance_max': self.negative_balance_max,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def get_total_annual_allowance(self):
        """Get total annual leave allowance."""
        return self.annual_allowance + self.sick_allowance + self.emergency_allowance

    def __repr__(self):
        role_str = self.role if self.role else 'all'
        return f'<LeavePolicy {self.name} ({role_str})>'
