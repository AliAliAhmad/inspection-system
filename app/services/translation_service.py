"""
AI-powered bidirectional translation service.
Multi-provider: Gemma 3 4B → Groq → OpenAI
Auto-detects language and translates between English and Arabic.

Uses gemma-3-4b for translation (14,400 RPD - high volume).
"""

import os
import re
import logging
import requests

logger = logging.getLogger(__name__)

# Arabic Unicode range detection
_ARABIC_RE = re.compile(r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+')


def is_arabic(text):
    """Check if text is primarily Arabic."""
    if not text:
        return False
    # Count total Arabic characters (sum of all match lengths)
    arabic_chars = sum(len(m) for m in _ARABIC_RE.findall(text))
    # If more than 30% of non-space chars are Arabic, consider it Arabic
    non_space = len(text.replace(' ', ''))
    if non_space == 0:
        return False
    return (arabic_chars / max(non_space, 1)) > 0.3


def _get_ai_provider():
    """Get the best available AI provider for translation."""
    from app.services.gemini_service import is_gemini_configured
    from app.services.groq_service import is_groq_configured

    if is_gemini_configured():
        return 'gemini'
    elif is_groq_configured():
        return 'groq'
    elif os.getenv('OPENAI_API_KEY'):
        return 'openai'
    return None


class TranslationService:
    """Bidirectional translation between English and Arabic using multi-provider AI."""

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
        Core translation method using multi-provider AI.
        Priority: Gemini → Groq → OpenAI

        Args:
            text: Text to translate
            target_lang: 'en' or 'ar'

        Returns:
            Translated string, or None if translation fails
        """
        if not text or not text.strip():
            return None

        provider = _get_ai_provider()
        if not provider:
            logger.warning("No AI provider configured for translation")
            return None

        prompt = (
            TranslationService.SYSTEM_PROMPT_EN_TO_AR if target_lang == 'ar'
            else TranslationService.SYSTEM_PROMPT_AR_TO_EN
        )

        try:
            if provider == 'gemini':
                return TranslationService._translate_gemini(text, prompt, target_lang)
            elif provider == 'groq':
                return TranslationService._translate_groq(text, prompt, target_lang)
            else:
                return TranslationService._translate_openai(text, prompt, target_lang)
        except Exception as e:
            logger.error(f"Translation failed with {provider}: {e}")
            # Try fallback providers
            if provider == 'gemini':
                try:
                    return TranslationService._translate_groq(text, prompt, target_lang)
                except:
                    pass
            if provider in ('gemini', 'groq'):
                try:
                    return TranslationService._translate_openai(text, prompt, target_lang)
                except:
                    pass
            return None

    @staticmethod
    def _translate_gemini(text, system_prompt, target_lang):
        """Translate using Gemma 3 4B (14,400 RPD - high volume)."""
        api_key = os.getenv('GEMINI_API_KEY', '').strip()
        if not api_key:
            raise Exception("Gemini API key not configured")

        # Using gemma-3-4b for translation (14,400 RPD)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemma-3-4b-it:generateContent?key={api_key}"

        payload = {
            "contents": [{
                "parts": [{"text": f"{system_prompt}\n\nText to translate:\n{text}"}]
            }],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": max(len(text) * 3, 100)
            }
        }

        response = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=30)

        if response.status_code != 200:
            raise Exception(f"Gemini API error: {response.status_code}")

        result = response.json()
        candidates = result.get('candidates', [])
        if not candidates:
            raise Exception("Gemini returned no candidates")

        content = candidates[0].get('content', {})
        parts = content.get('parts', [])
        if not parts:
            raise Exception("Gemini returned no parts")

        translation = parts[0].get('text', '').strip()
        direction = "EN→AR" if target_lang == 'ar' else "AR→EN"
        logger.debug(f"[Gemini {direction}] '{text[:40]}' → '{translation[:40]}'")
        return translation

    @staticmethod
    def _translate_groq(text, system_prompt, target_lang):
        """Translate using Groq API."""
        api_key = os.getenv('GROQ_API_KEY', '').strip()
        if not api_key:
            raise Exception("Groq API key not configured")

        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama-3.1-8b-instant",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            "temperature": 0.2,
            "max_tokens": max(len(text) * 3, 100)
        }

        response = requests.post(url, json=payload, headers=headers, timeout=30)

        if response.status_code != 200:
            raise Exception(f"Groq API error: {response.status_code}")

        result = response.json()
        translation = result.get('choices', [{}])[0].get('message', {}).get('content', '').strip()

        direction = "EN→AR" if target_lang == 'ar' else "AR→EN"
        logger.debug(f"[Groq {direction}] '{text[:40]}' → '{translation[:40]}'")
        return translation

    @staticmethod
    def _translate_openai(text, system_prompt, target_lang):
        """Translate using OpenAI API (fallback)."""
        from openai import OpenAI

        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            raise Exception("OpenAI API key not configured")

        client = OpenAI(api_key=api_key)

        response = client.chat.completions.create(
            model=os.getenv('OPENAI_TRANSLATE_MODEL', 'gpt-4o-mini'),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            temperature=0.2,
            max_tokens=max(len(text) * 3, 100),
        )

        translation = response.choices[0].message.content.strip()
        direction = "EN→AR" if target_lang == 'ar' else "AR→EN"
        logger.debug(f"[OpenAI {direction}] '{text[:40]}' → '{translation[:40]}'")
        return translation

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

        provider = _get_ai_provider()
        if not provider:
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
        provider = _get_ai_provider()
        if not provider:
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

        system_prompt = (
            TranslationService.SYSTEM_PROMPT_EN_TO_AR if target_lang == 'ar'
            else TranslationService.SYSTEM_PROMPT_AR_TO_EN
        )

        try:
            if provider == 'gemini':
                result_text = TranslationService._translate_gemini(batch_prompt, system_prompt, target_lang)
            elif provider == 'groq':
                result_text = TranslationService._translate_groq(batch_prompt, system_prompt, target_lang)
            else:
                result_text = TranslationService._translate_openai(batch_prompt, system_prompt, target_lang)

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
