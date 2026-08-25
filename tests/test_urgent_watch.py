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

    def test_a_pm_longer_than_a_day_is_left_for_the_generator(
            self, app, db_session, admin_user, allowed):
        """A 12-hour reach stacker PM must be split 8h + 4h across two days.
        place_one cannot do that, so the watch does not offer it."""
        from app.services.urgent_watch import look_for_homeless_urgents
        plan, days = _week(db_session, admin_user)
        men = [_man(db_session, f'sp{i}') for i in range(6)]     # 48 mh/day
        _rule(db_session, men)
        for day in days:
            _fill(db_session, day, men[:2], 20.0)
        _order(db_session, '700000000750', kind='reach stacker')
        recorder = Recorder()

        report = look_for_homeless_urgents(today=MONDAY, client=recorder)

        assert report['asked'] == 0
        assert recorder.messages == []


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
