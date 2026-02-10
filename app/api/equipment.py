"""
Equipment management endpoints.
Includes equipment import, template download, and import history features.
"""

import json
import io
import re
import logging
import traceback
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.exc import IntegrityError
from app.models import (
    Equipment, ImportLog, EquipmentStatusLog, User, Inspection, Defect,
    EquipmentWatch, EquipmentNote, EquipmentCertification
)
from app.services.equipment_notification_service import EquipmentNotificationService
from app.extensions import db, safe_commit
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from app.utils.decorators import get_current_user, admin_required, get_language
from app.utils.pagination import paginate

logger = logging.getLogger(__name__)

bp = Blueprint('equipment', __name__)

# Valid berth values
VALID_BERTHS = ['east', 'west', 'both']


@bp.route('', methods=['GET'])
@jwt_required()
def list_equipment():
    """
    List equipment. Filtered by role.
    - Technicians see only assigned equipment
    - Admins see all

    Returns:
        {
            "status": "success",
            "equipment": [...]
        }
    """
    current_user = get_current_user()

    query = Equipment.query

    # Filter by role
    if current_user.role == 'technician':
        query = query.filter_by(assigned_technician_id=current_user.id)

    # Filter by status
    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)

    # Filter by equipment type
    equipment_type = request.args.get('equipment_type')
    if equipment_type:
        query = query.filter_by(equipment_type=equipment_type)

    # Search by name, serial number, or location
    search = request.args.get('search')
    if search:
        search_term = f'%{search}%'
        query = query.filter(
            db.or_(
                Equipment.name.ilike(search_term),
                Equipment.serial_number.ilike(search_term),
                Equipment.location.ilike(search_term)
            )
        )

    query = query.order_by(Equipment.name)
    items, pagination = paginate(query)
    lang = get_language(current_user)

    return jsonify({
        'status': 'success',
        'data': [eq.to_dict(language=lang) for eq in items],
        'pagination': pagination
    }), 200


@bp.route('/types', methods=['GET'])
@jwt_required()
def get_equipment_types():
    """Return distinct equipment types."""
    rows = db.session.query(Equipment.equipment_type).distinct().order_by(Equipment.equipment_type).all()
    types = [r[0] for r in rows if r[0]]
    return jsonify({'status': 'success', 'data': types}), 200


@bp.route('/<int:equipment_id>', methods=['GET'])
@jwt_required()
def get_equipment(equipment_id):
    """
    Get equipment details.
    
    Returns:
        {
            "status": "success",
            "equipment": {...}
        }
    """
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")
    
    lang = get_language()

    return jsonify({
        'status': 'success',
        'equipment': equipment.to_dict(language=lang)
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
@admin_required()
def create_equipment():
    """
    Create new equipment. Admin only.

    Required fields:
    - name, name_ar, serial_number, manufacturer, model_number, installation_date,
      equipment_type_2, capacity, berth, home_berth

    Auto-generated fields:
    - equipment_type: extracted from name (letters only, uppercase)
    - created_by_id: current admin

    Returns:
        {
            "status": "success",
            "equipment": {...}
        }
    """
    data = request.get_json()

    required_fields = [
        'name', 'name_ar', 'serial_number', 'manufacturer', 'model_number',
        'installation_date', 'equipment_type_2', 'capacity', 'berth', 'home_berth'
    ]
    for field in required_fields:
        if field not in data or not data[field]:
            raise ValidationError(f"{field} is required")

    # Validate berth values
    berth = str(data['berth']).strip().lower()
    if berth not in VALID_BERTHS:
        raise ValidationError(f"berth must be 'east', 'west', or 'both', got: {data['berth']}")

    home_berth = str(data['home_berth']).strip().lower()
    if home_berth not in VALID_BERTHS:
        raise ValidationError(f"home_berth must be 'east', 'west', or 'both', got: {data['home_berth']}")

    # Check for duplicate serial_number
    if Equipment.query.filter_by(serial_number=data['serial_number']).first():
        raise ValidationError(f"Equipment with serial_number '{data['serial_number']}' already exists")

    # Auto-generate equipment_type from name
    equipment_type = Equipment.generate_equipment_type(data['name'])

    # Parse installation_date
    installation_date = _parse_date(data['installation_date'])
    if not installation_date:
        raise ValidationError("installation_date must be a valid date")

    admin_id = int(get_jwt_identity())

    equipment = Equipment(
        name=data['name'],
        name_ar=data['name_ar'],
        equipment_type=equipment_type,
        equipment_type_2=data['equipment_type_2'],
        equipment_type_ar=data.get('equipment_type_ar'),
        serial_number=data['serial_number'],
        manufacturer=data['manufacturer'],
        model_number=data['model_number'],
        installation_date=installation_date,
        capacity=data['capacity'],
        location=data.get('location'),
        location_ar=data.get('location_ar'),
        berth=berth,
        home_berth=home_berth,
        status=data.get('status', 'active'),
        is_scrapped=False,
        assigned_technician_id=data.get('assigned_technician_id'),
        created_by_id=admin_id
    )

    db.session.add(equipment)
    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Equipment created',
        'equipment': equipment.to_dict()
    }), 201


# ============================================================
# EQUIPMENT IMPORT ENDPOINTS
# ============================================================

def _parse_date(date_value):
    """Parse various date formats to date object."""
    if not date_value:
        return None
    if isinstance(date_value, datetime):
        return date_value.date()
    if hasattr(date_value, 'date'):  # pandas Timestamp
        return date_value.date()

    date_str = str(date_value).strip()
    if not date_str:
        return None

    # Try various date formats
    formats = ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y', '%Y/%m/%d']
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None


def _validate_berth(berth):
    """Validate berth value is east or west."""
    if not berth:
        return False, "Berth is required"
    berth_lower = str(berth).strip().lower()
    if berth_lower not in VALID_BERTHS:
        return False, f"Berth must be 'east', 'west', or 'both', got: {berth}"
    return True, berth_lower


@bp.route('/import', methods=['POST'])
@jwt_required()
@admin_required()
def import_equipment():
    """
    Import equipment from Excel file.
    Admin only.

    Expected Excel columns (ALL REQUIRED):
    - name (English name)
    - name_ar (Arabic name)
    - serial_number (unique identifier)
    - manufacturer
    - model_number
    - installation_date
    - equipment_type_2 (user-provided type description)
    - capacity (e.g., "50 tons")
    - berth (east or west)
    - home_berth (east or west)

    Auto-generated fields:
    - equipment_type: extracted from name (letters only, uppercase)
    - created_by_id: current admin
    - is_scrapped: defaults to false (can only be changed in app)

    Immutable fields (cannot be updated via import):
    - name, equipment_type, serial_number, manufacturer, model_number, installation_date, name_ar
    """
    logger.info("Equipment import started")
    try:
        import pandas as pd
    except ImportError:
        logger.error("pandas not installed")
        raise ValidationError("pandas library is required for Excel import")

    try:
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

        required_columns = [
            'name', 'name_ar', 'serial_number', 'manufacturer', 'model_number',
            'installation_date', 'equipment_type_2', 'capacity', 'berth', 'home_berth'
        ]
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise ValidationError(f"Missing required columns: {', '.join(missing_columns)}")

        results = {
            'created': [],
            'updated': [],
            'failed': []
        }

        # Immutable fields that cannot be changed via import
        immutable_fields = ['name', 'name_ar', 'serial_number', 'manufacturer', 'model_number', 'installation_date']

        for idx, row in df.iterrows():
            row_num = idx + 2  # Excel row number (1-indexed + header)
            errors = []

            # Extract data
            name = str(row.get('name', '')).strip()
            name_ar = str(row.get('name_ar', '')).strip()
            serial_number = str(row.get('serial_number', '')).strip()
            manufacturer = str(row.get('manufacturer', '')).strip()
            model_number = str(row.get('model_number', '')).strip()
            installation_date = row.get('installation_date')
            equipment_type_2 = str(row.get('equipment_type_2', '')).strip()
            capacity = str(row.get('capacity', '')).strip()
            berth = row.get('berth')
            home_berth = row.get('home_berth')

            # Skip empty rows
            if not name and not serial_number:
                continue

            # Validate required fields
            if not name:
                errors.append("name is required")
            if not name_ar:
                errors.append("name_ar is required")
            if not serial_number:
                errors.append("serial_number is required")
            if not manufacturer:
                errors.append("manufacturer is required")
            if not model_number:
                errors.append("model_number is required")
            if not equipment_type_2:
                errors.append("equipment_type_2 is required")
            if not capacity:
                errors.append("capacity is required")

            # Validate and parse installation_date
            parsed_date = _parse_date(installation_date)
            if not parsed_date:
                errors.append("installation_date is required and must be a valid date")

            # Validate berth
            berth_valid, berth_result = _validate_berth(berth)
            if not berth_valid:
                errors.append(berth_result)
            else:
                berth = berth_result

            # Validate home_berth
            home_berth_valid, home_berth_result = _validate_berth(home_berth)
            if not home_berth_valid:
                errors.append(home_berth_result)
            else:
                home_berth = home_berth_result

            if errors:
                results['failed'].append({
                    'row': row_num,
                    'serial_number': serial_number,
                    'name': name,
                    'errors': errors
                })
                continue

            # Auto-generate equipment_type from name
            equipment_type = Equipment.generate_equipment_type(name)

            # Check if equipment exists by serial_number
            existing_equipment = Equipment.query.filter_by(serial_number=serial_number).first()

            if existing_equipment:
                # Check for immutable field conflicts
                immutable_conflicts = []
                if existing_equipment.name != name:
                    immutable_conflicts.append(f"name (existing: {existing_equipment.name})")
                if existing_equipment.name_ar != name_ar:
                    immutable_conflicts.append(f"name_ar (existing: {existing_equipment.name_ar})")
                if existing_equipment.manufacturer != manufacturer:
                    immutable_conflicts.append(f"manufacturer (existing: {existing_equipment.manufacturer})")
                if existing_equipment.model_number != model_number:
                    immutable_conflicts.append(f"model_number (existing: {existing_equipment.model_number})")
                if existing_equipment.installation_date != parsed_date:
                    immutable_conflicts.append(f"installation_date (existing: {existing_equipment.installation_date})")

                if immutable_conflicts:
                    results['failed'].append({
                        'row': row_num,
                        'serial_number': serial_number,
                        'name': name,
                        'errors': [f"Cannot update immutable fields: {', '.join(immutable_conflicts)}"]
                    })
                    continue

                # Update allowed (mutable) fields
                existing_equipment.equipment_type_2 = equipment_type_2
                existing_equipment.capacity = capacity
                existing_equipment.berth = berth
                existing_equipment.home_berth = home_berth

                results['updated'].append({
                    'row': row_num,
                    'serial_number': serial_number,
                    'name': name,
                    'equipment_type': equipment_type
                })
            else:
                # Check for duplicate serial_number in same import
                if any(r.get('serial_number') == serial_number for r in results['created']):
                    results['failed'].append({
                        'row': row_num,
                        'serial_number': serial_number,
                        'name': name,
                        'errors': ["Duplicate serial_number in same import"]
                    })
                    continue

                # Create new equipment
                equipment = Equipment(
                    name=name,
                    name_ar=name_ar,
                    equipment_type=equipment_type,
                    equipment_type_2=equipment_type_2,
                    serial_number=serial_number,
                    manufacturer=manufacturer,
                    model_number=model_number,
                    installation_date=parsed_date,
                    capacity=capacity,
                    berth=berth,
                    home_berth=home_berth,
                    status='active',
                    is_scrapped=False,
                    created_by_id=admin_id
                )
                db.session.add(equipment)
                results['created'].append({
                    'row': row_num,
                    'serial_number': serial_number,
                    'name': name,
                    'equipment_type': equipment_type
                })

        try:
            safe_commit()
        except IntegrityError as e:
            db.session.rollback()
            raise ValidationError(f"Database error: {str(e)}")

        # Log the import
        import_log = ImportLog(
            import_type='equipment',
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

        logger.info(f"Equipment import completed: {len(results['created'])} created, {len(results['updated'])} updated, {len(results['failed'])} failed")
        return jsonify({
            'status': 'success',
            'message': f"Import completed: {len(results['created'])} created, {len(results['updated'])} updated, {len(results['failed'])} failed",
            'data': {
                'created': results['created'],
                'updated': results['updated'],
                'failed': results['failed']
            }
        }), 200

    except ValidationError:
        raise
    except Exception as e:
        db.session.rollback()
        logger.error(f"Equipment import failed with unexpected error: {str(e)}\n{traceback.format_exc()}")
        raise ValidationError(f"Import failed: {str(e)}")


@bp.route('/template', methods=['GET'])
@jwt_required()
@admin_required()
def download_equipment_template():
    """
    Download Excel template for equipment import.
    Admin only.
    """
    try:
        import pandas as pd
    except ImportError:
        raise ValidationError("pandas library is required")

    # Create template dataframe with example data
    template_data = {
        'name': ['Crane01', 'Forklift-A'],
        'name_ar': ['رافعة 01', 'رافعة شوكية أ'],
        'serial_number': ['CR-2024-001', 'FL-2024-001'],
        'manufacturer': ['Liebherr', 'Toyota'],
        'model_number': ['LHM 550', 'THD2500'],
        'installation_date': ['2024-01-15', '2024-02-20'],
        'equipment_type_2': ['Mobile Harbor Crane', 'Electric Forklift'],
        'capacity': ['144 tons', '2.5 tons'],
        'berth': ['east', 'both'],
        'home_berth': ['west', 'both']
    }
    df = pd.DataFrame(template_data)

    # Create Excel file in memory
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Equipment Import')
    output.seek(0)

    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name='equipment_import_template.xlsx'
    )


