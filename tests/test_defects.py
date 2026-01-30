"""Smoke tests for defect and defect assessment endpoints."""

import pytest
from datetime import date, timedelta
from app.models import Defect, Inspection, ChecklistTemplate, ChecklistItem, DefectAssessment, SpecialistJob
from app.extensions import db
from tests.conftest import get_auth_header, make_equipment


def _create_defect(db_session, admin_user, mech_inspector):
    """Helper: create equipment -> template -> inspection -> defect chain."""
    eq = make_equipment(db_session, name='Defect Test Pump', serial='DT-001')

    template = ChecklistTemplate(
        name='Test Template', equipment_type='centrifugal_pump',
        version='1.0', created_by_id=admin_user.id
    )
    db_session.session.add(template)
    db_session.session.flush()

    item = ChecklistItem(
        template_id=template.id, question_text='Check for leaks',
        answer_type='pass_fail', order_index=1, critical_failure=True
    )
    db_session.session.add(item)
    db_session.session.flush()

    inspection = Inspection(
        equipment_id=eq.id, template_id=template.id,
        technician_id=mech_inspector.id, status='submitted'
    )
    db_session.session.add(inspection)
    db_session.session.flush()

    defect = Defect(
        inspection_id=inspection.id,
        checklist_item_id=item.id,
        severity='medium',
        description='Leak detected on seal',
        status='open',
        assigned_to_id=mech_inspector.id,
        due_date=date.today() + timedelta(days=7),
    )
    db_session.session.add(defect)
    db_session.session.commit()
    return defect, eq


class TestDefects:
    def test_list_defects_admin(self, client, admin_user, mech_inspector, db_session):
        defect, _ = _create_defect(db_session, admin_user, mech_inspector)
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/defects', headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'success'
        assert len(data['defects']) >= 1

    def test_list_defects_filter_severity(self, client, admin_user, mech_inspector, db_session):
        _create_defect(db_session, admin_user, mech_inspector)
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/defects?severity=medium', headers=headers)
        assert resp.status_code == 200
        assert len(resp.get_json()['defects']) >= 1

    def test_resolve_defect(self, client, admin_user, mech_inspector, db_session):
        defect, _ = _create_defect(db_session, admin_user, mech_inspector)
        headers = get_auth_header(client, 'mech@test.com', 'test123')
        resp = client.post(f'/api/defects/{defect.id}/resolve', headers=headers, json={
            'resolution_notes': 'Replaced the seal gasket'
        })
        assert resp.status_code == 200

    def test_close_defect_admin(self, client, admin_user, mech_inspector, db_session):
        defect, _ = _create_defect(db_session, admin_user, mech_inspector)
        defect.status = 'resolved'
        db_session.session.commit()

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post(f'/api/defects/{defect.id}/close', headers=headers)
        assert resp.status_code == 200

    def test_requires_auth(self, client):
        resp = client.get('/api/defects')
        assert resp.status_code == 401


class TestDefectAssessments:
    def test_list_assessments(self, client, specialist, admin_user, mech_inspector, db_session):
        headers = get_auth_header(client, 'spec@test.com', 'test123')
        resp = client.get('/api/defect-assessments', headers=headers)
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'success'

    def test_create_assessment_confirm(self, client, specialist, admin_user, mech_inspector, db_session):
        defect, eq = _create_defect(db_session, admin_user, mech_inspector)

        # Create a specialist job linked to the defect
        job = SpecialistJob(
            universal_id=1, job_id='SPE001-001',
            defect_id=defect.id, specialist_id=specialist.id,
            assigned_by=admin_user.id, status='assigned'
        )
        db_session.session.add(job)
        db_session.session.commit()

        headers = get_auth_header(client, 'spec@test.com', 'test123')
        resp = client.post('/api/defect-assessments', headers=headers, json={
            'defect_id': defect.id,
            'verdict': 'confirm',
            'technical_notes': 'Confirmed: visible leak at pump seal'
        })
        assert resp.status_code == 201
        assert resp.get_json()['data']['verdict'] == 'confirm'
