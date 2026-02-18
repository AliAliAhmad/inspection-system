"""
Monitor follow-up endpoints.
Tracks scheduled re-inspections after "monitor" verdict.
Engineers/admins schedule follow-ups; inspectors view their own.
"""

from datetime import date, datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required

from app.services.monitor_followup_service import MonitorFollowupService
from app.utils.decorators import get_current_user, admin_required
from app.models.monitor_followup import MonitorFollowup
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError

bp = Blueprint('monitor_followups', __name__)

SCHEDULE_REQUIRED_FIELDS = (
    'followup_date', 'followup_type', 'location',
    'mechanical_inspector_id', 'electrical_inspector_id',
)


# ── helpers ──────────────────────────────────────────────────────────────────

def _parse_date(value: str, field_name: str = 'date') -> date:
    """Parse an ISO-format date string, raising ValidationError on failure."""
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        raise ValidationError(
            message=f"Invalid {field_name} format. Expected YYYY-MM-DD.",
            field=field_name,
        )


def _get_followup_or_404(followup_id: int) -> MonitorFollowup:
    """Fetch a follow-up by ID or raise NotFoundError."""
    followup = MonitorFollowup.query.get(followup_id)
    if not followup:
        raise NotFoundError(f"Follow-up {followup_id} not found")
    return followup


def _assert_engineer_or_admin(user):
    """Raise ForbiddenError unless user is an engineer or admin."""
    if user.role not in ('admin', 'engineer'):
        raise ForbiddenError("Engineer or admin access required")


# ── list ─────────────────────────────────────────────────────────────────────

@bp.route('', methods=['GET'])
@jwt_required()
def list_followups():
    """List follow-ups. Engineers/admins see all; inspectors see their own."""
    user = get_current_user()

    if user.role in ('admin', 'engineer'):
        query = MonitorFollowup.query
    else:
        query = MonitorFollowup.query.filter(
            (MonitorFollowup.mechanical_inspector_id == user.id) |
            (MonitorFollowup.electrical_inspector_id == user.id)
        )

    # Optional filters
    status = request.args.get('status')
    if status:
        query = query.filter(MonitorFollowup.status == status)

    equipment_id = request.args.get('equipment_id', type=int)
    if equipment_id:
        query = query.filter(MonitorFollowup.equipment_id == equipment_id)

    followups = query.order_by(MonitorFollowup.created_at.desc()).all()

    return jsonify({
        'status': 'success',
        'data': [f.to_dict() for f in followups],
    }), 200


# ── detail ───────────────────────────────────────────────────────────────────

@bp.route('/<int:followup_id>', methods=['GET'])
@jwt_required()
def get_followup(followup_id):
    """Get a single follow-up by ID."""
    user = get_current_user()
    followup = _get_followup_or_404(followup_id)

    # Inspectors may only view their own follow-ups
    if user.role not in ('admin', 'engineer'):
        if (followup.mechanical_inspector_id != user.id and
                followup.electrical_inspector_id != user.id):
            raise ForbiddenError("You do not have access to this follow-up")

    return jsonify({
        'status': 'success',
        'data': followup.to_dict(),
    }), 200


# ── pending scheduling ──────────────────────────────────────────────────────

@bp.route('/pending', methods=['GET'])
@jwt_required()
def pending_followups():
    """Follow-ups that still need scheduling (status = pending_schedule).
    Only engineers and admins."""
    user = get_current_user()
    _assert_engineer_or_admin(user)

    followups = (
        MonitorFollowup.query
        .filter(MonitorFollowup.status == 'pending_schedule')
        .order_by(MonitorFollowup.created_at.asc())
        .all()
    )

    return jsonify({
        'status': 'success',
        'data': [f.to_dict() for f in followups],
    }), 200


# ── schedule ─────────────────────────────────────────────────────────────────

@bp.route('/<int:followup_id>/schedule', methods=['POST'])
@jwt_required()
def schedule_followup(followup_id):
    """Engineer/admin submits the scheduling form for a follow-up."""
    user = get_current_user()
    _assert_engineer_or_admin(user)

    data = request.get_json() or {}

    # Validate required fields
    missing = [f for f in SCHEDULE_REQUIRED_FIELDS if not data.get(f)]
    if missing:
        raise ValidationError(
            message=f"Missing required fields: {', '.join(missing)}",
        )

    # Validate followup_type
    if data['followup_type'] not in MonitorFollowup.VALID_TYPES:
        raise ValidationError(
            message=f"Invalid followup_type. Must be one of: {', '.join(MonitorFollowup.VALID_TYPES)}",
            field='followup_type',
        )

    # Validate location
    if data['location'] not in MonitorFollowup.VALID_LOCATIONS:
        raise ValidationError(
            message=f"Invalid location. Must be one of: {', '.join(MonitorFollowup.VALID_LOCATIONS)}",
            field='location',
        )

    # Validate date
    followup_date = _parse_date(data['followup_date'], 'followup_date')

    followup = MonitorFollowupService.schedule_followup(
        followup_id=followup_id,
        scheduled_by=user.id,
        scheduled_by_role=user.role,
        followup_date=followup_date,
        followup_type=data['followup_type'],
        location=data['location'],
        shift=data.get('shift'),
        mechanical_inspector_id=int(data['mechanical_inspector_id']),
        electrical_inspector_id=int(data['electrical_inspector_id']),
        notes=data.get('notes'),
    )

    return jsonify({
        'status': 'success',
        'message': 'Follow-up scheduled',
        'data': followup.to_dict(),
    }), 200


