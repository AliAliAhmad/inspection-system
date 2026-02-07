"""
Checklist template management endpoints (Admin only).
"""

import io
from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import ChecklistTemplate, ChecklistItem, User
from app.extensions import db, safe_commit
from app.exceptions.api_exceptions import ValidationError, NotFoundError
from app.utils.decorators import admin_required, get_language

bp = Blueprint('checklists', __name__)


def generate_item_code(function_name, assembly_name, sequence_number):
    """
    Generate item code: [Function 2 letters]-[Assembly 2 letters]-00X
    Example: LI-MA-001 (Lifting, Main Crane, item 1)
    """
    func_prefix = (function_name or 'XX')[:2].upper()
    assembly_prefix = (assembly_name or 'XX')[:2].upper()
    return f"{func_prefix}-{assembly_prefix}-{sequence_number:03d}"


@bp.route('', methods=['GET'])
@jwt_required()
@admin_required()
def list_templates():
    """List all checklist templates. Admin only."""
    templates = ChecklistTemplate.query.all()
    lang = get_language()
    return jsonify({
        'status': 'success',
        'data': [t.to_dict(include_items=True, language=lang) for t in templates]
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
    
    required_fields = ['name', 'function', 'assembly', 'description', 'version']
    for field in required_fields:
        if not data.get(field):
            raise ValidationError(f"{field} is required")

    # Auto-translate name to Arabic if not provided
    name_ar = data.get('name_ar')
    if not name_ar:
        from app.services.translation_service import TranslationService
        name_ar = TranslationService.translate_to_arabic(data['name'])

    template = ChecklistTemplate(
        name=data['name'],
        name_ar=name_ar,
        description=data['description'],
        function=data['function'],
        assembly=data['assembly'],
        part=data.get('part'),
        equipment_type=data.get('equipment_type'),
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
    template = db.session.get(ChecklistTemplate, template_id)
    if not template:
        raise NotFoundError(f"Template with ID {template_id} not found")
    
    data = request.get_json()
    
    required_fields = ['question_text', 'answer_type']
    for field in required_fields:
        if field not in data:
            raise ValidationError(f"{field} is required")

    # Validate answer_type
    valid_types = ['pass_fail', 'yes_no', 'numeric', 'text']
    if data['answer_type'] not in valid_types:
        raise ValidationError(f"answer_type must be one of: {', '.join(valid_types)}")

    # Auto-generate order_index if not provided
    order_index = data.get('order_index')
    if order_index is None:
        max_order = db.session.query(db.func.max(ChecklistItem.order_index)).filter_by(
            template_id=template_id
        ).scalar()
        order_index = (max_order or 0) + 1
    
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
        order_index=order_index,
        category=data.get('category'),
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


# ============================================================
# IMPORT / EXPORT ENDPOINTS
# ============================================================

@bp.route('/download-template', methods=['GET'])
@jwt_required()
@admin_required()
def download_checklist_template():
    """
    Download Excel template for checklist import.
    Returns workbook with 2 sheets: Template (header info) and Items (questions).
    Admin only.
    """
    try:
        import pandas as pd
    except ImportError:
        raise ValidationError("pandas library is required")

    # Sheet 1: Template header info
    template_data = {
        'Field': ['Name', 'Name (Arabic)', 'Function', 'Assembly', 'Part', 'Equipment Type', 'Version'],
        'Value': ['Crane Inspection Checklist', 'قائمة فحص الرافعة', 'Lifting', 'Main Crane', 'Motor Unit', 'crane', '1.0'],
        'Required': ['Yes', 'No', 'Yes', 'Yes', 'No', 'No', 'Yes'],
        'Notes': [
            'Template name in English',
            'Template name in Arabic (auto-translated if empty)',
            'Function name (used for item code prefix)',
            'Assembly name (used for item code prefix)',
            'Part name (optional)',
            'Equipment type this template applies to',
            'Version number (e.g., 1.0, 2.0)'
        ]
    }
    df_template = pd.DataFrame(template_data)

    # Sheet 2: Items
    items_data = {
        'Question': ['Check motor temperature', 'Check oil pressure', 'Inspect wiring condition'],
        'Question (Arabic)': ['تحقق من درجة حرارة المحرك', 'تحقق من ضغط الزيت', 'فحص حالة الأسلاك'],
        'Category': ['mechanical', 'mechanical', 'electrical'],
        'Answer Type': ['numeric', 'numeric', 'pass_fail'],
        'Critical': ['Yes', 'No', 'Yes'],
        'Action': [
            'Use infrared thermometer on motor housing',
            'Read gauge on main panel while engine running',
            'Visual check for cracks, burns, loose connections'
        ],
        'Action (Arabic)': [
            'استخدم مقياس الحرارة بالأشعة تحت الحمراء',
            'اقرأ المقياس على اللوحة الرئيسية',
            'فحص بصري للشقوق والحروق'
        ],
        'Numeric Rule': ['less_than', 'greater_than', ''],
        'Min Value': ['', '30', ''],
        'Max Value': ['85', '', '']
    }
    df_items = pd.DataFrame(items_data)

    # Create Excel file with 2 sheets
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_template.to_excel(writer, index=False, sheet_name='Template')
        df_items.to_excel(writer, index=False, sheet_name='Items')
    output.seek(0)

    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name='checklist_import_template.xlsx'
    )


@bp.route('/import', methods=['POST'])
@jwt_required()
@admin_required()
def import_checklist():
    """
    Import checklist template from Excel file.
    Excel must have 2 sheets: 'Template' (header info) and 'Items' (questions).
    Admin only.

    Returns:
        {
            "status": "success",
            "message": "Template imported successfully",
            "template": {...},
            "items_count": 10
        }
    """
    try:
        import pandas as pd
    except ImportError:
        raise ValidationError("pandas library is required")

    if 'file' not in request.files:
        raise ValidationError("No file provided")

    file = request.files['file']
    if not file.filename:
        raise ValidationError("No file selected")

    if not file.filename.endswith(('.xlsx', '.xls')):
        raise ValidationError("File must be Excel format (.xlsx or .xls)")

    current_user_id = get_jwt_identity()

    try:
        # Read Excel file
        excel_file = pd.ExcelFile(file)

        # Validate sheets exist
        if 'Template' not in excel_file.sheet_names:
            raise ValidationError("Excel file must have a 'Template' sheet")
        if 'Items' not in excel_file.sheet_names:
            raise ValidationError("Excel file must have an 'Items' sheet")

        # Parse Sheet 1: Template
        df_template = pd.read_excel(excel_file, sheet_name='Template')

        # Extract template data (Field, Value columns)
        template_dict = {}
        for _, row in df_template.iterrows():
            field = str(row.get('Field', '')).strip()
            value = row.get('Value', '')
            if pd.notna(value):
                template_dict[field] = str(value).strip()
            else:
                template_dict[field] = None

        # Validate required template fields
        name = template_dict.get('Name')
        function = template_dict.get('Function')
        assembly = template_dict.get('Assembly')
        version = template_dict.get('Version')

        if not name:
            raise ValidationError("Template 'Name' is required in Template sheet")
        if not function:
            raise ValidationError("Template 'Function' is required in Template sheet")
        if not assembly:
            raise ValidationError("Template 'Assembly' is required in Template sheet")
        if not version:
            raise ValidationError("Template 'Version' is required in Template sheet")

        # Auto-translate name to Arabic if not provided
        name_ar = template_dict.get('Name (Arabic)')
        if not name_ar:
            from app.services.translation_service import TranslationService
            name_ar = TranslationService.translate_to_arabic(name)

        # Create template
        template = ChecklistTemplate(
            name=name,
            name_ar=name_ar,
            description=template_dict.get('Description'),
            function=function,
            assembly=assembly,
            part=template_dict.get('Part'),
            equipment_type=template_dict.get('Equipment Type'),
            version=version,
            is_active=True,
            created_by_id=int(current_user_id)
        )
        db.session.add(template)
        db.session.flush()  # Get template ID

        # Parse Sheet 2: Items
        df_items = pd.read_excel(excel_file, sheet_name='Items')

        items_created = 0
        for idx, row in df_items.iterrows():
            question = row.get('Question')
            if pd.isna(question) or not str(question).strip():
                continue  # Skip empty rows

            question = str(question).strip()

            # Get category
            category = row.get('Category')
            if pd.notna(category):
                category = str(category).strip().lower()
                if category not in ('mechanical', 'electrical'):
                    category = None
            else:
                category = None

            # Get answer type
            answer_type = row.get('Answer Type')
            if pd.notna(answer_type):
                answer_type = str(answer_type).strip().lower()
                if answer_type not in ('pass_fail', 'yes_no', 'numeric', 'text'):
                    answer_type = 'pass_fail'  # Default
            else:
                answer_type = 'pass_fail'

            # Get critical flag
            critical = row.get('Critical')
            critical_failure = False
            if pd.notna(critical):
                critical_str = str(critical).strip().lower()
                critical_failure = critical_str in ('yes', 'true', '1', 'y')

            # Get action
            action = row.get('Action')
            action = str(action).strip() if pd.notna(action) else None

            action_ar = row.get('Action (Arabic)')
            if pd.notna(action_ar):
                action_ar = str(action_ar).strip()
            elif action:
                # Auto-translate action
                from app.services.translation_service import TranslationService
                action_ar = TranslationService.translate_to_arabic(action)
            else:
                action_ar = None

            # Get numeric rules
            numeric_rule = None
            min_value = None
            max_value = None
            if answer_type == 'numeric':
                nr = row.get('Numeric Rule')
                if pd.notna(nr):
                    numeric_rule = str(nr).strip().lower()
                    if numeric_rule not in ('less_than', 'greater_than', 'between'):
                        numeric_rule = None

                mv = row.get('Min Value')
                if pd.notna(mv):
                    try:
                        min_value = float(mv)
                    except ValueError:
                        pass

                xv = row.get('Max Value')
                if pd.notna(xv):
                    try:
                        max_value = float(xv)
                    except ValueError:
                        pass

            # Get question Arabic
            question_ar = row.get('Question (Arabic)')
            if pd.notna(question_ar):
                question_ar = str(question_ar).strip()
            else:
                # Auto-translate
                from app.services.translation_service import TranslationService
                question_ar = TranslationService.translate_to_arabic(question)

            # Generate item code
            items_created += 1
            item_code = generate_item_code(function, assembly, items_created)

            item = ChecklistItem(
                template_id=template.id,
                item_code=item_code,
                question_text=question,
                question_text_ar=question_ar,
                answer_type=answer_type,
                category=category,
                is_required=True,
                order_index=items_created,
                critical_failure=critical_failure,
                action=action,
                action_ar=action_ar,
                numeric_rule=numeric_rule,
                min_value=min_value,
                max_value=max_value
            )
            db.session.add(item)

        if items_created == 0:
            raise ValidationError("No valid items found in Items sheet")

        safe_commit()

        return jsonify({
            'status': 'success',
            'message': f'Template "{name}" imported successfully with {items_created} items',
            'template': template.to_dict(include_items=True, language=get_language()),
            'items_count': items_created
        }), 201

    except ValidationError:
        raise
    except Exception as e:
        db.session.rollback()
        raise ValidationError(f"Error parsing Excel file: {str(e)}")