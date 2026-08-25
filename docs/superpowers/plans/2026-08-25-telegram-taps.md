# Telegram Taps (a bot that asks, not only tells) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Telegram bot inline buttons, so an urgent order with nowhere to go and a crew that finished early both become one-tap decisions on a planner's phone.

**Architecture:** One shared "question box" (two tables) records what was asked, which phones it landed on, and who answered first. Two producers write questions into it — the nightly SAP rebuild and job completion. One callback handler catches every tap, claims the question with an atomic `UPDATE ... WHERE status='open'`, runs a per-kind apply function, and edits every recipient's copy of the message. A new `place_one` service does the thing nothing in the codebase does today: put one job on one day, priced and staffed.

**Tech Stack:** Flask, SQLAlchemy, Alembic, APScheduler, raw `requests` against the Telegram Bot API (no bot framework), pytest. React Native/Expo + i18next for the one mobile button.

**Spec:** `docs/superpowers/specs/2026-08-25-telegram-taps-design.md`

## Global Constraints

- **Bilingual, always.** Every user-facing string ships in English and Arabic. Backend follows the module-local `{'en': ..., 'ar': ...}` dict + `_t()` helper used by `dispatcher.py`, `generate.py`, `renderer.py`, `push.py`. Mobile uses the `job_execution` namespace in `frontend/packages/shared/src/i18n/{en,ar}.json` — edit `src/`, **never** `dist/` (build artifact).
- **No `parse_mode` on any Telegram message.** Equipment names carry `_` and `*` (`TT032-1000HR_MECH`); Markdown either fails the send or eats part of a job number. See `client.py:90-95`.
- **Never `date.today()`.** Use `planning_today()` from `app/utils/decorators.py:175` (Asia/Baghdad).
- **Crew size is always `max(MIN_CREW, len(job.assignments or []))`**, `MIN_CREW = 2` from `app/services/job_durations.py:58`. Never bare `len()`.
- **A job's price for the domino is `estimated_hours × the crew that will actually be on it`**, matching `day_ripple.job_cost_man_hours`. Assign the men **before** measuring the day.
- **No team rules configured → the whole feature is off.** `build_week_wallets` returns `{}`; both producers must then raise zero questions.
- **Nothing is applied without a tap.** The nightly job only asks.
- **`options` is append-only.** Buttons carry a position in that list; renumbering turns somebody else's "No" into "Tuesday".
- **Run tests with `./venv/bin/python -m pytest`.** Baseline before this plan: **650 passed, 1 skipped**; telegram subset `tests/test_telegram_bot.py tests/test_run_once.py` = **104 passed**.
- **NO commits or pushes without Ali's explicit word.** Every task's "Commit" step means *stage and prepare the message*; ask before running `git commit`.

## File Structure

**New**

| File | Responsibility |
|---|---|
| `app/models/telegram_proposal.py` | `TelegramProposal` + `TelegramProposalMessage`. The notebook. Nothing else. |
| `migrations/versions/s9t0u1v2w3x4_telegram_proposals.py` | The two tables. `down_revision = 'r8s9t0u1v2w3'` (verified single head). |
| `app/services/telegram/ask.py` | Build a question, send it to every planner, record one message row per phone. Knows nothing about *what* is being asked. |
| `app/services/telegram/taps.py` | Catch a tap: answer, gate by role, claim, apply, edit every copy. Holds the kind→apply registry. |
| `app/services/place_one.py` | Put one job on one day: price it, create it, staff it, flip the box row. Plus `staff_one_job`. |
| `app/services/urgent_watch.py` | Producer A. Finds urgent orders with nowhere to go and asks. |
| `app/services/crew_free.py` | Producer B. Free-hours arithmetic and the best-3 pick. |
| `tests/test_telegram_taps.py` | The notebook, the tap catcher, first-press-wins, expiry, role gate. |
| `tests/test_place_one.py` | Pricing, staffing, box-row flip. |
| `tests/test_urgent_watch.py` | Producer A end to end. |
| `tests/test_crew_free.py` | Producer B: free hours and candidate choice. |

**Modified**

| File | Change |
|---|---|
| `app/models/__init__.py` | Import + `__all__` entries for the two models. |
| `app/services/telegram/client.py` | `answer_callback_query`, `edit_message_text`. |
| `app/api/telegram.py` | Route `callback_query` to `taps.handle_callback`; correct the stale dedupe comment. |
| `app/services/scheduler_service.py` | One call appended inside `rebuild_pool_nightly`. |
| `app/api/work_plan_tracking.py` | Completion hook + `POST /jobs/<id>/free-for-more`. |
| `tests/test_telegram_bot.py` | `Recorder` must stop discarding `reply_markup`; add `_callback()` factory. |
| `frontend/apps/mobile/src/screens/shared/JobExecutionScreen.tsx` | "I am free" button in the `completed` branch. |
| `frontend/packages/shared/src/api/work-plan-tracking.api.ts` | One client method. |
| `frontend/packages/shared/src/i18n/{en,ar}.json` | New `job_execution` keys. |

**Deliberately untouched:** `app/api/work_plans.py:934` `schedule_sap_order` — it does not re-price, does not normalise berth, does no capacity check and staffs nobody. `place_one` does not build on it.

---

## STAGE 1 — the bot learns to ask

Tasks 1–7. At the end of Stage 1 a nightly run raises real questions on real phones and a tap really moves work. Job completion and the mobile app are untouched.

### Task 1: The notebook — two tables

**Files:**
- Create: `app/models/telegram_proposal.py`
- Create: `migrations/versions/s9t0u1v2w3x4_telegram_proposals.py`
- Modify: `app/models/__init__.py` (import near line 12, `__all__` near line 178)
- Test: `tests/test_telegram_taps.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `TelegramProposal(kind, summary, details, options, work_plan_id, target_day_id, status='open', decided_by_id, decided_option, decided_at, expires_at, result, created_at)`, `TelegramProposal.messages` → `list[TelegramProposalMessage]`, and `TelegramProposalMessage(proposal_id, user_id, chat_id, message_id, language)`. Module constants `KINDS`, `STATUSES`.

- [x] **Step 1: Write the failing test**

Create `tests/test_telegram_taps.py`:

```python
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
```

- [x] **Step 2: Run the test to verify it fails**

Run: `./venv/bin/python -m pytest tests/test_telegram_taps.py -q`
Expected: FAIL — `ImportError: cannot import name 'TelegramProposal' from 'app.models'`

- [x] **Step 3: Write the model**

Create `app/models/telegram_proposal.py`:

```python
"""A question the bot asked, and the phones it landed on.

The bot could only ever talk. A question is different: it has to WAIT, and
while it waits every planner's phone holds a copy of it. One finger decides;
the other copies must stop working. None of that is possible without
remembering what was asked and where it went.

Shaped after SapReconciliationEvent on purpose — the same `status` guarded by
a CHECK constraint, the same free-form `details` JSON, the same one-line
human-readable `summary`. That model was already the closest thing in this
codebase to an open question, and two different shapes for "something is
waiting for a person" would drift apart the first time either changed.
"""

from datetime import datetime

from app.extensions import db

KINDS = ('urgent_needs_room', 'crew_is_free')
STATUSES = ('open', 'accepted', 'declined', 'expired', 'failed')


