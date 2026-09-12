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


class TestAMixedOrderReachesBothTeams:
    """Ali, 2026-09-11: "what if i have mechanical and electrical operation".

    A job sits in a team's column by its OWN work_center. Nothing reconciled that
    with the operations inside it, so an order SAP labels MECH containing one
    electrical operation appeared ONLY under the mechanical team — and the
    electrician never saw the line he was supposed to do.
    """

    def test_a_sync_widens_a_mech_order_holding_elec_work(self, db_session,
                                                          admin_user, plan_day):
        from app.models import SAPWorkOrder
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'MIX01', 'SX01')
        job = _job(plan, day, eq)
        job.work_center = 'MECH'
        db.session.add(SAPWorkOrder(work_plan_id=None, order_number='700000123456',
                                    order_type='PRM', job_type='pm',
                                    equipment_id=eq.id, estimated_hours=9.0,
                                    priority='normal', status='pending',
                                    work_center='MECH'))
        db.session.commit()

        sync_order_operations(_operations())      # 0010 MECH, 0020 ELEC, 0030 MECH

        db.session.refresh(job)
        assert job.work_center == 'ELME', \
            'the electrical team cannot see this order'
        order = SAPWorkOrder.query.filter_by(order_number='700000123456').first()
        assert order.work_center == 'ELME', 'the pool still hides it from them'

    def test_a_disagreement_reaches_both_crews_rather_than_picking_a_winner(
            self, db_session, admin_user, plan_day):
        """The order says ELEC; every operation in it is mechanical.

        The first version of this rule left the label alone, so the MECHANIC —
        the only man who can do the work — never saw the job. Widening to ELME
        shows it to both crews, which is strictly better: it takes nothing away
        from the electrical team and gives the work to the men who must do it.

        It still does not RE-LABEL. Turning this order into MECH would be
        overruling SAP about its own order; making it visible to one more crew
        is not the same claim.
        """
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'MIX02', 'SX02')
        job = _job(plan, day, eq, order='700000444000')
        job.work_center = 'ELEC'
        db.session.commit()

        sync_order_operations({'700000444000': [
            {'operation_number': '0010', 'description': 'All mechanical',
             'work_center': 'MECH', 'planned_hours': 2.0},
        ]})

        db.session.refresh(job)
        assert job.work_center == 'ELME', 'the mechanic still cannot see it'

    def test_a_label_that_already_agrees_is_untouched(self, db_session,
                                                      admin_user, plan_day):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'MIX05', 'SX05')
        job = _job(plan, day, eq, order='700000446000')
        job.work_center = 'MECH'
        db.session.commit()

        sync_order_operations({'700000446000': [
            {'operation_number': '0010', 'description': 'Mechanical',
             'work_center': 'MECH', 'planned_hours': 2.0},
        ]})
        db.session.refresh(job)
        assert job.work_center == 'MECH'

    def test_an_unlabelled_order_takes_the_trade_from_its_operations(
            self, db_session, admin_user, plan_day):
        """195 of 196 pool orders have NO work centre — IW39 does not fill it.

        The operations do, which makes IW49 a better source of trade than IW39.
        """
        from app.models import SAPWorkOrder
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'MIX06', 'SX06')
        job = _job(plan, day, eq, order='700000447000')
        job.work_center = None
        db.session.add(SAPWorkOrder(work_plan_id=None, order_number='700000447000',
                                    order_type='PRM', job_type='pm',
                                    equipment_id=eq.id, estimated_hours=4.0,
                                    priority='normal', status='pending',
                                    work_center=None))
        db.session.commit()

        sync_order_operations({'700000447000': [
            {'operation_number': '0010', 'description': 'Electrical',
             'work_center': 'ELEC', 'planned_hours': 2.0},
        ]})

        db.session.refresh(job)
        assert job.work_center == 'ELEC', 'the order stayed trade-less'
        order = SAPWorkOrder.query.filter_by(order_number='700000447000').first()
        assert order.work_center == 'ELEC', 'the pool still cannot sort it'

    def test_supervision_alone_never_gives_an_order_a_trade(
            self, db_session, admin_user, plan_day):
        """Ali, 2026-09-12: "supv is supervision, yes shown to everyone".

        685 of 1,560 operations are MES-SUPV — the largest group. Letting it
        count as a trade would label most of the yard wrongly.
        """
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'MIX07', 'SX07')
        job = _job(plan, day, eq, order='700000448000')
        job.work_center = None
        db.session.commit()

        sync_order_operations({'700000448000': [
            {'operation_number': '0010', 'description': 'Supervise',
             'work_center': 'SUPV', 'planned_hours': 1.0},
        ]})
        db.session.refresh(job)
        assert job.work_center is None, 'supervision was treated as a trade'

    def test_adding_an_elec_operation_by_hand_widens_it_too(
            self, client, admin_user, db_session, plan_day):
        """The man who has to do the line Ali just wrote must be able to see it."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'MIX03', 'SX03')
        job = _job(plan, day, eq, order='700000555000')
        job.work_center = 'MECH'
        db.session.commit()
        headers = _headers(client, admin_user)

        client.post(f'/api/work-plans/jobs/{job.id}/tasks', headers=headers,
                    json={'content': 'Mechanical line', 'operation_number': '0900',
                          'work_center': 'MECH'})
        db.session.refresh(job)
        assert job.work_center == 'MECH', 'one trade should change nothing'

        client.post(f'/api/work-plans/jobs/{job.id}/tasks', headers=headers,
                    json={'content': 'Rewire the panel', 'operation_number': '0910',
                          'work_center': 'ELEC'})
        db.session.refresh(job)
        assert job.work_center == 'ELME', 'the electrician still cannot see it'

    def test_an_order_already_marked_both_is_untouched(self, db_session,
                                                       admin_user, plan_day):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'MIX04', 'SX04')
        job = _job(plan, day, eq)
        job.work_center = 'ELME'
        db.session.commit()

        counts = sync_order_operations(_operations())
        assert counts.get('widened_to_both_trades', 0) == 0, 'it changed what was already right'


class TestAnOperationAliAddsHimself:
    """Ali, 2026-09-10: "what will happen with the operation added manually".

    The answer is: nothing different. Give a line an operation number and it
    joins the operations list, gets its own start/pause/finish, and counts
    towards the order's progress exactly like a SAP one. `source` stays 'manual'
    so a re-sync never touches it — SAP does not know it exists.
    """

    def test_it_appears_beside_sap_operations(self, client, admin_user,
                                              db_session, plan_day):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'MAN01', 'SM01')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())
        headers = _headers(client, admin_user)

        resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks', headers=headers,
                           json={'content': 'Grease the boom pins',
                                 'operation_number': '0900',
                                 'planned_hours': 1.5, 'work_center': 'MECH'})
        assert resp.status_code == 201, resp.get_json()

        task = resp.get_json()['task']
        assert task['source'] == 'manual', 'a re-sync must never own this'
        assert task['operation_number'] == '0900'
        assert task['planned_hours'] == 1.5
        assert task['status'] == 'pending'

        progress = resp.get_json()['operations_progress']
        assert progress['total'] == 4, 'it counts with SAP\'s three'
        assert progress['planned_hours'] == pytest.approx(10.5)

    def test_it_has_its_own_timer(self, client, admin_user, db_session, plan_day):
        plan, day = plan_day
        eq = make_equipment(db_session, 'MAN02', 'SM02')
        job = _job(plan, day, eq)
        headers = _headers(client, admin_user)
        made = client.post(f'/api/work-plans/jobs/{job.id}/tasks', headers=headers,
                           json={'content': 'Open the telescopic chain',
                                 'operation_number': '0910'}).get_json()['task']

        url = f"/api/work-plans/jobs/{job.id}/tasks/{made['id']}/timer"
        assert client.post(url, json={'action': 'start'}, headers=headers).status_code == 200
        assert client.post(url, json={'action': 'finish'}, headers=headers).status_code == 200

        row = db.session.get(WorkPlanJobTask, made['id'])
        assert row.is_done is True and row.actual_hours is not None

    def test_a_resync_leaves_it_alone(self, client, admin_user, db_session,
                                      plan_day):
        """SAP does not know it exists, so SAP must not be able to remove it."""
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'MAN03', 'SM03')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())
        headers = _headers(client, admin_user)
        client.post(f'/api/work-plans/jobs/{job.id}/tasks', headers=headers,
                    json={'content': 'Mine', 'operation_number': '0920'})

        sync_order_operations(_operations())      # the file lands again

        mine = WorkPlanJobTask.query.filter_by(operation_number='0920').first()
        assert mine is not None, 'a re-sync deleted a hand-added operation'
        assert mine.content == 'Mine'

    def test_it_cannot_steal_a_number_sap_uses(self, client, admin_user,
                                               db_session, plan_day):
        """Otherwise a re-sync overwrites his line, or his shadows SAP's."""
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'MAN04', 'SM04')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())

        resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                           headers=_headers(client, admin_user),
                           json={'content': 'Clash', 'operation_number': '0010'})
        assert resp.status_code == 400

    def test_a_worker_cannot_add_one(self, client, admin_user, worker,
                                     db_session, plan_day):
        """Workers add evidence. Deciding what the work IS stays with the planner."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'MAN05', 'SM05')
        job = _job(plan, day, eq)
        db.session.add(WorkPlanAssignment(work_plan_job_id=job.id, user_id=worker.id))
        db.session.commit()

        resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                           headers=get_auth_header(client, 'opsworker@test.com', 'test123'),
                           json={'content': 'Mine', 'operation_number': '0930'})
        assert resp.status_code == 403


class TestMediaOnOneOperation:
    """Ali, 2026-09-11: "yes photo and voice too".

    A ten-hour refurbishment has one photo of the whole machine and a different
    one of the cracked glass on operation 0020. Hanging both at job level loses
    which is which.
    """

    def _photo(self, db_session, user, name='crack.jpg'):
        from app.models import File
        f = File(original_filename=name, stored_filename=f'{user.id}-{name}',
                 file_path=f'https://res.cloudinary.com/demo/{name}',
                 file_size=1024, mime_type='image/jpeg', uploaded_by=user.id)
        db.session.add(f)
        db.session.commit()
        return f

    def test_a_photo_hangs_on_the_operation_not_the_job(self, client, admin_user,
                                                        db_session, plan_day):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'MED01', 'SD01')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())
        headers = _headers(client, admin_user)

        operation = WorkPlanJobTask.query.filter_by(operation_number='0020').first()
        photo = self._photo(db_session, admin_user)

        resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks', headers=headers,
                           json={'attachment_file_id': photo.id,
                                 'attachment_kind': 'photo',
                                 'parent_task_id': operation.id})
        assert resp.status_code == 201, resp.get_json()
        assert resp.get_json()['task']['parent_task_id'] == operation.id

    def test_media_must_name_a_real_operation(self, client, admin_user,
                                              db_session, plan_day):
        plan, day = plan_day
        eq = make_equipment(db_session, 'MED02', 'SD02')
        job = _job(plan, day, eq)
        photo = self._photo(db_session, admin_user)

        resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                           headers=_headers(client, admin_user),
                           json={'attachment_file_id': photo.id,
                                 'attachment_kind': 'photo',
                                 'parent_task_id': 999999})
        assert resp.status_code == 404

    def test_deleting_an_operation_takes_its_media(self, client, admin_user,
                                                   db_session, plan_day):
        """Media left behind would be attached to a line nothing can display."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'MED03', 'SD03')
        job = _job(plan, day, eq)
        headers = _headers(client, admin_user)
        operation = client.post(f'/api/work-plans/jobs/{job.id}/tasks', headers=headers,
                                json={'content': 'Mine', 'operation_number': '0940'}
                                ).get_json()['task']
        photo = self._photo(db_session, admin_user, 'two.jpg')
        client.post(f'/api/work-plans/jobs/{job.id}/tasks', headers=headers,
                    json={'attachment_file_id': photo.id, 'attachment_kind': 'photo',
                          'parent_task_id': operation['id']})
        assert WorkPlanJobTask.query.count() == 2

        client.delete(f"/api/work-plans/jobs/{job.id}/tasks/{operation['id']}",
                      headers=headers)
        assert WorkPlanJobTask.query.count() == 0

    def test_a_sap_operation_carrying_a_photo_survives_being_dropped(
            self, client, admin_user, db_session, plan_day):
        """His evidence is work too. SAP dropping the line does not bin it."""
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'MED04', 'SD04')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())
        headers = _headers(client, admin_user)

        third = WorkPlanJobTask.query.filter_by(operation_number='0030').first()
        photo = self._photo(db_session, admin_user, 'three.jpg')
        client.post(f'/api/work-plans/jobs/{job.id}/tasks', headers=headers,
                    json={'attachment_file_id': photo.id, 'attachment_kind': 'photo',
                          'parent_task_id': third.id})

        shrunk = {'700000123456': _operations()['700000123456'][:2]}
        counts = sync_order_operations(shrunk)

        assert counts['kept_but_gone_from_sap'] == 1
        db.session.refresh(third)
        assert third.status == 'removed_in_sap'


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


