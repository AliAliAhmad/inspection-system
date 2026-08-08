"""
Tests for the bulk job endpoints used by the web planner's bundle drag & drop.

Dragging a bundle (several jobs on the same equipment) previously fired one
request per job. These endpoints do the whole batch in one transaction, and
must keep the exact same per-job semantics as the single-job routes.
"""

from datetime import date, timedelta

from tests.conftest import get_auth_header, make_equipment
from app.models import WorkPlan, WorkPlanDay, WorkPlanJob, SAPWorkOrder


def _draft_plan_with_two_days(db_session, admin_user, week_offset=0):
    """Create a draft plan with two days.

    `week_start` is UNIQUE, so tests needing a second plan must pass a
    different week_offset.
    """
    start = date.today() + timedelta(weeks=week_offset)
    plan = WorkPlan(
        week_start=start, week_end=start + timedelta(days=6),
        status='draft', created_by_id=admin_user.id,
    )
    db_session.session.add(plan)
    db_session.session.flush()
    day_one = WorkPlanDay(work_plan_id=plan.id, date=start)
    day_two = WorkPlanDay(work_plan_id=plan.id, date=start + timedelta(days=1))
    db_session.session.add_all([day_one, day_two])
    db_session.session.flush()
    return plan, day_one, day_two


def _add_jobs(db_session, day, equipment, count, job_type='pm', berth='east'):
    jobs = []
    for i in range(count):
        job = WorkPlanJob(
            work_plan_day_id=day.id, job_type=job_type, equipment_id=equipment.id,
            estimated_hours=2.0, description=f'Job {i}', priority='normal',
            position=i + 1, berth=berth,
        )
        db_session.session.add(job)
        jobs.append(job)
    db_session.session.commit()
    return jobs


class TestBulkMoveJobs:
    def test_moves_whole_bundle_to_target_day(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Bulk Pump', 'BULK-1')
        plan, day_one, day_two = _draft_plan_with_two_days(db_session, admin_user)
        jobs = _add_jobs(db_session, day_one, eq, 3)
        job_ids = [j.id for j in jobs]

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-move',
            json={'job_ids': job_ids, 'target_day_id': day_two.id},
            headers=headers,
        )

        assert resp.status_code == 200
        assert resp.get_json()['moved'] == 3
        for job_id in job_ids:
            assert db_session.session.get(WorkPlanJob, job_id).work_plan_day_id == day_two.id

    def test_assigns_distinct_positions(self, client, admin_user, engineer, db_session):
        """Every moved job needs its own slot — no duplicate positions."""
        eq = make_equipment(db_session, 'Pos Pump', 'BULK-2')
        plan, day_one, day_two = _draft_plan_with_two_days(db_session, admin_user)
        _add_jobs(db_session, day_two, eq, 1)  # day_two already occupies position 1
        jobs = _add_jobs(db_session, day_one, eq, 3)
        job_ids = [j.id for j in jobs]

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-move',
            json={'job_ids': job_ids, 'target_day_id': day_two.id},
            headers=headers,
        )

        assert resp.status_code == 200
        positions = [db_session.session.get(WorkPlanJob, jid).position for jid in job_ids]
        assert len(set(positions)) == 3, f'duplicate positions: {positions}'
        assert min(positions) > 1, 'moved jobs must land after the existing job'

    def test_rejects_job_from_another_plan(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Other Pump', 'BULK-3')
        plan_a, day_a, _ = _draft_plan_with_two_days(db_session, admin_user)
        _plan_b, _day_b, day_b2 = _draft_plan_with_two_days(db_session, admin_user, week_offset=1)
        plan_b = _plan_b
        foreign = _add_jobs(db_session, day_a, eq, 1)[0]

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan_b.id}/jobs/bulk-move',
            json={'job_ids': [foreign.id], 'target_day_id': day_b2.id},
            headers=headers,
        )

        assert resp.status_code == 404
        # The foreign job stays exactly where it was
        assert db_session.session.get(WorkPlanJob, foreign.id).work_plan_day_id == day_a.id

    def test_rejects_published_plan(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Pub Pump', 'BULK-4')
        plan, day_one, day_two = _draft_plan_with_two_days(db_session, admin_user)
        jobs = _add_jobs(db_session, day_one, eq, 2)
        plan.status = 'published'
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-move',
            json={'job_ids': [j.id for j in jobs], 'target_day_id': day_two.id},
            headers=headers,
        )

        assert resp.status_code == 403

    def test_requires_job_ids(self, client, admin_user, engineer, db_session):
        plan, _, day_two = _draft_plan_with_two_days(db_session, admin_user)
        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-move',
            json={'job_ids': [], 'target_day_id': day_two.id},
            headers=headers,
        )
        assert resp.status_code == 400


