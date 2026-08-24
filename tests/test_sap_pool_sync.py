"""
Writing parsed SAP candidates into the job pool.

Deliberately built on tiny synthetic workbooks. The real exports take 69 seconds
to parse, which is fine for a nightly background job and useless in a test suite.
The parsing itself is covered by test_sap_order_parser.py; what matters here is
what reaches the database.
"""

import hashlib
import io
import os

import pandas as pd
import pytest

from app.extensions import db
from app.models import Equipment, SAPWorkOrder, WorkPlan
from app.services.sap_pool_sync import sync_pool_from_delivered_files

KEY = 'pool-sync-key'


@pytest.fixture(autouse=True)
def robot_key(app):
    app.config['SAP_SYNC_ROBOT_KEY'] = KEY
    yield


def _iw39(rows):
    """A minimal IW39 with only the columns the parser reads."""
    columns = ['Order', 'MaintActivityType', 'Main work center', 'System status',
               'Functional Location', 'Description', 'Basic start date', 'Priority',
               'Work Center', 'Equipment', 'Maintenance Plan', 'Created on',
               'Actual Order Finish Date', 'User Status', 'Deletion flag']
    frame = pd.DataFrame([{**{c: None for c in columns}, **row} for row in rows],
                         columns=columns)
    buffer = io.BytesIO()
    frame.to_excel(buffer, index=False)
    return buffer.getvalue()


def _deliver(client, payload, sheet_name='IW39', filename='IW39 YTD.XLSX'):
    return client.post('/api/sap-sync/upload', headers={'X-Robot-Key': KEY},
                       content_type='multipart/form-data',
                       data={'file': (io.BytesIO(payload), filename),
                             'sheet_name': sheet_name, 'source_filename': filename,
                             'source_folder': 'sap_import',
                             'sha256': hashlib.sha256(payload).hexdigest()})


def _open_order(number='700000000001', location='3700-EQ-TT_-TT001',
                activity='COM', status='CRTD CSER NMAT PRC', description='Steering leak'):
    return {'Order': number, 'MaintActivityType': activity,
            'Main work center': 'MES-MECH', 'System status': status,
            'Functional Location': location, 'Description': description,
            'Created on': '2026-08-01', 'Maintenance Plan': '2000042905'}


class TestWritingIntoTheBox:
    def test_candidates_land_in_the_pool_with_no_week(self, client, db_session):
        """Everything the sync writes belongs to the shared box, not to a week."""
        db_session.session.add(Equipment(name='TT001', serial_number='SN-TT001',
                                         equipment_type='tractor'))
        db_session.session.commit()
        _deliver(client, _iw39([_open_order()]))

        report = sync_pool_from_delivered_files(today='2026-08-23')

        assert report['created'] == 1
        order = SAPWorkOrder.query.one()
        assert order.work_plan_id is None, 'must go in the box, not a week'
        assert order.status == 'pending'
        assert order.order_number == '700000000001'

    def test_a_second_run_updates_rather_than_duplicating(self, client, db_session):
        """The robot delivers daily. The old importer skipped duplicates silently,
        which meant a corrected estimate never landed — that defeats a daily sync."""
        db_session.session.add(Equipment(name='TT001', serial_number='SN-TT001',
                                         equipment_type='tractor'))
        db_session.session.commit()

        _deliver(client, _iw39([_open_order(description='First text')]))
        sync_pool_from_delivered_files(today='2026-08-23')

        _deliver(client, _iw39([_open_order(description='Corrected text')]))
        report = sync_pool_from_delivered_files(today='2026-08-23')

        assert report['created'] == 0
        assert report['updated'] == 1
        assert SAPWorkOrder.query.count() == 1
        assert SAPWorkOrder.query.one().description == 'Corrected text'

    def test_orders_that_left_sap_leave_the_box(self, client, db_session):
        """Ali: nothing completed should sit in the pool, so the generator cannot
        schedule work that is already done."""
        db_session.session.add(Equipment(name='TT001', serial_number='SN-TT001',
                                         equipment_type='tractor'))
        db_session.session.commit()

        _deliver(client, _iw39([_open_order('700000000001'), _open_order('700000000002')]))
        sync_pool_from_delivered_files(today='2026-08-23')
        assert SAPWorkOrder.query.count() == 2

        # Next day's export: one order has been completed and is gone from the open list.
        _deliver(client, _iw39([_open_order('700000000001')]))
        report = sync_pool_from_delivered_files(today='2026-08-23')

        assert report['removed_from_pool'] == 1
        assert {o.order_number for o in SAPWorkOrder.query.all()} == {'700000000001'}

    def test_a_scheduled_order_is_never_touched(self, client, db_session, admin_user):
        """An order with a work_plan_id is planned work, possibly already started.
        It belongs to the removal rules, not to a bulk reconciliation."""
        from datetime import date, timedelta
        db_session.session.add(Equipment(name='TT001', serial_number='SN-TT001',
                                         equipment_type='tractor'))
        plan = WorkPlan(week_start=date.today(), week_end=date.today() + timedelta(days=6),
                        status='draft', created_by_id=admin_user.id)
        db_session.session.add(plan)
        db_session.session.flush()
        scheduled = SAPWorkOrder(work_plan_id=plan.id, order_number='700000000009',
                                 order_type='COM', job_type='defect', equipment_id=1,
                                 estimated_hours=4.0, status='scheduled')
        db_session.session.add(scheduled)
        db_session.session.commit()

        # An export that does NOT mention the scheduled order at all.
        _deliver(client, _iw39([_open_order('700000000001')]))
        sync_pool_from_delivered_files(today='2026-08-23')

        db_session.session.refresh(scheduled)
        assert scheduled.status == 'scheduled', 'planned work must survive a sync'
        assert scheduled.work_plan_id == plan.id


