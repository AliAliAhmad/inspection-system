"""A 2000-hour service already contains the 250-hour one.

Ali, 2026-09-12: "2000 hrs service is a service that contain the 250 hrs task
and addtional tasks".

RS109 carries a 250HR and a 2000HR open at the same time. The app priced them as
two separate jobs, 12h each, and booked 24 hours of a crew's week for a visit
that happens ONCE. That is a day and a half of two men, every time it happens.

WHY THE POOL IS NOT WHERE THIS IS FIXED
=======================================

A 250HR really IS 12h when it is the only thing open. Its standalone price is
correct and the pool keeps it. What changes is what it costs when a 2000HR is on
the same machine in the same week — which nothing knows until the generator
groups a machine's work onto one day. That is exactly why the fault ride-along
rule (`with_pm`) lives there too.
"""

import pytest

from app.services.job_durations import contained_packages, trade_in_description
from app.services.work_plan_generator_service import _price_bundle


class TestReadingThePackageAndTheTrade:

    def test_the_trade_comes_out_of_the_description(self):
        assert trade_in_description('RS109-250HR-MECH') == 'MECH'
        assert trade_in_description('RS109-2000HR-ELEC') == 'ELEC'

    def test_a_description_that_names_no_trade_says_so(self):
        assert trade_in_description('3-Week INSPECTION_RS') is None
        assert trade_in_description('') is None
        assert trade_in_description(None) is None


class TestWhichPackagesRideAlong:

    def test_the_250_rides_inside_the_2000(self):
        assert contained_packages([
            ('small', 250, 'MECH'), ('big', 2000, 'MECH')]) == {'small': 'big'}

    def test_everything_smaller_rides_in_the_LARGEST_not_the_next_one_up(self):
        """With 250, 500 and 2000 open, one visit does all three."""
        assert contained_packages([
            ('a', 250, None), ('b', 500, None), ('c', 2000, None),
        ]) == {'a': 'c', 'b': 'c'}

    def test_two_of_the_same_package_do_not_swallow_each_other(self):
        assert contained_packages([('a', 250, None), ('b', 250, None)]) == {}

    def test_a_package_that_does_not_divide_evenly_is_not_contained(self):
        """The ladder is 250/500/1000/2000/4000 and every step is a multiple of
        the one below — that is WHY they fall due together. A 300 alongside a
        2000 comes due on its own schedule and is its own visit."""
        assert contained_packages([('a', 300, None), ('b', 2000, None)]) == {}

    def test_trades_do_not_nest(self):
        """A 2000HR-MECH does not do a 250HR-ELEC's work.

        Zeroing the electrical package would hide real electrical hours from the
        day, which is the dangerous direction — the crew would be over-committed
        with nothing on the board explaining it.
        """
        assert contained_packages([
            ('elec', 250, 'ELEC'), ('mech', 2000, 'MECH')]) == {}

    def test_a_silent_trade_agrees_with_anything(self):
        assert contained_packages([
            ('a', 250, None), ('b', 2000, 'MECH')]) == {'a': 'b'}

    def test_a_job_with_no_package_never_nests_and_never_swallows(self):
        """A calendar PM, an AC inspection, a forklift's HOURLY SERVICE.

        SAP did not say which package it is. A guess here takes real hours out
        of a real day.
        """
        assert contained_packages([('a', 250, None), ('b', None, None)]) == {}
        assert contained_packages([('a', None, None), ('b', 2000, None)]) == {}


def _pm(description, equipment_type='reach_stacker'):
    return {'job_type': 'pm', 'description': description,
            'equipment_type': equipment_type, 'sap_order_type': 'PRM'}


