"""
AI Service - AI features for inspection system.
Multi-provider: Gemini → Groq → OpenAI
Provides: Vision analysis, report generation, embeddings search, TTS, and AI assistant.
"""

import os
import json
import logging
import base64
import requests
from typing import Optional, List, Dict, Any
from openai import OpenAI

logger = logging.getLogger(__name__)


def _get_openai_client() -> Optional[OpenAI]:
    """Get OpenAI client if API key is configured."""
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        logger.warning("OPENAI_API_KEY not configured")
        return None
    return OpenAI(api_key=api_key)


def _get_ai_provider():
    """Get the best available AI provider."""
    from app.services.gemini_service import is_gemini_configured
    from app.services.groq_service import is_groq_configured

    if is_gemini_configured():
        return 'gemini'
    elif is_groq_configured():
        return 'groq'
    elif os.getenv('OPENAI_API_KEY'):
        return 'openai'
    return None


def _call_gemini_text(prompt: str, max_tokens: int = 500) -> Optional[str]:
    """Call Gemma/Gemini for text generation with fallback."""
    api_key = os.getenv('GEMINI_API_KEY', '').strip()
    if not api_key:
        return None

    # Try gemma-3-4b-it first (14,400 RPD), fallback to gemini-2.5-flash (1,500 RPD)
    models = ["gemma-3-4b-it", "gemini-2.5-flash"]
    base_url = "https://generativelanguage.googleapis.com/v1beta/models"

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": max_tokens
        }
    }

    for model in models:
        url = f"{base_url}/{model}:generateContent?key={api_key}"
        try:
            response = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=60)

            if response.status_code == 200:
                result = response.json()
                candidates = result.get('candidates', [])
                if candidates:
                    content = candidates[0].get('content', {})
                    parts = content.get('parts', [])
                    if parts:
                        return parts[0].get('text', '').strip()
            logger.warning(f"Text model {model} failed: {response.status_code}, trying next...")
        except Exception as e:
            logger.warning(f"Text model {model} error: {e}, trying next...")

    return None


def _call_groq_text(prompt: str, max_tokens: int = 500) -> Optional[str]:
    """Call Groq for text generation."""
    api_key = os.getenv('GROQ_API_KEY', '').strip()
    if not api_key:
        return None

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "llama-3.1-8b-instant",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "max_tokens": max_tokens
    }

    response = requests.post(url, json=payload, headers=headers, timeout=60)

    if response.status_code != 200:
        raise Exception(f"Groq API error: {response.status_code}")

    result = response.json()
    return result.get('choices', [{}])[0].get('message', {}).get('content', '').strip()


def _call_openai_text(prompt: str, max_tokens: int = 500) -> Optional[str]:
    """Call OpenAI for text generation."""
    client = _get_openai_client()
    if not client:
        return None

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens
    )

    return response.choices[0].message.content.strip()


def _call_ai_text(prompt: str, max_tokens: int = 500) -> Optional[str]:
    """Call best available AI for text generation."""
    provider = _get_ai_provider()

    try:
        if provider == 'gemini':
            return _call_gemini_text(prompt, max_tokens)
        elif provider == 'groq':
            return _call_groq_text(prompt, max_tokens)
        elif provider == 'openai':
            return _call_openai_text(prompt, max_tokens)
    except Exception as e:
        logger.error(f"AI text generation failed with {provider}: {e}")
        # Try fallback
        if provider == 'gemini':
            try:
                return _call_groq_text(prompt, max_tokens)
            except:
                pass
        if provider in ('gemini', 'groq'):
            try:
                return _call_openai_text(prompt, max_tokens)
            except:
                pass

    return None


