"""
How long a job takes — Ali's table, 2026-08-24.

The numbers are asserted one by one, because the module they live in IS a table,
and a table with no test is a table that drifts. Each figure was either measured
against 8,904 finished MES orders or set by Ali against a stated crew; the
workings are in docs/job-durations.md.

The rule worth testing hardest is the one that is not a lookup: a fault costs
LESS when it rides along with a PM than when the defect team makes its own trip
for it.
"""

import pytest

from app.services.job_durations import (
    MIN_CREW,
    crew_for,
    family_from_plant_code,
    fault_hours,
    hours_for,
    is_ac_service,
    pm_hours,
)


class TestTheRegularPMTable:
    @pytest.mark.parametrize('family,crew,hours', [
        ('truck', 2, 4.5),
        ('reach_stacker', 2, 12.0),
        ('ech', 2, 8.0),
        ('forklift', 2, 4.0),
        ('trailer', 2, 3.0),
    ])
    def test_each_family(self, family, crew, hours):
        assert pm_hours(family) == (crew, hours)

    def test_an_unknown_family_gets_the_SMALLEST_pm_figure(self):
        """Deliberately not a middling guess.

        An unknown machine priced too low shows up as a day running over, which
        the carry-to-tomorrow rule already handles. Priced too high it silently
        refuses real work and nobody ever learns why.
        """
        assert pm_hours('quay_crane') == (2, 3.0)
        assert pm_hours(None)[1] == 3.0


class TestMoreMenIsNotSimplyFasterWork:
    """Ali gave two points per machine, not a formula. Four men on a reach
    stacker save 4 hours of machine time and cost 8 extra man-hours — the app
    should carry the trade rather than assume the work divides."""

    def test_four_men_release_a_reach_stacker_sooner(self):
        assert pm_hours('reach_stacker', crew=4) == (4, 8.0)

    def test_three_men_on_an_ech(self):
        assert pm_hours('ech', crew=3) == (3, 7.0)

    def test_it_is_not_a_division(self):
        pair_crew, pair_hours = pm_hours('reach_stacker')
        big_crew, big_hours = pm_hours('reach_stacker', crew=4)
        assert pair_crew * pair_hours == 24.0
        assert big_crew * big_hours == 32.0       # 8 MORE man-hours, not fewer

    def test_a_crew_size_nobody_measured_falls_back_rather_than_interpolating(self):
        """A family with no curve keeps its pair figure whatever the crew.

        (RS crew=3 used to live here as the unmeasured case — until Ali
        measured it: 3 men -> 8h. See TestUrgentCrewPolicy.)"""
        assert pm_hours('truck', crew=4) == (2, 4.5)
        assert pm_hours('trailer', crew=3) == (2, 3.0)


class TestACIsADifferentJob:
    """33 of the 78 open PRM orders are AC. Pricing one at its family's full
    service figure would book 12 hours for a 2-hour visit on four of every ten
    open PMs. Measured across 204 finished AC PMs the answer is 2.0h wherever it
    lands — TT 2.0, RS 2.0, ECH 2.0 — because the AC team does the AC only."""

    @pytest.mark.parametrize('family', ['reach_stacker', 'ech', 'truck', 'forklift'])
    def test_two_hours_on_every_family(self, family):
        assert pm_hours(family, description='Inspection AC System') == (2, 2.0)

    def test_the_full_service_on_the_same_machine_is_not(self):
        assert pm_hours('reach_stacker', description='1000HR SERVICE')[1] == 12.0

    @pytest.mark.parametrize('description', [
        'Inspection AC System', 'AC SYSTEM', 'AC filter change',
        'CHECK THE AC', 'repair AC unit',
    ])
    def test_the_descriptions_that_mean_AC(self, description):
        assert is_ac_service(description)

    @pytest.mark.parametrize('description', [
        'REPLACE BACK GLASS', 'HYDRAULIC LEAK', '250HR SERVICE', '', None,
    ])
    def test_and_the_ones_that_do_not(self, description):
        """'BACK' contains AC. Matching as a substring would price a windscreen
        as an air-conditioning service."""
        assert not is_ac_service(description)


