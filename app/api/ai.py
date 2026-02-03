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
