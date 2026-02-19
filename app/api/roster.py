"""
Team Roster endpoints.
Upload roster from Excel, query weekly/daily availability.
"""

import logging
from datetime import date, datetime, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.utils.decorators import get_current_user, admin_required
from app.models import User, Leave, RosterEntry, ShiftSwapRequest

logger = logging.getLogger(__name__)

bp = Blueprint('roster', __name__)


def _parse_date_header(header_value):
    """
    Try to parse a column header as a date.
    Supports formats: '1-Jan', '01/01/2026', '2026-01-01', '1 Jan', '01-Jan-2026', etc.
    Returns a date object or None.
    """
    if header_value is None:
        return None

    # If it's already a datetime/date object (openpyxl may return these)
    if isinstance(header_value, datetime):
        return header_value.date()
    if isinstance(header_value, date):
        return header_value

    s = str(header_value).strip()
    if not s:
        return None

    # Try a variety of formats
    formats = [
        '%Y-%m-%d',       # 2026-01-01
        '%d/%m/%Y',       # 01/01/2026
        '%m/%d/%Y',       # 01/01/2026
        '%d-%m-%Y',       # 01-01-2026
        '%d-%b-%Y',       # 01-Jan-2026
        '%d-%b',          # 1-Jan (assume current year)
        '%d %b',          # 1 Jan (assume current year)
        '%d %b %Y',       # 1 Jan 2026
        '%b %d',          # Jan 1 (assume current year)
        '%b %d, %Y',      # Jan 1, 2026
    ]

    current_year = date.today().year

    for fmt in formats:
        try:
            parsed = datetime.strptime(s, fmt)
            # If format has no year, set to current year
            if '%Y' not in fmt:
                parsed = parsed.replace(year=current_year)
            return parsed.date()
        except ValueError:
            continue

    return None


def _parse_shift_value(cell_value):
    """
    Parse a cell value into a shift type.
    D -> day, N -> night, Off -> off, Leave -> leave, empty -> None (skip).
    """
    if cell_value is None:
        return None

    s = str(cell_value).strip().lower()
    if not s:
        return None

    mapping = {
        'd': 'day',
        'day': 'day',
        'n': 'night',
        'night': 'night',
        'off': 'off',
        'o': 'off',
        'leave': 'leave',
        'l': 'leave',
    }
    return mapping.get(s)


@bp.route('/upload', methods=['POST'])
@jwt_required()
@admin_required()
def upload_roster():
    """
    Upload roster from Excel file.
    Row 1 = headers: SAP ID, Name, Role, Major ID, then date columns.
    SAP ID (Column A) is used for matching users.
    """
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file uploaded'}), 400

    file = request.files['file']
    if not file.filename.endswith(('.xlsx', '.xls')):
        return jsonify({'status': 'error', 'message': 'Only .xlsx files are supported'}), 400

    try:
        import openpyxl
    except ImportError:
        logger.error("openpyxl not installed")
        return jsonify({'status': 'error', 'message': 'openpyxl is required for Excel parsing'}), 500

    try:
        wb = openpyxl.load_workbook(file, data_only=True)
        ws = wb.active
    except Exception as e:
        logger.exception("Failed to read Excel file")
        return jsonify({'status': 'error', 'message': f'Failed to read Excel file: {str(e)}'}), 400

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return jsonify({'status': 'error', 'message': 'Empty spreadsheet'}), 400

    headers = rows[0]
    logger.info("Roster upload: %d rows, %d columns. First 5 headers: %s",
                len(rows), len(headers), list(headers[:5]))

    # Parse date columns (columns from index 4 onward - after Name, Role, Major ID, SAP ID)
    date_columns = []  # list of (col_index, date_obj)
    for col_idx in range(4, len(headers)):
        parsed = _parse_date_header(headers[col_idx])
        if parsed:
            date_columns.append((col_idx, parsed))

    logger.info("Parsed %d date columns out of %d header columns", len(date_columns), len(headers) - 3)

    if not date_columns:
        return jsonify({
            'status': 'error',
            'message': f'No valid date columns found in headers. '
                       f'Expected date headers from column 5 onward (after Name, Role, Major ID, SAP ID). '
                       f'Found headers: {[str(h) for h in headers[:7]]}'
        }), 400

    errors = []
    imported = 0
    users_processed = 0

    for row_idx, row in enumerate(rows[1:], start=2):
        if len(row) < 4:
            continue

        # Column A (index 0) is SAP ID - used for matching
        sap_id = row[0]
        if sap_id is None:
            continue
        sap_id_str = str(sap_id).strip()
        if not sap_id_str:
            continue

        # Match user by sap_id
        user = User.query.filter(
            User.sap_id == sap_id_str
        ).first()

        if not user:
            errors.append(f'Row {row_idx}: No user found with SAP ID "{sap_id_str}"')
            continue

        # Delete all existing roster entries for this user
        RosterEntry.query.filter_by(user_id=user.id).delete()
        users_processed += 1

        # Parse each date column
        for col_idx, col_date in date_columns:
            cell_value = row[col_idx] if col_idx < len(row) else None
            shift = _parse_shift_value(cell_value)
            if shift is None:
                continue

            entry = RosterEntry(
                user_id=user.id,
                date=col_date,
                shift=shift
            )
            db.session.add(entry)
            imported += 1

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logger.exception("Roster upload DB commit failed")
        return jsonify({'status': 'error', 'message': f'Database error: {str(e)}'}), 500

    logger.info("Roster uploaded: %d entries imported for %d users", imported, users_processed)

    return jsonify({
        'status': 'success',
        'imported': imported,
        'users_processed': users_processed,
        'errors': errors
    }), 200


