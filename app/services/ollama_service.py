"""
Ollama Local AI Services - 100% FREE, 100% Private.
All processing happens locally, no data sent externally.

Supports:
- Vision: llama3.2-vision, gemma3, qwen2.5-vl
- Audio: whisper (via whisper.cpp)
- Text: llama3.1, gemma3, mistral, deepseek

Setup:
1. Install Ollama: brew install ollama (Mac) or curl -fsSL https://ollama.com/install.sh | sh (Linux)
2. Pull models: ollama pull llama3.2-vision:11b
3. Start server: ollama serve (runs on localhost:11434)
4. Set OLLAMA_HOST env var if not default (optional)
"""

import os
import logging
import requests
import base64

logger = logging.getLogger(__name__)

# Ollama API endpoint (default localhost)
OLLAMA_HOST = os.getenv('OLLAMA_HOST', 'http://localhost:11434')
OLLAMA_API_URL = f"{OLLAMA_HOST}/api"

# Vision models (in order of preference)
VISION_MODELS = [
    "llama3.2-vision:11b",   # Best quality vision
    "llama3.2-vision",       # Default vision
    "gemma3:4b",             # Lightweight multimodal
    "qwen2.5-vl:7b",         # Qwen vision
]

# Text models (in order of preference)
TEXT_MODELS = [
    "llama3.1:8b",           # Good balance
    "gemma3:4b",             # Fast
    "mistral:7b",            # Good for translation
    "deepseek-r1:7b",        # Reasoning
]

# Audio models
AUDIO_MODELS = [
    "whisper",               # Whisper transcription
]


def is_ollama_configured():
    """Check if Ollama server is running and accessible."""
    try:
        response = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=2)
        return response.status_code == 200
    except Exception:
        return False


def get_available_models():
    """Get list of models available in local Ollama."""
    try:
        response = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=5)
        if response.status_code == 200:
            data = response.json()
            return [m.get('name') for m in data.get('models', [])]
        return []
    except Exception as e:
        logger.warning(f"Failed to get Ollama models: {e}")
        return []


def _find_available_model(preferred_models: list) -> str:
    """Find first available model from preferred list."""
    available = get_available_models()
    for model in preferred_models:
        # Check exact match or partial match
        for avail in available:
            if model in avail or avail.startswith(model.split(':')[0]):
                return avail
    return None


class OllamaVisionService:
    """
    Ollama Vision using local Llama/Gemma models.
    100% FREE, 100% private - no data leaves your machine.
    """

    def analyze_image(self, image_content: bytes = None, image_url: str = None,
                      is_reading_question: bool = False) -> dict:
        """
        Analyze an image using local Ollama vision model.

        Args:
            image_content: Raw image bytes
            image_url: URL of image (will be downloaded)
            is_reading_question: If True, focus on text/number extraction

        Returns:
            dict with 'en' and 'ar' analysis text, and optional 'reading'
        """
        if not is_ollama_configured():
            logger.warning("Ollama server not running or not accessible")
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

            # Find available vision model
            model = _find_available_model(VISION_MODELS)
            if not model:
                logger.warning("No vision model available in Ollama. Run: ollama pull llama3.2-vision:11b")
                return None

            # Convert image to base64
            image_b64 = base64.b64encode(image_content).decode('utf-8')

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

            # Call Ollama generate API
            payload = {
                "model": model,
                "prompt": prompt,
                "images": [image_b64],
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "num_predict": 300
                }
            }

            logger.info(f"Calling Ollama Vision with model: {model}")

            response = requests.post(
                f"{OLLAMA_API_URL}/generate",
                json=payload,
                timeout=120  # Local inference can be slow
            )

            if response.status_code == 200:
                result = response.json()
                analysis_text = result.get('response', '').strip()

                if analysis_text:
                    logger.info(f"Ollama analysis: {analysis_text[:100]}...")
                    return self._process_result(analysis_text, is_reading_question)

            logger.error(f"Ollama Vision error: {response.status_code} - {response.text[:200]}")
            return None

        except Exception as e:
            logger.error(f"Ollama Vision error: {e}", exc_info=True)
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

        # Try to translate using local model first, fallback to external
        ar_text = self._translate_locally(analysis_text, 'ar')
        if not ar_text:
            from app.services.translation_service import TranslationService
            translated = TranslationService.auto_translate(analysis_text)
            ar_text = translated.get('ar') or analysis_text

        result = {
            'en': analysis_text,
            'ar': ar_text
        }

        if extracted_reading:
            result['reading'] = extracted_reading

        return result

    def _translate_locally(self, text: str, target_lang: str) -> str:
        """Try to translate using local Ollama model."""
        try:
            model = _find_available_model(TEXT_MODELS)
            if not model:
                return None

            if target_lang == 'ar':
                prompt = f"Translate to Arabic. Return ONLY the Arabic text:\n{text}"
            else:
                prompt = f"Translate to English. Return ONLY the English text:\n{text}"

            payload = {
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.2, "num_predict": len(text) * 3}
            }

            response = requests.post(f"{OLLAMA_API_URL}/generate", json=payload, timeout=60)
            if response.status_code == 200:
                return response.json().get('response', '').strip()
            return None
        except Exception:
            return None