class TestUnmatchedEquipmentIsLoud:
    def test_unmatched_codes_are_named_not_silently_dropped(self, client, db_session):
        """THE non-negotiable one.

        An order matching no equipment is dropped, and the planner then looks
        empty with nothing explaining why. It is the only failure in this whole
        pipeline that is otherwise invisible, so every unmatched code is named.
        """
        db_session.session.add(Equipment(name='TT001', serial_number='SN-TT001',
                                         equipment_type='tractor'))
        db_session.session.commit()

        _deliver(client, _iw39([
            _open_order('700000000001', location='3700-EQ-TT_-TT001'),   # known
            _open_order('700000000002', location='3700-EQ-RS_-RS999'),   # unknown
        ]))
        report = sync_pool_from_delivered_files(today='2026-08-23')

        assert report['created'] == 1
        assert report['orders_skipped_no_equipment'] == 1
        assert report['equipment_unmatched'] == 1
        assert 'RS999' in report['unmatched_codes'], 'the missing code must be named'


class TestDryRun:
    def test_dry_run_reports_but_writes_nothing(self, client, db_session):
        db_session.session.add(Equipment(name='TT001', serial_number='SN-TT001',
                                         equipment_type='tractor'))
        db_session.session.commit()
        _deliver(client, _iw39([_open_order()]))

        report = sync_pool_from_delivered_files(today='2026-08-23', dry_run=True)

        assert report['dry_run'] is True
        assert report['created'] == 1, 'it still reports what it WOULD do'
        assert SAPWorkOrder.query.count() == 0, 'and writes nothing'


class TestEndpoint:
    def test_rebuild_needs_the_robot_key(self, client):
        assert client.post('/api/sap-sync/rebuild-pool').status_code == 401

    def test_rebuild_returns_immediately(self, client, db_session):
        """A full rebuild parses ~50 MB and takes over a minute. Holding the
        request open that long invites a proxy timeout and a retry of work that
        is already running."""
        _deliver(client, _iw39([_open_order()]))
        resp = client.post('/api/sap-sync/rebuild-pool', headers={'X-Robot-Key': KEY})
        assert resp.status_code == 202
        assert resp.get_json()['status'] == 'accepted'

    def test_dry_run_is_synchronous_and_returns_the_report(self, client, db_session):
        _deliver(client, _iw39([_open_order()]))
        resp = client.post('/api/sap-sync/rebuild-pool?dry_run=true',
                           headers={'X-Robot-Key': KEY})
        assert resp.status_code == 200
        assert resp.get_json()['dry_run'] is True