@bp.route('/week', methods=['GET'])
@jwt_required()
def get_week_roster():
    """
    Get roster for a week starting from the given date.
    Query param: date (optional, defaults to today).
    Accessible by admin or engineer.
    """
    user = get_current_user()
    if user.role not in ('admin', 'engineer'):
        return jsonify({'status': 'error', 'message': 'Admin or engineer access required'}), 403

    date_str = request.args.get('date')
    if date_str:
        try:
            start_date = date.fromisoformat(date_str)
        except ValueError:
            return jsonify({'status': 'error', 'message': 'Invalid date format. Use YYYY-MM-DD'}), 400
    else:
        start_date = date.today()

    end_date = start_date + timedelta(days=7)

    # Generate list of dates in range
    dates = []
    d = start_date
    while d < end_date:
        dates.append(d)
        d += timedelta(days=1)

    date_strings = [d.isoformat() for d in dates]

    # Query roster entries for the date range
    roster_entries = RosterEntry.query.filter(
        RosterEntry.date >= start_date,
        RosterEntry.date < end_date
    ).all()

    # Build a lookup: user_id -> { date_str: shift }
    roster_map = {}
    user_ids = set()
    for entry in roster_entries:
        user_ids.add(entry.user_id)
        if entry.user_id not in roster_map:
            roster_map[entry.user_id] = {}
        roster_map[entry.user_id][entry.date.isoformat()] = entry.shift

    # Query approved leaves overlapping the date range
    leaves = Leave.query.filter(
        Leave.status == 'approved',
        Leave.date_from < end_date,
        Leave.date_to >= start_date
    ).all()

    # Build leave lookup: user_id -> set of date strings
    # Also track coverage info per user
    leave_map = {}
    leave_coverage_map = {}  # user_id -> { coverage_user_name, coverage_user_role }
    for leave in leaves:
        if leave.user_id not in leave_map:
            leave_map[leave.user_id] = set()
        ld = max(leave.date_from, start_date)
        while ld <= min(leave.date_to, end_date - timedelta(days=1)):
            leave_map[leave.user_id].add(ld.isoformat())
            ld += timedelta(days=1)
        user_ids.add(leave.user_id)
        # Store coverage info (latest leave wins if multiple)
        if leave.coverage_user:
            leave_coverage_map[leave.user_id] = {
                'id': leave.coverage_user.id,
                'full_name': leave.coverage_user.full_name,
                'role': leave.coverage_user.role,
                'role_id': leave.coverage_user.role_id,
            }

    # Get all users who have roster entries or leaves in the range
    if user_ids:
        users = User.query.filter(User.id.in_(user_ids), User.is_active == True).all()
    else:
        users = User.query.filter(User.is_active == True).all()

    # Calculate leave balance for each user
    current_year = date.today().year
    year_start = date(current_year, 1, 1)
    year_end = date(current_year, 12, 31)

    leave_used_map = {}
    if user_ids:
        used_rows = db.session.query(
            Leave.user_id,
            db.func.coalesce(db.func.sum(Leave.total_days), 0)
        ).filter(
            Leave.user_id.in_(user_ids),
            Leave.status.in_(['pending', 'approved']),
            Leave.date_from >= year_start,
            Leave.date_to <= year_end
        ).group_by(Leave.user_id).all()
        for uid, used in used_rows:
            leave_used_map[uid] = int(used)

    result_users = []
    for u in users:
        entries = {}
        user_roster = roster_map.get(u.id, {})
        user_leave_dates = leave_map.get(u.id, set())

        for d_str in date_strings:
            if d_str in user_leave_dates:
                entries[d_str] = 'leave'
            elif d_str in user_roster:
                entries[d_str] = user_roster[d_str]

        total_balance = u.annual_leave_balance or 24
        used = leave_used_map.get(u.id, 0)

        user_data = {
            'id': u.id,
            'full_name': u.full_name,
            'role': u.role,
            'specialization': u.specialization,
            'is_on_leave': u.is_on_leave,
            'entries': entries,
            'annual_leave_balance': total_balance,
            'leave_used': used,
            'leave_remaining': total_balance - used,
        }
        # Add coverage info if user is on leave
        if u.id in leave_coverage_map:
            user_data['leave_cover'] = leave_coverage_map[u.id]

        result_users.append(user_data)

    return jsonify({
        'status': 'success',
        'data': {
            'dates': date_strings,
            'users': result_users
        }
    }), 200


