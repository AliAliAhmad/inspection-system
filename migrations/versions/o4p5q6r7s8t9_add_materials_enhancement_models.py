"""Add materials enhancement models for inventory management

Revision ID: o4p5q6r7s8t9
Revises: n3o4p5q6r7s8
Create Date: 2026-02-09 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'o4p5q6r7s8t9'
down_revision = 'n3o4p5q6r7s8'
branch_labels = None
depends_on = None


def upgrade():
    # =============================================
    # 1. Create storage_locations table FIRST (materials references it)
    # =============================================
    op.create_table('storage_locations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('name_ar', sa.String(length=100), nullable=True),
        sa.Column('warehouse', sa.String(length=50), nullable=True),
        sa.Column('zone', sa.String(length=50), nullable=True),
        sa.Column('aisle', sa.String(length=20), nullable=True),
        sa.Column('shelf', sa.String(length=20), nullable=True),
        sa.Column('bin', sa.String(length=20), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
        sa.Column('max_capacity', sa.Float(), nullable=True),
        sa.Column('current_usage', sa.Float(), nullable=True, default=0),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code', name='uq_storage_locations_code')
    )
    op.create_index('ix_storage_locations_code', 'storage_locations', ['code'])

    # =============================================
    # 2. Create vendors table (materials references it)
    # =============================================
    op.create_table('vendors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('name_ar', sa.String(length=200), nullable=True),
        sa.Column('contact_person', sa.String(length=100), nullable=True),
        sa.Column('email', sa.String(length=100), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('payment_terms', sa.String(length=100), nullable=True),
        sa.Column('lead_time_days', sa.Integer(), nullable=True),
        sa.Column('rating', sa.Float(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code', name='uq_vendors_code')
    )
    op.create_index('ix_vendors_code', 'vendors', ['code'])

    # =============================================
    # 3. Add new columns to materials table
    # =============================================
    with op.batch_alter_table('materials', schema=None) as batch_op:
        # Barcode/QR tracking
        batch_op.add_column(sa.Column('barcode', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('qr_code', sa.String(length=100), nullable=True))

        # Location and vendor defaults
        batch_op.add_column(sa.Column('default_location_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('preferred_vendor_id', sa.Integer(), nullable=True))

        # Reorder settings
        batch_op.add_column(sa.Column('reorder_point', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('reorder_quantity', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('safety_stock', sa.Float(), nullable=True))

        # Tracking dates
        batch_op.add_column(sa.Column('last_count_date', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('last_restock_date', sa.Date(), nullable=True))

        # Usage analytics
        batch_op.add_column(sa.Column('avg_monthly_usage', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('avg_lead_time_days', sa.Integer(), nullable=True))

        # Pricing
        batch_op.add_column(sa.Column('cost_per_unit', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('currency', sa.String(length=10), nullable=True, server_default='USD'))

        # Image
        batch_op.add_column(sa.Column('image_url', sa.String(length=500), nullable=True))

        # Indexes
        batch_op.create_index('ix_materials_barcode', ['barcode'])
        batch_op.create_index('ix_materials_qr_code', ['qr_code'])

        # Foreign keys
        batch_op.create_foreign_key('fk_materials_default_location', 'storage_locations', ['default_location_id'], ['id'])
        batch_op.create_foreign_key('fk_materials_preferred_vendor', 'vendors', ['preferred_vendor_id'], ['id'])

    # =============================================
    # 4. Create material_batches table
    # =============================================
    op.create_table('material_batches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('material_id', sa.Integer(), nullable=False),
        sa.Column('batch_number', sa.String(length=100), nullable=False),
        sa.Column('lot_number', sa.String(length=100), nullable=True),
        sa.Column('quantity', sa.Float(), nullable=True, default=0),
        sa.Column('received_date', sa.Date(), nullable=True),
        sa.Column('expiry_date', sa.Date(), nullable=True),
        sa.Column('manufacture_date', sa.Date(), nullable=True),
        sa.Column('vendor_id', sa.Integer(), nullable=True),
        sa.Column('purchase_price', sa.Float(), nullable=True),
        sa.Column('location_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True, default='available'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['material_id'], ['materials.id'], name='fk_material_batches_material'),
        sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id'], name='fk_material_batches_vendor'),
        sa.ForeignKeyConstraint(['location_id'], ['storage_locations.id'], name='fk_material_batches_location'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_material_batches_material_id', 'material_batches', ['material_id'])
    op.create_index('ix_material_batches_batch_number', 'material_batches', ['batch_number'])
    op.create_index('ix_material_batches_expiry_date', 'material_batches', ['expiry_date'])
    op.create_index('ix_material_batches_vendor_id', 'material_batches', ['vendor_id'])
    op.create_index('ix_material_batches_location_id', 'material_batches', ['location_id'])
    op.create_index('ix_material_batches_status', 'material_batches', ['status'])

    # =============================================
    # 5. Create stock_history table
    # =============================================
    op.create_table('stock_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('material_id', sa.Integer(), nullable=False),
        sa.Column('change_type', sa.String(length=30), nullable=False),
        sa.Column('quantity_before', sa.Float(), nullable=False),
        sa.Column('quantity_change', sa.Float(), nullable=False),
        sa.Column('quantity_after', sa.Float(), nullable=False),
        sa.Column('reason', sa.String(length=200), nullable=True),
        sa.Column('reason_ar', sa.String(length=200), nullable=True),
        sa.Column('source_type', sa.String(length=50), nullable=True),
        sa.Column('source_id', sa.Integer(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('batch_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['material_id'], ['materials.id'], name='fk_stock_history_material'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_stock_history_user'),
        sa.ForeignKeyConstraint(['batch_id'], ['material_batches.id'], name='fk_stock_history_batch'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_stock_history_material_id', 'stock_history', ['material_id'])
    op.create_index('ix_stock_history_change_type', 'stock_history', ['change_type'])
    op.create_index('ix_stock_history_source_type', 'stock_history', ['source_type'])
    op.create_index('ix_stock_history_user_id', 'stock_history', ['user_id'])
    op.create_index('ix_stock_history_created_at', 'stock_history', ['created_at'])
    op.create_index('ix_stock_history_batch_id', 'stock_history', ['batch_id'])

    # =============================================
    # 6. Create material_vendors table
    # =============================================
    op.create_table('material_vendors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('material_id', sa.Integer(), nullable=False),
        sa.Column('vendor_id', sa.Integer(), nullable=False),
        sa.Column('vendor_part_number', sa.String(length=100), nullable=True),
        sa.Column('unit_price', sa.Float(), nullable=True),
        sa.Column('currency', sa.String(length=10), nullable=True, default='USD'),
        sa.Column('min_order_qty', sa.Float(), nullable=True),
        sa.Column('lead_time_days', sa.Integer(), nullable=True),
        sa.Column('is_preferred', sa.Boolean(), nullable=True, default=False),
        sa.Column('last_price_update', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['material_id'], ['materials.id'], name='fk_material_vendors_material'),
        sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id'], name='fk_material_vendors_vendor'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('material_id', 'vendor_id', name='uq_material_vendor')
    )
    op.create_index('ix_material_vendors_material_id', 'material_vendors', ['material_id'])
    op.create_index('ix_material_vendors_vendor_id', 'material_vendors', ['vendor_id'])
    op.create_index('ix_material_vendors_is_preferred', 'material_vendors', ['is_preferred'])

    # =============================================
    # 7. Create stock_reservations table
    # =============================================
    op.create_table('stock_reservations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('material_id', sa.Integer(), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('reservation_type', sa.String(length=50), nullable=True),
        sa.Column('job_id', sa.Integer(), nullable=True),
        sa.Column('work_plan_id', sa.Integer(), nullable=True),
        sa.Column('reserved_by_id', sa.Integer(), nullable=True),
        sa.Column('reserved_at', sa.DateTime(), nullable=True),
        sa.Column('needed_by_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True, default='active'),
        sa.Column('fulfilled_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['material_id'], ['materials.id'], name='fk_stock_reservations_material'),
        sa.ForeignKeyConstraint(['reserved_by_id'], ['users.id'], name='fk_stock_reservations_user'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_stock_reservations_material_id', 'stock_reservations', ['material_id'])
    op.create_index('ix_stock_reservations_reservation_type', 'stock_reservations', ['reservation_type'])
    op.create_index('ix_stock_reservations_job_id', 'stock_reservations', ['job_id'])
    op.create_index('ix_stock_reservations_work_plan_id', 'stock_reservations', ['work_plan_id'])
    op.create_index('ix_stock_reservations_reserved_by_id', 'stock_reservations', ['reserved_by_id'])
    op.create_index('ix_stock_reservations_needed_by_date', 'stock_reservations', ['needed_by_date'])
    op.create_index('ix_stock_reservations_status', 'stock_reservations', ['status'])

    # =============================================
    # 8. Create inventory_counts table
    # =============================================
    op.create_table('inventory_counts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('count_date', sa.Date(), nullable=False),
        sa.Column('count_type', sa.String(length=30), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True, default='draft'),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('approved_by_id', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name='fk_inventory_counts_created_by'),
        sa.ForeignKeyConstraint(['approved_by_id'], ['users.id'], name='fk_inventory_counts_approved_by'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_inventory_counts_count_date', 'inventory_counts', ['count_date'])
    op.create_index('ix_inventory_counts_count_type', 'inventory_counts', ['count_type'])
    op.create_index('ix_inventory_counts_status', 'inventory_counts', ['status'])
    op.create_index('ix_inventory_counts_created_by_id', 'inventory_counts', ['created_by_id'])

    # =============================================
    # 9. Create inventory_count_items table
    # =============================================
    op.create_table('inventory_count_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('count_id', sa.Integer(), nullable=False),
        sa.Column('material_id', sa.Integer(), nullable=False),
        sa.Column('system_quantity', sa.Float(), nullable=True),
        sa.Column('counted_quantity', sa.Float(), nullable=True),
        sa.Column('variance', sa.Float(), nullable=True),
        sa.Column('counted_by_id', sa.Integer(), nullable=True),
        sa.Column('counted_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['count_id'], ['inventory_counts.id'], name='fk_inventory_count_items_count'),
        sa.ForeignKeyConstraint(['material_id'], ['materials.id'], name='fk_inventory_count_items_material'),
        sa.ForeignKeyConstraint(['counted_by_id'], ['users.id'], name='fk_inventory_count_items_user'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_inventory_count_items_count_id', 'inventory_count_items', ['count_id'])
    op.create_index('ix_inventory_count_items_material_id', 'inventory_count_items', ['material_id'])

    # =============================================
    # 10. Create price_history table
    # =============================================
    op.create_table('price_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('material_id', sa.Integer(), nullable=False),
        sa.Column('vendor_id', sa.Integer(), nullable=True),
        sa.Column('old_price', sa.Float(), nullable=True),
        sa.Column('new_price', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(length=10), nullable=True, default='USD'),
        sa.Column('change_reason', sa.String(length=200), nullable=True),
        sa.Column('effective_date', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['material_id'], ['materials.id'], name='fk_price_history_material'),
        sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id'], name='fk_price_history_vendor'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_price_history_material_id', 'price_history', ['material_id'])
    op.create_index('ix_price_history_vendor_id', 'price_history', ['vendor_id'])
    op.create_index('ix_price_history_effective_date', 'price_history', ['effective_date'])
    op.create_index('ix_price_history_created_at', 'price_history', ['created_at'])


def downgrade():
    # Drop tables in reverse order (respecting foreign key dependencies)

    # 10. Drop price_history
    op.drop_index('ix_price_history_created_at', table_name='price_history')
    op.drop_index('ix_price_history_effective_date', table_name='price_history')
    op.drop_index('ix_price_history_vendor_id', table_name='price_history')
    op.drop_index('ix_price_history_material_id', table_name='price_history')
    op.drop_table('price_history')

    # 9. Drop inventory_count_items
    op.drop_index('ix_inventory_count_items_material_id', table_name='inventory_count_items')
    op.drop_index('ix_inventory_count_items_count_id', table_name='inventory_count_items')
    op.drop_table('inventory_count_items')

    # 8. Drop inventory_counts
    op.drop_index('ix_inventory_counts_created_by_id', table_name='inventory_counts')
    op.drop_index('ix_inventory_counts_status', table_name='inventory_counts')
    op.drop_index('ix_inventory_counts_count_type', table_name='inventory_counts')
    op.drop_index('ix_inventory_counts_count_date', table_name='inventory_counts')
    op.drop_table('inventory_counts')

    # 7. Drop stock_reservations
    op.drop_index('ix_stock_reservations_status', table_name='stock_reservations')
    op.drop_index('ix_stock_reservations_needed_by_date', table_name='stock_reservations')
    op.drop_index('ix_stock_reservations_reserved_by_id', table_name='stock_reservations')
    op.drop_index('ix_stock_reservations_work_plan_id', table_name='stock_reservations')
    op.drop_index('ix_stock_reservations_job_id', table_name='stock_reservations')
    op.drop_index('ix_stock_reservations_reservation_type', table_name='stock_reservations')
    op.drop_index('ix_stock_reservations_material_id', table_name='stock_reservations')
    op.drop_table('stock_reservations')

    # 6. Drop material_vendors
    op.drop_index('ix_material_vendors_is_preferred', table_name='material_vendors')
    op.drop_index('ix_material_vendors_vendor_id', table_name='material_vendors')
    op.drop_index('ix_material_vendors_material_id', table_name='material_vendors')
    op.drop_table('material_vendors')

    # 5. Drop stock_history
    op.drop_index('ix_stock_history_batch_id', table_name='stock_history')
    op.drop_index('ix_stock_history_created_at', table_name='stock_history')
    op.drop_index('ix_stock_history_user_id', table_name='stock_history')
    op.drop_index('ix_stock_history_source_type', table_name='stock_history')
    op.drop_index('ix_stock_history_change_type', table_name='stock_history')
    op.drop_index('ix_stock_history_material_id', table_name='stock_history')
    op.drop_table('stock_history')

    # 4. Drop material_batches
    op.drop_index('ix_material_batches_status', table_name='material_batches')
    op.drop_index('ix_material_batches_location_id', table_name='material_batches')
    op.drop_index('ix_material_batches_vendor_id', table_name='material_batches')
    op.drop_index('ix_material_batches_expiry_date', table_name='material_batches')
    op.drop_index('ix_material_batches_batch_number', table_name='material_batches')
    op.drop_index('ix_material_batches_material_id', table_name='material_batches')
    op.drop_table('material_batches')

    # 3. Remove new columns from materials table
    with op.batch_alter_table('materials', schema=None) as batch_op:
        batch_op.drop_constraint('fk_materials_preferred_vendor', type_='foreignkey')
        batch_op.drop_constraint('fk_materials_default_location', type_='foreignkey')
        batch_op.drop_index('ix_materials_qr_code')
        batch_op.drop_index('ix_materials_barcode')
        batch_op.drop_column('image_url')
        batch_op.drop_column('currency')
        batch_op.drop_column('cost_per_unit')
        batch_op.drop_column('avg_lead_time_days')
        batch_op.drop_column('avg_monthly_usage')
        batch_op.drop_column('last_restock_date')
        batch_op.drop_column('last_count_date')
        batch_op.drop_column('safety_stock')
        batch_op.drop_column('reorder_quantity')
        batch_op.drop_column('reorder_point')
        batch_op.drop_column('preferred_vendor_id')
        batch_op.drop_column('default_location_id')
        batch_op.drop_column('qr_code')
        batch_op.drop_column('barcode')

    # 2. Drop vendors
    op.drop_index('ix_vendors_code', table_name='vendors')
    op.drop_table('vendors')

    # 1. Drop storage_locations
    op.drop_index('ix_storage_locations_code', table_name='storage_locations')
    op.drop_table('storage_locations')
