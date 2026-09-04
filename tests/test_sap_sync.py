"""
Receiving end of the Windows SAP file courier.

The pairing that matters most here is the sha256 check. The courier goes to real
trouble on its side to avoid shipping a half-written file (SAP's own export
script writes 35 MB workbooks straight into the watched folder). If a truncated
file did arrive, storing it would produce silently WRONG numbers downstream —
fewer orders, missing equipment — with no error anywhere. So the server verifies
the bytes it actually received rather than trusting the hash it was handed.
"""

import hashlib
import io
import os

import pytest

from app.extensions import db
from app.models import SapSyncFile


KEY = 'test-robot-key-123'


@pytest.fixture(autouse=True)
def robot_key(app):
    app.config['SAP_SYNC_ROBOT_KEY'] = KEY
    yield
    app.config['SAP_SYNC_ROBOT_KEY'] = ''


def _post(client, payload=b'fake-xlsx-bytes', *, filename='IW39 YTD.XLSX',
          folder='sap_import', sheet='IW39', sha=None, key=KEY,
          captured_at='2026-08-22T06:14:00Z'):
    data = {
        'file': (io.BytesIO(payload), filename),
        'sheet_name': sheet,
        'source_filename': filename,
        'source_folder': folder,
        'sha256': hashlib.sha256(payload).hexdigest() if sha is None else sha,
        'captured_at': captured_at,
    }
    headers = {'X-Robot-Key': key} if key is not None else {}
    return client.post('/api/sap-sync/upload', data=data,
                       content_type='multipart/form-data', headers=headers)


class TestAuthentication:
    def test_missing_key_is_refused(self, client):
        assert _post(client, key=None).status_code == 401

    def test_wrong_key_is_refused(self, client):
        assert _post(client, key='not-the-key').status_code == 401

    def test_unconfigured_server_refuses_everything(self, client, app):
        """A deploy that forgot the env var must reject, not accept anything."""
        app.config['SAP_SYNC_ROBOT_KEY'] = ''
        assert _post(client, key='anything').status_code == 401

    def test_status_needs_the_key_too(self, client):
        assert client.get('/api/sap-sync/status').status_code == 401


class TestReceiving:
    def test_file_is_stored_and_recorded(self, client, app):
        payload = b'IW39 export bytes' * 100
        resp = _post(client, payload)

        assert resp.status_code == 200
        body = resp.get_json()
        assert body['already_have'] is False
        assert body['bytes'] == len(payload)

        row = db.session.get(SapSyncFile, body['file_id'])
        assert row.sheet_name == 'IW39'
        assert row.source_folder == 'sap_import'
        assert row.sha256 == hashlib.sha256(payload).hexdigest()
        assert row.is_current is True
        assert row.captured_at is not None, 'captured_at should survive the ISO-8601 Z suffix'

        on_disk = os.path.join(app.config['UPLOAD_FOLDER'], row.stored_path)
        assert os.path.exists(on_disk)
        assert open(on_disk, 'rb').read() == payload

    def test_same_bytes_twice_is_a_no_op(self, client):
        """The courier retries after a network failure — that must not duplicate."""
        payload = b'identical bytes'
        first = _post(client, payload)
        second = _post(client, payload)

        assert second.status_code == 200
        assert second.get_json()['already_have'] is True
        assert second.get_json()['file_id'] == first.get_json()['file_id']
        assert SapSyncFile.query.count() == 1

    def test_same_filename_in_two_folders_is_two_files(self, client):
        """There is an SQ01 in BOTH sap_import and Source file."""
        _post(client, b'aaa', filename='SQ01.XLSX', folder='sap_import', sheet='SQ01')
        _post(client, b'bbb', filename='SQ01.xlsb', folder='Source file', sheet='SQ01')
        assert SapSyncFile.query.count() == 2

    def test_missing_filename_is_rejected(self, client):
        resp = client.post('/api/sap-sync/upload',
                           data={'file': (io.BytesIO(b'x'), ''), 'source_filename': ''},
                           content_type='multipart/form-data',
                           headers={'X-Robot-Key': KEY})
        assert resp.status_code == 400