@bp.route('/day-availability', methods=['GET'])
@jwt_required()
def get_day_availability():
    """
    Get availability for a specific date.
    Query params: date (required), shift (optional: day/night).
    Accessible by admin or engineer.
    """
    user = get_current_user()
    if user.role not in ('admin', 'engineer'):
        return jsonify({'status': 'error', 'message': 'Admin or engineer access required'}), 403

    date_str = request.args.get('date')
    if not date_str:
        return jsonify({'status': 'error', 'message': 'date parameter is required'}), 400

    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid date format. Use YYYY-MM-DD'}), 400

    shift_filter = request.args.get('shift')

    # Query roster entries for this date
    roster_query = RosterEntry.query.filter(RosterEntry.date == target_date)
    roster_entries = roster_query.all()

    # Build roster lookup: user_id -> shift
    roster_map = {}
    for entry in roster_entries:
        roster_map[entry.user_id] = entry.shift

    # Query approved leaves covering this date
    leaves = Leave.query.filter(
        Leave.status == 'approved',
        Leave.date_from <= target_date,
        Leave.date_to >= target_date
    ).all()
    leave_user_ids = {leave.user_id for leave in leaves}

    # Build leave coverage maps
    leave_cover_map = {}  # user_id -> cover user info
    covering_for_map = {}  # cover_user_id -> on-leave user info
    for lv in leaves:
        if lv.coverage_user:
            leave_cover_map[lv.user_id] = {
                'id': lv.coverage_user.id,
                'full_name': lv.coverage_user.full_name,
                'role': lv.coverage_user.role,
                'role_id': lv.coverage_user.role_id,
                'specialization': lv.coverage_user.specialization,
            }
            on_leave_user = db.session.get(User, lv.user_id)
            if on_leave_user:
                covering_for_map[lv.coverage_user_id] = {
                    'id': on_leave_user.id,
                    'full_name': on_leave_user.full_name,
                    'role': on_leave_user.role,
                    'role_id': on_leave_user.role_id,
                    'specialization': on_leave_user.specialization,
                }

    # Get all active users
    all_users = User.query.filter(User.is_active == True).all()

    available = []
    on_leave = []
    off = []

    for u in all_users:
        user_info = {
            'id': u.id,
            'full_name': u.full_name,
            'role': u.role,
            'role_id': u.role_id,
            'specialization': u.specialization,
        }

        # Check if on leave first (overrides roster)
        if u.id in leave_user_ids:
            user_info['leave_cover'] = leave_cover_map.get(u.id)
            on_leave.append(user_info)
            continue

        roster_shift = roster_map.get(u.id)

        # Add covering_for info if this user is covering someone
        if u.id in covering_for_map:
            user_info['covering_for'] = covering_for_map[u.id]

        if roster_shift == 'off':
            off.append(user_info)
        elif roster_shift == 'leave':
            on_leave.append(user_info)
        elif roster_shift in ('day', 'night'):
            # If shift filter is specified, only include matching shifts
            if shift_filter and roster_shift != shift_filter:
                continue
            user_info['shift'] = roster_shift
            available.append(user_info)
        else:
            # No roster entry -- user has no assignment for this date
            # Include them as available if no shift filter, or skip
            if not shift_filter:
                user_info['shift'] = None
                available.append(user_info)

    return jsonify({
        'status': 'success',
        'data': {
            'date': target_date.isoformat(),
            'available': available,
            'on_leave': on_leave,
            'off': off
        }
    }), 200


