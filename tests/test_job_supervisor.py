"""A supervisor watches a job. He is not one of its workers.

Ali, 2026-09-23: "we need to have the option to have supervisor for the job, is
it already thier?" — partly. `WorkPlanJob.engineer_id` existed, was validated to
engineer/admin, was editable in Job Details, and NOTHING in the backend ever
read it. A pure label.

He chose a watcher over a worker: responsible for the job, doing none of its
lines, told when it starts and finishes. And he chose that any senior person may
supervise, not only an engineer — SAP's 685 MES-SUPV operations say supervision
is real yard work.

WHY THE FIELD IS STILL CALLED engineer_id
=========================================

Because nothing read it, it was free to BECOME this rather than earn a second
column beside it. Two records of one fact is what this codebase keeps refusing.
Renaming the wire contract would break the mobile payload until an OTA and buy
nothing: only the DISPLAY says "Supervisor".
"""

from datetime import date, datetime, timedelta

import pytest

from tests.conftest import get_auth_header, make_equipment
from app.extensions import db
from app.models import (WorkPlan, WorkPlanDay, WorkPlanJob, WorkPlanAssignment,
                        WorkPlanJobTask, Notification, User)


def _user(email, role, name):
    person = User(email=email, full_name=name, role=role,
                  role_id=email.split('@')[0].upper()[:12], shift='day')
    person.set_password('test123')
    db.session.add(person)
    db.session.commit()
    return person


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


