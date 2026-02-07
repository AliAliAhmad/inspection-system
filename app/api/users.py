"""
User management endpoints (Admin only).
Includes team import, role swap, and template download features.
"""

import json
import re
import io
from datetime import date, datetime
from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.exc import IntegrityError
from app.models import User, Leave, ImportLog, RoleSwapLog
from app.extensions import db, safe_commit
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from app.utils.decorators import admin_required
from app.utils.pagination import paginate

bp = Blueprint('users', __name__)

# Prefix mapping for auto-generating employee IDs
_ROLE_PREFIXES = {
    'admin': 'ADM',
    'inspector': 'INS',
    'specialist': 'SPC',
    'engineer': 'ENG',
    'quality_engineer': 'QE',
}


def _generate_role_id(role):
    """Auto-generate the next employee ID for a given role, e.g. INS-001, SPC-002."""
    prefix = _ROLE_PREFIXES.get(role)
    if not prefix:
        raise ValidationError(f"Unknown role: {role}")

    # Find the highest existing number for this prefix across both role_id and minor_role_id
    existing_role = User.query.filter(User.role_id.like(f'{prefix}%')).all()
    existing_minor = User.query.filter(User.minor_role_id.like(f'{prefix}%')).all()

    max_num = 0
    for u in existing_role:
        suffix = u.role_id[len(prefix):]
        if suffix.startswith('-'):
            suffix = suffix[1:]
        try:
            num = int(suffix)
            if num > max_num:
                max_num = num
        except ValueError:
            continue

    for u in existing_minor:
        if not u.minor_role_id:
            continue
        suffix = u.minor_role_id[len(prefix):]
        if suffix.startswith('-'):
            suffix = suffix[1:]
        try:
            num = int(suffix)
            if num > max_num:
                max_num = num
        except ValueError:
            continue

    return f'{prefix}-{max_num + 1:03d}'


