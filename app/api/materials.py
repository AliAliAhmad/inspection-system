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
from datetime import datetime, date
from app.services.material_ai_service import MaterialAIService
from app.services.stock_alert_service import StockAlertService
from app.services.material_service import MaterialService

bp = Blueprint('materials', __name__)

material_ai = MaterialAIService()
stock_alerts = StockAlertService()


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


# ==================== STOCK OPERATIONS ====================

@bp.route('/<int:material_id>/consume', methods=['POST'])
@jwt_required()
def consume_material(material_id):
    """
    Consume material with full tracking.
    Body: { quantity, reason, job_id?, batch_id? }
    """
    user = get_current_user()
    data = request.get_json()
    result = MaterialService.consume(
        material_id=material_id,
        quantity=data['quantity'],
        user_id=user.id,
        reason=data.get('reason'),
        job_id=data.get('job_id'),
        batch_id=data.get('batch_id')
    )
    return jsonify({'status': 'success', 'data': result})


@bp.route('/<int:material_id>/restock', methods=['POST'])
@jwt_required()
def restock_material(material_id):
    """
    Restock material with batch creation.
    Body: { quantity, batch_info?, vendor_id?, unit_price? }
    """
    user = engineer_or_admin_required()
    data = request.get_json()
    result = MaterialService.restock(
        material_id=material_id,
        quantity=data['quantity'],
        user_id=user.id,
        batch_info=data.get('batch_info'),
        vendor_id=data.get('vendor_id')
    )
    return jsonify({'status': 'success', 'data': result})


@bp.route('/<int:material_id>/adjust', methods=['POST'])
@jwt_required()
def adjust_stock(material_id):
    """
    Manual stock adjustment with audit trail.
    Body: { new_quantity, reason }
    """
    user = engineer_or_admin_required()
    data = request.get_json()
    result = MaterialService.adjust(
        material_id=material_id,
        new_quantity=data['new_quantity'],
        user_id=user.id,
        reason=data['reason']
    )
    return jsonify({'status': 'success', 'data': result})


@bp.route('/<int:material_id>/transfer', methods=['POST'])
@jwt_required()
def transfer_stock(material_id):
    """
    Transfer between locations.
    Body: { from_location_id, to_location_id, quantity }
    """
    user = engineer_or_admin_required()
    data = request.get_json()
    result = MaterialService.transfer(
        material_id=material_id,
        from_location_id=data['from_location_id'],
        to_location_id=data['to_location_id'],
        quantity=data['quantity'],
        user_id=user.id
    )
    return jsonify({'status': 'success', 'data': result})


@bp.route('/<int:material_id>/reserve', methods=['POST'])
@jwt_required()
def reserve_stock(material_id):
    """
    Reserve stock for upcoming job.
    Body: { quantity, job_id?, work_plan_id?, needed_by_date? }
    """
    user = get_current_user()
    data = request.get_json()
    result = MaterialService.reserve(
        material_id=material_id,
        quantity=data['quantity'],
        user_id=user.id,
        job_id=data.get('job_id'),
        needed_by=data.get('needed_by_date')
    )
    return jsonify({'status': 'success', 'data': result})


@bp.route('/reservations/<int:reservation_id>/fulfill', methods=['POST'])
@jwt_required()
def fulfill_reservation(reservation_id):
    """Fulfill a reservation."""
    user = get_current_user()
    result = MaterialService.fulfill_reservation(reservation_id, user.id)
    return jsonify({'status': 'success', 'data': result})


@bp.route('/reservations/<int:reservation_id>/cancel', methods=['POST'])
@jwt_required()
def cancel_reservation(reservation_id):
    """Cancel a reservation."""
    user = get_current_user()
    data = request.get_json() or {}
    result = MaterialService.cancel_reservation(reservation_id, user.id, data.get('reason'))
    return jsonify({'status': 'success', 'data': result})


@bp.route('/<int:material_id>/summary', methods=['GET'])
@jwt_required()
def get_stock_summary(material_id):
    """Get comprehensive stock summary."""
    summary = MaterialService.get_stock_summary(material_id)
    return jsonify({'status': 'success', 'data': summary})


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


# ==================== HISTORY ====================

