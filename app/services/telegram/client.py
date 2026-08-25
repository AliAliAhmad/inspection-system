"""
The six Bot API calls this bot actually makes.

Raw `requests` rather than python-telegram-bot: that library is asyncio-first and
this is sync Flask on threaded gunicorn workers, so every call would need an
event loop bridged into a request thread. Six methods is a hundred lines; the
library is forty async modules to avoid writing them.
"""

import logging
import re

from flask import current_app

logger = logging.getLogger(__name__)

API_ROOT = 'https://api.telegram.org'

# Telegram's rule for secret_token: 1-256 chars, only A-Z a-z 0-9 _ and -.
# The same value is also the last segment of the webhook URL, so anything
# outside this set breaks in two places at once — a base64 secret containing
# '/' would silently change the path.
SECRET_TOKEN_RE = re.compile(r'^[A-Za-z0-9_-]{1,256}$')


def valid_secret_token(value):
    return bool(value) and bool(SECRET_TOKEN_RE.match(str(value)))


def _describe(response):
    """Telegram's own explanation of a failure, or the raw body."""
    try:
        return response.json().get('description') or response.text[:200]
    except Exception:  # noqa: BLE001
        return response.text[:200]

# Telegram rejects anything longer. The renderer splits on a job boundary well
# before this, but a hand-written reply could still run over.
MAX_MESSAGE_CHARS = 4096

# Short on purpose. This runs inside a background thread that has already ACKed
# the webhook, and a hung send would hold that thread indefinitely.
TIMEOUT_SECONDS = 15


class TelegramClient:
    """Talks to the Bot API. Injected so tests never touch the network."""

    def __init__(self, token=None):
        self._token = token
        self.last_error = None

    @property
    def token(self):
        if self._token is not None:
            return self._token
        return current_app.config.get('TELEGRAM_BOT_TOKEN', '')

    def _call(self, method, payload):
        token = self.token
        if not token:
            # Not an error worth raising: the bot is simply not configured yet,
            # and the caller is usually a scheduled push that should stay quiet.
            logger.debug('Telegram %s skipped — no bot token configured', method)
            return None

        import requests
        try:
            response = requests.post(f'{API_ROOT}/bot{token}/{method}',
                                     json=payload, timeout=TIMEOUT_SECONDS)
        except Exception as e:  # noqa: BLE001
            logger.warning('Telegram %s failed: %s', method, e)
            self.last_error = str(e)
            return None

        if response.status_code != 200:
            logger.warning('Telegram %s returned %s: %s',
                           method, response.status_code, response.text[:300])
            # Telegram's own description says exactly what is wrong ("secret
            # token contains unallowed characters"). Keep it so callers can show
            # it instead of guessing — a guessed reason sends people looking in
            # the wrong place, which is worse than no reason at all.
            self.last_error = _describe(response)
            return None
        self.last_error = None
        return response.json().get('result')

    def send_message(self, chat_id, text, reply_markup=None):
        """Send one message.

        NO parse_mode, deliberately. Equipment names carry underscores and
        asterisks (TT032-1000HR_MECH), which Markdown treats as formatting — a
        send either fails outright or silently swallows part of a job number.
        Arabic also renders cleanly as plain text, where bidi reordering
        otherwise fights the delimiters.
        """
        payload = {'chat_id': chat_id, 'text': text[:MAX_MESSAGE_CHARS],
                   'disable_web_page_preview': True}
        if reply_markup:
            payload['reply_markup'] = reply_markup
        return self._call('sendMessage', payload)

    def send_chunks(self, chat_id, chunks):
        """Send an already-split message, in order. Returns how many landed."""
        sent = 0
        for chunk in chunks:
            if not chunk.strip():
                continue
            if self.send_message(chat_id, chunk) is not None:
                sent += 1
        return sent

    def answer_callback_query(self, callback_query_id, text=None):
        """Stop the spinner on the phone that just pressed a button.

        Telegram turns a little wheel on the pressed button until this is
        called, and its callback ids are short-lived.

        Telegram accepts exactly ONE answer per press, so the caller answers
        ONCE, at the end, in a `finally` — carrying the outcome, and guaranteed
        even when the work raises. Answering first would stop the spinner
        sooner but make it impossible to say what happened. See the module
        docstring of app/services/telegram/taps.py.

        `text` shows as a toast over the chat. Keep it short; Telegram caps it
        around 200 characters.
        """
        payload = {'callback_query_id': callback_query_id}
        if text:
            payload['text'] = text[:200]
        return self._call('answerCallbackQuery', payload)

    def edit_message_text(self, chat_id, message_id, text, reply_markup=None):
        """Rewrite a message already sitting on somebody's phone.

        This is how the other planners' copies of a question stop working once
        one of them has decided. Pass `reply_markup={'inline_keyboard': []}` to
        take the buttons away — omitting it LEAVES THEM THERE, which is the
        opposite of what a decided question wants.

        No parse_mode, for the same reason send_message has none.
        """
        payload = {'chat_id': chat_id, 'message_id': message_id,
                   'text': text[:MAX_MESSAGE_CHARS],
                   'disable_web_page_preview': True}
        if reply_markup is not None:
            payload['reply_markup'] = reply_markup
        return self._call('editMessageText', payload)

    def set_webhook(self, url, secret_token=None):
        payload = {'url': url, 'allowed_updates': ['message', 'callback_query']}
        if secret_token:
            payload['secret_token'] = secret_token
        return self._call('setWebhook', payload)

    def delete_webhook(self):
        return self._call('deleteWebhook', {'drop_pending_updates': False})

    def get_webhook_info(self):
        return self._call('getWebhookInfo', {})

    def get_me(self):
        return self._call('getMe', {})
