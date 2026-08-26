"""Building the standard kits.

Ali's bar: "0 bug and wrong tolerance". So the seeder reports before it writes,
groups by what the APP says a machine is rather than by the source data's text,
and refuses rather than guesses when the two disagree.
"""

import pytest

from app.extensions import db
from app.models import Equipment
from app.models.maintenance_cycle import MaintenanceCycle
from app.models.material import Material
from app.models.material_kit import MaterialKit, MaterialKitItem
from app.services.material_kit_seed import apply, build, load_spec, plan

_seq = iter(range(1, 9999))

OIL = 'CO01-C014-003'
FILTER = 'ST04-M067-005'


def _spec(services, materials=None):
    return {'rules': {'threshold_pct': 75},
            'materials': materials or {
                OIL: {'name': 'Engine oil 15w40', 'unit': 'LTR', 'category': 'lubricant'},
                FILTER: {'name': 'Engine oil filter', 'unit': 'EA', 'category': 'filter'}},
            'services': services}


def _svc(machine='RS113', hours=250, **materials):
    return {'machine': machine, 'interval_hours': hours, 'materials': materials}


def _machine(db_session, name, eq_type='RS', model='DRG450-65S5'):
    e = Equipment(name=name, serial_number=f'SN{next(_seq)}',
                  equipment_type=eq_type, model_number=model)
    db_session.session.add(e)
    db_session.session.commit()
    return e


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


class TestTheShippedFileIsSane:
    def test_it_loads_and_every_service_is_usable(self):
        spec = load_spec()
        assert spec['services'], 'the shipped file is empty'
        for s in spec['services']:
            assert s['machine'], 'a service with no machine cannot be grouped'
            assert s['materials'], 'a service with no materials is not a service'
            assert all(q > 0 for q in s['materials'].values())

    def test_every_material_used_has_a_name_and_a_unit(self):
        spec = load_spec()
        used = {c for s in spec['services'] for c in s['materials']}
        for code in used:
            info = spec['materials'].get(code)
            assert info, f'{code} is used but not described'
            assert info['name'] and info['unit'], f'{code} has no name or unit'

    def test_the_dead_material_code_is_nowhere_in_it(self):
        """`CO01-C022-004 Equipment degreaser` sits in 6 of Ali's 8 saved kits
        and appears ZERO times in 283,345 movement lines."""
        spec = load_spec()
        used = {c for s in spec['services'] for c in s['materials']}
        assert 'CO01-C022-004' not in used


class TestTheAppDecidesTheGrouping:
    """Ali, 2026-08-26, on the ten Ottawa tractors: "not one model but share
    same engine, so keep each kit different." So the grouping comes from
    `equipment.model_number` — never from the source data's own model text."""

    def test_two_models_get_two_kits_even_from_one_pool_of_services(
            self, app, db_session):
        _cycle(db_session, 250)
        _machine(db_session, 'TT029', eq_type='TT', model='Ottawa 50')
        _machine(db_session, 'TT030', eq_type='TT', model='Ottawa 51')
        services = ([_svc('TT029', 250, **{OIL: 25}) for _ in range(6)]
                    + [_svc('TT030', 250, **{OIL: 30}) for _ in range(6)])

        kits, held, problems = build(_spec(services))

        assert len(kits) == 2
        by_model = {k['equipment_model']: k for k in kits}
        assert by_model['Ottawa 50']['items'][0]['quantity'] == 25
        assert by_model['Ottawa 51']['items'][0]['quantity'] == 30

    def test_one_model_across_many_machines_is_one_kit(self, app, db_session):
        """The `YT22011` typo in the asset list splits one fleet of 22 in two.
        Grouping by the app's own rows makes that impossible."""
        _cycle(db_session, 250)
        for name in ('TT039', 'TT049'):
            _machine(db_session, name, eq_type='TT', model='YT220')
        services = ([_svc('TT039', 250, **{OIL: 25}) for _ in range(4)]
                    + [_svc('TT049', 250, **{OIL: 25}) for _ in range(4)])

        kits, held, problems = build(_spec(services))

        assert len(kits) == 1
        assert kits[0]['services'] == 8, 'both machines feed one kit'
        assert sorted(kits[0]['machines']) == ['TT039', 'TT049']

    def test_a_machine_the_app_does_not_know_is_named_not_invented(
            self, app, db_session):
        _cycle(db_session, 250)

        kits, held, problems = build(_spec([_svc('RS999', 250, **{OIL: 45})]))

        assert kits == []
        assert any('RS999' in p for p in problems)


