"""GET /api/eqt-availability — the planners' daily equipment availability (Rule 2).

Its own file on purpose: new work-plan features never go into work_plans.py
(knot 4, option C). Planners only, the same PLANNING_ROLES as the board.
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from app.exceptions.api_exceptions import ForbiddenError
from app.services.eqt_availability import current_list
from app.utils.decorators import get_current_user
from app.utils.roles import PLANNING_ROLES

bp = Blueprint("eqt_availability", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
def get_eqt_availability():
    user = get_current_user()
    if user is None or user.role not in PLANNING_ROLES:
        raise ForbiddenError("Only engineers and admins can see equipment availability")
    return jsonify({"status": "success", "data": current_list()}), 200