@bp.route('/template', methods=['GET'])
@jwt_required()
def download_roster_template():
    """
    Download Excel template for roster import.
    Columns: Name, Role, Major ID, then date columns.
    Values: D (day), N (night), Off, Leave, or empty.
    """
    from flask import Response
    from io import BytesIO
    import pandas as pd
    from datetime import timedelta

    # Get all active users
    users = User.query.filter(User.is_active == True).order_by(User.role, User.full_name).all()

    # Generate 14 days of date columns starting from today
    start_date = date.today()
    dates = [start_date + timedelta(days=i) for i in range(14)]

    # Build data - SAP ID in Column A (index 0) for upload matching
    data = {
        'SAP ID': [u.sap_id or '' for u in users],
        'Name': [u.full_name for u in users],
        'Role': [u.role for u in users],
        'Major ID': [u.role_id or '' for u in users],
    }

    # Add date columns with sample values
    for i, d in enumerate(dates):
        col_name = d.strftime('%d-%b')  # e.g., "08-Feb"
        # Pre-fill with 'D' for day shift as default
        data[col_name] = ['D' for _ in users]

    df = pd.DataFrame(data)

    # Create Excel file in memory
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Roster', index=False)

        # Add instructions sheet
        instructions = pd.DataFrame({
            'Column': ['SAP ID', 'Name', 'Role', 'Major ID', 'Date Columns (e.g., 08-Feb)'],
            'Required': ['Yes', 'Info Only', 'Info Only', 'Info Only', 'Yes'],
            'Description': [
                'SAP ID (6 digits) - REQUIRED: used to match with system users',
                'Employee name (for reference only, not used for matching)',
                'Employee role (for reference only)',
                'Major ID / Role ID (for reference only)',
                'Shift values: D = Day, N = Night, Off = Day off, Leave = On leave, Empty = No entry'
            ]
        })
        instructions.to_excel(writer, sheet_name='Instructions', index=False)

        # Add example values sheet
        examples = pd.DataFrame({
            'Value': ['D', 'N', 'Off', 'Leave', '(empty)'],
            'Meaning': [
                'Day Shift',
                'Night Shift',
                'Day Off',
                'On Leave',
                'No roster entry (user available but no specific shift)'
            ]
        })
        examples.to_excel(writer, sheet_name='Shift Values', index=False)

    output.seek(0)

    return Response(
        output.getvalue(),
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={
            'Content-Disposition': 'attachment; filename=roster_template.xlsx'
        }
    )


@bp.route('/coverage-score', methods=['GET'])
@jwt_required()
def get_coverage_score():
    """
    Get coverage score for a week.
    Calculates team coverage based on skills, roles, and availability.

    Query params:
        - date: Start date of week (default: today)

    Returns coverage score, gaps, and recommendations.
    """
    user = get_current_user()
    if user.role not in ('admin', 'engineer'):
        return jsonify({'status': 'error', 'message': 'Admin or engineer access required'}), 403

    date_str = request.args.get('date')
    if date_str:
        try:
            start_date = date.fromisoformat(date_str)
        except ValueError:
            return jsonify({'status': 'error', 'message': 'Invalid date format. Use YYYY-MM-DD'}), 400
    else:
        start_date = date.today()

    end_date = start_date + timedelta(days=7)

    # Get all active users
    all_users = User.query.filter(User.is_active == True).all()

    # Get roster entries for the week
    roster_entries = RosterEntry.query.filter(
        RosterEntry.date >= start_date,
        RosterEntry.date < end_date
    ).all()

    # Get approved leaves
    leaves = Leave.query.filter(
        Leave.status == 'approved',
        Leave.date_from < end_date,
        Leave.date_to >= start_date
    ).all()

    # Build availability map
    leave_map = {}
    for leave in leaves:
        if leave.user_id not in leave_map:
            leave_map[leave.user_id] = set()
        ld = max(leave.date_from, start_date)
        while ld <= min(leave.date_to, end_date - timedelta(days=1)):
            leave_map[leave.user_id].add(ld.isoformat())
            ld += timedelta(days=1)

    # Roster map
    roster_map = {}
    for entry in roster_entries:
        if entry.user_id not in roster_map:
            roster_map[entry.user_id] = {}
        roster_map[entry.user_id][entry.date.isoformat()] = entry.shift

    # Calculate coverage per day
    dates = []
    d = start_date
    while d < end_date:
        dates.append(d)
        d += timedelta(days=1)

    daily_coverage = []
    gaps = []
    total_score = 0

    # Define minimum requirements per shift
    min_requirements = {
        'inspector': 2,
        'specialist': 1,
        'engineer': 1
    }

    for day in dates:
        day_str = day.isoformat()
        available = {'inspector': 0, 'specialist': 0, 'engineer': 0, 'total': 0}
        on_leave = 0

        for u in all_users:
            # Check if on leave
            if u.id in leave_map and day_str in leave_map[u.id]:
                on_leave += 1
                continue

            # Check roster
            roster_shift = roster_map.get(u.id, {}).get(day_str)
            if roster_shift in ('day', 'night'):
                if u.role in available:
                    available[u.role] += 1
                available['total'] += 1

        # Calculate day score
        day_score = 100
        day_gaps = []

        for role, min_count in min_requirements.items():
            if available.get(role, 0) < min_count:
                shortage = min_count - available.get(role, 0)
                day_score -= shortage * 15
                day_gaps.append({
                    'role': role,
                    'required': min_count,
                    'available': available.get(role, 0),
                    'shortage': shortage
                })

        day_score = max(0, day_score)
        total_score += day_score

        daily_coverage.append({
            'date': day_str,
            'day_name': day.strftime('%A'),
            'available': available,
            'on_leave': on_leave,
            'score': day_score,
            'gaps': day_gaps
        })

        if day_gaps:
            gaps.append({
                'date': day_str,
                'day_name': day.strftime('%A'),
                'gaps': day_gaps
            })

    avg_score = round(total_score / len(dates), 1) if dates else 0

    # Generate recommendations
    recommendations = []
    if gaps:
        recommendations.append({
            'type': 'warning',
            'message': f'{len(gaps)} days have coverage gaps this week'
        })

    return jsonify({
        'status': 'success',
        'data': {
            'week_start': start_date.isoformat(),
            'week_end': end_date.isoformat(),
            'coverage_score': avg_score,
            'daily_coverage': daily_coverage,
            'gaps': gaps,
            'recommendations': recommendations,
            'summary': {
                'total_users': len(all_users),
                'days_with_gaps': len(gaps),
                'understaffed_days': len([d for d in daily_coverage if d['score'] < 70])
            }
        }
    }), 200


