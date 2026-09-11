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


class TestOnlyOrdersTheAppKnows:
    """The first real run imported 100x more than anyone can ever open.

    56,941 operations across 19,375 orders — the whole year-to-date export —
    while the pool held 183. It added 6m23s to a 3m43s sync and would have
    re-written every row nightly. An order that is neither in the pool nor on a
    plan has no screen to appear on.
    """

    def test_an_unknown_order_is_skipped(self, db_session, admin_user, plan_day):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPS20', 'SO20')
        _job(plan, day, eq, order='700000123456')     # the app knows THIS one

        operations = dict(_operations('700000123456'))
        operations['700000555555'] = [                # closed months ago
            {'operation_number': '0010', 'description': 'Ancient history',
             'work_center': 'MECH', 'planned_hours': 1.0},
        ]

        counts = sync_order_operations(operations)
        assert counts['added'] == 3, 'only the known order was stored'
        assert counts['skipped_unknown_orders'] == 1
        assert WorkPlanJobTask.query.filter_by(anchor_key='700000555555').count() == 0

    def test_an_order_still_in_the_pool_counts_as_known(self, db_session,
                                                        admin_user, plan_day):
        """Not yet planned is not the same as not wanted."""
        from app.models import SAPWorkOrder
        from app.services.sap_pool_sync import sync_order_operations
        eq = make_equipment(db_session, 'OPS21', 'SO21')
        db.session.add(SAPWorkOrder(work_plan_id=None, order_number='700000123456',
                                    order_type='PRM', job_type='pm',
                                    equipment_id=eq.id, estimated_hours=9.0,
                                    priority='normal', status='pending'))
        db.session.commit()

        counts = sync_order_operations(_operations())
        assert counts['added'] == 3


class TestCleaningUpTheFirstRun:
    """The first production import stored 56,941 rows; 1,560 are reachable.

    It ran before the scope filter, so it kept operations for every order in the
    year-to-date export. The filter stops new ones but cannot reach those — the
    sync now skips those orders entirely, so nothing will ever update or delete
    them. 55,381 rows would sit there forever.

    The danger in a cleanup like this is deleting the wrong thing, so these tests
    are mostly about what it must NOT touch.
    """

    def _orphan(self, order='700000555555', **kwargs):
        row = WorkPlanJobTask(anchor_kind='sap', anchor_key=order, source='sap',
                              operation_number='0010', content='Ancient history',
                              created_by_id=1, **kwargs)
        db.session.add(row)
        db.session.commit()
        return row

    def test_an_unreachable_operation_is_offered_for_removal(self, db_session,
                                                             admin_user):
        from app.services.sap_pool_sync import find_orphan_operations
        self._orphan()
        safe, kept = find_orphan_operations(known_orders={'700000123456'})
        assert len(safe) == 1
        assert kept == []

    def test_an_order_the_app_knows_is_never_offered(self, db_session, admin_user):
        from app.services.sap_pool_sync import find_orphan_operations
        self._orphan(order='700000123456')
        safe, kept = find_orphan_operations(known_orders={'700000123456'})
        assert safe == [] and kept == []

    def test_an_operation_with_work_on_it_is_kept(self, db_session, admin_user):
        """Evidence that work happened outlives the order leaving the pool."""
        from datetime import datetime
        from app.services.sap_pool_sync import find_orphan_operations
        self._orphan(started_at=datetime.utcnow())
        safe, kept = find_orphan_operations(known_orders={'700000123456'})
        assert safe == [] and len(kept) == 1

    def test_a_finished_operation_is_kept(self, db_session, admin_user):
        from app.services.sap_pool_sync import find_orphan_operations
        self._orphan(is_done=True)
        safe, kept = find_orphan_operations(known_orders={'700000123456'})
        assert safe == [] and len(kept) == 1

    def test_a_hand_typed_line_is_never_touched(self, db_session, admin_user):
        """Ali's notes, photos and voice live in this same table.

        This is the one that would hurt: a cleanup that swept his own work away
        while removing SAP's leftovers.
        """
        from app.services.sap_pool_sync import find_orphan_operations
        db.session.add(WorkPlanJobTask(
            anchor_kind='sap', anchor_key='700000555555', source='manual',
            content='Bring the 32mm socket', created_by_id=1))
        db.session.commit()
        safe, kept = find_orphan_operations(known_orders={'700000123456'})
        assert safe == [] and kept == []


