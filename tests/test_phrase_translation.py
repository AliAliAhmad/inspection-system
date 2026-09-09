"""The same English must always produce the same Arabic.

Ali, 2026-09-09: "the arabic translation is not good and not reliable, sometimes
not all the words are translated."

get_job_details translated a description on every request through a chain of AI
providers that is mostly down, so the same job read differently each time it was
opened. These tests pin the two properties that fixes that: a screen never calls
a provider, and a phrase has exactly one answer.
"""

from datetime import date, timedelta

import pytest

from app.extensions import db
from app.models import (PhraseTranslation, User, WorkPlan, WorkPlanDay,
                        WorkPlanJob, WorkPlanAssignment)
from app.services.phrase_translation import (normalise, remember, to_arabic,
                                             to_arabic_many)
from tests.conftest import make_equipment, get_auth_header


@pytest.fixture
def plan(db_session, engineer):
    monday = date(2026, 9, 7)
    wp = WorkPlan(week_start=monday, week_end=monday + timedelta(days=6),
                  status='published', created_by_id=engineer.id)
    db.session.add(wp)
    db.session.flush()
    for offset in range(7):
        db.session.add(WorkPlanDay(work_plan_id=wp.id,
                                   date=monday + timedelta(days=offset)))
    db.session.commit()
    return wp


@pytest.fixture
def worker(db_session):
    user = User(email='worker@test.com', full_name='Test Worker',
                role='maintenance', role_id='MNT001', shift='day',
                language='ar')
    user.set_password('test123')
    db.session.add(user)
    db.session.commit()
    return user


# ── The key ────────────────────────────────────────────────────────────────

def test_spelling_differences_share_one_answer(db_session):
    """SAP sends the same phrase spelled differently between exports. Each
    spelling must not be translated — or disagreed about — separately."""
    assert normalise('250HR  service') == normalise('250hr Service')
    assert normalise('  OIL CHANGE  ') == 'OIL CHANGE'

    remember('250HR service', 'خدمة 250 ساعة')
    db.session.commit()
    assert to_arabic('250hr  SERVICE') == 'خدمة 250 ساعة'
    assert to_arabic('250HR service') == 'خدمة 250 ساعة'


def test_an_unknown_phrase_comes_back_in_english(db_session):
    """A miss is today's behaviour, not a regression, and never an error."""
    assert to_arabic('SOMETHING NOBODY HAS TRANSLATED') == 'SOMETHING NOBODY HAS TRANSLATED'
    assert to_arabic('') == ''
    assert to_arabic(None) is None


def test_reading_never_calls_a_provider(db_session, monkeypatch):
    """THE property. A week of jobs must not be able to hang on a dead API —
    that is what made this unreliable in the first place."""
    from app.services import translation_service

    def explode(*args, **kwargs):
        raise AssertionError('a screen called a translation provider')

    monkeypatch.setattr(translation_service.TranslationService,
                        'translate_to_arabic', explode)
    remember('OIL CHANGE', 'تغيير الزيت')
    db.session.commit()
    assert to_arabic('OIL CHANGE') == 'تغيير الزيت'
    assert to_arabic('NOT IN THE STORE') == 'NOT IN THE STORE'


def test_a_persons_correction_is_never_overwritten(db_session):
    """The store is where a machine's Arabic gets corrected by hand."""
    remember('BRAKE CHECK', 'فحص الفرامل', reviewed=True)
    db.session.commit()
    remember('BRAKE CHECK', 'ترجمة آلية سيئة')       # a later machine run
    db.session.commit()
    row = PhraseTranslation.query.filter_by(source_key='BRAKE CHECK').first()
    assert row.ar_text == 'فحص الفرامل'
    assert row.is_reviewed is True


def test_many_phrases_in_one_query(db_session):
    remember('OIL CHANGE', 'تغيير الزيت')
    remember('AC SERVICE', 'خدمة التكييف')
    db.session.commit()
    out = to_arabic_many(['OIL CHANGE', 'AC SERVICE', 'UNKNOWN'])
    assert out['OIL CHANGE'] == 'تغيير الزيت'
    assert out['AC SERVICE'] == 'خدمة التكييف'
    assert 'UNKNOWN' not in out, 'a miss must not be invented'


def test_a_very_long_description_is_not_stored(db_session):
    """One-off prose is not the repeating vocabulary this is for."""
    long_text = 'X' * 300
    assert remember(long_text, 'y') is None
    assert to_arabic(long_text) == long_text


# ── On the worker's screen ─────────────────────────────────────────────────

