"""
Inspection endpoints for the core workflow.
Enhanced with stats, advanced filters, bulk actions, and AI insights.
"""

import logging
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.inspection_service import InspectionService
from app.models import Inspection, InspectionAssignment, User, Equipment, Defect, InspectionAnswer
from app.exceptions.api_exceptions import ValidationError, NotFoundError, ForbiddenError
from app.utils.decorators import get_current_user, admin_required, get_language, role_required
from app.extensions import db
from sqlalchemy import func, and_, or_
from datetime import datetime, date, timedelta

logger = logging.getLogger(__name__)

bp = Blueprint('inspections', __name__)


# ============================================
# DIAGNOSTIC ENDPOINTS
# ============================================

@bp.route('/debug/ai-status', methods=['GET'])
def check_ai_status():
    """
    Diagnostic endpoint to check ALL AI services status.
    Shows full fallback chain with FREE providers prioritized.
    """
    import os
    from app.services.gemini_service import is_gemini_configured
    from app.services.groq_service import is_groq_configured
    from app.services.openrouter_service import is_openrouter_configured
    from app.services.huggingface_service import is_huggingface_configured
    from app.services.together_ai_service import is_together_configured
    from app.services.deepinfra_service import is_deepinfra_configured
    from app.services.sambanova_service import is_sambanova_configured
    from app.services.ollama_service import is_ollama_configured

    # Check all providers
    providers = {
        '1_gemini': {'configured': is_gemini_configured(), 'type': 'FREE (1,500 RPD)', 'priority': 1},
        '2_groq': {'configured': is_groq_configured(), 'type': 'FREE forever', 'priority': 2},
        '3_openrouter': {'configured': is_openrouter_configured(), 'type': 'FREE models', 'priority': 3},
        '4_huggingface': {'configured': is_huggingface_configured(), 'type': 'FREE (~30/min)', 'priority': 4},
        '5_together': {'configured': is_together_configured(), 'type': '$25 credits', 'priority': 5},
        '6_sambanova': {'configured': is_sambanova_configured(), 'type': 'FREE (40 RPD)', 'priority': 6},
        '7_deepinfra': {'configured': is_deepinfra_configured(), 'type': '$10 credits', 'priority': 7},
        '8_ollama': {'configured': is_ollama_configured(), 'type': 'FREE local', 'priority': 8},
        '9_openai': {'configured': bool(os.getenv('OPENAI_API_KEY')), 'type': 'PAID', 'priority': 9},
    }

    # Find active providers
    active_providers = [k for k, v in providers.items() if v['configured']]
    free_providers = [k for k, v in providers.items() if v['configured'] and 'FREE' in v['type']]

    # Determine primary service
    if active_providers:
        primary = active_providers[0]
        message = f"Primary: {primary.split('_')[1].upper()} | {len(active_providers)} providers available | {len(free_providers)} FREE"
    else:
        primary = 'None'
        message = 'No AI service configured. Set GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY'

    return jsonify({
        'status': 'success',
        'primary_provider': primary.split('_')[1] if '_' in primary else primary,
        'total_configured': len(active_providers),
        'free_configured': len(free_providers),
        'providers': {k.split('_')[1]: v for k, v in providers.items()},
        'fallback_order': [
            '1. Gemini (1,500 FREE/day)',
            '2. Groq (FREE forever)',
            '3. OpenRouter (FREE models)',
            '4. Hugging Face (FREE, slow)',
            '5. Together AI ($25 credits)',
            '6. SambaNova (FREE, 40 RPD)',
            '7. DeepInfra ($10 credits)',
            '8. Ollama (FREE local)',
            '9. OpenAI (PAID)',
        ],
        'message': message,
        'environment': os.getenv('FLASK_ENV', 'not set'),
    }), 200


@bp.route('/debug/ai-test-all', methods=['GET'])
def test_all_ai_services():
    """
    Test ALL configured AI services and return results.
    Tests: Vision, Audio, Translation for each provider.
    """
    import os
    results = {}

    # Test Gemini
    try:
        from app.services.gemini_service import is_gemini_configured
        if is_gemini_configured():
            results['gemini'] = {'status': 'configured', 'type': 'FREE (1,500 RPD)'}
        else:
            results['gemini'] = {'status': 'not_configured'}
    except Exception as e:
        results['gemini'] = {'status': 'error', 'error': str(e)}

    # Test Groq
    try:
        from app.services.groq_service import is_groq_configured
        if is_groq_configured():
            results['groq'] = {'status': 'configured', 'type': 'FREE forever'}
        else:
            results['groq'] = {'status': 'not_configured'}
    except Exception as e:
        results['groq'] = {'status': 'error', 'error': str(e)}

    # Test OpenRouter
    try:
        from app.services.openrouter_service import is_openrouter_configured
        if is_openrouter_configured():
            results['openrouter'] = {'status': 'configured', 'type': 'FREE models'}
        else:
            results['openrouter'] = {'status': 'not_configured'}
    except Exception as e:
        results['openrouter'] = {'status': 'error', 'error': str(e)}

    # Test Hugging Face
    try:
        from app.services.huggingface_service import is_huggingface_configured
        if is_huggingface_configured():
            results['huggingface'] = {'status': 'configured', 'type': 'FREE (~30/min)'}
        else:
            results['huggingface'] = {'status': 'not_configured'}
    except Exception as e:
        results['huggingface'] = {'status': 'error', 'error': str(e)}

    # Test Together AI
    try:
        from app.services.together_ai_service import is_together_configured
        if is_together_configured():
            results['together'] = {'status': 'configured', 'type': '$25 credits'}
        else:
            results['together'] = {'status': 'not_configured'}
    except Exception as e:
        results['together'] = {'status': 'error', 'error': str(e)}

    # Test DeepInfra
    try:
        from app.services.deepinfra_service import is_deepinfra_configured
        if is_deepinfra_configured():
            results['deepinfra'] = {'status': 'configured', 'type': '$10 credits'}
        else:
            results['deepinfra'] = {'status': 'not_configured'}
    except Exception as e:
        results['deepinfra'] = {'status': 'error', 'error': str(e)}

    # Test SambaNova
    try:
        from app.services.sambanova_service import is_sambanova_configured
        if is_sambanova_configured():
            results['sambanova'] = {'status': 'configured', 'type': 'FREE (40 RPD)'}
        else:
            results['sambanova'] = {'status': 'not_configured'}
    except Exception as e:
        results['sambanova'] = {'status': 'error', 'error': str(e)}

    # Test Ollama
    try:
        from app.services.ollama_service import is_ollama_configured
        if is_ollama_configured():
            results['ollama'] = {'status': 'configured', 'type': 'FREE local'}
        else:
            results['ollama'] = {'status': 'not_configured'}
    except Exception as e:
        results['ollama'] = {'status': 'error', 'error': str(e)}

    # Test OpenAI
    try:
        if os.getenv('OPENAI_API_KEY'):
            results['openai'] = {'status': 'configured', 'type': 'PAID'}
        else:
            results['openai'] = {'status': 'not_configured'}
    except Exception as e:
        results['openai'] = {'status': 'error', 'error': str(e)}

    configured_count = sum(1 for r in results.values() if r.get('status') == 'configured')
    free_count = sum(1 for r in results.values() if r.get('status') == 'configured' and 'FREE' in r.get('type', ''))

    return jsonify({
        'status': 'success',
        'summary': {
            'total_configured': configured_count,
            'free_configured': free_count,
            'paid_configured': configured_count - free_count,
        },
        'providers': results,
    }), 200


