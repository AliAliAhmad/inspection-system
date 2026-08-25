"""
The domino — Ali's "A" (2026-08-25).

Four hours of unfinished RS110 land on a full Tuesday. Something must give:
Tuesday's least important untouched job slides to Wednesday, Wednesday's to
Thursday, and whatever falls off the week's end returns to the box — his own
week rule. Worked jobs NEVER move; the whole chain is returned so the review
shows it before one Submit approves it.
"""

from datetime import date, timedelta

import pytest

from app.extensions import db
from app.models import Equipment, SAPWorkOrder, User, WorkPlan, WorkPlanDay, WorkPlanJob
from app.models.work_plan_job_tracking import WorkPlanJobTracking
from app.models.worker_assignment_rule import WorkerAssignmentRule
from app.services.day_ripple import make_room

MONDAY = date(2026, 8, 24)
_seq = iter(range(1, 10000))


def _user(db_session, name):
    user = User(email=f'{name}@t.iq', full_name=name, role='maintenance',
                role_id=f'MNR{next(_seq):03d}', specialization='mechanical',
                shift='day')
    user.set_password('x')
    db_session.session.add(user)
    db_session.session.commit()
    return user


def _rule(db_session, workers, team_type='regular_pm'):
    rule = WorkerAssignmentRule(
        berth='west', team_type=team_type, equipment_category='all',
        mech_count=2, elec_count=0,
        candidate_mech_workers=[u.id for u in workers])
    db_session.session.add(rule)
    db_session.session.commit()
    return rule


