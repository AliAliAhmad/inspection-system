"""
Scenarios 7-12: what the robot does when SAP closes a job already on the plan.

One test per cell of the decision matrix, plus the two rules that hold across all
of them — absence is not evidence, and a persisting situation is reported once.

Built on a hand-made status index rather than a workbook: the classification of
SAP statuses is covered in test_sap_order_parser.py, and what matters here is
what happens to the plan afterwards.
"""

from datetime import date, timedelta

import pytest

from app.models import (
    Notification,
    SapReconciliationEvent,
    SAPWorkOrder,
    User,
    WorkPlan,
    WorkPlanDay,
    WorkPlanJob,
)
from app.models.work_plan_job_tracking import WorkPlanJobTracking
from app.services.sap_removal_rules import reconcile_scheduled_orders
from tests.conftest import make_equipment

ORDER = '700000000042'
TODAY = date.today()


@pytest.fixture
def plan_day(db_session, admin_user):
    """A plan for the CURRENT week — the only kind the rules touch."""
    start = TODAY - timedelta(days=TODAY.weekday())
    plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                    status='draft', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=start)
    db_session.session.add(day)
    db_session.session.commit()
    return plan, day


def _scheduled_job(db_session, day, name='TT001', order=ORDER):
    """A SAP order that has left the box and sits on a day."""
    equipment = make_equipment(db_session, name, f'SN-{name}')
    job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm',
                      equipment_id=equipment.id, sap_order_number=order,
                      sap_order_type='PRM', description='250h service',
                      estimated_hours=4.0, position=1)
    db_session.session.add(job)
    db_session.session.add(SAPWorkOrder(
        work_plan_id=day.work_plan_id, order_number=order, order_type='PRM',
        job_type='pm', equipment_id=equipment.id, description='250h service',
        estimated_hours=4.0, status='scheduled'))
    db_session.session.commit()
    return job


def _track(db_session, job, status, actual_hours=None):
    db_session.session.add(WorkPlanJobTracking(
        work_plan_job_id=job.id, status=status, actual_hours=actual_hours))
    db_session.session.commit()


def _index(state='done', **extra):
    return {ORDER: {'state': state, 'system_status': 'TECO CNF PRC',
                    'finished_on': TODAY, **extra}}


def _events(event_type=None):
    query = SapReconciliationEvent.query
    if event_type:
        query = query.filter_by(event_type=event_type)
    return query.all()


class TestScenario7ClosedAndUntouched:
    """SAP finished it, nobody had started it — it comes off the day."""

    def test_job_is_removed_from_the_plan(self, db_session, plan_day):
        plan, day = plan_day
        job = _scheduled_job(db_session, day)

        report = reconcile_scheduled_orders(_index('done'), today=TODAY)

        assert report['jobs_removed'] == 1
        assert db_session.session.get(WorkPlanJob, job.id) is None

    def test_the_staging_row_goes_too_rather_than_back_to_the_box(self, db_session, plan_day):
        """It is finished work. Returning it to the pool would re-plan it."""
        plan, day = plan_day
        _scheduled_job(db_session, day)

        reconcile_scheduled_orders(_index('done'), today=TODAY)

        assert SAPWorkOrder.query.filter_by(order_number=ORDER).count() == 0

    def test_it_is_reported_because_it_was_on_somebody_s_day(self, db_session, plan_day):
        """A day that quietly loses a job looks like a day that never had one."""
        plan, day = plan_day
        _scheduled_job(db_session, day)

        reconcile_scheduled_orders(_index('done'), today=TODAY)

        events = _events('job_removed')
        assert len(events) == 1
        assert events[0].order_number == ORDER
        assert events[0].status == 'open'
        assert 'removed from the plan' in events[0].summary

    def test_a_cancelled_order_is_removed_and_worded_as_cancelled(self, db_session, plan_day):
        """Scenario 10. Same action, different reason — the message must say which."""
        plan, day = plan_day
        _scheduled_job(db_session, day)

        reconcile_scheduled_orders(_index('cancelled'), today=TODAY)

        events = _events('job_removed')
        assert events[0].sap_state == 'cancelled'
        assert 'cancelled' in events[0].summary