@bp.route('', methods=['GET'])
@jwt_required()
@admin_required()
def list_users():
    """List all users. Admin only."""
    query = User.query

    # Filter by active status
    is_active = request.args.get('is_active')
    if is_active is not None:
        query = query.filter_by(is_active=is_active.lower() == 'true')

    # Filter by role
    role = request.args.get('role')
    if role:
        query = query.filter_by(role=role)

    # Search by name or email
    search = request.args.get('search')
    if search:
        search_term = f'%{search}%'
        query = query.filter(
            db.or_(
                User.full_name.ilike(search_term),
                User.email.ilike(search_term),
                User.employee_id.ilike(search_term)
            )
        )

    query = query.order_by(User.full_name)
    items, pagination = paginate(query)

    # Find active leave coverage for on-leave users
    today = date.today()
    active_leaves = Leave.query.filter(
        Leave.status == 'approved',
        Leave.date_from <= today,
        Leave.date_to >= today,
        Leave.coverage_user_id.isnot(None)
    ).all()

    # Build maps: on-leave user -> cover info, cover user -> who they cover
    leave_cover_map = {}  # user_id -> { cover user info }
    covering_for_map = {}  # cover_user_id -> { on-leave user info }
    for lv in active_leaves:
        if lv.coverage_user:
            leave_cover_map[lv.user_id] = {
                'id': lv.coverage_user.id,
                'full_name': lv.coverage_user.full_name,
                'role_id': lv.coverage_user.role_id,
            }
        user_on_leave = db.session.get(User, lv.user_id)
        if user_on_leave and lv.coverage_user_id:
            covering_for_map[lv.coverage_user_id] = {
                'id': user_on_leave.id,
                'full_name': user_on_leave.full_name,
                'role_id': user_on_leave.role_id,
            }

    user_list = []
    for u in items:
        d = u.to_dict()
        if u.id in leave_cover_map:
            d['leave_cover'] = leave_cover_map[u.id]
        if u.id in covering_for_map:
            d['covering_for'] = covering_for_map[u.id]
        user_list.append(d)

    return jsonify({
        'status': 'success',
        'data': user_list,
        'pagination': pagination
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
@admin_required()
def create_user():
    """
    Create new user. Admin only.
    
    Request Body:
        {
            "email": "newtech@company.com",
            "password": "password123",
            "full_name": "Jane Doe",
            "role": "technician",
            "language": "en"
        }
    
    Returns:
        {
            "status": "success",
            "user": {...}
        }
    """
    data = request.get_json()
    
    required_fields = ['email', 'password', 'full_name', 'role']
    for field in required_fields:
        if field not in data:
            raise ValidationError(f"{field} is required")

    # Validate role
    valid_roles = ['admin', 'inspector', 'specialist', 'engineer', 'quality_engineer', 'maintenance']
    if data['role'] not in valid_roles:
        raise ValidationError(f"role must be one of: {', '.join(valid_roles)}")

    # Check if email already exists
    existing = User.query.filter_by(email=data['email']).first()
    if existing:
        raise ValidationError(f"User with email {data['email']} already exists")

    # Auto-generate role_id based on role
    role_id = _generate_role_id(data['role'])

    # Auto-generate minor_role_id if minor_role is provided
    minor_role = data.get('minor_role')
    minor_role_id = None
    if minor_role:
        if minor_role not in valid_roles:
            raise ValidationError(f"minor_role must be one of: {', '.join(valid_roles)}")
        minor_role_id = _generate_role_id(minor_role)

    # Validate language
    language = data.get('language', 'en')
    if language not in ['en', 'ar']:
        raise ValidationError("language must be 'en' or 'ar'")

    # Auto-generate username from full name
    username = User.generate_username(data['full_name'])

    user = User(
        email=data['email'],
        username=username,
        full_name=data['full_name'],
        role=data['role'],
        role_id=role_id,
        language=language,
        phone=data.get('phone'),
        shift=data.get('shift'),
        specialization=data.get('specialization'),
        minor_role=minor_role,
        minor_role_id=minor_role_id,
        is_active=True,
        annual_leave_balance=24,
    )
    user.set_password(data['password'])
    
    db.session.add(user)
    try:
        safe_commit()
    except IntegrityError as e:
        db.session.rollback()
        error_msg = str(e.orig) if e.orig else str(e)
        if 'role_id' in error_msg or 'minor_role_id' in error_msg:
            raise ValidationError("Duplicate employee ID generated. Please try again.")
        raise ValidationError(f"Database constraint error: {error_msg}")

    return jsonify({
        'status': 'success',
        'message': 'User created',
        'user': user.to_dict()
    }), 201


@bp.route('/<int:user_id>', methods=['PUT'])
@jwt_required()
@admin_required()
def update_user(user_id):
    """
    Update user. Admin only.
    
    Request Body:
        {
            "full_name": "Jane Smith",
            "role": "admin",
            "language": "ar",
            "is_active": true
        }
    
    Returns:
        {
            "status": "success",
            "user": {...}
        }
    """
    user = db.session.get(User, user_id)
    if not user:
        raise NotFoundError(f"User with ID {user_id} not found")
    
    data = request.get_json()
    
    # Update fields if provided
    if 'full_name' in data:
        user.full_name = data['full_name']
    if 'role' in data:
        valid_roles = ['admin', 'inspector', 'specialist', 'engineer', 'quality_engineer', 'maintenance']
        if data['role'] not in valid_roles:
            raise ValidationError(f"role must be one of: {', '.join(valid_roles)}")
        user.role = data['role']
    if 'language' in data:
        if data['language'] not in ['en', 'ar']:
            raise ValidationError("language must be 'en' or 'ar'")
        user.language = data['language']
    if 'is_active' in data:
        user.is_active = data['is_active']
    if 'password' in data:
        user.set_password(data['password'])
    
    safe_commit()
    
    return jsonify({
        'status': 'success',
        'message': 'User updated',
        'user': user.to_dict()
    }), 200


@bp.route('/<int:user_id>', methods=['DELETE'])
@jwt_required()
@admin_required()
def deactivate_user(user_id):
    """
    Deactivate user (soft delete). Admin only.
    
    Returns:
        {
            "status": "success",
            "message": "User deactivated"
        }
    """
    user = db.session.get(User, user_id)
    if not user:
        raise NotFoundError(f"User with ID {user_id} not found")
    
    user.is_active = False
    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'User deactivated'
    }), 200


