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

    # SAP ID - Primary employee tracking ID (6 digits)
    sap_id = db.Column(db.String(6), unique=True, nullable=True, index=True)

    # Authentication
    email = db.Column(db.String(255), unique=True, nullable=True, index=True)
    username = db.Column(db.String(100), unique=True, nullable=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    must_change_password = db.Column(db.Boolean, default=False, nullable=False)

    # Profile
    full_name = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(50))
    language = db.Column(db.String(2), default='en')  # 'en' or 'ar'

    # Tracking
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

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
    # Leave Balance
    annual_leave_balance = db.Column(db.Integer, default=24, nullable=False)
    leave_coverage_for = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Status
    is_active = db.Column(db.Boolean, default=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    covering_for = db.relationship('User', remote_side=[id], foreign_keys=[leave_coverage_for])
    created_by = db.relationship('User', remote_side=[id], foreign_keys=[created_by_id])

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
            "specialization IN ('mechanical', 'electrical', 'hvac') OR specialization IS NULL",
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
            'sap_id': self.sap_id,
            'email': self.email,
            'username': self.username,
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
            'annual_leave_balance': self.annual_leave_balance,
            'is_active': self.is_active,
            'language': self.language,
            'must_change_password': self.must_change_password,
            'created_by_id': self.created_by_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

        if include_sensitive:
            data['password_hash'] = self.password_hash

        return data

    @staticmethod
    def generate_username(full_name):
        """
        Auto-generate username from full name.
        Format: firstname.fatherinitial.familyinitial
        Example: "Ahmed Mohammed Hassan" -> ahmed.m.h
        Collision handling:
        - Try ahmed.m.ha (2nd letter of family)
        - Try ahmed.m.has (3rd letter of family)
        - Then ahmed.m.h2, ahmed.m.h3, etc.
        """
        import re
        parts = full_name.strip().lower().split()

        if len(parts) < 3:
            # Not enough parts, use simple format
            if len(parts) == 0:
                base = 'user'
            elif len(parts) == 1:
                base = re.sub(r'[^a-z0-9]', '', parts[0])
            else:
                first = re.sub(r'[^a-z0-9]', '', parts[0])
                last = re.sub(r'[^a-z0-9]', '', parts[-1])
                base = f"{first}.{last[:1]}" if last else first
        else:
            # Full format: firstname.fatherinitial.familyinitial
            first = re.sub(r'[^a-z0-9]', '', parts[0])
            father_initial = re.sub(r'[^a-z0-9]', '', parts[1])[:1]
            family = re.sub(r'[^a-z0-9]', '', parts[-1])
            family_initial = family[:1] if family else ''

            base = f"{first}.{father_initial}.{family_initial}"

            # Check for duplicates with progressive family letters
            candidate = base
            if not User.query.filter_by(username=candidate).first():
                return candidate

            # Try more letters from family name
            for i in range(2, len(family) + 1):
                candidate = f"{first}.{father_initial}.{family[:i]}"
                if not User.query.filter_by(username=candidate).first():
                    return candidate

            # Fall back to numbers
            base = f"{first}.{father_initial}.{family_initial}"

        if not base:
            base = 'user'

        # Check for duplicates with numbers
        candidate = base
        counter = 2
        while User.query.filter_by(username=candidate).first():
            candidate = f"{base}{counter}"
            counter += 1
        return candidate

    @staticmethod
    def generate_role_id(role):
        """
        Auto-generate role_id based on role.
        Format: PREFIX + 3-digit number (INS001, SPE001, ENG001, QE001, ADM001)
        """
        prefix_map = {
            'admin': 'ADM',
            'inspector': 'INS',
            'specialist': 'SPE',
            'engineer': 'ENG',
            'quality_engineer': 'QE'
        }
        prefix = prefix_map.get(role, 'USR')

        # Find the highest existing number for this prefix
        existing = User.query.filter(User.role_id.like(f'{prefix}%')).all()
        max_num = 0
        for user in existing:
            try:
                num = int(user.role_id[len(prefix):])
                if num > max_num:
                    max_num = num
            except (ValueError, IndexError):
                continue

        new_num = max_num + 1
        return f"{prefix}{str(new_num).zfill(3)}"

    @staticmethod
    def get_minor_role(major_role):
        """Get the paired minor role for a major role."""
        pairing = {
            'inspector': 'specialist',
            'specialist': 'inspector',
            'engineer': 'quality_engineer',
            'quality_engineer': 'engineer',
            'admin': None
        }
        return pairing.get(major_role)

    def __repr__(self):
        return f'<User {self.email or self.username} ({self.role})>'
