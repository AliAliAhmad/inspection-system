"""
Inspection Assignment endpoints.
Engineer assigns 2-person teams (Mechanical + Electrical) per asset.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.inspection_list_service import InspectionListService
from app.utils.decorators import get_current_user, admin_required, engineer_required, role_required, get_language
from app.models import InspectionList, InspectionAssignment
from datetime import datetime, date

bp = Blueprint('inspection_assignments', __name__)


@bp.route('/lists', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_lists():
    """Get inspection lists with assignments. Filter by date."""
    target = request.args.get('date')
    language = get_language()
    if target:
        target_date = date.fromisoformat(target)
        lists = InspectionListService.get_lists_for_date(target_date)
    else:
        lists = InspectionList.query.order_by(InspectionList.target_date.desc()).limit(20).all()

    result = []
    for il in lists:
        d = il.to_dict()
        d['assignments'] = [a.to_dict(language=language) for a in il.assignments.all()]
        result.append(d)

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/lists/generate', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def generate_list():
    """Generate inspection list for a date and shift."""
    data = request.get_json()
    target_date = date.fromisoformat(data['target_date'])
    shift = data['shift']

    il = InspectionListService.generate_daily_list(target_date, shift)

    return jsonify({
        'status': 'success',
        'message': f'Generated {il.total_assets} assignments for {target_date} {shift} shift',
        'data': il.to_dict()
    }), 201


@bp.route('/lists/<int:list_id>', methods=['GET'])
@jwt_required()
def get_list(list_id):
    """Get inspection list with assignments."""
    il = InspectionListService.get_list(list_id)
    assignments = il.assignments.all()

    return jsonify({
        'status': 'success',
        'data': {
            **il.to_dict(),
            'assignments': [a.to_dict(language=get_language()) for a in assignments]
        }
    }), 200


@bp.route('/<int:assignment_id>/assign', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def assign_team(assignment_id):
    """Assign 2-person inspection team to an asset."""
    data = request.get_json()
    current_user_id = get_jwt_identity()

    assignment = InspectionListService.assign_team(
        assignment_id=assignment_id,
        mechanical_inspector_id=data['mechanical_inspector_id'],
        electrical_inspector_id=data['electrical_inspector_id'],
        assigned_by_id=int(current_user_id)
    )

    auto_count = getattr(assignment, '_auto_assigned_count', 0)
    msg = 'Team assigned successfully'
    if auto_count > 0:
        msg += f' (also auto-assigned to {auto_count} other equipment at berth {assignment.berth})'

    return jsonify({
        'status': 'success',
        'message': msg,
        'data': assignment.to_dict(),
        'auto_assigned': auto_count,
    }), 200


@bp.route('/<int:assignment_id>/berth', methods=['PUT'])
@jwt_required()
@role_required('admin', 'engineer')
def update_berth(assignment_id):
    """Engineer updates verified berth."""
    data = request.get_json()
    current_user_id = get_jwt_identity()

    assignment = InspectionListService.update_berth(
        assignment_id=assignment_id,
        new_berth=data['berth'],
        engineer_id=int(current_user_id)
    )

    return jsonify({
        'status': 'success',
        'data': assignment.to_dict()
    }), 200


@bp.route('/my-assignments', methods=['GET'])
@jwt_required()
def my_assignments():
    """Get current user's inspection assignments."""
    user = get_current_user()
    today = date.today()

    query = InspectionAssignment.query.filter(
        (InspectionAssignment.mechanical_inspector_id == user.id) |
        (InspectionAssignment.electrical_inspector_id == user.id)
    )

    date_filter = request.args.get('date')
    if date_filter:
        query = query.join(InspectionList).filter(
            InspectionList.target_date == date.fromisoformat(date_filter)
        )

    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)

    assignments = query.order_by(InspectionAssignment.created_at.desc()).all()

    return jsonify({
        'status': 'success',
        'data': [a.to_dict() for a in assignments]
    }), 200


@bp.route('/<int:assignment_id>/complete', methods=['POST'])
@jwt_required()
def mark_complete(assignment_id):
    """Mark inspector's portion as complete."""
    user = get_current_user()
    assignment = InspectionListService.mark_inspector_complete(assignment_id, user.id)

    return jsonify({
        'status': 'success',
        'message': 'Your portion marked as complete',
        'data': assignment.to_dict()
    }), 200


@bp.route('/backlog', methods=['GET'])
@jwt_required()
def get_backlog():
    """Get backlog assignments (past deadline)."""
    InspectionListService.check_backlog()

    backlog = InspectionAssignment.query.filter_by(backlog_triggered=True).filter(
        InspectionAssignment.status.in_(['assigned', 'in_progress'])
    ).all()

    return jsonify({
        'status': 'success',
        'data': [a.to_dict() for a in backlog]
    }), 200