class TestScenario8SomeoneIsWorkingOnIt:
    """The worker keeps working. Ali is told; the worker is not interrupted."""

    @pytest.mark.parametrize('status', ['in_progress', 'paused'])
    def test_the_job_is_not_touched(self, db_session, plan_day, status):
        plan, day = plan_day
        job = _scheduled_job(db_session, day)
        _track(db_session, job, status)

        report = reconcile_scheduled_orders(_index('done'), today=TODAY)

        assert report['jobs_removed'] == 0
        assert report['jobs_left_in_progress'] == 1
        assert db_session.session.get(WorkPlanJob, job.id) is not None

    def test_the_staging_row_survives_too(self, db_session, plan_day):
        """Nothing about this job is cleaned up while a person is mid-task."""
        plan, day = plan_day
        job = _scheduled_job(db_session, day)
        _track(db_session, job, 'in_progress')

        reconcile_scheduled_orders(_index('done'), today=TODAY)

        assert SAPWorkOrder.query.filter_by(order_number=ORDER).count() == 1

    def test_it_is_reported_urgently(self, db_session, plan_day):
        plan, day = plan_day
        job = _scheduled_job(db_session, day)
        _track(db_session, job, 'in_progress')

        reconcile_scheduled_orders(_index('done'), today=TODAY)

        events = _events('job_in_progress_conflict')
        assert len(events) == 1
        assert 'Nothing was changed' in events[0].summary
        assert Notification.query.filter_by(priority='urgent').count() >= 1


class TestScenario9BothSidesAgreeItIsDone:
    """The job stays — it is the record of what the yard did that week."""

    def test_the_finished_job_stays_on_the_plan(self, db_session, plan_day):
        plan, day = plan_day
        job = _scheduled_job(db_session, day)
        _track(db_session, job, 'completed', actual_hours=6.0)

        report = reconcile_scheduled_orders(_index('done'), today=TODAY)

        assert report['completions_confirmed'] == 1
        assert db_session.session.get(WorkPlanJob, job.id) is not None

    def test_only_the_staging_row_is_cleaned_up(self, db_session, plan_day):
        plan, day = plan_day
        job = _scheduled_job(db_session, day)
        _track(db_session, job, 'completed', actual_hours=6.0)

        reconcile_scheduled_orders(_index('done'), today=TODAY)

        assert SAPWorkOrder.query.filter_by(order_number=ORDER).count() == 0

    def test_both_hour_figures_are_kept(self, db_session, plan_day):
        """The app's hours judge the man; SAP's date is for reconciliation."""
        plan, day = plan_day
        job = _scheduled_job(db_session, day)
        _track(db_session, job, 'completed', actual_hours=6.0)

        reconcile_scheduled_orders(_index('done'), today=TODAY)

        details = _events('job_completion_confirmed')[0].details
        assert details['app_actual_hours'] == 6.0
        assert details['finished_on'] == TODAY.isoformat()

    def test_a_routine_confirmation_notifies_nobody(self, db_session, plan_day):
        """Ali's rule: copy everything, shout about almost nothing.

        The team finishes jobs every week and SAP closes them. Telling the whole
        planning staff each time buries the two events that DO need an answer.
        """
        plan, day = plan_day
        job = _scheduled_job(db_session, day)
        _track(db_session, job, 'completed', actual_hours=6.0)

        reconcile_scheduled_orders(_index('done'), today=TODAY)

        assert Notification.query.count() == 0

    def test_a_routine_confirmation_is_a_record_not_a_question(self, db_session, plan_day):
        """Born resolved — it is history, and nobody would ever close it."""
        plan, day = plan_day
        job = _scheduled_job(db_session, day)
        _track(db_session, job, 'completed', actual_hours=6.0)

        reconcile_scheduled_orders(_index('done'), today=TODAY)

        event = _events('job_completion_confirmed')[0]
        assert event.status == 'resolved'
        assert event.resolved_at is not None

    def test_a_removal_by_contrast_does_notify(self, db_session, plan_day):
        """The contrast is the point: that job WAS on somebody's day."""
        plan, day = plan_day
        _scheduled_job(db_session, day)

        reconcile_scheduled_orders(_index('done'), today=TODAY)

        assert Notification.query.count() >= 1

    def test_a_tracking_row_that_says_incomplete_still_counts_as_recorded(
            self, db_session, plan_day):
        """The worker left a record. It is not ours to delete."""
        plan, day = plan_day
        job = _scheduled_job(db_session, day)
        _track(db_session, job, 'incomplete')

        report = reconcile_scheduled_orders(_index('done'), today=TODAY)

        assert report['jobs_removed'] == 0
        assert report['completions_confirmed'] == 1
        assert db_session.session.get(WorkPlanJob, job.id) is not None