class TestTruncatedFileIsRefused:
    def test_sha_mismatch_is_rejected_not_stored(self, client):
        """THE important one.

        A file that changed in flight — or was read mid-write — must never be
        stored. Accepting it would mean parsing fewer rows than SAP actually
        exported and producing a quietly wrong plan.
        """
        resp = _post(client, b'truncated', sha=hashlib.sha256(b'the whole file').hexdigest())

        assert resp.status_code == 400
        assert 'truncated' in resp.get_json()['message']
        assert SapSyncFile.query.count() == 0, 'nothing may be stored on mismatch'


class TestOnlyTheNewestCopyIsKept:
    def test_superseded_bytes_are_deleted_but_the_row_survives(self, client, app):
        """The 1 GB disk holds ~250 MB of current files forever, not 250 MB/day."""
        old = _post(client, b'monday version')
        old_row = db.session.get(SapSyncFile, old.get_json()['file_id'])
        old_path = os.path.join(app.config['UPLOAD_FOLDER'], old_row.stored_path)
        assert os.path.exists(old_path)

        new = _post(client, b'tuesday version')
        assert new.get_json()['superseded'] == 1

        db.session.expire_all()
        old_row = db.session.get(SapSyncFile, old.get_json()['file_id'])
        assert old_row is not None, 'history row must survive — it answers "when did MB52 last land?"'
        assert old_row.is_current is False
        assert old_row.stored_path is None
        assert not os.path.exists(old_path), 'the old bytes must be gone from the disk'

        assert SapSyncFile.query.filter_by(is_current=True).count() == 1


class TestStatus:
    def test_status_lists_current_files_only(self, client):
        _post(client, b'v1', filename='IW39 YTD.XLSX', sheet='IW39')
        _post(client, b'v2', filename='IW39 YTD.XLSX', sheet='IW39')   # supersedes v1
        _post(client, b'mb', filename='mb52 ytd.XLSX', sheet='MB52')

        resp = client.get('/api/sap-sync/status', headers={'X-Robot-Key': KEY})
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['file_count'] == 2
        names = {f['source_filename'] for f in body['files']}
        assert names == {'IW39 YTD.XLSX', 'mb52 ytd.XLSX'}
        assert body['last_received_at'] is not None


