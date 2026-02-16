"""
PROCESS TEST: File Upload Workflow
====================================
Validates attachment flow:
  Upload file → Link to inspection → Retrieve → Delete

Mocks Cloudinary so the test runs without real cloud credentials.
"""

import io
import pytest
from unittest.mock import patch, MagicMock
from tests.process.conftest import login


def _mock_cloudinary_upload(file_or_bytes, **kwargs):
    """Fake Cloudinary upload — returns a result dict like the real API."""
    return {
        'secure_url': 'https://res.cloudinary.com/test/image/upload/v1/test_photo.png',
        'public_id': 'inspection_system/photo/2026/02/16/test_photo',
        'resource_type': kwargs.get('resource_type', 'image'),
        'tags': [],
        'info': {},
    }


@pytest.mark.usefixtures('db_session')
class TestFileUploadProcess:
    """Test file upload linked to an inspection."""

    @patch('app.services.file_service.cloudinary.uploader.upload', side_effect=_mock_cloudinary_upload)
    @patch('app.services.file_service._init_cloudinary')  # no-op
    def test_upload_and_list_file(
        self, mock_init, mock_upload,
        client, admin_user, inspector_user,
        test_equipment, test_template, test_assignment,
    ):
        """Upload a test image, verify it's linked, then delete."""
        # Login as inspector
        _, header = login(client, 'inspector@process-test.com', 'Inspect123!')

        # Start inspection
        resp = client.get(
            f'/api/inspections/by-assignment/{test_assignment.id}',
            headers=header,
        )
        assert resp.status_code in (200, 201)
        iid = resp.get_json()['data']['id']

        # Create a small valid PNG file (1x1 pixel)
        png_bytes = (
            b'\x89PNG\r\n\x1a\n'  # PNG signature
            b'\x00\x00\x00\rIHDR'
            b'\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02'
            b'\x00\x00\x00\x90wS\xde'
            b'\x00\x00\x00\x0cIDATx'
            b'\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05'
            b'\x18\xd8N'
            b'\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        data = {
            'file': (io.BytesIO(png_bytes), 'test_photo.png'),
            'related_type': 'inspection',
            'related_id': str(iid),
            'category': 'photo',
        }

        resp = client.post(
            '/api/files/upload',
            headers=header,
            data=data,
            content_type='multipart/form-data',
        )
        assert resp.status_code == 201, f"Upload failed: {resp.get_json()}"
        file_data = resp.get_json()['data']
        assert file_data['related_type'] == 'inspection'
        assert file_data['related_id'] == iid
        file_id = file_data['id']

        # List files for this inspection
        resp = client.get(
            f'/api/files?related_type=inspection&related_id={iid}',
            headers=header,
        )
        assert resp.status_code == 200
        files = resp.get_json()['data']
        assert any(f['id'] == file_id for f in files)

        # Delete (mock Cloudinary destroy too)
        with patch('app.services.file_service.cloudinary.uploader.destroy'):
            resp = client.delete(f'/api/files/{file_id}', headers=header)
            assert resp.status_code == 200
