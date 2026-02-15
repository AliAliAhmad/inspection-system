"""
AI API endpoints - OpenAI-powered features for inspection system.
"""

from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required
from app.extensions import limiter
from app.utils.decorators import get_current_user
from app.services.openai_service import vision, reports, embeddings, tts, assistant

bp = Blueprint('ai', __name__)


# ============================================
# VISION ENDPOINTS
# ============================================

@bp.route('/vision/analyze-defect', methods=['POST'])
@limiter.limit("20 per minute")
@jwt_required()
def analyze_defect():
    """
    Analyze a defect photo using GPT-4 Vision.

    Body: {"image_url": "https://...", "language": "en"}
    """
    data = request.get_json()
    image_url = data.get('image_url')
    language = data.get('language', 'en')

    if not image_url:
        return jsonify({'status': 'error', 'message': 'image_url required'}), 400

    result = vision.analyze_defect_photo(image_url, language)

    if result.get('success'):
        return jsonify({'status': 'success', 'data': result}), 200
    else:
        return jsonify({'status': 'error', 'message': result.get('error', 'Analysis failed')}), 500


@bp.route('/vision/read-gauge', methods=['POST'])
@limiter.limit("20 per minute")
@jwt_required()
def read_gauge():
    """
    Read gauge/meter values from an image.

    Body: {"image_url": "https://..."}
    """
    data = request.get_json()
    image_url = data.get('image_url')

    if not image_url:
        return jsonify({'status': 'error', 'message': 'image_url required'}), 400

    result = vision.read_gauge(image_url)

    if result.get('success'):
        return jsonify({'status': 'success', 'data': result}), 200
    else:
        return jsonify({'status': 'error', 'message': result.get('error', 'Reading failed')}), 500


