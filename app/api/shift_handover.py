"""Shift Handover API — Create, view, and acknowledge shift handover notes."""
from datetime import date, datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app import db
from app.models.shift_handover import ShiftHandover
from app.models.user import User
from app.api.utils import get_current_user

bp = Blueprint('shift_handover', __name__, url_prefix='/api/shift-handover')


@bp.route('', methods=['POST'])
@jwt_required()
def create_handover():
    """Create a shift handover note."""
    user = get_current_user()
    data = request.get_json()

    handover = ShiftHandover(
        shift_date=date.fromisoformat(data.get('shift_date', date.today().isoformat())),
        shift_type=data.get('shift_type', 'day'),
        outgoing_user_id=user.id,
        notes=data.get('notes', ''),
        pending_items=data.get('pending_items', []),
        safety_alerts=data.get('safety_alerts', []),
        equipment_issues=data.get('equipment_issues', []),
        voice_file_id=data.get('voice_file_id'),
        voice_transcription=data.get('voice_transcription'),
    )
    db.session.add(handover)
    db.session.commit()

    return jsonify({'status': 'success', 'data': handover.to_dict()}), 201


@bp.route('/latest', methods=['GET'])
@jwt_required()
def get_latest():
    """Get the latest handover for the incoming shift (what the previous shift left)."""
    today = date.today()
    shift_type = request.args.get('shift_type')

    query = ShiftHandover.query.filter(
        ShiftHandover.shift_date >= today
    ).order_by(ShiftHandover.created_at.desc())

    if shift_type:
        # Get handover from the PREVIOUS shift
        prev_shift = 'day' if shift_type == 'night' else 'night'
        query = query.filter(ShiftHandover.shift_type == prev_shift)

    handover = query.first()
    if not handover:
        # Try yesterday's last shift
        from datetime import timedelta
        yesterday = today - timedelta(days=1)
        handover = ShiftHandover.query.filter(
            ShiftHandover.shift_date == yesterday
        ).order_by(ShiftHandover.created_at.desc()).first()

    return jsonify({
        'status': 'success',
        'data': handover.to_dict() if handover else None,
    }), 200


@bp.route('/my-handovers', methods=['GET'])
@jwt_required()
def my_handovers():
    """Get handovers created by the current user."""
    user = get_current_user()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)

    query = ShiftHandover.query.filter(
        ShiftHandover.outgoing_user_id == user.id
    ).order_by(ShiftHandover.created_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'status': 'success',
        'data': [h.to_dict() for h in pagination.items],
        'total': pagination.total,
        'page': page,
        'per_page': per_page,
    }), 200


@bp.route('/pending', methods=['GET'])
@jwt_required()
def pending_handovers():
    """Get unacknowledged handovers (for incoming shift to review)."""
    today = date.today()
    from datetime import timedelta
    yesterday = today - timedelta(days=1)

    handovers = ShiftHandover.query.filter(
        ShiftHandover.acknowledged_by_id.is_(None),
        ShiftHandover.shift_date >= yesterday,
    ).order_by(ShiftHandover.created_at.desc()).all()

    return jsonify({
        'status': 'success',
        'data': [h.to_dict() for h in handovers],
    }), 200


@bp.route('/<int:handover_id>', methods=['GET'])
@jwt_required()
def get_handover(handover_id):
    """Get a specific handover by ID."""
    handover = ShiftHandover.query.get_or_404(handover_id)
    return jsonify({'status': 'success', 'data': handover.to_dict()}), 200


@bp.route('/<int:handover_id>/acknowledge', methods=['POST'])
@jwt_required()
def acknowledge_handover(handover_id):
    """Acknowledge receipt of a shift handover."""
    user = get_current_user()
    handover = ShiftHandover.query.get_or_404(handover_id)

    if handover.acknowledged_by_id:
        return jsonify({'status': 'error', 'message': 'Already acknowledged'}), 400

    handover.acknowledged_by_id = user.id
    handover.acknowledged_at = datetime.utcnow()
    db.session.commit()

    return jsonify({'status': 'success', 'data': handover.to_dict()}), 200
