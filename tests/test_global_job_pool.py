"""
The job pool is ONE box, not one box per week.

Ali's model: "The job pool is the big box that has all jobs from SAP and
inspection results. When it is planned in the week it is removed from the box.
If the week finishes and the job is not done, it goes back to the box."

Before this, SAPWorkOrder.work_plan_id was NOT NULL, so every week had its own
separate pool. An order dropped into week 34's pool and never planned was
invisible in week 35 — still open in SAP, seen by nobody, able to hide for
months. These tests exist to stop that coming back.
"""

from datetime import date, timedelta

import pytest

from tests.conftest import get_auth_header, make_equipment
from app.extensions import db
from app.models import WorkPlan, WorkPlanDay, WorkPlanJob, SAPWorkOrder


def _plan(db_session, admin_user, week_offset=0):
    start = date.today() + timedelta(weeks=week_offset)
    plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                    status='draft', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=start)
    db_session.session.add(day)
    db_session.session.commit()
    return plan, day


def _order(db_session, equipment, number='700000000001', work_plan_id=None, status='pending'):
    order = SAPWorkOrder(
        work_plan_id=work_plan_id, order_number=number, order_type='PRM',
        job_type='pm', equipment_id=equipment.id, estimated_hours=4.0,
        priority='normal', status=status,
    )
    db_session.session.add(order)
    db_session.session.commit()
    return order


class TestTheBoxBelongsToNoWeek:
    def test_an_order_can_sit_in_the_pool_with_no_plan(self, db_session, admin_user):
        """The whole point: work_plan_id NULL means 'waiting in the box'.

        This column was NOT NULL before, which is what forced a per-week pool.
        """
        eq = make_equipment(db_session, 'Box Pump', 'GP-1')
        order = _order(db_session, eq, work_plan_id=None)
        assert order.id is not None
        assert order.work_plan_id is None

    def test_the_same_box_is_seen_from_every_week(self, client, admin_user, engineer,
                                                  db_session):
        """The bug this replaces: a job in week 34's pool was invisible in week 35."""
        eq = make_equipment(db_session, 'Shared Pump', 'GP-2')
        week_a, _ = _plan(db_session, admin_user, week_offset=0)
        week_b, _ = _plan(db_session, admin_user, week_offset=1)
        _order(db_session, eq, number='700000000010', work_plan_id=None)

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        for plan in (week_a, week_b):
            resp = client.get(f'/api/work-plans/available-jobs?plan_id={plan.id}',
                              headers=headers)
            assert resp.status_code == 200
            numbers = {o['order_number'] for o in resp.get_json()['sap_orders']}
            assert '700000000010' in numbers, f'the box is invisible from plan {plan.id}'

    def test_orders_imported_the_old_way_still_appear(self, client, admin_user, engineer,
                                                      db_session):
        """Backwards compatibility. Everything imported before this change carries
        a work_plan_id; it must keep showing up in its own week exactly as before."""
        eq = make_equipment(db_session, 'Legacy Pump', 'GP-3')
        plan, _ = _plan(db_session, admin_user)
        _order(db_session, eq, number='700000000020', work_plan_id=plan.id)

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.get(f'/api/work-plans/available-jobs?plan_id={plan.id}', headers=headers)
        numbers = {o['order_number'] for o in resp.get_json()['sap_orders']}
        assert '700000000020' in numbers


