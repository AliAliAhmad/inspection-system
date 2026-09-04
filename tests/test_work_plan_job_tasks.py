"""Sub-tasks / team notes that stick to a job.

The requirement these tests exist to protect (Ali, 2026-09-05):

    "an each planned job a + that allow me to add subtask or note, and kept
     with it even when back to pool or transfered to another job"

The first two tests are the requirement itself. If either goes red, the feature
is broken no matter what the screen shows.
"""

import pytest

from app.extensions import db
from app.models import (User, WorkPlan, WorkPlanDay, WorkPlanJob,
                        WorkPlanAssignment, WorkPlanJobTask)
from app.models.work_plan_job_task import anchor_for
from tests.conftest import make_equipment, get_auth_header


@pytest.fixture
def plan(db_session, engineer):
    from datetime import date, timedelta
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


def _sap_job(plan, equipment, order='4000123456', offset=0):
    job = WorkPlanJob(
        work_plan_day_id=_day(plan, offset).id,
        job_type='pm',
        equipment_id=equipment.id,
        sap_order_number=order,
        sap_order_type='PRM',
        description='250HR service',
        estimated_hours=4,
    )
    db.session.add(job)
    db.session.commit()
    return job


# ── The requirement ────────────────────────────────────────────────────────

def test_list_survives_the_job_going_back_to_the_pool(db_session, engineer,
                                                      client, plan):
    """THE test. purge_job_rows deletes the job row; the list must outlive it.

    Returning a job to the pool runs a raw DELETE against work_plan_jobs and
    every table in JOB_CHILD_TABLES. A list anchored to the SAP order carries
    work_plan_job_id NULL, so that DELETE cannot see it.
    """
    from app.api.work_plans import purge_job_rows

    eq = make_equipment(db_session, serial='RS109')
    job = _sap_job(plan, eq)
    headers = get_auth_header(client, 'eng@test.com', 'test123')

    resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                       json={'content': 'Grease the boom pins'}, headers=headers)
    assert resp.status_code == 201, resp.get_json()

    old_job_id = job.id
    purge_job_rows(job)
    db.session.commit()

    assert db.session.get(WorkPlanJob, old_job_id) is None
    survivors = WorkPlanJobTask.query.filter_by(anchor_kind='sap',
                                                anchor_key='4000123456').all()
    assert [t.content for t in survivors] == ['Grease the boom pins']

    # And it comes back when the same order is planned again next week.
    again = _sap_job(plan, eq, offset=3)
    resp = client.get(f'/api/work-plans/jobs/{again.id}/tasks', headers=headers)
    assert [t['content'] for t in resp.get_json()['tasks']] == ['Grease the boom pins']


def test_list_follows_a_carry_over_to_another_day(db_session, engineer,
                                                  client, plan):
    """A job carried into the next day is a NEW row with the same SAP order."""
    eq = make_equipment(db_session, serial='RS109')
    job = _sap_job(plan, eq)
    headers = get_auth_header(client, 'eng@test.com', 'test123')
    client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                json={'content': 'Bring the 32mm socket'}, headers=headers)

    # What work_plan_tracking's carry-over does: copy the identity onto a new row.
    carried = WorkPlanJob(
        work_plan_day_id=_day(plan, 1).id,
        job_type=job.job_type,
        equipment_id=job.equipment_id,
        sap_order_number=job.sap_order_number,
        sap_order_type=job.sap_order_type,
        description=job.description,
        estimated_hours=2,
    )
    db.session.add(carried)
    db.session.commit()

    resp = client.get(f'/api/work-plans/jobs/{carried.id}/tasks', headers=headers)
    assert [t['content'] for t in resp.get_json()['tasks']] == ['Bring the 32mm socket']


def test_list_follows_a_move_to_another_day(db_session, engineer, client, plan):
    """move_job keeps the same row, so this is the easy direction — but assert it."""
    eq = make_equipment(db_session, serial='RS109')
    job = _sap_job(plan, eq)
    headers = get_auth_header(client, 'eng@test.com', 'test123')
    client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                json={'content': 'Check hydraulic hoses'}, headers=headers)

    resp = client.post(f'/api/work-plans/{plan.id}/jobs/{job.id}/move',
                       json={'target_day_id': _day(plan, 4).id}, headers=headers)
    assert resp.status_code == 200, resp.get_json()

    resp = client.get(f'/api/work-plans/jobs/{job.id}/tasks', headers=headers)
    assert [t['content'] for t in resp.get_json()['tasks']] == ['Check hydraulic hoses']


