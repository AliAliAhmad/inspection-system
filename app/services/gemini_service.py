"""
Google Gemini AI Service for photo analysis and audio transcription.

Models (with fallback):
- Photo/Video: gemini-3-pro-preview → gemini-2.5-flash (1,500 RPD)
- Audio: gemini-2.5-flash (1,500 RPD)

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

# Photo/Video analysis - try gemini-3-pro-preview first, fallback to gemini-2.5-flash
VISION_MODELS = ["gemini-3-pro-preview", "gemini-2.5-flash"]
VISION_MODEL = VISION_MODELS[0]  # Primary model

# Audio transcription - gemini-2.5-flash (supports audio files via generateContent API)
# Note: Native Audio Dialog is for Live API (real-time) only, not file uploads
AUDIO_MODELS = ["gemini-2.5-flash"]
AUDIO_MODEL = AUDIO_MODELS[0]


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
    Uses gemini-3-pro for highest accuracy (1,500 RPD).
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

            # Build prompt - respond in BOTH English and Arabic, keep SHORT
            if is_reading_question:
                prompt = (
                    "Industrial inspection photo. Extract meter/gauge reading. "
                    "Reply in this EXACT format (2 lines only):\n"
                    "EN: Reading: [number], [condition in 5 words max]\n"
                    "AR: القراءة: [number], [condition in Arabic 5 words max]"
                )
            else:
                prompt = (
                    "Industrial inspection photo. Describe in MAX 1-2 short sentences. "
                    "Reply in this EXACT format (2 lines only):\n"
                    "EN: [Equipment type]. [Condition - good/fair/poor]. [Any defect].\n"
                    "AR: [Same in Arabic]\n"
                    "Example:\n"
                    "EN: Pump motor in good condition. No defects visible.\n"
                    "AR: محرك المضخة في حالة جيدة. لا توجد عيوب مرئية."
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
                    "temperature": 0.2,
                    "maxOutputTokens": 100
                }
            }

            api_key = _get_api_key()

            # Try each model in order until one succeeds
            result = None
            last_error = None
            for model in VISION_MODELS:
                url = f"{GEMINI_API_URL}/{model}:generateContent?key={api_key}"
                logger.info(f"Trying Gemini Vision API with model: {model}")

                try:
                    response = requests.post(
                        url,
                        json=payload,
                        headers={"Content-Type": "application/json"},
                        timeout=60
                    )

                    logger.info(f"Gemini {model} response status: {response.status_code}")

                    if response.status_code == 200:
                        result = response.json()
                        logger.info(f"Success with model: {model}")
                        break
                    else:
                        last_error = f"{response.status_code} - {response.text[:200]}"
                        logger.warning(f"Model {model} failed: {last_error}, trying next...")
                except Exception as e:
                    last_error = str(e)
                    logger.warning(f"Model {model} error: {e}, trying next...")

            if result is None:
                logger.error(f"All vision models failed. Last error: {last_error}")
                return None

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

            import re

            # Parse EN and AR from response
            en_text = analysis_text
            ar_text = analysis_text

            # Try to extract EN: and AR: lines
            en_match = re.search(r'EN:\s*(.+?)(?=\nAR:|$)', analysis_text, re.IGNORECASE | re.DOTALL)
            ar_match = re.search(r'AR:\s*(.+?)(?=\n|$)', analysis_text, re.IGNORECASE | re.DOTALL)

            if en_match:
                en_text = en_match.group(1).strip()
            if ar_match:
                ar_text = ar_match.group(1).strip()

            # If no AR found, use EN for both
            if not ar_match or ar_text == en_text:
                ar_text = en_text  # Will show English if Arabic not generated

            # Extract reading if present
            extracted_reading = None
            if is_reading_question:
                reading_match = re.search(r'Reading:\s*([\d.]+)', analysis_text)
                if reading_match:
                    extracted_reading = reading_match.group(1)
                elif re.search(r'القراءة:\s*([\d.]+)', analysis_text):
                    extracted_reading = re.search(r'القراءة:\s*([\d.]+)', analysis_text).group(1)
                else:
                    numbers = re.findall(r'\d+\.?\d*', analysis_text)
                    if numbers:
                        extracted_reading = max(numbers, key=lambda x: float(x) if x else 0)

            result = {
                'en': en_text,
                'ar': ar_text
            }

            if extracted_reading:
                result['reading'] = extracted_reading

            return result

        except Exception as e:
            logger.error(f"Gemini Vision error: {e}", exc_info=True)
            return None

    def analyze_video(self, video_content: bytes = None, video_url: str = None) -> dict:
        """
        Analyze a video using Gemini Vision.

        Args:
            video_content: Raw video bytes
            video_url: URL of video to analyze (will be downloaded)

        Returns:
            dict with 'en' and 'ar' analysis text
        """
        if not is_gemini_configured():
            logger.warning("Gemini API key not configured")
            return None

        try:
            # Download video if URL provided
            if video_url and not video_content:
                try:
                    response = requests.get(video_url, timeout=60)
                    response.raise_for_status()
                    video_content = response.content
                except Exception as e:
                    logger.error(f"Failed to download video: {e}")
                    return None

            if not video_content:
                logger.error("No video provided")
                return None

            # Check video size (Gemini inline limit is ~20MB)
            if len(video_content) > 20 * 1024 * 1024:
                logger.warning("Video too large for inline analysis (>20MB)")
                return {'en': 'Video too large for analysis', 'ar': 'الفيديو كبير جداً للتحليل'}

            # Convert video to base64
            video_b64 = base64.b64encode(video_content).decode('utf-8')

            # Detect video type
            if video_content[:4] == b'\x00\x00\x00\x1c' or video_content[:4] == b'\x00\x00\x00\x20':
                mime_type = "video/mp4"
            elif video_content[:4] == b'\x1a\x45\xdf\xa3':
                mime_type = "video/webm"
            elif video_content[:3] == b'FLV':
                mime_type = "video/x-flv"
            else:
                mime_type = "video/mp4"  # Default to MP4

            # Build prompt for video analysis
            prompt = (
                "Analyze this industrial inspection video. Describe what you see in MAX 2-3 sentences. "
                "Focus on: equipment condition, any visible defects, safety concerns, or maintenance needs. "
                "Reply in this EXACT format (2 lines only):\n"
                "EN: [Description in English]\n"
                "AR: [Same description in Arabic]\n"
                "Example:\n"
                "EN: Video shows pump motor running with slight vibration. No visible leaks or damage.\n"
                "AR: يظهر الفيديو محرك المضخة يعمل مع اهتزاز طفيف. لا توجد تسريبات أو أضرار مرئية."
            )

            # Build request payload for Gemini
            payload = {
                "contents": [{
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": video_b64
                            }
                        }
                    ]
                }],
                "generationConfig": {
                    "temperature": 0.2,
                    "maxOutputTokens": 200
                }
            }

            api_key = _get_api_key()

            # Try each model in order until one succeeds
            result = None
            last_error = None
            for model in VISION_MODELS:
                url = f"{GEMINI_API_URL}/{model}:generateContent?key={api_key}"
                logger.info(f"Trying Gemini Video API with model: {model}, video size: {len(video_content)} bytes")

                try:
                    response = requests.post(
                        url,
                        json=payload,
                        headers={"Content-Type": "application/json"},
                        timeout=120  # Videos take longer
                    )

                    logger.info(f"Gemini Video {model} response status: {response.status_code}")

                    if response.status_code == 200:
                        result = response.json()
                        logger.info(f"Video analysis success with model: {model}")
                        break
                    else:
                        last_error = f"{response.status_code} - {response.text[:200]}"
                        logger.warning(f"Video model {model} failed: {last_error}, trying next...")
                except Exception as e:
                    last_error = str(e)
                    logger.warning(f"Video model {model} error: {e}, trying next...")

            if result is None:
                logger.error(f"All video models failed. Last error: {last_error}")
                return None

            # Extract the response text
            candidates = result.get('candidates', [])
            if not candidates:
                logger.warning("Gemini returned no candidates for video")
                return None

            content = candidates[0].get('content', {})
            parts = content.get('parts', [])
            if not parts:
                logger.warning("Gemini returned no parts for video")
                return None

            analysis_text = parts[0].get('text', '')

            if not analysis_text:
                logger.warning("Gemini returned empty video response")
                return None

            logger.info(f"Gemini video analysis: {analysis_text[:200]}...")

            import re

            # Parse EN and AR from response
            en_text = analysis_text
            ar_text = analysis_text

            en_match = re.search(r'EN:\s*(.+?)(?=\nAR:|$)', analysis_text, re.IGNORECASE | re.DOTALL)
            ar_match = re.search(r'AR:\s*(.+?)(?=\n|$)', analysis_text, re.IGNORECASE | re.DOTALL)

            if en_match:
                en_text = en_match.group(1).strip()
            if ar_match:
                ar_text = ar_match.group(1).strip()

            if not ar_match or ar_text == en_text:
                ar_text = en_text

            return {
                'en': en_text,
                'ar': ar_text
            }

        except Exception as e:
            logger.error(f"Gemini Video error: {e}", exc_info=True)
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

            # Build prompt for transcription - return both languages
            prompt = (
                f"Transcribe this audio recording (speaker likely {language_hint}). "
                "Return transcription in this EXACT format:\n"
                "EN: [English transcription or translation]\n"
                "AR: [Arabic transcription or translation]"
            )

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

            # Try each audio model in order until one succeeds
            result = None
            last_error = None
            for model in AUDIO_MODELS:
                url = f"{GEMINI_API_URL}/{model}:generateContent?key={api_key}"
                logger.info(f"Trying Gemini Audio API with model: {model}, audio size: {len(audio_content)} bytes")

                try:
                    response = requests.post(
                        url,
                        json=payload,
                        headers={"Content-Type": "application/json"},
                        timeout=120
                    )

                    logger.info(f"Gemini {model} response status: {response.status_code}")

                    if response.status_code == 200:
                        result = response.json()
                        logger.info(f"Audio success with model: {model}")
                        break
                    else:
                        last_error = f"{response.status_code} - {response.text[:200]}"
                        logger.warning(f"Audio model {model} failed: {last_error}, trying next...")
                except Exception as e:
                    last_error = str(e)
                    logger.warning(f"Audio model {model} error: {e}, trying next...")

            if result is None:
                logger.error(f"All audio models failed. Last error: {last_error}")
                return None

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

            import re

            # Parse EN and AR from response
            en_text = text
            ar_text = text

            en_match = re.search(r'EN:\s*(.+?)(?=\nAR:|$)', text, re.IGNORECASE | re.DOTALL)
            ar_match = re.search(r'AR:\s*(.+?)(?=\n|$)', text, re.IGNORECASE | re.DOTALL)

            if en_match:
                en_text = en_match.group(1).strip()
            if ar_match:
                ar_text = ar_match.group(1).strip()

            # If no AR found, use EN for both
            if not ar_match or ar_text == en_text:
                ar_text = en_text

            return {
                'text': text,
                'en': en_text,
                'ar': ar_text,
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