@bp.route('/debug/ai-test', methods=['GET'])
def test_ai_connection():
    """
    Test AI API connection.
    Tests in priority order: Google Cloud → Gemini → Together AI → Groq → OpenAI
    """
    import os
    import requests
    from app.services.google_cloud_service import is_google_cloud_configured, get_vision_service
    from app.services.gemini_service import is_gemini_configured
    from app.services.together_ai_service import is_together_configured
    from app.services.groq_service import is_groq_configured

    # Test Google Cloud first
    if is_google_cloud_configured():
        try:
            vision_service = get_vision_service()
            if vision_service.client:
                return jsonify({
                    'success': True,
                    'service': 'Google Cloud Vision',
                    'message': 'Google Cloud Vision API is working (FREE tier: 1000 images/month)',
                    'cost': 'FREE'
                }), 200
            else:
                return jsonify({
                    'success': False,
                    'service': 'Google Cloud',
                    'error': 'Vision client failed to initialize - check credentials'
                }), 500
        except Exception as e:
            return jsonify({
                'success': False,
                'service': 'Google Cloud',
                'error': str(e)
            }), 500

    # Test Gemini second (gemini-2.5-pro for vision, 1500 RPD)
    if is_gemini_configured():
        api_key = os.getenv('GEMINI_API_KEY', '').strip()
        try:
            response = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}",
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": "Say OK"}]}],
                    "generationConfig": {"maxOutputTokens": 5}
                },
                timeout=30
            )
            if response.status_code == 200:
                return jsonify({
                    'success': True,
                    'service': 'Gemini',
                    'message': 'Gemini is working! Vision: gemini-2.5-pro, Audio: gemini-2.5-flash, Text: gemini-2.5-flash',
                    'cost': 'FREE (1500/day)',
                    'model': 'gemini-2.5-flash'
                }), 200
            else:
                return jsonify({
                    'success': False,
                    'service': 'Gemini',
                    'error': f'API error: {response.status_code}',
                    'response': response.text[:300]
                }), 500
        except Exception as e:
            return jsonify({
                'success': False,
                'service': 'Gemini',
                'error': str(e)
            }), 500

    # Test Together AI third
    if is_together_configured():
        api_key = os.getenv('TOGETHER_API_KEY', '').strip()
        try:
            response = requests.post(
                "https://api.together.ai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo",
                    "messages": [{"role": "user", "content": "Say OK"}],
                    "max_tokens": 5
                },
                timeout=30
            )
            if response.status_code == 200:
                return jsonify({
                    'success': True,
                    'service': 'Together AI',
                    'message': 'Together AI is working! Using Llama 3.2 90B Vision (highest quality)',
                    'cost': 'FREE credits for new accounts',
                    'model': 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo'
                }), 200
            else:
                return jsonify({
                    'success': False,
                    'service': 'Together AI',
                    'error': f'API error: {response.status_code}',
                    'response': response.text[:300]
                }), 500
        except Exception as e:
            return jsonify({
                'success': False,
                'service': 'Together AI',
                'error': str(e)
            }), 500

    # Test Groq third (fast)
    if is_groq_configured():
        api_key = os.getenv('GROQ_API_KEY', '').strip()
        try:
            response = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.2-11b-vision-preview",
                    "messages": [{"role": "user", "content": "Say OK"}],
                    "max_tokens": 5
                },
                timeout=30
            )
            if response.status_code == 200:
                return jsonify({
                    'success': True,
                    'service': 'Groq',
                    'message': 'Groq is working! Using Llama 3.2 11B Vision (fast inference)',
                    'cost': 'FREE tier',
                    'model': 'llama-3.2-11b-vision-preview'
                }), 200
            else:
                return jsonify({
                    'success': False,
                    'service': 'Groq',
                    'error': f'API error: {response.status_code}',
                    'response': response.text[:300]
                }), 500
        except Exception as e:
            return jsonify({
                'success': False,
                'service': 'Groq',
                'error': str(e)
            }), 500

    # Fall back to OpenAI test
    api_key = os.getenv('OPENAI_API_KEY')
    if api_key:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": "Say 'OK' only"}],
                max_tokens=5
            )
            return jsonify({
                'success': True,
                'service': 'OpenAI',
                'response': response.choices[0].message.content,
                'cost': 'PAID (requires credits)'
            }), 200
        except Exception as e:
            return jsonify({
                'success': False,
                'service': 'OpenAI',
                'error': str(e)
            }), 500

    return jsonify({
        'success': False,
        'error': 'No AI service configured. Set TOGETHER_API_KEY, GROQ_API_KEY, GOOGLE_CLOUD_KEY_JSON, or OPENAI_API_KEY'
    }), 400


# ============================================
# STATS & ANALYTICS
# ============================================

