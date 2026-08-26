"""Load the standard PM material kits from `app/data/pm_material_kits.json`.

WHY A FILE AND NOT A PARSER. The kits are computed from 200,000 rows of IW3M
joined to IW39 and an asset list. That work happens once, offline, and its
result ships in the repo — the web app must never open a 36 MB workbook.

WHY REPORT FIRST. `classify()` changes nothing and prints what `apply()` would
do, line by line, with the provenance of every quantity (how many services, what
percentage, every amount the crew drew). Same split as
`sap_carry_over.classify()`, and for the same reason: the last cleanup that
shipped straight to production emptied the pool.

WHAT DECIDES A MATCH. A kit is keyed to `(equipment_type, equipment_model,
cycle_id)` because that is exactly what `find_matching_kit` compares. Those
strings are read from the app's own `equipment` rows via the spec's plant
numbers — never from the spec's own text — so a kit cannot be created that the
matcher will not find.
"""

import json
import logging
import os
from collections import defaultdict

from app.extensions import db
from app.models import Equipment
from app.models.maintenance_cycle import MaintenanceCycle
from app.models.material import Material
from app.models.material_kit import MaterialKit, MaterialKitItem

logger = logging.getLogger(__name__)

SPEC_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                         'data', 'pm_material_kits.json')


def load_spec(path=None):
    with open(path or SPEC_PATH, encoding='utf-8') as fh:
        return json.load(fh)


def _resolve_machines(plant_numbers):
    """What the APP says these machines are — not what the asset list says.

    Returns (groups, missing). `groups` maps (equipment_type, model_number) to
    the plant numbers that carry it. More than one group means the app's own
    equipment rows disagree about the model, which is a fact Ali needs to see
    rather than something to average away.
    """
    rows = Equipment.query.filter(Equipment.name.in_(list(plant_numbers))).all()
    found = {row.name.strip().upper(): row for row in rows}
    groups = defaultdict(list)
    missing = []
    for plant in plant_numbers:
        row = found.get(plant.strip().upper())
        if row is None:
            missing.append(plant)
            continue
        groups[(row.equipment_type, (row.model_number or '').strip() or None)].append(plant)
    return dict(groups), missing


def _cycle_for(hours):
    if hours is None:
        return None
    return MaintenanceCycle.query.filter_by(
        cycle_type='running_hours', hours_value=hours, is_active=True).first()


def _kit_name(equipment_type, model, hours):
    when = f'{hours} Hrs' if hours else 'Hourly Service'
    return f'{when} - {equipment_type} - {model}' if model else f'{when} - {equipment_type}'