@bp.route('/vision/analyze-video', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def analyze_video():
    """
    Analyze a video using Gemini Vision.

    Body: {"video_url": "https://..."}
    """
    from app.services.gemini_service import get_vision_service, is_gemini_configured

    data = request.get_json()
    video_url = data.get('video_url')

    if not video_url:
        return jsonify({'status': 'error', 'message': 'video_url required'}), 400

    if not is_gemini_configured():
        return jsonify({'status': 'error', 'message': 'Gemini API not configured'}), 500

    vision_service = get_vision_service()
    result = vision_service.analyze_video(video_url=video_url)

    if result:
        return jsonify({
            'status': 'success',
            'data': {
                'analysis_en': result.get('en'),
                'analysis_ar': result.get('ar'),
            }
        }), 200
    else:
        return jsonify({'status': 'error', 'message': 'Video analysis failed'}), 500


@bp.route('/vision/compare', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def compare_images():
    """
    Compare before/after images.

    Body: {"before_url": "https://...", "after_url": "https://...", "language": "en"}
    """
    data = request.get_json()
    before_url = data.get('before_url')
    after_url = data.get('after_url')
    language = data.get('language', 'en')

    if not before_url or not after_url:
        return jsonify({'status': 'error', 'message': 'before_url and after_url required'}), 400

    result = vision.compare_images(before_url, after_url, language)

    if result.get('success'):
        return jsonify({'status': 'success', 'data': result}), 200
    else:
        return jsonify({'status': 'error', 'message': result.get('error', 'Comparison failed')}), 500


# ============================================
# REPORT ENDPOINTS
# ============================================

@bp.route('/reports/generate', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def generate_report():
    """
    Generate an inspection report.

    Body: {"inspection_data": {...}, "language": "en"}
    """
    data = request.get_json()
    inspection_data = data.get('inspection_data')
    language = data.get('language', 'en')

    if not inspection_data:
        return jsonify({'status': 'error', 'message': 'inspection_data required'}), 400

    result = reports.generate_inspection_report(inspection_data, language)

    if result.get('success'):
        return jsonify({'status': 'success', 'data': result}), 200
    else:
        return jsonify({'status': 'error', 'message': result.get('error', 'Report generation failed')}), 500


@bp.route('/reports/summarize-defects', methods=['POST'])
@limiter.limit("20 per minute")
@jwt_required()
def summarize_defects():
    """
    Summarize multiple defects.

    Body: {"defects": [...], "language": "en"}
    """
    data = request.get_json()
    defects = data.get('defects')
    language = data.get('language', 'en')

    if not defects:
        return jsonify({'status': 'error', 'message': 'defects required'}), 400

    result = reports.summarize_defects(defects, language)

    if result.get('success'):
        return jsonify({'status': 'success', 'data': result}), 200
    else:
        return jsonify({'status': 'error', 'message': result.get('error', 'Summary failed')}), 500


@bp.route('/reports/translate', methods=['POST'])
@limiter.limit("30 per minute")
@jwt_required()
def translate_text():
    """
    Translate text between English and Arabic.

    Body: {"text": "...", "target_language": "ar"}
    """
    data = request.get_json()
    text = data.get('text')
    target_language = data.get('target_language', 'ar')

    if not text:
        return jsonify({'status': 'error', 'message': 'text required'}), 400

    result = reports.translate(text, target_language)

    if result.get('success'):
        return jsonify({'status': 'success', 'data': result}), 200
    else:
        return jsonify({'status': 'error', 'message': result.get('error', 'Translation failed')}), 500


# ============================================
# EMBEDDINGS / SEARCH ENDPOINTS
# ============================================

@bp.route('/search/similar-defects', methods=['POST'])
@limiter.limit("20 per minute")
@jwt_required()
def search_similar_defects():
    """
    Find similar defects using semantic search.

    Body: {"query": "motor vibration issues", "top_k": 10}
    Fetches defects from database automatically.
    """
    from app.models.defect import Defect

    data = request.get_json()
    query = data.get('query')
    top_k = data.get('top_k', 10)

    if not query:
        return jsonify({'status': 'error', 'message': 'query required'}), 400

    # Fetch defects from database (limit to 500 for performance)
    db_defects = Defect.query.order_by(Defect.id.desc()).limit(500).all()
    defects_list = [d.to_dict() for d in db_defects]

    results = embeddings.find_similar(query, defects_list, text_field='description', top_k=top_k)

    return jsonify({
        'status': 'success',
        'data': {
            'query': query,
            'results': results,
            'count': len(results)
        }
    }), 200


@bp.route('/search/create-embedding', methods=['POST'])
@limiter.limit("50 per minute")
@jwt_required()
def create_embedding():
    """
    Create an embedding vector for text.

    Body: {"text": "..."}
    """
    data = request.get_json()
    text = data.get('text')

    if not text:
        return jsonify({'status': 'error', 'message': 'text required'}), 400

    embedding = embeddings.create_embedding(text)

    if embedding:
        return jsonify({
            'status': 'success',
            'data': {
                'embedding': embedding,
                'dimensions': len(embedding)
            }
        }), 200
    else:
        return jsonify({'status': 'error', 'message': 'Embedding creation failed'}), 500


# ============================================
# TEXT-TO-SPEECH ENDPOINTS
# ============================================

@bp.route('/tts/speak', methods=['POST'])
@limiter.limit("20 per minute")
@jwt_required()
def text_to_speech():
    """
    Convert text to speech audio.

    Body: {"text": "...", "voice": "nova"}
    Returns: MP3 audio file
    """
    data = request.get_json()
    text = data.get('text')
    voice = data.get('voice', 'nova')

    if not text:
        return jsonify({'status': 'error', 'message': 'text required'}), 400

    audio = tts.text_to_speech(text, voice)

    if audio:
        return Response(
            audio,
            mimetype='audio/mpeg',
            headers={'Content-Disposition': 'attachment; filename=speech.mp3'}
        )
    else:
        return jsonify({'status': 'error', 'message': 'TTS failed'}), 500


@bp.route('/tts/checklist-item', methods=['POST'])
@limiter.limit("30 per minute")
@jwt_required()
def read_checklist_item():
    """
    Generate audio for a checklist question.

    Body: {"question": "Is the motor running smoothly?", "language": "en"}
    Returns: MP3 audio file
    """
    data = request.get_json()
    question = data.get('question')
    language = data.get('language', 'en')

    if not question:
        return jsonify({'status': 'error', 'message': 'question required'}), 400

    audio = tts.read_checklist_item(question, language)

    if audio:
        return Response(
            audio,
            mimetype='audio/mpeg',
            headers={'Content-Disposition': 'attachment; filename=question.mp3'}
        )
    else:
        return jsonify({'status': 'error', 'message': 'TTS failed'}), 500


@bp.route('/tts/voices', methods=['GET'])
@jwt_required()
def list_voices():
    """List available TTS voices."""
    return jsonify({
        'status': 'success',
        'data': {
            'voices': tts.VOICES,
            'default': 'nova'
        }
    }), 200


# ============================================
# ASSISTANT ENDPOINTS
# ============================================

@bp.route('/assistant/chat', methods=['POST'])
@limiter.limit("20 per minute")
@jwt_required()
def assistant_chat():
    """
    Chat with the AI assistant.

    Body: {"message": "How do I diagnose motor vibration?", "thread_id": "optional"}
    """
    data = request.get_json()
    message = data.get('message')
    thread_id = data.get('thread_id')

    if not message:
        return jsonify({'status': 'error', 'message': 'message required'}), 400

    result = assistant.chat(message, thread_id)

    if result.get('success'):
        return jsonify({'status': 'success', 'data': result}), 200
    else:
        return jsonify({'status': 'error', 'message': result.get('error', 'Chat failed')}), 500


# ============================================
# PHOTO ANALYSIS FOR INSPECTIONS
# ============================================

@bp.route('/analyze-photo', methods=['POST'])
@limiter.limit("30 per minute")
@jwt_required()
def analyze_photo_for_inspection():
    """
    Analyze a photo for pass/fail suggestion during inspection.

    Body: {
        "image_url": "https://...",
        "checklist_item_id": 123,  # optional
        "question_context": "Is the motor running smoothly?",  # optional
        "language": "en"
    }

    Returns: {
        "suggestion": "pass" | "fail",
        "confidence": 0.87,
        "reason": "No visible defects or damage detected",
        "reason_ar": "...",
        "analyzed_at": "2024-01-01T12:00:00Z"
    }
    """
    from datetime import datetime

    data = request.get_json()
    image_url = data.get('image_url')
    checklist_item_id = data.get('checklist_item_id')
    question_context = data.get('question_context', '')
    language = data.get('language', 'en')

    if not image_url:
        return jsonify({'status': 'error', 'message': 'image_url required'}), 400

    # Build prompt for inspection-specific analysis
    prompt = """Analyze this inspection photo and determine if it should PASS or FAIL.

You are an expert industrial equipment inspector. Examine the image for:
- Visible damage, cracks, or wear
- Corrosion or rust
- Leaks or fluid stains
- Misalignment or loose components
- Safety hazards
- General equipment condition

"""
    if question_context:
        prompt += f"Context: The inspector is checking: {question_context}\n\n"

    prompt += """Based on your analysis, respond with EXACTLY this JSON format:
{
    "suggestion": "pass" or "fail",
    "confidence": number between 0.0 and 1.0,
    "reason_en": "Brief explanation in English (1-2 sentences)",
    "reason_ar": "Brief explanation in Arabic (1-2 sentences)"
}

Be conservative: if you're unsure or see potential issues, suggest FAIL.
Only suggest PASS if the image clearly shows equipment in good condition.
"""

    # Use vision service to analyze
    try:
        result = vision.analyze_with_prompt(image_url, prompt)

        if result and result.get('success'):
            # Parse the response
            analysis = result.get('analysis', {})

            # Handle both structured and raw responses
            if isinstance(analysis, dict):
                suggestion = analysis.get('suggestion', 'fail').lower()
                confidence = float(analysis.get('confidence', 0.5))
                reason_en = analysis.get('reason_en', analysis.get('reason', ''))
                reason_ar = analysis.get('reason_ar', '')
            else:
                # Try to parse string response
                import json
                try:
                    parsed = json.loads(str(analysis))
                    suggestion = parsed.get('suggestion', 'fail').lower()
                    confidence = float(parsed.get('confidence', 0.5))
                    reason_en = parsed.get('reason_en', parsed.get('reason', ''))
                    reason_ar = parsed.get('reason_ar', '')
                except (json.JSONDecodeError, TypeError):
                    # Default to fail if parsing fails
                    suggestion = 'fail'
                    confidence = 0.3
                    reason_en = 'Unable to analyze image clearly'
                    reason_ar = 'تعذر تحليل الصورة بوضوح'

            # Ensure valid values
            suggestion = 'pass' if suggestion == 'pass' else 'fail'
            confidence = max(0.0, min(1.0, confidence))

            return jsonify({
                'status': 'success',
                'data': {
                    'suggestion': suggestion,
                    'confidence': confidence,
                    'reason': reason_en if language == 'en' else reason_ar,
                    'reason_ar': reason_ar,
                    'analyzed_at': datetime.utcnow().isoformat() + 'Z'
                }
            }), 200
        else:
            return jsonify({
                'status': 'error',
                'message': result.get('error', 'Analysis failed')
            }), 500

    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Analysis error: {str(e)}'
        }), 500


@bp.route('/photo-analysis/feedback', methods=['POST'])
@limiter.limit("60 per minute")
@jwt_required()
def record_photo_analysis_feedback():
    """
    Record inspector feedback on AI suggestion for ML learning.

    Body: {
        "photo_id": "...",
        "ai_suggestion": "pass" | "fail",
        "inspector_decision": "pass" | "fail",
        "accepted": true | false
    }
    """
    data = request.get_json()
    photo_id = data.get('photo_id')
    ai_suggestion = data.get('ai_suggestion')
    inspector_decision = data.get('inspector_decision')
    accepted = data.get('accepted', False)

    if not photo_id or not ai_suggestion or not inspector_decision:
        return jsonify({
            'status': 'error',
            'message': 'photo_id, ai_suggestion, and inspector_decision required'
        }), 400

    # Log the feedback for future ML training
    # In a production system, this would be stored in a database
    current_user = get_current_user()
    user_id = current_user.id if current_user else None

    # For now, just log it
    import logging
    logger = logging.getLogger(__name__)
    logger.info(
        f"AI Photo Feedback: photo={photo_id}, "
        f"ai={ai_suggestion}, inspector={inspector_decision}, "
        f"accepted={accepted}, user={user_id}"
    )

    return jsonify({
        'status': 'success',
        'message': 'Feedback recorded'
    }), 200
