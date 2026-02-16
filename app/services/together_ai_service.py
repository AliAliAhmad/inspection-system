"""
Together AI Vision and Speech Services.
Uses Llama 3.2 90B Vision (highest quality) and Whisper Large v3 (15x faster than OpenAI).

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


def _parse_bilingual(text):
    """Parse 'EN: ... / AR: ...' format. Returns (en_text, ar_text)."""
    import re
    en_match = re.search(r'EN:\s*(.+)', text)
    ar_match = re.search(r'AR:\s*(.+)', text)
    en = en_match.group(1).strip() if en_match else None
    ar = ar_match.group(1).strip() if ar_match else None
    return en, ar


# Together AI API endpoints
TOGETHER_CHAT_URL = "https://api.together.xyz/v1/chat/completions"
TOGETHER_AUDIO_URL = "https://api.together.xyz/v1/audio/transcriptions"

# Vision models (ordered by quality)
VISION_MODELS = [
    "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",  # Best, supports video
    "Qwen/Qwen3-VL-32B-Instruct",                          # High quality vision
    "Qwen/Qwen3-VL-8B-Instruct",                           # Fast, good quality
]
VISION_MODEL = VISION_MODELS[0]

# Best audio model
AUDIO_MODEL = "openai/whisper-large-v3"


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

            # Build prompt — BILINGUAL (EN + AR)
            if is_reading_question:
                prompt = (
                    "This is an industrial equipment inspection photo. "
                    "Look for any meter readings, gauge values, or numeric displays. "
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

            # Try each vision model until one works
            analysis_text = None
            for model in VISION_MODELS:
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

                logger.info(f"Calling Together AI Vision API with model: {model}")

                try:
                    response = requests.post(
                        TOGETHER_CHAT_URL,
                        headers=_get_headers(),
                        json=payload,
                        timeout=60
                    )

                    logger.info(f"Together AI {model} response status: {response.status_code}")

                    if response.status_code == 200:
                        result = response.json()
                        analysis_text = result.get('choices', [{}])[0].get('message', {}).get('content', '')
                        if analysis_text:
                            logger.info(f"Together AI success with model: {model}")
                            break
                    else:
                        logger.warning(f"Together AI {model} failed: {response.status_code}, trying next...")
                except Exception as e:
                    logger.warning(f"Together AI {model} error: {e}, trying next...")

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

            # Parse bilingual EN/AR response; if Arabic missing, use English
            en_text, ar_text = _parse_bilingual(analysis_text)
            en_text = en_text or analysis_text
            ar_text = ar_text or en_text

            result = {
                'en': en_text,
                'ar': ar_text
            }

            if extracted_reading:
                result['reading'] = extracted_reading

            return result

        except Exception as e:
            logger.error(f"Together AI Vision error: {e}", exc_info=True)
            return None


class TogetherSpeechService:
    """
    Together AI Speech-to-Text using Whisper Large v3.
    15x faster than OpenAI with same accuracy.
    """

    def transcribe(self, audio_content: bytes, language_hint: str = 'en') -> dict:
        """
        Transcribe audio using Together AI Whisper.

        Args:
            audio_content: Raw audio bytes
            language_hint: 'en' for English, 'ar' for Arabic

        Returns:
            dict with 'text', 'detected_language', 'confidence'
        """
        if not is_together_configured():
            logger.warning("Together AI API key not configured")
            return None

        try:
            api_key = os.getenv('TOGETHER_API_KEY', '').strip()
            headers = {"Authorization": f"Bearer {api_key}"}

            # Together AI expects multipart form data
            files = {
                'file': ('audio.wav', audio_content, 'audio/wav'),
            }
            data = {
                'model': AUDIO_MODEL,
            }
            if language_hint in ('en', 'ar'):
                data['language'] = language_hint

            logger.info(f"Calling Together AI Audio API, audio size: {len(audio_content)} bytes")

            response = requests.post(
                TOGETHER_AUDIO_URL,
                headers=headers,
                files=files,
                data=data,
                timeout=60
            )

            logger.info(f"Together AI Audio response status: {response.status_code}")

            if response.status_code != 200:
                logger.error(f"Together AI Audio API error: {response.status_code} - {response.text[:500]}")
                return None

            result = response.json()
            text = result.get('text', '').strip()

            logger.info(f"Together AI transcription: {text[:100]}...")

            return {
                'text': text,
                'detected_language': language_hint,
                'confidence': 0.95
            }

        except Exception as e:
            logger.error(f"Together AI Speech error: {e}", exc_info=True)
            return None

    def transcribe_file(self, file_path: str, language_hint: str = 'en') -> dict:
        """Transcribe audio from a file path."""
        import subprocess

        # Convert to WAV for better results
        wav_path = file_path.rsplit('.', 1)[0] + '_together.wav'
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


def get_vision_service() -> TogetherVisionService:
    """Get or create Vision service singleton."""
    global _vision_service
    if _vision_service is None:
        _vision_service = TogetherVisionService()
    return _vision_service


def get_speech_service() -> TogetherSpeechService:
    """Get or create Speech service singleton."""
    global _speech_service
    if _speech_service is None:
        _speech_service = TogetherSpeechService()
    return _speech_service
