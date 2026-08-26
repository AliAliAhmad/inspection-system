"""Which kit does this job get?

`find_matching_kit` is the ONLY route a material kit reaches a job
(`app/api/work_plans.py:1041`). Every rule it does not have is a kit that
exists in the database and never fires.
"""

import pytest

from app.extensions import db
from app.models import Equipment
from app.models.material import Material
from app.models.material_kit import MaterialKit, MaterialKitItem
from app.models.maintenance_cycle import MaintenanceCycle
from app.api.materials import find_matching_kit

_seq = iter(range(1, 9999))


def _cycle(db_session, hours):
    row = MaintenanceCycle.query.filter_by(cycle_type='running_hours',
                                           hours_value=hours).first()
    if row is None:
        row = MaintenanceCycle(name=f'{hours}h', cycle_type='running_hours',
                               hours_value=hours, display_label=f'{hours} Hours',
                               is_active=True)
        db_session.session.add(row)
        db_session.session.commit()
    return row


def _machine(db_session, name, eq_type, model=None):
    e = Equipment(name=name, serial_number=f'SN{next(_seq)}',
                  equipment_type=eq_type, model_number=model)
    db_session.session.add(e)
    db_session.session.commit()
    return e


def _kit(db_session, name, eq_type, model=None, cycle=None):
    k = MaterialKit(name=name, equipment_type=eq_type, equipment_model=model,
                    cycle_id=cycle.id if cycle else None, is_active=True)
    db_session.session.add(k)
    db_session.session.flush()
    m = Material(code=f'M{next(_seq)}', name='Engine oil 15w40',
                 category='lubricant', unit='LTR')
    db_session.session.add(m)
    db_session.session.flush()
    db_session.session.add(MaterialKitItem(kit_id=k.id, material_id=m.id, quantity=45))
    db_session.session.commit()
    return k


class TestTheRulesThatAlreadyWorked:
    def test_exact_type_model_and_interval_wins(self, app, db_session):
        c = _cycle(db_session, 250)
        e = _machine(db_session, 'RS108', 'RS', 'DRG450-65S5')
        exact = _kit(db_session, 'exact', 'RS', 'DRG450-65S5', c)
        _kit(db_session, 'looser', 'RS', None, c)

        assert find_matching_kit(e.id, c.id).id == exact.id

    def test_type_and_interval_when_no_model_kit_exists(self, app, db_session):
        c = _cycle(db_session, 500)
        e = _machine(db_session, 'RS109', 'RS', 'DRF-450-65S5L')
        k = _kit(db_session, 'by type', 'RS', None, c)

        assert find_matching_kit(e.id, c.id).id == k.id


class TestTheRuleThatWasMissing:
    """A forklift kit is type + model + NO interval, because SAP gives
    forklifts no interval at all — all 148 orders read `FL327-HOURLY SERVICE`.

    The three original rules could not return it: rules 1 and 2 both require a
    cycle, and rule 3 demands the model be EMPTY. So every per-model forklift
    kit existed and was invisible.

    Per-model matters here: a DOOSAN D30NXP takes 10 LTR of engine oil and a
    TCM FD 200-2 takes 20. One type-only forklift kit would be wrong for
    somebody.
    """

    def test_a_forklift_finds_its_own_model_kit(self, app, db_session):
        e = _machine(db_session, 'FL327', 'FL', 'DOOSAN D30NXP')
        k = _kit(db_session, 'doosan hourly', 'FL', 'DOOSAN D30NXP', None)

        found = find_matching_kit(e.id, None)
        assert found is not None, (
            'a forklift kit is type + model + no interval; without a rule for '
            'that shape every forklift kit is dead in the database')
        assert found.id == k.id

    def test_the_other_forklift_model_does_not_take_this_one(self, app, db_session):
        """10 litres against 20 — handing one model's kit to the other is a
        wrong store request every single service."""
        doosan = _machine(db_session, 'FL328', 'FL', 'DOOSAN D30NXP')
        tcm = _machine(db_session, 'FL305', 'FL', 'TCM FD 200-2')
        kd = _kit(db_session, 'doosan', 'FL', 'DOOSAN D30NXP', None)
        kt = _kit(db_session, 'tcm', 'FL', 'TCM FD 200-2', None)

        assert find_matching_kit(doosan.id, None).id == kd.id
        assert find_matching_kit(tcm.id, None).id == kt.id

    def test_a_model_kit_beats_a_bare_type_kit(self, app, db_session):
        e = _machine(db_session, 'FL329', 'FL', 'HELI CPCD30')
        _kit(db_session, 'any forklift', 'FL', None, None)
        mine = _kit(db_session, 'heli', 'FL', 'HELI CPCD30', None)

        assert find_matching_kit(e.id, None).id == mine.id

    def test_a_machine_with_no_model_still_finds_the_type_kit(self, app, db_session):
        """`model_number` is nullable and plenty of rows have never been filled
        in. Those must still get the general kit rather than nothing."""
        e = _machine(db_session, 'FL330', 'FL', None)
        k = _kit(db_session, 'any forklift', 'FL', None, None)

        assert find_matching_kit(e.id, None).id == k.id

    def test_an_interval_kit_is_not_handed_to_a_job_with_no_interval(
            self, app, db_session):
        """A 4000-hour kit carries hydraulic oil and brake oil. Giving it to a
        job whose service package is unknown would order 600 litres of hydraulic
        oil for a routine check."""
        c = _cycle(db_session, 4000)
        e = _machine(db_session, 'RS110', 'RS', 'DRG450-65S5')
        _kit(db_session, '4000h', 'RS', 'DRG450-65S5', c)

        assert find_matching_kit(e.id, None) is None


class TestNothingIsInvented:
    def test_an_inactive_kit_is_never_returned(self, app, db_session):
        e = _machine(db_session, 'FL331', 'FL', 'DOOSAN D30S-5')
        k = _kit(db_session, 'retired', 'FL', 'DOOSAN D30S-5', None)
        k.is_active = False
        db_session.session.commit()

        assert find_matching_kit(e.id, None) is None

    def test_a_machine_that_does_not_exist_returns_nothing(self, app, db_session):
        assert find_matching_kit(999999, None) is None

    def test_another_family_kit_is_never_borrowed(self, app, db_session):
        e = _machine(db_session, 'FL332', 'FL', 'DOOSAN D30NXP')
        _kit(db_session, 'reach stacker', 'RS', 'DOOSAN D30NXP', None)

        assert find_matching_kit(e.id, None) is None
