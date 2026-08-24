"""
Pricing a bundle — where the one context-dependent number gets decided.

Ali's rule: a fault costs less when it rides along with a PM (the team is on the
machine, it is stopped and open) than when the defect team makes its own trip.
Nothing can know which applies until the machine's work has been grouped onto a
day, so the price is set at BUNDLE time rather than when the pool is filled.

Before this, hours came from a median of SAP's PLANNED figure in IW49 — which
has hours for 5,539 of 5,548 FINISHED orders and ZERO of the open ones. That is
what put 143 hours on one Monday.
"""

import pytest

from app.services.work_plan_generator_service import _price_bundle


def member(job_type, activity=None, equipment_type='RS', description='',
           source='sap', hours=99.0):
    return {'source': source, 'job_type': job_type, 'sap_order_type': activity,
            'equipment_type': equipment_type, 'description': description,
            'estimated_hours': hours}


def bundle(*members):
    b = {'equipment_id': 1, 'berth': 'east', 'score': 50, 'members': list(members)}
    _price_bundle(b)
    return b['members']


class TestAFaultRidingWithAPM:
    def test_the_pm_and_its_faults_are_both_repriced(self):
        pm, com, dam = bundle(
            member('pm', 'PRM', description='1000HR SERVICE'),
            member('defect', 'COM'),
            member('corrective', 'DAM'),
        )
        assert pm['estimated_hours'] == 12.0     # reach stacker, crew of 2
        assert com['estimated_hours'] == 2.0     # riding, not 3.0
        assert dam['estimated_hours'] == 1.0     # riding, not 3.0

    def test_a_sap_inspection_rides_too(self):
        """Ali: "these INS are the ones that have order number, this should come
        normal" — real work the PM team performs, not an app inspection."""
        _, ins = bundle(member('pm', 'PRM', description='250HR'),
                        member('inspection', 'INS'))
        assert ins['estimated_hours'] == 3.0

    def test_the_whole_machine_adds_up_to_a_believable_day(self):
        members = bundle(
            member('pm', 'PRM', description='250HR SERVICE'),
            member('defect', 'COM'), member('defect', 'COM'),
            member('corrective', 'DAM'), member('inspection', 'INS'),
        )
        assert sum(m['estimated_hours'] for m in members) == 20.0


class TestAFaultOnItsOwnTrip:
    def test_it_pays_the_higher_price(self):
        com, = bundle(member('defect', 'COM'))
        assert com['estimated_hours'] == 3.0

    def test_a_damage_job_alone_is_three_hours_not_one(self):
        dam, = bundle(member('corrective', 'DAM'))
        assert dam['estimated_hours'] == 3.0

    def test_an_AC_PM_does_NOT_make_its_faults_cheaper(self):
        """The existing AC rule and the price agree: an AC specialist cannot fix
        a mechanical fault, so the defect team comes out for it anyway — which
        is exactly what "its own trip" means."""
        ac, com = bundle(member('pm', 'PRM', description='Inspection AC System'),
                         member('defect', 'COM'))
        assert ac['estimated_hours'] == 2.0
        assert com['estimated_hours'] == 3.0


class TestPMsAreNotAllTheSameSize:
    @pytest.mark.parametrize('equipment_type,hours', [
        ('RS', 12.0), ('ECH', 8.0), ('TT', 4.5), ('FL', 4.0), ('TR', 3.0),
    ])
    def test_the_family_decides(self, equipment_type, hours):
        pm, = bundle(member('pm', 'PRM', equipment_type=equipment_type,
                            description='250HR SERVICE'))
        assert pm['estimated_hours'] == hours

    def test_an_AC_pm_is_two_hours_on_the_biggest_machine(self):
        pm, = bundle(member('pm', 'PRM', equipment_type='RS',
                            description='AC SYSTEM'))
        assert pm['estimated_hours'] == 2.0


class TestCarryOversKeepTheirOwnHours:
    """A carry-over's hours are the REMAINING work on a job somebody already
    started. That is a fact about one job, not a price from a table — repricing
    it would re-book the hours already spent."""

    def test_it_is_left_exactly_as_it_was(self):
        pm, carried = bundle(
            member('pm', 'PRM', description='250HR'),
            member('defect', 'COM', source='carry_over', hours=1.5),
        )
        assert carried['estimated_hours'] == 1.5
        assert pm['estimated_hours'] == 12.0


class TestSAPsOwnFigureIsNeverUsed:
    def test_whatever_arrived_is_overwritten(self):
        """The stored 18.0h for a trailer PM was SAP's planned figure. The
        machine is really held 2.0h, and Ali set 3.0."""
        pm, = bundle(member('pm', 'PRM', equipment_type='TR',
                            description='250HR SERVICE', hours=18.0))
        assert pm['estimated_hours'] == 3.0