class VisionService:
    """Multi-provider Vision - Analyze inspection photos for defects."""

    @staticmethod
    def analyze_defect_photo(image_url: str, language: str = 'en') -> Dict[str, Any]:
        """
        Analyze a defect photo using multi-provider AI.
        Priority: Gemini → Groq → OpenAI

        Args:
            image_url: URL of the image (Cloudinary URL)
            language: Response language ('en' or 'ar')

        Returns:
            Analysis result with defect description, severity, recommendations
        """
        from app.services.gemini_service import is_gemini_configured, get_vision_service as get_gemini_vision
        from app.services.groq_service import is_groq_configured, get_vision_service as get_groq_vision
        from app.services.openrouter_service import is_openrouter_configured, get_vision_service as get_openrouter_vision
        from app.services.huggingface_service import is_huggingface_configured, get_vision_service as get_hf_vision
        from app.services.together_ai_service import is_together_configured, get_vision_service as get_together_vision
        from app.services.sambanova_service import is_sambanova_configured, get_vision_service as get_sambanova_vision

        def _make_success(result, provider_name):
            return {
                'success': True,
                'description': result.get('en', ''),
                'description_ar': result.get('ar', ''),
                'severity': 'N/A',
                'cause': 'N/A',
                'recommendation': 'Continue regular maintenance',
                'safety_risk': 'None identified',
                'provider': provider_name
            }

        # Download image for providers that need bytes
        image_content = None
        try:
            response = requests.get(image_url, timeout=30)
            response.raise_for_status()
            image_content = response.content
        except Exception as e:
            logger.warning(f"Could not download image: {e}")

        # FULL FALLBACK CHAIN (same order as upload-media endpoint)
        # 1. Gemini → 2. Groq → 3. OpenRouter → 4. HuggingFace → 5. Together → 6. SambaNova → 7. OpenAI

        # 1. Gemini
        if is_gemini_configured() and image_content:
            try:
                result = get_gemini_vision().analyze_image(image_content=image_content, is_reading_question=False)
                if result:
                    return _make_success(result, 'gemini')
            except Exception as e:
                logger.warning(f"Gemini vision failed: {e}")

        # 2. Groq
        if is_groq_configured() and image_content:
            try:
                result = get_groq_vision().analyze_image(image_content=image_content, is_reading_question=False)
                if result:
                    return _make_success(result, 'groq')
            except Exception as e:
                logger.warning(f"Groq vision failed: {e}")

        # 3. OpenRouter (FREE models)
        if is_openrouter_configured() and image_content:
            try:
                result = get_openrouter_vision().analyze_image(image_content=image_content, is_reading_question=False)
                if result:
                    return _make_success(result, 'openrouter')
            except Exception as e:
                logger.warning(f"OpenRouter vision failed: {e}")

        # 4. HuggingFace
        if is_huggingface_configured() and image_content:
            try:
                result = get_hf_vision().analyze_image(image_content=image_content, is_reading_question=False)
                if result:
                    return _make_success(result, 'huggingface')
            except Exception as e:
                logger.warning(f"HuggingFace vision failed: {e}")

        # 5. Together AI
        if is_together_configured() and image_content:
            try:
                result = get_together_vision().analyze_image(image_content=image_content, is_reading_question=False)
                if result:
                    return _make_success(result, 'together')
            except Exception as e:
                logger.warning(f"Together AI vision failed: {e}")

        # 6. SambaNova
        if is_sambanova_configured() and image_content:
            try:
                result = get_sambanova_vision().analyze_image(image_content=image_content, is_reading_question=False)
                if result:
                    return _make_success(result, 'sambanova')
            except Exception as e:
                logger.warning(f"SambaNova vision failed: {e}")

        # 7. Fall back to OpenAI (PAID)
        client = _get_openai_client()
        if not client:
            return {'error': 'No AI service configured', 'success': False}

        prompt = """You are an industrial equipment inspection expert. Analyze this inspection photo:

1. **Description**: What do you see in this image? Describe the equipment, component, or area shown.
2. **Condition**: Is there any visible damage, wear, defect, or issue? If everything looks normal, say "No issues detected - equipment appears in good condition".
3. **Severity**: If issues found, rate as CRITICAL, HIGH, MEDIUM, or LOW. If no issues, say "N/A".
4. **Cause**: If issues found, what likely caused them? If no issues, say "N/A".
5. **Recommendation**: What action should be taken? If no issues, say "Continue regular maintenance".
6. **Safety Risk**: Any safety concerns? If none, say "None identified".

IMPORTANT: Provide the description in BOTH English AND Arabic.
Format your response as JSON with keys: description, description_ar, severity, cause, recommendation, safety_risk"""

        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": image_url}}
                        ]
                    }
                ],
                max_tokens=1000
            )

            content = response.choices[0].message.content

            # Try to parse as JSON
            try:
                if '```json' in content:
                    content = content.split('```json')[1].split('```')[0]
                elif '```' in content:
                    content = content.split('```')[1].split('```')[0]
                result = json.loads(content)
            except json.JSONDecodeError:
                result = {'raw_analysis': content}

            result['success'] = True
            result['provider'] = 'openai'

            # Ensure Arabic description exists
            if result.get('description') and not result.get('description_ar'):
                try:
                    from app.services.translation_service import TranslationService
                    result['description_ar'] = TranslationService.translate_to_arabic(result['description']) or result['description']
                except Exception:
                    result['description_ar'] = result['description']

            return result

        except Exception as e:
            logger.error(f"Vision analysis failed for URL {image_url[:100]}...: {e}")
            return {'error': str(e), 'success': False}

    @staticmethod
    def read_gauge(image_url: str) -> Dict[str, Any]:
        """
        Read gauge/meter values from an image.
        Uses multi-provider AI.

        Args:
            image_url: URL of the gauge image

        Returns:
            Reading value and unit
        """
        from app.services.gemini_service import is_gemini_configured, get_vision_service as get_gemini_vision
        from app.services.groq_service import is_groq_configured, get_vision_service as get_groq_vision

        # Download image
        image_content = None
        try:
            response = requests.get(image_url, timeout=30)
            response.raise_for_status()
            image_content = response.content
        except Exception as e:
            logger.warning(f"Could not download image: {e}")

        # Try Gemini first
        if is_gemini_configured() and image_content:
            try:
                gemini_vision = get_gemini_vision()
                result = gemini_vision.analyze_image(image_content=image_content, is_reading_question=True)
                if result and result.get('reading'):
                    return {
                        'success': True,
                        'value': result.get('reading'),
                        'description': result.get('en', ''),
                        'provider': 'gemini'
                    }
            except Exception as e:
                logger.warning(f"Gemini gauge reading failed: {e}")

        # Try Groq second
        if is_groq_configured() and image_content:
            try:
                groq_vision = get_groq_vision()
                result = groq_vision.analyze_image(image_content=image_content, is_reading_question=True)
                if result and result.get('reading'):
                    return {
                        'success': True,
                        'value': result.get('reading'),
                        'description': result.get('en', ''),
                        'provider': 'groq'
                    }
            except Exception as e:
                logger.warning(f"Groq gauge reading failed: {e}")

        # Fall back to OpenAI
        client = _get_openai_client()
        if not client:
            return {'error': 'No AI service configured', 'success': False}

        prompt = """Look at this gauge/meter image and extract:
1. The current reading value
2. The unit of measurement
3. The scale range (min-max)
4. Is the reading in normal/warning/danger zone?

Format as JSON: {"value": number, "unit": "string", "min": number, "max": number, "status": "normal|warning|danger"}"""

        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": image_url}}
                        ]
                    }
                ],
                max_tokens=300
            )

            content = response.choices[0].message.content
            try:
                if '```' in content:
                    content = content.split('```')[1].split('```')[0]
                    if content.startswith('json'):
                        content = content[4:]
                result = json.loads(content)
            except:
                result = {'raw': content}

            result['success'] = True
            result['provider'] = 'openai'
            return result

        except Exception as e:
            logger.error(f"Gauge reading failed: {e}")
            return {'error': str(e), 'success': False}

    @staticmethod
    def analyze_with_prompt(image_url: str, prompt: str) -> Dict[str, Any]:
        """
        Analyze an image with a custom prompt.
        Uses multi-provider AI.

        Args:
            image_url: URL of the image
            prompt: Custom analysis prompt

        Returns:
            Analysis result with 'analysis' field
        """
        from app.services.gemini_service import is_gemini_configured
        from app.services.groq_service import is_groq_configured

        # Download image for providers that need bytes
        image_content = None
        try:
            response = requests.get(image_url, timeout=30)
            response.raise_for_status()
            image_content = response.content
        except Exception as e:
            logger.warning(f"Could not download image: {e}")

        # Try Gemini first (with custom prompt)
        if is_gemini_configured() and image_content:
            try:
                api_key = os.getenv('GEMINI_API_KEY', '').strip()
                base64_image = base64.b64encode(image_content).decode('utf-8')

                # Use gemini-2.0-flash for vision with custom prompt
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"

                payload = {
                    "contents": [{
                        "parts": [
                            {"text": prompt},
                            {"inline_data": {"mime_type": "image/jpeg", "data": base64_image}}
                        ]
                    }],
                    "generationConfig": {
                        "temperature": 0.2,
                        "maxOutputTokens": 1000
                    }
                }

                resp = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=60)

                if resp.status_code == 200:
                    result = resp.json()
                    candidates = result.get('candidates', [])
                    if candidates:
                        content = candidates[0].get('content', {})
                        parts = content.get('parts', [])
                        if parts:
                            text = parts[0].get('text', '').strip()
                            # Try to parse as JSON
                            try:
                                if '```json' in text:
                                    text = text.split('```json')[1].split('```')[0]
                                elif '```' in text:
                                    text = text.split('```')[1].split('```')[0]
                                analysis = json.loads(text)
                                return {'success': True, 'analysis': analysis, 'provider': 'gemini'}
                            except json.JSONDecodeError:
                                return {'success': True, 'analysis': text, 'provider': 'gemini'}
            except Exception as e:
                logger.warning(f"Gemini custom prompt analysis failed: {e}")

        # Try Groq second
        if is_groq_configured() and image_content:
            try:
                api_key = os.getenv('GROQ_API_KEY', '').strip()
                base64_image = base64.b64encode(image_content).decode('utf-8')

                url = "https://api.groq.com/openai/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "llama-3.2-90b-vision-preview",
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                        ]
                    }],
                    "temperature": 0.2,
                    "max_tokens": 1000
                }

                resp = requests.post(url, json=payload, headers=headers, timeout=60)

                if resp.status_code == 200:
                    result = resp.json()
                    text = result.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
                    # Try to parse as JSON
                    try:
                        if '```json' in text:
                            text = text.split('```json')[1].split('```')[0]
                        elif '```' in text:
                            text = text.split('```')[1].split('```')[0]
                        analysis = json.loads(text)
                        return {'success': True, 'analysis': analysis, 'provider': 'groq'}
                    except json.JSONDecodeError:
                        return {'success': True, 'analysis': text, 'provider': 'groq'}
            except Exception as e:
                logger.warning(f"Groq custom prompt analysis failed: {e}")

        # Fall back to OpenAI
        client = _get_openai_client()
        if not client:
            return {'error': 'No AI service configured', 'success': False}

        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": image_url}}
                        ]
                    }
                ],
                max_tokens=1000
            )

            content = response.choices[0].message.content

            # Try to parse as JSON
            try:
                if '```json' in content:
                    content = content.split('```json')[1].split('```')[0]
                elif '```' in content:
                    content = content.split('```')[1].split('```')[0]
                analysis = json.loads(content)
                return {'success': True, 'analysis': analysis, 'provider': 'openai'}
            except json.JSONDecodeError:
                return {'success': True, 'analysis': content, 'provider': 'openai'}

        except Exception as e:
            logger.error(f"Custom prompt analysis failed: {e}")
            return {'error': str(e), 'success': False}

    @staticmethod
    def compare_images(before_url: str, after_url: str, language: str = 'en') -> Dict[str, Any]:
        """
        Compare before/after images to identify changes.
        Note: This feature requires OpenAI as it needs multi-image support.

        Args:
            before_url: URL of before image
            after_url: URL of after image
            language: Response language

        Returns:
            Comparison analysis
        """
        client = _get_openai_client()
        if not client:
            return {'error': 'OpenAI not configured (required for image comparison)', 'success': False}

        lang_instruction = "Respond in Arabic." if language == 'ar' else "Respond in English."

        prompt = f"""Compare these two inspection images (before and after).

Identify:
1. What has changed between the images?
2. Has the condition improved or worsened?
3. What repairs/work appear to have been done?
4. Are there any remaining issues?

{lang_instruction}
Format as JSON: {{"changes": [], "condition_change": "improved|worsened|same", "work_done": "description", "remaining_issues": []}}"""

        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": before_url}},
                            {"type": "image_url", "image_url": {"url": after_url}}
                        ]
                    }
                ],
                max_tokens=800
            )

            content = response.choices[0].message.content
            try:
                if '```' in content:
                    content = content.split('```')[1].split('```')[0]
                    if content.startswith('json'):
                        content = content[4:]
                result = json.loads(content)
            except:
                result = {'raw': content}

            result['success'] = True
            return result

        except Exception as e:
            logger.error(f"Image comparison failed: {e}")
            return {'error': str(e), 'success': False}


