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

    # Sort: high-confidence first, then newest within each confidence bucket.
    # Two-step using stable sort: sort by date desc, then by confidence asc.
    # ISO 8601 strings sort lexicographically the same way as chronologically.
    confidence_order = {'high': 0, 'medium': 1, 'low': 2}
    flagged.sort(key=lambda r: r['answered_at'] or '', reverse=True)
    flagged.sort(key=lambda r: confidence_order[r['confidence']])

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


def _parse_ai_reading(raw_value):
    """Coerce an AI-extracted reading (string or number) into float, or None."""
    if raw_value is None:
        return None
    try:
        return float(str(raw_value).replace(',', '').strip())
    except (TypeError, ValueError):
        return None


def _classify_agreement(typed_value, suggested_value, ai_value, tolerance_pct=5):
    """
    Decide whether AI's reading agrees with the typed value, the suggested fix,
    both, or neither.

    Returns one of:
        'matches_suggested' - AI strongly supports the ÷10 fix
        'matches_typed'      - AI strongly supports the typed value as-is
        'matches_both'       - typed and suggested are within tolerance of AI
                               (usually a degenerate case — values are close)
        'disagrees'          - AI's number is different from both
        'no_reading'         - AI couldn't extract anything numeric
    """
    if ai_value is None:
        return 'no_reading'

    def _within(a, b):
        if a == 0 or b == 0:
            return abs(a - b) < 0.5  # avoid div-by-zero edge
        return abs(a - b) / max(abs(a), abs(b)) <= tolerance_pct / 100.0

    matches_typed = _within(ai_value, typed_value)
    matches_suggested = (
        suggested_value is not None and _within(ai_value, suggested_value)
    )

    if matches_typed and matches_suggested:
        return 'matches_both'
    if matches_suggested:
        return 'matches_suggested'
    if matches_typed:
        return 'matches_typed'
    return 'disagrees'


@bp.route('/reanalyze-photo/<int:answer_id>', methods=['POST'])
@jwt_required()
@admin_required()
def reanalyze_photo(answer_id):
    """
    Re-run AI vision analysis on the photo attached to a historical
    inspection answer, and compare the AI's reading to the inspector's
    typed value plus the dashboard's ÷10 suggestion.

    Used by the admin Reading Cleanup page's "AI Verify" button to provide
    photo-based ground truth before approving a correction.

    Returns:
      200 OK
      {
        "answer_id": int,
        "typed_value": float,
        "suggested_value": float,        // typed_value / 10
        "ai_reading": float | null,
        "ai_description": str,
        "agreement": "matches_suggested" | "matches_typed" | "matches_both"
                   | "disagrees" | "no_reading" | "no_photo",
        "provider": str,                 // which AI service answered
      }

      404 — answer not found
      400 — answer has no photo to analyze
    """
    from app.services.ollama_service import (
        get_vision_service as get_ollama_vision,
        is_ollama_configured,
    )
    from app.services.gemini_service import (
        get_vision_service as get_gemini_vision,
        is_gemini_configured,
    )
    import requests as http

    answer = db.session.get(InspectionAnswer, answer_id)
    if not answer:
        return jsonify({'status': 'error', 'message': 'Answer not found'}), 404
    if not answer.photo_file_id:
        return jsonify({'status': 'error', 'message': 'No photo attached to this answer'}), 400

    photo = db.session.get(File, answer.photo_file_id)
    if not photo or not photo.file_path:
        return jsonify({'status': 'error', 'message': 'Photo file not found'}), 404

    typed_value = _parse_float(answer.answer_value)
    suggested_value = round(typed_value / 10.0, 1) if typed_value is not None else None

    # Download the photo bytes — same pattern as the inspection write path
    image_content = None
    try:
        resp = http.get(photo.file_path, timeout=30)
        resp.raise_for_status()
        image_content = resp.content
    except Exception as e:
        logger.warning(f"Failed to download photo {photo.file_path}: {e}")
        return jsonify({
            'status': 'error',
            'message': f'Could not download photo: {e}',
        }), 500

    # Try Ollama first when configured (cloud or local), then Gemini as fallback.
    # Other providers in the chain are out of scope here — admin can re-click
    # if the first two fail.
    ai_result = None
    provider_used = None

    if is_ollama_configured() and image_content:
        try:
            ai_result = get_ollama_vision().analyze_image(
                image_content=image_content, is_reading_question=True
            )
            if ai_result and ai_result.get('reading') is not None:
                provider_used = 'ollama'
        except Exception as e:
            logger.warning(f"Ollama re-analysis failed: {e}")
            ai_result = None

    if (not ai_result or ai_result.get('reading') is None) and is_gemini_configured() and image_content:
        try:
            ai_result = get_gemini_vision().analyze_image(
                image_content=image_content, is_reading_question=True
            )
            if ai_result and ai_result.get('reading') is not None:
                provider_used = 'gemini'
        except Exception as e:
            logger.warning(f"Gemini re-analysis failed: {e}")

    ai_value = _parse_ai_reading(ai_result.get('reading') if ai_result else None)
    ai_description = (ai_result or {}).get('en') or ''

    agreement = _classify_agreement(typed_value or 0, suggested_value, ai_value)

    return jsonify({
        'status': 'success',
        'data': {
            'answer_id': answer_id,
            'typed_value': typed_value,
            'suggested_value': suggested_value,
            'ai_reading': ai_value,
            'ai_description': ai_description,
            'agreement': agreement,
            'provider': provider_used or 'none',
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
