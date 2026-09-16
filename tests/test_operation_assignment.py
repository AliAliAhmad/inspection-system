"""Who does WHICH LINE of an order.

Ali, 2026-09-15: "now the operation is showing inside the job detail, is thier a
way to be shown also when under the job father with an indent, so i can easly
assign people".

He was offered three shapes and chose per-operation assignment with this warning
in front of him:

    "When the order carries into next week, the names carry with it — even if
     that man is on leave."

THE DESIGN REMOVES THAT WARNING, and one column is the whole reason. The
assignment row carries `work_plan_job_id` — the WEEK's row — and the table is in
JOB_CHILD_TABLES, so `purge_job_rows` deletes it exactly as it already deletes
`work_plan_assignments`. The operation and its timer survive a trip through the
pool because they hang on the ORDER; the name does not, because it hangs on the
week. Rosters change weekly.
"""

from datetime import date, timedelta

import pytest

from tests.conftest import get_auth_header, make_equipment
from app.extensions import db
from app.models import (WorkPlan, WorkPlanDay, WorkPlanJob, WorkPlanJobTask,
                        WorkPlanAssignment, WorkPlanOperationAssignment)


@pytest.fixture
def worker(db_session):
    from app.models import User
    user = User(email='opsassign@test.com', full_name='Hassan Ali',
                role='maintenance', role_id='MNT901', shift='day')
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


ORDER = '700000950001'


def _job(plan, day, equipment, order=ORDER):
    job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm',
                      equipment_id=equipment.id, sap_order_number=order,
                      description='GENERAL REFURBISHMENT',
                      estimated_hours=9, position=1)
    db.session.add(job)
    db.session.commit()
    return job


def _operations(order=ORDER):
    return {order: [
        {'operation_number': '0010', 'description': 'Check the spreader',
         'work_center': 'MECH', 'planned_hours': 2.0},
        {'operation_number': '0020', 'description': 'Replace harness',
         'work_center': 'ELEC', 'planned_hours': 3.0},
    ]}


def _headers(client, admin_user):
    return get_auth_header(client, admin_user.email, 'admin123')


def _ops_of(order=ORDER):
    return (WorkPlanJobTask.query
            .filter_by(anchor_kind='sap', anchor_key=order, source='sap')
            .order_by(WorkPlanJobTask.operation_number).all())


