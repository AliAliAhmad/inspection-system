"""The team roster the courier has been delivering, unread, since 2026-08-28.

Ali's four rules, 2026-09-04, each with a test below:

  1. "applied as it is the first apply for it"
  2. "what i change in the app should be kept as what my change is"
  3. "the ones change by hand should be marked"
  4. "many employees are not in the app ... just drop them"
"""

import io
from datetime import date

import openpyxl
import pytest


from app.models import User
from app.models.roster import RosterEntry
from app.services.roster_import import SHEET_NAME, apply_roster, parse


def _workbook(people, days=(date(2026, 1, 1), date(2026, 1, 2)), sheet=SHEET_NAME,
              trailing_totals=True):
    """A workbook shaped like the real one, measured from production.

    row 1  Company | Section | Name | SAP ID | Section | Sub | Post |  | January
    row 2                                                              | dates...
    row 4+ data
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet

    header = ['Company', 'Section', 'Name', 'SAP ID', 'Section', 'Sub Section',
              'Post', None, 'January'] + [None] * (len(days) - 1)
    if trailing_totals:
        header += ['Total']
    ws.append(header)

    date_row = [None] * 8 + list(days)
    if trailing_totals:
        # A totals column. Its row-2 cell is NOT a date, which is the only thing
        # that keeps its value out of the roster.
        date_row += [77]
    ws.append(date_row)
    ws.append([None] * len(date_row))          # the repeated date row

    for sap_id, name, codes in people:
        row = ['BGT', 'Eng', name, sap_id, None, None, None, None] + list(codes)
        if trailing_totals:
            row += [14]
        ws.append(row)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture
def worker(db_session):
    user = User(email='roster1@test.com', full_name='Roster One', role='specialist',
                role_id='ROS001', shift='day', sap_id='500000', is_active=True)
    user.set_password('test123')
    db_session.session.add(user)
    db_session.session.commit()
    return user


class TestTheSheetIsReadAsItReallyIs:
    def test_sap_id_is_read_from_column_d_and_dates_from_row_two(self):
        rows, report = parse(_workbook([('500000', 'Roster One', ['D', 'N'])]))
        assert report['people_in_sheet'] == 1
        assert report['date_columns'] == 2, 'the totals column must not count as a date'
        assert rows[0]['sap_id'] == '500000'
        assert rows[0]['days'] == {date(2026, 1, 1): 'day', date(2026, 1, 2): 'night'}

    def test_a_numeric_sap_id_still_matches(self):
        """openpyxl hands 500000 back as 500000.0, which would match nobody —
        and under "just drop them" that silently discards the whole sheet."""
        rows, _ = parse(_workbook([(500000, 'Roster One', ['D', 'D'])]))
        assert rows[0]['sap_id'] == '500000'

    def test_every_code_ali_confirmed(self):
        rows, _ = parse(_workbook(
            [('500000', 'x', ['X', 'PL'])],
            days=(date(2026, 1, 1), date(2026, 1, 2))))
        assert rows[0]['days'][date(2026, 1, 1)] == 'off'
        assert rows[0]['days'][date(2026, 1, 2)] == 'leave'

    def test_an_unknown_code_is_skipped_and_counted(self):
        """Never guessed. Reading a code as 'day' would put a man on shift who
        is at home; skipping only loses capacity. Counted so a new code in the
        sheet is visible rather than silent."""
        rows, report = parse(_workbook([('500000', 'x', ['ZZ', 'D'])]))
        assert date(2026, 1, 1) not in rows[0]['days']
        assert report['unknown_codes'] == {'ZZ': 1}

    def test_a_missing_sheet_is_an_error_not_a_silent_fallback(self):
        """Falling back to wb.active is what works today and breaks the day
        somebody saves the file on a different tab."""
        with pytest.raises(ValueError, match='no sheet named'):
            parse(_workbook([('500000', 'x', ['D', 'D'])], sheet='Something Else'))


class TestAliRule1FirstApplyLandsWhole:
    def test_a_virgin_roster_takes_everything(self, db_session, worker):
        report = apply_roster(_workbook([('500000', 'Roster One', ['D', 'N'])]))
        assert report['created'] == 2
        assert RosterEntry.query.count() == 2
        assert {e.source for e in RosterEntry.query.all()} == {'import'}

    def test_it_replaces_rows_from_the_old_upload_path(self, db_session, worker):
        """Those carry source NULL. Replaceable — which IS the first apply,
        with no special first-run flag needed."""
        db_session.session.add(RosterEntry(user_id=worker.id, date=date(2026, 1, 1),
                                           shift='night', source=None))
        db_session.session.commit()

        apply_roster(_workbook([('500000', 'Roster One', ['D', 'N'])]))
        entry = RosterEntry.query.filter_by(date=date(2026, 1, 1)).one()
        assert entry.shift == 'day'
        assert entry.source == 'import'


class TestAliRule2AndAHandChangeIsKept:
    def test_a_manual_day_is_never_overwritten(self, db_session, worker):
        db_session.session.add(RosterEntry(user_id=worker.id, date=date(2026, 1, 1),
                                           shift='night', source='manual'))
        db_session.session.commit()

        report = apply_roster(_workbook([('500000', 'Roster One', ['D', 'D'])]))

        entry = RosterEntry.query.filter_by(date=date(2026, 1, 1)).one()
        assert entry.shift == 'night', "Ali: keep it as what my change is"
        assert entry.source == 'manual'
        assert report['left_alone_manual'] == 1

    def test_an_approved_swap_is_also_a_persons_decision(self, db_session, worker):
        db_session.session.add(RosterEntry(user_id=worker.id, date=date(2026, 1, 1),
                                           shift='night', source='swap'))
        db_session.session.commit()

        apply_roster(_workbook([('500000', 'Roster One', ['D', 'D'])]))
        assert RosterEntry.query.filter_by(date=date(2026, 1, 1)).one().shift == 'night'

    def test_a_day_the_import_wrote_is_still_refreshed(self, db_session, worker):
        apply_roster(_workbook([('500000', 'Roster One', ['D', 'D'])]))
        report = apply_roster(_workbook([('500000', 'Roster One', ['N', 'D'])]))
        assert report['updated'] == 1
        assert RosterEntry.query.filter_by(date=date(2026, 1, 1)).one().shift == 'night'


class TestAliRule3HandChangesAreMarked:
    def test_the_api_says_which_days_a_person_set(self, db_session, worker):
        db_session.session.add_all([
            RosterEntry(user_id=worker.id, date=date(2026, 1, 1), shift='day',
                        source='import'),
            RosterEntry(user_id=worker.id, date=date(2026, 1, 2), shift='night',
                        source='manual'),
        ])
        db_session.session.commit()

        by_date = {e.date: e.to_dict() for e in RosterEntry.query.all()}
        assert by_date[date(2026, 1, 1)]['changed_by_hand'] is False
        assert by_date[date(2026, 1, 2)]['changed_by_hand'] is True
        assert by_date[date(2026, 1, 2)]['source'] == 'manual'


class TestAliRule4UnknownPeopleAreDropped:
    def test_an_unregistered_sap_id_is_dropped_not_an_error(self, db_session, worker):
        report = apply_roster(_workbook([
            ('500000', 'Roster One', ['D', 'D']),
            ('999999', 'Not In The App', ['D', 'D']),
        ]))
        assert report['matched_people'] == 1
        assert report['dropped_people'] == 1
        assert RosterEntry.query.count() == 2, 'only the known man got days'

    def test_the_dropped_ones_are_named(self, db_session, worker):
        """"Just drop them" is right, but a silent drop of a third of the sheet
        is how people go missing without anyone noticing."""
        report = apply_roster(_workbook([('999999', 'Ghost', ['D', 'D'])]))
        assert '999999' in report['dropped_sap_ids']


class TestDryRunWritesNothing:
    def test_it_reports_without_touching_the_roster(self, db_session, worker):
        report = apply_roster(_workbook([('500000', 'Roster One', ['D', 'N'])]),
                              dry_run=True)
        assert report['created'] == 2
        assert RosterEntry.query.count() == 0


class TestTheOldUploadButtonRespectsTheSameRule:
    """The hole that would have undone rule 2 from a different direction.

    apply_roster protects hand changes, but the manual Upload button on the
    roster screen used a blunt `RosterEntry.query.filter_by(user_id=...).delete()`
    — so one press would have wiped every manual fix and approved swap, however
    careful the automatic import was.
    """

    def _template_sheet(self, sap_id='500000'):
        """The OTHER layout: the template this endpoint has always expected.

        Row 1 = SAP ID, Name, Role, Major ID, then date headers from column 5.
        """
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(['SAP ID', 'Name', 'Role', 'Major ID',
                   date(2026, 1, 1), date(2026, 1, 2)])
        ws.append([sap_id, 'Roster One', 'specialist', 'ROS001', 'D', 'D'])
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    def test_upload_does_not_wipe_a_hand_changed_day(self, client, db_session,
                                                     worker, admin_user):
        from tests.conftest import get_auth_header

        db_session.session.add(RosterEntry(user_id=worker.id, date=date(2026, 1, 1),
                                           shift='night', source='manual'))
        db_session.session.commit()

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        client.post('/api/roster/upload', headers=headers,
                    data={'file': (io.BytesIO(self._template_sheet()),
                                   'roster.xlsx')},
                    content_type='multipart/form-data')

        kept = RosterEntry.query.filter_by(user_id=worker.id,
                                           date=date(2026, 1, 1)).one()
        assert kept.shift == 'night', 'one press of Upload must not undo a hand change'
        assert kept.source == 'manual'

    def test_xlsm_is_accepted(self, client, db_session, worker, admin_user):
        """Ali's real workbook is .xlsm — it was refused at the door."""
        from tests.conftest import get_auth_header
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post('/api/roster/upload', headers=headers,
                           data={'file': (io.BytesIO(self._template_sheet()),
                                          'Engineering 2026_v1.xlsm')},
                           content_type='multipart/form-data')
        assert resp.status_code != 400 or 'supported' not in resp.get_json().get('message', '')