class TestTheArithmetic:
    def test_a_material_under_75_percent_is_left_out(self, app, db_session):
        _cycle(db_session, 250); _machine(db_session, 'RS113')
        services = [_svc('RS113', 250, **{OIL: 45}) for _ in range(8)]
        services[0]['materials'][FILTER] = 1   # 1 of 8 = 12%

        kits, held, problems = build(_spec(services))

        assert [i['code'] for i in kits[0]['items']] == [OIL]

    def test_exactly_75_percent_is_kept(self, app, db_session):
        _cycle(db_session, 250); _machine(db_session, 'RS113')
        services = [_svc('RS113', 250, **{OIL: 45}) for _ in range(8)]
        for s in services[:6]:
            s['materials'][FILTER] = 1        # 6 of 8 = exactly 75%

        kits, held, problems = build(_spec(services))

        assert {i['code'] for i in kits[0]['items']} == {OIL, FILTER}

    def test_the_quantity_is_the_most_used_not_the_average(self, app, db_session):
        """Ali, 2026-08-26. RS DRG450 at 250 hr drew 45 LTR 42 times of 53; the
        average of 48.58 is a figure nobody ever asked the store for."""
        _cycle(db_session, 250); _machine(db_session, 'RS113')
        services = ([_svc('RS113', 250, **{OIL: 45}) for _ in range(6)]
                    + [_svc('RS113', 250, **{OIL: 95}) for _ in range(2)])

        kits, held, problems = build(_spec(services))

        item = kits[0]['items'][0]
        assert item['quantity'] == 45
        assert item['spread'] == '45x6  95x2'
        assert item['times_this_qty'] == 6

    def test_under_five_services_is_held_back_not_built(self, app, db_session):
        _cycle(db_session, 250); _machine(db_session, 'RS113')

        kits, held, problems = build(
            _spec([_svc('RS113', 250, **{OIL: 45}) for _ in range(4)]))

        assert kits == []
        assert len(held) == 1 and held[0]['services'] == 4

    def test_a_missing_cycle_row_stops_that_kit_and_says_so(self, app, db_session):
        _machine(db_session, 'RS113')
        MaintenanceCycle.query.filter_by(hours_value=250).delete()
        db_session.session.commit()

        kits, held, problems = build(
            _spec([_svc('RS113', 250, **{OIL: 45}) for _ in range(6)]))

        assert kits == []
        assert any('250 running hours' in p for p in problems)


class TestReportBeforeWrite:
    def test_plan_changes_nothing(self, app, db_session):
        _cycle(db_session, 250); _machine(db_session, 'RS113')
        before = MaterialKit.query.count(), Material.query.count()

        plan(_spec([_svc('RS113', 250, **{OIL: 45}) for _ in range(6)]))

        assert (MaterialKit.query.count(), Material.query.count()) == before

    def test_it_shows_the_old_quantity_beside_the_new_one(self, app, db_session):
        cycle = _cycle(db_session, 250); _machine(db_session, 'RS113')
        old = Material(code=OIL, name='Engine oil 15w40', category='lubricant',
                       unit='LTR')
        db_session.session.add(old); db_session.session.flush()
        kit = MaterialKit(name='250 Hrs-RS-DRG450', equipment_type='RS',
                          equipment_model='DRG450-65S5', cycle_id=cycle.id,
                          is_active=True)
        db_session.session.add(kit); db_session.session.flush()
        db_session.session.add(MaterialKitItem(kit_id=kit.id, material_id=old.id,
                                               quantity=65))
        db_session.session.commit()

        report = plan(_spec([_svc('RS113', 250, **{OIL: 45}) for _ in range(6)]))

        entry = report['kits'][0]
        assert entry['action'] == 'update' and entry['existing_id'] == kit.id
        assert entry['current_items'][0]['quantity'] == 65
        assert entry['items'][0]['quantity'] == 45


