"""
Service for managing inspection ratings.
"""

from app.models import InspectionRating, Inspection, User, Notification
from app.extensions import db
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from datetime import datetime


class RatingService:
    """Service for managing inspection ratings."""
    
    @staticmethod
    def rate_inspection(inspection_id, rating, comment, rated_by_id):
        """
        Rate an inspection. Admin only.
        
        Args:
            inspection_id: ID of inspection to rate
            rating: Rating value (1-5)
            comment: Optional comment
            rated_by_id: ID of admin rating
        
        Returns:
            Created InspectionRating object
        
        Raises:
            NotFoundError: If inspection not found
            ValidationError: If rating invalid or inspection already rated
            ForbiddenError: If user not admin
        """
        # Validate admin
        admin = db.session.get(User, int(rated_by_id))
        if not admin or admin.role != 'admin':
            raise ForbiddenError("Only admins can rate inspections")
        
        # Validate inspection exists
        inspection = db.session.get(Inspection, inspection_id)
        if not inspection:
            raise NotFoundError(f"Inspection with ID {inspection_id} not found")
        
        # Only rate submitted or reviewed inspections
        if inspection.status not in ['submitted', 'reviewed']:
            raise ValidationError("Can only rate submitted or reviewed inspections")
        
        # Check if already rated
        existing_rating = InspectionRating.query.filter_by(inspection_id=inspection_id).first()
        if existing_rating:
            raise ValidationError("Inspection already rated")
        
        # Validate rating value
        if not isinstance(rating, int) or rating < 1 or rating > 5:
            raise ValidationError("Rating must be between 1 and 5")
        
        # Create rating
        inspection_rating = InspectionRating(
            inspection_id=inspection_id,
            rated_by_id=int(rated_by_id),
            rating=rating,
            comment=comment
        )
        
        db.session.add(inspection_rating)
        db.session.commit()
        
        # Create notification for technician
        from app.services.notification_service import NotificationService
        NotificationService.create_notification(
            user_id=inspection.technician_id,
            type='inspection_rated',
            title=f'Inspection Rated: {rating} Stars',
            message=f'Your inspection for {inspection.equipment.name} was rated {rating} stars!' + (f' Comment: {comment}' if comment else ''),
            related_type='inspection',
            related_id=inspection_id
        )
        
        return inspection_rating
    
    @staticmethod
    def update_rating(inspection_id, rating, comment, rated_by_id):
        """
        Update existing rating. Admin only.
        
        Args:
            inspection_id: ID of inspection
            rating: New rating value (1-5)
            comment: New comment
            rated_by_id: ID of admin
        
        Returns:
            Updated InspectionRating object
        """
        # Validate admin
        admin = db.session.get(User, int(rated_by_id))
        if not admin or admin.role != 'admin':
            raise ForbiddenError("Only admins can update ratings")
        
        # Get existing rating
        inspection_rating = InspectionRating.query.filter_by(inspection_id=inspection_id).first()
        if not inspection_rating:
            raise NotFoundError("Rating not found for this inspection")
        
        # Validate rating value
        if not isinstance(rating, int) or rating < 1 or rating > 5:
            raise ValidationError("Rating must be between 1 and 5")
        
        # Update rating
        inspection_rating.rating = rating
        inspection_rating.comment = comment
        inspection_rating.rated_at = datetime.utcnow()
        
        db.session.commit()
        return inspection_rating
    
    @staticmethod
    def get_technician_ratings(technician_id):
        """
        Get all ratings for a specific technician.
        
        Args:
            technician_id: ID of technician
        
        Returns:
            Dictionary with ratings and statistics
        """
        # Get all inspections for this technician
        inspections = Inspection.query.filter_by(technician_id=technician_id).all()
        inspection_ids = [insp.id for insp in inspections]
        
        # Get all ratings for these inspections
        ratings = InspectionRating.query.filter(
            InspectionRating.inspection_id.in_(inspection_ids)
        ).all()
        
        if not ratings:
            return {
                'technician_id': technician_id,
                'total_ratings': 0,
                'average_rating': 0,
                'ratings': []
            }
        
        # Calculate statistics
        total_ratings = len(ratings)
        average_rating = sum(r.rating for r in ratings) / total_ratings
        
        return {
            'technician_id': technician_id,
            'total_ratings': total_ratings,
            'average_rating': round(average_rating, 2),
            'ratings': [r.to_dict() for r in ratings]
        }