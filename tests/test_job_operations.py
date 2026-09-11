"""Operations inside an order: one timer each, and a re-sync that cannot undo work.

Ali, 2026-09-10: "inside a general refurbishment order you can check the
spreader, replace or repair harness, open telescopic chain, and many jobs ...
user should see the operations inside the order and he can deal with each same as
he deal with the order i mean a order with many operations he should do 1 by 1".

Ali, 2026-09-11, choosing per-operation start/stop over a simple tick, and a
split by work centre so the mechanical team sees its lines and the electrical
team sees its own.

WHY THE ORDER'S OWN TIMER IS NOT WRITTEN HERE
=============================================

`work_plan_job_trackings.work_plan_job_id` is UNIQUE — one timer per job, by
database constraint — and carry-over, the day ripple, the Telegram finish button
and /my-plan all read it. So the order's state is DERIVED from its operations
rather than tracked a second time. Two truths about whether an order is under way
would drift apart inside a week.
"""

from datetime import date, timedelta

import pytest

from tests.conftest import get_auth_header, make_equipment
from app.extensions import db
from app.models import WorkPlan, WorkPlanDay, WorkPlanJob, WorkPlanJobTask
from app.models.work_plan_assignment import WorkPlanAssignment


@pytest.fixture
def worker(db_session):
    from app.models import User
    user = User(email='opsworker@test.com', full_name='Ops Worker',
                role='maintenance', role_id='MNT900', shift='day')
    user.set_password('test123')
    db.session.add(user)
    db.session.commit()
    return user


@pytest.fixture
def plan_day(db_session, admin_user):
    start = date.today()
    plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                    status='draft', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=start)
    db_session.session.add(day)
    db_session.session.commit()
    return plan, day


def _job(plan, day, equipment, order='700000123456'):
    job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm',
                      equipment_id=equipment.id, sap_order_number=order,
                      description='GENERAL REFURBISHMENT',
                      estimated_hours=9, position=1)
    db.session.add(job)
    db.session.commit()
    return job


def _operations(order='700000123456'):
    return {order: [
        {'operation_number': '0010', 'description': 'Check the spreader',
         'work_center': 'MECH', 'planned_hours': 2.0},
        {'operation_number': '0020', 'description': 'Replace harness',
         'work_center': 'ELEC', 'planned_hours': 3.0},
        {'operation_number': '0030', 'description': 'Open telescopic chain',
         'work_center': 'MECH', 'planned_hours': 4.0},
    ]}


def _headers(client, admin_user):
    return get_auth_header(client, admin_user.email, 'admin123')


class TestTheOperationsArrive:

    def test_a_sync_puts_them_on_the_order(self, client, admin_user, db_session,
                                           plan_day):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPS01', 'SO01')
        job = _job(plan, day, eq)

        counts = sync_order_operations(_operations())
        assert counts['added'] == 3

        resp = client.get(f'/api/work-plans/jobs/{job.id}/tasks',
                          headers=_headers(client, admin_user))
        tasks = resp.get_json()['tasks']
        assert [t['operation_number'] for t in tasks] == ['0010', '0020', '0030']
        assert [t['content'] for t in tasks] == [
            'Check the spreader', 'Replace harness', 'Open telescopic chain']
        assert [t['work_center'] for t in tasks] == ['MECH', 'ELEC', 'MECH']
        assert [t['planned_hours'] for t in tasks] == [2.0, 3.0, 4.0]
        assert all(t['source'] == 'sap' for t in tasks)

    def test_they_survive_the_order_going_back_to_the_pool(
            self, client, admin_user, db_session, plan_day):
        """Same guarantee the hand-written lines already had."""
        from app.api.work_plans import purge_job_rows
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPS02', 'SO02')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())

        purge_job_rows(job)
        db.session.commit()
        assert WorkPlanJobTask.query.count() == 3, 'the operations went with the row'

        again = _job(plan, day, eq)
        resp = client.get(f'/api/work-plans/jobs/{again.id}/tasks',
                          headers=_headers(client, admin_user))
        assert len(resp.get_json()['tasks']) == 3

    def test_a_hand_typed_line_sits_beside_them(self, client, admin_user,
                                                db_session, plan_day):
        """Ali asked what happens to operations he adds himself. They coexist."""
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPS03', 'SO03')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())

        headers = _headers(client, admin_user)
        client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                    json={'content': 'Bring the 32mm socket'}, headers=headers)

        tasks = client.get(f'/api/work-plans/jobs/{job.id}/tasks',
                           headers=headers).get_json()['tasks']
        sources = sorted(t['source'] for t in tasks)
        assert sources == ['manual', 'sap', 'sap', 'sap']


