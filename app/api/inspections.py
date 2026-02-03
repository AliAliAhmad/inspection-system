"""
Inspection endpoints for the core workflow.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.inspection_service import InspectionService
from app.models import Inspection, InspectionAssignment, User
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from app.utils.decorators import get_current_user, admin_required, get_language
from app.extensions import db

bp = Blueprint('inspections', __name__)


@bp.route('/start', methods=['POST'])
@jwt_required()
def start_inspection():
    """
    Start a new inspection (creates draft).
    
    Request Body:
        {
            "equipment_id": 1
        }
    
    Returns:
        {
            "status": "success",
            "inspection": {...}
        }
    """
    data = request.get_json()
    current_user = get_current_user()
    
    if not data or 'equipment_id' not in data:
        raise ValidationError("equipment_id is required")
    
    inspection = InspectionService.start_inspection(
        equipment_id=data['equipment_id'],
        technician_id=current_user.id
    )

# inspection is already a dict from the service
    return jsonify({
        'status': 'success',
        'message': 'Inspection started',
        'inspection': inspection
    }), 201


@bp.route('/by-assignment/<int:assignment_id>', methods=['GET'])
@jwt_required()
def get_or_start_by_assignment(assignment_id):
    """
    Get or auto-create inspection for an assignment.
    If the inspector hasn't started yet, creates a draft inspection.
    If already started, returns the existing inspection.
    """
    current_user = get_current_user()
    language = get_language(current_user)

    assignment = db.session.get(InspectionAssignment, assignment_id)
    if not assignment:
        raise NotFoundError(f"Assignment {assignment_id} not found")

    # Check the current user is one of the assigned inspectors
    if current_user.id not in (assignment.mechanical_inspector_id, assignment.electrical_inspector_id):
        raise ForbiddenError("You are not assigned to this inspection")

    # Check for existing inspection for this assignment + user
    existing = Inspection.query.filter_by(
        assignment_id=assignment_id,
        technician_id=current_user.id,
    ).filter(Inspection.status == 'draft').first()

    if existing:
        inspection_dict = existing.to_dict(include_answers=True, language=language)
        # Add checklist items
        from app.models import ChecklistItem
        template_items = ChecklistItem.query.filter_by(
            template_id=existing.template_id
        ).order_by(ChecklistItem.order_index).all()
        inspection_dict['checklist_items'] = [item.to_dict(language=language) for item in template_items]
        return jsonify({'status': 'success', 'data': inspection_dict}), 200

    # Auto-create: start a new inspection using template from assignment
    inspection_dict = InspectionService.start_inspection(
        equipment_id=assignment.equipment_id,
        technician_id=current_user.id,
        template_id=assignment.template_id,
        assignment_id=assignment_id
    )

    # Update assignment status to in_progress
    if assignment.status == 'assigned':
        assignment.status = 'in_progress'
        db.session.commit()

    return jsonify({'status': 'success', 'data': inspection_dict}), 201


@bp.route('/<int:inspection_id>/answer', methods=['POST'])
@jwt_required()
def answer_question(inspection_id):
    """
    Submit or update an answer to a checklist item.
    
    Request Body:
        {
            "checklist_item_id": 1,
            "answer_value": "pass",
            "comment": "Optional comment",
            "photo_path": "Optional photo path"
        }
    
    Returns:
        {
            "status": "success",
            "answer": {...}
        }
    """
    data = request.get_json()
    current_user_id = get_jwt_identity()
    
    if not data or 'checklist_item_id' not in data or 'answer_value' not in data:
        raise ValidationError("checklist_item_id and answer_value are required")
    
    answer = InspectionService.answer_question(
        inspection_id=inspection_id,
        checklist_item_id=data['checklist_item_id'],
        answer_value=data['answer_value'],
        comment=data.get('comment'),
        photo_path=data.get('photo_path'),
        voice_note_id=data.get('voice_note_id'),
        current_user_id=current_user_id
    )

    # Auto-translate comment if provided
    if data.get('comment'):
        from app.utils.bilingual import auto_translate_and_save
        auto_translate_and_save('inspection_answer', answer.id, {
            'comment': data['comment']
        })

    return jsonify({
        'status': 'success',
        'message': 'Answer recorded',
        'answer': answer.to_dict()
    }), 200


@bp.route('/<int:inspection_id>/progress', methods=['GET'])
@jwt_required()
def get_progress(inspection_id):
    """
    Get inspection progress.
    
    Returns:
        {
            "status": "success",
            "progress": {
                "total_items": 5,
                "answered_items": 3,
                "required_items": 4,
                "answered_required": 2,
                "is_complete": false,
                "progress_percentage": 60
            }
        }
    """
    progress = InspectionService.get_inspection_progress(inspection_id)
    
    return jsonify({
        'status': 'success',
        'progress': progress
    }), 200


@bp.route('/<int:inspection_id>/submit', methods=['POST'])
@jwt_required()
def submit_inspection(inspection_id):
    """
    Submit inspection (draft → submitted).
    Triggers auto-defect creation.
    
    Returns:
        {
            "status": "success",
            "inspection": {...}
        }
    """
    current_user_id = get_jwt_identity()
    
    inspection = InspectionService.submit_inspection(
        inspection_id=inspection_id,
        current_user_id=current_user_id
    )
    
    return jsonify({
        'status': 'success',
        'message': 'Inspection submitted successfully',
        'inspection': inspection.to_dict(include_answers=True, language=get_language())
    }), 200


@bp.route('/<int:inspection_id>/review', methods=['POST'])
@jwt_required()
@admin_required()
def review_inspection(inspection_id):
    """
    Review inspection (submitted → reviewed). Admin only.
    
    Request Body:
        {
            "notes": "Optional review notes"
        }
    
    Returns:
        {
            "status": "success",
            "inspection": {...}
        }
    """
    data = request.get_json() or {}
    current_user_id = get_jwt_identity()
    
    inspection = InspectionService.review_inspection(
        inspection_id=inspection_id,
        reviewer_id=current_user_id,
        notes=data.get('notes')
    )
    
    return jsonify({
        'status': 'success',
        'message': 'Inspection reviewed',
        'inspection': inspection.to_dict(include_answers=True, language=get_language())
    }), 200


@bp.route('', methods=['GET'])
@jwt_required()
def list_inspections():
    """
    List inspections. Filtered by role.
    - Technicians see only their own
    - Admins see all
    
    Query Parameters:
        status: Filter by status (draft, submitted, reviewed)
        equipment_id: Filter by equipment
    
    Returns:
        {
            "status": "success",
            "inspections": [...]
        }
    """
    current_user = get_current_user()
    
    query = Inspection.query
    
    # Filter by role — inspectors/specialists see only their own
    if current_user.role in ('inspector', 'specialist', 'technician'):
        query = query.filter_by(technician_id=current_user.id)
    
    # Apply filters
    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)
    
    equipment_id = request.args.get('equipment_id')
    if equipment_id:
        query = query.filter_by(equipment_id=equipment_id)
    
    inspections = query.order_by(Inspection.created_at.desc()).all()
    lang = get_language(current_user)

    return jsonify({
        'status': 'success',
        'data': [inspection.to_dict(language=lang) for inspection in inspections]
    }), 200


@bp.route('/<int:inspection_id>', methods=['GET'])
@jwt_required()
def get_inspection(inspection_id):
    """
    Get inspection details with all answers.
    
    Returns:
        {
            "status": "success",
            "inspection": {...}
        }
    """
    from app.exceptions.api_exceptions import NotFoundError, ForbiddenError
    
    inspection = db.session.get(Inspection, inspection_id)
    if not inspection:
        raise NotFoundError(f"Inspection with ID {inspection_id} not found")
    
    current_user = get_current_user()
    
    # Technicians can only see their own
    if current_user.role in ('inspector', 'specialist', 'technician') and inspection.technician_id != current_user.id:
        raise ForbiddenError("Access denied")
    
    lang = get_language(current_user)

    return jsonify({
        'status': 'success',
        'inspection': inspection.to_dict(include_answers=True, language=lang)
    }), 200


IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff', 'tif'}
VIDEO_EXTENSIONS = {'mp4', 'mov', '3gp', 'avi', 'mkv', 'flv', 'wmv', 'm4v', 'ts'}


def _detect_media_type(file):
    """Detect if uploaded file is image or video based on MIME type and extension."""
    mime = (file.content_type or '').lower()
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in (file.filename or '') else ''

    if mime.startswith('video/') or ext in VIDEO_EXTENSIONS:
        return 'video'
    return 'image'


@bp.route('/<int:inspection_id>/upload-media', methods=['POST'])
@jwt_required()
def upload_answer_media(inspection_id):
    """
    Upload a photo or video for an inspection answer.
    Auto-detects image vs video from file type.
    Multipart form: file, checklist_item_id
    """
    from app.services.file_service import FileService
    from app.models import InspectionAnswer

    current_user_id = get_jwt_identity()

    inspection = db.session.get(Inspection, inspection_id)
    if not inspection:
        raise NotFoundError(f"Inspection with ID {inspection_id} not found")

    if inspection.status != 'draft':
        raise ValidationError("Cannot modify inspection that is not in draft status")

    user = db.session.get(User, int(current_user_id))
    if user.role != 'admin' and inspection.technician_id != int(current_user_id):
        raise ForbiddenError("You can only upload media to your own inspections")

    if 'file' not in request.files:
        raise ValidationError("No file in request")

    checklist_item_id = request.form.get('checklist_item_id')
    if not checklist_item_id:
        raise ValidationError("checklist_item_id is required")

    file = request.files['file']
    media_type = _detect_media_type(file)
    is_video = (media_type == 'video')

    file_record = FileService.upload_file(
        file=file,
        uploaded_by=int(current_user_id),
        related_type='inspection_answer_video' if is_video else 'inspection_answer',
        related_id=int(checklist_item_id),
        category='inspection_videos' if is_video else 'inspection_photos'
    )

    # Link to the answer (auto-create if doesn't exist)
    answer = InspectionAnswer.query.filter_by(
        inspection_id=inspection_id,
        checklist_item_id=int(checklist_item_id)
    ).first()

    if not answer:
        kwargs = {
            'inspection_id': inspection_id,
            'checklist_item_id': int(checklist_item_id),
            'answer_value': '',
        }
        if is_video:
            kwargs['video_path'] = file_record.stored_filename
            kwargs['video_file_id'] = file_record.id
        else:
            kwargs['photo_path'] = file_record.stored_filename
            kwargs['photo_file_id'] = file_record.id
        answer = InspectionAnswer(**kwargs)
        db.session.add(answer)
    else:
        if is_video:
            answer.video_path = file_record.stored_filename
            answer.video_file_id = file_record.id
        else:
            answer.photo_path = file_record.stored_filename
            answer.photo_file_id = file_record.id

    db.session.commit()

    # Trigger GPT analysis
    _analyze_media_async(file_record.file_path, media_type, inspection_id, int(checklist_item_id))

    return jsonify({
        'status': 'success',
        'message': f'{"Video" if is_video else "Photo"} uploaded',
        'data': file_record.to_dict(),
        'media_type': media_type,
    }), 201



@bp.route('/<int:inspection_id>/delete-voice', methods=['POST'])
@jwt_required()
def delete_answer_voice(inspection_id):
    """
    Delete a voice note from an inspection answer.
    Removes voice file, clears transcript/translation from comment.
    """
    from app.models import InspectionAnswer
    from app.services.file_service import FileService

    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    checklist_item_id = data.get('checklist_item_id')

    if not checklist_item_id:
        raise ValidationError("checklist_item_id is required")

    inspection = db.session.get(Inspection, inspection_id)
    if not inspection:
        raise NotFoundError(f"Inspection with ID {inspection_id} not found")

    if inspection.status != 'draft':
        raise ValidationError("Cannot modify inspection that is not in draft status")

    user = db.session.get(User, int(current_user_id))
    if user.role != 'admin' and inspection.technician_id != int(current_user_id):
        raise ForbiddenError("You can only modify your own inspections")

    answer = InspectionAnswer.query.filter_by(
        inspection_id=inspection_id,
        checklist_item_id=int(checklist_item_id)
    ).first()

    if not answer:
        raise NotFoundError("Answer not found")

    # Save file ID, then clear FK FIRST to avoid constraint violation
    file_id_to_delete = answer.voice_note_id
    answer.voice_note_id = None
    answer.comment = None
    db.session.commit()

    # Now safely delete the file record
    if file_id_to_delete:
        try:
            FileService.delete_file(file_id_to_delete, int(current_user_id))
        except Exception:
            pass

    # Clean up bilingual translations
    try:
        from app.utils.bilingual import remove_translations
        remove_translations('inspection_answer', answer.id)
    except Exception:
        pass

    return jsonify({
        'status': 'success',
        'message': 'Voice note deleted'
    }), 200


@bp.route('/<int:inspection_id>/delete-photo', methods=['POST'])
@jwt_required()
def delete_answer_photo(inspection_id):
    """Delete a photo from an inspection answer."""
    from app.models import InspectionAnswer
    from app.services.file_service import FileService

    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    checklist_item_id = data.get('checklist_item_id')

    if not checklist_item_id:
        raise ValidationError("checklist_item_id is required")

    inspection = db.session.get(Inspection, inspection_id)
    if not inspection:
        raise NotFoundError(f"Inspection with ID {inspection_id} not found")

    if inspection.status != 'draft':
        raise ValidationError("Cannot modify inspection that is not in draft status")

    user = db.session.get(User, int(current_user_id))
    if user.role != 'admin' and inspection.technician_id != int(current_user_id):
        raise ForbiddenError("You can only modify your own inspections")

    answer = InspectionAnswer.query.filter_by(
        inspection_id=inspection_id,
        checklist_item_id=int(checklist_item_id)
    ).first()

    if not answer:
        raise NotFoundError("Answer not found")

    # Save file ID, then clear FK FIRST to avoid constraint violation
    file_id_to_delete = answer.photo_file_id

    # Remove photo analysis from comment
    if answer.comment:
        lines = answer.comment.split('\n')
        cleaned = [l for l in lines if not l.startswith('[Photo]:')]
        answer.comment = '\n'.join(cleaned).strip() or None

    answer.photo_path = None
    answer.photo_file_id = None
    db.session.commit()

    # Now safely delete the file record
    if file_id_to_delete:
        try:
            FileService.delete_file(file_id_to_delete, int(current_user_id))
        except Exception:
            pass

    return jsonify({'status': 'success', 'message': 'Photo deleted'}), 200


@bp.route('/<int:inspection_id>/delete-video', methods=['POST'])
@jwt_required()
def delete_answer_video(inspection_id):
    """Delete a video from an inspection answer."""
    from app.models import InspectionAnswer
    from app.services.file_service import FileService

    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    checklist_item_id = data.get('checklist_item_id')

    if not checklist_item_id:
        raise ValidationError("checklist_item_id is required")

    inspection = db.session.get(Inspection, inspection_id)
    if not inspection:
        raise NotFoundError(f"Inspection with ID {inspection_id} not found")

    if inspection.status != 'draft':
        raise ValidationError("Cannot modify inspection that is not in draft status")

    user = db.session.get(User, int(current_user_id))
    if user.role != 'admin' and inspection.technician_id != int(current_user_id):
        raise ForbiddenError("You can only modify your own inspections")

    answer = InspectionAnswer.query.filter_by(
        inspection_id=inspection_id,
        checklist_item_id=int(checklist_item_id)
    ).first()

    if not answer:
        raise NotFoundError("Answer not found")

    # Save file ID, then clear FK FIRST to avoid constraint violation
    file_id_to_delete = answer.video_file_id

    # Remove video analysis from comment
    if answer.comment:
        lines = answer.comment.split('\n')
        cleaned = [l for l in lines if not l.startswith('[Video]:')]
        answer.comment = '\n'.join(cleaned).strip() or None

    answer.video_path = None
    answer.video_file_id = None
    db.session.commit()

    # Now safely delete the file record
    if file_id_to_delete:
        try:
            FileService.delete_file(file_id_to_delete, int(current_user_id))
        except Exception:
            pass

    return jsonify({'status': 'success', 'message': 'Video deleted'}), 200


def _analyze_media_async(file_path, media_type, inspection_id, checklist_item_id):
    """
    Analyze a photo or video using GPT-4o-mini vision in a background thread.
    Appends result to the answer's comment field.
    """
    import threading
    from flask import current_app

    app = current_app._get_current_object()

    def _run_analysis():
        import os
        import base64
        import logging

        logger = logging.getLogger(__name__)
        logger.info("Starting media analysis: file=%s type=%s inspection=%s item=%s",
                    file_path, media_type, inspection_id, checklist_item_id)

        with app.app_context():
            try:
                for attempt in range(2):  # Retry once on failure
                    try:
                        api_key = os.getenv('OPENAI_API_KEY')
                        if not api_key:
                            logger.warning("Analysis skipped: OPENAI_API_KEY not set")
                            return

                        if not os.path.exists(file_path):
                            logger.warning("Analysis skipped: file not found: %s", file_path)
                            return

                        from openai import OpenAI
                        client = OpenAI(api_key=api_key)

                        # Read and encode the image
                        with open(file_path, 'rb') as f:
                            data = f.read()

                        # Skip very large files
                        if len(data) > 10 * 1024 * 1024:
                            logger.info("Analysis skipped: file too large (%s bytes)", len(data))
                            return

                        b64 = base64.b64encode(data).decode('utf-8')

                        # Determine mime type
                        ext = file_path.rsplit('.', 1)[-1].lower() if '.' in file_path else 'jpg'
                        mime_map = {
                            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
                            'gif': 'image/gif', 'webp': 'image/webp', 'mp4': 'video/mp4',
                        }
                        mime = mime_map.get(ext, 'image/jpeg')

                        prompt = (
                            "Describe what you see in this inspection image in 1-2 short sentences. "
                            "Focus on identifying any defects, damage, or issues visible. "
                            "Be concise and specific."
                        )

                        response = client.chat.completions.create(
                            model='gpt-4o-mini',
                            messages=[{
                                'role': 'user',
                                'content': [
                                    {'type': 'text', 'text': prompt},
                                    {'type': 'image_url', 'image_url': {
                                        'url': f'data:{mime};base64,{b64}',
                                        'detail': 'low',
                                    }}
                                ]
                            }],
                            max_tokens=150,
                            timeout=30,
                        )

                        analysis = response.choices[0].message.content.strip() if response.choices else None
                        if not analysis:
                            return

                        # Re-fetch answer inside this thread's session to avoid stale data
                        from app.models import InspectionAnswer
                        answer = InspectionAnswer.query.filter_by(
                            inspection_id=inspection_id,
                            checklist_item_id=checklist_item_id
                        ).first()

                        if not answer:
                            return

                        prefix = '[Photo]:' if media_type == 'image' else '[Video]:'
                        analysis_line = f'{prefix} {analysis}'

                        # Append — don't overwrite existing comment
                        if answer.comment:
                            answer.comment = f'{answer.comment}\n\n{analysis_line}'
                        else:
                            answer.comment = analysis_line

                        db.session.commit()

                        # Auto-translate
                        try:
                            from app.utils.bilingual import auto_translate_and_save
                            auto_translate_and_save('inspection_answer', answer.id, {
                                'comment': answer.comment
                            })
                        except Exception:
                            pass

                        logger.info("Media analysis complete: inspection=%s item=%s", inspection_id, checklist_item_id)
                        return  # Success — no need to retry

                    except Exception as e:
                        logger.error("Media analysis attempt %s failed: %s", attempt + 1, e)
                        db.session.rollback()
                        if attempt == 0:
                            import time
                            time.sleep(2)  # Wait before retry
            finally:
                db.session.remove()

    thread = threading.Thread(target=_run_analysis, daemon=True)
    thread.start()


@bp.route('/<int:inspection_id>', methods=['DELETE'])
@jwt_required()
def delete_inspection(inspection_id):
    """
    Delete draft inspection.
    
    Returns:
        {
            "status": "success",
            "message": "Inspection deleted"
        }
    """
    current_user_id = get_jwt_identity()
    
    InspectionService.delete_inspection(
        inspection_id=inspection_id,
        current_user_id=current_user_id
    )
    
    return jsonify({
        'status': 'success',
        'message': 'Inspection deleted'
    }), 200