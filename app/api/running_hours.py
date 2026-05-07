"""
Running Hours API
Equipment service tracking: meter readings, service intervals, alerts, dashboard
"""
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.running_hours import RunningHoursReading, ServiceInterval, RunningHoursAlert
from app.models.equipment import Equipment
from app.models.equipment_reading import EquipmentReading
from app.models.inspection import Inspection, InspectionAnswer
from app.models.checklist import ChecklistItem
from app.models.user import User
from app.services.running_hours_detection import is_running_hours_question

bp = Blueprint('running_hours', __name__)


def get_current_user():
    user_id = get_jwt_identity()
    return db.session.get(User, user_id)


def get_service_status(current_hours, service_interval):
    """Calculate service status based on current hours and interval config."""
    if not service_interval:
        return 'ok', None, None, 0

    hours_until = service_interval.next_service_hours - current_hours
    interval = service_interval.service_interval_hours or 500

    if hours_until <= 0:
        return 'overdue', hours_until, abs(hours_until), 100
    elif hours_until <= service_interval.alert_threshold_hours:
        pct = ((interval - hours_until) / interval) * 100
        return 'approaching', hours_until, None, min(pct, 100)
    else:
        pct = ((interval - hours_until) / interval) * 100
        return 'ok', hours_until, None, max(pct, 0)


def get_running_hours_item_ids():
    """Return checklist_item IDs that represent running-hours questions.

    Cached at the call-site by passing the result into build_running_hours_data()
    so list_running_hours()/get_summary()/get_service_due() don't re-query
    ChecklistItem once per equipment.
    """
    items = ChecklistItem.query.filter(ChecklistItem.answer_type == 'numeric').all()
    return [
        ci.id for ci in items
        if is_running_hours_question(ci.question_text, ci.question_text_ar)
    ]


def _latest_inspection_answer_hours(equipment_id, rh_item_ids):
    """Find the most recent inspector-typed numeric answer for a running-hours question.

    Returns (value, answered_at_dt, answer_row) or None when nothing is found
    or the most recent value isn't parseable as a float.
    """
    if not rh_item_ids:
        return None
    row = db.session.query(InspectionAnswer).join(
        Inspection, InspectionAnswer.inspection_id == Inspection.id
    ).filter(
        Inspection.equipment_id == equipment_id,
        Inspection.status.in_(('submitted', 'reviewed')),
        InspectionAnswer.checklist_item_id.in_(rh_item_ids),
        InspectionAnswer.answer_value.isnot(None),
        InspectionAnswer.answer_value != '',
    ).order_by(InspectionAnswer.answered_at.desc()).first()
    if not row:
        return None
    try:
        value = float(str(row.answer_value).replace(',', '').strip())
    except (TypeError, ValueError):
        return None
    return value, row.answered_at, row