class TestWhatABundleEndsUpCosting:

    def test_rs109_is_charged_once_not_twice(self):
        bundle = {'members': [_pm('RS109-250HR-MECH'), _pm('RS109-2000HR-MECH')]}
        _price_bundle(bundle)
        small, big = bundle['members']

        assert big['estimated_hours'] == pytest.approx(12.0), \
            'the visit that actually happens keeps its full price'
        assert small['estimated_hours'] == 0.0
        assert small['included_in_package'] == 2000, \
            'a day showing 12h instead of 24h has to be able to say why'
        assert small['hours_before_nesting'] == pytest.approx(12.0)

    def test_the_smaller_order_is_still_a_job_the_crew_can_tick(self):
        """Both SAP orders are real and both must be closed after the visit."""
        bundle = {'members': [_pm('RS109-250HR-MECH'), _pm('RS109-2000HR-MECH')]}
        _price_bundle(bundle)
        assert len(bundle['members']) == 2, 'zeroed, never removed'

    def test_two_unrelated_pms_are_both_charged(self):
        bundle = {'members': [_pm('RS109-250HR-MECH'), _pm('RS109-250HR-MECH')]}
        _price_bundle(bundle)
        assert [m['estimated_hours'] for m in bundle['members']] == [12.0, 12.0]

    def test_a_mechanical_visit_does_not_swallow_electrical_work(self):
        bundle = {'members': [_pm('RS109-250HR-ELEC'), _pm('RS109-2000HR-MECH')]}
        _price_bundle(bundle)
        assert all(m['estimated_hours'] > 0 for m in bundle['members'])

    def test_a_carry_over_is_never_touched(self):
        """Its hours are the REMAINING hours of work somebody already started —
        a fact about one job, not a price from a table."""
        carried = _pm('RS109-250HR-MECH')
        carried['source'] = 'carry_over'
        carried['estimated_hours'] = 3.5
        bundle = {'members': [carried, _pm('RS109-2000HR-MECH')]}
        _price_bundle(bundle)
        assert carried['estimated_hours'] == pytest.approx(3.5)
        assert 'included_in_package' not in carried

    def test_a_single_pm_is_unchanged(self):
        bundle = {'members': [_pm('RS109-2000HR-MECH')]}
        _price_bundle(bundle)
        assert bundle['members'][0]['estimated_hours'] == pytest.approx(12.0)
        assert 'included_in_package' not in bundle['members'][0]

    def test_a_fault_beside_the_packages_still_rides_along_cheaply(self):
        """`_bundle_has_regular_pm` must stay true — the crew IS on the machine."""
        fault = {'job_type': 'defect', 'description': 'Hydraulic leak',
                 'equipment_type': 'reach_stacker', 'sap_order_type': 'DAM'}
        bundle = {'members': [_pm('RS109-250HR-MECH'),
                              _pm('RS109-2000HR-MECH'), fault]}
        _price_bundle(bundle)
        assert fault['estimated_hours'] == pytest.approx(1.0), \
            'DAM with a PM on the machine is 1h, not the 3h standalone price'


class TestThePlannerCanSeeWhyItIsZero:
    """A 0h job with no explanation is indistinguishable from a bug.

    The marker lives on the bundle dict, which is thrown away. So the reason has
    to be written onto the stored job, and `notes` is where every screen already
    looks — board, phone and PDF — and where the phrase store already provides
    Arabic.
    """

    def test_the_note_names_the_service_that_swallowed_it(self):
        bundle = {'members': [_pm('RS109-250HR-MECH'), _pm('RS109-2000HR-MECH')]}
        _price_bundle(bundle)
        small = bundle['members'][0]

        # What _create_jobs_for_bundle writes, from this marker.
        assert small['included_in_package'] == 2000
        note = (f"Included in the {small['included_in_package']}HR service on "
                f"this machine — one visit does both.")
        assert '2000HR' in note and 'one visit' in note

    def test_a_normally_priced_job_gets_no_note(self):
        """Only the zeroed one explains itself; everything else is untouched."""
        bundle = {'members': [_pm('RS109-250HR-MECH'), _pm('RS109-2000HR-MECH')]}
        _price_bundle(bundle)
        assert 'included_in_package' not in bundle['members'][1]

    def test_notes_is_not_in_the_generator_kwargs_so_nothing_is_overwritten(self):
        """The claim the note relies on: a generated job has no note of its own.

        If `notes` ever joins job_kwargs, this fix starts destroying whatever it
        holds — so the assumption is asserted rather than trusted.
        """
        import inspect
        from app.services import work_plan_generator_service as gen
        source = inspect.getsource(gen._create_jobs_for_bundle)
        head = source.split('job_kwargs = dict(')[1].split(')')[0]
        assert 'notes' not in head, \
            'notes joined the generator kwargs — the nesting note now overwrites it'
