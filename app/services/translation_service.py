"""
AI-powered bidirectional translation service using OpenAI.
Auto-detects language and translates between English and Arabic.
"""

import os
import re
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

_client = None

# Arabic Unicode range detection
_ARABIC_RE = re.compile(r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+')


def _get_client():
    """Lazy-initialize OpenAI client."""
    global _client
    if _client is None:
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            logger.warning("OPENAI_API_KEY not set — translation disabled")
            return None
        _client = OpenAI(api_key=api_key)
    return _client


def is_arabic(text):
    """Check if text is primarily Arabic."""
    if not text:
        return False
    arabic_chars = len(_ARABIC_RE.findall(text))
    # If more than 30% of non-space chars are Arabic, consider it Arabic
    non_space = len(text.replace(' ', ''))
    if non_space == 0:
        return False
    return (arabic_chars / max(non_space, 1)) > 0.3


class TranslationService:
    """Bidirectional translation between English and Arabic using OpenAI."""

    SYSTEM_PROMPT_EN_TO_AR = (
        "You are a professional English-to-Arabic translator specializing in "
        "industrial and technical content. Translate the following text to Arabic. "
        "Keep technical terms accurate. Return ONLY the Arabic translation, "
        "nothing else. Do not add explanations."
    )

    SYSTEM_PROMPT_AR_TO_EN = (
        "You are a professional Arabic-to-English translator specializing in "
        "industrial and technical content. Translate the following text to English. "
        "Keep technical terms accurate. Return ONLY the English translation, "
        "nothing else. Do not add explanations."
    )

    @staticmethod
    def translate_to_arabic(text):
        """Translate English text to Arabic."""
        return TranslationService._translate(text, 'ar')

    @staticmethod
    def translate_to_english(text):
        """Translate Arabic text to English."""
        return TranslationService._translate(text, 'en')

    @staticmethod
    def auto_translate(text):
        """
        Auto-detect language and translate to the other language.

        Args:
            text: Input text (English or Arabic)

        Returns:
            dict: {'en': english_text, 'ar': arabic_text}
        """
        if not text or not text.strip():
            return {'en': text, 'ar': None}

        if is_arabic(text):
            en = TranslationService._translate(text, 'en')
            return {'en': en, 'ar': text}
        else:
            ar = TranslationService._translate(text, 'ar')
            return {'en': text, 'ar': ar}

    @staticmethod
    def _translate(text, target_lang):
        """
        Core translation method.

        Args:
            text: Text to translate
            target_lang: 'en' or 'ar'

        Returns:
            Translated string, or None if translation fails
        """
        if not text or not text.strip():
            return None

        client = _get_client()
        if not client:
            return None

        prompt = (
            TranslationService.SYSTEM_PROMPT_EN_TO_AR if target_lang == 'ar'
            else TranslationService.SYSTEM_PROMPT_AR_TO_EN
        )

        try:
            response = client.chat.completions.create(
                model=os.getenv('OPENAI_TRANSLATE_MODEL', 'gpt-4o-mini'),
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": text}
                ],
                temperature=0.2,
                max_tokens=max(len(text) * 3, 100),
            )
            translation = response.choices[0].message.content.strip()
            direction = "EN→AR" if target_lang == 'ar' else "AR→EN"
            logger.debug(f"[{direction}] '{text[:40]}' → '{translation[:40]}'")
            return translation
        except Exception as e:
            logger.error(f"Translation failed: {e}")
            return None

    @staticmethod
    def translate_batch(texts):
        """
        Translate multiple texts in a single API call.
        Auto-detects direction per field.

        Args:
            texts: dict of {field_name: text_value}

        Returns:
            dict of {field_name: translated_text}
        """
        if not texts:
            return {}

        client = _get_client()
        if not client:
            return {k: None for k in texts}

        # Split into EN→AR and AR→EN batches
        en_to_ar = {}
        ar_to_en = {}
        for key, text in texts.items():
            if not text or not text.strip():
                continue
            if is_arabic(text):
                ar_to_en[key] = text
            else:
                en_to_ar[key] = text

        result = {k: None for k in texts}

        # Process EN→AR batch
        if en_to_ar:
            translated = TranslationService._translate_batch_one_direction(
                en_to_ar, 'ar'
            )
            result.update(translated)

        # Process AR→EN batch
        if ar_to_en:
            translated = TranslationService._translate_batch_one_direction(
                ar_to_en, 'en'
            )
            result.update(translated)

        return result

    @staticmethod
    def _translate_batch_one_direction(texts, target_lang):
        """Translate a batch of texts in one direction."""
        client = _get_client()
        if not client:
            return {k: None for k in texts}

        lines = []
        keys = []
        for i, (key, text) in enumerate(texts.items(), 1):
            lines.append(f"{i}. {text}")
            keys.append((i, key))

        if not lines:
            return {}

        direction = "English to Arabic" if target_lang == 'ar' else "Arabic to English"
        batch_prompt = (
            f"Translate each numbered line below from {direction}. "
            "Return ONLY the translations, keeping the same numbering format. "
            "Keep technical terms accurate.\n\n" + "\n".join(lines)
        )

        prompt = (
            TranslationService.SYSTEM_PROMPT_EN_TO_AR if target_lang == 'ar'
            else TranslationService.SYSTEM_PROMPT_AR_TO_EN
        )

        try:
            response = client.chat.completions.create(
                model=os.getenv('OPENAI_TRANSLATE_MODEL', 'gpt-4o-mini'),
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": batch_prompt}
                ],
                temperature=0.2,
                max_tokens=sum(len(t) * 3 for t in texts.values()),
            )

            result_text = response.choices[0].message.content.strip()
            result = {k: None for k in texts}

            for line in result_text.split('\n'):
                line = line.strip()
                if not line:
                    continue
                for idx, key in keys:
                    prefix = f"{idx}."
                    if line.startswith(prefix):
                        result[key] = line[len(prefix):].strip()
                        break

            return result
        except Exception as e:
            logger.error(f"Batch translation failed: {e}")
            return {k: None for k in texts}
