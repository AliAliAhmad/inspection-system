"""
Unified Auto-Approval API endpoints.
Provides a single API for evaluating and auto-approving all approval types.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.services.auto_approval_service import auto_approval_service
from app.utils.decorators import get_current_user, admin_required
from app.exceptions.api_exceptions import ValidationError

bp = Blueprint('auto_approvals', __name__)


@bp.route('/evaluate/<approval_type>/<int:entity_id>', methods=['GET'])
@jwt_required()
@admin_required()
def evaluate_auto_approval(approval_type, entity_id):
    """
    Evaluate if an approval can be auto-approved.

    Args:
        approval_type: 'pause', 'takeover', 'bonus', or 'leave'
        entity_id: ID of the entity to evaluate

    Returns:
        {
            "can_auto_approve": true/false,
            "risk_score": 0-100,
            "reasons": ["..."],
            "recommendation": "Auto-approve" or "Manual review required",
            "checks": {"rule_name": true/false, ...}
        }
    """
    supported = auto_approval_service.get_supported_types()
    if approval_type not in supported:
        raise ValidationError(f"Invalid approval type. Supported: {', '.join(supported)}")

    result = auto_approval_service.evaluate(approval_type, entity_id)

    return jsonify({
        'status': 'success',
        'data': result.to_dict()
    }), 200


@bp.route('/auto-approve/<approval_type>/<int:entity_id>', methods=['POST'])
@jwt_required()
@admin_required()
def auto_approve_if_eligible(approval_type, entity_id):
    """
    Evaluate and auto-approve if eligible.
    Only approves if risk score is below threshold.

    Args:
        approval_type: 'pause', 'takeover', 'bonus', or 'leave'
        entity_id: ID of the entity

    Returns:
        {
            "auto_approved": true/false,
            "result": {...evaluation result...},
            "error": null or "error message"
        }
    """
    user = get_current_user()

    supported = auto_approval_service.get_supported_types()
    if approval_type not in supported:
        raise ValidationError(f"Invalid approval type. Supported: {', '.join(supported)}")

    result = auto_approval_service.auto_approve_if_eligible(
        approval_type=approval_type,
        entity_id=entity_id,
        approver_id=user.id
    )

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/bulk-evaluate', methods=['POST'])
@jwt_required()
@admin_required()
def bulk_evaluate():
    """
    Evaluate multiple approvals at once.

    Request body:
        {
            "items": [
                {"type": "pause", "id": 1},
                {"type": "takeover", "id": 2},
                {"type": "bonus", "id": 3}
            ]
        }

    Returns:
        {
            "results": [
                {"type": "pause", "id": 1, "can_auto_approve": true, ...},
                ...
            ],
            "summary": {
                "total": 3,
                "can_auto_approve": 2,
                "needs_review": 1
            }
        }
    """
    data = request.get_json()
    if not data or 'items' not in data:
        raise ValidationError("Request body with 'items' array required")

    items = data['items']
    if not isinstance(items, list):
        raise ValidationError("'items' must be an array")

    supported = auto_approval_service.get_supported_types()
    results = []
    can_auto_approve_count = 0

    for item in items:
        if not isinstance(item, dict) or 'type' not in item or 'id' not in item:
            results.append({
                'type': item.get('type'),
                'id': item.get('id'),
                'error': 'Invalid item format'
            })
            continue

        approval_type = item['type']
        entity_id = item['id']

        if approval_type not in supported:
            results.append({
                'type': approval_type,
                'id': entity_id,
                'error': f'Unsupported type: {approval_type}'
            })
            continue

        try:
            result = auto_approval_service.evaluate(approval_type, entity_id)
            result_dict = result.to_dict()
            result_dict['type'] = approval_type
            result_dict['id'] = entity_id
            results.append(result_dict)

            if result.can_auto_approve:
                can_auto_approve_count += 1
        except Exception as e:
            results.append({
                'type': approval_type,
                'id': entity_id,
                'error': str(e)
            })

    return jsonify({
        'status': 'success',
        'data': {
            'results': results,
            'summary': {
                'total': len(items),
                'can_auto_approve': can_auto_approve_count,
                'needs_review': len(items) - can_auto_approve_count
            }
        }
    }), 200


@bp.route('/bulk-auto-approve', methods=['POST'])
@jwt_required()
@admin_required()
def bulk_auto_approve():
    """
    Auto-approve multiple items that are eligible.

    Request body:
        {
            "items": [
                {"type": "pause", "id": 1},
                {"type": "bonus", "id": 5}
            ]
        }

    Returns:
        {
            "results": [...],
            "summary": {
                "total": 2,
                "approved": 1,
                "skipped": 1
            }
        }
    """
    user = get_current_user()
    data = request.get_json()

    if not data or 'items' not in data:
        raise ValidationError("Request body with 'items' array required")

    items = data['items']
    supported = auto_approval_service.get_supported_types()
    results = []
    approved_count = 0

    for item in items:
        if not isinstance(item, dict) or 'type' not in item or 'id' not in item:
            continue

        approval_type = item['type']
        entity_id = item['id']

        if approval_type not in supported:
            results.append({
                'type': approval_type,
                'id': entity_id,
                'auto_approved': False,
                'error': f'Unsupported type'
            })
            continue

        try:
            result = auto_approval_service.auto_approve_if_eligible(
                approval_type=approval_type,
                entity_id=entity_id,
                approver_id=user.id
            )
            result['type'] = approval_type
            result['id'] = entity_id
            results.append(result)

            if result.get('auto_approved'):
                approved_count += 1
        except Exception as e:
            results.append({
                'type': approval_type,
                'id': entity_id,
                'auto_approved': False,
                'error': str(e)
            })

    return jsonify({
        'status': 'success',
        'data': {
            'results': results,
            'summary': {
                'total': len(items),
                'approved': approved_count,
                'skipped': len(items) - approved_count
            }
        }
    }), 200


@bp.route('/types', methods=['GET'])
@jwt_required()
def get_supported_types():
    """Get list of supported approval types."""
    return jsonify({
        'status': 'success',
        'data': {
            'types': auto_approval_service.get_supported_types(),
            'descriptions': {
                'pause': 'Job pause requests (specialist/engineer jobs)',
                'takeover': 'Job takeover requests for stalled jobs',
                'bonus': 'Bonus star requests',
                'leave': 'Leave requests'
            }
        }
    }), 200


@bp.route('/stats', methods=['GET'])
@jwt_required()
@admin_required()
def get_auto_approval_stats():
    """
    Get auto-approval statistics.
    Shows how many items could be auto-approved vs need review.
    """
    from app.models import PauseLog, JobTakeover, BonusStar, Leave

    stats = {
        'pause': {'pending': 0, 'can_auto_approve': 0},
        'takeover': {'pending': 0, 'can_auto_approve': 0},
        'bonus': {'pending': 0, 'can_auto_approve': 0},
        'leave': {'pending': 0, 'can_auto_approve': 0}
    }

    # Count pending pauses
    pending_pauses = PauseLog.query.filter_by(status='pending').all()
    stats['pause']['pending'] = len(pending_pauses)
    for p in pending_pauses[:10]:  # Check first 10 for performance
        result = auto_approval_service.evaluate('pause', p.id)
        if result.can_auto_approve:
            stats['pause']['can_auto_approve'] += 1

    # Count pending takeovers
    pending_takeovers = JobTakeover.query.filter_by(status='pending').all()
    stats['takeover']['pending'] = len(pending_takeovers)
    for t in pending_takeovers[:10]:
        result = auto_approval_service.evaluate('takeover', t.id)
        if result.can_auto_approve:
            stats['takeover']['can_auto_approve'] += 1

    # Count pending bonus requests
    pending_bonuses = BonusStar.query.filter_by(request_status='pending').all()
    stats['bonus']['pending'] = len(pending_bonuses)
    for b in pending_bonuses[:10]:
        result = auto_approval_service.evaluate('bonus', b.id)
        if result.can_auto_approve:
            stats['bonus']['can_auto_approve'] += 1

    # Count pending leaves
    pending_leaves = Leave.query.filter_by(status='pending').all()
    stats['leave']['pending'] = len(pending_leaves)
    for l in pending_leaves[:10]:
        result = auto_approval_service.evaluate('leave', l.id)
        if result.can_auto_approve:
            stats['leave']['can_auto_approve'] += 1

    # Calculate totals
    total_pending = sum(s['pending'] for s in stats.values())
    total_can_auto = sum(s['can_auto_approve'] for s in stats.values())

    return jsonify({
        'status': 'success',
        'data': {
            'by_type': stats,
            'totals': {
                'pending': total_pending,
                'can_auto_approve': total_can_auto,
                'auto_approve_rate': round(total_can_auto / total_pending * 100, 1) if total_pending > 0 else 0
            }
        }
    }), 200