# ============================================================
# TEAM IMPORT ENDPOINTS
# ============================================================

def _validate_sap_id(sap_id):
    """Validate SAP ID is exactly 6 digits."""
    if not sap_id or not re.match(r'^\d{6}$', str(sap_id)):
        return False
    return True


def _validate_full_name(full_name):
    """Validate full name has 3 parts (first, father, family)."""
    if not full_name:
        return False, "Full name is required"
    parts = full_name.strip().split()
    if len(parts) < 3:
        return False, "Full name must have 3 parts (first, father, family). Please add father name."
    return True, None


def _get_minor_role(major_role):
    """Get the paired minor role for a major role."""
    pairing = {
        'inspector': 'specialist',
        'specialist': 'inspector',
        'engineer': 'quality_engineer',
        'quality_engineer': 'engineer',
        'admin': None
    }
    return pairing.get(major_role)


@bp.route('/import', methods=['POST'])
@jwt_required()
@admin_required()
def import_team():
    """
    Import team members from Excel file.
    Admin only.

    Expected Excel columns:
    - SAP_ID (6 digits, required)
    - full_name (3 parts, required)
    - email (required)
    - role (required: admin, inspector, specialist, engineer, quality_engineer, maintenance)
    - phone (required)
    - specialization (required for non-admin: mechanical, electrical, hvac)
    """
    try:
        import pandas as pd
    except ImportError:
        raise ValidationError("pandas library is required for Excel import")

    if 'file' not in request.files:
        raise ValidationError("No file provided")

    file = request.files['file']
    if not file.filename:
        raise ValidationError("No file selected")

    if not file.filename.endswith(('.xlsx', '.xls')):
        raise ValidationError("File must be an Excel file (.xlsx or .xls)")

    admin_id = int(get_jwt_identity())

    try:
        df = pd.read_excel(file)
    except Exception as e:
        raise ValidationError(f"Failed to read Excel file: {str(e)}")

    # Normalize column names
    df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')

    required_columns = ['sap_id', 'full_name', 'email', 'role', 'phone', 'specialization']
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise ValidationError(f"Missing required columns: {', '.join(missing_columns)}")

    valid_roles = ['admin', 'inspector', 'specialist', 'engineer', 'quality_engineer', 'maintenance']
    valid_specializations = ['mechanical', 'electrical', 'hvac']

    results = {
        'created': [],
        'updated': [],
        'failed': []
    }

    for idx, row in df.iterrows():
        row_num = idx + 2  # Excel row number (1-indexed + header)
        errors = []

        # Extract and validate data
        sap_id = str(row.get('sap_id', '')).strip()
        full_name = str(row.get('full_name', '')).strip()
        email = str(row.get('email', '')).strip()
        role = str(row.get('role', '')).strip().lower()
        phone = str(row.get('phone', '')).strip()
        specialization = str(row.get('specialization', '')).strip().lower()

        # Validate SAP ID
        if not _validate_sap_id(sap_id):
            errors.append("SAP_ID must be exactly 6 digits")

        # Validate full name
        name_valid, name_error = _validate_full_name(full_name)
        if not name_valid:
            errors.append(name_error)

        # Validate role
        if role not in valid_roles:
            errors.append(f"Invalid role. Must be one of: {', '.join(valid_roles)}")

        # Validate specialization (required for non-admin)
        if role != 'admin':
            if specialization not in valid_specializations:
                errors.append(f"Invalid specialization. Must be one of: {', '.join(valid_specializations)}")
        else:
            specialization = None  # Admin doesn't need specialization

        # Validate email format
        if email and not re.match(r'^[^@]+@[^@]+\.[^@]+$', email):
            errors.append("Invalid email format")

        if errors:
            results['failed'].append({
                'row': row_num,
                'sap_id': sap_id,
                'full_name': full_name,
                'errors': errors
            })
            continue

        # Check if user exists by SAP ID
        existing_user = User.query.filter_by(sap_id=sap_id).first()

        if existing_user:
            # Check for conflicts (cannot update immutable fields with different values)
            if existing_user.full_name != full_name:
                results['failed'].append({
                    'row': row_num,
                    'sap_id': sap_id,
                    'full_name': full_name,
                    'errors': [f"SAP_ID {sap_id} exists with different name: {existing_user.full_name}"]
                })
                continue

            # Check role change attempt
            if existing_user.role != role:
                results['failed'].append({
                    'row': row_num,
                    'sap_id': sap_id,
                    'full_name': full_name,
                    'errors': ["Role cannot be changed via import. Use role swap feature."]
                })
                continue

            # Update allowed fields
            existing_user.email = email if email else existing_user.email
            existing_user.phone = phone if phone else existing_user.phone
            existing_user.specialization = specialization if specialization else existing_user.specialization

            results['updated'].append({
                'row': row_num,
                'sap_id': sap_id,
                'full_name': full_name
            })
        else:
            # Check for duplicate SAP ID in same import
            if any(r.get('sap_id') == sap_id for r in results['created']):
                results['failed'].append({
                    'row': row_num,
                    'sap_id': sap_id,
                    'full_name': full_name,
                    'errors': ["Duplicate SAP_ID in same import"]
                })
                continue

            # Check for duplicate email
            if email:
                existing_email = User.query.filter_by(email=email).first()
                if existing_email:
                    results['failed'].append({
                        'row': row_num,
                        'sap_id': sap_id,
                        'full_name': full_name,
                        'errors': [f"Email {email} already exists"]
                    })
                    continue

            # Generate username
            username = User.generate_username(full_name)

            # Generate role_id
            role_id = _generate_role_id(role)

            # Generate minor role and minor_role_id
            minor_role = _get_minor_role(role)
            minor_role_id = _generate_role_id(minor_role) if minor_role else None

            # Create new user
            user = User(
                sap_id=sap_id,
                email=email if email else None,
                username=username,
                full_name=full_name,
                role=role,
                role_id=role_id,
                minor_role=minor_role,
                minor_role_id=minor_role_id,
                phone=phone,
                specialization=specialization,
                must_change_password=True,
                created_by_id=admin_id,
                is_active=True,
                annual_leave_balance=24,
            )
            # Set password to SAP ID
            user.set_password(sap_id)

            db.session.add(user)
            results['created'].append({
                'row': row_num,
                'sap_id': sap_id,
                'full_name': full_name,
                'username': username,
                'role_id': role_id,
                'minor_role_id': minor_role_id
            })

    try:
        safe_commit()
    except IntegrityError as e:
        db.session.rollback()
        raise ValidationError(f"Database error: {str(e)}")

    # Log the import
    import_log = ImportLog(
        import_type='team',
        admin_id=admin_id,
        file_name=file.filename,
        total_rows=len(df),
        created_count=len(results['created']),
        updated_count=len(results['updated']),
        failed_count=len(results['failed']),
        details=json.dumps(results['failed']) if results['failed'] else None
    )
    db.session.add(import_log)
    safe_commit()

    return jsonify({
        'status': 'success',
        'message': f"Import completed: {len(results['created'])} created, {len(results['updated'])} updated, {len(results['failed'])} failed",
        'data': {
            'created': results['created'],
            'updated': results['updated'],
            'failed': results['failed']
        }
    }), 200


