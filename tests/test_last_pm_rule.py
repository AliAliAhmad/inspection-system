"""Rule 1 (Ali, 2026-11-27): among jobs with the SAME score, the machine whose last
finished PM is oldest goes first. It never changes a score, so overdue and urgent
work always still wins. Plan: tasks/rule1-oldest-last-pm.md.
"""

import hashlib
import io

import pandas as pd
import pytest

from app.services import last_pm
from app.services.sap_order_parser import build_last_pm_by_machine
from tests.conftest import get_auth_header

KEY = "last-pm-key"

COLUMNS = [
    "Order",
    "MaintActivityType",
    "Main work center",
    "System status",
    "Functional Location",
    "Description",
    "Basic start date",
    "Priority",
    "Work Center",
    "Equipment",
    "Maintenance Plan",
    "Created on",
    "Actual Order Finish Date",
    "User Status",
    "Deletion flag",
]


def _iw39(rows):
    frame = pd.DataFrame(
        [{**{c: None for c in COLUMNS}, **row} for row in rows], columns=COLUMNS
    )
    buffer = io.BytesIO()
    frame.to_excel(buffer, index=False)
    return buffer.getvalue()


def _done(code, finished, activity="PRM", centre="MES-MECH", status="TECO CNF"):
    return {
        "Order": f"7000{code}{finished}",
        "MaintActivityType": activity,
        "Main work center": centre,
        "System status": status,
        "Functional Location": f"3700-EQ-TT_-{code}",
        "Actual Order Finish Date": finished,
    }


class TestWhatCountsAsAVisit:
    def test_only_a_finished_pm_counts_and_the_newest_wins(self):
        index = build_last_pm_by_machine(
            _iw39(
                [
                    _done("TT001", "2026-05-01"),
                    _done("TT001", "2026-08-24"),  # newer PM wins
                    _done("TT001", "2026-11-20", activity="COM"),  # a fault fix: no
                    _done("TT002", "2026-11-01", status="REL"),  # still open: no
                    _done("TT003", "2026-10-01", centre="OPS-MECH"),  # not the workshop
                ]
            )
        )
        assert index == {"TT001": "2026-08-24"}

    def test_a_pm_with_no_finish_date_is_skipped(self):
        assert build_last_pm_by_machine(_iw39([_done("TT001", None)])) == {}


class TestTheNightlySyncSavesIt:
    @pytest.fixture(autouse=True)
    def robot_key(self, app):
        app.config["SAP_SYNC_ROBOT_KEY"] = KEY

    def _deliver(self, client, payload):
        return client.post(
            "/api/sap-sync/upload",
            headers={"X-Robot-Key": KEY},
            content_type="multipart/form-data",
            data={
                "file": (io.BytesIO(payload), "IW39 YTD.XLSX"),
                "sheet_name": "IW39",
                "source_filename": "IW39 YTD.XLSX",
                "source_folder": "sap_import",
                "sha256": hashlib.sha256(payload).hexdigest(),
            },
        )

    def test_saved_and_reported(self, client):
        from app.services.sap_pool_sync import sync_pool_from_delivered_files

        self._deliver(
            client, _iw39([_done("TT001", "2026-03-02"), _done("RS109", "2026-09-15")])
        )
        report = sync_pool_from_delivered_files(today="2026-11-27")
        assert last_pm.load()["by_machine"] == {
            "TT001": "2026-03-02",
            "RS109": "2026-09-15",
        }
        assert report["last_pm"] == {
            "machines": 2,
            "oldest": "2026-03-02",
            "newest": "2026-09-15",
        }

    def test_a_dry_run_saves_nothing(self, client):
        from app.services.sap_pool_sync import sync_pool_from_delivered_files

        self._deliver(client, _iw39([_done("TT001", "2026-03-02")]))
        sync_pool_from_delivered_files(today="2026-11-27", dry_run=True)
        assert last_pm.load()["available"] is False