class TestScenario12AppSaysDoneSapSaysOpen:
    """Neither wins. SAP is only slower here, not more right."""

    def test_a_question_is_raised_and_nothing_is_touched(self, db_session, plan_day):
        plan, day = plan_day
        job = _scheduled_job(db_session, day)
        _track(db_session, job, 'completed', actual_hours=5.5)

        report = reconcile_scheduled_orders(_index('open'), today=TODAY)

        assert report['questions_raised'] == 1
        assert report['jobs_removed'] == 0
        assert db_session.session.get(WorkPlanJob, job.id) is not None
        assert SAPWorkOrder.query.filter_by(order_number=ORDER).count() == 1

    def test_the_question_names_the_missing_confirmation(self, db_session, plan_day):
        plan, day = plan_day
        job = _scheduled_job(db_session, day)
        _track(db_session, job, 'completed', actual_hours=5.5)

        reconcile_scheduled_orders(_index('open'), today=TODAY)

        event = _events('completion_not_confirmed')[0]
        assert 'confirmation missing' in event.summary.lower()
        assert event.details['app_actual_hours'] == 5.5

    def test_an_incomplete_job_raises_no_question(self, db_session, plan_day):
        """The worker said they did not finish, so SAP being open is correct."""
        plan, day = plan_day
        job = _scheduled_job(db_session, day)
        _track(db_session, job, 'incomplete')

        report = reconcile_scheduled_orders(_index('open'), today=TODAY)

        assert report['questions_raised'] == 0
        assert _events() == []

    def test_an_untouched_open_order_is_left_completely_alone(self, db_session, plan_day):
        """The normal case: planned, still open, nothing has happened yet."""
        plan, day = plan_day
        job = _scheduled_job(db_session, day)

        report = reconcile_scheduled_orders(_index('open'), today=TODAY)

        assert report['events_created'] == 0
        assert db_session.session.get(WorkPlanJob, job.id) is not None


class TestAbsenceIsNotEvidence:
    """An order missing from the export must never move anything."""

    def test_an_order_not_in_the_export_is_counted_and_ignored(self, db_session, plan_day):
        plan, day = plan_day
        job = _scheduled_job(db_session, day)

        report = reconcile_scheduled_orders({}, today=TODAY)

        assert report['not_in_export'] == 1
        assert report['jobs_removed'] == 0
        assert report['events_created'] == 0
        assert db_session.session.get(WorkPlanJob, job.id) is not None

    def test_an_unrecognised_status_is_counted_and_ignored(self, db_session, plan_day):
        plan, day = plan_day
        job = _scheduled_job(db_session, day)

        report = reconcile_scheduled_orders(_index('unknown'), today=TODAY)

        assert report['sap_state_unknown'] == 1
        assert report['jobs_removed'] == 0
        assert db_session.session.get(WorkPlanJob, job.id) is not None


class TestItSaysThingsOnce:
    """The sync runs daily; a persisting situation must not nag daily."""

    def test_running_twice_reports_the_conflict_once(self, db_session, plan_day):
        plan, day = plan_day
        job = _scheduled_job(db_session, day)
        _track(db_session, job, 'in_progress')

        first = reconcile_scheduled_orders(_index('done'), today=TODAY)
        second = reconcile_scheduled_orders(_index('done'), today=TODAY)

        assert first['events_created'] == 1
        assert second['events_created'] == 0
        assert second['events_suppressed_as_duplicate'] == 1
        assert len(_events('job_in_progress_conflict')) == 1

    def test_a_resolved_question_can_be_raised_again(self, db_session, plan_day):
        """Once answered, the same situation recurring is news again."""
        plan, day = plan_day
        job = _scheduled_job(db_session, day)
        _track(db_session, job, 'completed', actual_hours=5.0)

        reconcile_scheduled_orders(_index('open'), today=TODAY)
        event = _events('completion_not_confirmed')[0]
        event.status = 'resolved'
        db_session.session.commit()

        reconcile_scheduled_orders(_index('open'), today=TODAY)

        assert len(_events('completion_not_confirmed')) == 2


