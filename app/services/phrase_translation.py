"""Arabic for the short, repeating phrases that come out of SAP.

Ali, 2026-09-09: "the arabic translation is not good and not reliable, sometimes
not all the words are translated."

Both halves of that sentence have the same cause. `get_job_details` translated a
job description on EVERY request, uncached, through a seven-provider AI chain
that is mostly down — Groq answers 401, OpenAI has no credits, Gemini is rate
limited. So the same job opened twice gave English once and Arabic the next
time, and when Arabic did arrive it was whatever that provider felt like saying
that minute. Unreliable in the exact sense he means: not wrong so much as
*different every time*.

SAP maintenance text is not free prose. It is a small vocabulary repeated across
thousands of orders — "250HR SERVICE", "AC SYSTEM CHECK", "OIL AND FILTER
CHANGE". Translating one of those a thousand times is a thousand chances to
disagree with yourself. Translating it ONCE and remembering the answer is both
cheaper and, more importantly, CONSISTENT: the same English always produces the
same Arabic, which is what makes a screen trustworthy.

So:

  * a phrase is translated once, ever, and stored by its own text — not by the
    row that happened to contain it, because the next thousand rows say the same
    thing;
  * a screen NEVER waits on a translation. `to_arabic()` reads the store and
    nothing else. A miss returns the English, which is exactly today's behaviour
    and is not a regression;
  * filling the store is a separate, deliberate act — `flask translate-phrases`
    — so a dead provider slows nobody down and a planner can see what happened.

The store is also the place to correct a machine's Arabic by hand. `is_reviewed`
marks a phrase a human has approved, and the filler never overwrites one.
"""

import logging
import re
import unicodedata

from app.extensions import db
from app.models.phrase_translation import PhraseTranslation

logger = logging.getLogger(__name__)

_ARABIC_CHARS = re.compile(r'[\u0600-\u06FF]')

# Long descriptions are not the repeating vocabulary this is for; they are
# one-offs, and storing them would fill the table with rows that never hit again.
MAX_PHRASE_LENGTH = 200


def normalise(text):
    """The key a phrase is stored under.

    NFC, collapsed whitespace, upper case. SAP sends the same phrase with
    different spacing and capitalisation from one export to the next, and each
    spelling would otherwise be paid for separately.
    """
    if not text:
        return ''
    text = unicodedata.normalize('NFC', str(text))
    return re.sub(r'\s+', ' ', text).strip().upper()


def looks_truncated(source, arabic):
    """True when a translation is obviously a fragment rather than a translation.

    Written after 2026-09-09, when a starved gemini-2.5-flash returned:

        'AC Issue'                        -> 'مشكلة تكي'      (cut mid-word)
        'Coolant System Issue'            -> 'مشكلة في نظام'
        'RS109-250HR-MECH.HOURLY SERVICE' -> 'RS'

    and every one of them was stored as though it were correct. The provider
    bug is fixed, but a store that outlives the provider must not depend on the
    provider behaving. A wrong phrase here is permanent and invisible: it looks
    like a translation, so nobody goes looking.

    WHAT THIS CAN AND CANNOT CATCH, measured against those real cases.

    Arabic is genuinely compact — it writes no short vowels — so length alone is
    a weak signal. "General Refurbishment" -> "تجديد عام" is a GOOD translation
    at 43% of the length, and an early version of this function rejected it. The
    threshold therefore sits below that, at 30%, which still catches the
    destroyed ones ('RS' at 6%, 'فحص مح' at 13%).

    It does NOT catch 'AC Issue' -> 'مشكلة تكي'. That is a word cut in half at
    roughly the right total length, and no length rule will ever see it. The
    provider fix is what stops those; this is the net underneath, for the
    obvious wreckage, and it is deliberately not claimed to be more.
    """
    if not source or not arabic:
        return True
    src = str(source).strip()
    out = str(arabic).strip()
    if not out:
        return True
    # Nothing came back but the machine code it started with.
    if out == src:
        return True
    if len(out) < len(src) * 0.30:
        return True
    # A word cut in half leaves no closing punctuation and no Arabic at all.
    if len(src) > 12 and not _ARABIC_CHARS.search(out):
        return True
    return False


def to_arabic(text):
    """Arabic for `text` if we already know it, otherwise `text` unchanged.

    Never calls a translation provider, never raises, never blocks. A screen
    rendering a week of jobs must not be able to hang on an external API — that
    is what made this unreliable in the first place.
    """
    if not text:
        return text
    key = normalise(text)
    if not key or len(key) > MAX_PHRASE_LENGTH:
        return text
    try:
        row = PhraseTranslation.query.filter_by(source_key=key).first()
    except Exception:
        # A server that has not restarted into the new schema yet must keep
        # serving English rather than failing the whole screen.
        logger.debug('phrase store unavailable', exc_info=True)
        return text
    if row and row.ar_text:
        return row.ar_text
    return text


def to_arabic_many(texts):
    """{original: arabic-or-original} for many phrases in ONE query.

    /my-plan renders a whole week. Asking per job is the N+1 that this codebase
    has already paid for twice.
    """
    wanted = {}
    for text in texts:
        if not text:
            continue
        key = normalise(text)
        if key and len(key) <= MAX_PHRASE_LENGTH:
            wanted.setdefault(key, []).append(text)
    if not wanted:
        return {}

    try:
        rows = (PhraseTranslation.query
                .filter(PhraseTranslation.source_key.in_(list(wanted)))
                .all())
    except Exception:
        logger.debug('phrase store unavailable', exc_info=True)
        return {}

    out = {}
    for row in rows:
        if not row.ar_text:
            continue
        for original in wanted.get(row.source_key, []):
            out[original] = row.ar_text
    return out


def remember(text, ar_text, reviewed=False):
    """Store the Arabic for a phrase. Does NOT commit.

    Refuses anything that looks like a fragment, unless a PERSON is saying it —
    a human may legitimately store something short. A machine may not.
    """
    key = normalise(text)
    if not key or len(key) > MAX_PHRASE_LENGTH:
        return None
    if not reviewed and looks_truncated(text, ar_text):
        logger.warning('refused a truncated translation: %r -> %r', text, ar_text)
        return None
    row = PhraseTranslation.query.filter_by(source_key=key).first()
    if row is None:
        row = PhraseTranslation(source_key=key, source_text=str(text).strip())
        db.session.add(row)
    # A person's correction outranks anything a machine produces later.
    if row.is_reviewed and not reviewed:
        return row
    row.ar_text = ar_text
    row.is_reviewed = bool(reviewed) or row.is_reviewed
    return row


def note_seen(keys):
    """Bump the hit counter for phrases actually asked for. Best-effort."""
    if not keys:
        return
    try:
        (PhraseTranslation.query
         .filter(PhraseTranslation.source_key.in_(list(keys)))
         .update({PhraseTranslation.hits: PhraseTranslation.hits + 1},
                 synchronize_session=False))
    except Exception:
        logger.debug('could not record phrase hits', exc_info=True)
