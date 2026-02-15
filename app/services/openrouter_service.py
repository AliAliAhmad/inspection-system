"""
OpenRouter AI Services - Access 300+ models with ONE API key.
Includes FREE models for vision and text generation.

FREE models available:
- meta-llama/llama-3.2-3b-instruct:free
- google/gemma-2-9b-it:free
- nousresearch/hermes-3-llama-3.1-405b:free
- openrouter/auto (auto-selects best free model)

Setup:
1. Create account at https://openrouter.ai (free)
2. Get API key from dashboard
3. Set OPENROUTER_API_KEY env var
"""

import os
import logging
import requests
import base64

logger = logging.getLogger(__name__)

# OpenRouter API endpoint (OpenAI compatible)
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# FREE models (prioritized first!)
FREE_TEXT_MODELS = [
    "meta-llama/llama-4-scout:free",                    # Llama 4, best free
    "google/gemma-3-27b-it:free",                       # Gemma 3 27B
    "qwen/qwen-2.5-vl-72b-instruct:free",              # Qwen 72B
    "mistralai/mistral-small-3.1-24b-instruct:free",    # Mistral
    "meta-llama/llama-3.2-3b-instruct:free",            # Fast, small
]

# FREE vision models (all free, no cost)
FREE_VISION_MODELS = [
    "meta-llama/llama-4-scout:free",                    # Llama 4 Scout, best free vision
    "qwen/qwen-2.5-vl-72b-instruct:free",              # Qwen 72B vision, high quality
    "qwen/qwen-2.5-vl-32b-instruct:free",              # Qwen 32B vision
    "google/gemma-3-27b-it:free",                       # Gemma 3 27B vision
    "meta-llama/llama-3.2-11b-vision-instruct:free",    # Llama 3.2 vision
    "mistralai/mistral-small-3.1-24b-instruct:free",    # Mistral vision
]

# Paid models (fallback if all free exhausted)
PAID_VISION_MODELS = [
    "openai/gpt-4o-mini",                         # Cheap OpenAI
]


def is_openrouter_configured():
    """Check if OpenRouter API key is configured."""
    key = os.getenv('OPENROUTER_API_KEY', '').strip()
    return bool(key)


def _get_headers():
    """Get API headers with authentication."""
    api_key = os.getenv('OPENROUTER_API_KEY', '').strip()
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://inspection-system.com",  # Required by OpenRouter
        "X-Title": "Inspection System"
    }


class OpenRouterVisionService:
    """
    OpenRouter Vision using FREE Llama Vision models.
    Falls back to paid models if needed.
    """

    def analyze_image(self, image_content: bytes = None, image_url: str = None,
                      is_reading_question: bool = False, use_free_only: bool = True) -> dict:
        """
        Analyze an image using OpenRouter (FREE models first).

        Args:
            image_content: Raw image bytes
            image_url: URL of image to analyze
            is_reading_question: If True, focus on text/number extraction
            use_free_only: If True, only use free models

        Returns:
            dict with 'en' and 'ar' analysis text, and optional 'reading'
        """
        if not is_openrouter_configured():
            logger.warning("OpenRouter API key not configured")
            return None

        try:
            # Convert image to base64 if we have bytes
            if image_content:
                image_b64 = base64.b64encode(image_content).decode('utf-8')
                if image_content[:4] == b'\x89PNG':
                    mime_type = "image/png"
                elif image_content[:2] == b'\xff\xd8':
                    mime_type = "image/jpeg"
                else:
                    mime_type = "image/jpeg"
                image_data = f"data:{mime_type};base64,{image_b64}"
            elif image_url:
                image_data = image_url
            else:
                logger.error("No image provided")
                return None

            # Build prompt
            if is_reading_question:
                prompt = (
                    "This is an industrial equipment inspection photo. "
                    "Look for any meter readings, gauge values, or numeric displays. "
                    "Extract any numbers you can see clearly. "
                    "Format: Reading: [number if found], Description: [brief description]"
                )
            else:
                prompt = (
                    "This is an industrial equipment inspection photo. "
                    "Describe what you see: equipment type, condition, any defects "
                    "(rust, damage, leaks, wear), safety concerns. Be concise."
                )

            # Try FREE models first, then paid if allowed
            models_to_try = FREE_VISION_MODELS.copy()
            if not use_free_only:
                models_to_try.extend(PAID_VISION_MODELS)

            last_error = None
            for model in models_to_try:
                try:
                    payload = {
                        "model": model,
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": prompt},
                                    {"type": "image_url", "image_url": {"url": image_data}}
                                ]
                            }
                        ],
                        "max_tokens": 300,
                        "temperature": 0.3
                    }

                    logger.info(f"Calling OpenRouter Vision API with model: {model}")

                    response = requests.post(
                        OPENROUTER_API_URL,
                        headers=_get_headers(),
                        json=payload,
                        timeout=60
                    )

                    if response.status_code == 200:
                        result = response.json()
                        analysis_text = result.get('choices', [{}])[0].get('message', {}).get('content', '')

                        if analysis_text:
                            logger.info(f"OpenRouter analysis ({model}): {analysis_text[:100]}...")
                            return self._process_result(analysis_text, is_reading_question)

                    last_error = f"{model}: {response.status_code} - {response.text[:200]}"
                    logger.warning(f"OpenRouter model {model} failed: {last_error}")

                except Exception as e:
                    last_error = f"{model}: {str(e)}"
                    logger.warning(f"OpenRouter model {model} error: {e}")

            logger.error(f"All OpenRouter models failed. Last error: {last_error}")
            return None

        except Exception as e:
            logger.error(f"OpenRouter Vision error: {e}", exc_info=True)
            return None

    def _process_result(self, analysis_text: str, is_reading_question: bool) -> dict:
        """Process the analysis result and translate."""
        import re

        extracted_reading = None
        if is_reading_question:
            reading_match = re.search(r'Reading:\s*([\d.]+)', analysis_text)
            if reading_match:
                extracted_reading = reading_match.group(1)
            else:
                numbers = re.findall(r'\d+\.?\d*', analysis_text)
                if numbers:
                    extracted_reading = max(numbers, key=lambda x: float(x) if x else 0)

        from app.services.translation_service import TranslationService
        translated = TranslationService.auto_translate(analysis_text)

        result = {
            'en': translated.get('en') or analysis_text,
            'ar': translated.get('ar') or analysis_text
        }

        if extracted_reading:
            result['reading'] = extracted_reading

        return result


