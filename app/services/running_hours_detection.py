"""
Detection helpers for running-hours / twistlock checklist questions.

Centralized so the inspection write path (app/api/inspections.py) and the
running-hours dashboard reader (app/api/running_hours.py) agree on which
checklist items represent meter readings.

Keyword lists include known DB typos ("Runing") and the actual Arabic
phrasings used in production (e.g. 'عداد الساعات', not just 'ساعات التشغيل')
so AI extraction and dashboard surfacing don't silently miss data.
"""

from typing import Optional


_RNR_KEYWORDS = (
    # English (canonical + observed typos)
    'rnr reading',
    'running hour reading',
    'rnr',
    'running hours',
    'running hour',
    'runing hours',          # production typo on item #81
    'runing hour',
    'eqt runing',
    'eqt running',
    'engine hour',
    'operating hour',
    'operating time',
    # Arabic
    'ساعات التشغيل',
    'ساعة التشغيل',
    'عداد الساعات',
    'عداد ساعات',
    'ساعات تشغيل',
    'ساعات المعدة',
)


_TWL_KEYWORDS = (
    # English
    'twl count',
    'twistlock count',
    'twl',
    'twistlock',
    'twist lock',
    # Arabic
    'تويست لوك',
    'عدد التويست',
    'عداد القفالات',
    'قراءات القفالات',
    'قفالات',
)


def _combined_text(question_en: Optional[str], question_ar: Optional[str]) -> str:
    return ((question_en or '') + ' ' + (question_ar or '')).lower()


def is_running_hours_question(question_en: Optional[str], question_ar: Optional[str]) -> bool:
    """Return True if a checklist question asks for running-hours / RNR meter reading."""
    text = _combined_text(question_en, question_ar)
    return any(kw in text for kw in _RNR_KEYWORDS)


def is_twistlock_question(question_en: Optional[str], question_ar: Optional[str]) -> bool:
    """Return True if a checklist question asks for twistlock count / TWL meter reading."""
    text = _combined_text(question_en, question_ar)
    return any(kw in text for kw in _TWL_KEYWORDS)
