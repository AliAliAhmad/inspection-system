"""Mobile Toolkit API endpoints."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db, safe_commit
from app.models.toolkit_preference import ToolkitPreference

bp = Blueprint('toolkit', __name__)


@bp.route('/preferences', methods=['GET'])
@jwt_required()
def get_preferences():
    """Get user's toolkit preferences."""
    user_id = get_jwt_identity()
    prefs = ToolkitPreference.query.filter_by(user_id=user_id).first()

    if not prefs:
        # Create default preferences
        prefs = ToolkitPreference(user_id=user_id)
        db.session.add(prefs)
        safe_commit()

    return jsonify({'status': 'success', 'data': prefs.to_dict()}), 200


@bp.route('/preferences', methods=['PUT'])
@jwt_required()
def update_preferences():
    """Update user's toolkit preferences."""
    user_id = get_jwt_identity()
    data = request.get_json()

    prefs = ToolkitPreference.query.filter_by(user_id=user_id).first()
    if not prefs:
        prefs = ToolkitPreference(user_id=user_id)
        db.session.add(prefs)

    # Update only provided fields
    allowed_fields = [
        'simple_mode_enabled', 'fab_enabled', 'fab_position',
        'persistent_notification', 'voice_commands_enabled', 'voice_language',
        'shake_to_pause', 'nfc_enabled', 'widget_enabled', 'smartwatch_enabled',
        'quick_camera_enabled', 'barcode_scanner_enabled', 'voice_checklist_enabled',
        'auto_location_enabled', 'team_map_enabled', 'voice_review_enabled',
        'red_zone_alerts', 'photo_compare_enabled', 'voice_rating_enabled',
        'punch_list_enabled', 'morning_brief_enabled', 'kpi_alerts_enabled',
        'emergency_broadcast',
    ]

    for field in allowed_fields:
        if field in data:
            setattr(prefs, field, data[field])

    safe_commit()
    return jsonify({'status': 'success', 'data': prefs.to_dict()}), 200


@bp.route('/quick-actions', methods=['GET'])
@jwt_required()
def get_quick_actions():
    """Get available quick actions for the current user's role."""
    user_id = get_jwt_identity()
    from app.models.user import User
    user = User.query.get(user_id)

    if not user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404

    # Role-specific quick actions
    actions = {
        'specialist': [
            {'id': 'pause_job', 'label': 'Pause Job', 'label_ar': 'إيقاف مؤقت', 'icon': 'pause-circle', 'color': '#fa8c16', 'action': 'pause'},
            {'id': 'complete_job', 'label': 'Complete Job', 'label_ar': 'إنهاء العمل', 'icon': 'check-circle', 'color': '#52c41a', 'action': 'complete'},
            {'id': 'incomplete_job', 'label': 'Incomplete', 'label_ar': 'غير مكتمل', 'icon': 'exclamation-circle', 'color': '#ff4d4f', 'action': 'incomplete'},
            {'id': 'help', 'label': 'Need Help', 'label_ar': 'أحتاج مساعدة', 'icon': 'question-circle', 'color': '#1677ff', 'action': 'help'},
        ],
        'inspector': [
            {'id': 'start_inspection', 'label': 'Start Inspection', 'label_ar': 'بدء الفحص', 'icon': 'play-circle', 'color': '#52c41a', 'action': 'start_inspection'},
            {'id': 'report_defect', 'label': 'Report Defect', 'label_ar': 'إبلاغ عن خلل', 'icon': 'warning', 'color': '#ff4d4f', 'action': 'report_defect'},
            {'id': 'take_photo', 'label': 'Quick Photo', 'label_ar': 'صورة سريعة', 'icon': 'camera', 'color': '#1677ff', 'action': 'camera'},
            {'id': 'scan_nfc', 'label': 'Scan Equipment', 'label_ar': 'مسح المعدات', 'icon': 'scan', 'color': '#722ed1', 'action': 'nfc_scan'},
        ],
        'engineer': [
            {'id': 'approve_pause', 'label': 'Approve Pause', 'label_ar': 'موافقة الإيقاف', 'icon': 'check-circle', 'color': '#52c41a', 'action': 'approve_pause'},
            {'id': 'assign_job', 'label': 'Assign Job', 'label_ar': 'تعيين عمل', 'icon': 'user-add', 'color': '#1677ff', 'action': 'assign_job'},
            {'id': 'daily_review', 'label': 'Daily Review', 'label_ar': 'المراجعة اليومية', 'icon': 'audit', 'color': '#fa8c16', 'action': 'daily_review'},
            {'id': 'team_chat', 'label': 'Team Chat', 'label_ar': 'محادثة الفريق', 'icon': 'message', 'color': '#13c2c2', 'action': 'team_chat'},
        ],
        'quality_engineer': [
            {'id': 'review_job', 'label': 'Review Job', 'label_ar': 'مراجعة العمل', 'icon': 'file-search', 'color': '#1677ff', 'action': 'review_job'},
            {'id': 'compare_photos', 'label': 'Compare Photos', 'label_ar': 'مقارنة الصور', 'icon': 'picture', 'color': '#722ed1', 'action': 'compare_photos'},
            {'id': 'voice_rating', 'label': 'Voice Rating', 'label_ar': 'تقييم صوتي', 'icon': 'audio', 'color': '#fa8c16', 'action': 'voice_rating'},
            {'id': 'punch_list', 'label': 'Punch List', 'label_ar': 'قائمة التصحيح', 'icon': 'ordered-list', 'color': '#ff4d4f', 'action': 'punch_list'},
        ],
        'admin': [
            {'id': 'broadcast', 'label': 'Broadcast', 'label_ar': 'بث عام', 'icon': 'notification', 'color': '#ff4d4f', 'action': 'broadcast'},
            {'id': 'quick_report', 'label': 'Quick Report', 'label_ar': 'تقرير سريع', 'icon': 'bar-chart', 'color': '#1677ff', 'action': 'quick_report'},
            {'id': 'toggle_user', 'label': 'Toggle User', 'label_ar': 'تفعيل مستخدم', 'icon': 'user-switch', 'color': '#fa8c16', 'action': 'toggle_user'},
            {'id': 'kpi_check', 'label': 'KPI Check', 'label_ar': 'فحص الأداء', 'icon': 'dashboard', 'color': '#52c41a', 'action': 'kpi_check'},
        ],
    }

    user_actions = actions.get(user.role, actions.get('specialist', []))

    return jsonify({'status': 'success', 'data': user_actions}), 200


