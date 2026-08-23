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

from app.extensions import db
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
        '/generate — build this week from the box (draft only)\n'
        '/undo — remove what the generator just added\n'
        '/pool — what is waiting in the job box\n'
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
        '/generate — بناء خطة الأسبوع من الصندوق (مسودة فقط)\n'
        '/undo — حذف ما أضافه المولّد\n'
        '/pool — ما ينتظر في صندوق المهام\n'
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
    """The plan whose week contains this date, or None.

    Ordered by week_start DESCENDING because weeks overlap here: plan 40 ran
    Mon 17 -> Sun 23 and plan 41 runs Sun 23 -> Sat 29, so Sunday the 23rd sits
    in both. Taking .first() unordered picked the OLDER one, and /generate
    cheerfully built a week that ended the same day. The plan that STARTED most
    recently is the one being worked.
    """
    return (WorkPlan.query
            .filter(WorkPlan.week_start <= target, WorkPlan.week_end >= target)
            .order_by(WorkPlan.week_start.desc())
            .first())


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
        return _dispatch(command, argument, language, user)
    except Exception as e:  # noqa: BLE001
        # A crash here would leave Ali staring at a bot that received his
        # message and said nothing, which is indistinguishable from being
        # blocked. Say something — and say WHAT, not just "it is logged".
        #
        # The generic version cost an evening: the bot reported a failure it
        # would not name, and the only way to learn the reason was a shell
        # session on a connection that keeps dropping. This is a private bot
        # with an allowlist of one, so the error itself is the useful answer.
        logger.exception('Telegram command failed: %r', text)
        return [f'/{command} failed: {type(e).__name__}: {e}'[:600]]


def _dispatch(command, argument, language, user=None):
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

    if command == 'generate':
        # The bot's only mutating command, and deliberately the only one.
        # It produces a DRAFT: nobody is notified, no worker sees it, and
        # /undo removes it. Publishing is not here and will not be.
        from app.services.telegram.generate import generate
        return generate(user, language, recipe=argument or 'priority_first')

    if command == 'undo':
        from app.services.telegram.generate import undo
        return undo(user, language)

    if command in ('pool', 'box'):
        return [_pool_summary(language)]

    if command in ('sap', 'alerts'):
        return [_sap_events(language)]

    return [UNKNOWN.get(language, UNKNOWN['en'])]


POOL_WORDS = {
    'en': {
        'title': '📦 JOB POOL', 'waiting': 'jobs waiting', 'empty':
        'The box is empty. Either no rebuild has run yet, or SAP has no open '
        'work for MES.', 'by_type': 'By type', 'last_rebuild': 'Last rebuild',
        'never': 'never run', 'new': 'new', 'updated': 'updated',
        'gone': 'gone from SAP', 'equipment': 'equipment matched',
        'unmatched': 'NOT FOUND IN THE APP', 'dropped': 'orders dropped',
        'skipped': 'Rebuild could not run', 'delivered': 'Files delivered',
        'crashed': 'Rebuild crashed', 'from_sap': 'from SAP:',
        'from_inspection': 'from inspections:',
        'missing': 'not on disk', 'stale': 'superseded',
    },
    'ar': {
        'title': '📦 صندوق المهام', 'waiting': 'مهمة في الانتظار', 'empty':
        'الصندوق فارغ. إما لم يتم التحديث بعد، أو لا يوجد عمل مفتوح في SAP.',
        'by_type': 'حسب النوع', 'last_rebuild': 'آخر تحديث',
        'never': 'لم يعمل بعد', 'new': 'جديد', 'updated': 'محدّث',
        'gone': 'خرج من SAP', 'equipment': 'معدات مطابقة',
        'unmatched': 'غير موجودة في التطبيق', 'dropped': 'أوامر مهملة',
        'skipped': 'تعذّر تشغيل التحديث', 'delivered': 'الملفات المستلمة',
        'crashed': 'تعطّل التحديث', 'from_sap': 'من SAP:',
        'from_inspection': 'من الفحوصات:',
        'missing': 'غير موجود على القرص', 'stale': 'مستبدل',
    },
}

PRIORITY_ORDER = (('urgent', '🔴'), ('high', '🟠'), ('normal', '⚪'), ('low', '·'))


def _as_planning_clock(iso_text):
    """A stored UTC ISO timestamp shown on the yard's clock."""
    from datetime import datetime
    if not iso_text:
        return '?'
    try:
        stamp = datetime.fromisoformat(str(iso_text).split('.')[0])
    except ValueError:
        return str(iso_text)[:16].replace('T', ' ')
    return to_planning_time(stamp).strftime('%Y-%m-%d %H:%M')


