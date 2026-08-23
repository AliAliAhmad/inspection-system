"""
The Telegram bot: who it answers, and what it says.

Entirely offline. TelegramClient is replaced by a recorder, so nothing here
touches api.telegram.org and the whole command surface is exercised against the
real database.

The gates are tested from the outside — through the webhook — because that is
where a mistake is exploitable. The renderer is tested directly, because that is
where a mistake is merely embarrassing.
"""

from datetime import date, datetime, timedelta

import pytest

from app.models import Equipment, SapReconciliationEvent, SapSyncFile, User
from app.models import WorkPlan, WorkPlanAssignment, WorkPlanDay, WorkPlanJob
from app.services.telegram import renderer
from app.services.telegram.auth import allowlist
from app.services.telegram.dispatcher import handle
from tests.conftest import make_equipment

SECRET = 'webhook-secret-value'
ALI_TELEGRAM_ID = 1811629337
STRANGER_TELEGRAM_ID = 999000111


@pytest.fixture
def bot(app, admin_user):
    """A configured bot whose only allowed sender is the admin."""
    app.config['TELEGRAM_BOT_TOKEN'] = 'test-token'
    app.config['TELEGRAM_WEBHOOK_SECRET'] = SECRET
    app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
    # The dedupe cache is deliberately in-memory and per-worker, so it survives
    # between tests in one process the way it survives between requests.
    from app.api.telegram import _seen_updates
    _seen_updates.clear()
    yield app


class Recorder:
    """Stands in for TelegramClient. Records instead of sending."""

    def __init__(self):
        self.messages = []

    def send_message(self, chat_id, text, reply_markup=None):
        self.messages.append((chat_id, text))
        return {'message_id': len(self.messages)}

    def send_chunks(self, chat_id, chunks):
        for chunk in chunks:
            self.send_message(chat_id, chunk)
        return len(chunks)

    @property
    def text(self):
        return '\n'.join(text for _, text in self.messages)


@pytest.fixture
def recorder(monkeypatch):
    recorder = Recorder()
    monkeypatch.setattr('app.api.telegram.TelegramClient', lambda *a, **k: recorder)
    return recorder


def _update(text='/ping', telegram_id=ALI_TELEGRAM_ID, chat_type='private',
            update_id=1, language_code='en'):
    return {
        'update_id': update_id,
        'message': {
            'message_id': update_id,
            'text': text,
            'from': {'id': telegram_id, 'is_bot': False, 'first_name': 'Ali',
                     'language_code': language_code},
            'chat': {'id': telegram_id, 'type': chat_type},
        },
    }


def _post(client, update, secret=SECRET, header=SECRET):
    headers = {}
    if header is not None:
        headers['X-Telegram-Bot-Api-Secret-Token'] = header
    return client.post(f'/api/telegram/webhook/{secret}', json=update, headers=headers)


def _wait_for(recorder, count=1, timeout=3.0):
    """The webhook ACKs immediately and works in a thread."""
    import time
    deadline = time.time() + timeout
    while time.time() < deadline:
        if len(recorder.messages) >= count:
            return True
        time.sleep(0.02)
    return False


