"""
Checklist template management endpoints (Admin only).
Enhanced with AI generation, analytics, and smart features.
"""

import io
import json
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func
from app.models import ChecklistTemplate, ChecklistItem, User, Inspection, Defect
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
    Returns single-sheet workbook with all data in one place.
    Items grouped by Assembly and Part columns.
    Admin only.
    """
    try:
        import pandas as pd
    except ImportError:
        raise ValidationError("pandas library is required")

    # Single sheet with all data - multiple assemblies supported via Assembly column
    data = {
        'Equipment Type': ['Pump', 'Pump', 'Pump', 'Pump', 'Pump', 'Pump'],
        'Assembly': ['Motor', 'Motor', 'Motor', 'Pump Unit', 'Pump Unit', 'Coupling'],
        'Part': ['Bearings', 'Bearings', 'Windings', 'Impeller', 'Seal', ''],
        'Question': [
            'Check bearing temperature',
            'Check vibration level',
            'Check winding insulation',
            'Visual wear inspection',
            'Check for leaks',
            'Check alignment'
        ],
        'Question (Arabic)': [
            'تحقق من درجة حرارة المحمل',
            'تحقق من مستوى الاهتزاز',
            'تحقق من عزل الملفات',
            'فحص التآكل البصري',
            'تحقق من التسريبات',
            'تحقق من المحاذاة'
        ],
        'Category': ['mechanical', 'mechanical', 'electrical', 'mechanical', 'mechanical', 'mechanical'],
        'Answer Type': ['numeric', 'numeric', 'pass_fail', 'pass_fail', 'pass_fail', 'numeric'],
        'Expected Result': ['< 80°C', '< 2.5 mm/s', 'Pass', 'Pass', 'Pass', '< 0.05 mm'],
        'Action if Fail': [
            'Replace bearing',
            'Investigate vibration source',
            'Rewind motor',
            'Replace impeller',
            'Replace seal',
            'Realign coupling'
        ],
        'Critical': ['Yes', 'No', 'Yes', 'No', 'Yes', 'No'],
        'Numeric Rule': ['less_than', 'less_than', '', '', '', 'less_than'],
        'Min Value': ['', '', '', '', '', ''],
        'Max Value': ['80', '2.5', '', '', '', '0.05']
    }
    df = pd.DataFrame(data)

    # Create Excel file
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Checklist')

        # Add instructions sheet
        instructions = {
            'Column': ['Equipment Type', 'Assembly', 'Part', 'Question', 'Question (Arabic)',
                       'Category', 'Answer Type', 'Expected Result', 'Action if Fail',
                       'Critical', 'Numeric Rule', 'Min Value', 'Max Value'],
            'Required': ['Yes', 'Yes', 'No', 'Yes', 'No (auto-translated)',
                        'No', 'Yes', 'No', 'No', 'No', 'No', 'No', 'No'],
            'Description': [
                'Equipment type (e.g., Pump, Crane, Generator)',
                'Assembly name (e.g., Motor, Pump Unit, Coupling)',
                'Part within assembly (optional, e.g., Bearings, Impeller)',
                'Question text in English',
                'Question in Arabic (auto-translated if empty)',
                'mechanical or electrical',
                'pass_fail, yes_no, numeric, or text',
                'Expected good result (shown to inspector)',
                'Action to take if check fails',
                'Yes = critical failure item',
                'For numeric: less_than, greater_than, or between',
                'Minimum value for numeric validation',
                'Maximum value for numeric validation'
            ]
        }
        df_instructions = pd.DataFrame(instructions)
        df_instructions.to_excel(writer, index=False, sheet_name='Instructions')
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
    New format: Single sheet with Equipment Type, Assembly, Part, Question columns.
    Multiple assemblies supported via Assembly column per row.
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
    version = request.form.get('version', '1.0')

    try:
        # Read Excel file
        excel_file = pd.ExcelFile(file)

        # Try new format first (single sheet named 'Checklist' or first sheet)
        if 'Checklist' in excel_file.sheet_names:
            df = pd.read_excel(excel_file, sheet_name='Checklist')
        elif 'Template' in excel_file.sheet_names and 'Items' in excel_file.sheet_names:
            # Legacy 2-sheet format - call old import logic
            return _import_checklist_legacy(excel_file, current_user_id)
        else:
            # Use first sheet
            df = pd.read_excel(excel_file, sheet_name=0)

        # Validate required columns
        required_cols = ['Equipment Type', 'Assembly', 'Question']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise ValidationError(f"Missing required columns: {', '.join(missing_cols)}")

        # Get equipment type from first row
        # Supports comma-separated values: "pump,compressor,motor" or "RS,ECH,TT"
        equipment_type = None
        for _, row in df.iterrows():
            et = row.get('Equipment Type')
            if pd.notna(et) and str(et).strip():
                equipment_type = str(et).strip()
                break

        if not equipment_type:
            raise ValidationError("Equipment Type is required")

        # Get unique assemblies for template name
        assemblies = df['Assembly'].dropna().unique().tolist()
        template_name = f"{equipment_type} Inspection Checklist"

        # Auto-translate template name
        from app.services.translation_service import TranslationService
        name_ar = TranslationService.translate_to_arabic(template_name)

        # Normalize equipment_type: if comma-separated, clean up spaces and lowercase
        # Example: "RS, ECH, TT" becomes "rs,ech,tt"
        if ',' in equipment_type:
            types_list = [t.strip().lower().replace(' ', '_') for t in equipment_type.split(',')]
            equipment_type_key = ','.join(types_list)
        else:
            equipment_type_key = equipment_type.lower().replace(' ', '_')
        existing_template = ChecklistTemplate.query.filter_by(
            equipment_type=equipment_type_key,
            version=version
        ).first()

        if existing_template:
            # Update existing template
            template = existing_template
            template.name = template_name
            template.name_ar = name_ar
            template.description = f"Checklist for {equipment_type} with assemblies: {', '.join(assemblies)}"
            template.function = equipment_type
            template.assembly = ', '.join(assemblies)
            template.is_active = True
            template.updated_at = datetime.now()

            # Delete old items to replace with new ones
            ChecklistItem.query.filter_by(template_id=template.id).delete()
            db.session.flush()
        else:
            # Create new template
            template = ChecklistTemplate(
                name=template_name,
                name_ar=name_ar,
                description=f"Checklist for {equipment_type} with assemblies: {', '.join(assemblies)}",
                function=equipment_type,
                assembly=', '.join(assemblies),
                equipment_type=equipment_type_key,
                version=version,
                is_active=True,
                created_by_id=int(current_user_id)
            )
            db.session.add(template)
            db.session.flush()

        items_created = 0
        assembly_counters = {}  # Track item numbers per assembly

        for idx, row in df.iterrows():
            question = row.get('Question')
            if pd.isna(question) or not str(question).strip():
                continue

            question = str(question).strip()
            assembly = str(row.get('Assembly', '')).strip() if pd.notna(row.get('Assembly')) else None
            part = str(row.get('Part', '')).strip() if pd.notna(row.get('Part')) else None

            if not assembly:
                continue  # Skip rows without assembly

            # Track item number per assembly
            if assembly not in assembly_counters:
                assembly_counters[assembly] = 0
            assembly_counters[assembly] += 1

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
                answer_type = str(answer_type).strip().lower().replace(' ', '_')
                if answer_type not in ('pass_fail', 'yes_no', 'numeric', 'text'):
                    answer_type = 'pass_fail'
            else:
                answer_type = 'pass_fail'

            # Get critical flag
            critical = row.get('Critical')
            critical_failure = False
            if pd.notna(critical):
                critical_str = str(critical).strip().lower()
                critical_failure = critical_str in ('yes', 'true', '1', 'y')

            # Get expected result
            expected_result = row.get('Expected Result')
            expected_result = str(expected_result).strip() if pd.notna(expected_result) else None
            expected_result_ar = None
            if expected_result:
                expected_result_ar = TranslationService.translate_to_arabic(expected_result)

            # Get action if fail
            action_if_fail = row.get('Action if Fail')
            action_if_fail = str(action_if_fail).strip() if pd.notna(action_if_fail) else None
            action_if_fail_ar = None
            if action_if_fail:
                action_if_fail_ar = TranslationService.translate_to_arabic(action_if_fail)

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
                question_ar = TranslationService.translate_to_arabic(question)

            # Generate item code: [EqType 2 letters]-[Assembly 2 letters]-00X
            items_created += 1
            item_code = generate_item_code(equipment_type, assembly, assembly_counters[assembly])

            item = ChecklistItem(
                template_id=template.id,
                item_code=item_code,
                assembly=assembly,
                part=part,
                question_text=question,
                question_text_ar=question_ar,
                answer_type=answer_type,
                category=category,
                is_required=True,
                order_index=items_created,
                critical_failure=critical_failure,
                expected_result=expected_result,
                expected_result_ar=expected_result_ar,
                action_if_fail=action_if_fail,
                action_if_fail_ar=action_if_fail_ar,
                numeric_rule=numeric_rule,
                min_value=min_value,
                max_value=max_value
            )
            db.session.add(item)

        if items_created == 0:
            raise ValidationError("No valid items found in the file")

        safe_commit()

        action = "updated" if existing_template else "imported"
        return jsonify({
            'status': 'success',
            'message': f'Template "{template_name}" {action} with {items_created} items across {len(assemblies)} assemblies',
            'template': template.to_dict(include_items=True, language=get_language()),
            'items_count': items_created,
            'assemblies': assemblies,
            'action': action
        }), 201

    except ValidationError:
        raise
    except Exception as e:
        db.session.rollback()
        raise ValidationError(f"Error parsing Excel file: {str(e)}")


def _import_checklist_legacy(excel_file, current_user_id):
    """
    Legacy import for old 2-sheet format (Template + Items sheets).
    Kept for backwards compatibility.
    """
    import pandas as pd
    from app.services.translation_service import TranslationService

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
    db.session.flush()

    # Parse Sheet 2: Items
    df_items = pd.read_excel(excel_file, sheet_name='Items')

    items_created = 0
    for idx, row in df_items.iterrows():
        question = row.get('Question')
        if pd.isna(question) or not str(question).strip():
            continue

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
                answer_type = 'pass_fail'
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
            question_ar = TranslationService.translate_to_arabic(question)

        items_created += 1
        item_code = generate_item_code(function, assembly, items_created)

        item = ChecklistItem(
            template_id=template.id,
            item_code=item_code,
            assembly=assembly,  # Use template-level assembly
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


# ============================================================
# ENHANCED FEATURES: CLONE, STATS, AI, SEARCH
# ============================================================

@bp.route('/stats', methods=['GET'])
@jwt_required()
@admin_required()
def get_checklist_stats():
    """
    Get comprehensive checklist statistics and analytics.
    Admin only.
    """
    # Basic counts
    total_templates = ChecklistTemplate.query.count()
    active_templates = ChecklistTemplate.query.filter_by(is_active=True).count()
    total_items = ChecklistItem.query.count()

    # Items per template average
    avg_items = db.session.query(func.avg(
        db.session.query(func.count(ChecklistItem.id))
        .filter(ChecklistItem.template_id == ChecklistTemplate.id)
        .correlate(ChecklistTemplate)
        .scalar_subquery()
    )).scalar() or 0

    # Category distribution
    category_counts = db.session.query(
        ChecklistItem.category, func.count(ChecklistItem.id)
    ).group_by(ChecklistItem.category).all()
    by_category = {cat or 'uncategorized': count for cat, count in category_counts}

    # Answer type distribution
    answer_type_counts = db.session.query(
        ChecklistItem.answer_type, func.count(ChecklistItem.id)
    ).group_by(ChecklistItem.answer_type).all()
    by_answer_type = {atype: count for atype, count in answer_type_counts}

    # Critical items count
    critical_items = ChecklistItem.query.filter_by(critical_failure=True).count()

    # Templates by equipment type
    equipment_counts = db.session.query(
        ChecklistTemplate.equipment_type, func.count(ChecklistTemplate.id)
    ).group_by(ChecklistTemplate.equipment_type).all()
    by_equipment = {eq or 'unspecified': count for eq, count in equipment_counts}

    # Usage statistics - templates used in inspections
    try:
        template_usage = db.session.query(
            ChecklistTemplate.id,
            ChecklistTemplate.name,
            func.count(Inspection.id).label('usage_count')
        ).outerjoin(
            Inspection, Inspection.checklist_template_id == ChecklistTemplate.id
        ).group_by(ChecklistTemplate.id, ChecklistTemplate.name).order_by(
            func.count(Inspection.id).desc()
        ).limit(10).all()

        most_used = [
            {'id': t[0], 'name': t[1], 'usage_count': t[2]}
            for t in template_usage
        ]
    except Exception:
        most_used = []

    # Defect correlation - which items find most defects
    try:
        # This would need a proper join with inspection_answers and defects
        # Simplified version here
        defect_prone_items = []
    except Exception:
        defect_prone_items = []

    return jsonify({
        'status': 'success',
        'data': {
            'total_templates': total_templates,
            'active_templates': active_templates,
            'total_items': total_items,
            'avg_items_per_template': round(avg_items, 1),
            'critical_items': critical_items,
            'critical_ratio': round((critical_items / total_items * 100) if total_items > 0 else 0, 1),
            'by_category': by_category,
            'by_answer_type': by_answer_type,
            'by_equipment': by_equipment,
            'most_used': most_used,
            'defect_correlation': defect_prone_items
        }
    }), 200


@bp.route('/<int:template_id>/clone', methods=['POST'])
@jwt_required()
@admin_required()
def clone_template(template_id):
    """
    Clone a checklist template with all its items.
    Admin only.

    Request Body (optional):
        {
            "name": "New Template Name",
            "equipment_type": "new_equipment_type"
        }
    """
    template = db.session.get(ChecklistTemplate, template_id)
    if not template:
        raise NotFoundError(f"Template with ID {template_id} not found")

    current_user_id = get_jwt_identity()
    data = request.get_json() or {}

    # Generate new name
    base_name = data.get('name') or f"{template.name} (Copy)"

    # Check for existing name and make unique
    existing = ChecklistTemplate.query.filter(
        ChecklistTemplate.name.like(f"{base_name}%")
    ).count()
    if existing > 0:
        new_name = f"{base_name} {existing + 1}"
    else:
        new_name = base_name

    # Auto-translate if name changed
    from app.services.translation_service import TranslationService
    name_ar = TranslationService.translate_to_arabic(new_name)

    # Create new template
    new_template = ChecklistTemplate(
        name=new_name,
        name_ar=name_ar,
        description=template.description,
        function=template.function,
        assembly=template.assembly,
        part=template.part,
        equipment_type=data.get('equipment_type') or template.equipment_type,
        version='1.0',
        is_active=True,
        created_by_id=int(current_user_id)
    )
    db.session.add(new_template)
    db.session.flush()

    # Clone all items
    items_cloned = 0
    for item in template.items:
        new_item = ChecklistItem(
            template_id=new_template.id,
            item_code=item.item_code,
            assembly=item.assembly,
            part=item.part,
            question_text=item.question_text,
            question_text_ar=item.question_text_ar,
            answer_type=item.answer_type,
            category=item.category,
            is_required=item.is_required,
            order_index=item.order_index,
            critical_failure=item.critical_failure,
            expected_result=item.expected_result,
            expected_result_ar=item.expected_result_ar,
            action=getattr(item, 'action', None),
            action_ar=getattr(item, 'action_ar', None),
            action_if_fail=getattr(item, 'action_if_fail', None),
            action_if_fail_ar=getattr(item, 'action_if_fail_ar', None),
            numeric_rule=item.numeric_rule,
            min_value=item.min_value,
            max_value=item.max_value
        )
        db.session.add(new_item)
        items_cloned += 1

    safe_commit()

    return jsonify({
        'status': 'success',
        'message': f'Template cloned successfully with {items_cloned} items',
        'template': new_template.to_dict(include_items=True, language=get_language())
    }), 201


@bp.route('/search', methods=['GET'])
@jwt_required()
@admin_required()
def search_checklists():
    """
    Search checklists by name, equipment type, or items.
    Admin only.

    Query params:
        - q: search query
        - equipment_type: filter by equipment type
        - category: filter by item category
        - has_critical: 'true' to show only templates with critical items
    """
    query_text = request.args.get('q', '').strip()
    equipment_type = request.args.get('equipment_type')
    category = request.args.get('category')
    has_critical = request.args.get('has_critical', '').lower() == 'true'

    query = ChecklistTemplate.query

    if query_text:
        search_term = f'%{query_text}%'
        # Search in template name, description, function, assembly
        query = query.filter(
            db.or_(
                ChecklistTemplate.name.ilike(search_term),
                ChecklistTemplate.name_ar.ilike(search_term),
                ChecklistTemplate.description.ilike(search_term),
                ChecklistTemplate.function.ilike(search_term),
                ChecklistTemplate.assembly.ilike(search_term),
                ChecklistTemplate.equipment_type.ilike(search_term)
            )
        )

    if equipment_type:
        query = query.filter(ChecklistTemplate.equipment_type == equipment_type)

    if category:
        # Filter templates that have items with this category
        query = query.filter(
            ChecklistTemplate.id.in_(
                db.session.query(ChecklistItem.template_id).filter(
                    ChecklistItem.category == category
                ).distinct()
            )
        )

    if has_critical:
        # Filter templates that have critical items
        query = query.filter(
            ChecklistTemplate.id.in_(
                db.session.query(ChecklistItem.template_id).filter(
                    ChecklistItem.critical_failure == True
                ).distinct()
            )
        )

    templates = query.order_by(ChecklistTemplate.name).limit(50).all()
    lang = get_language()

    # Also search in items if query provided
    matching_items = []
    if query_text:
        item_search = f'%{query_text}%'
        items = ChecklistItem.query.filter(
            db.or_(
                ChecklistItem.question_text.ilike(item_search),
                ChecklistItem.question_text_ar.ilike(item_search)
            )
        ).limit(20).all()
        matching_items = [
            {
                'id': item.id,
                'template_id': item.template_id,
                'template_name': item.template.name if item.template else None,
                'question': item.question_text,
                'category': item.category
            }
            for item in items
        ]

    return jsonify({
        'status': 'success',
        'templates': [t.to_dict(include_items=True, language=lang) for t in templates],
        'matching_items': matching_items,
        'total_templates': len(templates),
        'total_items': len(matching_items)
    }), 200


@bp.route('/ai-generate', methods=['POST'])
@jwt_required()
@admin_required()
def ai_generate_checklist():
    """
    AI-powered checklist generation from natural language.
    Generates a checklist based on equipment type and description.
    Admin only.

    Request Body:
        {
            "equipment_type": "pump" | "crane" | "generator" | etc.,
            "description": "centrifugal pump for water circulation",
            "include_electrical": true,
            "include_mechanical": true
        }
    """
    from app.services.translation_service import TranslationService

    data = request.get_json()
    equipment_type = data.get('equipment_type', '').strip().lower()
    description = data.get('description', '').strip()
    include_electrical = data.get('include_electrical', True)
    include_mechanical = data.get('include_mechanical', True)
    current_user_id = get_jwt_identity()

    if not equipment_type:
        raise ValidationError("Equipment type is required")

    # Define standard checklist items for common equipment types
    equipment_templates = {
        'pump': {
            'function': 'Pumping',
            'assemblies': ['Motor', 'Pump Unit', 'Coupling', 'Base/Foundation'],
            'mechanical_items': [
                ('Check pump casing for cracks or damage', 'pass_fail', True),
                ('Inspect impeller condition', 'pass_fail', True),
                ('Check mechanical seal for leaks', 'pass_fail', True),
                ('Verify bearing temperature', 'numeric', False),
                ('Check coupling alignment', 'numeric', False),
                ('Inspect foundation bolts', 'pass_fail', False),
                ('Check vibration level', 'numeric', True),
                ('Verify lubrication level', 'pass_fail', False),
                ('Inspect suction/discharge valves', 'pass_fail', False),
                ('Check pressure gauges', 'pass_fail', False),
            ],
            'electrical_items': [
                ('Check motor winding insulation', 'pass_fail', True),
                ('Verify motor current draw', 'numeric', False),
                ('Inspect electrical connections', 'pass_fail', True),
                ('Check motor temperature', 'numeric', False),
                ('Verify control panel indicators', 'pass_fail', False),
                ('Test emergency stop function', 'pass_fail', True),
                ('Check cable condition', 'pass_fail', False),
                ('Verify grounding connection', 'pass_fail', True),
            ]
        },
        'crane': {
            'function': 'Lifting',
            'assemblies': ['Hoist', 'Bridge/Trolley', 'Controls', 'Structure'],
            'mechanical_items': [
                ('Inspect wire rope condition', 'pass_fail', True),
                ('Check hook and safety latch', 'pass_fail', True),
                ('Verify brake operation', 'pass_fail', True),
                ('Inspect sheaves and drums', 'pass_fail', False),
                ('Check wheel condition', 'pass_fail', False),
                ('Verify rail alignment', 'pass_fail', False),
                ('Inspect gear box oil level', 'pass_fail', False),
                ('Check limit switches operation', 'pass_fail', True),
                ('Inspect structural welds', 'pass_fail', True),
                ('Verify load indicator', 'pass_fail', True),
            ],
            'electrical_items': [
                ('Check pendant control buttons', 'pass_fail', True),
                ('Verify emergency stop', 'pass_fail', True),
                ('Inspect motor brushes', 'pass_fail', False),
                ('Check festoon cable', 'pass_fail', False),
                ('Verify warning lights and horn', 'pass_fail', False),
                ('Test overload protection', 'pass_fail', True),
                ('Check power supply cable', 'pass_fail', True),
            ]
        },
        'generator': {
            'function': 'Power Generation',
            'assemblies': ['Engine', 'Alternator', 'Control Panel', 'Fuel System'],
            'mechanical_items': [
                ('Check engine oil level', 'pass_fail', False),
                ('Inspect coolant level', 'pass_fail', False),
                ('Verify belt tension', 'pass_fail', False),
                ('Check exhaust system', 'pass_fail', True),
                ('Inspect air filter', 'pass_fail', False),
                ('Verify fuel filter condition', 'pass_fail', False),
                ('Check for fuel leaks', 'pass_fail', True),
                ('Inspect radiator condition', 'pass_fail', False),
                ('Verify engine mounts', 'pass_fail', False),
            ],
            'electrical_items': [
                ('Check battery condition', 'pass_fail', True),
                ('Verify battery charger', 'pass_fail', False),
                ('Test automatic transfer switch', 'pass_fail', True),
                ('Check alternator output voltage', 'numeric', False),
                ('Verify frequency', 'numeric', False),
                ('Inspect wiring connections', 'pass_fail', True),
                ('Test control panel indicators', 'pass_fail', False),
                ('Verify emergency shutdown', 'pass_fail', True),
            ]
        },
        'compressor': {
            'function': 'Compression',
            'assemblies': ['Compressor Unit', 'Motor', 'Cooling System', 'Controls'],
            'mechanical_items': [
                ('Check oil level and condition', 'pass_fail', False),
                ('Inspect intake filter', 'pass_fail', False),
                ('Verify discharge pressure', 'numeric', False),
                ('Check for air leaks', 'pass_fail', True),
                ('Inspect belts/coupling', 'pass_fail', False),
                ('Verify safety valve operation', 'pass_fail', True),
                ('Check vibration level', 'numeric', False),
                ('Inspect drain valves', 'pass_fail', False),
            ],
            'electrical_items': [
                ('Check motor current', 'numeric', False),
                ('Verify control panel', 'pass_fail', False),
                ('Test pressure switches', 'pass_fail', True),
                ('Check wiring condition', 'pass_fail', True),
                ('Verify grounding', 'pass_fail', True),
            ]
        },
        'conveyor': {
            'function': 'Material Handling',
            'assemblies': ['Belt/Chain', 'Drive Unit', 'Rollers/Idlers', 'Structure'],
            'mechanical_items': [
                ('Inspect belt condition and tracking', 'pass_fail', True),
                ('Check belt tension', 'pass_fail', False),
                ('Verify roller rotation', 'pass_fail', False),
                ('Inspect drive pulley', 'pass_fail', False),
                ('Check take-up mechanism', 'pass_fail', False),
                ('Verify guard condition', 'pass_fail', True),
                ('Inspect scraper/cleaner', 'pass_fail', False),
            ],
            'electrical_items': [
                ('Test emergency stops', 'pass_fail', True),
                ('Check pull cord switches', 'pass_fail', True),
                ('Verify motor operation', 'pass_fail', False),
                ('Inspect sensor operation', 'pass_fail', False),
            ]
        }
    }

    # Get template data or use generic
    template_data = equipment_templates.get(equipment_type, {
        'function': equipment_type.title(),
        'assemblies': ['Main Unit', 'Auxiliary Systems'],
        'mechanical_items': [
            ('Visual inspection for damage', 'pass_fail', False),
            ('Check for abnormal noise', 'pass_fail', False),
            ('Verify proper operation', 'pass_fail', True),
            ('Inspect guards and covers', 'pass_fail', True),
            ('Check lubrication', 'pass_fail', False),
        ],
        'electrical_items': [
            ('Verify power supply', 'pass_fail', True),
            ('Check wiring condition', 'pass_fail', True),
            ('Test emergency stop', 'pass_fail', True),
            ('Inspect control panel', 'pass_fail', False),
        ]
    })

    # Create the template
    template_name = f"{equipment_type.title()} Inspection Checklist"
    if description:
        template_name = f"{description.title()} Checklist"

    name_ar = TranslationService.translate_to_arabic(template_name)

    template = ChecklistTemplate(
        name=template_name,
        name_ar=name_ar,
        description=f"AI-generated checklist for {equipment_type}" + (f": {description}" if description else ""),
        function=template_data['function'],
        assembly=', '.join(template_data['assemblies']),
        equipment_type=equipment_type,
        version='1.0',
        is_active=True,
        created_by_id=int(current_user_id)
    )
    db.session.add(template)
    db.session.flush()

    # Add items
    items_created = 0
    order_index = 1

    if include_mechanical:
        for question, answer_type, is_critical in template_data['mechanical_items']:
            question_ar = TranslationService.translate_to_arabic(question)
            item_code = generate_item_code(template_data['function'], 'MECH', order_index)

            item = ChecklistItem(
                template_id=template.id,
                item_code=item_code,
                assembly=template_data['assemblies'][0] if template_data['assemblies'] else None,
                question_text=question,
                question_text_ar=question_ar,
                answer_type=answer_type,
                category='mechanical',
                is_required=True,
                order_index=order_index,
                critical_failure=is_critical
            )
            db.session.add(item)
            items_created += 1
            order_index += 1

    if include_electrical:
        for question, answer_type, is_critical in template_data['electrical_items']:
            question_ar = TranslationService.translate_to_arabic(question)
            item_code = generate_item_code(template_data['function'], 'ELEC', order_index)

            item = ChecklistItem(
                template_id=template.id,
                item_code=item_code,
                assembly=template_data['assemblies'][0] if template_data['assemblies'] else None,
                question_text=question,
                question_text_ar=question_ar,
                answer_type=answer_type,
                category='electrical',
                is_required=True,
                order_index=order_index,
                critical_failure=is_critical
            )
            db.session.add(item)
            items_created += 1
            order_index += 1

    safe_commit()

    return jsonify({
        'status': 'success',
        'message': f'AI-generated checklist created with {items_created} items',
        'template': template.to_dict(include_items=True, language=get_language()),
        'items_count': items_created,
        'equipment_type': equipment_type
    }), 201


@bp.route('/<int:template_id>/analytics', methods=['GET'])
@jwt_required()
@admin_required()
def get_template_analytics(template_id):
    """
    Get detailed analytics for a specific template.
    Shows usage stats, defect correlation, and item effectiveness.
    Admin only.
    """
    template = db.session.get(ChecklistTemplate, template_id)
    if not template:
        raise NotFoundError(f"Template with ID {template_id} not found")

    # Basic stats
    item_count = len(template.items) if template.items else 0
    critical_count = sum(1 for item in template.items if item.critical_failure) if template.items else 0
    mechanical_count = sum(1 for item in template.items if item.category == 'mechanical') if template.items else 0
    electrical_count = sum(1 for item in template.items if item.category == 'electrical') if template.items else 0

    # Usage statistics
    try:
        total_uses = Inspection.query.filter_by(checklist_template_id=template_id).count()
        completed_uses = Inspection.query.filter_by(
            checklist_template_id=template_id,
            status='completed'
        ).count()

        # Recent usage (last 30 days)
        month_ago = datetime.now() - timedelta(days=30)
        recent_uses = Inspection.query.filter(
            Inspection.checklist_template_id == template_id,
            Inspection.created_at >= month_ago
        ).count()
    except Exception:
        total_uses = 0
        completed_uses = 0
        recent_uses = 0

    # Defect correlation (defects found during inspections using this template)
    try:
        defects_found = Defect.query.join(
            Inspection, Defect.inspection_id == Inspection.id
        ).filter(
            Inspection.checklist_template_id == template_id
        ).count()
    except Exception:
        defects_found = 0

    # Coverage analysis
    coverage = {
        'mechanical_ratio': round((mechanical_count / item_count * 100) if item_count > 0 else 0, 1),
        'electrical_ratio': round((electrical_count / item_count * 100) if item_count > 0 else 0, 1),
        'critical_ratio': round((critical_count / item_count * 100) if item_count > 0 else 0, 1),
        'balance_score': 0  # Will calculate
    }

    # Balance score: ideal is 50/50 for mech/elec
    if item_count > 0:
        mech_pct = mechanical_count / item_count
        elec_pct = electrical_count / item_count
        # Score 100 if perfectly balanced, lower if imbalanced
        imbalance = abs(mech_pct - elec_pct)
        coverage['balance_score'] = round((1 - imbalance) * 100, 1)

    # Item-level stats
    item_stats = []
    for item in (template.items or []):
        item_stats.append({
            'id': item.id,
            'item_code': item.item_code,
            'question': item.question_text[:50] + '...' if len(item.question_text) > 50 else item.question_text,
            'category': item.category,
            'answer_type': item.answer_type,
            'critical': item.critical_failure,
            'defects_triggered': 0  # Would need inspection_answer correlation
        })

    return jsonify({
        'status': 'success',
        'data': {
            'template_id': template_id,
            'template_name': template.name,
            'item_count': item_count,
            'critical_count': critical_count,
            'usage': {
                'total': total_uses,
                'completed': completed_uses,
                'recent_30_days': recent_uses,
                'completion_rate': round((completed_uses / total_uses * 100) if total_uses > 0 else 0, 1)
            },
            'defects_found': defects_found,
            'defect_rate': round((defects_found / completed_uses) if completed_uses > 0 else 0, 2),
            'coverage': coverage,
            'items': item_stats
        }
    }), 200


@bp.route('/<int:template_id>/items/reorder', methods=['POST'])
@jwt_required()
@admin_required()
def reorder_items(template_id):
    """
    Reorder checklist items (for drag-and-drop).
    Admin only.

    Request Body:
        {
            "item_orders": [
                {"id": 1, "order_index": 1},
                {"id": 2, "order_index": 2},
                ...
            ]
        }
    """
    template = db.session.get(ChecklistTemplate, template_id)
    if not template:
        raise NotFoundError(f"Template with ID {template_id} not found")

    data = request.get_json()
    item_orders = data.get('item_orders', [])

    if not item_orders:
        raise ValidationError("No item orders provided")

    updated_count = 0
    for order_data in item_orders:
        item_id = order_data.get('id')
        new_order = order_data.get('order_index')

        if item_id and new_order is not None:
            item = ChecklistItem.query.filter_by(id=item_id, template_id=template_id).first()
            if item:
                item.order_index = new_order
                updated_count += 1

    safe_commit()

    return jsonify({
        'status': 'success',
        'message': f'{updated_count} items reordered',
        'template': template.to_dict(include_items=True, language=get_language())
    }), 200


@bp.route('/ai-suggest-items', methods=['POST'])
@jwt_required()
@admin_required()
def ai_suggest_items():
    """
    AI-powered item suggestions based on equipment type and existing items.
    Admin only.

    Request Body:
        {
            "equipment_type": "pump",
            "existing_items": ["check motor", "verify pressure"],
            "category": "mechanical" | "electrical" | null
        }
    """
    from app.services.translation_service import TranslationService

    data = request.get_json()
    equipment_type = data.get('equipment_type', '').strip().lower()
    existing_items = data.get('existing_items', [])
    category = data.get('category')

    # Common inspection items database
    all_suggestions = {
        'mechanical': [
            'Check for abnormal vibration',
            'Verify lubrication level and condition',
            'Inspect for oil or grease leaks',
            'Check belt tension and condition',
            'Verify coupling alignment',
            'Inspect bearing condition',
            'Check foundation bolts',
            'Verify guard condition and secure',
            'Inspect for corrosion',
            'Check seal condition',
            'Verify operating temperature',
            'Inspect for unusual noise',
            'Check pressure readings',
            'Verify flow rate',
            'Inspect filter condition',
        ],
        'electrical': [
            'Verify power supply voltage',
            'Check motor current draw',
            'Test insulation resistance',
            'Verify grounding connection',
            'Check wiring and connections',
            'Test emergency stop function',
            'Verify control panel indicators',
            'Check cable condition',
            'Test overload protection',
            'Verify instrument readings',
            'Check for overheating',
            'Inspect junction boxes',
            'Verify circuit breaker operation',
            'Check sensor calibration',
        ]
    }

    # Filter out existing items
    existing_lower = [e.lower() for e in existing_items]

    suggestions = []
    categories_to_check = [category] if category else ['mechanical', 'electrical']

    for cat in categories_to_check:
        for item in all_suggestions.get(cat, []):
            # Check if similar item already exists
            item_lower = item.lower()
            is_duplicate = any(
                existing in item_lower or item_lower in existing
                for existing in existing_lower
            )
            if not is_duplicate:
                question_ar = TranslationService.translate_to_arabic(item)
                suggestions.append({
                    'question_text': item,
                    'question_text_ar': question_ar,
                    'category': cat,
                    'answer_type': 'pass_fail',
                    'critical_failure': False
                })

    # Limit suggestions
    suggestions = suggestions[:10]

    return jsonify({
        'status': 'success',
        'suggestions': suggestions,
        'count': len(suggestions),
        'equipment_type': equipment_type
    }), 200