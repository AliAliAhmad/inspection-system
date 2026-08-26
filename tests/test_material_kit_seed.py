"""Loading the standard kits.

Ali's bar for this work: "0 bug and wrong tolerance". So the seeder reports
before it writes, keys every kit to what `find_matching_kit` actually compares,
and refuses rather than guesses when the app and the data disagree.
"""

import pytest

from app.extensions import db
from app.models import Equipment
from app.models.maintenance_cycle import MaintenanceCycle
from app.models.material import Material
from app.models.material_kit import MaterialKit, MaterialKitItem
from app.services.material_kit_seed import apply, load_spec, plan

_seq = iter(range(1, 9999))


def _spec(kits, too_few=()):
    return {'rules': {'threshold_pct': 75}, 'kits': kits,
            'too_few_services': list(too_few)}


def _kit_spec(family='RS', manufacturer='KALMAR', model='DRG450-65S5',
              hours=250, plants=('RS113', 'RS114'), items=None):
    return {'family': family, 'manufacturer': manufacturer, 'model': model,
            'interval_hours': hours, 'services': 53,
            'plant_numbers': list(plants),
            'items': items or [_item()]}


def _item(code='CO01-C014-003', name='Engine oil 15w40', unit='LTR',
          qty=45, category='lubricant'):
    return {'code': code, 'name': name, 'unit': unit, 'category': category,
            'quantity': qty, 'freq_pct': 98, 'used_on': 52,
            'times_this_qty': 42, 'average': 48.58, 'min': 40, 'max': 95,
            'spread': '45x42  65x3  40x2'}


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


class TestTheShippedSpecIsSane:
    def test_it_loads_and_every_kit_is_complete(self):
        spec = load_spec()
        assert spec['kits'], 'the shipped spec is empty'
        for kit in spec['kits']:
            assert kit['plant_numbers'], f'{kit["model"]} names no machines'
            assert kit['items'], f'{kit["model"]} has no materials'
            assert kit['services'] >= 5, (
                f'{kit["model"]} slipped past the 5-service floor')
            for item in kit['items']:
                assert item['freq_pct'] >= 75
                assert item['quantity'] > 0
                assert item['unit'], f'{item["code"]} has no unit'
                assert item['spread'], f'{item["code"]} carries no provenance'

    def test_the_dead_material_code_is_nowhere_in_it(self):
        """`CO01-C022-004 Equipment degreaser` is in 6 of Ali's 8 saved kits and
        appears ZERO times in 283,345 movement lines. The data-driven spec must
        not carry it forward."""
        spec = load_spec()
        codes = {i['code'] for k in spec['kits'] for i in k['items']}
        assert 'CO01-C022-004' not in codes

    def test_no_kit_lists_the_same_material_twice(self):
        spec = load_spec()
        for kit in spec['kits']:
            codes = [i['code'] for i in kit['items']]
            assert len(codes) == len(set(codes)), f'{kit["model"]} repeats a material'


class TestReportBeforeWrite:
    def test_plan_changes_nothing(self, app, db_session):
        _machine(db_session, 'RS113'); _cycle(db_session, 250)
        before = MaterialKit.query.count(), Material.query.count()

        plan(_spec([_kit_spec()]))

        assert (MaterialKit.query.count(), Material.query.count()) == before

    def test_it_says_which_materials_it_would_create(self, app, db_session):
        _machine(db_session, 'RS113'); _cycle(db_session, 250)

        report = plan(_spec([_kit_spec()]))

        assert [m['code'] for m in report['materials_to_create']] == ['CO01-C014-003']
        assert report['materials_to_create'][0]['unit'] == 'LTR'

    def test_it_shows_the_old_quantity_beside_the_new_one(self, app, db_session):
        """Ali has to be able to see what changes before it changes."""
        _machine(db_session, 'RS113')
        cycle = _cycle(db_session, 250)
        old_mat = Material(code='CO01-C014-003', name='Engine oil 15w40',
                           category='lubricant', unit='LTR')
        db_session.session.add(old_mat); db_session.session.flush()
        kit = MaterialKit(name='250 Hrs-RS-DRG450', equipment_type='RS',
                          equipment_model='DRG450-65S5', cycle_id=cycle.id,
                          is_active=True)
        db_session.session.add(kit); db_session.session.flush()
        db_session.session.add(MaterialKitItem(kit_id=kit.id,
                                               material_id=old_mat.id, quantity=65))
        db_session.session.commit()

        report = plan(_spec([_kit_spec()]))

        entry = report['kits'][0]
        assert entry['action'] == 'update'
        assert entry['existing_id'] == kit.id
        assert entry['current_items'][0]['quantity'] == 65
        assert entry['items'][0]['quantity'] == 45