class TestASkippedRebuildStillReports:
    """A rebuild that declines to run has a reason, and the reason is the answer.

    The early return used to save nothing, so /pool showed "never run" — the
    same words a crash produces. Distinguishing them cost an afternoon of shell
    sessions on a connection that kept dropping.
    """

    def test_nothing_delivered_saves_a_report_saying_so(self, app, db_session):
        from app.services.sap_pool_sync import load_last_report

        report = sync_pool_from_delivered_files(today='2026-08-23')

        assert report['status'] == 'skipped'
        assert 'delivered' in report['reason']
        saved = load_last_report()
        assert saved is not None
        assert saved['status'] == 'skipped'

    def test_a_delivered_but_unreadable_file_is_named_as_such(self, app, client,
                                                              db_session):
        """is_current and stored_path are checked by the rebuild but NOT by the
        freshness stamp, so the bot could say "SAP data: today 12:44" while the
        rebuild found nothing to read."""
        import os
        from app.models import SapSyncFile
        from app.services.sap_pool_sync import load_last_report

        _deliver(client, _iw39([_open_order()]))
        record = SapSyncFile.query.filter_by(sheet_name='IW39').first()
        os.remove(os.path.join(app.config['UPLOAD_FOLDER'], record.stored_path))

        report = sync_pool_from_delivered_files(today='2026-08-23')

        assert report['status'] == 'skipped'
        assert 'unreadable' in report['reason']
        assert load_last_report()['delivered'][0]['on_disk'] is False

    def test_the_delivered_list_reports_what_the_rebuild_actually_checks(
            self, client, db_session):
        from app.services.sap_pool_sync import _delivered_summary

        _deliver(client, _iw39([_open_order()]))

        delivered = _delivered_summary()

        assert delivered[0]['sheet'] == 'IW39'
        assert delivered[0]['is_current'] is True
        assert delivered[0]['on_disk'] is True


