"""
Turning a day of the plan into something readable on a phone.

Ali chose plain text over PDF: he wants to read the day at a glance and quote a
job number back in the next message. That makes this the format that everything
else in the bot is built on — the 16:00 push, the 06:00 push, and the reply after
a generate all render through here.

Two decisions worth keeping:

  * #<job_id> is the universal handle. It is on every job, always, and never
    changes. The SAP order number is shown underneath as recognisable
    information, but it cannot be the handle: jobs raised from team inspections
    have no SAP number at all.

  * No parse_mode, so no escaping. Equipment names contain underscores and
    asterisks; Markdown would eat them or fail the send outright.

Pure functions — no database writes, no Telegram in the loop, so the format can
be tested and argued about without either.
"""

from datetime import date

RULE = '━' * 22

# Chunk well under Telegram's 4096 so a long day splits on a job boundary rather
# than mid-word.
CHUNK_LIMIT = 3800

DAY_NAMES = {
    'en': ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'),
    'ar': ('الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'),
}

MONTHS = {
    'en': ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'),
    'ar': ('يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
           'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'),
}

BERTHS = {
    'en': {'east': 'EAST', 'west': 'WEST', 'both': 'BOTH BERTHS'},
    'ar': {'east': 'الرصيف الشرقي', 'west': 'الرصيف الغربي', 'both': 'الرصيفان'},
}

JOB_TYPES = {
    'en': {'pm': 'PM', 'defect': 'Defect', 'inspection': 'Inspection',
           'corrective': 'Corrective'},
    'ar': {'pm': 'صيانة وقائية', 'defect': 'عطل', 'inspection': 'فحص',
           'corrective': 'إصلاح'},
}

PRIORITY_LABELS = {
    'en': {'urgent': '🔴 URGENT', 'high': '🟠 HIGH', 'low': '⚪ LOW'},
    'ar': {'urgent': '🔴 عاجل', 'high': '🟠 مرتفع', 'low': '⚪ منخفض'},
}

WORDS = {
    'en': {
        'inspections': 'Inspections today', 'jobs': 'jobs', 'job': 'job', 'hours': 'h', 'unassigned': 'unassigned',
        'nothing': 'No jobs planned.', 'no_plan': 'No plan for that week yet.',
        'draft': 'DRAFT — not published yet', 'published': 'PUBLISHED',
        'total': 'Total', 'sap_data': 'SAP data', 'today': 'today',
        'days_old': 'days old', 'never': 'never received', 'from_inspection':
        'From inspection', 'week': 'Week',
    },
    'ar': {
        'inspections': 'الفحوصات اليوم', 'jobs': 'مهام', 'job': 'مهمة', 'hours': 'س', 'unassigned': 'بدون تعيين',
        'nothing': 'لا توجد مهام مخططة.', 'no_plan': 'لا توجد خطة لهذا الأسبوع بعد.',
        'draft': 'مسودة — غير منشورة', 'published': 'منشورة',
        'total': 'الإجمالي', 'sap_data': 'بيانات SAP', 'today': 'اليوم',
        'days_old': 'أيام', 'never': 'لم تصل بعد', 'from_inspection': 'من الفحص',
        'week': 'الأسبوع',
    },
}


def _t(language, key):
    return WORDS.get(language, WORDS['en']).get(key, WORDS['en'][key])


def format_date(value, language='en'):
    """'MON  25 Aug' — the weekday first, because that is how a week is read."""
    if not isinstance(value, date):
        return str(value)
    day_name = DAY_NAMES.get(language, DAY_NAMES['en'])[value.weekday()]
    month = MONTHS.get(language, MONTHS['en'])[value.month - 1]
    return f'{day_name}  {value.day} {month}'


def _hours(value):
    """4.0 not 4, 2.5 not 2.50 — one decimal reads as a duration, two as money."""
    try:
        return f'{float(value):.1f}'
    except (TypeError, ValueError):
        return '?'