class TestWriting:
    def _six(self, machine='RS113'):
        return _spec([_svc(machine, 250, **{OIL: 45}) for _ in range(6)])

    def test_it_creates_the_kit_and_its_material(self, app, db_session):
        cycle = _cycle(db_session, 250); _machine(db_session, 'RS113')

        counts = apply(self._six())

        assert counts['created'] == 1 and counts['materials_created'] == 1
        kit = MaterialKit.query.one()
        assert (kit.equipment_type, kit.equipment_model, kit.cycle_id) == \
               ('RS', 'DRG450-65S5', cycle.id)
        assert len(kit.items) == 1 and kit.items[0].quantity == 45

    def test_the_kit_it_writes_is_one_the_matcher_can_find(self, app, db_session):
        """The whole point. A kit keyed to anything else exists and never fires."""
        from app.api.materials import find_matching_kit
        cycle = _cycle(db_session, 250)
        machine = _machine(db_session, 'RS113')

        apply(self._six())

        found = find_matching_kit(machine.id, cycle.id)
        assert found is not None, 'the seeder wrote a kit the matcher cannot see'
        assert found.items[0].quantity == 45

    def test_a_forklift_kit_with_no_interval_is_also_findable(self, app, db_session):
        from app.api.materials import find_matching_kit
        machine = _machine(db_session, 'FL328', eq_type='FL', model='D30NXP')

        apply(_spec([_svc('FL328', None, **{OIL: 10}) for _ in range(6)]))

        found = find_matching_kit(machine.id, None)
        assert found is not None and found.items[0].quantity == 10

    def test_running_it_twice_changes_nothing_the_second_time(self, app, db_session):
        _cycle(db_session, 250); _machine(db_session, 'RS113')

        apply(self._six())
        counts = apply(self._six())

        assert counts['created'] == 0 and counts['updated'] == 1
        assert MaterialKit.query.count() == 1 and MaterialKitItem.query.count() == 1

    def test_a_line_no_longer_in_the_data_is_dropped(self, app, db_session):
        """How `CO01-C022-004` and the six duplicate rows go, with no rule of
        their own."""
        cycle = _cycle(db_session, 250); _machine(db_session, 'RS113')
        dead = Material(code='CO01-C022-004', name='Equipment degreaser',
                        category='consumable', unit='EA')
        db_session.session.add(dead); db_session.session.flush()
        kit = MaterialKit(name='old', equipment_type='RS',
                          equipment_model='DRG450-65S5', cycle_id=cycle.id,
                          is_active=True)
        db_session.session.add(kit); db_session.session.flush()
        db_session.session.add(MaterialKitItem(kit_id=kit.id, material_id=dead.id,
                                               quantity=1))
        db_session.session.commit()

        apply(self._six())

        db_session.session.refresh(kit)
        assert [i.material.code for i in kit.items] == [OIL]

    def test_a_kit_with_no_data_behind_it_is_switched_off_not_deleted(
            self, app, db_session):
        """Ali said "if wrong remove". Deactivating is the reversible reading."""
        _cycle(db_session, 250); _machine(db_session, 'RS113')
        orphan = MaterialKit(name='nobody makes this any more',
                             equipment_type='QC', equipment_model='J7600',
                             is_active=True)
        db_session.session.add(orphan); db_session.session.commit()
        orphan_id = orphan.id

        counts = apply(self._six())

        assert counts['deactivated'] == 1
        assert db.session.get(MaterialKit, orphan_id).is_active is False
