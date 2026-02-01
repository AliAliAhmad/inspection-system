"""
CONTRACT / SCHEMA CHECKS
=========================
Lightweight response shape validation for key API endpoints.
Asserts that every response contains the required fields —
catches breaking API changes before they reach the frontend.
"""

import pytest
from tests.process.conftest import login


# ======================================================================
# Schema definitions: endpoint → required fields
# ======================================================================

AUTH_LOGIN_SCHEMA = {
    'access_token': str,
}

AUTH_ME_SCHEMA = {
    'user': dict,
}

USER_SCHEMA = {
    'id': int,
    'email': str,
    'full_name': str,
    'role': str,
}

EQUIPMENT_SCHEMA = {
    'id': int,
    'name': str,
    'serial_number': str,
    'status': str,
}

EQUIPMENT_LIST_SCHEMA = {
    'data': list,
}

CHECKLIST_LIST_SCHEMA = {
    'data': list,
}

CHECKLIST_ITEM_SCHEMA = {
    'id': int,
    'question_text': str,
    'answer_type': str,
}

INSPECTION_SCHEMA = {
    'id': int,
    'status': str,
    'equipment_id': int,
}

INSPECTION_LIST_SCHEMA = {
    'data': list,
}

INSPECTION_PROGRESS_SCHEMA = {
    'total_items': int,
    'answered_items': int,
    'is_complete': bool,
    'progress_percentage': (int, float),
}

ANSWER_SCHEMA = {
    'checklist_item_id': int,
    'answer_value': str,
}

DEFECT_SCHEMA = {
    'id': int,
    'status': str,
    'severity': str,
}

DEFECT_LIST_SCHEMA = {
    'data': list,
}

REPORT_DASHBOARD_SCHEMA = {
    'data': dict,
}


# ======================================================================
# Helpers
# ======================================================================

def assert_schema(data: dict, schema: dict, context: str):
    """
    Assert that `data` contains all keys from `schema` with the expected types.
    Provides clear error messages for each missing/mistyped field.
    """
    for key, expected_type in schema.items():
        assert key in data, (
            f'SCHEMA FAIL [{context}]: Missing required field "{key}". '
            f'Got keys: {list(data.keys())}'
        )
        if isinstance(expected_type, tuple):
            assert isinstance(data[key], expected_type), (
                f'SCHEMA FAIL [{context}]: Field "{key}" should be one of {expected_type}, '
                f'got {type(data[key]).__name__}'
            )
        else:
            assert isinstance(data[key], expected_type), (
                f'SCHEMA FAIL [{context}]: Field "{key}" should be {expected_type.__name__}, '
                f'got {type(data[key]).__name__}'
            )


# ======================================================================
# Tests
# ======================================================================

class TestAuthContracts:
    """Verify auth endpoint response shapes."""

    def test_login_response_schema(self, client, admin_user):
        resp = client.post('/api/auth/login', json={
            'email': 'admin@process-test.com',
            'password': 'Admin123!',
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert_schema(data, AUTH_LOGIN_SCHEMA, 'POST /api/auth/login')

    def test_me_response_schema(self, client, admin_user):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/auth/me', headers=header)
        assert resp.status_code == 200
        data = resp.get_json()
        assert_schema(data, AUTH_ME_SCHEMA, 'GET /api/auth/me')
        assert_schema(data['user'], USER_SCHEMA, 'GET /api/auth/me → user')


class TestEquipmentContracts:
    """Verify equipment endpoint response shapes."""

    def test_equipment_list_schema(self, client, admin_user, test_equipment):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/equipment', headers=header)
        assert resp.status_code == 200
        data = resp.get_json()
        assert_schema(data, EQUIPMENT_LIST_SCHEMA, 'GET /api/equipment')

        if data['data']:
            assert_schema(data['data'][0], EQUIPMENT_SCHEMA, 'GET /api/equipment → item')

    def test_equipment_detail_schema(self, client, admin_user, test_equipment):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get(f'/api/equipment/{test_equipment.id}', headers=header)
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'equipment' in data, 'SCHEMA FAIL: Equipment detail missing "equipment" key'
        assert_schema(data['equipment'], EQUIPMENT_SCHEMA, 'GET /api/equipment/:id')


class TestChecklistContracts:
    """Verify checklist endpoint response shapes."""

    def test_checklists_list_schema(self, client, admin_user, test_template):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/checklists', headers=header)
        assert resp.status_code == 200
        data = resp.get_json()
        assert_schema(data, CHECKLIST_LIST_SCHEMA, 'GET /api/checklists')

        if data['data']:
            tmpl = data['data'][0]
            assert 'items' in tmpl, 'SCHEMA FAIL: Template missing "items"'
            if tmpl['items']:
                assert_schema(
                    tmpl['items'][0],
                    CHECKLIST_ITEM_SCHEMA,
                    'GET /api/checklists → item',
                )


class TestInspectionContracts:
    """Verify inspection endpoint response shapes."""

    def test_inspection_start_schema(
        self, client, inspector_user, test_equipment, test_template, test_assignment,
    ):
        _, header = login(client, 'inspector@process-test.com', 'Inspect123!')
        resp = client.get(
            f'/api/inspections/by-assignment/{test_assignment.id}',
            headers=header,
        )
        assert resp.status_code in (200, 201)
        data = resp.get_json()
        assert 'data' in data, 'SCHEMA FAIL: by-assignment missing "data"'
        assert_schema(data['data'], INSPECTION_SCHEMA, 'GET by-assignment → inspection')

        assert 'checklist_items' in data['data'], 'SCHEMA FAIL: Inspection missing "checklist_items"'

    def test_inspection_progress_schema(
        self, client, inspector_user, test_equipment, test_template, test_assignment,
    ):
        _, header = login(client, 'inspector@process-test.com', 'Inspect123!')

        # Start inspection
        resp = client.get(
            f'/api/inspections/by-assignment/{test_assignment.id}',
            headers=header,
        )
        iid = resp.get_json()['data']['id']

        resp = client.get(f'/api/inspections/{iid}/progress', headers=header)
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'progress' in data, 'SCHEMA FAIL: Progress missing "progress"'
        assert_schema(data['progress'], INSPECTION_PROGRESS_SCHEMA, 'GET progress')

    def test_inspections_list_schema(self, client, admin_user):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/inspections', headers=header)
        assert resp.status_code == 200
        data = resp.get_json()
        assert_schema(data, INSPECTION_LIST_SCHEMA, 'GET /api/inspections')


class TestDefectContracts:
    """Verify defect endpoint response shapes."""

    def test_defects_list_schema(self, client, admin_user):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/defects', headers=header)
        assert resp.status_code == 200
        data = resp.get_json()
        assert_schema(data, DEFECT_LIST_SCHEMA, 'GET /api/defects')


class TestReportContracts:
    """Verify report endpoint response shapes."""

    def test_admin_dashboard_schema(self, client, admin_user):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/reports/admin-dashboard', headers=header)
        assert resp.status_code == 200
        data = resp.get_json()
        assert_schema(data, REPORT_DASHBOARD_SCHEMA, 'GET /api/reports/admin-dashboard')

    def test_defect_analytics_schema(self, client, admin_user):
        _, header = login(client, 'admin@process-test.com', 'Admin123!')
        resp = client.get('/api/reports/defect-analytics', headers=header)
        assert resp.status_code == 200
