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


from app.models import TelegramProposal
from tests.conftest import get_auth_header

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
        still decides.

        Two men, not one: every family in PM_BY_FAMILY needs a crew of (at
        least) 2 — a lone free man can never be offered anything, in this
        system or any other test in this file. One man here would make the
        scenario unsatisfiable by construction, not a real test of the
        `forced` bypass.
        """
        from app.services.crew_free import ask_for_backfill
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'asks{i}') for i in range(2)]
        done = _job(db_session, days[0], men, 3.0, status='completed',
                    actual=1.0)
        _job(db_session, days[0], men, 2.0, name='TT8')
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

    def test_a_broken_telegram_ask_never_blocks_completion(
            self, app, client, db_session, admin_user, monkeypatch):
        """Ali's absolute rule: a Telegram problem must NEVER fail a man's
        completed job. The hook inside `complete_job` is wrapped in
        try/except for exactly this reason.

        No test anywhere in this suite calls POST .../complete over HTTP
        (verified: `grep -rn "/complete" tests/*.py` finds nothing but this
        file). The brief's mutation-check step assumed one existed. This is
        that missing regression test, added so the property has a permanent
        guard and mutation check 3 has something real to break.
        """
        from app.services import crew_free

        def _boom(job, forced=False, client=None):
            raise RuntimeError('telegram is down')

        monkeypatch.setattr(crew_free, 'ask_for_backfill', _boom)

        plan, days = _week(db_session, admin_user)
        job = _job(db_session, days[0], [], 4.0)
        db_session.session.add(WorkPlanJobTracking(
            work_plan_job_id=job.id, status='in_progress'))
        db_session.session.commit()

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post(
            f'/api/work-plan-tracking/jobs/{job.id}/complete',
            headers=headers, json={})

        assert resp.status_code == 200
        assert resp.get_json()['tracking']['status'] == 'completed'


def _tap(proposal_id, index, update_id=700):
    return {'update_id': update_id,
            'callback_query': {'id': f'cbq-{update_id}',
                               'data': f'tp:{proposal_id}:{index}',
                               'from': {'id': ALI_TELEGRAM_ID,
                                        'language_code': 'en'},
                               'message': {'message_id': 301,
                                           'chat': {'id': ALI_TELEGRAM_ID,
                                                    'type': 'private'}}}}


def _today_week(db_session, admin_user):
    """A published week anchored to real "today", never `_week()`'s fixed
    MONDAY.

    `ask_for_backfill` expires the proposal at day.date + 1 midnight, not
    wall-clock + N. `_week()`'s hardcoded MONDAY is a fixed calendar date that
    keeps sliding into the past as real time passes it, which would make
    every proposal here born already-expired by the time `handle_callback`
    checks `expires_at <= datetime.utcnow()`. Built from scratch here (via
    the sanctioned `planning_today()`, never `date.today()`) rather than
    relocating `_week()`'s days, so there is no risk of two days landing on
    the same date under the plan's own uniqueness constraint.
    """
    from app.utils.decorators import planning_today
    start = planning_today()
    plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                    status='published', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    days = [WorkPlanDay(work_plan_id=plan.id, date=start + timedelta(days=i))
            for i in range(7)]
    for day in days:
        db_session.session.add(day)
    db_session.session.commit()
    return plan, days


class TestGivingThemTheWork:
    def _asked(self, app, db_session, admin_user):
        from app.services.crew_free import ask_for_backfill
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        plan, days = _today_week(db_session, admin_user)
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
        """Registering the first must not stop the second from loading.

        As written in the brief this test could not tell a correct guard from
        a broken one: by the time this test runs, `urgent_watch` and
        `crew_free` are already in `sys.modules` (the earlier tests in this
        class went through `handle_callback`, which imports both), so a
        plain `import` inside `_ensure_kinds_registered` is a no-op and never
        re-runs the `@register` decorators — `_APPLY` stayed `{}` after
        `.clear()` regardless of which guard was in place. Popping both
        modules out of `sys.modules` first forces a real re-import. And
        `.clear()` alone leaves `_APPLY` EMPTY, which is falsy — the mutated
        `if _APPLY: return` guard never actually bails out against an empty
        dict, so it couldn't be caught either. Seeding one unrelated entry
        reproduces the real Task 4 bug this guards against: the module's own
        docstring says "Task 4's own tests register a throwaway kind... a
        non-empty dict would then stop the real producers from ever loading."
        """
        import sys
        import app.services as services_pkg
        from app.services.telegram import taps
        taps._APPLY.clear()
        taps._APPLY['throwaway'] = lambda *a: None
        taps._registered = False
        # A plain `sys.modules.pop` is not enough: importing a submodule also
        # binds it as an ATTRIBUTE on its parent package, and `from package
        # import name` is satisfied by that attribute without re-importing —
        # so a previously-imported producer would look "freshly imported"
        # without its `@register` decorator ever running again. Both must go.
        for name in ('urgent_watch', 'crew_free'):
            sys.modules.pop(f'app.services.{name}', None)
            if hasattr(services_pkg, name):
                delattr(services_pkg, name)

        taps._ensure_kinds_registered()

        assert 'urgent_needs_room' in taps._APPLY
        assert 'crew_is_free' in taps._APPLY

    def test_the_job_is_priced_for_the_men_who_are_actually_taking_it(
            self, app, db_session, admin_user):
        """Ali's recurring bug, fixed four times already elsewhere in this
        plan: the promise on the button must equal what the created job
        actually costs. `place_one` re-prices from the rule/table default the
        moment it is not handed the `priced` dict computed for the NAMED
        crew — silent on a berth like 'tractor' with no PM curve (2 men or 3,
        same hours either way), so a reach stacker is used here, whose curve
        moves in a way no other test in this class would notice: three free
        men price at 8h, but the table's un-crewed default falls back to the
        pair figure of 12h."""
        from app.services.crew_free import ask_for_backfill
        from app.services.telegram import taps
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        plan, days = _today_week(db_session, admin_user)
        men = [_man(db_session, f'rs{i}') for i in range(3)]
        job = _job(db_session, days[0], men, 9.0, status='completed', actual=1.0)
        order = _box_order(db_session, '700000000870', kind='reach stacker')
        recorder = Recorder()
        proposal = ask_for_backfill(job, client=recorder)

        taps.handle_callback(_tap(proposal.id, 0, update_id=702), admin_user,
                             client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'accepted'
        placed = db.session.get(WorkPlanJob, proposal.result['job_id'])
        assert {a.user_id for a in placed.assignments} == {m.id for m in men}
        assert float(placed.estimated_hours) == 8.0, (
            'three free men on a reach stacker PM must price at the 3-man '
            'curve figure (8h) — the men actually on the job, not whatever '
            'crew size the table would field on its own')


class TestThePromiseEqualsTheCharge:
    """The bug this plan has had to fix SIX times, in its last hiding place.

    The button was costed with the job's own table crew; the press handed it
    the whole free crew. Measured before the fix: a tractor promised
    4.5h x 2 = 9 man-hours and charged the day 13.5. The fits check used 9
    too, so a job could be offered precisely because it fitted a number that
    was never going to be paid.

    Both families are here on purpose, because they behave oppositely: a third
    man on a reach stacker turns 12 hours into 8 and is worth sending; a third
    man on a tractor saves nothing and is pure waste.
    """

    def _offer_and_press(self, app, db_session, admin_user, kind, number,
                         men_count, update_id):
        from app.services.crew_free import ask_for_backfill
        from app.services.day_ripple import job_cost_man_hours
        from app.services.telegram import taps
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        plan, days = _today_week(db_session, admin_user)
        men = [_man(db_session, f'{number[-3:]}m{i}') for i in range(men_count)]
        finished = _job(db_session, days[0], men, 9.0, status='completed',
                        actual=1.0)
        _box_order(db_session, number, kind=kind)
        recorder = Recorder()
        proposal = ask_for_backfill(finished, client=recorder)
        assert proposal is not None, 'nothing was offered'
        promised = proposal.details['candidates'][0]['cost_man_hours']

        taps.handle_callback(_tap(proposal.id, 0, update_id=update_id),
                             admin_user, client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'accepted', proposal.result
        placed = db.session.get(WorkPlanJob, proposal.result['job_id'])
        return promised, placed, job_cost_man_hours(placed), men

    def test_a_tractor_does_not_quietly_cost_half_again_as_much(
            self, app, db_session, admin_user):
        """Three free men, a job that needs two. The third stays free."""
        promised, placed, charged, men = self._offer_and_press(
            app, db_session, admin_user, 'tractor', '700000009100', 3, 801)

        assert promised == charged, (
            f'the button promised {promised} man-hours and the day is '
            f'charged {charged}')
        assert len(placed.assignments) == 2, (
            'a third man on a tractor saves no time and costs the day 4.5 '
            'man-hours for nothing')

    def test_a_reach_stacker_still_gets_the_third_man(self, app, db_session,
                                                      admin_user):
        """Ali's own rule: three men turn 12 hours into 8. The third man IS
        worth sending here, and the promise must say so too."""
        promised, placed, charged, men = self._offer_and_press(
            app, db_session, admin_user, 'reach stacker', '700000009101', 3, 802)

        assert promised == charged
        assert len(placed.assignments) == 3
        assert float(placed.estimated_hours) == 8.0


class TestOnlyMenWhoStillHaveHours:
    """The reviewer's C2: the button counted the men who still had hours, the
    press counted EVERY man on the finished job.

    `free_men` (positive hours only) priced the offer; `crew_user_ids` was
    `sorted(free)` — all of them, including a man who had already burned his
    eight. So the button was priced for two and the press sent three, one of
    whom had nothing left to give.

    The exhausted man is created FIRST on purpose. `crew_user_ids[:going]`
    sliced by user id, so with him created last the slice missed him by luck
    and the bug hid.
    """

    def _crew_with_one_exhausted(self, app, db_session, admin_user, kind,
                                 number):
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        plan, days = _today_week(db_session, admin_user)
        spent = _man(db_session, 'spent')          # lowest id — sliced first
        free_a = _man(db_session, 'freea')
        free_b = _man(db_session, 'freeb')
        men = [spent, free_a, free_b]
        finished = _job(db_session, days[0], men, 9.0, status='completed',
                        actual=1.0, name='FIN')
        # The exhausted man's OTHER job today: eight more hours, and he really
        # took all eight. He is DONE for the day and has nothing left to give,
        # which is exactly the pair of facts the two sides disagreed about.
        _job(db_session, days[0], [spent], 8.0, status='completed', actual=8.0,
             name='OTHER')
        _box_order(db_session, number, kind=kind)
        return plan, days, finished, spent, [free_a, free_b]

    def test_a_man_with_no_hours_left_is_never_sent(self, app, db_session,
                                                    admin_user):
        from app.services.crew_free import ask_for_backfill
        from app.services.telegram import taps
        plan, days, finished, spent, still_free = self._crew_with_one_exhausted(
            app, db_session, admin_user, 'tractor', '700000009200')
        recorder = Recorder()
        proposal = ask_for_backfill(finished, client=recorder)
        assert proposal is not None

        taps.handle_callback(_tap(proposal.id, 0, update_id=810), admin_user,
                             client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'accepted', proposal.result
        placed = db.session.get(WorkPlanJob, proposal.result['job_id'])
        got = {a.user_id for a in placed.assignments}
        assert spent.id not in got, (
            'he has already worked his eight hours today — sending him is how '
            'the day quietly runs over')
        assert got <= {m.id for m in still_free}

    def test_the_button_is_priced_for_the_men_who_can_actually_go(
            self, app, db_session, admin_user):
        """Two free men on a reach stacker is 12h. If the press quietly adds
        the exhausted third it becomes 8h — a different job from the one the
        engineer agreed to."""
        from app.services.crew_free import ask_for_backfill
        from app.services.telegram import taps
        plan, days, finished, spent, still_free = self._crew_with_one_exhausted(
            app, db_session, admin_user, 'reach stacker', '700000009201')
        recorder = Recorder()
        proposal = ask_for_backfill(finished, client=recorder)
        assert proposal is not None
        promised = proposal.details['candidates'][0]

        taps.handle_callback(_tap(proposal.id, 0, update_id=811), admin_user,
                             client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'accepted', proposal.result
        placed = db.session.get(WorkPlanJob, proposal.result['job_id'])
        assert len(placed.assignments) == promised['crew']
        assert float(placed.estimated_hours) == promised['hours']

    def test_a_job_longer_than_the_shortest_man_does_not_count_as_fitting(
            self, app, db_session, admin_user):
        """Eight hours left and one hour left is nine man-hours, and a tractor
        PM costs exactly nine. It does NOT fit: the second man goes home after
        an hour and the job needs four and a half from both."""
        from app.services.crew_free import candidates_for
        plan, days = _today_week(db_session, admin_user)
        _box_order(db_session, '700000009202', kind='tractor')

        offered = candidates_for(plan, 'west', 9.0, free_men=2,
                                 free_clock_hours=[8.0, 1.0])

        assert offered and offered[0]['fits'] is False


class TestTheFourthManBuysNothing:
    """The reviewer's I1. `pm_hours` steps UP to the largest measured point at
    or below the crew asked for, so four free men on a reach stacker were sent
    four — 8h x 4 = 32 man-hours where three men buy the identical 8 hours for
    24. `job_durations.py` says so in its own comment: the fourth man is
    insurance for an URGENT machine, not speed. Nothing is urgent here.
    """

    def test_a_reach_stacker_stops_at_three(self, db_session, admin_user):
        from app.services.place_one import useful_crew
        order = _box_order(db_session, '700000009300', kind='reach stacker')

        assert useful_crew(order, 4) == 3

    def test_an_ech_stops_at_three(self, db_session, admin_user):
        from app.services.place_one import useful_crew
        order = _box_order(db_session, '700000009301', kind='ech')

        assert useful_crew(order, 4) == 3

    def test_three_men_are_still_worth_it_on_a_reach_stacker(self, db_session,
                                                             admin_user):
        from app.services.place_one import useful_crew
        order = _box_order(db_session, '700000009302', kind='reach stacker')

        assert useful_crew(order, 3) == 3

    def test_a_tractor_still_takes_the_pair(self, db_session, admin_user):
        from app.services.place_one import useful_crew
        order = _box_order(db_session, '700000009303', kind='tractor')

        assert useful_crew(order, 4) == 2


class TestSwapCrewSendsTheTeamThatWasPressed:
    """The reviewer's I2. `swapped_rule_id` was parsed out of the key and then
    used only as a boolean: `place_one(crew_user_ids=None)` fell through to
    `staff_one_job`, which re-ran its own rule match and took `candidates[0]`.
    With two matching teams the engineer's choice was thrown away.

    The old test could not see this — its fixture created exactly ONE rule, so
    `candidates[0]` was the pressed rule by accident.
    """

    def _two_teams(self, app, db_session, admin_user, second_team_on_leave=False):
        from app.models.worker_assignment_rule import WorkerAssignmentRule
        from app.services.crew_free import ask_for_backfill
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        first = [_man(db_session, f'teamone{i}') for i in range(2)]
        second = [_man(db_session, f'teamtwo{i}') for i in range(2)]
        if second_team_on_leave:
            for man in second:
                man.is_on_leave = True
        for number, members in ((1, first), (2, second)):
            db_session.session.add(WorkerAssignmentRule(
                berth='west', team_type='regular_pm', equipment_category='all',
                team_number=number, mech_count=2, elec_count=0,
                candidate_mech_workers=[m.id for m in members]))
        db_session.session.commit()

        plan, days = _today_week(db_session, admin_user)
        men = [_man(db_session, f'sw{i}') for i in range(2)]
        job = _job(db_session, days[0], men, 6.0, status='completed', actual=3.0)
        _box_order(db_session, '700000009400' if not second_team_on_leave
                   else '700000009401', kind='tractor')
        recorder = Recorder()
        proposal = ask_for_backfill(job, client=recorder)
        assert proposal is not None
        return proposal, recorder, first, second

    def _expand(self, proposal, recorder, admin_user, update_id):
        from app.services.telegram import taps
        swap_index = next(i for i, o in enumerate(proposal.options)
                          if o.get('key') == 'swap')
        taps.handle_callback(_tap(proposal.id, swap_index,
                                  update_id=update_id),
                             admin_user, client=recorder)
        db.session.refresh(proposal)
        return [o for o in proposal.options if ':rule:' in (o.get('key') or '')]

    def test_the_second_team_gets_it_when_the_second_team_is_pressed(
            self, app, db_session, admin_user):
        from app.models.worker_assignment_rule import WorkerAssignmentRule
        from app.services.telegram import taps
        proposal, recorder, first, second = self._two_teams(
            app, db_session, admin_user)
        expanded = self._expand(proposal, recorder, admin_user, 820)
        rule_two = WorkerAssignmentRule.query.filter_by(
            berth='west', team_number=2).one()
        button = next(o for o in expanded
                      if o['key'].endswith(f':rule:{rule_two.id}'))

        taps.handle_callback(_tap(proposal.id, proposal.options.index(button),
                                  update_id=821),
                             admin_user, client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'accepted', proposal.result
        placed = db.session.get(WorkPlanJob, proposal.result['job_id'])
        got = {a.user_id for a in placed.assignments}
        assert got == {m.id for m in second}, (
            'the engineer pressed team 2 and the rule matcher handed the work '
            'to whichever team it found first')

    def test_a_team_that_can_field_nobody_fails_out_loud(self, app, db_session,
                                                         admin_user):
        """Silently landing a job on the day with NOBODY on it is the worst
        outcome — it looks planned and nobody comes."""
        from app.models.worker_assignment_rule import WorkerAssignmentRule
        from app.services.telegram import taps
        proposal, recorder, first, second = self._two_teams(
            app, db_session, admin_user, second_team_on_leave=True)
        expanded = self._expand(proposal, recorder, admin_user, 830)
        rule_two = WorkerAssignmentRule.query.filter_by(
            berth='west', team_number=2).one()
        button = next(o for o in expanded
                      if o['key'].endswith(f':rule:{rule_two.id}'))

        taps.handle_callback(_tap(proposal.id, proposal.options.index(button),
                                  update_id=831),
                             admin_user, client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'failed', proposal.result

    def test_the_swap_button_names_the_team_a_human_can_recognise(
            self, app, db_session, admin_user):
        """`team 7` is a database row id. Nobody in the yard knows it."""
        proposal, recorder, first, second = self._two_teams(
            app, db_session, admin_user)
        expanded = self._expand(proposal, recorder, admin_user, 840)

        labels = [o['label_en'] for o in expanded]
        assert any('west team 1' in label for label in labels), labels
        assert any('west team 2' in label for label in labels), labels


class TestTheManIsSavedBeforeAnybodyPhonesTelegram:
    """The reviewer's C3. The hook sat BEFORE `db.session.commit()`, and
    `ask()` commits — so a man pressing Finish held an open transaction while
    the server made up to eight synchronous POSTs to api.telegram.org, fifteen
    seconds each. A Telegram outage turned one completion into a two-minute
    hang; the phone gave up, retried, and got
    `Cannot complete job in 'completed' status` — a failure message on a job
    that had in fact completed.

    The spec said "before db.session.commit()". The spec was wrong, and this
    test is what stops the next author putting it back.
    """

    def test_the_completion_is_committed_first(self, app, client, db_session,
                                               admin_user, monkeypatch):
        from app.services import crew_free

        order_seen = []
        real_commit = db.session.commit

        def spy_commit():
            order_seen.append('commit')
            return real_commit()

        def spy_ask(job, forced=False, client=None):
            order_seen.append('ask')
            return None

        monkeypatch.setattr(db.session, 'commit', spy_commit)
        monkeypatch.setattr(crew_free, 'ask_for_backfill', spy_ask)

        plan, days = _week(db_session, admin_user)
        job = _job(db_session, days[0], [], 4.0)
        db_session.session.add(WorkPlanJobTracking(
            work_plan_job_id=job.id, status='in_progress'))
        db_session.session.commit()
        order_seen.clear()

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post(
            f'/api/work-plan-tracking/jobs/{job.id}/complete',
            headers=headers, json={})

        assert resp.status_code == 200
        assert 'ask' in order_seen, 'the hook never ran at all'
        assert 'commit' in order_seen[:order_seen.index('ask')], (
            "the man's finished job must be safely written down before the "
            'server picks up the phone to Telegram')


class TestTheWordsMatchTheArithmetic:
    """The re-review's N1: my own clock-check fix introduced a contradiction.

    `fits` grew a SECOND failure cause — the job is longer than the least-free
    man — but the `over` label still only ever explained the first one, and it
    quoted `clock`, which is the MOST-free man. So a 4.5h job that failed
    because the second man has one hour left was announced as "needs 4.5h, they
    have 8.0h", which reads as nonsense.

    The headline had the same disease: "8 hours left today (2 men)" when one of
    the two has one hour is a promise the crew cannot keep.
    """

    def test_the_oversized_label_names_the_man_who_runs_out_first(
            self, app, db_session, admin_user):
        from app.services.crew_free import _at, candidates_for
        plan, days = _today_week(db_session, admin_user)
        _box_order(db_session, '700000009500', kind='tractor')

        offered = candidates_for(plan, 'west', 9.0, free_men=2,
                                 free_clock_hours=[8.0, 1.0])

        assert offered and offered[0]['fits'] is False
        label = _at('en', 'over', clock=8.0, **offered[0])
        assert '8.0' not in label, (
            f'the job fails on the man with ONE hour, not the man with '
            f'eight: {label}')
        assert '1.0' in label, label

    def test_the_headline_never_promises_more_than_the_crew_can_work(
            self, app, db_session, admin_user):
        """Two men, one with 8h and one with 1h. Saying "8 hours left" is a
        promise the pair cannot keep; saying "1 hour" throws away the fact that
        one of them has a whole day. Say both."""
        from app.services.crew_free import ask_for_backfill
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        plan, days = _today_week(db_session, admin_user)
        long_man = _man(db_session, 'longday')
        short_man = _man(db_session, 'shortday')
        finished = _job(db_session, days[0], [long_man, short_man], 1.0,
                        status='completed', actual=0.0, name='UNEVEN')
        # The short man really spent seven hours on his other job today.
        _job(db_session, days[0], [short_man], 7.0, status='completed',
             actual=7.0, name='HISOTHER')
        _box_order(db_session, '700000009501', kind='trailer')
        recorder = Recorder()

        proposal = ask_for_backfill(finished, client=recorder)

        assert proposal is not None
        headline = proposal.summary
        # Anchored to the line start: the range form CONTAINS the bare form
        # as a substring, so an unanchored check can never fail.
        assert '\n8.0 hours left today (2 men)' not in headline, (
            f'the pair cannot work eight hours — one of them has one: '
            f'{headline}')
        assert '1.0 to 8.0 hours left today (2 men)' in headline, (
            f'both facts belong in the sentence: {headline}')

    def test_an_even_crew_still_reads_as_one_number(self, app, db_session,
                                                    admin_user):
        """The common case — men who work together have the same hours left —
        must not grow a range it does not need."""
        from app.services.crew_free import ask_for_backfill
        app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
        plan, days = _today_week(db_session, admin_user)
        men = [_man(db_session, f'even{i}') for i in range(2)]
        finished = _job(db_session, days[0], men, 6.0, status='completed',
                        actual=2.0, name='EVEN')
        _box_order(db_session, '700000009502', kind='trailer')

        proposal = ask_for_backfill(finished, client=Recorder())

        assert proposal is not None
        assert '6.0 hours left today (2 men)' in proposal.summary, (
            proposal.summary)
        assert '–' not in proposal.summary   # no range dash