@bp.route('/import-history', methods=['GET'])
@jwt_required()
@admin_required()
def get_equipment_import_history():
    """
    Get equipment import history.
    Admin only.
    """
    logs = ImportLog.query.filter_by(import_type='equipment').order_by(ImportLog.created_at.desc()).limit(50).all()
    return jsonify({
        'status': 'success',
        'data': [log.to_dict() for log in logs]
    }), 200


@bp.route('/<int:equipment_id>', methods=['PUT'])
@jwt_required()
@admin_required()
def update_equipment(equipment_id):
    """
    Update equipment. Admin only.

    Immutable fields (cannot be changed):
    - name, name_ar, equipment_type, serial_number, manufacturer, model_number, installation_date

    Mutable fields:
    - equipment_type_2, capacity, berth, home_berth, location, location_ar, status,
      assigned_technician_id, is_scrapped

    Returns:
        {
            "status": "success",
            "equipment": {...}
        }
    """
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    data = request.get_json()

    # Check for attempts to update immutable fields
    immutable_fields = ['name', 'name_ar', 'equipment_type', 'serial_number',
                        'manufacturer', 'model_number', 'installation_date']
    attempted_immutable = [f for f in immutable_fields if f in data]
    if attempted_immutable:
        raise ValidationError(f"Cannot update immutable fields: {', '.join(attempted_immutable)}")

    # Update mutable fields if provided
    if 'equipment_type_2' in data:
        equipment.equipment_type_2 = data['equipment_type_2']
    if 'equipment_type_ar' in data:
        equipment.equipment_type_ar = data['equipment_type_ar']
    if 'capacity' in data:
        equipment.capacity = data['capacity']
    if 'location' in data:
        equipment.location = data['location']
    if 'location_ar' in data:
        equipment.location_ar = data['location_ar']
    if 'berth' in data:
        berth = str(data['berth']).strip().lower()
        if berth not in VALID_BERTHS:
            raise ValidationError(f"berth must be 'east', 'west', or 'both', got: {data['berth']}")
        equipment.berth = berth
    if 'home_berth' in data:
        home_berth = str(data['home_berth']).strip().lower()
        if home_berth not in VALID_BERTHS:
            raise ValidationError(f"home_berth must be 'east', 'west', or 'both', got: {data['home_berth']}")
        equipment.home_berth = home_berth
    if 'status' in data:
        equipment.status = data['status']
    if 'assigned_technician_id' in data:
        equipment.assigned_technician_id = data['assigned_technician_id']
    if 'is_scrapped' in data:
        equipment.is_scrapped = data['is_scrapped']

    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Equipment updated',
        'equipment': equipment.to_dict()
    }), 200


@bp.route('/<int:equipment_id>', methods=['DELETE'])
@jwt_required()
@admin_required()
def delete_equipment(equipment_id):
    """
    Delete equipment. Admin only.
    
    Returns:
        {
            "status": "success",
            "message": "Equipment deleted"
        }
    """
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    # Soft-delete: mark as out_of_service instead of hard-deleting
    # This preserves FK references from inspections, defects, jobs, and assignments
    equipment.status = 'out_of_service'
    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Equipment decommissioned'
    }), 200


# ============================================================
# EQUIPMENT DASHBOARD ENDPOINTS
# ============================================================

def get_status_color(status):
    """Map equipment status to color category."""
    if status == 'active':
        return 'green'
    elif status in ('under_maintenance', 'paused'):
        return 'yellow'
    else:  # stopped, out_of_service
        return 'red'


@bp.route('/dashboard', methods=['GET'])
@jwt_required()
def get_equipment_dashboard():
    """
    Get equipment dashboard data grouped by equipment_type and berth.
    Accessible to all authenticated users.

    Query params:
        - status_color: 'green', 'yellow', 'red' (filter by color)
        - berth: 'east', 'west', 'both' (filter by berth)

    Returns grouped equipment with status colors and days stopped.
    """
    lang = get_language()

    # Filters
    status_color_filter = request.args.get('status_color')
    berth_filter = request.args.get('berth')

    # Query all non-scrapped equipment
    query = Equipment.query.filter_by(is_scrapped=False)

    # Apply berth filter
    if berth_filter:
        query = query.filter_by(berth=berth_filter)

    # Get all equipment
    all_equipment = query.order_by(Equipment.equipment_type, Equipment.berth, Equipment.name).all()

    # Filter by status color if specified
    if status_color_filter:
        all_equipment = [e for e in all_equipment if get_status_color(e.status) == status_color_filter]

    # Group by equipment_type and berth
    grouped = {}
    status_counts = {'green': 0, 'yellow': 0, 'red': 0}

    for eq in all_equipment:
        color = get_status_color(eq.status)
        status_counts[color] += 1

        key = f"{eq.equipment_type}|{eq.berth or 'unassigned'}"
        if key not in grouped:
            grouped[key] = {
                'equipment_type': eq.equipment_type,
                'berth': eq.berth,
                'equipment': []
            }

        # Calculate days stopped
        days_stopped = None
        if eq.stopped_at and eq.status in ('stopped', 'out_of_service'):
            days_stopped = (datetime.utcnow() - eq.stopped_at).days

        grouped[key]['equipment'].append({
            'id': eq.id,
            'name': eq.name,
            'name_ar': eq.name_ar,
            'status': eq.status,
            'status_color': color,
            'days_stopped': days_stopped,
        })

    return jsonify({
        'status': 'success',
        'data': {
            'summary': status_counts,
            'groups': list(grouped.values()),
            'berths': ['east', 'west', 'both'],
        }
    }), 200


@bp.route('/<int:equipment_id>/details', methods=['GET'])
@jwt_required()
def get_equipment_details(equipment_id):
    """
    Get full equipment details for dashboard popup.
    Includes status source from workflow (inspections, defects).
    """
    lang = get_language()

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    # Get equipment data
    eq_data = equipment.to_dict(language=lang)

    # Get latest status log
    latest_log = EquipmentStatusLog.query.filter_by(equipment_id=equipment_id).order_by(
        EquipmentStatusLog.created_at.desc()
    ).first()

    if latest_log:
        eq_data['latest_status_change'] = latest_log.to_dict()
    else:
        eq_data['latest_status_change'] = None

    # Get status sources from workflow
    status_sources = []

    # Check for failed inspections
    failed_inspections = Inspection.query.filter_by(
        equipment_id=equipment_id,
        result='fail'
    ).order_by(Inspection.submitted_at.desc()).limit(3).all()

    for insp in failed_inspections:
        technician_name = insp.technician.full_name if insp.technician else 'Unknown'
        technician_role_id = insp.technician.role_id if insp.technician else ''
        status_sources.append({
            'type': 'inspection',
            'id': insp.id,
            'message': f"Failed inspection by {technician_role_id} - {technician_name}",
            'date': insp.submitted_at.isoformat() if insp.submitted_at else None,
        })

    # Check for open defects
    open_defects = Defect.query.filter_by(equipment_id=equipment_id).filter(
        Defect.status.in_(['open', 'in_progress'])
    ).order_by(Defect.created_at.desc()).limit(3).all()

    for defect in open_defects:
        status_sources.append({
            'type': 'defect',
            'id': defect.id,
            'message': f"Defect #{defect.id}: {defect.description[:50] if defect.description else 'No description'}...",
            'date': defect.created_at.isoformat() if defect.created_at else None,
        })

    eq_data['status_sources'] = status_sources

    return jsonify({
        'status': 'success',
        'data': eq_data
    }), 200


