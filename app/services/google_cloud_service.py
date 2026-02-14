"""
Google Cloud AI Services for photo analysis and audio transcription.
Uses Cloud Vision API and Speech-to-Text API.

Free tier:
- Vision API: 1,000 images/month
- Speech-to-Text: 60 minutes/month

Setup:
1. Create project at https://console.cloud.google.com
2. Enable "Cloud Vision API" and "Cloud Speech-to-Text API"
3. Create service account and download JSON key
4. Set GOOGLE_APPLICATION_CREDENTIALS env var to path of JSON key
   OR set GOOGLE_CLOUD_KEY_JSON env var to the JSON content
"""

import os
import json
import logging
import base64
import tempfile

logger = logging.getLogger(__name__)


def _get_google_credentials():
    """
    Get Google Cloud credentials from environment.
    Supports both file path and inline JSON.
    """
    # Option 1: JSON key file path
    creds_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    if creds_path and os.path.exists(creds_path):
        return creds_path

    # Option 2: Inline JSON (for Render/Heroku)
    creds_json = os.getenv('GOOGLE_CLOUD_KEY_JSON')
    if creds_json:
        try:
            # Write to temp file for Google client libraries
            creds_data = json.loads(creds_json)
            tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
            json.dump(creds_data, tmp)
            tmp.close()
            os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = tmp.name
            return tmp.name
        except Exception as e:
            logger.error(f"Failed to parse GOOGLE_CLOUD_KEY_JSON: {e}")
            return None

    return None


def is_google_cloud_configured():
    """Check if Google Cloud credentials are configured."""
    creds_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    creds_json = os.getenv('GOOGLE_CLOUD_KEY_JSON')
    return bool(creds_path or creds_json)


class GoogleVisionService:
    """
    Google Cloud Vision API for image analysis.
    Detects labels, text, objects, and safety attributes.
    """

    def __init__(self):
        self.client = None
        self._init_client()

    def _init_client(self):
        """Initialize the Vision API client."""
        try:
            _get_google_credentials()
            from google.cloud import vision
            self.client = vision.ImageAnnotatorClient()
            logger.info("Google Vision API client initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Google Vision client: {e}")
            self.client = None

    def analyze_image(self, image_content: bytes = None, image_url: str = None,
                      is_reading_question: bool = False) -> dict:
        """
        Analyze an image using Google Cloud Vision API.

        Args:
            image_content: Raw image bytes
            image_url: URL of image to analyze
            is_reading_question: If True, focus on text/number extraction

        Returns:
            dict with 'en' and 'ar' analysis text, and optional 'reading' for meters
        """
        if not self.client:
            logger.warning("Google Vision client not initialized")
            return None

        try:
            from google.cloud import vision

            # Build image object
            image = vision.Image()
            if image_content:
                image.content = image_content
            elif image_url:
                image.source = vision.ImageSource(image_uri=image_url)
            else:
                return None

            # Choose features based on question type
            if is_reading_question:
                # For meter/gauge readings, focus on text detection
                features = [
                    vision.Feature(type_=vision.Feature.Type.TEXT_DETECTION),
                    vision.Feature(type_=vision.Feature.Type.DOCUMENT_TEXT_DETECTION),
                ]
            else:
                # For general inspection, detect labels and objects
                features = [
                    vision.Feature(type_=vision.Feature.Type.LABEL_DETECTION, max_results=10),
                    vision.Feature(type_=vision.Feature.Type.OBJECT_LOCALIZATION, max_results=5),
                    vision.Feature(type_=vision.Feature.Type.TEXT_DETECTION),
                    vision.Feature(type_=vision.Feature.Type.SAFE_SEARCH_DETECTION),
                ]

            request = vision.AnnotateImageRequest(image=image, features=features)
            response = self.client.annotate_image(request=request)

            # Process response
            if is_reading_question:
                return self._process_reading_response(response)
            else:
                return self._process_inspection_response(response)

        except Exception as e:
            logger.error(f"Google Vision API error: {e}")
            return None

    def _process_reading_response(self, response) -> dict:
        """Process response for meter/gauge reading extraction."""
        reading = None
        text_found = ""

        # Get full text
        if response.full_text_annotation:
            text_found = response.full_text_annotation.text.strip()
        elif response.text_annotations:
            text_found = response.text_annotations[0].description.strip()

        # Extract numbers from text
        import re
        numbers = re.findall(r'\d+\.?\d*', text_found)
        if numbers:
            # Take the largest number (likely the meter reading)
            reading = max(numbers, key=lambda x: float(x))

        en_text = f"Detected reading: {reading}" if reading else f"Text found: {text_found[:100]}" if text_found else "No readable text detected"
        ar_text = f"القراءة المكتشفة: {reading}" if reading else f"النص الموجود: {text_found[:100]}" if text_found else "لم يتم اكتشاف نص قابل للقراءة"

        result = {'en': en_text, 'ar': ar_text}
        if reading:
            result['reading'] = reading

        return result

    def _process_inspection_response(self, response) -> dict:
        """Process response for general inspection analysis."""
        findings = []

        # Process labels (what's in the image)
        if response.label_annotations:
            labels = [label.description for label in response.label_annotations[:5]]
            if labels:
                findings.append(f"Detected: {', '.join(labels)}")

        # Process objects
        if response.localized_object_annotations:
            objects = [obj.name for obj in response.localized_object_annotations[:3]]
            if objects:
                findings.append(f"Objects: {', '.join(objects)}")

        # Process text (might indicate labels, warnings, etc.)
        if response.text_annotations:
            text = response.text_annotations[0].description[:100]
            if text.strip():
                findings.append(f"Text visible: {text}")

        # Check for potential issues based on labels
        issue_keywords = ['damage', 'rust', 'corrosion', 'leak', 'crack', 'wear', 'broken', 'defect']
        labels_lower = [l.description.lower() for l in (response.label_annotations or [])]
        issues = [kw for kw in issue_keywords if any(kw in label for label in labels_lower)]
        if issues:
            findings.append(f"Potential issues: {', '.join(issues)}")

        if not findings:
            findings.append("Equipment appears to be in normal condition")

        en_text = ". ".join(findings)

        # Simple Arabic translation for common terms
        ar_text = en_text
        translations = {
            'Detected': 'تم اكتشاف',
            'Objects': 'الكائنات',
            'Text visible': 'النص المرئي',
            'Potential issues': 'مشاكل محتملة',
            'Equipment appears to be in normal condition': 'يبدو أن المعدات في حالة طبيعية',
            'damage': 'تلف',
            'rust': 'صدأ',
            'corrosion': 'تآكل',
            'leak': 'تسرب',
            'crack': 'شرخ',
            'wear': 'تآكل',
            'broken': 'مكسور',
            'defect': 'عيب',
        }
        for en, ar in translations.items():
            ar_text = ar_text.replace(en, ar)

        return {'en': en_text, 'ar': ar_text}