@bp.route('/stats', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer', 'quality_engineer')
def get_inspection_stats():
    """
    Get comprehensive inspection statistics for dashboard.
    Returns counts by status, pass/fail rates, trends, and performance metrics.
    """
    today = date.today()
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    # Overall counts
    total = Inspection.query.count()
    by_status = {
        'draft': Inspection.query.filter_by(status='draft').count(),
        'submitted': Inspection.query.filter_by(status='submitted').count(),
        'reviewed': Inspection.query.filter_by(status='reviewed').count()
    }

    # Results distribution
    by_result = {
        'pass': Inspection.query.filter_by(result='pass').count(),
        'fail': Inspection.query.filter_by(result='fail').count(),
        'incomplete': Inspection.query.filter_by(result='incomplete').count()
    }

    # Pass rate
    completed = by_result['pass'] + by_result['fail']
    pass_rate = round((by_result['pass'] / completed * 100), 1) if completed > 0 else 0

    # Today's inspections
    today_start = datetime.combine(today, datetime.min.time())
    today_total = Inspection.query.filter(Inspection.started_at >= today_start).count()
    today_submitted = Inspection.query.filter(
        Inspection.submitted_at >= today_start
    ).count()

    # Week stats
    week_start = datetime.combine(week_ago, datetime.min.time())
    week_total = Inspection.query.filter(Inspection.started_at >= week_start).count()
    week_submitted = Inspection.query.filter(Inspection.submitted_at >= week_start).count()
    week_reviewed = Inspection.query.filter(Inspection.reviewed_at >= week_start).count()

    # Pending review count
    pending_review = Inspection.query.filter_by(status='submitted').count()

    # Average completion time (from start to submit)
    completed_inspections = Inspection.query.filter(
        Inspection.submitted_at.isnot(None),
        Inspection.started_at.isnot(None)
    ).limit(100).all()

    if completed_inspections:
        total_minutes = sum(
            (i.submitted_at - i.started_at).total_seconds() / 60
            for i in completed_inspections
        )
        avg_completion_minutes = round(total_minutes / len(completed_inspections), 1)
    else:
        avg_completion_minutes = 0

    # By equipment type
    equipment_stats = db.session.query(
        Equipment.equipment_type,
        func.count(Inspection.id).label('total'),
        func.sum(func.cast(Inspection.result == 'fail', db.Integer)).label('failed')
    ).join(Inspection).filter(
        Inspection.started_at >= week_start
    ).group_by(Equipment.equipment_type).all()

    by_equipment_type = [
        {
            'type': eq_type or 'Unknown',
            'total': total,
            'failed': failed or 0,
            'fail_rate': round((failed or 0) / total * 100, 1) if total > 0 else 0
        }
        for eq_type, total, failed in equipment_stats
    ]

    # Top performers (inspectors with most completed inspections)
    top_inspectors = db.session.query(
        User.id, User.full_name,
        func.count(Inspection.id).label('completed_count'),
        func.avg(func.cast(Inspection.result == 'pass', db.Float)).label('pass_rate')
    ).join(Inspection, Inspection.technician_id == User.id).filter(
        Inspection.status == 'reviewed',
        Inspection.reviewed_at >= week_start
    ).group_by(User.id, User.full_name).order_by(
        func.count(Inspection.id).desc()
    ).limit(10).all()

    top_performers = [
        {
            'id': id,
            'name': name,
            'completed': count,
            'pass_rate': round((rate or 0) * 100, 1)
        }
        for id, name, count, rate in top_inspectors
    ]

    # Daily trend (last 7 days)
    daily_trend = []
    for i in range(7):
        d = today - timedelta(days=i)
        day_start = datetime.combine(d, datetime.min.time())
        day_end = datetime.combine(d + timedelta(days=1), datetime.min.time())

        day_total = Inspection.query.filter(
            Inspection.started_at >= day_start,
            Inspection.started_at < day_end
        ).count()

        day_submitted = Inspection.query.filter(
            Inspection.submitted_at >= day_start,
            Inspection.submitted_at < day_end
        ).count()

        day_passed = Inspection.query.filter(
            Inspection.reviewed_at >= day_start,
            Inspection.reviewed_at < day_end,
            Inspection.result == 'pass'
        ).count()

        day_failed = Inspection.query.filter(
            Inspection.reviewed_at >= day_start,
            Inspection.reviewed_at < day_end,
            Inspection.result == 'fail'
        ).count()

        daily_trend.append({
            'date': d.isoformat(),
            'started': day_total,
            'submitted': day_submitted,
            'passed': day_passed,
            'failed': day_failed
        })

    # Defect correlation
    defect_count = Defect.query.filter(
        Defect.created_at >= week_start
    ).count()

    inspections_with_defects = db.session.query(
        func.count(func.distinct(Defect.inspection_id))
    ).filter(Defect.created_at >= week_start).scalar() or 0

    return jsonify({
        'status': 'success',
        'data': {
            'total': total,
            'by_status': by_status,
            'by_result': by_result,
            'pass_rate': pass_rate,
            'today': {
                'total': today_total,
                'submitted': today_submitted
            },
            'week': {
                'total': week_total,
                'submitted': week_submitted,
                'reviewed': week_reviewed
            },
            'pending_review': pending_review,
            'avg_completion_minutes': avg_completion_minutes,
            'by_equipment_type': by_equipment_type,
            'top_performers': top_performers,
            'daily_trend': daily_trend,
            'defects': {
                'total_this_week': defect_count,
                'inspections_with_defects': inspections_with_defects
            }
        }
    }), 200


# ============================================
# ENHANCED LIST WITH FILTERS & SEARCH
# ============================================


@bp.route('/start', methods=['POST'])
@jwt_required()
def start_inspection():
    """
    Start a new inspection (creates draft).
    
    Request Body:
        {
            "equipment_id": 1
        }
    
    Returns:
        {
            "status": "success",
            "inspection": {...}
        }
    """
    data = request.get_json()
    current_user = get_current_user()
    
    if not data or 'equipment_id' not in data:
        raise ValidationError("equipment_id is required")
    
    inspection = InspectionService.start_inspection(
        equipment_id=data['equipment_id'],
        technician_id=current_user.id
    )

# inspection is already a dict from the service
    return jsonify({
        'status': 'success',
        'message': 'Inspection started',
        'inspection': inspection
    }), 201


@bp.route('/by-assignment/<int:assignment_id>', methods=['GET'])
@jwt_required()
def get_or_start_by_assignment(assignment_id):
    """
    Get or auto-create inspection for an assignment.
    If the inspector hasn't started yet, creates a draft inspection.
    If already started, returns the existing inspection.
    """
    current_user = get_current_user()
    language = get_language(current_user)

    assignment = db.session.get(InspectionAssignment, assignment_id)
    if not assignment:
        raise NotFoundError(f"Assignment {assignment_id} not found")

    # Check the current user is one of the assigned inspectors
    if current_user.id not in (assignment.mechanical_inspector_id, assignment.electrical_inspector_id):
        raise ForbiddenError("You are not assigned to this inspection")

    # Check for existing inspection for this assignment + user
    # First look for draft, then for any status (so user can still see submitted data)
    existing = Inspection.query.filter_by(
        assignment_id=assignment_id,
        technician_id=current_user.id,
    ).filter(Inspection.status == 'draft').first()

    if not existing:
        # Also check for submitted/reviewed inspections (read-only view)
        existing = Inspection.query.filter_by(
            assignment_id=assignment_id,
            technician_id=current_user.id,
        ).order_by(Inspection.started_at.desc()).first()

    if existing:
        inspection_dict = existing.to_dict(include_answers=True, language=language)
        # Add checklist items
        from app.models import ChecklistItem
        template_items = ChecklistItem.query.filter_by(
            template_id=existing.template_id
        ).order_by(ChecklistItem.order_index).all()
        inspection_dict['checklist_items'] = [item.to_dict(language=language) for item in template_items]

        # Debug: log media file info for answers
        import logging
        logger = logging.getLogger(__name__)
        for ans in inspection_dict.get('answers', []):
            item_id = ans.get('checklist_item_id')
            pf = ans.get('photo_file')
            vf = ans.get('video_file')
            vn = ans.get('voice_note')
            if pf or vf or vn:
                logger.info("Answer item=%s: photo_file=%s video_file=%s voice_note=%s",
                    item_id,
                    pf.get('url', 'NO_URL') if pf else 'NULL',
                    vf.get('url', 'NO_URL') if vf else 'NULL',
                    vn.get('url', 'NO_URL') if vn else 'NULL')
            else:
                # Log even answers without media so we can see photo_file_id
                logger.debug("Answer item=%s: no media files attached", item_id)

        return jsonify({'status': 'success', 'data': inspection_dict}), 200

    # Auto-create: start a new inspection using template from assignment
    inspection_dict = InspectionService.start_inspection(
        equipment_id=assignment.equipment_id,
        technician_id=current_user.id,
        template_id=assignment.template_id,
        assignment_id=assignment_id
    )

    # Update assignment status to in_progress
    if assignment.status == 'assigned':
        assignment.status = 'in_progress'
        db.session.commit()

    return jsonify({'status': 'success', 'data': inspection_dict}), 201


@bp.route('/<int:inspection_id>/answer', methods=['POST'])
@jwt_required()
def answer_question(inspection_id):
    """
    Submit or update an answer to a checklist item.
    
    Request Body:
        {
            "checklist_item_id": 1,
            "answer_value": "pass",
            "comment": "Optional comment",
            "photo_path": "Optional photo path"
        }
    
    Returns:
        {
            "status": "success",
            "answer": {...}
        }
    """
    data = request.get_json()
    current_user_id = get_jwt_identity()
    
    if not data or 'checklist_item_id' not in data or 'answer_value' not in data:
        raise ValidationError("checklist_item_id and answer_value are required")
    
    answer = InspectionService.answer_question(
        inspection_id=inspection_id,
        checklist_item_id=data['checklist_item_id'],
        answer_value=data['answer_value'],
        comment=data.get('comment'),
        photo_path=data.get('photo_path'),
        voice_note_id=data.get('voice_note_id'),
        voice_transcription=data.get('voice_transcription'),
        current_user_id=current_user_id
    )

    # Auto-translate comment if provided
    # Skip translation for AI analysis comments — they're already bilingual (EN + AR)
    if data.get('comment'):
        comment_text = data['comment']
        is_analysis = '🔍' in comment_text or comment_text.startswith('EN:')
        if not is_analysis:
            from app.utils.bilingual import auto_translate_and_save
            auto_translate_and_save('inspection_answer', answer.id, {
                'comment': comment_text
            })

    return jsonify({
        'status': 'success',
        'message': 'Answer recorded',
        'answer': answer.to_dict()
    }), 200


@bp.route('/<int:inspection_id>/progress', methods=['GET'])
@jwt_required()
def get_progress(inspection_id):
    """
    Get inspection progress filtered by the current inspector's category.
    """
    current_user_id = int(get_jwt_identity())

    # Determine inspector's category from the assignment
    inspector_category = None
    inspection = db.session.get(Inspection, inspection_id)
    if inspection and inspection.assignment_id:
        assignment = db.session.get(InspectionAssignment, inspection.assignment_id)
        if assignment:
            if current_user_id == assignment.mechanical_inspector_id:
                inspector_category = 'mechanical'
            elif current_user_id == assignment.electrical_inspector_id:
                inspector_category = 'electrical'

    progress = InspectionService.get_inspection_progress(inspection_id, inspector_category)

    return jsonify({
        'status': 'success',
        'progress': progress
    }), 200


@bp.route('/<int:inspection_id>/submit', methods=['POST'])
@jwt_required()
def submit_inspection(inspection_id):
    """
    Submit inspection (draft → submitted).
    Triggers auto-defect creation.
    
    Returns:
        {
            "status": "success",
            "inspection": {...}
        }
    """
    current_user_id = get_jwt_identity()
    
    inspection = InspectionService.submit_inspection(
        inspection_id=inspection_id,
        current_user_id=current_user_id
    )
    
    return jsonify({
        'status': 'success',
        'message': 'Inspection submitted successfully',
        'inspection': inspection.to_dict(include_answers=True, language=get_language())
    }), 200


@bp.route('/<int:inspection_id>/review', methods=['POST'])
@jwt_required()
@admin_required()
def review_inspection(inspection_id):
    """
    Review inspection (submitted → reviewed). Admin only.
    
    Request Body:
        {
            "notes": "Optional review notes"
        }
    
    Returns:
        {
            "status": "success",
            "inspection": {...}
        }
    """
    data = request.get_json() or {}
    current_user_id = get_jwt_identity()
    
    inspection = InspectionService.review_inspection(
        inspection_id=inspection_id,
        reviewer_id=current_user_id,
        notes=data.get('notes')
    )
    
    return jsonify({
        'status': 'success',
        'message': 'Inspection reviewed',
        'inspection': inspection.to_dict(include_answers=True, language=get_language())
    }), 200


@bp.route('', methods=['GET'])
@jwt_required()
def list_inspections():
    """
    List inspections with advanced filtering and search.
    - Technicians see only their own
    - Admins/Engineers see all

    Query Parameters:
        status: Filter by status (draft, submitted, reviewed)
        result: Filter by result (pass, fail, incomplete)
        equipment_id: Filter by equipment
        technician_id: Filter by technician
        date_from: Start date (YYYY-MM-DD)
        date_to: End date (YYYY-MM-DD)
        search: Search by equipment name or inspection code
        has_defects: Filter inspections with defects (true/false)
        page: Page number (default 1)
        per_page: Items per page (default 20)

    Returns paginated results with metadata.
    """
    current_user = get_current_user()

    query = Inspection.query

    # Filter by role — inspectors/specialists see only their own
    if current_user.role in ('inspector', 'specialist', 'technician'):
        query = query.filter_by(technician_id=current_user.id)

    # Status filter
    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)

    # Result filter
    result = request.args.get('result')
    if result:
        query = query.filter_by(result=result)

    # Equipment filter
    equipment_id = request.args.get('equipment_id', type=int)
    if equipment_id:
        query = query.filter_by(equipment_id=equipment_id)

    # Technician filter (admin only)
    technician_id = request.args.get('technician_id', type=int)
    if technician_id and current_user.role in ('admin', 'engineer', 'quality_engineer'):
        query = query.filter_by(technician_id=technician_id)

    # Date range filters
    date_from = request.args.get('date_from')
    if date_from:
        start_date = datetime.combine(date.fromisoformat(date_from), datetime.min.time())
        query = query.filter(Inspection.started_at >= start_date)

    date_to = request.args.get('date_to')
    if date_to:
        end_date = datetime.combine(date.fromisoformat(date_to) + timedelta(days=1), datetime.min.time())
        query = query.filter(Inspection.started_at < end_date)

    # Search by equipment name or inspection code
    search = request.args.get('search')
    if search:
        search_term = f'%{search}%'
        query = query.outerjoin(Equipment).filter(
            or_(
                Inspection.inspection_code.ilike(search_term),
                Equipment.name.ilike(search_term),
                Equipment.serial_number.ilike(search_term)
            )
        )

    # Has defects filter
    has_defects = request.args.get('has_defects')
    if has_defects == 'true':
        defect_inspection_ids = db.session.query(Defect.inspection_id).distinct()
        query = query.filter(Inspection.id.in_(defect_inspection_ids))
    elif has_defects == 'false':
        defect_inspection_ids = db.session.query(Defect.inspection_id).distinct()
        query = query.filter(~Inspection.id.in_(defect_inspection_ids))

    # Pagination
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    per_page = min(per_page, 100)  # Max 100 per page

    # Get total before pagination
    total = query.count()

    # Apply ordering and pagination
    inspections = query.order_by(Inspection.created_at.desc()).offset(
        (page - 1) * per_page
    ).limit(per_page).all()

    lang = get_language(current_user)

    return jsonify({
        'status': 'success',
        'data': [inspection.to_dict(language=lang) for inspection in inspections],
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': total,
            'pages': (total + per_page - 1) // per_page
        }
    }), 200


