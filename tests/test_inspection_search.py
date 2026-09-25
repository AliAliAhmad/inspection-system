"""The All Inspections search box — found ignoring what was typed (2026-09-24 audit).

It only understood keywords (fail, pass, today, pump ...). A machine name, serial
or code with no keyword returned the latest 50 inspections, unfiltered.
"""

import pytest

from tests.conftest import get_auth_header, make_equipment
from app.models import ChecklistTemplate, Inspection


@pytest.fixture
def two_machines(db_session, admin_user):
    template = ChecklistTemplate(name='T', equipment_type='centrifugal_pump', version='s1')
    db_session.session.add(template)
    db_session.session.flush()
    rs = make_equipment(db_session, 'RS109 Reach Stacker', 'SER-RS109')
    rs.name_ar = 'رافعة الحاويات'
    ec = make_equipment(db_session, 'ECH02 Empty Handler', 'SER-ECH02')
    for eq, result in ((rs, 'fail'), (ec, 'pass')):
        db_session.session.add(Inspection(equipment_id=eq.id, template_id=template.id,
                                          technician_id=admin_user.id,
                                          status='submitted', result=result))
    db_session.session.commit()


def _found(client, admin_user, q):
    h = get_auth_header(client, admin_user.email, 'admin123')
    r = client.get('/api/inspections/search', query_string={'q': q}, headers=h)
    assert r.status_code == 200, r.get_json()
    return {i['equipment']['name'] if i.get('equipment') else i['equipment_id']
            for i in r.get_json()['data']}


def test_a_machine_name_alone_finds_that_machine(client, admin_user, two_machines):
    assert _found(client, admin_user, 'RS109') == {'RS109 Reach Stacker'}


def test_the_serial_finds_it(client, admin_user, two_machines):
    assert _found(client, admin_user, 'SER-ECH02') == {'ECH02 Empty Handler'}


def test_arabic_name_finds_it(client, admin_user, two_machines):
    assert _found(client, admin_user, 'رافعة') == {'RS109 Reach Stacker'}


def test_keywords_still_work_with_a_name(client, admin_user, two_machines):
    assert _found(client, admin_user, 'failed ECH02') == set()
    assert _found(client, admin_user, 'failed RS109') == {'RS109 Reach Stacker'}


def test_keywords_alone_still_work(client, admin_user, two_machines):
    assert _found(client, admin_user, 'failed inspections') == {'RS109 Reach Stacker'}