# ── available inspectors ────────────────────────────────────────────────────

@bp.route('/available-inspectors', methods=['GET'])
@jwt_required()
def available_inspectors():
    """Return inspectors available on a given date, grouped by specialization.
    Query params: date (required), shift (optional), location (optional)."""
    user = get_current_user()
    _assert_engineer_or_admin(user)

    date_str = request.args.get('date')
    if not date_str:
        raise ValidationError(message="Query parameter 'date' is required", field='date')

    target_date = _parse_date(date_str, 'date')
    shift = request.args.get('shift')
    location = request.args.get('location')

    inspectors = MonitorFollowupService.get_available_inspectors(
        target_date=target_date,
        shift=shift,
        location=location,
    )

    return jsonify({
        'status': 'success',
        'data': inspectors,
    }), 200


# ── equipment history ────────────────────────────────────────────────────────

@bp.route('/equipment/<int:equipment_id>/history', methods=['GET'])
@jwt_required()
def equipment_history(equipment_id):
    """All follow-ups for a specific piece of equipment, newest first."""
    followups = (
        MonitorFollowup.query
        .filter(MonitorFollowup.equipment_id == equipment_id)
        .order_by(MonitorFollowup.created_at.desc())
        .all()
    )

    return jsonify({
        'status': 'success',
        'data': [f.to_dict() for f in followups],
    }), 200


# ── overdue ──────────────────────────────────────────────────────────────────

@bp.route('/overdue', methods=['GET'])
@jwt_required()
def overdue_followups():
    """Return all overdue follow-ups."""
    user = get_current_user()

    query = MonitorFollowup.query.filter(MonitorFollowup.is_overdue.is_(True))

    # Inspectors only see their own overdue items
    if user.role not in ('admin', 'engineer'):
        query = query.filter(
            (MonitorFollowup.mechanical_inspector_id == user.id) |
            (MonitorFollowup.electrical_inspector_id == user.id)
        )

    followups = query.order_by(MonitorFollowup.overdue_since.asc()).all()

    return jsonify({
        'status': 'success',
        'data': [f.to_dict() for f in followups],
    }), 200


# ── dashboard stats ──────────────────────────────────────────────────────────

@bp.route('/dashboard', methods=['GET'])
@jwt_required()
def dashboard():
    """Aggregate counts: pending_schedule, scheduled, overdue, completed."""
    user = get_current_user()

    base_query = MonitorFollowup.query

    # Scope to inspector's own follow-ups
    if user.role not in ('admin', 'engineer'):
        base_query = base_query.filter(
            (MonitorFollowup.mechanical_inspector_id == user.id) |
            (MonitorFollowup.electrical_inspector_id == user.id)
        )

    pending_schedule = base_query.filter(
        MonitorFollowup.status == 'pending_schedule'
    ).count()

    scheduled = base_query.filter(
        MonitorFollowup.status == 'scheduled'
    ).count()

    overdue = base_query.filter(
        MonitorFollowup.is_overdue.is_(True)
    ).count()

    completed = base_query.filter(
        MonitorFollowup.status == 'completed'
    ).count()

    return jsonify({
        'status': 'success',
        'data': {
            'pending_schedule': pending_schedule,
            'scheduled': scheduled,
            'overdue': overdue,
            'completed': completed,
        },
    }), 200


# ── cancel (admin only) ─────────────────────────────────────────────────────

@bp.route('/<int:followup_id>', methods=['DELETE'])
@jwt_required()
@admin_required()
def cancel_followup(followup_id):
    """Cancel a follow-up. Admin only."""
    followup = _get_followup_or_404(followup_id)

    if followup.status == 'completed':
        raise ValidationError(message="Cannot cancel a completed follow-up")

    if followup.status == 'cancelled':
        raise ValidationError(message="Follow-up is already cancelled")

    followup.status = 'cancelled'
    followup.updated_at = datetime.utcnow()

    from app.extensions import db
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Follow-up cancelled',
        'data': followup.to_dict(),
    }), 200
