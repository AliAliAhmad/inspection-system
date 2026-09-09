"""Dropping one job must not drag the whole machine in behind it.

Ali, 2026-09-09: "when i drag any job from the pool to the card it bring with it
all the jobs related to the reference machine, what i need, the app to ask me if
i need to transfer all jobs or only this job, better that the app can display all
the job and i select from them what i need to load in the day".

THE SHAPE OF THE FIX, AND WHY THE DEFAULT DID NOT MOVE
======================================================

`auto_group` defaults to TRUE on both endpoints — exactly what they have always
done. The web board is the only caller that passes false, and when it does the
server adds nothing extra and instead RETURNS the list it would have added, so
the planner can pick.

Keeping the default means no other caller, no cached client and no existing test
changes behaviour. The first test here pins that on purpose: if someone ever
flips the default to false, a planner's day quietly stops filling and nobody
finds out until a crew is standing at the wrong machine.

The candidate list and the auto-add sweep read from ONE query
(`_related_equipment_work`), so the modal can never offer a job the adder would
have skipped — a chooser that lies is worse than no chooser.
"""

from datetime import date, timedelta

import pytest

from tests.conftest import get_auth_header, make_equipment
from app.extensions import db
from app.models import WorkPlan, WorkPlanDay, WorkPlanJob, SAPWorkOrder, Defect


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


def _order(db_session, equipment, number, hours=4.0):
    order = SAPWorkOrder(
        work_plan_id=None, order_number=number, order_type='PRM',
        job_type='pm', equipment_id=equipment.id, estimated_hours=hours,
        priority='normal', status='pending',
        description=f'Service {number}')
    db_session.session.add(order)
    db_session.session.commit()
    return order


def _defect(db_session, equipment, description='Cracked glass', severity='high'):
    defect = Defect(equipment_id_direct=equipment.id, description=description,
                    severity=severity, status='open',
                    due_date=date.today() + timedelta(days=7))
    db_session.session.add(defect)
    db_session.session.commit()
    return defect


def _headers(client, admin_user):
    return get_auth_header(client, admin_user.email, 'admin123')


def _day_jobs(plan):
    return (WorkPlanJob.query.join(WorkPlanDay)
            .filter(WorkPlanDay.work_plan_id == plan.id).all())


class TestTheDefaultDidNotMove:
    """Everything that does not ask for the new behaviour keeps the old one."""

    def test_scheduling_without_the_flag_still_sweeps_the_machine(
            self, client, admin_user, db_session, plan_day):
        plan, day = plan_day
        eq = make_equipment(db_session, 'REL01', 'SR01')
        first = _order(db_session, eq, '700000009001')
        _order(db_session, eq, '700000009002')

        resp = client.post(f'/api/work-plans/{plan.id}/schedule-sap-order',
                           json={'sap_order_id': first.id, 'day_id': day.id},
                           headers=_headers(client, admin_user))

        assert resp.status_code == 201
        body = resp.get_json()
        assert body['auto_added_defects'] == 1, 'the old sweep must be untouched'
        # And nothing is offered, because nothing was withheld.
        assert body.get('related_candidates') == []

    def test_add_job_without_the_flag_still_sweeps(
            self, client, admin_user, db_session, plan_day):
        plan, day = plan_day
        eq = make_equipment(db_session, 'REL02', 'SR02')
        _order(db_session, eq, '700000009003')

        resp = client.post(f'/api/work-plans/{plan.id}/jobs',
                           json={'day_id': day.id, 'job_type': 'corrective',
                                 'equipment_id': eq.id, 'estimated_hours': 3,
                                 'description': 'Typed by hand'},
                           headers=_headers(client, admin_user))

        assert resp.status_code == 201
        assert resp.get_json()['auto_added_defects'] == 1