@bp.route('/workload', methods=['GET'])
@jwt_required()
def get_workload():
    """
    Get workload distribution for the team.
    Shows hours per person for the specified period.

    Query params:
        - date: Start date (default: start of current week)
        - period: 'week' or 'month' (default: week)
    """
    user = get_current_user()
    if user.role not in ('admin', 'engineer'):
        return jsonify({'status': 'error', 'message': 'Admin or engineer access required'}), 403

    date_str = request.args.get('date')
    period = request.args.get('period', 'week')

    if date_str:
        try:
            start_date = date.fromisoformat(date_str)
        except ValueError:
            return jsonify({'status': 'error', 'message': 'Invalid date format'}), 400
    else:
        # Start of current week (Sunday)
        today = date.today()
        start_date = today - timedelta(days=today.weekday() + 1)

    if period == 'month':
        end_date = start_date + timedelta(days=30)
    else:
        end_date = start_date + timedelta(days=7)

    # Get work plan jobs for the period
    from app.models import WorkPlanJob, WorkPlanDay, WorkPlan

    # Get jobs with assignments
    jobs = db.session.query(WorkPlanJob).join(
        WorkPlanDay, WorkPlanJob.day_id == WorkPlanDay.id
    ).join(
        WorkPlan, WorkPlanDay.plan_id == WorkPlan.id
    ).filter(
        WorkPlanDay.date >= start_date,
        WorkPlanDay.date < end_date
    ).all()

    # Calculate workload per user
    user_workload = {}

    for job in jobs:
        # Get assigned users
        assigned_ids = []
        if job.lead_id:
            assigned_ids.append(job.lead_id)
        if job.team_member_ids:
            assigned_ids.extend(job.team_member_ids)

        hours = job.actual_hours or job.planned_hours or 0

        for uid in assigned_ids:
            if uid not in user_workload:
                user_workload[uid] = {
                    'scheduled_hours': 0,
                    'job_count': 0,
                    'overtime_hours': 0
                }
            user_workload[uid]['scheduled_hours'] += hours
            user_workload[uid]['job_count'] += 1

    # Get user details
    user_ids = list(user_workload.keys())
    if user_ids:
        users = User.query.filter(User.id.in_(user_ids)).all()
        user_map = {u.id: u for u in users}
    else:
        user_map = {}

    # Calculate overtime (> 40h/week or 8h/day * days)
    standard_hours = 40 if period == 'week' else 160

    workload_data = []
    for uid, data in user_workload.items():
        u = user_map.get(uid)
        if not u:
            continue

        overtime = max(0, data['scheduled_hours'] - standard_hours)
        status = 'balanced'
        if data['scheduled_hours'] > standard_hours * 1.1:
            status = 'overloaded'
        elif data['scheduled_hours'] < standard_hours * 0.5:
            status = 'underutilized'

        workload_data.append({
            'user_id': uid,
            'full_name': u.full_name,
            'role': u.role,
            'specialization': u.specialization,
            'scheduled_hours': round(data['scheduled_hours'], 1),
            'job_count': data['job_count'],
            'overtime_hours': round(overtime, 1),
            'status': status,
            'utilization': round((data['scheduled_hours'] / standard_hours) * 100, 1)
        })

    # Sort by scheduled hours descending
    workload_data.sort(key=lambda x: x['scheduled_hours'], reverse=True)

    return jsonify({
        'status': 'success',
        'data': {
            'period': period,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'standard_hours': standard_hours,
            'workload': workload_data,
            'summary': {
                'total_users': len(workload_data),
                'overloaded': len([w for w in workload_data if w['status'] == 'overloaded']),
                'underutilized': len([w for w in workload_data if w['status'] == 'underutilized']),
                'balanced': len([w for w in workload_data if w['status'] == 'balanced']),
                'total_scheduled_hours': sum(w['scheduled_hours'] for w in workload_data),
                'total_overtime_hours': sum(w['overtime_hours'] for w in workload_data)
            }
        }
    }), 200


