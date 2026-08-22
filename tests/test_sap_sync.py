"""
Receiving end of the Windows SAP file courier.

The pairing that matters most here is the sha256 check. The courier goes to real
trouble on its side to avoid shipping a half-written file (SAP's own export
script writes 35 MB workbooks straight into the watched folder). If a truncated
file did arrive, storing it would produce silently WRONG numbers downstream —
fewer orders, missing equipment — with no error anywhere. So the server verifies
the bytes it actually received rather than trusting the hash it was handed.
"""

import hashlib
import io
import os

import pytest

from app.extensions import db
from app.models import SapSyncFile


KEY = 'test-robot-key-123'


@pytest.fixture(autouse=True)
def robot_key(app):
    app.config['SAP_SYNC_ROBOT_KEY'] = KEY
    yield
    app.config['SAP_SYNC_ROBOT_KEY'] = ''


def _post(client, payload=b'fake-xlsx-bytes', *, filename='IW39 YTD.XLSX',
          folder='sap_import', sheet='IW39', sha=None, key=KEY,
          captured_at='2026-08-22T06:14:00Z'):
    data = {
        'file': (io.BytesIO(payload), filename),
        'sheet_name': sheet,
        'source_filename': filename,
        'source_folder': folder,
        'sha256': hashlib.sha256(payload).hexdigest() if sha is None else sha,
        'captured_at': captured_at,
    }
    headers = {'X-Robot-Key': key} if key is not None else {}
    return client.post('/api/sap-sync/upload', data=data,
                       content_type='multipart/form-data', headers=headers)


class TestAuthentication:
    def test_missing_key_is_refused(self, client):
        assert _post(client, key=None).status_code == 401

    def test_wrong_key_is_refused(self, client):
        assert _post(client, key='not-the-key').status_code == 401

    def test_unconfigured_server_refuses_everything(self, client, app):
        """A deploy that forgot the env var must reject, not accept anything."""
        app.config['SAP_SYNC_ROBOT_KEY'] = ''
        assert _post(client, key='anything').status_code == 401

    def test_status_needs_the_key_too(self, client):
        assert client.get('/api/sap-sync/status').status_code == 401


class TestReceiving:
    def test_file_is_stored_and_recorded(self, client, app):
        payload = b'IW39 export bytes' * 100
        resp = _post(client, payload)

        assert resp.status_code == 200
        body = resp.get_json()
        assert body['already_have'] is False
        assert body['bytes'] == len(payload)

        row = db.session.get(SapSyncFile, body['file_id'])
        assert row.sheet_name == 'IW39'
        assert row.source_folder == 'sap_import'
        assert row.sha256 == hashlib.sha256(payload).hexdigest()
        assert row.is_current is True
        assert row.captured_at is not None, 'captured_at should survive the ISO-8601 Z suffix'

        on_disk = os.path.join(app.config['UPLOAD_FOLDER'], row.stored_path)
        assert os.path.exists(on_disk)
        assert open(on_disk, 'rb').read() == payload

    def test_same_bytes_twice_is_a_no_op(self, client):
        """The courier retries after a network failure — that must not duplicate."""
        payload = b'identical bytes'
        first = _post(client, payload)
        second = _post(client, payload)

        assert second.status_code == 200
        assert second.get_json()['already_have'] is True
        assert second.get_json()['file_id'] == first.get_json()['file_id']
        assert SapSyncFile.query.count() == 1

    def test_same_filename_in_two_folders_is_two_files(self, client):
        """There is an SQ01 in BOTH sap_import and Source file."""
        _post(client, b'aaa', filename='SQ01.XLSX', folder='sap_import', sheet='SQ01')
        _post(client, b'bbb', filename='SQ01.xlsb', folder='Source file', sheet='SQ01')
        assert SapSyncFile.query.count() == 2

    def test_missing_filename_is_rejected(self, client):
        resp = client.post('/api/sap-sync/upload',
                           data={'file': (io.BytesIO(b'x'), ''), 'source_filename': ''},
                           content_type='multipart/form-data',
                           headers={'X-Robot-Key': KEY})
        assert resp.status_code == 400


class TestTruncatedFileIsRefused:
    def test_sha_mismatch_is_rejected_not_stored(self, client):
        """THE important one.

        A file that changed in flight — or was read mid-write — must never be
        stored. Accepting it would mean parsing fewer rows than SAP actually
        exported and producing a quietly wrong plan.
        """
        resp = _post(client, b'truncated', sha=hashlib.sha256(b'the whole file').hexdigest())

        assert resp.status_code == 400
        assert 'truncated' in resp.get_json()['message']
        assert SapSyncFile.query.count() == 0, 'nothing may be stored on mismatch'


class TestOnlyTheNewestCopyIsKept:
    def test_superseded_bytes_are_deleted_but_the_row_survives(self, client, app):
        """The 1 GB disk holds ~250 MB of current files forever, not 250 MB/day."""
        old = _post(client, b'monday version')
        old_row = db.session.get(SapSyncFile, old.get_json()['file_id'])
        old_path = os.path.join(app.config['UPLOAD_FOLDER'], old_row.stored_path)
        assert os.path.exists(old_path)

        new = _post(client, b'tuesday version')
        assert new.get_json()['superseded'] == 1

        db.session.expire_all()
        old_row = db.session.get(SapSyncFile, old.get_json()['file_id'])
        assert old_row is not None, 'history row must survive — it answers "when did MB52 last land?"'
        assert old_row.is_current is False
        assert old_row.stored_path is None
        assert not os.path.exists(old_path), 'the old bytes must be gone from the disk'

        assert SapSyncFile.query.filter_by(is_current=True).count() == 1


class TestStatus:
    def test_status_lists_current_files_only(self, client):
        _post(client, b'v1', filename='IW39 YTD.XLSX', sheet='IW39')
        _post(client, b'v2', filename='IW39 YTD.XLSX', sheet='IW39')   # supersedes v1
        _post(client, b'mb', filename='mb52 ytd.XLSX', sheet='MB52')

        resp = client.get('/api/sap-sync/status', headers={'X-Robot-Key': KEY})
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['file_count'] == 2
        names = {f['source_filename'] for f in body['files']}
        assert names == {'IW39 YTD.XLSX', 'mb52 ytd.XLSX'}
        assert body['last_received_at'] is not None
