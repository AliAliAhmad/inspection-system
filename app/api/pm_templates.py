"""
PM Templates API endpoints.
Handles CRUD operations for preventive maintenance templates with checklists and materials.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models import PMTemplate, PMTemplateChecklistItem, PMTemplateMaterial, MaintenanceCycle, Material, User
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from app.utils.decorators import get_current_user

bp = Blueprint('pm_templates', __name__)


def engineer_or_admin_required():
    """Check if user is engineer or admin."""
    user = get_current_user()
    if user.role not in ['admin', 'engineer']:
        raise ForbiddenError("Only engineers and admins can manage PM templates")
    return user


@bp.route('', methods=['GET'])
@jwt_required()
def list_templates():
    """
    List all PM templates.

    Query params:
        - equipment_type: Filter by equipment type
        - cycle_id: Filter by cycle
        - active_only: If true, only show active templates (default true)
    """
    user = get_current_user()
    language = user.language or 'en'

    equipment_type = request.args.get('equipment_type')
    cycle_id = request.args.get('cycle_id', type=int)
    active_only = request.args.get('active_only', 'true').lower() == 'true'

    query = PMTemplate.query

    if active_only:
        query = query.filter(PMTemplate.is_active == True)

    if equipment_type:
        query = query.filter(PMTemplate.equipment_type == equipment_type)

    if cycle_id:
        query = query.filter(PMTemplate.cycle_id == cycle_id)

    templates = query.order_by(PMTemplate.equipment_type, PMTemplate.name).all()

    return jsonify({
        'status': 'success',
        'templates': [t.to_dict(language, include_items=False) for t in templates],
        'count': len(templates)
    }), 200


@bp.route('/<int:template_id>', methods=['GET'])
@jwt_required()
def get_template(template_id):
    """Get a single template by ID with full details."""
    template = db.session.get(PMTemplate, template_id)
    if not template:
        raise NotFoundError("PM template not found")

    user = get_current_user()
    language = user.language or 'en'

    return jsonify({
        'status': 'success',
        'template': template.to_dict(language, include_items=True)
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
def create_template():
    """
    Create a new PM template. Engineers and admins only.

    Request body:
        {
            "name": "Pump 250-Hour Service",
            "name_ar": "صيانة المضخة 250 ساعة",
            "description": "Standard 250-hour service for centrifugal pumps",
            "equipment_type": "PUMP",
            "cycle_id": 1,
            "estimated_hours": 4,
            "checklist_items": [
                {
                    "item_code": "P001",
                    "question_text": "Check oil level",
                    "question_text_ar": "فحص مستوى الزيت",
                    "answer_type": "pass_fail",
                    "category": "mechanical",
                    "is_required": true,
                    "action": "Top up if below minimum"
                }
            ],
            "materials": [
                {"material_id": 1, "quantity": 2},
                {"material_id": 3, "quantity": 5}
            ]
        }
    """
    user = engineer_or_admin_required()
    data = request.get_json()

    if not data:
        raise ValidationError("Request body is required")

    # Validate required fields
    required = ['name', 'equipment_type', 'cycle_id']
    missing = [f for f in required if not data.get(f)]
    if missing:
        raise ValidationError(f"Missing required fields: {', '.join(missing)}")

    # Validate cycle exists
    cycle = db.session.get(MaintenanceCycle, data['cycle_id'])
    if not cycle:
        raise NotFoundError("Maintenance cycle not found")

    # Check for duplicate equipment_type + cycle combination
    existing = PMTemplate.query.filter_by(
        equipment_type=data['equipment_type'],
        cycle_id=data['cycle_id']
    ).first()
    if existing:
        raise ValidationError(
            f"A template for {data['equipment_type']} with cycle {cycle.name} already exists"
        )

    # Create template
    template = PMTemplate(
        name=data['name'],
        name_ar=data.get('name_ar'),
        description=data.get('description'),
        description_ar=data.get('description_ar'),
        equipment_type=data['equipment_type'],
        cycle_id=data['cycle_id'],
        estimated_hours=data.get('estimated_hours', 4.0),
        created_by_id=user.id
    )

    db.session.add(template)
    db.session.flush()  # Get template ID

    # Add checklist items
    for idx, item_data in enumerate(data.get('checklist_items', [])):
        if not item_data.get('question_text'):
            continue

        item = PMTemplateChecklistItem(
            template_id=template.id,
            item_code=item_data.get('item_code'),
            question_text=item_data['question_text'],
            question_text_ar=item_data.get('question_text_ar'),
            answer_type=item_data.get('answer_type', 'pass_fail'),
            category=item_data.get('category'),
            is_required=item_data.get('is_required', True),
            order_index=item_data.get('order_index', idx),
            action=item_data.get('action'),
            action_ar=item_data.get('action_ar')
        )
        db.session.add(item)

    # Add materials
    for mat_data in data.get('materials', []):
        material_id = mat_data.get('material_id')
        if not material_id:
            continue

        material = db.session.get(Material, material_id)
        if not material:
            raise ValidationError(f"Material {material_id} not found")

        pm_material = PMTemplateMaterial(
            template_id=template.id,
            material_id=material_id,
            quantity=mat_data.get('quantity', 1)
        )
        db.session.add(pm_material)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'PM template created',
        'template': template.to_dict(user.language or 'en', include_items=True)
    }), 201


@bp.route('/<int:template_id>', methods=['PUT'])
@jwt_required()
def update_template(template_id):
    """Update a PM template. Engineers and admins only."""
    user = engineer_or_admin_required()

    template = db.session.get(PMTemplate, template_id)
    if not template:
        raise NotFoundError("PM template not found")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    # Update basic fields
    if 'name' in data:
        template.name = data['name']
    if 'name_ar' in data:
        template.name_ar = data['name_ar']
    if 'description' in data:
        template.description = data['description']
    if 'description_ar' in data:
        template.description_ar = data['description_ar']
    if 'estimated_hours' in data:
        template.estimated_hours = data['estimated_hours']
    if 'is_active' in data:
        template.is_active = data['is_active']

    # Update equipment_type and cycle if provided
    if 'equipment_type' in data or 'cycle_id' in data:
        new_equipment_type = data.get('equipment_type', template.equipment_type)
        new_cycle_id = data.get('cycle_id', template.cycle_id)

        # Check for duplicate
        existing = PMTemplate.query.filter(
            PMTemplate.equipment_type == new_equipment_type,
            PMTemplate.cycle_id == new_cycle_id,
            PMTemplate.id != template_id
        ).first()
        if existing:
            raise ValidationError(
                f"A template for {new_equipment_type} with that cycle already exists"
            )

        template.equipment_type = new_equipment_type
        template.cycle_id = new_cycle_id

    # Update checklist items if provided
    if 'checklist_items' in data:
        # Remove existing items
        PMTemplateChecklistItem.query.filter_by(template_id=template.id).delete()

        # Add new items
        for idx, item_data in enumerate(data['checklist_items']):
            if not item_data.get('question_text'):
                continue

            item = PMTemplateChecklistItem(
                template_id=template.id,
                item_code=item_data.get('item_code'),
                question_text=item_data['question_text'],
                question_text_ar=item_data.get('question_text_ar'),
                answer_type=item_data.get('answer_type', 'pass_fail'),
                category=item_data.get('category'),
                is_required=item_data.get('is_required', True),
                order_index=item_data.get('order_index', idx),
                action=item_data.get('action'),
                action_ar=item_data.get('action_ar')
            )
            db.session.add(item)

    # Update materials if provided
    if 'materials' in data:
        # Remove existing materials
        PMTemplateMaterial.query.filter_by(template_id=template.id).delete()

        # Add new materials
        for mat_data in data['materials']:
            material_id = mat_data.get('material_id')
            if not material_id:
                continue

            material = db.session.get(Material, material_id)
            if not material:
                raise ValidationError(f"Material {material_id} not found")

            pm_material = PMTemplateMaterial(
                template_id=template.id,
                material_id=material_id,
                quantity=mat_data.get('quantity', 1)
            )
            db.session.add(pm_material)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'PM template updated',
        'template': template.to_dict(user.language or 'en', include_items=True)
    }), 200


@bp.route('/<int:template_id>', methods=['DELETE'])
@jwt_required()
def delete_template(template_id):
    """Delete a PM template. Engineers and admins only."""
    user = engineer_or_admin_required()

    template = db.session.get(PMTemplate, template_id)
    if not template:
        raise NotFoundError("PM template not found")

    # Check if template is in use by any work plan jobs
    from app.models import WorkPlanJob
    jobs_using = WorkPlanJob.query.filter_by(pm_template_id=template_id).count()
    if jobs_using > 0:
        raise ValidationError(f"Cannot delete template: {jobs_using} work plan job(s) are using it")

    db.session.delete(template)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'PM template deleted'
    }), 200


@bp.route('/<int:template_id>/clone', methods=['POST'])
@jwt_required()
def clone_template(template_id):
    """
    Clone a PM template with a different cycle. Engineers and admins only.

    Request body:
        {
            "cycle_id": 2,
            "name": "Pump 500-Hour Service",
            "name_ar": "صيانة المضخة 500 ساعة"
        }
    """
    user = engineer_or_admin_required()

    template = db.session.get(PMTemplate, template_id)
    if not template:
        raise NotFoundError("PM template not found")

    data = request.get_json()
    if not data or not data.get('cycle_id'):
        raise ValidationError("cycle_id is required")

    new_cycle_id = data['cycle_id']

    # Validate new cycle
    new_cycle = db.session.get(MaintenanceCycle, new_cycle_id)
    if not new_cycle:
        raise NotFoundError("Target cycle not found")

    # Check for duplicate
    existing = PMTemplate.query.filter_by(
        equipment_type=template.equipment_type,
        cycle_id=new_cycle_id
    ).first()
    if existing:
        raise ValidationError(
            f"A template for {template.equipment_type} with cycle {new_cycle.name} already exists"
        )

    # Clone template
    new_template = PMTemplate(
        name=data.get('name', f"{template.name} ({new_cycle.display_label})"),
        name_ar=data.get('name_ar', template.name_ar),
        description=template.description,
        description_ar=template.description_ar,
        equipment_type=template.equipment_type,
        cycle_id=new_cycle_id,
        estimated_hours=template.estimated_hours,
        created_by_id=user.id
    )

    db.session.add(new_template)
    db.session.flush()

    # Clone checklist items
    for item in template.checklist_items:
        new_item = PMTemplateChecklistItem(
            template_id=new_template.id,
            item_code=item.item_code,
            question_text=item.question_text,
            question_text_ar=item.question_text_ar,
            answer_type=item.answer_type,
            category=item.category,
            is_required=item.is_required,
            order_index=item.order_index,
            action=item.action,
            action_ar=item.action_ar
        )
        db.session.add(new_item)

    # Clone materials
    for mat in template.materials:
        new_mat = PMTemplateMaterial(
            template_id=new_template.id,
            material_id=mat.material_id,
            quantity=mat.quantity
        )
        db.session.add(new_mat)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'PM template cloned',
        'template': new_template.to_dict(user.language or 'en', include_items=True)
    }), 201


@bp.route('/find', methods=['GET'])
@jwt_required()
def find_template():
    """
    Find a template by equipment type and cycle.

    Query params:
        - equipment_type: Equipment type (required)
        - cycle_id: Cycle ID (required)
    """
    user = get_current_user()
    language = user.language or 'en'

    equipment_type = request.args.get('equipment_type')
    cycle_id = request.args.get('cycle_id', type=int)

    if not equipment_type or not cycle_id:
        raise ValidationError("equipment_type and cycle_id are required")

    template = PMTemplate.find_for_job(equipment_type, cycle_id)

    if not template:
        return jsonify({
            'status': 'success',
            'template': None,
            'message': 'No matching template found'
        }), 200

    return jsonify({
        'status': 'success',
        'template': template.to_dict(language, include_items=True)
    }), 200


@bp.route('/<int:template_id>/history', methods=['GET'])
@jwt_required()
def get_template_history(template_id):
    """
    Get version history for a PM template.
    Returns a list of changes made to the template over time.
    """
    template = db.session.get(PMTemplate, template_id)
    if not template:
        raise NotFoundError("PM template not found")

    user = get_current_user()
    language = user.language or 'en'

    # In a production system, you would track versions in a separate table
    # For now, we return mock version history based on template metadata
    history = []

    # Current version
    history.append({
        'version': '1.0',
        'date': template.created_at.isoformat() if hasattr(template, 'created_at') else None,
        'author': template.created_by.full_name if template.created_by else 'System',
        'changes': 'Initial version',
        'checklist_count': len(template.checklist_items),
        'materials_count': len(template.materials)
    })

    # If template was updated, add update history
    if hasattr(template, 'updated_at') and template.updated_at and template.updated_at != template.created_at:
        history.insert(0, {
            'version': '1.1',
            'date': template.updated_at.isoformat() if template.updated_at else None,
            'author': template.created_by.full_name if template.created_by else 'Admin',
            'changes': 'Template updated',
            'checklist_count': len(template.checklist_items),
            'materials_count': len(template.materials)
        })

    return jsonify({
        'status': 'success',
        'template_id': template_id,
        'template_name': template.get_name(language),
        'history': history
    }), 200


@bp.route('/<int:template_id>/analytics', methods=['GET'])
@jwt_required()
def get_template_analytics(template_id):
    """
    Get usage analytics for a PM template.
    Returns statistics about how the template is being used in work plans.
    """
    from app.models import WorkPlanJob

    template = db.session.get(PMTemplate, template_id)
    if not template:
        raise NotFoundError("PM template not found")

    user = get_current_user()
    language = user.language or 'en'

    # Get jobs using this template
    jobs = WorkPlanJob.query.filter_by(pm_template_id=template_id).all()

    # Calculate statistics
    total_uses = len(jobs)
    completed_jobs = [j for j in jobs if j.status == 'completed']
    completion_rate = (len(completed_jobs) / total_uses * 100) if total_uses > 0 else 0

    # Calculate average completion time (if we have actual hours data)
    avg_completion_time = template.estimated_hours  # Default to estimate

    return jsonify({
        'status': 'success',
        'template_id': template_id,
        'template_name': template.get_name(language),
        'analytics': {
            'total_uses': total_uses,
            'completed_jobs': len(completed_jobs),
            'completion_rate': round(completion_rate, 1),
            'avg_completion_time': avg_completion_time,
            'estimated_hours': template.estimated_hours,
            'checklist_items_count': len(template.checklist_items),
            'materials_count': len(template.materials),
            'is_active': template.is_active
        }
    }), 200


@bp.route('/template', methods=['GET'])
def download_pm_template():
    """
    Download Excel template for PM template import.
    No authentication required - template only contains sample format.
    """
    from flask import Response
    from io import BytesIO
    import pandas as pd

    # Create sample data
    sample_data = {
        'name': ['Pump 250h Service', 'Crane Monthly Check', 'Generator 500h Service'],
        'name_ar': ['صيانة المضخة 250 ساعة', 'فحص الرافعة الشهري', 'صيانة المولد 500 ساعة'],
        'equipment_type': ['PUMP', 'CRANE', 'GENERATOR'],
        'cycle_name': ['250h', 'monthly', '500h'],
        'estimated_hours': [4, 2, 6],
        'description': ['Standard 250-hour pump service', 'Monthly crane inspection', '500-hour generator maintenance'],
    }

    df = pd.DataFrame(sample_data)

    # Checklist items sample
    checklist_data = {
        'template_name': ['Pump 250h Service', 'Pump 250h Service', 'Pump 250h Service', 'Crane Monthly Check', 'Crane Monthly Check'],
        'item_code': ['P001', 'P002', 'P003', 'C001', 'C002'],
        'question_text': ['Check oil level', 'Inspect seals for leaks', 'Test pressure gauge', 'Inspect wire ropes', 'Check limit switches'],
        'question_text_ar': ['فحص مستوى الزيت', 'فحص الموانع للتسرب', 'اختبار مقياس الضغط', 'فحص الحبال السلكية', 'فحص مفاتيح الحد'],
        'answer_type': ['pass_fail', 'pass_fail', 'numeric', 'pass_fail', 'pass_fail'],
        'category': ['mechanical', 'mechanical', 'instrumentation', 'mechanical', 'electrical'],
        'is_required': [True, True, True, True, True],
        'action': ['Top up if low', 'Replace if damaged', 'Record value', 'Replace if worn', 'Adjust if needed'],
    }

    checklist_df = pd.DataFrame(checklist_data)

    # Materials sample
    materials_data = {
        'template_name': ['Pump 250h Service', 'Pump 250h Service', 'Generator 500h Service'],
        'material_code': ['FLT-001', 'OIL-002', 'FLT-003'],
        'quantity': [1, 5, 2],
    }

    materials_df = pd.DataFrame(materials_data)

    # Create Excel file in memory
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Templates', index=False)
        checklist_df.to_excel(writer, sheet_name='Checklist Items', index=False)
        materials_df.to_excel(writer, sheet_name='Materials', index=False)

        # Add instructions sheet
        instructions = pd.DataFrame({
            'Sheet': ['Templates', 'Templates', 'Templates', 'Templates', 'Templates', 'Templates',
                      'Checklist Items', 'Checklist Items', 'Checklist Items', 'Checklist Items',
                      'Checklist Items', 'Checklist Items', 'Checklist Items', 'Checklist Items',
                      'Materials', 'Materials', 'Materials'],
            'Column': ['name', 'name_ar', 'equipment_type', 'cycle_name', 'estimated_hours', 'description',
                       'template_name', 'item_code', 'question_text', 'question_text_ar',
                       'answer_type', 'category', 'is_required', 'action',
                       'template_name', 'material_code', 'quantity'],
            'Required': ['Yes', 'No', 'Yes', 'Yes', 'No', 'No',
                         'Yes', 'No', 'Yes', 'No',
                         'No', 'No', 'No', 'No',
                         'Yes', 'Yes', 'No'],
            'Description': [
                'Template name (unique)',
                'Arabic name',
                'Equipment type code (e.g., PUMP, CRANE, GENERATOR)',
                'Cycle name matching existing cycle (e.g., 250h, 500h, monthly)',
                'Estimated hours for the job (default: 4)',
                'Template description',
                'Name of template this item belongs to (must match Templates sheet)',
                'Unique item code within template',
                'Question/check text',
                'Arabic question text',
                'pass_fail, yes_no, numeric, or text (default: pass_fail)',
                'mechanical, electrical, instrumentation, safety',
                'TRUE or FALSE (default: TRUE)',
                'Action to take if check fails',
                'Name of template (must match Templates sheet)',
                'Material code (must exist in materials)',
                'Quantity required (default: 1)'
            ]
        })
        instructions.to_excel(writer, sheet_name='Instructions', index=False)

    output.seek(0)

    return Response(
        output.getvalue(),
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={
            'Content-Disposition': 'attachment; filename=pm_templates_import.xlsx'
        }
    )
