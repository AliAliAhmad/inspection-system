"""
Receiving end of the Windows file courier.

The courier on the terminal PC is a postman by design: it carries SAP export
files and does not read them. All understanding happens here, so a parser bug is
fixed by deploying this app rather than by physically returning to that PC.

This module is deliberately RECEIVE-ONLY for now. It stores the bytes, records
what arrived, and answers "what have you got?". Parsing the ten SAP transactions
is a separate task — doing it inside the upload request would put a 35 MB file's
parse inside the courier's 300-second timeout.

Contract (fixed by the courier, do not change unilaterally):

    POST /api/sap-sync/upload
      X-Robot-Key: <shared secret>
      multipart/form-data:
        file, sheet_name, source_filename, source_folder, sha256, captured_at

    200  accepted, or already_have=true if these exact bytes were seen before
    401  bad or missing key
    413  larger than MAX_CONTENT_LENGTH
    5xx  retriable — the courier will try again next cycle

    GET  /api/sap-sync/status     same header, read-only
"""

import hashlib
import hmac
import threading
import logging
import os
from datetime import datetime

from flask import Blueprint, request, jsonify, current_app

from app.extensions import db
from app.models import SapSyncFile

logger = logging.getLogger(__name__)

bp = Blueprint('sap_sync', __name__)

# One rebuild at a time — two racing reconciliations of the same files would
# fight over the same rows for no benefit.
_REBUILD_LOCK = threading.Lock()

# Subdirectory of UPLOAD_FOLDER. On Render, UPLOAD_FOLDER is the mount point of
# the 1 GB persistent disk, which is the only place bytes survive a deploy.
SAP_SUBDIR = 'sap_sync'


def _require_robot_key():
    """Authenticate the courier.

    A machine on a terminal PC, not a person — so a static shared secret rather
    than the human JWT login. Refuses to serve at all when the key is unset, so a
    misconfigured deploy rejects everything instead of silently accepting
    anything from anyone.
    """
    expected = current_app.config.get('SAP_SYNC_ROBOT_KEY') or ''
    if not expected:
        logger.error('SAP_SYNC_ROBOT_KEY is not set — refusing all sync requests')
        return jsonify({'status': 'error',
                        'message': 'sync endpoint not configured'}), 401

    provided = request.headers.get('X-Robot-Key', '')
    # compare_digest, not ==, so a wrong key cannot be discovered a character at
    # a time by timing the response.
    if not hmac.compare_digest(provided, expected):
        logger.warning('SAP sync rejected: bad X-Robot-Key from %s', request.remote_addr)
        return jsonify({'status': 'error', 'message': 'invalid robot key'}), 401
    return None


def _storage_dir():
    base = current_app.config.get('UPLOAD_FOLDER')
    path = os.path.join(base, SAP_SUBDIR)
    os.makedirs(path, exist_ok=True)
    return path


def _safe_stored_name(source_folder, source_filename, sha256):
    """A flat, collision-proof filename.

    Never trust the client's path components — the name is rebuilt from a hash
    plus a sanitised basename so a crafted source_filename cannot escape the
    storage directory.
    """
    base = os.path.basename(source_filename or 'unnamed')
    safe = ''.join(c if (c.isalnum() or c in '._-') else '_' for c in base)[:120]
    folder = ''.join(c if c.isalnum() else '_' for c in (source_folder or 'root'))[:40]
    return f'{folder}__{sha256[:16]}__{safe}'


def _parse_captured_at(raw):
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace('Z', '+00:00')).replace(tzinfo=None)
    except (ValueError, TypeError):
        logger.warning('SAP sync: unparseable captured_at %r — storing NULL', raw)
        return None