class TestARefreshCannotUndoWork:
    """The single most destructive thing this feature could do."""

    def test_a_finished_operation_stays_finished(self, client, admin_user,
                                                 db_session, plan_day):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPS04', 'SO04')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())

        headers = _headers(client, admin_user)
        first = WorkPlanJobTask.query.filter_by(operation_number='0010').first()
        client.post(f'/api/work-plans/jobs/{job.id}/tasks/{first.id}/timer',
                    json={'action': 'start'}, headers=headers)
        client.post(f'/api/work-plans/jobs/{job.id}/tasks/{first.id}/timer',
                    json={'action': 'finish'}, headers=headers)

        # Tuesday's file lands, with the text slightly changed.
        changed = _operations()
        changed['700000123456'][0]['description'] = 'Check spreader and pins'
        sync_order_operations(changed)

        db.session.refresh(first)
        assert first.is_done is True, 'a file refresh un-did a finished operation'
        assert first.status == 'completed'
        assert first.content == 'Check spreader and pins', 'the text should refresh'

    def test_an_operation_sap_drops_is_kept_when_work_was_done_on_it(
            self, client, admin_user, db_session, plan_day):
        """Deleting it would erase the record that the work happened."""
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPS05', 'SO05')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())

        headers = _headers(client, admin_user)
        third = WorkPlanJobTask.query.filter_by(operation_number='0030').first()
        client.post(f'/api/work-plans/jobs/{job.id}/tasks/{third.id}/timer',
                    json={'action': 'start'}, headers=headers)

        shrunk = {'700000123456': _operations()['700000123456'][:2]}
        counts = sync_order_operations(shrunk)

        assert counts['kept_but_gone_from_sap'] == 1
        db.session.refresh(third)
        assert third.status == 'removed_in_sap'

    def test_an_untouched_operation_sap_drops_is_removed(self, db_session,
                                                         admin_user, plan_day):
        """Nobody worked on it and SAP no longer sends it — it is not the job."""
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPS06', 'SO06')
        _job(plan, day, eq)
        sync_order_operations(_operations())

        shrunk = {'700000123456': _operations()['700000123456'][:2]}
        counts = sync_order_operations(shrunk)
        assert counts['removed'] == 1
        assert WorkPlanJobTask.query.count() == 2


