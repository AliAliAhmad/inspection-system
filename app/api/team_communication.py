"""Team Communication API endpoints."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db, safe_commit
from app.models.team_channel import TeamChannel
from app.models.team_message import TeamMessage
from app.models.channel_member import ChannelMember
from app.models.message_read_receipt import MessageReadReceipt
from app.models.user import User
from datetime import datetime

bp = Blueprint('team_communication', __name__)

MAX_PER_PAGE = 100


def _require_membership(channel_id, user_id):
    """Check if user is a member of the channel. Returns member or None."""
    return ChannelMember.query.filter_by(channel_id=channel_id, user_id=user_id).first()


def _require_channel_admin(channel_id, user_id):
    """Check if user is an admin of the channel."""
    member = _require_membership(channel_id, user_id)
    return member if member and member.role == 'admin' else None


# ============ CHANNELS ============

@bp.route('/channels', methods=['GET'])
@jwt_required()
def get_channels():
    """Get all channels the user is a member of."""
    user_id = get_jwt_identity()
    memberships = ChannelMember.query.filter_by(user_id=user_id).all()
    channel_ids = [m.channel_id for m in memberships]
    channels = TeamChannel.query.filter(
        TeamChannel.id.in_(channel_ids),
        TeamChannel.is_active == True
    ).order_by(TeamChannel.updated_at.desc()).all()

    result = []
    for ch in channels:
        ch_dict = ch.to_dict()
        # Get unread count
        membership = next((m for m in memberships if m.channel_id == ch.id), None)
        if membership and membership.last_read_at:
            unread = TeamMessage.query.filter(
                TeamMessage.channel_id == ch.id,
                TeamMessage.created_at > membership.last_read_at,
                TeamMessage.sender_id != user_id,
                TeamMessage.is_deleted == False
            ).count()
        else:
            unread = TeamMessage.query.filter(
                TeamMessage.channel_id == ch.id,
                TeamMessage.sender_id != user_id,
                TeamMessage.is_deleted == False
            ).count()
        ch_dict['unread_count'] = unread
        # Get last message
        last_msg = TeamMessage.query.filter_by(
            channel_id=ch.id, is_deleted=False
        ).order_by(TeamMessage.created_at.desc()).first()
        ch_dict['last_message'] = last_msg.to_dict() if last_msg else None
        result.append(ch_dict)

    return jsonify({'status': 'success', 'data': result}), 200


@bp.route('/channels', methods=['POST'])
@jwt_required()
def create_channel():
    """Create a new communication channel."""
    user_id = get_jwt_identity()
    data = request.get_json() or {}

    # Input validation
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'status': 'error', 'message': 'Channel name is required'}), 400
    if len(name) > 100:
        return jsonify({'status': 'error', 'message': 'Channel name too long (max 100 chars)'}), 400

    channel_type = data.get('channel_type', 'general')
    if channel_type not in ('general', 'shift', 'role', 'job', 'emergency'):
        return jsonify({'status': 'error', 'message': 'Invalid channel type'}), 400

    channel = TeamChannel(
        name=name,
        description=(data.get('description') or '')[:500] if data.get('description') else None,
        channel_type=channel_type,
        shift=data.get('shift'),
        role_filter=data.get('role_filter'),
        job_id=data.get('job_id'),
        is_default=data.get('is_default', False),
        created_by=user_id
    )
    db.session.add(channel)
    db.session.flush()

    # Add creator as admin member
    member = ChannelMember(
        channel_id=channel.id,
        user_id=user_id,
        role='admin'
    )
    db.session.add(member)

    # Add specified members
    member_ids = data.get('member_ids', [])
    for mid in member_ids:
        if mid != user_id:
            m = ChannelMember(channel_id=channel.id, user_id=mid, role='member')
            db.session.add(m)

    safe_commit()
    return jsonify({'status': 'success', 'data': channel.to_dict()}), 201


@bp.route('/channels/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_channel_detail(channel_id):
    """Get channel details with members. Must be a member."""
    user_id = get_jwt_identity()
    if not _require_membership(channel_id, user_id):
        return jsonify({'status': 'error', 'message': 'Not a channel member'}), 403

    channel = TeamChannel.query.get_or_404(channel_id)
    result = channel.to_dict()
    result['members'] = [m.to_dict() for m in channel.members]
    return jsonify({'status': 'success', 'data': result}), 200


@bp.route('/channels/<int:channel_id>/join', methods=['POST'])
@jwt_required()
def join_channel(channel_id):
    """Join a channel."""
    user_id = get_jwt_identity()
    channel = TeamChannel.query.get_or_404(channel_id)

    existing = ChannelMember.query.filter_by(channel_id=channel_id, user_id=user_id).first()
    if existing:
        return jsonify({'status': 'success', 'message': 'Already a member'}), 200

    member = ChannelMember(channel_id=channel_id, user_id=user_id, role='member')
    db.session.add(member)
    safe_commit()
    return jsonify({'status': 'success', 'data': member.to_dict()}), 201


@bp.route('/channels/<int:channel_id>/leave', methods=['POST'])
@jwt_required()
def leave_channel(channel_id):
    """Leave a channel."""
    user_id = get_jwt_identity()
    member = ChannelMember.query.filter_by(channel_id=channel_id, user_id=user_id).first()
    if member:
        db.session.delete(member)
        safe_commit()
    return jsonify({'status': 'success', 'message': 'Left channel'}), 200


@bp.route('/channels/<int:channel_id>/members', methods=['POST'])
@jwt_required()
def add_members(channel_id):
    """Add members to a channel. Only channel admins can add members."""
    user_id = get_jwt_identity()

    if not _require_channel_admin(channel_id, user_id):
        # Allow app-level admins too
        from app.models.user import User
        user = User.query.get(user_id)
        if not user or user.role != 'admin':
            return jsonify({'status': 'error', 'message': 'Only channel admins can add members'}), 403

    data = request.get_json() or {}
    member_ids = data.get('member_ids', [])
    added = 0

    for uid in member_ids:
        existing = ChannelMember.query.filter_by(channel_id=channel_id, user_id=uid).first()
        if not existing:
            m = ChannelMember(channel_id=channel_id, user_id=uid, role='member')
            db.session.add(m)
            added += 1

    safe_commit()
    return jsonify({'status': 'success', 'message': f'Added {added} members'}), 200


# ============ MESSAGES ============

@bp.route('/channels/<int:channel_id>/messages', methods=['GET'])
@jwt_required()
def get_messages(channel_id):
    """Get messages for a channel. Must be a member."""
    user_id = get_jwt_identity()
    if not _require_membership(channel_id, user_id):
        return jsonify({'status': 'error', 'message': 'Not a channel member'}), 403

    per_page = min(request.args.get('per_page', 50, type=int), MAX_PER_PAGE)
    before_id = request.args.get('before_id', type=int)

    query = TeamMessage.query.filter_by(
        channel_id=channel_id, is_deleted=False
    )

    if before_id:
        query = query.filter(TeamMessage.id < before_id)

    messages = query.order_by(TeamMessage.created_at.desc()).limit(per_page).all()
    messages.reverse()  # Return in chronological order

    return jsonify({
        'status': 'success',
        'data': [m.to_dict() for m in messages],
        'has_more': len(messages) == per_page
    }), 200


@bp.route('/channels/<int:channel_id>/messages', methods=['POST'])
@jwt_required()
def send_message(channel_id):
    """Send a message to a channel. Must be a member."""
    user_id = get_jwt_identity()
    if not _require_membership(channel_id, user_id):
        return jsonify({'status': 'error', 'message': 'Not a channel member'}), 403

    data = request.get_json() or {}
    content = data.get('content')
    msg_type = data.get('message_type', 'text')

    # Validate: must have content or media
    if msg_type == 'text' and not (content and content.strip()):
        return jsonify({'status': 'error', 'message': 'Message content is required'}), 400

    message = TeamMessage(
        channel_id=channel_id,
        sender_id=user_id,
        message_type=msg_type,
        content=content[:2000] if content else None,
        media_url=data.get('media_url'),
        media_thumbnail=data.get('media_thumbnail'),
        duration_seconds=data.get('duration_seconds'),
        location_lat=data.get('location_lat'),
        location_lng=data.get('location_lng'),
        location_label=data.get('location_label'),
        is_priority=data.get('is_priority', False),
        original_language=data.get('language', 'en'),
        reply_to_id=data.get('reply_to_id'),
    )
    db.session.add(message)

    # Update channel timestamp
    channel = TeamChannel.query.get(channel_id)
    if channel:
        channel.updated_at = datetime.utcnow()

    safe_commit()
    return jsonify({'status': 'success', 'data': message.to_dict()}), 201


@bp.route('/messages/<int:message_id>', methods=['DELETE'])
@jwt_required()
def delete_message(message_id):
    """Soft-delete a message. Only sender or channel admin can delete."""
    user_id = get_jwt_identity()
    message = TeamMessage.query.get_or_404(message_id)

    if message.sender_id != user_id:
        # Allow channel admins to delete messages
        if not _require_channel_admin(message.channel_id, user_id):
            return jsonify({'status': 'error', 'message': 'Not authorized'}), 403

    message.is_deleted = True
    safe_commit()
    return jsonify({'status': 'success', 'message': 'Message deleted'}), 200


@bp.route('/channels/<int:channel_id>/read', methods=['POST'])
@jwt_required()
def mark_read(channel_id):
    """Mark all messages in a channel as read."""
    user_id = get_jwt_identity()

    member = ChannelMember.query.filter_by(channel_id=channel_id, user_id=user_id).first()
    if member:
        member.last_read_at = datetime.utcnow()
        safe_commit()

    return jsonify({'status': 'success'}), 200


@bp.route('/channels/<int:channel_id>/mute', methods=['POST'])
@jwt_required()
def toggle_mute(channel_id):
    """Toggle mute for a channel."""
    user_id = get_jwt_identity()
    member = ChannelMember.query.filter_by(channel_id=channel_id, user_id=user_id).first()
    if member:
        member.is_muted = not member.is_muted
        safe_commit()
        return jsonify({'status': 'success', 'muted': member.is_muted}), 200
    return jsonify({'status': 'error', 'message': 'Not a member'}), 404


# ============ BROADCAST ============

@bp.route('/broadcast', methods=['POST'])
@jwt_required()
def broadcast_message():
    """Send emergency broadcast to all channels (admin only)."""
    user_id = get_jwt_identity()
    from app.models.user import User
    user = User.query.get(user_id)
    if not user or user.role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin only'}), 403

    data = request.get_json() or {}
    content = (data.get('content') or '').strip()
    if not content:
        return jsonify({'status': 'error', 'message': 'Broadcast content is required'}), 400

    channels = TeamChannel.query.filter_by(is_active=True).all()

    count = 0
    for ch in channels:
        msg = TeamMessage(
            channel_id=ch.id,
            sender_id=user_id,
            message_type='system',
            content=content[:2000],
            is_priority=True,
            original_language=data.get('language', 'en'),
        )
        db.session.add(msg)
        ch.updated_at = datetime.utcnow()
        count += 1

    safe_commit()
    return jsonify({'status': 'success', 'message': f'Broadcast sent to {count} channels'}), 201


# ============ SEARCH ============

@bp.route('/search', methods=['GET'])
@jwt_required()
def search_messages():
    """Search messages across user's channels only."""
    user_id = get_jwt_identity()
    q = request.args.get('q', '').strip()

    if not q or len(q) < 2:
        return jsonify({'status': 'error', 'message': 'Query too short (min 2 chars)'}), 400

    # Escape LIKE special characters
    q_safe = q.replace('%', r'\%').replace('_', r'\_')

    # Only search in user's channels
    memberships = ChannelMember.query.filter_by(user_id=user_id).all()
    channel_ids = [m.channel_id for m in memberships]

    if not channel_ids:
        return jsonify({'status': 'success', 'data': []}), 200

    messages = TeamMessage.query.filter(
        TeamMessage.channel_id.in_(channel_ids),
        TeamMessage.is_deleted == False,
        TeamMessage.content.ilike(f'%{q_safe}%')
    ).order_by(TeamMessage.created_at.desc()).limit(20).all()

    return jsonify({'status': 'success', 'data': [m.to_dict() for m in messages]}), 200


@bp.route('/users', methods=['GET'])
@jwt_required()
def list_chat_users():
    """List all active users for chat. Any authenticated user can access."""
    users = User.query.filter_by(is_active=True).order_by(User.full_name).all()
    return jsonify({
        'status': 'success',
        'data': [{
            'id': u.id,
            'full_name': u.full_name,
            'role': u.role,
            'shift': u.shift,
            'employee_id': u.employee_id,
            'specialization': getattr(u, 'specialization', None),
        } for u in users],
    }), 200
