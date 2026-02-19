"""
SambaNova AI Services for photo analysis and audio transcription.
FREE tier - no credit card required.

Free tier limits:
- Llama-4-Maverick (vision): 20 RPM, 40 RPD
- Whisper-Large-v3 (audio): 40 RPM, 40 RPD

Setup:
1. Create account at https://cloud.sambanova.ai (free, no card)
2. Get API key from dashboard
3. Set SAMBANOVA_API_KEY env var
"""

import os
import logging
import requests
import base64

logger = logging.getLogger(__name__)


def _parse_bilingual(text):
    """Parse 'EN: ... / AR: ...' format. Returns (en_text, ar_text)."""
    import re
    en_match = re.search(r'EN:\s*(.+)', text)
    ar_match = re.search(r'AR:\s*(.+)', text)
    en = en_match.group(1).strip() if en_match else None
    ar = ar_match.group(1).strip() if ar_match else None
    return en, ar


# SambaNova API endpoints (OpenAI-compatible)
SAMBANOVA_CHAT_URL = "https://api.sambanova.ai/v1/chat/completions"
SAMBANOVA_AUDIO_URL = "https://api.sambanova.ai/v1/audio/transcriptions"

# Vision model (free tier)
VISION_MODEL = "Llama-4-Maverick-17B-128E-Instruct"

# Audio model (free tier)
AUDIO_MODEL = "Whisper-Large-v3"


def is_sambanova_configured():
    """Check if SambaNova API key is configured."""
    key = os.getenv('SAMBANOVA_API_KEY', '').strip()
    return bool(key)


def _get_headers():
    """Get API headers with authentication."""
    api_key = os.getenv('SAMBANOVA_API_KEY', '').strip()
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }


class SambaNovaVisionService:
    """
    SambaNova Vision using Llama 4 Maverick.
    Free tier: 20 RPM, 40 RPD.
    """

    def analyze_image(self, image_content: bytes = None, image_url: str = None,
                      is_reading_question: bool = False) -> dict:
        """
        Analyze an image using SambaNova Llama Vision.

        Args:
            image_content: Raw image bytes
            image_url: URL of image to analyze
            is_reading_question: If True, focus on text/number extraction

        Returns:
            dict with 'en' and 'ar' analysis text, and optional 'reading'
        """
        if not is_sambanova_configured():
            logger.warning("SambaNova API key not configured")
            return None

        try:
            # Convert image to base64 if we have bytes
            if image_content:
                image_b64 = base64.b64encode(image_content).decode('utf-8')
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

            # BILINGUAL (EN + AR)
            if is_reading_question:
                prompt = (
                    "This is a photo of a meter, gauge, counter, or numeric display on industrial equipment. "
                    "Your ONLY task is to extract the numeric reading shown. "
                    "Do NOT check for defects or equipment condition. "
                    "Look carefully at all dials, digital displays, analog gauges, and counter wheels. "
                    "Extract the exact number displayed. "
                    "If multiple numbers visible, extract the main reading. "
                    "Reply in this EXACT format (2 lines):\n"
                    "EN: Reading: [number if found]. [condition in English]\n"
                    "AR: القراءة: [number if found]. [condition in Arabic]"
                )
            else:
                prompt = (
                    "This is an industrial equipment inspection photo. "
                    "Describe in MAX 1-2 short sentences. "
                    "Reply in this EXACT format (2 lines only):\n"
                    "EN: [Equipment type]. [Condition - good/fair/poor]. [Any defect].\n"
                    "AR: [Same description in Arabic]\n"
                    "Example:\n"
                    "EN: Pump motor in good condition. No defects visible.\n"
                    "AR: محرك المضخة في حالة جيدة. لا توجد عيوب مرئية."
                )

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

            logger.info(f"Calling SambaNova Vision API with model: {VISION_MODEL}")

            response = requests.post(
                SAMBANOVA_CHAT_URL,
                headers=_get_headers(),
                json=payload,
                timeout=60
            )

            logger.info(f"SambaNova response status: {response.status_code}")

            if response.status_code != 200:
                logger.error(f"SambaNova API error: {response.status_code} - {response.text[:500]}")
                return None

            result = response.json()
            analysis_text = result.get('choices', [{}])[0].get('message', {}).get('content', '')

            if not analysis_text:
                logger.warning("SambaNova returned empty response")
                return None

            logger.info(f"SambaNova analysis: {analysis_text[:200]}...")

            extracted_reading = None
            if is_reading_question:
                import re
                reading_match = re.search(r'Reading:\s*([\d.]+)', analysis_text)
                if reading_match:
                    extracted_reading = reading_match.group(1)
                else:
                    numbers = re.findall(r'\d+\.?\d*', analysis_text)
                    if numbers:
                        extracted_reading = max(numbers, key=lambda x: float(x) if x else 0)

            # Parse bilingual EN/AR response; if Arabic missing, translate
            en_text, ar_text = _parse_bilingual(analysis_text)
            en_text = en_text or analysis_text
            if not ar_text:
                try:
                    from app.services.translation_service import TranslationService
                    ar_text = TranslationService.translate_to_arabic(en_text) or en_text
                except Exception:
                    ar_text = en_text

            result = {
                'en': en_text,
                'ar': ar_text
            }

            if extracted_reading:
                result['reading'] = extracted_reading

            return result

        except Exception as e:
            logger.error(f"SambaNova Vision error: {e}", exc_info=True)
            return None


