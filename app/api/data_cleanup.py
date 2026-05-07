"""
Data cleanup admin endpoints.

Tools for correcting historical inspector-typed readings that were mis-entered.
Specifically targets the "red tenths" mechanical-meter case where inspectors
typed all visible meter digits as a single integer (e.g. 95333 instead of
9533.3 — the digit on a contrasting colour on a mechanical meter is the
tenths place).

Endpoints (all admin-only):
    GET  /api/admin/cleanup/suspicious-readings  → flagged rows with summary
    POST /api/admin/cleanup/bulk-correct-readings → apply approved corrections
"""

import logging

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models.checklist import ChecklistItem
from app.models.equipment import Equipment
from app.models.file import File
from app.models.inspection import Inspection, InspectionAnswer
from app.services.running_hours_detection import is_running_hours_question
from app.utils.decorators import admin_required, get_current_user

logger = logging.getLogger(__name__)
bp = Blueprint('data_cleanup', __name__)


def _running_hours_item_ids():
    """Checklist item IDs whose questions ask for running-hours readings."""
    items = ChecklistItem.query.filter(ChecklistItem.answer_type == 'numeric').all()
    return [
        ci.id for ci in items
        if is_running_hours_question(ci.question_text, ci.question_text_ar)
    ]


def _parse_float(s):
    if s is None or s == '':
        return None
    try:
        return float(str(s).replace(',', '').strip())
    except (TypeError, ValueError):
        return None


def _classify(value, prev_value):
    """
    Decide whether a reading looks like a 10x typo, and how confident we are.

    Returns (confidence, reason) or (None, None) if not flagged.

    Heuristics tuned to recall over precision — admin reviews before applying:
        HIGH:    ratio in [8, 12]  (clean 10x signal vs. previous reading)
                 OR no prior + value >= 50_000  (unlikely lifetime hours)
        MEDIUM:  ratio in [5, 8) or (12, 20]   (loose 10x neighborhood)
                 OR value >= 50_000 with a prior   (still suspicious)
        LOW:     ratio in [3, 5)                  (only with include_low=true)
    """
    if prev_value and prev_value > 0:
        ratio = value / prev_value
        if 8 <= ratio <= 12:
            return 'high', f'{ratio:.1f}x previous reading ({prev_value:g} → {value:g})'
        if 5 <= ratio < 8 or 12 < ratio <= 20:
            return 'medium', f'{ratio:.1f}x previous reading'
        if 3 <= ratio < 5:
            return 'low', f'{ratio:.1f}x previous reading'

    # Value-based fallback: implausibly high standalone reading
    if value >= 50_000:
        if prev_value is None:
            return 'high', f'No prior reading; {value:g} suggests missing decimal'
        return 'medium', f'Value {value:g} unusually high'

    return None, None


@bp.route('/suspicious-readings', methods=['GET'])
@jwt_required()
@admin_required()
def list_suspicious_readings():
    """
    Return inspector-typed running-hours answers that look like 10x typos.

    Query params:
        include_low (bool, default false): include LOW-confidence rows (3-5x)

    Response shape:
        {
          "summary": {
            "total_running_hours_answers": int,  // numeric, submitted/reviewed
            "high_confidence": int,
            "medium_confidence": int,
            "low_confidence": int,
          },
          "rows": [
            {
              "answer_id": int,
              "equipment_id": int,
              "equipment_name": str,
              "current_value": float,
              "suggested_value": float,         // current_value / 10
              "previous_value": float | null,
              "ratio": float | null,
              "confidence": "high" | "medium" | "low",
              "reason": str,
              "answered_at": str (ISO-8601),
              "photo_url": str | null,
              "inspection_id": int,
              "checklist_item_id": int,
            }, ...
          ]
        }
    """
    include_low = request.args.get('include_low', 'false').lower() == 'true'

    item_ids = _running_hours_item_ids()
    if not item_ids:
        return jsonify({
            'status': 'success',
            'data': {
                'summary': {
                    'total_running_hours_answers': 0,
                    'high_confidence': 0,
                    'medium_confidence': 0,
                    'low_confidence': 0,
                },
                'rows': [],
            },
        })

    rows = db.session.query(InspectionAnswer, Inspection, Equipment).join(
        Inspection, InspectionAnswer.inspection_id == Inspection.id
    ).join(
        Equipment, Equipment.id == Inspection.equipment_id
    ).filter(
        InspectionAnswer.checklist_item_id.in_(item_ids),
        Inspection.status.in_(('submitted', 'reviewed')),
        InspectionAnswer.answer_value.isnot(None),
        InspectionAnswer.answer_value != '',
    ).order_by(
        Inspection.equipment_id,
        InspectionAnswer.answered_at.asc(),
    ).all()

    flagged = []
    baseline_by_equipment = {}
    total = 0
    counts = {'high': 0, 'medium': 0, 'low': 0}

    for answer, _inspection, equipment in rows:
        value = _parse_float(answer.answer_value)
        if value is None:
            continue
        total += 1

        prev = baseline_by_equipment.get(equipment.id)
        confidence, reason = _classify(value, prev)

        if confidence is None:
            # Not flagged — use this value as the next iteration's baseline
            baseline_by_equipment[equipment.id] = value
            continue

        if confidence == 'low' and not include_low:
            baseline_by_equipment[equipment.id] = value
            continue

        counts[confidence] += 1

        photo_url = None
        if answer.photo_file_id:
            f = db.session.get(File, answer.photo_file_id)
            photo_url = f.file_path if f else None

        ratio = (value / prev) if prev else None
        suggested = round(value / 10.0, 1)

        flagged.append({
            'answer_id': answer.id,
            'equipment_id': equipment.id,
            'equipment_name': equipment.name,
            'current_value': value,
            'suggested_value': suggested,
            'previous_value': prev,
            'ratio': round(ratio, 2) if ratio is not None else None,
            'confidence': confidence,
            'reason': reason,
            'answered_at': answer.answered_at.isoformat() if answer.answered_at else None,
            'photo_url': photo_url,
            'inspection_id': answer.inspection_id,
            'checklist_item_id': answer.checklist_item_id,
        })

        # Use suggested (corrected) value as the baseline so subsequent
        # readings are compared against the plausible value, not the typo.
        baseline_by_equipment[equipment.id] = suggested

    confidence_order = {'high': 0, 'medium': 1, 'low': 2}
    flagged.sort(
        key=lambda r: (
            confidence_order[r['confidence']],
            -(int((r['answered_at'] or '').replace('-', '').replace(':', '')[:14] or 0)
              if r['answered_at'] else 0),
        )
    )

    return jsonify({
        'status': 'success',
        'data': {
            'summary': {
                'total_running_hours_answers': total,
                'high_confidence': counts['high'],
                'medium_confidence': counts['medium'],
                'low_confidence': counts['low'],
            },
            'rows': flagged,
        },
    })