@bp.route('/template', methods=['GET'])
@jwt_required()
@admin_required()
def download_team_template():
    """
    Download Excel template for team import.
    Admin only.
    """
    try:
        import pandas as pd
    except ImportError:
        raise ValidationError("pandas library is required")

    # Create template dataframe
    template_data = {
        'SAP_ID': ['123456', '123457', '123458'],
        'full_name': ['Ahmed Mohammed Hassan', 'Sara Ali Ahmed', 'Mohammed Ali'],
        'email': ['ahmed@company.com', 'sara@company.com', 'mohammed@company.com'],
        'role': ['inspector', 'specialist', 'maintenance'],
        'phone': ['+966501234567', '+966507654321', '+966509876543'],
        'specialization': ['mechanical', 'electrical', '']
    }
    df = pd.DataFrame(template_data)

    # Create Excel file in memory
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Team Import')
    output.seek(0)

    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name='team_import_template.xlsx'
    )


@bp.route('/import-history', methods=['GET'])
@jwt_required()
@admin_required()
def get_import_history():
    """
    Get team import history.
    Admin only.
    """
    logs = ImportLog.query.filter_by(import_type='team').order_by(ImportLog.created_at.desc()).limit(50).all()
    return jsonify({
        'status': 'success',
        'data': [log.to_dict() for log in logs]
    }), 200


