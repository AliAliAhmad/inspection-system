"""
Groq Vision Service for photo analysis and audio transcription.
Uses Llama 3.2 Vision - fast inference with good quality.

Free tier: Generous free limits, no credit card needed.
Setup:
1. Create account at https://console.groq.com (free)
2. Get API key from dashboard
3. Set GROQ_API_KEY env var
"""

import os
import logging
import requests
import base64

logger = logging.getLogger(__name__)

# Groq API endpoints
GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_AUDIO_URL = "https://api.groq.com/openai/v1/audio/transcriptions"

# Vision model
VISION_MODEL = "llama-3.2-11b-vision-preview"

# Audio model (Whisper)
AUDIO_MODEL = "whisper-large-v3"


def is_groq_configured():
    """Check if Groq API key is configured."""
    key = os.getenv('GROQ_API_KEY', '').strip()
    return bool(key)


def _get_headers():
    """Get API headers with authentication."""
    api_key = os.getenv('GROQ_API_KEY', '').strip()
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }


class GroqVisionService:
    """
    Groq Vision using Llama 3.2 11B Vision model.
    Very fast inference with good quality.
    """

    def analyze_image(self, image_content: bytes = None, image_url: str = None,
                      is_reading_question: bool = False) -> dict:
        """
        Analyze an image using Groq Llama Vision.

        Args:
            image_content: Raw image bytes
            image_url: URL of image to analyze
            is_reading_question: If True, focus on text/number extraction

        Returns:
            dict with 'en' and 'ar' analysis text, and optional 'reading'
        """
        if not is_groq_configured():
            logger.warning("Groq API key not configured")
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

            logger.info(f"Calling Groq Vision API with model: {VISION_MODEL}")

            response = requests.post(
                GROQ_CHAT_URL,
                headers=_get_headers(),
                json=payload,
                timeout=30  # Groq is fast
            )

            logger.info(f"Groq response status: {response.status_code}")

            if response.status_code != 200:
                logger.error(f"Groq API error: {response.status_code} - {response.text[:500]}")
                return None

            result = response.json()

            # Extract the response text
            analysis_text = result.get('choices', [{}])[0].get('message', {}).get('content', '')

            if not analysis_text:
                logger.warning("Groq returned empty response")
                return None

            logger.info(f"Groq analysis: {analysis_text[:200]}...")

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
            logger.error(f"Groq Vision error: {e}", exc_info=True)
            return None


class GroqSpeechService:
    """
    Groq Speech-to-Text using Whisper model.
    Very fast transcription.
    """

    def transcribe(self, audio_content: bytes, language_hint: str = 'en') -> dict:
        """
        Transcribe audio using Groq Whisper.

        Args:
            audio_content: Raw audio bytes
            language_hint: 'en' for English, 'ar' for Arabic

        Returns:
            dict with 'text', 'detected_language', 'confidence'
        """
        if not is_groq_configured():
            logger.warning("Groq API key not configured")
            return None

        try:
            api_key = os.getenv('GROQ_API_KEY', '').strip()
            headers = {"Authorization": f"Bearer {api_key}"}

            # Groq expects multipart form data
            files = {
                'file': ('audio.wav', audio_content, 'audio/wav'),
            }
            data = {
                'model': AUDIO_MODEL,
                'language': language_hint if language_hint in ('en', 'ar') else 'en',
                'response_format': 'json'
            }

            logger.info(f"Calling Groq Audio API, audio size: {len(audio_content)} bytes")

            response = requests.post(
                GROQ_AUDIO_URL,
                headers=headers,
                files=files,
                data=data,
                timeout=60
            )

            logger.info(f"Groq Audio response status: {response.status_code}")

            if response.status_code != 200:
                logger.error(f"Groq Audio API error: {response.status_code} - {response.text[:500]}")
                return None

            result = response.json()
            text = result.get('text', '').strip()

            logger.info(f"Groq transcription: {text[:100]}...")

            return {
                'text': text,
                'detected_language': language_hint,
                'confidence': 0.95  # Groq doesn't return confidence
            }

        except Exception as e:
            logger.error(f"Groq Speech error: {e}", exc_info=True)
            return None

    def transcribe_file(self, file_path: str, language_hint: str = 'en') -> dict:
        """Transcribe audio from a file path."""
        import subprocess

        # Convert to WAV for better results
        wav_path = file_path.rsplit('.', 1)[0] + '_groq.wav'
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


def get_vision_service() -> GroqVisionService:
    """Get or create Vision service singleton."""
    global _vision_service
    if _vision_service is None:
        _vision_service = GroqVisionService()
    return _vision_service


def get_speech_service() -> GroqSpeechService:
    """Get or create Speech service singleton."""
    global _speech_service
    if _speech_service is None:
        _speech_service = GroqSpeechService()
    return _speech_service