@bp.route('/<int:inspection_id>', methods=['GET'])
@jwt_required()
def get_inspection(inspection_id):
    """
    Get inspection details with all answers.
    
    Returns:
        {
            "status": "success",
            "inspection": {...}
        }
    """
    from app.exceptions.api_exceptions import NotFoundError, ForbiddenError
    
    inspection = db.session.get(Inspection, inspection_id)
    if not inspection:
        raise NotFoundError(f"Inspection with ID {inspection_id} not found")
    
    current_user = get_current_user()
    
    # Technicians can only see their own
    if current_user.role in ('inspector', 'specialist', 'technician') and inspection.technician_id != current_user.id:
        raise ForbiddenError("Access denied")
    
    lang = get_language(current_user)

    return jsonify({
        'status': 'success',
        'inspection': inspection.to_dict(include_answers=True, language=lang)
    }), 200


IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff', 'tif'}
VIDEO_EXTENSIONS = {'mp4', 'mov', '3gp', 'avi', 'mkv', 'flv', 'wmv', 'm4v', 'ts'}


def _detect_media_type(file):
    """Detect if uploaded file is image or video based on MIME type and extension."""
    mime = (file.content_type or '').lower()
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in (file.filename or '') else ''

    if mime.startswith('video/') or ext in VIDEO_EXTENSIONS:
        return 'video'
    return 'image'


