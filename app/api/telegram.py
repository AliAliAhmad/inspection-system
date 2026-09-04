"""
The webhook Telegram posts updates to.

Webhook rather than polling: two gunicorn workers running getUpdates would be
two bots answering every message, each seeing half of them.

Every update passes four gates before anything happens — secret header, secret
path, private chat, sender allowlist — and failing any of them produces silence
rather than a refusal. A refusal tells a prober that the endpoint is live and
that the bot exists.

ALWAYS ACK 200 IMMEDIATELY. Telegram retries until it gets a 200, so a slow
handler means the same message handled twice; once there are mutating commands
that is a duplicated import or a doubly-removed job. The work happens in a
background thread with the app context pushed, copying the pattern in
scheduler_service.
"""

import logging
import threading
from collections import OrderedDict

from flask import Blueprint, current_app, jsonify, request

from app.services.telegram.auth import chat_id_of, resolve_sender, secret_header_ok
from app.services.telegram.client import TelegramClient
from app.services.telegram.dispatcher import handle

logger = logging.getLogger(__name__)

bp = Blueprint('telegram', __name__)

SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token'

# update_id values already handled. Telegram redelivers on any non-200 and on a
# deploy restart mid-request, so this is a correctness requirement, not polish.
# In-memory and per-worker: a restart loses it, and the cost of that is one
# duplicated READ. Mutations are NOT protected by this — they are protected by
# the atomic claim in app/services/telegram/taps.py, which also covers the case
# this cache never could: two DIFFERENT planners pressing at the same moment.
_SEEN_LIMIT = 2000
_seen_updates = OrderedDict()
_seen_lock = threading.Lock()


def _already_handled(update_id):
    if update_id is None:
        return False
    with _seen_lock:
        if update_id in _seen_updates:
            return True
        _seen_updates[update_id] = True
        while len(_seen_updates) > _SEEN_LIMIT:
            _seen_updates.popitem(last=False)
    return False


@bp.route('/webhook/<path:path_secret>', methods=['POST'])
def webhook(path_secret):
    """Receive one update. Answers 200 to everything, including refusals.

    A 401 here would be read by Telegram as a delivery failure and retried
    forever, and would confirm to anyone probing that the path is a real
    webhook. Silence with a 200 is both quieter and better behaved.
    """
    ok = jsonify({'ok': True}), 200

    # SILENT TO THE CALLER, NOT TO THE LOGS.
    #
    # Answering 200 to a refusal is right: a 401 would tell a prober the path is
    # a real webhook, and Telegram would retry it forever. But saying nothing
    # ANYWHERE meant a bot that had stopped answering could not be diagnosed at
    # all — on 2026-09-04 Telegram reported a correct URL, zero pending updates
    # and no delivery error, which proved the updates were arriving and being
    # dropped here, and there was no way to learn at which gate.
    #
    # These lines never name the secret, only which gate closed.
    expected_path = current_app.config.get('TELEGRAM_WEBHOOK_SECRET', '') or ''
    if not expected_path:
        logger.warning('Telegram update refused: TELEGRAM_WEBHOOK_SECRET is not set')
        return ok
    if path_secret != expected_path:
        logger.warning('Telegram update refused: path secret does not match '
                       '(got %d chars, expected %d) — the webhook was probably '
                       'registered with a different secret than the app now holds',
                       len(path_secret or ''), len(expected_path))
        return ok
    if not secret_header_ok(request.headers.get(SECRET_HEADER)):
        logger.warning('Telegram update refused: %s header %s. Re-register with '
                       'scripts/telegram_set_webhook.py, which passes secret_token.',
                       SECRET_HEADER,
                       'missing' if not request.headers.get(SECRET_HEADER) else 'did not match')
        return ok

    update = request.get_json(silent=True) or {}
    if _already_handled(update.get('update_id')):
        return ok

    user = resolve_sender(update)
    if user is None:
        # The commonest real cause: the sender's Telegram id is not in
        # TELEGRAM_ALLOWED_USERS, or the app user it maps to no longer exists.
        # Telegram ids are not secret — they are visible to any chat partner —
        # so naming it is what makes the setting fixable.
        sender = ((update.get('message') or update.get('callback_query') or {})
                  .get('from') or {})
        logger.warning('Telegram update refused: sender %s (%s) is not in the '
                       'allowlist, or maps to a user that no longer exists',
                       sender.get('id'), sender.get('username'))
        return ok

    chat_id = chat_id_of(update)
    if chat_id is None:
        logger.warning('Telegram update refused: no private chat id on the update '
                       '(group and channel messages are ignored by design)')
        return ok

    app = current_app._get_current_object()
    user_id = user.id

    def run():
        with app.app_context():
            try:
                from app.models import User
                sender = User.query.get(user_id)
                if sender is None:
                    logger.warning('Telegram update dropped: TELEGRAM_ALLOWED_USERS '
                                   'maps to app user %s, which does not exist', user_id)
                    return
                if update.get('callback_query'):
                    from app.services.telegram.taps import handle_callback
                    handle_callback(update, sender)
                    return
                chunks = handle(update, sender)
                if chunks:
                    TelegramClient().send_chunks(chat_id, chunks)
            except Exception:  # noqa: BLE001
                logger.exception('Telegram update handling failed')

    threading.Thread(target=run, daemon=True, name='telegram-update').start()
    return ok


@bp.route('/health', methods=['GET'])
def health():
    """Is the bot configured? Deliberately says nothing secret.

    Reports only whether each setting is PRESENT, never its value, so it is safe
    to hit from anywhere while still answering the question that actually goes
    wrong in production: which env var did I forget on Render.
    """
    config = current_app.config
    from app.services.telegram.auth import allowlist
    from app.services.telegram.client import valid_secret_token

    secret = config.get('TELEGRAM_WEBHOOK_SECRET')
    return jsonify({
        'enabled': bool(config.get('TELEGRAM_ENABLED')),
        'token_configured': bool(config.get('TELEGRAM_BOT_TOKEN')),
        'webhook_secret_configured': bool(secret),
        # Present is not the same as usable. Telegram allows only A-Z a-z 0-9 _ -
        # in a secret token, and the same value is the webhook URL's last path
        # segment, so a base64 secret passes "configured" and still fails.
        'webhook_secret_valid': valid_secret_token(secret),
        'allowlist_size': len(allowlist()),
    }), 200
