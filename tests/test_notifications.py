"""Smoke tests for notification endpoints."""

import pytest
from app.models import Notification
from tests.conftest import get_auth_header


class TestNotifications:
    def test_list_notifications_empty(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/notifications', headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'success'
        assert data['data'] == []
        assert data['unread_count'] == 0

    def test_list_notifications_with_data(self, client, admin_user, db_session):
        # Create a notification directly
        n = Notification(
            user_id=admin_user.id,
            type='test',
            title='Test Notification',
            message='Test message',
            priority='info',
        )
        db_session.session.add(n)
        db_session.session.commit()

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/notifications', headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data['data']) == 1
        assert data['unread_count'] == 1

    def test_filter_unread_only(self, client, admin_user, db_session):
        # Create read and unread notifications
        n1 = Notification(user_id=admin_user.id, type='test', title='Read', message='msg', is_read=True)
        n2 = Notification(user_id=admin_user.id, type='test', title='Unread', message='msg', is_read=False)
        db_session.session.add_all([n1, n2])
        db_session.session.commit()

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/notifications?unread_only=true', headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data['data']) == 1
        assert data['data'][0]['title'] == 'Unread'

    def test_mark_notification_read(self, client, admin_user, db_session):
        n = Notification(user_id=admin_user.id, type='test', title='T', message='M')
        db_session.session.add(n)
        db_session.session.commit()

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post(f'/api/notifications/{n.id}/read', headers=headers)
        assert resp.status_code == 200

        # Verify it's read now
        resp2 = client.get('/api/notifications?unread_only=true', headers=headers)
        assert resp2.get_json()['unread_count'] == 0

    def test_mark_all_read(self, client, admin_user, db_session):
        for i in range(3):
            db_session.session.add(Notification(
                user_id=admin_user.id, type='test', title=f'T{i}', message=f'M{i}'
            ))
        db_session.session.commit()

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post('/api/notifications/read-all', headers=headers)
        assert resp.status_code == 200

        resp2 = client.get('/api/notifications', headers=headers)
        assert resp2.get_json()['unread_count'] == 0

    def test_delete_notification(self, client, admin_user, db_session):
        n = Notification(user_id=admin_user.id, type='test', title='T', message='M')
        db_session.session.add(n)
        db_session.session.commit()
        nid = n.id

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.delete(f'/api/notifications/{nid}', headers=headers)
        assert resp.status_code == 200

    def test_requires_auth(self, client):
        resp = client.get('/api/notifications')
        assert resp.status_code == 401
