"""
Together AI Vision Service for photo analysis.
Uses Llama 3.2 90B Vision - highest quality model.

Free tier: $25 free credits for new accounts.
Setup:
1. Create account at https://api.together.xyz (free)
2. Get API key from dashboard
3. Set TOGETHER_API_KEY env var
"""

import os
import logging
import requests
import base64

logger = logging.getLogger(__name__)

# Together AI API endpoint
TOGETHER_API_URL = "https://api.together.ai/v1/chat/completions"

# Best vision model for quality
VISION_MODEL = "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo"


def is_together_configured():
    """Check if Together AI API key is configured."""
    key = os.getenv('TOGETHER_API_KEY', '').strip()
    return bool(key)


def _get_headers():
    """Get API headers with authentication."""
    api_key = os.getenv('TOGETHER_API_KEY', '').strip()
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }


class TogetherVisionService:
    """
    Together AI Vision using Llama 3.2 90B Vision model.
    Highest quality image analysis available.
    """

    def analyze_image(self, image_content: bytes = None, image_url: str = None,
                      is_reading_question: bool = False) -> dict:
        """
        Analyze an image using Together AI Llama Vision.

        Args:
            image_content: Raw image bytes
            image_url: URL of image to analyze
            is_reading_question: If True, focus on text/number extraction

        Returns:
            dict with 'en' and 'ar' analysis text, and optional 'reading'
        """
        if not is_together_configured():
            logger.warning("Together AI API key not configured")
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

            # Build request payload
            payload = {
                "model": VISION_MODEL,
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

            logger.info(f"Calling Together AI Vision API with model: {VISION_MODEL}")

            response = requests.post(
                TOGETHER_API_URL,
                headers=_get_headers(),
                json=payload,
                timeout=60
            )

            logger.info(f"Together AI response status: {response.status_code}")

            if response.status_code != 200:
                logger.error(f"Together AI API error: {response.status_code} - {response.text[:500]}")
                return None

            result = response.json()

            # Extract the response text
            analysis_text = result.get('choices', [{}])[0].get('message', {}).get('content', '')

            if not analysis_text:
                logger.warning("Together AI returned empty response")
                return None

            logger.info(f"Together AI analysis: {analysis_text[:200]}...")

            # Extract reading if present
            extracted_reading = None
            if is_reading_question:
                import re
                # Look for "Reading: X" pattern
                reading_match = re.search(r'Reading:\s*([\d.]+)', analysis_text)
                if reading_match:
                    extracted_reading = reading_match.group(1)
                else:
                    # Try to find any numbers
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

        except Exception as e:
            logger.error(f"Together AI Vision error: {e}", exc_info=True)
            return None


# Singleton instance
_vision_service = None


def get_vision_service() -> TogetherVisionService:
    """Get or create Vision service singleton."""
    global _vision_service
    if _vision_service is None:
        _vision_service = TogetherVisionService()
    return _vision_service
