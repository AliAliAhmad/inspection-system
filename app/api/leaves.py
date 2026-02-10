"""
Leave Management endpoints.
Leave requests, approvals, coverage assignment, types, policies, balances,
calendar, blackouts, compensatory leave, encashment, AI features, and reports.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.leave_service import LeaveService
from app.services.coverage_service import CoverageService
from app.services.leave_ai_service import LeaveAIService
from app.utils.decorators import get_current_user, admin_required, get_language, role_required
from app.models import (
    Leave, User, LeaveType, LeavePolicy, LeaveBalanceHistory,
    LeaveBlackout, LeaveCalendar, CompensatoryLeave, LeaveEncashment
)
from app.extensions import db
from app.utils.pagination import paginate
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import date, datetime, timedelta
from functools import wraps

bp = Blueprint('leaves', __name__)

# Initialize AI Service
leave_ai_service = LeaveAIService()


def engineer_or_admin_required():
    """Decorator to require engineer or admin role."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if user.role not in ('admin', 'engineer'):
                raise ForbiddenError("Engineer or Admin access required")
            return fn(*args, **kwargs)
        return wrapper
    return decorator


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

    Only admins and engineers can create leave requests.
    They can request for themselves or on behalf of inspectors/specialists.
    If caller is admin, the leave is auto-approved.
    """
    user = get_current_user()
    data = request.get_json()

    if user.role not in ('admin', 'engineer'):
        return jsonify({'status': 'error', 'message': 'Only admins and engineers can request leaves'}), 403

    # Determine the target user (self or on behalf of another)
    target_user_id = data.get('user_id', user.id)
    if target_user_id:
        target_user_id = int(target_user_id)

    leave = LeaveService.request_leave(
        user_id=target_user_id,
        leave_type=data['leave_type'],
        date_from=date.fromisoformat(data['date_from']),
        date_to=date.fromisoformat(data['date_to']),
        reason=data['reason'],
        scope=data.get('scope', 'full'),
        coverage_user_id=data.get('coverage_user_id')
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


@bp.route('/user/<int:user_id>/balance', methods=['GET'])
@jwt_required()
def get_leave_balance(user_id):
    """Get leave balance for a user."""
    from app.models import User
    user = get_current_user()

    # Allow users to see own balance or admins/engineers to see anyone's
    if user.id != user_id and user.role not in ('admin', 'engineer'):
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    target = db.session.get(User, user_id)
    if not target:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404

    from datetime import date as date_type
    from app.extensions import db as _db
    current_year = date_type.today().year

    used = _db.session.query(
        _db.func.coalesce(_db.func.sum(Leave.total_days), 0)
    ).filter(
        Leave.user_id == user_id,
        Leave.status.in_(['pending', 'approved']),
        Leave.date_from >= date_type(current_year, 1, 1),
        Leave.date_to <= date_type(current_year, 12, 31)
    ).scalar()

    total = target.annual_leave_balance or 24
    remaining = total - used

    # Get leave history for this year
    leaves = Leave.query.filter(
        Leave.user_id == user_id,
        Leave.date_from >= date_type(current_year, 1, 1)
    ).order_by(Leave.date_from.desc()).all()

    return jsonify({
        'status': 'success',
        'data': {
            'total_balance': total,
            'used': used,
            'remaining': remaining,
            'leaves': [l.to_dict() for l in leaves]
        }
    }), 200


@bp.route('/user/<int:user_id>/add-days', methods=['POST'])
@jwt_required()
@admin_required()
def add_leave_days(user_id):
    """Add extra leave days to a user's balance. Admin only."""
    from app.models import User
    from app.extensions import db as _db

    target = _db.session.get(User, user_id)
    if not target:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404

    data = request.get_json()
    days = data.get('days')
    reason = data.get('reason', '')

    if not days or not isinstance(days, int) or days <= 0:
        return jsonify({'status': 'error', 'message': 'days must be a positive integer'}), 400

    target.annual_leave_balance = (target.annual_leave_balance or 24) + days
    _db.session.commit()

    # Notify the user
    from app.services.notification_service import NotificationService
    admin = get_current_user()
    NotificationService.create_notification(
        user_id=user_id,
        type='leave_balance_updated',
        title='Leave Balance Updated',
        message=f'{admin.full_name} added {days} leave days to your balance. Reason: {reason}' if reason else f'{admin.full_name} added {days} leave days to your balance.',
        related_type='user',
        related_id=user_id
    )

    return jsonify({
        'status': 'success',
        'message': f'Added {days} days to leave balance',
        'data': {'annual_leave_balance': target.annual_leave_balance}
    }), 200


# ============================================================================
# LEAVE TYPES ENDPOINTS
# ============================================================================

@bp.route('/types', methods=['GET'])
@jwt_required()
def list_leave_types():
    """List all active leave types."""
    user = get_current_user()
    language = get_language(user)

    active_only = request.args.get('active_only', 'true').lower() == 'true'
    query = LeaveType.query
    if active_only:
        query = query.filter_by(is_active=True)

    types = query.order_by(LeaveType.code).all()

    return jsonify({
        'status': 'success',
        'data': [t.to_dict(language=language) for t in types]
    }), 200


@bp.route('/types', methods=['POST'])
@jwt_required()
@admin_required()
def create_leave_type():
    """Create a custom leave type. Admin only."""
    data = request.get_json()

    # Validate required fields
    if not data.get('code') or not data.get('name'):
        return jsonify({'status': 'error', 'message': 'code and name are required'}), 400

    # Check for duplicate code
    existing = LeaveType.query.filter_by(code=data['code']).first()
    if existing:
        return jsonify({'status': 'error', 'message': f'Leave type with code {data["code"]} already exists'}), 400

    leave_type = LeaveType(
        code=data['code'],
        name=data['name'],
        name_ar=data.get('name_ar'),
        description=data.get('description'),
        color=data.get('color', '#1976D2'),
        icon=data.get('icon'),
        requires_certificate=data.get('requires_certificate', False),
        certificate_after_days=data.get('certificate_after_days', 3),
        max_consecutive_days=data.get('max_consecutive_days'),
        max_per_year=data.get('max_per_year'),
        advance_notice_days=data.get('advance_notice_days', 0),
        is_paid=data.get('is_paid', True),
        is_active=True,
        is_system=False  # Custom types are not system types
    )

    db.session.add(leave_type)
    db.session.commit()

    user = get_current_user()
    language = get_language(user)

    return jsonify({
        'status': 'success',
        'message': 'Leave type created',
        'data': leave_type.to_dict(language=language)
    }), 201


