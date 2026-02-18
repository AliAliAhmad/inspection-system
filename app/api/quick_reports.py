"""
Quick Field Report endpoints.
Allows any user to report equipment defects or safety hazards from the field.
"""

from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Defect, User
from app.extensions import db, safe_commit
from app.utils.decorators import get_current_user, get_language
from app.services.notification_service import NotificationService

bp = Blueprint('quick_reports', __name__)


@bp.route('', methods=['POST'])
@jwt_required()
def create_quick_report():
    """
    Create a quick field report.

    For equipment issues: creates a real Defect with full workflow.
    For safety hazards: creates a Defect tagged as safety report.

    Request Body (JSON):
        {
            "type": "equipment" | "safety",       // required
            "severity": "minor" | "major" | "critical",  // required for equipment
            "equipment_id": 5,                    // required for equipment
            "description": "Hydraulic leak...",   // optional text description
            "photo_url": "https://...",           // optional
            "voice_note_id": 123,                 // optional voice note ID
            "voice_note_url": "https://...",      // optional voice note URL
            "hazard_type": "spill",               // required for safety
            "location": "Near crane #3"           // required for safety
        }

    Returns:
        {
            "status": "success",
            "data": { defect object },
            "message": "Report submitted"
        }
    """
    current_user = get_current_user()
    data = request.get_json()

    if not data:
        return jsonify({'status': 'error', 'message': 'Request body is required'}), 400

    report_type = data.get('type')
    if report_type not in ('equipment', 'safety'):
        return jsonify({'status': 'error', 'message': 'type must be "equipment" or "safety"'}), 400

    # Severity mapping
    severity = data.get('severity', 'medium')
    severity_map = {
        'minor': 'low',
        'major': 'high',
        'critical': 'critical',
        'low': 'low',
        'medium': 'medium',
        'high': 'high',
    }
    defect_severity = severity_map.get(severity, 'medium')

    # Priority from severity
    priority_map = {
        'low': 'low',
        'medium': 'medium',
        'high': 'high',
        'critical': 'urgent',
    }
    defect_priority = priority_map.get(defect_severity, 'medium')

    # SLA days from severity
    sla_map = {'low': 14, 'medium': 7, 'high': 3, 'critical': 1}
    sla_days = sla_map.get(defect_severity, 7)

    # Build description
    description = data.get('description', '')
    voice_transcription = data.get('voice_transcription', '')

    if not description and voice_transcription:
        description = voice_transcription
    elif not description:
        if report_type == 'equipment':
            description = f'Field-reported equipment issue (severity: {severity})'
        else:
            hazard = data.get('hazard_type', 'unknown')
            location = data.get('location', 'unknown location')
            description = f'Safety hazard: {hazard} at {location}'

    # Create defect
    defect = Defect(
        description=description,
        severity=defect_severity,
        priority=defect_priority,
        status='open',
        due_date=datetime.utcnow().date() + timedelta(days=sla_days),
        sla_days=sla_days,
        report_source='field_report' if report_type == 'equipment' else 'safety_report',
        reported_by_id=current_user.id,
        photo_url=data.get('photo_url'),
        voice_note_url=data.get('voice_note_url'),
        equipment_id_direct=data.get('equipment_id') if report_type == 'equipment' else None,
        location_description=data.get('location') if report_type == 'safety' else None,
        hazard_type=data.get('hazard_type') if report_type == 'safety' else None,
        category=data.get('category'),  # mechanical/electrical if provided
    )

    db.session.add(defect)
    safe_commit()

    # Send notifications
    _send_report_notifications(defect, current_user, report_type)

    lang = get_language(current_user)

    return jsonify({
        'status': 'success',
        'message': 'Report submitted',
        'data': defect.to_dict(language=lang),
    }), 201


@bp.route('', methods=['GET'])
@jwt_required()
def list_quick_reports():
    """
    List field-reported defects/safety reports.

    Query params:
        type: 'equipment' | 'safety' | 'all' (default: 'all')
        page, per_page: pagination
    """
    from app.utils.pagination import paginate

    current_user = get_current_user()
    report_type = request.args.get('type', 'all')

    query = Defect.query.filter(
        Defect.report_source.in_(['field_report', 'safety_report'])
    )

    if report_type == 'equipment':
        query = query.filter(Defect.report_source == 'field_report')
    elif report_type == 'safety':
        query = query.filter(Defect.report_source == 'safety_report')

    query = query.order_by(Defect.created_at.desc())
    items, pagination = paginate(query)
    lang = get_language(current_user)

    return jsonify({
        'status': 'success',
        'data': [d.to_dict(language=lang) for d in items],
        'pagination': pagination,
    }), 200


def _send_report_notifications(defect, reporter, report_type):
    """Send notifications about the quick report to all users."""
    all_users = User.query.filter(User.is_active == True).all()

    type_label = 'Equipment Issue' if report_type == 'equipment' else 'Safety Hazard'
    emoji = '⚠️' if report_type == 'safety' else '🔧'

    for user in all_users:
        if user.id == reporter.id:
            continue

        # Admin and engineer get important/urgent priority
        is_admin_or_engineer = user.role in ('admin', 'engineer')
        priority = 'urgent' if is_admin_or_engineer else 'info'

        # Build equipment info if available
        equip_info = ''
        if defect.equipment_id_direct and defect.equipment_direct:
            equip_info = f' — {defect.equipment_direct.name}'

        NotificationService.create_notification(
            user_id=user.id,
            type='quick_field_report',
            title=f'{emoji} {type_label} Reported{equip_info}',
            message=f'{reporter.full_name} reported: {defect.description[:100]}',
            related_type='defect',
            related_id=defect.id,
            priority=priority,
        )
