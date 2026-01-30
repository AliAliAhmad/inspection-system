"""
Tests for quality engineer review workflow.
"""

from tests.conftest import get_auth_header, make_equipment
from app.models import (
    QualityReview, SpecialistJob, Defect, Inspection,
    ChecklistTemplate, User
)
from datetime import datetime, date, timedelta


def _create_review_with_job(db_session, qe_user):
    """Create a full review with a real specialist job behind it."""
    # We need: equipment -> template -> inspection -> defect -> specialist_job -> review
    specialist = User(
        email='spec_qr@test.com', full_name='QR Specialist',
        role='specialist', role_id='SPE_QR', shift='day',
    )
    specialist.set_password('test123')
    db_session.session.add(specialist)
    db_session.session.flush()

    admin = User.query.filter_by(role='admin').first()
    if not admin:
        admin = specialist  # fallback

    eq = make_equipment(db_session, 'QR Pump', 'QR-001')

    template = ChecklistTemplate(
        name='QR Template', equipment_type='centrifugal_pump', version='QR',
    )
    db_session.session.add(template)
    db_session.session.flush()

    insp = Inspection(
        equipment_id=eq.id, template_id=template.id,
        technician_id=specialist.id, status='submitted',
    )
    db_session.session.add(insp)
    db_session.session.flush()

    defect = Defect(
        inspection_id=insp.id, description='QR defect',
        severity='medium', status='open',
        due_date=date.today() + timedelta(days=7),
    )
    db_session.session.add(defect)
    db_session.session.flush()

    job = SpecialistJob(
        universal_id=9000, job_id='SPE_QR-001',
        specialist_id=specialist.id, assigned_by=admin.id,
        defect_id=defect.id, status='completed', category='minor',
    )
    db_session.session.add(job)
    db_session.session.flush()

    review = QualityReview(
        job_type='specialist', job_id=job.id,
        qe_id=qe_user.id, status='pending',
        sla_deadline=datetime.utcnow() + timedelta(hours=48),
    )
    db_session.session.add(review)
    db_session.session.commit()
    return review, job


class TestQualityReviews:
    def test_list_pending_reviews(self, client, qe_user, db_session):
        _create_review_with_job(db_session, qe_user)
        headers = get_auth_header(client, 'qe@test.com', 'test123')
        resp = client.get('/api/quality-reviews/pending', headers=headers)
        assert resp.status_code == 200

    def test_approve_review(self, client, qe_user, db_session):
        review, _ = _create_review_with_job(db_session, qe_user)
        headers = get_auth_header(client, 'qe@test.com', 'test123')
        resp = client.post(f'/api/quality-reviews/{review.id}/approve', json={
            'qc_rating': 5,
            'notes': 'Good work',
        }, headers=headers)
        assert resp.status_code == 200

    def test_reject_review(self, client, qe_user, db_session):
        review, _ = _create_review_with_job(db_session, qe_user)
        headers = get_auth_header(client, 'qe@test.com', 'test123')
        resp = client.post(f'/api/quality-reviews/{review.id}/reject', json={
            'rejection_reason': 'The work was not completed properly and several items were left unfinished',
            'rejection_category': 'incomplete_work',
        }, headers=headers)
        assert resp.status_code == 200

    def test_overdue_reviews(self, client, admin_user, qe_user, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/quality-reviews/overdue', headers=headers)
        assert resp.status_code == 200


class TestQualityReviewModel:
    def test_review_creation(self, db_session, qe_user):
        review = QualityReview(
            job_type='engineer', job_id=1,
            qe_id=qe_user.id, status='pending',
            sla_deadline=datetime.utcnow() + timedelta(hours=48),
        )
        db_session.session.add(review)
        db_session.session.commit()
        assert review.id is not None
        assert review.status == 'pending'