class TestAskingInstead:
    """auto_group false: place what was dragged, offer the rest."""

    def test_only_the_dropped_order_lands_and_the_rest_is_offered(
            self, client, admin_user, db_session, plan_day):
        plan, day = plan_day
        eq = make_equipment(db_session, 'REL03', 'SR03')
        first = _order(db_session, eq, '700000009004')
        _order(db_session, eq, '700000009005', hours=6.0)
        _defect(db_session, eq, 'Hydraulic leak', 'critical')

        resp = client.post(f'/api/work-plans/{plan.id}/schedule-sap-order',
                           json={'sap_order_id': first.id, 'day_id': day.id,
                                 'auto_group': False},
                           headers=_headers(client, admin_user))

        assert resp.status_code == 201
        body = resp.get_json()
        assert body['auto_added_defects'] == 0

        # Exactly one job on the day: the one he dragged.
        assert len(_day_jobs(plan)) == 1

        # The other two are offered, with what they cost.
        offered = body['related_candidates']
        assert len(offered) == 2
        by_kind = {c['kind'] for c in offered}
        assert by_kind == {'sap', 'defect'}
        sap_row = next(c for c in offered if c['kind'] == 'sap')
        assert sap_row['reference'] == '700000009005'
        assert sap_row['estimated_hours'] == 6.0
        defect_row = next(c for c in offered if c['kind'] == 'defect')
        assert defect_row['description'] == 'Hydraulic leak'
        assert defect_row['severity'] == 'critical'

    def test_the_dropped_job_does_not_offer_itself(
            self, client, admin_user, db_session, plan_day):
        """The flush before the query is what makes this true.

        Without it the just-added defect is not yet visible to the
        already-scheduled subquery, so the planner is asked whether he would
        like to add the job he just dragged.
        """
        plan, day = plan_day
        eq = make_equipment(db_session, 'REL04', 'SR04')
        defect = _defect(db_session, eq, 'Worn brake pad')

        resp = client.post(f'/api/work-plans/{plan.id}/jobs',
                           json={'day_id': day.id, 'job_type': 'defect',
                                 'equipment_id': eq.id, 'defect_id': defect.id,
                                 'estimated_hours': 2, 'auto_group': False},
                           headers=_headers(client, admin_user))

        assert resp.status_code == 201
        assert resp.get_json()['related_candidates'] == []

    def test_a_machine_with_nothing_else_open_offers_nothing(
            self, client, admin_user, db_session, plan_day):
        """No list means the board asks no question — no dialog over an empty list."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'REL05', 'SR05')
        only = _order(db_session, eq, '700000009006')

        resp = client.post(f'/api/work-plans/{plan.id}/schedule-sap-order',
                           json={'sap_order_id': only.id, 'day_id': day.id,
                                 'auto_group': False},
                           headers=_headers(client, admin_user))

        assert resp.get_json()['related_candidates'] == []

    def test_a_defect_already_on_the_plan_is_not_offered_twice(
            self, client, admin_user, db_session, plan_day):
        """The chooser must not offer work that is already in the week."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'REL06', 'SR06')
        already = _defect(db_session, eq, 'Already planned')
        db.session.add(WorkPlanJob(work_plan_day_id=day.id, job_type='defect',
                                   equipment_id=eq.id, defect_id=already.id,
                                   description='Already planned',
                                   estimated_hours=2.0, position=1))
        db.session.commit()

        dropped = _order(db_session, eq, '700000009007')
        resp = client.post(f'/api/work-plans/{plan.id}/schedule-sap-order',
                           json={'sap_order_id': dropped.id, 'day_id': day.id,
                                 'auto_group': False},
                           headers=_headers(client, admin_user))

        offered = resp.get_json()['related_candidates']
        assert all(c['kind'] != 'defect' for c in offered), \
            'a defect already on the plan was offered again'


class TestPickingSome:
    """What the board does after the planner ticks boxes."""

    def test_adding_a_chosen_job_does_not_set_off_another_sweep(
            self, client, admin_user, db_session, plan_day):
        """Every follow-up add carries auto_group false too.

        Without that, ticking ONE related job would pull the remaining ones in
        behind it — the planner would have been asked, answered, and then
        overruled. This is the whole point of the feature.
        """
        plan, day = plan_day
        eq = make_equipment(db_session, 'REL07', 'SR07')
        dropped = _order(db_session, eq, '700000009008')
        chosen = _order(db_session, eq, '700000009009')
        _order(db_session, eq, '700000009010')      # deliberately NOT chosen

        headers = _headers(client, admin_user)
        client.post(f'/api/work-plans/{plan.id}/schedule-sap-order',
                    json={'sap_order_id': dropped.id, 'day_id': day.id,
                          'auto_group': False}, headers=headers)
        client.post(f'/api/work-plans/{plan.id}/schedule-sap-order',
                    json={'sap_order_id': chosen.id, 'day_id': day.id,
                          'auto_group': False}, headers=headers)

        numbers = sorted(j.sap_order_number for j in _day_jobs(plan))
        assert numbers == ['700000009008', '700000009009'], \
            'the un-ticked order was pulled in anyway'

    def test_the_unpicked_job_stays_in_the_pool(
            self, client, admin_user, db_session, plan_day):
        """Saying no must leave it available, not lose it."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'REL08', 'SR08')
        dropped = _order(db_session, eq, '700000009011')
        left = _order(db_session, eq, '700000009012')

        client.post(f'/api/work-plans/{plan.id}/schedule-sap-order',
                    json={'sap_order_id': dropped.id, 'day_id': day.id,
                          'auto_group': False},
                    headers=_headers(client, admin_user))

        db.session.refresh(left)
        assert left.status == 'pending'
        assert left.work_plan_id is None, 'it must still be in the global box'

        resp = client.get(f'/api/work-plans/available-jobs?plan_id={plan.id}',
                          headers=_headers(client, admin_user))
        numbers = [o['order_number'] for o in resp.get_json()['sap_orders']]
        assert '700000009012' in numbers