class TestTheFourGates:
    """Failing any gate produces SILENCE, never a refusal."""

    def test_ali_gets_an_answer(self, client, bot, recorder, db_session):
        response = _post(client, _update('/ping'))
        assert response.status_code == 200
        assert _wait_for(recorder)
        assert 'pong' in recorder.text

    def test_a_stranger_gets_nothing(self, client, bot, recorder, db_session):
        """Not an error — an error confirms the bot exists."""
        response = _post(client, _update('/ping', telegram_id=STRANGER_TELEGRAM_ID))
        assert response.status_code == 200
        assert not _wait_for(recorder, timeout=0.5)

    def test_a_group_chat_is_ignored(self, client, bot, recorder, db_session):
        """A bot that answers in a group answers to everyone in the group."""
        response = _post(client, _update('/ping', chat_type='group'))
        assert response.status_code == 200
        assert not _wait_for(recorder, timeout=0.5)

    def test_a_wrong_secret_header_is_ignored(self, client, bot, recorder, db_session):
        response = _post(client, _update('/ping'), header='not-the-secret')
        assert response.status_code == 200
        assert not _wait_for(recorder, timeout=0.5)

    def test_a_missing_secret_header_is_ignored(self, client, bot, recorder, db_session):
        response = _post(client, _update('/ping'), header=None)
        assert response.status_code == 200
        assert not _wait_for(recorder, timeout=0.5)

    def test_a_wrong_path_is_ignored(self, client, bot, recorder, db_session):
        response = _post(client, _update('/ping'), secret='guessed-path')
        assert response.status_code == 200
        assert not _wait_for(recorder, timeout=0.5)

    def test_an_unconfigured_bot_refuses_everything(self, client, app, recorder,
                                                    db_session, admin_user):
        """A half-configured deploy must be a dead bot, never an open endpoint.

        Posting to a REAL path with a REAL header — the only thing missing is the
        configured secret. An earlier version of this test posted to an empty
        path, which 404s before any check runs, so it passed even with the
        header check deleted.
        """
        app.config['TELEGRAM_WEBHOOK_SECRET'] = ''
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'

        response = _post(client, _update('/ping'), secret='anything', header='anything')

        assert response.status_code == 200
        assert not _wait_for(recorder, timeout=0.5)

    def test_no_configured_secret_never_means_accept_anything(self, app):
        """The gate itself, not just the route that happens to guard it first."""
        from app.services.telegram.auth import secret_header_ok
        app.config['TELEGRAM_WEBHOOK_SECRET'] = ''
        assert secret_header_ok('') is False
        assert secret_header_ok(None) is False
        assert secret_header_ok('anything') is False

    def test_the_configured_secret_must_match_exactly(self, bot):
        from app.services.telegram.auth import secret_header_ok
        assert secret_header_ok(SECRET) is True
        assert secret_header_ok(SECRET + 'x') is False
        assert secret_header_ok(SECRET[:-1]) is False

    def test_an_allowlist_pointing_at_a_missing_user_is_ignored(
            self, client, app, recorder, db_session):
        app.config['TELEGRAM_BOT_TOKEN'] = 'test-token'
        app.config['TELEGRAM_WEBHOOK_SECRET'] = SECRET
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:999999'
        response = _post(client, _update('/ping'))
        assert response.status_code == 200
        assert not _wait_for(recorder, timeout=0.5)


class TestTelegramNeverRetriesTwice:
    def test_a_redelivered_update_is_handled_once(self, client, bot, recorder,
                                                  db_session):
        """Telegram redelivers until it gets a 200; a slow ACK means duplicates."""
        _post(client, _update('/ping', update_id=77))
        assert _wait_for(recorder)
        _post(client, _update('/ping', update_id=77))
        import time
        time.sleep(0.3)
        assert len(recorder.messages) == 1


class TestTheAllowlist:
    def test_it_carries_identity_as_well_as_permission(self, bot, admin_user):
        assert allowlist() == {ALI_TELEGRAM_ID: admin_user.id}

    def test_a_malformed_entry_is_dropped_not_crashed(self, app):
        app.config['TELEGRAM_ALLOWED_USERS'] = '123:4, nonsense, 456:7,:,'
        assert allowlist() == {123: 4, 456: 7}

    def test_an_empty_setting_allows_nobody(self, app):
        app.config['TELEGRAM_ALLOWED_USERS'] = ''
        assert allowlist() == {}


@pytest.fixture
def week(db_session, admin_user):
    """A plan for the current week with one job on today."""
    today = date.today()
    start = today - timedelta(days=today.weekday())
    plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                    status='draft', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=today)
    db_session.session.add(day)
    db_session.session.commit()
    return plan, day


def _worker(db_session, full_name, email):
    user = User(email=email, full_name=full_name, role='specialist',
                role_id=email.split('@')[0].upper()[:6], shift='day')
    user.set_password('test123')
    db_session.session.add(user)
    db_session.session.commit()
    return user


def _job(db_session, day, **kwargs):
    equipment = kwargs.pop('equipment', None)
    fields = dict(work_plan_day_id=day.id, job_type='pm', berth='east',
                  estimated_hours=4.0, position=1, priority='normal',
                  work_center='MECH', sap_order_number='700001479825',
                  equipment_id=equipment.id if equipment else None)
    fields.update(kwargs)
    job = WorkPlanJob(**fields)
    db_session.session.add(job)
    db_session.session.commit()
    return job


