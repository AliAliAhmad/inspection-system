"""
Checklist template management endpoints (Admin only).
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import ChecklistTemplate, ChecklistItem, User
from app.extensions import db, safe_commit
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from app.utils.decorators import admin_required, get_language

bp = Blueprint('checklists', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
@admin_required()
def list_templates():
    """List all checklist templates. Admin only."""
    templates = ChecklistTemplate.query.all()
    lang = get_language()
    return jsonify({
        'status': 'success',
        'templates': [t.to_dict(include_items=True, language=lang) for t in templates]
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
@admin_required()
def create_template():
    """
    Create new checklist template. Admin only.
    
    Request Body:
        {
            "name": "Pump Inspection Checklist",
            "equipment_type": "Centrifugal Pump",
            "version": "3.0"
        }
    
    Returns:
        {
            "status": "success",
            "template": {...}
        }
    """
    data = request.get_json()
    current_user_id = get_jwt_identity()
    
    required_fields = ['name', 'equipment_type', 'version']
    for field in required_fields:
        if field not in data:
            raise ValidationError(f"{field} is required")
    
    # Check if template with same equipment_type and version exists
    existing = ChecklistTemplate.query.filter_by(
        equipment_type=data['equipment_type'],
        version=data['version']
    ).first()
    
    if existing:
        raise ValidationError(f"Template for {data['equipment_type']} version {data['version']} already exists")
    
    # Auto-translate name to Arabic if not provided
    name_ar = data.get('name_ar')
    if not name_ar:
        from app.services.translation_service import TranslationService
        name_ar = TranslationService.translate_to_arabic(data['name'])

    template = ChecklistTemplate(
        name=data['name'],
        name_ar=name_ar,
        equipment_type=data['equipment_type'],
        version=data['version'],
        is_active=data.get('is_active', True),
        created_by_id=int(current_user_id)
    )

    db.session.add(template)
    safe_commit()

    return jsonify({
        'status': 'success',
        'message': 'Template created',
        'template': template.to_dict()
    }), 201


@bp.route('/<int:template_id>/items', methods=['POST'])
@jwt_required()
@admin_required()
def add_item_to_template(template_id):
    """
    Add item to checklist template. Admin only.
    
    Request Body:
        {
            "question_text": "Visual inspection - no leaks",
            "question_text_ar": "الفحص البصري - لا توجد تسريبات",
            "answer_type": "pass_fail",
            "is_required": true,
            "order_index": 1,
            "critical_failure": false
        }
    
    Returns:
        {
            "status": "success",
            "item": {...}
        }
    """
    template = ChecklistTemplate.query.get(template_id)
    if not template:
        raise NotFoundError(f"Template with ID {template_id} not found")
    
    data = request.get_json()
    
    required_fields = ['question_text', 'answer_type', 'order_index']
    for field in required_fields:
        if field not in data:
            raise ValidationError(f"{field} is required")
    
    # Validate answer_type
    valid_types = ['pass_fail', 'yes_no', 'numeric', 'text']
    if data['answer_type'] not in valid_types:
        raise ValidationError(f"answer_type must be one of: {', '.join(valid_types)}")
    
    # Check if order_index already exists
    existing = ChecklistItem.query.filter_by(
        template_id=template_id,
        order_index=data['order_index']
    ).first()
    
    if existing:
        raise ValidationError(f"Item with order_index {data['order_index']} already exists in this template")
    
    # Auto-translate question to Arabic if not provided
    question_text_ar = data.get('question_text_ar')
    if not question_text_ar:
        from app.services.translation_service import TranslationService
        question_text_ar = TranslationService.translate_to_arabic(data['question_text'])

    item = ChecklistItem(
        template_id=template_id,
        question_text=data['question_text'],
        question_text_ar=question_text_ar,
        answer_type=data['answer_type'],
        is_required=data.get('is_required', True),
        order_index=data['order_index'],
        critical_failure=data.get('critical_failure', False)
    )
    
    db.session.add(item)
    safe_commit()
    
    return jsonify({
        'status': 'success',
        'message': 'Item added to template',
        'item': item.to_dict(language=get_language())
    }), 201


@bp.route('/<int:template_id>/items/<int:item_id>', methods=['PUT'])
@jwt_required()
@admin_required()
def update_item(template_id, item_id):
    """
    Update checklist item. Admin only.
    
    Request Body:
        {
            "question_text": "Updated question",
            "question_text_ar": "السؤال المحدث",
            "is_required": false
        }
    
    Returns:
        {
            "status": "success",
            "item": {...}
        }
    """
    item = ChecklistItem.query.filter_by(id=item_id, template_id=template_id).first()
    if not item:
        raise NotFoundError(f"Item with ID {item_id} not found in template {template_id}")
    
    data = request.get_json()
    
    # Update fields if provided
    if 'question_text' in data:
        item.question_text = data['question_text']
        # Re-translate if English changed and no Arabic override provided
        if 'question_text_ar' not in data:
            from app.services.translation_service import TranslationService
            item.question_text_ar = TranslationService.translate_to_arabic(data['question_text'])
    if 'question_text_ar' in data:
        item.question_text_ar = data['question_text_ar']
    if 'answer_type' in data:
        item.answer_type = data['answer_type']
    if 'is_required' in data:
        item.is_required = data['is_required']
    if 'order_index' in data:
        item.order_index = data['order_index']
    if 'critical_failure' in data:
        item.critical_failure = data['critical_failure']
    
    safe_commit()
    
    return jsonify({
        'status': 'success',
        'message': 'Item updated',
        'item': item.to_dict(language=get_language())
    }), 200


@bp.route('/<int:template_id>/items/<int:item_id>', methods=['DELETE'])
@jwt_required()
@admin_required()
def delete_item(template_id, item_id):
    """
    Delete checklist item. Admin only.
    
    Returns:
        {
            "status": "success",
            "message": "Item deleted"
        }
    """
    item = ChecklistItem.query.filter_by(id=item_id, template_id=template_id).first()
    if not item:
        raise NotFoundError(f"Item with ID {item_id} not found in template {template_id}")
    
    db.session.delete(item)
    safe_commit()
    
    return jsonify({
        'status': 'success',
        'message': 'Item deleted'
    }), 200