class TestAScheduledOrderIsNeverDuplicated:
    """The bug that killed /generate with a UniqueViolation.

    The sync matched existing orders only among BOX rows, so an order already
    scheduled into a week was not found and a SECOND row was created for it.
    The same order number then existed twice — once at work_plan_id NULL, once
    at the plan — and UniqueConstraint('work_plan_id', 'order_number') fired the
    moment the generator tried to stamp the box copy with that plan.
    """

    def _scheduled(self, db_session, equipment, number='700000000001',
                   week_start=None, with_job=True):
        """An order genuinely planned: stamped AND on a day of a live week.

        Both halves matter. "Carries a work_plan_id" is a different question,
        and answering it instead is what emptied the pool — ~2,000 legacy rows
        are stamped to plans from weeks long gone.
        """
        from datetime import date, timedelta
        from app.models import WorkPlanDay, WorkPlanJob
        start = week_start or date(2026, 8, 23)
        plan = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                        status='draft', created_by_id=1)
        db_session.session.add(plan)
        db_session.session.flush()
        db_session.session.add(SAPWorkOrder(
            work_plan_id=plan.id, order_number=number, order_type='PRM',
            job_type='pm', equipment_id=equipment.id, estimated_hours=4.0,
            status='scheduled'))
        if with_job:
            day = WorkPlanDay(work_plan_id=plan.id, date=start)
            db_session.session.add(day)
            db_session.session.flush()
            db_session.session.add(WorkPlanJob(
                work_plan_day_id=day.id, job_type='pm', equipment_id=equipment.id,
                sap_order_number=number, estimated_hours=4.0, position=1))
        db_session.session.commit()
        return plan

    def test_no_second_row_is_created_for_a_scheduled_order(self, client,
                                                            db_session, admin_user):
        equipment = Equipment(name='TT001', serial_number='SN-TT001',
                              equipment_type='tractor')
        db_session.session.add(equipment)
        db_session.session.commit()
        self._scheduled(db_session, equipment)
        _deliver(client, _iw39([_open_order('700000000001')]))

        report = sync_pool_from_delivered_files(today='2026-08-23')

        assert SAPWorkOrder.query.filter_by(order_number='700000000001').count() == 1
        assert report['created'] == 0
        assert report['left_alone_because_scheduled'] == 1

    def test_the_scheduled_row_is_not_modified(self, client, db_session, admin_user):
        """It is planned work, possibly started. The removal rules own it."""
        equipment = Equipment(name='TT001', serial_number='SN-TT001',
                              equipment_type='tractor')
        db_session.session.add(equipment)
        db_session.session.commit()
        plan = self._scheduled(db_session, equipment)
        _deliver(client, _iw39([_open_order('700000000001')]))

        sync_pool_from_delivered_files(today='2026-08-23')

        row = SAPWorkOrder.query.filter_by(order_number='700000000001').first()
        assert row.work_plan_id == plan.id
        assert row.status == 'scheduled'

    @pytest.mark.skip(reason=(
        'UNIQUE(order_number) now makes this state impossible to construct. The '
        'cleanup branch stays because a migration can fail silently on this '
        'deploy (flask db upgrade || echo WARNING); it was verified against '
        'production before the constraint existed — 1,898 duplicates deleted.'))
    def test_duplicates_already_in_the_database_are_cleaned_up(self, client,
                                                               db_session, admin_user):
        """Self-healing: production already had thousands of these."""
        equipment = Equipment(name='TT001', serial_number='SN-TT001',
                              equipment_type='tractor')
        db_session.session.add(equipment)
        db_session.session.commit()
        self._scheduled(db_session, equipment)
        # The spurious box copy a previous sync created.
        db_session.session.add(SAPWorkOrder(
            work_plan_id=None, order_number='700000000001', order_type='PRM',
            job_type='pm', equipment_id=equipment.id, estimated_hours=4.0,
            status='pending'))
        db_session.session.commit()
        assert SAPWorkOrder.query.filter_by(order_number='700000000001').count() == 2
        _deliver(client, _iw39([_open_order('700000000001')]))

        report = sync_pool_from_delivered_files(today='2026-08-23')

        # The PLANNED one survives — it is the record of real work.
        remaining = SAPWorkOrder.query.filter_by(order_number='700000000001').all()
        assert len(remaining) == 1
        assert remaining[0].work_plan_id is not None
        assert report['duplicate_box_rows_removed'] == 1

    def test_a_legacy_stamp_from_an_OLD_week_does_not_block_the_box(
            self, client, db_session, admin_user):
        """The bug that emptied the pool from 202 to 21.

        ~2,000 rows are legacy per-week imports stamped to plans from weeks
        long gone. Reading "carries a work_plan_id" as "already planned" meant
        every fresh box copy was deleted as a duplicate.
        """
        from datetime import date
        equipment = Equipment(name='TT001', serial_number='SN-TT001',
                              equipment_type='tractor')
        db_session.session.add(equipment)
        db_session.session.commit()
        # A plan whose week ended months ago, with a job on it.
        self._scheduled(db_session, equipment, week_start=date(2026, 1, 5))
        _deliver(client, _iw39([_open_order('700000000001')]))

        report = sync_pool_from_delivered_files(today='2026-08-23')

        in_box = SAPWorkOrder.query.filter(
            SAPWorkOrder.work_plan_id.is_(None),
            SAPWorkOrder.order_number == '700000000001').count()
        assert in_box == 1, 'a finished week must not keep an order out of the box'
        assert report['duplicate_box_rows_removed'] == 0

    def test_a_stranded_row_is_RECLAIMED_not_duplicated(
            self, client, db_session, admin_user):
        """Stamped to a plan whose jobs were cleared. Plan 40 had 69 of these.

        Not protected (no job to protect) and not in the box, so the candidate
        loop used to create a SECOND row. Under UNIQUE(order_number) that would
        now abort the entire rebuild — so the row is reclaimed instead, which is
        also the honest reading: a row nobody has a job for is pool stock
        wearing the wrong label.
        """
        equipment = Equipment(name='TT001', serial_number='SN-TT001',
                              equipment_type='tractor')
        db_session.session.add(equipment)
        db_session.session.commit()
        self._scheduled(db_session, equipment, with_job=False)
        _deliver(client, _iw39([_open_order('700000000001')]))

        report = sync_pool_from_delivered_files(today='2026-08-23')

        rows = SAPWorkOrder.query.filter_by(order_number='700000000001').all()
        assert len(rows) == 1, 'the constraint forbids a second row'
        assert rows[0].work_plan_id is None
        assert rows[0].status == 'pending'
        assert report['stranded_reclaimed'] == 1
        assert report['created'] == 0


