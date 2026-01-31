"""
Leave Management endpoints.
Leave requests, approvals, coverage assignment.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.leave_service import LeaveService
from app.services.coverage_service import CoverageService
from app.utils.decorators import get_current_user, admin_required, get_language
from app.models import Leave
from app.utils.pagination import paginate
from datetime import date

bp = Blueprint('leaves', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
def list_leaves():
    """List leaves. Users see own, admins see all."""
    user = get_current_user()
    status = request.args.get('status')

    if user.role == 'admin':
        query = Leave.query
        if status:
            query = query.filter_by(status=status)
    else:
        query = Leave.query.filter_by(user_id=user.id)
        if status:
            query = query.filter_by(status=status)

    query = query.order_by(Leave.date_from.desc())
    items, pagination_meta = paginate(query)
    language = get_language(user)

    return jsonify({
        'status': 'success',
        'data': [l.to_dict(language=language) for l in items],
        'pagination': pagination_meta
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
def request_leave():
    """Submit a leave request.

    If caller is admin or engineer, they can specify user_id in the body
    to create a leave on behalf of another user.
    If caller is admin, the leave is auto-approved.
    """
    user = get_current_user()
    data = request.get_json()

    # Determine the target user
    target_user_id = user.id
    if data.get('user_id') and user.role in ('admin', 'engineer'):
        target_user_id = int(data['user_id'])

    leave = LeaveService.request_leave(
        user_id=target_user_id,
        leave_type=data['leave_type'],
        date_from=date.fromisoformat(data['date_from']),
        date_to=date.fromisoformat(data['date_to']),
        reason=data['reason'],
        scope=data.get('scope', 'full')
    )

    # If caller is admin, auto-approve the leave
    if user.role == 'admin':
        leave = LeaveService.approve_leave(
            leave_id=leave.id,
            approved_by=user.id
        )

    # Auto-translate leave reason
    from app.utils.bilingual import auto_translate_and_save
    auto_translate_and_save('leave', leave.id, {'reason': data['reason']})

    return jsonify({
        'status': 'success',
        'message': 'Leave request submitted',
        'data': leave.to_dict()
    }), 201


@bp.route('/<int:leave_id>/approve', methods=['POST'])
@jwt_required()
@admin_required()
def approve_leave(leave_id):
    """Approve leave request."""
    user = get_current_user()
    data = request.get_json() or {}

    leave = LeaveService.approve_leave(
        leave_id=leave_id,
        approved_by=user.id,
        coverage_user_id=data.get('coverage_user_id')
    )

    return jsonify({
        'status': 'success',
        'message': 'Leave approved',
        'data': leave.to_dict()
    }), 200


@bp.route('/<int:leave_id>/reject', methods=['POST'])
@jwt_required()
@admin_required()
def reject_leave(leave_id):
    """Reject leave request."""
    user = get_current_user()
    data = request.get_json() or {}

    leave = LeaveService.reject_leave(
        leave_id=leave_id,
        rejected_by=user.id,
        reason=data.get('reason')
    )

    return jsonify({
        'status': 'success',
        'message': 'Leave rejected',
        'data': leave.to_dict()
    }), 200


@bp.route('/active', methods=['GET'])
@jwt_required()
def active_leaves():
    """Get currently active leaves."""
    leaves = LeaveService.get_active_leaves()
    return jsonify({
        'status': 'success',
        'data': [l.to_dict() for l in leaves]
    }), 200


@bp.route('/<int:leave_id>/coverage/candidates', methods=['GET'])
@jwt_required()
@admin_required()
def coverage_candidates(leave_id):
    """Get ranked coverage candidates for a leave."""
    candidates = CoverageService.get_coverage_candidates(leave_id)
    return jsonify({
        'status': 'success',
        'data': candidates
    }), 200


@bp.route('/<int:leave_id>/coverage/assign', methods=['POST'])
@jwt_required()
@admin_required()
def assign_coverage(leave_id):
    """Assign coverage user for a leave."""
    data = request.get_json()
    leave = CoverageService.assign_coverage(
        leave_id=leave_id,
        coverage_user_id=data['coverage_user_id']
    )

    return jsonify({
        'status': 'success',
        'message': 'Coverage assigned',
        'data': leave.to_dict()
    }), 200


@bp.route('/capacity', methods=['GET'])
@jwt_required()
@admin_required()
def capacity_analysis():
    """Get workforce capacity analysis."""
    shift = request.args.get('shift')
    analysis = CoverageService.get_capacity_analysis(shift)

    return jsonify({
        'status': 'success',
        'data': analysis
    }), 200