# ============================================================
# ROLE SWAP ENDPOINTS
# ============================================================

@bp.route('/<int:user_id>/swap-roles', methods=['POST'])
@jwt_required()
@admin_required()
def swap_roles(user_id):
    """
    Swap major and minor roles for a user.
    Admin only.

    Swaps the major role with the minor role.
    Logs the change in role_swap_logs.
    """
    from app.models import SpecialistJob, Inspection, InspectionAssignment

    user = db.session.get(User, user_id)
    if not user:
        raise NotFoundError(f"User with ID {user_id} not found")

    if not user.minor_role or not user.minor_role_id:
        raise ValidationError("User has no minor role to swap with")

    admin_id = int(get_jwt_identity())

    # Check for active assignments
    warnings = []

    # Check for active inspections if user is inspector
    if user.role == 'inspector':
        active_assignments = InspectionAssignment.query.filter(
            db.or_(
                InspectionAssignment.mechanical_inspector_id == user_id,
                InspectionAssignment.electrical_inspector_id == user_id
            ),
            InspectionAssignment.status.in_(['assigned', 'in_progress'])
        ).count()
        if active_assignments > 0:
            warnings.append(f"User has {active_assignments} active inspection assignments")

    # Check for active specialist jobs if user is specialist
    if user.role == 'specialist':
        active_jobs = SpecialistJob.query.filter(
            SpecialistJob.specialist_id == user_id,
            SpecialistJob.status.in_(['assigned', 'in_progress'])
        ).count()
        if active_jobs > 0:
            warnings.append(f"User has {active_jobs} active specialist jobs")

    # Log the swap before making changes
    swap_log = RoleSwapLog(
        user_id=user_id,
        admin_id=admin_id,
        old_role=user.role,
        old_role_id=user.role_id,
        old_minor_role=user.minor_role,
        old_minor_role_id=user.minor_role_id,
        new_role=user.minor_role,
        new_role_id=user.minor_role_id,
        new_minor_role=user.role,
        new_minor_role_id=user.role_id
    )
    db.session.add(swap_log)

    # Perform the swap
    old_role = user.role
    old_role_id = user.role_id
    user.role = user.minor_role
    user.role_id = user.minor_role_id
    user.minor_role = old_role
    user.minor_role_id = old_role_id

    safe_commit()

    return jsonify({
        'status': 'success',
        'message': f"Roles swapped: {old_role} -> {user.role}",
        'warnings': warnings if warnings else None,
        'user': user.to_dict()
    }), 200


@bp.route('/<int:user_id>/swap-history', methods=['GET'])
@jwt_required()
@admin_required()
def get_swap_history(user_id):
    """
    Get role swap history for a user.
    Admin only.
    """
    logs = RoleSwapLog.query.filter_by(user_id=user_id).order_by(RoleSwapLog.created_at.desc()).all()
    return jsonify({
        'status': 'success',
        'data': [log.to_dict() for log in logs]
    }), 200