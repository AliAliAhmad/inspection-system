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
        with pytest.raises(ValueError, match='due_hours'):
            prm_overdue.parse(_xlsx([], header=['Equipment', 'Order']))


class TestTheSign:
    def test_the_mails_negative_number_means_hours_late(self, client, admin_user):
        """Ali, 2026-11-25: in the planner's mail -31 means ran 31h past the
        service. Today the PC sends +31; if it ever sends the raw -31, the list
        must still say 31 hours overdue, not 'not due'."""
        raw = [r[:4] + [-r[4]] + r[5:] for r in SECTION_5]
        _deliver(client, _xlsx(raw))
        rows = _get(client).get_json()['data']['rows']
        assert [(r['equipment'], r['hours_overdue']) for r in rows] == [
            ('TT058', 91), ('TT059', 51), ('TT055', 47), ('TT054', 20), ('TT021', 6)]


# v2 (2026-11-26): every hourly row of the mail + column J "Due (h)", SAP's sign.
# The PC's own check: week 46 = 16 rows, 5 overdue. Overdue rows first, then the
# 11 not yet due, deliberately shuffled so the sort is tested.
HEADER_V2 = HEADER + ['Due (h)']
_WHEN = [46, '2026-11-22 22:27']
SECTION_5_V2 = [r[:4] + [r[4]] + r[5:] + [-r[4]] for r in SECTION_5]
DUE_SOON = [
    [code, None, f'70000197{n:04d}', 250, None, 1000, 'REL', *_WHEN, due]
    for n, (code, due) in enumerate([
        ('FL302', 12.82), ('RS109', 140), ('TT030', 3.5), ('ECH02', 88),
        ('TT061', 200), ('RS110', 0.4), ('TT040', 55), ('FL301', 230),
        ('TT012', 19), ('RS101', 101.25), ('TT033', 7)])
]


class TestVersion2:
    def _rows(self, client):
        _deliver(client, _xlsx(DUE_SOON[:6] + SECTION_5_V2 + DUE_SOON[6:], header=HEADER_V2))
        return _get(client).get_json()['data']

    def test_week_46_is_16_rows_and_5_overdue(self, client, admin_user):
        data = self._rows(client)
        assert len(data['rows']) == 16
        assert data['overdue_count'] == 5
        assert [r['equipment'] for r in data['rows'] if r['is_overdue']] == [
            'TT058', 'TT059', 'TT055', 'TT054', 'TT021']

    def test_due_keeps_sap_sign_and_two_decimals(self, client, admin_user):
        rows = {r['equipment']: r for r in self._rows(client)['rows']}
        assert rows['TT058']['due_hours'] == -91 and rows['TT058']['hours_overdue'] == 91
        assert rows['FL302']['due_hours'] == 12.82
        assert rows['FL302']['hours_overdue'] is None
        assert rows['FL302']['is_overdue'] is False

    def test_most_overdue_first_then_soonest_due(self, client, admin_user):
        dues = [r['due_hours'] for r in self._rows(client)['rows']]
        assert dues == sorted(dues)
        assert dues[:5] == [-91, -51, -47, -20, -6]
        assert dues[5] == 0.4

    def test_next_week_replaces_week_46_with_its_own_numbers(self, client, admin_user):
        """Nothing is tied to week 46: week 47's file is read the same way."""
        self._rows(client)
        week_47 = [['TT099', None, '700001999001', 500, None, 1, 'REL', 47, '2026-11-29 21:05', -14],
                   ['FL302', None, '700001999002', 250, None, 1, 'REL', 47, '2026-11-29 21:05', 33.5]]
        _deliver(client, _xlsx(week_47, header=HEADER_V2))
        data = _get(client).get_json()['data']
        assert data['plan_week'] == 47 and data['plan_received'] == '2026-11-29 21:05'
        assert [(r['equipment'], r['due_hours']) for r in data['rows']] == [
            ('TT099', -14), ('FL302', 33.5)]
        assert data['overdue_count'] == 1

    def test_column_j_wins_over_a_stale_hours_overdue(self):
        """J is the fact. If E says late but J says 12h to go, the row is not late."""
        rows = prm_overdue.parse(_xlsx(
            [['TT070', None, '700000000001', 250, 30, None, None, *_WHEN, 12]],
            header=HEADER_V2))
        assert rows[0]['is_overdue'] is False and rows[0]['hours_overdue'] is None

    def test_a_v1_file_still_reads_as_all_overdue(self):
        rows = prm_overdue.parse(_xlsx(SECTION_5))
        assert all(r['is_overdue'] for r in rows)
        assert rows[0]['due_hours'] == -91


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


