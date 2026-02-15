"""
Previous Inspection API endpoints.
Provides access to previous inspection data for comparison and copying.
"""

import logging
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, date
from sqlalchemy import desc

from app.extensions import db
from app.models import Inspection, InspectionAnswer, Equipment, User, File
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from app.utils.decorators import get_current_user, get_language

logger = logging.getLogger(__name__)

bp = Blueprint('previous_inspection', __name__)


@bp.route('/previous/<int:equipment_id>', methods=['GET'])
@jwt_required()
def get_previous_inspection(equipment_id):
    """
    Get the most recent completed (submitted or reviewed) inspection for an equipment.
    Excludes the current user's draft inspection.
    """
    current_user = get_current_user()
    language = get_language(current_user)

    # Find the most recent submitted or reviewed inspection for this equipment
    previous = Inspection.query.filter(
        Inspection.equipment_id == equipment_id,
        Inspection.status.in_(['submitted', 'reviewed'])
    ).order_by(desc(Inspection.submitted_at)).first()

    if not previous:
        return jsonify({
            'status': 'success',
            'data': None,
            'message': 'No previous inspection found'
        }), 200

    # Build response with answers
    answers = []
    for ans in previous.answers:
        photo_url = None
        if ans.photo_file:
            photo_url = ans.photo_file.url

        video_url = None
        if ans.video_file:
            video_url = ans.video_file.url

        voice_url = None
        if ans.voice_note:
            voice_url = ans.voice_note.url

        answers.append({
            'id': ans.id,
            'checklist_item_id': ans.checklist_item_id,
            'answer_value': ans.answer_value,
            'comment': ans.comment,
            'photo_url': photo_url,
            'photo_ai_analysis': ans.photo_ai_analysis,
            'video_url': video_url,
            'video_ai_analysis': ans.video_ai_analysis,
            'voice_note_url': voice_url,
            'voice_transcription': getattr(ans, 'voice_transcription', None),
            'answered_at': ans.answered_at.isoformat() if ans.answered_at else None,
        })

    equipment = db.session.get(Equipment, equipment_id)
    technician = db.session.get(User, previous.technician_id)

    result = {
        'id': previous.id,
        'inspection_code': previous.inspection_code,
        'equipment_id': previous.equipment_id,
        'equipment_name': equipment.name if equipment else f'Equipment #{equipment_id}',
        'technician_id': previous.technician_id,
        'technician_name': technician.full_name if technician else 'Unknown',
        'status': previous.status,
        'result': previous.result,
        'started_at': previous.started_at.isoformat() if previous.started_at else None,
        'submitted_at': previous.submitted_at.isoformat() if previous.submitted_at else None,
        'reviewed_at': previous.reviewed_at.isoformat() if previous.reviewed_at else None,
        'answers': answers,
    }

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/previous/<int:equipment_id>/summary', methods=['GET'])
@jwt_required()
def get_previous_inspection_summary(equipment_id):
    """
    Get summary of the previous inspection for an equipment.
    Includes counts and quick stats.
    """
    current_user = get_current_user()

    # Find the most recent submitted or reviewed inspection
    previous = Inspection.query.filter(
        Inspection.equipment_id == equipment_id,
        Inspection.status.in_(['submitted', 'reviewed'])
    ).order_by(desc(Inspection.submitted_at)).first()

    if not previous:
        return jsonify({
            'status': 'success',
            'data': None,
            'message': 'No previous inspection found'
        }), 200

    # Calculate stats
    answers = previous.answers or []
    passed_count = sum(1 for a in answers if a.answer_value.lower() in ('pass', 'yes'))
    failed_count = sum(1 for a in answers if a.answer_value.lower() in ('fail', 'no'))
    has_photos = any(a.photo_file_id for a in answers)
    has_videos = any(a.video_file_id for a in answers)
    has_comments = any(a.comment for a in answers)

    # Days ago
    days_ago = 0
    if previous.submitted_at:
        days_ago = (datetime.utcnow() - previous.submitted_at).days

    equipment = db.session.get(Equipment, equipment_id)
    technician = db.session.get(User, previous.technician_id)

    # Build answers list with simplified data
    answers_data = []
    for ans in answers:
        photo_url = ans.photo_file.url if ans.photo_file else None
        video_url = ans.video_file.url if ans.video_file else None
        voice_url = ans.voice_note.url if ans.voice_note else None

        answers_data.append({
            'id': ans.id,
            'checklist_item_id': ans.checklist_item_id,
            'answer_value': ans.answer_value,
            'comment': ans.comment,
            'photo_url': photo_url,
            'photo_ai_analysis': ans.photo_ai_analysis,
            'video_url': video_url,
            'video_ai_analysis': ans.video_ai_analysis,
            'voice_note_url': voice_url,
            'voice_transcription': getattr(ans, 'voice_transcription', None),
            'answered_at': ans.answered_at.isoformat() if ans.answered_at else None,
        })

    result = {
        'inspection': {
            'id': previous.id,
            'inspection_code': previous.inspection_code,
            'equipment_id': previous.equipment_id,
            'equipment_name': equipment.name if equipment else f'Equipment #{equipment_id}',
            'technician_id': previous.technician_id,
            'technician_name': technician.full_name if technician else 'Unknown',
            'status': previous.status,
            'result': previous.result,
            'started_at': previous.started_at.isoformat() if previous.started_at else None,
            'submitted_at': previous.submitted_at.isoformat() if previous.submitted_at else None,
            'reviewed_at': previous.reviewed_at.isoformat() if previous.reviewed_at else None,
            'answers': answers_data,
        },
        'total_answers': len(answers),
        'passed_count': passed_count,
        'failed_count': failed_count,
        'has_photos': has_photos,
        'has_videos': has_videos,
        'has_comments': has_comments,
        'days_ago': days_ago,
    }

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/previous/<int:equipment_id>/photo/<int:checklist_item_id>', methods=['GET'])
@jwt_required()
def get_previous_photo(equipment_id, checklist_item_id):
    """
    Get the most recent photo for a specific checklist item on an equipment.
    Searches through past inspections to find the latest photo.
    """
    # Find the most recent answer with a photo for this equipment + checklist item
    answer = InspectionAnswer.query.join(Inspection).filter(
        Inspection.equipment_id == equipment_id,
        Inspection.status.in_(['submitted', 'reviewed']),
        InspectionAnswer.checklist_item_id == checklist_item_id,
        InspectionAnswer.photo_file_id.isnot(None)
    ).order_by(desc(Inspection.submitted_at)).first()

    if not answer or not answer.photo_file:
        return jsonify({
            'status': 'success',
            'data': None,
            'message': 'No previous photo found'
        }), 200

    inspection = db.session.get(Inspection, answer.inspection_id)

    result = {
        'id': answer.id,
        'url': answer.photo_file.url,
        'checklist_item_id': answer.checklist_item_id,
        'inspection_id': answer.inspection_id,
        'inspection_date': inspection.submitted_at.isoformat() if inspection and inspection.submitted_at else None,
        'ai_analysis': answer.photo_ai_analysis,
    }

    return jsonify({
        'status': 'success',
        'data': result
    }), 200


