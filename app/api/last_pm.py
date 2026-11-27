"""GET /api/last-pm — when each machine last had a finished PM (Rule 1).

Shown as a grey line in Job Details so the planner can see why the app put a
machine first among tied jobs (Ali, 2026-11-27). Its own file on purpose: new
work-plan features never go into work_plans.py (knot 4, option C). Planners
only, the same PLANNING_ROLES that guard the planning board.
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from app.exceptions.api_exceptions import ForbiddenError
from app.services.last_pm import load
from app.utils.decorators import get_current_user
from app.utils.roles import PLANNING_ROLES

bp = Blueprint("last_pm", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
def get_last_pm():
    user = get_current_user()
    if user is None or user.role not in PLANNING_ROLES:
        raise ForbiddenError("Only engineers and admins can see the last-PM list")
    return jsonify({"status": "success", "data": load()}), 200
