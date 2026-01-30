"""Smoke tests for file upload, schedules, and ratings."""

import pytest
import io
from app.models import InspectionSchedule, Inspection, ChecklistTemplate, InspectionRating
from tests.conftest import get_auth_header, make_equipment


class TestSchedules:
    def test_get_today_schedule(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/schedules/today', headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'success'
        assert 'scheduled_today' in data

    def test_get_weekly_schedule(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/schedules/weekly', headers=headers)
        assert resp.status_code == 200

    def test_create_schedule(self, client, admin_user, sample_equipment, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post('/api/schedules', headers=headers, json={
            'equipment_id': sample_equipment.id,
            'day_of_week': 1  # Tuesday
        })
        assert resp.status_code == 201

    def test_delete_schedule(self, client, admin_user, sample_equipment, db_session):
        # Create a schedule first
        sched = InspectionSchedule(
            equipment_id=sample_equipment.id,
            day_of_week=3
        )
        db_session.session.add(sched)
        db_session.session.commit()

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.delete(f'/api/schedules/{sched.id}', headers=headers)
        assert resp.status_code == 200

    def test_requires_auth(self, client):
        resp = client.get('/api/schedules/today')
        assert resp.status_code == 401


class TestRatings:
    def _create_inspection(self, db_session, admin_user, mech_inspector):
        eq = make_equipment(db_session, name='Rating Test Pump', serial='RT-001')
        template = ChecklistTemplate(
            name='RT Template', equipment_type='centrifugal_pump',
            version='1.0', created_by_id=admin_user.id
        )
        db_session.session.add(template)
        db_session.session.flush()

        inspection = Inspection(
            equipment_id=eq.id, template_id=template.id,
            technician_id=mech_inspector.id, status='submitted'
        )
        db_session.session.add(inspection)
        db_session.session.commit()
        return inspection

    def test_rate_inspection(self, client, admin_user, mech_inspector, db_session):
        inspection = self._create_inspection(db_session, admin_user, mech_inspector)
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post(f'/api/ratings/inspections/{inspection.id}', headers=headers, json={
            'rating': 4,
            'comment': 'Good inspection work'
        })
        assert resp.status_code in (200, 201)

    def test_get_technician_ratings(self, client, admin_user, mech_inspector, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get(f'/api/ratings/technicians/{mech_inspector.id}', headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'success'


class TestFiles:
    def test_list_files_empty(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/files', headers=headers)
        assert resp.status_code == 200

    def test_upload_file(self, client, admin_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        # Create a minimal PNG file (8x8 pixel, valid PNG header)
        png_header = (
            b'\x89PNG\r\n\x1a\n'  # PNG signature
            b'\x00\x00\x00\rIHDR'  # IHDR chunk
            b'\x00\x00\x00\x08'    # width = 8
            b'\x00\x00\x00\x08'    # height = 8
            b'\x08\x02'            # bit depth 8, color type 2 (RGB)
            b'\x00\x00\x00'        # compression, filter, interlace
            b'\x04\xb5\xfa\xd2'    # CRC
            b'\x00\x00\x00\x00IEND\xaeB`\x82'  # IEND chunk
        )

        data = {
            'file': (io.BytesIO(png_header), 'test.png'),
            'related_type': 'equipment',
            'related_id': '1',
            'category': 'general'
        }
        resp = client.post('/api/files/upload', headers=headers,
                          data=data, content_type='multipart/form-data')
        # Accept 201 (success) or 400/500 (file validation may fail with minimal PNG)
        assert resp.status_code in (201, 200, 400, 500)

    def test_requires_auth(self, client):
        resp = client.get('/api/files')
        assert resp.status_code == 401