class TestWhatOneJobLooksLike:
    def test_the_job_id_is_the_handle_and_comes_first(self, db_session, week):
        """#id is on every job, always, and never changes when a job moves."""
        plan, day = week
        job = _job(db_session, day, equipment=make_equipment(db_session, 'ECH02', 'H30300465'))

        text = renderer.render_job(job)

        assert text.splitlines()[0].startswith(f'#{job.id}')

    def test_the_sap_number_is_shown_but_is_not_the_handle(self, db_session, week):
        """Jobs raised from inspections have no SAP number at all."""
        plan, day = week
        job = _job(db_session, day, equipment=make_equipment(db_session, 'ECH02', 'H30300465'))

        text = renderer.render_job(job)

        assert 'SAP 700001479825' in text
        assert not text.startswith('SAP')

    def test_an_unassigned_job_is_flagged_not_omitted(self, db_session, week):
        """The single most useful thing a 16:00 message can surface."""
        plan, day = week
        job = _job(db_session, day, equipment=make_equipment(db_session, 'TT001', 'S1'))

        text = renderer.render_job(job)

        assert 'unassigned' in text and '⚠️' in text

    def test_assigned_workers_are_listed_lead_first(self, db_session, week):
        """The lead is who Ali asks about the job, so the lead reads first."""
        plan, day = week
        job = _job(db_session, day, equipment=make_equipment(db_session, 'TT002', 'S2'))
        omar = _worker(db_session, 'Omar Kareem', 'omar@test.com')
        hassan = _worker(db_session, 'Hassan Ali', 'hassan@test.com')
        db_session.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                                  user_id=omar.id, is_lead=False))
        db_session.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                                  user_id=hassan.id, is_lead=True))
        db_session.session.commit()
        db_session.session.refresh(job)

        names = renderer.render_job(job).split('👤 ')[1]

        assert names.index('Hassan') < names.index('Omar')

    def test_only_first_names_are_shown(self, db_session, week):
        """Full names push the line past a phone's width."""
        plan, day = week
        job = _job(db_session, day, equipment=make_equipment(db_session, 'TT003', 'S2b'))
        hassan = _worker(db_session, 'Hassan Ali', 'hassan2@test.com')
        db_session.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                                  user_id=hassan.id, is_lead=True))
        db_session.session.commit()
        db_session.session.refresh(job)

        assert '👤 Hassan\n' in renderer.render_job(job) + '\n'

    def test_a_priority_badge_appears_only_when_it_is_not_normal(self, db_session, week):
        """A badge on every job is a badge on no job."""
        plan, day = week
        equipment = make_equipment(db_session, 'RS110', 'S3')
        normal = _job(db_session, day, equipment=equipment, priority='normal')
        urgent = _job(db_session, day, equipment=equipment, priority='urgent', position=2)

        assert 'URGENT' not in renderer.render_job(normal)
        assert 'URGENT' in renderer.render_job(urgent)

    def test_an_equipment_name_with_markdown_characters_survives_intact(
            self, db_session, week):
        """No parse_mode, so TT032-1000HR_MECH is not eaten as formatting."""
        plan, day = week
        equipment = make_equipment(db_session, 'TT032-1000HR_MECH', 'S4')
        job = _job(db_session, day, equipment=equipment)

        assert 'TT032-1000HR_MECH' in renderer.render_job(job)


