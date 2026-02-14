"""
Google Gemini AI Service for photo analysis and audio transcription.
Uses Gemini 2.5 Flash-Lite - best free tier (1000 requests/day).

Free tier: 1000 requests/day, permanent, no credit card needed.
Setup:
1. Go to https://aistudio.google.com/apikey
2. Create API key
3. Set GEMINI_API_KEY env var
"""

import os
import logging
import requests
import base64

logger = logging.getLogger(__name__)

# Gemini API endpoint
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"

# Best free model (1000 requests/day)
VISION_MODEL = "gemini-2.5-flash-lite"
AUDIO_MODEL = "gemini-2.5-flash-lite"


def is_gemini_configured():
    """Check if Gemini API key is configured."""
    key = os.getenv('GEMINI_API_KEY', '').strip()
    return bool(key)


def _get_api_key():
    """Get API key."""
    return os.getenv('GEMINI_API_KEY', '').strip()


class GeminiVisionService:
    """
    Google Gemini Vision for image analysis.
    High quality, rivals GPT-4, 1000 free requests/day.
    """

    def analyze_image(self, image_content: bytes = None, image_url: str = None,
                      is_reading_question: bool = False) -> dict:
        """
        Analyze an image using Gemini Vision.

        Args:
            image_content: Raw image bytes
            image_url: URL of image to analyze (will be downloaded)
            is_reading_question: If True, focus on text/number extraction

        Returns:
            dict with 'en' and 'ar' analysis text, and optional 'reading'
        """
        if not is_gemini_configured():
            logger.warning("Gemini API key not configured")
            return None

        try:
            # Download image if URL provided
            if image_url and not image_content:
                try:
                    response = requests.get(image_url, timeout=30)
                    response.raise_for_status()
                    image_content = response.content
                except Exception as e:
                    logger.error(f"Failed to download image: {e}")
                    return None

            if not image_content:
                logger.error("No image provided")
                return None

            # Convert image to base64
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

            # Build prompt based on question type
            if is_reading_question:
                prompt = (
                    "This is an industrial equipment inspection photo. "
                    "Look for any meter readings, gauge values, or numeric displays. "
                    "Extract any numbers you can see clearly. "
                    "Also describe the equipment condition. "
                    "Format your response as: Reading: [number if found], Description: [brief description]"
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

            # Build request payload for Gemini
            payload = {
                "contents": [{
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": image_b64
                            }
                        }
                    ]
                }],
                "generationConfig": {
                    "temperature": 0.3,
                    "maxOutputTokens": 300
                }
            }

            api_key = _get_api_key()
            url = f"{GEMINI_API_URL}/{VISION_MODEL}:generateContent?key={api_key}"

            logger.info(f"Calling Gemini Vision API with model: {VISION_MODEL}")

            response = requests.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=60
            )

            logger.info(f"Gemini response status: {response.status_code}")

            if response.status_code != 200:
                logger.error(f"Gemini API error: {response.status_code} - {response.text[:500]}")
                return None

            result = response.json()

            # Extract the response text
            candidates = result.get('candidates', [])
            if not candidates:
                logger.warning("Gemini returned no candidates")
                return None

            content = candidates[0].get('content', {})
            parts = content.get('parts', [])
            if not parts:
                logger.warning("Gemini returned no parts")
                return None

            analysis_text = parts[0].get('text', '')

            if not analysis_text:
                logger.warning("Gemini returned empty response")
                return None

            logger.info(f"Gemini analysis: {analysis_text[:200]}...")

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
            logger.error(f"Gemini Vision error: {e}", exc_info=True)
            return None


class GeminiSpeechService:
    """
    Google Gemini Audio transcription.
    Supports 70+ languages with speaker detection.
    """

    def transcribe(self, audio_content: bytes, language_hint: str = 'en') -> dict:
        """
        Transcribe audio using Gemini.

        Args:
            audio_content: Raw audio bytes
            language_hint: 'en' for English, 'ar' for Arabic

        Returns:
            dict with 'text', 'detected_language', 'confidence'
        """
        if not is_gemini_configured():
            logger.warning("Gemini API key not configured")
            return None

        try:
            # Convert audio to base64
            audio_b64 = base64.b64encode(audio_content).decode('utf-8')

            # Build prompt for transcription
            prompt = f"Transcribe this audio recording. The speaker is likely speaking {language_hint}. Provide only the transcription text, nothing else."

            # Build request payload for Gemini
            payload = {
                "contents": [{
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": "audio/wav",
                                "data": audio_b64
                            }
                        }
                    ]
                }],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 1000
                }
            }

            api_key = _get_api_key()
            url = f"{GEMINI_API_URL}/{AUDIO_MODEL}:generateContent?key={api_key}"

            logger.info(f"Calling Gemini Audio API, audio size: {len(audio_content)} bytes")

            response = requests.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=120
            )

            logger.info(f"Gemini Audio response status: {response.status_code}")

            if response.status_code != 200:
                logger.error(f"Gemini Audio API error: {response.status_code} - {response.text[:500]}")
                return None

            result = response.json()

            # Extract the response text
            candidates = result.get('candidates', [])
            if not candidates:
                logger.warning("Gemini returned no candidates")
                return None

            content = candidates[0].get('content', {})
            parts = content.get('parts', [])
            if not parts:
                logger.warning("Gemini returned no parts")
                return None

            text = parts[0].get('text', '').strip()

            logger.info(f"Gemini transcription: {text[:100]}...")

            return {
                'text': text,
                'detected_language': language_hint,
                'confidence': 0.95
            }

        except Exception as e:
            logger.error(f"Gemini Speech error: {e}", exc_info=True)
            return None

    def transcribe_file(self, file_path: str, language_hint: str = 'en') -> dict:
        """Transcribe audio from a file path."""
        import subprocess

        # Convert to WAV for better results
        wav_path = file_path.rsplit('.', 1)[0] + '_gemini.wav'
        try:
            result = subprocess.run(
                ['ffmpeg', '-i', file_path, '-ar', '16000', '-ac', '1',
                 '-c:a', 'pcm_s16le', '-y', '-loglevel', 'error', wav_path],
                capture_output=True, text=True, timeout=30
            )

            if result.returncode != 0:
                logger.warning(f"Audio conversion failed: {result.stderr[:200]}")
                with open(file_path, 'rb') as f:
                    return self.transcribe(f.read(), language_hint)

            with open(wav_path, 'rb') as f:
                audio_content = f.read()

            return self.transcribe(audio_content, language_hint)

        finally:
            if os.path.exists(wav_path):
                try:
                    os.unlink(wav_path)
                except OSError:
                    pass


# Singleton instances
_vision_service = None
_speech_service = None


def get_vision_service() -> GeminiVisionService:
    """Get or create Vision service singleton."""
    global _vision_service
    if _vision_service is None:
        _vision_service = GeminiVisionService()
    return _vision_service


def get_speech_service() -> GeminiSpeechService:
    """Get or create Speech service singleton."""
    global _speech_service
    if _speech_service is None:
        _speech_service = GeminiSpeechService()
    return _speech_service
