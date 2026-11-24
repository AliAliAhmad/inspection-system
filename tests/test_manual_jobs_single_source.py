"""The hand-typed-job rule, written once (knot report 2026-11-24).

The server decided it in app/api/work_plans.py and the web board re-derived it
in two places of its own, which had already drifted. The rule now lives in
app/utils/manual_jobs.py and travels to the web as `is_manual` on every job and
pool order. These cases are the ones the web used to test against its copy.
"""

import pathlib
from datetime import date, timedelta

from app.models import SAPWorkOrder, WorkPlan, WorkPlanDay, WorkPlanJob
from app.utils.manual_jobs import is_manual_order

ROOT = pathlib.Path(__file__).resolve().parents[1]


class TestTheRule:
    def test_spots_the_placeholder_by_number_or_by_type(self):
        assert is_manual_order('MAN-6-9', 'PRM')
        assert is_manual_order('MAN-6-9-P2', 'PRM')        # a split part
        assert is_manual_order('4000123456', 'MANUAL')

    def test_leaves_real_sap_orders_alone(self):
        assert not is_manual_order('4000123456', 'PRM')
        assert not is_manual_order('PRM-100', 'COM')
        assert not is_manual_order(None, None)
        assert not is_manual_order('', '')


def _day(db_session, admin_user):
    monday = date(2026, 8, 24)
    plan = WorkPlan(week_start=monday, week_end=monday + timedelta(days=6),
                    status='draft', created_by_id=admin_user.id)
    db_session.session.add(plan)
    db_session.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=monday)
    db_session.session.add(day)
    db_session.session.flush()
    return day


class TestTheFlagTravels:
    def test_a_job_carries_is_manual_in_full_and_compact_payloads(self, db_session,
                                                                  admin_user):
        """Compact mode once dropped `work_center` and showed a trade under
        both teams. Both shapes must carry the flag."""
        day = _day(db_session, admin_user)
        typed = WorkPlanJob(work_plan_day_id=day.id, job_type='pm', berth='east',
                            description='Grease the spreader', estimated_hours=2,
                            position=1)
        parked = WorkPlanJob(work_plan_day_id=day.id, job_type='pm', berth='east',
                             description='Back from the pool', estimated_hours=2,
                             position=2, sap_order_number='MAN-6-9')
        from_sap = WorkPlanJob(work_plan_day_id=day.id, job_type='pm', berth='east',
                               description='250HR', estimated_hours=2, position=3,
                               sap_order_number='700000001000', sap_order_type='PRM')
        db_session.session.add_all([typed, parked, from_sap])
        db_session.session.commit()

        for compact in (False, True):
            assert typed.to_dict(compact=compact)['is_manual'] is True
            assert parked.to_dict(compact=compact)['is_manual'] is True
            assert from_sap.to_dict(compact=compact)['is_manual'] is False

    def test_a_pool_order_carries_is_manual(self, db_session):
        from app.models import Equipment
        machine = Equipment(name='TT777', serial_number='SN-TT777',
                            equipment_type='truck', berth='east')
        db_session.session.add(machine)
        db_session.session.flush()
        parked = SAPWorkOrder(order_number='MAN-6-10', order_type='PRM', job_type='pm',
                              equipment_id=machine.id, status='pending',
                              description='parked')
        real = SAPWorkOrder(order_number='700000001001', order_type='PRM', job_type='pm',
                            equipment_id=machine.id, status='pending', description='real')
        db_session.session.add_all([parked, real])
        db_session.session.commit()

        assert parked.to_dict()['is_manual'] is True
        assert real.to_dict()['is_manual'] is False


def test_no_other_file_types_the_prefix():
    """One place says what the placeholder looks like."""
    copies = []
    for path in list((ROOT / 'app').rglob('*.py')) + list(
            (ROOT / 'frontend/apps/web/src').rglob('*.ts*')):
        if path.name == 'manual_jobs.py' or '.test.' in path.name:
            continue
        text = path.read_text(encoding='utf-8')
        for needle in ("'MAN-'", '"MAN-"', 'f"MAN-', "f'MAN-", "startsWith('MAN-')"):
            if needle in text:
                copies.append(f'{path.relative_to(ROOT)}: {needle}')
    assert copies == []