@bp.route('/ai/suggest-coverage', methods=['POST'])
@jwt_required()
def suggest_coverage():
    """
    AI-powered coverage suggestion.
    Finds the best coverage match based on skills, workload, and availability.

    Request body:
        {
            "user_id": 123,
            "date_from": "2026-02-10",
            "date_to": "2026-02-12"
        }
    """
    user = get_current_user()
    data = request.get_json()

    if not data:
        return jsonify({'status': 'error', 'message': 'Request body is required'}), 400

    user_id = data.get('user_id')
    date_from_str = data.get('date_from')
    date_to_str = data.get('date_to')

    if not all([user_id, date_from_str, date_to_str]):
        return jsonify({'status': 'error', 'message': 'user_id, date_from, date_to are required'}), 400

    try:
        date_from = date.fromisoformat(date_from_str)
        date_to = date.fromisoformat(date_to_str)
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid date format'}), 400

    # Get the user requesting leave
    leave_user = db.session.get(User, user_id)
    if not leave_user:
        return jsonify({'status': 'error', 'message': 'User not found'}), 404

    # Get potential coverage candidates
    # Same specialization, opposite role (inspector <-> specialist), or same role
    candidates = User.query.filter(
        User.is_active == True,
        User.id != user_id
    ).all()

    # Filter by role compatibility
    compatible_candidates = []
    for c in candidates:
        score = 0

        # Same specialization is a bonus
        if c.specialization == leave_user.specialization:
            score += 30

        # Role compatibility
        if leave_user.role == 'inspector' and c.role == 'specialist':
            score += 20
        elif leave_user.role == 'specialist' and c.role == 'inspector':
            score += 20
        elif c.role == leave_user.role:
            score += 25

        # Check availability during leave period
        leaves = Leave.query.filter(
            Leave.user_id == c.id,
            Leave.status == 'approved',
            Leave.date_from <= date_to,
            Leave.date_to >= date_from
        ).count()

        if leaves > 0:
            continue  # Skip if already on leave

        # Check roster availability
        roster_entries = RosterEntry.query.filter(
            RosterEntry.user_id == c.id,
            RosterEntry.date >= date_from,
            RosterEntry.date <= date_to
        ).all()

        working_days = len([e for e in roster_entries if e.shift in ('day', 'night')])
        off_days = len([e for e in roster_entries if e.shift == 'off'])

        # Penalize if many off days
        if off_days > 0:
            score -= off_days * 5

        # Bonus for working days
        score += working_days * 5

        if score > 0:
            compatible_candidates.append({
                'user': c,
                'score': score,
                'working_days': working_days,
                'off_days': off_days
            })

    # Sort by score
    compatible_candidates.sort(key=lambda x: x['score'], reverse=True)

    suggestions = []
    for i, candidate in enumerate(compatible_candidates[:5]):
        c = candidate['user']
        suggestions.append({
            'rank': i + 1,
            'user_id': c.id,
            'full_name': c.full_name,
            'role': c.role,
            'specialization': c.specialization,
            'match_score': candidate['score'],
            'working_days': candidate['working_days'],
            'off_days': candidate['off_days'],
            'is_best_match': i == 0
        })

    return jsonify({
        'status': 'success',
        'data': {
            'requesting_user': {
                'id': leave_user.id,
                'full_name': leave_user.full_name,
                'role': leave_user.role,
                'specialization': leave_user.specialization
            },
            'leave_period': {
                'from': date_from_str,
                'to': date_to_str,
                'days': (date_to - date_from).days + 1
            },
            'suggestions': suggestions,
            'total_candidates': len(compatible_candidates)
        }
    }), 200


# ==================== SHIFT SWAP REQUESTS ====================

