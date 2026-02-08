"""
Materials management endpoints.
Handles stock materials, material kits, and consumption tracking.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models import Material, MaterialKit, MaterialKitItem, User
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from app.utils.decorators import get_current_user
from datetime import datetime

bp = Blueprint('materials', __name__)


def engineer_or_admin_required():
    """Check if user is engineer or admin."""
    user = get_current_user()
    if user.role not in ['admin', 'engineer', 'quality_engineer']:
        raise ForbiddenError("Only engineers and admins can access this resource")
    return user


# ==================== MATERIALS ====================

@bp.route('', methods=['GET'])
@jwt_required()
def list_materials():
    """
    List all materials with optional filtering.

    Query params:
        - category: Filter by category
        - low_stock: If true, only show low stock items
        - search: Search by code or name
        - active_only: If true, only show active items (default true)
    """
    category = request.args.get('category')
    low_stock = request.args.get('low_stock', 'false').lower() == 'true'
    search = request.args.get('search', '').strip()
    active_only = request.args.get('active_only', 'true').lower() == 'true'

    user = get_current_user()
    language = user.language or 'en'

    query = Material.query

    if active_only:
        query = query.filter(Material.is_active == True)

    if category:
        query = query.filter(Material.category == category)

    if search:
        search_term = f'%{search}%'
        query = query.filter(
            db.or_(
                Material.code.ilike(search_term),
                Material.name.ilike(search_term),
                Material.name_ar.ilike(search_term)
            )
        )

    materials = query.order_by(Material.name).all()

    # Filter low stock if requested
    if low_stock:
        materials = [m for m in materials if m.is_low_stock()]

    return jsonify({
        'status': 'success',
        'materials': [m.to_dict(language) for m in materials],
        'count': len(materials)
    }), 200


@bp.route('/<int:material_id>', methods=['GET'])
@jwt_required()
def get_material(material_id):
    """Get a single material by ID."""
    material = db.session.get(Material, material_id)
    if not material:
        raise NotFoundError("Material not found")

    user = get_current_user()
    language = user.language or 'en'

    return jsonify({
        'status': 'success',
        'material': material.to_dict(language)
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
def create_material():
    """
    Create a new material. Engineers and admins only.

    Request body:
        {
            "code": "MAT-001",
            "name": "Hydraulic Oil",
            "name_ar": "زيت هيدروليكي",
            "category": "lubricant",
            "unit": "liters",
            "current_stock": 100,
            "min_stock": 20
        }
    """
    user = engineer_or_admin_required()
    data = request.get_json()

    if not data:
        raise ValidationError("Request body is required")

    required = ['code', 'name', 'category', 'unit']
    missing = [f for f in required if not data.get(f)]
    if missing:
        raise ValidationError(f"Missing required fields: {', '.join(missing)}")

    # Check for duplicate code
    existing = Material.query.filter_by(code=data['code']).first()
    if existing:
        raise ValidationError(f"Material with code {data['code']} already exists")

    material = Material(
        code=data['code'],
        name=data['name'],
        name_ar=data.get('name_ar'),
        category=data['category'],
        unit=data['unit'],
        current_stock=data.get('current_stock', 0),
        min_stock=data.get('min_stock', 0),
        consumption_start_date=datetime.utcnow().date()
    )

    db.session.add(material)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Material created',
        'material': material.to_dict(user.language or 'en')
    }), 201


@bp.route('/<int:material_id>', methods=['PUT'])
@jwt_required()
def update_material(material_id):
    """Update a material. Engineers and admins only."""
    user = engineer_or_admin_required()

    material = db.session.get(Material, material_id)
    if not material:
        raise NotFoundError("Material not found")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    # Update fields
    if 'name' in data:
        material.name = data['name']
    if 'name_ar' in data:
        material.name_ar = data['name_ar']
    if 'category' in data:
        material.category = data['category']
    if 'unit' in data:
        material.unit = data['unit']
    if 'current_stock' in data:
        material.current_stock = data['current_stock']
    if 'min_stock' in data:
        material.min_stock = data['min_stock']
    if 'is_active' in data:
        material.is_active = data['is_active']

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Material updated',
        'material': material.to_dict(user.language or 'en')
    }), 200


@bp.route('/<int:material_id>/consume', methods=['POST'])
@jwt_required()
def consume_material(material_id):
    """
    Record material consumption.

    Request body:
        {
            "quantity": 5.0
        }
    """
    user = engineer_or_admin_required()

    material = db.session.get(Material, material_id)
    if not material:
        raise NotFoundError("Material not found")

    data = request.get_json()
    quantity = data.get('quantity', 0)

    if quantity <= 0:
        raise ValidationError("Quantity must be positive")

    if quantity > material.current_stock:
        raise ValidationError(f"Insufficient stock. Available: {material.current_stock}")

    material.current_stock -= quantity
    material.total_consumed += quantity

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Consumed {quantity} {material.unit}',
        'material': material.to_dict(user.language or 'en')
    }), 200


@bp.route('/stock-check', methods=['POST'])
@jwt_required()
def check_low_stock():
    """
    Check for low stock materials and return warnings.
    Engineers and admins only.
    """
    user = engineer_or_admin_required()
    language = user.language or 'en'

    # Get all active materials with low stock
    materials = Material.query.filter(Material.is_active == True).all()
    low_stock_items = [m for m in materials if m.is_low_stock()]

    # TODO: Send notifications to store/engineers

    return jsonify({
        'status': 'success',
        'low_stock_count': len(low_stock_items),
        'low_stock_materials': [m.to_dict(language) for m in low_stock_items]
    }), 200


# ==================== MATERIAL KITS ====================

@bp.route('/kits', methods=['GET'])
@jwt_required()
def list_kits():
    """List all material kits."""
    user = get_current_user()
    language = user.language or 'en'

    equipment_type = request.args.get('equipment_type')
    active_only = request.args.get('active_only', 'true').lower() == 'true'

    query = MaterialKit.query

    if active_only:
        query = query.filter(MaterialKit.is_active == True)

    if equipment_type:
        query = query.filter(
            db.or_(
                MaterialKit.equipment_type == equipment_type,
                MaterialKit.equipment_type.is_(None)
            )
        )

    kits = query.order_by(MaterialKit.name).all()

    return jsonify({
        'status': 'success',
        'kits': [k.to_dict(language) for k in kits],
        'count': len(kits)
    }), 200


@bp.route('/kits/<int:kit_id>', methods=['GET'])
@jwt_required()
def get_kit(kit_id):
    """Get a single kit by ID."""
    kit = db.session.get(MaterialKit, kit_id)
    if not kit:
        raise NotFoundError("Material kit not found")

    user = get_current_user()
    language = user.language or 'en'

    return jsonify({
        'status': 'success',
        'kit': kit.to_dict(language)
    }), 200


@bp.route('/kits', methods=['POST'])
@jwt_required()
def create_kit():
    """
    Create a new material kit. Engineers and admins only.

    Request body:
        {
            "name": "Crane 2000 PM Kit",
            "name_ar": "طقم صيانة رافعة 2000",
            "description": "Standard PM kit for Crane 2000",
            "equipment_type": "STS Crane",
            "items": [
                {"material_id": 1, "quantity": 2},
                {"material_id": 3, "quantity": 1}
            ]
        }
    """
    user = engineer_or_admin_required()
    data = request.get_json()

    if not data or not data.get('name'):
        raise ValidationError("Kit name is required")

    kit = MaterialKit(
        name=data['name'],
        name_ar=data.get('name_ar'),
        description=data.get('description'),
        equipment_type=data.get('equipment_type')
    )

    db.session.add(kit)
    db.session.flush()  # Get kit ID

    # Add items
    for item_data in data.get('items', []):
        material_id = item_data.get('material_id')
        quantity = item_data.get('quantity', 1)

        if not material_id:
            continue

        material = db.session.get(Material, material_id)
        if not material:
            raise ValidationError(f"Material {material_id} not found")

        item = MaterialKitItem(
            kit_id=kit.id,
            material_id=material_id,
            quantity=quantity
        )
        db.session.add(item)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Material kit created',
        'kit': kit.to_dict(user.language or 'en')
    }), 201


@bp.route('/kits/<int:kit_id>', methods=['PUT'])
@jwt_required()
def update_kit(kit_id):
    """Update a material kit. Engineers and admins only."""
    user = engineer_or_admin_required()

    kit = db.session.get(MaterialKit, kit_id)
    if not kit:
        raise NotFoundError("Material kit not found")

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    # Update fields
    if 'name' in data:
        kit.name = data['name']
    if 'name_ar' in data:
        kit.name_ar = data['name_ar']
    if 'description' in data:
        kit.description = data['description']
    if 'equipment_type' in data:
        kit.equipment_type = data['equipment_type']
    if 'is_active' in data:
        kit.is_active = data['is_active']

    # Update items if provided
    if 'items' in data:
        # Remove existing items
        MaterialKitItem.query.filter_by(kit_id=kit.id).delete()

        # Add new items
        for item_data in data['items']:
            material_id = item_data.get('material_id')
            quantity = item_data.get('quantity', 1)

            if not material_id:
                continue

            material = db.session.get(Material, material_id)
            if not material:
                raise ValidationError(f"Material {material_id} not found")

            item = MaterialKitItem(
                kit_id=kit.id,
                material_id=material_id,
                quantity=quantity
            )
            db.session.add(item)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Material kit updated',
        'kit': kit.to_dict(user.language or 'en')
    }), 200


@bp.route('/kits/<int:kit_id>', methods=['DELETE'])
@jwt_required()
def delete_kit(kit_id):
    """Delete a material kit. Engineers and admins only."""
    user = engineer_or_admin_required()

    kit = db.session.get(MaterialKit, kit_id)
    if not kit:
        raise NotFoundError("Material kit not found")

    db.session.delete(kit)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Material kit deleted'
    }), 200


@bp.route('/import', methods=['POST'])
@jwt_required()
def import_materials():
    """
    Import materials from Excel file. Engineers and admins only.

    Expected columns: code, name, name_ar, category, unit, current_stock, min_stock
    """
    import pandas as pd
    from io import BytesIO

    user = engineer_or_admin_required()

    if 'file' not in request.files:
        raise ValidationError("No file uploaded")

    file = request.files['file']
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise ValidationError("File must be Excel format (.xlsx or .xls)")

    try:
        df = pd.read_excel(BytesIO(file.read()))
    except Exception as e:
        raise ValidationError(f"Failed to read Excel file: {str(e)}")

    required_columns = ['code', 'name', 'category', 'unit']
    missing = [c for c in required_columns if c not in df.columns]
    if missing:
        raise ValidationError(f"Missing required columns: {', '.join(missing)}")

    created = 0
    updated = 0
    errors = []

    for idx, row in df.iterrows():
        try:
            code = str(row['code']).strip()
            if not code:
                continue

            # Check if exists
            material = Material.query.filter_by(code=code).first()

            if material:
                # Update existing
                material.name = str(row['name']).strip()
                material.name_ar = str(row.get('name_ar', '')).strip() or None
                material.category = str(row['category']).strip()
                material.unit = str(row['unit']).strip()
                if 'current_stock' in row and pd.notna(row['current_stock']):
                    material.current_stock = float(row['current_stock'])
                if 'min_stock' in row and pd.notna(row['min_stock']):
                    material.min_stock = float(row['min_stock'])
                updated += 1
            else:
                # Create new
                material = Material(
                    code=code,
                    name=str(row['name']).strip(),
                    name_ar=str(row.get('name_ar', '')).strip() or None,
                    category=str(row['category']).strip(),
                    unit=str(row['unit']).strip(),
                    current_stock=float(row.get('current_stock', 0)) if pd.notna(row.get('current_stock')) else 0,
                    min_stock=float(row.get('min_stock', 0)) if pd.notna(row.get('min_stock')) else 0,
                    consumption_start_date=datetime.utcnow().date()
                )
                db.session.add(material)
                created += 1

        except Exception as e:
            errors.append(f"Row {idx + 2}: {str(e)}")

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Import complete. Created: {created}, Updated: {updated}',
        'created': created,
        'updated': updated,
        'errors': errors
    }), 200
