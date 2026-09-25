"""Who a request counts against — the fix for "filters not working, I don't know why".

Ali, 2026-09-24: searching users "shows error or nothing showing", and other
filters too, at random. The limiter keyed on get_remote_address, and on Render
every request arrives from Render's proxy — so the whole company shared ONE
bucket of 200 requests a minute and ONE login bucket of 5. When it ran out, every
screen answered 429 to whoever was clicking.

These pin the two halves of the fix: a logged-in person is counted as himself,
and an anonymous request is counted by the REAL client address.
"""

import pytest
from flask_jwt_extended import create_access_token

from app.extensions import rate_limit_key


def test_a_logged_in_person_is_counted_as_himself(app):
    with app.app_context():
        token = create_access_token(identity='42')
    with app.test_request_context(headers={'Authorization': f'Bearer {token}'}):
        assert rate_limit_key() == 'user:42'


def test_two_people_on_the_same_wifi_do_not_share_a_bucket(app):
    """Every phone in the yard leaves through ONE Wi-Fi address."""
    with app.app_context():
        a = create_access_token(identity='1')
        b = create_access_token(identity='2')
    keys = set()
    for token in (a, b):
        with app.test_request_context(headers={'Authorization': f'Bearer {token}'},
                                      environ_base={'REMOTE_ADDR': '10.0.0.9'}):
            keys.add(rate_limit_key())
    assert keys == {'user:1', 'user:2'}


def test_no_token_falls_back_to_the_address(app):
    with app.test_request_context(environ_base={'REMOTE_ADDR': '203.0.113.7'}):
        assert rate_limit_key() == '203.0.113.7'


def test_a_bad_token_never_breaks_the_request(app):
    """The key function runs before the route; it must not raise. The route
    itself refuses the token."""
    with app.test_request_context(headers={'Authorization': 'Bearer not-a-jwt'},
                                  environ_base={'REMOTE_ADDR': '203.0.113.8'}):
        assert rate_limit_key() == '203.0.113.8'


@pytest.fixture(scope='module')
def who_client():
    """A fresh app with one extra route that reports what it sees as the
    client address. Fresh, because a shared app cannot take new routes once it
    has served a request."""
    from flask import request
    from app import create_app
    fresh = create_app('testing')

    @fresh.route('/__who')
    def who():  # noqa: F841 — registered by the decorator
        return request.remote_addr or ''

    return fresh.test_client()


def test_the_real_client_address_is_read_behind_renders_proxy(who_client):
    """Without ProxyFix every visitor had the proxy's address."""
    r = who_client.get('/__who', headers={'X-Forwarded-For': '198.51.100.23'},
                       environ_base={'REMOTE_ADDR': '10.1.2.3'})
    assert r.get_data(as_text=True) == '198.51.100.23'


def test_a_client_cannot_pick_its_own_address(who_client):
    """x_for=1 trusts only the hop Render appends. A fake first entry sent by the
    client is ignored — otherwise anyone could dodge the login limit."""
    r = who_client.get('/__who', headers={'X-Forwarded-For': '1.1.1.1, 198.51.100.24'},
                       environ_base={'REMOTE_ADDR': '10.1.2.3'})
    assert r.get_data(as_text=True) == '198.51.100.24'


def test_a_refresh_token_is_counted_as_its_owner(app):
    """POST /refresh carries a REFRESH token; it must not fall back to the
    address the whole yard shares."""
    from flask_jwt_extended import create_refresh_token
    with app.app_context():
        token = create_refresh_token(identity='7')
    with app.test_request_context(headers={'Authorization': f'Bearer {token}'}):
        assert rate_limit_key() == 'user:7'


def test_login_is_counted_per_account_not_per_yard(app):
    """Two people logging in from the same Wi-Fi get separate buckets."""
    from app.extensions import login_rate_limit_key
    keys = set()
    for email in ('ali@test.com', 'Hassan@Test.com '):
        with app.test_request_context(method='POST', json={'email': email},
                                      environ_base={'REMOTE_ADDR': '10.0.0.9'}):
            keys.add(login_rate_limit_key())
    assert keys == {'login:10.0.0.9:ali@test.com', 'login:10.0.0.9:hassan@test.com'}
