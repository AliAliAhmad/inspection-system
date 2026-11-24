"""start.sh runs on EVERY Render boot — it must never set a password.

Until 2026-11-25 it (1) created admin@company.com / admin123, a sample account
whose password is in the code, and (2) reset every user's password to their SAP
id on every boot — a one-time go-live step from 2026-02-21 that was never taken
out, so each deploy wiped every password people had chosen.

These tests run the REAL boot block out of start.sh (as bash would pass it)
against the test database.
"""

import pathlib
import re

import pytest

from app.extensions import db
from app.models import User

ROOT = pathlib.Path(__file__).resolve().parents[1]
START_SH = (ROOT / 'start.sh').read_text(encoding='utf-8')


def _boot_block():
    blocks = re.findall(r'python -c "\n(.*?)\n"\n', START_SH, re.S)
    block = next(b for b in blocks if 'admin@company.com' in b)
    block = block.replace('\\"', '"').replace('\\$', '$')
    # Same code, test app instead of production; reuse the test's app context.
    block = block.replace("app = create_app('production')\nwith app.app_context():",
                          'if True:')
    return block


def _run_boot_block():
    exec(compile(_boot_block(), 'start.sh boot block', 'exec'), {})


def _user(email, password, sap_id=None, role='maintenance', active=True):
    user = User(email=email, full_name=email.split('@')[0], role=role,
                role_id=f'T-{email}', sap_id=sap_id, is_active=active)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return user


def test_start_sh_sets_no_password_and_creates_no_user():
    """Every form, not just the ORM one: a raw `UPDATE users SET password_hash`
    reset sara@company.com to sara123 on every boot and slipped past the first
    version of this test, which looked only for set_password( and User(."""
    assert 'set_password(' not in START_SH
    assert 'User(' not in START_SH
    assert 'password_hash' not in START_SH
    assert 'generate_password_hash' not in START_SH
    assert not re.search(r'UPDATE\s+"?users"?\s', START_SH, re.I), \
        'start.sh must not rewrite user rows on boot'
    assert not re.search(r'INSERT\s+INTO\s+"?users"?\s', START_SH, re.I)


def test_a_password_a_worker_chose_survives_a_boot(db_session):
    worker = _user('w1@t.iq', 'my-own-secret', sap_id='500749')
    worker.must_change_password = False
    db.session.commit()

    _run_boot_block()

    db.session.refresh(worker)
    assert worker.check_password('my-own-secret')
    assert not worker.check_password('500749')
    assert worker.must_change_password is False


def test_the_sample_admin_with_its_published_password_is_disabled(db_session):
    sample = _user('admin@company.com', 'admin123', role='admin')

    _run_boot_block()

    db.session.refresh(sample)
    assert sample.is_active is False


def test_the_sample_admin_with_a_changed_password_is_left_alone(db_session):
    sample = _user('admin@company.com', 'changed-by-ali', role='admin')

    _run_boot_block()

    db.session.refresh(sample)
    assert sample.is_active is True


def test_no_sample_admin_means_none_is_created(db_session):
    _run_boot_block()

    assert User.query.filter_by(email='admin@company.com').first() is None
