"""The planner's PRM overdue list (SERVER_PRM_OVERDUE.md, 2026-11-25).

Delivered through the courier's real upload door, read back through
GET /api/prm-overdue — the same path production takes.
"""
import hashlib
import io
from datetime import datetime

import pytest
from openpyxl import Workbook

from app.services import prm_overdue
from tests.conftest import get_auth_header

KEY = 'prm-overdue-key'
HEADER = ['Equipment', 'Functional location', 'Order', 'Cycle (h)', 'Hours overdue',
          'Planned RH', 'SAP status', 'Plan week', 'Plan mail received']

# Section 5 of the spec: what 25 Nov 2026 must return. Deliberately NOT in
# hours-overdue order, so the sort is tested too.
SECTION_5 = [
    ['TT054', '3700-EQ-TT_-TT054', '700001975030', 250, 20, 1400, 'REL', 46, '2026-11-22 22:27'],
    ['TT058', '3700-EQ-TT_-TT058', '700001975022', 500, 91, 1690, 'REL  GMPS MACM PRC', 46, '2026-11-22 22:27'],
    ['TT021', '3700-EQ-TT_-TT021', '700001975041', 250, 6, 900, None, 46, '2026-11-22 22:27'],
    ['TT059', '3700-EQ-TT_-TT059', '700001975023', 250, 51, 1200, 'CRTD', 46, '2026-11-22 22:27'],
    ['TT055', '3700-EQ-TT_-TT055', '700001975024', 1000, 47, 3100, 'REL', 46, '2026-11-22 22:27'],
]


def _xlsx(rows, header=HEADER, sheet='PRM Overdue'):
    book = Workbook()
    ws = book.active
    ws.title = sheet
    ws.append(header)
    for row in rows:
        ws.append(row)
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()


def _deliver(client, payload, filename='PRM_Overdue.xlsx', folder='Source file'):
    resp = client.post('/api/sap-sync/upload', headers={'X-Robot-Key': KEY},
                       content_type='multipart/form-data',
                       data={'file': (io.BytesIO(payload), filename),
                             'sheet_name': 'OTHER', 'source_filename': filename,
                             'source_folder': folder,
                             'sha256': hashlib.sha256(payload).hexdigest()})
    assert resp.status_code == 200, resp.get_json()
    return resp


@pytest.fixture(autouse=True)
def robot_key(app):
    app.config['SAP_SYNC_ROBOT_KEY'] = KEY
    prm_overdue._cache.clear()
    yield
    prm_overdue._cache.clear()


def _get(client, email='admin@test.com', password='admin123'):
    return client.get('/api/prm-overdue',
                      headers=get_auth_header(client, email, password))


class TestSection5:
    def test_returns_the_five_machines_most_overdue_first(self, client, admin_user):
        _deliver(client, _xlsx(SECTION_5))

        data = _get(client).get_json()['data']

        assert [(r['equipment'], r['hours_overdue']) for r in data['rows']] == [
            ('TT058', 91), ('TT059', 51), ('TT055', 47), ('TT054', 20), ('TT021', 6)]
        assert data['available'] is True
        assert data['plan_week'] == 46
        assert data['plan_received'] == '2026-11-22 22:27'

    def test_the_order_number_stays_twelve_digit_text(self, client, admin_user):
        _deliver(client, _xlsx(SECTION_5))
        top = _get(client).get_json()['data']['rows'][0]
        assert top['order'] == '700001975022'
        assert top['cycle_hours'] == 500
        assert top['sap_status'] == 'REL  GMPS MACM PRC'

    def test_parsing_stamps_the_upload_record(self, client, admin_user):
        _deliver(client, _xlsx(SECTION_5))
        _get(client)
        assert prm_overdue.current_record().parsed_at is not None


class TestTheSpecsRules:
    def test_a_new_upload_replaces_the_list_never_merges(self, client, admin_user):
        _deliver(client, _xlsx(SECTION_5))
        _get(client)
        _deliver(client, _xlsx([SECTION_5[1]]))      # next week: only TT058 left

        rows = _get(client).get_json()['data']['rows']

        assert [r['equipment'] for r in rows] == ['TT058']

    def test_header_only_means_nothing_overdue(self, client, admin_user):
        _deliver(client, _xlsx([]))
        data = _get(client).get_json()['data']
        assert data['available'] is True and data['rows'] == []

    def test_never_delivered_is_not_the_same_as_nothing_overdue(self, client, admin_user):
        data = _get(client).get_json()['data']
        assert data['available'] is False and data['rows'] == []

    def test_the_spec_file_beside_it_is_never_read_as_the_list(self, client, admin_user):
        """In SQL LIKE, `_` matches any letter: '%PRM_Overdue%' also matches
        SERVER_PRM_OVERDUE.md. It did, the first time this file was looked up."""
        _deliver(client, b'# spec', filename='SERVER_PRM_OVERDUE.md', folder='Source file')
        data = _get(client).get_json()['data']
        assert data['available'] is False

    def test_columns_are_read_by_name_not_position(self, client, admin_user):
        order = [4, 0, 2, 8, 1, 3, 5, 6, 7]
        _deliver(client, _xlsx([[row[i] for i in order] for row in SECTION_5],
                               header=[HEADER[i] for i in order]))
        rows = _get(client).get_json()['data']['rows']
        assert (rows[0]['equipment'], rows[0]['hours_overdue']) == ('TT058', 91)

    def test_rows_without_equipment_are_skipped(self, client, admin_user):
        _deliver(client, _xlsx([SECTION_5[0], [None, None, '700000000099', 250, 300,
                                               None, None, 46, '2026-11-22 22:27']]))
        rows = _get(client).get_json()['data']['rows']
        assert [r['equipment'] for r in rows] == ['TT054']

    def test_a_file_missing_a_column_says_which(self):
        with pytest.raises(ValueError, match='hours_overdue'):
            prm_overdue.parse(_xlsx([], header=['Equipment', 'Order']))


class TestStaleness:
    def test_a_mail_older_than_8_days_is_stale(self):
        rows = prm_overdue.parse(_xlsx(SECTION_5))
        fresh = prm_overdue.build_payload(rows, now=datetime(2026, 11, 25, 10, 0))
        stale = prm_overdue.build_payload(rows, now=datetime(2026, 12, 1, 10, 0))
        assert fresh['is_stale'] is False and fresh['plan_received_age_days'] < 3
        assert stale['is_stale'] is True


class TestPlannersOnly:
    def test_an_engineer_may_see_it(self, client, engineer):
        _deliver(client, _xlsx(SECTION_5))
        assert _get(client, 'eng@test.com', 'test123').status_code == 200

    def test_an_inspector_may_not(self, client, mech_inspector):
        resp = client.get('/api/prm-overdue', headers=get_auth_header(
            client, mech_inspector.email, 'test123'))
        assert resp.status_code == 403

    def test_no_login_no_list(self, client):
        assert client.get('/api/prm-overdue').status_code == 401