def test_my_plan_sends_the_description_in_arabic(db_session, engineer, worker,
                                                 client, plan):
    """The card shows this now, so it has to arrive translated."""
    eq = make_equipment(db_session, serial='RS109')
    job = WorkPlanJob(work_plan_day_id=sorted(plan.days, key=lambda d: d.date)[0].id,
                      job_type='pm', equipment_id=eq.id, estimated_hours=4,
                      berth='east', description='250HR SERVICE')
    db.session.add(job)
    db.session.flush()
    db.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                      user_id=worker.id, is_lead=True))
    remember('250HR SERVICE', 'خدمة 250 ساعة')
    db.session.commit()

    headers = get_auth_header(client, 'worker@test.com', 'test123')
    resp = client.get(f'/api/work-plans/my-plan?week_start={plan.week_start}',
                      headers={**headers, 'Accept-Language': 'ar'})
    assert resp.status_code == 200, resp.get_json()
    jobs = [j for d in resp.get_json()['my_jobs'] for j in d['jobs']]
    assert jobs, resp.get_json()
    assert jobs[0]['description'] == 'خدمة 250 ساعة'


def test_english_users_are_unaffected(db_session, engineer, worker, client, plan):
    eq = make_equipment(db_session, serial='RS109')
    job = WorkPlanJob(work_plan_day_id=sorted(plan.days, key=lambda d: d.date)[0].id,
                      job_type='pm', equipment_id=eq.id, estimated_hours=4,
                      berth='east', description='250HR SERVICE')
    db.session.add(job)
    db.session.flush()
    db.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                      user_id=worker.id, is_lead=True))
    remember('250HR SERVICE', 'خدمة 250 ساعة')
    worker.language = 'en'
    db.session.commit()

    headers = get_auth_header(client, 'worker@test.com', 'test123')
    resp = client.get(f'/api/work-plans/my-plan?week_start={plan.week_start}',
                      headers=headers)
    jobs = [j for d in resp.get_json()['my_jobs'] for j in d['jobs']]
    assert jobs[0]['description'] == '250HR SERVICE'


# ── Names ──────────────────────────────────────────────────────────────────
#
# Ali, 2026-09-09: "what i care about is to have the description, employee name,
# and other main details like notes in arabic for the arabic user".
#
# A name is not translated. It is TYPED, once, by someone who knows how the man
# spells his own name — Haidar is حيدر or حيدار depending on the person, and a
# machine guessing is not a translation error, it is calling someone by the
# wrong name. Empty is the normal state and falls back to the stored spelling.

def test_a_name_falls_back_when_no_arabic_is_stored(db_session):
    u = User(email='n1@test.com', full_name='Ali Jameel Haidar',
             role='maintenance', role_id='MNT900', shift='day')
    u.set_password('x')
    db.session.add(u)
    db.session.commit()
    assert u.display_name('ar') == 'Ali Jameel Haidar'
    assert u.display_name('en') == 'Ali Jameel Haidar'


def test_a_typed_arabic_name_is_used_for_arabic_readers_only(db_session):
    u = User(email='n2@test.com', full_name='Ali Jameel Haidar',
             full_name_ar='علي جميل حيدر',
             role='maintenance', role_id='MNT901', shift='day')
    u.set_password('x')
    db.session.add(u)
    db.session.commit()
    assert u.display_name('ar') == 'علي جميل حيدر'
    assert u.display_name('en') == 'Ali Jameel Haidar', 'English readers unchanged'


def test_the_team_on_a_job_reads_in_arabic(db_session, engineer, worker, client,
                                           plan):
    """The names a worker sees beside his own job."""
    eq = make_equipment(db_session, serial='RS109')
    mate = User(email='mate@test.com', full_name='Haidar Kareem',
                full_name_ar='حيدر كريم', role='maintenance',
                role_id='MNT902', shift='day')
    mate.set_password('x')
    db.session.add(mate)
    job = WorkPlanJob(work_plan_day_id=sorted(plan.days, key=lambda d: d.date)[0].id,
                      job_type='pm', equipment_id=eq.id, estimated_hours=4,
                      berth='east', description='250HR SERVICE')
    db.session.add(job)
    db.session.flush()
    db.session.add_all([
        WorkPlanAssignment(work_plan_job_id=job.id, user_id=worker.id, is_lead=True),
        WorkPlanAssignment(work_plan_job_id=job.id, user_id=mate.id),
    ])
    db.session.commit()

    headers = get_auth_header(client, 'worker@test.com', 'test123')
    resp = client.get(f'/api/work-plans/my-plan?week_start={plan.week_start}',
                      headers=headers)
    jobs = [j for d in resp.get_json()['my_jobs'] for j in d['jobs']]
    names = [a['user_name'] for a in jobs[0]['assignments']]
    assert 'حيدر كريم' in names
    # The one with no Arabic name stored still shows as stored — not blank.
    assert 'Test Worker' in names


