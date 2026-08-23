"""
Who is allowed to command the bot.

Ali's rule: only he may command it, everyone else read-only. Today that means
one allowlist entry and no read-only path at all — a stranger who finds the bot
gets nothing back, not even an error.

Four gates, cheapest first:

  1. the secret header Telegram echoes back  — proves the POST came from Telegram
  2. a private chat                          — no groups, no channels
  3. the sender is on the allowlist          — proves it is Ali
  4. an app user behind that entry           — so actions are attributed to a person

Failing any of them produces SILENCE. A reply — even "not authorised" — confirms
to a prober that the bot exists and that this endpoint is live.
"""

import hmac
import logging

from flask import current_app

logger = logging.getLogger(__name__)


def allowlist():
    """telegram_user_id -> app user id, parsed from one env var.

    One setting doing both authorization and identity is deliberate: a separate
    "who is allowed" list and "who are they" mapping is two things that can
    disagree, and the failure mode of disagreement is someone acting as somebody
    else.
    """
    raw = current_app.config.get('TELEGRAM_ALLOWED_USERS', '') or ''
    mapping = {}
    for entry in raw.split(','):
        entry = entry.strip()
        if not entry or ':' not in entry:
            continue
        telegram_id, _, app_user_id = entry.partition(':')
        try:
            mapping[int(telegram_id.strip())] = int(app_user_id.strip())
        except ValueError:
            logger.warning('Ignoring malformed TELEGRAM_ALLOWED_USERS entry: %r', entry)
    return mapping


def secret_header_ok(received):
    """Constant-time comparison of the header Telegram echoes back.

    Refuses when no secret is configured rather than waving everything through —
    the failure mode of a half-configured deploy must be a dead bot, not an open
    endpoint.
    """
    expected = current_app.config.get('TELEGRAM_WEBHOOK_SECRET', '') or ''
    if not expected:
        return False
    return hmac.compare_digest(str(received or ''), expected)


def resolve_sender(update):
    """The app user behind a Telegram update, or None.

    None means "ignore this update entirely" — it covers an unknown sender, a
    group chat, a deactivated account, and a mapping that points at a user who
    no longer exists.
    """
    message = update.get('message') or update.get('callback_query', {}).get('message') or {}
    sender = (update.get('message') or update.get('callback_query') or {}).get('from') or {}

    chat = message.get('chat') or {}
    if chat.get('type') != 'private':
        # A bot that answers in a group answers to whoever is in the group.
        return None

    telegram_id = sender.get('id')
    if telegram_id is None:
        return None

    app_user_id = allowlist().get(int(telegram_id))
    if app_user_id is None:
        return None

    from app.models import User
    user = User.query.filter_by(id=app_user_id).first()
    if not user or not user.is_active:
        logger.warning('Telegram allowlist points at user %s, who is missing or inactive',
                       app_user_id)
        return None
    return user


def chat_id_of(update):
    message = update.get('message') or update.get('callback_query', {}).get('message') or {}
    return (message.get('chat') or {}).get('id')