@bp.route('/<int:material_id>/history', methods=['GET'])
@jwt_required()
def get_stock_history(material_id):
    """Get stock change history."""
    from app.models import StockHistory
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    query = StockHistory.query.filter_by(material_id=material_id).order_by(StockHistory.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page)

    return jsonify({
        'status': 'success',
        'data': [h.to_dict() for h in pagination.items],
        'pagination': {'page': page, 'total': pagination.total}
    })


# ==================== BATCHES ====================

@bp.route('/<int:material_id>/batches', methods=['GET'])
@jwt_required()
def list_batches(material_id):
    """List batches for a material."""
    from app.models import MaterialBatch
    status = request.args.get('status')
    query = MaterialBatch.query.filter_by(material_id=material_id)
    if status:
        query = query.filter_by(status=status)
    batches = query.order_by(MaterialBatch.expiry_date.asc().nullslast()).all()
    return jsonify({'status': 'success', 'data': [b.to_dict() for b in batches]})


@bp.route('/batches/<int:batch_id>', methods=['GET'])
@jwt_required()
def get_batch(batch_id):
    """Get batch details."""
    from app.models import MaterialBatch
    batch = MaterialBatch.query.get_or_404(batch_id)
    return jsonify({'status': 'success', 'data': batch.to_dict()})


@bp.route('/batches/expiring', methods=['GET'])
@jwt_required()
def get_expiring_batches():
    """Get batches expiring soon."""
    days = request.args.get('days', 30, type=int)
    batches = stock_alerts.check_expiring_batches(days)
    return jsonify({'status': 'success', 'data': batches})


# ==================== LOCATIONS ====================

@bp.route('/locations', methods=['GET'])
@jwt_required()
def list_locations():
    """List storage locations."""
    from app.models import StorageLocation
    locations = StorageLocation.query.filter_by(is_active=True).all()
    return jsonify({'status': 'success', 'data': [l.to_dict() for l in locations]})


@bp.route('/locations', methods=['POST'])
@jwt_required()
def create_location():
    """Create storage location."""
    user = engineer_or_admin_required()
    data = request.get_json()
    from app.models import StorageLocation
    location = StorageLocation(
        code=data['code'],
        name=data['name'],
        name_ar=data.get('name_ar'),
        warehouse=data.get('warehouse'),
        zone=data.get('zone'),
        aisle=data.get('aisle'),
        shelf=data.get('shelf'),
        bin=data.get('bin')
    )
    db.session.add(location)
    db.session.commit()
    return jsonify({'status': 'success', 'data': location.to_dict()}), 201


@bp.route('/locations/<int:location_id>', methods=['PUT'])
@jwt_required()
def update_location(location_id):
    """Update storage location."""
    user = engineer_or_admin_required()
    from app.models import StorageLocation
    location = StorageLocation.query.get_or_404(location_id)
    data = request.get_json()
    for field in ['name', 'name_ar', 'warehouse', 'zone', 'aisle', 'shelf', 'bin', 'is_active']:
        if field in data:
            setattr(location, field, data[field])
    db.session.commit()
    return jsonify({'status': 'success', 'data': location.to_dict()})


# ==================== VENDORS ====================

@bp.route('/vendors', methods=['GET'])
@jwt_required()
def list_vendors():
    """List vendors."""
    from app.models import Vendor
    vendors = Vendor.query.filter_by(is_active=True).all()
    return jsonify({'status': 'success', 'data': [v.to_dict() for v in vendors]})


@bp.route('/vendors', methods=['POST'])
@jwt_required()
def create_vendor():
    """Create vendor."""
    user = engineer_or_admin_required()
    data = request.get_json()
    from app.models import Vendor
    vendor = Vendor(
        code=data['code'],
        name=data['name'],
        name_ar=data.get('name_ar'),
        contact_person=data.get('contact_person'),
        email=data.get('email'),
        phone=data.get('phone'),
        address=data.get('address'),
        payment_terms=data.get('payment_terms'),
        lead_time_days=data.get('lead_time_days')
    )
    db.session.add(vendor)
    db.session.commit()
    return jsonify({'status': 'success', 'data': vendor.to_dict()}), 201


