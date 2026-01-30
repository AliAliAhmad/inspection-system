"""
Tests for reports and dashboard endpoints.
"""

from tests.conftest import get_auth_header


class TestDashboard:
    def test_admin_dashboard(self, client, admin_user):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/reports/dashboard', headers=headers)
        assert resp.status_code == 200

    def test_inspector_dashboard(self, client, mech_inspector):
        headers = get_auth_header(client, 'mech@test.com', 'test123')
        resp = client.get('/api/reports/dashboard', headers=headers)
        assert resp.status_code == 200

    def test_specialist_dashboard(self, client, specialist):
        headers = get_auth_header(client, 'spec@test.com', 'test123')
        resp = client.get('/api/reports/dashboard', headers=headers)
        assert resp.status_code == 200

    def test_engineer_dashboard(self, client, engineer):
        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get('/api/reports/dashboard', headers=headers)
        assert resp.status_code == 200

    def test_qe_dashboard(self, client, qe_user):
        headers = get_auth_header(client, 'qe@test.com', 'test123')
        resp = client.get('/api/reports/dashboard', headers=headers)
        assert resp.status_code == 200


class TestAnalytics:
    def test_pause_analytics(self, client, admin_user):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/reports/pause-analytics', headers=headers)
        assert resp.status_code == 200

    def test_defect_analytics(self, client, admin_user):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/reports/defect-analytics', headers=headers)
        assert resp.status_code == 200

    def test_capacity_report(self, client, admin_user):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/reports/capacity', headers=headers)
        assert resp.status_code == 200