def _week(db_session, admin_user, n_days=7):
    plan = WorkPlan(week_start=MONDAY, week_end=MONDAY + timedelta(days=6),
                    status='draft', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    days = []
    for offset in range(n_days):
        day = WorkPlanDay(work_plan_id=plan.id, date=MONDAY + timedelta(days=offset))
        db_session.session.add(day)
        days.append(day)
    db_session.session.commit()
    return plan, days


def _machine(db_session, name):
    equipment = Equipment(name=name, serial_number=f'SN-{name}',
                          equipment_type='tractor', berth='west')
    db_session.session.add(equipment)
    db_session.session.commit()
    return equipment


def _job(db_session, day, name, hours, priority='normal', number=None,
         job_type='pm', worked=None):
    equipment = _machine(db_session, name)
    job = WorkPlanJob(work_plan_day_id=day.id, job_type=job_type,
                      equipment_id=equipment.id, estimated_hours=hours,
                      berth='west', position=1, priority=priority,
                      sap_order_number=number, description=f'{name} work')
    db_session.session.add(job)
    db_session.session.flush()
    if number:
        db_session.session.add(SAPWorkOrder(
            order_number=number, order_type='PRM', job_type=job_type,
            equipment_id=equipment.id, estimated_hours=hours,
            status='scheduled', work_plan_id=day.work_plan_id,
            description=f'{name} work'))
    if worked:
        db_session.session.add(WorkPlanJobTracking(
            work_plan_job_id=job.id, status=worked))
    db_session.session.commit()
    return job


@pytest.fixture
def crew(db_session):
    """2 west PM men = 16 man-hours a day."""
    _rule(db_session, [_user(db_session, 'H'), _user(db_session, 'O')])


class TestMakingRoom:
    def test_the_least_important_job_slides_to_the_next_day(self, db_session,
                                                            admin_user, crew):
        plan, days = _week(db_session, admin_user)
        keeper = _job(db_session, days[1], 'TT001', 4.0, priority='high')
        lamp = _job(db_session, days[1], 'TT002', 3.0, priority='low')
        # Tuesday: 4*2 + 3*2 = 14 of 16. Need 8 more -> lamp (6) goes, 8+8=16 fits.

        chain = make_room(plan, days[1], 8.0, 'west', 'pm')

        assert len(chain) == 1
        assert chain[0]['job_id'] == lamp.id
        assert chain[0]['to'] == days[2].date.isoformat()
        db_session.session.refresh(lamp)
        assert lamp.work_plan_day_id == days[2].id
        db_session.session.refresh(keeper)
        assert keeper.work_plan_day_id == days[1].id

    def test_the_cascade_rolls_down_the_week(self, db_session, admin_user, crew):
        """Tuesday AND Wednesday are full: Tuesday's lamp pushes Wednesday's
        mirror, which lands on Thursday."""
        plan, days = _week(db_session, admin_user)
        _job(db_session, days[1], 'TT010', 4.0, priority='high')
        lamp = _job(db_session, days[1], 'TT011', 3.0, priority='low')
        _job(db_session, days[2], 'TT012', 4.0, priority='high')
        mirror = _job(db_session, days[2], 'TT013', 3.0, priority='low')

        chain = make_room(plan, days[1], 8.0, 'west', 'pm')

        db_session.session.refresh(lamp)
        db_session.session.refresh(mirror)
        assert lamp.work_plan_day_id == days[2].id
        assert mirror.work_plan_day_id == days[3].id
        assert len(chain) == 2

    def test_what_falls_off_the_week_returns_to_the_box(self, db_session,
                                                        admin_user, crew):
        """Every day full to Sunday: the last victim's order goes back to
        pending and its job row is gone — Ali's own week rule."""
        plan, days = _week(db_session, admin_user)
        victims = []
        for i, day in enumerate(days):
            _job(db_session, day, f'TT2{i:02d}', 5.0, priority='high')
            victims.append(_job(db_session, day, f'TT3{i:02d}', 3.0,
                                priority='low', number=f'70000000210{i}'))

        chain = make_room(plan, days[0], 8.0, 'west', 'pm')

        assert chain[-1]['to'] == 'box'
        released = SAPWorkOrder.query.filter_by(order_number='700000002106').one()
        assert released.status == 'pending'
        assert released.work_plan_id is None
        assert db.session.get(WorkPlanJob, victims[-1].id) is None

    def test_a_worked_job_is_never_the_victim(self, db_session, admin_user, crew):
        """The lamp was STARTED — it stays. The high-priority untouched job
        moves instead, however important it is."""
        plan, days = _week(db_session, admin_user)
        lamp = _job(db_session, days[1], 'TT020', 3.0, priority='low',
                    worked='in_progress')
        keeper = _job(db_session, days[1], 'TT021', 4.5, priority='high')

        chain = make_room(plan, days[1], 8.0, 'west', 'pm')

        db_session.session.refresh(lamp)
        assert lamp.work_plan_day_id == days[1].id
        assert all(entry['job_id'] != lamp.id for entry in chain)

    def test_dry_run_reports_the_same_chain_and_touches_nothing(self, db_session,
                                                                admin_user, crew):
        plan, days = _week(db_session, admin_user)
        lamp = _job(db_session, days[1], 'TT030', 3.0, priority='low')
        _job(db_session, days[1], 'TT031', 4.5, priority='high')

        dry = make_room(plan, days[1], 8.0, 'west', 'pm', dry_run=True)
        db_session.session.refresh(lamp)
        assert lamp.work_plan_day_id == days[1].id

        wet = make_room(plan, days[1], 8.0, 'west', 'pm')
        assert [(e['job_id'], e['to']) for e in dry] == \
               [(e['job_id'], e['to']) for e in wet]

    def test_a_protected_job_is_never_moved(self, db_session, admin_user, crew):
        """The carried-into continuation must not be chosen as its own victim."""
        plan, days = _week(db_session, admin_user)
        continuation = _job(db_session, days[1], 'RS110', 6.0, priority='low')

        chain = make_room(plan, days[1], 6.0, 'west', 'pm',
                          protect_job_ids={continuation.id})

        db_session.session.refresh(continuation)
        assert continuation.work_plan_day_id == days[1].id

    def test_no_team_rules_means_no_domino(self, db_session, admin_user):
        """No WorkerAssignmentRules -> no wallets -> nothing to overflow."""
        plan, days = _week(db_session, admin_user)
        _job(db_session, days[1], 'TT040', 12.0, priority='low')

        assert make_room(plan, days[1], 8.0, 'west', 'pm') == []


class TestSeveralDemandsInOnePass:
    """A split PM needs room on TWO days — 8 hours today, 4 tomorrow.

    Asking twice cannot work: the first call pushes a job onto the second day,
    and the second call plans without knowing. `demands` simulates both in one
    pass, which is what keeps the promise this module is built on — dry_run
    returns byte-for-byte what apply does.
    """

    def test_a_dry_run_over_two_days_is_what_apply_does(self, db_session,
                                                        admin_user, crew):
        plan, days = _week(db_session, admin_user)
        for day in days[:6]:
            _job(db_session, day, f'TTM{day.date.day}', 5.0, priority='low',
                 number=f'7000000031{day.date.day}')

        wanted = [(days[0], 10.0), (days[1], 6.0)]
        shown = make_room(plan, days[0], 10.0, 'west', 'pm',
                          dry_run=True, demands=wanted)
        happened = make_room(plan, days[0], 10.0, 'west', 'pm',
                             dry_run=False, demands=wanted)

        assert shown == happened
        assert shown, 'the setup must actually force some moves'

    def test_both_days_are_really_freed(self, db_session, admin_user, crew):
        """Two separate calls left the second day short, because the first had
        already pushed a job onto it."""
        from app.services.day_budget import day_free_man_hours
        plan, days = _week(db_session, admin_user)
        for day in days[:6]:
            _job(db_session, day, f'TTN{day.date.day}', 6.0, priority='low',
                 number=f'7000000032{day.date.day}')

        make_room(plan, days[0], 10.0, 'west', 'pm', dry_run=False,
                  demands=[(days[0], 10.0), (days[1], 6.0)])
        # make_room flushes but does not expire, so the cached day.jobs
        # collections still show the old picture. Measure the database, not
        # the leftovers — this is the same staleness that made two sequential
        # calls plan against a picture the first had already changed.
        db_session.session.expire_all()

        assert day_free_man_hours(plan, days[0], 'west', 'pm') >= 10.0
        assert day_free_man_hours(plan, days[1], 'west', 'pm') >= 6.0

    def test_without_demands_it_behaves_exactly_as_before(self, db_session,
                                                          admin_user, crew):
        """The single-day callers — the evening carry-over among them — must
        see no change at all."""
        plan, days = _week(db_session, admin_user)
        keeper = _job(db_session, days[1], 'TTP1', 4.0, priority='high')
        lamp = _job(db_session, days[1], 'TTP2', 3.0, priority='low')

        chain = make_room(plan, days[1], 8.0, 'west', 'pm')

        assert [m['job_id'] for m in chain] == [lamp.id]
        db_session.session.refresh(keeper)
        assert keeper.work_plan_day_id == days[1].id
