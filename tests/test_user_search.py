"""Searching the Users page.

Ali, 2026-09-24: "i try to find a user in the user page or shows error or nothing
showing". The search filtered on `User.employee_id`, which is not a column — the
employee number is `role_id`, only serialised as 'employee_id'. Every search was an
AttributeError, so the page said "Error loading data" whatever was typed.
"""

import pytest

from tests.conftest import get_auth_header
from app.extensions import db
from app.models import User


@pytest.fixture
def people(db_session):
    rows = [
        dict(email='ali.k@test.com', username='alik', full_name='Ali Kadhim Abbas',
             full_name_ar='علي كاظم عباس', role='specialist', role_id='SP0101',
             sap_id='700123', phone='07701234567'),
        dict(email='ali.h@test.com', username='alih', full_name='Ali Hassan Jaber',
             role='maintenance', role_id='MT0202'),
        dict(email='omar@test.com', username='omar', full_name='Omar Saleh',
             role='inspector', role_id='IN0303'),
    ]
    for r in rows:
        u = User(shift='day', **r)
        u.set_password('test123')
        db.session.add(u)
    db.session.commit()


def _search(client, admin_user, text):
    h = get_auth_header(client, admin_user.email, 'admin123')
    r = client.get('/api/users', query_string={'search': text}, headers=h)
    assert r.status_code == 200, r.get_json()
    return {u['full_name'] for u in r.get_json()['data']}


@pytest.mark.parametrize('typed, expected', [
    ('ali', {'Ali Kadhim Abbas', 'Ali Hassan Jaber'}),   # English name
    ('علي', {'Ali Kadhim Abbas'}),                       # Arabic name
    ('SP0101', {'Ali Kadhim Abbas'}),                    # employee number (role_id)
    ('omar@test', {'Omar Saleh'}),                       # email
    ('alih', {'Ali Hassan Jaber'}),                      # username
    ('700123', {'Ali Kadhim Abbas'}),                    # SAP id
    ('0770123', {'Ali Kadhim Abbas'}),                   # phone
])
def test_every_field_a_person_would_type_finds_him(client, admin_user, people,
                                                   typed, expected):
    assert _search(client, admin_user, typed) == expected


def test_a_search_never_errors(client, admin_user, people):
    """THE bug: this was a 500 for any text at all."""
    assert _search(client, admin_user, 'nobody-by-this-name') == set()


def test_spaces_around_the_text_are_ignored(client, admin_user, people):
    assert _search(client, admin_user, '  omar  ') == {'Omar Saleh'}
