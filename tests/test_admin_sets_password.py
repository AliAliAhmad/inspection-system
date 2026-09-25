"""An admin sets a new password from Edit User (Ali, 2026-09-25).

He asked for a user's password. It cannot be read back — stored hashed — so the
fix is letting an admin SET a new one. The server always accepted `password` on
PUT /api/users/<id>; the Edit window had no box for it and nothing checked length.
"""

import pytest

from tests.conftest import get_auth_header
from app.extensions import db
from app.models import User


@pytest.fixture
def worker(db_session):
    u = User(email='ali.hm@test.com', username='ali.h.m', full_name='Ali H M',
             role='specialist', role_id='SPAHM1', shift='day')
    u.set_password('old-secret')
    db.session.add(u)
    db.session.commit()
    return u


def _put(client, admin_user, user, body):
    return client.put(f'/api/users/{user.id}', json=body,
                      headers=get_auth_header(client, admin_user.email, 'admin123'))


def test_admin_sets_a_new_password_and_he_can_log_in(client, admin_user, worker):
    assert _put(client, admin_user, worker, {'password': 'new-secret'}).status_code == 200
    r = client.post('/api/auth/login', json={'email': 'ali.hm@test.com', 'password': 'new-secret'})
    assert r.status_code == 200
    old = client.post('/api/auth/login', json={'email': 'ali.hm@test.com', 'password': 'old-secret'})
    assert old.status_code == 401


def test_an_empty_box_leaves_the_password_alone(client, admin_user, worker):
    assert _put(client, admin_user, worker, {'password': '', 'full_name': 'Ali H M'}).status_code == 200
    db.session.refresh(worker)
    assert worker.check_password('old-secret')


def test_too_short_is_refused_and_changes_nothing(client, admin_user, worker):
    r = _put(client, admin_user, worker, {'password': '123'})
    assert r.status_code == 400
    db.session.refresh(worker)
    assert worker.check_password('old-secret')


def test_only_an_admin_can_set_it(client, db_session, admin_user, worker):
    eng = User(email='eng.x@test.com', full_name='Eng', role='engineer', role_id='ENGX1', shift='day')
    eng.set_password('test123')
    db.session.add(eng)
    db.session.commit()
    r = client.put(f'/api/users/{worker.id}', json={'password': 'hijack-it'},
                   headers=get_auth_header(client, 'eng.x@test.com', 'test123'))
    assert r.status_code == 403
    db.session.refresh(worker)
    assert worker.check_password('old-secret')