class TestPuttingAManOnOneLine:

    def test_he_is_put_on_the_job_too_or_he_would_never_see_it(
            self, client, admin_user, db_session, plan_day, worker):
        """THE thing that makes this feature work at all.

        /my-plan selects a worker's week through WorkPlanJob.assignments. A man
        placed only on a line would open his phone to an empty day — assigned,
        and with no way to find out.
        """
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPA01', 'OPA01')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())
        first = _ops_of()[0]

        resp = client.post(
            f'/api/work-plans/jobs/{job.id}/tasks/{first.id}/assignees',
            json={'user_id': worker.id}, headers=_headers(client, admin_user))
        assert resp.status_code == 201, resp.get_json()
        assert resp.get_json()['added_to_job'] is True

        assert WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job.id, user_id=worker.id).count() == 1

    def test_his_name_comes_back_on_that_line_only(
            self, client, admin_user, db_session, plan_day, worker):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPA02', 'OPA02')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())
        first, second = _ops_of()
        h = _headers(client, admin_user)

        client.post(f'/api/work-plans/jobs/{job.id}/tasks/{first.id}/assignees',
                    json={'user_id': worker.id}, headers=h)

        tasks = client.get(f'/api/work-plans/jobs/{job.id}/tasks',
                           headers=h).get_json()['tasks']
        by_number = {t['operation_number']: t for t in tasks}
        assert [a['user_name'] for a in by_number['0010']['assignees']] == ['Hassan Ali']
        assert by_number['0020']['assignees'] == []

    def test_assigning_the_same_man_twice_is_friendly_not_a_500(
            self, client, admin_user, db_session, plan_day, worker):
        """unique(task_id, user_id) is a DATABASE constraint.

        A second tap — a slow board, a double click — must not become a server
        error. Checked before the insert, not caught after it.
        """
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPA03', 'OPA03')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())
        first = _ops_of()[0]
        h = _headers(client, admin_user)
        url = f'/api/work-plans/jobs/{job.id}/tasks/{first.id}/assignees'

        assert client.post(url, json={'user_id': worker.id}, headers=h).status_code == 201
        again = client.post(url, json={'user_id': worker.id}, headers=h)
        assert again.status_code == 200
        assert WorkPlanOperationAssignment.query.count() == 1

    def test_a_written_note_cannot_be_assigned(
            self, client, admin_user, db_session, plan_day, worker):
        """"Bring the 32mm socket" is a reminder, not a line of work."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPA04', 'OPA04')
        job = _job(plan, day, eq)
        h = _headers(client, admin_user)
        note = client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                           json={'content': 'Bring the 32mm socket'},
                           headers=h).get_json()['task']

        resp = client.post(
            f'/api/work-plans/jobs/{job.id}/tasks/{note["id"]}/assignees',
            json={'user_id': worker.id}, headers=h)
        assert resp.status_code == 400


class TestTheNameDiesWithTheWeek:
    """The warning Ali accepted, engineered away."""

    def test_a_trip_through_the_pool_keeps_the_work_and_drops_the_person(
            self, client, admin_user, db_session, plan_day, worker):
        from app.api.work_plans import purge_job_rows
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPA05', 'OPA05')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())
        first = _ops_of()[0]
        h = _headers(client, admin_user)

        client.post(f'/api/work-plans/jobs/{job.id}/tasks/{first.id}/assignees',
                    json={'user_id': worker.id}, headers=h)
        client.post(f'/api/work-plans/jobs/{job.id}/tasks/{first.id}/timer',
                    json={'action': 'start'}, headers=h)
        assert WorkPlanOperationAssignment.query.count() == 1

        purge_job_rows(job)
        db.session.commit()

        assert WorkPlanOperationAssignment.query.count() == 0, \
            'the roster is new next week; the name must not follow the order'
        survivors = _ops_of()
        assert len(survivors) == 2, 'the operations themselves survive'
        assert survivors[0].started_at is not None, \
            "and so does the timer — that is the only record of partial progress"

    def test_taking_a_man_off_the_job_takes_him_off_its_lines(
            self, client, admin_user, db_session, plan_day, worker):
        """Otherwise his face sits on a line of a job he is not on."""
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPA06', 'OPA06')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())
        first, second = _ops_of()
        h = _headers(client, admin_user)

        for op in (first, second):
            client.post(f'/api/work-plans/jobs/{job.id}/tasks/{op.id}/assignees',
                        json={'user_id': worker.id}, headers=h)
        assignment = WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job.id, user_id=worker.id).one()

        resp = client.delete(
            f'/api/work-plans/{plan.id}/jobs/{job.id}/assignments/{assignment.id}',
            headers=h)
        assert resp.status_code == 200
        assert resp.get_json()['operations_cleared'] == 2
        assert WorkPlanOperationAssignment.query.count() == 0

    def test_taking_him_off_his_last_line_leaves_him_on_the_job(
            self, client, admin_user, db_session, plan_day, worker):
        """Deliberately not symmetric.

        He may have been put on the job before the operations arrived, or put
        there on purpose to help. A planner who wants him off the order entirely
        has the other gesture, which clears his lines too.
        """
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPA07', 'OPA07')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())
        first = _ops_of()[0]
        h = _headers(client, admin_user)
        client.post(f'/api/work-plans/jobs/{job.id}/tasks/{first.id}/assignees',
                    json={'user_id': worker.id}, headers=h)

        resp = client.delete(
            f'/api/work-plans/jobs/{job.id}/tasks/{first.id}/assignees/{worker.id}',
            headers=h)
        assert resp.status_code == 200
        assert WorkPlanOperationAssignment.query.count() == 0
        assert WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job.id, user_id=worker.id).count() == 1


class TestSapMustNotUnassignAManOvernight:

    def test_an_assigned_line_sap_drops_is_kept_and_flagged(
            self, client, admin_user, db_session, plan_day, worker):
        """A planner put a name on that line and told a man to do it."""
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPA08', 'OPA08')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())
        first, second = _ops_of()
        client.post(f'/api/work-plans/jobs/{job.id}/tasks/{second.id}/assignees',
                    json={'user_id': worker.id},
                    headers=_headers(client, admin_user))

        # Tuesday's file no longer carries 0020.
        counts = sync_order_operations({ORDER: [
            {'operation_number': '0010', 'description': 'Check the spreader',
             'work_center': 'MECH', 'planned_hours': 2.0}]})

        assert counts['kept_but_gone_from_sap'] == 1
        assert counts['removed'] == 0
        kept = db.session.get(WorkPlanJobTask, second.id)
        assert kept is not None and kept.status == 'removed_in_sap'
        assert WorkPlanOperationAssignment.query.count() == 1

    def test_an_unassigned_line_sap_drops_is_still_removed(
            self, client, admin_user, db_session, plan_day):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPA09', 'OPA09')
        _job(plan, day, eq)
        sync_order_operations(_operations())

        counts = sync_order_operations({ORDER: [
            {'operation_number': '0010', 'description': 'Check the spreader',
             'work_center': 'MECH', 'planned_hours': 2.0}]})
        assert counts['removed'] == 1


class TestTheBoardGetsThemInOneRequest:

    def test_operations_come_back_separately_from_the_note_counts(
            self, client, admin_user, db_session, plan_day, worker):
        """The badge counts NOTES. Operations turned a quiet '+' into '0/10'
        once already, so they travel in their own key."""
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPA10', 'OPA10')
        job = _job(plan, day, eq)
        sync_order_operations(_operations())
        h = _headers(client, admin_user)
        client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                    json={'content': 'Bring the 32mm socket'}, headers=h)
        first = _ops_of()[0]
        client.post(f'/api/work-plans/jobs/{job.id}/tasks/{first.id}/assignees',
                    json={'user_id': worker.id}, headers=h)

        body = client.get(f'/api/work-plans/{plan.id}/job-tasks',
                          headers=h).get_json()

        assert body['jobs'][str(job.id)]['total'] == 1, 'notes only'
        ops = body['operations'][str(job.id)]
        assert [o['operation_number'] for o in ops] == ['0010', '0020']
        assert [a['user_name'] for a in ops[0]['assignees']] == ['Hassan Ali']

    def test_it_stays_one_query_however_many_operations(
            self, client, admin_user, db_session, plan_day, worker):
        """for_jobs exists to stop the N+1. Building the names must not undo it."""
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, 'OPA11', 'OPA11')
        job = _job(plan, day, eq)
        sync_order_operations({ORDER: [
            {'operation_number': f'{n:04d}', 'description': f'Step {n}',
             'work_center': 'MECH', 'planned_hours': 1.0}
            for n in range(10, 210, 10)]})
        h = _headers(client, admin_user)
        for op in _ops_of()[:5]:
            client.post(f'/api/work-plans/jobs/{job.id}/tasks/{op.id}/assignees',
                        json={'user_id': worker.id}, headers=h)

        from sqlalchemy import event
        from app.extensions import db as _db
        seen = []
        engine = _db.session.get_bind()

        def count(conn, cursor, statement, *a):
            seen.append(statement)
        event.listen(engine, 'before_cursor_execute', count)
        try:
            body = client.get(f'/api/work-plans/{plan.id}/job-tasks',
                              headers=h).get_json()
        finally:
            event.remove(engine, 'before_cursor_execute', count)

        assert len(body['operations'][str(job.id)]) == 20
        task_queries = [s for s in seen if 'work_plan_job_tasks' in s]
        assert len(task_queries) <= 3, (
            f'{len(task_queries)} task queries for 20 operations — the eager '
            'load on assignees has been lost')


class TestTheTwoLevelsCannotContradictEachOther:
    """Ali, 2026-09-16: "now i can assign team for the hall order and for
    operation right? if yes is that good or it will have conflict".

    Yes to both, and no conflict is possible — because the two levels are not two
    opinions about the same thing. They answer different questions:

        ORDER     : is this man on this job at all?   (drives /my-plan)
        OPERATION : which line in particular is his?  (drives his phone's list)

    The second implies the first and the first outlives the second. Written as
    rules, with a test for each:

      * putting him on a line puts him on the job          (he must be able to see it)
      * taking him off the job takes him off its lines     (no orphan face on a row)
      * taking him off a line leaves him on the job        (he may be there to help)
      * a man on the job with NO line is legitimate        (the whole crew case)

    There is no state where the order says one thing and an operation says the
    opposite, because nothing is stored twice: the order's assignment list is the
    only record of who is on the job, and an operation's list is a SUBSET of it.
    """

    def _setup(self, client, admin_user, db_session, plan_day, tag):
        from app.services.sap_pool_sync import sync_order_operations
        plan, day = plan_day
        eq = make_equipment(db_session, tag, tag)
        job = _job(plan, day, eq)
        sync_order_operations(_operations())
        return plan, job, _ops_of(), _headers(client, admin_user)

    def _second_worker(self, db_session):
        from app.models import User
        user = User(email='opsmate@test.com', full_name='Karim Saleh',
                    role='maintenance', role_id='MNT902', shift='day')
        user.set_password('test123')
        db.session.add(user)
        db.session.commit()
        return user

    def test_a_man_on_the_job_with_no_line_is_a_normal_state(
            self, client, admin_user, db_session, plan_day, worker):
        """The ordinary case, and it must stay ordinary.

        A planner drops a man on the whole order and never touches a line. He is
        on the job, every line is unnamed, and unnamed means the crew's.
        """
        plan, job, ops, h = self._setup(client, admin_user, db_session, plan_day, 'CNF01')

        resp = client.post(f'/api/work-plans/{plan.id}/jobs/{job.id}/assignments',
                           json={'user_id': worker.id}, headers=h)
        assert resp.status_code in (200, 201)

        tasks = client.get(f'/api/work-plans/jobs/{job.id}/tasks',
                           headers=h).get_json()['tasks']
        assert all(t['assignees'] == [] for t in tasks), \
            'assigning the ORDER must not silently claim every line'
        assert WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job.id, user_id=worker.id).count() == 1

    def test_two_men_can_own_different_lines_of_one_order(
            self, client, admin_user, db_session, plan_day, worker):
        """The case Ali is really asking about: a mechanic and an electrician."""
        plan, job, ops, h = self._setup(client, admin_user, db_session, plan_day, 'CNF02')
        mate = self._second_worker(db_session)

        client.post(f'/api/work-plans/jobs/{job.id}/tasks/{ops[0].id}/assignees',
                    json={'user_id': worker.id}, headers=h)
        client.post(f'/api/work-plans/jobs/{job.id}/tasks/{ops[1].id}/assignees',
                    json={'user_id': mate.id}, headers=h)

        tasks = client.get(f'/api/work-plans/jobs/{job.id}/tasks',
                           headers=h).get_json()['tasks']
        by_number = {t['operation_number']: t for t in tasks}
        assert [a['user_name'] for a in by_number['0010']['assignees']] == ['Hassan Ali']
        assert [a['user_name'] for a in by_number['0020']['assignees']] == ['Karim Saleh']

        # BOTH are on the order, so BOTH find the job on their phone.
        on_job = {a.user_id for a in WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job.id).all()}
        assert on_job == {worker.id, mate.id}

    def test_an_operation_list_is_always_a_subset_of_the_order_list(
            self, client, admin_user, db_session, plan_day, worker):
        """THE invariant. Nothing is stored twice, so nothing can disagree.

        Whatever sequence of gestures a planner makes, a name on a line must
        also be a name on the job.
        """
        plan, job, ops, h = self._setup(client, admin_user, db_session, plan_day, 'CNF03')
        mate = self._second_worker(db_session)

        # A deliberately awkward sequence.
        client.post(f'/api/work-plans/{plan.id}/jobs/{job.id}/assignments',
                    json={'user_id': worker.id}, headers=h)
        client.post(f'/api/work-plans/jobs/{job.id}/tasks/{ops[0].id}/assignees',
                    json={'user_id': mate.id}, headers=h)
        client.post(f'/api/work-plans/jobs/{job.id}/tasks/{ops[1].id}/assignees',
                    json={'user_id': worker.id}, headers=h)
        client.delete(f'/api/work-plans/jobs/{job.id}/tasks/{ops[1].id}/assignees/{worker.id}',
                      headers=h)

        on_lines = {r.user_id for r in WorkPlanOperationAssignment.query.filter_by(
            work_plan_job_id=job.id).all()}
        on_job = {a.user_id for a in WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job.id).all()}
        assert on_lines <= on_job, f'{on_lines - on_job} on a line but not on the job'
        assert worker.id in on_job, 'off his last line, still on the job'
        assert worker.id not in on_lines

    def test_removing_the_man_who_owned_a_line_leaves_that_line_to_the_crew(
            self, client, admin_user, db_session, plan_day, worker):
        """Not an orphan, not a hole: an unnamed line is the crew's again."""
        plan, job, ops, h = self._setup(client, admin_user, db_session, plan_day, 'CNF04')
        client.post(f'/api/work-plans/jobs/{job.id}/tasks/{ops[0].id}/assignees',
                    json={'user_id': worker.id}, headers=h)
        assignment = WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job.id, user_id=worker.id).one()

        client.delete(
            f'/api/work-plans/{plan.id}/jobs/{job.id}/assignments/{assignment.id}',
            headers=h)

        tasks = client.get(f'/api/work-plans/jobs/{job.id}/tasks',
                           headers=h).get_json()['tasks']
        assert all(t['assignees'] == [] for t in tasks)
        assert [t for t in tasks if t['operation_number'] == '0010'], \
            'the operation itself is untouched — only the name went'
