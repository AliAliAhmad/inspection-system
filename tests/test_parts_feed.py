"""Steps 1-2 of tasks/parts-hold-plan.md: read ME5K / ME5A / ME2L and work out
which known orders wait for parts. SHADOW ONLY — nothing holds work on it yet.

Rows are shaped like the real exports seen on production (2026-11-24/27):
ME2L's first data row is a TOTALS row with no document number; deletion flags
are the text 'true' / 'false'; item numbers arrive as '10' or '00010'.
"""

import hashlib
import io
from datetime import datetime

import pytest
from openpyxl import Workbook

from app.services import parts_feed
from app.services.parts_status import (
    CANCELLED,
    CHECK,
    CLEAR,
    ORDERED,
    RECEIVED,
    UNKNOWN,
    WAITING,
    whole_po_state,
)

KEY = "parts-feed-key"
ORDER = "700001811715"
OTHER_ORDER = "700001999999"
KNOWN = {ORDER, OTHER_ORDER}

ME5K_HEADER = [
    "Requisitioner",
    "Cost Center",
    "G/L Account",
    "Order",
    "Purchase Requisition",
    "Short Text",
    "Item of Requisition",
    "Purchase Order",
    "Purchase Order Item",
    "Delivery Date",
    "Release Date",
    "Requisition Date",
]
ME5A_HEADER = [
    "Purchasing Group",
    "Requisition Date",
    "Purchase Requisition",
    "Purchase Order",
    "Release Date",
    "Item of Requisition",
    "Release indicator",
    "Material",
    "Short Text",
    "Deletion Indicator",
]
ME2L_HEADER = [
    "Purchasing Document",
    "Plant",
    "Short Text",
    "Order Quantity",
    "Still to be delivered (qty)",
    "Item",
    "Deletion Indicator",
    "No. of Positions",
]
TOTALS = ["", "", "", None, None, "", "", 27344]


def _xlsx(header, rows):
    book = Workbook()
    ws = book.active
    ws.append(header)
    for row in rows:
        ws.append(row)
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()


def me5k(*rows):
    """(order, pr, item, po, po_item, text)"""
    return _xlsx(
        ME5K_HEADER,
        [
            ["X", "CC", "GL", o, pr, t, it, po, poi, "20260920", None, None]
            for o, pr, it, po, poi, t in rows
        ],
    )


def me5a(*rows):
    """(pr, item, po, deleted)"""
    return _xlsx(
        ME5A_HEADER,
        [["SPR", None, pr, po, None, it, "X", "", "part", d] for pr, it, po, d in rows],
    )


def me2l(*rows):
    """(po, item, still, deleted)"""
    return _xlsx(
        ME2L_HEADER,
        [TOTALS]
        + [[po, "3700", "part", 140, still, it, d, None] for po, it, still, d in rows],
    )


def ops(order=ORDER, pr="1000409875", item="10", text="Suspension cylinder"):
    return {
        order: [
            {
                "operation_number": "0010",
                "purchase_requisition": pr,
                "requisition_item": item,
                "material_text": text,
            }
        ]
    }


def _run_pure(iw49_ops, me5k_bytes=None, me5a_bytes=None, me2l_bytes=None):
    today = parts_feed.read_me5k(io.BytesIO(me5k_bytes)) if me5k_bytes else []
    links = parts_feed.remember({}, today, datetime(2026, 11, 28))
    today_keys = {(l["pr"], l["pr_item"]) for l in today}
    iw49 = parts_feed.iw49_requests(iw49_ops, KNOWN)
    prs = {k[0] for r in iw49.values() for k in r} | {l["pr"] for l in links.values()}
    a = parts_feed.read_me5a(io.BytesIO(me5a_bytes), prs) if me5a_bytes else {}
    pos = {r["po"] for r in a.values() if r["po"]} | {
        l["po"] for l in links.values() if l["po"]
    }
    lines, by_po = (
        parts_feed.read_me2l(io.BytesIO(me2l_bytes), pos) if me2l_bytes else ({}, {})
    )
    return parts_feed.build(iw49, links, today_keys, a, lines, by_po, KNOWN)


