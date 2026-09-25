"""Inspection Assignments page filters (2026-09-24 audit).

The endpoint took the 50 newest lists FIRST and filtered inside them, so a status
or berth filter never reached an older list. And "In Progress" could not find the
half-done states (mech_complete, elec_complete, both_complete).
"""

from datetime import date, timedelta

import pytest

from tests.conftest import get_auth_header, make_equipment
from app.extensions import db
from app.models import InspectionAssignment, InspectionList


@pytest.fixture
def sixty_days(db_session):
    """60 daily lists. Only the OLDEST holds a 'completed' assignment; one recent
    list holds a 'mech_complete' one."""
    eq = make_equipment(db_session, 'P1', 'P1')
    for i in range(60):
        il = InspectionList(shift='day', target_date=date.today() - timedelta(days=i),
                            status='generated', total_assets=1)
        db.session.add(il)
        db.session.flush()
        status = 'completed' if i == 59 else ('mech_complete' if i == 3 else 'unassigned')
        db.session.add(InspectionAssignment(inspection_list_id=il.id, equipment_id=eq.id,
                                            shift='day', status=status, berth='east'))
    db.session.commit()


def _lists(client, admin_user, **params):
    h = get_auth_header(client, admin_user.email, 'admin123')
    r = client.get('/api/inspection-assignments/lists', query_string=params, headers=h)
    assert r.status_code == 200, r.get_json()
    return r.get_json()['data']


def test_an_old_match_beyond_the_newest_50_is_found(client, admin_user, sixty_days):
    got = _lists(client, admin_user, status='completed')
    assert len(got) == 1
    assert got[0]['target_date'] == (date.today() - timedelta(days=59)).isoformat()


def test_in_progress_includes_the_half_done_states(client, admin_user, sixty_days):
    got = _lists(client, admin_user, status='in_progress,mech_complete,elec_complete,both_complete')
    assert [a['status'] for l in got for a in l['assignments']] == ['mech_complete']


def test_no_filter_still_gives_the_newest_50(client, admin_user, sixty_days):
    assert len(_lists(client, admin_user)) == 50
