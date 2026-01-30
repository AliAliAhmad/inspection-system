"""
User model for authentication and role-based access control.
Supports multi-role system with Major + Minor roles.
"""

from app.extensions import db
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash


class User(db.Model):
    """
    User model for authentication and role management.
    Supports: admin, inspector, specialist, engineer, quality_engineer roles.
    Multi-role: users can have a major role + optional minor role.
    """
    __tablename__ = 'users'

    # Primary Key
    id = db.Column(db.Integer, primary_key=True)

    # Authentication
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)

    # Profile
    full_name = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(50))
    language = db.Column(db.String(2), default='en')  # 'en' or 'ar'

    # Major Role
    role = db.Column(db.String(50), nullable=False, index=True)
    role_id = db.Column(db.String(20), unique=True, nullable=False)

    # Minor Role (optional second role)
    minor_role = db.Column(db.String(50), nullable=True)
    minor_role_id = db.Column(db.String(20), unique=True, nullable=True)

    # Inspector Specialization
    specialization = db.Column(db.String(20), nullable=True)  # 'mechanical' or 'electrical'

    # Work Details
    shift = db.Column(db.String(20))  # 'day', 'night'

    # Points Tracking (per-role)
    total_points = db.Column(db.Integer, default=0)
    inspector_points = db.Column(db.Integer, default=0)
    specialist_points = db.Column(db.Integer, default=0)
    engineer_points = db.Column(db.Integer, default=0)
    qe_points = db.Column(db.Integer, default=0)

    # Leave Status
    is_on_leave = db.Column(db.Boolean, default=False)
    leave_coverage_for = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Status
    is_active = db.Column(db.Boolean, default=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    covering_for = db.relationship('User', remote_side=[id], foreign_keys=[leave_coverage_for])

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "role IN ('admin', 'inspector', 'specialist', 'engineer', 'quality_engineer')",
            name='check_valid_role'
        ),
        db.CheckConstraint(
            "minor_role IN ('inspector', 'specialist', 'engineer', 'quality_engineer') OR minor_role IS NULL",
            name='check_valid_minor_role'
        ),
        db.CheckConstraint(
            "specialization IN ('mechanical', 'electrical') OR specialization IS NULL",
            name='check_valid_specialization'
        ),
        db.CheckConstraint(
            "shift IN ('day', 'night') OR shift IS NULL",
            name='check_valid_shift'
        ),
    )

    def set_password(self, password):
        """Hash and set the user's password."""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """Verify the password against the stored hash."""
        return check_password_hash(self.password_hash, password)

    def has_role(self, role_name):
        """Check if user has a role (major or minor)."""
        return self.role == role_name or self.minor_role == role_name

    def get_active_role_id(self, role_name):
        """Get the role ID for a specific role."""
        if self.role == role_name:
            return self.role_id
        if self.minor_role == role_name:
            return self.minor_role_id
        return None

    def add_points(self, points, role_name=None):
        """Add points to user, optionally to a specific role."""
        self.total_points = (self.total_points or 0) + points
        if role_name == 'inspector':
            self.inspector_points = (self.inspector_points or 0) + points
        elif role_name == 'specialist':
            self.specialist_points = (self.specialist_points or 0) + points
        elif role_name == 'engineer':
            self.engineer_points = (self.engineer_points or 0) + points
        elif role_name == 'quality_engineer':
            self.qe_points = (self.qe_points or 0) + points

    def to_dict(self, include_sensitive=False):
        """Convert user object to dictionary."""
        data = {
            'id': self.id,
            'email': self.email,
            'full_name': self.full_name,
            'phone': self.phone,
            'role': self.role,
            'role_id': self.role_id,
            'employee_id': self.role_id,
            'minor_role': self.minor_role,
            'minor_role_id': self.minor_role_id,
            'specialization': self.specialization,
            'shift': self.shift,
            'total_points': self.total_points,
            'inspector_points': self.inspector_points,
            'specialist_points': self.specialist_points,
            'engineer_points': self.engineer_points,
            'qe_points': self.qe_points,
            'is_on_leave': self.is_on_leave,
            'is_active': self.is_active,
            'language': self.language,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

        if include_sensitive:
            data['password_hash'] = self.password_hash

        return data

    def __repr__(self):
        return f'<User {self.email} ({self.role})>'
