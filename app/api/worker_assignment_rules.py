"""
Worker Assignment Rules API.
CRUD endpoints for the auto-planner's worker assignment defaults.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy.exc import IntegrityError, ProgrammingError, OperationalError

from app.extensions import db
from app.models.worker_assignment_rule import WorkerAssignmentRule
from app.models.user import User
from app.utils.decorators import get_current_user
from app.exceptions.api_exceptions import ForbiddenError, NotFoundError, ValidationError


bp = Blueprint('worker_assignment_rules', __name__, url_prefix='/api/worker-assignment-rules')


def _engineer_or_admin_required():
    user = get_current_user()
    if user.role not in ('admin', 'engineer', 'quality_engineer'):
        raise ForbiddenError("Only engineers and admins can manage assignment rules")
    return user


def _table_exists():
    """Check if the worker_assignment_rules table exists in DB."""
    try:
        from sqlalchemy import inspect
        return inspect(db.engine).has_table('worker_assignment_rules')
    except Exception:
        return False


@bp.route('', methods=['GET'])
@jwt_required()
def list_rules():
    """List all worker assignment rules, optionally filtered."""
    _engineer_or_admin_required()

    if not _table_exists():
        return jsonify({'status': 'success', 'rules': [], 'table_missing': True}), 200

    berth = request.args.get('berth')
    team_type = request.args.get('team_type')

    query = WorkerAssignmentRule.query
    if berth:
        query = query.filter_by(berth=berth)
    if team_type:
        query = query.filter_by(team_type=team_type)

    rules = query.order_by(
        WorkerAssignmentRule.berth,
        WorkerAssignmentRule.team_type,
        WorkerAssignmentRule.equipment_category,
    ).all()

    return jsonify({
        'status': 'success',
        'rules': [r.to_dict() for r in rules],
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
def create_rule():
    """Create a new worker assignment rule."""
    _engineer_or_admin_required()

    if not _table_exists():
        return jsonify({
            'status': 'error',
            'message': 'Table worker_assignment_rules does not exist. Run flask db upgrade first.',
        }), 503

    data = request.get_json() or {}

    required = ('berth', 'team_type', 'equipment_category')
    for f in required:
        if not data.get(f):
            raise ValidationError(f"Missing required field: {f}")

    rule = WorkerAssignmentRule(
        berth=data['berth'],
        team_type=data['team_type'],
        equipment_category=data['equipment_category'],
        team_number=int(data.get('team_number') or 1),
        mech_count=int(data.get('mech_count') or 0),
        elec_count=int(data.get('elec_count') or 0),
        primary_mech_lead_id=data.get('primary_mech_lead_id'),
        successor_mech_lead_id=data.get('successor_mech_lead_id'),
        primary_elec_lead_id=data.get('primary_elec_lead_id'),
        successor_elec_lead_id=data.get('successor_elec_lead_id'),
        candidate_mech_workers=data.get('candidate_mech_workers') or [],
        candidate_elec_workers=data.get('candidate_elec_workers') or [],
        is_active=data.get('is_active', True),
    )

    try:
        db.session.add(rule)
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        return jsonify({
            'status': 'error',
            'message': 'A rule for this (berth, team_type, equipment_category, team_number) combination already exists.',
        }), 409

    return jsonify({'status': 'success', 'rule': rule.to_dict()}), 201


@bp.route('/<int:rule_id>', methods=['PUT'])
@jwt_required()
def update_rule(rule_id):
    """Update an existing rule."""
    _engineer_or_admin_required()

    rule = db.session.get(WorkerAssignmentRule, rule_id)
    if not rule:
        raise NotFoundError("Worker Assignment Rule")

    data = request.get_json() or {}

    if 'team_number' in data:
        rule.team_number = int(data['team_number'])
    if 'mech_count' in data:
        rule.mech_count = int(data['mech_count'])
    if 'elec_count' in data:
        rule.elec_count = int(data['elec_count'])
    if 'primary_mech_lead_id' in data:
        rule.primary_mech_lead_id = data['primary_mech_lead_id']
    if 'successor_mech_lead_id' in data:
        rule.successor_mech_lead_id = data['successor_mech_lead_id']
    if 'primary_elec_lead_id' in data:
        rule.primary_elec_lead_id = data['primary_elec_lead_id']
    if 'successor_elec_lead_id' in data:
        rule.successor_elec_lead_id = data['successor_elec_lead_id']
    if 'candidate_mech_workers' in data:
        rule.candidate_mech_workers = data['candidate_mech_workers']
    if 'candidate_elec_workers' in data:
        rule.candidate_elec_workers = data['candidate_elec_workers']
    if 'is_active' in data:
        rule.is_active = bool(data['is_active'])

    db.session.commit()
    return jsonify({'status': 'success', 'rule': rule.to_dict()}), 200


@bp.route('/<int:rule_id>', methods=['DELETE'])
@jwt_required()
def delete_rule(rule_id):
    """Delete a rule."""
    _engineer_or_admin_required()

    rule = db.session.get(WorkerAssignmentRule, rule_id)
    if not rule:
        raise NotFoundError("Worker Assignment Rule")

    db.session.delete(rule)
    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Rule deleted'}), 200


@bp.route('/seed-defaults', methods=['POST'])
@jwt_required()
def seed_defaults():
    """
    Create sensible default rules for both berths if no rules exist yet.
    Idempotent: skips combinations that already have rules.
    """
    _engineer_or_admin_required()

    if not _table_exists():
        return jsonify({
            'status': 'error',
            'message': 'Table worker_assignment_rules does not exist. Run flask db upgrade first.',
        }), 503

    # Default counts based on Ali's voice notes
    PM_DEFAULTS = {
        'reach_stacker': {'mech': 3, 'elec': 2},
        'ech': {'mech': 3, 'elec': 2},
        'truck': {'mech': 2, 'elec': 1},
        'forklift': {'mech': 2, 'elec': 1},
        'trailer': {'mech': 2, 'elec': 1},
    }
    DEFECT_DEFAULTS = {'mech': 2, 'elec': 0}  # mech defect → 2 mech workers; elec defect → 2 elec
    AC_DEFAULTS = {'all': {'mech': 1, 'elec': 0}}  # AC team is 1 specialist

    created = 0
    skipped = 0

    for berth in ('east', 'west'):
        # Regular PM rules
        for cat, counts in PM_DEFAULTS.items():
            existing = WorkerAssignmentRule.query.filter_by(
                berth=berth, team_type='regular_pm', equipment_category=cat
            ).first()
            if existing:
                skipped += 1
                continue
            db.session.add(WorkerAssignmentRule(
                berth=berth,
                team_type='regular_pm',
                equipment_category=cat,
                mech_count=counts['mech'],
                elec_count=counts['elec'],
            ))
            created += 1

        # AC PM rules (single 'all' rule)
        existing = WorkerAssignmentRule.query.filter_by(
            berth=berth, team_type='ac_pm', equipment_category='all'
        ).first()
        if not existing:
            db.session.add(WorkerAssignmentRule(
                berth=berth,
                team_type='ac_pm',
                equipment_category='all',
                mech_count=AC_DEFAULTS['all']['mech'],
                elec_count=AC_DEFAULTS['all']['elec'],
            ))
            created += 1
        else:
            skipped += 1

        # Defect rules
        for team_type, counts in [
            ('defect_mech', {'mech': 2, 'elec': 0}),
            ('defect_elec', {'mech': 0, 'elec': 2}),
        ]:
            existing = WorkerAssignmentRule.query.filter_by(
                berth=berth, team_type=team_type, equipment_category='all'
            ).first()
            if existing:
                skipped += 1
                continue
            db.session.add(WorkerAssignmentRule(
                berth=berth,
                team_type=team_type,
                equipment_category='all',
                mech_count=counts['mech'],
                elec_count=counts['elec'],
            ))
            created += 1

    db.session.commit()
    return jsonify({
        'status': 'success',
        'created': created,
        'skipped': skipped,
        'message': f'Created {created} default rules ({skipped} already existed)',
    }), 200
