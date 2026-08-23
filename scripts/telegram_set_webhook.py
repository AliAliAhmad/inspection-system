#!/usr/bin/env python
"""
Point the bot at this deployment. Run once per environment, and again after the
webhook secret is rotated.

    python scripts/telegram_set_webhook.py --url https://inspection-api-o3hz.onrender.com
    python scripts/telegram_set_webhook.py --info
    python scripts/telegram_set_webhook.py --delete

Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment. The
token is NEVER passed on the command line — a command line is visible in shell
history and in the process list.

The secret is used twice, on purpose: once as the last path segment, and once as
the value Telegram echoes back in X-Telegram-Bot-Api-Secret-Token. Guessing the
URL is then not enough, and the URL alone is not enough either.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from app.services.telegram.client import TelegramClient  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', help='Public base URL of the API, no trailing slash')
    parser.add_argument('--info', action='store_true', help='Show the current webhook')
    parser.add_argument('--delete', action='store_true', help='Unregister the webhook')
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        token = app.config.get('TELEGRAM_BOT_TOKEN')
        secret = app.config.get('TELEGRAM_WEBHOOK_SECRET')
        if not token:
            print('TELEGRAM_BOT_TOKEN is not set. Add it to the environment first.')
            return 1

        client = TelegramClient()

        me = client.get_me()
        if not me:
            print('Telegram rejected the token. Check TELEGRAM_BOT_TOKEN.')
            return 1
        print(f'Bot: @{me.get("username")} ({me.get("first_name")})')

        if args.info:
            info = client.get_webhook_info() or {}
            print(f'  url             : {info.get("url") or "(none)"}')
            print(f'  pending updates : {info.get("pending_update_count")}')
            print(f'  last error      : {info.get("last_error_message") or "none"}')
            return 0

        if args.delete:
            print('Webhook removed.' if client.delete_webhook() else 'Removal failed.')
            return 0

        if not args.url:
            parser.error('--url is required unless --info or --delete is given')
        if not secret:
            print('TELEGRAM_WEBHOOK_SECRET is not set. Without it the webhook '
                  'refuses every update, which is the safe failure but not a '
                  'working bot.')
            return 1

        url = f'{args.url.rstrip("/")}/api/telegram/webhook/{secret}'
        if client.set_webhook(url, secret_token=secret):
            print('Webhook registered.')
            print(f'  {url[:url.rindex("/") + 1]}<secret>')
            return 0

        print('Telegram refused the webhook. It must be HTTPS on a public host.')
        return 1


if __name__ == '__main__':
    sys.exit(main())