@bp.route('/types/<int:type_id>', methods=['PUT'])
@jwt_required()
@admin_required()
def update_leave_type(type_id):
    """Update a leave type. Non-system types only. Admin only."""
    leave_type = db.session.get(LeaveType, type_id)
    if not leave_type:
        return jsonify({'status': 'error', 'message': 'Leave type not found'}), 404

    if leave_type.is_system:
        return jsonify({'status': 'error', 'message': 'System leave types cannot be modified'}), 403

    data = request.get_json()

    # Update fields
    if 'name' in data:
        leave_type.name = data['name']
    if 'name_ar' in data:
        leave_type.name_ar = data['name_ar']
    if 'description' in data:
        leave_type.description = data['description']
    if 'color' in data:
        leave_type.color = data['color']
    if 'icon' in data:
        leave_type.icon = data['icon']
    if 'requires_certificate' in data:
        leave_type.requires_certificate = data['requires_certificate']
    if 'certificate_after_days' in data:
        leave_type.certificate_after_days = data['certificate_after_days']
    if 'max_consecutive_days' in data:
        leave_type.max_consecutive_days = data['max_consecutive_days']
    if 'max_per_year' in data:
        leave_type.max_per_year = data['max_per_year']
    if 'advance_notice_days' in data:
        leave_type.advance_notice_days = data['advance_notice_days']
    if 'is_paid' in data:
        leave_type.is_paid = data['is_paid']
    if 'is_active' in data:
        leave_type.is_active = data['is_active']

    db.session.commit()

    user = get_current_user()
    language = get_language(user)

    return jsonify({
        'status': 'success',
        'message': 'Leave type updated',
        'data': leave_type.to_dict(language=language)
    }), 200


@bp.route('/types/<int:type_id>', methods=['DELETE'])
@jwt_required()
@admin_required()
def delete_leave_type(type_id):
    """Delete a leave type. Non-system types only. Admin only."""
    leave_type = db.session.get(LeaveType, type_id)
    if not leave_type:
        return jsonify({'status': 'error', 'message': 'Leave type not found'}), 404

    if leave_type.is_system:
        return jsonify({'status': 'error', 'message': 'System leave types cannot be deleted'}), 403

    # Check if any leaves are using this type
    leaves_count = Leave.query.filter_by(leave_type_id=type_id).count()
    if leaves_count > 0:
        # Soft delete instead
        leave_type.is_active = False
        db.session.commit()
        return jsonify({
            'status': 'success',
            'message': f'Leave type deactivated (has {leaves_count} associated leaves)'
        }), 200

    db.session.delete(leave_type)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Leave type deleted'
    }), 200


# ============================================================================
# LEAVE POLICIES ENDPOINTS
# ============================================================================

@bp.route('/policies', methods=['GET'])
@jwt_required()
@admin_required()
def list_policies():
    """List all leave policies. Admin only."""
    user = get_current_user()
    language = get_language(user)

    active_only = request.args.get('active_only', 'false').lower() == 'true'
    role_filter = request.args.get('role')

    query = LeavePolicy.query
    if active_only:
        query = query.filter_by(is_active=True)
    if role_filter:
        query = query.filter_by(role=role_filter)

    policies = query.order_by(LeavePolicy.role, LeavePolicy.min_tenure_months).all()

    return jsonify({
        'status': 'success',
        'data': [p.to_dict(language=language) for p in policies]
    }), 200


@bp.route('/policies', methods=['POST'])
@jwt_required()
@admin_required()
def create_policy():
    """Create a leave policy. Admin only."""
    data = request.get_json()

    if not data.get('name'):
        return jsonify({'status': 'error', 'message': 'name is required'}), 400

    policy = LeavePolicy(
        name=data['name'],
        role=data.get('role'),
        min_tenure_months=data.get('min_tenure_months', 0),
        annual_allowance=data.get('annual_allowance', 24),
        sick_allowance=data.get('sick_allowance', 15),
        emergency_allowance=data.get('emergency_allowance', 5),
        carry_over_enabled=data.get('carry_over_enabled', False),
        carry_over_max_days=data.get('carry_over_max_days', 5),
        carry_over_expiry_months=data.get('carry_over_expiry_months', 3),
        probation_months=data.get('probation_months', 3),
        probation_allowance=data.get('probation_allowance', 0),
        accrual_type=data.get('accrual_type', 'yearly'),
        accrual_rate=data.get('accrual_rate'),
        negative_balance_allowed=data.get('negative_balance_allowed', False),
        negative_balance_max=data.get('negative_balance_max', 0),
        is_active=True
    )

    db.session.add(policy)
    db.session.commit()

    user = get_current_user()
    language = get_language(user)

    return jsonify({
        'status': 'success',
        'message': 'Leave policy created',
        'data': policy.to_dict(language=language)
    }), 201


@bp.route('/policies/<int:policy_id>', methods=['PUT'])
@jwt_required()
@admin_required()
def update_policy(policy_id):
    """Update a leave policy. Admin only."""
    policy = db.session.get(LeavePolicy, policy_id)
    if not policy:
        return jsonify({'status': 'error', 'message': 'Policy not found'}), 404

    data = request.get_json()

    # Update fields
    if 'name' in data:
        policy.name = data['name']
    if 'role' in data:
        policy.role = data['role']
    if 'min_tenure_months' in data:
        policy.min_tenure_months = data['min_tenure_months']
    if 'annual_allowance' in data:
        policy.annual_allowance = data['annual_allowance']
    if 'sick_allowance' in data:
        policy.sick_allowance = data['sick_allowance']
    if 'emergency_allowance' in data:
        policy.emergency_allowance = data['emergency_allowance']
    if 'carry_over_enabled' in data:
        policy.carry_over_enabled = data['carry_over_enabled']
    if 'carry_over_max_days' in data:
        policy.carry_over_max_days = data['carry_over_max_days']
    if 'carry_over_expiry_months' in data:
        policy.carry_over_expiry_months = data['carry_over_expiry_months']
    if 'probation_months' in data:
        policy.probation_months = data['probation_months']
    if 'probation_allowance' in data:
        policy.probation_allowance = data['probation_allowance']
    if 'accrual_type' in data:
        policy.accrual_type = data['accrual_type']
    if 'accrual_rate' in data:
        policy.accrual_rate = data['accrual_rate']
    if 'negative_balance_allowed' in data:
        policy.negative_balance_allowed = data['negative_balance_allowed']
    if 'negative_balance_max' in data:
        policy.negative_balance_max = data['negative_balance_max']
    if 'is_active' in data:
        policy.is_active = data['is_active']

    db.session.commit()

    user = get_current_user()
    language = get_language(user)

    return jsonify({
        'status': 'success',
        'message': 'Policy updated',
        'data': policy.to_dict(language=language)
    }), 200


@bp.route('/policies/<int:policy_id>', methods=['DELETE'])
@jwt_required()
@admin_required()
def delete_policy(policy_id):
    """Delete a leave policy. Admin only."""
    policy = db.session.get(LeavePolicy, policy_id)
    if not policy:
        return jsonify({'status': 'error', 'message': 'Policy not found'}), 404

    # Soft delete
    policy.is_active = False
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Policy deactivated'
    }), 200