@bp.route('/vendors/<int:vendor_id>', methods=['PUT'])
@jwt_required()
def update_vendor(vendor_id):
    """Update vendor."""
    user = engineer_or_admin_required()
    from app.models import Vendor
    vendor = Vendor.query.get_or_404(vendor_id)
    data = request.get_json()
    for field in ['name', 'name_ar', 'contact_person', 'email', 'phone', 'address', 'payment_terms', 'lead_time_days', 'is_active']:
        if field in data:
            setattr(vendor, field, data[field])
    db.session.commit()
    return jsonify({'status': 'success', 'data': vendor.to_dict()})


# ==================== ALERTS ====================

@bp.route('/alerts', methods=['GET'])
@jwt_required()
def get_alerts():
    """Get stock alert summary."""
    summary = stock_alerts.get_alert_summary()
    return jsonify({'status': 'success', 'data': summary})


@bp.route('/alerts/low-stock', methods=['GET'])
@jwt_required()
def get_low_stock_alerts():
    """Get low stock alerts."""
    alerts = stock_alerts.check_low_stock()
    return jsonify({'status': 'success', 'data': alerts})


@bp.route('/alerts/reorder', methods=['GET'])
@jwt_required()
def get_reorder_alerts():
    """Get reorder needed alerts."""
    alerts = stock_alerts.check_reorder_needed()
    return jsonify({'status': 'success', 'data': alerts})


# ==================== INVENTORY COUNT ====================

@bp.route('/counts', methods=['GET'])
@jwt_required()
def list_counts():
    """List inventory counts."""
    from app.models import InventoryCount
    counts = InventoryCount.query.order_by(InventoryCount.count_date.desc()).limit(20).all()
    return jsonify({'status': 'success', 'data': [c.to_dict() for c in counts]})


@bp.route('/counts', methods=['POST'])
@jwt_required()
def create_count():
    """Start a new inventory count."""
    user = engineer_or_admin_required()
    data = request.get_json()
    from app.models import InventoryCount
    count = InventoryCount(
        count_date=data.get('count_date', date.today()),
        count_type=data.get('count_type', 'full'),
        created_by_id=user.id
    )
    db.session.add(count)
    db.session.commit()
    return jsonify({'status': 'success', 'data': count.to_dict()}), 201


@bp.route('/counts/<int:count_id>/items', methods=['POST'])
@jwt_required()
def add_count_item(count_id):
    """Add/update count item."""
    user = get_current_user()
    data = request.get_json()
    from app.models import InventoryCount, InventoryCountItem, Material

    count = InventoryCount.query.get_or_404(count_id)
    material = Material.query.get_or_404(data['material_id'])

    item = InventoryCountItem.query.filter_by(
        count_id=count_id,
        material_id=data['material_id']
    ).first()

    if not item:
        item = InventoryCountItem(
            count_id=count_id,
            material_id=data['material_id'],
            system_quantity=material.current_stock
        )
        db.session.add(item)

    item.counted_quantity = data['counted_quantity']
    item.variance = item.counted_quantity - item.system_quantity
    item.counted_by_id = user.id
    item.counted_at = datetime.utcnow()
    item.notes = data.get('notes')

    db.session.commit()
    return jsonify({'status': 'success', 'data': item.to_dict()})


@bp.route('/counts/<int:count_id>/approve', methods=['POST'])
@jwt_required()
def approve_count(count_id):
    """Approve count and apply adjustments."""
    user = engineer_or_admin_required()
    from app.models import InventoryCount

    count = InventoryCount.query.get_or_404(count_id)
    count.status = 'approved'
    count.approved_by_id = user.id

    # Apply adjustments
    for item in count.items:
        if item.variance != 0:
            MaterialService.adjust(
                material_id=item.material_id,
                new_quantity=item.counted_quantity,
                user_id=user.id,
                reason=f'Inventory count adjustment (Count #{count_id})'
            )

    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Count approved and adjustments applied'})


# ==================== AI FEATURES ====================

@bp.route('/ai/reorder-prediction/<int:material_id>', methods=['GET'])
@jwt_required()
def predict_reorder(material_id):
    """Get AI reorder prediction."""
    prediction = material_ai.predict_reorder_date(material_id)
    return jsonify({'status': 'success', 'data': prediction})