# ── Notes ──────────────────────────────────────────────────────────────────

def test_a_note_already_in_arabic_is_left_alone(db_session):
    """Translating Arabic into Arabic is how text gets mangled."""
    from app.api.work_plans import _note_for_reader
    arabic = 'تحقق من الفلتر قبل البدء'
    assert _note_for_reader(arabic, True) == arabic


def test_an_english_note_uses_the_store(db_session):
    from app.api.work_plans import _note_for_reader
    remember('Bring the 32mm socket', 'أحضر مفتاح 32 مم')
    db.session.commit()
    assert _note_for_reader('Bring the 32mm socket', True) == 'أحضر مفتاح 32 مم'
    # An English reader is untouched.
    assert _note_for_reader('Bring the 32mm socket', False) == 'Bring the 32mm socket'


def test_an_unknown_note_stays_english_rather_than_failing(db_session):
    from app.api.work_plans import _note_for_reader
    assert _note_for_reader('Something nobody translated', True) == 'Something nobody translated'
    assert _note_for_reader(None, True) is None


# ── The wreckage guard ─────────────────────────────────────────────────────
#
# 2026-09-09, from Ali's production run. gemini-2.5-flash is a THINKING model:
# it spends output tokens reasoning before it writes, and that was charged
# against a maxOutputTokens of 100. It thought until the allowance was gone and
# emitted a fragment — then the fragment was stored looking like a translation.
#
# The provider is fixed (thinkingBudget 0, real ceiling). This is the net
# underneath it, because a wrong phrase in the store is permanent AND invisible:
# it reads as Arabic, so nobody goes looking.

@pytest.mark.parametrize('source, arabic', [
    ('RS109-250HR-MECH.HOURLY SERVICE', 'RS'),
    ('Open rotation motor check brakes & component.', 'فحص مح'),
    # Nothing came back but the machine code it started with.
    ('ECH02-SP-(EMS)TWL INSPECTION_PB', 'ECH02-SP-(EMS)TWL INSPECTION_PB'),
    ('Steering cylinder leaking (PM)', ''),
    ('Something long enough to matter', 'xx'),
])
def test_obvious_wreckage_is_refused(db_session, source, arabic):
    from app.services.phrase_translation import looks_truncated
    assert looks_truncated(source, arabic) is True
    assert remember(source, arabic) is None
    db.session.commit()
    assert to_arabic(source) == source, 'the English must survive intact'


@pytest.mark.parametrize('source, arabic', [
    ('Tire set worn out (PM)', 'مجموعة الإطارات مهترئة (PM)'),
    # Arabic writes no short vowels, so a GOOD translation can be much shorter.
    # An early version of the guard rejected this one.
    ('General Refurbishment', 'تجديد عام'),
    ('Transmission Leak', 'تسرب الإرسال'),
    ('Front glass cracked (PM)', 'الزجاج الأمامي متصدع (PM)'),
    ('Replace Operator seat', 'استبدال مقعد المشغل'),
])
def test_real_translations_are_kept(db_session, source, arabic):
    from app.services.phrase_translation import looks_truncated
    assert looks_truncated(source, arabic) is False
    assert remember(source, arabic) is not None
    db.session.commit()
    assert to_arabic(source) == arabic


def test_a_person_may_store_something_short(db_session):
    """The guard is aimed at machines. A human saying it outranks the rule."""
    assert remember('A very long English maintenance phrase', 'قصير',
                    reviewed=True) is not None
    db.session.commit()
    assert to_arabic('A very long English maintenance phrase') == 'قصير'


def test_gemini_is_asked_not_to_think(db_session):
    """The actual cause. Translating a phrase needs no reasoning, and the
    reasoning was eating the answer."""
    import io
    src = io.open('app/services/translation_service.py', encoding='utf-8').read()
    assert '"thinkingConfig": {"thinkingBudget": 0}' in src
    assert 'max(len(text) * 3, 100)' not in src.split('_translate_gemini')[1][:2000], \
        'the starved ceiling is back'


