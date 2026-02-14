"""
Script to auto-translate existing checklist items to Arabic.
Uses gemma-3-4b-it via TranslationService (14,400 RPD).

Usage:
    flask shell
    exec(open('scripts/translate_checklists.py').read())

Or:
    python -c "from app import create_app; app = create_app(); app.app_context().push(); exec(open('scripts/translate_checklists.py').read())"
"""

from app.extensions import db
from app.models.checklist import ChecklistTemplate, ChecklistItem
from app.services.translation_service import TranslationService
import time

def translate_checklists():
    """Translate all checklist templates and items missing Arabic text."""

    print("=" * 60)
    print("CHECKLIST ARABIC TRANSLATION SCRIPT")
    print("Using: gemma-3-4b-it (14,400 RPD)")
    print("=" * 60)

    # Track stats
    templates_translated = 0
    items_translated = 0
    errors = 0

    # 1. Translate ChecklistTemplate names
    print("\n[1/2] Translating template names...")
    templates = ChecklistTemplate.query.filter(
        ChecklistTemplate.name_ar.is_(None) | (ChecklistTemplate.name_ar == '')
    ).all()

    print(f"Found {len(templates)} templates needing translation")

    for template in templates:
        try:
            if template.name:
                template.name_ar = TranslationService.translate_to_arabic(template.name)
                templates_translated += 1
                print(f"  ✓ Template: {template.name[:40]}...")
                time.sleep(0.1)  # Small delay to avoid rate limits
        except Exception as e:
            errors += 1
            print(f"  ✗ Error translating template {template.id}: {e}")

    # 2. Translate ChecklistItem questions and guidance
    print("\n[2/2] Translating checklist items...")
    items = ChecklistItem.query.filter(
        ChecklistItem.question_text_ar.is_(None) | (ChecklistItem.question_text_ar == '')
    ).all()

    print(f"Found {len(items)} items needing translation")

    for item in items:
        try:
            # Translate question
            if item.question_text and not item.question_text_ar:
                item.question_text_ar = TranslationService.translate_to_arabic(item.question_text)

            # Translate action
            if item.action and not getattr(item, 'action_ar', None):
                item.action_ar = TranslationService.translate_to_arabic(item.action)

            # Translate expected result
            if item.expected_result and not getattr(item, 'expected_result_ar', None):
                item.expected_result_ar = TranslationService.translate_to_arabic(item.expected_result)

            # Translate action if fail
            if item.action_if_fail and not getattr(item, 'action_if_fail_ar', None):
                item.action_if_fail_ar = TranslationService.translate_to_arabic(item.action_if_fail)

            items_translated += 1
            print(f"  ✓ Item: {item.question_text[:40] if item.question_text else 'N/A'}...")
            time.sleep(0.1)  # Small delay to avoid rate limits

        except Exception as e:
            errors += 1
            print(f"  ✗ Error translating item {item.id}: {e}")

    # Commit changes
    print("\nSaving to database...")
    db.session.commit()

    # Summary
    print("\n" + "=" * 60)
    print("TRANSLATION COMPLETE")
    print("=" * 60)
    print(f"Templates translated: {templates_translated}")
    print(f"Items translated:     {items_translated}")
    print(f"Errors:               {errors}")
    print("=" * 60)

# Run the script
if __name__ == "__main__":
    translate_checklists()
else:
    # When run via exec()
    translate_checklists()