class OpenRouterTextService:
    """
    OpenRouter Text Generation using FREE models.
    Access to 300+ models with one API key.
    """

    def generate(self, prompt: str, system_prompt: str = None, max_tokens: int = 500,
                 use_free_only: bool = True) -> str:
        """
        Generate text using OpenRouter (FREE models first).

        Args:
            prompt: User prompt
            system_prompt: Optional system prompt
            max_tokens: Maximum tokens to generate
            use_free_only: If True, only use free models

        Returns:
            Generated text string
        """
        if not is_openrouter_configured():
            logger.warning("OpenRouter API key not configured")
            return None

        try:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            models_to_try = FREE_TEXT_MODELS.copy()

            last_error = None
            for model in models_to_try:
                try:
                    payload = {
                        "model": model,
                        "messages": messages,
                        "max_tokens": max_tokens,
                        "temperature": 0.3
                    }

                    response = requests.post(
                        OPENROUTER_API_URL,
                        headers=_get_headers(),
                        json=payload,
                        timeout=60
                    )

                    if response.status_code == 200:
                        result = response.json()
                        text = result.get('choices', [{}])[0].get('message', {}).get('content', '')
                        if text:
                            logger.info(f"OpenRouter text ({model}): {text[:50]}...")
                            return text.strip()

                    last_error = f"{model}: {response.status_code}"
                    logger.warning(f"OpenRouter model {model} failed: {last_error}")

                except Exception as e:
                    last_error = f"{model}: {str(e)}"
                    logger.warning(f"OpenRouter model {model} error: {e}")

            logger.error(f"All OpenRouter text models failed. Last error: {last_error}")
            return None

        except Exception as e:
            logger.error(f"OpenRouter Text error: {e}", exc_info=True)
            return None

    def translate(self, text: str, target_lang: str = 'ar') -> str:
        """Translate text using OpenRouter FREE models."""
        if target_lang == 'ar':
            system_prompt = (
                "You are a professional English-to-Arabic translator. "
                "Return ONLY the Arabic translation, nothing else."
            )
        else:
            system_prompt = (
                "You are a professional Arabic-to-English translator. "
                "Return ONLY the English translation, nothing else."
            )

        return self.generate(f"Translate: {text}", system_prompt, max_tokens=len(text) * 3)


# Singleton instances
_vision_service = None
_text_service = None


def get_vision_service() -> OpenRouterVisionService:
    """Get or create Vision service singleton."""
    global _vision_service
    if _vision_service is None:
        _vision_service = OpenRouterVisionService()
    return _vision_service


def get_text_service() -> OpenRouterTextService:
    """Get or create Text service singleton."""
    global _text_service
    if _text_service is None:
        _text_service = OpenRouterTextService()
    return _text_service