@bp.route('/upload', methods=['POST'])
def upload_sap_file():
    """Accept one SAP export file from the courier."""
    denied = _require_robot_key()
    if denied:
        return denied

    upload = request.files.get('file')
    if upload is None:
        return jsonify({'status': 'error', 'message': 'no file part'}), 400

    sheet_name = (request.form.get('sheet_name') or 'OTHER').strip()[:20]
    source_filename = (request.form.get('source_filename') or upload.filename or '').strip()
    source_folder = (request.form.get('source_folder') or 'unknown').strip()[:100]
    claimed_sha = (request.form.get('sha256') or '').strip().lower()
    captured_at = _parse_captured_at(request.form.get('captured_at'))

    if not source_filename:
        return jsonify({'status': 'error', 'message': 'source_filename is required'}), 400

    payload = upload.read()
    actual_sha = hashlib.sha256(payload).hexdigest()

    # Verify rather than trust. A mismatch means the bytes changed in flight —
    # exactly the truncated-file case the courier's stability check guards
    # against on its side. Storing a half file would produce silently wrong
    # numbers downstream, which is far worse than rejecting it.
    if claimed_sha and claimed_sha != actual_sha:
        logger.warning('SAP sync: sha mismatch for %s/%s (claimed %s, got %s)',
                       source_folder, source_filename, claimed_sha[:12], actual_sha[:12])
        return jsonify({'status': 'error', 'message': 'sha256 mismatch — file may be truncated',
                        'expected': claimed_sha, 'actual': actual_sha}), 400

    existing = SapSyncFile.query.filter_by(
        source_folder=source_folder, source_filename=source_filename, sha256=actual_sha
    ).first()
    if existing:
        # A retry, or the courier's state file was lost. Not an error.
        return jsonify({'status': 'ok', 'already_have': True,
                        'file_id': existing.id,
                        'received_at': existing.received_at.isoformat()}), 200

    stored_name = _safe_stored_name(source_folder, source_filename, actual_sha)
    stored_full = os.path.join(_storage_dir(), stored_name)
    with open(stored_full, 'wb') as fh:
        fh.write(payload)

    record = SapSyncFile(
        sheet_name=sheet_name,
        source_folder=source_folder,
        source_filename=source_filename,
        sha256=actual_sha,
        file_size=len(payload),
        captured_at=captured_at,
        stored_path=os.path.join(SAP_SUBDIR, stored_name),
        is_current=True,
    )
    db.session.add(record)
    db.session.flush()

    # Retire every older version of this same file: drop its bytes from the disk
    # but KEEP its row. The rows are tiny and they are the audit trail; the bytes
    # are 35 MB each and only the newest is ever needed. Without this the 1 GB
    # disk fills in about four days.
    superseded = SapSyncFile.query.filter(
        SapSyncFile.source_folder == source_folder,
        SapSyncFile.source_filename == source_filename,
        SapSyncFile.id != record.id,
        SapSyncFile.is_current.is_(True),
    ).all()
    freed = 0
    for old in superseded:
        old.is_current = False
        if old.stored_path:
            try:
                os.remove(os.path.join(current_app.config['UPLOAD_FOLDER'], old.stored_path))
                freed += old.file_size or 0
            except OSError as e:
                # Already gone, or the disk is unhappy. Not worth failing the
                # upload over — the row is marked superseded either way.
                logger.warning('SAP sync: could not delete superseded %s: %s', old.stored_path, e)
        old.stored_path = None

    db.session.commit()

    logger.info('SAP sync: stored %s/%s (%s, %.1f MB) superseded=%d freed=%.1f MB',
                source_folder, source_filename, sheet_name,
                len(payload) / 1048576, len(superseded), freed / 1048576)

    return jsonify({
        'status': 'ok',
        'already_have': False,
        'file_id': record.id,
        'sheet_name': sheet_name,
        'bytes': len(payload),
        'superseded': len(superseded),
    }), 200


@bp.route('/status', methods=['GET'])
def sap_sync_status():
    """What has arrived, and when.

    Exists because silent success is nearly as bad as silent failure: without
    this, the only evidence the pipe works lives in a log file on a Windows PC
    nobody looks at. This makes "MB52 has not landed since Tuesday" visible.
    """
    denied = _require_robot_key()
    if denied:
        return denied

    current = SapSyncFile.query.filter_by(is_current=True).order_by(
        SapSyncFile.source_folder, SapSyncFile.source_filename
    ).all()

    newest = max((f.received_at for f in current), default=None)
    total_bytes = sum(f.file_size or 0 for f in current if f.stored_path)

    return jsonify({
        'status': 'ok',
        'files': [f.to_dict() for f in current],
        'file_count': len(current),
        'stored_bytes': total_bytes,
        'stored_mb': round(total_bytes / 1048576, 1),
        'last_received_at': newest.isoformat() if newest else None,
    }), 200


@bp.route('/rebuild-pool', methods=['POST'])
def rebuild_pool():
    """Re-read the delivered SAP files and refresh the job pool.

    Safe to call repeatedly — it is a reconciliation, not an append.

    Runs in a BACKGROUND THREAD and returns 202 immediately. A full rebuild
    parses roughly 50 MB of Excel and takes over a minute; holding an HTTP
    request open that long invites a proxy timeout, and the caller would then
    retry work that is already running.

    ?dry_run=true runs synchronously and returns the full report — it is a
    manual diagnostic, and the whole point is to see what WOULD change.

    Uses the same robot key as the upload: machine-triggered work run after a
    delivery, not a user action.
    """
    denied = _require_robot_key()
    if denied:
        return denied

    from app.services.sap_pool_sync import sync_pool_from_delivered_files

    if str(request.args.get('dry_run', '')).lower() in ('1', 'true', 'yes'):
        try:
            return jsonify(sync_pool_from_delivered_files(dry_run=True)), 200
        except Exception as e:  # noqa: BLE001
            db.session.rollback()
            logger.exception('Pool rebuild dry run failed')
            return jsonify({'status': 'error', 'message': str(e)}), 500

    if _REBUILD_LOCK.locked():
        # A rebuild is a full reconciliation of the same files; a second one
        # racing the first would fight over the same rows for no benefit.
        return jsonify({'status': 'busy',
                        'message': 'a pool rebuild is already running'}), 409

    app = current_app._get_current_object()

    def run():
        with _REBUILD_LOCK:
            with app.app_context():
                try:
                    report = sync_pool_from_delivered_files()
                    logger.info('Pool rebuild finished: created=%s updated=%s removed=%s '
                                'unmatched_equipment=%s',
                                report.get('created'), report.get('updated'),
                                report.get('removed_from_pool'),
                                report.get('equipment_unmatched'))
                except Exception:  # noqa: BLE001
                    db.session.rollback()
                    logger.exception('Pool rebuild failed')

    threading.Thread(target=run, daemon=True, name='sap-pool-rebuild').start()
    return jsonify({
        'status': 'accepted',
        'message': ('Rebuild started in the background. It parses ~50 MB of Excel and '
                    'takes a minute or two; check the logs or /status for the result.'),
    }), 202