class ReportService:
    """Multi-provider Text - Generate reports and summaries."""

    @staticmethod
    def generate_inspection_report(inspection_data: Dict, language: str = 'en') -> Dict[str, Any]:
        """
        Generate a comprehensive inspection report.
        Uses multi-provider AI.

        Args:
            inspection_data: Inspection details including answers, defects, etc.
            language: Report language

        Returns:
            Generated report text
        """
        lang_instruction = "Write the report in Arabic." if language == 'ar' else "Write the report in English."

        prompt = f"""Generate a professional industrial equipment inspection report based on this data:

{json.dumps(inspection_data, indent=2, default=str)}

Include:
1. Executive Summary (2-3 sentences)
2. Equipment Information
3. Inspection Findings (organized by category)
4. Critical Issues (if any)
5. Recommendations
6. Overall Assessment (Pass/Fail/Needs Attention)

{lang_instruction}
Make it professional and suitable for management review."""

        result = _call_ai_text(prompt, max_tokens=2000)
        if result:
            return {'success': True, 'report': result}
        return {'error': 'No AI service configured', 'success': False}

    @staticmethod
    def summarize_defects(defects: List[Dict], language: str = 'en') -> Dict[str, Any]:
        """
        Summarize multiple defects into a brief overview.
        Uses multi-provider AI.

        Args:
            defects: List of defect data
            language: Summary language

        Returns:
            Summary text
        """
        lang_instruction = "Respond in Arabic." if language == 'ar' else "Respond in English."

        prompt = f"""Summarize these equipment defects for a manager:

{json.dumps(defects, indent=2, default=str)}

Provide:
1. Total count and breakdown by severity
2. Most critical issues requiring immediate attention
3. Common patterns or recurring problems
4. Recommended priority order for repairs

{lang_instruction}
Keep it concise (under 200 words)."""

        result = _call_ai_text(prompt, max_tokens=500)
        if result:
            return {'success': True, 'summary': result}
        return {'error': 'No AI service configured', 'success': False}

    @staticmethod
    def translate(text: str, target_language: str) -> Dict[str, Any]:
        """
        Translate text between English and Arabic.
        Uses the TranslationService which supports multi-provider.

        Args:
            text: Text to translate
            target_language: 'en' or 'ar'

        Returns:
            Translated text
        """
        from app.services.translation_service import TranslationService

        if target_language == 'ar':
            result = TranslationService.translate_to_arabic(text)
        else:
            result = TranslationService.translate_to_english(text)

        if result:
            return {'success': True, 'translation': result}
        return {'error': 'Translation failed', 'success': False}


