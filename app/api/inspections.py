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
        equipment_id=assignment.equipment_id,
        technician_id=current_user.id,
    ).filter(Inspection.status.in_(['draft', 'submitted'])).first()

    if existing:
        inspection_dict = existing.to_dict(include_answers=True, language=language)
        # Add checklist items
        from app.models import ChecklistItem
        template_items = ChecklistItem.query.filter_by(
            template_id=existing.template_id
        ).order_by(ChecklistItem.order_index).all()
        inspection_dict['checklist_items'] = [item.to_dict(language=language) for item in template_items]
        return jsonify({'status': 'success', 'data': inspection_dict}), 200

    # Auto-create: start a new inspection
    inspection_dict = InspectionService.start_inspection(
        equipment_id=assignment.equipment_id,
        technician_id=current_user.id
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