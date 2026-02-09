"""
MaterialService - Core material operations with full tracking.
Handles consumption, restocking, adjustments, transfers, and reservations.
"""

from datetime import datetime, date
from app.extensions import db
from app.models import Material
from app.models.stock_history import StockHistory
from app.models.material_batch import MaterialBatch
from app.models.stock_reservation import StockReservation
from app.models.material_vendor import MaterialVendor
from app.models.storage_location import StorageLocation
from sqlalchemy import func
import logging

logger = logging.getLogger(__name__)


class MaterialService:
    """Core material operations with tracking"""

    @staticmethod
    def consume(material_id: int, quantity: float, user_id: int,
                reason: str = None, job_id: int = None,
                batch_id: int = None, source_type: str = 'manual') -> dict:
        """
        Consume material with full tracking and reservation check.

        Args:
            material_id: ID of material to consume
            quantity: Amount to consume (positive number)
            user_id: ID of user performing action
            reason: Reason for consumption
            job_id: Related job ID if applicable
            batch_id: Specific batch to consume from (optional)
            source_type: Type of source ('job', 'manual', etc.)

        Returns:
            dict with result details
        """
        if quantity <= 0:
            return {'success': False, 'error': 'Quantity must be positive'}

        material = db.session.get(Material, material_id)
        if not material:
            return {'success': False, 'error': 'Material not found'}

        # Check available stock (current - reserved for others)
        reserved = db.session.query(
            func.sum(StockReservation.quantity)
        ).filter(
            StockReservation.material_id == material_id,
            StockReservation.status == 'active'
        ).scalar() or 0

        # If consuming for a job that has a reservation, exclude that reservation
        if job_id:
            job_reserved = db.session.query(
                func.sum(StockReservation.quantity)
            ).filter(
                StockReservation.material_id == material_id,
                StockReservation.job_id == job_id,
                StockReservation.status == 'active'
            ).scalar() or 0
            reserved -= job_reserved

        available = material.current_stock - reserved

        if quantity > available:
            return {
                'success': False,
                'error': f'Insufficient stock. Available: {available} {material.unit}',
                'available': available,
                'requested': quantity
            }

        # Record previous quantity
        quantity_before = material.current_stock

        # Update material stock
        material.current_stock -= quantity
        material.total_consumed += quantity

        # Set consumption start date if not set
        if not material.consumption_start_date:
            material.consumption_start_date = date.today()

        # If consuming from specific batch, update batch
        if batch_id:
            batch = db.session.get(MaterialBatch, batch_id)
            if batch:
                if batch.quantity >= quantity:
                    batch.quantity -= quantity
                    if batch.quantity == 0:
                        batch.status = 'depleted'
                else:
                    return {
                        'success': False,
                        'error': f'Batch has insufficient quantity: {batch.quantity}'
                    }

        # Create stock history record
        history = StockHistory(
            material_id=material_id,
            change_type='consume',
            quantity_before=quantity_before,
            quantity_change=-quantity,
            quantity_after=material.current_stock,
            reason=reason,
            source_type=source_type,
            source_id=job_id,
            user_id=user_id,
            batch_id=batch_id
        )
        db.session.add(history)

        # Fulfill any matching reservation
        if job_id:
            reservation = StockReservation.query.filter_by(
                material_id=material_id,
                job_id=job_id,
                status='active'
            ).first()

            if reservation:
                reservation.status = 'fulfilled'
                reservation.fulfilled_at = datetime.utcnow()

        db.session.commit()

        logger.info(f"Consumed {quantity} of material {material_id} by user {user_id}")

        return {
            'success': True,
            'material_id': material_id,
            'quantity_consumed': quantity,
            'new_stock': material.current_stock,
            'history_id': history.id
        }

    @staticmethod
    def restock(material_id: int, quantity: float, user_id: int,
                batch_info: dict = None, vendor_id: int = None,
                source_type: str = 'manual', reason: str = None) -> dict:
        """
        Restock material with batch and history tracking.

        Args:
            material_id: ID of material to restock
            quantity: Amount to add (positive number)
            user_id: ID of user performing action
            batch_info: Optional batch details {batch_number, lot_number, expiry_date, purchase_price}
            vendor_id: Vendor ID if known
            source_type: Type of restock ('po', 'manual', 'return', etc.)
            reason: Reason for restocking

        Returns:
            dict with result details
        """
        if quantity <= 0:
            return {'success': False, 'error': 'Quantity must be positive'}

        material = db.session.get(Material, material_id)
        if not material:
            return {'success': False, 'error': 'Material not found'}

        quantity_before = material.current_stock

        # Update material stock
        material.current_stock += quantity

        # Create batch if batch_info provided
        batch = None
        if batch_info:
            batch = MaterialBatch(
                material_id=material_id,
                batch_number=batch_info.get('batch_number', f'BATCH-{datetime.utcnow().strftime("%Y%m%d%H%M%S")}'),
                lot_number=batch_info.get('lot_number'),
                quantity=quantity,
                received_date=date.today(),
                expiry_date=batch_info.get('expiry_date'),
                manufacture_date=batch_info.get('manufacture_date'),
                vendor_id=vendor_id,
                purchase_price=batch_info.get('purchase_price'),
                location_id=batch_info.get('location_id'),
                notes=batch_info.get('notes'),
                status='available'
            )
            db.session.add(batch)
            db.session.flush()  # Get batch ID

        # Create stock history record
        history = StockHistory(
            material_id=material_id,
            change_type='restock',
            quantity_before=quantity_before,
            quantity_change=quantity,
            quantity_after=material.current_stock,
            reason=reason,
            source_type=source_type,
            user_id=user_id,
            batch_id=batch.id if batch else None
        )
        db.session.add(history)

        db.session.commit()

        logger.info(f"Restocked {quantity} of material {material_id} by user {user_id}")

        return {
            'success': True,
            'material_id': material_id,
            'quantity_added': quantity,
            'new_stock': material.current_stock,
            'batch_id': batch.id if batch else None,
            'history_id': history.id
        }

    @staticmethod
    def adjust(material_id: int, new_quantity: float, user_id: int,
               reason: str) -> dict:
        """
        Manual adjustment with audit trail.
        Used for inventory counts and corrections.

        Args:
            material_id: ID of material to adjust
            new_quantity: New stock quantity to set
            user_id: ID of user performing action
            reason: Required reason for adjustment

        Returns:
            dict with result details
        """
        if new_quantity < 0:
            return {'success': False, 'error': 'Quantity cannot be negative'}

        if not reason:
            return {'success': False, 'error': 'Reason is required for adjustments'}

        material = db.session.get(Material, material_id)
        if not material:
            return {'success': False, 'error': 'Material not found'}

        quantity_before = material.current_stock
        quantity_change = new_quantity - quantity_before

        if quantity_change == 0:
            return {
                'success': True,
                'material_id': material_id,
                'message': 'No change in quantity'
            }

        # Update material stock
        material.current_stock = new_quantity

        # Create stock history record
        history = StockHistory(
            material_id=material_id,
            change_type='adjust',
            quantity_before=quantity_before,
            quantity_change=quantity_change,
            quantity_after=new_quantity,
            reason=reason,
            source_type='count',
            user_id=user_id
        )
        db.session.add(history)

        db.session.commit()

        logger.info(f"Adjusted material {material_id} from {quantity_before} to {new_quantity} by user {user_id}")

        return {
            'success': True,
            'material_id': material_id,
            'previous_quantity': quantity_before,
            'new_quantity': new_quantity,
            'change': quantity_change,
            'history_id': history.id
        }

    @staticmethod
    def transfer(material_id: int, from_location_id: int, to_location_id: int,
                 quantity: float, user_id: int, batch_id: int = None,
                 reason: str = None) -> dict:
        """
        Transfer between locations.

        Args:
            material_id: ID of material to transfer
            from_location_id: Source location ID
            to_location_id: Destination location ID
            quantity: Amount to transfer
            user_id: ID of user performing action
            batch_id: Optional specific batch to transfer
            reason: Reason for transfer

        Returns:
            dict with result details
        """
        if quantity <= 0:
            return {'success': False, 'error': 'Quantity must be positive'}

        if from_location_id == to_location_id:
            return {'success': False, 'error': 'Source and destination must be different'}

        material = db.session.get(Material, material_id)
        if not material:
            return {'success': False, 'error': 'Material not found'}

        from_location = db.session.get(StorageLocation, from_location_id)
        to_location = db.session.get(StorageLocation, to_location_id)

        if not from_location or not to_location:
            return {'success': False, 'error': 'Invalid location'}

        # If batch specified, check batch is at source location
        if batch_id:
            batch = db.session.get(MaterialBatch, batch_id)
            if not batch:
                return {'success': False, 'error': 'Batch not found'}
            if batch.location_id != from_location_id:
                return {'success': False, 'error': 'Batch is not at source location'}
            if batch.quantity < quantity:
                return {'success': False, 'error': f'Batch has insufficient quantity: {batch.quantity}'}

            # Update batch location and quantity
            if batch.quantity == quantity:
                batch.location_id = to_location_id
            else:
                # Split batch
                batch.quantity -= quantity
                new_batch = MaterialBatch(
                    material_id=material_id,
                    batch_number=f"{batch.batch_number}-T",
                    lot_number=batch.lot_number,
                    quantity=quantity,
                    received_date=batch.received_date,
                    expiry_date=batch.expiry_date,
                    vendor_id=batch.vendor_id,
                    purchase_price=batch.purchase_price,
                    location_id=to_location_id,
                    status='available'
                )
                db.session.add(new_batch)

        # Create transfer history record
        history = StockHistory(
            material_id=material_id,
            change_type='transfer',
            quantity_before=material.current_stock,
            quantity_change=0,  # No net change
            quantity_after=material.current_stock,
            reason=f"Transfer from {from_location.code} to {to_location.code}" + (f": {reason}" if reason else ""),
            source_type='transfer',
            user_id=user_id,
            batch_id=batch_id
        )
        db.session.add(history)

        db.session.commit()

        logger.info(f"Transferred {quantity} of material {material_id} from {from_location_id} to {to_location_id}")

        return {
            'success': True,
            'material_id': material_id,
            'quantity_transferred': quantity,
            'from_location': from_location.code,
            'to_location': to_location.code,
            'history_id': history.id
        }

    @staticmethod
    def reserve(material_id: int, quantity: float, user_id: int,
                job_id: int = None, work_plan_id: int = None,
                needed_by: date = None, notes: str = None) -> dict:
        """
        Reserve stock for upcoming job.

        Args:
            material_id: ID of material to reserve
            quantity: Amount to reserve
            user_id: ID of user making reservation
            job_id: Related job ID (optional)
            work_plan_id: Related work plan ID (optional)
            needed_by: Date when material is needed
            notes: Additional notes

        Returns:
            dict with reservation details
        """
        if quantity <= 0:
            return {'success': False, 'error': 'Quantity must be positive'}

        material = db.session.get(Material, material_id)
        if not material:
            return {'success': False, 'error': 'Material not found'}

        # Check available stock
        reserved = db.session.query(
            func.sum(StockReservation.quantity)
        ).filter(
            StockReservation.material_id == material_id,
            StockReservation.status == 'active'
        ).scalar() or 0

        available = material.current_stock - reserved

        if quantity > available:
            return {
                'success': False,
                'error': f'Insufficient stock to reserve. Available: {available}',
                'available': available,
                'requested': quantity
            }

        # Determine reservation type
        if job_id:
            reservation_type = 'job'
        elif work_plan_id:
            reservation_type = 'work_plan'
        else:
            reservation_type = 'manual'

        # Create reservation
        reservation = StockReservation(
            material_id=material_id,
            quantity=quantity,
            reservation_type=reservation_type,
            job_id=job_id,
            work_plan_id=work_plan_id,
            reserved_by_id=user_id,
            reserved_at=datetime.utcnow(),
            needed_by_date=needed_by,
            status='active',
            notes=notes
        )
        db.session.add(reservation)
        db.session.commit()

        logger.info(f"Reserved {quantity} of material {material_id} for {reservation_type}")

        return {
            'success': True,
            'reservation_id': reservation.id,
            'material_id': material_id,
            'quantity_reserved': quantity,
            'available_after_reservation': available - quantity
        }

    @staticmethod
    def fulfill_reservation(reservation_id: int, user_id: int) -> dict:
        """
        Fulfill a reservation (consume the reserved stock).

        Args:
            reservation_id: ID of reservation to fulfill
            user_id: ID of user fulfilling reservation

        Returns:
            dict with fulfillment details
        """
        reservation = db.session.get(StockReservation, reservation_id)
        if not reservation:
            return {'success': False, 'error': 'Reservation not found'}

        if reservation.status != 'active':
            return {'success': False, 'error': f'Reservation is {reservation.status}'}

        # Consume the material
        result = MaterialService.consume(
            material_id=reservation.material_id,
            quantity=reservation.quantity,
            user_id=user_id,
            reason=f'Fulfilling reservation #{reservation_id}',
            job_id=reservation.job_id,
            source_type='reservation'
        )

        if result['success']:
            reservation.status = 'fulfilled'
            reservation.fulfilled_at = datetime.utcnow()
            db.session.commit()

            logger.info(f"Fulfilled reservation {reservation_id}")

        return result

    @staticmethod
    def cancel_reservation(reservation_id: int, user_id: int,
                           reason: str = None) -> dict:
        """
        Cancel an active reservation.

        Args:
            reservation_id: ID of reservation to cancel
            user_id: ID of user cancelling
            reason: Reason for cancellation

        Returns:
            dict with cancellation details
        """
        reservation = db.session.get(StockReservation, reservation_id)
        if not reservation:
            return {'success': False, 'error': 'Reservation not found'}

        if reservation.status != 'active':
            return {'success': False, 'error': f'Reservation is already {reservation.status}'}

        reservation.status = 'cancelled'
        reservation.notes = (reservation.notes or '') + f'\nCancelled: {reason}' if reason else reservation.notes
        db.session.commit()

        logger.info(f"Cancelled reservation {reservation_id}")

        return {
            'success': True,
            'reservation_id': reservation_id,
            'quantity_released': reservation.quantity
        }

    @staticmethod
    def get_stock_summary(material_id: int) -> dict:
        """
        Get comprehensive stock summary.

        Args:
            material_id: ID of material

        Returns:
            dict with full stock details
        """
        material = db.session.get(Material, material_id)
        if not material:
            return {'error': 'Material not found'}

        # Get reserved quantity
        reserved = db.session.query(
            func.sum(StockReservation.quantity)
        ).filter(
            StockReservation.material_id == material_id,
            StockReservation.status == 'active'
        ).scalar() or 0

        # Get batch breakdown
        batches = MaterialBatch.query.filter_by(
            material_id=material_id,
            status='available'
        ).order_by(MaterialBatch.expiry_date).all()

        batch_summary = [{
            'batch_id': b.id,
            'batch_number': b.batch_number,
            'quantity': b.quantity,
            'expiry_date': b.expiry_date.isoformat() if b.expiry_date else None,
            'days_until_expiry': b.days_until_expiry,
            'location_id': b.location_id
        } for b in batches]

        # Get recent history
        recent_history = StockHistory.query.filter_by(
            material_id=material_id
        ).order_by(StockHistory.created_at.desc()).limit(10).all()

        # Get active reservations
        reservations = StockReservation.query.filter_by(
            material_id=material_id,
            status='active'
        ).all()

        reservation_summary = [{
            'reservation_id': r.id,
            'quantity': r.quantity,
            'type': r.reservation_type,
            'needed_by': r.needed_by_date.isoformat() if r.needed_by_date else None
        } for r in reservations]

        # Get vendor info
        vendors = MaterialVendor.query.filter_by(
            material_id=material_id
        ).all()

        vendor_summary = [{
            'vendor_id': v.vendor_id,
            'vendor_name': v.vendor.name if v.vendor else None,
            'unit_price': v.unit_price,
            'lead_time_days': v.lead_time_days,
            'is_preferred': v.is_preferred
        } for v in vendors]

        return {
            'material': material.to_dict(),
            'stock': {
                'current': material.current_stock,
                'reserved': reserved,
                'available': material.current_stock - reserved,
                'min_stock': material.min_stock,
                'is_low_stock': material.is_low_stock()
            },
            'consumption': {
                'total_consumed': material.total_consumed,
                'monthly_average': material.get_monthly_consumption(),
                'stock_months': material.get_stock_months() if material.get_stock_months() != float('inf') else None,
                'tracking_since': material.consumption_start_date.isoformat() if material.consumption_start_date else None
            },
            'batches': batch_summary,
            'reservations': reservation_summary,
            'vendors': vendor_summary,
            'recent_history': [h.to_dict() for h in recent_history]
        }

    @staticmethod
    def return_material(material_id: int, quantity: float, user_id: int,
                        reason: str, batch_id: int = None) -> dict:
        """
        Return material to stock (unused from job, etc).

        Args:
            material_id: ID of material to return
            quantity: Amount to return
            user_id: ID of user performing action
            reason: Reason for return
            batch_id: Original batch ID if known

        Returns:
            dict with return details
        """
        if quantity <= 0:
            return {'success': False, 'error': 'Quantity must be positive'}

        material = db.session.get(Material, material_id)
        if not material:
            return {'success': False, 'error': 'Material not found'}

        quantity_before = material.current_stock

        # Add back to stock
        material.current_stock += quantity

        # Reduce from total consumed if tracking
        if material.total_consumed >= quantity:
            material.total_consumed -= quantity

        # Update batch if specified
        if batch_id:
            batch = db.session.get(MaterialBatch, batch_id)
            if batch:
                batch.quantity += quantity
                if batch.status == 'depleted':
                    batch.status = 'available'

        # Create history record
        history = StockHistory(
            material_id=material_id,
            change_type='return',
            quantity_before=quantity_before,
            quantity_change=quantity,
            quantity_after=material.current_stock,
            reason=reason,
            source_type='return',
            user_id=user_id,
            batch_id=batch_id
        )
        db.session.add(history)
        db.session.commit()

        logger.info(f"Returned {quantity} of material {material_id} by user {user_id}")

        return {
            'success': True,
            'material_id': material_id,
            'quantity_returned': quantity,
            'new_stock': material.current_stock,
            'history_id': history.id
        }

    @staticmethod
    def scrap_material(material_id: int, quantity: float, user_id: int,
                       reason: str, batch_id: int = None) -> dict:
        """
        Mark material as scrapped/wasted.

        Args:
            material_id: ID of material to scrap
            quantity: Amount to scrap
            user_id: ID of user performing action
            reason: Reason for scrapping
            batch_id: Batch ID if scrapping from specific batch

        Returns:
            dict with scrap details
        """
        if quantity <= 0:
            return {'success': False, 'error': 'Quantity must be positive'}

        if not reason:
            return {'success': False, 'error': 'Reason is required for scrapping'}

        material = db.session.get(Material, material_id)
        if not material:
            return {'success': False, 'error': 'Material not found'}

        if quantity > material.current_stock:
            return {'success': False, 'error': 'Cannot scrap more than current stock'}

        quantity_before = material.current_stock

        # Remove from stock
        material.current_stock -= quantity

        # Update batch if specified
        if batch_id:
            batch = db.session.get(MaterialBatch, batch_id)
            if batch and batch.quantity >= quantity:
                batch.quantity -= quantity
                if batch.quantity == 0:
                    batch.status = 'depleted'

        # Create history record
        history = StockHistory(
            material_id=material_id,
            change_type='waste',
            quantity_before=quantity_before,
            quantity_change=-quantity,
            quantity_after=material.current_stock,
            reason=reason,
            source_type='scrap',
            user_id=user_id,
            batch_id=batch_id
        )
        db.session.add(history)
        db.session.commit()

        logger.info(f"Scrapped {quantity} of material {material_id}: {reason}")

        return {
            'success': True,
            'material_id': material_id,
            'quantity_scrapped': quantity,
            'new_stock': material.current_stock,
            'history_id': history.id
        }