class EmbeddingsService:
    """Embeddings - Semantic search for similar defects.
    Note: This requires OpenAI as embeddings are model-specific."""

    @staticmethod
    def create_embedding(text: str) -> Optional[List[float]]:
        """
        Create an embedding vector for text.

        Args:
            text: Text to embed

        Returns:
            Embedding vector (1536 dimensions)
        """
        client = _get_openai_client()
        if not client:
            return None

        try:
            response = client.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            return response.data[0].embedding

        except Exception as e:
            logger.error(f"Embedding creation failed: {e}")
            return None

    @staticmethod
    def find_similar(query: str, items: List[Dict], text_field: str = 'description', top_k: int = 5) -> List[Dict]:
        """
        Find similar items using semantic search.

        Args:
            query: Search query
            items: List of items to search (each must have text_field and optionally 'embedding')
            text_field: Field containing text to compare
            top_k: Number of results to return

        Returns:
            Top k most similar items with similarity scores
        """
        import numpy as np

        query_embedding = EmbeddingsService.create_embedding(query)
        if not query_embedding:
            return []

        results = []
        for item in items:
            # Get or create embedding for item
            if 'embedding' in item and item['embedding']:
                item_embedding = item['embedding']
            else:
                text = item.get(text_field, '')
                if not text:
                    continue
                item_embedding = EmbeddingsService.create_embedding(text)
                if not item_embedding:
                    continue

            # Calculate cosine similarity
            similarity = np.dot(query_embedding, item_embedding) / (
                np.linalg.norm(query_embedding) * np.linalg.norm(item_embedding)
            )

            results.append({
                **item,
                'similarity': float(similarity)
            })

        # Sort by similarity and return top k
        results.sort(key=lambda x: x['similarity'], reverse=True)
        return results[:top_k]