def build_running_hours_data(equipment, rh_item_ids=None):
    """Build complete running hours data for an equipment item.

    Merges three sources (pick latest by timestamp):
      1) EquipmentReading.rnr — written by inspections when AI extraction succeeds
      2) RunningHoursReading — manual entries via the dashboard
      3) InspectionAnswer.answer_value — inspector-typed numeric answers for
         running-hours checklist items (used when AI extraction fails or
         the question wording wasn't recognized as a meter-reading question)
    """
    if rh_item_ids is None:
        rh_item_ids = get_running_hours_item_ids()

    # Source 1: EquipmentReading (rnr)
    latest_er = EquipmentReading.query.filter(
        EquipmentReading.equipment_id == equipment.id,
        EquipmentReading.reading_type == 'rnr',
        EquipmentReading.is_faulty.is_(False),
        EquipmentReading.reading_value.isnot(None),
    ).order_by(
        EquipmentReading.reading_date.desc(),
        EquipmentReading.recorded_at.desc(),
    ).first()

    # Source 2: RunningHoursReading
    latest_rhr = RunningHoursReading.query.filter_by(
        equipment_id=equipment.id
    ).order_by(RunningHoursReading.recorded_at.desc()).first()

    # Source 3: InspectionAnswer.answer_value
    latest_ia = _latest_inspection_answer_hours(equipment.id, rh_item_ids)

    # Pick latest across all three sources
    candidates = []
    if latest_er:
        ts = latest_er.recorded_at or (
            datetime.combine(latest_er.reading_date, datetime.min.time())
            if latest_er.reading_date else None
        )
        candidates.append(('equipment_reading', latest_er.reading_value, ts, latest_er))
    if latest_rhr:
        candidates.append(('running_hours_reading', latest_rhr.hours, latest_rhr.recorded_at, latest_rhr))
    if latest_ia:
        ia_value, ia_ts, ia_row = latest_ia
        candidates.append(('inspection_answer', ia_value, ia_ts, ia_row))

    # Drop candidates without a usable timestamp before sorting
    candidates = [c for c in candidates if c[2] is not None]
    candidates.sort(key=lambda c: c[2], reverse=True)

    if candidates:
        source_type, current_hours, latest_ts, latest_obj = candidates[0]
    else:
        source_type, current_hours, latest_ts, latest_obj = None, 0, None, None

    # Shape last_reading consistently regardless of which source won
    last_reading = None
    if latest_obj is not None:
        if source_type == 'running_hours_reading':
            last_reading = latest_obj.to_dict()
        elif source_type == 'equipment_reading':
            last_reading = {
                'id': latest_obj.id,
                'hours': latest_obj.reading_value,
                'recorded_at': latest_ts.isoformat() if latest_ts else None,
                'source': 'equipment_reading',
                'inspection_id': latest_obj.inspection_id,
            }
        elif source_type == 'inspection_answer':
            last_reading = {
                'id': latest_obj.id,
                'hours': current_hours,
                'recorded_at': latest_ts.isoformat() if latest_ts else None,
                'source': 'inspection_answer',
                'inspection_id': latest_obj.inspection_id,
            }

    si = ServiceInterval.query.filter_by(equipment_id=equipment.id).first()
    status, hours_until, hours_overdue, progress = get_service_status(current_hours, si)

    return {
        'equipment_id': equipment.id,
        'equipment_name': equipment.name,
        'equipment_type': equipment.equipment_type,
        'current_hours': current_hours,
        'last_reading': last_reading,
        'service_interval': si.to_dict() if si else None,
        'service_status': status,
        'hours_until_service': hours_until,
        'hours_overdue': hours_overdue,
        'progress_percent': round(progress, 1),
        'assigned_engineer_id': equipment.assigned_technician_id,
        'assigned_engineer': {
            'id': equipment.assigned_technician.id,
            'full_name': equipment.assigned_technician.full_name,
            'email': equipment.assigned_technician.email,
        } if equipment.assigned_technician else None,
        'location': equipment.location or '',
        'berth': equipment.berth,
    }


# ============================================
# RUNNING HOURS ENDPOINTS
# ============================================

@bp.route('/<int:equipment_id>/running-hours', methods=['GET'])
@jwt_required()
def get_running_hours(equipment_id):
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        return jsonify({'status': 'error', 'message': 'Equipment not found'}), 404

    return jsonify({'status': 'success', 'data': build_running_hours_data(equipment)})


