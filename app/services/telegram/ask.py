"""Ask every planner one question, and remember where it landed.

This module knows nothing about WHAT is being asked. It takes some text, some
buttons and an expiry, puts a copy on every planner's phone, and writes down
which message id landed in which chat — because that is the only way to grey
out the other copies once one person has decided.
"""

import logging
from datetime import datetime

from app.extensions import db
from app.models import TelegramProposal, TelegramProposalMessage, User
from app.services.telegram.auth import allowlist
from app.services.telegram.client import TelegramClient

logger = logging.getLogger(__name__)

PLANNING_ROLES = ('admin', 'engineer')


def recipients():
    """Everyone who could act on this AND has a phone the bot can reach.

    Two lists and BOTH are required. The roles say who may change a plan (the
    same pair `/generate` uses, and the same set `sap_removal_rules._planners`
    tells about removals); the allowlist says whose Telegram id maps to an app
    user. A planner who is not on the allowlist is simply not asked — the bot
    has no way to reach him — and a man on the allowlist who is not a planner
    is not asked either, because the allowlist was never a permission.
    """
    by_app_id = {app_id: tg_id for tg_id, app_id in allowlist().items()}
    people = User.query.filter(
        User.role.in_(PLANNING_ROLES),
        User.is_active.is_(True),
    ).order_by(User.id).all()
    return [(u, by_app_id[u.id]) for u in people if u.id in by_app_id]


def _label(option, language):
    return (option.get(f'label_{language}')
            or option.get('label_en')
            or option.get('key', '?'))


def keyboard(proposal, language):
    """One button per option, one per row (phone screens are narrow).

    `callback_data` carries ONLY 'tp:<proposal id>:<position>'. Never a job
    number, never anything secret: Telegram caps callback_data at 64 bytes and
    a position stays tiny no matter how long the label is. It is also why
    `proposal.options` must only ever be appended to — other phones are still
    displaying the old positions.
    """
    rows = []
    for index, option in enumerate(proposal.options or []):
        rows.append([{'text': _label(option, language),
                      'callback_data': f'tp:{proposal.id}:{index}'}])
    return {'inline_keyboard': rows}


def ask(kind, text_by_language, options, expires_at, details=None,
        work_plan_id=None, target_day_id=None, client=None):
    """Write one question in the notebook and put it on every planner's phone.

    Returns the proposal, or None when there was nobody to ask — an empty
    allowlist, no planners, an unconfigured bot. That is not an error worth
    raising: it would abort a whole nightly sweep over a setting somebody has
    not filled in yet, exactly as the scheduled pushes already decline to.
    """
    people = recipients()
    if not people:
        logger.debug('telegram ask (%s) skipped — nobody to ask', kind)
        return None

    proposal = TelegramProposal(
        kind=kind,
        summary=text_by_language.get('en', ''),
        details=details or {},
        options=options,
        work_plan_id=work_plan_id,
        target_day_id=target_day_id,
        status='open',
        expires_at=expires_at,
    )
    db.session.add(proposal)
    db.session.flush()      # the buttons need proposal.id

    client = client or TelegramClient()
    for user, chat_id in people:
        language = getattr(user, 'language', None) or 'en'
        text = text_by_language.get(language) or text_by_language.get('en', '')
        sent = client.send_message(chat_id, text,
                                   reply_markup=keyboard(proposal, language))
        db.session.add(TelegramProposalMessage(
            proposal_id=proposal.id, user_id=user.id, chat_id=chat_id,
            message_id=(sent or {}).get('message_id'), language=language))

    db.session.commit()
    logger.info('telegram ask | kind=%s id=%s phones=%d',
                kind, proposal.id, len(people))
    return proposal


def edit_everyone(proposal, text_by_language, client=None):
    """Rewrite every copy of a decided question and take its buttons away.

    An empty `inline_keyboard` is what removes them; omitting reply_markup
    LEAVES them, which is the opposite of what a decided question wants. A row
    whose message_id is NULL is skipped — that phone never got the question.

    Never raises. The plan change has already happened by the time this runs;
    a phone left showing stale buttons is wrong-looking, not wrong-acting,
    because pressing them loses the claim and says who decided.
    """
    client = client or TelegramClient()
    for row in proposal.messages:
        if row.message_id is None:
            continue
        text = (text_by_language.get(row.language)
                or text_by_language.get('en', ''))
        client.edit_message_text(row.chat_id, row.message_id, text,
                                 reply_markup={'inline_keyboard': []})


def expire_open(kind, now=None, force=False):
    """Close every still-open question of one kind. Returns how many.

    Called at the start of the nightly sweep so last night's buttons stop
    working before tonight's are sent.

    `force=True` expires every OPEN row of this kind, ignoring `expires_at`.
    A nightly watch's own proposal is created a few seconds AFTER that
    night's sweep starts (pricing and a dry-run `make_room` over many orders
    take time), so its `expires_at` — ask moment + 24h — always lands a few
    seconds LATER than the following night's time-based sweep. A plain
    `expires_at <= now` check would then leave it open, `_already_open` would
    see it and suppress the fresh ask, and an ignored urgent order would only
    be re-raised every OTHER night. Ali's rule is every night: press No and
    it asks again tomorrow night, so the nightly watch calls this with
    `force=True` — its first act is closing EVERY still-open row of its own
    kind, not just the ones whose clock has run out. The default stays
    time-based because other callers (and `TestAskingEverybody::
    test_expiring_closes_only_its_own_kind`) rely on `expire_open` leaving a
    still-fresh proposal alone.
    """
    now = now or datetime.utcnow()
    query = TelegramProposal.query.filter(
        TelegramProposal.kind == kind,
        TelegramProposal.status == 'open',
    )
    if not force:
        query = query.filter(TelegramProposal.expires_at <= now)
    stale = query.all()
    for proposal in stale:
        proposal.status = 'expired'
    if stale:
        db.session.commit()
    return len(stale)