def _workers(job):
    names = []
    for assignment in sorted(job.assignments or [],
                             key=lambda a: (not a.is_lead, a.id)):
        user = assignment.user
        if not user:
            continue
        # First name only. Full names push the line past a phone's width, and
        # the crew is small enough that first names are unambiguous.
        names.append((user.full_name or user.email or '').split()[0]
                     if (user.full_name or user.email) else str(user.id))
    return names


def render_job(job, language='en'):
    """One job, four short lines. The handle is always the first thing."""
    lines = []

    priority = (job.priority or 'normal').lower()
    badge = PRIORITY_LABELS.get(language, PRIORITY_LABELS['en']).get(priority)
    lines.append(f'#{job.id} · {badge}' if badge else f'#{job.id}')

    equipment = job.equipment
    if equipment is None and job.job_type == 'inspection' and job.inspection_assignment:
        equipment = job.inspection_assignment.equipment
    if equipment is not None:
        name = equipment.name or ''
        serial = equipment.serial_number or ''
        # Ali's equipment IS the plant code (ECH02), so name alone is usually
        # enough; the serial is only added when it says something different.
        label = f'{name} {serial}'.strip() if serial and serial != name else name
        if label:
            lines.append(f'   {label}')

    kind = JOB_TYPES.get(language, JOB_TYPES['en']).get(job.job_type, job.job_type)
    facts = [kind, f'{_hours(job.estimated_hours)}{_t(language, "hours")}']
    if job.work_center:
        facts.append(job.work_center)
    lines.append('   ' + ' · '.join(facts))

    if job.sap_order_number:
        lines.append(f'   SAP {job.sap_order_number}')
    elif job.defect_id or job.job_type == 'inspection':
        lines.append(f'   {_t(language, "from_inspection")}')

    names = _workers(job)
    if names:
        lines.append('   👤 ' + ', '.join(names))
    else:
        # Flagged rather than omitted: an unassigned job on tomorrow's plan is
        # the single most useful thing a 16:00 message can surface, because it
        # is still fixable at 16:00 and is not at 06:00.
        lines.append(f'   👤 {_t(language, "unassigned")}  ⚠️')

    return '\n'.join(lines)


def render_day(day, language='en', berth=None):
    """One day, split by berth — matching the planner and how the crews divide.

    `berth` limits the output to one side, so a berth's day can be forwarded
    straight to that crew.
    """
    jobs = [job for job in (day.jobs or [])]
    if berth:
        jobs = [job for job in jobs
                if (job.berth or 'both') == berth or (job.berth or 'both') == 'both']

    # Inspections are OUT OF SCOPE for planning — the generator already refuses
    # to schedule them, because inspectors get their work through the inspection
    # assignment flow instead. But rendering them as full cards was five lines
    # each, with an "unassigned" warning that is not a problem and a #id nobody
    # will ever quote. Twenty of them would drown the day.
    #
    # So: one line at the foot, no card, no warning, and OUT of the day's job
    # count and hours — the header should say how much WORK the day holds.
    # Ali: "when they come in the telegram they make the message crowd, but
    # also i do not need to loose them in the day".
    inspections = [job for job in jobs if job.job_type == 'inspection']
    jobs = [job for job in jobs if job.job_type != 'inspection']

    total = sum(job.estimated_hours or 0 for job in jobs)
    count = len(jobs)
    noun = _t(language, 'jobs') if count != 1 else _t(language, 'job')

    header = [
        RULE,
        f'📅 {format_date(day.date, language)}'
        f'        {count} {noun} · {_hours(total)}{_t(language, "hours")}',
        RULE,
    ]

    tail = _inspection_line(inspections, language)

    if not jobs:
        body = ['', _t(language, 'nothing')]
        return '\n'.join(header + body + (['', tail] if tail else []))

    body = []
    groups = {'east': [], 'west': [], 'both': []}
    for job in jobs:
        groups[(job.berth or 'both') if (job.berth or 'both') in groups else 'both'].append(job)

    labels = BERTHS.get(language, BERTHS['en'])
    for key in ('east', 'west', 'both'):
        group = groups[key]
        if not group:
            continue
        body.append('')
        body.append(f'▸ {labels[key]}')
        for job in group:
            body.append('')
            body.append(render_job(job, language))

    if tail:
        body.append('')
        body.append(tail)

    return '\n'.join(header + body)


