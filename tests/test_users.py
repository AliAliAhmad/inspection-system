"""
Tests for user management endpoints.
"""

from tests.conftest import get_auth_header


class TestUsers:
    def test_list_users_as_admin(self, client, admin_user, mech_inspector):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/users', headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'data' in data
        assert len(data['data']) >= 2

    def test_update_user(self, client, admin_user, mech_inspector):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.put(f'/api/users/{mech_inspector.id}', json={
            'full_name': 'Updated Inspector Name',
        }, headers=headers)
        assert resp.status_code == 200

    def test_multi_role_user(self, client, db_session, admin_user):
        """Test user with both major and minor roles."""
        from app.models import User
        user = User(
            email='multi@test.com',
            full_name='Multi Role',
            role='specialist',
            role_id='SPE099',
            minor_role='inspector',
            minor_role_id='INS099',
            specialization='mechanical',
            shift='day',
        )
        user.set_password('test123')
        db_session.session.add(user)
        db_session.session.commit()

        assert user.has_role('specialist')
        assert user.has_role('inspector')
        assert not user.has_role('admin')
        assert user.get_active_role_id('specialist') == 'SPE099'
        assert user.get_active_role_id('inspector') == 'INS099'

    def test_user_points(self, db_session, mech_inspector):
        mech_inspector.add_points(10, 'inspector')
        mech_inspector.add_points(5, 'specialist')
        db_session.session.commit()

        assert mech_inspector.total_points == 15
        assert mech_inspector.inspector_points == 10
        assert mech_inspector.specialist_points == 5