class TestWhoMaySupervise:
    """Ali widened this deliberately, 2026-09-23."""

    @pytest.mark.parametrize('role', ['engineer', 'admin', 'specialist',
                                      'maintenance'])
    def test_any_senior_person_may_watch_a_job(self, client, admin_user,
                                               db_session, plan_day, role):
        plan, day = plan_day
        eq = make_equipment(db_session, f'SUP{role[:3]}', f'SUP{role[:3]}')
        watcher = _user(f'watch_{role}@test.com', role, f'Watcher {role}')

        resp = client.post(f'/api/work-plans/{plan.id}/jobs',
                           json={'day_id': day.id, 'job_type': 'pm',
                                 'equipment_id': eq.id, 'estimated_hours': 4,
                                 'engineer_id': watcher.id, 'auto_group': False},
                           headers=_headers(client, admin_user))
        assert resp.status_code == 201, resp.get_json()
        assert resp.get_json()['job']['engineer_id'] == watcher.id

    def test_an_inspector_may_not(self, client, admin_user, db_session, plan_day):
        """The one role left out. Inspectors inspect; they do not run jobs."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'SUPINS', 'SUPINS')
        inspector = _user('watch_ins@test.com', 'inspector', 'An Inspector')

        resp = client.post(f'/api/work-plans/{plan.id}/jobs',
                           json={'day_id': day.id, 'job_type': 'pm',
                                 'equipment_id': eq.id, 'estimated_hours': 4,
                                 'engineer_id': inspector.id, 'auto_group': False},
                           headers=_headers(client, admin_user))
        assert resp.status_code == 400

    def test_nobody_is_always_allowed(self, client, admin_user, db_session, plan_day):
        plan, day = plan_day
        eq = make_equipment(db_session, 'SUPNON', 'SUPNON')
        resp = client.post(f'/api/work-plans/{plan.id}/jobs',
                           json={'day_id': day.id, 'job_type': 'pm',
                                 'equipment_id': eq.id, 'estimated_hours': 4,
                                 'auto_group': False},
                           headers=_headers(client, admin_user))
        assert resp.status_code == 201
        assert resp.get_json()['job']['engineer_id'] is None


class TestASupervisorIsNotAWorker:
    """THE INVARIANT. Ali: "not one of the workers".

    If naming a supervisor created a WorkPlanAssignment row he would be counted
    by `bundle_man_hours`, the day budget, `_step_assign`, the board's avatars
    and every "unassigned" count in the app. He would silently become a man the
    planner thinks is busy.
    """

    def test_naming_him_creates_no_assignment(self, client, admin_user,
                                              db_session, plan_day):
        plan, day = plan_day
        eq = make_equipment(db_session, 'SUPW1', 'SUPW1')
        watcher = _user('watch_w1@test.com', 'engineer', 'Haidar Ghulam')

        job_id = client.post(f'/api/work-plans/{plan.id}/jobs',
                             json={'day_id': day.id, 'job_type': 'pm',
                                   'equipment_id': eq.id, 'estimated_hours': 4,
                                   'engineer_id': watcher.id, 'auto_group': False},
                             headers=_headers(client, admin_user)
                             ).get_json()['job']['id']

        assert WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job_id, user_id=watcher.id).count() == 0
        assert WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job_id).count() == 0, 'the job has NO workers yet'

    def test_he_costs_the_day_nothing(self, client, admin_user, db_session,
                                      plan_day):
        """The number a planner actually reads."""
        plan, day = plan_day
        eq = make_equipment(db_session, 'SUPW2', 'SUPW2')
        watcher = _user('watch_w2@test.com', 'maintenance', 'A Senior Fitter')
        h = _headers(client, admin_user)

        job_id = client.post(f'/api/work-plans/{plan.id}/jobs',
                             json={'day_id': day.id, 'job_type': 'pm',
                                   'equipment_id': eq.id, 'estimated_hours': 4,
                                   'auto_group': False}, headers=h
                             ).get_json()['job']['id']
        before = db.session.get(WorkPlanJob, job_id).estimated_hours

        client.put(f'/api/work-plans/{plan.id}/jobs/{job_id}',
                   json={'engineer_id': watcher.id}, headers=h)

        job = db.session.get(WorkPlanJob, job_id)
        assert job.engineer_id == watcher.id
        assert job.estimated_hours == before, 'watching a job does not cost hours'
        assert len(job.assignments) == 0


class TestHeIsToldWhatHappens:
    """Ali: he should "be told when it starts and finishes"."""

    def _job_with_watcher(self, client, admin_user, db_session, plan_day, tag,
                          watcher):
        plan, day = plan_day
        eq = make_equipment(db_session, tag, tag)
        h = _headers(client, admin_user)
        job_id = client.post(f'/api/work-plans/{plan.id}/jobs',
                             json={'day_id': day.id, 'job_type': 'pm',
                                   'equipment_id': eq.id, 'estimated_hours': 4,
                                   'engineer_id': watcher.id, 'auto_group': False},
                             headers=h).get_json()['job']['id']
        return plan, db.session.get(WorkPlanJob, job_id)

    def test_the_helper_tells_both_the_planner_and_the_supervisor(
            self, client, admin_user, db_session, plan_day):
        from app.api.work_plan_tracking import notify_engineers_for_job
        watcher = _user('watch_n1@test.com', 'engineer', 'Haidar Ghulam')
        plan, job = self._job_with_watcher(client, admin_user, db_session,
                                           plan_day, 'SUPN1', watcher)

        notify_engineers_for_job(job, 'work_plan_job_started', 'Job started',
                                 'Hassan started it')

        told = {n.user_id for n in Notification.query.filter_by(
            related_type='work_plan_job', related_id=job.id).all()}
        assert told == {admin_user.id, watcher.id}

    def test_one_person_is_never_told_twice(self, client, admin_user,
                                            db_session, plan_day):
        """The supervisor is very often the person who built the plan.

        Being told twice that one job started teaches people to stop reading
        notifications, which costs far more than it saves.
        """
        from app.api.work_plan_tracking import notify_engineers_for_job
        plan, job = self._job_with_watcher(client, admin_user, db_session,
                                           plan_day, 'SUPN2', admin_user)

        notify_engineers_for_job(job, 'work_plan_job_started', 'Job started',
                                 'Hassan started it')

        count = Notification.query.filter_by(
            related_type='work_plan_job', related_id=job.id,
            user_id=admin_user.id).count()
        assert count == 1

    def test_a_job_with_no_supervisor_still_tells_the_planner(
            self, client, admin_user, db_session, plan_day):
        """The old behaviour, unchanged."""
        from app.api.work_plan_tracking import notify_engineers_for_job
        plan, day = plan_day
        eq = make_equipment(db_session, 'SUPN3', 'SUPN3')
        job_id = client.post(f'/api/work-plans/{plan.id}/jobs',
                             json={'day_id': day.id, 'job_type': 'pm',
                                   'equipment_id': eq.id, 'estimated_hours': 4,
                                   'auto_group': False},
                             headers=_headers(client, admin_user)
                             ).get_json()['job']['id']
        job = db.session.get(WorkPlanJob, job_id)

        notify_engineers_for_job(job, 'work_plan_job_started', 'Job started', 'x')

        told = [n.user_id for n in Notification.query.filter_by(
            related_type='work_plan_job', related_id=job.id).all()]
        assert told == [admin_user.id]


class TestHisPhoneShowsJobsHeWatches:
    """Ali: a supervisor should see the job on his phone.

    SEPARATE FROM `my_jobs`, ALWAYS. Merging them would make a watcher look like
    a worker on the one screen where the difference matters most — the man's own
    day. And he is given no WorkPlanAssignment row, so he stays out of every
    count in the app.
    """

    def _published_plan(self, db_session, admin_user):
        start = date.today() - timedelta(days=date.today().weekday())
        plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                        status='published', created_by_id=admin_user.id)
        db_session.session.add(plan)
        db_session.session.flush()
        day = WorkPlanDay(work_plan_id=plan.id, date=date.today())
        db_session.session.add(day)
        db_session.session.commit()
        return plan, day

    def _job(self, day, equipment, supervisor_id=None):
        job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm',
                          equipment_id=equipment.id, description='SERVICE',
                          estimated_hours=4, position=1,
                          engineer_id=supervisor_id)
        db.session.add(job)
        db.session.commit()
        return job

    def test_a_job_he_watches_appears_under_supervised_not_my_jobs(
            self, client, db_session, admin_user):
        plan, day = self._published_plan(db_session, admin_user)
        eq = make_equipment(db_session, 'SUPP1', 'SUPP1')
        watcher = _user('watch_p1@test.com', 'engineer', 'Haidar Ghulam')
        worker = _user('work_p1@test.com', 'maintenance', 'Hassan Ali')
        job = self._job(day, eq, supervisor_id=watcher.id)
        db.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                          user_id=worker.id))
        db.session.commit()

        body = client.get('/api/work-plans/my-plan',
                          headers=get_auth_header(client, watcher.email,
                                                  'test123')).get_json()

        assert body['total_supervised'] == 1
        assert body['total_jobs'] == 0, 'he does none of the work'
        watched = body['supervised_jobs'][0]['jobs'][0]
        assert watched['id'] == job.id
        assert watched['workers'] == ['Hassan Ali'], 'he sees who is on it'

    def test_the_worker_sees_it_as_HIS_job_not_a_watched_one(
            self, client, db_session, admin_user):
        """The other side of the same job. Nothing about the worker changed."""
        plan, day = self._published_plan(db_session, admin_user)
        eq = make_equipment(db_session, 'SUPP2', 'SUPP2')
        watcher = _user('watch_p2@test.com', 'engineer', 'Haidar Ghulam')
        worker = _user('work_p2@test.com', 'maintenance', 'Hassan Ali')
        job = self._job(day, eq, supervisor_id=watcher.id)
        db.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                          user_id=worker.id))
        db.session.commit()

        body = client.get('/api/work-plans/my-plan',
                          headers=get_auth_header(client, worker.email,
                                                  'test123')).get_json()

        assert body['total_jobs'] == 1
        assert body['total_supervised'] == 0

    def test_a_man_who_watches_and_works_gets_the_job_in_BOTH_lists(
            self, client, db_session, admin_user):
        """Legitimate, and the lists must not fight over it.

        A senior fitter can be doing one job and watching another; he can also
        be doing AND watching the same one. Each list answers its own question.
        """
        plan, day = self._published_plan(db_session, admin_user)
        eq = make_equipment(db_session, 'SUPP3', 'SUPP3')
        both = _user('watch_p3@test.com', 'maintenance', 'Senior Fitter')
        job = self._job(day, eq, supervisor_id=both.id)
        db.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                          user_id=both.id))
        db.session.commit()

        body = client.get('/api/work-plans/my-plan',
                          headers=get_auth_header(client, both.email,
                                                  'test123')).get_json()
        assert body['total_jobs'] == 1
        assert body['total_supervised'] == 1

    def test_a_man_watching_nothing_gets_an_empty_list_not_an_error(
            self, client, db_session, admin_user):
        plan, day = self._published_plan(db_session, admin_user)
        eq = make_equipment(db_session, 'SUPP4', 'SUPP4')
        self._job(day, eq)
        worker = _user('work_p4@test.com', 'maintenance', 'Nobody Special')

        body = client.get('/api/work-plans/my-plan',
                          headers=get_auth_header(client, worker.email,
                                                  'test123')).get_json()
        assert body['supervised_jobs'] == []
        assert body['total_supervised'] == 0

    def test_he_sees_whether_the_work_has_started(
            self, client, db_session, admin_user):
        """What a watcher actually opens his phone for."""
        from app.models import WorkPlanJobTracking
        plan, day = self._published_plan(db_session, admin_user)
        eq = make_equipment(db_session, 'SUPP5', 'SUPP5')
        watcher = _user('watch_p5@test.com', 'engineer', 'Haidar Ghulam')
        worker = _user('work_p5@test.com', 'maintenance', 'Hassan Ali')
        job = self._job(day, eq, supervisor_id=watcher.id)
        db.session.add(WorkPlanAssignment(work_plan_job_id=job.id,
                                          user_id=worker.id))
        db.session.add(WorkPlanJobTracking(
            work_plan_job_id=job.id, status='in_progress',
            started_at=datetime.utcnow()))
        db.session.commit()

        body = client.get('/api/work-plans/my-plan',
                          headers=get_auth_header(client, watcher.email,
                                                  'test123')).get_json()
        watched = body['supervised_jobs'][0]['jobs'][0]
        assert watched['status'] == 'in_progress'
        assert watched['started_at'] is not None


class TestHeCanOpenTheJobHeWatches:
    """Ali, 2026-09-23: "he should be able to tap the job to see details".

    `get_job_details` refused anyone who was neither admin/engineer nor
    ASSIGNED — and a supervisor is deliberately neither. A maintenance-role
    supervisor tapping a job he is responsible for would have been told "You are
    not assigned to this job", which is the feature failing for exactly the
    people it was widened to include.
    """

    def _published(self, db_session, admin_user, tag, supervisor_id=None):
        start = date.today() - timedelta(days=date.today().weekday())
        plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                        status='published', created_by_id=admin_user.id)
        db_session.session.add(plan)
        db_session.session.flush()
        day = WorkPlanDay(work_plan_id=plan.id, date=date.today())
        db_session.session.add(day)
        db_session.session.flush()
        eq = make_equipment(db_session, tag, tag)
        job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm',
                          equipment_id=eq.id, description='SERVICE',
                          estimated_hours=4, position=1,
                          engineer_id=supervisor_id)
        db.session.add(job)
        db.session.commit()
        return job

    def test_a_maintenance_supervisor_can_open_it(self, client, db_session,
                                                  admin_user):
        """The case that was broken. He is not a planner and not assigned."""
        watcher = _user('watch_t1@test.com', 'maintenance', 'Senior Fitter')
        job = self._published(db_session, admin_user, 'SUPT1', watcher.id)

        resp = client.get(f'/api/work-plans/jobs/{job.id}/details',
                          headers=get_auth_header(client, watcher.email,
                                                  'test123'))
        assert resp.status_code == 200, resp.get_json()

    def test_an_unrelated_man_still_cannot(self, client, db_session, admin_user):
        """The widening must not leak. Job ids stay un-enumerable."""
        watcher = _user('watch_t2@test.com', 'maintenance', 'Senior Fitter')
        stranger = _user('watch_t3@test.com', 'maintenance', 'Somebody Else')
        job = self._published(db_session, admin_user, 'SUPT2', watcher.id)

        resp = client.get(f'/api/work-plans/jobs/{job.id}/details',
                          headers=get_auth_header(client, stranger.email,
                                                  'test123'))
        assert resp.status_code == 403

    def test_a_job_he_does_not_watch_is_still_refused(self, client, db_session,
                                                      admin_user):
        watcher = _user('watch_t4@test.com', 'maintenance', 'Senior Fitter')
        other = self._published(db_session, admin_user, 'SUPT4', None)

        resp = client.get(f'/api/work-plans/jobs/{other.id}/details',
                          headers=get_auth_header(client, watcher.email,
                                                  'test123'))
        assert resp.status_code == 403

    def test_opening_it_creates_no_assignment(self, client, db_session,
                                              admin_user):
        """Reading must not quietly make him a worker."""
        watcher = _user('watch_t5@test.com', 'maintenance', 'Senior Fitter')
        job = self._published(db_session, admin_user, 'SUPT5', watcher.id)

        client.get(f'/api/work-plans/jobs/{job.id}/details',
                   headers=get_auth_header(client, watcher.email, 'test123'))

        assert WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job.id).count() == 0


class TestWhatHeMayAndMayNotDo:
    """The boundary, and it is the whole design.

    Ali, 2026-09-23, confirmed a supervisor may add a photo or a voice note to a
    job he is not assigned to — a man at the machine who sees a cracked hose
    should be able to record it. He may NOT tick and may NOT run a timer.

    That split is not caution. A tick is the worker's record of his OWN work,
    and it is the only record anywhere that a crew is three operations into a
    nine-operation order, because SAP holds no partial progress for an open
    order. A supervisor ticking would make it stop meaning "the man did it".
    """

    def _setup(self, client, db_session, admin_user, tag, supervisor):
        start = date.today() - timedelta(days=date.today().weekday())
        plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                        status='published', created_by_id=admin_user.id)
        db_session.session.add(plan)
        db_session.session.flush()
        day = WorkPlanDay(work_plan_id=plan.id, date=date.today())
        db_session.session.add(day)
        db_session.session.flush()
        eq = make_equipment(db_session, tag, tag)
        job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm',
                          equipment_id=eq.id, description='SERVICE',
                          sap_order_number=f'7000009{tag[-4:]}',
                          estimated_hours=4, position=1,
                          engineer_id=supervisor.id)
        db.session.add(job)
        db.session.commit()
        return job

    def _a_photo_of_his(self, uploader):
        """A File row owned by this user — the endpoint checks ownership."""
        from app.models import File
        import uuid
        photo = File(original_filename='hose.jpg',
                     stored_filename=f'{uuid.uuid4().hex}.jpg',
                     file_path='uploads/hose.jpg', mime_type='image/jpeg',
                     file_size=1024, uploaded_by=uploader.id)
        db.session.add(photo)
        db.session.commit()
        return photo

    def test_he_may_add_a_photo_to_a_job_he_is_not_assigned_to(
            self, client, db_session, admin_user):
        watcher = _user('watch_a1@test.com', 'maintenance', 'Senior Fitter')
        job = self._setup(client, db_session, admin_user, 'SUPA1', watcher)
        photo = self._a_photo_of_his(watcher)
        h = get_auth_header(client, watcher.email, 'test123')

        resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                           json={'content': 'Cracked hose',
                                 'attachment_file_id': photo.id,
                                 'attachment_kind': 'photo'}, headers=h)
        assert resp.status_code == 201, resp.get_json()

    def test_he_may_NOT_tick_an_operation(self, client, db_session, admin_user):
        """THE boundary. His name on a line would not mean the work was done."""
        from app.services.sap_pool_sync import sync_order_operations
        watcher = _user('watch_a2@test.com', 'maintenance', 'Senior Fitter')
        job = self._setup(client, db_session, admin_user, 'SUPA2', watcher)
        sync_order_operations({job.sap_order_number: [
            {'operation_number': '0010', 'description': 'Check the spreader',
             'work_center': 'MECH', 'planned_hours': 2.0}]})
        op = WorkPlanJobTask.query.filter_by(
            anchor_key=job.sap_order_number, source='sap').one()
        h = get_auth_header(client, watcher.email, 'test123')

        resp = client.patch(f'/api/work-plans/jobs/{job.id}/tasks/{op.id}',
                            json={'is_done': True}, headers=h)
        assert resp.status_code == 403

    def test_he_may_NOT_run_a_timer(self, client, db_session, admin_user):
        from app.services.sap_pool_sync import sync_order_operations
        watcher = _user('watch_a3@test.com', 'maintenance', 'Senior Fitter')
        job = self._setup(client, db_session, admin_user, 'SUPA3', watcher)
        sync_order_operations({job.sap_order_number: [
            {'operation_number': '0010', 'description': 'Check the spreader',
             'work_center': 'MECH', 'planned_hours': 2.0}]})
        op = WorkPlanJobTask.query.filter_by(
            anchor_key=job.sap_order_number, source='sap').one()
        h = get_auth_header(client, watcher.email, 'test123')

        resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks/{op.id}/timer',
                           json={'action': 'start'}, headers=h)
        assert resp.status_code == 403

    def test_he_may_NOT_write_a_plain_sub_task(self, client, db_session,
                                               admin_user):
        """Only evidence is his to add. Words are the planner's."""
        watcher = _user('watch_a4@test.com', 'maintenance', 'Senior Fitter')
        job = self._setup(client, db_session, admin_user, 'SUPA4', watcher)
        h = get_auth_header(client, watcher.email, 'test123')

        resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                           json={'content': 'Bring the 32mm socket'}, headers=h)
        assert resp.status_code == 403

    def test_an_unrelated_man_still_may_not_attach(self, client, db_session,
                                                   admin_user):
        """The widening must not leak beyond the one job he was named on."""
        watcher = _user('watch_a5@test.com', 'maintenance', 'Senior Fitter')
        stranger = _user('watch_a6@test.com', 'maintenance', 'Somebody Else')
        job = self._setup(client, db_session, admin_user, 'SUPA5', watcher)
        photo = self._a_photo_of_his(stranger)
        h = get_auth_header(client, stranger.email, 'test123')

        resp = client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                           json={'content': 'Cracked hose',
                                 'attachment_file_id': photo.id,
                                 'attachment_kind': 'photo'}, headers=h)
        assert resp.status_code == 403

    def test_adding_a_photo_makes_him_no_more_of_a_worker(
            self, client, db_session, admin_user):
        """The invariant, again: he is still counted in no hours anywhere."""
        watcher = _user('watch_a7@test.com', 'maintenance', 'Senior Fitter')
        job = self._setup(client, db_session, admin_user, 'SUPA7', watcher)
        photo = self._a_photo_of_his(watcher)
        h = get_auth_header(client, watcher.email, 'test123')

        client.post(f'/api/work-plans/jobs/{job.id}/tasks',
                    json={'content': 'Cracked hose',
                          'attachment_file_id': photo.id,
                          'attachment_kind': 'photo'}, headers=h)

        assert WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job.id).count() == 0


