"""
Translation API endpoints for bulk Arabic translation.
Uses gemma-3-4b-it (14,400 RPD).
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.utils.decorators import admin_required
from app.services.translation_service import TranslationService
import logging

logger = logging.getLogger(__name__)

bp = Blueprint('translations', __name__, url_prefix='/api/translations')


@bp.route('/bulk-translate-checklists', methods=['POST'])
@jwt_required()
@admin_required()
def bulk_translate_checklists():
    """
    Translate all checklist templates and items missing Arabic text.
    Uses gemma-3-4b-it (14,400 RPD).

    POST /api/translations/bulk-translate-checklists

    Returns: { status, templates_translated, items_translated, errors }
    """
    from app.models.checklist import ChecklistTemplate, ChecklistItem

    templates_translated = 0
    items_translated = 0
    errors = []

    try:
        # 1. Translate template names
        templates = ChecklistTemplate.query.filter(
            (ChecklistTemplate.name_ar.is_(None)) | (ChecklistTemplate.name_ar == '')
        ).all()

        for template in templates:
            try:
                if template.name:
                    template.name_ar = TranslationService.translate_to_arabic(template.name)
                    templates_translated += 1
            except Exception as e:
                errors.append(f"Template {template.id}: {str(e)}")
                logger.error(f"Error translating template {template.id}: {e}")

        # 2. Translate checklist items
        items = ChecklistItem.query.filter(
            (ChecklistItem.question_text_ar.is_(None)) | (ChecklistItem.question_text_ar == '')
        ).all()

        for item in items:
            try:
                # Translate question
                if item.question_text and not item.question_text_ar:
                    item.question_text_ar = TranslationService.translate_to_arabic(item.question_text)

                # Translate action
                if hasattr(item, 'action') and item.action and not getattr(item, 'action_ar', None):
                    item.action_ar = TranslationService.translate_to_arabic(item.action)

                # Translate expected result
                if hasattr(item, 'expected_result') and item.expected_result and not getattr(item, 'expected_result_ar', None):
                    item.expected_result_ar = TranslationService.translate_to_arabic(item.expected_result)

                # Translate action if fail
                if hasattr(item, 'action_if_fail') and item.action_if_fail and not getattr(item, 'action_if_fail_ar', None):
                    item.action_if_fail_ar = TranslationService.translate_to_arabic(item.action_if_fail)

                items_translated += 1
            except Exception as e:
                errors.append(f"Item {item.id}: {str(e)}")
                logger.error(f"Error translating item {item.id}: {e}")

        # Commit changes
        db.session.commit()

        return jsonify({
            'status': 'success',
            'message': f'Translated {templates_translated} templates and {items_translated} items',
            'templates_translated': templates_translated,
            'items_translated': items_translated,
            'errors': errors[:10] if errors else [],  # Return first 10 errors
            'total_errors': len(errors)
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Bulk translation failed: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@bp.route('/translate-text', methods=['POST'])
@jwt_required()
def translate_text():
    """
    Translate a single text to both English and Arabic.
    Uses gemma-3-4b-it.

    POST /api/translations/translate-text
    Body: { "text": "..." }

    Returns: { en: "...", ar: "..." }
    """
    data = request.get_json()
    text = data.get('text', '').strip()

    if not text:
        return jsonify({'status': 'error', 'message': 'No text provided'}), 400

    try:
        result = TranslationService.auto_translate(text)
        return jsonify({
            'status': 'success',
            'data': {
                'en': result.get('en') or text,
                'ar': result.get('ar') or text
            }
        }), 200
    except Exception as e:
        logger.error(f"Translation failed: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@bp.route('/stats', methods=['GET'])
@jwt_required()
@admin_required()
def translation_stats():
    """
    Get translation statistics - how many items need translation.

    GET /api/translations/stats
    """
    from app.models.checklist import ChecklistTemplate, ChecklistItem

    try:
        # Count templates needing translation
        templates_total = ChecklistTemplate.query.count()
        templates_need_translation = ChecklistTemplate.query.filter(
            (ChecklistTemplate.name_ar.is_(None)) | (ChecklistTemplate.name_ar == '')
        ).count()

        # Count items needing translation
        items_total = ChecklistItem.query.count()
        items_need_translation = ChecklistItem.query.filter(
            (ChecklistItem.question_text_ar.is_(None)) | (ChecklistItem.question_text_ar == '')
        ).count()

        return jsonify({
            'status': 'success',
            'data': {
                'templates': {
                    'total': templates_total,
                    'need_translation': templates_need_translation,
                    'translated': templates_total - templates_need_translation
                },
                'items': {
                    'total': items_total,
                    'need_translation': items_need_translation,
                    'translated': items_total - items_need_translation
                },
                'model': 'gemma-3-4b-it',
                'daily_limit': 14400
            }
        }), 200

    except Exception as e:
        logger.error(f"Failed to get translation stats: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