@bp.route('/previous/<int:equipment_id>/photos', methods=['GET'])
@jwt_required()
def get_previous_photos(equipment_id):
    """
    Get all photos from the most recent inspection for an equipment.
    """
    # Find the most recent inspection with photos
    previous = Inspection.query.filter(
        Inspection.equipment_id == equipment_id,
        Inspection.status.in_(['submitted', 'reviewed'])
    ).order_by(desc(Inspection.submitted_at)).first()

    if not previous:
        return jsonify({
            'status': 'success',
            'data': [],
            'message': 'No previous inspection found'
        }), 200

    photos = []
    for ans in previous.answers:
        if ans.photo_file:
            photos.append({
                'id': ans.id,
                'url': ans.photo_file.url,
                'checklist_item_id': ans.checklist_item_id,
                'inspection_id': ans.inspection_id,
                'inspection_date': previous.submitted_at.isoformat() if previous.submitted_at else None,
                'ai_analysis': ans.photo_ai_analysis,
            })

    return jsonify({
        'status': 'success',
        'data': photos
    }), 200


@bp.route('/<int:inspection_id>/copy-from-previous', methods=['POST'])
@jwt_required()
def copy_from_previous(inspection_id):
    """
    Copy answers from a previous inspection to the current draft inspection.

    Request Body:
        {
            "previous_inspection_id": 123,
            "copy_option": "all" | "passed_only" | "comments_only" | "photos_only",
            "checklist_item_ids": [1, 2, 3]  // Optional: specific items to copy
        }
    """
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}

    previous_inspection_id = data.get('previous_inspection_id')
    copy_option = data.get('copy_option', 'all')
    checklist_item_ids = data.get('checklist_item_ids')

    if not previous_inspection_id:
        raise ValidationError("previous_inspection_id is required")

    if copy_option not in ('all', 'passed_only', 'comments_only', 'photos_only'):
        raise ValidationError("copy_option must be: all, passed_only, comments_only, or photos_only")

    # Get current inspection
    current = db.session.get(Inspection, inspection_id)
    if not current:
        raise NotFoundError(f"Inspection {inspection_id} not found")

    if current.status != 'draft':
        raise ValidationError("Can only copy to draft inspections")

    user = db.session.get(User, int(current_user_id))
    if user.role != 'admin' and current.technician_id != int(current_user_id):
        raise ForbiddenError("You can only modify your own inspections")

    # Get previous inspection
    previous = db.session.get(Inspection, previous_inspection_id)
    if not previous:
        raise NotFoundError(f"Previous inspection {previous_inspection_id} not found")

    if previous.status not in ('submitted', 'reviewed'):
        raise ValidationError("Can only copy from submitted or reviewed inspections")

    # Build map of previous answers
    prev_answers = {ans.checklist_item_id: ans for ans in previous.answers}

    # Build map of current answers
    curr_answers = {ans.checklist_item_id: ans for ans in current.answers}

    copied_items = []
    skipped_items = []

    for item_id, prev_ans in prev_answers.items():
        # Skip if not in filter list
        if checklist_item_ids and item_id not in checklist_item_ids:
            continue

        # Skip based on copy option
        if copy_option == 'passed_only':
            if prev_ans.answer_value.lower() not in ('pass', 'yes'):
                skipped_items.append(item_id)
                continue

        if copy_option == 'comments_only':
            if not prev_ans.comment:
                skipped_items.append(item_id)
                continue

        if copy_option == 'photos_only':
            if not prev_ans.photo_file_id:
                skipped_items.append(item_id)
                continue

        # Get or create current answer
        curr_ans = curr_answers.get(item_id)
        if not curr_ans:
            curr_ans = InspectionAnswer(
                inspection_id=inspection_id,
                checklist_item_id=item_id,
                answer_value='',
            )
            db.session.add(curr_ans)

        # Copy based on option
        if copy_option == 'all':
            curr_ans.answer_value = prev_ans.answer_value
            curr_ans.comment = prev_ans.comment
            # Note: Photos are NOT copied as they are references to files
            # User should take new photos
        elif copy_option == 'passed_only':
            curr_ans.answer_value = prev_ans.answer_value
            curr_ans.comment = prev_ans.comment
        elif copy_option == 'comments_only':
            curr_ans.comment = prev_ans.comment
        elif copy_option == 'photos_only':
            # For photos_only, we don't actually copy the photo
            # We just let the user know this item had a photo before
            # They should use the PhotoCompare feature
            pass

        copied_items.append(item_id)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'data': {
            'copied_count': len(copied_items),
            'skipped_count': len(skipped_items),
            'copied_items': copied_items,
            'skipped_items': skipped_items,
        }
    }), 200


