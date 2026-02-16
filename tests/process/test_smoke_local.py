"""
LOCAL SMOKE TESTS — test the same endpoints as test_smoke_remote.py
====================================================================
Uses the Flask test client instead of HTTP requests, so these always
run (no BASE_URL / live server required).

Tests cover: health, auth, equipment, checklists, inspections,
defects, reports, notifications, endpoint structure.
"""

import pytest
from tests.process.conftest import login


# ---------------------------------------------------------------------------
# A) Health
# ---------------------------------------------------------------------------

class TestLocalHealth:
    def test_root_endpoint(self, client):
        resp = client.get('/')
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'running'

    def test_health_endpoint(self, client):
        resp = client.get('/health')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] in ('healthy', 'degraded')
        assert data['database'] == 'connected'


# ---------------------------------------------------------------------------
# B) Authentication
# ---------------------------------------------------------------------------

class TestLocalAuth:
    def test_login_success(self, client, admin_user):
        token, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/auth/me', headers=header)
        assert resp.status_code == 200
        user = resp.get_json()['user']
        assert user['email'] == 'admin@process-test.com'

    def test_login_failure(self, client):
        resp = client.post('/api/auth/login', json={
            'email': 'nonexistent@test.com',
            'password': 'wrongpass',
        })
        assert resp.status_code in (401, 404)

    def test_unauthenticated_rejected(self, client):
        resp = client.get('/api/inspections')
        assert resp.status_code in (401, 422)


# ---------------------------------------------------------------------------
# C) Data visibility (read-only)
# ---------------------------------------------------------------------------

class TestLocalDataVisibility:
    def test_equipment_list(self, client, admin_user, test_equipment):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/equipment', headers=header)
        assert resp.status_code == 200
        assert 'data' in resp.get_json()

    def test_checklists_list(self, client, admin_user, test_template):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/checklists', headers=header)
        assert resp.status_code == 200

    def test_inspections_list(self, client, admin_user):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/inspections', headers=header)
        assert resp.status_code == 200

    def test_defects_list(self, client, admin_user):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/defects', headers=header)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# D) Reports (read-only)
# ---------------------------------------------------------------------------

class TestLocalReports:
    def test_dashboard(self, client, admin_user):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/reports/dashboard', headers=header)
        assert resp.status_code == 200

    def test_admin_dashboard(self, client, admin_user):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/reports/admin-dashboard', headers=header)
        assert resp.status_code in (200, 403)

    def test_defect_analytics(self, client, admin_user):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/reports/defect-analytics', headers=header)
        assert resp.status_code in (200, 403)


# ---------------------------------------------------------------------------
# E) Endpoint structure validation (read-only)
# ---------------------------------------------------------------------------

class TestLocalEndpointStructure:
    """Verify key endpoints return expected JSON shapes."""

    def test_equipment_has_pagination(self, client, admin_user, test_equipment):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/equipment', headers=header)
        body = resp.get_json()
        assert 'data' in body
        assert 'pagination' in body

    def test_defects_have_status_field(self, client, admin_user):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/defects', headers=header)
        defects = resp.get_json().get('data', [])
        # Only check fields if defects exist (may be empty in test DB)
        if defects:
            assert 'status' in defects[0]
            assert 'severity' in defects[0]

    def test_notifications_endpoint(self, client, admin_user):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/notifications', headers=header)
        assert resp.status_code == 200