@bp.route('/<int:equipment_id>/status', methods=['PUT'])
@jwt_required()
def update_equipment_status(equipment_id):
    """
    Update equipment status with mandatory reason and next action.
    Admin and Engineer only.

    Request Body:
        {
            "status": "stopped",
            "reason": "Motor failure - bearing damage",
            "next_action": "Waiting for spare parts from supplier"
        }
    """
    current_user = get_current_user()
    if current_user.role not in ('admin', 'engineer'):
        return jsonify({
            'status': 'error',
            'message': 'Only admin and engineer can update equipment status'
        }), 403

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    data = request.get_json()

    # Validate required fields
    new_status = data.get('status')
    reason = data.get('reason', '').strip()
    next_action = data.get('next_action', '').strip()

    if not new_status:
        raise ValidationError("status is required")
    if not reason:
        raise ValidationError("reason is required")
    if not next_action:
        raise ValidationError("next_action is required")

    valid_statuses = ['active', 'under_maintenance', 'out_of_service', 'stopped', 'paused']
    if new_status not in valid_statuses:
        raise ValidationError(f"status must be one of: {', '.join(valid_statuses)}")

    old_status = equipment.status

    # Create status log
    status_log = EquipmentStatusLog(
        equipment_id=equipment_id,
        old_status=old_status,
        new_status=new_status,
        reason=reason,
        next_action=next_action,
        source_type='manual',
        changed_by_id=current_user.id
    )
    db.session.add(status_log)

    # Update equipment
    equipment.status = new_status
    equipment.current_reason = reason
    equipment.current_next_action = next_action

    # Update stopped_at
    if new_status in ('stopped', 'out_of_service'):
        if old_status not in ('stopped', 'out_of_service'):
            # Just became stopped
            equipment.stopped_at = datetime.utcnow()
    else:
        # No longer stopped
        equipment.stopped_at = None

    safe_commit()

    return jsonify({
        'status': 'success',
        'message': f'Equipment status updated to {new_status}',
        'equipment': equipment.to_dict()
    }), 200


@bp.route('/<int:equipment_id>/status-history', methods=['GET'])
@jwt_required()
def get_equipment_status_history(equipment_id):
    """
    Get status change history for equipment.
    """
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    # Get all status logs
    logs = EquipmentStatusLog.query.filter_by(equipment_id=equipment_id).order_by(
        EquipmentStatusLog.created_at.desc()
    ).limit(50).all()

    return jsonify({
        'status': 'success',
        'data': [log.to_dict() for log in logs]
    }), 200


# ============================================================
# EQUIPMENT AI ENDPOINTS
# ============================================================

@bp.route('/<int:equipment_id>/ai/risk-score', methods=['GET'])
@jwt_required()
def get_equipment_risk_score(equipment_id):
    """
    Get AI-calculated risk score for equipment.

    Returns risk score 0-100 with contributing factors.
    """
    from app.services.equipment_ai_service import EquipmentAIService

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    result = EquipmentAIService.calculate_risk_score(equipment_id)

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/<int:equipment_id>/ai/predict-failure', methods=['GET'])
@jwt_required()
def get_equipment_failure_prediction(equipment_id):
    """
    Get AI failure prediction for equipment.

    Returns failure probability and recommended maintenance.
    """
    from app.services.equipment_ai_service import EquipmentAIService

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    result = EquipmentAIService.predict_failure(equipment_id)

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/<int:equipment_id>/ai/anomalies', methods=['GET'])
@jwt_required()
def get_equipment_anomalies(equipment_id):
    """
    Detect anomalies in equipment behavior.

    Returns detected anomalies with severity levels.
    """
    from app.services.equipment_ai_service import EquipmentAIService

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    result = EquipmentAIService.detect_anomalies(equipment_id)

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/<int:equipment_id>/ai/similar', methods=['GET'])
@jwt_required()
def get_similar_equipment(equipment_id):
    """
    Find equipment similar to the specified equipment.

    Returns similar equipment with similarity scores and warnings.
    """
    from app.services.equipment_ai_service import EquipmentAIService

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    result = EquipmentAIService.find_similar_equipment(equipment_id)

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/<int:equipment_id>/ai/summary', methods=['GET'])
@jwt_required()
def get_equipment_ai_summary(equipment_id):
    """
    Generate AI summary of equipment status and health.

    Returns comprehensive summary with metrics and recommendations.
    """
    from app.services.equipment_ai_service import EquipmentAIService

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    result = EquipmentAIService.generate_summary(equipment_id)

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/<int:equipment_id>/ai/recommendations', methods=['GET'])
@jwt_required()
def get_equipment_recommendations(equipment_id):
    """
    Get AI-powered recommendations for equipment.

    Returns prioritized recommendations for maintenance and risk mitigation.
    """
    from app.services.equipment_ai_service import EquipmentAIService

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    result = EquipmentAIService.get_recommendations(equipment_id)

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/<int:equipment_id>/ai/ask', methods=['POST'])
@jwt_required()
def ask_equipment_assistant(equipment_id):
    """
    Ask AI assistant about equipment.

    Request Body:
        { "question": "Why did this equipment stop?" }

    Returns AI-generated answer with sources and confidence.
    """
    from app.services.equipment_ai_service import EquipmentAIService

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    data = request.get_json()
    question = data.get('question', '').strip()

    if not question:
        raise ValidationError("question is required")

    result = EquipmentAIService.ask_assistant(equipment_id, question)

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/ai/search', methods=['POST'])
@jwt_required()
def search_equipment_natural():
    """
    Search equipment using natural language query.

    Request Body:
        { "query": "cranes that stopped last week" }

    Returns parsed filters and matching equipment.
    """
    from app.services.equipment_ai_service import EquipmentAIService

    data = request.get_json()
    query = data.get('query', '').strip()

    if not query:
        raise ValidationError("query is required")

    # Parse the natural language query
    parsed = EquipmentAIService.parse_natural_query(query)

    # Build equipment query based on parsed filters
    filters = parsed.get('filters', {})
    eq_query = Equipment.query.filter_by(is_scrapped=False)

    if filters.get('equipment_type'):
        eq_query = eq_query.filter(Equipment.equipment_type == filters['equipment_type'])

    if filters.get('status'):
        eq_query = eq_query.filter(Equipment.status == filters['status'])

    if filters.get('berth'):
        eq_query = eq_query.filter(Equipment.berth == filters['berth'])

    if filters.get('risk_level'):
        # Filter by risk level
        risk_ranges = {
            'low': (0, 25),
            'medium': (25, 50),
            'high': (50, 75),
            'critical': (75, 100)
        }
        if filters['risk_level'] in risk_ranges:
            low, high = risk_ranges[filters['risk_level']]
            eq_query = eq_query.filter(
                Equipment.last_risk_score >= low,
                Equipment.last_risk_score < high
            )

    if filters.get('period'):
        # Filter by status change period
        from datetime import datetime, timedelta
        now = datetime.utcnow()

        period_map = {
            'today': timedelta(days=1),
            'yesterday': timedelta(days=2),
            'last_week': timedelta(days=7),
            'this_week': timedelta(days=7),
            'last_month': timedelta(days=30),
            'this_month': timedelta(days=30)
        }

        if filters['period'] in period_map:
            cutoff = now - period_map[filters['period']]
            # Get equipment with status changes in this period
            equipment_ids_with_changes = db.session.query(EquipmentStatusLog.equipment_id).filter(
                EquipmentStatusLog.created_at >= cutoff
            ).distinct().all()
            ids = [id[0] for id in equipment_ids_with_changes]
            if ids:
                eq_query = eq_query.filter(Equipment.id.in_(ids))

    # Apply sorting
    sort_info = parsed.get('sort', {})
    if sort_info.get('field') == 'installation_date':
        if sort_info.get('order') == 'asc':
            eq_query = eq_query.order_by(Equipment.installation_date.asc())
        else:
            eq_query = eq_query.order_by(Equipment.installation_date.desc())
    elif sort_info.get('field') == 'days_stopped':
        eq_query = eq_query.order_by(Equipment.stopped_at.asc())
    else:
        eq_query = eq_query.order_by(Equipment.name)

    # Get results
    lang = get_language()
    equipment_list = eq_query.limit(50).all()

    return jsonify({
        'status': 'success',
        'data': {
            'parsed_query': parsed,
            'results': [eq.to_dict(language=lang) for eq in equipment_list],
            'count': len(equipment_list)
        }
    }), 200


@bp.route('/ai/failure-patterns', methods=['GET'])
@jwt_required()
def get_failure_patterns():
    """
    Analyze failure patterns across equipment.

    Query params:
        - equipment_type: Filter by equipment type (optional)

    Returns pattern analysis including common failure reasons.
    """
    from app.services.equipment_ai_service import EquipmentAIService

    equipment_type = request.args.get('equipment_type')

    result = EquipmentAIService.analyze_failure_patterns(equipment_type)

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/ai/fleet-health', methods=['GET'])
@jwt_required()
def get_fleet_health():
    """
    Get overall fleet health summary.

    Returns fleet-wide health metrics and high-risk equipment list.
    """
    from app.services.equipment_ai_service import EquipmentAIService

    result = EquipmentAIService.get_fleet_health_summary()

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/ai/anomalies', methods=['GET'])
@jwt_required()
def get_all_anomalies():
    """
    Detect anomalies across all equipment.

    Returns all detected anomalies sorted by severity.
    """
    from app.services.equipment_ai_service import EquipmentAIService

    # Get anomalies for all equipment
    all_equipment = Equipment.query.filter_by(is_scrapped=False).all()
    all_anomalies = []

    for eq in all_equipment:
        result = EquipmentAIService.detect_anomalies(eq.id)
        if isinstance(result, dict) and result.get('anomalies'):
            for anomaly in result['anomalies']:
                anomaly['equipment_id'] = eq.id
                anomaly['equipment_name'] = eq.name
                all_anomalies.append(anomaly)

    # Sort by severity
    severity_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
    all_anomalies.sort(key=lambda x: severity_order.get(x.get('severity', 'low'), 3))

    return jsonify({
        'status': 'success',
        'data': {
            'anomalies': all_anomalies,
            'count': len(all_anomalies),
            'by_severity': {
                'critical': sum(1 for a in all_anomalies if a.get('severity') == 'critical'),
                'high': sum(1 for a in all_anomalies if a.get('severity') == 'high'),
                'medium': sum(1 for a in all_anomalies if a.get('severity') == 'medium'),
                'low': sum(1 for a in all_anomalies if a.get('severity') == 'low')
            }
        }
    }), 200


# ============================================================
# COST CALCULATOR ENDPOINTS
# ============================================================