class TestWhatThePoolStoresForHours:
    """The stored figure is not display-only.

    A job dragged straight from the pool onto a day never passes through the
    generator's bundling, so it carries whatever the sync wrote. That makes this
    the second place Ali's table has to be right, and the one the generator
    tests cannot see.

    Until 2026-08-24 the sync priced every order from a median of SAP's PLANNED
    hours in IW49 — a column that exists for 5,539 of 5,548 FINISHED orders and
    for none of the open ones. That is what put 143 hours on one Monday.
    """

    def _equipment(self, db_session, name, kind):
        db_session.session.add(Equipment(name=name, serial_number=f'SN-{name}',
                                         equipment_type=kind))
        db_session.session.commit()

    def test_a_lone_fault_stores_the_OWN_TRIP_price(self, client, db_session):
        self._equipment(db_session, 'TT001', 'tractor')
        _deliver(client, _iw39([_open_order(activity='COM')]))

        sync_pool_from_delivered_files(today='2026-08-23')

        assert SAPWorkOrder.query.one().estimated_hours == 3.0

    def test_an_AC_pm_is_not_priced_as_a_full_service(self, client, db_session):
        """33 of the 78 open PMs are AC. At the reach stacker's full-service
        figure this one row would book 12 hours for a 2-hour visit."""
        self._equipment(db_session, 'RS109', 'reach stacker')
        _deliver(client, _iw39([_open_order(
            number='700000000002', location='3700-EQ-RS_-RS109', activity='PRM',
            description='Inspection AC System')]))

        sync_pool_from_delivered_files(today='2026-08-23')

        assert SAPWorkOrder.query.one().estimated_hours == 2.0

    def test_the_full_service_on_the_same_machine_is_twelve(self, client, db_session):
        self._equipment(db_session, 'RS109', 'reach stacker')
        _deliver(client, _iw39([_open_order(
            number='700000000003', location='3700-EQ-RS_-RS109', activity='PRM',
            description='RS109-250HR-MECH.HOURLY SERVICE')]))

        sync_pool_from_delivered_files(today='2026-08-23')

        assert SAPWorkOrder.query.one().estimated_hours == 12.0

    def test_the_machine_family_decides_a_PM_and_not_a_fault(self, client, db_session):
        """Measured: family is worth 4x on a PM and 1% on a fault."""
        self._equipment(db_session, 'TR078', 'trailer')
        self._equipment(db_session, 'RS109', 'reach stacker')
        _deliver(client, _iw39([
            _open_order(number='700000000004', location='3700-EQ-TR_-TR078',
                        activity='PRM', description='250HR SERVICE'),
            _open_order(number='700000000005', location='3700-EQ-TR_-TR078',
                        activity='COM', description='Brake leak'),
            _open_order(number='700000000006', location='3700-EQ-RS_-RS109',
                        activity='COM', description='Brake leak'),
        ]))

        sync_pool_from_delivered_files(today='2026-08-23')

        hours = {o.order_number: o.estimated_hours for o in SAPWorkOrder.query.all()}
        assert hours['700000000004'] == 3.0    # trailer PM
        assert hours['700000000005'] == 3.0    # a fault is a fault...
        assert hours['700000000006'] == 3.0    # ...on any machine
