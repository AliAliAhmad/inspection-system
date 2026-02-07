"""
Tests for equipment endpoints.
"""

from tests.conftest import get_auth_header
from app.models import Equipment


class TestEquipment:
    def _create_equipment(self, db_session):
        eq = Equipment(
            name='Test Pump',
            equipment_type='centrifugal_pump',
            serial_number='EQ-TEST-001',
            location='Building A',
            berth='east',
            status='active',
        )
        db_session.session.add(eq)
        db_session.session.commit()
        return eq

    def test_list_equipment(self, client, admin_user, db_session):
        self._create_equipment(db_session)
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/equipment', headers=headers)
        assert resp.status_code == 200

    def test_create_equipment(self, client, admin_user):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post('/api/equipment', json={
            'name': 'New Pump',
            'equipment_type': 'centrifugal_pump',
            'serial_number': 'EQ-NEW-001',
            'location': 'Building B',
            'berth': 'west',
        }, headers=headers)
        assert resp.status_code in (200, 201)

    def test_get_equipment(self, client, admin_user, db_session):
        eq = self._create_equipment(db_session)
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get(f'/api/equipment/{eq.id}', headers=headers)
        assert resp.status_code == 200

    def test_equipment_requires_auth(self, client):
        resp = client.get('/api/equipment')
        assert resp.status_code == 401