class OllamaSpeechService:
    """
    Ollama Speech-to-Text using local Whisper model.
    Requires whisper.cpp or similar to be set up.
    """

    def transcribe(self, audio_content: bytes, language_hint: str = 'en') -> dict:
        """
        Transcribe audio using local Whisper.
        Note: Ollama doesn't natively support audio yet.
        This is a placeholder for future support or whisper.cpp integration.
        """
        logger.warning("Ollama audio transcription not yet supported. Use Groq or Gemini instead.")
        return None

    def transcribe_file(self, file_path: str, language_hint: str = 'en') -> dict:
        """Transcribe audio from a file path."""
        # Placeholder for whisper.cpp integration
        logger.warning("Ollama audio transcription not yet supported.")
        return None


class OllamaTextService:
    """
    Ollama Text Generation using local models.
    100% FREE, unlimited usage.
    """

    def generate(self, prompt: str, system_prompt: str = None, max_tokens: int = 500) -> str:
        """
        Generate text using local Ollama model.

        Args:
            prompt: User prompt
            system_prompt: Optional system prompt
            max_tokens: Maximum tokens to generate

        Returns:
            Generated text string
        """
        if not is_ollama_configured():
            logger.warning("Ollama server not running")
            return None

        try:
            model = _find_available_model(TEXT_MODELS)
            if not model:
                logger.warning("No text model available in Ollama. Run: ollama pull llama3.1:8b")
                return None

            full_prompt = prompt
            if system_prompt:
                full_prompt = f"{system_prompt}\n\n{prompt}"

            payload = {
                "model": model,
                "prompt": full_prompt,
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "num_predict": max_tokens
                }
            }

            response = requests.post(
                f"{OLLAMA_API_URL}/generate",
                json=payload,
                timeout=120
            )

            if response.status_code == 200:
                result = response.json()
                text = result.get('response', '').strip()
                if text:
                    logger.info(f"Ollama text: {text[:50]}...")
                    return text

            logger.error(f"Ollama Text error: {response.status_code}")
            return None

        except Exception as e:
            logger.error(f"Ollama Text error: {e}", exc_info=True)
            return None

    def translate(self, text: str, target_lang: str = 'ar') -> str:
        """Translate text using local Ollama model."""
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
_speech_service = None
_text_service = None


def get_vision_service() -> OllamaVisionService:
    """Get or create Vision service singleton."""
    global _vision_service
    if _vision_service is None:
        _vision_service = OllamaVisionService()
    return _vision_service


def get_speech_service() -> OllamaSpeechService:
    """Get or create Speech service singleton."""
    global _speech_service
    if _speech_service is None:
        _speech_service = OllamaSpeechService()
    return _speech_service


def get_text_service() -> OllamaTextService:
    """Get or create Text service singleton."""
    global _text_service
    if _text_service is None:
        _text_service = OllamaTextService()
    return _text_service
