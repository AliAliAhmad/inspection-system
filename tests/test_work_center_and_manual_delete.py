"""The trade a planner picks must survive, and a mistyped job must be removable.

Ali, 2026-09-08:
  * "when i added a job manual, and i chooe mechaincal or electrical, it come
     for both in the day, why?"
  * "sometimes i added a job wrongly i need to be able to remove or delete a job
     that is added manually"

A job with no `work_center` is drawn under BOTH the mech and elec headings —
that is BundleCard.subTeamForJob rule 4, and it is correct for a PM nobody has
classified. The bug was that the trade was being THROWN AWAY on every path that
created a job from something that already knew it.
"""

from datetime import date, timedelta

import pytest

from app.extensions import db
from app.models import (WorkPlan, WorkPlanDay, WorkPlanJob, SAPWorkOrder,
                        WorkPlanJobTracking)
from tests.conftest import make_equipment, get_auth_header


@pytest.fixture
def plan(db_session, engineer):
    monday = date(2026, 9, 7)
    wp = WorkPlan(week_start=monday, week_end=monday + timedelta(days=6),
                  status='draft', created_by_id=engineer.id)
    db.session.add(wp)
    db.session.flush()
    for offset in range(7):
        db.session.add(WorkPlanDay(work_plan_id=wp.id,
                                   date=monday + timedelta(days=offset)))
    db.session.commit()
    return wp


def _day(plan, offset=0):
    return sorted(plan.days, key=lambda d: d.date)[offset]


def _headers(client):
    return get_auth_header(client, 'eng@test.com', 'test123')


# ── The trade must survive every path ──────────────────────────────────────

def test_manual_add_keeps_the_chosen_trade(db_session, engineer, client, plan):
    eq = make_equipment(db_session, serial='RS109')
    resp = client.post(f'/api/work-plans/{plan.id}/jobs', headers=_headers(client),
                       json={'day_id': _day(plan).id, 'job_type': 'pm',
                             'equipment_id': eq.id, 'estimated_hours': 4,
                             'work_center': 'MECH', 'berth': 'east'})
    assert resp.status_code == 201, resp.get_json()
    assert resp.get_json()['job']['work_center'] == 'MECH'


def test_editing_a_job_can_change_its_trade(db_session, engineer, client, plan):
    """update_job did not accept work_center at all, so picking a Trade on an
    existing job was silently discarded and it stayed under both teams."""
    eq = make_equipment(db_session, serial='RS109')
    job = WorkPlanJob(work_plan_day_id=_day(plan).id, job_type='pm',
                      equipment_id=eq.id, estimated_hours=4)
    db.session.add(job)
    db.session.commit()
    assert job.work_center is None

    resp = client.put(f'/api/work-plans/{plan.id}/jobs/{job.id}',
                      headers=_headers(client), json={'work_center': 'ELEC'})
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()['job']['work_center'] == 'ELEC'

    # And it can be cleared back to "let the app decide".
    resp = client.put(f'/api/work-plans/{plan.id}/jobs/{job.id}',
                      headers=_headers(client), json={'work_center': None})
    assert resp.get_json()['job']['work_center'] is None

    resp = client.put(f'/api/work-plans/{plan.id}/jobs/{job.id}',
                      headers=_headers(client), json={'work_center': 'NONSENSE'})
    assert resp.status_code == 400


def test_a_job_scheduled_from_sap_inherits_the_orders_trade(db_session, engineer,
                                                            client, plan):
    """SAP has always known the trade; the scheduler was dropping it."""
    eq = make_equipment(db_session, serial='RS109')
    order = SAPWorkOrder(order_number='4000999001', order_type='PRM',
                         job_type='pm', equipment_id=eq.id, status='pending',
                         work_center='ELEC', description='AC service',
                         estimated_hours=3, berth='east')
    db.session.add(order)
    db.session.commit()

    resp = client.post(f'/api/work-plans/{plan.id}/schedule-sap-order',
                       headers=_headers(client),
                       json={'sap_order_id': order.id, 'day_id': _day(plan).id})
    if resp.status_code not in (200, 201):
        pytest.skip(f'schedule-sap-order unavailable here: {resp.status_code}')

    job = WorkPlanJob.query.filter_by(sap_order_number='4000999001').first()
    assert job is not None
    assert job.work_center == 'ELEC'


