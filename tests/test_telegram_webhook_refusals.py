"""A refusal must be silent to the caller and LOUD in the logs.

Answering 200 to a refusal is correct: a 401 tells a prober the path is a real
webhook, and Telegram retries a non-200 forever. But on 2026-09-04 the bot had
stopped answering entirely and there was no way to find out why — Telegram
reported a correct URL, zero pending updates and NO delivery error, which proved
the updates were arriving and being dropped inside the app, at one of five
silent exits, with nothing recorded anywhere.
"""

import json

import pytest

from app.extensions import db


SECRET = 'test-webhook-secret-abc123'
HEADER = 'X-Telegram-Bot-Api-Secret-Token'


@pytest.fixture
def tg(app):
    app.config['TELEGRAM_WEBHOOK_SECRET'] = SECRET
    app.config['TELEGRAM_ALLOWED_USERS'] = ''
    return app


def _update(telegram_id=999, chat_id=999, text='/pool'):
    return {
        'update_id': 1,
        'message': {'message_id': 1, 'text': text,
                    'from': {'id': telegram_id, 'username': 'someone'},
                    'chat': {'id': chat_id, 'type': 'private'}},
    }


def _post(client, path=SECRET, headers=None, body=None):
    return client.post(f'/api/telegram/webhook/{path}',
                       data=json.dumps(body or _update()),
                       content_type='application/json',
                       headers=headers if headers is not None else {HEADER: SECRET})


class TestEveryRefusalIsRecorded:
    def test_a_wrong_path_secret_is_logged(self, tg, client, caplog):
        with caplog.at_level('WARNING'):
            resp = _post(client, path='not-the-secret')
        assert resp.status_code == 200, 'still silent to the caller'
        assert 'path secret does not match' in caplog.text

    def test_a_missing_header_names_the_fix(self, tg, client, caplog):
        with caplog.at_level('WARNING'):
            resp = _post(client, headers={})
        assert resp.status_code == 200
        assert 'header missing' in caplog.text
        # The message must say what to DO, not only what happened.
        assert 'telegram_set_webhook' in caplog.text

    def test_an_unknown_sender_is_named(self, tg, client, caplog):
        """The commonest real cause, and the one worth naming.

        Telegram ids are not secret — any chat partner can see them — and it is
        naming the id that makes TELEGRAM_ALLOWED_USERS fixable.
        """
        with caplog.at_level('WARNING'):
            resp = _post(client, body=_update(telegram_id=1234567))
        assert resp.status_code == 200
        assert '1234567' in caplog.text
        assert 'allowlist' in caplog.text

    def test_an_unset_secret_says_so(self, tg, client, caplog):
        tg.config['TELEGRAM_WEBHOOK_SECRET'] = ''
        with caplog.at_level('WARNING'):
            resp = _post(client, path='anything')
        assert resp.status_code == 200
        assert 'TELEGRAM_WEBHOOK_SECRET is not set' in caplog.text


class TestTheLogsNeverLeakTheSecret:
    def test_the_secret_value_is_never_written(self, tg, client, caplog):
        """Lengths and gate names only — a log file is not a safe place for it."""
        with caplog.at_level('WARNING'):
            _post(client, path='wrong', headers={HEADER: SECRET})
            _post(client, headers={HEADER: 'wrong-header-value'})
        assert SECRET not in caplog.text
        assert 'wrong-header-value' not in caplog.text


class TestAValidUpdateStillGetsThrough:
    def test_an_allowlisted_sender_is_not_refused(self, tg, client, admin_user, caplog):
        tg.config['TELEGRAM_ALLOWED_USERS'] = f'55501:{admin_user.id}'
        with caplog.at_level('WARNING'):
            resp = _post(client, body=_update(telegram_id=55501))
        assert resp.status_code == 200
        assert 'refused' not in caplog.text, 'a legitimate update must pass every gate'
