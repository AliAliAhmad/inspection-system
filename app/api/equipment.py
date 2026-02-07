"""
Equipment management endpoints.
Includes equipment import, template download, and import history features.
"""

import json
import io
import re
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.exc import IntegrityError
from app.models import Equipment, ImportLog
from app.extensions import db, safe_commit
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from app.utils.decorators import get_current_user, admin_required, get_language
from app.utils.pagination import paginate

bp = Blueprint('equipment', __name__)

# Valid berth values
VALID_BERTHS = ['east', 'west']


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
        raise ValidationError(f"berth must be 'east' or 'west', got: {data['berth']}")

    home_berth = str(data['home_berth']).strip().lower()
    if home_berth not in VALID_BERTHS:
        raise ValidationError(f"home_berth must be 'east' or 'west', got: {data['home_berth']}")

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
        return False, f"Berth must be 'east' or 'west', got: {berth}"
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
        'berth': ['east', 'west'],
        'home_berth': ['east', 'west']
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
            raise ValidationError(f"berth must be 'east' or 'west', got: {data['berth']}")
        equipment.berth = berth
    if 'home_berth' in data:
        home_berth = str(data['home_berth']).strip().lower()
        if home_berth not in VALID_BERTHS:
            raise ValidationError(f"home_berth must be 'east' or 'west', got: {data['home_berth']}")
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