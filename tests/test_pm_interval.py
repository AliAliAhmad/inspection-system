"""Which service is this — 250 hours, 500, 1000?

SAP writes the same question five different ways, and a parser that only knows
one of them silently loses most of the fleet. Measured on Ali's real
`IW39 YTD.XLSX`: looking for the letters `HR` found 1 tractor 250-hour service
where there are 478.
"""

import pytest

from app.services.sap_order_parser import pm_interval_hours


class TestTheFiveWaysSapWritesIt:
    @pytest.mark.parametrize('description, expected', [
        # The plain form, and the one a naive parser finds.
        ('RS115-250HR-MECH.HOURLY SERVICE', 250),
        ('TT046-1000HR-MECH. HOURLY SERVICE', 1000),
        ('ECH09-4000HR-MECH. HOURLY SERVICE', 4000),

        # No R. 30 tractor orders are written this way.
        ('TT028-250H-HOURLY SERVICE', 250),
        ('TT028-250H- HOURLY SERVICE', 250),
        ('TT028-250H HOURLY SERVICE', 250),

        # A space before HR. Four more.
        ('TT046-500 HR-MECH. HOURLY SERVICE', 500),

        # A trailing s. RS119 alone is written this way — 12 orders — and an
        # `HR?\\b` that demands a boundary straight after `HR` refuses all of
        # them, because `s` is a word character.
        ('RS119-250Hrs-HOURLY SERVICE', 250),
        ('RS119-500hrs-HOURLY SERVICE', 500),
        ('RS119-1000Hrs-HOURLY SERVICE', 1000),
        ('RS119-2000Hrs-HOURLY SERVICE', 2000),
        ('PM-250 Hrs', 250),
        ('RS115-250 HOURS SERVICE', 250),

        # 25/5H — 448 tractor and 91 ECH orders, more than half of all
        # tractor PMs. Ali confirmed 2026-08-26 that this IS the 250-hour
        # service; the data had already proved it, with 448 `25/5H` orders and
        # 30 `250H` orders sharing six materials at six identical quantities.
        ('TT028-25/5H-MECH. HOURLY SERVICE', 250),
        ('ECH09-25/5H.HOURLY SERVICE', 250),
        (' TT003-25/5H-MECH. HOURLY SERVICE', 250),

        # Leading/trailing rubbish must not matter.
        ('  RS116-250HR-MECH.HOURLY SERVICE  ', 250),
        ('rs116-250hr-mech.hourly service', 250),
    ])
    def test_it_reads_the_interval(self, description, expected):
        assert pm_interval_hours(description) == expected


class TestWhatItMustRefuse:
    @pytest.mark.parametrize('description', [
        # Forklifts carry NO interval. 148 orders, all of them this shape.
        # Inventing one here would put a 250-hour kit on a machine SAP has
        # never said anything about.
        'FL327-HOURLY SERVICE',
        # Calendar work is not hour-based at all.
        '3-Week INSPECTION_RS',
        'Inspection AC System',
        'BLD Fire Extinguisher System Check - CB',
        # RTG is out of scope and has no hour number either.
        'RTG05-ENGINE HOURLY MECH. SERVICE_PB.',
        # Not a service at all.
        'Install Terberg Tracker',
        'Hydraulic leakage',
        '',
        None,
    ])
    def test_it_says_nothing_rather_than_guessing(self, description):
        assert pm_interval_hours(description) is None

    def test_the_machine_number_is_never_mistaken_for_an_interval(self):
        """`RS115` and `TT028` carry digits. A greedy number grab reads the
        machine as the service."""
        assert pm_interval_hours('RS115-250HR-MECH.HOURLY SERVICE') == 250
        assert pm_interval_hours('TT1000-500HR-MECH. HOURLY SERVICE') == 500

    def test_an_interval_nobody_services_at_is_refused(self):
        """Ali's fleet runs 250/500/1000/2000/4000. A stray `750HR` is more
        likely a typo than a real plan, and a kit keyed to it would match
        nothing anyway — `MaintenanceCycle` has no 750 row."""
        assert pm_interval_hours('RS115-750HR-MECH.HOURLY SERVICE') is None
        assert pm_interval_hours('RS115-25HR-MECH.HOURLY SERVICE') is None
