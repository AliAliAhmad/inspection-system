"""One finger decides. The other phones stop.

Every planner's phone is holding the same question. If two of them press, the
work must happen once — and the guard for that is not the update-id cache
(which is in memory, per gunicorn worker, and could never see two DIFFERENT
people pressing). It is one atomic UPDATE:

    UPDATE telegram_proposals SET status=... WHERE id=... AND status='open'

Whoever's UPDATE changes one row won. Everyone else reads zero and is told who
beat them.

ON ANSWERING: Telegram accepts exactly ONE answerCallbackQuery per press. So
this module answers once, at the very end, in a `finally` — carrying the
outcome, and guaranteed even when the apply step raises. Answering first would
stop the spinner sooner but would make it impossible to say what happened.
"""

import logging
from datetime import datetime

from app.extensions import db
from app.models import TelegramProposal
from app.services.telegram.ask import edit_everyone, keyboard
from app.services.telegram.client import TelegramClient
from app.services.telegram.dispatcher import language_for
from app.services.telegram.generate import PLANNING_ROLES

logger = logging.getLogger(__name__)

PREFIX = 'tp'

# kind -> apply(proposal, option, user) -> dict written to proposal.result
_APPLY = {}

WORDS = {
    'en': {
        'unknown': 'That button means nothing to me any more.',
        'not_allowed': 'Only a planner can change the plan.',
        'too_old': 'This question is old. A new one comes tonight.',
        'already': 'Already decided by {who}.',
        'declined': '{who} said no.',
        'accepted': '{who} said yes.',
        'failed': 'It did not work: {error}',
        'pick': 'Pick a day.',
    },
    'ar': {
        'unknown': 'هذا الزر لم يعد يعني شيئاً.',
        'not_allowed': 'فقط المخطط يستطيع تغيير الخطة.',
        'too_old': 'هذا السؤال قديم. سؤال جديد يأتي الليلة.',
        'already': 'قرّرها {who} قبلك.',
        'declined': '{who} رفض.',
        'accepted': '{who} وافق.',
        'failed': 'لم ينجح: {error}',
        'pick': 'اختر يوماً.',
    },
}


def _t(language, key, **fields):
    table = WORDS.get(language, WORDS['en'])
    text = table.get(key, WORDS['en'][key])
    return text.format(**fields) if fields else text


def register(kind):
    """Attach an apply function to a kind of question."""
    def decorate(fn):
        _APPLY[kind] = fn
        return fn
    return decorate


def parse(data):
    """'tp:12:0' -> (12, 0). Anything else -> None."""
    parts = (data or '').split(':')
    if len(parts) != 3 or parts[0] != PREFIX:
        return None
    try:
        return int(parts[1]), int(parts[2])
    except (TypeError, ValueError):
        return None


def claim(proposal_id, user, option, status, now=None):
    """First press wins. Returns True to the winner, False to everybody else.

    One UPDATE with the whole guard in its WHERE clause, so the database — not
    this process, and not the ordering of two gunicorn workers — decides.
    """
    now = now or datetime.utcnow()
    changed = db.session.query(TelegramProposal).filter(
        TelegramProposal.id == proposal_id,
        TelegramProposal.status == 'open',
        TelegramProposal.expires_at > now,
    ).update({'status': status,
              'decided_by_id': user.id,
              'decided_option': option.get('key'),
              'decided_at': now},
             synchronize_session=False)
    db.session.commit()
    return changed == 1


def _expand(proposal, option, user, language, client):
    """'Pick a day': more buttons, same question, nobody has decided yet.

    The new options are APPENDED. Renumbering the list would turn somebody
    else's "No" — still on their screen, still carrying position 1 — into
    "Tuesday".
    """
    added = option.get('expand') or []
    proposal.options = list(proposal.options or []) + list(added)
    db.session.commit()
    # Only the presser's own copy changes; everyone else's question is still
    # true and still answerable.
    for row in proposal.messages:
        if row.user_id == user.id and row.message_id is not None:
            client.edit_message_text(
                row.chat_id, row.message_id,
                f'{proposal.summary}\n\n{_t(row.language, "pick")}',
                reply_markup=keyboard(proposal, row.language))


