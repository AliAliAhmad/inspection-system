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
from app.models.work_plan_job_tracking import WorkPlanJobTracking
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


def _rule(db_session, men, berth='west', mech_count=2):
    db_session.session.add(WorkerAssignmentRule(
        berth=berth, team_type='regular_pm', equipment_category='all',
        mech_count=mech_count, elec_count=0,
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


def _order(db_session, number, kind='ech', priority='urgent',
           name=None, berth='west'):
    # ECH (8h/2crew = 16mh), not reach stacker (12h/2crew = 24mh): Ali's
    # table prices a PM from a fixed family figure — price_one never boosts
    # crew for urgency — so EVERY reach-stacker PM this helper could build
    # is unconditionally longer than a day (12h > MAN_HOURS_PER_DAY) and the
    # night watch must never offer one (see urgent_watch's "too long for a
    # day" guard). ECH lands exactly AT the 8h ceiling, so it stays a normal
    # single-day case here; tests that specifically need the too-long shape
    # pass kind='reach stacker' explicitly.
    equipment = _machine(db_session, name or f'M{number[-3:]}', kind, berth)
    order = SAPWorkOrder(order_number=number, order_type='PRM', job_type='pm',
                         equipment_id=equipment.id,
                         description=f'{equipment.name} 250HR SERVICE',
                         estimated_hours=4.0, priority=priority, berth=berth,
                         status='pending', work_plan_id=None)
    db_session.session.add(order)
    db_session.session.commit()
    return order


def _fill(db_session, day, men, hours, priority='low', name='TTL', worked=None):
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
    if worked:
        db_session.session.add(WorkPlanJobTracking(
            work_plan_job_id=job.id, status=worked))
    db_session.session.commit()
    return job


@pytest.fixture
def allowed(app, admin_user):
    app.config['TELEGRAM_ALLOWED_USERS'] = f'{ALI_TELEGRAM_ID}:{admin_user.id}'
    return admin_user


class TestTheNightWatch:
    def test_a_homeless_urgent_raises_a_question(self, app, db_session,
                                                 admin_user, allowed):
        """Every day packed with low-priority work; a 16 man-hour urgent PM
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

    def test_last_nights_question_never_blocks_tonights(self, app, db_session,
                                                        admin_user, allowed):
        """Last night's proposal expires a few seconds AFTER tonight's sweep
        (the ask loop takes time), so a time-based sweep would leave it open,
        _already_open would suppress tonight's ask, and an ignored urgent order
        would be raised every OTHER night. Ali's rule is every night."""
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'ln{i}') for i in range(3)]
        _rule(db_session, men)
        for day in days:
            _fill(db_session, day, men[:2], 10.0)
        _order(db_session, '700000000730')

        first = look_for_homeless_urgents(today=MONDAY, client=Recorder())
        assert first['asked'] == 1
        stale = TelegramProposal.query.filter_by(kind='urgent_needs_room').one()
        # Still in the future, exactly as it would be on the next night's run.
        stale.expires_at = datetime.utcnow() + timedelta(seconds=30)
        db_session.session.commit()

        second = look_for_homeless_urgents(today=MONDAY, client=Recorder())

        assert second['asked'] == 1, 'tonight had to ask again'
        db_session.session.refresh(stale)
        assert stale.status == 'expired'

    def test_a_job_bigger_than_the_whole_day_is_never_promised(
            self, app, db_session, admin_user, allowed):
        """An ECH PM (8h) with a 3-man rule crew is 24 man-hours. A two-man
        team's day is 16. No amount of moving makes it fit, so nobody's phone
        should buzz — and the ceiling guard catches this BEFORE make_room
        ever simulates a chain (kind='ech' keeps hours at 8, at the day
        ceiling and not over it, so this exercises the wallet-size guard and
        not the separate "too long for a day" guard)."""
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'bg{i}') for i in range(2)]     # 16 mh/day
        _rule(db_session, men, mech_count=3)                     # crew=3 -> 24mh
        for day in days:
            _fill(db_session, day, men, 3.0)
        _order(db_session, '700000000740')
        recorder = Recorder()

        report = look_for_homeless_urgents(today=MONDAY, client=recorder)

        assert report['asked'] == 0
        assert TelegramProposal.query.count() == 0
        assert recorder.messages == []

    def test_a_worked_job_blocking_the_only_victim_is_never_promised(
            self, app, db_session, admin_user, allowed):
        """The order fits under the day's full wallet (16 of 24), so the
        ceiling guard alone would wave it through. But the only other job on
        the day is WORKED — it can never move — and the one movable lamp job
        frees just 4 of the 12 that still need clearing. The simulated chain
        is non-empty (the lamp job really does move) yet still insufficient;
        the watch must check what the chain actually freed, not just that it
        moved something."""
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'wj{i}') for i in range(3)]      # 24 mh/day
        _rule(db_session, men)
        for day in days:
            # 16mh worked (stuck) + 4mh movable = 20 of 24 used, 4 free.
            _fill(db_session, day, men[:2], 8.0, priority='high',
                 worked='in_progress')
            _fill(db_session, day, men[:2], 2.0, priority='low')
        _order(db_session, '700000000745')                        # ech, 16mh
        recorder = Recorder()

        report = look_for_homeless_urgents(today=MONDAY, client=recorder)

        assert report['asked'] == 0
        assert TelegramProposal.query.count() == 0
        assert recorder.messages == []

    def test_an_urgent_reach_stacker_with_four_free_men_is_one_eight_hour_day(
            self, app, db_session, admin_user, allowed):
        """Ali, 2026-08-25: it must ALWAYS be offered. Four men free means the
        curve gives 8 hours, so it goes on ONE day — not skipped, not split."""
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'sp{i}') for i in range(6)]     # 48 mh/day
        _rule(db_session, men, mech_count=4)
        for day in days:
            _fill(db_session, day, men[:2], 20.0)                # 40 of 48
        _order(db_session, '700000000750', kind='reach stacker')
        recorder = Recorder()

        report = look_for_homeless_urgents(today=MONDAY, client=recorder)

        assert report['asked'] == 1, 'an urgent reach stacker is never skipped'
        proposal = TelegramProposal.query.one()
        assert proposal.details['crew'] == 4
        assert proposal.details['hours'] == 8.0
        assert proposal.details['split'] is False
        assert len(proposal.details['day_ids']) == 1

    def test_an_urgent_reach_stacker_with_only_two_men_is_split_over_two_days(
            self, app, db_session, admin_user, allowed):
        """Ali: "if not available 3 or 4, put 2 and make the time to 12" — and
        twelve hours cannot be one day, so it runs 8 today and 4 tomorrow."""
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'sq{i}') for i in range(2)]     # only two
        _rule(db_session, men)
        for day in days:
            _fill(db_session, day, men, 3.0)                     # 12 of 16
        _order(db_session, '700000000751', kind='reach stacker')
        recorder = Recorder()

        report = look_for_homeless_urgents(today=MONDAY, client=recorder)

        assert report['asked'] == 1
        proposal = TelegramProposal.query.one()
        assert proposal.details['crew'] == 2
        assert proposal.details['hours'] == 12.0
        assert proposal.details['split'] is True
        assert len(proposal.details['day_ids']) == 2
        assert proposal.details['costs'] == [16.0, 8.0]          # 8h x2, 4h x2


    def test_a_night_asks_at_most_three_questions(self, app, db_session,
                                                  admin_user, allowed):
        """Without a cap the watch asks about EVERY homeless urgent order, one
        message per order to every planner. With 40 of 133 live orders flagged
        urgent that is a wall of buzzing at five in the morning — and _call has
        no retry and no rate-limit pacing, so a burst would silently drop some
        planners' copies. Whatever is skipped is counted, not hidden, and comes
        back the next night."""
        from app.services.urgent_watch import (MAX_ASKS_PER_NIGHT,
                                               look_for_homeless_urgents)
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'cap{i}') for i in range(3)]      # 24 mh/day
        _rule(db_session, men)
        for day in days:
            _fill(db_session, day, men[:2], 10.0)                  # 20 of 24
        for i in range(5):
            _order(db_session, f'70000000076{i}')
        recorder = Recorder()

        report = look_for_homeless_urgents(today=MONDAY, client=recorder)

        assert report['asked'] == MAX_ASKS_PER_NIGHT == 3
        assert report['skipped'] == 2
        assert TelegramProposal.query.count() == 3
        assert len(recorder.messages) == 3

    def test_the_most_overdue_is_asked_about_first(self, app, db_session,
                                                   admin_user, allowed):
        """A capped night must spend its three questions on the work that has
        waited longest, not on whatever the database happened to return first."""
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'ov{i}') for i in range(3)]
        _rule(db_session, men)
        for day in days:
            _fill(db_session, day, men[:2], 10.0)
        # Created oldest-last on purpose, so insertion order is the wrong order.
        for i, overdue in enumerate([1.0, 90.0, 5.0, 60.0, 2.0]):
            order = _order(db_session, f'70000000077{i}')
            order.overdue_value = overdue
            order.overdue_unit = 'days'
        db_session.session.commit()

        look_for_homeless_urgents(today=MONDAY, client=Recorder())

        asked = {p.details['order_number']
                 for p in TelegramProposal.query.all()}
        assert asked == {'700000000771', '700000000773', '700000000772'}, (
            'the three most overdue (90, 60, 5 days) had to be the ones asked')


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
        before = {v.id: v.work_plan_day_id for v in victims}

        taps.handle_callback(update, admin_user, client=recorder)

        after = {}
        for victim in victims:
            row = db.session.get(WorkPlanJob, victim.id)
            # 'box' = released off the week's end and its job row deleted.
            after[victim.id] = row.work_plan_day_id if row is not None else 'box'
        assert after != before, (
            'nothing actually moved — apply_urgent did not run make_room, so no '
            'room was freed and the urgent job landed on a full day')

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