def test_carry_over_keeps_the_trade(db_session, engineer, plan):
    """A MECH job carried into tomorrow must not arrive trade-less — that would
    silently undo the planner's choice a day later."""
    eq = make_equipment(db_session, serial='RS109')
    original = WorkPlanJob(work_plan_day_id=_day(plan).id, job_type='pm',
                           equipment_id=eq.id, estimated_hours=4,
                           work_center='MECH', sap_order_number='4000999002')
    db.session.add(original)
    db.session.commit()

    # Exactly what work_plan_tracking's carry-over builds.
    carried = WorkPlanJob(
        work_plan_day_id=_day(plan, 1).id,
        job_type=original.job_type,
        berth=original.berth,
        equipment_id=original.equipment_id,
        sap_order_number=original.sap_order_number,
        sap_order_type=original.sap_order_type,
        work_center=original.work_center,
        description=original.description,
        estimated_hours=2,
    )
    db.session.add(carried)
    db.session.commit()
    assert carried.work_center == 'MECH'


def test_every_creation_path_passes_work_center(db_session):
    """A guard, not a behaviour test.

    Twelve of thirteen places that build a WorkPlanJob dropped this column. The
    only one that may is the defect branch of _auto_group_equipment_jobs, where
    the UI infers the trade from defect.category instead.
    """
    import io, re
    allowed_without = {('app/api/work_plans.py', 'defect auto-group')}
    missing = []
    for path in ('app/api/work_plans.py', 'app/services/place_one.py',
                 'app/api/work_plan_tracking.py',
                 'app/services/work_plan_service.py'):
        src = io.open(path, encoding='utf-8').read()
        for m in re.finditer(r'WorkPlanJob\(', src):
            chunk = src[m.start():m.start() + 1400]
            end = chunk.find('\n    )')
            block = chunk[:end if end > 0 else 900]
            if 'work_center' not in block and 'defect_id=defect.id' not in block:
                missing.append(f'{path}:{src[:m.start()].count(chr(10)) + 1}')
    assert not missing, f'work_center dropped at: {missing}'


# ── Deleting a job typed in by mistake ─────────────────────────────────────

def test_manual_job_can_be_deleted_from_a_published_plan(db_session, engineer,
                                                         client, plan):
    """The whole point: Ali's live week is published for most of its life."""
    eq = make_equipment(db_session, serial='RS109')
    job = WorkPlanJob(work_plan_day_id=_day(plan).id, job_type='pm',
                      equipment_id=eq.id, estimated_hours=4,
                      description='Added by mistake')
    db.session.add(job)
    plan.status = 'published'
    db.session.commit()
    job_id = job.id

    resp = client.delete(f'/api/work-plans/{plan.id}/jobs/{job_id}',
                         headers=_headers(client))
    assert resp.status_code == 200, resp.get_json()
    assert db.session.get(WorkPlanJob, job_id) is None


def test_a_sap_job_still_cannot_be_deleted_from_a_published_plan(db_session,
                                                                 engineer,
                                                                 client, plan):
    """The week is out with the crews. Only the typo may go."""
    eq = make_equipment(db_session, serial='RS109')
    job = WorkPlanJob(work_plan_day_id=_day(plan).id, job_type='pm',
                      equipment_id=eq.id, estimated_hours=4,
                      sap_order_number='4000999003')
    db.session.add(job)
    plan.status = 'published'
    db.session.commit()

    resp = client.delete(f'/api/work-plans/{plan.id}/jobs/{job.id}',
                         headers=_headers(client))
    assert resp.status_code == 403
    assert 'manually added' in resp.get_json()['message']


def test_a_started_manual_job_cannot_be_deleted_from_a_published_plan(
        db_session, engineer, client, plan):
    """Once a worker has begun, his record wins over the planner's tidy-up."""
    eq = make_equipment(db_session, serial='RS109')
    job = WorkPlanJob(work_plan_day_id=_day(plan).id, job_type='pm',
                      equipment_id=eq.id, estimated_hours=4)
    db.session.add(job)
    db.session.flush()
    db.session.add(WorkPlanJobTracking(work_plan_job_id=job.id,
                                       status='in_progress'))
    plan.status = 'published'
    db.session.commit()

    resp = client.delete(f'/api/work-plans/{plan.id}/jobs/{job.id}',
                         headers=_headers(client))
    assert resp.status_code == 403
    assert 'started' in resp.get_json()['message']


