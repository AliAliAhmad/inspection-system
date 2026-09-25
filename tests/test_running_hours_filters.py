"""
Running-hours dashboard: filters, sorting and CSV export.

The dashboard sent `location`, `equipment_type` and `sort_order`, and sorted by
`current_hours`, and the list endpoint ignored all four. Export pointed at a
route that did not exist.
"""
import csv
import io
from datetime import datetime, timezone

import pytest

from app.models import Equipment
from app.models.running_hours import RunningHoursReading, ServiceInterval
from tests.conftest import get_auth_header

URL = '/api/equipment/running-hours'


def _eq(db, name, serial, *, location, eq_type, location_ar=None, type_ar=None,
        hours=None, next_service=None, recorded_by=None):
    eq = Equipment(
        name=name, serial_number=serial, equipment_type=eq_type,
        equipment_type_ar=type_ar, location=location, location_ar=location_ar,
        berth='east', status='active',
    )
    db.session.add(eq)
    db.session.flush()
    if hours is not None:
        db.session.add(RunningHoursReading(
            equipment_id=eq.id, hours=hours, recorded_by_id=recorded_by,
            recorded_at=datetime.now(timezone.utc),
        ))
    if next_service is not None:
        db.session.add(ServiceInterval(
            equipment_id=eq.id, service_interval_hours=500,
            alert_threshold_hours=50, last_service_hours=next_service - 500,
            next_service_hours=next_service,
        ))
    return eq


@pytest.fixture
def fleet(db_session, admin_user):
    db = db_session
    uid = admin_user.id
    # ok: 100h of 1000
    _eq(db, 'Alpha Crane', 'A-1', location='East Yard', eq_type='CRANE',
        location_ar='الساحة الشرقية', type_ar='رافعة',
        hours=100, next_service=1000, recorded_by=uid)
    # overdue: 900h, due at 800
    _eq(db, 'Bravo Stacker', 'B-1', location='West Yard', eq_type='RS',
        hours=900, next_service=800, recorded_by=uid)
    # approaching: 480h, due at 500
    _eq(db, 'Charlie Crane', 'C-1', location='east yard gate', eq_type='crane',
        hours=480, next_service=500, recorded_by=uid)
    # no readings, no interval
    _eq(db, 'Delta 50%_Pump', 'D-1', location='Workshop', eq_type='PUMP')
    db.session.commit()


@pytest.fixture
def auth(client, admin_user):
    return get_auth_header(client, 'admin@test.com', 'admin123')


def _names(resp):
    assert resp.status_code == 200, resp.get_json()
    return [r['equipment_name'] for r in resp.get_json()['data']]


class TestFilters:
    def test_location_is_case_insensitive_substring(self, client, auth, fleet):
        names = _names(client.get(f'{URL}?location=EAST YARD&sort_by=name', headers=auth))
        assert names == ['Alpha Crane', 'Charlie Crane']

    def test_location_matches_arabic(self, client, auth, fleet):
        assert _names(client.get(f'{URL}?location=الشرقية', headers=auth)) == ['Alpha Crane']

    def test_equipment_type_is_case_insensitive(self, client, auth, fleet):
        names = _names(client.get(f'{URL}?equipment_type=Crane&sort_by=name', headers=auth))
        assert names == ['Alpha Crane', 'Charlie Crane']

    def test_equipment_type_matches_arabic(self, client, auth, fleet):
        assert _names(client.get(f'{URL}?equipment_type=رافعة', headers=auth)) == ['Alpha Crane']

    def test_like_wildcards_are_literal(self, client, auth, fleet):
        # '%' must not match everything
        assert _names(client.get(f'{URL}?location=%25', headers=auth)) == []

    def test_blank_filters_are_ignored(self, client, auth, fleet):
        resp = client.get(f'{URL}?location=%20%20&equipment_type=', headers=auth)
        assert len(_names(resp)) == 4

    def test_filters_combine_with_status(self, client, auth, fleet):
        names = _names(client.get(f'{URL}?equipment_type=crane&status=approaching', headers=auth))
        assert names == ['Charlie Crane']

    def test_total_reflects_filters(self, client, auth, fleet):
        body = client.get(f'{URL}?equipment_type=crane&per_page=1', headers=auth).get_json()
        assert body['pagination']['total'] == 2
        assert body['pagination']['pages'] == 2
        assert len(body['data']) == 1


