"""Build the standard PM material kits from real SAP history.

WHAT SHIPS IN THE FILE. `app/data/pm_material_kits.json` holds one row per PM
SERVICE — the machine, the service package, and what left the store for it —
NOT pre-grouped kits. The grouping and the arithmetic happen here, against the
live `equipment` table.

WHY. Ali, 2026-08-26, on the ten Ottawa tractors: "not one model but share same
engine, so keep each kit different." So the model grouping cannot come from the
asset list, which calls all ten `OTTAWA 50`. It has to come from
`equipment.model_number` — which is also the only string `find_matching_kit`
compares, so a kit built this way is one the matcher can find by construction.
It disposes of the asset list's `YT22011` typo at the same time: whatever the
app says a machine is, is what it is.

WHY REPORT FIRST. `plan()` changes nothing and prints what `apply()` would do,
line by line, with the provenance of every quantity. Same split as
`sap_carry_over.classify()`, and for the same reason: the last cleanup that went
straight to production emptied the pool.
"""

import json
import logging
import os
from collections import Counter, defaultdict

from app.extensions import db
from app.models import Equipment
from app.models.maintenance_cycle import MaintenanceCycle
from app.models.material import Material
from app.models.material_kit import MaterialKit, MaterialKitItem

logger = logging.getLogger(__name__)

SPEC_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                         'data', 'pm_material_kits.json')

THRESHOLD = 0.75        # used on three services in four
MIN_SERVICES = 5        # below this a percentage means nothing


def load_spec(path=None):
    with open(path or SPEC_PATH, encoding='utf-8') as fh:
        return json.load(fh)


def _machines(names):
    """{PLANT NO: Equipment} for the machines the app knows, and the rest."""
    rows = Equipment.query.filter(Equipment.name.in_(sorted(names))).all()
    found = {row.name.strip().upper(): row for row in rows}
    return found, sorted(n for n in names if n not in found)


def _cycle_ids():
    return {c.hours_value: c.id for c in MaintenanceCycle.query.filter_by(
        cycle_type='running_hours', is_active=True).all() if c.hours_value}


def _kit_name(equipment_type, model, hours):
    when = f'{hours} Hrs' if hours else 'Hourly Service'
    return f'{when} - {equipment_type} - {model}' if model else f'{when} - {equipment_type}'


def build(spec=None):
    """Group the services by what the APP says, and price each kit.

    Returns (kits, problems). Pure arithmetic over the equipment table — no
    writes, and no opinion about what already exists.
    """
    spec = spec or load_spec()
    master = spec['materials']
    services = spec['services']

    found, missing = _machines({s['machine'] for s in services})
    problems = []
    if missing:
        problems.append(f"{len(missing)} machines in SAP are not in the app's "
                        f"equipment list: {', '.join(missing)}")

    groups = defaultdict(list)
    for service in services:
        machine = found.get(service['machine'])
        if machine is None:
            continue
        model = (machine.model_number or '').strip() or None
        groups[(machine.equipment_type, model, service['interval_hours'])].append(service)

    cycles = _cycle_ids()
    kits, held_back = [], []
    for (eq_type, model, hours), rows in sorted(
            groups.items(), key=lambda kv: (kv[0][0], kv[0][1] or '', kv[0][2] or 0)):
        n = len(rows)
        counts, quantities = Counter(), defaultdict(list)
        for service in rows:
            for code, qty in service['materials'].items():
                counts[code] += 1
                quantities[code].append(qty)

        items = []
        for code, used_on in counts.items():
            if used_on / n + 1e-9 < THRESHOLD:
                continue
            spread = Counter(quantities[code])
            most_used, times = spread.most_common(1)[0]
            info = master.get(code, {})
            items.append({
                'code': code,
                'name': info.get('name') or code,
                'unit': info.get('unit') or '',
                'category': info.get('category') or 'spare_part',
                'quantity': most_used, 'times_this_qty': times,
                'freq_pct': round(used_on / n * 100), 'used_on': used_on,
                'spread': '  '.join(f'{v:g}x{c}' for v, c in
                                    sorted(spread.items(), key=lambda kv: (-kv[1], kv[0]))),
            })
        if not items:
            continue
        items.sort(key=lambda i: (-i['freq_pct'], i['code']))

        entry = {'equipment_type': eq_type, 'equipment_model': model,
                 'interval_hours': hours, 'services': n, 'items': items,
                 'machines': sorted({s['machine'] for s in rows})}
        if n < MIN_SERVICES:
            held_back.append(entry)
            continue
        if hours is not None and hours not in cycles:
            problems.append(
                f'{eq_type}/{model or "(no model)"} {hours} hr: SKIPPED, no '
                f'maintenance_cycles row for {hours} running hours')
            continue
        entry['cycle_id'] = cycles.get(hours) if hours else None
        kits.append(entry)

    return kits, held_back, problems