class TestPlannedLeavesTheBoxAndUnplannedReturns:
    def test_scheduling_takes_it_out_of_the_box(self, client, admin_user, engineer,
                                                db_session):
        eq = make_equipment(db_session, 'Sched Pump', 'GP-4')
        plan, day = _plan(db_session, admin_user)
        order = _order(db_session, eq, number='700000000030', work_plan_id=None)

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(f'/api/work-plans/{plan.id}/schedule-sap-order',
                           json={'sap_order_id': order.id, 'day_id': day.id},
                           headers=headers)
        assert resp.status_code == 201

        db_session.session.refresh(order)
        assert order.status == 'scheduled'
        assert order.work_plan_id == plan.id, 'a planned job is stamped with its week'

    def test_removing_the_job_puts_it_back_in_the_box(self, client, admin_user, engineer,
                                                      db_session):
        """"If the week finishes and the job is not done, it goes back to the box."

        Critically it returns to the BOX (work_plan_id NULL), not to that week's
        pool — otherwise it would be invisible from every other week again, which
        is the exact bug being fixed.
        """
        eq = make_equipment(db_session, 'Return Pump', 'GP-5')
        plan, day = _plan(db_session, admin_user)
        order = _order(db_session, eq, number='700000000040', work_plan_id=None)

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        sched = client.post(f'/api/work-plans/{plan.id}/schedule-sap-order',
                            json={'sap_order_id': order.id, 'day_id': day.id},
                            headers=headers)
        job_id = sched.get_json()['job']['id']

        removed = client.delete(f'/api/work-plans/{plan.id}/jobs/{job_id}', headers=headers)
        assert removed.status_code == 200

        db_session.session.refresh(order)
        assert order.status == 'pending'
        assert order.work_plan_id is None, 'must return to the shared box, not this week'

    def test_a_returned_job_is_visible_from_a_different_week(self, client, admin_user,
                                                             engineer, db_session):
        """The end-to-end guarantee: plan it, drop it, and another week can see it."""
        eq = make_equipment(db_session, 'Cycle Pump', 'GP-6')
        week_a, day_a = _plan(db_session, admin_user, week_offset=0)
        week_b, _ = _plan(db_session, admin_user, week_offset=1)
        order = _order(db_session, eq, number='700000000050', work_plan_id=None)

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        sched = client.post(f'/api/work-plans/{week_a.id}/schedule-sap-order',
                            json={'sap_order_id': order.id, 'day_id': day_a.id},
                            headers=headers)
        client.delete(f"/api/work-plans/{week_a.id}/jobs/{sched.get_json()['job']['id']}",
                      headers=headers)

        resp = client.get(f'/api/work-plans/available-jobs?plan_id={week_b.id}', headers=headers)
        numbers = {o['order_number'] for o in resp.get_json()['sap_orders']}
        assert '700000000050' in numbers, 'a job that came back must be visible everywhere'


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