class TestSorting:
    def test_current_hours_desc(self, client, auth, fleet):
        names = _names(client.get(f'{URL}?sort_by=current_hours&sort_order=desc', headers=auth))
        assert names == ['Bravo Stacker', 'Charlie Crane', 'Alpha Crane', 'Delta 50%_Pump']

    def test_current_hours_asc(self, client, auth, fleet):
        names = _names(client.get(f'{URL}?sort_by=current_hours&sort_order=asc', headers=auth))
        assert names == ['Delta 50%_Pump', 'Alpha Crane', 'Charlie Crane', 'Bravo Stacker']

    def test_hours_alias_still_defaults_to_most_first(self, client, auth, fleet):
        assert _names(client.get(f'{URL}?sort_by=hours', headers=auth))[0] == 'Bravo Stacker'

    def test_urgency_desc_puts_overdue_first(self, client, auth, fleet):
        names = _names(client.get(f'{URL}?sort_by=urgency&sort_order=desc', headers=auth))
        assert names[:2] == ['Bravo Stacker', 'Charlie Crane']

    def test_urgency_without_order_keeps_old_behaviour(self, client, auth, fleet):
        assert _names(client.get(f'{URL}?sort_by=urgency', headers=auth))[0] == 'Bravo Stacker'

    def test_urgency_asc_puts_ok_first(self, client, auth, fleet):
        names = _names(client.get(f'{URL}?sort_by=urgency&sort_order=asc', headers=auth))
        assert names[-2:] == ['Charlie Crane', 'Bravo Stacker']

    def test_name_desc(self, client, auth, fleet):
        names = _names(client.get(f'{URL}?sort_by=name&sort_order=desc', headers=auth))
        assert names == ['Delta 50%_Pump', 'Charlie Crane', 'Bravo Stacker', 'Alpha Crane']

    def test_unknown_sort_falls_back_to_name(self, client, auth, fleet):
        names = _names(client.get(f'{URL}?sort_by=bogus&sort_order=sideways', headers=auth))
        assert names == ['Alpha Crane', 'Bravo Stacker', 'Charlie Crane', 'Delta 50%_Pump']


class TestExport:
    def test_requires_auth(self, client, fleet):
        assert client.get(f'{URL}/export').status_code == 401

    def test_csv_with_bom_and_arabic_safe(self, client, auth, fleet):
        resp = client.get(f'{URL}/export', headers=auth)
        assert resp.status_code == 200
        assert resp.mimetype == 'text/csv'
        assert 'attachment' in resp.headers['Content-Disposition']
        raw = resp.get_data()
        assert raw.startswith(b'\xef\xbb\xbf')
        rows = list(csv.reader(io.StringIO(raw.decode('utf-8-sig'))))
        assert rows[0][0] == 'Equipment'
        assert len(rows) == 5

    def test_respects_filters_and_sort(self, client, auth, fleet):
        resp = client.get(
            f'{URL}/export?equipment_type=crane&sort_by=current_hours&sort_order=desc',
            headers=auth,
        )
        rows = list(csv.reader(io.StringIO(resp.get_data().decode('utf-8-sig'))))
        assert [r[0] for r in rows[1:]] == ['Charlie Crane', 'Alpha Crane']
        assert rows[1][4] == '480.0'
        assert rows[1][5] == 'approaching'

    def test_formula_cells_are_neutralised(self, client, auth, db_session):
        db_session.session.add(Equipment(
            name='=HYPERLINK("x")', serial_number='F-1', equipment_type='X',
            location='Yard', status='active',
        ))
        db_session.session.commit()
        resp = client.get(f'{URL}/export', headers=auth)
        rows = list(csv.reader(io.StringIO(resp.get_data().decode('utf-8-sig'))))
        assert rows[1][0] == '\'=HYPERLINK("x")'