# Beyond this many, names stop being readable and become a wall.
INSPECTION_NAMES_SHOWN = 8


def _inspection_line(inspections, language='en'):
    """Every inspection on the day, in one line. Empty string if there are none."""
    if not inspections:
        return ''

    names = []
    for job in inspections:
        equipment = job.equipment
        if equipment is None and job.inspection_assignment:
            equipment = job.inspection_assignment.equipment
        if equipment is not None and equipment.name:
            names.append(equipment.name)

    label = _t(language, 'inspections')
    if not names:
        return f'🔍 {label}: {len(inspections)}'

    shown = ', '.join(names[:INSPECTION_NAMES_SHOWN])
    if len(names) > INSPECTION_NAMES_SHOWN:
        return (f'🔍 {label} ({len(names)}): {shown} '
                f'+{len(names) - INSPECTION_NAMES_SHOWN}')
    return f'🔍 {label}: {shown}'


def render_week(plan, language='en', berth=None):
    """The whole week, day by day, as a list of ready-to-send chunks.

    Returns chunks rather than one string because a full week comfortably
    exceeds Telegram's 4096-character limit, and a split has to land between
    jobs rather than inside one.
    """
    if plan is None:
        return [_t(language, 'no_plan')]

    status = _t(language, 'draft') if plan.status != 'published' else _t(language, 'published')
    head = (f'{_t(language, "week")} {plan.week_start.isoformat()} → '
            f'{plan.week_end.isoformat()}\n{status}')

    blocks = [head] + [render_day(day, language, berth) for day in plan.days]

    total = sum(job.estimated_hours or 0
                for day in plan.days for job in (day.jobs or [])
                if job.job_type != 'inspection')
    blocks.append(f'{RULE}\n{_t(language, "total")}: '
                  f'{_hours(total)}{_t(language, "hours")}')

    return _chunk(blocks)


def _chunk(blocks, limit=CHUNK_LIMIT):
    """Pack whole blocks into messages, never splitting one across two."""
    chunks, current = [], ''
    for block in blocks:
        if len(block) > limit:
            # A single day bigger than the limit: flush, then split it on its own
            # blank lines, which sit between jobs.
            if current:
                chunks.append(current)
                current = ''
            chunks.extend(_split_block(block, limit))
            continue
        candidate = f'{current}\n\n{block}' if current else block
        if len(candidate) > limit:
            chunks.append(current)
            current = block
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def _split_block(block, limit):
    parts, current = [], ''
    for piece in block.split('\n\n'):
        candidate = f'{current}\n\n{piece}' if current else piece
        if len(candidate) > limit and current:
            parts.append(current)
            current = piece
        else:
            current = candidate
    if current:
        parts.append(current)
    return parts


def freshness_line(received_at, now, language='en'):
    """How old the SAP data is. On EVERY message, glanced at like a fuel gauge.

    The robot only runs while the terminal PC is awake, so the app can go stale
    without anything looking wrong — laptop off since Friday and Monday's 16:00
    push shows Friday's world, formatted perfectly. This is the one failure that
    would quietly poison a whole week, so it is stated rather than warned about.
    """
    label = _t(language, 'sap_data')
    if received_at is None:
        return f'{label}: {_t(language, "never")} ⚠️'

    days = (now.date() - received_at.date()).days if hasattr(now, 'date') else 0
    if days <= 0:
        return f'{label}: {_t(language, "today")} {received_at.strftime("%H:%M")}'
    if days == 1:
        return f'{label}: 1 {_t(language, "days_old")}'
    return f'{label}: {days} {_t(language, "days_old")} ⚠️'