class TestTheReader:
    def test_keeps_only_the_named_columns_and_the_wanted_rows(self):
        rows = list(
            parts_feed.stream_rows(
                io.BytesIO(
                    me2l(
                        ("4500422737", "10", 140, "false"),
                        ("4500000001", "10", 5, "false"),
                    )
                ),
                parts_feed.ME2L_COLUMNS,
                keep=lambda r: r["po"] == "4500422737",
            )
        )
        assert rows == [
            {"po": "4500422737", "po_item": "10", "still": 140, "deleted": "false"}
        ]

    def test_a_missing_column_is_named(self):
        with pytest.raises(ValueError, match="still"):
            list(
                parts_feed.stream_rows(
                    io.BytesIO(_xlsx(["Purchasing Document", "Item"], [])),
                    parts_feed.ME2L_COLUMNS,
                )
            )

    def test_the_me2l_totals_row_is_dropped(self):
        lines, by_po = parts_feed.read_me2l(
            io.BytesIO(me2l(("4500422737", "10", 0, "false"))), {"4500422737", ""}
        )
        assert list(by_po) == ["4500422737"]


class TestTheChain:
    def test_requested_with_no_po_is_waiting(self):
        by_order, _ = _run_pure(
            ops(), me5a_bytes=me5a(("1000409875", "10", "", "false"))
        )
        assert by_order[ORDER]["status"] == WAITING
        assert by_order[ORDER]["parts"][0]["text"] == "Suspension cylinder"

    def test_ordered_and_not_arrived_is_waiting(self):
        by_order, _ = _run_pure(
            ops(),
            me5a_bytes=me5a(("1000409875", "10", "4500422737", "false")),
            me2l_bytes=me2l(("4500422737", "10", 140, "false")),
        )
        assert by_order[ORDER]["parts"][0]["state"] == ORDERED

    def test_arrived_is_clear(self):
        by_order, _ = _run_pure(
            ops(),
            me5a_bytes=me5a(("1000409875", "10", "4500422737", "false")),
            me2l_bytes=me2l(("4500422737", "10", 0, "false")),
        )
        assert by_order[ORDER]["status"] == CLEAR

    def test_decision_c_any_open_line_of_the_po_keeps_it_waiting(self):
        by_order, _ = _run_pure(
            ops(),
            me5a_bytes=me5a(("1000409875", "10", "4500422737", "false")),
            me2l_bytes=me2l(
                ("4500422737", "10", 0, "false"), ("4500422737", "20", 3, "false")
            ),
        )
        assert by_order[ORDER]["status"] == WAITING

    def test_decision_d_a_request_me5a_does_not_show_is_check(self):
        by_order, _ = _run_pure(
            ops(), me5a_bytes=me5a(("1000000000", "10", "", "false"))
        )
        assert by_order[ORDER]["status"] == CHECK

    def test_a_cancelled_request_never_waits(self):
        by_order, _ = _run_pure(
            ops(), me5a_bytes=me5a(("1000409875", "10", "", "true"))
        )
        assert by_order[ORDER]["parts"][0]["state"] == CANCELLED
        assert by_order[ORDER]["status"] == CLEAR

    def test_me5k_gives_the_exact_po_item(self):
        by_order, _ = _run_pure(
            {},
            me5k_bytes=me5k((ORDER, "1000409875", "10", "4500422737", "20", "Seal")),
            me5a_bytes=me5a(("1000409875", "10", "4500422737", "false")),
            me2l_bytes=me2l(
                ("4500422737", "10", 9, "false"), ("4500422737", "20", 0, "false")
            ),
        )
        assert (
            by_order[ORDER]["status"] == CLEAR
        )  # line 20 arrived; line 10 is not ours

    def test_an_order_the_app_does_not_know_is_ignored(self):
        by_order, _ = _run_pure(
            ops(order="700000000000"),
            me5a_bytes=me5a(("1000409875", "10", "", "false")),
        )
        assert by_order == {}

    def test_an_item_written_00010_matches_10(self):
        by_order, _ = _run_pure(
            ops(item="00010"),
            me5a_bytes=me5a(("1000409875", "10", "4500422737", "false")),
            me2l_bytes=me2l(("4500422737", "00010", 0, "false")),
        )
        assert by_order[ORDER]["status"] == CLEAR


class TestTheShadowCounts:
    def test_counts_me5k_requests_not_on_iw49_and_lines_per_po(self):
        _, shadow = _run_pure(
            ops(),
            me5k_bytes=me5k(
                (OTHER_ORDER, "1000500000", "10", "4500000002", "10", "Pump")
            ),
            me5a_bytes=me5a(("1000409875", "10", "4500422737", "false")),
            me2l_bytes=me2l(
                ("4500422737", "10", 1, "false"),
                ("4500422737", "20", 1, "false"),
                ("4500000002", "10", 0, "false"),
            ),
        )
        assert shadow["me5k_prs_of_known_orders"] == 1
        assert shadow["me5k_prs_also_on_iw49"] == 0
        assert shadow["me5k_prs_not_on_iw49"] == ["1000500000"]
        assert shadow["pos_by_line_count"] == {"1": 1, "2": 1}
        assert shadow["waiting"] == 1 and shadow["clear"] == 1


