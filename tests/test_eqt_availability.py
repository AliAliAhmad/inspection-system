"""The planners' daily equipment availability (Rule 2, Ali 2026-11-27).

Shown on the board only for now. Built on the shape of the first real file:
185 machines, 11 not available, every stop reason OTHER (the mail gives a
status only), parked counted as available.
"""

import hashlib
import io
from datetime import datetime

import pytest
from openpyxl import Workbook

from app.services import eqt_availability
from tests.conftest import get_auth_header

KEY = "eqt-availability-key"
HEADER = ["Equipment", "Available", "Stop type", "Reason", "Mail received"]
MAIL = "2026-11-27 18:45"

REAL_SHAPE = [
    ["TT058", "Yes", None, None, MAIL],
    ["FL302", "No", "OTHER", "Not Available", MAIL],
    ["RTG01", "Yes", None, "Parked", MAIL],
    ["RS112", "No", "OTHER", "Not Available", MAIL],
    ["FL304", "No", "OTHER", "Not Available", MAIL],
]


def _xlsx(rows, header=HEADER):
    book = Workbook()
    ws = book.active
    ws.append(header)
    for row in rows:
        ws.append(row)
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()


def _deliver(client, payload, filename="EQT_Availability.xlsx", folder="Source file"):
    resp = client.post(
        "/api/sap-sync/upload",
        headers={"X-Robot-Key": KEY},
        content_type="multipart/form-data",
        data={
            "file": (io.BytesIO(payload), filename),
            "sheet_name": "OTHER",
            "source_filename": filename,
            "source_folder": folder,
            "sha256": hashlib.sha256(payload).hexdigest(),
        },
    )
    assert resp.status_code == 200, resp.get_json()


@pytest.fixture(autouse=True)
def robot_key(app):
    app.config["SAP_SYNC_ROBOT_KEY"] = KEY
    eqt_availability._cache.clear()
    yield
    eqt_availability._cache.clear()


def _get(client):
    return client.get(
        "/api/eqt-availability",
        headers=get_auth_header(client, "admin@test.com", "admin123"),
    )


class TestTheRealFile:
    def test_stopped_machines_first_and_counted(self, client, admin_user):
        _deliver(client, _xlsx(REAL_SHAPE))
        data = _get(client).get_json()["data"]
        assert data["available"] is True
        assert data["machines"] == 5
        assert data["not_available_count"] == 3
        assert [r["equipment"] for r in data["rows"]] == [
            "FL302",
            "FL304",
            "RS112",
            "RTG01",
            "TT058",
        ]
        assert data["mail_received"] == MAIL

    def test_parked_counts_as_available(self):
        rows = eqt_availability.parse(_xlsx(REAL_SHAPE))
        rtg = next(r for r in rows if r["equipment"] == "RTG01")
        assert rtg["available"] is True and rtg["stop_type"] is None


class TestTheRules:
    def test_a_new_upload_replaces_the_list(self, client, admin_user):
        _deliver(client, _xlsx(REAL_SHAPE))
        _deliver(client, _xlsx([["TT001", "No", "OTHER", "Not Available", MAIL]]))
        data = _get(client).get_json()["data"]
        assert [r["equipment"] for r in data["rows"]] == ["TT001"]

    def test_header_only_means_every_machine_available(self, client, admin_user):
        _deliver(client, _xlsx([]))
        data = _get(client).get_json()["data"]
        assert data["available"] is True and data["rows"] == []

    def test_never_delivered_is_not_the_same_as_empty(self, client, admin_user):
        assert _get(client).get_json()["data"]["available"] is False

    def test_an_unknown_stop_type_becomes_other(self):
        rows = eqt_availability.parse(_xlsx([["TT001", "No", "BROKEN", "x", MAIL]]))
        assert rows[0]["stop_type"] == "OTHER"

    def test_a_typo_never_marks_a_machine_stopped(self):
        rows = eqt_availability.parse(_xlsx([["TT001", "Ys", None, None, MAIL]]))
        assert rows[0]["available"] is True

    def test_found_by_exact_name_only(self, client, admin_user):
        _deliver(client, _xlsx(REAL_SHAPE), filename="EQT_Availability_old.xlsx")
        assert _get(client).get_json()["data"]["available"] is False

    def test_a_missing_column_is_refused_by_name(self):
        with pytest.raises(ValueError, match="available"):
            eqt_availability.parse(_xlsx([["TT001"]], header=["Equipment"]))


class TestStaleness:
    def test_older_than_three_days_is_stale(self):
        rows = eqt_availability.parse(_xlsx(REAL_SHAPE))
        fresh = eqt_availability.build_payload(rows, now=datetime(2026, 11, 28, 6, 0))
        old = eqt_availability.build_payload(rows, now=datetime(2026, 12, 1, 18, 0))
        assert fresh["is_stale"] is False
        assert old["is_stale"] is True


class TestPlannersOnly:
    def test_an_inspector_may_not(self, client, mech_inspector):
        resp = client.get(
            "/api/eqt-availability",
            headers=get_auth_header(client, mech_inspector.email, "test123"),
        )
        assert resp.status_code == 403

    def test_no_login_no_list(self, client):
        assert client.get("/api/eqt-availability").status_code == 401