class TestPressingYesOnASplit:
    def test_yes_creates_both_halves_on_consecutive_days(self, app, db_session,
                                                         admin_user, allowed):
        """Ali's rule end to end: two men, twelve hours, 8 today and 4
        tomorrow, one order, two jobs, the same pair on both."""
        from app.services.telegram import taps
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'ps{i}') for i in range(2)]
        _rule(db_session, men)
        for day in days:
            _fill(db_session, day, men, 3.0)
        order = _order(db_session, '700000000780', kind='reach stacker')
        recorder = Recorder()
        look_for_homeless_urgents(today=MONDAY, client=recorder)
        proposal = TelegramProposal.query.one()
        update = {'update_id': 950,
                  'callback_query': {'id': 'cbq-950',
                                     'data': f'tp:{proposal.id}:0',
                                     'from': {'id': ALI_TELEGRAM_ID,
                                              'language_code': 'en'},
                                     'message': {'message_id': 301,
                                                 'chat': {'id': ALI_TELEGRAM_ID,
                                                          'type': 'private'}}}}

        taps.handle_callback(update, admin_user, client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'accepted'
        assert proposal.result['split'] is True
        part1 = db.session.get(WorkPlanJob, proposal.result['job_id'])
        part2 = db.session.get(WorkPlanJob, proposal.result['job_id_part2'])
        assert float(part1.estimated_hours) == 8.0
        assert float(part2.estimated_hours) == 4.0
        day1 = db.session.get(WorkPlanDay, part1.work_plan_day_id)
        day2 = db.session.get(WorkPlanDay, part2.work_plan_day_id)
        assert (day2.date - day1.date).days == 1
        assert {a.user_id for a in part1.assignments} == {
            a.user_id for a in part2.assignments} == {m.id for m in men}
        db_session.session.refresh(order)
        assert order.status == 'scheduled'

    def test_the_promised_crew_is_the_crew_that_shows_up(self, app, db_session,
                                                         admin_user, allowed):
        """The message promised 4 men and 8 hours. Pressing Yes must not
        quietly place 2 men and 12 — the day was measured for the promise."""
        from app.services.telegram import taps
        from app.services.urgent_watch import look_for_homeless_urgents
        from app.services.day_ripple import job_cost_man_hours
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'pc{i}') for i in range(6)]
        _rule(db_session, men, mech_count=4)
        for day in days:
            _fill(db_session, day, men[:2], 20.0)
        _order(db_session, '700000000781', kind='reach stacker')
        recorder = Recorder()
        look_for_homeless_urgents(today=MONDAY, client=recorder)
        proposal = TelegramProposal.query.one()
        promised = proposal.details['cost_man_hours']
        update = {'update_id': 951,
                  'callback_query': {'id': 'cbq-951',
                                     'data': f'tp:{proposal.id}:0',
                                     'from': {'id': ALI_TELEGRAM_ID,
                                              'language_code': 'en'},
                                     'message': {'message_id': 302,
                                                 'chat': {'id': ALI_TELEGRAM_ID,
                                                          'type': 'private'}}}}

        taps.handle_callback(update, admin_user, client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'accepted', proposal.result
        job = db.session.get(WorkPlanJob, proposal.result['job_id'])
        assert float(job.estimated_hours) == 8.0
        assert len(job.assignments) == 4
        assert job_cost_man_hours(job) == promised == 32.0


def _used_man_hours(day, berth='west', wallet_key='pm'):
    """What the day is REALLY charged — day_free_man_hours clamps at zero, so
    it cannot show an overspend."""
    from app.services.day_ripple import (_berth_key, _job_wallet_key,
                                         job_cost_man_hours)
    total = 0.0
    for job in day.jobs:
        if _job_wallet_key(job) != wallet_key:
            continue
        if _berth_key(job.berth or 'both') != _berth_key(berth):
            continue
        total += job_cost_man_hours(job)
    return total


class TestWhatTheReviewCaught:
    """Three bugs a 720-green suite missed, because every test team in this
    repo is mechanics-only with the crew size equal to the pool size."""

    def _press_yes(self, admin_user, proposal, recorder, n=960):
        from app.services.telegram import taps
        taps.handle_callback(
            {'update_id': n,
             'callback_query': {'id': f'cbq-{n}', 'data': f'tp:{proposal.id}:0',
                                'from': {'id': ALI_TELEGRAM_ID,
                                         'language_code': 'en'},
                                'message': {'message_id': 400,
                                            'chat': {'id': ALI_TELEGRAM_ID,
                                                     'type': 'private'}}}},
            admin_user, client=recorder)

    def test_a_split_that_was_never_boosted_does_not_crash_on_yes(
            self, app, db_session, admin_user, allowed):
        """The rule wants 3 men. The ask was NOT boosted, so its 12 hours came
        from the table. Re-pricing it with crew=3 on the way in re-reads the
        curve as 8h, leaves nothing to split, and place_split raises — the
        order fails and, because 'failed' is not 'open', it is re-asked and
        re-fails every night forever.

        Built directly rather than through the watch: the wallet-ceiling guard
        now refuses this shape before it can be asked, so this test guards the
        apply path itself, which is where the fix lives.
        """
        from app.services.telegram.ask import ask
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'nb{i}') for i in range(2)]
        _rule(db_session, men, mech_count=3)
        order = _order(db_session, '700000000790', kind='reach stacker')
        recorder = Recorder()
        proposal = ask(
            'urgent_needs_room', {'en': 'RS split', 'ar': 'RS'},
            [{'key': 'yes', 'action': 'apply', 'label_en': 'Yes',
              'label_ar': 'نعم'}],
            datetime.utcnow() + timedelta(hours=12),
            details={'order_number': '700000000790', 'berth': 'west',
                     'wallet_key': 'pm', 'cost_man_hours': 36.0,
                     'costs': [24.0, 12.0], 'hours': 12.0, 'crew': 3,
                     'split': True, 'boosted': False,
                     'day_ids': [days[0].id, days[1].id], 'chain': []},
            work_plan_id=plan.id, target_day_id=days[0].id, client=recorder)

        self._press_yes(admin_user, proposal, recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'accepted', proposal.result
        part1 = db.session.get(WorkPlanJob, proposal.result['job_id'])
        part2 = db.session.get(WorkPlanJob, proposal.result['job_id_part2'])
        assert float(part1.estimated_hours) == 8.0
        assert float(part2.estimated_hours) == 4.0
        db_session.session.refresh(order)
        assert order.status == 'scheduled'

    def test_a_fault_is_never_re_priced_as_a_pm(self, app, db_session,
                                                admin_user, allowed):
        """An urgent COM on a reach stacker is 3 hours. Replaying the crew
        through the PM curve would book it as an 8-hour job — an approved
        three-hour fault quietly eating a whole day."""
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'ft{i}') for i in range(3)]
        db_session.session.add(WorkerAssignmentRule(
            berth='west', team_type='defect_mech', equipment_category='all',
            mech_count=3, elec_count=0,
            candidate_mech_workers=[m.id for m in men]))
        db_session.session.commit()
        equipment = _machine(db_session, 'RSF', 'reach stacker')
        db_session.session.add(SAPWorkOrder(
            order_number='700000000791', order_type='COM', job_type='defect',
            equipment_id=equipment.id, description='RSF hydraulic leak',
            estimated_hours=4.0, priority='urgent', berth='west',
            status='pending', work_plan_id=None))
        db_session.session.commit()
        for day in days:
            job = WorkPlanJob(work_plan_day_id=day.id, job_type='defect',
                              equipment_id=_machine(db_session, f'B{next(_seq)}',
                                                    'tractor').id,
                              estimated_hours=7.0, berth='west', position=1,
                              priority='low', description='filler leak')
            db_session.session.add(job)
            db_session.session.flush()
            for man in men:
                db_session.session.add(WorkPlanAssignment(
                    work_plan_job_id=job.id, user_id=man.id))
        db_session.session.commit()
        recorder = Recorder()

        look_for_homeless_urgents(today=MONDAY, client=recorder)
        proposal = TelegramProposal.query.one()
        assert proposal.details['boosted'] is False
        assert proposal.details['hours'] == 3.0
        self._press_yes(admin_user, proposal, recorder, n=961)

        db_session.session.refresh(proposal)
        assert proposal.status == 'accepted', proposal.result
        job = db.session.get(WorkPlanJob, proposal.result['job_id'])
        assert float(job.estimated_hours) == 3.0, 'a fault must stay a fault'

    def test_electricians_do_not_count_toward_a_mechanic_boost(
            self, db_session, admin_user):
        """crew_needed raises the MECH target only (generator line 2136), so a
        team of 2 mechanics + 2 electricians whose rule wants no electrician can
        field two men, not four. Counting four would promise an 8-hour reach
        stacker and staff it with two — and Ali's curve says two men need 12."""
        from app.services.place_one import available_men, urgent_one_day_crew
        plan, days = _week(db_session, admin_user)
        mech = [_man(db_session, f'me{i}') for i in range(2)]
        elec = [_man(db_session, f'el{i}') for i in range(2)]
        db_session.session.add(WorkerAssignmentRule(
            berth='west', team_type='regular_pm', equipment_category='all',
            mech_count=2, elec_count=0,
            candidate_mech_workers=[m.id for m in mech],
            candidate_elec_workers=[e.id for e in elec]))
        db_session.session.commit()
        order = _order(db_session, '700000000792', kind='reach stacker')

        assert available_men(order, days[1]) == 2
        assert urgent_one_day_crew(order, days[1]) is None

    def test_the_second_make_room_sees_what_the_first_one_moved(
            self, app, db_session, admin_user, allowed):
        """Neither day of a split may end up charged more than its wallet.

        HONEST SCOPE: this asserts the invariant, not the mechanism. It passes
        with and without the `expire` between the two `make_room` calls — the
        staleness a reviewer measured with its own probe does not reproduce
        here, because SQLAlchemy reloads `day.jobs` anyway once `purge_job_rows`
        has expunged and deleted through raw SQL. The invariant is still worth
        holding; do not read a pass here as proof the expire is load-bearing.
        """
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'bl{i}') for i in range(2)]       # 16 mh/day
        _rule(db_session, men)
        _fill(db_session, days[0], men, 8.0)                       # 16 of 16
        _fill(db_session, days[1], men, 4.0)                       # 8 of 16
        for day in days[2:]:
            _fill(db_session, day, men, 4.0)
        _order(db_session, '700000000793', kind='reach stacker')
        recorder = Recorder()
        look_for_homeless_urgents(today=MONDAY, client=recorder)
        proposal = TelegramProposal.query.one()
        assert proposal.details['split'] is True

        self._press_yes(admin_user, proposal, recorder, n=962)

        db_session.session.refresh(proposal)
        assert proposal.status == 'accepted', proposal.result
        for day in days[:2]:
            db_session.session.refresh(day)
            assert _used_man_hours(day) <= 16.0 + 1e-6, (
                f'{day.date} is charged {_used_man_hours(day)} of 16')


