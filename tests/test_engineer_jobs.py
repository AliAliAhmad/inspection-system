"""
Tests for engineer job system.
"""

from tests.conftest import get_auth_header, make_equipment
from app.models import EngineerJob, Equipment


class TestEngineerJobs:
    def test_create_engineer_job(self, client, engineer, admin_user, db_session):
        eq = make_equipment(db_session, 'Generator', 'GEN-001')
        db_session.session.commit()

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post('/api/engineer-jobs', json={
            'engineer_id': engineer.id,
            'equipment_id': eq.id,
            'job_type': 'custom_project',
            'title': 'Generator Overhaul',
            'description': 'Full system overhaul',
            'category': 'major',
            'major_reason': 'Scheduled maintenance',
        }, headers=headers)
        assert resp.status_code in (200, 201)

    def test_list_engineer_jobs(self, client, engineer):
        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get('/api/engineer-jobs', headers=headers)
        assert resp.status_code == 200


class TestEngineerJobModel:
    def test_job_creation(self, db_session, engineer):
        eq = make_equipment(db_session, 'Motor', 'MTR-001')

        job = EngineerJob(
            universal_id=9001,
            job_id='ENG001-001',
            engineer_id=engineer.id,
            equipment_id=eq.id,
            job_type='system_review',
            title='Annual System Review',
            description='Annual review of motor systems',
            status='assigned',
            category='minor',
        )
        db_session.session.add(job)
        db_session.session.commit()
        assert job.id is not None
        assert job.status == 'assigned'
