"""Web filters fixed in the 2026-09-24 audit — one test per fix.

Ali: "check all the filter that can be used by a user, confirm they are linked
and working and fix the ones not working".
"""

from datetime import date, timedelta

import pytest

from tests.conftest import get_auth_header, make_equipment
from app.extensions import db
from app.models import (ChecklistTemplate, Defect, EngineerJob, Inspection, Leave,
                        Material, User)


def _user(email, role, name):
    u = User(email=email, full_name=name, role=role,
             role_id=email.split('@')[0].upper()[:12], shift='day')
    u.set_password('test123')
    db.session.add(u)
    db.session.commit()
    return u


def _h(client, user):
    pw = 'admin123' if user.email == 'admin@test.com' else 'test123'
    return get_auth_header(client, user.email, pw)


# ─── Materials → Reservations tab (the list route did not exist) ─────────────

class TestReservations:

    @pytest.fixture
    def reserved(self, db_session, admin_user):
        from app.models.stock_reservation import StockReservation
        m = Material(code='FLT-1', name='Hydraulic filter', category='filter',
                     unit='pcs', current_stock=10)
        db.session.add(m)
        db.session.flush()
        for status in ('active', 'fulfilled'):
            db.session.add(StockReservation(material_id=m.id, quantity=2,
                                            reservation_type='manual',
                                            reserved_by_id=admin_user.id, status=status))
        db.session.commit()
        return m

    def test_all_reservations_are_listed_with_names(self, client, admin_user, reserved):
        r = client.get('/api/materials/reservations', headers=_h(client, admin_user))
        assert r.status_code == 200, r.get_json()
        rows = r.get_json()['reservations']
        assert len(rows) == 2
        assert rows[0]['material_name'] == 'Hydraulic filter'
        assert rows[0]['reserved_by'] == admin_user.full_name

    def test_status_narrows(self, client, admin_user, reserved):
        r = client.get('/api/materials/reservations', query_string={'status': 'active'},
                       headers=_h(client, admin_user))
        assert [x['status'] for x in r.get_json()['reservations']] == ['active']

    def test_one_materials_reservations(self, client, admin_user, reserved):
        r = client.get(f'/api/materials/{reserved.id}/reservations',
                       headers=_h(client, admin_user))
        assert r.status_code == 200 and r.get_json()['count'] == 2


# ─── Leaves → "My Leaves" showed an admin everyone's ─────────────────────────

def test_my_leaves_is_mine_even_for_an_admin(client, db_session, admin_user):
    other = _user('worker@test.com', 'specialist', 'A Worker')
    for uid in (admin_user.id, other.id):
        db.session.add(Leave(user_id=uid, leave_type='annual', date_from=date.today(),
                             date_to=date.today(), total_days=1, status='pending'))
    db.session.commit()
    h = _h(client, admin_user)
    everyone = client.get('/api/leaves', headers=h).get_json()['data']
    mine = client.get('/api/leaves', query_string={'mine': 'true'}, headers=h).get_json()['data']
    assert len(everyone) == 2
    assert [l['user_id'] for l in mine] == [admin_user.id]


def test_pending_leaves_come_from_the_list_route(client, db_session, admin_user):
    """Approvals asked /api/leaves/pending, which does not exist."""
    db.session.add(Leave(user_id=admin_user.id, leave_type='annual', date_from=date.today(),
                         date_to=date.today(), total_days=1, status='pending'))
    db.session.add(Leave(user_id=admin_user.id, leave_type='annual',
                         date_from=date.today() + timedelta(days=9),
                         date_to=date.today() + timedelta(days=9), total_days=1,
                         status='approved'))
    db.session.commit()
    r = client.get('/api/leaves', query_string={'status': 'pending'}, headers=_h(client, admin_user))
    assert [l['status'] for l in r.get_json()['data']] == ['pending']


# ─── Engineer "My Jobs" showed an admin every engineer's jobs ────────────────

def test_admin_my_jobs_is_narrowed_by_engineer_id(client, db_session, admin_user):
    eng = _user('eng1@test.com', 'engineer', 'Eng One')
    eq = make_equipment(db_session, 'Motor', 'MTR-9')
    for n, owner in enumerate((admin_user.id, eng.id)):
        db.session.add(EngineerJob(universal_id=9100 + n, job_id=f'ENG9-{n}', engineer_id=owner,
                                   equipment_id=eq.id, job_type='system_review',
                                   title=f'Job {n}', description='d', status='assigned',
                                   category='minor'))
    db.session.commit()
    r = client.get('/api/engineer-jobs', query_string={'engineer_id': admin_user.id},
                   headers=_h(client, admin_user))
    assert [j['engineer_id'] for j in r.get_json()['data']] == [admin_user.id]


# ─── Job pool: the Defects tab ignored the berth ─────────────────────────────