class TestTheSecondReviewCaught:
    def test_a_missing_electrician_is_not_replaced_by_a_mechanic(
            self, db_session, admin_user):
        """The reviewer's table, row 4. `crew_needed` raises the mech target by
        `size - (mech_count + elec_count)` — subtracting the electricians the
        rule WISHES for, not the ones that exist. With elec_count=3 and none
        free, ten free mechanics still land a two-man job. Promised 8h x 4 = 32;
        two men arrive; Ali's curve says two men need twelve hours."""
        from app.services.place_one import (available_men, can_field,
                                            urgent_one_day_crew)
        plan, days = _week(db_session, admin_user)
        mech = [_man(db_session, f'mm{i}') for i in range(10)]
        db_session.session.add(WorkerAssignmentRule(
            berth='west', team_type='regular_pm', equipment_category='all',
            mech_count=2, elec_count=3,
            candidate_mech_workers=[m.id for m in mech],
            candidate_elec_workers=[]))
        db_session.session.commit()
        order = _order(db_session, '700000000794', kind='reach stacker')

        assert can_field(order, days[1], 4) is False
        assert available_men(order, days[1]) == 2
        assert urgent_one_day_crew(order, days[1]) is None

    def test_an_electrician_who_is_there_does_count(self, db_session,
                                                    admin_user):
        """The other side of the same rule — row 1, which already worked and
        must keep working."""
        from app.services.place_one import can_field
        plan, days = _week(db_session, admin_user)
        mech = [_man(db_session, f'mn{i}') for i in range(3)]
        elec = _man(db_session, 'sparky')
        db_session.session.add(WorkerAssignmentRule(
            berth='west', team_type='regular_pm', equipment_category='all',
            mech_count=2, elec_count=1,
            candidate_mech_workers=[m.id for m in mech],
            candidate_elec_workers=[elec.id]))
        db_session.session.commit()
        order = _order(db_session, '700000000795', kind='reach stacker')

        assert can_field(order, days[1], 4) is True

    def test_the_chain_shown_is_the_chain_that_happens(self, app, db_session,
                                                       admin_user, allowed):
        """The reviewer's setup: every move day-to-day, never off the week's
        end, so nothing is deleted and nothing masks a stale read. Two separate
        make_room calls promised five moves while six happened — and a
        different job moved. One call for the whole shape is what makes the
        message true."""
        from app.services.urgent_watch import look_for_homeless_urgents
        from app.services.telegram import taps
        plan, days = _week(db_session, admin_user)
        # Two men only, so no crew boost: 12 hours, split 8 + 4.
        men = [_man(db_session, f'ch{i}') for i in range(2)]        # 16 mh/day
        _rule(db_session, men)
        # Days 0-5 part-full, Sunday empty — so every victim always has a day
        # to land on and nothing ever falls off the week's end into the box.
        for day in days[:6]:
            _fill(db_session, day, men, 6.0)                        # 12 of 16
        _order(db_session, '700000000796', kind='reach stacker')
        recorder = Recorder()
        look_for_homeless_urgents(today=MONDAY, client=recorder)
        proposal = TelegramProposal.query.one()
        assert proposal.details['split'] is True
        shown = [(m['job_id'], m['from'], m['to'])
                 for m in proposal.details['chain']]

        taps.handle_callback(
            {'update_id': 970,
             'callback_query': {'id': 'cbq-970', 'data': f'tp:{proposal.id}:0',
                                'from': {'id': ALI_TELEGRAM_ID,
                                         'language_code': 'en'},
                                'message': {'message_id': 500,
                                            'chat': {'id': ALI_TELEGRAM_ID,
                                                     'type': 'private'}}}},
            admin_user, client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'accepted', proposal.result
        happened = [(m['job_id'], m['from'], m['to'])
                    for m in proposal.result['chain']]
        assert shown == happened, (
            f'the message promised {shown} and {happened} happened')

    def test_neither_day_of_a_split_is_overspent(self, app, db_session,
                                                 admin_user, allowed):
        """The reviewer measured day 1 left with 4 free against the 8 it needed.
        Same shape: fillers on days 0-2 only, so the cascade always has an empty
        day to land on and never reaches the box."""
        from app.services.day_budget import day_free_man_hours
        from app.services.urgent_watch import look_for_homeless_urgents
        from app.services.telegram import taps
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'ov{i}') for i in range(2)]        # 16 mh/day
        _rule(db_session, men)
        for day in days[:6]:
            _fill(db_session, day, men, 6.0)                        # 12 of 16
        _order(db_session, '700000000797', kind='reach stacker')
        recorder = Recorder()
        look_for_homeless_urgents(today=MONDAY, client=recorder)
        proposal = TelegramProposal.query.one()

        taps.handle_callback(
            {'update_id': 971,
             'callback_query': {'id': 'cbq-971', 'data': f'tp:{proposal.id}:0',
                                'from': {'id': ALI_TELEGRAM_ID,
                                         'language_code': 'en'},
                                'message': {'message_id': 501,
                                            'chat': {'id': ALI_TELEGRAM_ID,
                                                     'type': 'private'}}}},
            admin_user, client=recorder)

        db_session.session.refresh(proposal)
        assert proposal.status == 'accepted', proposal.result
        for day in days[:2]:
            db_session.session.refresh(day)
            assert _used_man_hours(day) <= 16.0 + 1e-6, (
                f'{day.date} is charged {_used_man_hours(day)} of 16')

    def test_picking_a_day_without_the_men_drops_the_boost(
            self, app, db_session, admin_user, allowed):
        """A boosted shape was measured on one day's roster. Pick another day
        where the crew is not free and it must fall back to the honest shape,
        not book an eight-hour day for men who are not coming."""
        from app.services.place_one import can_field
        from app.services.urgent_watch import apply_urgent
        from app.models.roster import RosterEntry
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'pk{i}') for i in range(4)]
        _rule(db_session, men, mech_count=4)
        order = _order(db_session, '700000000798', kind='reach stacker')
        # Everybody is off on Wednesday.
        for man in men:
            db_session.session.add(RosterEntry(
                user_id=man.id, date=days[2].date, shift='off'))
        db_session.session.commit()
        assert can_field(order, days[0], 4) is True
        assert can_field(order, days[2], 4) is False

        proposal = TelegramProposal(
            kind='urgent_needs_room', summary='RS boosted',
            details={'order_number': '700000000798', 'berth': 'west',
                     'wallet_key': 'pm', 'cost_man_hours': 32.0,
                     'costs': [32.0], 'hours': 8.0, 'crew': 4,
                     'split': False, 'boosted': True,
                     'day_ids': [days[0].id], 'chain': []},
            options=[{'key': 'yes', 'action': 'apply', 'label_en': 'Yes',
                      'label_ar': 'نعم'}],
            work_plan_id=plan.id, target_day_id=days[0].id, status='open',
            expires_at=datetime.utcnow() + timedelta(hours=12))
        db_session.session.add(proposal)
        db_session.session.commit()

        result = apply_urgent(proposal, {'key': f'day:{days[2].id}'},
                              admin_user)

        job = db.session.get(WorkPlanJob, result['job_id'])
        assert float(job.estimated_hours) == 12.0, (
            'no four-man crew on that day, so it is a twelve-hour job')