@bp.route('/policies/user/<int:user_id>', methods=['GET'])
@jwt_required()
def get_user_policy(user_id):
    """Get effective policy for a user based on role and tenure."""
    user = get_current_user()

    # Users can see their own policy, admins/engineers can see anyone's
    if user.id != user_id and user.role not in ('admin', 'engineer'):
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    target = db.session.get(User, user_id)
    if not target:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404

    # Calculate tenure in months
    if target.hire_date:
        tenure_months = (date.today().year - target.hire_date.year) * 12 + \
                       (date.today().month - target.hire_date.month)
    else:
        tenure_months = 0

    # Find matching policy (most specific first)
    policy = LeavePolicy.query.filter(
        LeavePolicy.is_active == True,
        LeavePolicy.role == target.role,
        LeavePolicy.min_tenure_months <= tenure_months
    ).order_by(LeavePolicy.min_tenure_months.desc()).first()

    # Fallback to general policy if no role-specific found
    if not policy:
        policy = LeavePolicy.query.filter(
            LeavePolicy.is_active == True,
            LeavePolicy.role.is_(None),
            LeavePolicy.min_tenure_months <= tenure_months
        ).order_by(LeavePolicy.min_tenure_months.desc()).first()

    language = get_language(user)

    return jsonify({
        'status': 'success',
        'data': {
            'user_id': user_id,
            'user_name': target.full_name,
            'role': target.role,
            'tenure_months': tenure_months,
            'policy': policy.to_dict(language=language) if policy else None,
            'is_on_probation': policy and tenure_months < policy.probation_months if policy else False
        }
    }), 200


# ============================================================================
# BALANCE MANAGEMENT ENDPOINTS
# ============================================================================

@bp.route('/balance/<int:user_id>', methods=['GET'])
@jwt_required()
def get_detailed_balance(user_id):
    """Get detailed leave balance breakdown by leave type."""
    user = get_current_user()

    # Users can see their own balance, admins/engineers can see anyone's
    if user.id != user_id and user.role not in ('admin', 'engineer'):
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    target = db.session.get(User, user_id)
    if not target:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404

    language = get_language(user)
    current_year = date.today().year
    year_start = date(current_year, 1, 1)
    year_end = date(current_year, 12, 31)

    # Get all leave types
    leave_types = LeaveType.query.filter_by(is_active=True).all()

    balance_breakdown = {}

    for lt in leave_types:
        # Calculate used days for this type
        used = db.session.query(
            db.func.coalesce(db.func.sum(Leave.total_days), 0)
        ).filter(
            Leave.user_id == user_id,
            Leave.leave_type == lt.code,
            Leave.status.in_(['pending', 'approved']),
            Leave.date_from >= year_start,
            Leave.date_to <= year_end
        ).scalar()

        # Get policy-based allowance
        policy = LeavePolicy.query.filter(
            LeavePolicy.is_active == True,
            LeavePolicy.role == target.role
        ).first()

        # Default allowances based on type
        if lt.code == 'annual':
            total = policy.annual_allowance if policy else (target.annual_leave_balance or 24)
        elif lt.code == 'sick':
            total = policy.sick_allowance if policy else 15
        elif lt.code == 'emergency':
            total = policy.emergency_allowance if policy else 5
        else:
            total = lt.max_per_year or 0

        balance_breakdown[lt.code] = {
            'leave_type': lt.to_dict(language=language),
            'total': total,
            'used': float(used),
            'pending': 0,  # Will be calculated below
            'remaining': total - float(used)
        }

        # Get pending count separately
        pending = db.session.query(
            db.func.coalesce(db.func.sum(Leave.total_days), 0)
        ).filter(
            Leave.user_id == user_id,
            Leave.leave_type == lt.code,
            Leave.status == 'pending',
            Leave.date_from >= year_start
        ).scalar()
        balance_breakdown[lt.code]['pending'] = float(pending)

    # Add compensatory leave balance
    comp_approved = db.session.query(
        db.func.coalesce(db.func.sum(CompensatoryLeave.comp_days_earned), 0)
    ).filter(
        CompensatoryLeave.user_id == user_id,
        CompensatoryLeave.status == 'approved'
    ).scalar()

    comp_used = db.session.query(
        db.func.coalesce(db.func.sum(CompensatoryLeave.comp_days_earned), 0)
    ).filter(
        CompensatoryLeave.user_id == user_id,
        CompensatoryLeave.status == 'used'
    ).scalar()

    balance_breakdown['comp_off'] = {
        'leave_type': {'code': 'comp_off', 'name': 'Compensatory Off'},
        'total': float(comp_approved),
        'used': float(comp_used),
        'remaining': float(comp_approved) - float(comp_used)
    }

    return jsonify({
        'status': 'success',
        'data': {
            'user_id': user_id,
            'year': current_year,
            'balances': balance_breakdown
        }
    }), 200


@bp.route('/balance/<int:user_id>/history', methods=['GET'])
@jwt_required()
def get_balance_history(user_id):
    """Get balance change history for a user."""
    user = get_current_user()

    # Users can see their own history, admins can see anyone's
    if user.id != user_id and user.role != 'admin':
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    target = db.session.get(User, user_id)
    if not target:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404

    language = get_language(user)

    # Query parameters
    leave_type_id = request.args.get('leave_type_id', type=int)
    change_type = request.args.get('change_type')
    date_from = request.args.get('from')
    date_to = request.args.get('to')

    query = LeaveBalanceHistory.query.filter_by(user_id=user_id)

    if leave_type_id:
        query = query.filter_by(leave_type_id=leave_type_id)
    if change_type:
        query = query.filter_by(change_type=change_type)
    if date_from:
        query = query.filter(LeaveBalanceHistory.created_at >= date.fromisoformat(date_from))
    if date_to:
        query = query.filter(LeaveBalanceHistory.created_at <= date.fromisoformat(date_to))

    query = query.order_by(LeaveBalanceHistory.created_at.desc())
    items, pagination_meta = paginate(query)

    return jsonify({
        'status': 'success',
        'data': [h.to_dict(language=language) for h in items],
        'pagination': pagination_meta
    }), 200


@bp.route('/balance/<int:user_id>/adjust', methods=['POST'])
@jwt_required()
@admin_required()
def adjust_balance(user_id):
    """Manually adjust leave balance. Admin only."""
    from app.services.notification_service import NotificationService

    target = db.session.get(User, user_id)
    if not target:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404

    data = request.get_json()

    if 'amount' not in data or 'leave_type_id' not in data:
        return jsonify({'status': 'error', 'message': 'leave_type_id and amount are required'}), 400

    leave_type = db.session.get(LeaveType, data['leave_type_id'])
    if not leave_type:
        return jsonify({'status': 'error', 'message': 'Leave type not found'}), 404

    admin = get_current_user()
    amount = data['amount']
    reason = data.get('reason', 'Manual adjustment')

    # Get current balance
    current_year = date.today().year
    used = db.session.query(
        db.func.coalesce(db.func.sum(Leave.total_days), 0)
    ).filter(
        Leave.user_id == user_id,
        Leave.leave_type == leave_type.code,
        Leave.status.in_(['pending', 'approved']),
        Leave.date_from >= date(current_year, 1, 1)
    ).scalar()

    balance_before = (target.annual_leave_balance or 24) - float(used) if leave_type.code == 'annual' else 0

    # Create history record
    history = LeaveBalanceHistory(
        user_id=user_id,
        leave_type_id=data['leave_type_id'],
        change_type='adjustment',
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_before + amount,
        reason=reason,
        adjusted_by_id=admin.id
    )

    # Update user's balance if annual leave
    if leave_type.code == 'annual':
        target.annual_leave_balance = (target.annual_leave_balance or 24) + amount

    db.session.add(history)
    db.session.commit()

    # Notify user
    NotificationService.create_notification(
        user_id=user_id,
        type='leave_balance_adjusted',
        title='Leave Balance Adjusted',
        message=f'{admin.full_name} adjusted your {leave_type.name} balance by {amount} days. Reason: {reason}',
        related_type='user',
        related_id=user_id
    )

    language = get_language(admin)

    return jsonify({
        'status': 'success',
        'message': 'Balance adjusted',
        'data': history.to_dict(language=language)
    }), 200