class TestAFaultCostsLessWhenThePMTeamIsAlreadyThere:
    """Ali's rule, and the only figure in the file that depends on context: the
    team is on the machine, it is already stopped and already open."""

    @pytest.mark.parametrize('activity,riding,alone', [
        ('COM', 2.0, 3.0),
        ('DAM', 1.0, 3.0),
        ('INS', 3.0, 2.0),
        ('ACD', 2.5, 2.0),
    ])
    def test_each_letter_has_both_prices(self, activity, riding, alone):
        assert fault_hours(activity, with_pm=True) == riding
        assert fault_hours(activity, with_pm=False) == alone

    def test_a_damage_job_is_three_times_dearer_on_its_own_trip(self):
        assert fault_hours('DAM', False) == 3 * fault_hours('DAM', True)

    def test_lower_case_and_padding_still_match(self):
        assert fault_hours(' com ', with_pm=True) == 2.0

    def test_an_unknown_letter_falls_back_and_keeps_the_rule(self):
        assert fault_hours('ZZZ', with_pm=True) == 2.0
        assert fault_hours('ZZZ', with_pm=False) == 3.0
        assert fault_hours(None, with_pm=False) == 3.0


class TestNobodyWorksAlone:
    def test_the_minimum_is_two(self):
        assert MIN_CREW == 2
        assert crew_for('COM') == 2

    @pytest.mark.parametrize('family', ['truck', 'trailer', 'forklift', 'nonsense'])
    def test_no_pm_family_ever_asks_for_fewer(self, family):
        assert pm_hours(family)[0] >= MIN_CREW
        assert crew_for('PRM', family, is_pm=True) >= MIN_CREW


class TestReadingTheMachineOutOfAPlantCode:
    @pytest.mark.parametrize('code,family', [
        ('RS110', 'reach_stacker'),
        ('TT024', 'truck'),
        ('ECH08', 'ech'),
        ('FL318', 'forklift'),
        ('BFL02', 'forklift'),
        ('TR078', 'trailer'),
    ])
    def test_known_codes(self, code, family):
        assert family_from_plant_code(code) == family

    def test_the_longest_prefix_wins(self):
        """ECH starts with E and BFL ends in FL. Shortest-first matching would
        read ECH08 as something else entirely."""
        assert family_from_plant_code('ECH02') == 'ech'
        assert family_from_plant_code('BFL01') == 'forklift'

    def test_a_machine_outside_the_section_is_not_guessed_at(self):
        assert family_from_plant_code('QC007') is None
        assert family_from_plant_code('') is None
        assert family_from_plant_code(None) is None

    def test_an_unknown_code_still_gets_a_price(self):
        assert hours_for('pm', family=family_from_plant_code('QC007')) == 3.0


class TestTheSingleEntryPoint:
    def test_a_pm_reads_the_family_table(self):
        assert hours_for('pm', family='reach_stacker') == 12.0

    def test_a_fault_reads_the_letter_table(self):
        assert hours_for('defect', activity_type='COM', family='reach_stacker',
                         with_pm=True) == 2.0

    def test_the_family_is_ignored_for_a_fault(self):
        """Measured: machine family is worth 1% on a fault and 4x on a PM."""
        assert (hours_for('defect', activity_type='COM', family='trailer', with_pm=False)
                == hours_for('defect', activity_type='COM', family='reach_stacker',
                             with_pm=False))


class TestUrgentCrewPolicy:
    """Ali, 2026-08-24: "if TT or FL, TR is urgent always keep 2,
    RS AND ECHs put maximum up to 4. If 3 will be 8 hrs."

    More men never help a small machine; they only rescue a big one. And the
    points are not a line: on a reach stacker the third man buys 4 hours and
    the fourth buys nothing — he is insurance for an urgent machine, not speed.
    """

    @pytest.mark.parametrize('family,max_crew', [
        ('reach_stacker', 4), ('ech', 4),
        ('truck', 2), ('forklift', 2), ('trailer', 2), ('unknown', 2),
    ])
    def test_who_may_get_extra_men(self, family, max_crew):
        from app.services.job_durations import urgent_max_crew
        assert urgent_max_crew(family) == max_crew

    def test_three_men_on_a_reach_stacker_is_eight_hours(self):
        assert pm_hours('reach_stacker', crew=3) == (3, 8.0)

    def test_the_fourth_man_buys_no_time(self):
        assert (pm_hours('reach_stacker', crew=4)[1]
                == pm_hours('reach_stacker', crew=3)[1])

    def test_ech_with_four_uses_the_three_man_figure(self):
        """No 4-man ECH measurement exists; the largest measured point at or
        below the crew is used — flagged in CLAUDE.md until Ali gives one."""
        assert pm_hours('ech', crew=4) == (4, 7.0)

    def test_a_day_is_eight_hours_per_man(self):
        from app.services.job_durations import MAN_HOURS_PER_DAY
        assert MAN_HOURS_PER_DAY == 8