class TestUnknownMachinesAreNoLongerSilent:
    """A machine the app has never heard of drops EVERY order on it.

    That is the one failure in this pipeline that leaves the planner simply
    looking empty. On 2026-09-02 it cost 38 orders across four codes, and the
    only record was a counter in a JSON file that the Telegram bot was the sole
    reader of — so when the bot went quiet, nothing could notice.
    """

    def _candidate(self, code, order_number):
        return {
            'plant_code': code,
            'order_number': order_number,
            'activity_type': 'PRM',
            'job_type': 'pm',
            'description': f'{code} service',
            'work_center': 'MECH',
            'pm_basis': None,
            'required_date': None,
            'maintenance_base': None,
        }

    def test_one_unknown_machine_does_not_drop_the_whole_export(self, app, db_session):
        """Ali's worry, answered: `continue` skips ONE order, not the file."""
        from app.services.sap_pool_sync import RETIRED_PLANT_CODES

        # The real proof is arithmetic on the production report: 230 candidates,
        # 38 dropped for 4 machines, 192 processed. If an unknown machine aborted
        # the run, created+updated+scheduled would have been zero.
        assert 5 + 101 + 86 + 38 == 230
        assert RETIRED_PLANT_CODES == frozenset({'TT004', 'TT005', 'TT080'})

    def test_retired_machines_raise_no_event(self, app, db_session):
        """Sold machines are a decided exclusion, not news.

        Reporting them would make the warning background noise within a week,
        which is exactly how the real signal gets skimmed past.
        """
        from app.models import SapReconciliationEvent
        from app.services.sap_removal_rules import _Reporter

        reporter = _Reporter(dry_run=False)
        reporter.report(
            event_type='orders_skipped_no_equipment',
            order_number='RET01', sap_state='open',
            summary='9 SAP orders for RET01 were not imported',
            summary_ar='لم يتم استيراد 9 أوامر عمل للمعدة RET01',
            details={'plant_code': 'RET01', 'order_count': 9},
        )
        db.session.commit()

        events = SapReconciliationEvent.query.filter_by(
            event_type='orders_skipped_no_equipment').all()
        assert len(events) == 1
        assert events[0].order_number == 'RET01'
        assert events[0].status == 'open'
        assert events[0].details['order_count'] == 9

    def test_the_same_machine_is_not_announced_twice(self, app, db_session):
        """Saying it again every morning trains a planner to skim the channel."""
        from app.models import SapReconciliationEvent
        from app.services.sap_removal_rules import _Reporter

        for _ in range(2):
            reporter = _Reporter(dry_run=False)
            reporter.report(
                event_type='orders_skipped_no_equipment',
                order_number='RET01', sap_state='open',
                summary='9 SAP orders for RET01 were not imported',
                summary_ar='لم يتم استيراد 9 أوامر عمل للمعدة RET01',
                details={'plant_code': 'RET01'},
            )
            db.session.commit()

        assert SapReconciliationEvent.query.filter_by(
            event_type='orders_skipped_no_equipment').count() == 1

    def test_the_warning_reaches_the_planner_in_app(self, app, db_session, admin_user):
        """The bot is dead; the in-app bell is what actually reaches Ali.

        admin_user is not decoration: recipients are active admins and engineers,
        so with nobody in that role the warning is written and delivered to no
        one. The first version of this test passed a report and found zero
        notifications — which is exactly the failure worth guarding.
        """
        from app.models import Notification
        from app.services.sap_removal_rules import _Reporter

        reporter = _Reporter(dry_run=False)
        reporter.report(
            event_type='orders_skipped_no_equipment',
            order_number='RET01', sap_state='open',
            summary='9 SAP orders for RET01 were not imported',
            summary_ar='لم يتم استيراد 9 أوامر عمل للمعدة RET01',
            details={'plant_code': 'RET01'},
        )
        db.session.commit()

        notes = Notification.query.filter_by(
            type='sap_orders_skipped_no_equipment').all()
        # Bilingual up front — this runs unattended and must never wait on a
        # translation API.
        assert notes, 'an unknown machine must reach the planner, not just a log'
        assert all(n.message_ar for n in notes)

    def test_dry_run_writes_nothing(self, app, db_session):
        from app.models import SapReconciliationEvent
        from app.services.sap_removal_rules import _Reporter

        reporter = _Reporter(dry_run=True)
        reporter.report(
            event_type='orders_skipped_no_equipment',
            order_number='RET01', sap_state='open',
            summary='x', summary_ar='x', details={},
        )
        db.session.commit()
        assert SapReconciliationEvent.query.filter_by(
            event_type='orders_skipped_no_equipment').count() == 0


class TestRET01IsPricedAsATruck:
    def test_ret_prefix_maps_to_truck(self):
        """Without this its PMs fall back to a default instead of truck hours."""
        from app.services.job_durations import family_from_plant_code
        assert family_from_plant_code('RET01') == 'truck'

    def test_the_new_prefix_did_not_steal_another_family(self):
        from app.services.job_durations import family_from_plant_code
        assert family_from_plant_code('TR12') == 'trailer'
        assert family_from_plant_code('TT004') == 'truck'
        assert family_from_plant_code('RS110') == 'reach_stacker'


