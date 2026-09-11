"""Connecting a hand-typed job to the SAP order that arrives later.

Ali, 2026-09-10: "sometimes i make a manual job before i open the order in SAP
then when i opened in sap i need a connection between them and the order number
i think is the best one".

THE LIVE BUG THIS STARTED FROM
==============================

Sub-tasks, photos and voice notes hang on `anchor_for(job)`, which is derived
from `job.sap_order_number`. That is exactly what makes them survive a trip
through the pool — and exactly what made typing a real order number onto a hand
written job throw them away. Proven against the live endpoints before any of
this was written:

    BEFORE: ['Check the spreader']   anchor sap MAN-1-1
    PUT sap_order_number=700000123456  ->  200 OK
    AFTER:  []                       anchor sap 700000123456
    rows still in the table: 1

The rows were never deleted. The job simply stopped being able to see them, in
silence, during the one operation Ali described wanting to perform.
"""

from datetime import date, timedelta

import pytest

from tests.conftest import get_auth_header, make_equipment
from app.extensions import db
from app.models import WorkPlan, WorkPlanDay, WorkPlanJob, SAPWorkOrder


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


def _headers(client, admin_user):
    return get_auth_header(client, admin_user.email, 'admin123')


def _manual_job(plan, day, equipment, hours=4.0):
    job = WorkPlanJob(work_plan_day_id=day.id, job_type='corrective',
                      equipment_id=equipment.id,
                      sap_order_number=f'MAN-{plan.id}-1',
                      description='Refurb spreader - waiting for the order',
                      estimated_hours=hours, position=1)
    db.session.add(job)
    db.session.commit()
    return job


def _order(equipment, number='700000123456', hours=9.0, plan_id=None,
           status='pending'):
    order = SAPWorkOrder(work_plan_id=plan_id, order_number=number,
                         order_type='PRM', job_type='pm',
                         equipment_id=equipment.id, estimated_hours=hours,
                         priority='normal', status=status,
                         work_center='MECH',
                         description='GENERAL REFURBISHMENT')
    db.session.add(order)
    db.session.commit()
    return order


class TestNothingIsLostOnTheWay:

    def test_notes_and_photos_move_to_the_new_order(self, client, admin_user,
                                                    db_session, plan_day):
        """THE test. If this goes red the feature is destroying Ali's work."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'LNK01', 'SL01')
        job = _manual_job(plan, day, eq)
        _order(eq)
        headers = _headers(client, admin_user)

        client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                    json={'content': 'Check the spreader'}, headers=headers)

        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/{job.id}/link-sap-order',
            json={'order_number': '700000123456'}, headers=headers)
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()['moved_attachments'] == 1

        after = client.get(f'/api/work-plans/jobs/{job.id}/tasks', headers=headers)
        body = after.get_json()
        assert [t['content'] for t in body['tasks']] == ['Check the spreader'], \
            'the note was orphaned by the link'
        assert body['anchor_key'] == '700000123456'

    def test_the_plain_update_no_longer_orphans_them_either(
            self, client, admin_user, db_session, plan_day):
        """The guard is on PUT too, not only on the new endpoint.

        The link endpoint is the front door, but the plain update is still there
        and still accepts a number. Closing only the front door would leave the
        same data loss one call away.
        """
        plan, day = plan_day
        eq = make_equipment(db_session, 'LNK02', 'SL02')
        job = _manual_job(plan, day, eq)
        headers = _headers(client, admin_user)
        client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                    json={'content': 'Bring the 32mm socket'}, headers=headers)

        resp = client.put(f'/api/work-plans/{plan.id}/jobs/{job.id}',
                          json={'sap_order_number': '700000999999'},
                          headers=headers)
        assert resp.status_code == 200

        after = client.get(f'/api/work-plans/jobs/{job.id}/tasks', headers=headers)
        assert [t['content'] for t in after.get_json()['tasks']] == \
            ['Bring the 32mm socket']


class TestTheOrderMustBeReal:

    def test_an_unknown_number_is_refused(self, client, admin_user, db_session,
                                          plan_day):
        """The app cannot open an order in SAP, so an unknown number is a typo.

        A job pinned to a typo is a job nobody will ever close.
        """
        plan, day = plan_day
        eq = make_equipment(db_session, 'LNK03', 'SL03')
        job = _manual_job(plan, day, eq)

        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/{job.id}/link-sap-order',
            json={'order_number': '700000000000'}, headers=_headers(client, admin_user))
        assert resp.status_code == 404
        db.session.refresh(job)
        assert job.sap_order_number.startswith('MAN-'), 'the job was changed anyway'

    def test_a_job_that_is_already_a_sap_order_is_refused(
            self, client, admin_user, db_session, plan_day):
        plan, day = plan_day
        eq = make_equipment(db_session, 'LNK04', 'SL04')
        job = _manual_job(plan, day, eq)
        job.sap_order_number = '700000111111'
        _order(eq, '700000222222')
        db.session.commit()

        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/{job.id}/link-sap-order',
            json={'order_number': '700000222222'}, headers=_headers(client, admin_user))
        assert resp.status_code == 400

    def test_an_order_already_on_this_plan_is_refused(self, client, admin_user,
                                                      db_session, plan_day):
        """Two rows for one order is the state the pool exists to prevent."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'LNK05', 'SL05')
        job = _manual_job(plan, day, eq)
        _order(eq, '700000333333')
        db.session.add(WorkPlanJob(work_plan_day_id=day.id, job_type='pm',
                                   equipment_id=eq.id,
                                   sap_order_number='700000333333',
                                   description='already here',
                                   estimated_hours=3, position=2))
        db.session.commit()

        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/{job.id}/link-sap-order',
            json={'order_number': '700000333333'}, headers=_headers(client, admin_user))
        assert resp.status_code == 400