class TestWhatADayLooksLike:
    def test_it_is_split_by_berth(self, db_session, week):
        """Matching the planner, and how the crews actually divide."""
        plan, day = week
        equipment = make_equipment(db_session, 'ECH02', 'S5')
        _job(db_session, day, equipment=equipment, berth='east')
        _job(db_session, day, equipment=equipment, berth='west', position=2)
        db_session.session.refresh(day)

        text = renderer.render_day(day)

        assert '▸ EAST' in text and '▸ WEST' in text
        assert text.index('▸ EAST') < text.index('▸ WEST')

    def test_the_header_counts_jobs_and_hours(self, db_session, week):
        plan, day = week
        equipment = make_equipment(db_session, 'ECH02', 'S6')
        _job(db_session, day, equipment=equipment, estimated_hours=4.0)
        _job(db_session, day, equipment=equipment, estimated_hours=2.5, position=2)
        db_session.session.refresh(day)

        header = renderer.render_day(day).splitlines()[1]

        assert '2 jobs' in header and '6.5h' in header

    def test_asking_for_one_berth_gives_that_berth(self, db_session, week):
        """So a berth's day can be forwarded straight to that crew."""
        plan, day = week
        equipment = make_equipment(db_session, 'ECH02', 'S7')
        _job(db_session, day, equipment=equipment, berth='east')
        _job(db_session, day, equipment=equipment, berth='west', position=2)
        db_session.session.refresh(day)

        text = renderer.render_day(day, berth='east')

        assert '▸ EAST' in text and '▸ WEST' not in text

    def test_an_empty_day_collapses_to_one_line(self, db_session, week):
        plan, day = week
        assert 'No jobs planned' in renderer.render_day(day)

    def test_arabic_renders_the_labels_in_arabic(self, db_session, week):
        plan, day = week
        _job(db_session, day, equipment=make_equipment(db_session, 'ECH02', 'S8'))
        db_session.session.refresh(day)

        text = renderer.render_day(day, language='ar')

        assert 'الرصيف الشرقي' in text
        assert 'صيانة وقائية' in text


class TestSplittingLongWeeks:
    def test_a_long_week_splits_on_a_job_boundary(self, db_session, week):
        """Telegram rejects over 4096 characters; a mid-job split is unreadable."""
        plan, day = week
        equipment = make_equipment(db_session, 'ECH02', 'S9')
        for position in range(60):
            _job(db_session, day, equipment=equipment, position=position,
                 description='A' * 60)
        db_session.session.refresh(plan)

        chunks = renderer.render_week(plan)

        assert len(chunks) > 1
        assert all(len(chunk) <= renderer.CHUNK_LIMIT for chunk in chunks)
        # A job's first line must never be orphaned from its detail lines.
        for chunk in chunks:
            assert not chunk.rstrip().endswith('·')


class TestTheFreshnessStamp:
    """The app can go stale while looking completely normal."""

    def test_today_is_stated_with_the_time(self):
        now = datetime(2026, 8, 23, 14, 0)
        line = renderer.freshness_line(datetime(2026, 8, 23, 6, 14), now)
        assert line == 'SAP data: today 06:14'

    def test_stale_data_carries_a_warning(self):
        now = datetime(2026, 8, 23, 14, 0)
        assert '⚠️' in renderer.freshness_line(datetime(2026, 8, 20, 6, 14), now)

    def test_never_received_says_so(self):
        assert 'never received' in renderer.freshness_line(None, datetime(2026, 8, 23))

    def test_the_time_shown_is_baghdad_not_utc(self, bot, db_session, admin_user):
        """received_at is stored with utcnow(); a 09:14 delivery sits there as 06:14.

        Printing it raw tells a man standing in Baghdad the wrong time on every
        message — the same off-by-three-hours family as the utcnow().date() bug.
        """
        from app.services.telegram.dispatcher import _freshness
        from app.utils.decorators import planning_now
        stored_utc = planning_now().replace(hour=6, minute=14) - timedelta(hours=3)
        db_session.session.add(SapSyncFile(
            sheet_name='IW39', source_filename='IW39 YTD.XLSX',
            source_folder='sap_import', sha256='a' * 64, file_size=1024,
            received_at=stored_utc, is_current=True))
        db_session.session.commit()

        assert 'today 06:14' in _freshness('en')

    def test_every_answer_carries_it(self, client, bot, recorder, db_session):
        """Always present, glanced at like a fuel gauge."""
        _post(client, _update('/ping'))
        assert _wait_for(recorder)
        assert 'SAP data' in recorder.text