class TestTheFastCleanupPicksTheSameRows:
    """The safety rules were rewritten as a WHERE clause. They must not drift.

    The first cleanup loaded every row as an object and deleted one at a time —
    a round trip per row. On production it removed 2,500 of 55,381 before the
    Render shell gave up, and its progress line read as if it had finished.

    The rewrite is one DELETE per batch. These tests pin that the SQL picks
    EXACTLY what the object version picked, because a filter that is right in
    Python and subtly wrong in SQL deletes the wrong rows quietly.
    """

    def _rows(self, admin_user):
        from datetime import datetime
        rows = [
            # unreachable, untouched -> removable
            WorkPlanJobTask(anchor_kind='sap', anchor_key='700000555555',
                            source='sap', operation_number='0010',
                            content='Ancient history', created_by_id=admin_user.id),
            # unreachable but STARTED -> keep
            WorkPlanJobTask(anchor_kind='sap', anchor_key='700000555555',
                            source='sap', operation_number='0020',
                            content='Started once', created_by_id=admin_user.id,
                            started_at=datetime.utcnow()),
            # unreachable but DONE -> keep
            WorkPlanJobTask(anchor_kind='sap', anchor_key='700000555555',
                            source='sap', operation_number='0030',
                            content='Finished', created_by_id=admin_user.id,
                            is_done=True),
            # unreachable but has real hours -> keep
            WorkPlanJobTask(anchor_kind='sap', anchor_key='700000555555',
                            source='sap', operation_number='0040',
                            content='Hours logged', created_by_id=admin_user.id,
                            actual_hours=1.5),
            # a KNOWN order -> keep
            WorkPlanJobTask(anchor_kind='sap', anchor_key='700000123456',
                            source='sap', operation_number='0010',
                            content='Still planned', created_by_id=admin_user.id),
            # Ali typed this -> never touch
            WorkPlanJobTask(anchor_kind='sap', anchor_key='700000555555',
                            source='manual', content='Bring the 32mm socket',
                            created_by_id=admin_user.id),
        ]
        db.session.add_all(rows)
        db.session.commit()
        return rows

    def test_sql_and_object_selection_agree(self, db_session, admin_user):
        from app.services.sap_pool_sync import (find_orphan_operations,
                                                orphan_operation_ids)
        self._rows(admin_user)
        known = {'700000123456'}

        safe, _kept = find_orphan_operations(known_orders=known)
        ids = orphan_operation_ids(known_orders=known)

        assert sorted(ids) == sorted(r.id for r in safe), \
            'the fast path picks different rows from the careful one'
        assert len(ids) == 1, 'only the untouched, unreachable operation'

    def test_the_delete_removes_only_those(self, db_session, admin_user):
        from app.services.sap_pool_sync import (orphan_operation_ids,
                                                delete_operation_rows)
        self._rows(admin_user)
        known = {'700000123456'}

        before = WorkPlanJobTask.query.count()
        removed = delete_operation_rows(orphan_operation_ids(known_orders=known),
                                       batch_size=2)
        assert removed == 1
        assert WorkPlanJobTask.query.count() == before - 1

        # Everything protected is still there, by name.
        remaining = {r.content for r in WorkPlanJobTask.query.all()}
        assert 'Bring the 32mm socket' in remaining, 'a hand-typed line was deleted'
        assert 'Started once' in remaining
        assert 'Finished' in remaining
        assert 'Hours logged' in remaining
        assert 'Still planned' in remaining
        assert 'Ancient history' not in remaining

    def test_batching_commits_as_it_goes(self, db_session, admin_user):
        """An interrupted cleanup must be a SHORTER cleanup, not a lost one."""
        from app.services.sap_pool_sync import (orphan_operation_ids,
                                                delete_operation_rows)
        for index in range(7):
            db.session.add(WorkPlanJobTask(
                anchor_kind='sap', anchor_key='700000555555', source='sap',
                operation_number=f'{index:04d}', content=f'op {index}',
                created_by_id=admin_user.id))
        db.session.commit()

        seen = []
        delete_operation_rows(orphan_operation_ids(known_orders={'x'}),
                              batch_size=3, on_progress=lambda d, t: seen.append(d))
        assert seen == [3, 6, 7], 'progress must be the count DONE, not the total'
        assert WorkPlanJobTask.query.count() == 0


class TestWaitingOnMaterial:
    """Ali, 2026-09-11: "PR means that this order waiting a material under
    purchase order".

    IW49 carries the requisition on the OPERATION, so the man is told which LINE
    is blocked — instead of reading (PR) off a ten-hour order and guessing which
    half of it he can start today.
    """

    def test_the_requisition_reaches_the_worker(self, client, admin_user,
                                                db_session, plan_day):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPS22', 'SO22')
        job = _job(plan, day, eq)
        sync_order_operations({'700000123456': [
            {'operation_number': '0010', 'description': 'Check the spreader',
             'work_center': 'MECH', 'planned_hours': 2.0,
             'purchase_requisition': None, 'material_text': None},
            {'operation_number': '0020', 'description': 'Replace harness',
             'work_center': 'ELEC', 'planned_hours': 3.0,
             'purchase_requisition': '10045567', 'material_text': 'HARNESS ASSY'},
        ]})

        tasks = client.get(f'/api/work-plans/jobs/{job.id}/tasks',
                           headers=_headers(client, admin_user)).get_json()['tasks']
        first, second = tasks
        assert first['waiting_on_material'] is False
        assert second['waiting_on_material'] is True
        assert second['purchase_requisition'] == '10045567'
        assert second['material_text'] == 'HARNESS ASSY'

    def test_a_part_arriving_clears_the_block(self, db_session, admin_user,
                                              plan_day):
        """A stale requisition leaves a man waiting for something on the shelf."""
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPS23', 'SO23')
        _job(plan, day, eq)
        sync_order_operations({'700000123456': [
            {'operation_number': '0010', 'description': 'Replace harness',
             'work_center': 'ELEC', 'planned_hours': 3.0,
             'purchase_requisition': '10045567', 'material_text': 'HARNESS ASSY'},
        ]})
        row = WorkPlanJobTask.query.filter_by(operation_number='0010').first()
        assert row.purchase_requisition == '10045567'

        # Next file: the part has arrived, SAP drops the requisition.
        sync_order_operations({'700000123456': [
            {'operation_number': '0010', 'description': 'Replace harness',
             'work_center': 'ELEC', 'planned_hours': 3.0,
             'purchase_requisition': None, 'material_text': None},
        ]})
        db.session.refresh(row)
        assert row.purchase_requisition is None, 'the man is still told to wait'


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
