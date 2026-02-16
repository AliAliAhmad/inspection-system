"""
Hugging Face AI Services for photo analysis and audio transcription.
FREE with no credit card required!

Free tier:
- Unlimited requests (rate limited to ~30/min)
- No credit card needed
- Just need a free API token

Setup:
1. Create account at https://huggingface.co (free, no card)
2. Go to Settings → Access Tokens
3. Create new token (read access is enough)
4. Set HUGGINGFACE_API_KEY env var
"""

import os
import logging
import requests
import base64
import time

logger = logging.getLogger(__name__)

# Hugging Face Inference API endpoints
HF_API_URL = "https://api-inference.huggingface.co/models"

# Models to use
IMAGE_CAPTION_MODEL = "Salesforce/blip-image-captioning-large"  # Good for describing images
IMAGE_CLASSIFICATION_MODEL = "google/vit-base-patch16-224"  # For detecting objects
SPEECH_TO_TEXT_MODEL = "distil-whisper/distil-large-v3"  # 6x faster, free tier compatible


def is_huggingface_configured():
    """Check if Hugging Face API key is configured."""
    key = os.getenv('HUGGINGFACE_API_KEY', '').strip()
    return bool(key) and key.startswith('hf_')


def _get_headers(content_type: str = None):
    """Get API headers with authentication."""
    api_key = os.getenv('HUGGINGFACE_API_KEY', '').strip()
    headers = {"Authorization": f"Bearer {api_key}"}
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def _wait_for_model(model_name: str, max_wait: int = 60):
    """
    Wait for model to load if it's cold starting.
    Hugging Face free tier puts models to sleep after inactivity.
    """
    headers = _get_headers()
    url = f"{HF_API_URL}/{model_name}"

    start_time = time.time()
    while time.time() - start_time < max_wait:
        response = requests.post(url, headers=headers, json={"inputs": "test"})
        if response.status_code == 503:
            # Model is loading
            wait_time = response.json().get('estimated_time', 20)
            logger.info(f"Model {model_name} is loading, waiting {wait_time}s...")
            time.sleep(min(wait_time, 20))
        else:
            return True
    return False


class HuggingFaceVisionService:
    """
    Hugging Face image analysis using BLIP model.
    Generates captions describing what's in the image.
    """

    def analyze_image(self, image_content: bytes = None, image_url: str = None,
                      is_reading_question: bool = False) -> dict:
        """
        Analyze an image using Hugging Face BLIP model.

        Args:
            image_content: Raw image bytes
            image_url: URL of image to analyze (will be downloaded)
            is_reading_question: If True, focus on text/number extraction

        Returns:
            dict with 'en' and 'ar' analysis text, and optional 'reading'
        """
        if not is_huggingface_configured():
            logger.warning("Hugging Face API key not configured")
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
                return None

            # Detect image type from magic bytes
            content_type = "image/jpeg"  # default
            if image_content[:4] == b'\x89PNG':
                content_type = "image/png"
            elif image_content[:2] == b'\xff\xd8':
                content_type = "image/jpeg"
            elif image_content[:4] == b'RIFF' and image_content[8:12] == b'WEBP':
                content_type = "image/webp"

            headers = _get_headers(content_type=content_type)

            # Use image captioning model
            url = f"{HF_API_URL}/{IMAGE_CAPTION_MODEL}"

            logger.info(f"Calling Hugging Face API: {url}")
            logger.info(f"Image size: {len(image_content)} bytes, Content-Type: {content_type}")
            logger.info(f"Headers: Authorization=Bearer hf_***..., Content-Type={content_type}")

            response = requests.post(
                url,
                headers=headers,
                data=image_content,
                timeout=60
            )

            # Log response details
            resp_content_type = response.headers.get('Content-Type', 'unknown')
            logger.info(f"Response Content-Type: {resp_content_type}")

            logger.info(f"Hugging Face response status: {response.status_code}")
            logger.info(f"Hugging Face response: {response.text[:500] if response.text else 'empty'}")

            # Handle model loading
            if response.status_code == 503:
                logger.info("Model is loading, waiting...")
                _wait_for_model(IMAGE_CAPTION_MODEL)
                response = requests.post(
                    url,
                    headers=headers,
                    data=image_content,
                    timeout=60
                )

            if response.status_code != 200:
                logger.error(f"Hugging Face API error: {response.status_code} - {response.text}")
                return None

            # Check for HTML response (indicates auth or API issues)
            resp_ct = response.headers.get('Content-Type', '')
            if 'html' in resp_ct.lower() or response.text.strip().startswith('<!DOCTYPE'):
                logger.error(f"Hugging Face returned HTML instead of JSON. Check API key format (should start with hf_)")
                logger.error(f"Response preview: {response.text[:300]}")
                return None

            result = response.json()

            # BLIP returns a list with generated_text
            if isinstance(result, list) and len(result) > 0:
                caption = result[0].get('generated_text', '')
            else:
                caption = str(result)

            logger.info(f"Hugging Face caption: {caption}")

            # For reading questions, try to extract numbers
            extracted_reading = None
            if is_reading_question:
                import re
                numbers = re.findall(r'\d+\.?\d*', caption)
                if numbers:
                    extracted_reading = max(numbers, key=lambda x: float(x) if x else 0)

            # Build response — use TranslationService for proper Arabic
            en_text = self._enhance_caption(caption)
            try:
                from app.services.translation_service import TranslationService
                ar_text = TranslationService.translate_to_arabic(en_text) or en_text
            except Exception:
                # Fall back to dictionary translation
                ar_text = self._translate_to_arabic(en_text)

            result = {'en': en_text, 'ar': ar_text}
            if extracted_reading:
                result['reading'] = extracted_reading

            return result

        except Exception as e:
            logger.error(f"Hugging Face Vision error: {e}", exc_info=True)
            return None

    def _enhance_caption(self, caption: str) -> str:
        """Enhance the caption for inspection context."""
        if not caption:
            return "Unable to analyze image"

        # Add inspection context
        caption = caption.strip()
        if not caption[0].isupper():
            caption = caption.capitalize()

        # Check for potential issues in caption
        issue_words = ['damage', 'rust', 'crack', 'leak', 'broken', 'wear', 'corrosion']
        has_issues = any(word in caption.lower() for word in issue_words)

        if has_issues:
            return f"Inspection finding: {caption}. Potential issues detected."
        else:
            return f"Equipment observation: {caption}. No obvious defects visible."

    def _translate_to_arabic(self, text: str) -> str:
        """Simple translation of common inspection terms to Arabic."""
        translations = {
            'Equipment observation': 'ملاحظة المعدات',
            'Inspection finding': 'نتيجة الفحص',
            'No obvious defects visible': 'لا توجد عيوب واضحة',
            'Potential issues detected': 'تم اكتشاف مشاكل محتملة',
            'damage': 'تلف',
            'rust': 'صدأ',
            'crack': 'شرخ',
            'leak': 'تسرب',
            'broken': 'مكسور',
            'wear': 'تآكل',
            'corrosion': 'تآكل',
            'pipe': 'أنبوب',
            'valve': 'صمام',
            'pump': 'مضخة',
            'motor': 'محرك',
            'gauge': 'مقياس',
            'meter': 'عداد',
        }

        result = text
        for en, ar in translations.items():
            result = result.replace(en, ar)

        return result