@bp.route('/<int:current_id>/compare/<int:previous_id>', methods=['GET'])
@jwt_required()
def get_answer_comparisons(current_id, previous_id):
    """
    Get side-by-side comparison of answers between two inspections.
    Shows what changed between inspections.
    """
    current_user = get_current_user()
    language = get_language(current_user)

    current = db.session.get(Inspection, current_id)
    if not current:
        raise NotFoundError(f"Inspection {current_id} not found")

    previous = db.session.get(Inspection, previous_id)
    if not previous:
        raise NotFoundError(f"Previous inspection {previous_id} not found")

    # Build maps
    curr_answers = {ans.checklist_item_id: ans for ans in (current.answers or [])}
    prev_answers = {ans.checklist_item_id: ans for ans in (previous.answers or [])}

    # Get all checklist items from current inspection's template
    from app.models import ChecklistItem
    checklist_items = ChecklistItem.query.filter_by(
        template_id=current.template_id
    ).order_by(ChecklistItem.order_index).all()

    comparisons = []
    changed_count = 0
    same_count = 0

    for item in checklist_items:
        curr_ans = curr_answers.get(item.id)
        prev_ans = prev_answers.get(item.id)

        curr_value = curr_ans.answer_value if curr_ans else None
        prev_value = prev_ans.answer_value if prev_ans else None

        is_changed = curr_value != prev_value if (curr_value or prev_value) else False

        if is_changed:
            changed_count += 1
        elif curr_value or prev_value:
            same_count += 1

        curr_photo_url = None
        if curr_ans and curr_ans.photo_file:
            curr_photo_url = curr_ans.photo_file.url

        prev_photo_url = None
        if prev_ans and prev_ans.photo_file:
            prev_photo_url = prev_ans.photo_file.url

        question_text = item.question_text
        question_text_ar = item.question_text_ar

        if language == 'ar' and question_text_ar:
            question_text = question_text_ar

        comparisons.append({
            'checklist_item_id': item.id,
            'question_text': question_text,
            'question_text_ar': question_text_ar,
            'current_value': curr_value,
            'previous_value': prev_value,
            'is_changed': is_changed,
            'current_photo_url': curr_photo_url,
            'previous_photo_url': prev_photo_url,
        })

    return jsonify({
        'status': 'success',
        'data': {
            'comparisons': comparisons,
            'changed_count': changed_count,
            'same_count': same_count,
        }
    }), 200