# ── Choice A (Ali, 2026-11-26): the generator ranks an hourly PM by whichever
# number is MORE late — the app's own or the planner's. Never lower.
class TestTheGeneratorTakesTheMoreLate:
    def _populate(self, db_session, admin_user, app_value, base='running_hours',
                  number='700001975022'):
        from datetime import date, timedelta
        from app.models import Equipment, SAPWorkOrder, WorkPlan
        from app.services.work_plan_generator_service import _step_populate
        eq = Equipment(name='TT058', serial_number=f'SN-TT058-{number}',
                       equipment_type='terminal tractor', berth='west')
        db_session.session.add(eq)
        db_session.session.flush()
        db_session.session.add(SAPWorkOrder(
            order_number=number, order_type='PRM', job_type='pm',
            equipment_id=eq.id, description='TT058 500HR SERVICE',
            estimated_hours=4.0, priority='urgent', status='pending',
            maintenance_base=base, overdue_value=app_value,
            overdue_unit='hours' if base == 'running_hours' else 'days'))
        monday = date(2026, 11, 23)
        plan = WorkPlan(week_start=monday, week_end=monday + timedelta(days=6),
                        status='draft', created_by_id=admin_user.id)
        db_session.session.add(plan)
        db_session.session.commit()
        return next(c for c in _step_populate(plan) if c.get('sap_order_number') == number)

    def test_the_planners_91_beats_the_apps_56(self, db_session, admin_user, monkeypatch):
        monkeypatch.setattr(prm_overdue, 'late_hours_by_order',
                            lambda: {'700001975022': 91})
        assert self._populate(db_session, admin_user, 56.0)['overdue_value'] == 91

    def test_the_apps_150_is_never_lowered_to_the_planners_47(
            self, db_session, admin_user, monkeypatch):
        monkeypatch.setattr(prm_overdue, 'late_hours_by_order',
                            lambda: {'700001975022': 47})
        assert self._populate(db_session, admin_user, 150.1)['overdue_value'] == 150.1

    def test_no_app_number_takes_the_planners(self, db_session, admin_user, monkeypatch):
        monkeypatch.setattr(prm_overdue, 'late_hours_by_order',
                            lambda: {'700001975022': 91})
        assert self._populate(db_session, admin_user, None)['overdue_value'] == 91

    def test_a_calendar_pm_is_never_given_hours(self, db_session, admin_user, monkeypatch):
        monkeypatch.setattr(prm_overdue, 'late_hours_by_order',
                            lambda: {'700001975022': 91})
        c = self._populate(db_session, admin_user, 3, base='calendar')
        assert (c['overdue_value'], c['overdue_unit']) == (3, 'days')


class TestLateHoursByOrder:
    def test_only_late_rows_by_order_number(self, client, admin_user, monkeypatch):
        rows = DUE_SOON[:3] + SECTION_5_V2
        _deliver(client, _xlsx(rows, header=HEADER_V2))
        monkeypatch.setattr(prm_overdue, 'datetime', _FrozenNov25)
        assert prm_overdue.late_hours_by_order() == {
            '700001975022': 91, '700001975023': 51, '700001975024': 47,
            '700001975030': 20, '700001975041': 6}

    def test_a_stale_list_pushes_nothing_up(self, client, admin_user):
        _deliver(client, _xlsx(SECTION_5_V2, header=HEADER_V2))   # mail of 22 Nov, today is later
        prm_overdue._cache.clear()
        from unittest import mock
        with mock.patch.object(prm_overdue, 'datetime', _FrozenDec5):
            assert prm_overdue.late_hours_by_order() == {}

    def test_no_file_and_a_broken_file_give_nothing(self, app, monkeypatch):
        with app.app_context():
            assert prm_overdue.late_hours_by_order() == {}
            monkeypatch.setattr(prm_overdue, 'current_list',
                                lambda: (_ for _ in ()).throw(OSError('gone')))
            assert prm_overdue.late_hours_by_order() == {}


class _FrozenNov25(datetime):
    @classmethod
    def utcnow(cls):
        return datetime(2026, 11, 25, 12, 0)


class _FrozenDec5(datetime):
    @classmethod
    def utcnow(cls):
        return datetime(2026, 12, 5, 12, 0)


