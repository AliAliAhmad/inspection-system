"""
Answer Templates API
CRUD operations for inspection answer templates
"""
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.answer_template import AnswerTemplate
from app.models.user import User

bp = Blueprint('answer_templates', __name__)


def get_current_user():
    user_id = get_jwt_identity()
    return db.session.get(User, user_id)


def get_language(user=None):
    lang = request.args.get('lang') or request.headers.get('Accept-Language', 'en')
    return 'ar' if 'ar' in lang else 'en'


@bp.route('', methods=['GET'])
@jwt_required()
def list_templates():
    """List answer templates for current user."""
    user = get_current_user()
    language = get_language(user)

    category = request.args.get('category')
    is_favorite = request.args.get('is_favorite')
    search = request.args.get('search')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    query = AnswerTemplate.query.filter(
        db.or_(
            AnswerTemplate.user_id == user.id,
            # Include shared templates from other users
        )
    )

    if category:
        query = query.filter_by(category=category)

    if is_favorite == 'true':
        query = query.filter_by(is_favorite=True)

    if search:
        query = query.filter(
            db.or_(
                AnswerTemplate.name.ilike(f'%{search}%'),
                AnswerTemplate.name_ar.ilike(f'%{search}%'),
            )
        )

    query = query.order_by(AnswerTemplate.usage_count.desc(), AnswerTemplate.updated_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'status': 'success',
        'data': [t.to_dict(language) for t in pagination.items],
        'pagination': {
            'page': pagination.page,
            'per_page': pagination.per_page,
            'total': pagination.total,
            'pages': pagination.pages,
        }
    })


@bp.route('', methods=['POST'])
@jwt_required()
def create_template():
    """Create a new answer template."""
    user = get_current_user()
    data = request.get_json()

    name = data.get('name')
    if not name:
        return jsonify({'status': 'error', 'message': 'name is required'}), 400

    template = AnswerTemplate(
        user_id=user.id,
        name=name,
        name_ar=data.get('name_ar'),
        category=data.get('category', 'general'),
        content=data.get('content', {}),
        is_favorite=data.get('is_favorite', False),
    )
    db.session.add(template)
    db.session.commit()

    language = get_language(user)
    return jsonify({'status': 'success', 'data': template.to_dict(language)}), 201


@bp.route('/<int:template_id>', methods=['GET'])
@jwt_required()
def get_template(template_id):
    """Get a specific answer template."""
    template = db.session.get(AnswerTemplate, template_id)
    if not template:
        return jsonify({'status': 'error', 'message': 'Template not found'}), 404

    user = get_current_user()
    language = get_language(user)
    return jsonify({'status': 'success', 'data': template.to_dict(language)})


@bp.route('/<int:template_id>', methods=['PUT'])
@jwt_required()
def update_template(template_id):
    """Update an answer template."""
    template = db.session.get(AnswerTemplate, template_id)
    if not template:
        return jsonify({'status': 'error', 'message': 'Template not found'}), 404

    user = get_current_user()
    if template.user_id != user.id:
        return jsonify({'status': 'error', 'message': 'Forbidden'}), 403

    data = request.get_json()

    if 'name' in data:
        template.name = data['name']
    if 'name_ar' in data:
        template.name_ar = data['name_ar']
    if 'category' in data:
        template.category = data['category']
    if 'content' in data:
        template.content = data['content']
    if 'is_favorite' in data:
        template.is_favorite = data['is_favorite']

    template.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    language = get_language(user)
    return jsonify({'status': 'success', 'data': template.to_dict(language)})


@bp.route('/<int:template_id>', methods=['DELETE'])
@jwt_required()
def delete_template(template_id):
    """Delete an answer template."""
    template = db.session.get(AnswerTemplate, template_id)
    if not template:
        return jsonify({'status': 'error', 'message': 'Template not found'}), 404

    user = get_current_user()
    if template.user_id != user.id:
        return jsonify({'status': 'error', 'message': 'Forbidden'}), 403

    db.session.delete(template)
    db.session.commit()

    return jsonify({'status': 'success', 'message': 'Template deleted'})


@bp.route('/<int:template_id>/increment-usage', methods=['POST'])
@jwt_required()
def increment_usage(template_id):
    """Increment template usage count."""
    template = db.session.get(AnswerTemplate, template_id)
    if not template:
        return jsonify({'status': 'error', 'message': 'Template not found'}), 404

    template.increment_usage()
    db.session.commit()

    return jsonify({'status': 'success', 'data': {'usage_count': template.usage_count}})
