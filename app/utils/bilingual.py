"""
Bilingual helper utilities.
Auto-translates user-submitted text and stores/retrieves translations.
"""

from app.models.translation import Translation
from app.extensions import db
from app.services.translation_service import TranslationService, is_arabic


def auto_translate_and_save(model_type, model_id, fields):
    """
    Auto-translate text fields and save translations to the database.
    Detects if text is English or Arabic, translates to the other language.

    Args:
        model_type: e.g. 'specialist_job', 'inspection_answer'
        model_id: ID of the model instance
        fields: dict of {field_name: text_value}

    Call this after db.session.commit() so model_id is available.
    """
    for field_name, text in fields.items():
        if not text or not text.strip():
            continue

        original_lang = 'ar' if is_arabic(text) else 'en'

        # Translate to the other language
        if original_lang == 'ar':
            translated = TranslationService.translate_to_english(text)
        else:
            translated = TranslationService.translate_to_arabic(text)

        if translated:
            # Upsert translation record
            existing = Translation.query.filter_by(
                model_type=model_type,
                model_id=model_id,
                field_name=field_name
            ).first()

            if existing:
                existing.original_lang = original_lang
                existing.translated_text = translated
            else:
                t = Translation(
                    model_type=model_type,
                    model_id=model_id,
                    field_name=field_name,
                    original_lang=original_lang,
                    translated_text=translated
                )
                db.session.add(t)

    db.session.commit()


def get_bilingual_text(model_type, model_id, field_name, original_text, language='en'):
    """
    Get text in the requested language.
    Returns original if it matches the requested language,
    otherwise returns the stored translation.

    Args:
        model_type: e.g. 'specialist_job'
        model_id: ID of the model instance
        field_name: e.g. 'work_notes'
        original_text: The text stored in the model
        language: 'en' or 'ar'

    Returns:
        Text in the requested language, falling back to original
    """
    if not original_text:
        return original_text

    original_lang = 'ar' if is_arabic(original_text) else 'en'

    # If requested language matches original, return as-is
    if language == original_lang:
        return original_text

    # Look up translation
    translation = Translation.query.filter_by(
        model_type=model_type,
        model_id=model_id,
        field_name=field_name
    ).first()

    if translation and translation.translated_text:
        return translation.translated_text

    # Fallback to original
    return original_text


def get_bilingual_fields(model_type, model_id, fields, language='en'):
    """
    Get multiple fields in the requested language.

    Args:
        model_type: e.g. 'specialist_job'
        model_id: ID of the model instance
        fields: dict of {field_name: original_text}
        language: 'en' or 'ar'

    Returns:
        dict of {field_name: text_in_requested_language}
    """
    if language == 'en':
        # Check if any field is Arabic (needs translation)
        needs_lookup = any(is_arabic(v) for v in fields.values() if v)
        if not needs_lookup:
            return fields

    if language == 'ar':
        # Check if any field is English (needs translation)
        needs_lookup = any(not is_arabic(v) for v in fields.values() if v)
        if not needs_lookup:
            return fields

    # Batch fetch translations
    translations = Translation.query.filter(
        Translation.model_type == model_type,
        Translation.model_id == model_id,
        Translation.field_name.in_(fields.keys())
    ).all()

    trans_map = {t.field_name: t for t in translations}

    result = {}
    for field_name, original_text in fields.items():
        if not original_text:
            result[field_name] = original_text
            continue

        original_lang = 'ar' if is_arabic(original_text) else 'en'
        if language == original_lang:
            result[field_name] = original_text
        elif field_name in trans_map and trans_map[field_name].translated_text:
            result[field_name] = trans_map[field_name].translated_text
        else:
            result[field_name] = original_text

    return result
