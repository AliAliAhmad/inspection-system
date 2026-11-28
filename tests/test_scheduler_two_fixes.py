"""Two nightly tasks that failed on production every time they ran (log, 2026-11-28).

1. send_review_reminders — the night-shift half used `timedelta` without
   importing it: `name 'timedelta' is not defined`. No engineer was ever
   reminded about a night-shift review.
2. check_daily_completion — the work-plan half used five names that do not
   exist (plan_date, day_id, job_id, job.status, 'verified'). Since March no
   specialist or maintenance worker ever received the daily completion bonus.

The tasks are closures inside init_scheduler, wrapped so a failure is only
LOGGED. So the tests capture them from a fake scheduler, run them, and check
both the effect and that no "failed" line was logged.
"""

import logging
import sys
import types
from datetime import date as real_date
from datetime import datetime as real_datetime
from datetime import timedelta

import pytest

from app.models import User, WorkPlan, WorkPlanAssignment, WorkPlanDay, WorkPlanJob
from app.models.work_plan_daily_review import WorkPlanDailyReview
from app.models.work_plan_job_tracking import WorkPlanJobTracking
from app.services import scheduler_service

TODAY = real_date(2026, 11, 28)
YESTERDAY = TODAY - timedelta(days=1)


class _FakeScheduler:
    def __init__(self):
        self.jobs = {}

    def add_job(self, fn, *args, id=None, **kwargs):
        self.jobs[id] = fn

    def get_jobs(self):
        return list(self.jobs)

    def __getattr__(self, name):  # start, shutdown, add_listener ...
        return lambda *a, **k: None


@pytest.fixture
def tasks(app, monkeypatch, tmp_path):
    """Every scheduled task by id, each ready to run once."""
    monkeypatch.setitem(app.config, "UPLOAD_FOLDER", str(tmp_path))  # run-once claims
    fake = _FakeScheduler()
    monkeypatch.setattr(scheduler_service, "scheduler", fake)
    monkeypatch.setattr(scheduler_service.atexit, "register", lambda *a, **k: None)
    scheduler_service.init_scheduler(app)
    return fake.jobs


@pytest.fixture
def clock(monkeypatch):
    """Freeze the time seen by `from datetime import ...` inside a task."""

    def freeze(at):
        class FrozenDate(real_date):
            @classmethod
            def today(cls):
                return at.date()

        class FrozenDatetime(real_datetime):
            @classmethod
            def utcnow(cls):
                return at

        fake = types.ModuleType("datetime")
        fake.__dict__.update(sys.modules["datetime"].__dict__)
        fake.date, fake.datetime = FrozenDate, FrozenDatetime
        monkeypatch.setitem(sys.modules, "datetime", fake)

    return freeze


def _failures(caplog):
    return [
        r.getMessage()
        for r in caplog.records
        if r.levelno >= logging.ERROR and "failed" in r.getMessage()
    ]


def _worker(db_session, email, role="specialist"):
    user = User(
        email=email,
        full_name=email.split("@")[0],
        role=role,
        role_id=email.split("@")[0].upper(),
        shift="day",
    )
    user.set_password("test123")
    db_session.session.add(user)
    db_session.session.flush()
    return user


def _day(db_session, admin_user):
    start = YESTERDAY - timedelta(days=YESTERDAY.weekday())
    plan = WorkPlan(
        week_start=start,
        week_end=start + timedelta(days=6),
        status="published",
        created_by_id=admin_user.id,
    )
    db_session.session.add(plan)
    db_session.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=YESTERDAY)
    db_session.session.add(day)
    db_session.session.flush()
    return day


def _job(db_session, day, equipment, worker, status, job_type="pm"):
    job = WorkPlanJob(
        work_plan_day_id=day.id,
        job_type=job_type,
        equipment_id=equipment.id,
        estimated_hours=2.0,
        description="job",
        priority="normal",
        position=1,
        berth="east",
    )
    db_session.session.add(job)
    db_session.session.flush()
    db_session.session.add(
        WorkPlanAssignment(work_plan_job_id=job.id, user_id=worker.id)
    )
    if status:
        db_session.session.add(
            WorkPlanJobTracking(work_plan_job_id=job.id, status=status)
        )
    db_session.session.flush()
    return job


class TestNightShiftReviewReminder:
    def test_an_open_night_review_is_reminded(
        self, tasks, clock, caplog, engineer, db_session, monkeypatch
    ):
        sent = []
        monkeypatch.setattr(
            "app.services.notification_service.NotificationService.create_notification",
            lambda **kw: sent.append(kw),
        )
        review = WorkPlanDailyReview(
            engineer_id=engineer.id, date=YESTERDAY, shift_type="night", status="open"
        )
        db_session.session.add(review)
        db_session.session.commit()

        clock(real_datetime(2026, 11, 28, 4, 0))  # inside the 03:00-06:00 window
        tasks["send_review_reminders"]()

        assert _failures(caplog) == []
        assert review.reminders_sent == 1
        assert [s["title"] for s in sent] == ["Night Shift Review Reminder"]


class TestDailyCompletionBonus:
    @pytest.fixture
    def awarded(self, monkeypatch):
        calls = []
        monkeypatch.setattr(
            "app.services.leaderboard_ai_service.LeaderboardAIService.award_daily_completion",
            lambda self, uid, role: calls.append((uid, role)),
        )
        return calls

    def _run(self, tasks, clock, caplog):
        clock(real_datetime(2026, 11, 28, 0, 30))
        tasks["check_daily_completion"]()
        assert _failures(caplog) == []

    def test_a_specialist_who_finished_everything_gets_it(
        self, tasks, clock, caplog, awarded, admin_user, sample_equipment, db_session
    ):
        day = _day(db_session, admin_user)
        worker = _worker(db_session, "done@test.com")
        _job(db_session, day, sample_equipment, worker, "completed")
        db_session.session.commit()

        self._run(tasks, clock, caplog)

        assert awarded == [(worker.id, "specialist")]

    def test_one_unfinished_job_means_no_bonus(
        self, tasks, clock, caplog, awarded, admin_user, sample_equipment, db_session
    ):
        day = _day(db_session, admin_user)
        worker = _worker(db_session, "half@test.com", role="maintenance")
        _job(db_session, day, sample_equipment, worker, "completed")
        _job(db_session, day, sample_equipment, worker, "incomplete")
        _job(db_session, day, sample_equipment, worker, None)  # never started
        db_session.session.commit()

        self._run(tasks, clock, caplog)

        assert awarded == []

    def test_an_inspection_job_is_not_paid_a_second_time(
        self, tasks, clock, caplog, awarded, admin_user, sample_equipment, db_session
    ):
        """Inspectors sit on the board's inspection jobs too; their bonus comes
        from the inspection lists, never from here as well."""
        day = _day(db_session, admin_user)
        inspector = _worker(db_session, "insp@test.com", role="inspector")
        _job(
            db_session,
            day,
            sample_equipment,
            inspector,
            "completed",
            job_type="inspection",
        )
        db_session.session.commit()

        self._run(tasks, clock, caplog)

        assert awarded == []