@bp.route('/swap-requests', methods=['POST'])
@jwt_required()
def create_swap_request():
    """
    Create a shift swap request.
    Body: {
        target_user_id: number,
        requester_date: 'YYYY-MM-DD',
        target_date: 'YYYY-MM-DD',
        reason: string (optional)
    }
    """
    user = get_current_user()
    data = request.get_json() or {}

    target_user_id = data.get('target_user_id')
    requester_date_str = data.get('requester_date')
    target_date_str = data.get('target_date')
    reason = data.get('reason', '')

    if not target_user_id or not requester_date_str or not target_date_str:
        return jsonify({'status': 'error', 'message': 'target_user_id, requester_date, and target_date are required'}), 400

    try:
        requester_date = datetime.strptime(requester_date_str, '%Y-%m-%d').date()
        target_date = datetime.strptime(target_date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid date format. Use YYYY-MM-DD'}), 400

    # Check target user exists
    target_user = db.session.get(User, target_user_id)
    if not target_user:
        return jsonify({'status': 'error', 'message': 'Target user not found'}), 404

    # Get requester's shift on requester_date
    requester_entry = RosterEntry.query.filter_by(user_id=user.id, date=requester_date).first()
    requester_shift = requester_entry.shift if requester_entry else 'off'

    # Get target user's shift on target_date
    target_entry = RosterEntry.query.filter_by(user_id=target_user_id, date=target_date).first()
    target_shift = target_entry.shift if target_entry else 'off'

    # Check if there's already a pending request
    existing = ShiftSwapRequest.query.filter(
        ShiftSwapRequest.requester_id == user.id,
        ShiftSwapRequest.target_user_id == target_user_id,
        ShiftSwapRequest.requester_date == requester_date,
        ShiftSwapRequest.status == 'pending'
    ).first()

    if existing:
        return jsonify({'status': 'error', 'message': 'A pending swap request already exists'}), 400

    swap_request = ShiftSwapRequest(
        requester_id=user.id,
        requester_date=requester_date,
        requester_shift=requester_shift,
        target_user_id=target_user_id,
        target_date=target_date,
        target_shift=target_shift,
        reason=reason,
        status='pending'
    )

    db.session.add(swap_request)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Swap request created',
        'data': swap_request.to_dict()
    }), 201


@bp.route('/swap-requests', methods=['GET'])
@jwt_required()
def list_swap_requests():
    """
    List shift swap requests.
    Query params:
        status: pending, approved, rejected (optional)
        my_requests: true/false - only my outgoing requests
        for_me: true/false - only requests targeting me
    """
    user = get_current_user()
    status = request.args.get('status')
    my_requests = request.args.get('my_requests', 'false').lower() == 'true'
    for_me = request.args.get('for_me', 'false').lower() == 'true'

    query = ShiftSwapRequest.query

    if status:
        query = query.filter(ShiftSwapRequest.status == status)

    if my_requests:
        query = query.filter(ShiftSwapRequest.requester_id == user.id)
    elif for_me:
        query = query.filter(ShiftSwapRequest.target_user_id == user.id)
    elif user.role != 'admin':
        # Non-admins see only their own requests (made or received)
        query = query.filter(
            db.or_(
                ShiftSwapRequest.requester_id == user.id,
                ShiftSwapRequest.target_user_id == user.id
            )
        )

    query = query.order_by(ShiftSwapRequest.created_at.desc())
    requests = query.limit(50).all()

    return jsonify({
        'status': 'success',
        'data': [r.to_dict() for r in requests]
    }), 200


@bp.route('/swap-requests/<int:request_id>/respond', methods=['POST'])
@jwt_required()
def respond_to_swap_request(request_id):
    """
    Target user responds to swap request (accept/decline).
    Body: { response: 'accepted' | 'declined' }
    """
    user = get_current_user()
    data = request.get_json() or {}

    swap_req = db.session.get(ShiftSwapRequest, request_id)
    if not swap_req:
        return jsonify({'status': 'error', 'message': 'Swap request not found'}), 404

    if swap_req.target_user_id != user.id:
        return jsonify({'status': 'error', 'message': 'Not authorized to respond to this request'}), 403

    if swap_req.status != 'pending':
        return jsonify({'status': 'error', 'message': 'Request is no longer pending'}), 400

    response = data.get('response')
    if response not in ('accepted', 'declined'):
        return jsonify({'status': 'error', 'message': 'response must be "accepted" or "declined"'}), 400

    swap_req.target_response = response
    swap_req.target_response_at = datetime.utcnow()

    if response == 'declined':
        swap_req.status = 'rejected'
        swap_req.rejection_reason = 'Declined by target user'

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Swap request {response}',
        'data': swap_req.to_dict()
    }), 200


