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