# ============================================================================
# CALENDAR & BLACKOUTS ENDPOINTS
# ============================================================================

@bp.route('/calendar', methods=['GET'])
@jwt_required()
def get_calendar():
    """Get holidays for a year."""
    user = get_current_user()
    language = get_language(user)

    year = request.args.get('year', type=int, default=date.today().year)

    holidays = LeaveCalendar.query.filter_by(year=year).order_by(LeaveCalendar.date).all()

    return jsonify({
        'status': 'success',
        'data': {
            'year': year,
            'holidays': [h.to_dict(language=language) for h in holidays]
        }
    }), 200


@bp.route('/calendar', methods=['POST'])
@jwt_required()
@admin_required()
def add_holiday():
    """Add a holiday to the calendar. Admin only."""
    data = request.get_json()

    if not data.get('date') or not data.get('name'):
        return jsonify({'status': 'error', 'message': 'date and name are required'}), 400

    holiday_date = date.fromisoformat(data['date'])

    # Check for duplicate
    existing = LeaveCalendar.query.filter_by(date=holiday_date).first()
    if existing:
        return jsonify({'status': 'error', 'message': 'Holiday already exists for this date'}), 400

    holiday = LeaveCalendar(
        date=holiday_date,
        year=holiday_date.year,
        name=data['name'],
        name_ar=data.get('name_ar'),
        holiday_type=data.get('holiday_type'),
        is_working_day=data.get('is_working_day', False)
    )

    db.session.add(holiday)
    db.session.commit()

    user = get_current_user()
    language = get_language(user)

    return jsonify({
        'status': 'success',
        'message': 'Holiday added',
        'data': holiday.to_dict(language=language)
    }), 201


@bp.route('/calendar/<int:id>', methods=['DELETE'])
@jwt_required()
@admin_required()
def delete_holiday(id):
    """Delete a holiday from the calendar. Admin only."""
    holiday = db.session.get(LeaveCalendar, id)
    if not holiday:
        return jsonify({'status': 'error', 'message': 'Holiday not found'}), 404

    db.session.delete(holiday)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Holiday deleted'
    }), 200


@bp.route('/blackouts', methods=['GET'])
@jwt_required()
def list_blackouts():
    """List blackout periods."""
    user = get_current_user()
    language = get_language(user)

    active_only = request.args.get('active_only', 'true').lower() == 'true'

    query = LeaveBlackout.query
    if active_only:
        query = query.filter_by(is_active=True)
        query = query.filter(LeaveBlackout.date_to >= date.today())

    blackouts = query.order_by(LeaveBlackout.date_from).all()

    return jsonify({
        'status': 'success',
        'data': [b.to_dict(language=language) for b in blackouts]
    }), 200


@bp.route('/blackouts', methods=['POST'])
@jwt_required()
@admin_required()
def create_blackout():
    """Create a blackout period. Admin only."""
    data = request.get_json()

    required = ['name', 'date_from', 'date_to']
    for field in required:
        if not data.get(field):
            return jsonify({'status': 'error', 'message': f'{field} is required'}), 400

    date_from = date.fromisoformat(data['date_from'])
    date_to = date.fromisoformat(data['date_to'])

    if date_to < date_from:
        return jsonify({'status': 'error', 'message': 'date_to must be >= date_from'}), 400

    admin = get_current_user()

    blackout = LeaveBlackout(
        name=data['name'],
        name_ar=data.get('name_ar'),
        date_from=date_from,
        date_to=date_to,
        reason=data.get('reason'),
        applies_to_roles=data.get('applies_to_roles'),
        exception_user_ids=data.get('exception_user_ids'),
        is_active=True,
        created_by_id=admin.id
    )

    db.session.add(blackout)
    db.session.commit()

    language = get_language(admin)

    return jsonify({
        'status': 'success',
        'message': 'Blackout period created',
        'data': blackout.to_dict(language=language)
    }), 201


@bp.route('/blackouts/<int:id>', methods=['PUT'])
@jwt_required()
@admin_required()
def update_blackout(id):
    """Update a blackout period. Admin only."""
    blackout = db.session.get(LeaveBlackout, id)
    if not blackout:
        return jsonify({'status': 'error', 'message': 'Blackout not found'}), 404

    data = request.get_json()

    if 'name' in data:
        blackout.name = data['name']
    if 'name_ar' in data:
        blackout.name_ar = data['name_ar']
    if 'date_from' in data:
        blackout.date_from = date.fromisoformat(data['date_from'])
    if 'date_to' in data:
        blackout.date_to = date.fromisoformat(data['date_to'])
    if 'reason' in data:
        blackout.reason = data['reason']
    if 'applies_to_roles' in data:
        blackout.applies_to_roles = data['applies_to_roles']
    if 'exception_user_ids' in data:
        blackout.exception_user_ids = data['exception_user_ids']
    if 'is_active' in data:
        blackout.is_active = data['is_active']

    db.session.commit()

    user = get_current_user()
    language = get_language(user)

    return jsonify({
        'status': 'success',
        'message': 'Blackout updated',
        'data': blackout.to_dict(language=language)
    }), 200


@bp.route('/blackouts/<int:id>', methods=['DELETE'])
@jwt_required()
@admin_required()
def delete_blackout(id):
    """Delete a blackout period. Admin only."""
    blackout = db.session.get(LeaveBlackout, id)
    if not blackout:
        return jsonify({'status': 'error', 'message': 'Blackout not found'}), 404

    db.session.delete(blackout)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Blackout deleted'
    }), 200


# ============================================================================
# LEAVE OPERATIONS ENDPOINTS
# ============================================================================

@bp.route('/<int:leave_id>/cancel', methods=['POST'])
@jwt_required()
def request_cancellation(leave_id):
    """Request cancellation of an approved leave."""
    from app.services.notification_service import NotificationService

    user = get_current_user()
    leave = db.session.get(Leave, leave_id)

    if not leave:
        return jsonify({'status': 'error', 'message': 'Leave not found'}), 404

    # Users can only cancel their own leaves
    if leave.user_id != user.id and user.role != 'admin':
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    if leave.status != 'approved':
        return jsonify({'status': 'error', 'message': 'Only approved leaves can be cancelled'}), 400

    if leave.date_from <= date.today():
        return jsonify({'status': 'error', 'message': 'Cannot cancel leave that has already started'}), 400

    data = request.get_json() or {}

    leave.cancellation_requested = True
    leave.cancellation_reason = data.get('reason')
    db.session.commit()

    # Notify admins
    admins = User.query.filter_by(role='admin', is_active=True).all()
    for admin in admins:
        NotificationService.create_notification(
            user_id=admin.id,
            type='leave_cancellation_requested',
            title='Leave Cancellation Request',
            message=f'{user.full_name} requests cancellation of leave from {leave.date_from} to {leave.date_to}',
            related_type='leave',
            related_id=leave.id
        )

    language = get_language(user)

    return jsonify({
        'status': 'success',
        'message': 'Cancellation requested',
        'data': leave.to_dict(language=language)
    }), 200


