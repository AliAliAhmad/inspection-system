"""Smoke tests for sync API and health check endpoint."""

import pytest
from app.models import SyncQueue
from tests.conftest import get_auth_header


class TestHealth:
    def test_health_check(self, client, db_session):
        resp = client.get('/health')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'healthy'
        assert data['database'] == 'connected'
        assert 'timestamp' in data
        assert data['version'] == '2.0.0'

    def test_root_endpoint(self, client):
        resp = client.get('/')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'running'
        assert 'endpoints' in data


class TestSyncAPI:
    def test_submit_sync_item(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post('/api/sync', headers=headers, json={
            'entity_type': 'inspection',
            'entity_data': {'equipment_id': 1, 'answers': []}
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['status'] == 'success'
        assert data['data']['entity_type'] == 'inspection'

    def test_submit_sync_item_missing_fields(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post('/api/sync', headers=headers, json={})
        assert resp.status_code == 400

    def test_submit_batch(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post('/api/sync/batch', headers=headers, json={
            'items': [
                {'entity_type': 'inspection', 'entity_data': {'id': 1}},
                {'entity_type': 'job_timer', 'entity_data': {'job_id': 2, 'event': 'start'}},
            ]
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['data']['submitted'] == 2

    def test_get_pending_empty(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/sync/pending', headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'success'
        assert data['data'] == []

    def test_get_pending_after_submit(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        # Submit an item
        client.post('/api/sync', headers=headers, json={
            'entity_type': 'inspection',
            'entity_data': {'equipment_id': 5}
        })
        # Check pending
        resp = client.get('/api/sync/pending', headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data['data']) == 1
        assert data['data'][0]['entity_type'] == 'inspection'

    def test_requires_auth(self, client):
        resp = client.post('/api/sync', json={'entity_type': 'test', 'entity_data': {}})
        assert resp.status_code == 401
