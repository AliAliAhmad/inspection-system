"""
Bonus Star endpoints.
Admin/Engineer award directly (1-10), QE requests admin to award.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db, safe_commit, limiter
from app.models import BonusStar, User
from app.utils.decorators import get_current_user, admin_required, role_required
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import datetime

bp = Blueprint('bonus_stars', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
def list_bonus_stars():
    """List bonus star records. Users see own, admins see all."""
    user = get_current_user()

    if user.role == 'admin':
        bonuses = BonusStar.query.order_by(BonusStar.awarded_at.desc()).all()
    else:
        bonuses = BonusStar.query.filter_by(user_id=user.id).order_by(
            BonusStar.awarded_at.desc()
        ).all()

    return jsonify({
        'status': 'success',
        'data': [b.to_dict() for b in bonuses]
    }), 200


@bp.route('', methods=['POST'])
@limiter.limit("20 per minute")
@jwt_required()
@role_required('admin', 'engineer')
def award_bonus():
    """
    Award bonus stars to a user.
    Admin/Engineer: direct award (1-10).
    """
    user = get_current_user()
    data = request.get_json()

    target_user_id = data.get('user_id')
    amount = data.get('amount')
    reason = data.get('reason')

    if not target_user_id or not amount or not reason:
        raise ValidationError("user_id, amount, and reason are required")

    if not isinstance(amount, int) or amount < 1 or amount > 10:
        raise ValidationError("Amount must be between 1 and 10")

    target_user = User.query.get(target_user_id)
    if not target_user:
        raise NotFoundError(f"User {target_user_id} not found")

    bonus = BonusStar(
        user_id=target_user_id,
        awarded_by=user.id,
        amount=amount,
        reason=reason,
        related_job_type=data.get('related_job_type'),
        related_job_id=data.get('related_job_id')
    )
    db.session.add(bonus)

    # Add points to user
    target_user.add_points(amount, target_user.role)
    safe_commit()

    # Auto-translate reason
    from app.utils.bilingual import auto_translate_and_save
    auto_translate_and_save('bonus_star', bonus.id, {'reason': reason})

    # Notify user
    from app.services.notification_service import NotificationService
    NotificationService.create_notification(
        user_id=target_user_id,
        type='bonus_awarded',
        title=f'+{amount} Bonus Stars!',
        message=f'You received {amount} bonus stars: {reason}',
        related_type='bonus_star',
        related_id=bonus.id
    )

    return jsonify({
        'status': 'success',
        'message': f'{amount} bonus stars awarded to {target_user.full_name}',
        'data': bonus.to_dict()
    }), 201


@bp.route('/request', methods=['POST'])
@limiter.limit("20 per minute")
@jwt_required()
@role_required('quality_engineer')
def request_bonus():
    """QE requests admin to award bonus stars."""
    user = get_current_user()
    data = request.get_json()

    target_user_id = data.get('user_id')
    amount = data.get('amount')
    reason = data.get('reason')

    if not target_user_id or not amount or not reason:
        raise ValidationError("user_id, amount, and reason are required")

    if not isinstance(amount, int) or amount < 1 or amount > 10:
        raise ValidationError("Amount must be between 1 and 10")

    bonus = BonusStar(
        user_id=target_user_id,
        awarded_by=None,
        amount=amount,
        reason=reason,
        is_qe_request=True,
        qe_requester_id=user.id,
        request_status='pending',
        related_job_type=data.get('related_job_type'),
        related_job_id=data.get('related_job_id')
    )
    db.session.add(bonus)
    safe_commit()

    # Auto-translate reason
    from app.utils.bilingual import auto_translate_and_save
    auto_translate_and_save('bonus_star', bonus.id, {'reason': reason})

    # Notify admins
    from app.services.notification_service import NotificationService
    admins = User.query.filter_by(role='admin', is_active=True).all()
    for admin in admins:
        NotificationService.create_notification(
            user_id=admin.id,
            type='bonus_request',
            title='Bonus Star Request',
            message=f'QE {user.full_name} requests {amount} bonus stars for user #{target_user_id}: {reason}',
            related_type='bonus_star',
            related_id=bonus.id
        )

    return jsonify({
        'status': 'success',
        'message': 'Bonus request submitted for admin approval',
        'data': bonus.to_dict()
    }), 201


@bp.route('/<int:bonus_id>/approve', methods=['POST'])
@jwt_required()
@admin_required()
def approve_bonus_request(bonus_id):
    """Admin approves QE bonus request."""
    user = get_current_user()

    bonus = BonusStar.query.get(bonus_id)
    if not bonus:
        raise NotFoundError(f"Bonus star {bonus_id} not found")
    if not bonus.is_qe_request or bonus.request_status != 'pending':
        raise ValidationError("Not a pending QE request")

    bonus.request_status = 'approved'
    bonus.awarded_by = user.id

    # Apply bonus
    target_user = User.query.get(bonus.user_id)
    if target_user:
        target_user.add_points(bonus.amount, target_user.role)

    safe_commit()

    from app.services.notification_service import NotificationService
    NotificationService.create_notification(
        user_id=bonus.user_id,
        type='bonus_awarded',
        title=f'+{bonus.amount} Bonus Stars!',
        message=f'You received {bonus.amount} bonus stars: {bonus.reason}',
        related_type='bonus_star',
        related_id=bonus.id
    )

    return jsonify({
        'status': 'success',
        'message': 'Bonus request approved',
        'data': bonus.to_dict()
    }), 200


@bp.route('/<int:bonus_id>/deny', methods=['POST'])
@jwt_required()
@admin_required()
def deny_bonus_request(bonus_id):
    """Admin denies QE bonus request."""
    bonus = BonusStar.query.get(bonus_id)
    if not bonus:
        raise NotFoundError(f"Bonus star {bonus_id} not found")
    if not bonus.is_qe_request or bonus.request_status != 'pending':
        raise ValidationError("Not a pending QE request")

    bonus.request_status = 'denied'
    safe_commit()

    from app.services.notification_service import NotificationService
    NotificationService.create_notification(
        user_id=bonus.qe_requester_id,
        type='bonus_denied',
        title='Bonus Request Denied',
        message=f'Your bonus request for user #{bonus.user_id} was denied',
        related_type='bonus_star',
        related_id=bonus.id
    )

    return jsonify({
        'status': 'success',
        'message': 'Bonus request denied',
        'data': bonus.to_dict()
    }), 200