# ── The yard's own vocabulary ──────────────────────────────────────────────
#
# From Ali's production run, 2026-09-09. The translators were working
# correctly on text they cannot possibly understand:
#
#   (PM) -> 'مساءً'              in this yard it is Preventive Maintenance
#   AC   -> 'التيار المتردد'      here it is air conditioning
#   hydr -> 'الماء' (water)      here it is hydraulic
#
# No provider will ever get these right, so they are hidden before sending.

@pytest.mark.parametrize('source', [
    'Cabin Slide Door (PM)',
    'Backlight missing (PM)',
    'Steering cylinder(PM)',
    'Landing Pin -PM',
    'Inspection AC System',
    'hydr control solenoid leaking (PM)',
    'HVAC fan abmormal sound',
    'RS109-250HR-MECH.HOURLY SERVICE',
    'TT030-25/5H-MECH. HOURLY SERVICE',
    'ECH02-SP-(EMS)TWL INSPECTION_PB',
    'Tire set worn out (PM)',
])
def test_the_yards_words_survive_a_round_trip(source):
    """Whatever the translator does, these come back exactly as they went in."""
    from app.services.phrase_translation import protect_terms, restore_terms
    masked, protected = protect_terms(source)
    assert restore_terms(masked, protected) == source


def test_pm_is_hidden_from_the_translator():
    """The specific thing that produced 'in the evening' on Ali's crews' screens."""
    from app.services.phrase_translation import protect_terms
    masked, protected = protect_terms('Cabin Slide Door (PM)')
    assert '(PM)' not in masked
    assert '(PM)' in protected.values()


def test_real_words_are_still_translated():
    """Protection must hide the vocabulary, not the sentence around it."""
    from app.services.phrase_translation import protect_terms
    masked, _ = protect_terms('RS109-250HR-MECH.HOURLY SERVICE')
    assert 'HOURLY' in masked and 'SERVICE' in masked, \
        'a greedy code pattern swallowed real words'
    masked, _ = protect_terms('Cabin Slide Door (PM)')
    assert 'Cabin Slide Door' in masked


def test_restoring_survives_a_reordered_sentence():
    """Arabic is right-to-left; the placeholder moves. It must still come back."""
    from app.services.phrase_translation import protect_terms, restore_terms
    masked, protected = protect_terms('Backlight missing (PM)')
    token = list(protected)[0]
    assert restore_terms(f'{token} الإضاءة الخلفية مفقودة', protected) \
        == '(PM) الإضاءة الخلفية مفقودة'


@pytest.mark.parametrize('source, must_still_reach_translator', [
    # From Ali's third run. The code pattern was eating the English words
    # beside it, so 'FL311-HOURLY SERVICE' came back as 'خدمة FL311-HOURLY' —
    # the machine name preserved and the actual work half-named.
    ('FL311-HOURLY SERVICE', ['HOURLY', 'SERVICE']),
    ('FL302-HOURLY SERVICE', ['HOURLY', 'SERVICE']),
    ('TR064-MECHANICAL INSPECTION', ['MECHANICAL', 'INSPECTION']),
    ('TT033-25/5H-MECH. HOURLY SERVICE', ['HOURLY', 'SERVICE']),
    ('RS109-250HR-MECH.HOURLY SERVICE', ['HOURLY', 'SERVICE']),
])
def test_a_code_never_eats_the_words_beside_it(source, must_still_reach_translator):
    from app.services.phrase_translation import protect_terms
    masked, _ = protect_terms(source)
    for word in must_still_reach_translator:
        assert word in masked, f'{word!r} was swallowed by the code pattern'


@pytest.mark.parametrize('source', [
    'FL311-HOURLY SERVICE',
    'TR064-MECHANICAL INSPECTION',
    'TT033-25/5H-MECH. HOURLY SERVICE',
    'ECH02-SP-(EMS)TWL INSPECTION_PB',
])
def test_no_placeholder_is_glued_onto_a_word(source):
    """'MECH' matching the front of 'MECHANICAL' left 'ANICAL' stranded."""
    import re
    from app.services.phrase_translation import protect_terms
    masked, _ = protect_terms(source)
    assert not re.search(r'XQZ[A-Za-z]', masked), \
        f'a word was cut in half: {masked}'


# ── The yard's words, in Arabic ────────────────────────────────────────────
#
# Ali, 2026-09-09: "i need those to be translated, any description, MY TEAM ARE
# ARABIC". Leaving (PM) and AC in Latin letters was the cautious choice and the
# wrong one.