class HuggingFaceSpeechService:
    """
    Hugging Face Speech-to-Text using Whisper model.
    """

    def transcribe(self, audio_content: bytes, language_hint: str = 'en') -> dict:
        """
        Transcribe audio using Hugging Face Whisper model.

        Args:
            audio_content: Raw audio bytes (WAV format preferred)
            language_hint: 'en' for English, 'ar' for Arabic

        Returns:
            dict with 'text', 'detected_language', 'confidence'
        """
        if not is_huggingface_configured():
            logger.warning("Hugging Face API key not configured")
            return None

        try:
            headers = _get_headers(content_type="audio/wav")
            url = f"{HF_API_URL}/{SPEECH_TO_TEXT_MODEL}"

            logger.info(f"Calling Hugging Face Speech API: {url}")
            logger.info(f"Audio size: {len(audio_content)} bytes")

            response = requests.post(
                url,
                headers=headers,
                data=audio_content,
                timeout=120  # Longer timeout for audio
            )

            logger.info(f"HF Speech response status: {response.status_code}")

            # Handle model loading
            if response.status_code == 503:
                logger.info("Whisper model is loading, waiting...")
                _wait_for_model(SPEECH_TO_TEXT_MODEL, max_wait=120)
                response = requests.post(
                    url,
                    headers=headers,
                    data=audio_content,
                    timeout=120
                )

            if response.status_code != 200:
                logger.error(f"Hugging Face Speech API error: {response.status_code}")
                logger.error(f"Response: {response.text[:500] if response.text else 'empty'}")
                return None

            # Check if response is JSON or HTML
            content_type = response.headers.get('Content-Type', '')
            if 'html' in content_type.lower():
                logger.error(f"Hugging Face returned HTML instead of JSON. Check API token.")
                return None

            result = response.json()

            # Whisper returns {"text": "..."}
            text = result.get('text', '') if isinstance(result, dict) else str(result)
            text = text.strip()

            logger.info(f"Hugging Face transcription: {text[:100]}...")

            return {
                'text': text,
                'detected_language': language_hint,  # HF doesn't return language
                'confidence': 0.9  # HF doesn't return confidence
            }

        except Exception as e:
            logger.error(f"Hugging Face Speech error: {e}")
            return None

    def transcribe_file(self, file_path: str, language_hint: str = 'en') -> dict:
        """
        Transcribe audio from a file path.
        Converts to WAV format for better results.
        """
        import subprocess
        import os

        # Convert to WAV with correct format
        wav_path = file_path.rsplit('.', 1)[0] + '_hf.wav'
        try:
            result = subprocess.run(
                ['ffmpeg', '-i', file_path, '-ar', '16000', '-ac', '1',
                 '-c:a', 'pcm_s16le', '-y', '-loglevel', 'error', wav_path],
                capture_output=True, text=True, timeout=30
            )

            if result.returncode != 0:
                logger.warning(f"Audio conversion failed: {result.stderr[:200]}")
                # Try with original file
                with open(file_path, 'rb') as f:
                    return self.transcribe(f.read(), language_hint)

            with open(wav_path, 'rb') as f:
                audio_content = f.read()

            return self.transcribe(audio_content, language_hint)

        finally:
            # Cleanup
            if os.path.exists(wav_path):
                try:
                    os.unlink(wav_path)
                except OSError:
                    pass


# Singleton instances
_vision_service = None
_speech_service = None


def get_vision_service() -> HuggingFaceVisionService:
    """Get or create Vision service singleton."""
    global _vision_service
    if _vision_service is None:
        _vision_service = HuggingFaceVisionService()
    return _vision_service


def get_speech_service() -> HuggingFaceSpeechService:
    """Get or create Speech service singleton."""
    global _speech_service
    if _speech_service is None:
        _speech_service = HuggingFaceSpeechService()
    return _speech_service
