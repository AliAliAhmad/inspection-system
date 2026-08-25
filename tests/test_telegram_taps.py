"""The bot learns to ask.

Everything it sent before was a statement. A question has to WAIT, and while
it waits eight phones are each holding a copy. One finger decides; the other
seven copies must stop working. None of that is possible without a notebook.
"""

from datetime import date, datetime, timedelta

import pytest
import sqlalchemy.exc

from app.extensions import db
from app.models import (TelegramProposal, TelegramProposalMessage, User,
                        WorkPlan, WorkPlanDay)

MONDAY = date(2026, 8, 24)


def _plan(db_session, admin_user):
    plan = WorkPlan(week_start=MONDAY, week_end=MONDAY + timedelta(days=6),
                    status='published', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    days = []
    for offset in range(7):
        day = WorkPlanDay(work_plan_id=plan.id, date=MONDAY + timedelta(days=offset))
        db_session.session.add(day)
        days.append(day)
    db_session.session.commit()
    return plan, days


def _proposal(db_session, plan=None, day=None, status='open', hours=12):
    proposal = TelegramProposal(
        kind='urgent_needs_room',
        summary='RS110 urgent has no room on Tuesday',
        details={'order_number': '700000000300'},
        options=[{'key': 'yes', 'action': 'apply',
                  'label_en': 'Yes, make room', 'label_ar': 'نعم، أفسح مكاناً'},
                 {'key': 'no', 'action': 'decline',
                  'label_en': 'No', 'label_ar': 'لا'}],
        work_plan_id=plan.id if plan else None,
        target_day_id=day.id if day else None,
        status=status,
        expires_at=datetime.utcnow() + timedelta(hours=hours))
    db_session.session.add(proposal)
    db_session.session.commit()
    return proposal


class TestTheNotebook:
    def test_a_question_is_written_down(self, db_session, admin_user):
        plan, days = _plan(db_session, admin_user)

        proposal = _proposal(db_session, plan, days[1])

        assert proposal.id is not None
        assert proposal.status == 'open'
        assert proposal.decided_by_id is None
        assert proposal.options[0]['key'] == 'yes'
        assert proposal.details['order_number'] == '700000000300'

    def test_a_nonsense_status_is_refused(self, db_session, admin_user):
        """The CHECK constraint, not the application, is the guard."""
        plan, days = _plan(db_session, admin_user)
        proposal = _proposal(db_session, plan, days[1])

        proposal.status = 'maybe'
        with pytest.raises(sqlalchemy.exc.IntegrityError):
            db_session.session.commit()
        db_session.session.rollback()

    def test_one_row_per_phone(self, db_session, admin_user):
        plan, days = _plan(db_session, admin_user)
        proposal = _proposal(db_session, plan, days[1])

        db_session.session.add(TelegramProposalMessage(
            proposal_id=proposal.id, user_id=admin_user.id,
            chat_id=1811629337, message_id=55, language='ar'))
        db_session.session.commit()

        db_session.session.refresh(proposal)
        assert len(proposal.messages) == 1
        assert proposal.messages[0].language == 'ar'
        assert proposal.messages[0].message_id == 55

    def test_a_failed_send_still_gets_a_row(self, db_session, admin_user):
        """message_id is nullable on purpose: the question is still open for
        everyone else even when one phone could not be reached."""
        plan, days = _plan(db_session, admin_user)
        proposal = _proposal(db_session, plan, days[1])

        db_session.session.add(TelegramProposalMessage(
            proposal_id=proposal.id, user_id=admin_user.id,
            chat_id=1811629337, message_id=None, language='en'))
        db_session.session.commit()

        assert proposal.messages[0].message_id is None

    def test_deleting_the_question_takes_its_phones_with_it(self, db_session,
                                                            admin_user):
        plan, days = _plan(db_session, admin_user)
        proposal = _proposal(db_session, plan, days[1])
        db_session.session.add(TelegramProposalMessage(
            proposal_id=proposal.id, user_id=admin_user.id,
            chat_id=1, message_id=2, language='en'))
        db_session.session.commit()

        db_session.session.delete(proposal)
        db_session.session.commit()

        assert TelegramProposalMessage.query.count() == 0


class TestTheClientLearnsTwoNewWords:
    def test_it_can_stop_the_spinner(self, app, monkeypatch):
        """answerCallbackQuery is what makes the button stop turning."""
        from app.services.telegram.client import TelegramClient

        calls = []
        client = TelegramClient(token='t')
        monkeypatch.setattr(client, '_call',
                            lambda method, payload: calls.append((method, payload)))

        client.answer_callback_query('cbq-1', text='Done')

        assert calls[0][0] == 'answerCallbackQuery'
        assert calls[0][1]['callback_query_id'] == 'cbq-1'
        assert calls[0][1]['text'] == 'Done'

    def test_it_can_rewrite_a_message_it_already_sent(self, app, monkeypatch):
        from app.services.telegram.client import TelegramClient

        calls = []
        client = TelegramClient(token='t')
        monkeypatch.setattr(client, '_call',
                            lambda method, payload: calls.append((method, payload)))

        client.edit_message_text(999, 55, 'Ali said yes')

        assert calls[0][0] == 'editMessageText'
        assert calls[0][1]['chat_id'] == 999
        assert calls[0][1]['message_id'] == 55
        assert calls[0][1]['text'] == 'Ali said yes'
        # No parse_mode, ever — equipment names carry _ and *.
        assert 'parse_mode' not in calls[0][1]

    def test_an_edit_that_removes_the_buttons_sends_an_empty_keyboard(
            self, app, monkeypatch):
        """Telegram only drops a keyboard when it is told to, explicitly."""
        from app.services.telegram.client import TelegramClient

        calls = []
        client = TelegramClient(token='t')
        monkeypatch.setattr(client, '_call',
                            lambda method, payload: calls.append((method, payload)))

        client.edit_message_text(999, 55, 'decided',
                                 reply_markup={'inline_keyboard': []})

        assert calls[0][1]['reply_markup'] == {'inline_keyboard': []}

    def test_an_explicitly_empty_markup_is_still_forwarded(self, app,
                                                           monkeypatch):
        """`{}` IS falsy. `is not None` forwards it; a truthiness check would
        silently drop it, and Telegram reads an ABSENT reply_markup as 'leave
        the buttons exactly where they are' — the opposite of what a caller
        passing an empty markup is asking for."""
        from app.services.telegram.client import TelegramClient

        calls = []
        client = TelegramClient(token='t')
        monkeypatch.setattr(client, '_call',
                            lambda method, payload: calls.append((method, payload)))

        client.edit_message_text(999, 55, 'decided', reply_markup={})

        assert calls[0][1]['reply_markup'] == {}


from app.models.worker_assignment_rule import WorkerAssignmentRule  # noqa: F401  (used later)

ALI_TELEGRAM_ID = 1811629337
OTHER_TELEGRAM_ID = 1811629338


def _person(db_session, name, role, language='en'):
    user = User(email=f'{name}@t.iq', full_name=name, role=role,
                role_id=f'{role[:3].upper()}{name}', language=language)
    user.set_password('x')
    db_session.session.add(user)
    db_session.session.commit()
    return user


class Recorder:
    """Same double the bot tests use. Keeps reply_markup, never discards it."""

    def __init__(self, fail_for=()):
        self.messages = []
        self.markups = []
        self.edited = []
        self.answered = []
        self.fail_for = set(fail_for)
        self._n = 0

    def send_message(self, chat_id, text, reply_markup=None):
        if chat_id in self.fail_for:
            return None
        self._n += 1
        self.messages.append((chat_id, text))
        self.markups.append((chat_id, reply_markup))
        return {'message_id': 100 + self._n}

    def edit_message_text(self, chat_id, message_id, text, reply_markup=None):
        self.edited.append((chat_id, message_id, text, reply_markup))
        return {'message_id': message_id}

    def answer_callback_query(self, callback_query_id, text=None):
        self.answered.append((callback_query_id, text))
        return {'ok': True}


def _options():
    return [{'key': 'yes', 'action': 'apply',
             'label_en': 'Yes, make room', 'label_ar': 'نعم، أفسح مكاناً'},
            {'key': 'no', 'action': 'decline',
             'label_en': 'No', 'label_ar': 'لا'}]


def _texts():
    return {'en': 'RS110 urgent has no room on Tuesday',
            'ar': 'RS110 عاجل بلا مكان يوم الثلاثاء'}


class TestAskingEverybody:
    def test_every_planner_on_the_allowlist_gets_it(self, app, db_session,
                                                    admin_user):
        engineer = _person(db_session, 'eng', 'engineer', language='ar')
        app.config['TELEGRAM_ALLOWED_USERS'] = (
            f'{ALI_TELEGRAM_ID}:{admin_user.id},{OTHER_TELEGRAM_ID}:{engineer.id}')
        from app.services.telegram.ask import ask
        recorder = Recorder()

        proposal = ask('urgent_needs_room', _texts(), _options(),
                       datetime.utcnow() + timedelta(hours=12), client=recorder)

        assert proposal is not None
        assert len(proposal.messages) == 2
        assert {m.chat_id for m in proposal.messages} == {ALI_TELEGRAM_ID,
                                                          OTHER_TELEGRAM_ID}
        assert {m.message_id for m in proposal.messages} == {101, 102}

    def test_each_phone_reads_its_own_language(self, app, db_session, admin_user):
        engineer = _person(db_session, 'eng', 'engineer', language='ar')
        app.config['TELEGRAM_ALLOWED_USERS'] = (
            f'{ALI_TELEGRAM_ID}:{admin_user.id},{OTHER_TELEGRAM_ID}:{engineer.id}')
        from app.services.telegram.ask import ask
        recorder = Recorder()

        ask('urgent_needs_room', _texts(), _options(),
            datetime.utcnow() + timedelta(hours=12), client=recorder)

        by_chat = dict(recorder.messages)
        assert by_chat[OTHER_TELEGRAM_ID] == _texts()['ar']
        assert by_chat[ALI_TELEGRAM_ID] == _texts()['en']

    def test_a_worker_is_never_asked(self, app, db_session, admin_user):
        """The allowlist says who may TALK to the bot. The role says who may
        change a plan. A maintenance man can be on both and still not be asked.
        """
        worker = _person(db_session, 'mnr', 'maintenance')
        app.config['TELEGRAM_ALLOWED_USERS'] = (
            f'{ALI_TELEGRAM_ID}:{admin_user.id},{OTHER_TELEGRAM_ID}:{worker.id}')
        from app.services.telegram.ask import ask
        recorder = Recorder()

        proposal = ask('urgent_needs_room', _texts(), _options(),
                       datetime.utcnow() + timedelta(hours=12), client=recorder)

        assert [m.chat_id for m in proposal.messages] == [ALI_TELEGRAM_ID]

    def test_a_planner_with_no_phone_is_skipped_quietly(self, app, db_session,
                                                        admin_user):
        _person(db_session, 'eng', 'engineer')       # not on the allowlist
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        from app.services.telegram.ask import ask
        recorder = Recorder()

        proposal = ask('urgent_needs_room', _texts(), _options(),
                       datetime.utcnow() + timedelta(hours=12), client=recorder)

        assert len(proposal.messages) == 1

    def test_nobody_to_ask_writes_nothing_down(self, app, db_session):
        app.config['TELEGRAM_ALLOWED_USERS'] = ''
        from app.services.telegram.ask import ask
        recorder = Recorder()

        proposal = ask('urgent_needs_room', _texts(), _options(),
                       datetime.utcnow() + timedelta(hours=12), client=recorder)

        assert proposal is None
        assert TelegramProposal.query.count() == 0
        assert recorder.messages == []

    def test_a_send_that_fails_still_leaves_a_row(self, app, db_session,
                                                  admin_user):
        engineer = _person(db_session, 'eng', 'engineer')
        app.config['TELEGRAM_ALLOWED_USERS'] = (
            f'{ALI_TELEGRAM_ID}:{admin_user.id},{OTHER_TELEGRAM_ID}:{engineer.id}')
        from app.services.telegram.ask import ask
        recorder = Recorder(fail_for=[OTHER_TELEGRAM_ID])

        proposal = ask('urgent_needs_room', _texts(), _options(),
                       datetime.utcnow() + timedelta(hours=12), client=recorder)

        rows = {m.chat_id: m.message_id for m in proposal.messages}
        assert rows[OTHER_TELEGRAM_ID] is None
        assert rows[ALI_TELEGRAM_ID] is not None
        assert proposal.status == 'open'      # still answerable by the other one

    def test_the_button_carries_only_a_position(self, app, db_session,
                                                admin_user):
        """Never a job number, never anything secret. Telegram caps
        callback_data at 64 bytes; a position stays tiny whatever the label."""
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        from app.services.telegram.ask import ask
        recorder = Recorder()

        proposal = ask('urgent_needs_room', _texts(), _options(),
                       datetime.utcnow() + timedelta(hours=12), client=recorder)

        markup = recorder.markups[0][1]
        datas = [row[0]['callback_data'] for row in markup['inline_keyboard']]
        assert datas == [f'tp:{proposal.id}:0', f'tp:{proposal.id}:1']
        assert all(len(d.encode('utf-8')) <= 64 for d in datas)

    def test_editing_everyone_takes_the_buttons_away(self, app, db_session,
                                                     admin_user):
        engineer = _person(db_session, 'eng', 'engineer', language='ar')
        app.config['TELEGRAM_ALLOWED_USERS'] = (
            f'{ALI_TELEGRAM_ID}:{admin_user.id},{OTHER_TELEGRAM_ID}:{engineer.id}')
        from app.services.telegram.ask import ask, edit_everyone
        recorder = Recorder()
        proposal = ask('urgent_needs_room', _texts(), _options(),
                       datetime.utcnow() + timedelta(hours=12), client=recorder)

        edit_everyone(proposal, {'en': 'Ali said yes', 'ar': 'علي وافق'},
                      client=recorder)

        assert len(recorder.edited) == 2
        for _chat, _mid, _text, markup in recorder.edited:
            assert markup == {'inline_keyboard': []}
        by_chat = {c: t for c, _m, t, _k in recorder.edited}
        assert by_chat[OTHER_TELEGRAM_ID] == 'علي وافق'

    def test_a_phone_that_never_got_it_is_not_edited(self, app, db_session,
                                                     admin_user):
        engineer = _person(db_session, 'eng', 'engineer')
        app.config['TELEGRAM_ALLOWED_USERS'] = (
            f'{ALI_TELEGRAM_ID}:{admin_user.id},{OTHER_TELEGRAM_ID}:{engineer.id}')
        from app.services.telegram.ask import ask, edit_everyone
        recorder = Recorder(fail_for=[OTHER_TELEGRAM_ID])
        proposal = ask('urgent_needs_room', _texts(), _options(),
                       datetime.utcnow() + timedelta(hours=12), client=recorder)

        edit_everyone(proposal, {'en': 'decided'}, client=recorder)

        assert [c for c, _m, _t, _k in recorder.edited] == [ALI_TELEGRAM_ID]

    def test_expiring_closes_only_its_own_kind(self, app, db_session, admin_user):
        from app.services.telegram.ask import expire_open
        stale = _proposal(db_session, hours=-1)                # already past
        fresh = _proposal(db_session, hours=12)
        other = _proposal(db_session, hours=-1)
        other.kind = 'crew_is_free'
        db_session.session.commit()

        closed = expire_open('urgent_needs_room')

        assert closed == 1
        db_session.session.refresh(stale)
        db_session.session.refresh(fresh)
        db_session.session.refresh(other)
        assert stale.status == 'expired'
        assert fresh.status == 'open'
        assert other.status == 'open'


def _callback(proposal_id, index, telegram_id=ALI_TELEGRAM_ID, update_id=500,
              language_code='en'):
    """A tap. There is no such factory in tests/test_telegram_bot.py — every
    update it builds is a `message`."""
    return {
        'update_id': update_id,
        'callback_query': {
            'id': f'cbq-{update_id}',
            'data': f'tp:{proposal_id}:{index}',
            'from': {'id': telegram_id, 'is_bot': False, 'first_name': 'Ali',
                     'language_code': language_code},
            'message': {'message_id': 101,
                        'chat': {'id': telegram_id, 'type': 'private'}},
        },
    }


class TestOneFingerDecides:
    def _asked(self, app, db_session, admin_user, extra_person=None):
        mapping = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        if extra_person is not None:
            mapping += f',{OTHER_TELEGRAM_ID}:{extra_person.id}'
        app.config['TELEGRAM_ALLOWED_USERS'] = mapping
        from app.services.telegram.ask import ask
        recorder = Recorder()
        proposal = ask('urgent_needs_room', _texts(), _options(),
                       datetime.utcnow() + timedelta(hours=12), client=recorder)
        return proposal, recorder

    def test_pressing_no_declines_it(self, app, db_session, admin_user):
        from app.services.telegram import taps
        proposal, recorder = self._asked(app, db_session, admin_user)

        taps.handle_callback(_callback(proposal.id, 1), admin_user,
                             client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'declined'
        assert proposal.decided_by_id == admin_user.id
        assert proposal.decided_option == 'no'
        assert proposal.decided_at is not None

    def test_the_second_finger_is_told_who_decided(self, app, db_session,
                                                   admin_user):
        engineer = _person(db_session, 'eng', 'engineer')
        from app.services.telegram import taps
        proposal, recorder = self._asked(app, db_session, admin_user, engineer)

        taps.handle_callback(_callback(proposal.id, 1), admin_user,
                             client=recorder)
        recorder.answered.clear()
        taps.handle_callback(_callback(proposal.id, 0, OTHER_TELEGRAM_ID,
                                       update_id=501), engineer,
                             client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.decided_by_id == admin_user.id     # unchanged
        assert proposal.decided_option == 'no'
        toast = recorder.answered[-1][1]
        assert admin_user.full_name in toast

    def test_every_phone_is_rewritten_once_it_is_decided(self, app, db_session,
                                                         admin_user):
        engineer = _person(db_session, 'eng', 'engineer', language='ar')
        from app.services.telegram import taps
        proposal, recorder = self._asked(app, db_session, admin_user, engineer)

        taps.handle_callback(_callback(proposal.id, 1), admin_user,
                             client=recorder)

        assert len(recorder.edited) == 2
        for _chat, _mid, _text, markup in recorder.edited:
            assert markup == {'inline_keyboard': []}

    def test_a_worker_may_not_change_the_plan(self, app, db_session, admin_user):
        """He can be on the allowlist and still be refused: the allowlist says
        who may TALK to the bot, the role says who may change a plan."""
        worker = _person(db_session, 'mnr', 'maintenance')
        from app.services.telegram import taps
        proposal, recorder = self._asked(app, db_session, admin_user)
        app.config['TELEGRAM_ALLOWED_USERS'] += f',{OTHER_TELEGRAM_ID}:{worker.id}'

        taps.handle_callback(_callback(proposal.id, 1, OTHER_TELEGRAM_ID,
                                       update_id=502), worker, client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'open'
        assert recorder.answered[-1][1]      # a toast was shown
        assert recorder.edited == []

    def test_an_old_question_cannot_be_answered(self, app, db_session,
                                                admin_user):
        from app.services.telegram import taps
        proposal, recorder = self._asked(app, db_session, admin_user)
        proposal.expires_at = datetime.utcnow() - timedelta(minutes=1)
        db_session.session.commit()

        taps.handle_callback(_callback(proposal.id, 1), admin_user,
                             client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'open'      # untouched; the sweep expires it
        assert recorder.answered[-1][1]

    def test_nonsense_never_raises(self, app, db_session, admin_user):
        from app.services.telegram import taps
        _proposal_unused, recorder = self._asked(app, db_session, admin_user)

        for bad in ('', 'hello', 'tp:', 'tp:x:y', 'tp:999999:0', 'tp:1:99'):
            update = _callback(1, 0)
            update['callback_query']['data'] = bad
            taps.handle_callback(update, admin_user, client=recorder)

        assert len(recorder.answered) >= 6     # every one got an answer

    def test_the_spinner_is_always_stopped(self, app, db_session, admin_user):
        """Even when the apply step blows up. One answer, in a finally."""
        from app.services.telegram import taps

        @taps.register('explodes')
        def _boom(proposal, option, user):
            raise RuntimeError('the yard is on fire')

        proposal, recorder = self._asked(app, db_session, admin_user)
        proposal.kind = 'explodes'
        proposal.options = [{'key': 'yes', 'action': 'apply',
                             'label_en': 'Yes', 'label_ar': 'نعم'}]
        db_session.session.commit()

        taps.handle_callback(_callback(proposal.id, 0), admin_user,
                             client=recorder)

        assert len(recorder.answered) == 1
        db_session.session.refresh(proposal)
        assert proposal.status == 'failed'
        assert 'the yard is on fire' in str(proposal.result)

    def test_pressing_expand_shows_more_buttons_without_deciding(
            self, app, db_session, admin_user):
        """'Pick a day' does not create a second question, and it never
        renumbers the list — other phones are still showing the old
        positions."""
        from app.services.telegram import taps
        proposal, recorder = self._asked(app, db_session, admin_user)
        proposal.options = _options() + [
            {'key': 'pick', 'action': 'expand',
             'label_en': 'Pick a day', 'label_ar': 'اختر يوماً',
             'expand': [{'key': 'day:7', 'action': 'apply',
                         'label_en': 'Wednesday', 'label_ar': 'الأربعاء'}]}]
        db_session.session.commit()
        before = list(proposal.options)

        taps.handle_callback(_callback(proposal.id, 2), admin_user,
                             client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'open'
        assert proposal.options[:3] == before      # append-only, never rewritten
        assert proposal.options[3]['key'] == 'day:7'
        assert len(recorder.edited) == 1           # only the presser's own copy
        assert recorder.edited[0][3]['inline_keyboard']