class TestEveryPoolReaderSeesTheSharedBox:
    """Three queries still matched work_plan_id == plan.id after the box went global.

    Each one silently found nothing, because a robot-fed order carries NULL.
    Found when the planner UI showed an empty pool while /pool on the phone
    reported 202 waiting — the same question answered two different ways.
    """

    def _in_the_box(self, db_session, equipment, number='700000000900'):
        order = SAPWorkOrder(
            work_plan_id=None, order_number=number, order_type='PRM',
            job_type='pm', equipment_id=equipment.id, estimated_hours=4.0,
            priority='normal', status='pending')
        db_session.session.add(order)
        db_session.session.commit()
        return order

    def test_the_plan_detail_count_includes_the_box(self, client, admin_user,
                                                    db_session, plan_day):
        """The planner said "0 waiting" while the box held 202.

        Exercised through the ENDPOINT, not through pool_orders_query. An
        earlier version of this test called the helper directly, so reverting
        the call site to the per-plan filter left it green — it was testing the
        helper that was already correct, not the line that was wrong.
        """
        plan, day = plan_day
        equipment = make_equipment(db_session, 'BOX01', 'SB01')
        self._in_the_box(db_session, equipment)

        response = client.get(
            f'/api/work-plans/debug/{plan.week_start.isoformat()}',
            headers=get_auth_header(client, admin_user.email, 'admin123'))

        assert response.status_code == 200
        assert response.get_json()['sap_orders_in_pool'] == 1

    def test_auto_schedule_sees_the_box(self, client, admin_user, db_session,
                                        plan_day):
        """It matched this plan only, so it reported nothing to schedule."""
        plan, day = plan_day
        equipment = make_equipment(db_session, 'BOX02', 'SB02')
        self._in_the_box(db_session, equipment, '700000000901')

        # include_weekends because the fixture's single day is whatever today
        # is, and the endpoint refuses a plan whose only day is a weekend —
        # which would make this test pass or fail depending on the day it runs.
        response = client.post(
            f'/api/work-plans/{plan.id}/auto-schedule',
            json={'include_weekends': True},
            headers=get_auth_header(client, admin_user.email, 'admin123'))

        assert response.status_code == 200
        body = response.get_json()
        # With the per-plan filter this returned "No jobs to schedule" and
        # total_in_pool 0, while the box held the order all along.
        assert body['total_in_pool'] == 1
        assert body['scheduled'] == 1

    def test_scheduling_one_order_pulls_in_the_machine_s_other_box_work(
            self, client, admin_user, db_session, plan_day):
        """"Also add the other open work on this machine" added nothing.

        Reached through schedule-sap-order, which is the only caller — testing
        the helper directly would not have noticed the per-plan filter.
        """
        plan, day = plan_day
        equipment = make_equipment(db_session, 'BOX05', 'SB05')
        first = self._in_the_box(db_session, equipment, '700000000904')
        self._in_the_box(db_session, equipment, '700000000905')

        response = client.post(
            f'/api/work-plans/{plan.id}/schedule-sap-order',
            json={'sap_order_id': first.id, 'day_id': day.id},
            headers=get_auth_header(client, admin_user.email, 'admin123'))

        assert response.status_code == 201
        # The second order on the same machine is pulled onto the day with it.
        assert response.get_json()['auto_added_defects'] == 1

    def test_available_jobs_lists_the_box_for_a_plan(self, client, admin_user,
                                                    db_session, plan_day):
        """The planner's pool panel reads this, and it is gated on plan_id."""
        plan, day = plan_day
        equipment = make_equipment(db_session, 'BOX03', 'SB03')
        self._in_the_box(db_session, equipment, '700000000902')

        response = client.get(
            f'/api/work-plans/available-jobs?plan_id={plan.id}',
            headers=get_auth_header(client, admin_user.email, 'admin123'))

        assert response.status_code == 200
        numbers = [o['order_number'] for o in response.get_json()['sap_orders']]
        assert '700000000902' in numbers

    def test_available_jobs_shows_the_box_even_with_no_plan(
            self, client, admin_user, db_session):
        """This is WHY the planner screen showed no SAP jobs.

        plan_id used to be required, from when every week owned its own pool.
        The box is now global and exists whether or not a week has been
        created — so gating on plan_id meant the screen showed nothing while
        the box held 202, and the only way to see them was to create a plan.
        """
        equipment = make_equipment(db_session, 'BOX04', 'SB04')
        self._in_the_box(db_session, equipment, '700000000903')

        response = client.get(
            '/api/work-plans/available-jobs',
            headers=get_auth_header(client, admin_user.email, 'admin123'))

        assert response.status_code == 200
        numbers = [o['order_number'] for o in response.get_json()['sap_orders']]
        assert numbers == ['700000000903']

    def test_with_a_plan_it_hides_what_is_already_on_a_day(
            self, client, admin_user, db_session, plan_day):
        """The pool shows what is still available to drag, not what is placed."""
        plan, day = plan_day
        # Two DIFFERENT machines on purpose. Putting both orders on one machine
        # made this fail in a way that proved the opposite of a bug: scheduling
        # the first auto-pulled the second onto the same day, because they are
        # the same machine. That is _auto_group_equipment_jobs doing its job.
        placed = self._in_the_box(
            db_session, make_equipment(db_session, 'BOX06', 'SB06'), '700000000906')
        self._in_the_box(
            db_session, make_equipment(db_session, 'BOX07', 'SB07'), '700000000907')

        client.post(f'/api/work-plans/{plan.id}/schedule-sap-order',
                    json={'sap_order_id': placed.id, 'day_id': day.id},
                    headers=get_auth_header(client, admin_user.email, 'admin123'))

        response = client.get(
            f'/api/work-plans/available-jobs?plan_id={plan.id}',
            headers=get_auth_header(client, admin_user.email, 'admin123'))

        numbers = [o['order_number'] for o in response.get_json()['sap_orders']]
        assert '700000000906' not in numbers
        assert '700000000907' in numbers
