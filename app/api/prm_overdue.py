"""GET /api/prm-overdue — the planner's overdue PRM list (SERVER_PRM_OVERDUE.md).

Its own file on purpose: new work-plan features never go into work_plans.py
(knot 4, option C). Planners only (Ali, 2026-11-25) — the same PLANNING_ROLES
that guard the planning board.
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from app.exceptions.api_exceptions import ForbiddenError
from app.services.prm_overdue import current_list
from app.utils.decorators import get_current_user
from app.utils.roles import PLANNING_ROLES

bp = Blueprint('prm_overdue', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
def get_prm_overdue():
    user = get_current_user()
    if user is None or user.role not in PLANNING_ROLES:
        raise ForbiddenError('Only engineers and admins can see the PRM overdue list')
    return jsonify({'status': 'success', 'data': current_list()}), 200