@bp.route('/<int:equipment_id>/costs', methods=['GET'])
@jwt_required()
def get_equipment_costs(equipment_id):
    """
    Calculate equipment costs including downtime costs and maintenance costs.

    Returns:
        {
            total_downtime_hours: float,
            total_downtime_cost: float (hours * hourly_rate),
            maintenance_costs: float,
            cost_trend: [...],  # Monthly costs
            cost_per_defect: float
        }
    """
    from sqlalchemy import func, extract
    from datetime import datetime as dt, timedelta
    from dateutil.relativedelta import relativedelta

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    hourly_cost = float(equipment.hourly_cost) if equipment.hourly_cost else 0

    # Calculate total downtime from status logs
    total_downtime_hours = 0
    status_logs = EquipmentStatusLog.query.filter_by(equipment_id=equipment_id).order_by(
        EquipmentStatusLog.created_at.asc()
    ).all()

    # Calculate downtime periods
    downtime_statuses = ('stopped', 'out_of_service', 'under_maintenance')
    downtime_start = None

    for log in status_logs:
        if log.new_status in downtime_statuses and downtime_start is None:
            downtime_start = log.created_at
        elif log.new_status not in downtime_statuses and downtime_start is not None:
            # Calculate this downtime period
            downtime_end = log.created_at
            hours = (downtime_end - downtime_start).total_seconds() / 3600
            total_downtime_hours += hours
            downtime_start = None

    # If still in downtime
    if downtime_start is not None:
        hours = (dt.utcnow() - downtime_start).total_seconds() / 3600
        total_downtime_hours += hours

    # Calculate costs
    total_downtime_cost = total_downtime_hours * hourly_cost

    # Get defect count
    defect_count = Defect.query.filter_by(equipment_id=equipment_id).count()
    cost_per_defect = total_downtime_cost / defect_count if defect_count > 0 else 0

    # Calculate monthly cost trend (last 6 months)
    cost_trend = []
    for i in range(5, -1, -1):
        month_start = dt.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0) - relativedelta(months=i)
        month_end = month_start + relativedelta(months=1)

        # Calculate downtime in this month
        month_downtime = 0
        for log in status_logs:
            if log.created_at >= month_start and log.created_at < month_end:
                if log.new_status in downtime_statuses:
                    # Simple approximation: count hours from log until next log or end of month
                    next_logs = [l for l in status_logs if l.created_at > log.created_at]
                    if next_logs:
                        end_time = min(next_logs[0].created_at, month_end)
                    else:
                        end_time = min(dt.utcnow(), month_end)
                    month_downtime += (end_time - log.created_at).total_seconds() / 3600

        cost_trend.append({
            'month': month_start.strftime('%Y-%m'),
            'month_label': month_start.strftime('%b %Y'),
            'downtime_hours': round(month_downtime, 1),
            'downtime_cost': round(month_downtime * hourly_cost, 2),
        })

    return jsonify({
        'status': 'success',
        'data': {
            'equipment_id': equipment_id,
            'hourly_cost': hourly_cost,
            'total_downtime_hours': round(total_downtime_hours, 1),
            'total_downtime_cost': round(total_downtime_cost, 2),
            'cost_per_defect': round(cost_per_defect, 2),
            'defect_count': defect_count,
            'cost_trend': cost_trend,
        }
    }), 200


@bp.route('/<int:equipment_id>/costs/configure', methods=['PUT'])
@jwt_required()
@admin_required()
def configure_costs(equipment_id):
    """
    Configure cost settings for equipment.
    Admin only.

    Request Body:
        {
            "hourly_cost": 150.00,
            "criticality_level": "high"
        }
    """
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    data = request.get_json()

    if 'hourly_cost' in data:
        try:
            equipment.hourly_cost = float(data['hourly_cost'])
        except (ValueError, TypeError):
            raise ValidationError("hourly_cost must be a valid number")

    if 'criticality_level' in data:
        valid_levels = ['low', 'medium', 'high', 'critical']
        if data['criticality_level'] not in valid_levels:
            raise ValidationError(f"criticality_level must be one of: {', '.join(valid_levels)}")
        equipment.criticality_level = data['criticality_level']

    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Cost configuration updated',
        'equipment': equipment.to_dict()
    }), 200


# ============================================================
# WATCH/SUBSCRIBE ENDPOINTS
# ============================================================

@bp.route('/<int:equipment_id>/watch', methods=['POST', 'DELETE'])
@jwt_required()
def watch_equipment(equipment_id):
    """
    Subscribe (POST) or unsubscribe (DELETE) from equipment notifications.

    POST Request Body (optional):
        {
            "notify_status_change": true,
            "notify_high_risk": true,
            "notify_anomaly": true,
            "notify_maintenance": true
        }
    """
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    user_id = int(get_jwt_identity())

    if request.method == 'POST':
        preferences = request.get_json() if request.is_json else None
        watch = EquipmentNotificationService.add_watcher(equipment_id, user_id, preferences)
        return jsonify({
            'status': 'success',
            'message': 'Now watching equipment',
            'data': watch.to_dict()
        }), 200

    elif request.method == 'DELETE':
        removed = EquipmentNotificationService.remove_watcher(equipment_id, user_id)
        if removed:
            return jsonify({
                'status': 'success',
                'message': 'Stopped watching equipment'
            }), 200
        else:
            return jsonify({
                'status': 'success',
                'message': 'Was not watching this equipment'
            }), 200


@bp.route('/<int:equipment_id>/watch/status', methods=['GET'])
@jwt_required()
def get_watch_status(equipment_id):
    """
    Check if current user is watching this equipment.
    """
    user_id = int(get_jwt_identity())
    watch = EquipmentNotificationService.is_watching(equipment_id, user_id)

    return jsonify({
        'status': 'success',
        'data': {
            'is_watching': watch is not None,
            'watch': watch.to_dict() if watch else None
        }
    }), 200


@bp.route('/<int:equipment_id>/watchers', methods=['GET'])
@jwt_required()
def get_watchers(equipment_id):
    """
    Get list of users watching this equipment.
    Admin/Engineer only.
    """
    current_user = get_current_user()
    if current_user.role not in ('admin', 'engineer'):
        return jsonify({
            'status': 'error',
            'message': 'Only admin and engineer can view watchers'
        }), 403

    watchers = EquipmentNotificationService.get_watchers(equipment_id)

    return jsonify({
        'status': 'success',
        'data': [w.to_dict() for w in watchers]
    }), 200


# ============================================================
# EQUIPMENT NOTES ENDPOINTS
# ============================================================

@bp.route('/<int:equipment_id>/notes', methods=['GET', 'POST'])
@jwt_required()
def equipment_notes(equipment_id):
    """
    GET: Get notes for equipment (pinned notes first).
    POST: Add a new note to equipment.

    POST Request Body:
        {
            "content": "Note content",
            "content_ar": "Arabic content (optional)",
            "is_pinned": false,
            "note_type": "general"  # general, maintenance, safety, technical, warning
        }
    """
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    lang = get_language()

    if request.method == 'GET':
        # Get all notes, pinned first
        notes = EquipmentNote.query.filter_by(equipment_id=equipment_id).order_by(
            EquipmentNote.is_pinned.desc(),
            EquipmentNote.created_at.desc()
        ).all()

        return jsonify({
            'status': 'success',
            'data': [n.to_dict(language=lang) for n in notes]
        }), 200

    elif request.method == 'POST':
        data = request.get_json()

        if not data.get('content'):
            raise ValidationError("content is required")

        note_type = data.get('note_type', 'general')
        valid_types = ['general', 'maintenance', 'safety', 'technical', 'warning']
        if note_type not in valid_types:
            raise ValidationError(f"note_type must be one of: {', '.join(valid_types)}")

        user_id = int(get_jwt_identity())

        note = EquipmentNote(
            equipment_id=equipment_id,
            user_id=user_id,
            content=data['content'],
            content_ar=data.get('content_ar'),
            is_pinned=data.get('is_pinned', False),
            note_type=note_type
        )

        db.session.add(note)
        safe_commit()

        return jsonify({
            'status': 'success',
            'message': 'Note added',
            'data': note.to_dict(language=lang)
        }), 201


@bp.route('/<int:equipment_id>/notes/<int:note_id>', methods=['PUT', 'DELETE'])
@jwt_required()
def manage_note(equipment_id, note_id):
    """
    PUT: Update a note.
    DELETE: Delete a note.

    PUT Request Body:
        {
            "content": "Updated content",
            "is_pinned": true
        }
    """
    note = EquipmentNote.query.filter_by(id=note_id, equipment_id=equipment_id).first()
    if not note:
        raise NotFoundError(f"Note with ID {note_id} not found for equipment {equipment_id}")

    current_user = get_current_user()
    lang = get_language()

    # Only the author or admin can modify notes
    if note.user_id != current_user.id and current_user.role != 'admin':
        return jsonify({
            'status': 'error',
            'message': 'You can only modify your own notes'
        }), 403

    if request.method == 'PUT':
        data = request.get_json()

        if 'content' in data:
            note.content = data['content']
        if 'content_ar' in data:
            note.content_ar = data['content_ar']
        if 'is_pinned' in data:
            note.is_pinned = data['is_pinned']
        if 'note_type' in data:
            valid_types = ['general', 'maintenance', 'safety', 'technical', 'warning']
            if data['note_type'] not in valid_types:
                raise ValidationError(f"note_type must be one of: {', '.join(valid_types)}")
            note.note_type = data['note_type']

        safe_commit()

        return jsonify({
            'status': 'success',
            'message': 'Note updated',
            'data': note.to_dict(language=lang)
        }), 200

    elif request.method == 'DELETE':
        db.session.delete(note)
        safe_commit()

        return jsonify({
            'status': 'success',
            'message': 'Note deleted'
        }), 200


# ============================================================
# CERTIFICATION TRACKING ENDPOINTS
# ============================================================

@bp.route('/<int:equipment_id>/certifications', methods=['GET', 'POST'])
@jwt_required()
def equipment_certifications(equipment_id):
    """
    GET: Get certifications for equipment.
    POST: Add a new certification.

    POST Request Body:
        {
            "name": "Safety Certification",
            "name_ar": "Arabic name (optional)",
            "description": "Description",
            "certification_type": "safety",
            "issuing_authority": "Authority name",
            "certificate_number": "CERT-123",
            "issued_date": "2024-01-15",
            "expiry_date": "2025-01-15",
            "document_url": "https://..."
        }
    """
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    lang = get_language()

    if request.method == 'GET':
        certs = EquipmentCertification.query.filter_by(equipment_id=equipment_id).order_by(
            EquipmentCertification.expiry_date.asc()
        ).all()

        return jsonify({
            'status': 'success',
            'data': [c.to_dict(language=lang) for c in certs]
        }), 200

    elif request.method == 'POST':
        current_user = get_current_user()
        if current_user.role not in ('admin', 'engineer'):
            return jsonify({
                'status': 'error',
                'message': 'Only admin and engineer can add certifications'
            }), 403

        data = request.get_json()

        required_fields = ['name', 'issued_date']
        for field in required_fields:
            if not data.get(field):
                raise ValidationError(f"{field} is required")

        # Parse dates
        issued_date = _parse_date(data['issued_date'])
        if not issued_date:
            raise ValidationError("issued_date must be a valid date")

        expiry_date = None
        if data.get('expiry_date'):
            expiry_date = _parse_date(data['expiry_date'])
            if not expiry_date:
                raise ValidationError("expiry_date must be a valid date")

        cert = EquipmentCertification(
            equipment_id=equipment_id,
            name=data['name'],
            name_ar=data.get('name_ar'),
            description=data.get('description'),
            certification_type=data.get('certification_type'),
            issuing_authority=data.get('issuing_authority'),
            certificate_number=data.get('certificate_number'),
            issued_date=issued_date,
            expiry_date=expiry_date,
            document_url=data.get('document_url'),
            created_by_id=current_user.id
        )

        db.session.add(cert)
        safe_commit()

        return jsonify({
            'status': 'success',
            'message': 'Certification added',
            'data': cert.to_dict(language=lang)
        }), 201