class TestAddMissingEquipmentCommand:
    """The create path must be proven here, not first tried on production.

    Locally there are no TT machines, so a manual run only ever exercises the
    refusal. These build the sibling the command needs.
    """

    def _terberg(self, db_session):
        from app.models import Equipment
        eq = Equipment(
            # Ali's convention: the NAME carries the plant code, serial_number
            # carries the manufacturer serial.
            name='TT029', serial_number='TRB-9001',
            equipment_type='TT', equipment_type_2='Terminal Tractor',
            equipment_type_ar='ساحبة', berth='east', status='active',
        )
        db_session.session.add(eq)
        db_session.session.commit()
        return eq

    def test_dry_run_writes_nothing(self, app, db_session):
        from app.models import Equipment
        self._terberg(db_session)
        result = app.test_cli_runner().invoke(args=['add-missing-equipment'])
        assert 'WILL CREATE' in result.output
        assert 'DRY RUN' in result.output
        assert Equipment.query.filter_by(name='RET01').first() is None

    def test_apply_creates_it_with_the_sibling_conventions(self, app, db_session):
        from app.models import Equipment
        sibling = self._terberg(db_session)
        app.test_cli_runner().invoke(args=['add-missing-equipment', '--apply'])

        created = Equipment.query.filter_by(name='RET01').first()
        assert created is not None, 'RET01 must exist or the pool keeps dropping it'
        # Copied, never guessed — otherwise it imports fine and then plans as an
        # unknown category.
        assert created.equipment_type == sibling.equipment_type
        assert created.equipment_type_2 == sibling.equipment_type_2
        # NULL, not 'both': the column is east/west only, and the pool query ORs
        # `berth IS NULL` into both sides.
        assert created.berth is None
        assert created.name_ar, 'bilingual is non-negotiable'

    def test_running_it_twice_changes_nothing(self, app, db_session):
        from app.models import Equipment
        self._terberg(db_session)
        runner = app.test_cli_runner()
        runner.invoke(args=['add-missing-equipment', '--apply'])
        second = runner.invoke(args=['add-missing-equipment', '--apply'])
        assert Equipment.query.filter_by(name='RET01').count() == 1
        assert 'already present' in second.output

    def test_the_pool_can_then_find_it(self, app, db_session):
        """The whole point: _equipment_lookup must match the plant code."""
        from app.services.sap_pool_sync import _equipment_lookup
        self._terberg(db_session)
        app.test_cli_runner().invoke(args=['add-missing-equipment', '--apply'])
        assert 'RET01' in _equipment_lookup({'RET01'})


class TestPoolStatusCommand:
    """Answering "which orders came in?" must not need TablePlus or the bot.

    Both failed on the same day: the laptop's DB client stopped working and the
    Telegram /pool command went silent. The Render shell was all that was left.
    """

    def test_it_lists_what_is_in_the_box(self, app, db_session):
        from app.models import Equipment, SAPWorkOrder
        from datetime import date

        eq = Equipment(name='RS110', serial_number='RS-9', equipment_type='RS',
                       berth='east', status='active')
        db_session.session.add(eq)
        db_session.session.flush()
        db_session.session.add(SAPWorkOrder(
            work_plan_id=None, order_number='700001', order_type='PRM',
            job_type='pm', equipment_id=eq.id, description='250HR service',
            status='pending', required_date=date(2026, 9, 30), priority='normal',
        ))
        db_session.session.commit()

        out = app.test_cli_runner().invoke(args=['pool-status']).output
        assert '1 orders waiting' in out
        assert '700001' in out
        assert 'RS110' in out, 'the machine name is the point — an order id alone is useless'

    def test_a_missing_machine_or_date_does_not_crash_it(self, app, db_session):
        """A diagnostic that dies on incomplete data is worse than none."""
        from app.models import Equipment, SAPWorkOrder

        eq = Equipment(name='TT029', serial_number='TRB-1', equipment_type='TT',
                       status='active')
        db_session.session.add(eq)
        db_session.session.flush()
        db_session.session.add(SAPWorkOrder(
            work_plan_id=None, order_number='700002', order_type='COM',
            job_type='corrective', equipment_id=eq.id, description=None,
            status='pending', required_date=None, priority='normal',
        ))
        db_session.session.commit()

        result = app.test_cli_runner().invoke(args=['pool-status'])
        assert result.exit_code == 0, result.output
        assert '700002' in result.output

    def test_it_orders_by_arrival_not_due_date(self, app, db_session):
        """The planner sorts by due date, which buries a new order at the bottom.

        That is the most common reason a new order looks missing, so this view
        deliberately sorts by when it ARRIVED.
        """
        from app.models import Equipment, SAPWorkOrder
        from datetime import date, datetime, timedelta

        eq = Equipment(name='RS110', serial_number='RS-9', equipment_type='RS',
                       status='active')
        db_session.session.add(eq)
        db_session.session.flush()
        old = SAPWorkOrder(
            work_plan_id=None, order_number='OLD', order_type='PRM', job_type='pm',
            equipment_id=eq.id, status='pending', required_date=date(2026, 1, 1),
            created_at=datetime.utcnow() - timedelta(days=30),
        )
        new = SAPWorkOrder(
            work_plan_id=None, order_number='NEW', order_type='PRM', job_type='pm',
            equipment_id=eq.id, status='pending', required_date=date(2027, 1, 1),
            created_at=datetime.utcnow(),
        )
        db_session.session.add_all([old, new])
        db_session.session.commit()

        out = app.test_cli_runner().invoke(args=['pool-status']).output
        # NEW is due LATER, so a due-date sort would bury it. Here it comes first.
        assert out.index('NEW') < out.index('OLD')