class TestTheCommands:
    def _ali(self, admin_user):
        return admin_user

    def test_help_lists_what_it_can_do(self, bot, admin_user, db_session):
        chunks = handle(_update('/help'), admin_user)
        assert '/plan' in chunks[0] and '/today' in chunks[0]

    def test_help_in_arabic_for_an_arabic_phone(self, bot, admin_user, db_session):
        """Telegram's language_code is the client signal, as Accept-Language is."""
        chunks = handle(_update('/help', language_code='ar'), admin_user)
        assert 'الأسبوع كاملاً' in chunks[0]

    def test_today_renders_today(self, bot, admin_user, db_session, week):
        plan, day = week
        _job(db_session, day, equipment=make_equipment(db_session, 'ECH02', 'SA'))
        chunks = handle(_update('/today'), admin_user)
        assert '▸ EAST' in chunks[0]

    def test_tomorrow_says_so_when_no_day_exists(self, bot, admin_user, db_session, week):
        """The plan's week may not cover tomorrow, and silence would be wrong."""
        plan, day = week
        chunks = handle(_update('/tomorrow'), admin_user)
        assert len(chunks) == 1
        assert 'No plan covers' in chunks[0] or '▸' in chunks[0] \
            or 'No jobs planned' in chunks[0]

    def test_plan_with_no_plan_says_so_rather_than_showing_nothing(
            self, bot, admin_user, db_session):
        chunks = handle(_update('/plan'), admin_user)
        assert 'No plan for that week yet' in chunks[0]

    def test_plan_east_limits_to_one_berth(self, bot, admin_user, db_session, week):
        plan, day = week
        equipment = make_equipment(db_session, 'ECH02', 'SB')
        _job(db_session, day, equipment=equipment, berth='east')
        _job(db_session, day, equipment=equipment, berth='west', position=2)

        text = '\n'.join(handle(_update('/plan east'), admin_user))

        assert '▸ EAST' in text and '▸ WEST' not in text

    def test_an_unknown_command_points_at_help(self, bot, admin_user, db_session):
        chunks = handle(_update('/frobnicate'), admin_user)
        assert '/help' in chunks[0]

    def test_sap_reports_open_events(self, bot, admin_user, db_session):
        db_session.session.add(SapReconciliationEvent(
            event_type='job_removed', order_number='700001479825', sap_state='done',
            summary='SAP closed order 700001479825. It was removed from the plan.',
            status='open'))
        db_session.session.commit()

        chunks = handle(_update('/sap'), admin_user)

        assert '700001479825' in chunks[0]

    def test_sap_says_nothing_needed_when_there_is_nothing(self, bot, admin_user,
                                                           db_session):
        chunks = handle(_update('/sap'), admin_user)
        assert 'Nothing from SAP' in chunks[0]

    def test_routine_confirmations_do_not_bury_the_questions(self, bot, admin_user,
                                                             db_session):
        """/sap shows 20 rows. Weekly good news would push the questions off it."""
        db_session.session.add(SapReconciliationEvent(
            event_type='job_completion_confirmed', order_number='700000000001',
            sap_state='done', summary='Routine: both sides agree it is done',
            status='resolved'))
        db_session.session.add(SapReconciliationEvent(
            event_type='completion_not_confirmed', order_number='700000000002',
            sap_state='open', summary='Is the confirmation missing?', status='open'))
        db_session.session.commit()

        text = handle(_update('/sap'), admin_user)[0]

        assert 'confirmation missing' in text
        assert 'both sides agree' not in text

    def test_a_resolved_event_is_not_reported(self, bot, admin_user, db_session):
        db_session.session.add(SapReconciliationEvent(
            event_type='job_removed', order_number='700001479825', sap_state='done',
            summary='Already dealt with', status='resolved'))
        db_session.session.commit()

        chunks = handle(_update('/sap'), admin_user)

        assert 'Nothing from SAP' in chunks[0]

    def test_a_broken_command_answers_instead_of_going_silent(self, bot, admin_user,
                                                              db_session, monkeypatch):
        """Silence is indistinguishable from being blocked."""
        def boom(*args, **kwargs):
            raise RuntimeError('database on fire')
        monkeypatch.setattr('app.services.telegram.dispatcher.plan_for_date', boom)

        chunks = handle(_update('/plan'), admin_user)

        assert len(chunks) == 1 and 'went wrong' in chunks[0]