@bp.route('/<int:leave_id>/cancel/approve', methods=['POST'])
@jwt_required()
@admin_required()
def approve_cancellation(leave_id):
    """Approve a leave cancellation request. Admin only."""
    from app.services.notification_service import NotificationService

    leave = db.session.get(Leave, leave_id)
    if not leave:
        return jsonify({'status': 'error', 'message': 'Leave not found'}), 404

    if not leave.cancellation_requested:
        return jsonify({'status': 'error', 'message': 'No cancellation request pending'}), 400

    admin = get_current_user()

    leave.status = 'cancelled'
    leave.cancelled_at = datetime.utcnow()
    leave.cancellation_requested = False

    # Restore user's leave status
    leave_user = db.session.get(User, leave.user_id)
    if leave_user:
        leave_user.is_on_leave = False

    # Clear coverage assignment
    if leave.coverage_user_id:
        coverage = db.session.get(User, leave.coverage_user_id)
        if coverage:
            coverage.leave_coverage_for = None

    db.session.commit()

    # Notify user
    NotificationService.create_notification(
        user_id=leave.user_id,
        type='leave_cancellation_approved',
        title='Leave Cancellation Approved',
        message=f'Your leave cancellation request for {leave.date_from} to {leave.date_to} has been approved',
        related_type='leave',
        related_id=leave.id
    )

    language = get_language(admin)

    return jsonify({
        'status': 'success',
        'message': 'Cancellation approved',
        'data': leave.to_dict(language=language)
    }), 200


@bp.route('/<int:leave_id>/cancel/reject', methods=['POST'])
@jwt_required()
@admin_required()
def reject_cancellation(leave_id):
    """Reject a leave cancellation request. Admin only."""
    from app.services.notification_service import NotificationService

    leave = db.session.get(Leave, leave_id)
    if not leave:
        return jsonify({'status': 'error', 'message': 'Leave not found'}), 404

    if not leave.cancellation_requested:
        return jsonify({'status': 'error', 'message': 'No cancellation request pending'}), 400

    data = request.get_json() or {}
    admin = get_current_user()

    leave.cancellation_requested = False
    db.session.commit()

    # Notify user
    NotificationService.create_notification(
        user_id=leave.user_id,
        type='leave_cancellation_rejected',
        title='Leave Cancellation Rejected',
        message=f'Your leave cancellation request was rejected' + (f': {data.get("reason")}' if data.get('reason') else ''),
        related_type='leave',
        related_id=leave.id
    )

    language = get_language(admin)

    return jsonify({
        'status': 'success',
        'message': 'Cancellation rejected',
        'data': leave.to_dict(language=language)
    }), 200


@bp.route('/<int:leave_id>/extend', methods=['POST'])
@jwt_required()
def request_extension(leave_id):
    """Request extension of an existing leave."""
    from app.services.notification_service import NotificationService

    user = get_current_user()
    original_leave = db.session.get(Leave, leave_id)

    if not original_leave:
        return jsonify({'status': 'error', 'message': 'Leave not found'}), 404

    if original_leave.user_id != user.id:
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    if original_leave.status != 'approved':
        return jsonify({'status': 'error', 'message': 'Only approved leaves can be extended'}), 400

    data = request.get_json()

    if not data.get('new_date_to'):
        return jsonify({'status': 'error', 'message': 'new_date_to is required'}), 400

    new_date_to = date.fromisoformat(data['new_date_to'])

    if new_date_to <= original_leave.date_to:
        return jsonify({'status': 'error', 'message': 'New end date must be after current end date'}), 400

    # Create extension request as a new leave linked to original
    extension_days = (new_date_to - original_leave.date_to).days

    extension = Leave(
        user_id=user.id,
        leave_type=original_leave.leave_type,
        leave_type_id=original_leave.leave_type_id,
        date_from=original_leave.date_to + timedelta(days=1),
        date_to=new_date_to,
        total_days=extension_days,
        reason=data.get('reason', 'Extension of existing leave'),
        scope=original_leave.scope,
        coverage_user_id=original_leave.coverage_user_id,
        extension_of_id=original_leave.id,
        status='pending'
    )

    db.session.add(extension)
    db.session.commit()

    # Notify admins
    admins = User.query.filter_by(role='admin', is_active=True).all()
    for admin in admins:
        NotificationService.create_notification(
            user_id=admin.id,
            type='leave_extension_requested',
            title='Leave Extension Request',
            message=f'{user.full_name} requests to extend leave by {extension_days} days until {new_date_to}',
            related_type='leave',
            related_id=extension.id
        )

    language = get_language(user)

    return jsonify({
        'status': 'success',
        'message': 'Extension request submitted',
        'data': extension.to_dict(language=language)
    }), 201


@bp.route('/bulk/approve', methods=['POST'])
@jwt_required()
@admin_required()
def bulk_approve():
    """Bulk approve multiple leave requests. Admin only."""
    from app.services.notification_service import NotificationService

    data = request.get_json()
    leave_ids = data.get('leave_ids', [])

    if not leave_ids:
        return jsonify({'status': 'error', 'message': 'leave_ids is required'}), 400

    admin = get_current_user()
    approved = []
    errors = []

    for leave_id in leave_ids:
        leave = db.session.get(Leave, leave_id)
        if not leave:
            errors.append({'id': leave_id, 'error': 'Not found'})
            continue
        if leave.status != 'pending':
            errors.append({'id': leave_id, 'error': 'Not pending'})
            continue

        leave.status = 'approved'
        leave.approved_by_id = admin.id
        leave.approved_at = datetime.utcnow()

        # Mark user as on leave if applicable
        user = db.session.get(User, leave.user_id)
        if leave.date_from <= date.today():
            user.is_on_leave = True

        approved.append(leave_id)

        # Notify user
        NotificationService.create_notification(
            user_id=leave.user_id,
            type='leave_approved',
            title='Leave Approved',
            message=f'Your leave from {leave.date_from} to {leave.date_to} has been approved',
            related_type='leave',
            related_id=leave.id
        )

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Approved {len(approved)} leave(s)',
        'data': {
            'approved': approved,
            'errors': errors
        }
    }), 200


@bp.route('/bulk/reject', methods=['POST'])
@jwt_required()
@admin_required()
def bulk_reject():
    """Bulk reject multiple leave requests. Admin only."""
    from app.services.notification_service import NotificationService

    data = request.get_json()
    leave_ids = data.get('leave_ids', [])
    reason = data.get('reason')

    if not leave_ids:
        return jsonify({'status': 'error', 'message': 'leave_ids is required'}), 400

    admin = get_current_user()
    rejected = []
    errors = []

    for leave_id in leave_ids:
        leave = db.session.get(Leave, leave_id)
        if not leave:
            errors.append({'id': leave_id, 'error': 'Not found'})
            continue
        if leave.status != 'pending':
            errors.append({'id': leave_id, 'error': 'Not pending'})
            continue

        leave.status = 'rejected'
        leave.approved_by_id = admin.id
        leave.approved_at = datetime.utcnow()
        leave.rejection_reason = reason
        rejected.append(leave_id)

        # Notify user
        NotificationService.create_notification(
            user_id=leave.user_id,
            type='leave_rejected',
            title='Leave Rejected',
            message=f'Your leave request has been rejected' + (f': {reason}' if reason else ''),
            related_type='leave',
            related_id=leave.id
        )

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Rejected {len(rejected)} leave(s)',
        'data': {
            'rejected': rejected,
            'errors': errors
        }
    }), 200