class TestTheTieBreak:
    PM = dict(
        job_type="pm",
        maintenance_base="calendar",
        overdue_unit="days",
        source="sap",
        estimated_hours=4,
        description="PM",
    )

    def _order(self, *candidates):
        from app.services.work_plan_generator_service import _step_bundle

        return [
            b["members"][0]["equipment_name"] for b in _step_bundle(list(candidates))
        ]

    def _job(self, name, eq_id, score=40, late=None, **extra):
        return dict(
            self.PM,
            equipment_name=name,
            equipment_id=eq_id,
            score=score,
            overdue_value=late,
            **extra,
        )

    def test_on_the_same_score_the_oldest_last_pm_goes_first(self):
        last_pm.save(
            {"TT030": "2026-11-17", "RS112": "2026-08-24", "FL305": "2026-10-18"}
        )
        assert self._order(
            self._job("TT030", 1), self._job("RS112", 2), self._job("FL305", 3)
        ) == ["RS112", "FL305", "TT030"]

    def test_a_machine_with_no_pm_on_record_goes_first(self):
        last_pm.save({"TT030": "2026-01-05"})
        assert self._order(self._job("TT030", 1), self._job("SV210", 2)) == [
            "SV210",
            "TT030",
        ]

    def test_a_higher_score_always_wins(self):
        """The promise to Ali: an overdue machine never loses to this rule."""
        last_pm.save({"TT058": "2026-11-24", "RS112": "2025-01-01"})
        assert self._order(
            self._job("RS112", 2, score=40), self._job("TT058", 1, score=42.9, late=2)
        ) == ["TT058", "RS112"]

    def test_days_late_still_decides_before_the_last_pm(self):
        last_pm.save({"TT001": "2026-11-20", "TT002": "2025-01-01"})
        assert self._order(
            self._job("TT002", 2, score=100, late=8),
            self._job("TT001", 1, score=100, late=30),
        ) == ["TT001", "TT002"]

    def test_a_job_with_no_machine_goes_last(self):
        last_pm.save({"TT001": "2026-11-20"})
        orphan = dict(
            self.PM,
            equipment_name="no machine",
            equipment_id=None,
            score=40,
            overdue_value=None,
        )
        assert self._order(orphan, self._job("TT001", 1)) == ["TT001", "no machine"]

    def test_no_list_means_the_old_order(self):
        """Never built: every rank is 0, so the order is the one before this rule."""
        bundles_order = self._order(self._job("TT030", 1), self._job("RS112", 2))
        assert bundles_order == ["TT030", "RS112"]

    def test_a_broken_file_never_stops_a_plan(self):
        with open(last_pm._path(), "w") as handle:
            handle.write("{not json")
        assert self._order(self._job("TT030", 1), self._job("RS112", 2)) == [
            "TT030",
            "RS112",
        ]

    def test_the_distribute_order_keeps_it(self):
        from app.services.work_plan_generator_service import (
            _apply_recipe_ordering,
            _step_bundle,
        )

        last_pm.save({"TT030": "2026-11-17", "RS112": "2026-08-24"})
        bundles = _step_bundle([self._job("TT030", 1), self._job("RS112", 2)])
        # Hand it over in the WRONG order: the re-sort must put RS112 back first.
        wrong = sorted(
            bundles, key=lambda b: b["members"][0]["equipment_name"] != "TT030"
        )
        ordered = _apply_recipe_ordering(wrong, [], "priority_first")
        assert [b["members"][0]["equipment_name"] for b in ordered] == [
            "RS112",
            "TT030",
        ]


class TestTheEndpoint:
    def test_a_planner_sees_the_dates(self, client, admin_user):
        last_pm.save({"RS112": "2026-08-24"})
        resp = client.get(
            "/api/last-pm",
            headers=get_auth_header(client, "admin@test.com", "admin123"),
        )
        assert resp.status_code == 200
        assert resp.get_json()["data"]["by_machine"] == {"RS112": "2026-08-24"}

    def test_an_inspector_may_not(self, client, mech_inspector):
        resp = client.get(
            "/api/last-pm",
            headers=get_auth_header(client, mech_inspector.email, "test123"),
        )
        assert resp.status_code == 403


class TestAMachineKnownBySerial:
    """The sync matches a plant code by name OR serial. A machine whose name has
    no code must still be found, or it would sink below every dated machine."""

    def test_the_serial_number_carries_the_code(self, db_session):
        from app.models import Equipment
        from app.services.work_plan_generator_service import _step_bundle
        named = Equipment(name='Terminal Tractor seven', serial_number='TT077',
                          equipment_type='tractor')
        db_session.session.add(named)
        db_session.session.commit()
        last_pm.save({'TT077': '2025-01-01', 'TT030': '2026-11-17'})
        pm = dict(job_type='pm', maintenance_base='calendar', overdue_unit='days',
                  source='sap', estimated_hours=4, description='PM', score=40,
                  overdue_value=None)
        bundles = _step_bundle([dict(pm, equipment_name='TT030', equipment_id=999),
                                dict(pm, equipment_name=named.name, equipment_id=named.id)])
        assert [b['members'][0]['equipment_name'] for b in bundles] == [
            'Terminal Tractor seven', 'TT030']
        assert bundles[0]['last_pm'] == '2025-01-01'


def test_an_iw39_with_no_pm_rows_gives_an_empty_list():
    """A file holding only faults must not crash the nightly sync (it did)."""
    assert build_last_pm_by_machine(_iw39([_done('TT001', '2026-05-01', activity='COM')])) == {}
