"""
The Overdue page's tabs and aging buckets.

The web table builds its rows from /api/overdue/{inspections,defects,reviews}
and filters them by the bucket the user clicks on /api/overdue/aging. These
tests pin the shapes that the page reads, and — the point of the fix — that a
bucket's count is exactly the number of listed items that fall in its range,
so clicking a bucket showing N gives a table of N.
"""
from datetime import date, datetime, timedelta

import pytest

from app.extensions import db
from app.models import (
    ChecklistTemplate, Defect, Inspection, InspectionAssignment, InspectionList,
    QualityReview, SpecialistJob, User,
)
from tests.conftest import get_auth_header, make_equipment


@pytest.fixture
def overdue_world(db_session, admin_user, mech_inspector, qe_user):
    """Inspections 2, 5, 10 and 20 days past their deadline, one on time,
    one completed, one critical defect whose 4h SLA broke 9 days ago, and a
    quality review pending for 2 days (normal SLA is 24h)."""
    eq = make_equipment(db_session, 'Overdue Crane', 'OD-001')
    il = InspectionList(shift='day', target_date=date.today() - timedelta(days=20),
                        status='generated', total_assets=1)
    db.session.add(il)
    db.session.flush()

    now = datetime.utcnow()

    def assignment(days_late, status='assigned'):
        a = InspectionAssignment(
            inspection_list_id=il.id, equipment_id=eq.id, shift='day',
            status=status, mechanical_inspector_id=mech_inspector.id,
            deadline=now - timedelta(days=days_late, hours=1),
        )
        db.session.add(a)
        return a

    for d in (2, 5, 10, 20):
        assignment(d)
    assignment(-3)                      # due in 3 days: not overdue
    assignment(30, status='completed')  # finished: not overdue

    template = ChecklistTemplate(name='OD Template', equipment_type='crane', version='OD')
    db.session.add(template)
    db.session.flush()
    insp = Inspection(equipment_id=eq.id, template_id=template.id,
                      technician_id=mech_inspector.id, status='submitted')
    db.session.add(insp)
    db.session.flush()
    db.session.add(Defect(
        inspection_id=insp.id, description='Hydraulic leak', severity='critical',
        status='open', due_date=date.today() - timedelta(days=8),
        created_at=now - timedelta(days=9, hours=2),
    ))
    db.session.flush()

    specialist = User(email='spec_od@test.com', full_name='OD Specialist',
                      role='specialist', role_id='SPE_OD', shift='day')
    specialist.set_password('test123')
    db.session.add(specialist)
    db.session.flush()
    defect = Defect.query.filter_by(inspection_id=insp.id).first()
    job = SpecialistJob(universal_id=9100, job_id='SPE_OD-001', specialist_id=specialist.id,
                        assigned_by=admin_user.id, defect_id=defect.id,
                        status='completed', category='minor')
    db.session.add(job)
    db.session.flush()
    db.session.add(QualityReview(job_type='specialist', job_id=job.id, qe_id=qe_user.id,
                                 status='pending', created_at=now - timedelta(days=2, hours=2)))
    db.session.commit()
    return eq


def _get(client, user_email, password, path, **params):
    h = get_auth_header(client, user_email, password)
    return client.get(f'/api/overdue{path}', query_string=params, headers=h)


def _in(bucket, days):
    return days >= bucket['min_days'] and (bucket['max_days'] is None or days <= bucket['max_days'])


@pytest.mark.parametrize('entity_type', ['all', 'inspections', 'defects', 'reviews'])
def test_aging_answers_for_every_tab(client, admin_user, overdue_world, entity_type):
    """Every tab's aging query returns 200 and the {buckets:[...]} shape the page reads.
    `all` and `inspections` used to 500 on a column that does not exist."""
    r = _get(client, admin_user.email, 'admin123', '/aging', type=entity_type)
    assert r.status_code == 200, r.get_json()
    data = r.get_json()['data']
    assert isinstance(data['buckets'], list) and data['buckets']
    for b in data['buckets']:
        assert set(b) >= {'name', 'label', 'min_days', 'max_days', 'count', 'color'}
    assert [b['name'] for b in data['buckets']] == ['1_3_days', '4_7_days', '8_14_days', '15_plus_days']


@pytest.mark.parametrize('entity_type', ['inspections', 'defects', 'reviews'])
def test_a_bucket_counts_exactly_the_rows_the_table_would_show(
        client, admin_user, overdue_world, entity_type):
    items = _get(client, admin_user.email, 'admin123', f'/{entity_type}').get_json()['data']
    buckets = _get(client, admin_user.email, 'admin123', '/aging',
                   type=entity_type).get_json()['data']['buckets']
    for b in buckets:
        assert b['count'] == sum(1 for i in items if _in(b, i['days_overdue'])), b['name']


def test_the_seeded_inspections_land_in_their_buckets(client, admin_user, overdue_world):
    buckets = _get(client, admin_user.email, 'admin123', '/aging',
                   type='inspections').get_json()['data']['buckets']
    assert {b['name']: b['count'] for b in buckets} == {
        '1_3_days': 1, '4_7_days': 1, '8_14_days': 1, '15_plus_days': 1,
    }


def test_all_is_the_sum_of_the_three_tabs(client, admin_user, overdue_world):
    def counts(t):
        bs = _get(client, admin_user.email, 'admin123', '/aging', type=t).get_json()['data']['buckets']
        return [b['count'] for b in bs]
    parts = [counts(t) for t in ('inspections', 'defects', 'reviews')]
    assert counts('all') == [sum(col) for col in zip(*parts)]
    assert sum(counts('defects')) == 1
    assert counts('reviews') == [1, 0, 0, 0]


def test_list_endpoints_carry_the_fields_the_table_reads(client, admin_user, overdue_world):
    insp = _get(client, admin_user.email, 'admin123', '/inspections').get_json()['data']
    assert len(insp) == 4
    for row in insp:
        assert row['type'] == 'inspection_assignment'
        assert set(row) >= {'id', 'equipment_id', 'equipment_name', 'mechanical_inspector_id',
                            'mechanical_inspector', 'electrical_inspector_id',
                            'electrical_inspector', 'status', 'deadline', 'days_overdue',
                            'risk_level'}

    defects = _get(client, admin_user.email, 'admin123', '/defects').get_json()['data']
    assert len(defects) == 1
    assert defects[0]['type'] == 'defect'
    assert set(defects[0]) >= {'id', 'description', 'severity', 'status', 'assigned_to_id',
                               'assigned_to', 'due_date', 'days_overdue', 'created_at'}

    reviews = _get(client, admin_user.email, 'admin123', '/reviews').get_json()['data']
    assert len(reviews) == 1
    assert reviews[0]['type'] == 'quality_review'
    assert reviews[0]['days_overdue'] == 2
    assert set(reviews[0]) >= {'id', 'job_type', 'job_id', 'qe_id', 'quality_engineer',
                               'status', 'sla_deadline', 'days_overdue'}


def test_an_engineer_is_refused_the_review_list(client, engineer, overdue_world):
    """The page is open to engineers but /reviews is not; the web table tolerates
    this refusal instead of failing the whole 'All' tab."""
    assert _get(client, engineer.email, 'test123', '/reviews').status_code == 403
    assert _get(client, engineer.email, 'test123', '/inspections').status_code == 200
    assert _get(client, engineer.email, 'test123', '/aging', type='all').status_code == 200
