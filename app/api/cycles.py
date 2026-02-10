"""
Maintenance Cycles API endpoints.
Handles CRUD operations for configurable maintenance cycles.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models import MaintenanceCycle
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from app.utils.decorators import get_current_user, admin_required

bp = Blueprint('cycles', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
def list_cycles():
    """
    List all maintenance cycles.

    Query params:
        - cycle_type: Filter by type (running_hours, calendar)
        - active_only: If true, only show active cycles (default true)
    """
    user = get_current_user()
    language = user.language or 'en'

    cycle_type = request.args.get('cycle_type')
    active_only = request.args.get('active_only', 'true').lower() == 'true'

    query = MaintenanceCycle.query

    if active_only:
        query = query.filter(MaintenanceCycle.is_active == True)

    if cycle_type:
        query = query.filter(MaintenanceCycle.cycle_type == cycle_type)

    cycles = query.order_by(MaintenanceCycle.sort_order, MaintenanceCycle.name).all()

    return jsonify({
        'status': 'success',
        'cycles': [c.to_dict(language) for c in cycles],
        'count': len(cycles)
    }), 200


@bp.route('/<int:cycle_id>', methods=['GET'])
@jwt_required()
def get_cycle(cycle_id):
    """Get a single cycle by ID."""
    cycle = db.session.get(MaintenanceCycle, cycle_id)
    if not cycle:
        raise NotFoundError("Maintenance cycle not found")

    user = get_current_user()
    language = user.language or 'en'

    return jsonify({
        'status': 'success',
        'cycle': cycle.to_dict(language)
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
@admin_required()
def create_cycle():
    """
    Create a new maintenance cycle. Admins only.

    Request body:
        {
            "name": "2-weeks",
            "name_ar": "أسبوعين",
            "cycle_type": "calendar",
            "calendar_value": 2,
            "calendar_unit": "weeks",
            "display_label": "2 Weeks",
            "display_label_ar": "أسبوعين"
        }

    OR for running hours:
        {
            "name": "750h",
            "name_ar": "750 ساعة",
            "cycle_type": "running_hours",
            "hours_value": 750,
            "display_label": "750 Hours",
            "display_label_ar": "750 ساعة"
        }
    """
    user = get_current_user()
    data = request.get_json()

    if not data:
        raise ValidationError("Request body is required")

    # Validate required fields
    required = ['name', 'cycle_type']
    missing = [f for f in required if not data.get(f)]
    if missing:
        raise ValidationError(f"Missing required fields: {', '.join(missing)}")

    cycle_type = data['cycle_type']
    if cycle_type not in ['running_hours', 'calendar']:
        raise ValidationError("cycle_type must be 'running_hours' or 'calendar'")

    # Validate type-specific fields
    if cycle_type == 'running_hours':
        if not data.get('hours_value'):
            raise ValidationError("hours_value is required for running_hours cycles")
    else:
        if not data.get('calendar_value') or not data.get('calendar_unit'):
            raise ValidationError("calendar_value and calendar_unit are required for calendar cycles")
        if data['calendar_unit'] not in ['days', 'weeks', 'months']:
            raise ValidationError("calendar_unit must be 'days', 'weeks', or 'months'")

    # Check for duplicate name
    existing = MaintenanceCycle.query.filter_by(name=data['name']).first()
    if existing:
        raise ValidationError(f"Cycle with name '{data['name']}' already exists")

    # Get max sort order
    max_order = db.session.query(db.func.max(MaintenanceCycle.sort_order)).scalar() or 0

    cycle = MaintenanceCycle(
        name=data['name'],
        name_ar=data.get('name_ar'),
        cycle_type=cycle_type,
        hours_value=data.get('hours_value'),
        calendar_value=data.get('calendar_value'),
        calendar_unit=data.get('calendar_unit'),
        display_label=data.get('display_label', data['name']),
        display_label_ar=data.get('display_label_ar'),
        is_system=False,  # User-created cycles are not system cycles
        sort_order=max_order + 1
    )

    db.session.add(cycle)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Maintenance cycle created',
        'cycle': cycle.to_dict(user.language or 'en')
    }), 201


@bp.route('/<int:cycle_id>', methods=['PUT'])
@jwt_required()
@admin_required()
def update_cycle(cycle_id):
    """
    Update a maintenance cycle. Admins only.
    System cycles can only have display labels updated.
    """
    user = get_current_user()

    cycle = db.session.get(MaintenanceCycle, cycle_id)
    if not cycle:
        raise NotFoundError("Maintenance cycle not found")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    # System cycles have limited updates
    if cycle.is_system:
        # Only allow updating display labels
        if 'display_label' in data:
            cycle.display_label = data['display_label']
        if 'display_label_ar' in data:
            cycle.display_label_ar = data['display_label_ar']
        if 'is_active' in data:
            cycle.is_active = data['is_active']
    else:
        # Full update for non-system cycles
        if 'name' in data:
            # Check for duplicate
            existing = MaintenanceCycle.query.filter(
                MaintenanceCycle.name == data['name'],
                MaintenanceCycle.id != cycle_id
            ).first()
            if existing:
                raise ValidationError(f"Cycle with name '{data['name']}' already exists")
            cycle.name = data['name']

        if 'name_ar' in data:
            cycle.name_ar = data['name_ar']
        if 'hours_value' in data:
            cycle.hours_value = data['hours_value']
        if 'calendar_value' in data:
            cycle.calendar_value = data['calendar_value']
        if 'calendar_unit' in data:
            if data['calendar_unit'] not in ['days', 'weeks', 'months', None]:
                raise ValidationError("calendar_unit must be 'days', 'weeks', or 'months'")
            cycle.calendar_unit = data['calendar_unit']
        if 'display_label' in data:
            cycle.display_label = data['display_label']
        if 'display_label_ar' in data:
            cycle.display_label_ar = data['display_label_ar']
        if 'is_active' in data:
            cycle.is_active = data['is_active']
        if 'sort_order' in data:
            cycle.sort_order = data['sort_order']

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Maintenance cycle updated',
        'cycle': cycle.to_dict(user.language or 'en')
    }), 200


@bp.route('/<int:cycle_id>', methods=['DELETE'])
@jwt_required()
@admin_required()
def delete_cycle(cycle_id):
    """
    Delete a maintenance cycle. Admins only.
    System cycles cannot be deleted.
    """
    cycle = db.session.get(MaintenanceCycle, cycle_id)
    if not cycle:
        raise NotFoundError("Maintenance cycle not found")

    if cycle.is_system:
        raise ForbiddenError("System cycles cannot be deleted")

    # Check if cycle is in use by any PM templates
    from app.models import PMTemplate
    templates_using = PMTemplate.query.filter_by(cycle_id=cycle_id).count()
    if templates_using > 0:
        raise ValidationError(f"Cannot delete cycle: {templates_using} PM template(s) are using it")

    # Check if cycle is in use by any work plan jobs
    from app.models import WorkPlanJob
    jobs_using = WorkPlanJob.query.filter_by(cycle_id=cycle_id).count()
    if jobs_using > 0:
        raise ValidationError(f"Cannot delete cycle: {jobs_using} work plan job(s) are using it")

    db.session.delete(cycle)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Maintenance cycle deleted'
    }), 200


@bp.route('/template', methods=['GET'])
def download_cycles_template():
    """
    Download Excel template for maintenance cycles import.
    No authentication required - template only contains sample format.
    """
    from flask import Response
    from io import BytesIO
    import pandas as pd

    # Create sample data for running hours cycles
    running_hours_data = {
        'name': ['250h', '500h', '750h', '1000h', '1500h', '2000h'],
        'name_ar': ['250 ساعة', '500 ساعة', '750 ساعة', '1000 ساعة', '1500 ساعة', '2000 ساعة'],
        'cycle_type': ['running_hours'] * 6,
        'hours_value': [250, 500, 750, 1000, 1500, 2000],
        'calendar_value': ['', '', '', '', '', ''],
        'calendar_unit': ['', '', '', '', '', ''],
        'display_label': ['250 Hours', '500 Hours', '750 Hours', '1000 Hours', '1500 Hours', '2000 Hours'],
        'display_label_ar': ['250 ساعة', '500 ساعة', '750 ساعة', '1000 ساعة', '1500 ساعة', '2000 ساعة'],
    }

    # Create sample data for calendar cycles
    calendar_data = {
        'name': ['weekly', '2-weeks', 'monthly', 'quarterly', '6-months', 'yearly'],
        'name_ar': ['أسبوعي', 'أسبوعين', 'شهري', 'ربع سنوي', 'نصف سنوي', 'سنوي'],
        'cycle_type': ['calendar'] * 6,
        'hours_value': ['', '', '', '', '', ''],
        'calendar_value': [1, 2, 1, 3, 6, 1],
        'calendar_unit': ['weeks', 'weeks', 'months', 'months', 'months', 'months'],
        'display_label': ['Weekly', '2 Weeks', 'Monthly', 'Quarterly', '6 Months', 'Yearly'],
        'display_label_ar': ['أسبوعي', 'أسبوعين', 'شهري', 'ربع سنوي', 'نصف سنوي', 'سنوي'],
    }

    # Combine data
    import pandas as pd
    running_df = pd.DataFrame(running_hours_data)
    calendar_df = pd.DataFrame(calendar_data)
    combined_df = pd.concat([running_df, calendar_df], ignore_index=True)

    # Create Excel file in memory
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        combined_df.to_excel(writer, sheet_name='Cycles', index=False)

        # Add instructions sheet
        instructions = pd.DataFrame({
            'Column': ['name', 'name_ar', 'cycle_type', 'hours_value', 'calendar_value', 'calendar_unit', 'display_label', 'display_label_ar'],
            'Required': ['Yes', 'No', 'Yes', 'Conditional', 'Conditional', 'Conditional', 'No', 'No'],
            'Description': [
                'Unique cycle name (e.g., 250h, monthly)',
                'Arabic name',
                'running_hours or calendar',
                'Required if cycle_type is running_hours (e.g., 250, 500, 1000)',
                'Required if cycle_type is calendar (e.g., 1, 2, 3)',
                'Required if cycle_type is calendar: days, weeks, or months',
                'Display label (defaults to name if not provided)',
                'Arabic display label'
            ]
        })
        instructions.to_excel(writer, sheet_name='Instructions', index=False)

    output.seek(0)

    return Response(
        output.getvalue(),
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={
            'Content-Disposition': 'attachment; filename=maintenance_cycles_import.xlsx'
        }
    )


@bp.route('/<int:cycle_id>/analytics', methods=['GET'])
@jwt_required()
def get_cycle_analytics(cycle_id):
    """
    Get analytics for a maintenance cycle.
    Returns usage stats, linked items counts, effectiveness metrics.
    """
    cycle = db.session.get(MaintenanceCycle, cycle_id)
    if not cycle:
        raise NotFoundError("Maintenance cycle not found")

    user = get_current_user()
    language = user.language or 'en'

    # Get linked PM templates
    from app.models import PMTemplate, WorkPlanJob
    templates = PMTemplate.query.filter_by(cycle_id=cycle_id).all()
    template_count = len(templates)

    # Get linked work plan jobs
    jobs = WorkPlanJob.query.filter_by(cycle_id=cycle_id).all()
    job_count = len(jobs)
    completed_jobs = [j for j in jobs if j.status == 'completed']

    # Calculate average completion time
    avg_completion_hours = None
    if completed_jobs:
        total_hours = sum(j.actual_hours or j.planned_hours or 0 for j in completed_jobs)
        avg_completion_hours = round(total_hours / len(completed_jobs), 1) if completed_jobs else None

    # Get linked equipment (through jobs)
    equipment_ids = set(j.equipment_id for j in jobs if j.equipment_id)
    equipment_count = len(equipment_ids)

    # Calculate effectiveness rate (completed vs total)
    effectiveness_rate = round((len(completed_jobs) / len(jobs)) * 100, 1) if jobs else None

    return jsonify({
        'status': 'success',
        'data': {
            'cycle': cycle.to_dict(language),
            'linked_templates': template_count,
            'linked_jobs': job_count,
            'linked_equipment': equipment_count,
            'completed_jobs': len(completed_jobs),
            'avg_completion_hours': avg_completion_hours,
            'effectiveness_rate': effectiveness_rate,
            'times_used': job_count,
        }
    }), 200


@bp.route('/<int:cycle_id>/impact', methods=['GET'])
@jwt_required()
def get_cycle_impact(cycle_id):
    """
    Get impact analysis for a cycle before edit/delete.
    Shows what will be affected by changes.
    """
    cycle = db.session.get(MaintenanceCycle, cycle_id)
    if not cycle:
        raise NotFoundError("Maintenance cycle not found")

    user = get_current_user()
    language = user.language or 'en'

    # Get linked items
    from app.models import PMTemplate, WorkPlanJob

    templates = PMTemplate.query.filter_by(cycle_id=cycle_id).all()
    jobs = WorkPlanJob.query.filter_by(cycle_id=cycle_id).all()

    # Get unique equipment
    equipment_ids = set(j.equipment_id for j in jobs if j.equipment_id)

    return jsonify({
        'status': 'success',
        'data': {
            'cycle': cycle.to_dict(language),
            'impact': {
                'templates': {
                    'count': len(templates),
                    'items': [{'id': t.id, 'name': t.name} for t in templates[:10]]
                },
                'jobs': {
                    'count': len(jobs),
                    'pending': len([j for j in jobs if j.status in ('pending', 'assigned')])
                },
                'equipment': {
                    'count': len(equipment_ids)
                }
            },
            'can_delete': len(templates) == 0 and len(jobs) == 0,
            'is_system': cycle.is_system
        }
    }), 200


@bp.route('/<int:cycle_id>/linked', methods=['GET'])
@jwt_required()
def get_cycle_linked_items(cycle_id):
    """
    Get all items linked to a cycle with pagination.
    Query params: type (templates, jobs, equipment), page, per_page
    """
    cycle = db.session.get(MaintenanceCycle, cycle_id)
    if not cycle:
        raise NotFoundError("Maintenance cycle not found")

    user = get_current_user()
    language = user.language or 'en'

    item_type = request.args.get('type', 'templates')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    from app.models import PMTemplate, WorkPlanJob, Equipment

    if item_type == 'templates':
        query = PMTemplate.query.filter_by(cycle_id=cycle_id)
        total = query.count()
        items = query.offset((page - 1) * per_page).limit(per_page).all()
        data = [{'id': t.id, 'name': t.name, 'equipment_type': t.equipment_type, 'is_active': t.is_active} for t in items]

    elif item_type == 'jobs':
        query = WorkPlanJob.query.filter_by(cycle_id=cycle_id)
        total = query.count()
        items = query.order_by(WorkPlanJob.id.desc()).offset((page - 1) * per_page).limit(per_page).all()
        data = [{
            'id': j.id,
            'title': j.title,
            'status': j.status,
            'equipment_serial': j.equipment_serial
        } for j in items]

    elif item_type == 'equipment':
        # Get equipment IDs from jobs
        job_equipment_ids = db.session.query(WorkPlanJob.equipment_id).filter(
            WorkPlanJob.cycle_id == cycle_id,
            WorkPlanJob.equipment_id.isnot(None)
        ).distinct().all()
        equipment_ids = [e[0] for e in job_equipment_ids]

        total = len(equipment_ids)
        paginated_ids = equipment_ids[(page - 1) * per_page:page * per_page]

        if paginated_ids:
            items = Equipment.query.filter(Equipment.id.in_(paginated_ids)).all()
            data = [{'id': e.id, 'name': e.name, 'serial_number': e.serial_number, 'status': e.status} for e in items]
        else:
            data = []
    else:
        data = []
        total = 0

    return jsonify({
        'status': 'success',
        'data': {
            'type': item_type,
            'items': data,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'pages': (total + per_page - 1) // per_page
            }
        }
    }), 200