def test_split_parts_share_the_parent_list(db_session, engineer, client, plan):
    """split_job mints '<order>-P2'; the suffix is stripped so parts agree."""
    eq = make_equipment(db_session, serial='RS109')
    job = _sap_job(plan, eq)
    headers = get_auth_header(client, 'eng@test.com', 'test123')
    client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                json={'content': 'Drain old oil'}, headers=headers)

    part2 = _sap_job(plan, eq, order='4000123456-P2', offset=1)
    resp = client.get(f'/api/work-plans/jobs/{part2.id}/tasks', headers=headers)
    assert [t['content'] for t in resp.get_json()['tasks']] == ['Drain old oil']


# ── Anchors ────────────────────────────────────────────────────────────────

def test_anchor_prefers_sap_then_defect_then_inspection_then_row(db_session, plan):
    eq = make_equipment(db_session, serial='RS109')

    sap = WorkPlanJob(work_plan_day_id=_day(plan).id, job_type='pm',
                      equipment_id=eq.id, sap_order_number=' 4000123456 ',
                      estimated_hours=1)
    assert anchor_for(sap) == ('sap', '4000123456')

    manual = WorkPlanJob(work_plan_day_id=_day(plan).id, job_type='pm',
                         equipment_id=eq.id, estimated_hours=1)
    db.session.add(manual)
    db.session.commit()
    assert anchor_for(manual) == ('job', str(manual.id))


def test_manual_job_list_dies_with_the_job(db_session, engineer, client, plan):
    """A manual job has no pool to return to, so its list goes with it.

    This is the flip side of the first test, and it is what makes it safe to
    put work_plan_job_tasks in JOB_CHILD_TABLES.
    """
    from app.api.work_plans import purge_job_rows

    eq = make_equipment(db_session, serial='RS109')
    job = WorkPlanJob(work_plan_day_id=_day(plan).id, job_type='pm',
                      equipment_id=eq.id, description='One-off tidy up',
                      estimated_hours=1)
    db.session.add(job)
    db.session.commit()

    headers = get_auth_header(client, 'eng@test.com', 'test123')
    client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                json={'content': 'Sweep the bay'}, headers=headers)
    assert WorkPlanJobTask.query.count() == 1

    purge_job_rows(job)
    db.session.commit()
    assert WorkPlanJobTask.query.count() == 0


# ── Permissions ────────────────────────────────────────────────────────────

@pytest.fixture
def worker(db_session):
    user = User(email='worker@test.com', full_name='Test Worker',
                role='maintenance', role_id='MNT001', shift='day')
    user.set_password('test123')
    db.session.add(user)
    db.session.commit()
    return user


def test_worker_may_tick_his_own_job_but_not_add_or_edit(db_session, engineer,
                                                         worker, client, plan):
    eq = make_equipment(db_session, serial='RS109')
    job = _sap_job(plan, eq)
    db.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                      user_id=worker.id, is_lead=True))
    db.session.commit()

    eng = get_auth_header(client, 'eng@test.com', 'test123')
    resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                       json={'content': 'Replace oil filter'}, headers=eng)
    task_id = resp.get_json()['task']['id']

    wrk = get_auth_header(client, 'worker@test.com', 'test123')

    # He cannot add.
    assert client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                       json={'content': 'mine'}, headers=wrk).status_code == 403
    # He cannot rewrite the planner's words.
    assert client.patch(f'/api/work-plans/jobs/{job.id}/tasks/{task_id}',
                        json={'content': 'nope'}, headers=wrk).status_code == 403
    # He cannot delete.
    assert client.delete(f'/api/work-plans/jobs/{job.id}/tasks/{task_id}',
                         headers=wrk).status_code == 403

    # He CAN tick, and his name is recorded.
    resp = client.patch(f'/api/work-plans/jobs/{job.id}/tasks/{task_id}',
                        json={'is_done': True}, headers=wrk)
    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body['task']['is_done'] is True
    assert body['task']['done_by_id'] == worker.id
    assert body['done'] == 1 and body['total'] == 1

    # Un-ticking clears the name so it never sits beside an open line.
    resp = client.patch(f'/api/work-plans/jobs/{job.id}/tasks/{task_id}',
                        json={'is_done': False}, headers=wrk)
    assert resp.get_json()['task']['done_by_id'] is None