def plan(spec=None):
    """Read-only. What `apply()` would do, and why. Changes nothing."""
    spec = spec or load_spec()
    report = {'kits': [], 'materials_to_create': [], 'problems': [],
              'held_back': len(spec.get('too_few_services') or []),
              'rules': spec.get('rules', {})}

    wanted_codes = {}
    for kit in spec['kits']:
        for item in kit['items']:
            wanted_codes[item['code']] = item
    have = {m.code for m in Material.query.filter(
        Material.code.in_(list(wanted_codes))).all()}
    for code in sorted(set(wanted_codes) - have):
        item = wanted_codes[code]
        report['materials_to_create'].append(
            {'code': code, 'name': item['name'], 'unit': item['unit'],
             'category': item['category']})

    seen_keys = {}
    for kit in spec['kits']:
        groups, missing = _resolve_machines(kit['plant_numbers'])
        label = (f"{kit['manufacturer']} {kit['model']} "
                 f"{kit['interval_hours'] or 'hourly'}")
        if missing:
            report['problems'].append(
                f"{label}: not in the app's equipment list — {', '.join(missing)}")
        if not groups:
            report['problems'].append(
                f'{label}: SKIPPED, none of its machines exist in the app')
            continue
        if len(groups) > 1:
            report['problems'].append(
                f'{label}: the app disagrees about the model — ' +
                '; '.join(f'{t}/{m or "(blank)"} = {", ".join(p)}'
                          for (t, m), p in groups.items()))

        cycle = _cycle_for(kit['interval_hours'])
        if kit['interval_hours'] and cycle is None:
            report['problems'].append(
                f"{label}: SKIPPED, no maintenance_cycles row for "
                f"{kit['interval_hours']} running hours")
            continue

        for (eq_type, model), plants in groups.items():
            key = (eq_type, model, cycle.id if cycle else None)
            if key in seen_keys:
                report['problems'].append(
                    f'{label}: SKIPPED, {seen_keys[key]} already claims '
                    f'{eq_type}/{model or "(blank)"}/'
                    f'{kit["interval_hours"] or "hourly"} — two spec kits '
                    f'landing on one app key usually means a typo in the '
                    f'asset list')
                continue
            seen_keys[key] = label

            existing = MaterialKit.query.filter_by(
                equipment_type=eq_type, equipment_model=model,
                cycle_id=cycle.id if cycle else None).first()
            report['kits'].append({
                'action': 'update' if existing else 'create',
                'existing_id': existing.id if existing else None,
                'existing_name': existing.name if existing else None,
                'name': _kit_name(eq_type, model, kit['interval_hours']),
                'equipment_type': eq_type, 'equipment_model': model,
                'cycle_id': cycle.id if cycle else None,
                'interval_hours': kit['interval_hours'],
                'services': kit['services'], 'machines': plants,
                'items': kit['items'],
                'current_items': [
                    {'code': i.material.code if i.material else '?',
                     'name': i.material.name if i.material else '?',
                     'quantity': i.quantity}
                    for i in (existing.items if existing else [])],
            })

    keep = {(k['equipment_type'], k['equipment_model'], k['cycle_id'])
            for k in report['kits']}
    report['to_deactivate'] = [
        {'id': k.id, 'name': k.name, 'equipment_type': k.equipment_type,
         'equipment_model': k.equipment_model, 'cycle_id': k.cycle_id}
        for k in MaterialKit.query.filter_by(is_active=True).all()
        if (k.equipment_type, k.equipment_model, k.cycle_id) not in keep]
    return report


def apply(spec=None, report=None):
    """Write the kits. Commits once, at the end.

    Kits no longer backed by data are DEACTIVATED, never deleted — Ali said
    "if wrong remove", and `is_active=False` is the reversible reading of that.
    Nothing about a kit is edited in place except its items, which are replaced
    wholesale: that is what removes the dead `CO01-C022-004` and the duplicate
    rows without a special case for either.
    """
    report = report or plan(spec)
    counts = {'created': 0, 'updated': 0, 'deactivated': 0,
              'materials_created': 0, 'items_written': 0}

    by_code = {}
    for entry in report['materials_to_create']:
        material = Material(code=entry['code'], name=entry['name'],
                            category=entry['category'], unit=entry['unit'],
                            current_stock=0, min_stock=0, is_active=True)
        db.session.add(material)
        counts['materials_created'] += 1
    db.session.flush()
    for material in Material.query.all():
        by_code[material.code] = material.id

    for entry in report['kits']:
        kit = db.session.get(MaterialKit, entry['existing_id']) if entry['existing_id'] else None
        if kit is None:
            kit = MaterialKit(equipment_type=entry['equipment_type'],
                              equipment_model=entry['equipment_model'],
                              cycle_id=entry['cycle_id'])
            db.session.add(kit)
            counts['created'] += 1
        else:
            counts['updated'] += 1
        kit.name = entry['name']
        kit.is_active = True
        kit.description = (
            f"From {entry['services']} real SAP services. Every material used on "
            f"75% or more; quantity is the most-used value, never the average.")
        # Replace the lines wholesale. Anything not in the data goes, which is
        # how the dead code and the duplicate rows disappear without a rule of
        # their own.
        MaterialKitItem.query.filter_by(kit_id=kit.id).delete()
        db.session.flush()
        for item in entry['items']:
            material_id = by_code.get(item['code'])
            if material_id is None:
                continue
            db.session.add(MaterialKitItem(kit_id=kit.id, material_id=material_id,
                                           quantity=item['quantity']))
            counts['items_written'] += 1

    for entry in report['to_deactivate']:
        kit = db.session.get(MaterialKit, entry['id'])
        if kit is not None:
            kit.is_active = False
            counts['deactivated'] += 1

    db.session.commit()
    logger.info('material kit seed: %s', counts)
    return counts
