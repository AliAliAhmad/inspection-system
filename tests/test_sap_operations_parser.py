"""Reading the operations out of IW49 without knowing its column names.

Ali, 2026-09-10: "in SAP there is an operation usually you can see him clear in
the IW49 ... inside a general refurbishment order you can check the spreader,
replace or repair harness, open telescopic chain".

WHY EVERY COLUMN IS OPTIONAL
============================

We do not have a real IW49 export. The only fixture in this repo is synthetic and
carries the three columns `parse_operation_hours` already reads, and SAP layouts
differ between systems and between a user's saved variants.

That would normally be a small risk. Here it is not, because `rows_to_frame`
raises KeyError on a missing column — loudly, on purpose, so a vanished column
cannot silently disable a rule. Putting a GUESSED column name in a required list
would therefore not read as empty. It would take the whole pool sync down on the
first run against a real export.

So: candidates matched case-insensitively, everything optional, and a run that
recognises nothing imports nothing and reports the headers it actually saw.
"""

import io

import pytest

openpyxl = pytest.importorskip('openpyxl')

from app.services.sap_order_parser import (parse_operations, read_iw49_headers,
                                           parse_operation_hours)


def _sheet(header, rows):
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(list(header))
    for row in rows:
        sheet.append(list(row))
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


# Three plausible header spellings. We do not know which Ali's export uses.
LAYOUT_A = ['Order', 'Oper./Activity', 'Opr. short text', 'Work ctr', 'Work', 'Unit for work']
LAYOUT_B = ['Order', 'Operation', 'Operation short text', 'Work Center', 'Work', 'Unit']
LAYOUT_C = ['ORDER', 'ACTIVITY', 'DESCRIPTION', 'WORK CENTRE', 'WORK', 'UN.']


class TestItReadsWhateverSapCalledTheColumns:

    @pytest.mark.parametrize('header', [LAYOUT_A, LAYOUT_B, LAYOUT_C])
    def test_the_operations_come_through(self, header):
        data = _sheet(header, [
            ['700000123456', '0010', 'Check the spreader', 'MECH', '120', 'MIN'],
            ['700000123456', '0020', 'Replace harness', 'ELEC', '3', 'H'],
        ])
        ops, report = parse_operations(data)

        assert report['usable'] is True, report
        assert report['operations'] == 2
        assert list(ops) == ['700000123456']
        first, second = ops['700000123456']
        assert first['operation_number'] == '0010'
        assert first['description'] == 'Check the spreader'
        assert first['work_center'] == 'MECH'
        assert first['planned_hours'] == pytest.approx(2.0), '120 MIN is two hours'
        assert second['work_center'] == 'ELEC'
        assert second['planned_hours'] == pytest.approx(3.0)

    def test_case_and_spacing_do_not_matter(self):
        data = _sheet(['  order  ', 'oper./activity', 'opr. short text'],
                      [['700000123456', '0010', 'Check the spreader']])
        ops, report = parse_operations(data)
        assert report['usable'] is True
        assert ops['700000123456'][0]['operation_number'] == '0010'


class TestAnUnrecognisedExportIsSurvivable:
    """The whole reason every column is optional."""

    def test_no_recognised_columns_imports_nothing_and_says_so(self):
        data = _sheet(['Auftrag', 'Vorgang', 'Kurztext'],
                      [['700000123456', '0010', 'Spreader prüfen']])
        ops, report = parse_operations(data)

        assert ops == {}
        assert report['usable'] is False
        assert 'reason' in report
        # The headers come back so the real names can be added to the candidates.
        assert 'Auftrag' in report['headers']

    def test_it_does_not_raise(self):
        """A KeyError here would take the pool sync down, not just the operations."""
        parse_operations(_sheet(['Nothing', 'Useful'], [['a', 'b']]))
        parse_operations(b'')

    def test_missing_optional_columns_still_import_the_identity(self):
        """No hours and no work centre is still a usable operation list."""
        data = _sheet(['Order', 'Operation'],
                      [['700000123456', '0010'], ['700000123456', '0020']])
        ops, report = parse_operations(data)
        assert report['operations'] == 2
        assert ops['700000123456'][0]['planned_hours'] is None
        assert ops['700000123456'][0]['work_center'] is None


class TestHeaderProbe:
    """`flask sap-operation-headers` uses this to end the guessing."""

    def test_it_reports_what_was_matched_and_what_was_not(self):
        info = read_iw49_headers(_sheet(['Order', 'Operation', 'Mystery'], []))
        assert info['matched']['order'] == 'Order'
        assert info['matched']['operation'] == 'Operation'
        assert 'description' in info['missing']
        assert 'Mystery' in info['headers']


class TestTheOldPathIsUntouched:

    def test_hours_per_order_still_sum_the_same_way(self):
        """parse_operation_hours prices the pool. It must not move."""
        data = _sheet(['Order', 'Work', 'Unit for work'],
                      [['700000123456', '30', 'MIN'],
                       ['700000123456', '30', 'MIN'],
                       ['700000123457', '2', 'H']])
        hours, _ = parse_operation_hours(data)
        assert hours['700000123456'] == pytest.approx(1.0)
        assert hours['700000123457'] == pytest.approx(2.0)