# ── Ali, 2026-11-26: same machine, hourly + calendar PRM. Both go on the same
# day; the winner leads. Overdue hourly always wins; otherwise the more overdue.
class TestWinnerFirst:
    @staticmethod
    def _order(*members):
        from app.services.work_plan_generator_service import _winner_first
        return [m['name'] for m in _winner_first(list(members))]

    HOURLY = dict(job_type='pm', maintenance_base='running_hours', overdue_unit='hours')
    CAL = dict(job_type='pm', maintenance_base='calendar', overdue_unit='days')

    def test_an_overdue_hourly_beats_a_more_urgent_calendar(self):
        assert self._order(
            dict(self.CAL, name='3-week', overdue_value=20, score=95),
            dict(self.HOURLY, name='250h', overdue_value=5, score=60),
        ) == ['250h', '3-week']

    def test_hourly_not_due_then_the_more_overdue_wins(self):
        assert self._order(
            dict(self.HOURLY, name='250h', overdue_value=-30, score=40),
            dict(self.CAL, name='3-week', overdue_value=4, score=70),
        ) == ['3-week', '250h']

    def test_two_overdue_hourlies_most_late_first(self):
        assert self._order(
            dict(self.HOURLY, name='250h', overdue_value=6, score=100),
            dict(self.HOURLY, name='2000h', overdue_value=91, score=100),
        ) == ['2000h', '250h']

    def test_the_day_is_still_set_by_the_most_urgent(self):
        from app.services.work_plan_generator_service import _step_bundle
        bundle = _step_bundle([
            dict(self.CAL, name='3-week', overdue_value=20, score=95, equipment_id=7,
                 source='sap', estimated_hours=2, description='3-WEEK INSPECTION'),
            dict(self.HOURLY, name='250h', overdue_value=5, score=60, equipment_id=7,
                 source='sap', estimated_hours=4, description='250HR SERVICE'),
        ])[0]
        assert bundle['score'] == 95
        assert [m['name'] for m in bundle['members']] == ['250h', '3-week']


# ── Ali, 2026-11-26: "why not tomorrow as it wins over all". The score stops at
# 100, so every urgent overdue hourly PRM tied. Ties now break by lateness.
class TestTiesBreakByLateness:
    HOURLY = dict(job_type='pm', maintenance_base='running_hours', overdue_unit='hours',
                  source='sap', estimated_hours=4, description='250HR SERVICE')
    FAULT = dict(job_type='defect', overdue_unit='days', source='sap',
                 estimated_hours=2, description='COM FAULT')

    def _order(self, *candidates):
        from app.services.work_plan_generator_service import _step_bundle
        return [b['members'][0]['name'] for b in _step_bundle(list(candidates))]

    def test_tt058_at_91h_beats_tt021_at_6h_on_the_same_score(self):
        assert self._order(
            dict(self.HOURLY, name='TT021', equipment_id=21, overdue_value=6, score=100),
            dict(self.HOURLY, name='TT058', equipment_id=58, overdue_value=91, score=100),
            dict(self.HOURLY, name='TT059', equipment_id=59, overdue_value=51, score=100),
        ) == ['TT058', 'TT059', 'TT021']

    def test_an_overdue_hourly_beats_a_tied_fault_however_old(self):
        assert self._order(
            dict(self.FAULT, name='fault', equipment_id=1, overdue_value=30, score=100),
            dict(self.HOURLY, name='TT021', equipment_id=21, overdue_value=6, score=100),
        ) == ['TT021', 'fault']

    def test_the_score_still_comes_first(self):
        assert self._order(
            dict(self.HOURLY, name='late-but-normal', equipment_id=2, overdue_value=91, score=60),
            dict(self.FAULT, name='urgent', equipment_id=3, overdue_value=1, score=95),
        ) == ['urgent', 'late-but-normal']

    def test_other_ties_go_most_days_late_first(self):
        assert self._order(
            dict(self.FAULT, name='3 days', equipment_id=4, overdue_value=3, score=100),
            dict(self.FAULT, name='20 days', equipment_id=5, overdue_value=20, score=100),
        ) == ['20 days', '3 days']

    def test_the_distribute_order_keeps_the_tie_break(self):
        from app.services.work_plan_generator_service import _apply_recipe_ordering
        bundles = [
            {'score': 100, 'members': [dict(self.HOURLY, name='TT021', overdue_value=6)]},
            {'score': 100, 'members': [dict(self.HOURLY, name='TT058', overdue_value=91)]},
        ]
        ordered = _apply_recipe_ordering(bundles, [], 'priority_first')
        assert [b['members'][0]['name'] for b in ordered] == ['TT058', 'TT021']