class SambaNovaSpeechService:
    """
    SambaNova Speech-to-Text using Whisper Large v3.
    Free tier: 40 RPM, 40 RPD.
    """

    def transcribe(self, audio_content: bytes, language_hint: str = 'en') -> dict:
        """
        Transcribe audio using SambaNova Whisper.

        Args:
            audio_content: Raw audio bytes
            language_hint: 'en' for English, 'ar' for Arabic

        Returns:
            dict with 'text', 'detected_language', 'confidence'
        """
        if not is_sambanova_configured():
            logger.warning("SambaNova API key not configured")
            return None

        try:
            api_key = os.getenv('SAMBANOVA_API_KEY', '').strip()
            headers = {"Authorization": f"Bearer {api_key}"}

            files = {
                'file': ('audio.wav', audio_content, 'audio/wav'),
            }
            data = {
                'model': AUDIO_MODEL,
                'language': language_hint if language_hint in ('en', 'ar') else 'en',
                'response_format': 'json'
            }

            logger.info(f"Calling SambaNova Audio API, audio size: {len(audio_content)} bytes")

            response = requests.post(
                SAMBANOVA_AUDIO_URL,
                headers=headers,
                files=files,
                data=data,
                timeout=60
            )

            logger.info(f"SambaNova Audio response status: {response.status_code}")

            if response.status_code != 200:
                logger.error(f"SambaNova Audio API error: {response.status_code} - {response.text[:500]}")
                return None

            result = response.json()
            text = result.get('text', '').strip()

            logger.info(f"SambaNova transcription: {text[:100]}...")

            return {
                'text': text,
                'detected_language': language_hint,
                'confidence': 0.95
            }

        except Exception as e:
            logger.error(f"SambaNova Speech error: {e}", exc_info=True)
            return None

    def transcribe_file(self, file_path: str, language_hint: str = 'en') -> dict:
        """Transcribe audio from a file path."""
        import subprocess

        wav_path = file_path.rsplit('.', 1)[0] + '_samba.wav'
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


def get_vision_service() -> SambaNovaVisionService:
    """Get or create Vision service singleton."""
    global _vision_service
    if _vision_service is None:
        _vision_service = SambaNovaVisionService()
    return _vision_service


def get_speech_service() -> SambaNovaSpeechService:
    """Get or create Speech service singleton."""
    global _speech_service
    if _speech_service is None:
        _speech_service = SambaNovaSpeechService()
    return _speech_service
