"""
REMOTE SMOKE TESTS — run against a live deployment (staging or production).
============================================================================

Uses `requests` over HTTP (not the Flask test client).
Controlled entirely via environment variables:

  Required:
    BASE_URL             - e.g. https://inspection-api-o3hz.onrender.com
    TEST_USER_EMAIL      - admin account for the target environment
    TEST_USER_PASSWORD   - password for the admin account

  Optional:
    RUN_PROD_TESTS=true  - must be set to run against production
    TEST_EQUIPMENT_CODE  - serial number of existing test equipment
    TEST_TEMPLATE_NAME   - name of existing test template

Usage:
  # Staging
  BASE_URL=https://staging-api.example.com \
  TEST_USER_EMAIL=admin@test.com \
  TEST_USER_PASSWORD=secret \
    pytest tests/process/test_smoke_remote.py -v

  # Production (safe mode — read-only assertions)
  BASE_URL=https://api.example.com \
  TEST_USER_EMAIL=admin@test.com \
  TEST_USER_PASSWORD=secret \
  RUN_PROD_TESTS=true \
    pytest tests/process/test_smoke_remote.py -v --tb=short -x

NOTE: These tests are superseded by test_smoke_local.py for normal CI runs.
      They exist for live deployment verification only.
"""

import os
import pytest
import requests

# ---------------------------------------------------------------------------
# Configuration from environment
# ---------------------------------------------------------------------------

BASE_URL = os.environ.get('BASE_URL', '').rstrip('/')
TEST_EMAIL = os.environ.get('TEST_USER_EMAIL', '')
TEST_PASSWORD = os.environ.get('TEST_USER_PASSWORD', '')
IS_PROD = os.environ.get('RUN_PROD_TESTS', '').lower() == 'true'

# Mark entire module: only collect when BASE_URL is set.
# With "remote" marker, these never appear as "skipped" in normal runs.
pytestmark = [
    pytest.mark.remote,
    pytest.mark.skipif(not BASE_URL, reason='BASE_URL not set — use test_smoke_local.py for local runs'),
]


def _url(path: str) -> str:
    return f'{BASE_URL}{path}'


# ---------------------------------------------------------------------------
# Session-scoped auth token
# ---------------------------------------------------------------------------

@pytest.fixture(scope='module')
def auth_header():
    """Login once, reuse token for all tests in this module."""
    assert TEST_EMAIL, 'TEST_USER_EMAIL env var required'
    assert TEST_PASSWORD, 'TEST_USER_PASSWORD env var required'

    resp = requests.post(_url('/api/auth/login'), json={
        'email': TEST_EMAIL,
        'password': TEST_PASSWORD,
    }, timeout=30)
    assert resp.status_code == 200, f'Login failed: {resp.text}'
    token = resp.json()['access_token']
    return {'Authorization': f'Bearer {token}'}


# ---------------------------------------------------------------------------
# A) Health
# ---------------------------------------------------------------------------

class TestRemoteHealth:
    def test_root_endpoint(self):
        resp = requests.get(_url('/'), timeout=10)
        assert resp.status_code == 200
        assert resp.json()['status'] == 'running'

    def test_health_endpoint(self):
        resp = requests.get(_url('/health'), timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'healthy'
        assert data['database'] == 'connected'


# ---------------------------------------------------------------------------
# B) Authentication
# ---------------------------------------------------------------------------

class TestRemoteAuth:
    def test_login_success(self, auth_header):
        """Token was obtained in fixture — just verify it's usable."""
        resp = requests.get(
            _url('/api/auth/me'), headers=auth_header, timeout=10,
        )
        assert resp.status_code == 200
        user = resp.json()['user']
        assert user['email'] == TEST_EMAIL

    def test_login_failure(self):
        resp = requests.post(_url('/api/auth/login'), json={
            'email': 'nonexistent@test.com',
            'password': 'wrongpass',
        }, timeout=10)
        assert resp.status_code in (401, 404)

    def test_unauthenticated_rejected(self):
        resp = requests.get(_url('/api/inspections'), timeout=10)
        assert resp.status_code in (401, 422)


# ---------------------------------------------------------------------------
# C) Data visibility (read-only — safe for production)
# ---------------------------------------------------------------------------

class TestRemoteDataVisibility:
    def test_equipment_list(self, auth_header):
        resp = requests.get(
            _url('/api/equipment'), headers=auth_header, timeout=10,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert 'data' in data

    def test_checklists_list(self, auth_header):
        resp = requests.get(
            _url('/api/checklists'), headers=auth_header, timeout=10,
        )
        assert resp.status_code == 200

    def test_inspections_list(self, auth_header):
        resp = requests.get(
            _url('/api/inspections'), headers=auth_header, timeout=10,
        )
        assert resp.status_code == 200

    def test_defects_list(self, auth_header):
        resp = requests.get(
            _url('/api/defects'), headers=auth_header, timeout=10,
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# D) Reports (read-only — safe for production)
# ---------------------------------------------------------------------------

class TestRemoteReports:
    def test_dashboard(self, auth_header):
        resp = requests.get(
            _url('/api/reports/dashboard'), headers=auth_header, timeout=10,
        )
        assert resp.status_code == 200

    def test_admin_dashboard(self, auth_header):
        resp = requests.get(
            _url('/api/reports/admin-dashboard'), headers=auth_header, timeout=10,
        )
        # May return 403 if user is not admin
        assert resp.status_code in (200, 403)

    def test_defect_analytics(self, auth_header):
        resp = requests.get(
            _url('/api/reports/defect-analytics'), headers=auth_header, timeout=10,
        )
        assert resp.status_code in (200, 403)


# ---------------------------------------------------------------------------
# E) Endpoint structure validation (read-only)
# ---------------------------------------------------------------------------

class TestRemoteEndpointStructure:
    """Verify key endpoints return expected JSON shapes."""

    def test_equipment_has_pagination(self, auth_header):
        resp = requests.get(
            _url('/api/equipment'), headers=auth_header, timeout=10,
        )
        body = resp.json()
        assert 'data' in body
        assert 'pagination' in body

    def test_defects_have_status_field(self, auth_header):
        resp = requests.get(
            _url('/api/defects'), headers=auth_header, timeout=10,
        )
        defects = resp.json().get('data', [])
        if defects:
            assert 'status' in defects[0]
            assert 'severity' in defects[0]

    def test_notifications_endpoint(self, auth_header):
        resp = requests.get(
            _url('/api/notifications'), headers=auth_header, timeout=10,
        )
        assert resp.status_code == 200
