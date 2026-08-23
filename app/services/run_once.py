"""
Make a scheduled job run once, not once per gunicorn worker.

`init_scheduler` is called from `create_app`, and production runs
GUNICORN_WORKERS=2 — so every cron trigger fires in BOTH workers. The 26 older
jobs mostly tolerated it because they are idempotent, but the Telegram pushes
are not: a doubled 16:00 message is the exact nag failure the bot was designed
to avoid, in the one channel that has to stay worth reading.

A file lock on the persistent disk rather than a Postgres advisory lock or a
table: the workers share the container's disk, Render attaches a disk to a
single instance so there is nothing else to coordinate with, and it needs no
migration — which matters here, because start.sh runs
`flask db upgrade || echo WARNING` and a failed migration does not stop the boot.

A mutex alone is NOT enough. Two workers fire milliseconds apart; if the first
finishes quickly the second would simply take the freed lock and run again. So
the claim also records WHEN the job last ran and refuses a second claim inside a
window.

FAIL-OPEN, deliberately. If the marker cannot be read or written, the job RUNS.
Double-firing is the behaviour we have today and can live with; a bug in this
file silently stopping all 28 scheduled jobs is far worse.
"""

import errno
import logging
import os
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# A daily cron fires once; the workers race within milliseconds of each other.
# An hour is enormous compared to that gap and still far below the interval of
# even the most frequent job here, so it cannot suppress a legitimate run.
DEFAULT_WINDOW_SECONDS = 3600


def _state_dir(app):
    """On the persistent disk, so the marker survives a worker restart."""
    base = app.config.get('UPLOAD_FOLDER') or '/tmp'
    path = os.path.join(base, 'scheduler')
    os.makedirs(path, exist_ok=True)
    return path


def claim(app, job_id, window_seconds=DEFAULT_WINDOW_SECONDS, now=None):
    """True if THIS process should run `job_id` right now.

    False means another worker already claimed this firing.
    """
    now = now or datetime.utcnow()
    try:
        import fcntl
        path = os.path.join(_state_dir(app), f'{job_id}.last')
        with open(path, 'a+') as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                handle.seek(0)
                raw = handle.read().strip()
                if raw:
                    try:
                        last = datetime.fromisoformat(raw)
                    except ValueError:
                        last = None
                    if last and now - last < timedelta(seconds=window_seconds):
                        return False
                handle.seek(0)
                handle.truncate()
                handle.write(now.isoformat())
                handle.flush()
                os.fsync(handle.fileno())
                return True
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)
    except Exception as e:  # noqa: BLE001
        # Fail open. See the module docstring: running twice beats not running.
        logger.warning('run-once claim for %s failed (%s) — running anyway', job_id, e)
        return True


class CrossWorkerLock:
    """A mutex that actually spans gunicorn workers.

    threading.Lock only covers one process, so a per-process lock guarding a
    long reconciliation lets the OTHER worker run the same reconciliation at the
    same time — two passes writing the same rows.

    Used as a context manager; `acquired` says whether it was taken.
    """

    def __init__(self, app, name):
        self.app = app
        self.name = name
        self.acquired = False
        self._handle = None

    def __enter__(self):
        try:
            import fcntl
            path = os.path.join(_state_dir(self.app), f'{self.name}.lock')
            self._handle = open(path, 'w')
            try:
                fcntl.flock(self._handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.acquired = True
            except OSError as e:
                if e.errno not in (errno.EACCES, errno.EAGAIN):
                    raise
                self.acquired = False
                self._handle.close()
                self._handle = None
        except Exception as e:  # noqa: BLE001
            # Fail open here too: a lock that cannot be taken must not become a
            # feature that cannot be used.
            logger.warning('cross-worker lock %s unavailable (%s)', self.name, e)
            self.acquired = True
        return self

    def __exit__(self, *exc):
        if self._handle is not None:
            try:
                import fcntl
                fcntl.flock(self._handle, fcntl.LOCK_UN)
            except Exception:  # noqa: BLE001
                pass
            self._handle.close()
            self._handle = None
        return False