def _open_findings_count():
    """Inspection findings still waiting to be planned.

    Mirrors what the planner's pool panel lists, so the two agree: an open or
    in-progress defect that is not already on a day of a live plan.
    """
    from app.models import Defect, WorkPlanJob, WorkPlanDay, WorkPlan
    from app.utils.decorators import planning_today

    scheduled = (db.session.query(WorkPlanJob.defect_id)
                 .join(WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id)
                 .join(WorkPlan, WorkPlanDay.work_plan_id == WorkPlan.id)
                 .filter(WorkPlan.week_end >= planning_today(),
                         WorkPlanJob.defect_id.isnot(None))
                 .subquery())
    return (Defect.query
            .filter(Defect.status.in_(['open', 'in_progress']),
                    ~Defect.id.in_(db.session.query(scheduled.c.defect_id)))
            .count())


def _pool_summary(language):
    """What is in the box, and what the last rebuild did to it.

    Exists because the alternative was reading Render's logs through an SSH
    shell that drops on a weak connection — the answer to "did my SAP files
    turn into jobs" should not need a laptop.
    """
    from app.models import SAPWorkOrder
    from app.services.sap_pool_sync import load_last_report

    words = POOL_WORDS.get(language, POOL_WORDS['en'])
    total = SAPWorkOrder.query.filter(SAPWorkOrder.work_plan_id.is_(None),
                                      SAPWorkOrder.status == 'pending').count()
    # Ali's own definition: "the big box that has all jobs from SAP AND
    # inspection results". Counting only SAP made /pool disagree with the
    # planner screen, which shows both — and the findings are the half he
    # raised himself, so leaving them out made the box look wrong.
    findings = _open_findings_count()

    lines = [words['title'], '']
    if not total and not findings:
        lines.append(words['empty'])
    else:
        lines.append(f"{total + findings} {words['waiting']}")
        if findings:
            lines.append(f"  {words['from_sap']} {total} · "
                         f"{words['from_inspection']} {findings}")
        counts = dict(db.session.query(SAPWorkOrder.priority, db.func.count())
                      .filter(SAPWorkOrder.work_plan_id.is_(None))
                      .group_by(SAPWorkOrder.priority).all())
        for name, icon in PRIORITY_ORDER:
            if counts.get(name):
                lines.append(f"  {icon} {counts[name]} {name}")

        types = dict(db.session.query(SAPWorkOrder.job_type, db.func.count())
                     .filter(SAPWorkOrder.work_plan_id.is_(None))
                     .group_by(SAPWorkOrder.job_type).all())
        if types:
            lines.append('')
            lines.append(words['by_type'] + ': ' +
                         ' · '.join(f'{k} {v}' for k, v in sorted(types.items())))

    report = load_last_report()
    lines.append('')
    if not report:
        lines.append(f"{words['last_rebuild']}: {words['never']}")
    elif report.get('status') == 'error':
        # A crash used to leave nothing at all, so /pool said "never run" —
        # identical to "nobody has asked for one yet".
        lines.append(f"❌ {words['crashed']}: {report.get('reason')}")
    elif report.get('status') == 'skipped':
        # A rebuild that declined to run has a REASON, and the reason is the
        # answer. Before this it saved nothing and read as "never run" — the
        # same words a crash produces, which is how an afternoon disappears.
        lines.append(f"⚠️ {words['skipped']}: {report.get('reason')}")
        lines.append('')
        lines.append(words['delivered'] + ':')
        for item in (report.get('delivered') or [])[:10]:
            flags = []
            if not item.get('on_disk'):
                flags.append(words['missing'])
            if not item.get('is_current'):
                flags.append(words['stale'])
            when = str(item.get('received_at') or '')[:16].replace('T', ' ')
            note = f"  ⚠️ {', '.join(flags)}" if flags else ''
            lines.append(f"  {item.get('sheet') or '?'} · {when}{note}")
        if not report.get('delivered'):
            lines.append('  (nothing)')
    else:
        # written_at is stored with utcnow(), like everything else in this
        # database. Printing it raw made ONE line of the message UTC while the
        # freshness stamp below it was Baghdad — the same report appearing to
        # be three hours older than it was.
        when = _as_planning_clock(report.get('written_at'))
        lines.append(f"{words['last_rebuild']}: {when}")
        lines.append(f"  +{report.get('created', 0)} {words['new']} · "
                     f"{report.get('updated', 0)} {words['updated']} · "
                     f"-{report.get('removed_from_pool', 0)} {words['gone']}")

        matched = report.get('equipment_matched', 0)
        unmatched = report.get('equipment_unmatched', 0)
        lines.append(f"  {words['equipment']}: {matched}/{matched + unmatched}")

        # The one failure in this pipeline that is otherwise invisible: orders
        # whose equipment is not in the app are dropped, and the planner simply
        # looks empty with nothing explaining why. Named, never counted only.
        if unmatched:
            codes = report.get('unmatched_codes') or []
            lines.append('')
            lines.append(f"⚠️ {unmatched} {words['unmatched']}:")
            lines.append('  ' + ', '.join(codes[:40]))
            if len(codes) > 40:
                lines.append(f'  ... +{len(codes) - 40}')
            lines.append(f"  {report.get('orders_skipped_no_equipment', 0)} "
                         f"{words['dropped']}")

    lines.append('')
    lines.append(_freshness(language))
    return '\n'.join(lines)


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