# ============================================================================
# COMPENSATORY LEAVE ENDPOINTS
# ============================================================================

@bp.route('/compensatory', methods=['GET'])
@jwt_required()
def list_compensatory():
    """List compensatory leave requests."""
    user = get_current_user()
    language = get_language(user)

    user_id = request.args.get('user_id', type=int)
    status = request.args.get('status')

    query = CompensatoryLeave.query

    # Regular users can only see their own
    if user.role not in ('admin', 'engineer'):
        query = query.filter_by(user_id=user.id)
    elif user_id:
        query = query.filter_by(user_id=user_id)

    if status:
        query = query.filter_by(status=status)

    query = query.order_by(CompensatoryLeave.created_at.desc())
    items, pagination_meta = paginate(query)

    return jsonify({
        'status': 'success',
        'data': [c.to_dict(language=language) for c in items],
        'pagination': pagination_meta
    }), 200


@bp.route('/compensatory', methods=['POST'])
@jwt_required()
@engineer_or_admin_required()
def create_compensatory():
    """Request compensatory leave for overtime. Engineer or Admin only."""
    from app.services.notification_service import NotificationService

    data = request.get_json()
    requester = get_current_user()

    required = ['user_id', 'work_date', 'hours_worked']
    for field in required:
        if field not in data:
            return jsonify({'status': 'error', 'message': f'{field} is required'}), 400

    target = db.session.get(User, data['user_id'])
    if not target:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404

    work_date = date.fromisoformat(data['work_date'])
    hours_worked = float(data['hours_worked'])

    if hours_worked <= 0:
        return jsonify({'status': 'error', 'message': 'hours_worked must be positive'}), 400

    # Calculate comp days (typically 0.5 for 4+ hours, 1.0 for 8+ hours)
    if hours_worked >= 8:
        comp_days = 1.0
    elif hours_worked >= 4:
        comp_days = 0.5
    else:
        comp_days = round(hours_worked / 8, 2)

    # Set expiration (typically 3 months)
    expires_at = date.today() + timedelta(days=90)

    comp = CompensatoryLeave(
        user_id=data['user_id'],
        work_date=work_date,
        hours_worked=hours_worked,
        comp_days_earned=comp_days,
        reason=data.get('reason'),
        status='pending',
        expires_at=expires_at
    )

    db.session.add(comp)
    db.session.commit()

    # Notify admins
    admins = User.query.filter_by(role='admin', is_active=True).all()
    for admin in admins:
        NotificationService.create_notification(
            user_id=admin.id,
            type='compensatory_requested',
            title='Compensatory Leave Request',
            message=f'{requester.full_name} submitted comp-off request for {target.full_name}: {hours_worked}h on {work_date}',
            related_type='compensatory_leave',
            related_id=comp.id
        )

    language = get_language(requester)

    return jsonify({
        'status': 'success',
        'message': 'Compensatory leave request submitted',
        'data': comp.to_dict(language=language)
    }), 201


@bp.route('/compensatory/<int:id>/approve', methods=['POST'])
@jwt_required()
@admin_required()
def approve_compensatory(id):
    """Approve a compensatory leave request. Admin only."""
    from app.services.notification_service import NotificationService

    comp = db.session.get(CompensatoryLeave, id)
    if not comp:
        return jsonify({'status': 'error', 'message': 'Compensatory leave not found'}), 404

    if comp.status != 'pending':
        return jsonify({'status': 'error', 'message': 'Request is not pending'}), 400

    admin = get_current_user()

    comp.status = 'approved'
    comp.approved_by_id = admin.id
    comp.approved_at = datetime.utcnow()

    db.session.commit()

    # Notify user
    NotificationService.create_notification(
        user_id=comp.user_id,
        type='compensatory_approved',
        title='Compensatory Leave Approved',
        message=f'Your comp-off request for {comp.work_date} ({comp.comp_days_earned} days) has been approved',
        related_type='compensatory_leave',
        related_id=comp.id
    )

    language = get_language(admin)

    return jsonify({
        'status': 'success',
        'message': 'Compensatory leave approved',
        'data': comp.to_dict(language=language)
    }), 200


@bp.route('/compensatory/<int:id>/reject', methods=['POST'])
@jwt_required()
@admin_required()
def reject_compensatory(id):
    """Reject a compensatory leave request. Admin only."""
    from app.services.notification_service import NotificationService

    comp = db.session.get(CompensatoryLeave, id)
    if not comp:
        return jsonify({'status': 'error', 'message': 'Compensatory leave not found'}), 404

    if comp.status != 'pending':
        return jsonify({'status': 'error', 'message': 'Request is not pending'}), 400

    data = request.get_json() or {}
    admin = get_current_user()

    # Update status to expired (no rejected status in model)
    comp.status = 'expired'
    comp.approved_by_id = admin.id
    comp.approved_at = datetime.utcnow()

    db.session.commit()

    # Notify user
    NotificationService.create_notification(
        user_id=comp.user_id,
        type='compensatory_rejected',
        title='Compensatory Leave Rejected',
        message=f'Your comp-off request for {comp.work_date} was rejected' + (f': {data.get("reason")}' if data.get('reason') else ''),
        related_type='compensatory_leave',
        related_id=comp.id
    )

    language = get_language(admin)

    return jsonify({
        'status': 'success',
        'message': 'Compensatory leave rejected',
        'data': comp.to_dict(language=language)
    }), 200


# ============================================================================
# ENCASHMENT ENDPOINTS
# ============================================================================

@bp.route('/encashment', methods=['GET'])
@jwt_required()
def list_encashment():
    """List leave encashment requests."""
    user = get_current_user()
    language = get_language(user)

    user_id = request.args.get('user_id', type=int)
    status = request.args.get('status')

    query = LeaveEncashment.query

    # Regular users can only see their own
    if user.role != 'admin':
        query = query.filter_by(user_id=user.id)
    elif user_id:
        query = query.filter_by(user_id=user_id)

    if status:
        query = query.filter_by(status=status)

    query = query.order_by(LeaveEncashment.requested_at.desc())
    items, pagination_meta = paginate(query)

    return jsonify({
        'status': 'success',
        'data': [e.to_dict(language=language) for e in items],
        'pagination': pagination_meta
    }), 200