def test_pool_defects_follow_the_chosen_berth(client, db_session, admin_user):
    template = ChecklistTemplate(name='T', equipment_type='centrifugal_pump', version='pb1')
    db.session.add(template)
    db.session.flush()
    east = make_equipment(db_session, 'EAST-1', 'E1')
    west = make_equipment(db_session, 'WEST-1', 'W1')
    west.berth = 'west'
    for eq in (east, west):
        insp = Inspection(equipment_id=eq.id, template_id=template.id,
                          technician_id=admin_user.id, status='submitted')
        db.session.add(insp)
        db.session.flush()
        db.session.add(Defect(inspection_id=insp.id, description=f'leak on {eq.name}',
                              severity='high', category='mechanical', status='open',
                              due_date=date.today() + timedelta(days=3)))
    db.session.commit()
    r = client.get('/api/work-plans/available-jobs',
                   query_string={'berth': 'east', 'job_type': 'defect'},
                   headers=_h(client, admin_user))
    assert r.status_code == 200, r.get_json()
    names = {j['equipment']['name'] for j in r.get_json()['defect_jobs']}
    assert names == {'EAST-1'}


# ─── Checklists: equipment type needed an exact, case-sensitive match ────────

def test_checklist_type_filter_finds_partial_and_listed_types(client, db_session, admin_user):
    for n, typ in enumerate(('STS Crane', 'reach_stacker, crane_mobile', 'centrifugal_pump')):
        db.session.add(ChecklistTemplate(name=f'T{n}', equipment_type=typ, version=f'ck{n}'))
    db.session.commit()
    # The Checklists page filters through /search (the plain list ignores filters).
    r = client.get('/api/checklists/search', query_string={'equipment_type': 'crane'},
                   headers=_h(client, admin_user))
    assert r.status_code == 200, r.get_json()
    assert {t['equipment_type'] for t in r.get_json()['templates']} == {
        'STS Crane', 'reach_stacker, crane_mobile'}


# ─── Equipment dashboard: fields the filters need, and honest card counts ────

def test_equipment_dashboard_carries_what_its_filters_read(client, db_session, admin_user):
    a = make_equipment(db_session, 'RS109', 'SER-109')
    a.last_risk_score = 80
    b = make_equipment(db_session, 'RS110', 'SER-110')
    b.status = 'stopped'
    template = ChecklistTemplate(name='T', equipment_type='centrifugal_pump', version='dash1')
    db.session.add(template)
    db.session.flush()
    db.session.add(Inspection(equipment_id=a.id, template_id=template.id,
                              technician_id=admin_user.id, status='submitted'))
    db.session.commit()

    h = _h(client, admin_user)
    data = client.get('/api/equipment/dashboard', headers=h).get_json()['data']
    items = {e['name']: e for g in data['groups'] for e in g['equipment']}
    assert items['RS109']['risk_level'] == 'critical'
    assert items['RS109']['last_inspection_date'] is not None
    assert items['RS110']['last_inspection_date'] is None
    assert items['RS109']['serial_number'] == 'SER-109'

    # Picking red must not zero the other cards.
    red = client.get('/api/equipment/dashboard', query_string={'status_color': 'red'},
                     headers=h).get_json()['data']
    assert red['summary'] == data['summary']
    assert {e['name'] for g in red['groups'] for e in g['equipment']} == {'RS110'}


# ─── Equipment list: health cards filter what they count ─────────────────────

def test_equipment_list_takes_several_statuses_and_card_ids(client, db_session, admin_user):
    a = make_equipment(db_session, 'M1', 'S-M1'); a.status = 'under_maintenance'
    b = make_equipment(db_session, 'M2', 'S-M2'); b.status = 'paused'
    c = make_equipment(db_session, 'M3', 'S-M3')
    db.session.commit()
    h = _h(client, admin_user)
    maint = client.get('/api/equipment', query_string={'status': 'under_maintenance,paused'},
                       headers=h).get_json()['data']
    assert {e['name'] for e in maint} == {'M1', 'M2'}
    picked = client.get('/api/equipment', query_string={'ids': f'{a.id},{c.id}'},
                        headers=h).get_json()['data']
    assert {e['name'] for e in picked} == {'M1', 'M3'}


def test_equipment_search_finds_arabic_and_partial_type(client, db_session, admin_user):
    eq = make_equipment(db_session, 'RS109', 'S-RS109')
    eq.name_ar = 'رافعة'
    eq.equipment_type = 'REACHSTACKER'
    db.session.commit()
    h = _h(client, admin_user)
    ar = client.get('/api/equipment', query_string={'search': 'رافعة'}, headers=h).get_json()['data']
    typ = client.get('/api/equipment', query_string={'equipment_type': 'reach'}, headers=h).get_json()['data']
    assert [e['name'] for e in ar] == ['RS109']
    assert [e['name'] for e in typ] == ['RS109']