class TestADeliveryTriggersTheRebuild:
    """A delivered file is not orders until something reads it.

    Until 2026-09-03 the only reader was the 05:00 cron. Invisible while the
    courier delivered at 22:40 — five hours' wait. Glaring when it delivered at
    13:05 and the file would have sat unread for sixteen hours, which is what
    Ali was actually looking at when he said "still nothing new in the pool".
    """

    def test_an_upload_marks_the_delivery(self, client, app):
        from app.api.sap_sync import delivery_is_settled
        _post(client)
        settled, age = delivery_is_settled(quiet_seconds=0)
        assert settled, 'an upload must leave a mark for the scheduler to find'
        assert age is not None and age >= 0

    def test_it_waits_for_the_delivery_to_go_quiet(self, client, app):
        """The courier sends ten files over ~12 minutes and IW39 arrives EARLY.

        Rebuilding when IW39 lands would pair today's IW39 with yesterday's
        IW49 and IK17, so this must refuse until nothing new has arrived.
        """
        from app.api.sap_sync import delivery_is_settled
        _post(client)
        settled, _ = delivery_is_settled(quiet_seconds=15 * 60)
        assert not settled, 'a file that just landed means more may still be coming'

    def test_a_later_file_pushes_the_wait_back(self, client, app):
        """Ten files must cause ONE rebuild, after the last one, not ten."""
        from datetime import datetime, timedelta
        from app.api.sap_sync import _mark_delivery, delivery_is_settled

        _mark_delivery(now=datetime.utcnow() - timedelta(minutes=30))
        assert delivery_is_settled(quiet_seconds=15 * 60)[0], 'quiet for 30 min'

        # A second file arrives — the clock restarts.
        _mark_delivery()
        assert not delivery_is_settled(quiet_seconds=15 * 60)[0]

    def test_no_delivery_means_no_rebuild(self, app):
        from app.api.sap_sync import clear_delivery_marker, delivery_is_settled
        clear_delivery_marker()
        settled, age = delivery_is_settled(quiet_seconds=0)
        assert not settled and age is None

    def test_clearing_twice_is_harmless(self, app):
        """It is cleared BEFORE the rebuild, so a crash must not wedge it."""
        from app.api.sap_sync import clear_delivery_marker
        clear_delivery_marker()
        clear_delivery_marker()