class TestRemembering:
    def test_a_request_gone_from_me5k_is_still_remembered(self):
        day1 = parts_feed.remember(
            {},
            [
                {
                    "order": ORDER,
                    "pr": "1000409875",
                    "pr_item": "10",
                    "po": None,
                    "po_item": None,
                    "text": "x",
                }
            ],
            datetime(2026, 11, 1),
        )
        day2 = parts_feed.remember(day1, [], datetime(2026, 11, 28))
        assert list(day2.values())[0]["first_seen"] == "2026-11-01"

    def test_forgotten_after_400_days(self):
        day1 = parts_feed.remember(
            {},
            [
                {
                    "order": ORDER,
                    "pr": "1",
                    "pr_item": "10",
                    "po": None,
                    "po_item": None,
                    "text": None,
                }
            ],
            datetime(2025, 1, 1),
        )
        assert parts_feed.remember(day1, [], datetime(2026, 11, 28)) == {}


class TestWholePo:
    @pytest.mark.parametrize(
        "lines, expected",
        [
            ([], UNKNOWN),
            ([{"still_to_deliver": 0}], RECEIVED),
            ([{"still_to_deliver": 0}, {"still_to_deliver": 2}], ORDERED),
            ([{"still_to_deliver": 2, "deleted": True}], CANCELLED),
            (
                [{"still_to_deliver": 2, "deleted": True}, {"still_to_deliver": 0}],
                RECEIVED,
            ),
        ],
    )
    def test_the_whole_po(self, lines, expected):
        assert whole_po_state(lines) == expected


# ------------------------------------------------------ the nightly run


@pytest.fixture
def delivered(app, client, monkeypatch, tmp_path):
    monkeypatch.setitem(app.config, "UPLOAD_FOLDER", str(tmp_path))
    app.config["SAP_SYNC_ROBOT_KEY"] = KEY

    def deliver(payload, filename, sheet):
        resp = client.post(
            "/api/sap-sync/upload",
            headers={"X-Robot-Key": KEY},
            content_type="multipart/form-data",
            data={
                "file": (io.BytesIO(payload), filename),
                "sheet_name": sheet,
                "source_filename": filename,
                "source_folder": "sap_import",
                "sha256": hashlib.sha256(payload).hexdigest(),
            },
        )
        assert resp.status_code == 200, resp.get_json()

    return deliver


class TestTheNightlyRun:
    def test_writes_the_status_and_reports(self, app, delivered):
        delivered(
            me5k((ORDER, "1000409875", "10", "4500422737", "10", "Cylinder")),
            "ME5K ytd.XLSX",
            "OTHER",
        )
        delivered(
            me5a(("1000409875", "10", "4500422737", "false")), "ME5A ytd.XLSX", "ME5A"
        )
        delivered(me2l(("4500422737", "10", 140, "false")), "ME2L ytd.XLSX", "ME2L")

        report = parts_feed.run(ops(), KNOWN, now=datetime(2026, 11, 28))

        assert report["status"] == "ok" and report["shadow_only"] is True
        assert report["waiting"] == 1 and report["me5k_rows_today"] == 1
        assert all(report["files"].values())
        saved = parts_feed.load_status()
        assert saved["available"] and saved["by_order"][ORDER]["status"] == WAITING

    def test_a_dry_run_writes_nothing(self, app, delivered):
        delivered(me5a(("1000409875", "10", "", "false")), "ME5A ytd.XLSX", "ME5A")
        parts_feed.run(ops(), KNOWN, dry_run=True)
        assert parts_feed.load_status()["available"] is False

    def test_no_files_at_all_is_not_an_error(self, app, delivered):
        report = parts_feed.run(ops(), KNOWN)
        assert report["status"] == "ok"
        assert report["check"] == 1  # the IW49 request cannot be confirmed

    def test_a_broken_file_never_stops_the_sync(self, app, delivered):
        delivered(_xlsx(["Purchase Requisition"], [["1"]]), "ME5A ytd.XLSX", "ME5A")
        report = parts_feed.run(ops(), KNOWN)
        assert report["status"] == "failed" and "missing column" in report["error"]