class TestBulkDeleteJobs:
    def test_removes_whole_bundle(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Del Pump', 'BULK-5')
        plan, day_one, _ = _draft_plan_with_two_days(db_session, admin_user)
        jobs = _add_jobs(db_session, day_one, eq, 3)
        job_ids = [j.id for j in jobs]

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-delete',
            json={'job_ids': job_ids},
            headers=headers,
        )

        assert resp.status_code == 200
        assert resp.get_json()['deleted'] == 3
        for job_id in job_ids:
            assert db_session.session.get(WorkPlanJob, job_id) is None

    def test_preserves_manual_jobs_in_pool(self, client, admin_user, engineer, db_session):
        """Bulk delete must match remove_job: manual PM jobs return to the pool."""
        eq = make_equipment(db_session, 'Man Bulk Pump', 'BULK-6')
        plan, day_one, _ = _draft_plan_with_two_days(db_session, admin_user)
        jobs = _add_jobs(db_session, day_one, eq, 2)

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-delete',
            json={'job_ids': [j.id for j in jobs]},
            headers=headers,
        )

        assert resp.status_code == 200
        orders = SAPWorkOrder.query.filter_by(work_plan_id=plan.id, order_type='MANUAL').all()
        assert len(orders) == 2
        assert all(o.status == 'pending' for o in orders)

    def test_restores_sap_orders_to_pending(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Sap Bulk Pump', 'BULK-7')
        plan, day_one, _ = _draft_plan_with_two_days(db_session, admin_user)
        order = SAPWorkOrder(
            work_plan_id=plan.id, order_number='SAP-BULK-1', order_type='PM01',
            job_type='pm', equipment_id=eq.id, description='Sap job',
            estimated_hours=4.0, status='scheduled',
        )
        db_session.session.add(order)
        db_session.session.flush()
        job = WorkPlanJob(
            work_plan_day_id=day_one.id, job_type='pm', equipment_id=eq.id,
            estimated_hours=4.0, sap_order_number='SAP-BULK-1', position=1,
        )
        db_session.session.add(job)
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-delete',
            json={'job_ids': [job.id]},
            headers=headers,
        )

        assert resp.status_code == 200
        db_session.session.refresh(order)
        assert order.status == 'pending'

    def test_rejects_published_plan(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Pub Del Pump', 'BULK-8')
        plan, day_one, _ = _draft_plan_with_two_days(db_session, admin_user)
        jobs = _add_jobs(db_session, day_one, eq, 2)
        plan.status = 'published'
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-delete',
            json={'job_ids': [j.id for j in jobs]},
            headers=headers,
        )

        assert resp.status_code == 403
        # Nothing was deleted
        for job in jobs:
            assert db_session.session.get(WorkPlanJob, job.id) is not None


class TestDayPayloadShape:
    """The plan payload must not serialize each job twice.

    `WorkPlanDay.to_dict` used to emit a flat 'jobs' list AND the per-berth
    arrays, roughly doubling `GET /work-plans?include_days=true` — the request
    the web planner refetches after every drag & drop.
    """

    def test_day_has_no_duplicate_flat_jobs_list(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Shape Pump', 'SHAPE-1')
        plan, day_one, _ = _draft_plan_with_two_days(db_session, admin_user)
        _add_jobs(db_session, day_one, eq, 3, berth='east')

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get(
            f'/api/work-plans?week_start={plan.week_start.isoformat()}&include_days=true',
            headers=headers,
        )

        assert resp.status_code == 200
        day = next(d for d in resp.get_json()['work_plans'][0]['days'] if d['id'] == day_one.id)

        assert 'jobs' not in day, 'flat jobs list must not come back — it doubled the payload'
        assert len(day['jobs_east']) == 3
        assert day['total_jobs'] == 3

    def test_berth_arrays_still_partition_every_job(self, client, admin_user, engineer, db_session):
        """Removing the flat list must not lose jobs — every berth is covered."""
        eq = make_equipment(db_session, 'Berth Pump', 'SHAPE-2')
        plan, day_one, _ = _draft_plan_with_two_days(db_session, admin_user)
        _add_jobs(db_session, day_one, eq, 2, berth='east')
        _add_jobs(db_session, day_one, eq, 1, berth='west')
        _add_jobs(db_session, day_one, eq, 1, berth='both')

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get(
            f'/api/work-plans?week_start={plan.week_start.isoformat()}&include_days=true',
            headers=headers,
        )

        assert resp.status_code == 200
        day = next(d for d in resp.get_json()['work_plans'][0]['days'] if d['id'] == day_one.id)

        combined = day['jobs_east'] + day['jobs_west'] + day['jobs_both']
        assert len(combined) == 4, 'berth arrays together must hold every job'
        assert len({j['id'] for j in combined}) == 4, 'no job may appear in two berth arrays'
        assert day['total_jobs'] == 4