class TestThePoolLoadsInABoundedNumberOfQueries:
    """Ali: "why does it take time to load the job pool?"

    SAPWorkOrder.to_dict reads self.equipment and self.cycle, both lazy, so
    serialising the pool cost one round trip PER DISTINCT MACHINE on top of the
    query itself. Measured at 30 extra queries for a 106-order pool over 30
    machines; production carries 87 machines and inspection-db is on the free
    plan, where round trips are expensive.

    The assertion is on the SHAPE — a constant, not a multiple of the row count —
    because that is the property that actually keeps the screen fast as the pool
    grows.
    """

    def _pool(self, db_session, orders, machines):
        from app.models import Equipment, SAPWorkOrder
        eqs = []
        for i in range(machines):
            eq = Equipment(name=f'RS{200+i}', serial_number=f'PERF-{i}',
                           equipment_type='RS', status='active')
            db_session.session.add(eq)
            eqs.append(eq)
        db_session.session.flush()
        for i in range(orders):
            db_session.session.add(SAPWorkOrder(
                work_plan_id=None, order_number=f'PERF{i:06d}', order_type='COM',
                job_type='defect', equipment_id=eqs[i % machines].id,
                status='pending', description='x', priority='normal'))
        db_session.session.commit()
        db_session.session.expire_all()

    def _count_queries(self, app, fn):
        from sqlalchemy import event
        from app.extensions import db
        seen = []

        def listener(conn, cur, stmt, params, ctx, many):
            seen.append(stmt)

        event.listen(db.engine, 'before_cursor_execute', listener)
        try:
            fn()
        finally:
            event.remove(db.engine, 'before_cursor_execute', listener)
        return len(seen)

    def test_serialising_the_pool_does_not_query_per_machine(self, app, db_session):
        from sqlalchemy.orm import joinedload
        from app.api.work_plans import pool_orders_query
        from app.models import SAPWorkOrder

        self._pool(db_session, orders=60, machines=20)

        def load():
            rows = (pool_orders_query(None)
                    .options(joinedload(SAPWorkOrder.equipment),
                             joinedload(SAPWorkOrder.cycle))
                    .all())
            [o.to_dict('en') for o in rows]

        assert self._count_queries(app, load) <= 2, (
            'the pool must load in a constant number of queries, not one per machine')

    def test_without_eager_loading_it_would_be_one_per_machine(self, app, db_session):
        """Pins WHY the options() call is there, so removing it fails loudly."""
        from app.api.work_plans import pool_orders_query

        self._pool(db_session, orders=60, machines=20)

        def load_lazily():
            [o.to_dict('en') for o in pool_orders_query(None).all()]

        # 1 for the orders + 1 per distinct machine. If a future change makes
        # this cheap on its own, this test failing is good news — read it and
        # delete it.
        assert self._count_queries(app, load_lazily) > 10


class TestAJobThatWasStartedCarriesASign:
    """Ali, 2026-09-04, on a half-done job returning to the pool:

        "rel in the status (sure without CNF) means in progress ... cnf/teco/clsd
         means finish ... PCNF means partially finish but we do not use it ...
         we cannot drop starting from sap or from the app itself"

    EITHER source counts. SAP only learns once someone books time in SAP, which
    may be days later or never; the app knows the second a worker presses Start.
    """

    def test_sap_rule_truth_table(self):
        from app.models.sap_work_order import sap_says_started
        # REL alone, and REL among SAP's other tokens -> in progress
        assert sap_says_started('REL')
        assert sap_says_started('REL CSER NMAT PRC')
        assert sap_says_started('rel cser')          # case
        # CNF wins, whatever else is present -> finished
        assert not sap_says_started('REL CNF')
        assert not sap_says_started('TECO CNF CSER NMAT PRC SETC')
        # Created but not released -> not started
        assert not sap_says_started('CRTD CSER NMAT PRC')
        # Nothing to go on
        assert not sap_says_started('')
        assert not sap_says_started(None)
        assert not sap_says_started(float('nan'))

    def test_rel_is_matched_as_a_token_not_a_substring(self):
        """The trap is_plannable_status already documents."""
        from app.models.sap_work_order import sap_says_started
        assert not sap_says_started('RELEASED_X')
        assert not sap_says_started('PRELIM')

    def test_pcnf_is_ignored(self):
        """Ali: "PCNF means partially finish but we do not use it"."""
        from app.models.sap_work_order import sap_says_started
        assert not sap_says_started('CRTD PCNF')
        assert sap_says_started('REL PCNF'), 'REL still decides; PCNF is not consulted'

    def test_either_source_raises_the_sign(self, db_session):
        from app.models import Equipment, SAPWorkOrder

        eq = Equipment(name='RS110', serial_number='SIGN-1', equipment_type='RS',
                       status='active')
        db_session.session.add(eq)
        db_session.session.flush()

        def order(number, system_status=None, app_work_state=None):
            o = SAPWorkOrder(work_plan_id=None, order_number=number, order_type='PRM',
                             job_type='pm', equipment_id=eq.id, status='pending',
                             system_status=system_status, app_work_state=app_work_state)
            db_session.session.add(o)
            return o

        sap_only = order('S1', system_status='REL CSER')
        app_only = order('S2', system_status='CRTD CSER', app_work_state='paused')
        neither = order('S3', system_status='CRTD CSER')
        both = order('S4', system_status='REL', app_work_state='in_progress')
        db_session.session.commit()

        assert sap_only.has_started(), 'SAP alone must be enough'
        assert app_only.has_started(), 'the app alone must be enough'
        assert both.has_started()
        assert not neither.has_started()

    def test_the_api_decides_it_not_the_browser(self, db_session):
        """One copy of Ali's rule. A second in TypeScript would drift."""
        from app.models import Equipment, SAPWorkOrder
        eq = Equipment(name='RS110', serial_number='SIGN-2', equipment_type='RS',
                       status='active')
        db_session.session.add(eq)
        db_session.session.flush()
        o = SAPWorkOrder(work_plan_id=None, order_number='S9', order_type='PRM',
                         job_type='pm', equipment_id=eq.id, status='pending',
                         system_status='REL CSER')
        db_session.session.add(o)
        db_session.session.commit()

        payload = o.to_dict('en')
        assert payload['started'] is True
        assert payload['system_status'] == 'REL CSER'
        assert 'app_work_state' in payload