@bp.route('/<int:equipment_id>/certifications/<int:cert_id>', methods=['PUT', 'DELETE'])
@jwt_required()
def manage_certification(equipment_id, cert_id):
    """
    PUT: Update a certification.
    DELETE: Delete a certification.
    """
    current_user = get_current_user()
    if current_user.role not in ('admin', 'engineer'):
        return jsonify({
            'status': 'error',
            'message': 'Only admin and engineer can manage certifications'
        }), 403

    cert = EquipmentCertification.query.filter_by(id=cert_id, equipment_id=equipment_id).first()
    if not cert:
        raise NotFoundError(f"Certification with ID {cert_id} not found for equipment {equipment_id}")

    lang = get_language()

    if request.method == 'PUT':
        data = request.get_json()

        if 'name' in data:
            cert.name = data['name']
        if 'name_ar' in data:
            cert.name_ar = data['name_ar']
        if 'description' in data:
            cert.description = data['description']
        if 'certification_type' in data:
            cert.certification_type = data['certification_type']
        if 'issuing_authority' in data:
            cert.issuing_authority = data['issuing_authority']
        if 'certificate_number' in data:
            cert.certificate_number = data['certificate_number']
        if 'issued_date' in data:
            cert.issued_date = _parse_date(data['issued_date'])
        if 'expiry_date' in data:
            cert.expiry_date = _parse_date(data['expiry_date'])
        if 'document_url' in data:
            cert.document_url = data['document_url']
        if 'status' in data:
            valid_statuses = ['active', 'expired', 'revoked', 'pending_renewal']
            if data['status'] not in valid_statuses:
                raise ValidationError(f"status must be one of: {', '.join(valid_statuses)}")
            cert.status = data['status']

        safe_commit()

        return jsonify({
            'status': 'success',
            'message': 'Certification updated',
            'data': cert.to_dict(language=lang)
        }), 200

    elif request.method == 'DELETE':
        db.session.delete(cert)
        safe_commit()

        return jsonify({
            'status': 'success',
            'message': 'Certification deleted'
        }), 200


@bp.route('/certifications/expiring', methods=['GET'])
@jwt_required()
def expiring_certifications():
    """
    Get certifications expiring within N days.

    Query params:
        - days: Number of days (default 30)
    """
    from datetime import date, timedelta

    days = request.args.get('days', 30, type=int)
    threshold_date = date.today() + timedelta(days=days)

    certs = EquipmentCertification.query.filter(
        EquipmentCertification.expiry_date <= threshold_date,
        EquipmentCertification.expiry_date >= date.today(),
        EquipmentCertification.status.in_(['active', 'pending_renewal'])
    ).order_by(EquipmentCertification.expiry_date.asc()).all()

    lang = get_language()

    return jsonify({
        'status': 'success',
        'data': [c.to_dict(language=lang) for c in certs],
        'total': len(certs)
    }), 200


# ============================================================
# GAMIFICATION ENDPOINTS
# ============================================================

@bp.route('/gamification/leaderboard', methods=['GET'])
@jwt_required()
def technician_leaderboard():
    """
    Get technician performance leaderboard.
    Points for: inspections completed, quick fixes, uptime maintained.

    Query params:
        - period: 'week', 'month', 'all_time' (default 'month')
        - berth: 'east', 'west' (optional filter)
    """
    from sqlalchemy import func
    from datetime import date, timedelta

    period = request.args.get('period', 'month')
    berth_filter = request.args.get('berth')

    # Calculate date range
    if period == 'week':
        start_date = date.today() - timedelta(days=7)
    elif period == 'month':
        start_date = date.today() - timedelta(days=30)
    else:
        start_date = None

    # Get all technicians
    technicians = User.query.filter(
        User.is_active == True,
        db.or_(User.role == 'technician', User.minor_role == 'technician')
    ).all()

    leaderboard = []

    for tech in technicians:
        # Count inspections
        inspection_query = Inspection.query.filter_by(technician_id=tech.id)
        if start_date:
            inspection_query = inspection_query.filter(
                Inspection.submitted_at >= datetime.combine(start_date, datetime.min.time())
            )
        if berth_filter:
            inspection_query = inspection_query.join(Equipment).filter(Equipment.berth == berth_filter)

        inspections_completed = inspection_query.filter(Inspection.status == 'submitted').count()
        inspections_passed = inspection_query.filter(Inspection.result == 'pass').count()

        # Count quick defect fixes (resolved within 24 hours)
        quick_fixes = 0
        # This would require a more complex query; simplified for now

        # Calculate points
        points = (inspections_completed * 10) + (inspections_passed * 5)

        # Get assigned equipment count
        assigned_equipment = Equipment.query.filter_by(assigned_technician_id=tech.id).count()

        leaderboard.append({
            'user_id': tech.id,
            'full_name': tech.full_name,
            'role_id': tech.role_id,
            'inspections_completed': inspections_completed,
            'inspections_passed': inspections_passed,
            'quick_fixes': quick_fixes,
            'assigned_equipment': assigned_equipment,
            'points': points,
            'total_points': tech.technician_points if hasattr(tech, 'technician_points') else points,
        })

    # Sort by points
    leaderboard.sort(key=lambda x: x['points'], reverse=True)

    # Add ranks
    for i, entry in enumerate(leaderboard):
        entry['rank'] = i + 1

    return jsonify({
        'status': 'success',
        'data': leaderboard,
        'period': period
    }), 200


@bp.route('/gamification/achievements', methods=['GET'])
@jwt_required()
def get_achievements():
    """
    Get available achievements and current user's progress.
    """
    user_id = int(get_jwt_identity())
    current_user = get_current_user()

    # Define achievements
    achievements = [
        {
            'id': 'first_inspection',
            'name': 'First Steps',
            'description': 'Complete your first inspection',
            'icon': 'trophy',
            'points': 10,
            'category': 'inspection'
        },
        {
            'id': 'inspection_10',
            'name': 'Inspector',
            'description': 'Complete 10 inspections',
            'icon': 'star',
            'points': 50,
            'category': 'inspection'
        },
        {
            'id': 'inspection_50',
            'name': 'Senior Inspector',
            'description': 'Complete 50 inspections',
            'icon': 'crown',
            'points': 200,
            'category': 'inspection'
        },
        {
            'id': 'perfect_week',
            'name': 'Perfect Week',
            'description': 'Complete all assigned inspections in a week',
            'icon': 'medal',
            'points': 100,
            'category': 'consistency'
        },
        {
            'id': 'quick_responder',
            'name': 'Quick Responder',
            'description': 'Start 5 inspections within 10 minutes of assignment',
            'icon': 'lightning',
            'points': 30,
            'category': 'speed'
        },
        {
            'id': 'equipment_master',
            'name': 'Equipment Master',
            'description': 'Maintain 100% uptime on assigned equipment for a month',
            'icon': 'shield',
            'points': 150,
            'category': 'maintenance'
        },
    ]

    # Calculate user progress
    inspection_count = Inspection.query.filter_by(
        technician_id=user_id,
        status='submitted'
    ).count()

    user_achievements = []
    for achievement in achievements:
        progress = 0
        completed = False

        if achievement['id'] == 'first_inspection':
            progress = min(100, inspection_count * 100)
            completed = inspection_count >= 1
        elif achievement['id'] == 'inspection_10':
            progress = min(100, inspection_count * 10)
            completed = inspection_count >= 10
        elif achievement['id'] == 'inspection_50':
            progress = min(100, inspection_count * 2)
            completed = inspection_count >= 50

        user_achievements.append({
            **achievement,
            'progress': progress,
            'completed': completed,
        })

    return jsonify({
        'status': 'success',
        'data': {
            'achievements': user_achievements,
            'total_points': sum(a['points'] for a in user_achievements if a['completed']),
            'completed_count': sum(1 for a in user_achievements if a['completed']),
            'total_count': len(achievements)
        }
    }), 200


@bp.route('/gamification/streaks', methods=['GET'])
@jwt_required()
def equipment_streaks():
    """
    Get equipment uptime streaks.
    """
    lang = get_language()

    # Get all equipment with their current uptime streak
    equipment_list = Equipment.query.filter_by(is_scrapped=False).all()

    streaks = []
    for eq in equipment_list:
        # Calculate uptime streak (days since last stopped/maintenance status)
        last_downtime = EquipmentStatusLog.query.filter_by(equipment_id=eq.id).filter(
            EquipmentStatusLog.new_status.in_(['stopped', 'out_of_service'])
        ).order_by(EquipmentStatusLog.created_at.desc()).first()

        if eq.status == 'active':
            if last_downtime:
                streak_days = (datetime.utcnow() - last_downtime.created_at).days
            else:
                streak_days = (datetime.utcnow() - eq.created_at).days if eq.created_at else 0
        else:
            streak_days = 0

        streaks.append({
            'equipment_id': eq.id,
            'equipment_name': eq.name,
            'equipment_type': eq.equipment_type,
            'berth': eq.berth,
            'current_status': eq.status,
            'streak_days': streak_days,
            'is_active_streak': eq.status == 'active',
        })

    # Sort by streak days descending
    streaks.sort(key=lambda x: x['streak_days'], reverse=True)

    return jsonify({
        'status': 'success',
        'data': streaks
    }), 200


# ============================================================
# EXPORT ENDPOINTS
# ============================================================

