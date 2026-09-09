"""One English phrase out of SAP and its Arabic, remembered once.

The behaviour and the reasoning live in app/services/phrase_translation.py —
this is only the table, kept here because app/models/__init__ cannot import from
services without a circular import.
"""

from datetime import datetime

from app.extensions import db


class PhraseTranslation(db.Model):
    """One English phrase and its Arabic, remembered."""

    __tablename__ = 'phrase_translations'

    id = db.Column(db.Integer, primary_key=True)
    # The normalised key. Unique, because the whole point is one answer per phrase.
    source_key = db.Column(db.String(220), nullable=False, unique=True, index=True)
    # The phrase as it was first seen, for a human reading the table.
    source_text = db.Column(db.Text, nullable=False)
    ar_text = db.Column(db.Text, nullable=True)
    # True once a person has checked or corrected it. The filler never touches
    # a reviewed row, so a hand-written correction is permanent.
    is_reviewed = db.Column(db.Boolean, default=False, nullable=False)
    # How often this phrase has been asked for — tells you which ones are worth
    # a human's attention first.
    hits = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow,
                           onupdate=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f'<PhraseTranslation {self.source_key[:40]!r}>'