class TestTheScheduledPushes:
    def test_the_sixteen_hundred_push_sends_tomorrow(self, bot, db_session, week,
                                                     admin_user):
        from app.services.telegram.push import push_day_to_planners
        plan, day = week
        _job(db_session, day, equipment=make_equipment(db_session, 'ECH02', 'SC'))
        recorder = Recorder()

        result = push_day_to_planners(day.date, kind='tomorrow', client=recorder)

        assert result['sent'] == 1
        assert '▸ EAST' in recorder.text
        assert 'SAP data' in recorder.text

    def test_no_plan_is_said_once_not_every_day(self, bot, db_session, admin_user):
        """Otherwise it nags through every week the plan is not ready yet."""
        from app.services.telegram.push import push_day_to_planners, _no_plan_warned
        _no_plan_warned.clear()
        recorder = Recorder()
        target = date.today() + timedelta(days=365)

        first = push_day_to_planners(target, client=recorder)
        second = push_day_to_planners(target, client=recorder)

        assert first['sent'] == 1
        assert second['sent'] == 0

    def test_nothing_is_sent_without_a_token(self, app, db_session, admin_user):
        """A push must never be the thing that reveals a misconfigured deploy."""
        from app.services.telegram.push import push_day_to_planners
        app.config['TELEGRAM_BOT_TOKEN'] = ''
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        recorder = Recorder()

        result = push_day_to_planners(date.today(), client=recorder)

        assert result['sent'] == 0
        assert recorder.messages == []

    def test_nothing_is_sent_to_an_empty_allowlist(self, app, db_session):
        from app.services.telegram.push import push_day_to_planners
        app.config['TELEGRAM_BOT_TOKEN'] = 'test-token'
        app.config['TELEGRAM_ALLOWED_USERS'] = ''
        recorder = Recorder()

        assert push_day_to_planners(date.today(), client=recorder)['sent'] == 0


class TestTheWebhookSecretMustBeUsable:
    """Telegram allows only A-Z a-z 0-9 _ - and the value is also a URL path."""

    def test_a_base64_secret_is_rejected_before_telegram_sees_it(self):
        from app.services.telegram.client import valid_secret_token
        assert valid_secret_token('abc+def/ghi=') is False

    def test_a_hex_secret_is_accepted(self):
        from app.services.telegram.client import valid_secret_token
        assert valid_secret_token('a3f9' * 16) is True

    def test_empty_and_oversized_are_rejected(self):
        from app.services.telegram.client import valid_secret_token
        assert valid_secret_token('') is False
        assert valid_secret_token(None) is False
        assert valid_secret_token('a' * 257) is False

    def test_health_separates_present_from_usable(self, client, app):
        """A base64 secret reads as 'configured' and still fails registration."""
        app.config['TELEGRAM_WEBHOOK_SECRET'] = 'abc+def/ghi='
        body = client.get('/api/telegram/health').get_json()

        assert body['webhook_secret_configured'] is True
        assert body['webhook_secret_valid'] is False

    def test_a_refusal_reports_telegram_s_own_words(self, app):
        """Inventing a reason sends people looking in the wrong place.

        The first version of this script printed "It must be HTTPS on a public
        host" for every failure. Telegram had actually said "secret token
        contains unallowed characters", and that answer was thrown away.
        """
        from app.services.telegram.client import TelegramClient

        class Refusal:
            status_code = 400
            text = '{"ok":false,"description":"secret token contains unallowed characters"}'

            def json(self):
                return {'ok': False,
                        'description': 'secret token contains unallowed characters'}

        import requests
        original = requests.post
        requests.post = lambda *a, **k: Refusal()
        try:
            app.config['TELEGRAM_BOT_TOKEN'] = 'test-token'
            client = TelegramClient()
            assert client.set_webhook('https://example.com/x', secret_token='bad') is None
            assert client.last_error == 'secret token contains unallowed characters'
        finally:
            requests.post = original


class TestTheHealthEndpoint:
    def test_it_reports_presence_never_values(self, client, bot):
        body = client.get('/api/telegram/health').get_json()

        assert body['token_configured'] is True
        assert body['allowlist_size'] == 1
        assert 'test-token' not in str(body)
        assert SECRET not in str(body)
