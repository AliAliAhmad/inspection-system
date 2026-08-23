"""
One scheduled job, one run — even with two gunicorn workers.

init_scheduler is called from create_app and production runs
GUNICORN_WORKERS=2, so before this every cron trigger fired twice. The older
jobs tolerated it; the Telegram pushes would not, and a doubled 16:00 message
is exactly the nag failure the bot was built to avoid.
"""

import os
from datetime import datetime, timedelta

import pytest

from app.services.run_once import CrossWorkerLock, claim


@pytest.fixture
def disk(app, tmp_path):
    """A stand-in for the Render persistent disk the workers share."""
    original = app.config.get('UPLOAD_FOLDER')
    app.config['UPLOAD_FOLDER'] = str(tmp_path)
    yield app
    app.config['UPLOAD_FOLDER'] = original


class TestOnlyOneWorkerRuns:
    def test_the_first_claim_wins_and_the_second_is_refused(self, disk):
        """Both workers fire within milliseconds of the same cron trigger."""
        assert claim(disk, 'telegram_push_today') is True
        assert claim(disk, 'telegram_push_today') is False

    def test_different_jobs_do_not_block_each_other(self, disk):
        assert claim(disk, 'telegram_push_today') is True
        assert claim(disk, 'telegram_push_tomorrow') is True

    def test_a_mutex_alone_would_not_be_enough(self, disk):
        """A lock released quickly would let the second worker simply re-take it.

        The claim records WHEN, not just THAT, so a second attempt inside the
        window is refused however fast the first one finished.
        """
        now = datetime.utcnow()
        assert claim(disk, 'job', now=now) is True
        assert claim(disk, 'job', now=now + timedelta(seconds=1)) is False
        assert claim(disk, 'job', now=now + timedelta(seconds=59)) is False

    def test_tomorrow_the_job_runs_again(self, disk):
        """The guard must suppress a duplicate firing, never a daily job."""
        now = datetime.utcnow()
        assert claim(disk, 'job', now=now) is True
        assert claim(disk, 'job', now=now + timedelta(days=1)) is True

    def test_a_corrupt_marker_does_not_stop_the_job(self, disk):
        """Fail open: a bug here must never silence all 28 scheduled jobs."""
        claim(disk, 'job')
        path = os.path.join(disk.config['UPLOAD_FOLDER'], 'scheduler', 'job.last')
        with open(path, 'w') as handle:
            handle.write('not-a-timestamp')

        assert claim(disk, 'job') is True

    def test_an_unwritable_disk_does_not_stop_the_job(self, app):
        """Running twice is today's behaviour; running never is a regression."""
        original = app.config.get('UPLOAD_FOLDER')
        app.config['UPLOAD_FOLDER'] = '/proc/nonexistent-and-unwritable'
        try:
            assert claim(app, 'job') is True
        finally:
            app.config['UPLOAD_FOLDER'] = original


class TestTheRebuildLockSpansWorkers:
    def test_a_second_holder_is_refused_while_the_first_holds_it(self, disk):
        with CrossWorkerLock(disk, 'sap-pool-rebuild') as first:
            assert first.acquired is True
            with CrossWorkerLock(disk, 'sap-pool-rebuild') as second:
                assert second.acquired is False

    def test_it_is_released_on_exit(self, disk):
        with CrossWorkerLock(disk, 'sap-pool-rebuild') as first:
            assert first.acquired is True
        with CrossWorkerLock(disk, 'sap-pool-rebuild') as again:
            assert again.acquired is True

    def test_it_is_released_even_when_the_body_raises(self, disk):
        """A rebuild that crashes must not lock out every later rebuild."""
        with pytest.raises(RuntimeError):
            with CrossWorkerLock(disk, 'sap-pool-rebuild') as lock:
                assert lock.acquired is True
                raise RuntimeError('parse blew up')

        with CrossWorkerLock(disk, 'sap-pool-rebuild') as after:
            assert after.acquired is True

    def test_different_names_are_independent(self, disk):
        with CrossWorkerLock(disk, 'one') as first:
            with CrossWorkerLock(disk, 'two') as second:
                assert first.acquired and second.acquired
