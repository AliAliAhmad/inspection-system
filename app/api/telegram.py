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
# duplicated READ. It gets promoted to a table before any command mutates.
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

    expected_path = current_app.config.get('TELEGRAM_WEBHOOK_SECRET', '') or ''
    if not expected_path or path_secret != expected_path:
        return ok
    if not secret_header_ok(request.headers.get(SECRET_HEADER)):
        return ok

    update = request.get_json(silent=True) or {}
    if _already_handled(update.get('update_id')):
        return ok

    user = resolve_sender(update)
    if user is None:
        return ok

    chat_id = chat_id_of(update)
    if chat_id is None:
        return ok

    app = current_app._get_current_object()
    user_id = user.id

    def run():
        with app.app_context():
            try:
                from app.models import User
                sender = User.query.get(user_id)
                if sender is None:
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
    return jsonify({
        'enabled': bool(config.get('TELEGRAM_ENABLED')),
        'token_configured': bool(config.get('TELEGRAM_BOT_TOKEN')),
        'webhook_secret_configured': bool(config.get('TELEGRAM_WEBHOOK_SECRET')),
        'allowlist_size': len(allowlist()),
    }), 200
