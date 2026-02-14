"""
DeepInfra AI Services for vision analysis and text generation.
CHEAPEST pricing: $0.03/M input, $0.05/M output tokens.

Free tier: $10 free credits for new accounts.

Setup:
1. Create account at https://deepinfra.com (free)
2. Get API key from dashboard
3. Set DEEPINFRA_API_KEY env var

Models:
- Vision: meta-llama/Llama-3.2-11B-Vision-Instruct ($0.03/M)
- Vision: meta-llama/Llama-4-Scout-17B-16E-Instruct ($0.08/M)
- Text: meta-llama/Llama-3.1-8B-Instruct ($0.03/M)
- Text: meta-llama/Llama-3.1-70B-Instruct ($0.12/M)
"""

import os
import logging
import requests
import base64

logger = logging.getLogger(__name__)

# DeepInfra API endpoint (OpenAI compatible)
DEEPINFRA_API_URL = "https://api.deepinfra.com/v1/openai/chat/completions"

# Models - prioritize cheapest
VISION_MODELS = [
    "meta-llama/Llama-3.2-11B-Vision-Instruct",  # $0.03/M - cheapest
    "meta-llama/Llama-4-Scout-17B-16E-Instruct",  # $0.08/M - better quality
]
TEXT_MODELS = [
    "meta-llama/Llama-3.1-8B-Instruct",   # $0.03/M - cheapest
    "meta-llama/Llama-3.1-70B-Instruct",  # $0.12/M - better quality
]


def is_deepinfra_configured():
    """Check if DeepInfra API key is configured."""
    key = os.getenv('DEEPINFRA_API_KEY', '').strip()
    return bool(key)


def _get_headers():
    """Get API headers with authentication."""
    api_key = os.getenv('DEEPINFRA_API_KEY', '').strip()
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }


class DeepInfraVisionService:
    """
    DeepInfra Vision using Llama 3.2 Vision model.
    Cheapest option at $0.03 per million tokens.
    """

    def analyze_image(self, image_content: bytes = None, image_url: str = None,
                      is_reading_question: bool = False) -> dict:
        """
        Analyze an image using DeepInfra Llama Vision.

        Args:
            image_content: Raw image bytes
            image_url: URL of image to analyze
            is_reading_question: If True, focus on text/number extraction

        Returns:
            dict with 'en' and 'ar' analysis text, and optional 'reading'
        """
        if not is_deepinfra_configured():
            logger.warning("DeepInfra API key not configured")
            return None

        try:
            # Convert image to base64 if we have bytes
            if image_content:
                image_b64 = base64.b64encode(image_content).decode('utf-8')
                # Detect image type
                if image_content[:4] == b'\x89PNG':
                    mime_type = "image/png"
                elif image_content[:2] == b'\xff\xd8':
                    mime_type = "image/jpeg"
                elif image_content[:4] == b'RIFF' and image_content[8:12] == b'WEBP':
                    mime_type = "image/webp"
                else:
                    mime_type = "image/jpeg"
                image_data = f"data:{mime_type};base64,{image_b64}"
            elif image_url:
                image_data = image_url
            else:
                logger.error("No image provided")
                return None

            # Build prompt based on question type
            if is_reading_question:
                prompt = (
                    "This is an industrial equipment inspection photo. "
                    "Look for any meter readings, gauge values, or numeric displays. "
                    "Extract any numbers you can see clearly. "
                    "Also describe the equipment condition. "
                    "Format: Reading: [number if found], Description: [brief description]"
                )
            else:
                prompt = (
                    "This is an industrial equipment inspection photo. "
                    "Describe what you see, focusing on: "
                    "1. Equipment type and condition "
                    "2. Any visible defects (rust, damage, leaks, wear) "
                    "3. Safety concerns if any. "
                    "Be concise but thorough."
                )

            # Try models in order (cheapest first)
            last_error = None
            for model in VISION_MODELS:
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

                    logger.info(f"Calling DeepInfra Vision API with model: {model}")

                    response = requests.post(
                        DEEPINFRA_API_URL,
                        headers=_get_headers(),
                        json=payload,
                        timeout=60
                    )

                    if response.status_code == 200:
                        result = response.json()
                        analysis_text = result.get('choices', [{}])[0].get('message', {}).get('content', '')

                        if analysis_text:
                            logger.info(f"DeepInfra analysis ({model}): {analysis_text[:100]}...")
                            return self._process_result(analysis_text, is_reading_question)

                    last_error = f"{model}: {response.status_code} - {response.text[:200]}"
                    logger.warning(f"DeepInfra model {model} failed: {last_error}")

                except Exception as e:
                    last_error = f"{model}: {str(e)}"
                    logger.warning(f"DeepInfra model {model} error: {e}")

            logger.error(f"All DeepInfra models failed. Last error: {last_error}")
            return None

        except Exception as e:
            logger.error(f"DeepInfra Vision error: {e}", exc_info=True)
            return None

    def _process_result(self, analysis_text: str, is_reading_question: bool) -> dict:
        """Process the analysis result and translate."""
        import re

        # Extract reading if present
        extracted_reading = None
        if is_reading_question:
            reading_match = re.search(r'Reading:\s*([\d.]+)', analysis_text)
            if reading_match:
                extracted_reading = reading_match.group(1)
            else:
                numbers = re.findall(r'\d+\.?\d*', analysis_text)
                if numbers:
                    extracted_reading = max(numbers, key=lambda x: float(x) if x else 0)

        # Translate to Arabic
        from app.services.translation_service import TranslationService
        translated = TranslationService.auto_translate(analysis_text)

        result = {
            'en': translated.get('en') or analysis_text,
            'ar': translated.get('ar') or analysis_text
        }

        if extracted_reading:
            result['reading'] = extracted_reading

        return result