class TestWhatLinkingChanges:

    def test_the_order_leaves_the_pool(self, client, admin_user, db_session,
                                       plan_day):
        """Otherwise the same work sits in the box twice and can be dragged again."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'LNK06', 'SL06')
        job = _manual_job(plan, day, eq)
        order = _order(eq, '700000444444')

        client.post(f'/api/work-plans/{plan.id}/jobs/{job.id}/link-sap-order',
                    json={'order_number': '700000444444'},
                    headers=_headers(client, admin_user))

        db.session.refresh(order)
        assert order.status == 'scheduled'
        assert order.work_plan_id == plan.id

        resp = client.get(f'/api/work-plans/available-jobs?plan_id={plan.id}',
                          headers=_headers(client, admin_user))
        numbers = [o['order_number'] for o in resp.get_json()['sap_orders']]
        assert '700000444444' not in numbers

    def test_sap_hours_win_but_both_are_reported(self, client, admin_user,
                                                 db_session, plan_day):
        """Ali, 2026-09-11: "show both, sap hours win"."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'LNK07', 'SL07')
        job = _manual_job(plan, day, eq, hours=4.0)
        _order(eq, '700000555555', hours=9.0)

        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/{job.id}/link-sap-order',
            json={'order_number': '700000555555'}, headers=_headers(client, admin_user))

        hours = resp.get_json()['hours']
        assert hours['manual_estimate'] == 4.0
        assert hours['sap'] == 9.0
        assert hours['applied'] == 9.0, 'the day was not re-priced'
        db.session.refresh(job)
        assert float(job.estimated_hours) == 9.0

    def test_the_job_keeps_its_day(self, client, admin_user, db_session, plan_day):
        """Linking adds a number. It does not move the work Ali already placed."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'LNK08', 'SL08')
        job = _manual_job(plan, day, eq)
        _order(eq, '700000666666')

        client.post(f'/api/work-plans/{plan.id}/jobs/{job.id}/link-sap-order',
                    json={'order_number': '700000666666'},
                    headers=_headers(client, admin_user))
        db.session.refresh(job)
        assert job.work_plan_day_id == day.id


class TestSuggestingTheMatch:

    def test_candidates_are_the_same_machine_still_in_the_box(
            self, client, admin_user, db_session, plan_day):
        plan, day = plan_day
        eq = make_equipment(db_session, 'LNK09', 'SL09')
        other = make_equipment(db_session, 'LNK10', 'SL10')
        job = _manual_job(plan, day, eq)
        _order(eq, '700000777777')
        _order(other, '700000888888')          # different machine

        resp = client.get(
            f'/api/work-plans/{plan.id}/jobs/{job.id}/link-candidates',
            headers=_headers(client, admin_user))
        assert resp.status_code == 200
        numbers = [c['order_number'] for c in resp.get_json()['candidates']]
        assert numbers == ['700000777777']

    def test_nothing_is_suggested_once_the_job_is_linked(
            self, client, admin_user, db_session, plan_day):
        plan, day = plan_day
        eq = make_equipment(db_session, 'LNK11', 'SL11')
        job = _manual_job(plan, day, eq)
        _order(eq, '700000999111')

        headers = _headers(client, admin_user)
        client.post(f'/api/work-plans/{plan.id}/jobs/{job.id}/link-sap-order',
                    json={'order_number': '700000999111'}, headers=headers)

        resp = client.get(
            f'/api/work-plans/{plan.id}/jobs/{job.id}/link-candidates',
            headers=headers)
        assert resp.get_json()['already_linked'] is True
