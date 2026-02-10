"""
Inspection Assignment endpoints.
Engineer assigns 2-person teams (Mechanical + Electrical) per asset.
Enhanced with stats, filters, bulk actions, and AI suggestions.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.inspection_list_service import InspectionListService
from app.utils.decorators import get_current_user, admin_required, engineer_required, role_required, get_language
from app.models import InspectionList, InspectionAssignment, Equipment, User
from app.extensions import db
from sqlalchemy import func, and_, or_
from datetime import datetime, date, timedelta

bp = Blueprint('inspection_assignments', __name__)


# ============================================
# STATS & ANALYTICS
# ============================================

@bp.route('/stats', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_assignment_stats():
    """
    Get comprehensive assignment statistics for dashboard.
    Returns counts by status, trends, workload distribution.
    """
    today = date.today()
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    # Overall counts by status
    status_counts = db.session.query(
        InspectionAssignment.status,
        func.count(InspectionAssignment.id)
    ).group_by(InspectionAssignment.status).all()
    by_status = {status: count for status, count in status_counts}

    # Today's assignments
    today_lists = InspectionList.query.filter(
        InspectionList.target_date == today
    ).all()
    today_list_ids = [l.id for l in today_lists]

    today_total = InspectionAssignment.query.filter(
        InspectionAssignment.inspection_list_id.in_(today_list_ids)
    ).count() if today_list_ids else 0

    today_completed = InspectionAssignment.query.filter(
        InspectionAssignment.inspection_list_id.in_(today_list_ids),
        InspectionAssignment.status == 'completed'
    ).count() if today_list_ids else 0

    today_unassigned = InspectionAssignment.query.filter(
        InspectionAssignment.inspection_list_id.in_(today_list_ids),
        InspectionAssignment.status == 'unassigned'
    ).count() if today_list_ids else 0

    # Overdue/backlog count
    overdue_count = InspectionAssignment.query.filter(
        InspectionAssignment.backlog_triggered == True,
        InspectionAssignment.status.in_(['assigned', 'in_progress'])
    ).count()

    # Completion rate (last 7 days)
    week_lists = InspectionList.query.filter(
        InspectionList.target_date >= week_ago,
        InspectionList.target_date <= today
    ).all()
    week_list_ids = [l.id for l in week_lists]

    if week_list_ids:
        week_total = InspectionAssignment.query.filter(
            InspectionAssignment.inspection_list_id.in_(week_list_ids)
        ).count()
        week_completed = InspectionAssignment.query.filter(
            InspectionAssignment.inspection_list_id.in_(week_list_ids),
            InspectionAssignment.status == 'completed'
        ).count()
        completion_rate = round((week_completed / week_total * 100), 1) if week_total > 0 else 0
    else:
        week_total = 0
        week_completed = 0
        completion_rate = 0

    # By shift distribution
    shift_counts = db.session.query(
        InspectionList.shift,
        func.count(InspectionAssignment.id)
    ).join(InspectionAssignment).filter(
        InspectionList.target_date >= week_ago
    ).group_by(InspectionList.shift).all()
    by_shift = {shift: count for shift, count in shift_counts}

    # By equipment type
    equipment_counts = db.session.query(
        Equipment.equipment_type,
        func.count(InspectionAssignment.id)
    ).join(InspectionAssignment).filter(
        InspectionAssignment.created_at >= week_ago
    ).group_by(Equipment.equipment_type).all()
    by_equipment_type = {eq_type or 'Unknown': count for eq_type, count in equipment_counts}

    # Inspector workload (top 10 busiest)
    inspector_workload = db.session.query(
        User.id, User.full_name,
        func.count(InspectionAssignment.id).label('active_count')
    ).join(
        InspectionAssignment,
        or_(
            InspectionAssignment.mechanical_inspector_id == User.id,
            InspectionAssignment.electrical_inspector_id == User.id
        )
    ).filter(
        InspectionAssignment.status.in_(['assigned', 'in_progress']),
        User.is_active == True
    ).group_by(User.id, User.full_name).order_by(
        func.count(InspectionAssignment.id).desc()
    ).limit(10).all()

    workload_list = [
        {'id': id, 'name': name, 'active_assignments': count}
        for id, name, count in inspector_workload
    ]

    # Daily trend (last 7 days)
    daily_trend = []
    for i in range(7):
        d = today - timedelta(days=i)
        day_lists = InspectionList.query.filter(InspectionList.target_date == d).all()
        day_list_ids = [l.id for l in day_lists]
        if day_list_ids:
            total = InspectionAssignment.query.filter(
                InspectionAssignment.inspection_list_id.in_(day_list_ids)
            ).count()
            completed = InspectionAssignment.query.filter(
                InspectionAssignment.inspection_list_id.in_(day_list_ids),
                InspectionAssignment.status == 'completed'
            ).count()
        else:
            total = 0
            completed = 0
        daily_trend.append({
            'date': d.isoformat(),
            'total': total,
            'completed': completed
        })

    return jsonify({
        'status': 'success',
        'data': {
            'by_status': by_status,
            'today': {
                'total': today_total,
                'completed': today_completed,
                'unassigned': today_unassigned,
                'in_progress': today_total - today_completed - today_unassigned
            },
            'overdue_count': overdue_count,
            'completion_rate': completion_rate,
            'week_stats': {
                'total': week_total,
                'completed': week_completed
            },
            'by_shift': by_shift,
            'by_equipment_type': by_equipment_type,
            'inspector_workload': workload_list,
            'daily_trend': daily_trend
        }
    }), 200


# ============================================
# ENHANCED LIST WITH FILTERS
# ============================================


@bp.route('/lists', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_lists():
    """
    Get inspection lists with assignments.
    Enhanced with multiple filters.

    Query params:
        date: specific date (YYYY-MM-DD)
        date_from: start date range
        date_to: end date range
        shift: 'day' or 'night'
        status: assignment status filter
        equipment_type: filter by equipment type
        berth: filter by berth location
        inspector_id: filter by assigned inspector
        unassigned_only: show only unassigned (true/false)
    """
    language = get_language()

    # Base query
    query = InspectionList.query

    # Date filters
    target = request.args.get('date')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')

    if target:
        query = query.filter(InspectionList.target_date == date.fromisoformat(target))
    else:
        if date_from:
            query = query.filter(InspectionList.target_date >= date.fromisoformat(date_from))
        if date_to:
            query = query.filter(InspectionList.target_date <= date.fromisoformat(date_to))

    # Shift filter
    shift = request.args.get('shift')
    if shift:
        query = query.filter(InspectionList.shift == shift)

    lists = query.order_by(InspectionList.target_date.desc()).limit(50).all()

    # Assignment-level filters
    status_filter = request.args.get('status')
    equipment_type_filter = request.args.get('equipment_type')
    berth_filter = request.args.get('berth')
    inspector_id = request.args.get('inspector_id', type=int)
    unassigned_only = request.args.get('unassigned_only', '').lower() == 'true'

    result = []
    for il in lists:
        assignments_query = il.assignments

        # Apply assignment filters
        if status_filter:
            assignments_query = assignments_query.filter(InspectionAssignment.status == status_filter)

        if unassigned_only:
            assignments_query = assignments_query.filter(InspectionAssignment.status == 'unassigned')

        if berth_filter:
            assignments_query = assignments_query.filter(InspectionAssignment.berth == berth_filter)

        if inspector_id:
            assignments_query = assignments_query.filter(
                or_(
                    InspectionAssignment.mechanical_inspector_id == inspector_id,
                    InspectionAssignment.electrical_inspector_id == inspector_id
                )
            )

        if equipment_type_filter:
            assignments_query = assignments_query.join(Equipment).filter(
                Equipment.equipment_type == equipment_type_filter
            )

        assignments = assignments_query.all()

        # Only include lists that have matching assignments
        if assignments or not any([status_filter, equipment_type_filter, berth_filter, inspector_id, unassigned_only]):
            d = il.to_dict()
            d['assignments'] = [a.to_dict(language=language) for a in assignments]
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


# ============================================
# BULK ACTIONS
# ============================================

@bp.route('/bulk-assign', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def bulk_assign():
    """
    Bulk assign teams to multiple assignments.

    Request Body:
        {
            "assignments": [
                {"assignment_id": 1, "mechanical_inspector_id": 2, "electrical_inspector_id": 3},
                ...
            ]
        }

    Or for auto-assign mode:
        {
            "assignment_ids": [1, 2, 3],
            "auto_assign": true
        }
    """
    data = request.get_json()
    current_user_id = int(get_jwt_identity())
    language = get_language()

    results = {
        'success': [],
        'errors': []
    }

    if data.get('auto_assign'):
        # Auto-assign using AI suggestions
        assignment_ids = data.get('assignment_ids', [])

        for assignment_id in assignment_ids:
            try:
                assignment = db.session.get(InspectionAssignment, assignment_id)
                if not assignment:
                    results['errors'].append({
                        'assignment_id': assignment_id,
                        'error': 'Assignment not found'
                    })
                    continue

                if assignment.status != 'unassigned':
                    results['errors'].append({
                        'assignment_id': assignment_id,
                        'error': 'Already assigned'
                    })
                    continue

                # Get AI suggestion for this assignment
                suggestion = _get_ai_suggestion_for_assignment(assignment)

                if suggestion and suggestion.get('mechanical') and suggestion.get('electrical'):
                    updated = InspectionListService.assign_team(
                        assignment_id=assignment_id,
                        mechanical_inspector_id=suggestion['mechanical']['id'],
                        electrical_inspector_id=suggestion['electrical']['id'],
                        assigned_by_id=current_user_id
                    )
                    results['success'].append({
                        'assignment_id': assignment_id,
                        'data': updated.to_dict(language=language)
                    })
                else:
                    results['errors'].append({
                        'assignment_id': assignment_id,
                        'error': 'No suitable inspectors available'
                    })
            except Exception as e:
                results['errors'].append({
                    'assignment_id': assignment_id,
                    'error': str(e)
                })
    else:
        # Manual bulk assignment
        assignments_data = data.get('assignments', [])

        for item in assignments_data:
            assignment_id = item.get('assignment_id')
            mech_id = item.get('mechanical_inspector_id')
            elec_id = item.get('electrical_inspector_id')

            if not all([assignment_id, mech_id, elec_id]):
                results['errors'].append({
                    'assignment_id': assignment_id,
                    'error': 'Missing required fields'
                })
                continue

            try:
                updated = InspectionListService.assign_team(
                    assignment_id=assignment_id,
                    mechanical_inspector_id=mech_id,
                    electrical_inspector_id=elec_id,
                    assigned_by_id=current_user_id
                )
                results['success'].append({
                    'assignment_id': assignment_id,
                    'data': updated.to_dict(language=language)
                })
            except Exception as e:
                results['errors'].append({
                    'assignment_id': assignment_id,
                    'error': str(e)
                })

    return jsonify({
        'status': 'success',
        'data': results,
        'summary': {
            'total': len(results['success']) + len(results['errors']),
            'successful': len(results['success']),
            'failed': len(results['errors'])
        }
    }), 200


# ============================================
# AI-POWERED SUGGESTIONS
# ============================================

def _get_ai_suggestion_for_assignment(assignment):
    """
    Get AI-powered inspector suggestion for an assignment.
    Uses roster workload and availability data.
    """
    from app.models import RosterEntry, Leave

    target_date = None
    shift = None

    # Get list info
    if assignment.inspection_list_id:
        il = db.session.get(InspectionList, assignment.inspection_list_id)
        if il:
            target_date = il.target_date
            shift = il.shift

    if not target_date:
        target_date = date.today()
    if not shift:
        shift = 'day'

    # Get available inspectors
    available_mech = []
    available_elec = []

    # Query inspectors
    inspectors = User.query.filter(
        User.role == 'inspector',
        User.is_active == True
    ).all()

    # Check each inspector's availability
    for inspector in inspectors:
        # Check if on leave
        on_leave = Leave.query.filter(
            Leave.user_id == inspector.id,
            Leave.status == 'approved',
            Leave.date_from <= target_date,
            Leave.date_to >= target_date
        ).first()

        if on_leave:
            continue

        # Check roster entry
        roster = RosterEntry.query.filter(
            RosterEntry.user_id == inspector.id,
            RosterEntry.date == target_date
        ).first()

        # Skip if on different shift or off
        if roster and roster.shift_type not in (shift, 'leave'):
            if roster.shift_type == 'off':
                continue

        # Count current assignments for workload
        current_load = InspectionAssignment.query.filter(
            or_(
                InspectionAssignment.mechanical_inspector_id == inspector.id,
                InspectionAssignment.electrical_inspector_id == inspector.id
            ),
            InspectionAssignment.status.in_(['assigned', 'in_progress'])
        ).count()

        inspector_data = {
            'id': inspector.id,
            'name': inspector.full_name,
            'specialization': inspector.specialization,
            'current_load': current_load,
            'score': max(0, 10 - current_load)  # Simple scoring: lower load = higher score
        }

        if inspector.specialization == 'mechanical':
            available_mech.append(inspector_data)
        elif inspector.specialization == 'electrical':
            available_elec.append(inspector_data)

    # Sort by score (highest first)
    available_mech.sort(key=lambda x: x['score'], reverse=True)
    available_elec.sort(key=lambda x: x['score'], reverse=True)

    result = {
        'mechanical': available_mech[0] if available_mech else None,
        'electrical': available_elec[0] if available_elec else None
    }

    return result


@bp.route('/ai-suggest', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def ai_suggest_assignment():
    """
    Get AI-powered suggestions for assigning inspectors.

    Request Body:
        {
            "assignment_id": 1,
            "date": "2026-02-10",  // optional, for context
            "shift": "day"  // optional
        }

    Returns top suggestions for mechanical and electrical inspectors
    based on workload, availability, and fatigue levels.
    """
    data = request.get_json()
    assignment_id = data.get('assignment_id')

    if not assignment_id:
        return jsonify({
            'status': 'error',
            'message': 'assignment_id is required'
        }), 400

    assignment = db.session.get(InspectionAssignment, assignment_id)
    if not assignment:
        return jsonify({
            'status': 'error',
            'message': 'Assignment not found'
        }), 404

    # Get target date and shift from list
    target_date = date.fromisoformat(data['date']) if data.get('date') else None
    shift = data.get('shift')

    if assignment.inspection_list_id:
        il = db.session.get(InspectionList, assignment.inspection_list_id)
        if il:
            target_date = target_date or il.target_date
            shift = shift or il.shift

    if not target_date:
        target_date = date.today()
    if not shift:
        shift = 'day'

    # Get available inspectors with detailed info
    from app.models import RosterEntry, Leave

    mechanical_suggestions = []
    electrical_suggestions = []

    inspectors = User.query.filter(
        User.role == 'inspector',
        User.is_active == True
    ).all()

    for inspector in inspectors:
        # Check leave status
        on_leave = Leave.query.filter(
            Leave.user_id == inspector.id,
            Leave.status == 'approved',
            Leave.date_from <= target_date,
            Leave.date_to >= target_date
        ).first()

        if on_leave:
            continue

        # Check roster
        roster = RosterEntry.query.filter(
            RosterEntry.user_id == inspector.id,
            RosterEntry.date == target_date
        ).first()

        roster_status = 'available'
        if roster:
            if roster.shift_type == 'off':
                continue
            if roster.shift_type != shift:
                roster_status = 'different_shift'

        # Calculate workload
        active_assignments = InspectionAssignment.query.filter(
            or_(
                InspectionAssignment.mechanical_inspector_id == inspector.id,
                InspectionAssignment.electrical_inspector_id == inspector.id
            ),
            InspectionAssignment.status.in_(['assigned', 'in_progress'])
        ).count()

        # Calculate score (0-100)
        workload_score = max(0, 100 - (active_assignments * 15))
        availability_score = 100 if roster_status == 'available' else 50

        total_score = int((workload_score * 0.7) + (availability_score * 0.3))

        suggestion = {
            'id': inspector.id,
            'name': inspector.full_name,
            'specialization': inspector.specialization,
            'shift': inspector.shift,
            'active_assignments': active_assignments,
            'roster_status': roster_status,
            'match_score': total_score,
            'factors': {
                'workload': 'low' if active_assignments < 3 else 'medium' if active_assignments < 5 else 'high',
                'availability': roster_status
            }
        }

        if inspector.specialization == 'mechanical':
            mechanical_suggestions.append(suggestion)
        elif inspector.specialization == 'electrical':
            electrical_suggestions.append(suggestion)

    # Sort by score
    mechanical_suggestions.sort(key=lambda x: x['match_score'], reverse=True)
    electrical_suggestions.sort(key=lambda x: x['match_score'], reverse=True)

    # Get equipment info for context
    equipment = db.session.get(Equipment, assignment.equipment_id) if assignment.equipment_id else None

    return jsonify({
        'status': 'success',
        'data': {
            'assignment': {
                'id': assignment.id,
                'equipment': equipment.name if equipment else None,
                'equipment_type': equipment.equipment_type if equipment else None,
                'berth': assignment.berth
            },
            'context': {
                'date': target_date.isoformat(),
                'shift': shift
            },
            'suggestions': {
                'mechanical': mechanical_suggestions[:5],
                'electrical': electrical_suggestions[:5]
            },
            'recommended': {
                'mechanical': mechanical_suggestions[0] if mechanical_suggestions else None,
                'electrical': electrical_suggestions[0] if electrical_suggestions else None
            }
        }
    }), 200


@bp.route('/calendar', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer')
def get_calendar_view():
    """
    Get assignments in calendar format for week view.

    Query params:
        week_start: start date of week (YYYY-MM-DD)
        shift: filter by shift (optional)
    """
    week_start_str = request.args.get('week_start')
    shift_filter = request.args.get('shift')

    if week_start_str:
        week_start = date.fromisoformat(week_start_str)
    else:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())

    week_end = week_start + timedelta(days=6)
    language = get_language()

    # Get lists for the week
    query = InspectionList.query.filter(
        InspectionList.target_date >= week_start,
        InspectionList.target_date <= week_end
    )

    if shift_filter:
        query = query.filter(InspectionList.shift == shift_filter)

    lists = query.order_by(InspectionList.target_date, InspectionList.shift).all()

    # Organize by day
    calendar_data = {}
    for i in range(7):
        d = week_start + timedelta(days=i)
        calendar_data[d.isoformat()] = {
            'date': d.isoformat(),
            'day_name': d.strftime('%A'),
            'day': [],
            'night': []
        }

    for il in lists:
        day_key = il.target_date.isoformat()
        if day_key in calendar_data:
            assignments = [a.to_dict(language=language) for a in il.assignments.all()]
            calendar_data[day_key][il.shift] = assignments

    # Calculate daily stats
    for day_key in calendar_data:
        day_data = calendar_data[day_key]
        all_assignments = day_data['day'] + day_data['night']
        day_data['stats'] = {
            'total': len(all_assignments),
            'unassigned': sum(1 for a in all_assignments if a.get('status') == 'unassigned'),
            'completed': sum(1 for a in all_assignments if a.get('status') == 'completed'),
            'in_progress': sum(1 for a in all_assignments if a.get('status') in ('assigned', 'in_progress'))
        }

    return jsonify({
        'status': 'success',
        'data': {
            'week_start': week_start.isoformat(),
            'week_end': week_end.isoformat(),
            'days': list(calendar_data.values())
        }
    }), 200