class TestAnyJobCanHaveOne:
    """Ali, 2026-09-23: "any job should have supervisor".

    He was right that it could not. The Supervisor field existed ONLY in the
    "Add Job Manually" window, so a supervisor could be named at the moment a
    job was typed by hand and never afterwards — and almost no real job goes
    through that window. Everything comes from SAP or the generator.

    Job Details SHOWED the supervisor but offered no way to change it, and the
    card was hidden entirely unless the job already had one. Two halves of the
    same gap: nowhere to set it, and nothing to click even if there were.

    The server was always ready — `PUT /jobs/<id>` has accepted `engineer_id`
    since the field existed. Only the screen was missing.
    """

    def _sap_job(self, db_session, admin_user, tag, published=False):
        """A job as it really arrives: from SAP, not typed by hand."""
        start = date.today() - timedelta(days=date.today().weekday())
        plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                        status='published' if published else 'draft',
                        created_by_id=admin_user.id)
        db_session.session.add(plan)
        db_session.session.flush()
        day = WorkPlanDay(work_plan_id=plan.id, date=date.today())
        db_session.session.add(day)
        db_session.session.flush()
        eq = make_equipment(db_session, tag, tag)
        job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm',
                          equipment_id=eq.id, description='GENERAL REFURBISHMENT',
                          sap_order_number=f'7000008{tag[-4:]}',
                          estimated_hours=12, position=1)
        db.session.add(job)
        db.session.commit()
        return plan, job

    def test_a_supervisor_can_be_named_on_a_SAP_job(self, client, db_session,
                                                    admin_user):
        """THE fix. This job was never typed by hand and has no supervisor."""
        plan, job = self._sap_job(db_session, admin_user, 'ANY01')
        watcher = _user('watch_n01@test.com', 'maintenance', 'Senior Fitter')
        assert job.engineer_id is None

        resp = client.put(f'/api/work-plans/{plan.id}/jobs/{job.id}',
                          json={'engineer_id': watcher.id},
                          headers=_headers(client, admin_user))
        assert resp.status_code == 200, resp.get_json()
        db.session.refresh(job)
        assert job.engineer_id == watcher.id

    def test_he_can_be_swapped_for_somebody_else(self, client, db_session,
                                                 admin_user):
        plan, job = self._sap_job(db_session, admin_user, 'ANY02')
        first = _user('watch_n02@test.com', 'engineer', 'Haidar Ghulam')
        second = _user('watch_n03@test.com', 'specialist', 'Karim Saleh')
        h = _headers(client, admin_user)

        client.put(f'/api/work-plans/{plan.id}/jobs/{job.id}',
                   json={'engineer_id': first.id}, headers=h)
        client.put(f'/api/work-plans/{plan.id}/jobs/{job.id}',
                   json={'engineer_id': second.id}, headers=h)

        db.session.refresh(job)
        assert job.engineer_id == second.id

    def test_he_can_be_removed_again(self, client, db_session, admin_user):
        """Nobody watching is a legitimate state, and must stay reachable."""
        plan, job = self._sap_job(db_session, admin_user, 'ANY03')
        watcher = _user('watch_n04@test.com', 'maintenance', 'Senior Fitter')
        h = _headers(client, admin_user)
        client.put(f'/api/work-plans/{plan.id}/jobs/{job.id}',
                   json={'engineer_id': watcher.id}, headers=h)

        resp = client.put(f'/api/work-plans/{plan.id}/jobs/{job.id}',
                          json={'engineer_id': None}, headers=h)
        assert resp.status_code == 200
        db.session.refresh(job)
        assert job.engineer_id is None

    def test_a_published_week_still_refuses(self, client, db_session,
                                            admin_user):
        """Ali chose to keep 'published means frozen' whole, 2026-09-23.

        He was offered a narrow exception for this one field — it changes no
        hours, no assignment, nothing a crew sees — and said no. Pinned so the
        next person does not quietly widen it.
        """
        plan, job = self._sap_job(db_session, admin_user, 'ANY04', published=True)
        watcher = _user('watch_n05@test.com', 'maintenance', 'Senior Fitter')

        resp = client.put(f'/api/work-plans/{plan.id}/jobs/{job.id}',
                          json={'engineer_id': watcher.id},
                          headers=_headers(client, admin_user))
        assert resp.status_code == 403
        db.session.refresh(job)
        assert job.engineer_id is None

    def test_naming_one_still_costs_the_day_nothing(self, client, db_session,
                                                    admin_user):
        """The invariant, on this path too."""
        plan, job = self._sap_job(db_session, admin_user, 'ANY05')
        watcher = _user('watch_n06@test.com', 'maintenance', 'Senior Fitter')
        before = job.estimated_hours

        client.put(f'/api/work-plans/{plan.id}/jobs/{job.id}',
                   json={'engineer_id': watcher.id},
                   headers=_headers(client, admin_user))

        db.session.refresh(job)
        assert job.estimated_hours == before
        assert WorkPlanAssignment.query.filter_by(
            work_plan_job_id=job.id).count() == 0

    def test_an_inspector_is_still_refused_on_this_path_too(
            self, client, db_session, admin_user):
        """The role rule must not have a back door."""
        plan, job = self._sap_job(db_session, admin_user, 'ANY06')
        inspector = _user('watch_n07@test.com', 'inspector', 'An Inspector')

        resp = client.put(f'/api/work-plans/{plan.id}/jobs/{job.id}',
                          json={'engineer_id': inspector.id},
                          headers=_headers(client, admin_user))
        assert resp.status_code == 400