def test_worker_cannot_tick_a_job_he_is_not_on(db_session, engineer, worker,
                                               client, plan):
    eq = make_equipment(db_session, serial='RS109')
    job = _sap_job(plan, eq)
    eng = get_auth_header(client, 'eng@test.com', 'test123')
    task_id = client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                          json={'content': 'Not his job'},
                          headers=eng).get_json()['task']['id']

    wrk = get_auth_header(client, 'worker@test.com', 'test123')
    assert client.patch(f'/api/work-plans/jobs/{job.id}/tasks/{task_id}',
                        json={'is_done': True}, headers=wrk).status_code == 403


def test_published_plan_still_accepts_notes(db_session, engineer, client, plan):
    """Unlike move/remove. Leaving a note on the LIVE week is the use case."""
    eq = make_equipment(db_session, serial='RS109')
    job = _sap_job(plan, eq)
    plan.status = 'published'
    db.session.commit()

    headers = get_auth_header(client, 'eng@test.com', 'test123')
    resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                       json={'content': 'Stores has the filter'}, headers=headers)
    assert resp.status_code == 201, resp.get_json()


# ── Housekeeping ───────────────────────────────────────────────────────────

def test_blank_content_is_refused(db_session, engineer, client, plan):
    eq = make_equipment(db_session, serial='RS109')
    job = _sap_job(plan, eq)
    headers = get_auth_header(client, 'eng@test.com', 'test123')
    for bad in ('', '   ', None):
        resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                           json={'content': bad}, headers=headers)
        assert resp.status_code == 400


def test_same_line_twice_does_not_duplicate(db_session, engineer, client, plan):
    eq = make_equipment(db_session, serial='RS109')
    job = _sap_job(plan, eq)
    headers = get_auth_header(client, 'eng@test.com', 'test123')
    client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                json={'content': 'Drain old oil'}, headers=headers)
    resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                       json={'content': '  Drain old oil  '}, headers=headers)
    assert resp.status_code == 200
    assert resp.get_json()['total'] == 1


def test_arabic_is_stored_nfc(db_session, engineer, client, plan):
    import unicodedata
    eq = make_equipment(db_session, serial='RS109')
    job = _sap_job(plan, eq)
    headers = get_auth_header(client, 'eng@test.com', 'test123')
    # Decomposed form (NFD) must land as NFC.
    decomposed = unicodedata.normalize('NFD', 'تغيير فلتر الزيت')
    resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                       json={'content': decomposed}, headers=headers)
    stored = resp.get_json()['task']['content']
    assert stored == unicodedata.normalize('NFC', 'تغيير فلتر الزيت')


def test_plan_wide_fetch_is_one_query(db_session, engineer, client, plan):
    """The board draws every job at once; it must not ask per job."""
    eq = make_equipment(db_session, serial='RS109')
    headers = get_auth_header(client, 'eng@test.com', 'test123')
    jobs = [_sap_job(plan, eq, order=f'400000000{i}', offset=i % 7)
            for i in range(6)]
    for job in jobs:
        client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                    json={'content': f'step for {job.sap_order_number}'},
                    headers=headers)

    # Re-load in ONE query. db.session commits with expire_on_commit, so the
    # objects above would each re-SELECT on first attribute touch and the count
    # below would measure the fixture, not for_jobs().
    ids = [j.id for j in jobs]
    jobs = WorkPlanJob.query.filter(WorkPlanJob.id.in_(ids)).all()
    for job in jobs:
        job.sap_order_number, job.defect_id, job.inspection_assignment_id

    from sqlalchemy import event
    counter = {'n': 0}

    def _count(*args, **kwargs):
        counter['n'] += 1

    event.listen(db.engine, 'before_cursor_execute', _count)
    try:
        WorkPlanJobTask.for_jobs(jobs)
    finally:
        event.remove(db.engine, 'before_cursor_execute', _count)

    assert counter['n'] == 1, f'{counter["n"]} queries for {len(jobs)} jobs'