@bp.route('/ai/demand-forecast/<int:material_id>', methods=['GET'])
@jwt_required()
def forecast_demand(material_id):
    """Get AI demand forecast."""
    days = request.args.get('days', 30, type=int)
    forecast = material_ai.forecast_demand(material_id, days)
    return jsonify({'status': 'success', 'data': forecast})


@bp.route('/ai/anomalies', methods=['GET'])
@jwt_required()
def get_consumption_anomalies():
    """Get consumption anomalies."""
    material_id = request.args.get('material_id', type=int)
    anomalies = material_ai.detect_consumption_anomalies(material_id)
    return jsonify({'status': 'success', 'data': anomalies})


@bp.route('/ai/optimal-reorder/<int:material_id>', methods=['GET'])
@jwt_required()
def get_optimal_reorder(material_id):
    """Get AI-calculated optimal reorder settings."""
    settings = material_ai.calculate_optimal_reorder_point(material_id)
    return jsonify({'status': 'success', 'data': settings})


@bp.route('/ai/cost-optimization', methods=['GET'])
@jwt_required()
def get_cost_optimization():
    """Get cost optimization suggestions."""
    suggestions = material_ai.suggest_cost_optimization()
    return jsonify({'status': 'success', 'data': suggestions})


@bp.route('/ai/insights', methods=['GET'])
@jwt_required()
def get_material_insights():
    """Get AI usage insights."""
    material_id = request.args.get('material_id', type=int)
    insights = material_ai.get_usage_insights(material_id)
    return jsonify({'status': 'success', 'data': insights})


@bp.route('/ai/search', methods=['POST'])
@jwt_required()
def natural_language_search():
    """Natural language material search."""
    data = request.get_json()
    result = material_ai.natural_language_search(data.get('query', ''))
    return jsonify({'status': 'success', 'data': result})


@bp.route('/ai/abc-analysis', methods=['GET'])
@jwt_required()
def get_abc_analysis():
    """Get ABC inventory analysis."""
    analysis = material_ai.get_abc_analysis()
    return jsonify({'status': 'success', 'data': analysis})


@bp.route('/ai/dead-stock', methods=['GET'])
@jwt_required()
def get_dead_stock():
    """Get dead stock report."""
    months = request.args.get('months', 6, type=int)
    dead_stock = material_ai.get_dead_stock(months)
    return jsonify({'status': 'success', 'data': dead_stock})


@bp.route('/ai/budget-forecast', methods=['GET'])
@jwt_required()
def get_budget_forecast():
    """Get budget forecast."""
    days = request.args.get('days', 30, type=int)
    forecast = material_ai.forecast_budget(days)
    return jsonify({'status': 'success', 'data': forecast})


# ==================== REPORTS ====================

@bp.route('/reports/consumption', methods=['GET'])
@jwt_required()
def get_consumption_report():
    """Get consumption report."""
    period = request.args.get('period', 'monthly')
    report = material_ai.generate_consumption_report(period)
    return jsonify({'status': 'success', 'data': report})


@bp.route('/reports/export', methods=['GET'])
@jwt_required()
def export_materials():
    """Export materials to Excel."""
    # Generate Excel export
    # Return file download
    pass


# ==================== ROUTE ALIASES (frontend compatibility) ====================

@bp.route('/analytics/abc', methods=['GET'])
@jwt_required()
def abc_analysis_alias():
    """Alias for /ai/abc-analysis - frontend uses /analytics/abc."""
    analysis = material_ai.get_abc_analysis()
    return jsonify({'status': 'success', 'data': analysis})


@bp.route('/analytics/dead-stock', methods=['GET'])
@jwt_required()
def dead_stock_alias():
    """Alias for /ai/dead-stock - frontend uses /analytics/dead-stock."""
    months = request.args.get('months', 6, type=int)
    dead_stock = material_ai.get_dead_stock(months)
    return jsonify({'status': 'success', 'data': dead_stock})


@bp.route('/analytics/budget-forecast', methods=['GET'])
@jwt_required()
def budget_forecast_alias():
    """Alias for /ai/budget-forecast - frontend uses /analytics/budget-forecast."""
    days = request.args.get('days', 30, type=int)
    forecast = material_ai.forecast_budget(days)
    return jsonify({'status': 'success', 'data': forecast})
