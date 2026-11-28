"""The parts rule's decisions (Ali, 2026-11-27), on rows shaped like the real
ME5K / ME5A / ME2L exports seen on production that day. Pure — no files, no
database. Not connected to the generator yet (tasks/bites-reader-plan.md).
"""

import pytest

from app.services.parts_status import (
    CANCELLED,
    CHECK,
    CLEAR,
    HOLD_MACHINE,
    HOLD_ORDER,
    ORDERED,
    RECEIVED,
    REQUESTED,
    UNKNOWN,
    WAITING,
    hold,
    is_deleted,
    mail_disagrees,
    order_status,
    part_key,
    part_state,
    po_key,
)


def link(pr="1000409875", pr_item="10", po="", po_item="0", in_me5k_today=True):
    # Real ME5K row: order 700001811715, 'Suspension cylinder', no PO yet.
    return {
        "pr": pr,
        "pr_item": pr_item,
        "po": po,
        "po_item": po_item,
        "in_me5k_today": in_me5k_today,
    }


class TestOnePart:
    def test_requested_with_no_po_yet(self):
        assert part_state(link(), set(), {}) == REQUESTED

    def test_ordered_while_something_is_still_to_deliver(self):
        lines = {
            po_key("4500422737", "10"): {"still_to_deliver": 140, "deleted": False}
        }
        assert part_state(link(po="4500422737", po_item="10"), set(), lines) == ORDERED

    def test_received_when_still_to_deliver_is_zero(self):
        lines = {po_key("4500422737", "10"): {"still_to_deliver": 0, "deleted": False}}
        assert part_state(link(po="4500422737", po_item="10"), set(), lines) == RECEIVED

    def test_a_cancelled_request_never_waits(self):
        """A third of ME5A's requests are deleted (7,826 of 23,385)."""
        cancelled = {part_key("1000409875", "10")}
        assert part_state(link(), cancelled, {}) == CANCELLED

    def test_a_cancelled_po_line_never_waits(self):
        lines = {po_key("4500422737", "10"): {"still_to_deliver": 140, "deleted": True}}
        assert (
            part_state(link(po="4500422737", po_item="10"), set(), lines) == CANCELLED
        )

    def test_a_po_missing_from_me2l_is_unknown_not_waiting(self):
        assert part_state(link(po="4500999999", po_item="10"), set(), {}) == UNKNOWN

    def test_a_request_that_vanished_with_no_po_is_unknown(self):
        assert part_state(link(in_me5k_today=False), set(), {}) == UNKNOWN

    def test_item_numbers_match_with_or_without_leading_zeros(self):
        lines = {
            po_key("4500422737", "00010"): {"still_to_deliver": 0, "deleted": False}
        }
        assert part_state(link(po="4500422737", po_item=10.0), set(), lines) == RECEIVED

    def test_hidden_spaces_in_numbers_are_ignored(self):
        cancelled = {part_key("1000409875\xa0", "10")}
        assert part_state(link(pr=" 1000409875"), cancelled, {}) == CANCELLED


class TestOneOrder:
    @pytest.mark.parametrize(
        "states, expected",
        [
            ([RECEIVED, REQUESTED], WAITING),
            ([RECEIVED, ORDERED, UNKNOWN], WAITING),
            ([RECEIVED, UNKNOWN], CHECK),
            ([RECEIVED, CANCELLED], CLEAR),
            ([CANCELLED], CLEAR),
        ],
    )
    def test_the_order_follows_its_parts(self, states, expected):
        assert order_status(states) == expected


class TestWhatIsHeld:
    def test_stopped_and_waiting_holds_the_whole_machine(self):
        assert hold(WAITING, machine_available=False) == HOLD_MACHINE

    def test_working_and_waiting_holds_only_the_order(self):
        assert hold(WAITING, machine_available=True) == HOLD_ORDER

    def test_no_fresh_mail_holds_only_the_order(self):
        assert hold(WAITING, machine_available=None) == HOLD_ORDER

    @pytest.mark.parametrize("status", [CLEAR, CHECK])
    def test_nothing_waiting_holds_nothing(self, status):
        assert hold(status, machine_available=False) is None


class TestTheMailAndSap:
    def test_mail_says_waiting_but_sap_says_received_is_flagged(self):
        assert mail_disagrees("WAITING_PARTS", CLEAR) is True

    def test_agreement_is_not_flagged(self):
        assert mail_disagrees("WAITING_PARTS", WAITING) is False
        assert mail_disagrees("OTHER", CLEAR) is False


class TestTheDeletionFlag:
    @pytest.mark.parametrize(
        "value, expected",
        [
            ("true", True),
            ("X", True),
            ("false", False),
            ("", False),
            (None, False),
        ],
    )
    def test_both_exports_spellings(self, value, expected):
        assert is_deleted(value) is expected