@bp.route('/<int:inspection_id>/upload-media', methods=['POST'])
@jwt_required()
def upload_answer_media(inspection_id):
    """
    Upload a photo or video for an inspection answer.
    Auto-detects image vs video from file type.
    Supports:
    1. Multipart form: file, checklist_item_id
    2. JSON with base64: file_base64, file_name, file_type, checklist_item_id
    """
    from app.services.file_service import FileService
    from app.models import InspectionAnswer
    import base64
    from io import BytesIO
    from werkzeug.datastructures import FileStorage

    current_user_id = get_jwt_identity()

    inspection = db.session.get(Inspection, inspection_id)
    if not inspection:
        raise NotFoundError(f"Inspection with ID {inspection_id} not found")

    if inspection.status != 'draft':
        raise ValidationError("Cannot modify inspection that is not in draft status")

    user = db.session.get(User, int(current_user_id))
    if user.role != 'admin' and inspection.technician_id != int(current_user_id):
        raise ForbiddenError("You can only upload media to your own inspections")

    # Check if base64 or FormData
    is_base64 = request.is_json and 'file_base64' in request.json

    if is_base64:
        # Handle base64 upload
        data = request.json
        file_base64 = data.get('file_base64')
        file_name = data.get('file_name', 'photo.jpg')
        file_type = data.get('file_type', 'image/jpeg')
        checklist_item_id = data.get('checklist_item_id')

        if not file_base64:
            raise ValidationError("file_base64 is required")
        if not checklist_item_id:
            raise ValidationError("checklist_item_id is required")

        # Decode base64 to bytes
        try:
            file_bytes = base64.b64decode(file_base64)
        except Exception as e:
            raise ValidationError(f"Invalid base64 data: {str(e)}")

        # Create FileStorage object from bytes
        file = FileStorage(
            stream=BytesIO(file_bytes),
            filename=file_name,
            content_type=file_type
        )
    else:
        # Handle FormData upload (original method)
        if 'file' not in request.files:
            raise ValidationError("No file in request")

        checklist_item_id = request.form.get('checklist_item_id')
        if not checklist_item_id:
            raise ValidationError("checklist_item_id is required")

        file = request.files['file']

    media_type = _detect_media_type(file)
    is_video = (media_type == 'video')

    file_record = FileService.upload_file(
        file=file,
        uploaded_by=int(current_user_id),
        related_type='inspection_answer_video' if is_video else 'inspection_answer',
        related_id=int(checklist_item_id),
        category='inspection_videos' if is_video else 'inspection_photos'
    )

    # Link to the answer (auto-create if doesn't exist)
    answer = InspectionAnswer.query.filter_by(
        inspection_id=inspection_id,
        checklist_item_id=int(checklist_item_id)
    ).first()

    if not answer:
        kwargs = {
            'inspection_id': inspection_id,
            'checklist_item_id': int(checklist_item_id),
            'answer_value': '',
        }
        if is_video:
            kwargs['video_path'] = file_record.stored_filename
            kwargs['video_file_id'] = file_record.id
        else:
            kwargs['photo_path'] = file_record.stored_filename
            kwargs['photo_file_id'] = file_record.id
        answer = InspectionAnswer(**kwargs)
        db.session.add(answer)
    else:
        if is_video:
            answer.video_path = file_record.stored_filename
            answer.video_file_id = file_record.id
        else:
            answer.photo_path = file_record.stored_filename
            answer.photo_file_id = file_record.id

    db.session.commit()

    # AI analysis for photos and videos (backend-side to ensure it happens)
    ai_analysis = None
    analysis_failed = False
    extracted_reading = None  # For meter reading extraction

    # Check if this is a "reading" question that needs number extraction
    from app.models import ChecklistItem
    checklist_item = db.session.get(ChecklistItem, int(checklist_item_id))
    is_reading_question = False
    is_rnr_reading = False  # Running Hours (RNR)
    is_twl_reading = False  # Twistlock Count (TWL)

    if checklist_item:
        question_text = (checklist_item.question_text or '').lower()
        question_text_ar = (checklist_item.question_text_ar or '').lower()
        combined_text = question_text + ' ' + question_text_ar

        # Check for RNR (Running Hours) reading
        is_rnr_reading = any(keyword in combined_text for keyword in [
            'rnr', 'running hours', 'running hour', 'ساعات التشغيل', 'ساعة التشغيل'
        ])

        # Check for TWL (Twistlock) reading
        is_twl_reading = any(keyword in combined_text for keyword in [
            'twl', 'twistlock', 'twist lock', 'تويست لوك', 'عدد التويست'
        ])

        # General reading question (any meter/gauge reading)
        is_reading_question = is_rnr_reading or is_twl_reading or any(keyword in combined_text for keyword in [
            'reading', 'قراءة', 'عداد', 'meter', 'gauge', 'counter'
        ])

    # AI Analysis with FULL FALLBACK CHAIN (FREE providers prioritized)
    # Order: 1.Gemini → 2.Groq(FREE) → 3.OpenRouter(FREE) → 4.HuggingFace(FREE)
    #        → 5.Together($25) → 6.SambaNova(FREE) → 7.DeepInfra($10) → 8.Ollama(local) → 9.OpenAI(paid)
    try:
        import os
        import re
        import requests

        media_type_label = "Video" if is_video else "Photo"
        logger.info(f"=== AI ANALYSIS ({media_type_label}) ===")
        logger.info(f"Is reading question: {is_reading_question}")
        logger.info(f"File URL: {file_record.file_path}")

        # For videos, use Cloudinary thumbnail URL (extract frame from video)
        if is_video:
            analyze_url = file_record.file_path
            if '/video/upload/' in analyze_url:
                analyze_url = analyze_url.replace('/video/upload/', '/video/upload/so_auto,w_640,h_480,c_fill,f_jpg/')
            elif '/upload/' in analyze_url:
                analyze_url = analyze_url.replace('/upload/', '/upload/so_auto,w_640,h_480,c_fill,f_jpg/')
            analyze_url = re.sub(r'\.(mp4|mov|webm|avi|mkv|m4v|3gp)$', '.jpg', analyze_url, flags=re.IGNORECASE)
            logger.info(f"Analyzing video thumbnail at URL: {analyze_url}")
        else:
            analyze_url = file_record.file_path
            logger.info(f"Analyzing photo at URL: {analyze_url}")

        # Import all vision services
        from app.services.gemini_service import get_vision_service as get_gemini_vision, is_gemini_configured
        from app.services.groq_service import get_vision_service as get_groq_vision, is_groq_configured
        from app.services.openrouter_service import get_vision_service as get_openrouter_vision, is_openrouter_configured
        from app.services.huggingface_service import get_vision_service as get_hf_vision, is_huggingface_configured
        from app.services.together_ai_service import get_vision_service as get_together_vision, is_together_configured
        from app.services.deepinfra_service import get_vision_service as get_deepinfra_vision, is_deepinfra_configured
        from app.services.sambanova_service import get_vision_service as get_sambanova_vision, is_sambanova_configured
        from app.services.ollama_service import get_vision_service as get_ollama_vision, is_ollama_configured

        # Download image content (needed for most services)
        image_content = None
        try:
            img_response = requests.get(analyze_url, timeout=30)
            img_response.raise_for_status()
            image_content = img_response.content
            logger.info(f"Downloaded image: {len(image_content)} bytes")
        except Exception as download_err:
            logger.error(f"Failed to download image: {download_err}")

        # Helper function to process result
        def process_vision_result(result, service_name):
            nonlocal ai_analysis, extracted_reading, analysis_failed
            if result:
                ai_analysis = {'en': result.get('en', ''), 'ar': result.get('ar', '')}
                if 'reading' in result and is_reading_question:
                    extracted_reading = result.get('reading')
                    logger.info(f"Extracted reading value: {extracted_reading}")
                logger.info(f"{service_name} analysis complete")
                return True
            return False

        # ===== FALLBACK CHAIN =====
        result = None

        # 1. Gemini (1,500 FREE/day) - PRIMARY
        if not result and is_gemini_configured() and image_content:
            try:
                logger.info("Trying: Gemini Vision (1,500 FREE/day)")
                vision_service = get_gemini_vision()
                result = vision_service.analyze_image(image_content=image_content, is_reading_question=is_reading_question)
                if process_vision_result(result, "Gemini"):
                    pass  # Success
                else:
                    result = None
            except Exception as e:
                logger.warning(f"Gemini failed: {e}, trying next...")
                result = None

        # 2. Groq (FREE forever) - FREE FALLBACK
        if not result and is_groq_configured() and image_content:
            try:
                logger.info("Trying: Groq Vision (FREE forever)")
                vision_service = get_groq_vision()
                result = vision_service.analyze_image(image_content=image_content, is_reading_question=is_reading_question)
                if process_vision_result(result, "Groq"):
                    pass
                else:
                    result = None
            except Exception as e:
                logger.warning(f"Groq failed: {e}, trying next...")
                result = None

        # 3. OpenRouter (FREE models) - FREE FALLBACK
        if not result and is_openrouter_configured() and image_content:
            try:
                logger.info("Trying: OpenRouter Vision (FREE models)")
                vision_service = get_openrouter_vision()
                result = vision_service.analyze_image(image_content=image_content, is_reading_question=is_reading_question)
                if process_vision_result(result, "OpenRouter"):
                    pass
                else:
                    result = None
            except Exception as e:
                logger.warning(f"OpenRouter failed: {e}, trying next...")
                result = None

        # 4. Hugging Face (FREE, slow) - FREE FALLBACK
        if not result and is_huggingface_configured() and image_content:
            try:
                logger.info("Trying: Hugging Face Vision (FREE, may be slow)")
                vision_service = get_hf_vision()
                result = vision_service.analyze_image(image_content=image_content, is_reading_question=is_reading_question)
                if process_vision_result(result, "Hugging Face"):
                    pass
                else:
                    result = None
            except Exception as e:
                logger.warning(f"Hugging Face failed: {e}, trying next...")
                result = None

        # 5. Together AI ($25 credits) - PAID BACKUP
        if not result and is_together_configured() and image_content:
            try:
                logger.info("Trying: Together AI Vision ($25 credits)")
                vision_service = get_together_vision()
                result = vision_service.analyze_image(image_content=image_content, is_reading_question=is_reading_question)
                if process_vision_result(result, "Together AI"):
                    pass
                else:
                    result = None
            except Exception as e:
                logger.warning(f"Together AI failed: {e}, trying next...")
                result = None

        # 6. SambaNova (FREE, 40 RPD) - FREE FALLBACK
        if not result and is_sambanova_configured() and image_content:
            try:
                logger.info("Trying: SambaNova Vision (FREE, 40 RPD)")
                vision_service = get_sambanova_vision()
                result = vision_service.analyze_image(image_content=image_content, is_reading_question=is_reading_question)
                if process_vision_result(result, "SambaNova"):
                    pass
                else:
                    result = None
            except Exception as e:
                logger.warning(f"SambaNova failed: {e}, trying next...")
                result = None

        # 7. DeepInfra ($10 credits) - CHEAP PAID
        if not result and is_deepinfra_configured() and image_content:
            try:
                logger.info("Trying: DeepInfra Vision ($10 credits, cheapest)")
                vision_service = get_deepinfra_vision()
                result = vision_service.analyze_image(image_content=image_content, is_reading_question=is_reading_question)
                if process_vision_result(result, "DeepInfra"):
                    pass
                else:
                    result = None
            except Exception as e:
                logger.warning(f"DeepInfra failed: {e}, trying next...")
                result = None

        # 7. Ollama (FREE local) - OFFLINE BACKUP
        if not result and is_ollama_configured() and image_content:
            try:
                logger.info("Trying: Ollama Vision (FREE local)")
                vision_service = get_ollama_vision()
                result = vision_service.analyze_image(image_content=image_content, is_reading_question=is_reading_question)
                if process_vision_result(result, "Ollama"):
                    pass
                else:
                    result = None
            except Exception as e:
                logger.warning(f"Ollama failed: {e}, trying next...")
                result = None

        # 8. OpenAI (PAID) - FINAL FALLBACK
        if not result:
            from openai import OpenAI
            api_key = os.getenv('OPENAI_API_KEY')

            if api_key:
                try:
                    logger.info("Trying: OpenAI GPT-4 Vision (PAID - final fallback)")
                    client = OpenAI(api_key=api_key)

                    if is_reading_question and not is_video:
                        prompt_text = (
                            "This is a photo of a meter, gauge, or counter reading. "
                            "Extract the numeric value shown on the display/dial. "
                            "Provide response in JSON: { \"en\": \"description\", \"ar\": \"وصف\", \"reading\": \"12345\" }"
                        )
                    else:
                        prompt_text = (
                            f"Analyze this industrial equipment inspection {'video frame' if is_video else 'photo'}. "
                            "Identify defects, damage, or issues. "
                            "Format: { \"en\": \"English analysis\", \"ar\": \"Arabic analysis\" }"
                        )

                    response = client.chat.completions.create(
                        model="gpt-4o",
                        messages=[{"role": "user", "content": [
                            {"type": "text", "text": prompt_text},
                            {"type": "image_url", "image_url": {"url": analyze_url}}
                        ]}],
                        max_tokens=300
                    )

                    analysis_text = response.choices[0].message.content.strip()
                    logger.info(f"OpenAI analysis: {analysis_text[:200]}")

                    try:
                        import json
                        ai_analysis = json.loads(analysis_text)
                        if 'reading' in ai_analysis and is_reading_question:
                            extracted_reading = ai_analysis.get('reading')
                    except Exception:
                        from app.services.translation_service import TranslationService
                        translated = TranslationService.auto_translate(analysis_text)
                        ai_analysis = {'en': translated.get('en') or analysis_text, 'ar': translated.get('ar') or analysis_text}
                except Exception as e:
                    logger.error(f"OpenAI failed: {e}")
                    analysis_failed = True
            else:
                logger.warning("No AI service configured - all providers failed or not configured")
                analysis_failed = True

    except Exception as e:
        logger.error(f"=== AI ANALYSIS EXCEPTION ===")
        logger.error(f"{media_type_label} AI analysis failed: {e}", exc_info=True)
        analysis_failed = True

    # Save AI analysis to the inspection answer
    if ai_analysis and answer:
        if is_video:
            answer.video_ai_analysis = ai_analysis
        else:
            answer.photo_ai_analysis = ai_analysis
        db.session.commit()
        logger.info(f"Saved {media_type_label} AI analysis to answer #{answer.id}")

    # Save RNR or TWL reading to EquipmentReading model for historical tracking
    reading_validation = None  # Will contain validation result for frontend
    if extracted_reading and (is_rnr_reading or is_twl_reading) and inspection:
        try:
            from app.models.equipment_reading import EquipmentReading
            from datetime import date as date_module

            reading_type = 'rnr' if is_rnr_reading else 'twl'
            is_faulty = extracted_reading.lower() == 'faulty' if isinstance(extracted_reading, str) else False

            # Parse the reading value
            reading_value = None
            if not is_faulty:
                try:
                    # Handle numeric strings like "12345" or "12,345"
                    clean_value = str(extracted_reading).replace(',', '').strip()
                    reading_value = float(clean_value)
                except (ValueError, TypeError):
                    is_faulty = True

            # Get the last reading for this equipment to validate
            last_reading = EquipmentReading.get_latest_reading(inspection.equipment_id, reading_type)
            last_value = last_reading.reading_value if last_reading and not last_reading.is_faulty else None

            # Validate: new reading must be >= last reading (running hours/twistlock count always increases)
            reading_rejected = False
            rejection_reason = None

            if reading_value is not None and last_value is not None:
                if reading_value < last_value:
                    reading_rejected = True
                    rejection_reason = f"Reading {reading_value} is less than last reading {last_value}. Running hours/twistlock count cannot decrease."
                    logger.warning(f"Rejected {reading_type.upper()} reading: {reading_value} < {last_value} for equipment #{inspection.equipment_id}")

            # Build validation response for frontend
            reading_validation = {
                'extracted_value': str(extracted_reading),
                'parsed_value': reading_value,
                'is_faulty': is_faulty,
                'last_reading': last_value,
                'reading_type': reading_type,
                'is_valid': not reading_rejected,
                'rejection_reason': rejection_reason,
            }

            # Only save if not rejected
            if not reading_rejected and not is_faulty:
                equipment_reading = EquipmentReading(
                    equipment_id=inspection.equipment_id,
                    reading_type=reading_type,
                    reading_value=reading_value,
                    is_faulty=is_faulty,
                    reading_date=date_module.today(),
                    recorded_by_id=int(current_user_id),
                    inspection_id=inspection_id,
                    checklist_item_id=int(checklist_item_id),
                    photo_file_id=file_record.id if not is_video else None,
                    ai_analysis=ai_analysis,
                )
                db.session.add(equipment_reading)
                db.session.commit()
                logger.info(f"Saved {reading_type.upper()} reading: {reading_value} for equipment #{inspection.equipment_id}")
            elif is_faulty:
                # Save faulty reading for tracking
                equipment_reading = EquipmentReading(
                    equipment_id=inspection.equipment_id,
                    reading_type=reading_type,
                    reading_value=None,
                    is_faulty=True,
                    reading_date=date_module.today(),
                    recorded_by_id=int(current_user_id),
                    inspection_id=inspection_id,
                    checklist_item_id=int(checklist_item_id),
                    photo_file_id=file_record.id if not is_video else None,
                    ai_analysis=ai_analysis,
                )
                db.session.add(equipment_reading)
                db.session.commit()
                logger.info(f"Saved FAULTY {reading_type.upper()} reading for equipment #{inspection.equipment_id}")

        except Exception as e:
            logger.error(f"Failed to save equipment reading: {e}")
            # Don't fail the whole upload, just log the error

    response_data = {
        'status': 'success',
        'message': f'{"Video" if is_video else "Photo"} uploaded',
        'data': file_record.to_dict(),
        'media_type': media_type,
        'ai_analysis': ai_analysis,
        'analysis_failed': analysis_failed,
        'extracted_reading': extracted_reading,  # For meter reading auto-fill
        'reading_validation': reading_validation,  # For RNR/TWL validation feedback
    }
    logger.info(f"Returning response with ai_analysis: {bool(ai_analysis)}, extracted_reading: {extracted_reading}, validation: {reading_validation}")
    return jsonify(response_data), 201