@bp.route('/swap-requests/<int:request_id>/approve', methods=['POST'])
@jwt_required()
@admin_required()
def approve_swap_request(request_id):
    """
    Admin approves a swap request and applies the swap.
    """
    user = get_current_user()

    swap_req = db.session.get(ShiftSwapRequest, request_id)
    if not swap_req:
        return jsonify({'status': 'error', 'message': 'Swap request not found'}), 404

    if swap_req.status != 'pending':
        return jsonify({'status': 'error', 'message': 'Request is not pending'}), 400

    if swap_req.target_response != 'accepted':
        return jsonify({'status': 'error', 'message': 'Target user has not accepted the swap'}), 400

    # Apply the swap - update roster entries
    # Requester gets target's shift on target_date
    # Target gets requester's shift on requester_date

    # Update requester's entry on requester_date to target's shift
    req_entry = RosterEntry.query.filter_by(
        user_id=swap_req.requester_id,
        date=swap_req.requester_date
    ).first()
    if req_entry:
        req_entry.shift = swap_req.target_shift
    else:
        req_entry = RosterEntry(
            user_id=swap_req.requester_id,
            date=swap_req.requester_date,
            shift=swap_req.target_shift
        )
        db.session.add(req_entry)

    # Update target's entry on target_date to requester's shift
    tgt_entry = RosterEntry.query.filter_by(
        user_id=swap_req.target_user_id,
        date=swap_req.target_date
    ).first()
    if tgt_entry:
        tgt_entry.shift = swap_req.requester_shift
    else:
        tgt_entry = RosterEntry(
            user_id=swap_req.target_user_id,
            date=swap_req.target_date,
            shift=swap_req.requester_shift
        )
        db.session.add(tgt_entry)

    swap_req.status = 'approved'
    swap_req.approved_by_id = user.id
    swap_req.approved_at = datetime.utcnow()

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Swap approved and applied',
        'data': swap_req.to_dict()
    }), 200


@bp.route('/swap-requests/<int:request_id>/reject', methods=['POST'])
@jwt_required()
@admin_required()
def reject_swap_request(request_id):
    """
    Admin rejects a swap request.
    Body: { reason: string (optional) }
    """
    user = get_current_user()
    data = request.get_json() or {}

    swap_req = db.session.get(ShiftSwapRequest, request_id)
    if not swap_req:
        return jsonify({'status': 'error', 'message': 'Swap request not found'}), 404

    if swap_req.status != 'pending':
        return jsonify({'status': 'error', 'message': 'Request is not pending'}), 400

    swap_req.status = 'rejected'
    swap_req.approved_by_id = user.id
    swap_req.approved_at = datetime.utcnow()
    swap_req.rejection_reason = data.get('reason', 'Rejected by admin')

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Swap request rejected',
        'data': swap_req.to_dict()
    }), 200


@bp.route('/swap-requests/<int:request_id>', methods=['DELETE'])
@jwt_required()
def cancel_swap_request(request_id):
    """
    Cancel a swap request (only by requester, only if pending).
    """
    user = get_current_user()

    swap_req = db.session.get(ShiftSwapRequest, request_id)
    if not swap_req:
        return jsonify({'status': 'error', 'message': 'Swap request not found'}), 404

    if swap_req.requester_id != user.id and user.role != 'admin':
        return jsonify({'status': 'error', 'message': 'Not authorized'}), 403

    if swap_req.status != 'pending':
        return jsonify({'status': 'error', 'message': 'Can only cancel pending requests'}), 400

    swap_req.status = 'cancelled'
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Swap request cancelled'
    }), 200


# ==================== FATIGUE ALERTS ====================

@bp.route('/fatigue-alerts', methods=['GET'])
@jwt_required()
def get_fatigue_alerts():
    """
    Get users with fatigue alerts (consecutive shifts).
    Query params:
        date: YYYY-MM-DD (optional, defaults to today)
        threshold: number of consecutive shifts to trigger alert (default: 5)
    """
    date_str = request.args.get('date')
    threshold = int(request.args.get('threshold', 5))

    if date_str:
        try:
            check_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'status': 'error', 'message': 'Invalid date format'}), 400
    else:
        check_date = date.today()

    # Look back from check_date to find consecutive working days
    alerts = []
    users = User.query.filter(User.is_active == True, User.role.in_(['inspector', 'specialist', 'engineer'])).all()

    for user in users:
        consecutive = 0
        current_date = check_date

        # Count consecutive working days
        for _ in range(14):  # Check up to 14 days back
            entry = RosterEntry.query.filter_by(user_id=user.id, date=current_date).first()
            if entry and entry.shift in ('day', 'night'):
                consecutive += 1
                current_date = current_date - timedelta(days=1)
            else:
                break

        if consecutive >= threshold:
            alerts.append({
                'user_id': user.id,
                'full_name': user.full_name,
                'role': user.role,
                'specialization': user.specialization,
                'consecutive_shifts': consecutive,
                'severity': 'high' if consecutive >= threshold + 2 else 'medium',
                'suggestion': f'Consider giving rest after {consecutive} consecutive shifts'
            })

    return jsonify({
        'status': 'success',
        'data': {
            'date': check_date.isoformat(),
            'threshold': threshold,
            'alerts': alerts,
            'total_alerts': len(alerts)
        }
    }), 200
