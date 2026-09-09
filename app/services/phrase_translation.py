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
    """Store the Arabic for a phrase. Does NOT commit."""
    key = normalise(text)
    if not key or len(key) > MAX_PHRASE_LENGTH:
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
