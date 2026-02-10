"""
Unified Approvals API.
Combines leaves, pauses, bonuses, and takeovers into a single endpoint.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db, safe_commit
from app.models import Leave, PauseLog, BonusStar, JobTakeover, User
from app.utils.decorators import get_current_user, admin_required
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from datetime import datetime
from sqlalchemy import or_

bp = Blueprint('approvals', __name__)


def leave_to_approval(leave):
    """Transform Leave to unified approval format."""
    return {
        'id': leave.id,
        'type': 'leave',
        'status': leave.status,
        'requested_at': leave.created_at.isoformat() if leave.created_at else None,
        'requested_by': {
            'id': leave.user_id,
            'name': leave.user.full_name if leave.user else f'User #{leave.user_id}',
            'role': leave.user.role if leave.user else None,
        },
        'details': {
            'leave_type': leave.leave_type,
            'date_from': leave.date_from.isoformat() if leave.date_from else None,
            'date_to': leave.date_to.isoformat() if leave.date_to else None,
            'total_days': leave.total_days,
            'reason': leave.reason,
            'scope': leave.scope,
        }
    }


def pause_to_approval(pause):
    """Transform PauseLog to unified approval format."""
    requester = db.session.get(User, pause.requested_by)
    return {
        'id': pause.id,
        'type': 'pause',
        'status': pause.status,
        'requested_at': pause.requested_at.isoformat() if pause.requested_at else None,
        'requested_by': {
            'id': pause.requested_by,
            'name': requester.full_name if requester else f'User #{pause.requested_by}',
            'role': requester.role if requester else None,
        },
        'details': {
            'pause_category': pause.reason_category,
            'pause_details': pause.reason_details,
            'job_type': pause.job_type,
            'job_id': pause.job_id,
        }
    }


def bonus_to_approval(bonus):
    """Transform BonusStar to unified approval format."""
    requester = db.session.get(User, bonus.qe_requester_id) if bonus.qe_requester_id else None
    target_user = db.session.get(User, bonus.user_id)
    return {
        'id': bonus.id,
        'type': 'bonus',
        'status': bonus.request_status or 'pending',
        'requested_at': bonus.awarded_at.isoformat() if bonus.awarded_at else None,
        'requested_by': {
            'id': bonus.qe_requester_id or 0,
            'name': requester.full_name if requester else 'Unknown',
            'role': requester.role if requester else None,
        },
        'details': {
            'amount': bonus.amount,
            'reason': bonus.reason,
            'target_user': {
                'id': bonus.user_id,
                'name': target_user.full_name if target_user else f'User #{bonus.user_id}',
            },
            'related_job_type': bonus.related_job_type,
            'related_job_id': bonus.related_job_id,
        }
    }


def takeover_to_approval(takeover):
    """Transform JobTakeover to unified approval format."""
    requester = db.session.get(User, takeover.requested_by)
    # Map 'denied' to 'rejected' for consistency
    status = takeover.status
    if status == 'denied':
        status = 'rejected'
    elif status == 'completed':
        status = 'approved'

    return {
        'id': takeover.id,
        'type': 'takeover',
        'status': status,
        'requested_at': takeover.created_at.isoformat() if takeover.created_at else None,
        'requested_by': {
            'id': takeover.requested_by,
            'name': requester.full_name if requester else f'User #{takeover.requested_by}',
            'role': requester.role if requester else None,
        },
        'details': {
            'job_type': takeover.job_type,
            'job_id': takeover.job_id,
            'queue_position': takeover.queue_position,
            'takeover_reason': takeover.reason,
        }
    }


@bp.route('', methods=['GET'])
@jwt_required()
@admin_required()
def list_approvals():
    """
    List all pending approvals (combines leaves, pauses, bonuses, takeovers).

    Query params:
    - type: filter by type (leave, pause, bonus, takeover)
    - status: filter by status (pending, approved, rejected)
    - date_from: filter by date (ISO format)
    - date_to: filter by date (ISO format)
    """
    approval_type = request.args.get('type')
    status = request.args.get('status')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')

    approvals = []

    # Fetch leaves
    if not approval_type or approval_type == 'leave':
        query = Leave.query
        if status:
            query = query.filter(Leave.status == status)
        else:
            # Default to pending
            query = query.filter(Leave.status == 'pending')
        if date_from:
            query = query.filter(Leave.created_at >= date_from)
        if date_to:
            query = query.filter(Leave.created_at <= date_to)
        leaves = query.order_by(Leave.created_at.desc()).limit(100).all()
        approvals.extend([leave_to_approval(l) for l in leaves])

    # Fetch pauses
    if not approval_type or approval_type == 'pause':
        query = PauseLog.query
        if status:
            query = query.filter(PauseLog.status == status)
        else:
            query = query.filter(PauseLog.status == 'pending')
        if date_from:
            query = query.filter(PauseLog.requested_at >= date_from)
        if date_to:
            query = query.filter(PauseLog.requested_at <= date_to)
        pauses = query.order_by(PauseLog.requested_at.desc()).limit(100).all()
        approvals.extend([pause_to_approval(p) for p in pauses])

    # Fetch bonus requests (only QE requests)
    if not approval_type or approval_type == 'bonus':
        query = BonusStar.query.filter(BonusStar.is_qe_request == True)
        if status:
            query = query.filter(BonusStar.request_status == status)
        else:
            query = query.filter(BonusStar.request_status == 'pending')
        if date_from:
            query = query.filter(BonusStar.awarded_at >= date_from)
        if date_to:
            query = query.filter(BonusStar.awarded_at <= date_to)
        bonuses = query.order_by(BonusStar.awarded_at.desc()).limit(100).all()
        approvals.extend([bonus_to_approval(b) for b in bonuses])

    # Fetch takeovers
    if not approval_type or approval_type == 'takeover':
        query = JobTakeover.query
        if status:
            # Map 'rejected' back to 'denied' for database query
            db_status = status
            if status == 'rejected':
                db_status = 'denied'
            query = query.filter(JobTakeover.status == db_status)
        else:
            query = query.filter(JobTakeover.status == 'pending')
        if date_from:
            query = query.filter(JobTakeover.created_at >= date_from)
        if date_to:
            query = query.filter(JobTakeover.created_at <= date_to)
        takeovers = query.order_by(JobTakeover.created_at.desc()).limit(100).all()
        approvals.extend([takeover_to_approval(t) for t in takeovers])

    # Sort all by requested_at descending
    approvals.sort(key=lambda x: x['requested_at'] or '', reverse=True)

    # Calculate counts
    pending_leaves = Leave.query.filter(Leave.status == 'pending').count()
    pending_pauses = PauseLog.query.filter(PauseLog.status == 'pending').count()
    pending_bonuses = BonusStar.query.filter(
        BonusStar.is_qe_request == True,
        BonusStar.request_status == 'pending'
    ).count()
    pending_takeovers = JobTakeover.query.filter(JobTakeover.status == 'pending').count()

    return jsonify({
        'status': 'success',
        'data': approvals,
        'counts': {
            'leave': pending_leaves,
            'pause': pending_pauses,
            'bonus': pending_bonuses,
            'takeover': pending_takeovers,
            'total': pending_leaves + pending_pauses + pending_bonuses + pending_takeovers,
        }
    }), 200


@bp.route('/bulk-action', methods=['POST'])
@jwt_required()
@admin_required()
def bulk_action():
    """
    Perform bulk approve/reject on multiple approvals.

    Body:
    {
        "items": [
            {"type": "leave", "id": 1},
            {"type": "pause", "id": 2},
            ...
        ],
        "action": "approve" | "reject",
        "reason": "optional rejection reason"
    }
    """
    user = get_current_user()
    data = request.get_json()

    items = data.get('items', [])
    action = data.get('action')
    reason = data.get('reason')

    if not items:
        raise ValidationError("No items provided")
    if action not in ('approve', 'reject'):
        raise ValidationError("Action must be 'approve' or 'reject'")

    results = []
    success_count = 0
    failed_count = 0

    for item in items:
        item_type = item.get('type')
        item_id = item.get('id')

        try:
            if item_type == 'leave':
                leave = db.session.get(Leave, item_id)
                if not leave or leave.status != 'pending':
                    raise ValidationError(f"Leave {item_id} not found or not pending")

                if action == 'approve':
                    leave.status = 'approved'
                    leave.approved_by_id = user.id
                    leave.approved_at = datetime.utcnow()
                else:
                    leave.status = 'rejected'
                    leave.approved_by_id = user.id
                    leave.approved_at = datetime.utcnow()
                    leave.rejection_reason = reason

            elif item_type == 'pause':
                pause = db.session.get(PauseLog, item_id)
                if not pause or pause.status != 'pending':
                    raise ValidationError(f"Pause {item_id} not found or not pending")

                if action == 'approve':
                    pause.status = 'approved'
                    pause.approved_by = user.id
                    pause.approved_at = datetime.utcnow()
                else:
                    pause.status = 'rejected'
                    pause.approved_by = user.id
                    pause.approved_at = datetime.utcnow()

            elif item_type == 'bonus':
                bonus = db.session.get(BonusStar, item_id)
                if not bonus or not bonus.is_qe_request or bonus.request_status != 'pending':
                    raise ValidationError(f"Bonus {item_id} not found or not pending")

                if action == 'approve':
                    bonus.request_status = 'approved'
                    bonus.awarded_by = user.id
                    # Award the points
                    target_user = db.session.get(User, bonus.user_id)
                    if target_user:
                        target_user.add_points(bonus.amount, target_user.role)
                else:
                    bonus.request_status = 'rejected'

            elif item_type == 'takeover':
                from app.services.takeover_service import TakeoverService
                if action == 'approve':
                    TakeoverService.approve_takeover(item_id, user.id)
                else:
                    TakeoverService.deny_takeover(item_id, user.id)

            else:
                raise ValidationError(f"Unknown type: {item_type}")

            results.append({
                'type': item_type,
                'id': item_id,
                'success': True
            })
            success_count += 1

        except Exception as e:
            results.append({
                'type': item_type,
                'id': item_id,
                'success': False,
                'error': str(e)
            })
            failed_count += 1

    safe_commit()

    return jsonify({
        'status': 'success',
        'message': f'{action.capitalize()}d {success_count} items, {failed_count} failed',
        'data': {
            'success_count': success_count,
            'failed_count': failed_count,
            'results': results
        }
    }), 200


@bp.route('/counts', methods=['GET'])
@jwt_required()
@admin_required()
def get_counts():
    """Get pending approval counts by type."""
    pending_leaves = Leave.query.filter(Leave.status == 'pending').count()
    pending_pauses = PauseLog.query.filter(PauseLog.status == 'pending').count()
    pending_bonuses = BonusStar.query.filter(
        BonusStar.is_qe_request == True,
        BonusStar.request_status == 'pending'
    ).count()
    pending_takeovers = JobTakeover.query.filter(JobTakeover.status == 'pending').count()

    return jsonify({
        'status': 'success',
        'data': {
            'leave': pending_leaves,
            'pause': pending_pauses,
            'bonus': pending_bonuses,
            'takeover': pending_takeovers,
            'total': pending_leaves + pending_pauses + pending_bonuses + pending_takeovers,
        }
    }), 200


@bp.route('/takeovers/pending', methods=['GET'])
@jwt_required()
@admin_required()
def list_pending_takeovers():
    """List all pending takeover requests."""
    takeovers = JobTakeover.query.filter(
        JobTakeover.status == 'pending'
    ).order_by(JobTakeover.created_at.desc()).all()

    return jsonify({
        'status': 'success',
        'data': [takeover_to_approval(t) for t in takeovers]
    }), 200


@bp.route('/takeovers/<int:takeover_id>/approve', methods=['POST'])
@jwt_required()
@admin_required()
def approve_takeover(takeover_id):
    """Approve a takeover request."""
    user = get_current_user()
    from app.services.takeover_service import TakeoverService

    takeover = TakeoverService.approve_takeover(takeover_id, user.id)

    return jsonify({
        'status': 'success',
        'message': 'Takeover approved',
        'data': takeover_to_approval(takeover)
    }), 200


@bp.route('/takeovers/<int:takeover_id>/deny', methods=['POST'])
@jwt_required()
@admin_required()
def deny_takeover(takeover_id):
    """Deny a takeover request."""
    user = get_current_user()
    from app.services.takeover_service import TakeoverService

    takeover = TakeoverService.deny_takeover(takeover_id, user.id)

    return jsonify({
        'status': 'success',
        'message': 'Takeover denied',
        'data': takeover_to_approval(takeover)
    }), 200