@bp.route('/encashment', methods=['POST'])
@jwt_required()
def request_encashment():
    """Request leave encashment."""
    from app.services.notification_service import NotificationService

    user = get_current_user()
    data = request.get_json()

    if 'days' not in data:
        return jsonify({'status': 'error', 'message': 'days is required'}), 400

    days = float(data['days'])
    if days <= 0:
        return jsonify({'status': 'error', 'message': 'days must be positive'}), 400

    leave_type_id = data.get('leave_type_id')

    # Check balance
    current_year = date.today().year
    used = db.session.query(
        db.func.coalesce(db.func.sum(Leave.total_days), 0)
    ).filter(
        Leave.user_id == user.id,
        Leave.status.in_(['pending', 'approved']),
        Leave.date_from >= date(current_year, 1, 1)
    ).scalar()

    total_balance = user.annual_leave_balance or 24
    remaining = total_balance - float(used)

    if days > remaining:
        return jsonify({'status': 'error', 'message': f'Insufficient balance. Remaining: {remaining} days'}), 400

    encashment = LeaveEncashment(
        user_id=user.id,
        leave_type_id=leave_type_id,
        days_encashed=days,
        status='pending'
    )

    db.session.add(encashment)
    db.session.commit()

    # Notify admins
    admins = User.query.filter_by(role='admin', is_active=True).all()
    for admin in admins:
        NotificationService.create_notification(
            user_id=admin.id,
            type='encashment_requested',
            title='Leave Encashment Request',
            message=f'{user.full_name} requests encashment of {days} leave days',
            related_type='leave_encashment',
            related_id=encashment.id
        )

    language = get_language(user)

    return jsonify({
        'status': 'success',
        'message': 'Encashment request submitted',
        'data': encashment.to_dict(language=language)
    }), 201


@bp.route('/encashment/<int:id>/approve', methods=['POST'])
@jwt_required()
@admin_required()
def approve_encashment(id):
    """Approve a leave encashment request. Admin only."""
    from app.services.notification_service import NotificationService

    encashment = db.session.get(LeaveEncashment, id)
    if not encashment:
        return jsonify({'status': 'error', 'message': 'Encashment request not found'}), 404

    if encashment.status != 'pending':
        return jsonify({'status': 'error', 'message': 'Request is not pending'}), 400

    data = request.get_json() or {}
    admin = get_current_user()

    encashment.approve(admin.id, data.get('notes'))

    # Set amount if provided
    if 'amount_per_day' in data:
        encashment.amount_per_day = data['amount_per_day']
        encashment.calculate_total()

    # Deduct from user's balance
    target = db.session.get(User, encashment.user_id)
    if target:
        target.annual_leave_balance = (target.annual_leave_balance or 24) - encashment.days_encashed

    db.session.commit()

    # Notify user
    NotificationService.create_notification(
        user_id=encashment.user_id,
        type='encashment_approved',
        title='Leave Encashment Approved',
        message=f'Your leave encashment request for {encashment.days_encashed} days has been approved',
        related_type='leave_encashment',
        related_id=encashment.id
    )

    language = get_language(admin)

    return jsonify({
        'status': 'success',
        'message': 'Encashment approved',
        'data': encashment.to_dict(language=language)
    }), 200


@bp.route('/encashment/<int:id>/pay', methods=['POST'])
@jwt_required()
@admin_required()
def mark_encashment_paid(id):
    """Mark an encashment as paid. Admin only."""
    from app.services.notification_service import NotificationService

    encashment = db.session.get(LeaveEncashment, id)
    if not encashment:
        return jsonify({'status': 'error', 'message': 'Encashment request not found'}), 404

    if encashment.status != 'approved':
        return jsonify({'status': 'error', 'message': 'Request must be approved first'}), 400

    encashment.mark_paid()
    db.session.commit()

    # Notify user
    NotificationService.create_notification(
        user_id=encashment.user_id,
        type='encashment_paid',
        title='Leave Encashment Paid',
        message=f'Your leave encashment for {encashment.days_encashed} days has been processed',
        related_type='leave_encashment',
        related_id=encashment.id
    )

    admin = get_current_user()
    language = get_language(admin)

    return jsonify({
        'status': 'success',
        'message': 'Encashment marked as paid',
        'data': encashment.to_dict(language=language)
    }), 200


# ============================================================================
# AI FEATURES ENDPOINTS
# ============================================================================

@bp.route('/ai/predict-capacity', methods=['GET'])
@jwt_required()
def predict_capacity():
    """Forecast team capacity."""
    user = get_current_user()

    role = request.args.get('role')
    days_ahead = request.args.get('days_ahead', type=int, default=30)

    if days_ahead > 90:
        days_ahead = 90

    forecast = leave_ai_service.forecast_team_capacity(role or user.role, days_ahead)

    return jsonify({
        'status': 'success',
        'data': forecast
    }), 200


@bp.route('/ai/suggest-coverage/<int:leave_id>', methods=['GET'])
@jwt_required()
def suggest_coverage(leave_id):
    """Get AI-powered coverage suggestions for a leave."""
    leave = db.session.get(Leave, leave_id)
    if not leave:
        return jsonify({'status': 'error', 'message': 'Leave not found'}), 404

    suggestions = leave_ai_service.suggest_optimal_coverage(leave_id)

    return jsonify({
        'status': 'success',
        'data': suggestions
    }), 200


@bp.route('/ai/suggest-dates', methods=['POST'])
@jwt_required()
def suggest_dates():
    """Suggest alternative dates for leave."""
    data = request.get_json()

    required = ['user_id', 'date_from', 'date_to']
    for field in required:
        if field not in data:
            return jsonify({'status': 'error', 'message': f'{field} is required'}), 400

    user_id = data['user_id']
    date_from = date.fromisoformat(data['date_from'])
    date_to = date.fromisoformat(data['date_to'])

    suggestions = leave_ai_service.suggest_alternative_dates(user_id, date_from, date_to)

    return jsonify({
        'status': 'success',
        'data': suggestions
    }), 200


@bp.route('/ai/burnout-risk', methods=['GET'])
@jwt_required()
def get_burnout_risk():
    """Get burnout risk report."""
    user = get_current_user()
    user_id = request.args.get('user_id', type=int)

    # Regular users can only see their own
    if user.role != 'admin' and user_id and user_id != user.id:
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    if user.role == 'admin' and not user_id:
        # Return all users' burnout risk
        users = User.query.filter_by(is_active=True).all()
        risks = []
        for u in users:
            risk = leave_ai_service.detect_burnout_risk(u.id)
            if not risk.get('error'):
                risks.append(risk)

        # Sort by risk level
        risk_order = {'high': 0, 'medium': 1, 'low': 2}
        risks.sort(key=lambda x: risk_order.get(x.get('risk_level'), 3))

        return jsonify({
            'status': 'success',
            'data': risks
        }), 200

    target_id = user_id or user.id
    risk = leave_ai_service.detect_burnout_risk(target_id)

    return jsonify({
        'status': 'success',
        'data': risk
    }), 200


@bp.route('/ai/patterns', methods=['GET'])
@jwt_required()
def get_patterns():
    """Get leave patterns analysis."""
    user = get_current_user()

    user_id = request.args.get('user_id', type=int)
    department = request.args.get('department')

    # Regular users can only see their own
    if user.role != 'admin' and user_id and user_id != user.id:
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    patterns = leave_ai_service.analyze_leave_patterns(
        user_id=user_id or (user.id if user.role != 'admin' else None),
        department=department
    )

    return jsonify({
        'status': 'success',
        'data': patterns
    }), 200


@bp.route('/ai/wellness-score', methods=['GET'])
@jwt_required()
def get_wellness_score():
    """Get team wellness score."""
    role = request.args.get('role')

    score = leave_ai_service.get_team_wellness_score(role)

    return jsonify({
        'status': 'success',
        'data': score
    }), 200


