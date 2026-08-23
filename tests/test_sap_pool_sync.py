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
