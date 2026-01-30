"""
Tests for leave management and coverage.
"""

from tests.conftest import get_auth_header
from app.models import Leave
from datetime import date, timedelta


class TestLeaveManagement:
    def test_request_leave(self, client, mech_inspector, admin_user):
        headers = get_auth_header(client, 'mech@test.com', 'test123')
        resp = client.post('/api/leaves', json={
            'leave_type': 'annual',
            'date_from': (date.today() + timedelta(days=7)).isoformat(),
            'date_to': (date.today() + timedelta(days=10)).isoformat(),
            'reason': 'Vacation',
        }, headers=headers)
        assert resp.status_code in (200, 201)

    def test_approve_leave(self, client, admin_user, mech_inspector, db_session):
        leave = Leave(
            user_id=mech_inspector.id,
            leave_type='annual',
            date_from=date.today() + timedelta(days=7),
            date_to=date.today() + timedelta(days=10),
            total_days=4,
            reason='Vacation',
            status='pending',
        )
        db_session.session.add(leave)
        db_session.session.commit()

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post(f'/api/leaves/{leave.id}/approve', json={}, headers=headers)
        assert resp.status_code in (200, 201)

    def test_reject_leave(self, client, admin_user, mech_inspector, db_session):
        leave = Leave(
            user_id=mech_inspector.id,
            leave_type='annual',
            date_from=date.today() + timedelta(days=14),
            date_to=date.today() + timedelta(days=16),
            total_days=3,
            reason='Trip',
            status='pending',
        )
        db_session.session.add(leave)
        db_session.session.commit()

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post(f'/api/leaves/{leave.id}/reject', json={}, headers=headers)
        assert resp.status_code in (200, 201)

    def test_active_leaves(self, client, admin_user):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/leaves/active', headers=headers)
        assert resp.status_code == 200

    def test_capacity_analysis(self, client, admin_user):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/leaves/capacity', headers=headers)
        assert resp.status_code == 200


class TestCoverage:
    def test_coverage_candidates(self, client, admin_user, mech_inspector, db_session):
        leave = Leave(
            user_id=mech_inspector.id,
            leave_type='annual',
            date_from=date.today(),
            date_to=date.today() + timedelta(days=3),
            total_days=4,
            reason='Sick',
            status='approved',
        )
        db_session.session.add(leave)
        db_session.session.commit()

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get(f'/api/leaves/{leave.id}/coverage/candidates', headers=headers)
        assert resp.status_code == 200