@bp.route('/ai/compliance', methods=['GET'])
@jwt_required()
@admin_required()
def get_compliance():
    """Get compliance report. Admin only."""
    report = leave_ai_service.get_compliance_report()

    return jsonify({
        'status': 'success',
        'data': report
    }), 200


@bp.route('/ai/natural-request', methods=['POST'])
@jwt_required()
def parse_natural_request():
    """Parse natural language leave request."""
    user = get_current_user()
    data = request.get_json()

    if not data.get('text'):
        return jsonify({'status': 'error', 'message': 'text is required'}), 400

    result = leave_ai_service.process_natural_language_request(user.id, data['text'])

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/ai/auto-approve-check/<int:leave_id>', methods=['GET'])
@jwt_required()
@admin_required()
def check_auto_approve(leave_id):
    """Check if leave can be auto-approved. Admin only."""
    result = leave_ai_service.evaluate_auto_approval(leave_id)

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/ai/impact/<int:leave_id>', methods=['GET'])
@jwt_required()
def analyze_impact(leave_id):
    """Analyze leave impact on work."""
    leave = db.session.get(Leave, leave_id)
    if not leave:
        return jsonify({'status': 'error', 'message': 'Leave not found'}), 404

    user = get_current_user()

    # Users can only see their own or admin can see all
    if leave.user_id != user.id and user.role != 'admin':
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403

    impact = leave_ai_service.analyze_leave_impact(leave_id)

    return jsonify({
        'status': 'success',
        'data': impact
    }), 200


# ============================================================================
# TEAM CALENDAR ENDPOINT
# ============================================================================

@bp.route('/team-calendar', methods=['GET'])
@jwt_required()
def get_team_calendar():
    """Get team leaves for calendar view."""
    user = get_current_user()
    language = get_language(user)

    month = request.args.get('month', type=int, default=date.today().month)
    year = request.args.get('year', type=int, default=date.today().year)
    role = request.args.get('role')

    # Calculate date range
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month + 1, 1) - timedelta(days=1)

    # Get leaves in range
    query = Leave.query.filter(
        Leave.status.in_(['approved', 'pending']),
        Leave.date_from <= end_date,
        Leave.date_to >= start_date
    )

    if role:
        query = query.join(User).filter(User.role == role)

    leaves = query.all()

    # Build calendar data
    calendar_data = {}
    current = start_date
    while current <= end_date:
        calendar_data[current.isoformat()] = {
            'date': current.isoformat(),
            'is_weekend': current.weekday() >= 5,
            'is_holiday': LeaveCalendar.is_holiday(current),
            'leaves': []
        }
        current += timedelta(days=1)

    # Add leaves to calendar
    for leave in leaves:
        leave_start = max(leave.date_from, start_date)
        leave_end = min(leave.date_to, end_date)

        current = leave_start
        while current <= leave_end:
            date_key = current.isoformat()
            if date_key in calendar_data:
                calendar_data[date_key]['leaves'].append({
                    'leave_id': leave.id,
                    'user_id': leave.user_id,
                    'user_name': leave.user.full_name if leave.user else None,
                    'leave_type': leave.leave_type,
                    'status': leave.status,
                    'is_half_day': leave.is_half_day,
                    'half_day_period': leave.half_day_period
                })
            current += timedelta(days=1)

    # Convert to list sorted by date
    calendar_list = sorted(calendar_data.values(), key=lambda x: x['date'])

    return jsonify({
        'status': 'success',
        'data': {
            'month': month,
            'year': year,
            'role': role,
            'calendar': calendar_list
        }
    }), 200


# ============================================================================
# REPORTS ENDPOINTS
# ============================================================================

@bp.route('/reports/summary', methods=['GET'])
@jwt_required()
@admin_required()
def get_summary_report():
    """Get leave summary report. Admin only."""
    date_from = request.args.get('from')
    date_to = request.args.get('to')
    role = request.args.get('role')

    # Default to current year
    if not date_from:
        date_from = date(date.today().year, 1, 1)
    else:
        date_from = date.fromisoformat(date_from)

    if not date_to:
        date_to = date.today()
    else:
        date_to = date.fromisoformat(date_to)

    # Build query
    query = Leave.query.filter(
        Leave.date_from >= date_from,
        Leave.date_to <= date_to
    )

    if role:
        query = query.join(User).filter(User.role == role)

    leaves = query.all()

    # Calculate statistics
    total_requests = len(leaves)
    approved = sum(1 for l in leaves if l.status == 'approved')
    rejected = sum(1 for l in leaves if l.status == 'rejected')
    pending = sum(1 for l in leaves if l.status == 'pending')
    cancelled = sum(1 for l in leaves if l.status == 'cancelled')

    total_days = sum(l.total_days for l in leaves if l.status == 'approved')

    # By type
    by_type = {}
    for leave in leaves:
        if leave.leave_type not in by_type:
            by_type[leave.leave_type] = {'count': 0, 'days': 0}
        by_type[leave.leave_type]['count'] += 1
        if leave.status == 'approved':
            by_type[leave.leave_type]['days'] += leave.total_days

    # By role
    by_role = {}
    for leave in leaves:
        user_role = leave.user.role if leave.user else 'unknown'
        if user_role not in by_role:
            by_role[user_role] = {'count': 0, 'days': 0}
        by_role[user_role]['count'] += 1
        if leave.status == 'approved':
            by_role[user_role]['days'] += leave.total_days

    return jsonify({
        'status': 'success',
        'data': {
            'period': {
                'from': date_from.isoformat(),
                'to': date_to.isoformat()
            },
            'total_requests': total_requests,
            'approved': approved,
            'rejected': rejected,
            'pending': pending,
            'cancelled': cancelled,
            'total_days_approved': total_days,
            'by_type': by_type,
            'by_role': by_role
        }
    }), 200


@bp.route('/reports/utilization', methods=['GET'])
@jwt_required()
@admin_required()
def get_utilization_report():
    """Get leave utilization report. Admin only."""
    role = request.args.get('role')

    query = User.query.filter_by(is_active=True)
    if role:
        query = query.filter_by(role=role)

    users = query.all()

    current_year = date.today().year
    year_start = date(current_year, 1, 1)

    report = []

    for user in users:
        # Calculate used days
        used = db.session.query(
            db.func.coalesce(db.func.sum(Leave.total_days), 0)
        ).filter(
            Leave.user_id == user.id,
            Leave.status == 'approved',
            Leave.date_from >= year_start
        ).scalar()

        total_allowance = user.annual_leave_balance or 24
        remaining = total_allowance - float(used)
        utilization_rate = (float(used) / total_allowance * 100) if total_allowance > 0 else 0

        report.append({
            'user_id': user.id,
            'user_name': user.full_name,
            'role': user.role,
            'total_allowance': total_allowance,
            'used': float(used),
            'remaining': remaining,
            'utilization_rate': round(utilization_rate, 1)
        })

    # Sort by utilization rate
    report.sort(key=lambda x: x['utilization_rate'], reverse=True)

    # Calculate averages
    avg_utilization = sum(r['utilization_rate'] for r in report) / len(report) if report else 0

    return jsonify({
        'status': 'success',
        'data': {
            'year': current_year,
            'total_users': len(report),
            'average_utilization_rate': round(avg_utilization, 1),
            'users': report
        }
    }), 200