class GoogleSpeechService:
    """
    Google Cloud Speech-to-Text API for audio transcription.
    Supports English and Arabic.
    """

    def __init__(self):
        self.client = None
        self._init_client()

    def _init_client(self):
        """Initialize the Speech-to-Text client."""
        try:
            _get_google_credentials()
            from google.cloud import speech
            self.client = speech.SpeechClient()
            logger.info("Google Speech-to-Text client initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Google Speech client: {e}")
            self.client = None

    def transcribe(self, audio_content: bytes, language_hint: str = 'en',
                   sample_rate: int = 16000) -> dict:
        """
        Transcribe audio using Google Cloud Speech-to-Text.

        Args:
            audio_content: Raw audio bytes (WAV, FLAC, or other supported format)
            language_hint: 'en' for English, 'ar' for Arabic
            sample_rate: Audio sample rate in Hz

        Returns:
            dict with 'text', 'detected_language', 'confidence'
        """
        if not self.client:
            logger.warning("Google Speech client not initialized")
            return None

        try:
            from google.cloud import speech

            # Configure audio
            audio = speech.RecognitionAudio(content=audio_content)

            # Map language hint to Google language code
            language_codes = {
                'en': 'en-US',
                'ar': 'ar-SA',
                'auto': 'en-US',  # Default to English
            }
            primary_language = language_codes.get(language_hint, 'en-US')

            # Configure recognition
            config = speech.RecognitionConfig(
                encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
                sample_rate_hertz=sample_rate,
                language_code=primary_language,
                alternative_language_codes=['ar-SA'] if primary_language == 'en-US' else ['en-US'],
                enable_automatic_punctuation=True,
                model='default',
                # Add industrial vocabulary hints
                speech_contexts=[
                    speech.SpeechContext(
                        phrases=[
                            'bearing', 'valve', 'pump', 'motor', 'compressor',
                            'gasket', 'leak', 'corrosion', 'vibration', 'alignment',
                            'lubrication', 'pressure', 'temperature', 'RPM',
                            'voltage', 'amperage', 'insulation', 'winding',
                            'inspection', 'defect', 'maintenance', 'equipment'
                        ],
                        boost=10.0
                    )
                ],
            )

            # Perform transcription
            response = self.client.recognize(config=config, audio=audio)

            if not response.results:
                logger.warning("No transcription results returned")
                return {'text': '', 'detected_language': 'unknown', 'confidence': 0}

            # Get the best result
            result = response.results[0]
            transcript = result.alternatives[0].transcript
            confidence = result.alternatives[0].confidence
            detected_lang = getattr(result, 'language_code', primary_language)

            return {
                'text': transcript,
                'detected_language': 'ar' if 'ar' in detected_lang else 'en',
                'confidence': confidence
            }

        except Exception as e:
            logger.error(f"Google Speech-to-Text error: {e}")
            return None

    def transcribe_file(self, file_path: str, language_hint: str = 'en') -> dict:
        """
        Transcribe audio from a file path.
        Converts to appropriate format if needed.
        """
        import subprocess

        # Convert to WAV with correct format for Google Speech
        wav_path = file_path.rsplit('.', 1)[0] + '_google.wav'
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

            return self.transcribe(audio_content, language_hint, sample_rate=16000)

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


def get_vision_service() -> GoogleVisionService:
    """Get or create Vision service singleton."""
    global _vision_service
    if _vision_service is None:
        _vision_service = GoogleVisionService()
    return _vision_service


def get_speech_service() -> GoogleSpeechService:
    """Get or create Speech service singleton."""
    global _speech_service
    if _speech_service is None:
        _speech_service = GoogleSpeechService()
    return _speech_service
