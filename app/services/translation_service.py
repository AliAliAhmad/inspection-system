"""
AI-powered bidirectional translation service.
FULL FALLBACK CHAIN (FREE providers prioritized):
1. Gemma 3 27B (14,400 FREE/day) - Primary
2. Groq Llama (FREE forever) - FREE fallback
3. OpenRouter (FREE models) - FREE fallback
4. DeepInfra ($0.03/M) - Cheapest paid
5. Ollama (FREE local) - Offline backup
6. OpenAI (PAID) - Final fallback
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
    arabic_chars = sum(len(m) for m in _ARABIC_RE.findall(text))
    non_space = len(text.replace(' ', ''))
    if non_space == 0:
        return False
    return (arabic_chars / max(non_space, 1)) > 0.3


def _get_ai_providers():
    """Get list of available AI providers in priority order (FREE first)."""
    from app.services.gemini_service import is_gemini_configured
    from app.services.groq_service import is_groq_configured
    from app.services.openrouter_service import is_openrouter_configured
    from app.services.deepinfra_service import is_deepinfra_configured
    from app.services.ollama_service import is_ollama_configured

    providers = []
    if is_gemini_configured():
        providers.append('gemini')
    if is_groq_configured():
        providers.append('groq')
    if is_openrouter_configured():
        providers.append('openrouter')
    if is_deepinfra_configured():
        providers.append('deepinfra')
    if is_ollama_configured():
        providers.append('ollama')
    if os.getenv('OPENAI_API_KEY'):
        providers.append('openai')
    return providers


def _get_ai_provider():
    """Get the first available AI provider for translation."""
    providers = _get_ai_providers()
    return providers[0] if providers else None


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
        Always returns both 'en' and 'ar' — uses original text as fallback
        if translation fails (English is acceptable as Arabic fallback).

        Args:
            text: Input text (English or Arabic)

        Returns:
            dict: {'en': english_text, 'ar': arabic_text}
        """
        if not text or not text.strip():
            return {'en': text or '', 'ar': text or ''}

        if is_arabic(text):
            en = TranslationService._translate(text, 'en')
            return {'en': en or text, 'ar': text}
        else:
            ar = TranslationService._translate(text, 'ar')
            return {'en': text, 'ar': ar or text}

    @staticmethod
    def _translate(text, target_lang):
        """
        Core translation method using FULL FALLBACK CHAIN.
        Order: 1.Gemini → 2.Groq(FREE) → 3.OpenRouter(FREE) → 4.DeepInfra → 5.Ollama → 6.OpenAI

        Args:
            text: Text to translate
            target_lang: 'en' or 'ar'

        Returns:
            Translated string, or None if translation fails
        """
        if not text or not text.strip():
            return None

        providers = _get_ai_providers()
        if not providers:
            logger.warning("No AI provider configured for translation")
            return None

        prompt = (
            TranslationService.SYSTEM_PROMPT_EN_TO_AR if target_lang == 'ar'
            else TranslationService.SYSTEM_PROMPT_AR_TO_EN
        )

        # Try each provider in order until one succeeds
        for provider in providers:
            try:
                logger.debug(f"Trying translation with: {provider}")
                if provider == 'gemini':
                    result = TranslationService._translate_gemini(text, prompt, target_lang)
                elif provider == 'groq':
                    result = TranslationService._translate_groq(text, prompt, target_lang)
                elif provider == 'openrouter':
                    result = TranslationService._translate_openrouter(text, prompt, target_lang)
                elif provider == 'deepinfra':
                    result = TranslationService._translate_deepinfra(text, prompt, target_lang)
                elif provider == 'ollama':
                    result = TranslationService._translate_ollama(text, prompt, target_lang)
                elif provider == 'openai':
                    result = TranslationService._translate_openai(text, prompt, target_lang)
                else:
                    continue

                if result and result.strip():
                    return result
            except Exception as e:
                logger.warning(f"Translation failed with {provider}: {e}, trying next...")
                continue

        logger.error("All translation providers failed")
        return None

    @staticmethod
    def _translate_gemini(text, system_prompt, target_lang):
        """Translate using Gemma 3 4B (14,400 RPD) with fallback to Gemini 2.5 Flash."""
        api_key = os.getenv('GEMINI_API_KEY', '').strip()
        if not api_key:
            raise Exception("Gemini API key not configured")

        # Try gemma-3-4b-it first (14,400 RPD), fallback to gemini-2.5-flash (1,500 RPD)
        models = ["gemma-3-4b-it", "gemini-2.5-flash"]
        base_url = "https://generativelanguage.googleapis.com/v1beta/models"

        payload = {
            "contents": [{
                "parts": [{"text": f"{system_prompt}\n\nText to translate:\n{text}"}]
            }],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": max(len(text) * 3, 100)
            }
        }

        last_error = None
        for model in models:
            url = f"{base_url}/{model}:generateContent?key={api_key}"
            try:
                response = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=30)

                if response.status_code == 200:
                    result = response.json()
                    candidates = result.get('candidates', [])
                    if candidates:
                        content = candidates[0].get('content', {})
                        parts = content.get('parts', [])
                        if parts:
                            translation = parts[0].get('text', '').strip()
                            direction = "EN→AR" if target_lang == 'ar' else "AR→EN"
                            logger.debug(f"[{model} {direction}] '{text[:40]}' → '{translation[:40]}'")
                            return translation
                last_error = f"{model}: {response.status_code}"
                logger.warning(f"Translation model {model} failed: {last_error}, trying next...")
            except Exception as e:
                last_error = f"{model}: {str(e)}"
                logger.warning(f"Translation model {model} error: {e}, trying next...")

        raise Exception(f"All translation models failed. Last error: {last_error}")

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
        """Translate using OpenAI API (PAID - final fallback)."""
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
    def _translate_openrouter(text, system_prompt, target_lang):
        """Translate using OpenRouter FREE models."""
        api_key = os.getenv('OPENROUTER_API_KEY', '').strip()
        if not api_key:
            raise Exception("OpenRouter API key not configured")

        # Use FREE models
        models = [
            "nousresearch/hermes-3-llama-3.1-405b:free",
            "meta-llama/llama-3.2-3b-instruct:free",
            "google/gemma-2-9b-it:free",
        ]

        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://inspection-system.com",
            "X-Title": "Inspection System"
        }

        for model in models:
            try:
                payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": text}
                    ],
                    "temperature": 0.2,
                    "max_tokens": max(len(text) * 3, 100)
                }

                response = requests.post(url, json=payload, headers=headers, timeout=30)

                if response.status_code == 200:
                    result = response.json()
                    translation = result.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
                    if translation:
                        direction = "EN→AR" if target_lang == 'ar' else "AR→EN"
                        logger.debug(f"[OpenRouter {direction}] '{text[:40]}' → '{translation[:40]}'")
                        return translation
            except Exception as e:
                logger.warning(f"OpenRouter model {model} failed: {e}")
                continue

        raise Exception("All OpenRouter models failed")

    @staticmethod
    def _translate_deepinfra(text, system_prompt, target_lang):
        """Translate using DeepInfra (cheapest: $0.03/M tokens)."""
        api_key = os.getenv('DEEPINFRA_API_KEY', '').strip()
        if not api_key:
            raise Exception("DeepInfra API key not configured")

        url = "https://api.deepinfra.com/v1/openai/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        # Use cheapest model
        models = ["meta-llama/Llama-3.1-8B-Instruct", "meta-llama/Llama-3.1-70B-Instruct"]

        for model in models:
            try:
                payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": text}
                    ],
                    "temperature": 0.2,
                    "max_tokens": max(len(text) * 3, 100)
                }

                response = requests.post(url, json=payload, headers=headers, timeout=30)

                if response.status_code == 200:
                    result = response.json()
                    translation = result.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
                    if translation:
                        direction = "EN→AR" if target_lang == 'ar' else "AR→EN"
                        logger.debug(f"[DeepInfra {direction}] '{text[:40]}' → '{translation[:40]}'")
                        return translation
            except Exception as e:
                logger.warning(f"DeepInfra model {model} failed: {e}")
                continue

        raise Exception("All DeepInfra models failed")

    @staticmethod
    def _translate_ollama(text, system_prompt, target_lang):
        """Translate using local Ollama (FREE, offline)."""
        from app.services.ollama_service import is_ollama_configured, get_text_service

        if not is_ollama_configured():
            raise Exception("Ollama not running")

        text_service = get_text_service()
        translation = text_service.translate(text, target_lang)

        if translation:
            direction = "EN→AR" if target_lang == 'ar' else "AR→EN"
            logger.debug(f"[Ollama {direction}] '{text[:40]}' → '{translation[:40]}'")
            return translation

        raise Exception("Ollama translation failed")

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