@bp.route('/<int:inspection_id>/delete-voice', methods=['POST'])
@jwt_required()
def delete_answer_voice(inspection_id):
    """
    Delete a voice note from an inspection answer.
    Removes voice file, clears transcript/translation from comment.
    """
    from app.models import InspectionAnswer
    from app.services.file_service import FileService

    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    checklist_item_id = data.get('checklist_item_id')

    if not checklist_item_id:
        raise ValidationError("checklist_item_id is required")

    inspection = db.session.get(Inspection, inspection_id)
    if not inspection:
        raise NotFoundError(f"Inspection with ID {inspection_id} not found")

    if inspection.status != 'draft':
        raise ValidationError("Cannot modify inspection that is not in draft status")

    user = db.session.get(User, int(current_user_id))
    if user.role != 'admin' and inspection.technician_id != int(current_user_id):
        raise ForbiddenError("You can only modify your own inspections")

    answer = InspectionAnswer.query.filter_by(
        inspection_id=inspection_id,
        checklist_item_id=int(checklist_item_id)
    ).first()

    if not answer:
        raise NotFoundError("Answer not found")

    # Save file ID, then clear FK FIRST to avoid constraint violation
    file_id_to_delete = answer.voice_note_id
    answer.voice_note_id = None
    answer.comment = None
    db.session.commit()

    # Now safely delete the file record
    if file_id_to_delete:
        try:
            FileService.delete_file(file_id_to_delete, int(current_user_id))
        except Exception:
            pass

    # Clean up bilingual translations
    try:
        from app.utils.bilingual import remove_translations
        remove_translations('inspection_answer', answer.id)
    except Exception:
        pass

    return jsonify({
        'status': 'success',
        'message': 'Voice note deleted'
    }), 200


@bp.route('/<int:inspection_id>/delete-photo', methods=['POST'])
@jwt_required()
def delete_answer_photo(inspection_id):
    """Delete a photo from an inspection answer."""
    from app.models import InspectionAnswer
    from app.services.file_service import FileService

    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    checklist_item_id = data.get('checklist_item_id')

    if not checklist_item_id:
        raise ValidationError("checklist_item_id is required")

    inspection = db.session.get(Inspection, inspection_id)
    if not inspection:
        raise NotFoundError(f"Inspection with ID {inspection_id} not found")

    if inspection.status != 'draft':
        raise ValidationError("Cannot modify inspection that is not in draft status")

    user = db.session.get(User, int(current_user_id))
    if user.role != 'admin' and inspection.technician_id != int(current_user_id):
        raise ForbiddenError("You can only modify your own inspections")

    answer = InspectionAnswer.query.filter_by(
        inspection_id=inspection_id,
        checklist_item_id=int(checklist_item_id)
    ).first()

    if not answer:
        raise NotFoundError("Answer not found")

    # Save file ID, then clear FK FIRST to avoid constraint violation
    file_id_to_delete = answer.photo_file_id

    # Remove photo analysis from comment
    if answer.comment:
        lines = answer.comment.split('\n')
        cleaned = [l for l in lines if not l.startswith('[Photo]:')]
        answer.comment = '\n'.join(cleaned).strip() or None

    answer.photo_path = None
    answer.photo_file_id = None
    db.session.commit()

    # Now safely delete the file record
    if file_id_to_delete:
        try:
            FileService.delete_file(file_id_to_delete, int(current_user_id))
        except Exception:
            pass

    return jsonify({'status': 'success', 'message': 'Photo deleted'}), 200


@bp.route('/<int:inspection_id>/delete-video', methods=['POST'])
@jwt_required()
def delete_answer_video(inspection_id):
    """Delete a video from an inspection answer."""
    from app.models import InspectionAnswer
    from app.services.file_service import FileService

    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    checklist_item_id = data.get('checklist_item_id')

    if not checklist_item_id:
        raise ValidationError("checklist_item_id is required")

    inspection = db.session.get(Inspection, inspection_id)
    if not inspection:
        raise NotFoundError(f"Inspection with ID {inspection_id} not found")

    if inspection.status != 'draft':
        raise ValidationError("Cannot modify inspection that is not in draft status")

    user = db.session.get(User, int(current_user_id))
    if user.role != 'admin' and inspection.technician_id != int(current_user_id):
        raise ForbiddenError("You can only modify your own inspections")

    answer = InspectionAnswer.query.filter_by(
        inspection_id=inspection_id,
        checklist_item_id=int(checklist_item_id)
    ).first()

    if not answer:
        raise NotFoundError("Answer not found")

    # Save file ID, then clear FK FIRST to avoid constraint violation
    file_id_to_delete = answer.video_file_id

    # Remove video analysis from comment
    if answer.comment:
        lines = answer.comment.split('\n')
        cleaned = [l for l in lines if not l.startswith('[Video]:')]
        answer.comment = '\n'.join(cleaned).strip() or None

    answer.video_path = None
    answer.video_file_id = None
    db.session.commit()

    # Now safely delete the file record
    if file_id_to_delete:
        try:
            FileService.delete_file(file_id_to_delete, int(current_user_id))
        except Exception:
            pass

    return jsonify({'status': 'success', 'message': 'Video deleted'}), 200


def _analyze_media_async(cloudinary_url, media_type, inspection_id, checklist_item_id):
    """
    Analyze a photo or video using GPT-4o-mini vision in a background thread.
    Uses Cloudinary URL directly - no file reading needed.
    Appends result to the answer's comment field.
    """
    import threading
    import os
    import logging
    from flask import current_app

    logger = logging.getLogger(__name__)

    # Validate we have a Cloudinary URL
    if not cloudinary_url or not cloudinary_url.startswith('http'):
        logger.warning("Analysis skipped: invalid URL: %s", cloudinary_url)
        return

    app = current_app._get_current_object()

    logger.info("Starting media analysis: url=%s type=%s inspection=%s item=%s",
                cloudinary_url, media_type, inspection_id, checklist_item_id)

    def _run_analysis():
        with app.app_context():
            try:
                for attempt in range(2):  # Retry once on failure
                    try:
                        api_key = os.getenv('OPENAI_API_KEY')
                        if not api_key:
                            logger.warning("Analysis skipped: OPENAI_API_KEY not set")
                            return

                        from openai import OpenAI
                        client = OpenAI(api_key=api_key)

                        prompt = (
                            "Analyze this industrial inspection image. "
                            "Identify any defects, damage, wear, or issues visible. "
                            "Provide your response in BOTH English and Arabic, using this exact format:\n"
                            "EN: [Your analysis in English - 1-2 sentences]\n"
                            "AR: [نفس التحليل بالعربية - جملة أو جملتين]"
                        )

                        # Use Cloudinary URL directly - GPT can fetch from URL
                        response = client.chat.completions.create(
                            model='gpt-4o-mini',
                            messages=[{
                                'role': 'user',
                                'content': [
                                    {'type': 'text', 'text': prompt},
                                    {'type': 'image_url', 'image_url': {
                                        'url': cloudinary_url,
                                        'detail': 'low',
                                    }}
                                ]
                            }],
                            max_tokens=300,
                            timeout=30,
                        )

                        analysis = response.choices[0].message.content.strip() if response.choices else None
                        if not analysis:
                            return

                        # Re-fetch answer inside this thread's session to avoid stale data
                        from app.models import InspectionAnswer
                        answer = InspectionAnswer.query.filter_by(
                            inspection_id=inspection_id,
                            checklist_item_id=checklist_item_id
                        ).first()

                        if not answer:
                            return

                        prefix = '[Photo]:' if media_type == 'image' else '[Video]:'
                        analysis_line = f'{prefix}\n{analysis}'

                        # Append — don't overwrite existing comment
                        if answer.comment:
                            answer.comment = f'{answer.comment}\n\n{analysis_line}'
                        else:
                            answer.comment = analysis_line

                        db.session.commit()

                        # Auto-translate
                        try:
                            from app.utils.bilingual import auto_translate_and_save
                            auto_translate_and_save('inspection_answer', answer.id, {
                                'comment': answer.comment
                            })
                        except Exception:
                            pass

                        logger.info("Media analysis complete: inspection=%s item=%s", inspection_id, checklist_item_id)
                        return  # Success — no need to retry

                    except Exception as e:
                        logger.error("Media analysis attempt %s failed: %s", attempt + 1, e)
                        db.session.rollback()
                        if attempt == 0:
                            import time
                            time.sleep(2)  # Wait before retry
            finally:
                db.session.remove()

    thread = threading.Thread(target=_run_analysis, daemon=True)
    thread.start()