class TestWhatItRefusesToDo:
    def test_a_machine_the_app_does_not_know_is_reported_not_invented(
            self, app, db_session):
        _cycle(db_session, 250)

        report = plan(_spec([_kit_spec(plants=('RS999',))]))

        assert report['kits'] == []
        assert any('RS999' in p for p in report['problems'])

    def test_a_missing_cycle_row_stops_that_kit_and_says_so(self, app, db_session):
        _machine(db_session, 'RS113')
        MaintenanceCycle.query.filter_by(hours_value=250).delete()
        db_session.session.commit()

        report = plan(_spec([_kit_spec()]))

        assert report['kits'] == []
        assert any('250 running hours' in p for p in report['problems'])

    def test_when_the_app_disagrees_about_the_model_it_says_so(self, app, db_session):
        """The asset list holds `YT220` and `YT22011` for one fleet of 22
        tractors. If that typo is in the app too, Ali sees it rather than the
        seeder averaging it away."""
        _cycle(db_session, 250)
        _machine(db_session, 'RS113', model='DRG450-65S5')
        _machine(db_session, 'RS114', model='DRG450-65S5-TYPO')

        report = plan(_spec([_kit_spec()]))

        assert any('disagrees about the model' in p for p in report['problems'])
        assert len(report['kits']) == 2, 'both groups are offered, neither guessed'

    def test_two_spec_kits_landing_on_one_app_key_is_refused(self, app, db_session):
        """Exactly what the YT220/YT22011 typo does once the app has cleaned it
        up: two spec kits both resolve to RS/DRG450-65S5/250. Writing one over
        the other silently would lose a whole fleet's numbers."""
        _cycle(db_session, 250)
        _machine(db_session, 'RS113'); _machine(db_session, 'RS114')

        report = plan(_spec([
            _kit_spec(plants=('RS113',)),
            _kit_spec(model='DRG450-65S5 ', plants=('RS114',)),
        ]))

        assert len(report['kits']) == 1
        assert any('already claims' in p for p in report['problems'])


class TestWriting:
    def test_it_creates_the_kit_and_its_material(self, app, db_session):
        _machine(db_session, 'RS113'); cycle = _cycle(db_session, 250)

        counts = apply(_spec([_kit_spec()]))

        assert counts['created'] == 1 and counts['materials_created'] == 1
        kit = MaterialKit.query.filter_by(equipment_type='RS').one()
        assert kit.equipment_model == 'DRG450-65S5'
        assert kit.cycle_id == cycle.id
        assert len(kit.items) == 1 and kit.items[0].quantity == 45

    def test_the_kit_it_writes_is_one_the_matcher_can_find(self, app, db_session):
        """The whole point. A kit keyed to anything else exists and never fires."""
        from app.api.materials import find_matching_kit
        machine = _machine(db_session, 'RS113')
        cycle = _cycle(db_session, 250)

        apply(_spec([_kit_spec()]))

        found = find_matching_kit(machine.id, cycle.id)
        assert found is not None, 'the seeder wrote a kit the matcher cannot see'
        assert found.items[0].quantity == 45

    def test_a_forklift_kit_with_no_interval_is_also_findable(self, app, db_session):
        from app.api.materials import find_matching_kit
        machine = _machine(db_session, 'FL328', eq_type='FL', model='DOOSAN D30NXP')

        apply(_spec([_kit_spec(family='FL', manufacturer='DOOSAN',
                               model='DOOSAN D30NXP', hours=None,
                               plants=('FL328',),
                               items=[_item(qty=10)])]))

        found = find_matching_kit(machine.id, None)
        assert found is not None and found.items[0].quantity == 10

    def test_running_it_twice_changes_nothing_the_second_time(self, app, db_session):
        _machine(db_session, 'RS113'); _cycle(db_session, 250)

        apply(_spec([_kit_spec()]))
        counts = apply(_spec([_kit_spec()]))

        assert counts['created'] == 0 and counts['updated'] == 1
        assert MaterialKit.query.count() == 1
        assert MaterialKitItem.query.count() == 1

    def test_a_line_no_longer_in_the_data_is_dropped(self, app, db_session):
        """This is how `CO01-C022-004` and the six duplicate rows disappear —
        the items are replaced wholesale, with no special case for either."""
        _machine(db_session, 'RS113'); cycle = _cycle(db_session, 250)
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

        apply(_spec([_kit_spec()]))

        db_session.session.refresh(kit)
        assert [i.material.code for i in kit.items] == ['CO01-C014-003']

    def test_a_kit_with_no_data_behind_it_is_switched_off_not_deleted(
            self, app, db_session):
        """Ali said "if wrong remove". Deactivating is the reversible reading,
        and it keeps the history of what the kit used to say."""
        _machine(db_session, 'RS113'); _cycle(db_session, 250)
        orphan = MaterialKit(name='nobody makes this any more',
                             equipment_type='QC', equipment_model='J7600',
                             is_active=True)
        db_session.session.add(orphan)
        db_session.session.commit()
        orphan_id = orphan.id

        counts = apply(_spec([_kit_spec()]))

        assert counts['deactivated'] == 1
        assert db.session.get(MaterialKit, orphan_id) is not None
        assert db.session.get(MaterialKit, orphan_id).is_active is False