@bp.route('/bulk-correct-readings', methods=['POST'])
@jwt_required()
@admin_required()
def bulk_correct_readings():
    """
    Apply admin-approved corrections to a batch of inspection_answers.

    Body:
        {
          "edit_reason": "Red-tenths mechanical-meter typo (10x inflation)",
          "corrections": [
            {"answer_id": 123, "new_value": 9533.3},
            ...
          ]
        }

    Returns:
        {
          "applied": int,        // rows successfully updated
          "total": int,          // rows in request
          "errors": [{ "answer_id": int, "message": str }, ...]
        }

    Implementation notes:
        - Per-row failures don't abort the batch; bad rows are reported in errors.
        - Only inspection_answers for running-hours checklist items can be
          corrected through this endpoint (defence-in-depth — admins can edit
          other types via the existing single-row endpoint).
        - InspectionAnswer has no audit columns, so corrections are logged to
          app.log only. Single-row corrections via the existing equipment
          endpoint behave the same.
    """
    data = request.get_json(silent=True) or {}
    edit_reason = (data.get('edit_reason') or 'Red-tenths typo correction').strip()
    corrections = data.get('corrections') or []

    if not isinstance(corrections, list) or not corrections:
        return jsonify({'status': 'error', 'message': 'corrections list required'}), 400

    user = get_current_user()
    valid_item_ids = set(_running_hours_item_ids())

    applied = 0
    errors = []

    for c in corrections:
        answer_id = c.get('answer_id')
        new_value = c.get('new_value')

        if answer_id is None or new_value is None:
            errors.append({'answer_id': answer_id, 'message': 'answer_id and new_value required'})
            continue
        try:
            new_value_f = float(new_value)
        except (TypeError, ValueError):
            errors.append({'answer_id': answer_id, 'message': 'new_value must be numeric'})
            continue

        answer = db.session.get(InspectionAnswer, answer_id)
        if not answer:
            errors.append({'answer_id': answer_id, 'message': 'Answer not found'})
            continue
        if answer.checklist_item_id not in valid_item_ids:
            errors.append({
                'answer_id': answer_id,
                'message': 'Answer is not for a running-hours question',
            })
            continue

        old_value = answer.answer_value
        answer.answer_value = (
            f'{int(new_value_f)}'
            if new_value_f == int(new_value_f)
            else f'{new_value_f}'
        )
        applied += 1

        logger.info(
            f"Admin {user.id} bulk-corrected InspectionAnswer #{answer_id}: "
            f"{old_value!r} → {answer.answer_value!r} ({edit_reason!r})"
        )

    db.session.commit()

    return jsonify({
        'status': 'success',
        'data': {
            'applied': applied,
            'total': len(corrections),
            'errors': errors,
            'edit_reason': edit_reason,
        },
    })