@bp.route('/<int:inspection_id>/report', methods=['GET'])
@jwt_required()
def download_inspection_report(inspection_id):
    """
    Generate and download PDF report for an inspection.

    Returns:
        PDF file download
    """
    from flask import send_file
    from app.services.pdf_report_service import generate_inspection_report

    inspection = db.session.get(Inspection, inspection_id)
    if not inspection:
        raise NotFoundError(f"Inspection with ID {inspection_id} not found")

    current_user = get_current_user()

    # Technicians can only download their own reports
    if current_user.role in ('inspector', 'specialist', 'technician') and inspection.technician_id != current_user.id:
        raise ForbiddenError("Access denied")

    lang = get_language(current_user)

    # Get full inspection data with answers
    inspection_data = inspection.to_dict(include_answers=True, language=lang)

    # Generate PDF
    pdf_bytes = generate_inspection_report(inspection_data, language=lang)

    # Create filename
    code = inspection.inspection_code or f"INS-{inspection.id}"
    filename = f"inspection_report_{code}.pdf"

    return send_file(
        pdf_bytes,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=filename
    )


@bp.route('/<int:inspection_id>', methods=['DELETE'])
@jwt_required()
def delete_inspection(inspection_id):
    """
    Delete draft inspection.

    Returns:
        {
            "status": "success",
            "message": "Inspection deleted"
        }
    """
    current_user_id = get_jwt_identity()

    InspectionService.delete_inspection(
        inspection_id=inspection_id,
        current_user_id=current_user_id
    )

    return jsonify({
        'status': 'success',
        'message': 'Inspection deleted'
    }), 200


# ============================================
# BULK ACTIONS
# ============================================

@bp.route('/bulk-review', methods=['POST'])
@jwt_required()
@admin_required()
def bulk_review():
    """
    Bulk review multiple inspections.

    Request Body:
        {
            "inspection_ids": [1, 2, 3],
            "result": "pass",  // pass, fail, incomplete
            "notes": "Bulk reviewed - all passed quality checks"
        }
    """
    data = request.get_json()
    inspection_ids = data.get('inspection_ids', [])
    result = data.get('result')
    notes = data.get('notes', 'Bulk reviewed')

    if not inspection_ids:
        return jsonify({
            'status': 'error',
            'message': 'inspection_ids is required'
        }), 400

    if result not in ('pass', 'fail', 'incomplete'):
        return jsonify({
            'status': 'error',
            'message': 'result must be pass, fail, or incomplete'
        }), 400

    current_user_id = get_jwt_identity()
    results = {'success': [], 'errors': []}

    for inspection_id in inspection_ids:
        try:
            inspection = db.session.get(Inspection, inspection_id)

            if not inspection:
                results['errors'].append({
                    'inspection_id': inspection_id,
                    'error': 'Inspection not found'
                })
                continue

            if inspection.status != 'submitted':
                results['errors'].append({
                    'inspection_id': inspection_id,
                    'error': f'Cannot review - status is {inspection.status}'
                })
                continue

            # Review the inspection
            inspection.status = 'reviewed'
            inspection.result = result
            inspection.notes = notes
            inspection.reviewed_at = datetime.utcnow()
            inspection.reviewer_id = int(current_user_id)

            db.session.commit()

            results['success'].append({
                'inspection_id': inspection_id,
                'result': result
            })

        except Exception as e:
            db.session.rollback()
            results['errors'].append({
                'inspection_id': inspection_id,
                'error': str(e)
            })

    return jsonify({
        'status': 'success',
        'data': results,
        'summary': {
            'total': len(inspection_ids),
            'successful': len(results['success']),
            'failed': len(results['errors'])
        }
    }), 200


@bp.route('/bulk-export', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer', 'quality_engineer')
def bulk_export():
    """
    Export multiple inspection reports as a ZIP file.

    Request Body:
        {
            "inspection_ids": [1, 2, 3]
        }
    """
    import io
    import zipfile
    from flask import send_file
    from app.services.pdf_report_service import generate_inspection_report

    data = request.get_json()
    inspection_ids = data.get('inspection_ids', [])

    if not inspection_ids:
        return jsonify({
            'status': 'error',
            'message': 'inspection_ids is required'
        }), 400

    current_user = get_current_user()
    lang = get_language(current_user)

    # Create ZIP in memory
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for inspection_id in inspection_ids[:50]:  # Limit to 50
            try:
                inspection = db.session.get(Inspection, inspection_id)
                if not inspection or inspection.status == 'draft':
                    continue

                inspection_data = inspection.to_dict(include_answers=True, language=lang)
                pdf_bytes = generate_inspection_report(inspection_data, language=lang)

                code = inspection.inspection_code or f"INS-{inspection.id}"
                filename = f"inspection_report_{code}.pdf"

                zip_file.writestr(filename, pdf_bytes.getvalue())
            except Exception:
                continue

    zip_buffer.seek(0)

    return send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f'inspection_reports_{date.today().isoformat()}.zip'
    )


# ============================================
# AI INSIGHTS & ANALYTICS
# ============================================

