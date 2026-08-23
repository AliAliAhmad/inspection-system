"""
The six Bot API calls this bot actually makes.

Raw `requests` rather than python-telegram-bot: that library is asyncio-first and
this is sync Flask on threaded gunicorn workers, so every call would need an
event loop bridged into a request thread. Six methods is a hundred lines; the
library is forty async modules to avoid writing them.
"""

import logging

from flask import current_app

logger = logging.getLogger(__name__)

API_ROOT = 'https://api.telegram.org'

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
            return None

        if response.status_code != 200:
            logger.warning('Telegram %s returned %s: %s',
                           method, response.status_code, response.text[:300])
            return None
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
