"""
Tests for public endpoints (no auth required).
"""


class TestPublicEndpoints:
    def test_root(self, client):
        resp = client.get('/')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'running'
        assert data['version'] == '2.0.0'
        assert 'endpoints' in data

    def test_health(self, client):
        resp = client.get('/health')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'healthy'
        assert 'timestamp' in data

    def test_404(self, client):
        resp = client.get('/nonexistent')
        assert resp.status_code == 404
        data = resp.get_json()
        assert data['status'] == 'error'
