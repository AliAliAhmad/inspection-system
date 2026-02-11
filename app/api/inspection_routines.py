"""
Inspection routine management endpoints (Admin only).
"""

from datetime import date, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import InspectionRoutine, InspectionSchedule, ChecklistTemplate, Equipment
from app.extensions import db, safe_commit
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from app.utils.decorators import admin_required

bp = Blueprint('inspection_routines', __name__)


VALID_SHIFTS = {'morning', 'afternoon', 'night'}
VALID_FREQUENCIES = {'daily', 'weekly', 'monthly'}
VALID_DAYS = {'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'}


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

    if 'shift' in data and data['shift'] is not None:
        if data['shift'] not in VALID_SHIFTS:
            raise ValidationError(f"shift must be one of: {', '.join(VALID_SHIFTS)}")

    if 'frequency' in data and data['frequency'] is not None:
        if data['frequency'] not in VALID_FREQUENCIES:
            raise ValidationError(f"frequency must be one of: {', '.join(VALID_FREQUENCIES)}")

    if 'days_of_week' in data and data['days_of_week'] is not None:
        if not isinstance(data['days_of_week'], list):
            raise ValidationError("days_of_week must be a list")
        for day in data['days_of_week']:
            if day not in VALID_DAYS:
                raise ValidationError(f"Invalid day: {day}. Must be one of: {', '.join(VALID_DAYS)}")


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
            "shift": "morning",  // 'morning', 'afternoon', 'night', or null
            "frequency": "weekly",  // 'daily', 'weekly', 'monthly'
            "days_of_week": ["monday", "wednesday", "friday"],
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
        shift=data.get('shift'),
        frequency=data.get('frequency', 'weekly'),
        days_of_week=data.get('days_of_week'),
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
            "shift": "night",  // 'morning', 'afternoon', 'night', or null
            "frequency": "weekly",  // 'daily', 'weekly', 'monthly'
            "days_of_week": ["monday", "wednesday"],
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
    if 'shift' in data:
        routine.shift = data['shift']
    if 'frequency' in data:
        routine.frequency = data['frequency']
    if 'days_of_week' in data:
        routine.days_of_week = data['days_of_week']
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
      - Column B: berth (required, e.g. B1, B2)
      - Columns C onwards: days of week (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
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

    # Column B must be "Berth"
    if len(header) < 2 or header[1].lower().strip() not in ('berth', 'رصيف'):
        raise ValidationError(
            "Column B must be 'Berth'. "
            "Expected format: Equipment | Berth | Mon | Tue | ... | Sun"
        )
    berth_col_idx = 1
    day_start = 2  # day columns start after berth

    # First column is equipment name; remaining columns should be day names
    day_columns = {}  # col_index -> day_of_week int
    for col_idx in range(day_start, len(header)):
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
    import_details = []  # Track what was imported for debugging

    for row_num, row in enumerate(rows[1:], start=2):
        equipment_name = str(row[0]).strip() if row and row[0] else None
        if not equipment_name:
            continue

        # Read berth from column B (mandatory)
        row_berth = str(row[berth_col_idx]).strip() if berth_col_idx < len(row) and row[berth_col_idx] else None
        if not row_berth:
            errors.append(f"Row {row_num}: berth is required for '{equipment_name}'")
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

        # Track this equipment's schedule
        equipment_detail = {
            'equipment_name': equipment_name,
            'berth': row_berth,
            'shifts_created': {'day': 0, 'night': 0},
            'cell_values': []
        }

        # Parse each day column
        for col_idx, day_int in day_columns.items():
            # Handle different cell value types (string, number, boolean, None)
            raw_value = row[col_idx] if col_idx < len(row) else None
            if raw_value is None or raw_value == '':
                continue

            # Convert to string and normalize
            cell_value = str(raw_value).strip().upper()

            if not cell_value or cell_value == 'NONE':
                continue

            shifts_to_create = []
            # Day shift variations
            if cell_value in ('D', 'DAY', '1', 'TRUE', 'YES', 'Y'):
                shifts_to_create = ['day']
            # Night shift variations
            elif cell_value in ('N', 'NIGHT', '2', 'FALSE', 'NO'):
                shifts_to_create = ['night']
            # Both shifts variations
            elif cell_value in ('D+N', 'DN', 'D/N', 'BOTH', 'DAY+NIGHT', '3', 'B'):
                shifts_to_create = ['day', 'night']
            else:
                errors.append(
                    f"Row {row_num}, {header[col_idx]}: unknown value '{cell_value}' "
                    f"(expected D, N, D+N, or 1, 2, 3)"
                )
                continue

            # Track what we're creating
            day_name = header[col_idx] if col_idx < len(header) else f"Day{day_int}"
            equipment_detail['cell_values'].append({
                'day': day_name,
                'raw_value': str(raw_value),
                'processed_value': cell_value,
                'shifts': shifts_to_create
            })

            for shift in shifts_to_create:
                schedule = InspectionSchedule(
                    equipment_id=equipment.id,
                    day_of_week=day_int,
                    shift=shift,
                    berth=row_berth,
                    is_active=True,
                )
                db.session.add(schedule)
                created += 1
                equipment_detail['shifts_created'][shift] += 1

        # Add equipment detail to import details
        import_details.append(equipment_detail)

    if created > 0:
        safe_commit()

    # Count shifts for debugging
    day_count = InspectionSchedule.query.filter_by(shift='day', is_active=True).count()
    night_count = InspectionSchedule.query.filter_by(shift='night', is_active=True).count()

    return jsonify({
        'status': 'success',
        'message': f'{created} schedule entries created for {equipment_processed} equipment',
        'created': created,
        'equipment_processed': equipment_processed,
        'errors': errors,
        'summary': {
            'day_shifts': day_count,
            'night_shifts': night_count,
            'total_active': day_count + night_count,
        },
        'import_details': import_details,  # Detailed breakdown for debugging
    }), 201


@bp.route('/schedules', methods=['GET'])
@jwt_required()
@admin_required()
def list_schedules():
    """
    List imported equipment schedules grouped by equipment.
    Returns equipment details with their weekly schedule grid.

    Returns:
        {
            "status": "success",
            "data": [
                {
                    "equipment_id": 1,
                    "equipment_name": "Crane-01",
                    "equipment_type": "Crane",
                    "berth": "B1",
                    "location": "...",
                    "days": {
                        "0": "day",     // Monday
                        "1": "night",   // Tuesday
                        ...
                    }
                }
            ]
        }
    """
    schedules = InspectionSchedule.query.filter_by(is_active=True)\
        .order_by(InspectionSchedule.equipment_id, InspectionSchedule.day_of_week).all()

    # Group by equipment
    equipment_map = {}
    for s in schedules:
        eid = s.equipment_id
        if eid not in equipment_map:
            equip = s.equipment
            equipment_map[eid] = {
                'equipment_id': eid,
                'equipment_name': equip.name if equip else str(eid),
                'equipment_type': equip.equipment_type if equip else None,
                'berth': s.berth,
                'location': equip.location if equip else None,
                'days': {},
            }
        day_key = str(s.day_of_week)
        existing = equipment_map[eid]['days'].get(day_key)
        if existing and existing != s.shift:
            equipment_map[eid]['days'][day_key] = 'both'
        else:
            equipment_map[eid]['days'][day_key] = s.shift
        # Use berth from any schedule entry for this equipment
        if s.berth and not equipment_map[eid]['berth']:
            equipment_map[eid]['berth'] = s.berth

    return jsonify({
        'status': 'success',
        'data': list(equipment_map.values()),
    }), 200


@bp.route('/schedules/debug', methods=['GET'])
@jwt_required()
@admin_required()
def debug_schedules():
    """
    DEBUG: Show raw schedule data from database.
    Returns all active schedules with shift information for debugging.
    """
    schedules = InspectionSchedule.query.filter_by(is_active=True)\
        .order_by(InspectionSchedule.equipment_id, InspectionSchedule.day_of_week).all()

    debug_data = []
    for s in schedules:
        equip = s.equipment
        debug_data.append({
            'id': s.id,
            'equipment_id': s.equipment_id,
            'equipment_name': equip.name if equip else 'Unknown',
            'day_of_week': s.day_of_week,
            'shift': s.shift,  # This is the critical field
            'berth': s.berth,
        })

    # Count by shift
    day_count = sum(1 for s in schedules if s.shift == 'day')
    night_count = sum(1 for s in schedules if s.shift == 'night')
    other_count = sum(1 for s in schedules if s.shift not in ['day', 'night'])

    return jsonify({
        'status': 'success',
        'total_schedules': len(schedules),
        'day_shifts': day_count,
        'night_shifts': night_count,
        'other_shifts': other_count,
        'schedules': debug_data,
    }), 200


@bp.route('/schedules/clear-all', methods=['DELETE'])
@jwt_required()
@admin_required()
def clear_all_schedules():
    """
    Clear all inspection schedules (for debugging).
    Use this before importing a fresh schedule.
    """
    deleted_count = InspectionSchedule.query.delete()
    safe_commit()

    return jsonify({
        'status': 'success',
        'message': f'Deleted {deleted_count} schedule entries',
        'deleted': deleted_count,
    }), 200


@bp.route('/schedules/upcoming', methods=['GET'])
@jwt_required()
@admin_required()
def upcoming_inspections():
    """
    Get equipment needing inspection today and tomorrow based on imported schedule.

    Returns:
        {
            "status": "success",
            "today": [ { equipment_name, berth, shift, equipment_type } ],
            "tomorrow": [ ... ]
        }
    """
    today = date.today()
    tomorrow = today + timedelta(days=1)
    today_dow = today.weekday()     # 0=Monday
    tomorrow_dow = tomorrow.weekday()

    def _get_day_entries(day_of_week):
        entries = InspectionSchedule.query.filter_by(
            day_of_week=day_of_week,
            is_active=True,
        ).all()
        results = []
        for s in entries:
            equip = s.equipment
            results.append({
                'equipment_id': s.equipment_id,
                'equipment_name': equip.name if equip else str(s.equipment_id),
                'equipment_type': equip.equipment_type if equip else None,
                'berth': s.berth,
                'shift': s.shift,
            })
        return results

    return jsonify({
        'status': 'success',
        'data': {
            'today': _get_day_entries(today_dow),
            'today_date': today.isoformat(),
            'tomorrow': _get_day_entries(tomorrow_dow),
            'tomorrow_date': tomorrow.isoformat(),
        },
    }), 200