class TestWhenSapClaimsANumberAliAlreadyTyped:
    """Ali, 2026-09-12: "what when i added an ope manually and the sap send the
    order wiyhout it, or the sap and app has different sectin or work center".

    The first half has a reassuring answer: a hand-typed operation is INVISIBLE
    to the sync, because `existing` is filtered to source='sap'. It is never
    edited and never deleted, whatever the file says.

    That protection is what allows a collision, and the first version of this
    test is how the real bug was found. `uq_work_plan_job_task_operation` —
    on the model AND on production (start.sh) — allows ONE row per number per
    order. So the second row is not a duplicate. It is an IntegrityError, and
    sync_order_operations commits ONCE at the end for every order, so a single
    clashing order would lose the operations import for the whole yard.

    It is rare (Ali numbers from 0900, SAP from 0010) and it becomes likely
    exactly once: the day the IW49 variant is fixed and orders he has been
    hand-typing onto receive SAP's real operations for the first time.
    """

    def _typed(self, client, headers, job, number='0900'):
        return client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                           json={'content': 'Grease the fifth wheel',
                                 'operation_number': number,
                                 'planned_hours': 1.5,
                                 'work_center': 'MECH'},
                           headers=headers)

    def _sap_0900(self, order):
        return {order: [
            {'operation_number': '0900', 'description': 'Lubricate turntable',
             'work_center': 'MECH', 'planned_hours': 2.0}]}

    def test_the_typed_line_is_untouched_and_sap_is_named_not_dropped(
            self, client, admin_user, db_session, plan_day):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPSC1', 'SOC1')
        job = _job(plan, day, eq, order='700000900001')
        headers = _headers(client, admin_user)
        assert self._typed(client, headers, job).status_code == 201

        counts = sync_order_operations(self._sap_0900('700000900001'))

        tasks = client.get(f'/api/work-plans/jobs/{job.id}/tasks',
                           headers=headers).get_json()['tasks']
        assert len(tasks) == 1
        assert tasks[0]['content'] == 'Grease the fifth wheel', \
            'a sync must never rewrite what a man typed'
        assert tasks[0]['planned_hours'] == 1.5
        assert tasks[0]['operation_number'] == '0900', \
            'and it must not be renumbered either — a crew was told this number'

        assert counts['added'] == 0
        assert counts['skipped_number_taken_by_hand'] == [
            {'order': '700000900001', 'operation_number': '0900',
             'sap_text': 'Lubricate turntable'}], \
            'SAP\'s line is not silently lost — it is reported by name'

    def test_one_clashing_order_does_not_break_every_other_order(
            self, client, admin_user, db_session, plan_day):
        """THE regression. There is one commit for the whole run.

        Before the skip, the IntegrityError from a single order rolled back the
        session that held every other order's operations too.
        """
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq1 = make_equipment(db_session, 'OPSC2', 'SOC2')
        eq2 = make_equipment(db_session, 'OPSC3', 'SOC3')
        clashing = _job(plan, day, eq1, order='700000900002')
        clean = _job(plan, day, eq2, order='700000900003')
        headers = _headers(client, admin_user)
        self._typed(client, headers, clashing)

        payload = dict(self._sap_0900('700000900002'))
        payload['700000900003'] = [
            {'operation_number': '0010', 'description': 'Check the spreader',
             'work_center': 'MECH', 'planned_hours': 2.0},
            {'operation_number': '0020', 'description': 'Replace harness',
             'work_center': 'ELEC', 'planned_hours': 3.0}]
        counts = sync_order_operations(payload)

        assert counts['added'] == 2, 'the clean order imported'
        clean_tasks = client.get(f'/api/work-plans/jobs/{clean.id}/tasks',
                                 headers=headers).get_json()['tasks']
        assert [t['operation_number'] for t in clean_tasks] == ['0010', '0020']

    def test_clearing_the_number_lets_the_next_sync_bring_sap_in(
            self, client, admin_user, db_session, plan_day):
        """Why skipping costs nothing: SAP resends the whole file every night."""
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPSC4', 'SOC4')
        job = _job(plan, day, eq, order='700000900004')
        headers = _headers(client, admin_user)
        typed_id = self._typed(client, headers, job).get_json()['task']['id']
        sync_order_operations(self._sap_0900('700000900004'))

        client.delete(f'/api/work-plans/jobs/{job.id}/tasks/{typed_id}',
                      headers=headers)
        counts = sync_order_operations(self._sap_0900('700000900004'))

        assert counts['added'] == 1
        assert counts['skipped_number_taken_by_hand'] == []
        tasks = client.get(f'/api/work-plans/jobs/{job.id}/tasks',
                           headers=headers).get_json()['tasks']
        assert [t['content'] for t in tasks] == ['Lubricate turntable']

    def test_a_re_sync_still_updates_saps_own_rows(
            self, client, admin_user, db_session, plan_day):
        """The split into two sets must not break the ordinary upsert."""
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPSC5', 'SOC5')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())

        counts = sync_order_operations({'700000123456': [
            {'operation_number': '0010', 'description': 'Check the spreader AGAIN',
             'work_center': 'MECH', 'planned_hours': 5.0}]})
        assert counts['added'] == 0 and counts['updated'] == 1

        tasks = client.get(f'/api/work-plans/jobs/{job.id}/tasks',
                           headers=_headers(client, admin_user)).get_json()['tasks']
        first = [t for t in tasks if t['operation_number'] == '0010'][0]
        assert first['content'] == 'Check the spreader AGAIN'
        assert first['planned_hours'] == 5.0

    def test_a_plain_note_holds_no_number_so_it_blocks_nothing(
            self, client, admin_user, db_session, plan_day):
        """A sub-task has no operation_number. It must not shadow an operation."""
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPSC6', 'SOC6')
        job = _job(plan, day, eq)
        headers = _headers(client, admin_user)
        client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                    json={'content': 'Bring the 32mm socket'}, headers=headers)

        counts = sync_order_operations(_operations())
        assert counts['added'] == 3
        assert counts['skipped_number_taken_by_hand'] == []

    def test_the_report_names_an_order_holding_both_kinds_of_line(
            self, client, admin_user, db_session, plan_day):
        """The case no code can solve.

        SAP's line for the same work usually arrives under a DIFFERENT number,
        and then there is no collision to detect — just the same job listed
        twice, with its hours counted twice on the progress bar. Nothing is
        merged and nothing is guessed; the order is named.
        """
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPSC7', 'SOC7')
        job = _job(plan, day, eq, order='700000900007')
        self._typed(client, _headers(client, admin_user), job, number='0900')

        counts = sync_order_operations({'700000900007': [
            {'operation_number': '0010', 'description': 'Grease fifth wheel',
             'work_center': 'MECH', 'planned_hours': 1.5}]})

        assert counts['orders_to_review'] == ['700000900007']
        assert counts['added'] == 1, 'no collision, so nothing was skipped'

    def test_an_order_with_no_typed_lines_is_not_flagged_for_review(
            self, client, admin_user, db_session, plan_day):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPSC8', 'SOC8')
        _job(plan, day, eq)
        counts = sync_order_operations(_operations())
        assert counts['orders_to_review'] == []
