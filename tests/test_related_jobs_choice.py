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


class TestEverythingIChoseLandsWhereIDroppedIt:
    """Ali, 2026-09-13: "in drag a job to a day, i get the pop up i choose drag
    all related job with, but not all comming or displaying in the day".

    Two separate faults, and his "coming OR displaying" was the right instinct —
    one of each.

    1. EVERY RELATED DEFECT WAS REFUSED. The board's confirm sent no
       equipment_id, and `POST /jobs` requires one for a defect. Defects are
       listed FIRST, and the web loop awaited inside a single try/catch, so the
       first refusal left every SAP order behind it unattempted.

    2. THEY LANDED IN THE MACHINE'S BERTH, NOT THE DROPPED ONE.
       `schedule_sap_order` stored `sap_order.berth` and ignored the column
       entirely, while `add_job` has always honoured what the client sent. Since
       `WorkPlanDay.to_dict` splits the payload into jobs_east / jobs_west /
       jobs_both and the board draws each column separately, the work was in the
       day and invisible in the column he was looking at.

       It hit the DRAGGED job too — the optimistic card drew where he dropped,
       then the refetch moved it to the other column in front of him.
    """

    def _west_machine(self, db_session, name='RSW1'):
        eq = make_equipment(db_session, name, name)
        eq.berth = 'west'
        db.session.commit()
        return eq

    def test_a_defect_is_added_with_the_payload_the_modal_actually_sends(
            self, client, admin_user, db_session, plan_day):
        """THE regression. This returned 400 every single time."""
        plan, day = plan_day
        eq = self._west_machine(db_session, 'RSW2')
        defect = _defect(db_session, eq)
        h = _headers(client, admin_user)

        candidates = client.post(
            f'/api/work-plans/{plan.id}/jobs',
            json={'day_id': day.id, 'job_type': 'pm', 'berth': 'east',
                  'equipment_id': eq.id, 'estimated_hours': 4,
                  'auto_group': False}, headers=h).get_json()['related_candidates']
        row = [c for c in candidates if c['kind'] == 'defect'][0]
        assert row['equipment_id'] == eq.id, \
            'the server must stamp the machine on every candidate'

        resp = client.post(f'/api/work-plans/{plan.id}/jobs',
                           json={'day_id': day.id, 'job_type': 'defect',
                                 'berth': 'east', 'defect_id': row['id'],
                                 'equipment_id': row['equipment_id'],
                                 'estimated_hours': row['estimated_hours'],
                                 'auto_group': False}, headers=h)
        assert resp.status_code == 201, resp.get_json()
        assert defect.id == row['id']

    def test_a_sap_order_lands_in_the_column_it_was_dropped_on(
            self, client, admin_user, db_session, plan_day):
        plan, day = plan_day
        eq = self._west_machine(db_session, 'RSW3')
        order = _order(db_session, eq, '700000900101')
        order.berth = 'west'
        db.session.commit()

        resp = client.post(f'/api/work-plans/{plan.id}/schedule-sap-order',
                           json={'sap_order_id': order.id, 'day_id': day.id,
                                 'berth': 'east', 'auto_group': False},
                           headers=_headers(client, admin_user))
        assert resp.status_code == 201
        assert resp.get_json()['job']['berth'] == 'east', \
            "the planner dropped on east; the machine's own berth does not win"

    def test_without_a_berth_it_still_uses_the_orders_own(
            self, client, admin_user, db_session, plan_day):
        """The fallback, pinned. Any caller that sends no berth is unchanged."""
        plan, day = plan_day
        eq = self._west_machine(db_session, 'RSW4')
        order = _order(db_session, eq, '700000900102')
        order.berth = 'west'
        db.session.commit()

        resp = client.post(f'/api/work-plans/{plan.id}/schedule-sap-order',
                           json={'sap_order_id': order.id, 'day_id': day.id,
                                 'auto_group': False},
                           headers=_headers(client, admin_user))
        assert resp.get_json()['job']['berth'] == 'west'

    def test_the_sweep_puts_its_jobs_in_the_dropped_column_too(
            self, client, admin_user, db_session, plan_day):
        """Otherwise the split comes back through the default path.

        auto_group=True is what every caller but the board uses. With the dragged
        job now honouring the dropped berth, a sweep still using the machine's
        berth would scatter the machine's work across two columns again.
        """
        plan, day = plan_day
        eq = self._west_machine(db_session, 'RSW5')
        first = _order(db_session, eq, '700000900103')
        second = _order(db_session, eq, '700000900104')
        for o in (first, second):
            o.berth = 'west'
        db.session.commit()

        client.post(f'/api/work-plans/{plan.id}/schedule-sap-order',
                    json={'sap_order_id': first.id, 'day_id': day.id,
                          'berth': 'east'},
                    headers=_headers(client, admin_user))

        berths = {j.berth for j in _day_jobs(plan)}
        assert berths == {'east'}, f'the machine got split across {berths}'

    def test_everything_chosen_is_drawn_in_the_one_column(
            self, client, admin_user, db_session, plan_day):
        """Ali's sentence, as an assertion.

        The board draws jobs_east / jobs_west / jobs_both separately, so "in the
        day" is not the same as "where I am looking". This walks the whole
        gesture: drop on east, tick everything, confirm.
        """
        plan, day = plan_day
        eq = self._west_machine(db_session, 'RSW6')
        dragged = _order(db_session, eq, '700000900105')
        for number in ('700000900106', '700000900107'):
            o = _order(db_session, eq, number)
            o.berth = 'west'
        dragged.berth = 'west'
        _defect(db_session, eq)
        db.session.commit()
        h = _headers(client, admin_user)

        candidates = client.post(
            f'/api/work-plans/{plan.id}/schedule-sap-order',
            json={'sap_order_id': dragged.id, 'day_id': day.id,
                  'berth': 'east', 'auto_group': False},
            headers=h).get_json()['related_candidates']
        assert len(candidates) == 3, candidates

        for c in candidates:
            if c['kind'] == 'sap':
                resp = client.post(
                    f'/api/work-plans/{plan.id}/schedule-sap-order',
                    json={'sap_order_id': c['id'], 'day_id': day.id,
                          'berth': 'east', 'auto_group': False}, headers=h)
            else:
                resp = client.post(
                    f'/api/work-plans/{plan.id}/jobs',
                    json={'day_id': day.id, 'job_type': 'defect',
                          'berth': 'east', 'defect_id': c['id'],
                          'equipment_id': c['equipment_id'],
                          'estimated_hours': c['estimated_hours'],
                          'auto_group': False}, headers=h)
            assert resp.status_code == 201, (c, resp.get_json())

        jobs = _day_jobs(plan)
        assert len(jobs) == 4, 'the dragged job plus all three chosen'

        payload = day.to_dict()
        assert len(payload['jobs_east']) == 4, (
            'every job he chose must be in the column he dropped on — '
            f"east={len(payload['jobs_east'])} west={len(payload['jobs_west'])} "
            f"both={len(payload['jobs_both'])}")