class DeepInfraTextService:
    """
    DeepInfra Text Generation using Llama 3.1 models.
    Cheapest at $0.03/M tokens for 8B model.
    """

    def generate(self, prompt: str, system_prompt: str = None, max_tokens: int = 500) -> str:
        """
        Generate text using DeepInfra Llama.

        Args:
            prompt: User prompt
            system_prompt: Optional system prompt
            max_tokens: Maximum tokens to generate

        Returns:
            Generated text string
        """
        if not is_deepinfra_configured():
            logger.warning("DeepInfra API key not configured")
            return None

        try:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            last_error = None
            for model in TEXT_MODELS:
                try:
                    payload = {
                        "model": model,
                        "messages": messages,
                        "max_tokens": max_tokens,
                        "temperature": 0.3
                    }

                    response = requests.post(
                        DEEPINFRA_API_URL,
                        headers=_get_headers(),
                        json=payload,
                        timeout=60
                    )

                    if response.status_code == 200:
                        result = response.json()
                        text = result.get('choices', [{}])[0].get('message', {}).get('content', '')
                        if text:
                            logger.info(f"DeepInfra text generation ({model}): {text[:50]}...")
                            return text.strip()

                    last_error = f"{model}: {response.status_code}"
                    logger.warning(f"DeepInfra model {model} failed: {last_error}")

                except Exception as e:
                    last_error = f"{model}: {str(e)}"
                    logger.warning(f"DeepInfra model {model} error: {e}")

            logger.error(f"All DeepInfra text models failed. Last error: {last_error}")
            return None

        except Exception as e:
            logger.error(f"DeepInfra Text error: {e}", exc_info=True)
            return None

    def translate(self, text: str, target_lang: str = 'ar') -> str:
        """
        Translate text using DeepInfra.

        Args:
            text: Text to translate
            target_lang: 'en' or 'ar'

        Returns:
            Translated text
        """
        if target_lang == 'ar':
            system_prompt = (
                "You are a professional English-to-Arabic translator specializing in "
                "industrial and technical content. Return ONLY the Arabic translation."
            )
        else:
            system_prompt = (
                "You are a professional Arabic-to-English translator specializing in "
                "industrial and technical content. Return ONLY the English translation."
            )

        return self.generate(f"Translate: {text}", system_prompt, max_tokens=len(text) * 3)


# Singleton instances
_vision_service = None
_text_service = None


def get_vision_service() -> DeepInfraVisionService:
    """Get or create Vision service singleton."""
    global _vision_service
    if _vision_service is None:
        _vision_service = DeepInfraVisionService()
    return _vision_service


def get_text_service() -> DeepInfraTextService:
    """Get or create Text service singleton."""
    global _text_service
    if _text_service is None:
        _text_service = DeepInfraTextService()
    return _text_service
