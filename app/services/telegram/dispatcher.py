"""
What the bot does when Ali sends it something.

Read-only for now, on purpose. Stages 1 and 2 answer questions and change
nothing, so the format can be settled on a real phone while a wrong answer costs
nothing. Editing and generating arrive once the reading is right.

Publishing will never live here. Everything up to publishing is undone with one
more message; publishing notifies every assigned worker and makes the plan real,
so it stays a deliberate act at a computer. That limits the damage if the
allowlist is ever defeated.
"""

import logging
from datetime import timedelta

from app.models import SapReconciliationEvent, SapSyncFile, WorkPlan
from app.services.telegram.renderer import (
    format_date,
    freshness_line,
    render_day,
    render_week,
)
from app.utils.decorators import planning_now, planning_today, to_planning_time

logger = logging.getLogger(__name__)

HELP = {
    'en': (
        'What I can do:\n\n'
        '/plan — the whole week, day by day\n'
        '/plan east — one berth only\n'
        '/today — today\n'
        '/tomorrow — tomorrow\n'
        '/sap — what changed in SAP that affects the plan\n'
        '/ping — check I am awake\n\n'
        'Every job carries a #number. That is its handle.'
    ),
    'ar': (
        'ما يمكنني فعله:\n\n'
        '/plan — الأسبوع كاملاً، يوماً بيوم\n'
        '/plan east — رصيف واحد فقط\n'
        '/today — اليوم\n'
        '/tomorrow — غداً\n'
        '/sap — ما تغيّر في SAP ويؤثر على الخطة\n'
        '/ping — للتأكد أنني أعمل\n\n'
        'كل مهمة تحمل رقم #. هذا هو معرّفها.'
    ),
}

UNKNOWN = {
    'en': 'I do not know that one. Send /help.',
    'ar': 'لا أعرف هذا الأمر. أرسل /help.',
}

NO_DAY = {
    'en': 'No plan covers {date}.',
    'ar': 'لا توجد خطة تغطي {date}.',
}

NOTHING_FROM_SAP = {
    'en': 'Nothing from SAP needs your attention.',
    'ar': 'لا يوجد شيء من SAP يحتاج انتباهك.',
}

BERTH_WORDS = {'east': 'east', 'west': 'west',
               'شرق': 'east', 'غرب': 'west'}


def language_for(user, update):
    """Arabic if the phone is Arabic, otherwise the account's language.

    Telegram's own `language_code` is the client-side signal here, exactly as
    Accept-Language is in the app. Preferring the stored users.language would
    repeat the bug that kept Arabic-speaking workers on English screens: that
    column defaults to 'en' and is only ever changed by an admin.
    """
    sender = (update.get('message') or update.get('callback_query') or {}).get('from') or {}
    code = str(sender.get('language_code') or '').lower()
    if code.startswith('ar'):
        return 'ar'
    if code:
        return 'en'
    return (getattr(user, 'language', None) or 'en')


def plan_for_date(target):
    """The plan whose week contains this date, or None."""
    return WorkPlan.query.filter(WorkPlan.week_start <= target,
                                 WorkPlan.week_end >= target).first()


def day_for_date(target):
    plan = plan_for_date(target)
    if not plan:
        return None
    for day in plan.days:
        if day.date == target:
            return day
    return None


def _freshness(language):
    """How old the SAP data is, stated in the yard's clock.

    received_at is stored with datetime.utcnow(), so a delivery at 09:14 Baghdad
    sits in the row as 06:14. Printing it raw would tell a man standing in
    Baghdad the wrong time on every single message — the same off-by-three-hours
    family as the utcnow().date() bug in the generator.
    """
    record = (SapSyncFile.query
              .filter(SapSyncFile.sheet_name == 'IW39')
              .order_by(SapSyncFile.received_at.desc())
              .first())
    received = to_planning_time(record.received_at) if record else None
    return freshness_line(received, planning_now(), language)


def handle(update, user):
    """Route one update to a list of message chunks. Never raises.

    Returning chunks rather than sending them keeps this a pure function of the
    database — the whole command surface is testable without Telegram.
    """
    message = update.get('message') or {}
    text = (message.get('text') or '').strip()
    language = language_for(user, update)

    if not text:
        return []

    command, _, argument = text.partition(' ')
    command = command.lstrip('/').split('@')[0].lower()
    argument = argument.strip().lower()

    try:
        return _dispatch(command, argument, language)
    except Exception:  # noqa: BLE001
        # A crash here would leave Ali staring at a bot that received his
        # message and said nothing, which is indistinguishable from being
        # blocked. Say something, and put the detail in the log.
        logger.exception('Telegram command failed: %r', text)
        return ['Something went wrong reading the plan. It is logged.']


def _dispatch(command, argument, language):
    if command in ('ping', 'start'):
        return [f'pong · {_freshness(language)}']

    if command == 'help':
        return [HELP.get(language, HELP['en'])]

    if command == 'plan':
        berth = BERTH_WORDS.get(argument)
        plan = plan_for_date(planning_today())
        chunks = render_week(plan, language, berth)
        return chunks + [_freshness(language)]

    if command in ('today', 'tomorrow'):
        target = planning_today()
        if command == 'tomorrow':
            target = target + timedelta(days=1)
        day = day_for_date(target)
        if not day:
            return [NO_DAY.get(language, NO_DAY['en']).format(
                date=format_date(target, language))]
        return [render_day(day, language), _freshness(language)]

    if command in ('sap', 'alerts'):
        return [_sap_events(language)]

    return [UNKNOWN.get(language, UNKNOWN['en'])]


def _sap_events(language):
    """Everything the robot flagged and nobody has dealt with yet."""
    events = (SapReconciliationEvent.query
              .filter(SapReconciliationEvent.status == 'open')
              .order_by(SapReconciliationEvent.created_at.desc())
              .limit(20).all())
    if not events:
        return NOTHING_FROM_SAP.get(language, NOTHING_FROM_SAP['en'])

    icons = {
        'job_removed': '🗑️',
        'job_in_progress_conflict': '⚠️',
        'job_completion_confirmed': '✅',
        'completion_not_confirmed': '❓',
    }
    lines = []
    for event in events:
        lines.append(f'{icons.get(event.event_type, "•")} {event.summary}')
    return '\n\n'.join(lines)


def push_text(when, language='en'):
    """The scheduled message: one day's plan, plus how fresh the data is.

    16:00 shows TOMORROW — early enough that an unassigned job can still be
    given to somebody. 06:00 shows TODAY. Both are this same renderer; the only
    difference is which day.
    """
    day = day_for_date(when)
    if not day:
        return None
    return f'{render_day(day, language)}\n\n{_freshness(language)}'
