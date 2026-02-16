"""
Tests for specialist job workflow including pause, takeover, and quality review.
"""

from tests.conftest import get_auth_header, make_equipment
from app.models import (
    SpecialistJob, Defect, Equipment, PauseLog, Inspection, ChecklistTemplate
)
from datetime import datetime, date, timedelta


def _create_defect_and_job(db_session, specialist, admin_user):
    """Helper to create equipment, template, inspection, defect, and specialist job."""
    eq = make_equipment(db_session, 'Job Pump', f'JP-{specialist.id}')

    template = ChecklistTemplate(
        name='Test Template',
        equipment_type='centrifugal_pump',
        version=f'1.{specialist.id}',
    )
    db_session.session.add(template)
    db_session.session.flush()

    insp = Inspection(
        equipment_id=eq.id,
        template_id=template.id,
        technician_id=specialist.id,
        status='submitted',
    )
    db_session.session.add(insp)
    db_session.session.flush()

    defect = Defect(
        inspection_id=insp.id,
        description='Bearing worn out',
        severity='high',
        status='open',
        due_date=date.today() + timedelta(days=7),
    )
    db_session.session.add(defect)
    db_session.session.flush()

    job = SpecialistJob(
        universal_id=100 + specialist.id,
        job_id=f'SPE{specialist.id:03d}-001',
        specialist_id=specialist.id,
        assigned_by=admin_user.id,
        defect_id=defect.id,
        status='assigned',
        category='minor',
    )
    db_session.session.add(job)
    db_session.session.commit()
    return eq, defect, job


class TestSpecialistJobs:
    def test_list_active_jobs(self, client, specialist, admin_user, db_session):
        _create_defect_and_job(db_session, specialist, admin_user)
        headers = get_auth_header(client, 'spec@test.com', 'test123')
        resp = client.get('/api/jobs/active', headers=headers)
        assert resp.status_code == 200

    def test_planned_time_entry(self, client, specialist, admin_user, db_session):
        _, _, job = _create_defect_and_job(db_session, specialist, admin_user)
        headers = get_auth_header(client, 'spec@test.com', 'test123')
        resp = client.post(f'/api/jobs/{job.id}/planned-time', json={
            'planned_time_hours': 24,
        }, headers=headers)
        assert resp.status_code == 200

    def test_start_job(self, client, specialist, admin_user, db_session):
        _, _, job = _create_defect_and_job(db_session, specialist, admin_user)
        job.planned_time_hours = 24
        db_session.session.commit()

        headers = get_auth_header(client, 'spec@test.com', 'test123')
        resp = client.post(f'/api/jobs/{job.id}/start', headers=headers, json={})
        assert resp.status_code == 200

    def test_pause_request(self, client, specialist, admin_user, db_session):
        _, _, job = _create_defect_and_job(db_session, specialist, admin_user)
        job.status = 'in_progress'
        job.started_at = datetime.utcnow()
        db_session.session.commit()

        headers = get_auth_header(client, 'spec@test.com', 'test123')
        resp = client.post(f'/api/jobs/{job.id}/pause', json={
            'reason_category': 'parts',
            'reason_details': 'Waiting for bearing delivery',
        }, headers=headers)
        assert resp.status_code in (200, 201)


class TestPauseWorkflow:
    def test_pause_log_model(self, db_session, specialist):
        log = PauseLog(
            job_type='specialist',
            job_id=1,
            requested_by=specialist.id,
            reason_category='parts',
            reason_details='Waiting for parts',
            status='pending',
        )
        db_session.session.add(log)
        db_session.session.commit()
        assert log.id is not None
        assert log.status == 'pending'


class TestJobTakeover:
    def test_stalled_job_detection(self, db_session, specialist, admin_user):
        _, _, job = _create_defect_and_job(db_session, specialist, admin_user)
        job.status = 'paused'
        job.paused_at = datetime.utcnow() - timedelta(days=4)
        db_session.session.commit()

        from app.services.takeover_service import TakeoverService
        stalled = TakeoverService.get_stalled_jobs()
        assert len(stalled) >= 1