@bp.route('/<int:equipment_id>/running-hours', methods=['POST'])
@jwt_required()
def create_reading(equipment_id):
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        return jsonify({'status': 'error', 'message': 'Equipment not found'}), 404

    data = request.get_json()
    hours = data.get('hours')
    if hours is None:
        return jsonify({'status': 'error', 'message': 'hours is required'}), 400

    # Validate hours >= last reading
    latest = RunningHoursReading.query.filter_by(
        equipment_id=equipment_id
    ).order_by(RunningHoursReading.recorded_at.desc()).first()

    if latest and hours < latest.hours:
        return jsonify({
            'status': 'error',
            'message': f'New reading ({hours}) must be >= last reading ({latest.hours})'
        }), 400

    user = get_current_user()
    reading = RunningHoursReading(
        equipment_id=equipment_id,
        hours=hours,
        recorded_by_id=user.id,
        notes=data.get('notes'),
        source=data.get('source', 'manual'),
    )
    db.session.add(reading)

    # Check for spike alert
    if latest and (hours - latest.hours) > 100:
        alert = RunningHoursAlert(
            equipment_id=equipment_id,
            alert_type='hours_spike',
            severity='warning',
            message=f'Unusual spike: {round(hours - latest.hours, 1)} hours since last reading',
            hours_value=hours,
            threshold_value=latest.hours,
        )
        db.session.add(alert)

    # Check service alerts
    si = ServiceInterval.query.filter_by(equipment_id=equipment_id).first()
    if si:
        hours_until = si.next_service_hours - hours
        if hours_until <= 0:
            existing = RunningHoursAlert.query.filter_by(
                equipment_id=equipment_id, alert_type='overdue_service', acknowledged_at=None
            ).first()
            if not existing:
                alert = RunningHoursAlert(
                    equipment_id=equipment_id,
                    alert_type='overdue_service',
                    severity='critical',
                    message=f'Service overdue by {abs(round(hours_until, 1))} hours',
                    hours_value=hours,
                    threshold_value=si.next_service_hours,
                )
                db.session.add(alert)
        elif hours_until <= si.alert_threshold_hours:
            existing = RunningHoursAlert.query.filter_by(
                equipment_id=equipment_id, alert_type='approaching_service', acknowledged_at=None
            ).first()
            if not existing:
                alert = RunningHoursAlert(
                    equipment_id=equipment_id,
                    alert_type='approaching_service',
                    severity='warning',
                    message=f'Service due in {round(hours_until, 1)} hours',
                    hours_value=hours,
                    threshold_value=si.next_service_hours,
                )
                db.session.add(alert)

    db.session.commit()
    return jsonify({'status': 'success', 'data': reading.to_dict()}), 201


@bp.route('/<int:equipment_id>/running-hours/history', methods=['GET'])
@jwt_required()
def get_history(equipment_id):
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        return jsonify({'status': 'error', 'message': 'Equipment not found'}), 404

    limit = request.args.get('limit', 50, type=int)
    readings = RunningHoursReading.query.filter_by(
        equipment_id=equipment_id
    ).order_by(RunningHoursReading.recorded_at.desc()).limit(limit).all()

    hours_list = [r.hours for r in readings] if readings else []

    return jsonify({
        'status': 'success',
        'data': {
            'readings': [r.to_dict() for r in readings],
            'total_readings': len(readings),
            'avg_hours_per_day': 0,
            'max_hours': max(hours_list) if hours_list else 0,
            'min_hours': min(hours_list) if hours_list else 0,
            'date_range': {
                'start': readings[-1].recorded_at.isoformat() if readings else None,
                'end': readings[0].recorded_at.isoformat() if readings else None,
            }
        }
    })


# ============================================
# SERVICE INTERVAL ENDPOINTS
# ============================================

@bp.route('/<int:equipment_id>/service-interval', methods=['GET'])
@jwt_required()
def get_service_interval(equipment_id):
    si = ServiceInterval.query.filter_by(equipment_id=equipment_id).first()
    if not si:
        return jsonify({'status': 'success', 'data': None})

    return jsonify({'status': 'success', 'data': si.to_dict()})


@bp.route('/<int:equipment_id>/service-interval', methods=['PATCH'])
@jwt_required()
def update_service_interval(equipment_id):
    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        return jsonify({'status': 'error', 'message': 'Equipment not found'}), 404

    data = request.get_json()
    si = ServiceInterval.query.filter_by(equipment_id=equipment_id).first()

    if not si:
        si = ServiceInterval(equipment_id=equipment_id)
        db.session.add(si)

    if 'service_interval_hours' in data:
        si.service_interval_hours = data['service_interval_hours']
        si.next_service_hours = si.last_service_hours + si.service_interval_hours
    if 'alert_threshold_hours' in data:
        si.alert_threshold_hours = data['alert_threshold_hours']
    if 'last_service_date' in data:
        si.last_service_date = datetime.fromisoformat(data['last_service_date'])
    if 'last_service_hours' in data:
        si.last_service_hours = data['last_service_hours']
        si.next_service_hours = si.last_service_hours + si.service_interval_hours

    db.session.commit()
    return jsonify({'status': 'success', 'data': si.to_dict()})