class TestOneByOne:
    """Ali: "he should do 1 by 1"."""

    def _started(self, client, admin_user, db_session, plan_day, serial='OPS07'):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, serial, 'S' + serial[-3:])
        job = _job(plan, day, eq)
        sync_order_operations(_operations())
        return job, _headers(client, admin_user)

    def test_start_pause_resume_finish(self, client, admin_user, db_session,
                                       plan_day):
        job, headers = self._started(client, admin_user, db_session, plan_day)
        op = WorkPlanJobTask.query.filter_by(operation_number='0020').first()
        url = f'/api/work-plans/jobs/{job.id}/tasks/{op.id}/timer'

        assert client.post(url, json={'action': 'start'}, headers=headers).status_code == 200
        db.session.refresh(op)
        assert op.status == 'in_progress' and op.started_at is not None

        assert client.post(url, json={'action': 'pause'}, headers=headers).status_code == 200
        db.session.refresh(op)
        assert op.status == 'paused'

        assert client.post(url, json={'action': 'resume'}, headers=headers).status_code == 200
        db.session.refresh(op)
        assert op.status == 'in_progress'

        resp = client.post(url, json={'action': 'finish'}, headers=headers)
        assert resp.status_code == 200
        db.session.refresh(op)
        assert op.status == 'completed' and op.is_done is True
        assert op.actual_hours is not None

    def test_the_other_operations_are_untouched(self, client, admin_user,
                                                db_session, plan_day):
        """One by one means ONE. Finishing 0010 must not finish 0020."""
        job, headers = self._started(client, admin_user, db_session, plan_day,
                                     'OPS08')
        first = WorkPlanJobTask.query.filter_by(operation_number='0010').first()
        url = f'/api/work-plans/jobs/{job.id}/tasks/{first.id}/timer'
        client.post(url, json={'action': 'start'}, headers=headers)
        client.post(url, json={'action': 'finish'}, headers=headers)

        others = WorkPlanJobTask.query.filter(
            WorkPlanJobTask.operation_number != '0010').all()
        assert all(not o.is_done for o in others)
        assert all(o.started_at is None for o in others)

    def test_finishing_one_never_started_still_records_it(self, client, admin_user,
                                                          db_session, plan_day):
        """A man does the work and remembers the app afterwards."""
        job, headers = self._started(client, admin_user, db_session, plan_day,
                                     'OPS09')
        op = WorkPlanJobTask.query.filter_by(operation_number='0030').first()
        resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks/{op.id}/timer',
                           json={'action': 'finish'}, headers=headers)
        assert resp.status_code == 200
        db.session.refresh(op)
        assert op.is_done is True
        assert float(op.actual_hours) == pytest.approx(0.0, abs=0.02)

    def test_nonsense_transitions_are_refused(self, client, admin_user,
                                              db_session, plan_day):
        job, headers = self._started(client, admin_user, db_session, plan_day,
                                     'OPS10')
        op = WorkPlanJobTask.query.filter_by(operation_number='0010').first()
        url = f'/api/work-plans/jobs/{job.id}/tasks/{op.id}/timer'
        assert client.post(url, json={'action': 'pause'}, headers=headers).status_code == 400
        client.post(url, json={'action': 'start'}, headers=headers)
        assert client.post(url, json={'action': 'start'}, headers=headers).status_code == 400

    def test_a_stranger_cannot_run_the_timer(self, client, admin_user, worker,
                                             db_session, plan_day):
        """Same rule as ticking: the assigned team, engineers and admins."""
        job, headers = self._started(client, admin_user, db_session, plan_day,
                                     'OPS11')
        op = WorkPlanJobTask.query.filter_by(operation_number='0010').first()
        resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks/{op.id}/timer',
                           json={'action': 'start'},
                           headers=get_auth_header(client, 'opsworker@test.com', 'test123'))
        assert resp.status_code == 403

    def test_an_assigned_worker_can(self, client, admin_user, worker, db_session,
                                    plan_day):
        job, headers = self._started(client, admin_user, db_session, plan_day,
                                     'OPS12')
        db.session.add(WorkPlanAssignment(work_plan_job_id=job.id, user_id=worker.id))
        db.session.commit()
        op = WorkPlanJobTask.query.filter_by(operation_number='0010').first()
        resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks/{op.id}/timer',
                           json={'action': 'start'},
                           headers=get_auth_header(client, 'opsworker@test.com', 'test123'))
        assert resp.status_code == 200


class TestTheOrderStateIsDerived:
    """Never stored twice — see the module docstring."""

    def test_progress_reflects_the_operations(self, client, admin_user,
                                              db_session, plan_day):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPS13', 'SO13')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())
        headers = _headers(client, admin_user)

        body = client.get(f'/api/work-plans/jobs/{job.id}/tasks',
                          headers=headers).get_json()
        progress = body['operations_progress']
        assert progress['total'] == 3
        assert progress['done'] == 0
        assert progress['is_started'] is False
        assert progress['planned_hours'] == pytest.approx(9.0)
        assert progress['remaining_hours'] == pytest.approx(9.0)

        op = WorkPlanJobTask.query.filter_by(operation_number='0010').first()
        url = f'/api/work-plans/jobs/{job.id}/tasks/{op.id}/timer'
        client.post(url, json={'action': 'start'}, headers=headers)

        progress = client.get(f'/api/work-plans/jobs/{job.id}/tasks',
                              headers=headers).get_json()['operations_progress']
        assert progress['is_started'] is True, 'one operation started IS the order started'
        assert progress['running'] == 1

        client.post(url, json={'action': 'finish'}, headers=headers)
        progress = client.get(f'/api/work-plans/jobs/{job.id}/tasks',
                              headers=headers).get_json()['operations_progress']
        assert progress['done'] == 1
        assert progress['all_done'] is False
        assert progress['remaining_hours'] == pytest.approx(7.0), \
            'remaining is what is still UNDONE, not the whole order'

    def test_a_job_with_no_operations_reports_none(self, client, admin_user,
                                                   db_session, plan_day):
        """The plain sub-task case must not grow a progress bar."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPS14', 'SO14')
        job = _job(plan, day, eq, order='700000999999')
        headers = _headers(client, admin_user)
        client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                    json={'content': 'Just a note'}, headers=headers)

        body = client.get(f'/api/work-plans/jobs/{job.id}/tasks',
                          headers=headers).get_json()
        assert body['operations_progress'] is None