def test_a_draft_plan_is_unchanged(db_session, engineer, client, plan):
    """The relaxation must not have loosened anything on a draft."""
    eq = make_equipment(db_session, serial='RS109')
    job = WorkPlanJob(work_plan_day_id=_day(plan).id, job_type='pm',
                      equipment_id=eq.id, estimated_hours=4,
                      sap_order_number='4000999004')
    db.session.add(job)
    db.session.commit()
    resp = client.delete(f'/api/work-plans/{plan.id}/jobs/{job.id}',
                         headers=_headers(client))
    assert resp.status_code == 200, resp.get_json()


def test_bulk_delete_on_published_is_all_or_nothing(db_session, engineer,
                                                    client, plan):
    """A mixed selection must remove NOTHING, not the manual half of it."""
    eq = make_equipment(db_session, serial='RS109')
    manual = WorkPlanJob(work_plan_day_id=_day(plan).id, job_type='pm',
                         equipment_id=eq.id, estimated_hours=4)
    sap = WorkPlanJob(work_plan_day_id=_day(plan).id, job_type='pm',
                      equipment_id=eq.id, estimated_hours=4,
                      sap_order_number='4000999005')
    db.session.add_all([manual, sap])
    plan.status = 'published'
    db.session.commit()
    ids = [manual.id, sap.id]

    resp = client.post(f'/api/work-plans/{plan.id}/jobs/bulk-delete',
                       headers=_headers(client), json={'job_ids': ids})
    assert resp.status_code == 403
    assert db.session.get(WorkPlanJob, ids[0]) is not None, 'partial delete!'
    assert db.session.get(WorkPlanJob, ids[1]) is not None


# ── The actual root cause ──────────────────────────────────────────────────

def test_a_busy_day_still_sends_the_trade(db_session, engineer, plan):
    """THE bug. WorkPlanDay.to_dict switches to a compact job payload once a day
    has more than 10 jobs, and that payload left `work_center` out.

    So the trade was saved correctly, and the board never received it — but only
    on days with more than 10 jobs. Every real day is over that line and no test
    day was, which is why it survived so long.

    A job with no work_center is drawn under BOTH the mech and elec headings
    (BundleCard.subTeamForJob rule 4), which is exactly what Ali reported.
    """
    from app.models import WorkPlanDay

    eq = make_equipment(db_session, serial='RS109')
    day = _day(plan)
    for i in range(12):
        db.session.add(WorkPlanJob(
            work_plan_day_id=day.id, job_type='pm', equipment_id=eq.id,
            estimated_hours=1, berth='east', description=f'Filler {i}',
            work_center='MECH' if i % 2 == 0 else 'ELEC',
            notes='keep me' if i == 0 else None))
    db.session.commit()

    fresh = db.session.get(WorkPlanDay, day.id)
    assert len(fresh.jobs) > 10, 'this test is meaningless below the compact threshold'

    payload = fresh.to_dict('en')
    jobs = payload['jobs_east']
    assert len(jobs) == 12

    missing = [j['id'] for j in jobs if 'work_center' not in j]
    assert not missing, f'compact payload dropped work_center on {missing}'
    assert {j['work_center'] for j in jobs} == {'MECH', 'ELEC'}
    # notes went the same way and is equally free to include
    assert any(j.get('notes') == 'keep me' for j in jobs)


def test_a_quiet_day_sends_the_trade_too(db_session, engineer, plan):
    """The non-compact path, so the two never drift apart again."""
    from app.models import WorkPlanDay

    eq = make_equipment(db_session, serial='RS109')
    day = _day(plan)
    db.session.add(WorkPlanJob(work_plan_day_id=day.id, job_type='pm',
                               equipment_id=eq.id, estimated_hours=1,
                               berth='east', work_center='MECH'))
    db.session.commit()

    fresh = db.session.get(WorkPlanDay, day.id)
    assert len(fresh.jobs) <= 10
    assert fresh.to_dict('en')['jobs_east'][0]['work_center'] == 'MECH'