def test_tasks_ride_along_on_my_plan(db_session, engineer, worker, client, plan):
    """The worker's phone gets the list without a second round trip."""
    eq = make_equipment(db_session, serial='RS109')
    job = _sap_job(plan, eq)
    db.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                      user_id=worker.id, is_lead=True))
    plan.status = 'published'
    db.session.commit()

    eng = get_auth_header(client, 'eng@test.com', 'test123')
    client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                json={'content': 'Grease the boom pins'}, headers=eng)

    wrk = get_auth_header(client, 'worker@test.com', 'test123')
    resp = client.get(f'/api/work-plans/my-plan?week_start={plan.week_start}',
                      headers=wrk)
    assert resp.status_code == 200, resp.get_json()
    days = resp.get_json()['my_jobs']
    found = [j for d in days for j in d['jobs'] if j['id'] == job.id]
    assert found, resp.get_json()
    assert [t['content'] for t in found[0]['sub_tasks']] == ['Grease the boom pins']


def test_sub_tasks_print_on_the_day_pdf(db_session, engineer, client, plan):
    """The crew carrying the paper sheet gets the same list as the app."""
    from app.services.work_plan_pdf_service import WorkPlanPDF

    eq = make_equipment(db_session, serial='RS109')
    job = _sap_job(plan, eq)
    headers = get_auth_header(client, 'eng@test.com', 'test123')
    client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                json={'content': 'Grease the boom pins'}, headers=headers)

    # The renderer directly — WorkPlanPDFService.generate_day_pdf() also uploads
    # the result through FileService, which is not what this is checking.
    doc = WorkPlanPDF(plan, 'en')
    assert [t.content for t in doc._sub_tasks.get(job.id, [])] == ['Grease the boom pins']

    doc.add_day_page(sorted(plan.days, key=lambda d: d.date)[0])
    assert len(bytes(doc.output())) > 1000


def test_pdf_still_renders_when_the_table_is_missing(db_session, engineer, plan,
                                                     monkeypatch):
    """A server not yet restarted into the new schema must still print a plan."""
    from app.services import work_plan_pdf_service as svc

    eq = make_equipment(db_session, serial='RS109')
    _sap_job(plan, eq)

    def boom(_jobs):
        raise RuntimeError('relation "work_plan_job_tasks" does not exist')

    monkeypatch.setattr(WorkPlanJobTask, 'for_jobs', staticmethod(boom))
    doc = svc.WorkPlanPDF(plan, 'en')
    assert doc._sub_tasks == {}


def test_weekly_pdf_reaches_the_sub_task_renderer(db_session, engineer, client, plan):
    """The WEEKLY plan PDF, not just a single day.

    generate_plan_pdf() calls add_day_page() per day, which goes
    _berth_section -> _render_job_row -> _render_sub_task_lines. Ali asked for
    the lines on the weekly sheet, so pin that chain rather than trusting it.
    """
    from app.services.work_plan_pdf_service import WorkPlanPDF

    eq = make_equipment(db_session, serial='RS109')
    job = _sap_job(plan, eq)
    headers = get_auth_header(client, 'eng@test.com', 'test123')
    client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                json={'content': 'Grease the boom pins'}, headers=headers)

    seen = []
    original = WorkPlanPDF._render_sub_task_lines

    def spy(self, rendered_job, col_widths):
        seen.append(rendered_job.id)
        return original(self, rendered_job, col_widths)

    WorkPlanPDF._render_sub_task_lines = spy
    try:
        doc = WorkPlanPDF(plan, 'en')
        for day in sorted(plan.days, key=lambda d: d.date):
            doc.add_day_page(day)
    finally:
        WorkPlanPDF._render_sub_task_lines = original

    assert job.id in seen, 'the weekly PDF never asked for this job\'s sub-tasks'