@bp.route('/<int:equipment_id>/service-interval/reset', methods=['POST'])
@jwt_required()
def reset_service(equipment_id):
    si = ServiceInterval.query.filter_by(equipment_id=equipment_id).first()
    if not si:
        return jsonify({'status': 'error', 'message': 'No service interval configured'}), 404

    data = request.get_json()
    si.last_service_date = datetime.fromisoformat(data['service_date']) if data.get('service_date') else datetime.now(timezone.utc)
    si.last_service_hours = data.get('hours_at_service', 0)
    si.next_service_hours = si.last_service_hours + si.service_interval_hours

    # Clear overdue/approaching alerts
    RunningHoursAlert.query.filter(
        RunningHoursAlert.equipment_id == equipment_id,
        RunningHoursAlert.alert_type.in_(['overdue_service', 'approaching_service']),
        RunningHoursAlert.acknowledged_at.is_(None)
    ).update({'acknowledged_at': datetime.now(timezone.utc)}, synchronize_session=False)

    db.session.commit()
    return jsonify({'status': 'success', 'data': si.to_dict()})


# ============================================
# DASHBOARD ENDPOINTS
# ============================================

@bp.route('/running-hours', methods=['GET'])
@jwt_required()
def list_running_hours():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    status_filter = request.args.get('status')
    search = request.args.get('search')
    sort_by = request.args.get('sort_by', 'name')

    query = Equipment.query.filter(Equipment.is_scrapped.is_(False))

    if search:
        query = query.filter(
            db.or_(
                Equipment.name.ilike(f'%{search}%'),
                Equipment.serial_number.ilike(f'%{search}%'),
            )
        )

    equipment_list = query.all()
    rh_item_ids = get_running_hours_item_ids()
    results = []

    for eq in equipment_list:
        data = build_running_hours_data(eq, rh_item_ids=rh_item_ids)
        if status_filter and data['service_status'] != status_filter:
            continue
        results.append(data)

    # Sort
    if sort_by == 'urgency':
        order = {'overdue': 0, 'approaching': 1, 'ok': 2}
        results.sort(key=lambda x: order.get(x['service_status'], 2))
    elif sort_by == 'hours':
        results.sort(key=lambda x: x['current_hours'], reverse=True)
    else:
        results.sort(key=lambda x: x['equipment_name'])

    # Paginate
    total = len(results)
    start = (page - 1) * per_page
    paginated = results[start:start + per_page]

    return jsonify({
        'status': 'success',
        'data': paginated,
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': total,
            'pages': (total + per_page - 1) // per_page,
        }
    })


@bp.route('/running-hours/summary', methods=['GET'])
@jwt_required()
def get_summary():
    equipment_list = Equipment.query.filter(Equipment.is_scrapped.is_(False)).all()
    rh_item_ids = get_running_hours_item_ids()

    summary = {'ok': [], 'approaching': [], 'overdue': []}
    total_hours = 0
    count_with_hours = 0

    for eq in equipment_list:
        data = build_running_hours_data(eq, rh_item_ids=rh_item_ids)
        summary[data['service_status']].append(data)
        if data['current_hours'] > 0:
            total_hours += data['current_hours']
            count_with_hours += 1

    return jsonify({
        'status': 'success',
        'data': {
            'total_equipment': len(equipment_list),
            'with_running_hours': count_with_hours,
            'ok_count': len(summary['ok']),
            'approaching_count': len(summary['approaching']),
            'overdue_count': len(summary['overdue']),
            'avg_hours': round(total_hours / count_with_hours, 1) if count_with_hours > 0 else 0,
            'equipment_by_status': summary,
        }
    })