class TTSService:
    """Text-to-Speech - Convert text to audio.
    Note: This requires OpenAI for TTS capabilities."""

    VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']

    @staticmethod
    def text_to_speech(text: str, voice: str = 'nova') -> Optional[bytes]:
        """
        Convert text to speech audio.

        Args:
            text: Text to convert
            voice: Voice to use (alloy, echo, fable, onyx, nova, shimmer)

        Returns:
            Audio bytes (MP3 format)
        """
        client = _get_openai_client()
        if not client:
            return None

        if voice not in TTSService.VOICES:
            voice = 'nova'

        try:
            response = client.audio.speech.create(
                model="tts-1",
                voice=voice,
                input=text
            )
            return response.content

        except Exception as e:
            logger.error(f"TTS failed: {e}")
            return None

    @staticmethod
    def read_checklist_item(question: str, language: str = 'en') -> Optional[bytes]:
        """
        Generate audio for a checklist question.

        Args:
            question: Checklist question text
            language: Language of the question

        Returns:
            Audio bytes
        """
        # Use appropriate voice for language
        voice = 'nova' if language == 'en' else 'alloy'
        return TTSService.text_to_speech(question, voice)


class AssistantService:
    """AI Assistant - Interactive helper for engineers.
    Note: This requires OpenAI for Assistants API."""

    _assistant_id = None

    @classmethod
    def _get_or_create_assistant(cls) -> Optional[str]:
        """Get or create the inspection assistant."""
        if cls._assistant_id:
            return cls._assistant_id

        client = _get_openai_client()
        if not client:
            return None

        try:
            # Check if assistant already exists
            assistant_id = os.getenv('OPENAI_ASSISTANT_ID')
            if assistant_id:
                cls._assistant_id = assistant_id
                return assistant_id

            # Create new assistant
            assistant = client.beta.assistants.create(
                name="Inspection System Assistant",
                instructions="""You are an expert industrial equipment inspection assistant. You help:
- Engineers understand defect reports and prioritize repairs
- Specialists diagnose equipment issues
- Inspectors interpret checklist requirements
- Quality engineers analyze inspection patterns

You have knowledge of:
- Industrial equipment maintenance
- Safety standards and compliance
- Defect classification and severity assessment
- Repair procedures and best practices

Always be helpful, precise, and safety-conscious.""",
                model="gpt-4o",
                tools=[{"type": "code_interpreter"}]
            )

            cls._assistant_id = assistant.id
            logger.info(f"Created assistant: {assistant.id}")
            return assistant.id

        except Exception as e:
            logger.error(f"Assistant creation failed: {e}")
            return None

    @staticmethod
    def chat(message: str, thread_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Chat with the AI assistant.

        Args:
            message: User message
            thread_id: Existing thread ID for conversation continuity

        Returns:
            Assistant response and thread ID
        """
        client = _get_openai_client()
        if not client:
            return {'error': 'OpenAI not configured (required for Assistant)', 'success': False}

        assistant_id = AssistantService._get_or_create_assistant()
        if not assistant_id:
            return {'error': 'Could not create assistant', 'success': False}

        try:
            # Create or use existing thread
            if thread_id:
                thread = client.beta.threads.retrieve(thread_id)
            else:
                thread = client.beta.threads.create()

            # Add message to thread
            client.beta.threads.messages.create(
                thread_id=thread.id,
                role="user",
                content=message
            )

            # Run assistant
            run = client.beta.threads.runs.create_and_poll(
                thread_id=thread.id,
                assistant_id=assistant_id
            )

            if run.status == 'completed':
                # Get response
                messages = client.beta.threads.messages.list(
                    thread_id=thread.id,
                    order='desc',
                    limit=1
                )

                response_text = messages.data[0].content[0].text.value

                return {
                    'success': True,
                    'response': response_text,
                    'thread_id': thread.id
                }
            else:
                return {
                    'success': False,
                    'error': f'Run failed with status: {run.status}'
                }

        except Exception as e:
            logger.error(f"Assistant chat failed: {e}")
            return {'error': str(e), 'success': False}


# Convenience exports
vision = VisionService()
reports = ReportService()
embeddings = EmbeddingsService()
tts = TTSService()
assistant = AssistantService()
