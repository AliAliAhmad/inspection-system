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
from app.models import User, Leave, RosterEntry

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