class TestScopeAndDryRun:
    def test_a_finished_week_is_never_edited_retroactively(self, db_session, admin_user):
        """Last month's plan is a record of what happened, not a live plan."""
        start = TODAY - timedelta(days=60)
        plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                        status='published', created_by_id=admin_user.id)
        db_session.session.add(plan)
        db_session.session.flush()
        day = WorkPlanDay(work_plan_id=plan.id, date=start)
        db_session.session.add(day)
        db_session.session.commit()
        job = _scheduled_job(db_session, day)

        report = reconcile_scheduled_orders(_index('done'), today=TODAY)

        assert report['jobs_checked'] == 0
        assert db_session.session.get(WorkPlanJob, job.id) is not None

    def test_dry_run_writes_nothing_at_all(self, db_session, plan_day):
        """Not the job, not the staging row, not the event, not the notification."""
        plan, day = plan_day
        job = _scheduled_job(db_session, day)

        report = reconcile_scheduled_orders(_index('done'), today=TODAY, dry_run=True)

        assert report['jobs_removed'] == 1
        assert db_session.session.get(WorkPlanJob, job.id) is not None
        assert SAPWorkOrder.query.filter_by(order_number=ORDER).count() == 1
        assert _events() == []
        assert Notification.query.count() == 0

    def test_a_plan_row_never_placed_on_a_day_is_cleaned_silently(
            self, db_session, plan_day):
        """Invisible to both halves of the sync, and on nobody's day."""
        plan, day = plan_day
        equipment = make_equipment(db_session, 'RS110', 'SN-RS110')
        db_session.session.add(SAPWorkOrder(
            work_plan_id=plan.id, order_number=ORDER, order_type='PRM',
            job_type='pm', equipment_id=equipment.id, estimated_hours=4.0,
            status='pending'))
        db_session.session.commit()

        report = reconcile_scheduled_orders(_index('done'), today=TODAY)

        assert report['pool_rows_cleaned'] == 1
        assert report['events_created'] == 0
        assert SAPWorkOrder.query.filter_by(order_number=ORDER).count() == 0


class TestWhoGetsTold:
    def test_planners_are_notified_and_workers_are_not(self, db_session, plan_day,
                                                       admin_user):
        """Ali is the filter. A worker mid-task gets no confusing interrupt."""
        plan, day = plan_day
        worker = User(email='sapworker@test.com', full_name='SAP Worker',
                      role='specialist', role_id='SAPW', shift='day')
        worker.set_password('test123')
        db_session.session.add(worker)
        db_session.session.commit()

        job = _scheduled_job(db_session, day)
        _track(db_session, job, 'in_progress')
        reconcile_scheduled_orders(_index('done'), today=TODAY)

        assert Notification.query.filter_by(user_id=worker.id).count() == 0
        assert Notification.query.filter_by(user_id=admin_user.id).count() == 1


class TestReadingAndAnsweringEvents:
    """An event nobody can close would silence itself forever without being answered."""

    def _event(self, db_session):
        event = SapReconciliationEvent(
            event_type='completion_not_confirmed', order_number=ORDER,
            sap_state='open', summary='Is the confirmation missing?', status='open')
        db_session.session.add(event)
        db_session.session.commit()
        return event

    def test_a_planner_can_list_open_events(self, client, db_session, admin_user):
        from tests.conftest import get_auth_header
        self._event(db_session)

        response = client.get(
            '/api/sap-sync/events',
            headers=get_auth_header(client, admin_user.email, 'admin123'))

        assert response.status_code == 200
        assert response.get_json()['count'] == 1

    def test_an_inspector_cannot(self, client, db_session, mech_inspector):
        from tests.conftest import get_auth_header
        self._event(db_session)

        response = client.get(
            '/api/sap-sync/events',
            headers=get_auth_header(client, mech_inspector.email, 'test123'))

        assert response.status_code == 403

    def test_resolving_lets_the_same_situation_be_raised_again(self, client, db_session,
                                                              admin_user, plan_day):
        from tests.conftest import get_auth_header
        plan, day = plan_day
        job = _scheduled_job(db_session, day)
        _track(db_session, job, 'completed', actual_hours=5.0)
        reconcile_scheduled_orders(_index('open'), today=TODAY)
        event = _events('completion_not_confirmed')[0]

        response = client.post(
            f'/api/sap-sync/events/{event.id}/resolve',
            headers=get_auth_header(client, admin_user.email, 'admin123'))
        assert response.status_code == 200
        assert response.get_json()['event']['status'] == 'resolved'

        reconcile_scheduled_orders(_index('open'), today=TODAY)
        assert len(_events('completion_not_confirmed')) == 2
