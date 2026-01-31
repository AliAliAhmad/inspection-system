"""
Inspection routine management endpoints (Admin only).
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import InspectionRoutine, InspectionSchedule, ChecklistTemplate, Equipment
from app.extensions import db, safe_commit
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from app.utils.decorators import admin_required

bp = Blueprint('inspection_routines', __name__)


def _validate_routine_data(data, partial=False):
    """Validate routine request data. If partial=True, only validate fields that are present."""
    if not partial:
        required_fields = ['name', 'asset_types', 'template_id']
        for field in required_fields:
            if field not in data:
                raise ValidationError(f"{field} is required")

    if 'asset_types' in data:
        asset_types = data['asset_types']
        if not isinstance(asset_types, list) or len(asset_types) == 0:
            raise ValidationError("asset_types must be a non-empty list")

    if 'template_id' in data:
        template = db.session.get(ChecklistTemplate, data['template_id'])
        if not template:
            raise ValidationError(f"ChecklistTemplate with ID {data['template_id']} not found")


@bp.route('', methods=['GET'])
@jwt_required()
@admin_required()
def list_routines():
    """
    List all inspection routines. Admin only.

    Returns:
        {
            "status": "success",
            "data": [...]
        }
    """
    routines = InspectionRoutine.query.order_by(InspectionRoutine.created_at.desc()).all()

    return jsonify({
        'status': 'success',
        'data': [r.to_dict() for r in routines]
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
@admin_required()
def create_routine():
    """
    Create a new inspection routine. Admin only.

    Request Body:
        {
            "name": "Daily Pump Inspection",
            "name_ar": "...",
            "asset_types": ["Centrifugal Pump", "Screw Pump"],
            "shift": "day",
            "days_of_week": [0, 1, 2, 3, 4],
            "template_id": 1
        }

    Returns:
        {
            "status": "success",
            "data": {...}
        }
    """
    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    _validate_routine_data(data)

    current_user_id = get_jwt_identity()

    routine = InspectionRoutine(
        name=data['name'],
        name_ar=data.get('name_ar'),
        asset_types=data['asset_types'],
        template_id=data['template_id'],
        is_active=data.get('is_active', True),
        created_by_id=int(current_user_id)
    )

    db.session.add(routine)
    safe_commit()

    return jsonify({
        'status': 'success',
        'data': routine.to_dict()
    }), 201


@bp.route('/<int:routine_id>', methods=['PUT'])
@jwt_required()
@admin_required()
def update_routine(routine_id):
    """
    Update an inspection routine. Admin only.

    Request Body (all fields optional):
        {
            "name": "Updated name",
            "name_ar": "...",
            "asset_types": ["Centrifugal Pump"],
            "shift": "night",
            "days_of_week": [0, 1, 2],
            "template_id": 2,
            "is_active": false
        }

    Returns:
        {
            "status": "success",
            "data": {...}
        }
    """
    routine = db.session.get(InspectionRoutine, routine_id)
    if not routine:
        raise NotFoundError(f"InspectionRoutine with ID {routine_id} not found")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    _validate_routine_data(data, partial=True)

    if 'name' in data:
        routine.name = data['name']
    if 'name_ar' in data:
        routine.name_ar = data['name_ar']
    if 'asset_types' in data:
        routine.asset_types = data['asset_types']
    if 'template_id' in data:
        routine.template_id = data['template_id']
    if 'is_active' in data:
        routine.is_active = data['is_active']

    safe_commit()

    return jsonify({
        'status': 'success',
        'data': routine.to_dict()
    }), 200


@bp.route('/<int:routine_id>', methods=['DELETE'])
@jwt_required()
@admin_required()
def delete_routine(routine_id):
    """
    Deactivate an inspection routine. Admin only.

    Returns:
        {
            "status": "success",
            "message": "Inspection routine deactivated"
        }
    """
    routine = db.session.get(InspectionRoutine, routine_id)
    if not routine:
        raise NotFoundError(f"InspectionRoutine with ID {routine_id} not found")

    routine.is_active = False
    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Inspection routine deactivated'
    }), 200


# ── Day-name mapping for flexible header parsing ──────────────
_DAY_MAP = {
    'mon': 0, 'monday': 0,
    'tue': 1, 'tuesday': 1,
    'wed': 2, 'wednesday': 2,
    'thu': 3, 'thursday': 3,
    'fri': 4, 'friday': 4,
    'sat': 5, 'saturday': 5,
    'sun': 6, 'sunday': 6,
}


@bp.route('/upload-schedule', methods=['POST'])
@jwt_required()
@admin_required()
def upload_schedule():
    """
    Import weekly inspection schedule from an Excel file. Admin only.

    Excel format (grid):
      - Column A: equipment name (individual assets)
      - Columns B-H: days of week (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
      - Cell values: D (day shift), N (night shift), D+N (both), empty (off)

    Replaces existing schedule entries for each equipment found in the file.

    Returns:
        {
            "status": "success",
            "created": 42,
            "equipment_processed": 10,
            "errors": [...]
        }
    """
    if 'file' not in request.files:
        raise ValidationError("No file uploaded. Send an Excel file with key 'file'.")

    file = request.files['file']
    if not file.filename or not file.filename.endswith(('.xlsx', '.xls')):
        raise ValidationError("File must be an Excel file (.xlsx or .xls)")

    try:
        import openpyxl
        wb = openpyxl.load_workbook(file, read_only=True)
        ws = wb.active
    except Exception as e:
        raise ValidationError(f"Could not read Excel file: {str(e)}")

    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2:
        raise ValidationError("Excel file must have a header row and at least one data row")

    # ── Parse header row ──────────────────────────────────────
    header = [str(h).strip() if h else '' for h in rows[0]]

    # First column is equipment name; remaining columns should be day names
    day_columns = {}  # col_index -> day_of_week int
    for col_idx in range(1, len(header)):
        day_key = header[col_idx].lower().strip()
        if day_key in _DAY_MAP:
            day_columns[col_idx] = _DAY_MAP[day_key]

    if not day_columns:
        raise ValidationError(
            "Could not find day-of-week columns in header. "
            "Expected column names like: Mon, Tue, Wed, Thu, Fri, Sat, Sun. "
            f"Found headers: {header}"
        )

    # ── Process data rows ─────────────────────────────────────
    created = 0
    equipment_processed = 0
    errors = []

    for row_num, row in enumerate(rows[1:], start=2):
        equipment_name = str(row[0]).strip() if row and row[0] else None
        if not equipment_name:
            continue

        # Look up equipment by name (case-insensitive)
        equipment = Equipment.query.filter(
            db.func.lower(Equipment.name) == equipment_name.lower()
        ).first()

        if not equipment:
            errors.append(f"Row {row_num}: equipment '{equipment_name}' not found")
            continue

        # Delete existing schedules for this equipment
        InspectionSchedule.query.filter_by(equipment_id=equipment.id).delete()
        equipment_processed += 1

        # Parse each day column
        for col_idx, day_int in day_columns.items():
            cell_value = str(row[col_idx]).strip().upper() if col_idx < len(row) and row[col_idx] else ''

            if not cell_value:
                continue

            shifts_to_create = []
            if cell_value in ('D', 'DAY'):
                shifts_to_create = ['day']
            elif cell_value in ('N', 'NIGHT'):
                shifts_to_create = ['night']
            elif cell_value in ('D+N', 'DN', 'D/N', 'BOTH', 'DAY+NIGHT'):
                shifts_to_create = ['day', 'night']
            else:
                errors.append(
                    f"Row {row_num}, {header[col_idx]}: unknown value '{cell_value}' "
                    f"(expected D, N, or D+N)"
                )
                continue

            for shift in shifts_to_create:
                schedule = InspectionSchedule(
                    equipment_id=equipment.id,
                    day_of_week=day_int,
                    shift=shift,
                    is_active=True,
                )
                db.session.add(schedule)
                created += 1

    if created > 0:
        safe_commit()

    return jsonify({
        'status': 'success',
        'message': f'{created} schedule entries created for {equipment_processed} equipment',
        'created': created,
        'equipment_processed': equipment_processed,
        'errors': errors,
    }), 201