@bp.route('/export', methods=['POST'])
@jwt_required()
def export_equipment():
    """
    Export equipment data to Excel or PDF.

    Request Body:
        {
            "equipment_ids": [1, 2, 3],  # Optional, exports all if empty
            "format": "excel" | "pdf",
            "include_history": true,
            "include_certifications": true,
            "include_notes": true
        }
    """
    import io as io_module
    from flask import send_file

    current_user = get_current_user()
    if current_user.role not in ('admin', 'engineer'):
        return jsonify({
            'status': 'error',
            'message': 'Only admin and engineer can export data'
        }), 403

    data = request.get_json()
    equipment_ids = data.get('equipment_ids', [])
    export_format = data.get('format', 'excel')
    include_history = data.get('include_history', False)
    include_certifications = data.get('include_certifications', False)
    include_notes = data.get('include_notes', False)

    # Get equipment
    if equipment_ids:
        equipment_list = Equipment.query.filter(Equipment.id.in_(equipment_ids)).all()
    else:
        equipment_list = Equipment.query.filter_by(is_scrapped=False).all()

    if export_format == 'excel':
        try:
            import pandas as pd
        except ImportError:
            raise ValidationError("pandas library is required for Excel export")

        # Build data
        rows = []
        for eq in equipment_list:
            row = {
                'ID': eq.id,
                'Name': eq.name,
                'Name (Arabic)': eq.name_ar,
                'Equipment Type': eq.equipment_type,
                'Serial Number': eq.serial_number,
                'Manufacturer': eq.manufacturer,
                'Model Number': eq.model_number,
                'Location': eq.location,
                'Berth': eq.berth,
                'Home Berth': eq.home_berth,
                'Status': eq.status,
                'Installation Date': eq.installation_date.isoformat() if eq.installation_date else '',
                'Hourly Cost': float(eq.hourly_cost) if eq.hourly_cost else '',
                'Criticality Level': eq.criticality_level or '',
                'Last Risk Score': float(eq.last_risk_score) if eq.last_risk_score else '',
            }
            rows.append(row)

        df = pd.DataFrame(rows)

        # Create Excel file
        output = io_module.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Equipment')

            # Add history sheet if requested
            if include_history:
                history_rows = []
                for eq in equipment_list:
                    logs = EquipmentStatusLog.query.filter_by(equipment_id=eq.id).order_by(
                        EquipmentStatusLog.created_at.desc()
                    ).limit(100).all()
                    for log in logs:
                        history_rows.append({
                            'Equipment ID': eq.id,
                            'Equipment Name': eq.name,
                            'Old Status': log.old_status,
                            'New Status': log.new_status,
                            'Reason': log.reason,
                            'Next Action': log.next_action,
                            'Changed By': log.changed_by.full_name if log.changed_by else '',
                            'Date': log.created_at.isoformat() if log.created_at else '',
                        })
                if history_rows:
                    pd.DataFrame(history_rows).to_excel(writer, index=False, sheet_name='Status History')

            # Add certifications sheet if requested
            if include_certifications:
                cert_rows = []
                for eq in equipment_list:
                    certs = EquipmentCertification.query.filter_by(equipment_id=eq.id).all()
                    for cert in certs:
                        cert_rows.append({
                            'Equipment ID': eq.id,
                            'Equipment Name': eq.name,
                            'Certification': cert.name,
                            'Type': cert.certification_type,
                            'Issuing Authority': cert.issuing_authority,
                            'Certificate Number': cert.certificate_number,
                            'Issued Date': cert.issued_date.isoformat() if cert.issued_date else '',
                            'Expiry Date': cert.expiry_date.isoformat() if cert.expiry_date else '',
                            'Status': cert.computed_status,
                        })
                if cert_rows:
                    pd.DataFrame(cert_rows).to_excel(writer, index=False, sheet_name='Certifications')

        output.seek(0)

        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'equipment_export_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.xlsx'
        )

    elif export_format == 'pdf':
        # Generate PDF report
        from app.services.equipment_report_service import generate_equipment_list_report
        pdf_bytes = generate_equipment_list_report(equipment_list, include_history, include_certifications)

        return send_file(
            pdf_bytes,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'equipment_export_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.pdf'
        )

    else:
        raise ValidationError("format must be 'excel' or 'pdf'")


@bp.route('/<int:equipment_id>/report', methods=['GET'])
@jwt_required()
def equipment_report(equipment_id):
    """
    Generate detailed PDF report for single equipment.
    """
    from flask import send_file
    from app.services.equipment_report_service import generate_equipment_report

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    lang = get_language()

    # Generate report
    pdf_bytes = generate_equipment_report(equipment, language=lang)

    return send_file(
        pdf_bytes,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f'equipment_report_{equipment.name}_{datetime.utcnow().strftime("%Y%m%d")}.pdf'
    )


# ============================================================
# EQUIPMENT DASHBOARD KPI & ANALYTICS ENDPOINTS
# ============================================================

@bp.route('/dashboard/kpis', methods=['GET'])
@jwt_required()
def get_dashboard_kpis():
    """
    Get equipment dashboard KPIs.

    Returns:
        - uptime_percent: Percentage of equipment currently operational
        - avg_downtime_hours: Average downtime hours for stopped equipment
        - total_downtime_hours: Total downtime hours across all equipment
        - mtbf: Mean Time Between Failures (days)
        - equipment_by_status: Count of equipment by status
        - equipment_by_criticality: Count by criticality level

    Query params:
        - berth: Filter by berth (east, west, both)
        - equipment_type: Filter by equipment type
    """
    from datetime import datetime as dt, timedelta

    now = dt.utcnow()
    berth_filter = request.args.get('berth')
    type_filter = request.args.get('equipment_type')

    base_query = Equipment.query.filter_by(is_scrapped=False)
    if berth_filter:
        base_query = base_query.filter(Equipment.berth == berth_filter)
    if type_filter:
        base_query = base_query.filter(Equipment.equipment_type == type_filter)

    all_equipment = base_query.all()
    total_count = len(all_equipment)

    if total_count == 0:
        return jsonify({
            'status': 'success',
            'data': {
                'uptime_percent': 0, 'avg_downtime_hours': 0,
                'total_downtime_hours': 0, 'mtbf_days': 0,
                'equipment_by_status': {}, 'equipment_by_criticality': {},
                'total_equipment': 0
            }
        }), 200

    status_counts = {}
    criticality_counts = {}
    active_count = 0
    total_downtime_hours = 0
    downtime_equipment_count = 0

    for eq in all_equipment:
        status = eq.status or 'active'
        status_counts[status] = status_counts.get(status, 0) + 1
        crit = eq.criticality_level or 'medium'
        criticality_counts[crit] = criticality_counts.get(crit, 0) + 1

        if status == 'active':
            active_count += 1
        elif eq.stopped_at and status in ('stopped', 'out_of_service'):
            hours_stopped = (now - eq.stopped_at).total_seconds() / 3600
            total_downtime_hours += hours_stopped
            downtime_equipment_count += 1

    uptime_percent = (active_count / total_count) * 100 if total_count > 0 else 0
    avg_downtime_hours = total_downtime_hours / downtime_equipment_count if downtime_equipment_count > 0 else 0

    one_year_ago = now - timedelta(days=365)
    equipment_ids = [eq.id for eq in all_equipment]
    failure_count = Defect.query.join(Inspection).filter(
        Inspection.equipment_id.in_(equipment_ids),
        Defect.severity.in_(['critical', 'high']),
        Defect.created_at >= one_year_ago
    ).count()
    mtbf_days = (total_count * 365) / failure_count if failure_count > 0 else 365

    return jsonify({
        'status': 'success',
        'data': {
            'uptime_percent': round(uptime_percent, 1),
            'avg_downtime_hours': round(avg_downtime_hours, 1),
            'total_downtime_hours': round(total_downtime_hours, 1),
            'mtbf_days': round(mtbf_days, 0),
            'equipment_by_status': status_counts,
            'equipment_by_criticality': criticality_counts,
            'total_equipment': total_count,
            'active_count': active_count,
            'down_count': downtime_equipment_count
        }
    }), 200


@bp.route('/dashboard/trends', methods=['GET'])
@jwt_required()
def get_dashboard_trends():
    """
    Get equipment status trends for charts.

    Query params:
        - period: 'daily' (last 30 days) or 'weekly' (last 12 weeks)
        - berth: Filter by berth
        - equipment_type: Filter by equipment type
    """
    from datetime import datetime as dt, timedelta

    period = request.args.get('period', 'daily')
    berth_filter = request.args.get('berth')
    type_filter = request.args.get('equipment_type')
    now = dt.utcnow()

    base_query = Equipment.query.filter_by(is_scrapped=False)
    if berth_filter:
        base_query = base_query.filter(Equipment.berth == berth_filter)
    if type_filter:
        base_query = base_query.filter(Equipment.equipment_type == type_filter)

    equipment_ids = [eq.id for eq in base_query.all()]
    if not equipment_ids:
        return jsonify({'status': 'success', 'data': {'period': period, 'trends': []}}), 200

    if period == 'daily':
        trends = []
        for i in range(30, -1, -1):
            day = (now - timedelta(days=i)).date()
            day_start = dt.combine(day, dt.min.time())
            day_end = dt.combine(day, dt.max.time())

            status_changes = EquipmentStatusLog.query.filter(
                EquipmentStatusLog.equipment_id.in_(equipment_ids),
                EquipmentStatusLog.created_at >= day_start,
                EquipmentStatusLog.created_at <= day_end
            ).count()

            inspections = Inspection.query.filter(
                Inspection.equipment_id.in_(equipment_ids),
                Inspection.submitted_at >= day_start,
                Inspection.submitted_at <= day_end
            ).count()

            defects = Defect.query.join(Inspection).filter(
                Inspection.equipment_id.in_(equipment_ids),
                Defect.created_at >= day_start,
                Defect.created_at <= day_end
            ).count()

            trends.append({
                'date': day.isoformat(),
                'status_changes': status_changes,
                'inspections': inspections,
                'defects': defects
            })
    else:
        trends = []
        for i in range(12, -1, -1):
            week_start = now - timedelta(weeks=i, days=now.weekday())
            week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
            week_end = week_start + timedelta(days=7)

            status_changes = EquipmentStatusLog.query.filter(
                EquipmentStatusLog.equipment_id.in_(equipment_ids),
                EquipmentStatusLog.created_at >= week_start,
                EquipmentStatusLog.created_at < week_end
            ).count()

            inspections = Inspection.query.filter(
                Inspection.equipment_id.in_(equipment_ids),
                Inspection.submitted_at >= week_start,
                Inspection.submitted_at < week_end
            ).count()

            defects = Defect.query.join(Inspection).filter(
                Inspection.equipment_id.in_(equipment_ids),
                Defect.created_at >= week_start,
                Defect.created_at < week_end
            ).count()

            trends.append({
                'week_start': week_start.date().isoformat(),
                'week_end': (week_end - timedelta(days=1)).date().isoformat(),
                'status_changes': status_changes,
                'inspections': inspections,
                'defects': defects
            })

    return jsonify({'status': 'success', 'data': {'period': period, 'trends': trends}}), 200


