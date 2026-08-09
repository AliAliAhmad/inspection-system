"""
Tests for GET /work-plans/week-inspections.

The web planner renders one inspection summary per day column. That used to cost
one /day-inspections request per day (7 per page load, measured). This endpoint
returns the whole range at once. /day-inspections is intentionally left in place
for mobile, so both must keep working.
"""

from datetime import date, timedelta

from tests.conftest import get_auth_header


class TestWeekInspections:
    def test_returns_an_entry_for_every_date_in_range(self, client, admin_user, engineer, db_session):
        """The shape is pre-seeded so the client can index by date without guards."""
        start = date.today()
        end = start + timedelta(days=6)

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get(
            f'/api/work-plans/week-inspections?start={start.isoformat()}&end={end.isoformat()}',
            headers=headers,
        )

        assert resp.status_code == 200
        data = resp.get_json()['data']
        assert len(data) == 7, 'one key per day in the range'
        for i in range(7):
            key = (start + timedelta(days=i)).isoformat()
            assert key in data
            assert data[key]['east'] == {'count': 0, 'assignments': []}
            assert data[key]['west'] == {'count': 0, 'assignments': []}

    def test_single_day_range_is_allowed(self, client, admin_user, engineer, db_session):
        """WorkPlanDayPage passes the same date as start and end."""
        today = date.today().isoformat()
        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get(
            f'/api/work-plans/week-inspections?start={today}&end={today}',
            headers=headers,
        )
        assert resp.status_code == 200
        assert list(resp.get_json()['data'].keys()) == [today]

    def test_requires_start_and_end(self, client, admin_user, engineer, db_session):
        headers = get_auth_header(client, 'eng@test.com', 'test123')
        today = date.today().isoformat()

        assert client.get('/api/work-plans/week-inspections', headers=headers).status_code == 400
        assert client.get(
            f'/api/work-plans/week-inspections?start={today}', headers=headers
        ).status_code == 400
        assert client.get(
            f'/api/work-plans/week-inspections?end={today}', headers=headers
        ).status_code == 400

    def test_rejects_bad_date_format(self, client, admin_user, engineer, db_session):
        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get(
            '/api/work-plans/week-inspections?start=09-08-2026&end=15-08-2026',
            headers=headers,
        )
        assert resp.status_code == 400

    def test_rejects_end_before_start(self, client, admin_user, engineer, db_session):
        start = date.today()
        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get(
            f'/api/work-plans/week-inspections?start={start.isoformat()}'
            f'&end={(start - timedelta(days=1)).isoformat()}',
            headers=headers,
        )
        assert resp.status_code == 400

    def test_rejects_range_over_31_days(self, client, admin_user, engineer, db_session):
        """Guards against a client asking for a year of data in one call."""
        start = date.today()
        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get(
            f'/api/work-plans/week-inspections?start={start.isoformat()}'
            f'&end={(start + timedelta(days=40)).isoformat()}',
            headers=headers,
        )
        assert resp.status_code == 400

    def test_day_endpoint_still_works(self, client, admin_user, engineer, db_session):
        """Mobile — including already-installed builds — still uses this."""
        today = date.today().isoformat()
        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get(f'/api/work-plans/day-inspections?date={today}', headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()['data']
        assert 'east' in data and 'west' in data
