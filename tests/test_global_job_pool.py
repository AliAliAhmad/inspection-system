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
