"""Smoke tests for checklist template CRUD."""

import pytest
from app.models import ChecklistTemplate, ChecklistItem
from tests.conftest import get_auth_header


def _template_payload(name, equipment_type, version):
    """Build a valid template creation payload with all required fields."""
    return {
        'name': name,
        'equipment_type': equipment_type,
        'function': 'Test Function',
        'assembly': 'Test Assembly',
        'description': f'Checklist for {name}',
        'version': version,
    }


class TestChecklists:
    def test_list_templates_empty(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/checklists', headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'success'
        assert data['data'] == []

    def test_create_template(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post('/api/checklists', headers=headers,
                           json=_template_payload('Pump Inspection v1', 'centrifugal_pump', '1.0'))
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['status'] == 'success'
        assert data['template']['name'] == 'Pump Inspection v1'

    def test_create_template_duplicate(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        # Create first
        client.post('/api/checklists', headers=headers,
                    json=_template_payload('Pump v1', 'centrifugal_pump', '1.0'))
        # Try duplicate (same equipment_type + version) — should be rejected
        resp = client.post('/api/checklists', headers=headers,
                           json=_template_payload('Pump v1 copy', 'centrifugal_pump', '1.0'))
        assert resp.status_code == 400

    def test_add_item_to_template(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        # Create template
        resp = client.post('/api/checklists', headers=headers,
                           json=_template_payload('Test Template', 'pump', '2.0'))
        template_id = resp.get_json()['template']['id']

        # Add item
        resp = client.post(f'/api/checklists/{template_id}/items', headers=headers, json={
            'question_text': 'Check for visible leaks',
            'answer_type': 'pass_fail',
            'order_index': 1,
            'critical_failure': True
        })
        assert resp.status_code == 201
        assert resp.get_json()['item']['question_text'] == 'Check for visible leaks'

    def test_update_item(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        # Create template + item
        resp = client.post('/api/checklists', headers=headers,
                           json=_template_payload('Update Test', 'motor', '1.0'))
        tid = resp.get_json()['template']['id']

        resp = client.post(f'/api/checklists/{tid}/items', headers=headers, json={
            'question_text': 'Original question',
            'answer_type': 'pass_fail',
            'order_index': 1
        })
        item_id = resp.get_json()['item']['id']

        # Update it
        resp = client.put(f'/api/checklists/{tid}/items/{item_id}', headers=headers, json={
            'question_text': 'Updated question'
        })
        assert resp.status_code == 200
        assert resp.get_json()['item']['question_text'] == 'Updated question'

    def test_delete_item(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post('/api/checklists', headers=headers,
                           json=_template_payload('Delete Test', 'crane', '1.0'))
        tid = resp.get_json()['template']['id']

        resp = client.post(f'/api/checklists/{tid}/items', headers=headers, json={
            'question_text': 'To be deleted',
            'answer_type': 'yes_no',
            'order_index': 1
        })
        item_id = resp.get_json()['item']['id']

        resp = client.delete(f'/api/checklists/{tid}/items/{item_id}', headers=headers)
        assert resp.status_code == 200

    def test_requires_auth(self, client):
        resp = client.get('/api/checklists')
        assert resp.status_code == 401

    def test_requires_admin(self, client, mech_inspector, db_session):
        headers = get_auth_header(client, 'mech@test.com', 'test123')
        resp = client.get('/api/checklists', headers=headers)
        assert resp.status_code == 403
