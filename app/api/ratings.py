"""
Rating management endpoints (Admin only).
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.rating_service import RatingService
from app.exceptions.api_exceptions import ValidationError
from app.utils.decorators import admin_required

bp = Blueprint('ratings', __name__)


@bp.route('/inspections/<int:inspection_id>', methods=['POST'])
@jwt_required()
@admin_required()
def rate_inspection(inspection_id):
    """
    Rate an inspection. Admin only.
    
    Request Body:
        {
            "rating": 5,
            "comment": "Excellent work!"
        }
    
    Returns:
        {
            "status": "success",
            "rating": {...}
        }
    """
    data = request.get_json()
    current_user_id = get_jwt_identity()
    
    if not data or 'rating' not in data:
        raise ValidationError("rating is required")
    
    rating = RatingService.rate_inspection(
        inspection_id=inspection_id,
        rating=data['rating'],
        comment=data.get('comment'),
        rated_by_id=current_user_id
    )

    # Auto-translate comment
    if data.get('comment'):
        from app.utils.bilingual import auto_translate_and_save
        auto_translate_and_save('inspection_rating', rating.id, {'comment': data['comment']})

    return jsonify({
        'status': 'success',
        'message': 'Inspection rated successfully',
        'rating': rating.to_dict()
    }), 201


@bp.route('/inspections/<int:inspection_id>', methods=['PUT'])
@jwt_required()
@admin_required()
def update_rating(inspection_id):
    """
    Update inspection rating. Admin only.
    
    Request Body:
        {
            "rating": 4,
            "comment": "Good work, but needs improvement on documentation"
        }
    
    Returns:
        {
            "status": "success",
            "rating": {...}
        }
    """
    data = request.get_json()
    current_user_id = get_jwt_identity()
    
    if not data or 'rating' not in data:
        raise ValidationError("rating is required")
    
    rating = RatingService.update_rating(
        inspection_id=inspection_id,
        rating=data['rating'],
        comment=data.get('comment'),
        rated_by_id=current_user_id
    )

    # Auto-translate comment
    if data.get('comment'):
        from app.utils.bilingual import auto_translate_and_save
        auto_translate_and_save('inspection_rating', rating.id, {'comment': data['comment']})

    return jsonify({
        'status': 'success',
        'message': 'Rating updated successfully',
        'rating': rating.to_dict()
    }), 200


@bp.route('/technicians/<int:technician_id>', methods=['GET'])
@jwt_required()
@admin_required()
def get_technician_ratings(technician_id):
    """
    Get all ratings for a technician. Admin only.
    
    Returns:
        {
            "status": "success",
            "technician_id": 2,
            "total_ratings": 10,
            "average_rating": 4.5,
            "ratings": [...]
        }
    """
    result = RatingService.get_technician_ratings(technician_id)
    
    return jsonify({
        'status': 'success',
        **result
    }), 200