_registered = False


def _ensure_kinds_registered():
    """Import the producers so their @register decorators have run.

    Lazy and inside a function on purpose: the producers import this module for
    `register`, so a module-scope import would be a cycle.

    Guarded by a FLAG, never by `if _APPLY:`. Anything at all may have put a
    kind in that dict first — Task 4's own tests register a throwaway kind, and
    pytest runs test_telegram_taps.py before test_urgent_watch.py — and a
    non-empty dict would then stop the real producers from ever loading. The
    flag also leaves room for the second producer in Stage 2.
    """
    global _registered
    if _registered:
        return
    _registered = True
    from app.services import urgent_watch  # noqa: F401
    from app.services import crew_free  # noqa: F401


def handle_callback(update, user, client=None):
    """Handle one tap. Never raises."""
    _ensure_kinds_registered()
    query = (update.get('callback_query') or {})
    query_id = query.get('id')
    client = client or TelegramClient()
    language = language_for(user, update)
    toast = None

    try:
        parsed = parse(query.get('data'))
        if parsed is None:
            toast = _t(language, 'unknown')
            return

        proposal_id, index = parsed
        proposal = db.session.get(TelegramProposal, proposal_id)
        if proposal is None or index >= len(proposal.options or []):
            toast = _t(language, 'unknown')
            return

        option = proposal.options[index]

        if user.role not in PLANNING_ROLES:
            toast = _t(language, 'not_allowed')
            return

        if proposal.expires_at <= datetime.utcnow():
            toast = _t(language, 'too_old')
            return

        if option.get('action') == 'expand':
            _expand(proposal, option, user, language, client)
            return

        wanted = 'declined' if option.get('action') == 'decline' else 'accepted'
        if not claim(proposal.id, user, option, wanted):
            db.session.refresh(proposal)
            who = getattr(proposal.decided_by, 'full_name', '') or '?'
            toast = _t(language, 'already', who=who)
            return

        who = user.full_name or user.email
        if wanted == 'declined':
            proposal.result = {'declined_by': user.id}
            db.session.commit()
            toast = _t(language, 'declined', who=who)
            edit_everyone(proposal,
                          {lang: f'{proposal.summary}\n\n'
                                 f'{_t(lang, "declined", who=who)}'
                           for lang in WORDS},
                          client=client)
            return

        apply_fn = _APPLY.get(proposal.kind)
        try:
            result = apply_fn(proposal, option, user) if apply_fn else {}
        except Exception as e:  # noqa: BLE001
            # An apply function NEVER commits — it flushes, and the commit
            # below covers its work and the result row together. So a raise
            # here really does roll the plan change back. What it does NOT
            # undo is the claim: claim() committed the accepted/declined
            # status before apply_fn started, which is why the failure is
            # recorded in a SECOND, separate transaction — the record of a
            # failure has to survive the rollback that caused it.
            db.session.rollback()
            logger.exception('telegram tap apply failed | proposal=%s',
                             proposal.id)
            failed = db.session.get(TelegramProposal, proposal_id)
            failed.status = 'failed'
            failed.result = {'error': f'{type(e).__name__}: {e}'[:400]}
            db.session.commit()
            toast = _t(language, 'failed',
                       error=f'{type(e).__name__}: {e}'[:120])
            return

        proposal.result = result
        db.session.commit()
        toast = _t(language, 'accepted', who=who)
        edit_everyone(proposal,
                      {lang: f'{proposal.summary}\n\n'
                             f'{_t(lang, "accepted", who=who)}'
                       for lang in WORDS},
                      client=client)
    except Exception:  # noqa: BLE001
        logger.exception('telegram tap failed')
        toast = toast or _t(language, 'unknown')
    finally:
        if query_id:
            client.answer_callback_query(query_id, text=toast)