@pytest.mark.parametrize('source, translated_body, expected_tail', [
    ('Cabin Slide Door (PM)', 'باب منزلق للمقصورة', '(صيانة وقائية)'),
    ('Backlight missing (PM)', 'الإضاءة الخلفية مفقودة', '(صيانة وقائية)'),
    ('Landing Pin -PM', 'دبوس الهبوط', '-صيانة وقائية'),
])
def test_pm_comes_back_as_preventive_maintenance(source, translated_body,
                                                 expected_tail):
    from app.services.phrase_translation import protect_terms, restore_terms
    masked, protected = protect_terms(source)
    token = list(protected)[0]
    out = restore_terms(f'{translated_body} {token}', protected, arabic=True)
    assert out == f'{translated_body} {expected_tail}'
    assert 'مساء' not in out, 'PM must never read as the evening again'


def test_a_machine_code_stays_a_machine_code():
    """RS109 is painted on the machine. It is a name, not a word."""
    from app.services.phrase_translation import protect_terms, restore_terms
    masked, protected = protect_terms('RS109-250HR-MECH.HOURLY SERVICE')
    token = list(protected)[0]
    out = restore_terms(f'{token}. خدمة كل ساعة', protected, arabic=True)
    assert out.startswith('RS109-250HR-MECH')


def test_english_restore_is_unchanged():
    """Without arabic=True nothing moves — the round-trip guarantee holds."""
    from app.services.phrase_translation import protect_terms, restore_terms
    for src in ['Cabin Slide Door (PM)', 'Inspection AC System']:
        assert restore_terms(*protect_terms(src)) == src


def test_an_unknown_abbreviation_is_left_alone(db_session):
    """PR is not in the glossary because nobody has said what it means, and a
    confident wrong expansion is worse than the letters."""
    from app.services.phrase_translation import protect_terms, restore_terms
    masked, protected = protect_terms('Cabin Door Lock (PR)')
    token = list(protected)[0]
    out = restore_terms(f'قفل باب المقصورة {token}', protected, arabic=True)
    assert out.endswith('(PR)')


# ── Correcting the machine ─────────────────────────────────────────────────
#
# From Ali's full run over all 387 phrases. Every one of these is a translator
# choosing the everyday meaning of a word that means something else in a
# workshop, and no provider will ever do better:
#
#   'Fifth Wheel bushes'  -> شجيرات   garden shrubs; a bush is a جلبة
#   'Transmission Issue'  -> الإرسال  broadcasting; the gearbox is ناقل الحركة
#   'Steering gear issue' -> قضية     a legal case
#   'hose worn'           -> ارتداء   wearing clothes
#
# The only cure is a person who knows the yard, so the store has to let him say
# so once and be obeyed forever.

def test_a_correction_outlives_every_later_run(db_session):
    remember('Fifth Wheel bushes', 'شجيرات العجلة الخامسة')   # what a machine said
    db.session.commit()
    assert to_arabic('Fifth Wheel bushes') == 'شجيرات العجلة الخامسة'

    remember('Fifth Wheel bushes', 'جلب العجلة الخامسة', reviewed=True)  # what Ali says
    db.session.commit()
    assert to_arabic('Fifth Wheel bushes') == 'جلب العجلة الخامسة'

    # A later machine run must not undo him.
    remember('Fifth Wheel bushes', 'شجيرات مرة أخرى')
    db.session.commit()
    assert to_arabic('Fifth Wheel bushes') == 'جلب العجلة الخامسة'


def test_a_correction_survives_a_different_spelling(db_session):
    """SAP's capitalisation drifts between exports; a correction must not."""
    remember('FIFTH  WHEEL  BUSHES', 'جلب العجلة الخامسة', reviewed=True)
    db.session.commit()
    assert to_arabic('Fifth Wheel bushes') == 'جلب العجلة الخامسة'


@pytest.mark.parametrize('wrong_word', [
    'شجيرات',          # garden shrubs, for a bush
    'الإرسال',          # broadcasting, for the gearbox
    'قضية',            # a legal case, for a fault
    'ارتداء',          # wearing clothes, for worn out
    'مساء',            # the evening, for (PM)
    'التيار المتردد',   # alternating current, for air conditioning
])
def test_the_review_list_knows_a_workshop_word_when_it_sees_one(wrong_word):
    """These are the words review-phrases puts in front of a person."""
    import io
    src = io.open('app/__init__.py', encoding='utf-8').read()
    block = src.split('WRONG_MEANINGS = (')[1].split(')')[0]
    assert wrong_word in block, f'{wrong_word} is no longer flagged for review'