def plan(spec=None):
    """Read-only. Exactly what `apply()` would do, and why."""
    kits, held_back, problems = build(spec)

    wanted = {}
    for kit in kits:
        for item in kit['items']:
            wanted[item['code']] = item
    have = {m.code for m in Material.query.filter(
        Material.code.in_(sorted(wanted))).all()} if wanted else set()
    to_create = [{'code': c, 'name': wanted[c]['name'], 'unit': wanted[c]['unit'],
                  'category': wanted[c]['category']}
                 for c in sorted(set(wanted) - have)]

    for kit in kits:
        existing = MaterialKit.query.filter_by(
            equipment_type=kit['equipment_type'],
            equipment_model=kit['equipment_model'],
            cycle_id=kit['cycle_id']).first()
        kit['action'] = 'update' if existing else 'create'
        kit['existing_id'] = existing.id if existing else None
        kit['existing_name'] = existing.name if existing else None
        kit['name'] = _kit_name(kit['equipment_type'], kit['equipment_model'],
                                kit['interval_hours'])
        kit['current_items'] = [
            {'code': i.material.code if i.material else '?',
             'name': i.material.name if i.material else '?',
             'quantity': i.quantity}
            for i in (existing.items if existing else [])]

    keep = {(k['equipment_type'], k['equipment_model'], k['cycle_id']) for k in kits}
    to_deactivate = [
        {'id': k.id, 'name': k.name}
        for k in MaterialKit.query.filter_by(is_active=True).all()
        if (k.equipment_type, k.equipment_model, k.cycle_id) not in keep]

    return {'kits': kits, 'materials_to_create': to_create,
            'to_deactivate': to_deactivate, 'problems': problems,
            'held_back': held_back,
            'rules': (spec or load_spec()).get('rules', {})}


def apply(spec=None, report=None):
    """Write the kits. One commit, at the end.

    Kits with no data behind them are DEACTIVATED, never deleted — the
    reversible reading of Ali's "if wrong remove". Items are replaced wholesale,
    which is how the dead `CO01-C022-004` and the duplicate rows disappear
    without a rule of their own.
    """
    report = report or plan(spec)
    counts = {'created': 0, 'updated': 0, 'deactivated': 0,
              'materials_created': 0, 'items_written': 0}

    for entry in report['materials_to_create']:
        db.session.add(Material(code=entry['code'], name=entry['name'],
                                category=entry['category'],
                                unit=entry['unit'] or 'EA',
                                current_stock=0, min_stock=0, is_active=True))
        counts['materials_created'] += 1
    db.session.flush()
    by_code = {m.code: m.id for m in Material.query.all()}

    for entry in report['kits']:
        kit = (db.session.get(MaterialKit, entry['existing_id'])
               if entry['existing_id'] else None)
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
            f"From {entry['services']} real SAP services on "
            f"{len(entry['machines'])} machines. Every material used on 75% or "
            f"more; quantity is the most-used value, never the average.")
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
