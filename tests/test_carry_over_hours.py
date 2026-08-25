"""
The evening truth: tomorrow gets only what is actually left.

Ali, 2026-08-24/25. The worker who touched the machine states the hours
remaining ("C" — he knows best); the engineer can correct him at the review;
and the carry-over books THAT number. Before this, the carried job copied the
FULL original figure — RS110 at 12h with 8h already worked booked tomorrow
for 12 again, silently over-booking every next day by exactly the work
already done. The remaining hours were recorded on the carry-over record in
the same transaction, and then never used.

And the plan may already hold tomorrow's half: a split PM (part 2/2, same
sap_order_number). The carry-over must MERGE with it, never sit a second
RS110 next to it.
"""

from datetime import date, timedelta

import pytest

from app.extensions import db
from app.models import (Equipment, User, WorkPlan, WorkPlanDay, WorkPlanJob)
from app.models.work_plan_job_tracking import WorkPlanJobTracking
from app.models.work_plan_carry_over import WorkPlanCarryOver

MONDAY = date(2026, 8, 24)


def _login(client, user, password='admin123'):
    response = client.post('/api/auth/login',
                           json={'email': user.email, 'password': password})
    return response.get_json()['access_token']


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture
def week(db_session, admin_user):
    plan = WorkPlan(week_start=MONDAY, week_end=MONDAY + timedelta(days=6),
                    status='draft', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    days = []
    for offset in range(7):
        day = WorkPlanDay(work_plan_id=plan.id, date=MONDAY + timedelta(days=offset))
        db_session.session.add(day)
        days.append(day)
    db_session.session.commit()
    return plan, days


def _machine(db_session, name='RS110'):
    equipment = Equipment(name=name, serial_number=f'SN-{name}',
                          equipment_type='reach stacker', berth='west')
    db_session.session.add(equipment)
    db_session.session.commit()
    return equipment


def _job(db_session, day, equipment, hours=12.0, number='700000000300',
         description='250HR SERVICE', job_type='pm', position=1):
    job = WorkPlanJob(work_plan_day_id=day.id, job_type=job_type,
                      equipment_id=equipment.id, sap_order_number=number,
                      estimated_hours=hours, berth='west', position=position,
                      description=description)
    db_session.session.add(job)
    db_session.session.commit()
    return job


def _worked(db_session, job, actual=8.0, status='incomplete', remaining=None):
    tracking = WorkPlanJobTracking(work_plan_job_id=job.id, status=status,
                                   actual_hours=actual,
                                   remaining_hours=remaining)
    db_session.session.add(tracking)
    db_session.session.commit()
    return tracking


class TestTheWorkerSaysWhatIsLeft:
    def test_remaining_hours_is_stored_from_the_incomplete_call(
            self, client, db_session, admin_user, week):
        plan, days = week
        job = _job(db_session, days[0], _machine(db_session))
        token = _login(client, admin_user)
        client.post(f'/api/work-plan-tracking/jobs/{job.id}/start',
                    headers=_auth(token))

        response = client.post(
            f'/api/work-plan-tracking/jobs/{job.id}/incomplete',
            headers=_auth(token),
            json={'reason_category': 'time_ran_out', 'remaining_hours': 6.0})

        assert response.status_code == 200
        assert response.get_json()['tracking']['remaining_hours'] == 6.0

    def test_a_negative_figure_is_refused(self, client, db_session, admin_user,
                                          week):
        plan, days = week
        job = _job(db_session, days[0], _machine(db_session))
        token = _login(client, admin_user)
        client.post(f'/api/work-plan-tracking/jobs/{job.id}/start',
                    headers=_auth(token))

        response = client.post(
            f'/api/work-plan-tracking/jobs/{job.id}/incomplete',
            headers=_auth(token),
            json={'reason_category': 'time_ran_out', 'remaining_hours': -2})

        assert response.status_code == 400

    def test_omitting_it_is_fine(self, client, db_session, admin_user, week):
        plan, days = week
        job = _job(db_session, days[0], _machine(db_session))
        token = _login(client, admin_user)
        client.post(f'/api/work-plan-tracking/jobs/{job.id}/start',
                    headers=_auth(token))

        response = client.post(
            f'/api/work-plan-tracking/jobs/{job.id}/incomplete',
            headers=_auth(token), json={'reason_category': 'time_ran_out'})

        assert response.status_code == 200
        assert response.get_json()['tracking']['remaining_hours'] is None


def _carry(client, token, review_id, job_id, extra=None):
    payload = {'original_job_id': job_id, 'reason_category': 'time_ran_out'}
    payload.update(extra or {})
    return client.post(
        f'/api/work-plan-tracking/daily-review/{review_id}/carry-over',
        headers=_auth(token), json=payload)


def _review(client, token, day):
    response = client.get(
        f'/api/work-plan-tracking/daily-review?date={day.date.isoformat()}',
        headers=_auth(token))
    return response.get_json()['review']['id']


class TestTomorrowGetsOnlyWhatIsLeft:
    def test_the_full_figure_bug_is_dead(self, client, db_session, admin_user,
                                         week):
        """12h job, 8h worked, nobody stated a remainder -> tomorrow books
        4.0h. It used to book 12.0 again."""
        plan, days = week
        job = _job(db_session, days[0], _machine(db_session))
        _worked(db_session, job, actual=8.0)
        token = _login(client, admin_user)

        response = _carry(client, token, _review(client, token, days[0]), job.id)

        assert response.status_code in (200, 201)
        body = response.get_json()
        new_job = db.session.get(WorkPlanJob, body['new_job']['id'])
        assert float(new_job.estimated_hours) == 4.0

    def test_the_workers_figure_beats_the_subtraction(self, client, db_session,
                                                      admin_user, week):
        """He opened the machine and found it worse: 8h worked, but 6h left."""
        plan, days = week
        job = _job(db_session, days[0], _machine(db_session))
        _worked(db_session, job, actual=8.0, remaining=6.0)
        token = _login(client, admin_user)

        response = _carry(client, token, _review(client, token, days[0]), job.id)

        new_job = db.session.get(WorkPlanJob, response.get_json()['new_job']['id'])
        assert float(new_job.estimated_hours) == 6.0

    def test_the_engineers_figure_beats_the_workers(self, client, db_session,
                                                    admin_user, week):
        plan, days = week
        job = _job(db_session, days[0], _machine(db_session))
        _worked(db_session, job, actual=8.0, remaining=6.0)
        token = _login(client, admin_user)

        response = _carry(client, token, _review(client, token, days[0]), job.id,
                          extra={'remaining_hours': 5.0})

        new_job = db.session.get(WorkPlanJob, response.get_json()['new_job']['id'])
        assert float(new_job.estimated_hours) == 5.0

    def test_a_job_never_started_carries_its_whole_estimate(self, client,
                                                            db_session,
                                                            admin_user, week):
        plan, days = week
        job = _job(db_session, days[0], _machine(db_session), hours=4.5)
        _worked(db_session, job, actual=None, status='not_started')
        token = _login(client, admin_user)

        response = _carry(client, token, _review(client, token, days[0]), job.id)

        new_job = db.session.get(WorkPlanJob, response.get_json()['new_job']['id'])
        assert float(new_job.estimated_hours) == 4.5


class TestMergeNeverDuplicate:
    def test_a_split_continuation_is_reused_not_doubled(self, client, db_session,
                                                        admin_user, week):
        """The plan already holds part 2/2 on Tuesday. Carrying Monday's
        unfinished part 1 must adjust THAT job — never sit a second RS110
        beside it."""
        plan, days = week
        rs = _machine(db_session)
        part1 = _job(db_session, days[0], rs, hours=8.0,
                     description='250HR SERVICE (part 1/2)')
        part2 = _job(db_session, days[1], rs, hours=4.0,
                     description='250HR SERVICE (part 2/2)', position=2)
        _worked(db_session, part1, actual=5.0, remaining=6.0)
        token = _login(client, admin_user)

        response = _carry(client, token, _review(client, token, days[0]), part1.id)

        body = response.get_json()
        assert body['merged_into_existing'] is True
        assert body['new_job']['id'] == part2.id
        db_session.session.refresh(part2)
        assert float(part2.estimated_hours) == 6.0
        same_order = WorkPlanJob.query.filter_by(
            sap_order_number='700000000300').count()
        assert same_order == 2, 'part1 + part2 — no third row'
        record = WorkPlanCarryOver.query.filter_by(original_job_id=part1.id).one()
        assert record.new_job_id == part2.id

    def test_a_worked_continuation_is_left_alone(self, client, db_session,
                                                 admin_user, week):
        """Somebody already started tomorrow's half — it is not a blank slate
        to overwrite. A fresh job is created instead."""
        plan, days = week
        rs = _machine(db_session)
        part1 = _job(db_session, days[0], rs, hours=8.0,
                     description='250HR SERVICE (part 1/2)')
        part2 = _job(db_session, days[1], rs, hours=4.0,
                     description='250HR SERVICE (part 2/2)', position=2)
        _worked(db_session, part1, actual=5.0, remaining=6.0)
        _worked(db_session, part2, actual=1.0, status='in_progress')
        token = _login(client, admin_user)

        response = _carry(client, token, _review(client, token, days[0]), part1.id)

        body = response.get_json()
        assert body['merged_into_existing'] is False
        assert body['new_job']['id'] != part2.id
        db_session.session.refresh(part2)
        assert float(part2.estimated_hours) == 4.0


class TestTheCarrySetsOffTheDomino:
    def _crew(self, db_session, size=2):
        from app.models.worker_assignment_rule import WorkerAssignmentRule
        men = []
        for i in range(size):
            man = User(email=f'dm{i}@t.iq', full_name=f'dm{i}', role='maintenance',
                       role_id=f'DMM{i:03d}', specialization='mechanical', shift='day')
            man.set_password('x')
            db_session.session.add(man)
            men.append(man)
        db_session.session.commit()
        db_session.session.add(WorkerAssignmentRule(
            berth='west', team_type='regular_pm', equipment_category='all',
            mech_count=2, elec_count=0,
            candidate_mech_workers=[m.id for m in men]))
        db_session.session.commit()

    def test_a_full_tuesday_slides_its_lamp_to_wednesday(self, client, db_session,
                                                         admin_user, week):
        """Monday's unfinished 4h land on Tuesday (14/16 used) — the low job
        moves, the chain comes back in the response."""
        plan, days = week
        self._crew(db_session)
        rs = _machine(db_session)
        job = _job(db_session, days[0], rs, hours=12.0)
        _worked(db_session, job, actual=8.0, remaining=4.0)
        keeper = _job(db_session, days[1], _machine(db_session, 'TT100'),
                      hours=4.0, number='700000000900',
                      description='TT100 pm')
        keeper.priority = 'high'
        lamp = _job(db_session, days[1], _machine(db_session, 'TT101'),
                    hours=3.0, number='700000000901', description='lamp')
        lamp.priority = 'low'
        db_session.session.commit()
        token = _login(client, admin_user)

        response = _carry(client, token, _review(client, token, days[0]), job.id)

        body = response.get_json()
        assert body['remaining_hours'] == 4.0
        assert len(body['ripple']) == 1
        assert body['ripple'][0]['job_id'] == lamp.id
        db_session.session.refresh(lamp)
        assert lamp.work_plan_day_id == days[2].id

    def test_dry_run_shows_the_chain_and_changes_nothing(self, client, db_session,
                                                         admin_user, week):
        plan, days = week
        self._crew(db_session)
        rs = _machine(db_session)
        job = _job(db_session, days[0], rs, hours=12.0)
        _worked(db_session, job, actual=8.0, remaining=4.0)
        keeper = _job(db_session, days[1], _machine(db_session, 'TT110'),
                      hours=4.0, number='700000000910')
        keeper.priority = 'high'
        lamp = _job(db_session, days[1], _machine(db_session, 'TT111'),
                    hours=3.0, number='700000000911')
        lamp.priority = 'low'
        db_session.session.commit()
        token = _login(client, admin_user)

        response = _carry(client, token, _review(client, token, days[0]), job.id,
                          extra={'dry_run': True})

        body = response.get_json()
        assert response.status_code == 200
        assert body['dry_run'] is True
        assert len(body['ripple']) == 1
        db_session.session.refresh(lamp)
        assert lamp.work_plan_day_id == days[1].id      # nothing moved
        assert WorkPlanCarryOver.query.count() == 0     # nothing created


class TestTheDominoCountsTheRightCrew:
    """Man-hours = hours x crew, and the crew that matters is the crew of the
    job the day will actually be CHARGED for.

    On a merge that is the CONTINUATION's crew, not the carried job's. A split
    PM can be two men on part 1/2 and three on part 2/2 — count part 1's gang
    and the domino is asked to free 4 man-hours when the day needs 6, so it
    frees nothing, and Tuesday quietly runs 26 of 24 with a low-priority lamp
    sitting right there, free to move. Found in the Plan 2 scenario run.
    """

    def _crew(self, db_session, size=3):
        from app.models.worker_assignment_rule import WorkerAssignmentRule
        men = []
        for i in range(size):
            man = User(email=f'cc{i}@t.iq', full_name=f'cc{i}',
                       role='maintenance', role_id=f'CCM{i:03d}',
                       specialization='mechanical', shift='day')
            man.set_password('x')
            db_session.session.add(man)
            men.append(man)
        db_session.session.commit()
        db_session.session.add(WorkerAssignmentRule(
            berth='west', team_type='regular_pm', equipment_category='all',
            mech_count=2, elec_count=0,
            candidate_mech_workers=[m.id for m in men]))
        db_session.session.commit()
        return men

    def _assign(self, db_session, job, men):
        from app.models import WorkPlanAssignment
        for man in men:
            db_session.session.add(WorkPlanAssignment(
                work_plan_job_id=job.id, user_id=man.id))
        db_session.session.commit()

    def test_a_merge_is_priced_by_the_continuations_own_crew(
            self, client, db_session, admin_user, week):
        """3 west PM men = 24 man-hours on Tuesday.

        Tuesday holds part 2/2 (4h x 3 men = 12), a high job (2h x 2 = 4) and
        a lamp (2h x 2 = 4) — 20 of 24. Monday's part 1/2 is worked by TWO men
        and 6h are left. The merge makes part 2/2 6h x 3 = 18, so Tuesday
        wants 26. The lamp must move.
        """
        plan, days = week
        men = self._crew(db_session, size=3)
        rs = _machine(db_session)

        part1 = _job(db_session, days[0], rs, hours=8.0,
                     description='250HR SERVICE (part 1/2)')
        self._assign(db_session, part1, men[:2])           # two men
        part2 = _job(db_session, days[1], rs, hours=4.0, position=2,
                     description='250HR SERVICE (part 2/2)')
        self._assign(db_session, part2, men[:3])           # three men

        keeper = _job(db_session, days[1], _machine(db_session, 'TT120'),
                      hours=2.0, number='700000000920',
                      description='TT120 pm', position=3)
        keeper.priority = 'high'
        lamp = _job(db_session, days[1], _machine(db_session, 'TT121'),
                    hours=2.0, number='700000000921',
                    description='TT121 lamp', position=4)
        lamp.priority = 'low'
        db_session.session.commit()

        _worked(db_session, part1, actual=2.0, remaining=6.0)
        token = _login(client, admin_user)

        response = _carry(client, token, _review(client, token, days[0]),
                          part1.id)

        body = response.get_json()
        assert body['merged_into_existing'] is True
        assert float(body['remaining_hours']) == 6.0
        assert [m['job_id'] for m in body['ripple']] == [lamp.id], (
            'the lamp had to move — the day was priced with the wrong crew')
        db_session.session.refresh(lamp)
        assert lamp.work_plan_day_id == days[2].id
        db_session.session.refresh(part2)
        assert part2.work_plan_day_id == days[1].id
        assert float(part2.estimated_hours) == 6.0
