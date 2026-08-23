"""
The messages the bot sends without being asked.

An "alarm clock", not a "smoke alarm". Two fixed times a day, always the same
shape, always the plan — nothing that fires on a condition. Proactive ALERTS
(unassigned job, overdue PM, plan still draft) are deliberately deferred until
several real weeks have been watched: an alert that fires too often gets muted,
and a muted channel is worse than no channel at all.

The one exception is "there is no plan for tomorrow", which is sent ONCE per
week rather than daily. Repeated, it becomes a nag during the weeks when the
plan legitimately is not ready yet.
"""

import logging
from datetime import timedelta

from flask import current_app

from app.services.telegram.auth import allowlist
from app.services.telegram.client import TelegramClient
from app.services.telegram.dispatcher import plan_for_date, push_text

logger = logging.getLogger(__name__)

NO_PLAN = {
    'en': ('No plan for {date} yet.\n\n'
           'Nothing is scheduled for that week. Generate it in the planner when '
           'you are ready.'),
    'ar': ('لا توجد خطة لـ {date} بعد.\n\n'
           'لم يتم جدولة أي شيء لذلك الأسبوع. أنشئها من المخطط عندما تكون جاهزاً.'),
}

# Chat id -> week_start already warned about. Per-worker and lost on restart,
# which is the right trade: the cost of a repeat after a deploy is one extra
# message, and the cost of persisting it is a table for a nudge.
_no_plan_warned = {}


def _language_for_chat(user):
    return (getattr(user, 'language', None) or 'en')


def push_day_to_planners(target, kind='today', client=None):
    """Send one day's plan to everyone on the allowlist.

    Returns a small report so the scheduler log says what happened rather than
    only that it ran.
    """
    from app.models import User

    recipients = allowlist()
    if not recipients:
        logger.info('Telegram push skipped — allowlist is empty')
        return {'sent': 0, 'reason': 'no recipients'}

    if not current_app.config.get('TELEGRAM_BOT_TOKEN'):
        logger.info('Telegram push skipped — no bot token configured')
        return {'sent': 0, 'reason': 'no token'}

    client = client or TelegramClient()
    plan = plan_for_date(target)
    sent = 0

    for chat_id, app_user_id in recipients.items():
        user = User.query.filter_by(id=app_user_id).first()
        language = _language_for_chat(user)

        if plan is None:
            if _already_warned(chat_id, target):
                continue
            text = NO_PLAN.get(language, NO_PLAN['en']).format(date=target.isoformat())
            if client.send_message(chat_id, text) is not None:
                sent += 1
            continue

        text = push_text(target, language)
        if text is None:
            continue
        if client.send_message(chat_id, text) is not None:
            sent += 1

    logger.info('Telegram %s push: %s message(s) for %s', kind, sent, target)
    return {'sent': sent, 'date': target.isoformat(), 'kind': kind}


def _already_warned(chat_id, target):
    """One "no plan" message per WEEK per chat, not one per day.

    Keyed on the Monday of the target's week, so the reminder repeats when a new
    week arrives without a plan but stays quiet across the days of one week.
    """
    week_key = (target - timedelta(days=target.weekday())).isoformat()
    if _no_plan_warned.get(chat_id) == week_key:
        return True
    _no_plan_warned[chat_id] = week_key
    return False