@bp.route('/nfc/lookup', methods=['POST'])
@jwt_required()
def nfc_lookup():
    """Look up equipment by NFC tag data or serial number."""
    data = request.get_json()
    tag_data = data.get('tag_data', '')
    serial = data.get('serial_number', '')

    from app.models.equipment import Equipment

    equipment = None
    if serial:
        equipment = Equipment.query.filter_by(serial_number=serial).first()
    elif tag_data:
        # Try to find by serial in tag data
        equipment = Equipment.query.filter_by(serial_number=tag_data).first()
        if not equipment:
            # Try name match
            equipment = Equipment.query.filter(
                Equipment.name.ilike(f'%{tag_data}%')
            ).first()

    if not equipment:
        return jsonify({'status': 'error', 'message': 'Equipment not found'}), 404

    # Get active jobs for this equipment
    from app.models.specialist_job import SpecialistJob
    active_jobs = SpecialistJob.query.filter(
        SpecialistJob.status.in_(['assigned', 'in_progress', 'paused']),
    ).join(
        db.Model.metadata.tables.get('defects', db.Table('defects', db.MetaData())),
        isouter=True
    ).all() if hasattr(SpecialistJob, 'defect') else []

    return jsonify({
        'status': 'success',
        'data': {
            'equipment': equipment.to_dict() if hasattr(equipment, 'to_dict') else {'id': equipment.id, 'name': equipment.name},
        }
    }), 200


@bp.route('/voice/command', methods=['POST'])
@jwt_required()
def voice_command():
    """Process a voice command (text after transcription)."""
    user_id = get_jwt_identity()
    data = request.get_json()
    command_text = data.get('text', '').lower().strip()
    language = data.get('language', 'en')

    # Simple command parsing (works without AI)
    commands_en = {
        'pause': ['pause', 'stop', 'hold', 'wait', 'break'],
        'complete': ['complete', 'done', 'finish', 'finished', 'complete job'],
        'incomplete': ['incomplete', 'not done', 'not finished', 'cannot finish', 'can not finish'],
        'help': ['help', 'need help', 'assistance', 'support'],
        'start': ['start', 'begin', 'resume', 'continue'],
        'photo': ['photo', 'picture', 'camera', 'capture', 'take photo'],
        'defect': ['defect', 'problem', 'issue', 'report defect', 'broken'],
    }

    commands_ar = {
        'pause': ['إيقاف', 'توقف', 'وقف', 'استراحة'],
        'complete': ['إنهاء', 'تم', 'خلص', 'انتهى', 'كامل'],
        'incomplete': ['غير مكتمل', 'ما خلص', 'ما تم', 'لم يكتمل'],
        'help': ['مساعدة', 'أحتاج مساعدة', 'ساعدني'],
        'start': ['بدء', 'ابدأ', 'استمر', 'تابع'],
        'photo': ['صورة', 'كاميرا', 'تصوير'],
        'defect': ['خلل', 'عطل', 'مشكلة', 'تقرير'],
    }

    commands = commands_ar if language == 'ar' else commands_en

    detected_action = None
    confidence = 0.0

    for action, keywords in commands.items():
        for kw in keywords:
            if kw in command_text:
                detected_action = action
                confidence = 1.0 if command_text == kw else 0.8
                break
        if detected_action:
            break

    if not detected_action:
        return jsonify({
            'status': 'success',
            'data': {
                'action': None,
                'confidence': 0,
                'message': 'Command not recognized',
                'original_text': command_text,
            }
        }), 200

    return jsonify({
        'status': 'success',
        'data': {
            'action': detected_action,
            'confidence': confidence,
            'message': f'Detected: {detected_action}',
            'original_text': command_text,
        }
    }), 200