@bp.route('/service-due', methods=['GET'])
@jwt_required()
def get_service_due():
    status_filter = request.args.get('status')
    limit = request.args.get('limit', 20, type=int)

    equipment_list = Equipment.query.filter(Equipment.is_scrapped.is_(False)).all()
    rh_item_ids = get_running_hours_item_ids()
    due_list = []

    for eq in equipment_list:
        data = build_running_hours_data(eq, rh_item_ids=rh_item_ids)
        if data['service_status'] == 'ok':
            continue
        if status_filter and data['service_status'] != status_filter:
            continue
        due_list.append({
            'equipment_id': eq.id,
            'equipment_name': eq.name,
            'equipment_type': eq.equipment_type,
            'location': eq.location or '',
            'berth': eq.berth,
            'current_hours': data['current_hours'],
            'next_service_hours': data['service_interval']['next_service_hours'] if data['service_interval'] else None,
            'hours_until_service': data['hours_until_service'],
            'service_status': data['service_status'],
            'assigned_engineer_id': eq.assigned_technician_id,
            'assigned_engineer_name': eq.assigned_technician.full_name if eq.assigned_technician else None,
            'urgency_score': abs(data['hours_until_service']) if data['hours_until_service'] else 0,
        })

    due_list.sort(key=lambda x: x['urgency_score'], reverse=True)
    return jsonify({'status': 'success', 'data': due_list[:limit]})


# ============================================
# ALERTS ENDPOINTS
# ============================================

@bp.route('/running-hours/alerts', methods=['GET'])
@jwt_required()
def get_alerts():
    acknowledged = request.args.get('acknowledged')
    severity = request.args.get('severity')
    limit = request.args.get('limit', 50, type=int)

    query = RunningHoursAlert.query

    if acknowledged == 'false':
        query = query.filter(RunningHoursAlert.acknowledged_at.is_(None))
    elif acknowledged == 'true':
        query = query.filter(RunningHoursAlert.acknowledged_at.isnot(None))

    if severity:
        query = query.filter_by(severity=severity)

    alerts = query.order_by(RunningHoursAlert.created_at.desc()).limit(limit).all()
    return jsonify({'status': 'success', 'data': [a.to_dict() for a in alerts]})


@bp.route('/running-hours/alerts/<int:alert_id>/acknowledge', methods=['PUT'])
@jwt_required()
def acknowledge_alert(alert_id):
    alert = db.session.get(RunningHoursAlert, alert_id)
    if not alert:
        return jsonify({'status': 'error', 'message': 'Alert not found'}), 404

    user = get_current_user()
    alert.acknowledged_at = datetime.now(timezone.utc)
    alert.acknowledged_by_id = user.id
    db.session.commit()

    return jsonify({'status': 'success', 'data': alert.to_dict()})


# ============================================
# BULK OPERATIONS
# ============================================

@bp.route('/running-hours/bulk-update', methods=['POST'])
@jwt_required()
def bulk_update():
    data = request.get_json()
    updates = data.get('updates', [])
    user = get_current_user()

    results = {'updated': 0, 'errors': []}

    for update in updates:
        eq_id = update.get('equipment_id')
        hours = update.get('hours')

        if not eq_id or hours is None:
            results['errors'].append({'equipment_id': eq_id, 'error': 'Missing equipment_id or hours'})
            continue

        equipment = db.session.get(Equipment, eq_id)
        if not equipment:
            results['errors'].append({'equipment_id': eq_id, 'error': 'Equipment not found'})
            continue

        reading = RunningHoursReading(
            equipment_id=eq_id,
            hours=hours,
            recorded_by_id=user.id,
            notes=update.get('notes'),
            source='manual',
        )
        db.session.add(reading)
        results['updated'] += 1

    db.session.commit()
    return jsonify({'status': 'success', 'data': results})
