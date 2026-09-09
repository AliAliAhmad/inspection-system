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