class TelegramProposal(db.Model):
    """One question. One line in the notebook."""

    __tablename__ = 'telegram_proposals'

    id = db.Column(db.Integer, primary_key=True)

    # Which apply function runs when somebody says yes.
    kind = db.Column(db.String(40), nullable=False, index=True)

    # The one line a person reads without opening anything.
    summary = db.Column(db.Text, nullable=False)

    # Everything the apply step needs: order number, berth, wallet key,
    # man-hours, the simulated domino chain, the candidate list. Free-form on
    # purpose — the useful fields differ per kind and will keep changing.
    details = db.Column(db.JSON, nullable=True)

    # The buttons, in order. APPEND-ONLY: a button's callback_data carries its
    # POSITION in this list, and other phones are still displaying the old
    # positions. Renumbering would turn somebody else's "No" into "Tuesday".
    options = db.Column(db.JSON, nullable=False)

    work_plan_id = db.Column(db.Integer, db.ForeignKey('work_plans.id'),
                             nullable=True, index=True)
    target_day_id = db.Column(db.Integer, db.ForeignKey('work_plan_days.id'),
                              nullable=True)

    status = db.Column(db.String(20), nullable=False, default='open', index=True)
    decided_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    decided_option = db.Column(db.String(40), nullable=True)
    decided_at = db.Column(db.DateTime, nullable=True)

    # After this the buttons are dead. Indexed because the nightly sweep and
    # every single tap both filter on it.
    expires_at = db.Column(db.DateTime, nullable=False, index=True)

    # What actually happened — the real domino chain, the created job id, or
    # the error. The audit trail; nothing else records it.
    result = db.Column(db.JSON, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow,
                           nullable=False, index=True)

    messages = db.relationship('TelegramProposalMessage',
                               back_populates='proposal',
                               cascade='all, delete-orphan')
    decided_by = db.relationship('User')
    work_plan = db.relationship('WorkPlan')
    target_day = db.relationship('WorkPlanDay')

    __table_args__ = (
        db.CheckConstraint(
            "status IN ('open', 'accepted', 'declined', 'expired', 'failed')",
            name='check_telegram_proposal_status'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'kind': self.kind,
            'summary': self.summary,
            'details': self.details or {},
            'options': self.options or [],
            'work_plan_id': self.work_plan_id,
            'target_day_id': self.target_day_id,
            'status': self.status,
            'decided_by_id': self.decided_by_id,
            'decided_option': self.decided_option,
            'decided_at': self.decided_at.isoformat() if self.decided_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'result': self.result,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class TelegramProposalMessage(db.Model):
    """One copy of the question, on one phone.

    Exists for exactly one reason: to grey out the other copies once somebody
    decides. `TelegramClient.send_message` already returns Telegram's result
    dict carrying `message_id` and no caller in this codebase has ever kept it.
    """

    __tablename__ = 'telegram_proposal_messages'

    id = db.Column(db.Integer, primary_key=True)
    proposal_id = db.Column(db.Integer, db.ForeignKey('telegram_proposals.id'),
                            nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    chat_id = db.Column(db.BigInteger, nullable=False)

    # Nullable: a send can fail. The question is still open for everybody else,
    # and this row records that this phone never got it.
    message_id = db.Column(db.BigInteger, nullable=True)

    # Stored so the later edit is written in the same language as the original.
    language = db.Column(db.String(2), nullable=False, default='en')

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    proposal = db.relationship('TelegramProposal', back_populates='messages')
    user = db.relationship('User')

    def to_dict(self):
        return {
            'id': self.id,
            'proposal_id': self.proposal_id,
            'user_id': self.user_id,
            'chat_id': self.chat_id,
            'message_id': self.message_id,
            'language': self.language,
        }
```

- [x] **Step 4: Register the models**

In `app/models/__init__.py`, add next to the other imports (near line 12):

```python
from app.models.telegram_proposal import TelegramProposal, TelegramProposalMessage
```

and add both names to the `__all__` list (starts at line 178):

```python
    'TelegramProposal',
    'TelegramProposalMessage',
```

- [x] **Step 5: Write the migration**

Create `migrations/versions/s9t0u1v2w3x4_telegram_proposals.py`:

```python
"""The bot learns to ask: questions and the phones they landed on

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-08-25

Two tables. `telegram_proposals` is one row per question the bot asked;
`telegram_proposal_messages` is one row per phone it landed on, which is the
only way to grey out the other copies once somebody has decided.

Both are new tables — nothing to backfill, nothing existing to break.
"""
from alembic import op
import sqlalchemy as sa

revision = 's9t0u1v2w3x4'
down_revision = 'r8s9t0u1v2w3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'telegram_proposals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=40), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('options', sa.JSON(), nullable=False),
        sa.Column('work_plan_id', sa.Integer(), nullable=True),
        sa.Column('target_day_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False,
                  server_default='open'),
        sa.Column('decided_by_id', sa.Integer(), nullable=True),
        sa.Column('decided_option', sa.String(length=40), nullable=True),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('result', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['work_plan_id'], ['work_plans.id']),
        sa.ForeignKeyConstraint(['target_day_id'], ['work_plan_days.id']),
        sa.ForeignKeyConstraint(['decided_by_id'], ['users.id']),
        sa.CheckConstraint(
            "status IN ('open', 'accepted', 'declined', 'expired', 'failed')",
            name='check_telegram_proposal_status'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_telegram_proposals_kind', 'telegram_proposals', ['kind'])
    op.create_index('ix_telegram_proposals_status', 'telegram_proposals', ['status'])
    op.create_index('ix_telegram_proposals_expires_at', 'telegram_proposals',
                    ['expires_at'])
    op.create_index('ix_telegram_proposals_created_at', 'telegram_proposals',
                    ['created_at'])
    op.create_index('ix_telegram_proposals_work_plan_id', 'telegram_proposals',
                    ['work_plan_id'])

    op.create_table(
        'telegram_proposal_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('proposal_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('chat_id', sa.BigInteger(), nullable=False),
        sa.Column('message_id', sa.BigInteger(), nullable=True),
        sa.Column('language', sa.String(length=2), nullable=False,
                  server_default='en'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['proposal_id'], ['telegram_proposals.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_telegram_proposal_messages_proposal_id',
                    'telegram_proposal_messages', ['proposal_id'])


def downgrade():
    op.drop_index('ix_telegram_proposal_messages_proposal_id',
                  table_name='telegram_proposal_messages')
    op.drop_table('telegram_proposal_messages')
    for name in ('ix_telegram_proposals_work_plan_id',
                 'ix_telegram_proposals_created_at',
                 'ix_telegram_proposals_expires_at',
                 'ix_telegram_proposals_status',
                 'ix_telegram_proposals_kind'):
        op.drop_index(name, table_name='telegram_proposals')
    op.drop_table('telegram_proposals')
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `./venv/bin/python -m pytest tests/test_telegram_taps.py -q`
Expected: PASS, 5 tests.

- [x] **Step 7: Verify the migration chain is still single-headed**

Run: `./venv/bin/python -m flask db heads`
Expected: exactly one line, `s9t0u1v2w3x4 (head)`. If two heads appear, the `down_revision` is wrong — fix it before going further.

- [x] **Step 8: Run the full suite**

Run: `./venv/bin/python -m pytest tests/ -q -p no:warnings`
Expected: **655 passed, 1 skipped** (650 + 5 new).

- [x] **Step 9: Mutation check**

Delete the `CheckConstraint` from `__table_args__`, re-run
`tests/test_telegram_taps.py::TestTheNotebook::test_a_nonsense_status_is_refused`
— it must FAIL. Restore it.

- [x] **Step 10: Stage the commit (ASK Ali before running `git commit`)**

```bash
git add app/models/telegram_proposal.py app/models/__init__.py \
        migrations/versions/s9t0u1v2w3x4_telegram_proposals.py \
        tests/test_telegram_taps.py
# ASK FIRST:
git commit -m "feat: the notebook — a question the bot asked, and the phones it landed on"
```

---

### Task 2: The client learns two new words

**Files:**
- Modify: `app/services/telegram/client.py` (add after `send_chunks`, ~line 111)
- Modify: `tests/test_telegram_bot.py:42-59` (the `Recorder` double)
- Test: `tests/test_telegram_taps.py`

**Interfaces:**
- Consumes: `TelegramClient._call(method, payload)` (`client.py:59`).
- Produces: `TelegramClient.answer_callback_query(callback_query_id, text=None) -> dict | None` and `TelegramClient.edit_message_text(chat_id, message_id, text, reply_markup=None) -> dict | None`. The `Recorder` double in `tests/test_telegram_bot.py` gains `.answered` and `.edited` lists and stops discarding `reply_markup`.

- [x] **Step 1: Write the failing test**

Append to `tests/test_telegram_taps.py`:

```python
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
```

- [x] **Step 2: Run the test to verify it fails**

Run: `./venv/bin/python -m pytest tests/test_telegram_taps.py::TestTheClientLearnsTwoNewWords -q`
Expected: FAIL — `AttributeError: 'TelegramClient' object has no attribute 'answer_callback_query'`

- [x] **Step 3: Add the two methods**

In `app/services/telegram/client.py`, after `send_chunks` (ends line 111):

```python
    def answer_callback_query(self, callback_query_id, text=None):
        """Stop the spinner on the phone that just pressed a button.

        Telegram turns a little wheel on the pressed button until this is
        called, and its callback ids are short-lived. Call it FIRST, before any
        database work — doing the work first and answering last leaves the
        phone spinning on a slow evening.

        `text` shows as a toast over the chat. Keep it short; Telegram caps it
        around 200 characters.
        """
        payload = {'callback_query_id': callback_query_id}
        if text:
            payload['text'] = text[:200]
        return self._call('answerCallbackQuery', payload)

    def edit_message_text(self, chat_id, message_id, text, reply_markup=None):
        """Rewrite a message already sitting on somebody's phone.

        This is how the other planners' copies of a question stop working once
        one of them has decided. Pass `reply_markup={'inline_keyboard': []}` to
        take the buttons away — omitting it LEAVES THEM THERE, which is the
        opposite of what a decided question wants.

        No parse_mode, for the same reason send_message has none.
        """
        payload = {'chat_id': chat_id, 'message_id': message_id,
                   'text': text[:MAX_MESSAGE_CHARS],
                   'disable_web_page_preview': True}
        if reply_markup is not None:
            payload['reply_markup'] = reply_markup
        return self._call('editMessageText', payload)
```

- [x] **Step 4: Teach the test double the same two words**

In `tests/test_telegram_bot.py`, replace the `Recorder` class (lines 42-59) body's `send_message` and add the new recorders. The `reply_markup` **must** be kept — today it is accepted and thrown away, which would make every button assertion in this plan pass vacuously:

```python
class Recorder:
    """Stands in for TelegramClient. Nothing here touches api.telegram.org."""

    def __init__(self):
        self.messages = []      # (chat_id, text)
        self.markups = []       # (chat_id, reply_markup) — kept, not discarded
        self.answered = []      # (callback_query_id, text)
        self.edited = []        # (chat_id, message_id, text, reply_markup)
        self.last_error = None

    def send_message(self, chat_id, text, reply_markup=None):
        self.messages.append((chat_id, text))
        self.markups.append((chat_id, reply_markup))
        return {'message_id': len(self.messages)}

    def send_chunks(self, chat_id, chunks):
        sent = 0
        for chunk in chunks:
            if not chunk.strip():
                continue
            if self.send_message(chat_id, chunk) is not None:
                sent += 1
        return sent

    def answer_callback_query(self, callback_query_id, text=None):
        self.answered.append((callback_query_id, text))
        return {'ok': True}

    def edit_message_text(self, chat_id, message_id, text, reply_markup=None):
        self.edited.append((chat_id, message_id, text, reply_markup))
        return {'message_id': message_id}
```

Keep every other member of `Recorder` exactly as it is.

- [x] **Step 5: Run both test files**

Run: `./venv/bin/python -m pytest tests/test_telegram_taps.py tests/test_telegram_bot.py -q -p no:warnings`
Expected: PASS — 104 existing + 8 new.

- [x] **Step 6: Mutation check**

CORRECTION (ruled 2026-08-25, during execution): an earlier draft of this step
claimed `{'inline_keyboard': []}` is falsy. **It is not** — a dict is falsy only
when it has no keys, and that one has a key whose value is an empty list. So a
truthiness check would still forward it and the mutation could never fail.

`is not None` remains correct — it is the precise statement of "the caller
explicitly passed something" — but the guard needs a test that can actually
break. Add this fourth test alongside the others:

```python
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
```

Then run the mutation: change `if reply_markup is not None:` to
`if reply_markup:` — **this new fourth test must FAIL**. Restore it.

- [x] **Step 7: Stage the commit (ASK Ali first)**

```bash
git add app/services/telegram/client.py tests/test_telegram_bot.py tests/test_telegram_taps.py
# ASK FIRST:
git commit -m "feat: the bot can now stop a spinner and rewrite a message it sent"
```

---

### Task 3: Asking everybody, and remembering where it landed

**Files:**
- Create: `app/services/telegram/ask.py`
- Test: `tests/test_telegram_taps.py`

**Interfaces:**
- Consumes: `TelegramProposal`, `TelegramProposalMessage` (Task 1); `TelegramClient.send_message`, `.edit_message_text` (Task 2); `allowlist()` from `app/services/telegram/auth.py:27`.
- Produces:
  - `recipients() -> list[tuple[User, int]]` — (planner, telegram chat id)
  - `keyboard(proposal, language) -> dict`
  - `ask(kind, text_by_language, options, expires_at, details=None, work_plan_id=None, target_day_id=None, client=None) -> TelegramProposal | None`
  - `edit_everyone(proposal, text_by_language, client=None) -> None`
  - `expire_open(kind, now=None) -> int`

- [x] **Step 1: Write the failing test**

Append to `tests/test_telegram_taps.py`:

```python
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
```

- [x] **Step 2: Run to verify it fails**

Run: `./venv/bin/python -m pytest tests/test_telegram_taps.py::TestAskingEverybody -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.telegram.ask'`

- [x] **Step 3: Write the module**

Create `app/services/telegram/ask.py`:

```python
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


def expire_open(kind, now=None):
    """Close every still-open question of one kind. Returns how many.

    Called at the start of the nightly sweep so last night's buttons stop
    working before tonight's are sent.
    """
    now = now or datetime.utcnow()
    stale = TelegramProposal.query.filter(
        TelegramProposal.kind == kind,
        TelegramProposal.status == 'open',
        TelegramProposal.expires_at <= now,
    ).all()
    for proposal in stale:
        proposal.status = 'expired'
    if stale:
        db.session.commit()
    return len(stale)
```

- [x] **Step 4: Run to verify it passes**

Run: `./venv/bin/python -m pytest tests/test_telegram_taps.py -q -p no:warnings`
Expected: PASS — 18 tests.

- [x] **Step 5: Mutation checks**

1. In `recipients()`, drop the `User.role.in_(PLANNING_ROLES)` filter →
   `test_a_worker_is_never_asked` must FAIL. Restore.
2. In `edit_everyone`, change `reply_markup={'inline_keyboard': []}` to
   omitting the argument → `test_editing_everyone_takes_the_buttons_away` must
   FAIL. Restore.
3. In `keyboard`, put the order number in `callback_data` instead of the index
   → `test_the_button_carries_only_a_position` must FAIL. Restore.

- [x] **Step 6: Stage the commit (ASK Ali first)**

```bash
git add app/services/telegram/ask.py tests/test_telegram_taps.py
# ASK FIRST:
git commit -m "feat: ask every planner one question and remember where it landed"
```

---

### Task 4: The tap catcher — one finger decides

**Files:**
- Create: `app/services/telegram/taps.py`
- Modify: `app/api/telegram.py:84-101` (the `run()` thread) and `:37-38` (the stale comment)
- Test: `tests/test_telegram_taps.py`

**Interfaces:**
- Consumes: `ask.edit_everyone`, `ask.keyboard`; `TelegramClient.answer_callback_query`; `generate.PLANNING_ROLES`; `dispatcher.language_for`.
- Produces:
  - `register(kind)` — decorator registering `apply(proposal, option, user) -> dict` into `_APPLY`
  - `parse(data) -> tuple[int, int] | None`
  - `claim(proposal_id, user, option, status, now=None) -> bool` — the atomic first-press-wins
  - `handle_callback(update, user, client=None) -> None`

**One correction to the spec.** The spec's section 2 says "`answerCallbackQuery`
first, before any database work". Telegram accepts **exactly one**
`answerCallbackQuery` per press, so answering first makes it impossible to show
the outcome afterwards. This plan therefore answers **once, at the end, in a
`finally`**, carrying the outcome — guaranteed to happen even when the apply
step raises. Update the spec's section 2 to match.

- [x] **Step 1: Write the failing test**

Append to `tests/test_telegram_taps.py`:

```python
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
```

- [x] **Step 2: Run to verify it fails**

Run: `./venv/bin/python -m pytest tests/test_telegram_taps.py::TestOneFingerDecides -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.telegram.taps'`

- [x] **Step 3: Write the module**

Create `app/services/telegram/taps.py`:

```python
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


def handle_callback(update, user, client=None):
    """Handle one tap. Never raises."""
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
            # The plan changes and the claim were one transaction: both are
            # gone. The RECORD of the failure must survive that rollback, so it
            # is written in a second, separate transaction.
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
```

- [x] **Step 4: Route taps into it**

In `app/api/telegram.py`, inside `run()` (lines 87-99), replace the body after
the `sender is None` guard:

```python
                if update.get('callback_query'):
                    from app.services.telegram.taps import handle_callback
                    handle_callback(update, sender)
                    return
                chunks = handle(update, sender)
                if chunks:
                    TelegramClient().send_chunks(chat_id, chunks)
```

And correct the now-stale comment at lines 37-38:

```python
# In-memory and per-worker: a restart loses it, and the cost of that is one
# duplicated READ. Mutations are NOT protected by this — they are protected by
# the atomic claim in app/services/telegram/taps.py, which also covers the case
# this cache never could: two DIFFERENT planners pressing at the same moment.
```

- [x] **Step 5: Run to verify it passes**

Run: `./venv/bin/python -m pytest tests/test_telegram_taps.py tests/test_telegram_bot.py -q -p no:warnings`
Expected: PASS — 104 + 26.

- [x] **Step 6: Mutation checks**

1. In `claim`, drop `TelegramProposal.status == 'open'` from the filter →
   `test_the_second_finger_is_told_who_decided` must FAIL. Restore.
2. In `handle_callback`, drop the `user.role not in PLANNING_ROLES` guard →
   `test_a_worker_may_not_change_the_plan` must FAIL. Restore.
3. In `_expand`, replace the append with `proposal.options = list(added)` →
   `test_pressing_expand_shows_more_buttons_without_deciding` must FAIL.
   Restore.
4. Move the `answer_callback_query` out of the `finally` into the success path
   → `test_the_spinner_is_always_stopped` must FAIL. Restore.

- [x] **Step 7: Confirm the spec already agrees**

`docs/superpowers/specs/2026-08-25-telegram-taps-design.md`, section
"2. The tap catcher", item 1 was corrected when this plan was written and should
already read "Exactly one `answerCallbackQuery`, at the end, in a `finally`".
Check it. If it still says "answer first", fix it — the spec and the code must
not disagree about this.

- [x] **Step 8: Stage the commit (ASK Ali first)**

```bash
git add app/services/telegram/taps.py app/api/telegram.py \
        tests/test_telegram_taps.py docs/superpowers/specs/2026-08-25-telegram-taps-design.md
# ASK FIRST:
git commit -m "feat: the tap catcher — one finger decides, the other phones stop"
```

---

### Task 5: Baking one bun — place one job on one day

**Files:**
- Create: `app/services/place_one.py`
- Test: `tests/test_place_one.py`

**Interfaces:**
- Consumes: `_price_bundle`, `bundle_man_hours`, `_normalize_berth`, `_get_category`, `_determine_team_type`, `_assign_from_rule` (all `app/services/work_plan_generator_service.py`); `_job_wallet_key`, `_berth_key`, `job_cost_man_hours` (`app/services/day_ripple.py`); `_unavailable_by_date` (`app/services/day_budget.py`).
- Produces:
  - `price_one(order) -> dict` with keys `hours`, `crew`, `cost_man_hours`, `berth`, `wallet_key`
  - `staff_one_job(job, day, crew_needed=None) -> list[int]`
  - `place_one(order, day, crew_user_ids=None, priority=None) -> WorkPlanJob`

- [x] **Step 1: Write the failing test**

Create `tests/test_place_one.py`:

```python
"""Baking one bun.

The planner only knows how to bake a whole tray — a week at a time, and it
refuses a published week. Both new questions need to put ONE job on ONE day.

And the price tag has to match. A job costs the day `hours x crew`, and this
codebase has two ideas of `crew`: the planner's figure from Ali's table, and
the domino's `max(2, len(assignments))`. For a 4-man reach stacker they differ
by double. Putting the men on the job BEFORE the day is measured is what makes
them agree — the same mistake, in its other home, was the carry-over bug of
2026-08-25.
"""

from datetime import date, timedelta

import pytest

from app.extensions import db
from app.models import (Equipment, SAPWorkOrder, User, WorkPlan, WorkPlanDay,
                        WorkPlanJob)
from app.models.worker_assignment_rule import WorkerAssignmentRule
from app.services.day_ripple import job_cost_man_hours
from app.services.place_one import place_one, price_one, staff_one_job

MONDAY = date(2026, 8, 24)
_seq = iter(range(1, 10000))


def _man(db_session, name, on_leave=False):
    user = User(email=f'{name}-{next(_seq)}@t.iq', full_name=name,
                role='maintenance', role_id=f'PLC{next(_seq):04d}',
                specialization='mechanical', shift='day', is_on_leave=on_leave)
    user.set_password('x')
    db_session.session.add(user)
    db_session.session.commit()
    return user


def _rule(db_session, men, berth='west', team_type='regular_pm'):
    rule = WorkerAssignmentRule(berth=berth, team_type=team_type,
                                equipment_category='all', mech_count=2,
                                elec_count=0,
                                candidate_mech_workers=[m.id for m in men])
    db_session.session.add(rule)
    db_session.session.commit()
    return rule


def _week(db_session, admin_user, status='published'):
    plan = WorkPlan(week_start=MONDAY, week_end=MONDAY + timedelta(days=6),
                    status=status, created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    days = []
    for offset in range(7):
        day = WorkPlanDay(work_plan_id=plan.id, date=MONDAY + timedelta(days=offset))
        db_session.session.add(day)
        days.append(day)
    db_session.session.commit()
    return plan, days


def _order(db_session, name='RS110', kind='reach stacker', job_type='pm',
           order_type='PRM', number='700000000300', berth='west',
           description='RS110 250HR SERVICE'):
    equipment = Equipment(name=name, serial_number=f'SN-{name}-{next(_seq)}',
                          equipment_type=kind, berth=berth)
    db_session.session.add(equipment)
    db_session.session.commit()
    order = SAPWorkOrder(order_number=number, order_type=order_type,
                         job_type=job_type, equipment_id=equipment.id,
                         description=description, estimated_hours=4.0,
                         priority='urgent', berth=berth, status='pending',
                         work_plan_id=None)
    db_session.session.add(order)
    db_session.session.commit()
    return order


class TestThePriceTag:
    def test_a_reach_stacker_pm_is_priced_from_alis_table_not_the_import(
            self, db_session, admin_user):
        """SAPWorkOrder.estimated_hours is an import default of 4.0. Ali's
        table says a reach stacker PM is 12 hours with 2 men."""
        order = _order(db_session)

        priced = price_one(order)

        assert priced['hours'] == 12.0
        assert priced['crew'] == 2
        assert priced['cost_man_hours'] == 24.0
        assert priced['berth'] == 'west'
        assert priced['wallet_key'] == 'pm'

    def test_a_standalone_fault_spends_the_defect_wallet(self, db_session,
                                                         admin_user):
        order = _order(db_session, name='ECH5', kind='empty handler',
                       job_type='defect', order_type='COM',
                       number='700000000301', description='ECH5 leak')

        priced = price_one(order)

        assert priced['wallet_key'] == 'spec'

    def test_an_ac_service_spends_no_wallet_at_all(self, db_session, admin_user):
        order = _order(db_session, name='TT9', kind='tractor',
                       number='700000000302',
                       description='TT9 AC SERVICE')

        assert price_one(order)['wallet_key'] is None


class TestPuttingItOnTheDay:
    def test_the_job_lands_with_its_men_on_it(self, db_session, admin_user):
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'p{i}') for i in range(2)]
        _rule(db_session, men)
        order = _order(db_session)

        job = place_one(order, days[1])

        assert job.work_plan_day_id == days[1].id
        assert float(job.estimated_hours) == 12.0
        assert len(job.assignments) == 2
        assert {a.user_id for a in job.assignments} == {m.id for m in men}

    def test_the_promised_price_is_the_price_the_domino_reads(self, db_session,
                                                              admin_user):
        """The whole point. price_one() promises a number to the question; the
        domino later reads job_cost_man_hours() off the created row. If those
        two ever disagree, a day quietly runs over — that was the carry-over
        bug."""
        plan, days = _week(db_session, admin_user)
        _rule(db_session, [_man(db_session, f'q{i}') for i in range(2)])
        order = _order(db_session)
        promised = price_one(order)['cost_man_hours']

        job = place_one(order, days[1])

        assert job_cost_man_hours(job) == promised

    def test_the_box_row_is_emptied(self, db_session, admin_user):
        plan, days = _week(db_session, admin_user)
        _rule(db_session, [_man(db_session, f'r{i}') for i in range(2)])
        order = _order(db_session)

        place_one(order, days[1])

        db_session.session.refresh(order)
        assert order.status == 'scheduled'
        assert order.work_plan_id == plan.id

    def test_named_men_beat_the_rule(self, db_session, admin_user):
        """The crew that just finished early gets the work — not whoever the
        rule would have picked."""
        plan, days = _week(db_session, admin_user)
        rule_men = [_man(db_session, f's{i}') for i in range(2)]
        _rule(db_session, rule_men)
        chosen = [_man(db_session, 'chosen1'), _man(db_session, 'chosen2')]
        order = _order(db_session)

        job = place_one(order, days[1], crew_user_ids=[m.id for m in chosen])

        assert {a.user_id for a in job.assignments} == {m.id for m in chosen}

    def test_a_man_on_leave_is_never_staffed(self, db_session, admin_user):
        plan, days = _week(db_session, admin_user)
        away = _man(db_session, 'away', on_leave=True)
        here = [_man(db_session, f't{i}') for i in range(2)]
        _rule(db_session, [away] + here)
        order = _order(db_session)

        job = place_one(order, days[1])

        assert away.id not in {a.user_id for a in job.assignments}

    def test_no_rules_means_the_job_still_lands_but_empty_handed(
            self, db_session, admin_user):
        """Consistent with everything else: no team rules, no staffing. The
        job is still created so nothing is silently dropped."""
        plan, days = _week(db_session, admin_user)
        order = _order(db_session)

        job = place_one(order, days[1])

        assert job.id is not None
        assert job.assignments == []

    def test_it_works_on_a_published_week(self, db_session, admin_user):
        """Deliberate: a HUMAN decision may change a published week — the
        evening carry-over already does. Only unattended machinery may not, and
        nothing here runs without a finger on a button."""
        plan, days = _week(db_session, admin_user, status='published')
        _rule(db_session, [_man(db_session, f'u{i}') for i in range(2)])
        order = _order(db_session)

        job = place_one(order, days[1])

        assert job.id is not None
```

- [x] **Step 2: Run to verify it fails**

Run: `./venv/bin/python -m pytest tests/test_place_one.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.place_one'`

- [x] **Step 3: Write the module**

Create `app/services/place_one.py`:

```python
"""Put ONE job on ONE day: price it, create it, staff it, empty its box row.

Nothing in this codebase could do this. The generator bakes a whole week in one
pass and refuses anything but a draft plan. `schedule_sap_order`
(app/api/work_plans.py:934) places one order but diverges from the generator in
four ways — it does not re-price from Ali's hours table, does not normalise the
berth, does no capacity check, and staffs nobody.

THE PRICE TAG, stated once. A job costs its day `estimated_hours x crew`, and
this codebase holds two different ideas of `crew`: the generator's priced figure
from Ali's table, and day_ripple's `max(MIN_CREW, len(job.assignments))`. For a
4-man urgent reach stacker those differ by DOUBLE. This function assigns the men
BEFORE anybody measures the day, so the two agree by construction. The same
disagreement, in its other home, was the carry-over bug of 2026-08-25.
"""

import logging
from collections import defaultdict

from app.extensions import db
from app.models import SAPWorkOrder, WorkPlanJob  # noqa: F401
from app.models.work_plan_assignment import WorkPlanAssignment
from app.models.worker_assignment_rule import WorkerAssignmentRule
from app.models.user import User
from app.services.day_budget import _unavailable_by_date
from app.services.job_durations import MIN_CREW

logger = logging.getLogger(__name__)


def _member_for(order):
    equipment = order.equipment
    from app.services.work_plan_generator_service import _normalize_berth
    berth = _normalize_berth(order.berth or (equipment.berth if equipment else None))
    return {
        'source': 'sap',
        'job_type': order.job_type,
        'sap_order_type': order.order_type,
        'sap_order_number': order.order_number,
        'equipment_id': order.equipment_id,
        'equipment_type': equipment.equipment_type if equipment else None,
        'description': order.description,
        'berth': berth,
        'estimated_hours': order.estimated_hours,
        'priority': order.priority,
        'cycle_id': order.cycle_id,
        'maintenance_base': order.maintenance_base,
    }, berth


def price_one(order):
    """What this order costs a day, using the generator's own arithmetic.

    A one-member bundle through `_price_bundle` + `bundle_man_hours`, so the
    hours come from Ali's table and NOT from `SAPWorkOrder.estimated_hours`,
    which is an import default of 4.0 for almost every row.

    A lone fault is priced from the "alone" column, which is correct: an order
    going in by itself is not riding along with a PM.
    """
    from app.services.work_plan_generator_service import (
        _bundle_wallet_key, _price_bundle, bundle_man_hours)

    member, berth = _member_for(order)
    bundle = {'equipment_id': order.equipment_id, 'berth': berth,
              'score': 0, 'members': [member]}
    _price_bundle(bundle)
    return {
        'hours': float(member.get('estimated_hours') or 0),
        'crew': int(member.get('crew') or MIN_CREW),
        'cost_man_hours': bundle_man_hours(bundle),
        'berth': berth,
        'wallet_key': _bundle_wallet_key(bundle),
    }


def staff_one_job(job, day, crew_needed=None):
    """Pick men for one job using the generator's own rule logic.

    `_assign_from_rule` cannot be called on its own — it needs four context
    structures that only `_step_assign` builds. This rebuilds them for a single
    day, which is cheap, and returns the user ids assigned.

    Night shift: a man on nights is treated as UNAVAILABLE here, following
    `day_budget._unavailable_by_date`. The generator's own assigner disagrees
    (it only excludes 'off' and 'leave'), and that inconsistency is real and
    recorded in the spec — but a wallet that gives a night man no hours must not
    then have him staffed onto day work.
    """
    from app.services.work_plan_generator_service import (
        _assign_from_rule, _determine_team_type, _get_category, _normalize_berth)

    workers_by_id = {u.id: u for u in User.query.filter(
        User.is_active.is_(True), User.is_on_leave.is_(False)).all()}
    if not workers_by_id:
        return []

    rules = WorkerAssignmentRule.query.filter_by(is_active=True).all()
    if not rules:
        return []

    berth = _normalize_berth(job.berth) or 'both'
    team_type = _determine_team_type(job)
    equipment = job.equipment
    category = (_get_category(equipment.equipment_type)
                if equipment and equipment.equipment_type else 'all')

    def matches(rule, wanted_category):
        return (rule.berth == berth and rule.team_type == team_type
                and rule.equipment_category == wanted_category)

    candidates = ([r for r in rules if matches(r, category)]
                  or [r for r in rules if matches(r, 'all')])
    if not candidates:
        return []

    plan = day.work_plan
    unavailable = _unavailable_by_date(plan.week_start, plan.week_end)
    day_unavailable = set(unavailable.get(day.date, set()))

    # defaultdicts, NOT plain dicts. `_assign_from_rule` does
    # `daily_load[day_id][uid] += 1` and `weekly_load[uid] += 1` on keys it has
    # never seen, so plain dicts raise KeyError the moment it staffs anybody.
    # The generator builds them the same way at
    # work_plan_generator_service.py:1929/1935.
    daily_load = defaultdict(lambda: defaultdict(int))
    weekly_load = defaultdict(int)
    for plan_day in plan.days:
        for other in plan_day.jobs:
            for assignment in other.assignments or []:
                weekly_load[assignment.user_id] = weekly_load.get(
                    assignment.user_id, 0) + 1
                if plan_day.id == day.id:
                    daily_load[day.id][assignment.user_id] = (
                        daily_load[day.id].get(assignment.user_id, 0) + 1)

    picked = _assign_from_rule(job, candidates[0], workers_by_id, daily_load,
                               weekly_load, day.id,
                               day_unavailable=day_unavailable,
                               crew_needed=crew_needed)
    return [user_id for user_id, _is_lead in picked]


def place_one(order, day, crew_user_ids=None, priority=None):
    """Put one box order on one day, priced and staffed. Does NOT commit.

    Named men beat the rule: the crew that just finished early gets the work,
    not whoever the rule would have chosen. When nobody is named, the rule
    picks; when there are no rules at all, the job still lands with nobody on
    it — consistent with the rest of the system, which switches its hours
    checks off rather than refusing to work when rules are missing.
    """
    from app.services.work_plan_generator_service import _normalize_berth
    from app.models.pm_template import PMTemplate

    priced = price_one(order)
    equipment = order.equipment
    template = None
    if equipment is not None:
        template = PMTemplate.find_for_job(equipment.equipment_type,
                                           order.cycle_id)

    job = WorkPlanJob(
        work_plan_day_id=day.id,
        job_type=order.job_type,
        berth=_normalize_berth(order.berth or (equipment.berth if equipment else None)),
        priority=priority or order.priority or 'normal',
        estimated_hours=priced['hours'],
        equipment_id=order.equipment_id,
        cycle_id=order.cycle_id,
        pm_template_id=template.id if template else None,
        sap_order_number=order.order_number,
        sap_order_type=order.order_type,
        description=order.description,
        maintenance_base=order.maintenance_base,
        overdue_value=order.overdue_value,
        overdue_unit=order.overdue_unit,
        planned_date=order.planned_date or order.required_date,
        position=len(day.jobs) + 1,
    )
    db.session.add(job)
    db.session.flush()

    if crew_user_ids:
        for user_id in crew_user_ids:
            db.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                              user_id=user_id))
    else:
        staff_one_job(job, day, crew_needed=priced['crew'])

    order.status = 'scheduled'
    order.work_plan_id = day.work_plan_id
    db.session.flush()

    logger.info('place_one | order=%s day=%s hours=%.1f crew=%d',
                order.order_number, day.date, priced['hours'], priced['crew'])
    return job
```

- [x] **Step 4: Run to verify it passes**

Run: `./venv/bin/python -m pytest tests/test_place_one.py -q -p no:warnings`
Expected: PASS — 10 tests.

- [x] **Step 5: Mutation checks**

1. In `place_one`, use `estimated_hours=order.estimated_hours` instead of the
   priced hours → `test_a_reach_stacker_pm_is_priced_from_alis_table_not_the_import`
   still passes but `test_the_promised_price_is_the_price_the_domino_reads`
   must FAIL. Restore.
2. In `place_one`, ignore `crew_user_ids` and always call `staff_one_job` →
   `test_named_men_beat_the_rule` must FAIL. Restore.

- [x] **Step 6: Stage the commit (ASK Ali first)**

```bash
git add app/services/place_one.py tests/test_place_one.py
# ASK FIRST:
git commit -m "feat: place one job on one day, priced and staffed"
```

---

### Task 6: How full is a day, really

**Files:**
- Modify: `app/services/day_budget.py` (add at the end, after `build_week_wallets`)
- Test: `tests/test_day_budget.py` (append a class)

**Interfaces:**
- Consumes: `build_week_wallets`, `Wallet`; `job_cost_man_hours`, `_job_wallet_key`, `_berth_key` (`app/services/day_ripple.py`).
- Produces: `day_free_man_hours(plan, day, berth, wallet_key) -> float | None` — `None` means "wallets are off", which is not the same as zero.

Three places already compute this and each does it slightly differently
(`_existing_load` at `work_plan_generator_service.py:1460` is machine-hours with
no crew multiplier and must never be used for this; the real logic is inlined in
`_step_distribute:1293-1322` and in `make_room:87-105`). This task gives it one
home before two more callers copy it a fourth time.

- [x] **Step 1: Write the failing test**

Append to `tests/test_day_budget.py`. It already has `_user(db_session, name)`,
`_rule(db_session, berth, team_type, workers, category='all')` and
`_week(db_session, admin_user, start=TODAY)` — reuse those verbatim. It has NO
`_machine` helper and does not import `Equipment`, `WorkPlanJob` or
`WorkPlanAssignment`, so add these first:

```python
from app.models import Equipment, WorkPlanJob
from app.models.work_plan_assignment import WorkPlanAssignment

_dbseq = iter(range(1, 10000))


def _machine(db_session, name, kind, berth='west'):
    equipment = Equipment(name=f'{name}{next(_dbseq)}',
                          serial_number=f'SNDB{next(_dbseq)}',
                          equipment_type=kind, berth=berth)
    db_session.session.add(equipment)
    db_session.session.commit()
    return equipment


def _job_on(db_session, day, men, hours, job_type='pm', berth='west',
            name='TT', description=None):
    equipment = _machine(db_session, name, 'tractor', berth)
    job = WorkPlanJob(work_plan_day_id=day.id, job_type=job_type,
                      equipment_id=equipment.id, estimated_hours=hours,
                      berth=berth, position=1,
                      description=description or f'{equipment.name} service')
    db_session.session.add(job)
    db_session.session.flush()
    for man in men:
        db_session.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                                  user_id=man.id))
    db_session.session.commit()
    return job


class TestHowFullADayReallyIs:
    def test_it_counts_men_not_machines(self, db_session, admin_user):
        """A 4-hour job done by 3 men costs the day 12, not 4."""
        from app.services.day_budget import day_free_man_hours
        plan, days = _week(db_session, admin_user)
        pm = [_user(db_session, f'f{i}') for i in range(3)]      # 24 mh
        _rule(db_session, 'west', 'regular_pm', pm)
        _job_on(db_session, days[0], pm, 4.0)

        assert day_free_man_hours(plan, days[0], 'west', 'pm') == 12.0

    def test_an_empty_day_is_all_free(self, db_session, admin_user):
        from app.services.day_budget import day_free_man_hours
        plan, days = _week(db_session, admin_user)
        _rule(db_session, 'west', 'regular_pm',
              [_user(db_session, f'g{i}') for i in range(2)])

        assert day_free_man_hours(plan, days[0], 'west', 'pm') == 16.0

    def test_a_shared_wallet_is_drained_by_both_teams(self, db_session,
                                                      admin_user):
        """East is one team: an hour spent on a fault is an hour gone from PM
        too. Filtering by wallet key alone would under-count it."""
        from app.services.day_budget import day_free_man_hours
        plan, days = _week(db_session, admin_user)
        men = [_user(db_session, f'h{i}') for i in range(2)]     # 16 mh
        _rule(db_session, 'east', 'regular_pm', men)
        _job_on(db_session, days[0], men, 3.0, job_type='defect', berth='east',
                name='ECH', description='ECH leak')

        assert day_free_man_hours(plan, days[0], 'east', 'pm') == 10.0

    def test_no_rules_means_none_not_zero(self, db_session, admin_user):
        """None says 'there is no budget concept here'. Zero would say 'the day
        is full', and the caller must not confuse the two."""
        from app.services.day_budget import day_free_man_hours
        plan, days = _week(db_session, admin_user)

        assert day_free_man_hours(plan, days[0], 'west', 'pm') is None
```

`_week` returns `(plan, days)`; confirm that before writing the tests and adapt
if it differs. Do NOT invent new `_user`/`_rule`/`_week` helpers — reuse the
file's own.

- [x] **Step 2: Run to verify it fails**

Run: `./venv/bin/python -m pytest tests/test_day_budget.py::TestHowFullADayReallyIs -q`
Expected: FAIL — `ImportError: cannot import name 'day_free_man_hours'`

- [x] **Step 3: Write the function**

Append to `app/services/day_budget.py`:

```python
def day_free_man_hours(plan, day, berth, wallet_key):
    """Man-hours still unspent on this day's (berth, team) wallet.

    Returns None — never 0.0 — when no team rules exist. None means "there is
    no budget concept here" and every caller must treat it as "the hours check
    is off", exactly as the generator already treats an empty wallet dict. Zero
    would mean the opposite: a full day.

    Three places already did this inline and one of them (`_existing_load`) got
    it wrong, summing machine-hours with no crew multiplier. This is the one
    home for it.
    """
    from app.services.day_ripple import (_berth_key, _job_wallet_key,
                                         job_cost_man_hours)

    wallets = build_week_wallets(plan, list(plan.days))
    if not wallets:
        return None

    berth_key = _berth_key(berth)
    pots = wallets.get(day.id, {}).get(berth_key)
    if not pots or wallet_key not in pots:
        return None

    # On a one-team berth 'pm' and 'spec' are the SAME Wallet object, so an
    # hour spent on either drains both. Filtering by key alone under-counts it.
    shared = pots['pm'] is pots['spec']

    spent = 0.0
    for job in day.jobs:
        key = _job_wallet_key(job)
        if key is None:
            continue
        if _berth_key(job.berth or 'both') != berth_key:
            continue
        if shared or key == wallet_key:
            spent += job_cost_man_hours(job)

    return max(0.0, pots[wallet_key].hours_total - spent)
```

- [x] **Step 4: Run to verify it passes**

Run: `./venv/bin/python -m pytest tests/test_day_budget.py -q -p no:warnings`
Expected: PASS — the existing class plus 4 new tests.

- [x] **Step 5: Mutation check**

Drop the `shared` handling (always `key == wallet_key`) →
`test_a_shared_wallet_is_drained_by_both_teams` must FAIL. Restore.

- [x] **Step 6: Stage the commit (ASK Ali first)**

```bash
git add app/services/day_budget.py tests/test_day_budget.py
# ASK FIRST:
git commit -m "feat: one home for 'how full is this day, in man-hours'"
```

---

### Task 7: The night watch — an urgent order with nowhere to go

**Files:**
- Create: `app/services/urgent_watch.py`
- Modify: `app/services/scheduler_service.py:973-995` (inside `rebuild_pool_nightly`)
- Modify: `app/services/telegram/taps.py` (lazy kind registration)
- Test: `tests/test_urgent_watch.py`

**Interfaces:**
- Consumes: `price_one`, `place_one` (Task 5); `day_free_man_hours` (Task 6); `ask`, `expire_open` (Task 3); `register` (Task 4); `make_room` (`app/services/day_ripple.py:58`); `planning_today` (`app/utils/decorators.py:175`).
- Produces:
  - `order_is_urgent(order) -> bool`
  - `plan_for_week(day) -> WorkPlan | None`
  - `look_for_homeless_urgents(today=None, client=None) -> dict` with keys `asked`, `checked`, `reason`
  - the registered `apply` for `kind='urgent_needs_room'`, returning `{'chain': [...], 'job_id': int}`

- [x] **Step 1: Write the failing test**

Create `tests/test_urgent_watch.py`:

```python
"""An urgent order with nowhere to go.

Today it just sits in the box and nobody is told: the generator puts a bundle
it cannot place into `unscheduled` and returns. The domino already knows how to
slide the least important untouched job forward — nothing ever asked whether it
should.
"""

from datetime import date, datetime, timedelta

import pytest

from app.extensions import db
from app.models import (Equipment, SAPWorkOrder, TelegramProposal, User,
                        WorkPlan, WorkPlanDay, WorkPlanJob)
from app.models.work_plan_assignment import WorkPlanAssignment
from app.models.worker_assignment_rule import WorkerAssignmentRule

MONDAY = date(2026, 8, 24)
ALI_TELEGRAM_ID = 1811629337
_seq = iter(range(1, 10000))


class Recorder:
    def __init__(self):
        self.messages = []
        self.markups = []
        self.edited = []
        self.answered = []
        self._n = 0

    def send_message(self, chat_id, text, reply_markup=None):
        self._n += 1
        self.messages.append((chat_id, text))
        self.markups.append((chat_id, reply_markup))
        return {'message_id': 200 + self._n}

    def edit_message_text(self, chat_id, message_id, text, reply_markup=None):
        self.edited.append((chat_id, message_id, text, reply_markup))
        return {'message_id': message_id}

    def answer_callback_query(self, callback_query_id, text=None):
        self.answered.append((callback_query_id, text))
        return {'ok': True}


def _man(db_session, name):
    user = User(email=f'{name}-{next(_seq)}@t.iq', full_name=name,
                role='maintenance', role_id=f'UWM{next(_seq):04d}',
                specialization='mechanical', shift='day')
    user.set_password('x')
    db_session.session.add(user)
    db_session.session.commit()
    return user


def _rule(db_session, men, berth='west'):
    db_session.session.add(WorkerAssignmentRule(
        berth=berth, team_type='regular_pm', equipment_category='all',
        mech_count=2, elec_count=0,
        candidate_mech_workers=[m.id for m in men]))
    db_session.session.commit()


def _week(db_session, admin_user):
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


def _machine(db_session, name, kind, berth='west'):
    equipment = Equipment(name=name, serial_number=f'SN-{name}-{next(_seq)}',
                          equipment_type=kind, berth=berth)
    db_session.session.add(equipment)
    db_session.session.commit()
    return equipment


def _order(db_session, number, kind='reach stacker', priority='urgent',
           name=None, berth='west'):
    equipment = _machine(db_session, name or f'M{number[-3:]}', kind, berth)
    order = SAPWorkOrder(order_number=number, order_type='PRM', job_type='pm',
                         equipment_id=equipment.id,
                         description=f'{equipment.name} 250HR SERVICE',
                         estimated_hours=4.0, priority=priority, berth=berth,
                         status='pending', work_plan_id=None)
    db_session.session.add(order)
    db_session.session.commit()
    return order


def _fill(db_session, day, men, hours, priority='low', name='TTL'):
    equipment = _machine(db_session, f'{name}{next(_seq)}', 'tractor')
    job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm',
                      equipment_id=equipment.id, estimated_hours=hours,
                      berth='west', position=1, priority=priority,
                      description=f'{equipment.name} service')
    db_session.session.add(job)
    db_session.session.flush()
    for man in men:
        db_session.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                                  user_id=man.id))
    db_session.session.commit()
    return job


@pytest.fixture
def allowed(app, admin_user):
    app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
    return admin_user


class TestTheNightWatch:
    def test_a_homeless_urgent_raises_a_question(self, app, db_session,
                                                 admin_user, allowed):
        """Every day packed with low-priority work; a 24 man-hour urgent PM
        cannot fit anywhere, but the lamp jobs CAN move."""
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'a{i}') for i in range(3)]      # 24 mh/day
        _rule(db_session, men)
        for day in days:
            _fill(db_session, day, men[:2], 10.0)                # 20 of 24
        _order(db_session, '700000000700')
        recorder = Recorder()

        report = look_for_homeless_urgents(today=MONDAY, client=recorder)

        assert report['asked'] == 1
        proposal = TelegramProposal.query.one()
        assert proposal.kind == 'urgent_needs_room'
        assert proposal.details['order_number'] == '700000000700'
        assert proposal.details['chain']          # the domino was simulated
        assert len(recorder.messages) == 1

    def test_an_urgent_that_fits_is_left_alone(self, app, db_session,
                                               admin_user, allowed):
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        _rule(db_session, [_man(db_session, f'b{i}') for i in range(4)])  # 32 mh
        _order(db_session, '700000000701')
        recorder = Recorder()

        report = look_for_homeless_urgents(today=MONDAY, client=recorder)

        assert report['asked'] == 0
        assert TelegramProposal.query.count() == 0

    def test_a_normal_order_is_never_asked_about(self, app, db_session,
                                                 admin_user, allowed):
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'c{i}') for i in range(3)]
        _rule(db_session, men)
        for day in days:
            _fill(db_session, day, men[:2], 10.0)
        _order(db_session, '700000000702', priority='normal')
        recorder = Recorder()

        assert look_for_homeless_urgents(today=MONDAY,
                                         client=recorder)['asked'] == 0

    def test_no_team_rules_means_total_silence(self, app, db_session,
                                               admin_user, allowed):
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        _order(db_session, '700000000703')
        recorder = Recorder()

        report = look_for_homeless_urgents(today=MONDAY, client=recorder)

        assert report['asked'] == 0
        assert recorder.messages == []

    def test_a_day_already_past_is_never_the_target(self, app, db_session,
                                                    admin_user, allowed):
        """The generator's day picker does not filter the past. A night job
        must — men cannot work Monday on Wednesday night."""
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'd{i}') for i in range(3)]
        _rule(db_session, men)
        for day in days:
            _fill(db_session, day, men[:2], 10.0)
        _order(db_session, '700000000704')
        recorder = Recorder()

        look_for_homeless_urgents(today=MONDAY + timedelta(days=3),
                                  client=recorder)

        proposal = TelegramProposal.query.one()
        target = db.session.get(WorkPlanDay, proposal.target_day_id)
        assert target.date >= MONDAY + timedelta(days=3)

    def test_asking_changes_not_one_row_of_the_plan(self, app, db_session,
                                                    admin_user, allowed):
        """The night job only ASKS. Nothing is applied without a finger."""
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'e{i}') for i in range(3)]
        _rule(db_session, men)
        for day in days:
            _fill(db_session, day, men[:2], 10.0)
        order = _order(db_session, '700000000705')
        before = {j.id: j.work_plan_day_id for j in WorkPlanJob.query.all()}

        look_for_homeless_urgents(today=MONDAY, client=Recorder())

        after = {j.id: j.work_plan_day_id for j in WorkPlanJob.query.all()}
        assert after == before
        db_session.session.refresh(order)
        assert order.status == 'pending'
        assert order.work_plan_id is None

    def test_last_nights_questions_die_first(self, app, db_session, admin_user,
                                             allowed):
        from app.services.urgent_watch import look_for_homeless_urgents
        stale = TelegramProposal(
            kind='urgent_needs_room', summary='old', options=[],
            status='open', expires_at=datetime.utcnow() - timedelta(hours=1))
        db_session.session.add(stale)
        db_session.session.commit()
        _week(db_session, admin_user)

        look_for_homeless_urgents(today=MONDAY, client=Recorder())

        db_session.session.refresh(stale)
        assert stale.status == 'expired'


class TestPressingYes:
    def _asked(self, app, db_session, admin_user):
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'y{i}') for i in range(3)]
        _rule(db_session, men)
        victims = [_fill(db_session, day, men[:2], 10.0) for day in days]
        order = _order(db_session, '700000000710')
        recorder = Recorder()
        look_for_homeless_urgents(today=MONDAY, client=recorder)
        return plan, days, order, victims, recorder

    def test_yes_makes_room_and_places_the_job(self, app, db_session,
                                               admin_user, allowed):
        from app.services.telegram import taps
        plan, days, order, victims, recorder = self._asked(app, db_session,
                                                           admin_user)
        proposal = TelegramProposal.query.one()
        update = {'update_id': 900,
                  'callback_query': {'id': 'cbq-900',
                                     'data': f'tp:{proposal.id}:0',
                                     'from': {'id': ALI_TELEGRAM_ID,
                                              'language_code': 'en'},
                                     'message': {'message_id': 201,
                                                 'chat': {'id': ALI_TELEGRAM_ID,
                                                          'type': 'private'}}}}

        taps.handle_callback(update, admin_user, client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'accepted'
        assert proposal.result['job_id']
        placed = db.session.get(WorkPlanJob, proposal.result['job_id'])
        assert placed.sap_order_number == '700000000710'
        db_session.session.refresh(order)
        assert order.status == 'scheduled'
        assert proposal.result['chain']          # something really moved

    def test_the_placed_job_does_not_overspend_its_day(self, app, db_session,
                                                       admin_user, allowed):
        from app.services.day_budget import day_free_man_hours
        from app.services.telegram import taps
        plan, days, order, victims, recorder = self._asked(app, db_session,
                                                           admin_user)
        proposal = TelegramProposal.query.one()
        update = {'update_id': 901,
                  'callback_query': {'id': 'cbq-901',
                                     'data': f'tp:{proposal.id}:0',
                                     'from': {'id': ALI_TELEGRAM_ID,
                                              'language_code': 'en'},
                                     'message': {'message_id': 202,
                                                 'chat': {'id': ALI_TELEGRAM_ID,
                                                          'type': 'private'}}}}

        taps.handle_callback(update, admin_user, client=recorder)

        db_session.session.refresh(proposal)
        target = db.session.get(WorkPlanDay, proposal.target_day_id)
        assert day_free_man_hours(plan, target, 'west', 'pm') >= 0
```

- [x] **Step 2: Run to verify it fails**

Run: `./venv/bin/python -m pytest tests/test_urgent_watch.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.urgent_watch'`

- [x] **Step 3: Write the module**

Create `app/services/urgent_watch.py`:

```python
"""An urgent order with nowhere to go — ask, never decide.

Today such an order simply waits in the box and nobody is told: the generator
drops a bundle it cannot place into `unscheduled` and returns. The domino
already knows how to slide the least important untouched job forward. Nothing
ever asked whether it should.

This runs once a night, inside the pool rebuild's cross-worker lock, and it
CHANGES NOTHING. It only writes questions.
"""

import logging
from datetime import datetime, time, timedelta

from app.extensions import db
from app.models import SAPWorkOrder, TelegramProposal, WorkPlan
from app.services.day_budget import day_free_man_hours
from app.services.day_ripple import make_room
from app.services.place_one import place_one, price_one
from app.services.telegram.ask import ask, expire_open
from app.services.telegram.taps import register
from app.utils.decorators import planning_today

logger = logging.getLogger(__name__)

KIND = 'urgent_needs_room'

WORDS = {
    'en': {
        'headline': 'URGENT {order} — {machine} — has no room on {day}.',
        'needs': 'It needs {hours} hours from {crew} men ({mh} man-hours).',
        'would_move': 'To fit it: {moves}',
        'to_box': 'back to the box',
        'yes': 'Yes, make room',
        'no': 'No',
        'pick': 'Pick a day',
        'day': '{day}',
    },
    'ar': {
        'headline': 'عاجل {order} — {machine} — لا مكان له يوم {day}.',
        'needs': 'يحتاج {hours} ساعات من {crew} رجال ({mh} ساعة-رجل).',
        'would_move': 'لإدخاله: {moves}',
        'to_box': 'يعود إلى الصندوق',
        'yes': 'نعم، أفسح مكاناً',
        'no': 'لا',
        'pick': 'اختر يوماً',
        'day': '{day}',
    },
}


def _t(language, key, **fields):
    table = WORDS.get(language, WORDS['en'])
    return table.get(key, WORDS['en'][key]).format(**fields)


def order_is_urgent(order):
    """Ali's urgency, as the placement code already reads it.

    `_is_urgent_bundle` treats a member with priority urgent/critical as urgent,
    and separately anything scoring 85+. For a lone SAP order those agree:
    `_SAP_PRIORITY_SCORE['urgent']` is 90. Deliberately NOT `_is_high_urgency`,
    which also counts plain 'high' — that one splits recipe steps, it does not
    drive placement, and 33 of the 133 live orders are 'high'.
    """
    return (order.priority or '').lower() in ('urgent', 'critical')


def plan_for_week(day):
    """The plan covering this date, or None. There is no shared helper for this
    outside the Telegram module; `week_start` is uniquely constrained, so a
    lookup by Monday is exact."""
    monday, _sunday = WorkPlan.get_week_bounds(day)
    return WorkPlan.query.filter_by(week_start=monday).first()


def _homeless_urgents():
    return [order for order in SAPWorkOrder.query.filter(
        SAPWorkOrder.status == 'pending',
        SAPWorkOrder.work_plan_id.is_(None)).all()
        if order_is_urgent(order)]


def _already_open(order_number):
    """Is this order already the subject of a live question?

    Compared in PYTHON, not in SQL. A JSON-path filter
    (`details['order_number'].as_string()`) works on Postgres and not on
    SQLite, and the whole test suite runs on SQLite — it would pass in
    production and blow up in every test, or the reverse. The number of open
    questions is single digits; a Python loop is free.
    """
    open_rows = TelegramProposal.query.filter(
        TelegramProposal.kind == KIND,
        TelegramProposal.status == 'open').all()
    return any((row.details or {}).get('order_number') == order_number
               for row in open_rows)


def _tomorrow_morning(today):
    """The buttons live until the next night's check (05:00 Baghdad)."""
    return datetime.combine(today + timedelta(days=1), time(5, 0))


def _describe(chain, language):
    parts = []
    for move in chain:
        where = (_t(language, 'to_box') if move['to'] == 'box' else move['to'])
        parts.append(f"{move['description']} → {where}")
    return '; '.join(parts)


def look_for_homeless_urgents(today=None, client=None):
    """Ask about every urgent order that cannot fit anywhere. Changes nothing."""
    today = today or planning_today()
    expired = expire_open(KIND)

    plan = plan_for_week(today)
    if plan is None:
        return {'asked': 0, 'checked': 0, 'expired': expired,
                'reason': 'no plan for this week'}

    days = [d for d in sorted(plan.days, key=lambda d: d.date)
            if d.date >= today]
    if not days:
        return {'asked': 0, 'checked': 0, 'expired': expired,
                'reason': 'no days left in this week'}

    asked = 0
    orders = _homeless_urgents()
    for order in orders:
        priced = price_one(order)
        if priced['wallet_key'] is None:
            continue                     # AC work spends no wallet; not ours
        cost = priced['cost_man_hours']

        free = [day_free_man_hours(plan, d, priced['berth'],
                                   priced['wallet_key']) for d in days]
        if any(f is None for f in free):
            return {'asked': asked, 'checked': len(orders), 'expired': expired,
                    'reason': 'no team rules — hours check is off'}
        if any(f >= cost for f in free):
            continue                     # it fits; the next generate places it

        if _already_open(order.order_number):
            continue

        target = days[0]
        chain = make_room(plan, target, cost, priced['berth'],
                          priced['wallet_key'], dry_run=True)
        if not chain:
            continue                     # nothing can move; asking is pointless

        machine = order.equipment.name if order.equipment else '?'
        texts = {}
        for language in WORDS:
            texts[language] = '\n'.join([
                _t(language, 'headline', order=order.order_number,
                   machine=machine, day=target.date.isoformat()),
                _t(language, 'needs', hours=priced['hours'],
                   crew=priced['crew'], mh=cost),
                _t(language, 'would_move', moves=_describe(chain, language)),
            ])

        options = [
            {'key': 'yes', 'action': 'apply',
             'label_en': WORDS['en']['yes'], 'label_ar': WORDS['ar']['yes']},
            {'key': 'no', 'action': 'decline',
             'label_en': WORDS['en']['no'], 'label_ar': WORDS['ar']['no']},
            {'key': 'pick', 'action': 'expand',
             'label_en': WORDS['en']['pick'], 'label_ar': WORDS['ar']['pick'],
             'expand': [{'key': f'day:{d.id}', 'action': 'apply',
                         'label_en': d.date.isoformat(),
                         'label_ar': d.date.isoformat()}
                        for d in days[1:]]},
        ]

        proposal = ask(KIND, texts, options, _tomorrow_morning(today),
                       details={'order_number': order.order_number,
                                'berth': priced['berth'],
                                'wallet_key': priced['wallet_key'],
                                'cost_man_hours': cost,
                                'hours': priced['hours'],
                                'crew': priced['crew'],
                                'chain': chain},
                       work_plan_id=plan.id, target_day_id=target.id,
                       client=client)
        if proposal is not None:
            asked += 1

    logger.info('urgent watch | checked=%d asked=%d expired=%d',
                len(orders), asked, expired)
    return {'asked': asked, 'checked': len(orders), 'expired': expired,
            'reason': None}


@register(KIND)
def apply_urgent(proposal, option, user):
    """Somebody said yes. Make the room, then put the job in it.

    `make_room` is run AGAIN, for real — the chain stored at ask time was a
    simulation and the plan may have moved since. What actually happened is
    what gets recorded.

    THE TRANSACTION CONTRACT (ruled 2026-08-25, from the Task 4 review): an
    apply function NEVER commits. It flushes, and `handle_callback` commits
    once — covering this function's work and the proposal's result row in the
    same transaction. That is what makes the failure path honest: if anything
    here raises, the rollback really does undo the plan change. An apply that
    committed its own work would put that work beyond the reach of the very
    rollback meant to protect it.
    """
    details = proposal.details or {}
    order = SAPWorkOrder.query.filter_by(
        order_number=details['order_number']).first()
    if order is None:
        raise ValueError(f"order {details['order_number']} is gone")

    day_id = proposal.target_day_id
    if (option.get('key') or '').startswith('day:'):
        day_id = int(option['key'].split(':')[1])

    from app.models import WorkPlanDay
    day = db.session.get(WorkPlanDay, day_id)
    if day is None:
        raise ValueError('that day is gone')

    priced = price_one(order)
    chain = make_room(day.work_plan, day, priced['cost_man_hours'],
                      priced['berth'], priced['wallet_key'], dry_run=False)
    job = place_one(order, day)
    db.session.flush()
    return {'chain': chain, 'job_id': job.id,
            'day': day.date.isoformat(),
            'cost_man_hours': priced['cost_man_hours']}
```

- [x] **Step 4: Make the kinds register themselves**

In `app/services/telegram/taps.py`, add near the top of `handle_callback`,
before the proposal is looked up:

```python
    _ensure_kinds_registered()
```

and define it above `handle_callback`:

```python
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
```

**Note for Stage 2:** Task 11 adds `from app.services import crew_free` to this
same function. The flag is already correct; only the import list grows.

- [x] **Step 5: Wire it into the night**

In `app/services/scheduler_service.py`, inside `rebuild_pool_nightly` (line
~973), after the existing `logger.info(...)` and still inside the
`with CrossWorkerLock(...)` block:

```python
            from app.services.urgent_watch import look_for_homeless_urgents
            watch = look_for_homeless_urgents()
            logger.info('Urgent watch: asked=%s checked=%s reason=%s',
                        watch.get('asked'), watch.get('checked'),
                        watch.get('reason'))
```

Inside the lock deliberately: the other gunicorn worker must not raise the same
question twice. After the rebuild deliberately: the box is only current once
carry-over and removal reconciliation have run.

- [x] **Step 6: Run to verify it passes**

Run: `./venv/bin/python -m pytest tests/test_urgent_watch.py -q -p no:warnings`
Expected: PASS — 9 tests.

- [x] **Step 7: Run the whole suite**

Run: `./venv/bin/python -m pytest tests/ -q -p no:warnings`
Expected: all green. Record the number.

- [x] **Step 8: Mutation checks**

1. In `look_for_homeless_urgents`, drop the `d.date >= today` filter →
   `test_a_day_already_past_is_never_the_target` must FAIL. Restore.
2. Replace `order_is_urgent` with `_is_high_urgency`'s rule (counting 'high') →
   `test_a_normal_order_is_never_asked_about` still passes; add a temporary
   `priority='high'` order to confirm the difference is real, then revert both.
3. In `apply_urgent`, reuse `details['chain']` instead of calling `make_room`
   again → `test_yes_makes_room_and_places_the_job` must FAIL (no job moves).
   Restore.

- [x] **Step 9: Stage the commit (ASK Ali first)**

```bash
git add app/services/urgent_watch.py app/services/telegram/taps.py \
        app/services/scheduler_service.py tests/test_urgent_watch.py
# ASK FIRST:
git commit -m "feat: the night watch asks when an urgent order has nowhere to go"
```

**END OF STAGE 1.** At this point the bot really asks, a tap really moves work,
and nothing about job completion or the mobile app has been touched. This is a
sensible place to stop, deploy, and watch it for a few nights before Stage 2.

---

## STAGE 2 — the fast crew becomes visible

Tasks 8–12, then verification. This stage carries the genuinely new arithmetic:
**nothing in this system has ever priced a day by `actual_hours`.** Every wallet,
the generator and the domino all use `estimated_hours`, which is exactly why a
crew that finishes a six-hour job in three releases nothing, anywhere.

### Task 8: What the men really did

**Files:**
- Create: `app/services/crew_free.py`
- Test: `tests/test_crew_free.py`

**Interfaces:**
- Consumes: `WorkPlanAssignment`, `WorkPlanJob`, `WorkPlanDay`, `WorkPlanJobTracking`; `MAN_HOURS_PER_DAY` (`app/services/job_durations.py:86`).
- Produces:
  - `hours_worked_today(user_id, on_date) -> float`
  - `free_hours_for_crew(job) -> dict[int, float]` — `{user_id: free hours}`
  - `crew_is_done_for_today(job) -> bool`

- [ ] **Step 1: Write the failing test**

Create `tests/test_crew_free.py`:

```python
"""The fast crew.

The plan gave two men six hours of work. They were done in three. It is eleven
in the morning and they are standing in the yard.

Nothing in this system notices, because every wallet, the generator and the
domino all price a day by what the plan GUESSED, never by what the men really
took. This is the arithmetic that closes that gap — and it deliberately does
not consult the wallet at all: a wallet is a planning budget, and this question
is about men standing in a yard right now.
"""

from datetime import date, timedelta

import pytest

from app.extensions import db
from app.models import Equipment, User, WorkPlan, WorkPlanDay, WorkPlanJob
from app.models.work_plan_assignment import WorkPlanAssignment
from app.models.work_plan_job_tracking import WorkPlanJobTracking

MONDAY = date(2026, 8, 24)
_seq = iter(range(1, 10000))


def _man(db_session, name):
    user = User(email=f'{name}-{next(_seq)}@t.iq', full_name=name,
                role='maintenance', role_id=f'CFM{next(_seq):04d}',
                specialization='mechanical', shift='day')
    user.set_password('x')
    db_session.session.add(user)
    db_session.session.commit()
    return user


def _week(db_session, admin_user):
    plan = WorkPlan(week_start=MONDAY, week_end=MONDAY + timedelta(days=6),
                    status='published', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    days = [WorkPlanDay(work_plan_id=plan.id, date=MONDAY + timedelta(days=i))
            for i in range(7)]
    for day in days:
        db_session.session.add(day)
    db_session.session.commit()
    return plan, days


def _job(db_session, day, men, hours, status=None, actual=None, name='TT1'):
    equipment = Equipment(name=f'{name}{next(_seq)}',
                          serial_number=f'SN{next(_seq)}',
                          equipment_type='tractor', berth='west')
    db_session.session.add(equipment)
    db_session.session.flush()
    job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm',
                      equipment_id=equipment.id, estimated_hours=hours,
                      berth='west', position=1,
                      description=f'{equipment.name} service')
    db_session.session.add(job)
    db_session.session.flush()
    for man in men:
        db_session.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                                  user_id=man.id))
    if status is not None:
        db_session.session.add(WorkPlanJobTracking(
            work_plan_job_id=job.id, status=status, actual_hours=actual))
    db_session.session.commit()
    return job


class TestWhatTheMenReallyDid:
    def test_a_finished_job_counts_its_real_hours(self, db_session, admin_user):
        from app.services.crew_free import hours_worked_today
        plan, days = _week(db_session, admin_user)
        man = _man(db_session, 'fast')
        _job(db_session, days[0], [man], 6.0, status='completed', actual=3.0)

        assert hours_worked_today(man.id, days[0].date) == 3.0

    def test_a_job_not_yet_touched_counts_its_estimate(self, db_session,
                                                       admin_user):
        """He is still committed to it. Those hours are not free."""
        from app.services.crew_free import hours_worked_today
        plan, days = _week(db_session, admin_user)
        man = _man(db_session, 'busy')
        _job(db_session, days[0], [man], 5.0)

        assert hours_worked_today(man.id, days[0].date) == 5.0

    def test_yesterdays_work_is_not_todays(self, db_session, admin_user):
        from app.services.crew_free import hours_worked_today
        plan, days = _week(db_session, admin_user)
        man = _man(db_session, 'y')
        _job(db_session, days[0], [man], 8.0, status='completed', actual=8.0)

        assert hours_worked_today(man.id, days[1].date) == 0.0

    def test_the_fast_crew_has_ten_hours_left(self, db_session, admin_user):
        """Two men, a 6h job done in 3h. 8-3 each = 10 man-hours."""
        from app.services.crew_free import free_hours_for_crew
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'z{i}') for i in range(2)]
        job = _job(db_session, days[0], men, 6.0, status='completed', actual=3.0)

        free = free_hours_for_crew(job)

        assert sum(free.values()) == 10.0
        assert set(free) == {m.id for m in men}

    def test_a_man_who_worked_a_full_day_has_nothing_left(self, db_session,
                                                          admin_user):
        from app.services.crew_free import free_hours_for_crew
        plan, days = _week(db_session, admin_user)
        man = _man(db_session, 'full')
        job = _job(db_session, days[0], [man], 8.0, status='completed',
                   actual=9.5)

        assert free_hours_for_crew(job) == {man.id: 0.0}

    def test_a_man_with_another_job_waiting_is_not_free_for_all_of_it(
            self, db_session, admin_user):
        from app.services.crew_free import free_hours_for_crew
        plan, days = _week(db_session, admin_user)
        man = _man(db_session, 'half')
        done = _job(db_session, days[0], [man], 3.0, status='completed',
                    actual=2.0)
        _job(db_session, days[0], [man], 4.0, name='TT2')       # still waiting

        assert free_hours_for_crew(done) == {man.id: 2.0}       # 8 - 2 - 4

    def test_the_crew_is_only_done_when_nothing_is_left(self, db_session,
                                                        admin_user):
        from app.services.crew_free import crew_is_done_for_today
        plan, days = _week(db_session, admin_user)
        man = _man(db_session, 'd')
        done = _job(db_session, days[0], [man], 3.0, status='completed',
                    actual=2.0)
        waiting = _job(db_session, days[0], [man], 4.0, name='TT3')

        assert crew_is_done_for_today(done) is False

        db_session.session.add(WorkPlanJobTracking(
            work_plan_job_id=waiting.id, status='completed', actual_hours=1.0))
        db_session.session.commit()

        assert crew_is_done_for_today(done) is True

    def test_an_abandoned_job_does_not_hold_the_crew(self, db_session,
                                                     admin_user):
        """'incomplete' is finished for today — the carry-over owns it now."""
        from app.services.crew_free import crew_is_done_for_today
        plan, days = _week(db_session, admin_user)
        man = _man(db_session, 'i')
        done = _job(db_session, days[0], [man], 3.0, status='completed',
                    actual=2.0)
        _job(db_session, days[0], [man], 4.0, status='incomplete', actual=1.0,
             name='TT4')

        assert crew_is_done_for_today(done) is True
```

- [ ] **Step 2: Run to verify it fails**

Run: `./venv/bin/python -m pytest tests/test_crew_free.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.crew_free'`

- [ ] **Step 3: Write the arithmetic**

Create `app/services/crew_free.py`:

```python
"""The fast crew — and what is actually left of their day.

Nothing else in this system prices a day by `actual_hours`. Every wallet, the
generator and the domino use `estimated_hours`, which is exactly why a crew
that finishes a six-hour job in three releases nothing, anywhere.

The day wallet is deliberately NOT consulted here. A wallet is a planning
budget for a team; this question is about specific men standing in the yard at
eleven in the morning. Asking the wallet would answer a different question and
would say "nothing is free" on any day that was planned full — which is every
day this feature is for.
"""

import logging

from app.extensions import db
from app.models import WorkPlanDay, WorkPlanJob
from app.models.work_plan_assignment import WorkPlanAssignment
from app.models.work_plan_job_tracking import WorkPlanJobTracking
from app.services.job_durations import MAN_HOURS_PER_DAY, MIN_CREW

logger = logging.getLogger(__name__)

# Statuses that mean "this job is finished with, for today".
DONE_STATUSES = ('completed', 'incomplete')


def _his_jobs_on(user_id, on_date):
    """Every job this man is on, on this date, with its tracking row.

    The same three-table join `/my-jobs` uses (work_plan_tracking.py:625);
    there is no reusable helper for it in the codebase.
    """
    return (db.session.query(WorkPlanJob, WorkPlanJobTracking)
            .join(WorkPlanAssignment,
                  WorkPlanAssignment.work_plan_job_id == WorkPlanJob.id)
            .join(WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id)
            .outerjoin(WorkPlanJobTracking,
                       WorkPlanJobTracking.work_plan_job_id == WorkPlanJob.id)
            .filter(WorkPlanAssignment.user_id == user_id,
                    WorkPlanDay.date == on_date)
            .all())


def hours_worked_today(user_id, on_date):
    """What this man's day has actually cost him so far.

    A finished job counts the hours it REALLY took. A job not yet finished
    counts its estimate — he is still committed to it, so those hours are not
    free to give away.
    """
    total = 0.0
    for job, tracking in _his_jobs_on(user_id, on_date):
        if (tracking is not None
                and tracking.status in DONE_STATUSES
                and tracking.actual_hours is not None):
            total += float(tracking.actual_hours)
        else:
            total += float(job.estimated_hours or 0)
    return total


def free_hours_for_crew(job):
    """{user_id: hours left} for the men on this job. Eight hours each, minus
    what the day has really cost them. Never negative."""
    day = job.day
    if day is None:
        return {}
    free = {}
    for assignment in job.assignments or []:
        worked = hours_worked_today(assignment.user_id, day.date)
        free[assignment.user_id] = max(0.0, MAN_HOURS_PER_DAY - worked)
    return free


def crew_is_done_for_today(job):
    """True when nobody on this job still has work waiting today.

    'incomplete' counts as done: the man has stopped, and the evening
    carry-over owns those hours now.
    """
    day = job.day
    if day is None:
        return False
    for assignment in job.assignments or []:
        for other, tracking in _his_jobs_on(assignment.user_id, day.date):
            if tracking is None or tracking.status not in DONE_STATUSES:
                return False
    return True
```

- [ ] **Step 4: Run to verify it passes**

Run: `./venv/bin/python -m pytest tests/test_crew_free.py -q -p no:warnings`
Expected: PASS — 8 tests.

- [ ] **Step 5: Mutation checks**

1. In `hours_worked_today`, always use `job.estimated_hours` →
   `test_a_finished_job_counts_its_real_hours` and
   `test_the_fast_crew_has_ten_hours_left` must FAIL. Restore.
2. In `hours_worked_today`, count a not-yet-finished job as zero →
   `test_a_man_with_another_job_waiting_is_not_free_for_all_of_it` must FAIL.
   Restore.
3. Drop `'incomplete'` from `DONE_STATUSES` →
   `test_an_abandoned_job_does_not_hold_the_crew` must FAIL. Restore.

- [ ] **Step 6: Stage the commit (ASK Ali first)**

```bash
git add app/services/crew_free.py tests/test_crew_free.py
# ASK FIRST:
git commit -m "feat: count what the men really did, not what the plan guessed"
```

---

### Task 9: The best three that fit

**Files:**
- Modify: `app/services/crew_free.py` (append)
- Test: `tests/test_crew_free.py` (append a class)

**Interfaces:**
- Consumes: `pool_orders_query` (`app/api/work_plans.py:1196`); `_step_score`, `_step_bundle`, `_resolve_overdue`, `_normalize_berth`, `bundle_man_hours` (`app/services/work_plan_generator_service.py`); `MIN_CREW`.
- Produces: `candidates_for(plan, berth, free_man_hours, free_men, limit=3) -> list[dict]`, each `{'order_number', 'description', 'hours', 'crew', 'cost_man_hours', 'score'}`.

`_step_score` and `_step_bundle` are pure and stateless — `_step_score`'s `plan`
argument is never read in its body. `_step_populate` cannot be reused (it pulls
the whole box plus every open defect plus last week's carry-overs, and runs
plan-scoped subqueries), so the candidate dicts are built here from the box
rows using the same keys its SAP branch emits.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_crew_free.py`:

```python
from app.models import SAPWorkOrder


def _box_order(db_session, number, kind='tractor', priority='normal',
               berth='west', job_type='pm'):
    equipment = Equipment(name=f'B{number[-3:]}', serial_number=f'SNB{next(_seq)}',
                          equipment_type=kind, berth=berth)
    db_session.session.add(equipment)
    db_session.session.flush()
    order = SAPWorkOrder(order_number=number, order_type='PRM',
                         job_type=job_type, equipment_id=equipment.id,
                         description=f'{equipment.name} 500HR SERVICE',
                         estimated_hours=4.0, priority=priority, berth=berth,
                         status='pending', work_plan_id=None)
    db_session.session.add(order)
    db_session.session.commit()
    return order


class TestTheBestThreeThatFit:
    def test_nothing_bigger_than_the_hours_left_is_offered(self, db_session,
                                                           admin_user):
        """A tractor PM is 4.5h x 2 men = 9 man-hours. A reach stacker PM is
        12h x 2 = 24. With 10 man-hours free only the tractor can be offered."""
        from app.services.crew_free import candidates_for
        plan, days = _week(db_session, admin_user)
        _box_order(db_session, '700000000800', kind='tractor')
        _box_order(db_session, '700000000801', kind='reach stacker')

        offered = candidates_for(plan, 'west', 10.0, free_men=2)

        assert [c['order_number'] for c in offered] == ['700000000800']

    def test_at_most_three(self, db_session, admin_user):
        from app.services.crew_free import candidates_for
        plan, days = _week(db_session, admin_user)
        for i in range(5):
            _box_order(db_session, f'70000000081{i}', kind='tractor')

        assert len(candidates_for(plan, 'west', 100.0, free_men=4)) == 3

    def test_the_urgent_one_comes_first(self, db_session, admin_user):
        from app.services.crew_free import candidates_for
        plan, days = _week(db_session, admin_user)
        _box_order(db_session, '700000000820', kind='tractor')
        _box_order(db_session, '700000000821', kind='tractor',
                   priority='urgent')

        offered = candidates_for(plan, 'west', 100.0, free_men=4)

        assert offered[0]['order_number'] == '700000000821'

    def test_the_other_berth_is_not_offered(self, db_session, admin_user):
        from app.services.crew_free import candidates_for
        plan, days = _week(db_session, admin_user)
        _box_order(db_session, '700000000830', kind='tractor', berth='east')

        assert candidates_for(plan, 'west', 100.0, free_men=4) == []

    def test_a_job_needing_more_men_than_are_free_is_not_offered(
            self, db_session, admin_user):
        from app.services.crew_free import candidates_for
        plan, days = _week(db_session, admin_user)
        _box_order(db_session, '700000000840', kind='tractor')

        assert candidates_for(plan, 'west', 100.0, free_men=1) == []

    def test_an_empty_box_offers_nothing(self, db_session, admin_user):
        from app.services.crew_free import candidates_for
        plan, days = _week(db_session, admin_user)

        assert candidates_for(plan, 'west', 100.0, free_men=4) == []
```

- [ ] **Step 2: Run to verify it fails**

Run: `./venv/bin/python -m pytest tests/test_crew_free.py::TestTheBestThreeThatFit -q`
Expected: FAIL — `ImportError: cannot import name 'candidates_for'`

- [ ] **Step 3: Write it**

Append to `app/services/crew_free.py`:

```python
def _candidate_dict(order):
    """One box row in the shape `_step_score` expects.

    The same keys `_step_populate`'s SAP branch emits, including the
    `_resolve_overdue` call — that is what makes `overdue_value` comparable
    between a calendar PM (days) and a running-hours PM (hours past 250).
    """
    from app.services.work_plan_generator_service import (_normalize_berth,
                                                          _resolve_overdue)
    equipment = order.equipment
    value, unit = _resolve_overdue(
        order.job_type, order.maintenance_base,
        order.overdue_value, order.overdue_unit, None)
    return {
        'source': 'sap',
        'job_type': order.job_type,
        'equipment_id': order.equipment_id,
        'equipment_name': equipment.name if equipment else None,
        'equipment_type': equipment.equipment_type if equipment else None,
        'berth': _normalize_berth(order.berth or (equipment.berth if equipment else None)),
        'description': order.description,
        'estimated_hours': order.estimated_hours,
        'priority': order.priority,
        'overdue_value': value,
        'overdue_unit': unit,
        'maintenance_base': order.maintenance_base,
        'planned_date': order.planned_date,
        'sap_order_id': order.id,
        'sap_order_number': order.order_number,
        'sap_order_type': order.order_type,
        'cycle_id': order.cycle_id,
        'work_center': order.work_center,
    }


def candidates_for(plan, berth, free_man_hours, free_men, limit=3):
    """The best few jobs from the box that these men could actually start.

    Two filters, and both matter: a job must be small enough in MAN-HOURS
    (hours x crew) and must not need more men than are standing free. A
    four-man job is no use to two men with a whole afternoon.
    """
    from app.api.work_plans import pool_orders_query
    from app.services.work_plan_generator_service import (_normalize_berth,
                                                          _step_bundle,
                                                          _step_score,
                                                          bundle_man_hours)

    wanted = _normalize_berth(berth)
    rows = [order for order in pool_orders_query(plan.id).all()
            if _normalize_berth(order.berth
                                or (order.equipment.berth if order.equipment else None))
            in (wanted, 'both')]
    if not rows:
        return []

    bundles = _step_bundle(_step_score([_candidate_dict(o) for o in rows], plan))

    offered = []
    for bundle in bundles:
        cost = bundle_man_hours(bundle)
        if cost <= 0 or cost > free_man_hours:
            continue
        crew = max((m.get('crew') or MIN_CREW) for m in bundle['members'])
        if crew > free_men:
            continue
        first = bundle['members'][0]
        offered.append({
            'order_number': first.get('sap_order_number'),
            'description': first.get('description') or '',
            'hours': float(first.get('estimated_hours') or 0),
            'crew': int(crew),
            'cost_man_hours': cost,
            'score': bundle.get('score', 0),
        })
        if len(offered) >= limit:
            break
    return offered
```

- [ ] **Step 4: Run to verify it passes**

Run: `./venv/bin/python -m pytest tests/test_crew_free.py -q -p no:warnings`
Expected: PASS — 14 tests.

- [ ] **Step 5: Mutation checks**

1. Drop the `crew > free_men` filter →
   `test_a_job_needing_more_men_than_are_free_is_not_offered` must FAIL. Restore.
2. Drop the berth filter → `test_the_other_berth_is_not_offered` must FAIL.
   Restore.

- [ ] **Step 6: Stage the commit (ASK Ali first)**

```bash
git add app/services/crew_free.py tests/test_crew_free.py
# ASK FIRST:
git commit -m "feat: the best three jobs that actually fit the hours left"
```

---

### Task 10: Noticing, and asking

**Files:**
- Modify: `app/services/crew_free.py` (append)
- Modify: `app/api/work_plan_tracking.py` — hook inside `complete_job` (line 416, after `create_log_entry(..., 'completed', ...)` and before `db.session.commit()`); new endpoint after `mark_incomplete` (line 520)
- Test: `tests/test_crew_free.py` (append a class)

**Interfaces:**
- Consumes: `free_hours_for_crew`, `crew_is_done_for_today`, `candidates_for` (Tasks 8–9); `ask` (Task 3).
- Produces:
  - `ask_for_backfill(job, forced=False, client=None) -> TelegramProposal | None`
  - `POST /api/work-plan-tracking/jobs/<job_id>/free-for-more` → `{'status', 'asked': bool, 'reason': str|None}`

Nothing fires on completion today — no notification, no event, no hook. The one
notifier that exists, `notify_engineers_for_job` (line 96), has exactly one
caller in the whole repo, inside `pause_job`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_crew_free.py`:

```python
from app.models import TelegramProposal

ALI_TELEGRAM_ID = 1811629337


class TestNoticingAndAsking:
    def test_finishing_the_last_job_early_asks_the_engineer(
            self, app, db_session, admin_user):
        from app.services.crew_free import ask_for_backfill
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'n{i}') for i in range(2)]
        job = _job(db_session, days[0], men, 6.0, status='completed', actual=3.0)
        _box_order(db_session, '700000000850', kind='tractor')
        recorder = Recorder()

        proposal = ask_for_backfill(job, client=recorder)

        assert proposal is not None
        assert proposal.kind == 'crew_is_free'
        assert proposal.details['free_man_hours'] == 10.0
        assert proposal.details['crew_user_ids'] == sorted(m.id for m in men)
        assert len(proposal.details['candidates']) == 1
        assert len(recorder.messages) == 1

    def test_a_crew_still_holding_work_is_not_announced(self, app, db_session,
                                                        admin_user):
        from app.services.crew_free import ask_for_backfill
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        plan, days = _week(db_session, admin_user)
        man = _man(db_session, 'stillbusy')
        done = _job(db_session, days[0], [man], 3.0, status='completed',
                    actual=2.0)
        _job(db_session, days[0], [man], 4.0, name='TT7')
        _box_order(db_session, '700000000851', kind='tractor')

        assert ask_for_backfill(done, client=Recorder()) is None

    def test_the_worker_may_ask_even_while_holding_work(self, app, db_session,
                                                        admin_user):
        """His app button is a REQUEST. He is saying he is free; the engineer
        still decides."""
        from app.services.crew_free import ask_for_backfill
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        plan, days = _week(db_session, admin_user)
        man = _man(db_session, 'asks')
        done = _job(db_session, days[0], [man], 3.0, status='completed',
                    actual=1.0)
        _job(db_session, days[0], [man], 2.0, name='TT8')
        _box_order(db_session, '700000000852', kind='tractor')

        assert ask_for_backfill(done, forced=True, client=Recorder()) is not None

    def test_no_hours_left_asks_nothing(self, app, db_session, admin_user):
        from app.services.crew_free import ask_for_backfill
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        plan, days = _week(db_session, admin_user)
        man = _man(db_session, 'spent')
        job = _job(db_session, days[0], [man], 8.0, status='completed',
                   actual=8.0)
        _box_order(db_session, '700000000853', kind='tractor')

        assert ask_for_backfill(job, client=Recorder()) is None

    def test_an_empty_box_asks_nothing(self, app, db_session, admin_user):
        from app.services.crew_free import ask_for_backfill
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'o{i}') for i in range(2)]
        job = _job(db_session, days[0], men, 6.0, status='completed', actual=3.0)

        assert ask_for_backfill(job, client=Recorder()) is None

    def test_the_same_crew_is_only_announced_once_a_day(self, app, db_session,
                                                        admin_user):
        from app.services.crew_free import ask_for_backfill
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'p{i}') for i in range(2)]
        job = _job(db_session, days[0], men, 6.0, status='completed', actual=3.0)
        _box_order(db_session, '700000000854', kind='tractor')
        recorder = Recorder()

        first = ask_for_backfill(job, client=recorder)
        second = ask_for_backfill(job, client=recorder)

        assert first is not None
        assert second is None
        assert TelegramProposal.query.filter_by(kind='crew_is_free').count() == 1

    def test_the_question_dies_with_its_day(self, app, db_session, admin_user):
        from app.services.crew_free import ask_for_backfill
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'q{i}') for i in range(2)]
        job = _job(db_session, days[0], men, 6.0, status='completed', actual=3.0)
        _box_order(db_session, '700000000855', kind='tractor')

        proposal = ask_for_backfill(job, client=Recorder())

        assert proposal.expires_at.date() > days[0].date
        assert proposal.expires_at.date() <= days[0].date + timedelta(days=1)
```

Add the same `Recorder` class used in `tests/test_urgent_watch.py` to the top of
this file (copy it verbatim — the plan's readers may open these files in any
order).

- [ ] **Step 2: Run to verify it fails**

Run: `./venv/bin/python -m pytest tests/test_crew_free.py::TestNoticingAndAsking -q`
Expected: FAIL — `ImportError: cannot import name 'ask_for_backfill'`

- [ ] **Step 3: Write it**

Append to `app/services/crew_free.py`:

```python
KIND = 'crew_is_free'

ASK_WORDS = {
    'en': {
        'headline': '{names} finished early on {day}.',
        'left': 'They have {mh} man-hours left ({men} men).',
        'pick': 'Pick one, or say no thanks:',
        'option': '{description} — {hours}h, {crew} men',
        'no': 'No thanks',
        'swap': 'Swap crew',
    },
    'ar': {
        'headline': '{names} أنهوا مبكراً يوم {day}.',
        'left': 'بقي لديهم {mh} ساعة-رجل ({men} رجال).',
        'pick': 'اختر واحدة، أو لا شكراً:',
        'option': '{description} — {hours} ساعة، {crew} رجال',
        'no': 'لا شكراً',
        'swap': 'تبديل الفريق',
    },
}


def _at(language, key, **fields):
    table = ASK_WORDS.get(language, ASK_WORDS['en'])
    return table.get(key, ASK_WORDS['en'][key]).format(**fields)


def _already_asked_today(day, crew_user_ids):
    """One announcement per crew per day. Two men finishing two jobs in the
    same minute must not buzz eight phones twice."""
    from app.models import TelegramProposal
    open_rows = TelegramProposal.query.filter(
        TelegramProposal.kind == KIND,
        TelegramProposal.status == 'open',
        TelegramProposal.target_day_id == day.id).all()
    wanted = set(crew_user_ids)
    return any(wanted & set((row.details or {}).get('crew_user_ids') or [])
               for row in open_rows)


def _other_teams(berth, crew_user_ids):
    """Teams on this berth that are NOT the crew who just finished."""
    from app.models.worker_assignment_rule import WorkerAssignmentRule
    from app.services.work_plan_generator_service import _normalize_berth

    wanted = _normalize_berth(berth)
    theirs = set(crew_user_ids)
    teams = []
    for rule in WorkerAssignmentRule.query.filter_by(is_active=True).all():
        if _normalize_berth(rule.berth) != wanted:
            continue
        members = set(rule.candidate_mech_workers or []) | set(
            rule.candidate_elec_workers or [])
        if members and not (members & theirs):
            teams.append(rule)
    return teams


def ask_for_backfill(job, forced=False, client=None):
    """These men are free — ask the engineer what to give them.

    `forced=True` is the worker's own app button: he is telling us he is free,
    so the "has he anything left today" check is skipped. It is still only a
    REQUEST — the engineer decides, always.
    """
    from datetime import datetime, time, timedelta
    from app.services.telegram.ask import ask
    from app.services.work_plan_generator_service import _normalize_berth

    day = job.day
    if day is None or day.work_plan is None:
        return None
    if not forced and not crew_is_done_for_today(job):
        return None

    free = free_hours_for_crew(job)
    free_men = [user_id for user_id, hours in free.items() if hours > 0]
    free_man_hours = sum(free.values())
    if not free_men or free_man_hours <= 0:
        return None

    crew_user_ids = sorted(free)
    if _already_asked_today(day, crew_user_ids):
        return None

    berth = _normalize_berth(job.berth) or 'both'
    offered = candidates_for(day.work_plan, berth, free_man_hours,
                             len(free_men))
    if not offered:
        return None

    names = ', '.join(sorted(
        (a.user.full_name or a.user.email) for a in job.assignments or []
        if a.user is not None))

    texts, options = {}, []
    for language in ASK_WORDS:
        texts[language] = '\n'.join([
            _at(language, 'headline', names=names, day=day.date.isoformat()),
            _at(language, 'left', mh=free_man_hours, men=len(free_men)),
            _at(language, 'pick'),
        ])
    for candidate in offered:
        options.append({
            'key': f"order:{candidate['order_number']}",
            'action': 'apply',
            'label_en': _at('en', 'option', **candidate),
            'label_ar': _at('ar', 'option', **candidate),
        })
    options.append({'key': 'no', 'action': 'decline',
                    'label_en': ASK_WORDS['en']['no'],
                    'label_ar': ASK_WORDS['ar']['no']})

    # Ali: the same men by default, but the engineer can hand it to another
    # team. Expanding appends one button per (job, other team) pair — the
    # engineer picks the work and the crew in one press, because two presses
    # would need a second question and a second thing to expire.
    swap = []
    for candidate in offered:
        for rule in _other_teams(berth, crew_user_ids):
            swap.append({
                'key': f"order:{candidate['order_number']}:rule:{rule.id}",
                'action': 'apply',
                'label_en': f"{candidate['description']} — team {rule.id}",
                'label_ar': f"{candidate['description']} — فريق {rule.id}",
            })
    if swap:
        options.append({'key': 'swap', 'action': 'expand',
                        'label_en': ASK_WORDS['en']['swap'],
                        'label_ar': ASK_WORDS['ar']['swap'],
                        'expand': swap})

    # The buttons die with the day they are about, and are never re-asked.
    expires_at = datetime.combine(day.date + timedelta(days=1), time(0, 0))

    return ask(KIND, texts, options, expires_at,
               details={'job_id': job.id,
                        'berth': berth,
                        'crew_user_ids': crew_user_ids,
                        'free_man_hours': free_man_hours,
                        'free_men': len(free_men),
                        'candidates': offered},
               work_plan_id=day.work_plan_id, target_day_id=day.id,
               client=client)
```

- [ ] **Step 4: Hook it into completion**

In `app/api/work_plan_tracking.py`, inside `complete_job`, immediately after the
`create_log_entry(job_id, user.id, 'completed', {...})` call and **before**
`db.session.commit()`:

```python
    # The crew may now be standing in the yard with hours left. Nothing else on
    # this path notices — there is no completion event in this codebase.
    # Never let a Telegram problem fail a man's completed job.
    try:
        from app.services.crew_free import ask_for_backfill
        ask_for_backfill(job)
    except Exception:  # noqa: BLE001
        logger.exception('crew-free ask failed for job %s', job_id)
```

- [ ] **Step 5: Add the worker's request endpoint**

In `app/api/work_plan_tracking.py`, after `mark_incomplete` (ends ~line 620):

```python
@bp.route('/jobs/<int:job_id>/free-for-more', methods=['POST'])
@jwt_required()
def free_for_more(job_id):
    """The worker says he is free. This is a REQUEST, never a placement.

    It buzzes the planners' phones with the same question the automatic check
    raises; the engineer still decides who gets what.
    """
    user = get_current_user()
    job = WorkPlanJob.query.get_or_404(job_id)
    if user.role not in ('admin', 'engineer'):
        check_user_assigned_to_job(user.id, job_id)

    from app.services.crew_free import ask_for_backfill
    proposal = ask_for_backfill(job, forced=True)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'asked': proposal is not None,
        'reason': None if proposal is not None else 'nothing to offer',
    }), 200
```

- [ ] **Step 6: Run to verify it passes**

Run: `./venv/bin/python -m pytest tests/test_crew_free.py tests/test_work_plan_defect_routing.py -q -p no:warnings`
Expected: PASS — 21 crew-free tests, and the existing completion tests unchanged.

- [ ] **Step 7: Mutation checks**

1. Drop the `_already_asked_today` guard →
   `test_the_same_crew_is_only_announced_once_a_day` must FAIL. Restore.
2. Make `forced` ignored → `test_the_worker_may_ask_even_while_holding_work`
   must FAIL. Restore.
3. Remove the `try/except` around the completion hook and make
   `ask_for_backfill` raise — an existing completion test must FAIL. Restore.
   **A Telegram problem must never fail a man's completed job.**

- [ ] **Step 8: Stage the commit (ASK Ali first)**

```bash
git add app/services/crew_free.py app/api/work_plan_tracking.py tests/test_crew_free.py
# ASK FIRST:
git commit -m "feat: notice a crew that finished early, and ask the engineer"
```

---

### Task 11: Giving them the work

**Files:**
- Modify: `app/services/crew_free.py` (append the apply)
- Modify: `app/services/telegram/taps.py` — fix `_ensure_kinds_registered`
- Test: `tests/test_crew_free.py` (append a class)

**Interfaces:**
- Consumes: `place_one` (Task 5); `register` (Task 4).
- Produces: the registered `apply` for `kind='crew_is_free'`, returning `{'job_id', 'order_number', 'crew_user_ids'}`.

**The registration bug from Task 4 is fixed here.** `_ensure_kinds_registered`
currently returns early when `_APPLY` is non-empty, so registering the first
kind would stop the second from ever loading.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_crew_free.py`:

```python
def _tap(proposal_id, index, update_id=700):
    return {'update_id': update_id,
            'callback_query': {'id': f'cbq-{update_id}',
                               'data': f'tp:{proposal_id}:{index}',
                               'from': {'id': ALI_TELEGRAM_ID,
                                        'language_code': 'en'},
                               'message': {'message_id': 301,
                                           'chat': {'id': ALI_TELEGRAM_ID,
                                                    'type': 'private'}}}}


class TestGivingThemTheWork:
    def _asked(self, app, db_session, admin_user):
        from app.services.crew_free import ask_for_backfill
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'g{i}') for i in range(2)]
        job = _job(db_session, days[0], men, 6.0, status='completed', actual=3.0)
        order = _box_order(db_session, '700000000860', kind='tractor')
        recorder = Recorder()
        proposal = ask_for_backfill(job, client=recorder)
        return plan, days, men, order, proposal, recorder

    def test_pressing_a_job_gives_it_to_the_same_men(self, app, db_session,
                                                     admin_user):
        from app.services.telegram import taps
        plan, days, men, order, proposal, recorder = self._asked(
            app, db_session, admin_user)

        taps.handle_callback(_tap(proposal.id, 0), admin_user, client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'accepted'
        placed = db.session.get(WorkPlanJob, proposal.result['job_id'])
        assert placed.sap_order_number == '700000000860'
        assert placed.work_plan_day_id == days[0].id
        assert {a.user_id for a in placed.assignments} == {m.id for m in men}
        db_session.session.refresh(order)
        assert order.status == 'scheduled'

    def test_no_thanks_leaves_the_order_in_the_box(self, app, db_session,
                                                   admin_user):
        from app.services.telegram import taps
        plan, days, men, order, proposal, recorder = self._asked(
            app, db_session, admin_user)
        no_index = len(proposal.options) - 1

        taps.handle_callback(_tap(proposal.id, no_index), admin_user,
                             client=recorder)

        db_session.session.refresh(proposal)
        db_session.session.refresh(order)
        assert proposal.status == 'declined'
        assert order.status == 'pending'
        assert order.work_plan_id is None

    def test_swap_crew_hands_it_to_another_team(self, app, db_session,
                                                 admin_user):
        """Ali: the same men by default, but the engineer can swap. The
        expanded button carries the job AND the team in one press."""
        from app.models.worker_assignment_rule import WorkerAssignmentRule
        from app.services.telegram import taps
        others = [_man(db_session, f'oth{i}') for i in range(2)]
        db_session.session.add(WorkerAssignmentRule(
            berth='west', team_type='regular_pm', equipment_category='all',
            mech_count=2, elec_count=0,
            candidate_mech_workers=[m.id for m in others]))
        db_session.session.commit()
        plan, days, men, order, proposal, recorder = self._asked(
            app, db_session, admin_user)
        swap_index = next(i for i, o in enumerate(proposal.options)
                          if o.get('key') == 'swap')

        taps.handle_callback(_tap(proposal.id, swap_index), admin_user,
                             client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'open'          # expanding decides nothing
        expanded = [o for o in proposal.options if ':rule:' in (o.get('key') or '')]
        assert expanded

        taps.handle_callback(_tap(proposal.id,
                                  proposal.options.index(expanded[0]),
                                  update_id=701),
                             admin_user, client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'accepted'
        placed = db.session.get(WorkPlanJob, proposal.result['job_id'])
        got = {a.user_id for a in placed.assignments}
        assert got and not (got & {m.id for m in men})

    def test_both_kinds_are_registered(self, app, db_session, admin_user):
        """Registering the first must not stop the second from loading."""
        from app.services.telegram import taps
        taps._APPLY.clear()
        taps._registered = False

        taps._ensure_kinds_registered()

        assert 'urgent_needs_room' in taps._APPLY
        assert 'crew_is_free' in taps._APPLY
```

- [ ] **Step 2: Run to verify it fails**

Run: `./venv/bin/python -m pytest tests/test_crew_free.py::TestGivingThemTheWork -q`
Expected: FAIL — `AttributeError: module ... has no attribute '_registered'`, and
the placement tests fail because no apply is registered for `crew_is_free`.

- [ ] **Step 3: Fix the registration**

In `app/services/telegram/taps.py`, replace `_ensure_kinds_registered`:

```python
_registered = False


def _ensure_kinds_registered():
    """Import the producers so their @register decorators have run.

    Lazy and inside a function on purpose: the producers import this module for
    `register`, so a module-scope import would be a cycle. Guarded by a FLAG,
    not by `if _APPLY` — that would stop the second producer loading the moment
    the first one had registered.
    """
    global _registered
    if _registered:
        return
    _registered = True
    from app.services import urgent_watch  # noqa: F401
    from app.services import crew_free     # noqa: F401
```

- [ ] **Step 4: Write the apply**

Append to `app/services/crew_free.py`:

```python
@register(KIND)
def apply_crew_free(proposal, option, user):
    """The engineer picked a job. Give it to the men who are standing free.

    No domino here: these hours were never in the day's planned budget in the
    first place — they exist because the men beat the estimate. Nothing needs
    to move aside.
    """
    from app.models import SAPWorkOrder, WorkPlanDay
    from app.services.place_one import place_one

    details = proposal.details or {}
    # Two shapes: 'order:<number>' (the same men) and
    # 'order:<number>:rule:<id>' (Swap crew — another team on this berth).
    key = option.get('key') or ''
    if not key.startswith('order:'):
        raise ValueError(f'not a job button: {key}')
    parts = key.split(':')
    order_number = parts[1]
    swapped_rule_id = int(parts[3]) if len(parts) == 4 and parts[2] == 'rule' else None

    order = SAPWorkOrder.query.filter_by(order_number=order_number).first()
    if order is None or order.status != 'pending':
        raise ValueError(f'order {order_number} is no longer in the box')

    day = db.session.get(WorkPlanDay, proposal.target_day_id)
    if day is None:
        raise ValueError('that day is gone')

    crew_user_ids = details.get('crew_user_ids') or []
    if swapped_rule_id is not None:
        # Another team was chosen: let the generator's own rule logic pick who,
        # rather than handing the whole candidate list the work.
        crew_user_ids = None

    job = place_one(order, day, crew_user_ids=crew_user_ids)
    if swapped_rule_id is not None:
        crew_user_ids = [a.user_id for a in job.assignments]
    # NEVER commit here — handle_callback owns the single commit. See the
    # transaction contract on apply_urgent.
    db.session.flush()
    return {'job_id': job.id, 'order_number': order_number,
            'crew_user_ids': crew_user_ids}
```

Add the import at the top of `app/services/crew_free.py`:

```python
from app.services.telegram.taps import register
```

- [ ] **Step 5: Run to verify it passes**

Run: `./venv/bin/python -m pytest tests/test_crew_free.py tests/test_urgent_watch.py tests/test_telegram_taps.py -q -p no:warnings`
Expected: PASS — all three files.

- [ ] **Step 6: Mutation check**

Put the `if _APPLY: return` guard back in `_ensure_kinds_registered` →
`test_both_kinds_are_registered` must FAIL. Restore the flag.

- [ ] **Step 7: Stage the commit (ASK Ali first)**

```bash
git add app/services/crew_free.py app/services/telegram/taps.py tests/test_crew_free.py
# ASK FIRST:
git commit -m "feat: one tap gives the free crew their next job"
```

---

### Task 12: The button in the man's hand

**Files:**
- Modify: `frontend/apps/mobile/src/screens/shared/JobExecutionScreen.tsx:275-283`
- Modify: `frontend/packages/shared/src/api/work-plan-tracking.api.ts`
- Modify: `frontend/packages/shared/src/i18n/en.json`, `.../ar.json` (`job_execution` namespace)

**Interfaces:**
- Consumes: `POST /api/work-plan-tracking/jobs/<id>/free-for-more` (Task 10).
- Produces: `workPlanTrackingApi.freeForMore(jobId)`.

Lines 275-283 today are a dead-end info card in the `completed` branch with no
affordance at all — the natural home for this button.

- [ ] **Step 1: Add the client method**

In `frontend/packages/shared/src/api/work-plan-tracking.api.ts`, beside
`completeJob`:

```ts
  freeForMore(jobId: number) {
    return getApiClient().post<{ status: string; asked: boolean; reason: string | null }>(
      `${BASE}/jobs/${jobId}/free-for-more`, {});
  },
```

- [ ] **Step 2: Add the words, both languages**

In `frontend/packages/shared/src/i18n/en.json`, inside `"job_execution"`:

```json
    "free_for_more": "I am free — send me more work",
    "free_for_more_sent": "The engineer has been asked.",
    "free_for_more_nothing": "Nothing in the box fits the time you have left.",
```

In `frontend/packages/shared/src/i18n/ar.json`, inside `"job_execution"`:

```json
    "free_for_more": "أنا متفرغ — أرسل لي عملاً إضافياً",
    "free_for_more_sent": "تم إبلاغ المهندس.",
    "free_for_more_nothing": "لا يوجد في الصندوق ما يناسب الوقت المتبقي لديك.",
```

Edit `src/`, never `dist/` — `dist/` is a build artifact.

- [ ] **Step 3: Add the button**

In `frontend/apps/mobile/src/screens/shared/JobExecutionScreen.tsx`, add the
mutation beside `completeMutation` (line 138):

```tsx
  const freeMutation = useMutation({
    mutationFn: () => workPlanTrackingApi.freeForMore(jobId),
    onSuccess: (response) => {
      Alert.alert(
        t('job_execution.success'),
        response.data?.asked
          ? t('job_execution.free_for_more_sent')
          : t('job_execution.free_for_more_nothing'),
      );
    },
  });
```

and inside the `status === 'completed'` branch (lines 275-283), after the
existing `completedInfo` view:

```tsx
        <TouchableOpacity
          testID="free-for-more-btn"
          style={styles.freeButton}
          disabled={freeMutation.isPending}
          onPress={() => freeMutation.mutate()}
        >
          <Text style={styles.freeButtonText}>
            {t('job_execution.free_for_more')}
          </Text>
        </TouchableOpacity>
```

with a style next to `styles.completeButton`:

```tsx
  freeButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1677ff',
  },
  freeButtonText: { color: '#1677ff', fontWeight: '600', fontSize: 15 },
```

- [ ] **Step 4: Check both languages have the same keys**

Run:
```bash
cd frontend && ./node_modules/.bin/ts-node -e "
const en = require('./packages/shared/src/i18n/en.json').job_execution;
const ar = require('./packages/shared/src/i18n/ar.json').job_execution;
const missing = Object.keys(en).filter(k => !(k in ar));
console.log(missing.length ? 'MISSING IN AR: ' + missing : 'both languages match');
"
```
Expected: `both languages match`. If `ts-node` is unavailable, use `node -e` with
the same body.

- [ ] **Step 5: Type-check**

Run:
```bash
cd frontend && pnpm --filter @inspection/shared exec tsc --noEmit \
  && pnpm --filter mobile exec tsc --noEmit
```
Expected: clean. **pnpm, never npm** — npm destroys the workspace linkage in this
monorepo.

- [ ] **Step 6: Stage the commit (ASK Ali first)**

```bash
git add frontend/apps/mobile/src/screens/shared/JobExecutionScreen.tsx \
        frontend/packages/shared/src/api/work-plan-tracking.api.ts \
        frontend/packages/shared/src/i18n/en.json \
        frontend/packages/shared/src/i18n/ar.json
# ASK FIRST:
git commit -m "feat(mobile): a free worker can ask for more work"
```

---

### Task 13: Verification and records

**Files:**
- Modify: `CLAUDE.md` (Change Log + What Needs Work; keep under 8KB — move an entry to `HISTORY.md` if needed)
- Modify: `lessons.md`
- Create: `~/Documents/second-brain/raw/2026-08-25-inspection-app-telegram-taps.md`
- Modify: this plan (tick the boxes)

- [ ] **Step 1: Full suite**

Run: `./venv/bin/python -m pytest tests/ -q -p no:warnings`
Expected: all green. Baseline before this plan was **650 passed, 1 skipped**;
this plan adds roughly 60 tests.

- [ ] **Step 2: Migration chain**

Run: `./venv/bin/python -m flask db heads`
Expected: one head, `s9t0u1v2w3x4 (head)`.

- [ ] **Step 3: A realistic end-to-end scenario, then delete it**

Write a scratch pytest file (NOT committed — the same practice the day-budget
and evening-truth plans used) that, on a production-shaped week:
1. runs `look_for_homeless_urgents` and prints every question raised, with its
   simulated chain;
2. taps Yes on one and prints the applied chain and the placed job;
3. rebuilds the wallets with `day_free_man_hours` and asserts **no day is
   overspent**;
4. completes a job early and prints the crew-free question and its three
   candidates;
5. taps the first candidate and asserts the men on the new job are the men who
   finished.

Eyeball the printed output. **Delete the file afterwards.**

- [ ] **Step 4: Records**

- `CLAUDE.md`: a Change Log entry, and move "Plan 3 pending — Telegram taps" out
  of "What Needs Work". Add two items that this work uncovered but did not fix:
  `schedule_sap_order` diverging from the generator in four ways, and the
  night-shift disagreement between `day_budget._unavailable_by_date` (excludes
  `night`) and `_step_assign`'s `unavailable_by_day` (does not).
- `lessons.md`: whatever this build taught. If nothing went wrong, write nothing
  — an invented lesson is worse than none.
- Second brain: `~/Documents/second-brain/raw/2026-08-25-inspection-app-telegram-taps.md`.
- Tick every checkbox in this plan.

- [ ] **Step 5: Report to Ali**

What the bot now asks, what a tap now does, what must happen on Render:

```
1. Ali commits and pushes (nothing is committed without his word).
2. Render finishes deploying.
3. Render Dashboard -> API service -> Shell -> flask db upgrade
```

The migration file is new and untracked, so **step 3 before step 1 does
nothing** — the file is not on the server yet.

Also confirm on Render: `TELEGRAM_ALLOWED_USERS` must list every admin and
engineer who should be asked. A planner missing from that variable is never
buzzed, silently — the bot has no other way to reach a phone.