@bp.route('/dashboard/alerts', methods=['GET'])
@jwt_required()
def get_dashboard_alerts():
    """
    Get unified alerts for dashboard.

    Query params:
        - berth: Filter by berth
        - equipment_type: Filter by equipment type
        - severity: Filter by alert severity
    """
    from datetime import datetime as dt, timedelta

    now = dt.utcnow()
    berth_filter = request.args.get('berth')
    type_filter = request.args.get('equipment_type')
    severity_filter = request.args.get('severity')

    base_query = Equipment.query.filter_by(is_scrapped=False)
    if berth_filter:
        base_query = base_query.filter(Equipment.berth == berth_filter)
    if type_filter:
        base_query = base_query.filter(Equipment.equipment_type == type_filter)

    all_equipment = base_query.all()
    alerts = []

    for eq in all_equipment:
        # Extended downtime
        if eq.stopped_at and eq.status in ('stopped', 'out_of_service'):
            days_stopped = (now - eq.stopped_at).days
            if days_stopped >= 30:
                alerts.append({'type': 'extended_downtime', 'severity': 'critical', 'equipment_id': eq.id, 'equipment_name': eq.name, 'message': f'Stopped for {days_stopped} days', 'value': days_stopped, 'action': 'Investigate urgently'})
            elif days_stopped >= 14:
                alerts.append({'type': 'extended_downtime', 'severity': 'high', 'equipment_id': eq.id, 'equipment_name': eq.name, 'message': f'Stopped for {days_stopped} days', 'value': days_stopped, 'action': 'Review repair status'})
            elif days_stopped >= 7:
                alerts.append({'type': 'extended_downtime', 'severity': 'medium', 'equipment_id': eq.id, 'equipment_name': eq.name, 'message': f'Stopped for {days_stopped} days', 'value': days_stopped, 'action': 'Monitor progress'})

        # High risk score
        if eq.last_risk_score:
            risk_score = float(eq.last_risk_score)
            if risk_score >= 85:
                alerts.append({'type': 'high_risk', 'severity': 'critical', 'equipment_id': eq.id, 'equipment_name': eq.name, 'message': f'Critical risk score: {round(risk_score, 1)}', 'value': risk_score, 'action': 'Immediate attention required'})
            elif risk_score >= 75:
                alerts.append({'type': 'high_risk', 'severity': 'high', 'equipment_id': eq.id, 'equipment_name': eq.name, 'message': f'High risk score: {round(risk_score, 1)}', 'value': risk_score, 'action': 'Schedule maintenance'})

        # Overdue inspection
        last_insp = Inspection.query.filter_by(equipment_id=eq.id).order_by(Inspection.submitted_at.desc()).first()
        days_since = (now - last_insp.submitted_at).days if last_insp and last_insp.submitted_at else 365
        if days_since >= 90:
            alerts.append({'type': 'overdue_inspection', 'severity': 'high', 'equipment_id': eq.id, 'equipment_name': eq.name, 'message': f'No inspection in {days_since} days', 'value': days_since, 'action': 'Schedule inspection immediately'})
        elif days_since >= 60:
            alerts.append({'type': 'overdue_inspection', 'severity': 'medium', 'equipment_id': eq.id, 'equipment_name': eq.name, 'message': f'No inspection in {days_since} days', 'value': days_since, 'action': 'Plan inspection soon'})

        # Critical defects
        thirty_days_ago = now - timedelta(days=30)
        critical_defects = Defect.query.join(Inspection).filter(Inspection.equipment_id == eq.id, Defect.severity == 'critical', Defect.status.in_(['open', 'in_progress']), Defect.created_at >= thirty_days_ago).count()
        if critical_defects > 0:
            alerts.append({'type': 'critical_defects', 'severity': 'critical', 'equipment_id': eq.id, 'equipment_name': eq.name, 'message': f'{critical_defects} open critical defect(s)', 'value': critical_defects, 'action': 'Address critical defects immediately'})

    if severity_filter:
        alerts = [a for a in alerts if a['severity'] == severity_filter]

    severity_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
    alerts.sort(key=lambda x: severity_order.get(x['severity'], 4))

    return jsonify({
        'status': 'success',
        'data': {
            'alerts': alerts,
            'total_alerts': len(alerts),
            'by_severity': {
                'critical': sum(1 for a in alerts if a['severity'] == 'critical'),
                'high': sum(1 for a in alerts if a['severity'] == 'high'),
                'medium': sum(1 for a in alerts if a['severity'] == 'medium'),
                'low': sum(1 for a in alerts if a['severity'] == 'low')
            }
        }
    }), 200


# ============================================================
# AUTO-STATUS RULES ENDPOINTS
# ============================================================

AUTO_STATUS_RULES = [
    {'id': 1, 'name': 'Failed Inspection -> Under Maintenance', 'trigger': 'inspection_fail', 'condition': {'result': 'fail'}, 'action': {'new_status': 'under_maintenance'}, 'is_active': True},
    {'id': 2, 'name': 'Critical Defect -> Stopped', 'trigger': 'defect_created', 'condition': {'severity': 'critical'}, 'action': {'new_status': 'stopped'}, 'is_active': True},
    {'id': 3, 'name': 'High Risk Score -> Under Maintenance', 'trigger': 'risk_score_update', 'condition': {'risk_score_gte': 85}, 'action': {'new_status': 'under_maintenance'}, 'is_active': False}
]


@bp.route('/auto-status/rules', methods=['GET'])
@jwt_required()
def get_auto_status_rules():
    """Get list of auto-status rules."""
    return jsonify({
        'status': 'success',
        'data': {
            'rules': AUTO_STATUS_RULES,
            'available_triggers': ['inspection_fail', 'defect_created', 'risk_score_update', 'days_without_inspection'],
            'available_statuses': ['active', 'under_maintenance', 'stopped', 'paused', 'out_of_service']
        }
    }), 200


@bp.route('/auto-status/rules', methods=['POST'])
@jwt_required()
@admin_required()
def create_auto_status_rule():
    """Create a new auto-status rule. Admin only."""
    data = request.get_json()
    required_fields = ['name', 'trigger', 'condition', 'action']
    for field in required_fields:
        if field not in data:
            raise ValidationError(f"{field} is required")

    valid_triggers = ['inspection_fail', 'defect_created', 'risk_score_update', 'days_without_inspection']
    if data['trigger'] not in valid_triggers:
        raise ValidationError(f"trigger must be one of: {', '.join(valid_triggers)}")

    new_rule = {
        'id': max(r['id'] for r in AUTO_STATUS_RULES) + 1 if AUTO_STATUS_RULES else 1,
        'name': data['name'], 'trigger': data['trigger'],
        'condition': data['condition'], 'action': data['action'],
        'is_active': data.get('is_active', True)
    }
    AUTO_STATUS_RULES.append(new_rule)
    return jsonify({'status': 'success', 'message': 'Rule created', 'data': new_rule}), 201


@bp.route('/auto-status/apply', methods=['POST'])
@jwt_required()
@admin_required()
def apply_auto_status_rules():
    """Apply auto-status rules to equipment. Admin only."""
    from datetime import datetime as dt, timedelta

    data = request.get_json() or {}
    equipment_ids = data.get('equipment_ids')
    dry_run = data.get('dry_run', False)
    now = dt.utcnow()
    current_user = get_current_user()
    thirty_days_ago = now - timedelta(days=30)

    query = Equipment.query.filter_by(is_scrapped=False)
    if equipment_ids:
        query = query.filter(Equipment.id.in_(equipment_ids))

    all_equipment = query.all()
    changes = []
    active_rules = [r for r in AUTO_STATUS_RULES if r['is_active']]

    for eq in all_equipment:
        for rule in active_rules:
            should_apply = False
            trigger_detail = None

            if rule['trigger'] == 'inspection_fail':
                failed = Inspection.query.filter(Inspection.equipment_id == eq.id, Inspection.result == 'fail', Inspection.submitted_at >= thirty_days_ago).first()
                if failed and eq.status != rule['action']['new_status']:
                    should_apply = True
                    trigger_detail = f"Failed inspection #{failed.id}"

            elif rule['trigger'] == 'defect_created':
                defect_q = Defect.query.join(Inspection).filter(Inspection.equipment_id == eq.id, Defect.created_at >= thirty_days_ago, Defect.status.in_(['open', 'in_progress']))
                if 'severity' in rule['condition']:
                    defect_q = defect_q.filter(Defect.severity == rule['condition']['severity'])
                defect = defect_q.first()
                if defect and eq.status != rule['action']['new_status']:
                    should_apply = True
                    trigger_detail = f"Defect #{defect.id} ({defect.severity})"

            elif rule['trigger'] == 'risk_score_update':
                if eq.last_risk_score:
                    threshold = rule['condition'].get('risk_score_gte', 85)
                    if float(eq.last_risk_score) >= threshold and eq.status != rule['action']['new_status']:
                        should_apply = True
                        trigger_detail = f"Risk score {float(eq.last_risk_score)} >= {threshold}"

            if should_apply:
                change = {'equipment_id': eq.id, 'equipment_name': eq.name, 'rule_id': rule['id'], 'rule_name': rule['name'], 'old_status': eq.status, 'new_status': rule['action']['new_status'], 'trigger_detail': trigger_detail}
                if not dry_run:
                    old_status = eq.status
                    eq.status = rule['action']['new_status']
                    if rule['action']['new_status'] in ('stopped', 'out_of_service') and old_status not in ('stopped', 'out_of_service'):
                        eq.stopped_at = now
                    elif rule['action']['new_status'] not in ('stopped', 'out_of_service'):
                        eq.stopped_at = None
                    status_log = EquipmentStatusLog(equipment_id=eq.id, old_status=old_status, new_status=rule['action']['new_status'], reason=f"Auto-rule: {rule['name']}", next_action=f"Triggered by: {trigger_detail}", source_type='auto_rule', changed_by_id=current_user.id)
                    db.session.add(status_log)
                    change['applied'] = True
                else:
                    change['applied'] = False
                changes.append(change)
                break

    if not dry_run and changes:
        safe_commit()

    return jsonify({
        'status': 'success',
        'message': f"{'Dry run: ' if dry_run else ''}{len(changes)} status change(s) {'would be ' if dry_run else ''}applied",
        'data': {'dry_run': dry_run, 'changes': changes, 'total_processed': len(all_equipment)}
    }), 200


# ============================================================
# DOWNTIME COST ENDPOINT
# ============================================================

@bp.route('/<int:equipment_id>/downtime-cost', methods=['GET'])
@jwt_required()
def get_equipment_downtime_cost(equipment_id):
    """Calculate downtime cost for equipment."""
    from datetime import datetime as dt, timedelta

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    now = dt.utcnow()
    one_year_ago = now - timedelta(days=365)

    hourly_rate_param = request.args.get('hourly_rate', type=float)
    if hourly_rate_param:
        hourly_rate = hourly_rate_param
    elif equipment.hourly_cost:
        hourly_rate = float(equipment.hourly_cost)
    else:
        hourly_rate = 100.0

    current_downtime_hours = 0
    current_downtime_cost = 0
    if equipment.stopped_at and equipment.status in ('stopped', 'out_of_service'):
        current_downtime_hours = (now - equipment.stopped_at).total_seconds() / 3600
        current_downtime_cost = current_downtime_hours * hourly_rate

    status_logs = EquipmentStatusLog.query.filter(EquipmentStatusLog.equipment_id == equipment_id, EquipmentStatusLog.created_at >= one_year_ago).order_by(EquipmentStatusLog.created_at).all()

    historical_downtime_hours = 0
    downtime_periods = []
    downtime_start = None

    for log in status_logs:
        if log.new_status in ('stopped', 'out_of_service') and downtime_start is None:
            downtime_start = log.created_at
        elif log.new_status not in ('stopped', 'out_of_service') and downtime_start is not None:
            period_hours = (log.created_at - downtime_start).total_seconds() / 3600
            historical_downtime_hours += period_hours
            downtime_periods.append({'start': downtime_start.isoformat(), 'end': log.created_at.isoformat(), 'hours': round(period_hours, 1), 'cost': round(period_hours * hourly_rate, 2), 'reason': log.reason})
            downtime_start = None

    if downtime_start is not None:
        period_hours = (now - downtime_start).total_seconds() / 3600
        historical_downtime_hours += period_hours
        downtime_periods.append({'start': downtime_start.isoformat(), 'end': None, 'hours': round(period_hours, 1), 'cost': round(period_hours * hourly_rate, 2), 'reason': 'Ongoing', 'is_current': True})

    total_annual_cost = historical_downtime_hours * hourly_rate
    monthly_costs = {}
    for period in downtime_periods:
        month_key = period['start'][:7]
        monthly_costs[month_key] = monthly_costs.get(month_key, 0) + period['cost']

    return jsonify({
        'status': 'success',
        'data': {
            'equipment_id': equipment_id, 'equipment_name': equipment.name,
            'hourly_rate': hourly_rate, 'current_status': equipment.status,
            'current_downtime': {'is_down': equipment.status in ('stopped', 'out_of_service'), 'hours': round(current_downtime_hours, 1), 'cost': round(current_downtime_cost, 2), 'since': equipment.stopped_at.isoformat() if equipment.stopped_at else None},
            'annual_summary': {'total_downtime_hours': round(historical_downtime_hours, 1), 'total_cost': round(total_annual_cost, 2), 'downtime_periods': len(downtime_periods)},
            'monthly_costs': monthly_costs,
            'downtime_periods': downtime_periods[-10:]
        }
    }), 200