@bp.route('/ai-insights', methods=['GET'])
@jwt_required()
@role_required('admin', 'engineer', 'quality_engineer')
def get_ai_insights():
    """
    Get AI-powered insights from inspection data.
    Analyzes patterns, anomalies, and provides recommendations.
    """
    today = date.today()
    month_ago = today - timedelta(days=30)

    # Get recent inspections with defects
    recent_inspections = Inspection.query.filter(
        Inspection.started_at >= datetime.combine(month_ago, datetime.min.time()),
        Inspection.status == 'reviewed'
    ).all()

    # Equipment failure patterns
    failure_by_equipment = db.session.query(
        Equipment.id,
        Equipment.name,
        Equipment.equipment_type,
        func.count(Inspection.id).label('total'),
        func.sum(func.cast(Inspection.result == 'fail', db.Integer)).label('failed')
    ).join(Inspection).filter(
        Inspection.started_at >= datetime.combine(month_ago, datetime.min.time()),
        Inspection.status == 'reviewed'
    ).group_by(Equipment.id, Equipment.name, Equipment.equipment_type).having(
        func.sum(func.cast(Inspection.result == 'fail', db.Integer)) > 0
    ).order_by(
        func.sum(func.cast(Inspection.result == 'fail', db.Integer)).desc()
    ).limit(10).all()

    at_risk_equipment = [
        {
            'id': eq_id,
            'name': name,
            'type': eq_type,
            'total_inspections': total,
            'failures': failed,
            'failure_rate': round(failed / total * 100, 1) if total > 0 else 0,
            'risk_level': 'high' if (failed / total * 100 if total > 0 else 0) > 30 else 'medium'
        }
        for eq_id, name, eq_type, total, failed in failure_by_equipment
    ]

    # Defect patterns by category
    from app.models import ChecklistItem
    defect_patterns = db.session.query(
        ChecklistItem.category,
        func.count(Defect.id).label('count')
    ).join(Defect, Defect.checklist_item_id == ChecklistItem.id).filter(
        Defect.created_at >= datetime.combine(month_ago, datetime.min.time())
    ).group_by(ChecklistItem.category).all()

    defect_by_category = {
        cat or 'uncategorized': count
        for cat, count in defect_patterns
    }

    # Weekly trend analysis
    weekly_data = []
    for week in range(4):
        week_start = today - timedelta(days=7 * (week + 1))
        week_end = today - timedelta(days=7 * week)

        week_inspections = Inspection.query.filter(
            Inspection.started_at >= datetime.combine(week_start, datetime.min.time()),
            Inspection.started_at < datetime.combine(week_end, datetime.min.time()),
            Inspection.status == 'reviewed'
        ).all()

        passed = sum(1 for i in week_inspections if i.result == 'pass')
        failed = sum(1 for i in week_inspections if i.result == 'fail')
        total = len(week_inspections)

        weekly_data.append({
            'week': f'Week {4 - week}',
            'start': week_start.isoformat(),
            'end': week_end.isoformat(),
            'total': total,
            'passed': passed,
            'failed': failed,
            'pass_rate': round(passed / total * 100, 1) if total > 0 else 0
        })

    # Trend direction
    if len(weekly_data) >= 2:
        current_rate = weekly_data[0]['pass_rate']
        previous_rate = weekly_data[1]['pass_rate']
        trend = 'improving' if current_rate > previous_rate else 'declining' if current_rate < previous_rate else 'stable'
        trend_change = round(current_rate - previous_rate, 1)
    else:
        trend = 'stable'
        trend_change = 0

    # Inspector performance anomalies
    inspector_stats = db.session.query(
        User.id,
        User.full_name,
        func.count(Inspection.id).label('total'),
        func.avg(func.cast(Inspection.result == 'pass', db.Float)).label('pass_rate')
    ).join(Inspection, Inspection.technician_id == User.id).filter(
        Inspection.started_at >= datetime.combine(month_ago, datetime.min.time()),
        Inspection.status == 'reviewed'
    ).group_by(User.id, User.full_name).having(
        func.count(Inspection.id) >= 5
    ).all()

    # Calculate average pass rate
    if inspector_stats:
        avg_pass_rate = sum(r[3] or 0 for r in inspector_stats) / len(inspector_stats)
    else:
        avg_pass_rate = 0

    # Find anomalies (significantly above or below average)
    anomalies = []
    for user_id, name, total, pass_rate in inspector_stats:
        if pass_rate is None:
            continue
        deviation = (pass_rate - avg_pass_rate) * 100
        if abs(deviation) > 15:  # More than 15% deviation
            anomalies.append({
                'inspector_id': user_id,
                'inspector_name': name,
                'inspections': total,
                'pass_rate': round(pass_rate * 100, 1),
                'deviation': round(deviation, 1),
                'type': 'high_performer' if deviation > 0 else 'needs_attention'
            })

    # AI Recommendations
    recommendations = []

    # Equipment recommendations
    for eq in at_risk_equipment[:3]:
        if eq['failure_rate'] > 40:
            recommendations.append({
                'type': 'equipment',
                'priority': 'high',
                'title': f"High failure rate for {eq['name']}",
                'description': f"{eq['name']} has a {eq['failure_rate']}% failure rate. Consider scheduling preventive maintenance.",
                'action': 'Schedule maintenance'
            })

    # Trend recommendations
    if trend == 'declining' and trend_change < -5:
        recommendations.append({
            'type': 'trend',
            'priority': 'medium',
            'title': 'Declining pass rate trend',
            'description': f'Pass rate dropped by {abs(trend_change)}% compared to last week. Review recent failures for patterns.',
            'action': 'Review failures'
        })

    # Inspector recommendations
    for anomaly in anomalies:
        if anomaly['type'] == 'needs_attention':
            recommendations.append({
                'type': 'inspector',
                'priority': 'medium',
                'title': f"Review needed: {anomaly['inspector_name']}",
                'description': f"Pass rate of {anomaly['pass_rate']}% is below average. May need additional training or support.",
                'action': 'Schedule review'
            })

    return jsonify({
        'status': 'success',
        'data': {
            'at_risk_equipment': at_risk_equipment,
            'defect_by_category': defect_by_category,
            'weekly_trend': weekly_data,
            'trend_summary': {
                'direction': trend,
                'change': trend_change
            },
            'anomalies': anomalies,
            'recommendations': recommendations,
            'generated_at': datetime.utcnow().isoformat()
        }
    }), 200


# ============================================
# PREVIOUS INSPECTION (Copy Functionality)
# ============================================

@bp.route('/previous/<int:equipment_id>', methods=['GET'])
@jwt_required()
def get_previous_inspection(equipment_id):
    """
    Get the last completed inspection for equipment.
    Used for "copy from previous" functionality in mobile app.

    Returns the most recent reviewed/submitted inspection with all answers
    for the same equipment, allowing inspectors to copy answers.

    Query Parameters:
        template_id: Optional - filter by specific template
        include_answers: Include full answers (default: true)

    Returns:
        {
            "status": "success",
            "data": {
                "inspection": {...},
                "answers": [...],
                "can_copy": true
            }
        }
    """
    current_user = get_current_user()
    language = get_language(current_user)

    # Validate equipment exists
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        raise NotFoundError(f"Equipment with ID {equipment_id} not found")

    # Build query for previous inspections
    query = Inspection.query.filter(
        Inspection.equipment_id == equipment_id,
        Inspection.status.in_(['submitted', 'reviewed'])
    )

    # Optional: filter by template
    template_id = request.args.get('template_id', type=int)
    if template_id:
        query = query.filter(Inspection.template_id == template_id)

    # Get the most recent completed inspection
    previous_inspection = query.order_by(
        Inspection.submitted_at.desc()
    ).first()

    if not previous_inspection:
        return jsonify({
            'status': 'success',
            'data': {
                'inspection': None,
                'answers': [],
                'can_copy': False,
                'message': 'No previous inspection found for this equipment'
            }
        }), 200

    include_answers = request.args.get('include_answers', 'true').lower() == 'true'

    inspection_data = previous_inspection.to_dict(
        include_answers=include_answers,
        language=language
    )

    # Format answers for easy copying
    copyable_answers = []
    if include_answers:
        for answer in previous_inspection.answers.all():
            copyable_answers.append({
                'checklist_item_id': answer.checklist_item_id,
                'answer_value': answer.answer_value,
                'comment': answer.comment,
                # Don't copy media files - those need fresh evidence
                'has_photo': bool(answer.photo_file_id or answer.photo_path),
                'has_video': bool(answer.video_file_id or answer.video_path),
                'has_voice': bool(answer.voice_note_id),
            })

    return jsonify({
        'status': 'success',
        'data': {
            'inspection': inspection_data,
            'answers': copyable_answers,
            'can_copy': True,
            'previous_date': previous_inspection.submitted_at.isoformat() if previous_inspection.submitted_at else None,
            'previous_result': previous_inspection.result,
            'days_ago': (datetime.utcnow() - previous_inspection.submitted_at).days if previous_inspection.submitted_at else None,
        }
    }), 200


@bp.route('/search', methods=['GET'])
@jwt_required()
def search_inspections():
    """
    Natural language search for inspections.

    Query params:
        q: Search query (e.g., "failed pump inspections last week")
    """
    query_text = request.args.get('q', '').lower()

    if not query_text:
        return jsonify({
            'status': 'error',
            'message': 'Query parameter q is required'
        }), 400

    current_user = get_current_user()
    lang = get_language(current_user)

    # Parse natural language query
    filters = {}

    # Status keywords
    if 'failed' in query_text or 'fail' in query_text:
        filters['result'] = 'fail'
    elif 'passed' in query_text or 'pass' in query_text:
        filters['result'] = 'pass'

    if 'submitted' in query_text:
        filters['status'] = 'submitted'
    elif 'reviewed' in query_text:
        filters['status'] = 'reviewed'
    elif 'draft' in query_text:
        filters['status'] = 'draft'

    # Time keywords
    today = date.today()
    if 'today' in query_text:
        filters['date_from'] = today
        filters['date_to'] = today
    elif 'yesterday' in query_text:
        filters['date_from'] = today - timedelta(days=1)
        filters['date_to'] = today - timedelta(days=1)
    elif 'last week' in query_text or 'this week' in query_text:
        filters['date_from'] = today - timedelta(days=7)
        filters['date_to'] = today
    elif 'last month' in query_text or 'this month' in query_text:
        filters['date_from'] = today - timedelta(days=30)
        filters['date_to'] = today

    # Equipment type keywords
    equipment_types = ['pump', 'crane', 'generator', 'compressor', 'conveyor', 'motor', 'valve']
    for eq_type in equipment_types:
        if eq_type in query_text:
            filters['equipment_type'] = eq_type
            break

    # Build query
    query = Inspection.query

    if current_user.role in ('inspector', 'specialist', 'technician'):
        query = query.filter_by(technician_id=current_user.id)

    if filters.get('result'):
        query = query.filter_by(result=filters['result'])

    if filters.get('status'):
        query = query.filter_by(status=filters['status'])

    if filters.get('date_from'):
        query = query.filter(Inspection.started_at >= datetime.combine(filters['date_from'], datetime.min.time()))

    if filters.get('date_to'):
        query = query.filter(Inspection.started_at < datetime.combine(filters['date_to'] + timedelta(days=1), datetime.min.time()))

    if filters.get('equipment_type'):
        query = query.join(Equipment).filter(
            Equipment.equipment_type.ilike(f"%{filters['equipment_type']}%")
        )

    inspections = query.order_by(Inspection.created_at.desc()).limit(50).all()

    return jsonify({
        'status': 'success',
        'query': query_text,
        'filters_applied': {k: str(v) for k, v in filters.items()},
        'count': len(inspections),
        'data': [i.to_dict(language=lang) for i in inspections]
    }), 200