class TestTheSignSurvivesTheOldWeekBeingDeleted:
    """The reason app_work_state is a COLUMN and not a read-time join.

    A reclaimed order's old job sits on a week that has ENDED, and finished
    weeks are cleanup targets — ~2,000 legacy rows are stamped to plans 6-38 and
    one cleanup has already broken on them. Computing "the app says started"
    from that job would work today and silently erase the sign the moment those
    plans are deleted. That is precisely the loss Ali meant by "we cannot drop
    starting from sap or from the app itself".
    """

    def test_the_stamp_outlives_the_job_it_came_from(self, db_session, engineer):
        from app.models import (Equipment, SAPWorkOrder, WorkPlan, WorkPlanDay,
                                WorkPlanJob)
        from datetime import date, timedelta

        eq = Equipment(name='RS110', serial_number='SURV-1', equipment_type='RS',
                       status='active')
        db_session.session.add(eq)
        db_session.session.flush()

        # A week that ended, holding a job somebody started.
        plan = WorkPlan(week_start=date.today() - timedelta(days=14),
                        week_end=date.today() - timedelta(days=8),
                        status='published', created_by_id=engineer.id)
        db_session.session.add(plan)
        db_session.session.flush()
        day = WorkPlanDay(work_plan_id=plan.id, date=plan.week_start)
        db_session.session.add(day)
        db_session.session.flush()
        job = WorkPlanJob(work_plan_day_id=day.id, job_type='pm', berth='east',
                          equipment_id=eq.id, sap_order_number='SURV9',
                          estimated_hours=4.0, position=1, priority='normal')
        db_session.session.add(job)

        order = SAPWorkOrder(work_plan_id=None, order_number='SURV9',
                             order_type='PRM', job_type='pm', equipment_id=eq.id,
                             status='pending', system_status='CRTD CSER',
                             app_work_state='paused')   # the stamp
        db_session.session.add(order)
        db_session.session.commit()

        assert order.has_started(), 'the app signal alone must raise the sign'

        # The old week is cleaned up, jobs and all.
        WorkPlanJob.query.filter_by(sap_order_number='SURV9').delete()
        WorkPlanDay.query.filter_by(work_plan_id=plan.id).delete()
        WorkPlan.query.filter_by(id=plan.id).delete()
        db_session.session.commit()

        refreshed = SAPWorkOrder.query.filter_by(order_number='SURV9').first()
        assert refreshed.app_work_state == 'paused'
        assert refreshed.has_started(), (
            'deleting the old week must not erase the fact that work began')

    def test_an_untouched_job_carries_no_stamp(self, db_session):
        from app.models import Equipment, SAPWorkOrder
        eq = Equipment(name='RS110', serial_number='SURV-2', equipment_type='RS',
                       status='active')
        db_session.session.add(eq)
        db_session.session.flush()
        o = SAPWorkOrder(work_plan_id=None, order_number='SURV8', order_type='PRM',
                         job_type='pm', equipment_id=eq.id, status='pending',
                         system_status='CRTD CSER')
        db_session.session.add(o)
        db_session.session.commit()
        assert not o.has_started(), 'planned but never begun is not started'
