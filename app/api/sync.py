"""
Offline sync queue endpoints for mobile clients.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db, safe_commit
from app.models import SyncQueue
from app.utils.decorators import get_current_user
from app.utils.pagination import paginate
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

bp = Blueprint('sync', __name__)


@bp.route('', methods=['POST'])
@jwt_required()
def submit_sync_item():
    """Submit an offline-queued item for processing."""
    user = get_current_user()
    data = request.get_json()

    if not data or not data.get('entity_type') or not data.get('entity_data'):
        return jsonify({'status': 'error', 'message': 'entity_type and entity_data are required'}), 400

    item = SyncQueue(
        user_id=user.id,
        entity_type=data['entity_type'],
        entity_data=data['entity_data'],
    )
    db.session.add(item)
    safe_commit()

    logger.info("Sync item submitted: user=%d type=%s", user.id, data['entity_type'])

    return jsonify({
        'status': 'success',
        'data': {
            'id': item.id,
            'entity_type': item.entity_type,
            'created_at': item.created_at.isoformat() if item.created_at else None
        }
    }), 201


@bp.route('/batch', methods=['POST'])
@jwt_required()
def submit_batch():
    """Submit multiple offline-queued items at once."""
    user = get_current_user()
    data = request.get_json()
    items_data = data.get('items', [])

    if not items_data:
        return jsonify({'status': 'error', 'message': 'items array is required'}), 400

    created = []
    for item_data in items_data:
        if not item_data.get('entity_type') or not item_data.get('entity_data'):
            continue
        item = SyncQueue(
            user_id=user.id,
            entity_type=item_data['entity_type'],
            entity_data=item_data['entity_data'],
        )
        db.session.add(item)
        created.append(item)

    safe_commit()
    logger.info("Batch sync: user=%d count=%d", user.id, len(created))

    return jsonify({
        'status': 'success',
        'data': {
            'submitted': len(created),
            'ids': [i.id for i in created]
        }
    }), 201


@bp.route('/pending', methods=['GET'])
@jwt_required()
def get_pending():
    """Get unsynced items for the current user."""
    user = get_current_user()
    items = SyncQueue.query.filter_by(
        user_id=user.id,
        synced_at=None
    ).order_by(SyncQueue.created_at.asc()).all()

    return jsonify({
        'status': 'success',
        'data': [{
            'id': i.id,
            'entity_type': i.entity_type,
            'entity_data': i.entity_data,
            'created_at': i.created_at.isoformat() if i.created_at else None,
            'sync_error': i.sync_error
        } for i in items]
    }), 200
