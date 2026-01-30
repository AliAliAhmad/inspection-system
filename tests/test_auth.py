"""
Tests for authentication endpoints.
"""

from tests.conftest import get_auth_header


class TestLogin:
    def test_login_success(self, client, admin_user):
        resp = client.post('/api/auth/login', json={
            'email': 'admin@test.com',
            'password': 'admin123'
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'success'
        assert 'access_token' in data
        assert 'refresh_token' in data
        assert data['user']['email'] == 'admin@test.com'
        assert data['user']['role'] == 'admin'

    def test_login_wrong_password(self, client, admin_user):
        resp = client.post('/api/auth/login', json={
            'email': 'admin@test.com',
            'password': 'wrong'
        })
        assert resp.status_code == 401

    def test_login_nonexistent_user(self, client):
        resp = client.post('/api/auth/login', json={
            'email': 'none@test.com',
            'password': 'test'
        })
        assert resp.status_code == 401

    def test_login_missing_fields(self, client):
        resp = client.post('/api/auth/login', json={})
        assert resp.status_code == 400

    def test_login_inactive_user(self, client, admin_user, db_session):
        admin_user.is_active = False
        db_session.session.commit()
        resp = client.post('/api/auth/login', json={
            'email': 'admin@test.com',
            'password': 'admin123'
        })
        assert resp.status_code == 401


class TestMe:
    def test_get_current_user(self, client, admin_user):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/auth/me', headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['user']['email'] == 'admin@test.com'

    def test_get_current_user_no_token(self, client):
        resp = client.get('/api/auth/me')
        assert resp.status_code == 401


class TestRefresh:
    def test_refresh_token(self, client, admin_user):
        login_resp = client.post('/api/auth/login', json={
            'email': 'admin@test.com',
            'password': 'admin123'
        })
        refresh_token = login_resp.get_json()['refresh_token']
        resp = client.post('/api/auth/refresh', headers={
            'Authorization': f'Bearer {refresh_token}'
        })
        assert resp.status_code == 200
        assert 'access_token' in resp.get_json()