# ============================================================
# BULK OPERATIONS ENDPOINT
# ============================================================

@bp.route('/bulk/status', methods=['POST'])
@jwt_required()
@admin_required()
def bulk_update_status():
    """Update status for multiple equipment at once. Admin only."""
    from datetime import datetime as dt

    data = request.get_json()
    required_fields = ['equipment_ids', 'new_status', 'reason', 'next_action']
    for field in required_fields:
        if field not in data or not data[field]:
            raise ValidationError(f"{field} is required")

    equipment_ids = data['equipment_ids']
    new_status = data['new_status']
    reason = data['reason'].strip()
    next_action = data['next_action'].strip()

    if not isinstance(equipment_ids, list) or len(equipment_ids) == 0:
        raise ValidationError("equipment_ids must be a non-empty list")

    valid_statuses = ['active', 'under_maintenance', 'out_of_service', 'stopped', 'paused']
    if new_status not in valid_statuses:
        raise ValidationError(f"new_status must be one of: {', '.join(valid_statuses)}")

    current_user = get_current_user()
    now = dt.utcnow()
    results = {'updated': [], 'failed': [], 'skipped': []}

    for eq_id in equipment_ids:
        equipment = db.session.get(Equipment, eq_id)
        if not equipment:
            results['failed'].append({'equipment_id': eq_id, 'error': 'Equipment not found'})
            continue
        if equipment.is_scrapped:
            results['skipped'].append({'equipment_id': eq_id, 'equipment_name': equipment.name, 'reason': 'Equipment is scrapped'})
            continue
        if equipment.status == new_status:
            results['skipped'].append({'equipment_id': eq_id, 'equipment_name': equipment.name, 'reason': f'Already has status {new_status}'})
            continue

        old_status = equipment.status
        status_log = EquipmentStatusLog(equipment_id=eq_id, old_status=old_status, new_status=new_status, reason=reason, next_action=next_action, source_type='bulk_update', changed_by_id=current_user.id)
        db.session.add(status_log)
        equipment.status = new_status
        equipment.current_reason = reason
        equipment.current_next_action = next_action

        if new_status in ('stopped', 'out_of_service') and old_status not in ('stopped', 'out_of_service'):
            equipment.stopped_at = now
        elif new_status not in ('stopped', 'out_of_service'):
            equipment.stopped_at = None

        results['updated'].append({'equipment_id': eq_id, 'equipment_name': equipment.name, 'old_status': old_status, 'new_status': new_status})

    safe_commit()

    return jsonify({
        'status': 'success',
        'message': f"Bulk update: {len(results['updated'])} updated, {len(results['skipped'])} skipped, {len(results['failed'])} failed",
        'data': results
    }), 200


# ============================================================
# RISK SCORE AND PREDICTIONS ENDPOINTS (Additional Routes)
# ============================================================

@bp.route('/<int:equipment_id>/risk-score', methods=['GET'])
@jwt_required()
def get_equipment_risk_score_direct(equipment_id):
    """
    Calculate and return risk score for equipment (direct route).

    Risk score (0-100) is calculated based on:
    - Days since last inspection (30% weight)
    - Number of defects in last 90 days (25% weight)
    - Number of status changes (20% weight)
    - Equipment age (15% weight)
    - Current status (10% weight)
    """
    from app.services.equipment_ai_service import EquipmentAIService

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    result = EquipmentAIService.calculate_risk_score(equipment_id)
    if isinstance(result, dict) and 'error' in result:
        raise NotFoundError(result['error'])

    return jsonify({'status': 'success', 'data': result}), 200


@bp.route('/<int:equipment_id>/predictions', methods=['GET'])
@jwt_required()
def get_equipment_predictions_direct(equipment_id):
    """
    Get failure predictions for equipment (direct route).
    """
    from app.services.equipment_ai_service import EquipmentAIService

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    result = EquipmentAIService.predict_failure(equipment_id)
    if isinstance(result, dict) and 'error' in result:
        raise NotFoundError(result['error'])

    return jsonify({'status': 'success', 'data': result}), 200


@bp.route('/<int:equipment_id>/similar', methods=['GET'])
@jwt_required()
def get_similar_equipment_direct(equipment_id):
    """
    Find equipment similar to the specified equipment (direct route).
    """
    from app.services.equipment_ai_service import EquipmentAIService

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    limit = request.args.get('limit', 10, type=int)
    result = EquipmentAIService.find_similar_equipment(equipment_id)

    if isinstance(result, dict) and 'error' in result:
        raise NotFoundError(result['error'])

    if result.get('similar_equipment'):
        result['similar_equipment'] = result['similar_equipment'][:limit]

    return jsonify({'status': 'success', 'data': result}), 200


@bp.route('/patterns/<equipment_type>', methods=['GET'])
@jwt_required()
def get_failure_patterns_by_type(equipment_type):
    """
    Analyze failure patterns for an equipment type.
    """
    from app.services.equipment_ai_service import EquipmentAIService

    result = EquipmentAIService.analyze_failure_patterns(equipment_type)
    if isinstance(result, dict) and 'error' in result:
        raise NotFoundError(result['error'])

    return jsonify({'status': 'success', 'data': result}), 200


@bp.route('/health-summary', methods=['GET'])
@jwt_required()
def get_health_summary():
    """
    Get aggregated health summary for all equipment.
    Returns fleet-wide health metrics, risk distribution, and alerts.
    """
    from app.services.equipment_ai_service import EquipmentAIService

    # Get all active equipment
    equipment_list = Equipment.query.filter_by(is_scrapped=False).all()

    # Status distribution
    status_counts = {
        'active': 0,
        'under_maintenance': 0,
        'out_of_service': 0,
        'stopped': 0,
        'paused': 0
    }

    # Risk distribution
    risk_counts = {
        'low': 0,
        'medium': 0,
        'high': 0,
        'critical': 0
    }

    # Health scores
    health_scores = []
    equipment_with_issues = []

    for eq in equipment_list:
        # Count by status
        if eq.status in status_counts:
            status_counts[eq.status] += 1

        # Try to get AI risk score
        try:
            risk_result = EquipmentAIService.calculate_risk_score(eq.id)
            if risk_result and 'risk_score' in risk_result:
                score = risk_result['risk_score']
                health_scores.append(100 - score)  # Convert risk to health

                # Categorize risk
                if score >= 75:
                    risk_counts['critical'] += 1
                    equipment_with_issues.append({
                        'id': eq.id,
                        'name': eq.name,
                        'status': eq.status,
                        'risk_score': score,
                        'risk_level': 'critical'
                    })
                elif score >= 50:
                    risk_counts['high'] += 1
                    equipment_with_issues.append({
                        'id': eq.id,
                        'name': eq.name,
                        'status': eq.status,
                        'risk_score': score,
                        'risk_level': 'high'
                    })
                elif score >= 25:
                    risk_counts['medium'] += 1
                else:
                    risk_counts['low'] += 1
        except Exception:
            # If AI service fails, categorize by status
            if eq.status in ('stopped', 'out_of_service'):
                risk_counts['critical'] += 1
            elif eq.status == 'under_maintenance':
                risk_counts['medium'] += 1
            else:
                risk_counts['low'] += 1

    # Calculate average health score
    avg_health = round(sum(health_scores) / len(health_scores), 1) if health_scores else 0

    # Get expiring certifications count
    from datetime import datetime, timedelta
    thirty_days_from_now = datetime.utcnow() + timedelta(days=30)

    try:
        from app.models import EquipmentCertification
        expiring_certs = EquipmentCertification.query.filter(
            EquipmentCertification.expiry_date <= thirty_days_from_now,
            EquipmentCertification.expiry_date >= datetime.utcnow()
        ).count()
    except Exception:
        expiring_certs = 0

    # Sort issues by risk score
    equipment_with_issues.sort(key=lambda x: x['risk_score'], reverse=True)

    return jsonify({
        'status': 'success',
        'data': {
            'summary': {
                'total_equipment': len(equipment_list),
                'average_health_score': avg_health,
                'expiring_certifications': expiring_certs
            },
            'status_distribution': status_counts,
            'risk_distribution': risk_counts,
            'high_risk_equipment': equipment_with_issues[:10],
            'health_trend': {
                'current': avg_health,
                'trend': 'stable'  # Could be calculated from historical data
            }
        }
    }), 200


@bp.route('/batch-status', methods=['POST'])
@jwt_required()
@admin_required()
def batch_update_status():
    """
    Bulk update status for multiple equipment.

    Request body:
        {
            "equipment_ids": [1, 2, 3],
            "new_status": "under_maintenance",
            "reason": "Scheduled maintenance"
        }
    """
    user = get_current_user()
    data = request.get_json()

    if not data:
        raise ValidationError("Request body is required")

    equipment_ids = data.get('equipment_ids', [])
    new_status = data.get('new_status')
    reason = data.get('reason', 'Bulk status update')

    if not equipment_ids:
        raise ValidationError("equipment_ids is required")

    if not new_status:
        raise ValidationError("new_status is required")

    valid_statuses = ['active', 'under_maintenance', 'out_of_service', 'stopped', 'paused']
    if new_status not in valid_statuses:
        raise ValidationError(f"Invalid status. Must be one of: {', '.join(valid_statuses)}")

    updated = []
    errors = []

    for eq_id in equipment_ids:
        equipment = db.session.get(Equipment, eq_id)
        if not equipment:
            errors.append({'id': eq_id, 'error': 'Equipment not found'})
            continue

        old_status = equipment.status
        equipment.status = new_status

        # Update stopped_at timestamp
        if new_status in ('stopped', 'out_of_service') and old_status not in ('stopped', 'out_of_service'):
            equipment.stopped_at = datetime.utcnow()
        elif new_status == 'active' and old_status in ('stopped', 'out_of_service'):
            equipment.stopped_at = None

        # Log status change
        log = EquipmentStatusLog(
            equipment_id=eq_id,
            old_status=old_status,
            new_status=new_status,
            changed_by_id=user.id,
            reason=reason
        )
        db.session.add(log)

        updated.append({
            'id': eq_id,
            'name': equipment.name,
            'old_status': old_status,
            'new_status': new_status
        })

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        raise ValidationError(f"Database error: {str(e)}")

    return jsonify({
        'status': 'success',
        'data': {
            'updated': updated,
            'errors': errors,
            'summary': {
                'total_requested': len(equipment_ids),
                'successful': len(updated),
                'failed': len(errors)
            }
        }
    }), 200