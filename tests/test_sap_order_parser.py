"""
Turning SAP exports into planning candidates, and Ali's PM priority rules.

Every rule here exists because the obvious alternative was verified wrong against
his real 19,283-row IW39 export. The comments in the service name the specific
trap; these tests stop each one coming back.
"""

import io

import pandas as pd
import pytest

from app.services.sap_order_parser import (
    calendar_pm_priority,
    extract_plant_code,
    build_meter_index,
    hourly_pm_priority,
    corrective_priority,
    hours_run_since,
    mentions_safety_part,
    is_plannable_status,
    load_maintenance_plan_types,
    parse_operation_hours,
)


class TestPlannableStatus:
    """Ali's rule: CRTD or REL present, and CLSD/TECO/CNF absent."""

    @pytest.mark.parametrize('status', [
        'CRTD CSER NMAT PRC',
        'REL  NMAT PRC  SETC',
        'REL  GMPS MACM PRC  SETC',
        'CRTD',
    ])
    def test_created_or_released_may_be_planned(self, status):
        assert is_plannable_status(status) is True

    @pytest.mark.parametrize('status', [
        'TECO CNF CSER NMAT PRC  SETC',
        'CLSD CNF CSER NMAT PRC  SETC',
    ])
    def test_finished_orders_are_excluded(self, status):
        assert is_plannable_status(status) is False

    def test_confirmed_but_not_teco_is_still_excluded(self):
        """The reason CNF is checked in its own right.

        An order can be fully confirmed before it is technically completed. A
        rule of merely "not TECO and not CLSD" lets that through — and the work
        is already done, so planning it would send a crew to a finished job.
        """
        assert is_plannable_status('REL CNF NMAT PRC') is False

    def test_tokens_are_matched_whole_not_as_substrings(self):
        assert is_plannable_status('NMAT PRC') is False, "'PRC' must not satisfy anything"
        assert is_plannable_status('PRECRTD') is False, "'CRTD' must not match inside a word"

    @pytest.mark.parametrize('status', [None, '', float('nan')])
    def test_missing_status_is_not_plannable(self, status):
        assert is_plannable_status(status) is False


class TestEquipmentCodeFromFunctionalLocation:
    """The `Equipment` column is empty on 74% of rows and otherwise holds SAP's
    internal id. The real code is inside `Functional Location`."""

    @pytest.mark.parametrize('location,expected', [
        ('3700-EQ-QC_-QC007', 'QC007'),
        ('3700-EQ-TT_-TT005-STRC-WHL', 'TT005'),
        ('3700-EQ-RTG-RTG09-POWS-PEN', 'RTG09'),
        ('3700-EQ-FL_-FL328-BRAK', 'FL328'),
        ('3700-EQ-ECH-ECH02', 'ECH02'),
    ])
    def test_plant_code_is_extracted(self, location, expected):
        assert extract_plant_code(location) == expected

    def test_unrecognised_shape_returns_none_rather_than_guessing(self):
        assert extract_plant_code('NOT-A-LOCATION') is None
        assert extract_plant_code('') is None
        assert extract_plant_code(None) is None


class TestOperationHours:
    """`Unit for work` mixes H, HR and MIN — 28% of the 56,131 real operation
    rows are MINUTES. Summing blindly turns a 30-minute job into 30 hours."""

    def _iw49(self, rows):
        frame = pd.DataFrame(rows, columns=['Order', 'Work', 'Unit for work'])
        buffer = io.BytesIO()
        frame.to_excel(buffer, index=False)
        return buffer.getvalue()

    def test_minutes_are_converted_not_summed_as_hours(self):
        hours, report = parse_operation_hours(self._iw49([
            ['700000000001', '30', 'MIN'],
            ['700000000001', '30', 'MIN'],
        ]))
        assert hours['700000000001'] == pytest.approx(1.0), '60 minutes is one hour, not 60'
        assert report['minutes'] == 2

    def test_hour_units_pass_through(self):
        hours, _ = parse_operation_hours(self._iw49([
            ['700000000002', '4', 'H'],
            ['700000000002', '2', 'HR'],
        ]))
        assert hours['700000000002'] == pytest.approx(6.0)

    def test_operations_are_summed_per_order(self):
        """Real exports average 2.56 operation rows per order."""
        hours, _ = parse_operation_hours(self._iw49([
            ['700000000003', '60', 'MIN'],
            ['700000000003', '2', 'H'],
            ['700000000004', '1', 'H'],
        ]))
        assert hours['700000000003'] == pytest.approx(3.0)
        assert hours['700000000004'] == pytest.approx(1.0)

    def test_blank_unit_is_assumed_hours_and_counted(self):
        """323 real rows have no unit. Assume the majority unit, but say so."""
        hours, report = parse_operation_hours(self._iw49([['700000000005', '3', None]]))
        assert hours['700000000005'] == pytest.approx(3.0)
        assert report['unitless'] == 1


class TestCalendarPmPriority:
    """Ali's rule, 2026-08-22. Two signals, worst one wins."""

    @pytest.mark.parametrize('age,expected', [
        (0, 'normal'), (5, 'normal'),
        (6, 'high'), (10, 'high'),
        (11, 'urgent'), (242, 'urgent'),
    ])
    def test_order_age_thresholds(self, age, expected):
        assert calendar_pm_priority(age, days_since_last_pm=1) == expected

    def test_two_months_without_the_service_overrides_a_fresh_order(self):
        """THE reason the second signal exists.

        Real case: TT031 "Inspection AC System" — order raised 7 days ago, so by
        age alone it is merely 'high'. But that service last completed 376 days
        ago. Age is not the whole story and this is where it lies.
        """
        assert calendar_pm_priority(7, days_since_last_pm=376) == 'urgent'
        assert calendar_pm_priority(7, days_since_last_pm=1) == 'high', 'sanity: age alone'

    def test_sixty_days_is_the_boundary(self):
        assert calendar_pm_priority(0, days_since_last_pm=60) == 'normal'
        assert calendar_pm_priority(0, days_since_last_pm=61) == 'urgent'

    def test_no_history_falls_back_to_age(self):
        """A service never done before must not silently become urgent."""
        assert calendar_pm_priority(3, days_since_last_pm=None) == 'normal'
        assert calendar_pm_priority(20, days_since_last_pm=None) == 'urgent'

    def test_no_dates_at_all_does_not_invent_urgency(self):
        assert calendar_pm_priority(None, None) == 'normal'

    def test_returns_only_values_the_database_accepts(self):
        """The app's CHECK constraint allows low/normal/high/urgent — there is no
        'medium'. Ali's "medium" tier maps onto the existing 'high'."""
        allowed = {'low', 'normal', 'high', 'urgent'}
        for age in (None, 0, 6, 11, 500):
            for since in (None, 0, 60, 400):
                assert calendar_pm_priority(age, since) in allowed


class TestMaintenancePlanClassification:
    """SAP does not carry the plan basis in IW39, and it cannot be derived from
    order rhythm (real calendar plans fire with a CV of 1.10 — no rhythm at all).
    Ali's hand-maintained sheet is the authority."""

    def _workbook(self, sheets):
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
            for name, frame in sheets.items():
                frame.to_excel(writer, sheet_name=name, index=False)
        return buffer.getvalue()

    def test_both_column_spellings_are_accepted(self):
        """The two tabs of the real file disagree: 'M.P' vs 'MaintenancePlan'.
        Ali maintains this by hand — the loader adapts, he does not."""
        raw = self._workbook({
            'Hourly': pd.DataFrame({'M.P': ['2000042905'],
                                    'Functional location': ['3700-EQ-TT_-TT001'],
                                    'Type': ['Hourly']}),
            'Sheet2': pd.DataFrame({'MaintenancePlan': ['2000047772'],
                                    'Functional Location': ['3700-EQ-TT_-TT001-CLCS'],
                                    'Type': ['Calendar']}),
        })
        types = load_maintenance_plan_types(raw)
        assert types == {'2000042905': 'hourly', '2000047772': 'calendar'}

    def test_unknown_type_values_are_ignored_not_guessed(self):
        raw = self._workbook({'S': pd.DataFrame({'M.P': ['1', '2'],
                                                 'Type': ['Hourly', 'something else']})})
        types = load_maintenance_plan_types(raw)
        assert types == {'1': 'hourly'}

    def test_sheet_without_recognisable_columns_is_skipped(self):
        raw = self._workbook({'Notes': pd.DataFrame({'a': [1], 'b': [2]})})
        assert load_maintenance_plan_types(raw) == {}


class TestHourlyPmPriority:
    """Ali's thresholds, 2026-08-22, in his words:

        "how many hours to reach 250hrs — if pass by 20, top urgent; if pass but
         less than 20, urgent; still less than 30 hrs, medium; if still need more
         than 30, normal."

    The interval is always 250 hours between services of the same plan on the
    same machine, regardless of which package (250HR/500HR/2000HR) is named —
    those are nested task lists, not different intervals.
    """

    @pytest.mark.parametrize('hours_run,expected', [
        (345.1, 'urgent'),   # TT082, the one real overdue machine — 95h past
        (271.0, 'urgent'),   # past by more than 20 -> Ali's "top urgent"
        (270.0, 'urgent'),   # exactly 20 past -> still the second tier
        (250.0, 'urgent'),   # exactly due
        (249.0, 'high'),     # 1 hour to go -> Ali's "medium"
        (221.0, 'high'),     # 29 to go -> still medium
        (220.0, 'normal'),   # exactly 30 to go -> normal
        (43.5, 'normal'),    # RS115 as it stands today
        (0.0, 'normal'),
    ])
    def test_thresholds(self, hours_run, expected):
        priority, _ = hourly_pm_priority(hours_run)
        assert priority == expected

    def test_top_urgent_is_distinguished_by_hours_past_due(self):
        """The database has no "top urgent" — it allows low/normal/high/urgent.

        Both top tiers therefore return 'urgent', but hours_past_due preserves
        the ordering so the generator can rank a job 95 hours over ahead of one
        5 hours over instead of treating them as equal.
        """
        top, top_past = hourly_pm_priority(345.1)
        just, just_past = hourly_pm_priority(255.0)
        assert top == just == 'urgent'
        assert top_past > 20 >= just_past
        assert top_past > just_past

    def test_a_replaced_meter_yields_no_priority_rather_than_a_wrong_one(self):
        """TT034 reads 21,877 before its service and 3,920 after — the meter was
        swapped. Subtracting gives -17,957, which is not a negative interval; it
        is an unknown. Guessing here would put a healthy machine at the top or
        bottom of the plan for no reason."""
        assert hourly_pm_priority(-17957.5) == (None, None)
        assert hourly_pm_priority(None) == (None, None)

    def test_hours_past_due_is_positive_only_once_overdue(self):
        assert hourly_pm_priority(250.0)[1] == 0.0
        assert hourly_pm_priority(300.0)[1] == 50.0
        assert hourly_pm_priority(200.0)[1] == -50.0


class TestHoursRunAcrossMeterChanges:
    """A replaced meter is data with a step in it, not missing data.

    Real cases: TT033 read 8,974 then 3,161 on 12 May 2026, and TT034 read
    21,912 then 3,846 the SAME day — two tractors re-metered together. Naive
    last-minus-first gave -5,684 and -17,957 and lost both machines entirely.
    """

    def _index(self, readings):
        return {'TT033': [(pd.Timestamp(d), v) for d, v in readings]}

    def test_forward_movement_is_summed_across_a_replacement(self):
        meters = self._index([
            ('2026-03-01', 8900.0),   # before the service
            ('2026-04-01', 8950.0),   # +50
            ('2026-05-01', 8974.0),   # +24
            ('2026-05-12', 3161.0),   # meter swapped — ignored, not subtracted
            ('2026-06-01', 3200.0),   # +39
        ])
        run = hours_run_since(meters, 'TT033', pd.Timestamp('2026-03-15'))
        assert run == pytest.approx(113.0), '50+24+39, with the swap skipped'

    def test_small_backward_glitches_do_not_swallow_real_hours(self):
        """RS115 reads 30,271 on 7 May then 30,144 on 13 May — a data error, not
        a reset. Straight subtraction silently discarded ~127 genuine hours."""
        meters = {'RS115': [(pd.Timestamp(d), v) for d, v in [
            ('2026-04-01', 30100.0),
            ('2026-05-07', 30271.0),   # +171
            ('2026-05-13', 30144.0),   # glitch backwards — skipped
            ('2026-06-01', 30200.0),   # +56
        ]]}
        assert hours_run_since(meters, 'RS115', pd.Timestamp('2026-04-01')) == pytest.approx(227.0)

    def test_undercount_is_toward_not_yet_due(self):
        """Hours between the last pre-swap reading and the swap are unrecorded and
        lost. That is deliberate: erring low raises no false alarm."""
        meters = self._index([('2026-03-01', 100.0), ('2026-04-01', 900.0),
                              ('2026-04-02', 5.0), ('2026-05-01', 20.0)])
        assert hours_run_since(meters, 'TT033', pd.Timestamp('2026-03-01')) == pytest.approx(815.0)

    def test_no_reading_before_the_service_returns_none(self):
        meters = self._index([('2026-06-01', 100.0)])
        assert hours_run_since(meters, 'TT033', pd.Timestamp('2026-03-15')) is None

    def test_unknown_equipment_returns_none(self):
        assert hours_run_since({}, 'NOPE', pd.Timestamp('2026-01-01')) is None


class TestCorrectivePriority:
    """Six layers, first match wins, then a promote-only safety adjustment.

    Ordering matters and is deliberate: the inspection signals (STOP, critical,
    monitor) outrank SAP's, because an inspector stood in front of the machine
    while SAP's severity fields are either empty (Breakdown, Effect) or diluted
    to meaninglessness (105 of 127 notifications marked "1-Extreme").
    """

    def test_stop_outranks_everything(self):
        """Ali: STOP is the top. A machine that must not run beats a planner's
        decision, a breakdown history and everything else."""
        priority, reason = corrective_priority(
            equipment_assessment='stop', is_released=False,
            breakdowns_30d=0, description='Door lock issue')
        assert priority == 'urgent'
        assert 'STOP' in reason

    def test_layer_order_is_stop_then_critical_then_released_then_breakdowns(self):
        assert corrective_priority(defect_severity='critical')[0] == 'urgent'
        assert corrective_priority(inspection_urgency=3)[0] == 'urgent'
        assert corrective_priority(is_released=True)[0] == 'urgent'
        assert corrective_priority(breakdowns_30d=3)[0] == 'urgent'
        assert corrective_priority(breakdowns_30d=2)[0] == 'normal', 'below the threshold'

    def test_monitor_and_high_severity_are_high(self):
        assert corrective_priority(equipment_assessment='monitor')[0] == 'high'
        assert corrective_priority(defect_severity='high')[0] == 'high'

    def test_cluster_of_faults_is_high(self):
        assert corrective_priority(open_defects_on_equipment=4)[0] == 'high'
        assert corrective_priority(open_defects_on_equipment=3)[0] == 'normal'

    def test_nothing_at_all_is_normal(self):
        assert corrective_priority(description='Cabin cover missing') == ('normal', 'no signal')


class TestSafetyPromotionIsOneWay:
    """The single most important property of the keyword list.

    Missing a word leaves a job where the other signals put it — harmless.
    Demoting one would bury a real brake fault under a broken door handle, which
    is the failure that hurts somebody. So the list can only ever promote.
    """

    def test_a_safety_part_lifts_exactly_one_tier(self):
        assert corrective_priority(description='Steering cylinder leakage')[0] == 'high'
        assert corrective_priority(open_defects_on_equipment=4,
                                   description='Brake-Pedal-Unrelaible')[0] == 'urgent'

    def test_a_non_safety_job_is_never_lowered(self):
        """Real pair from RS115 — both sat at 'high' on the cluster rule. The
        brake job lifts; the cabin cover must NOT drop below where it was."""
        brake, _ = corrective_priority(open_defects_on_equipment=4,
                                       description='Brake-Pedal-Unrelaible')
        cover, _ = corrective_priority(open_defects_on_equipment=4,
                                       description='Cabin cover missing')
        assert brake == 'urgent'
        assert cover == 'high', 'the cluster signal must survive an absent keyword'

    def test_urgent_cannot_be_promoted_past_urgent(self):
        assert corrective_priority(is_released=True,
                                   description='Brake failure')[0] == 'urgent'

    @pytest.mark.parametrize('description,expected', [
        ('Steering Cylinder leaking (PM)', True),
        ('Leak from Brake Plate (PM)', True),
        ('Tire need Replacement (PM)', True),
        ('Air System not working (PM)', True),
        ('Crack in Spreader T-Beam (PM)', True),
        ('Axle suspension Leak', True),
        # Deliberately NOT lifted — 'cylinder' and 'leak' appear on 21 and 29 of
        # the real 130, so including them lifted 56% and stopped meaning anything.
        ('Lifting Cylinder Leak (PM)', False),
        ('Transmission Leaks (PM)', False),
        ('Rear of side glass broken (PM)', False),
        ('Cabin chair suspension Faulty (PM)', True),   # suspension — accepted
        ('Door lock Issue (PM)', False),
    ])
    def test_the_word_list_against_real_descriptions(self, description, expected):
        assert mentions_safety_part(description) is expected

    def test_the_reason_explains_the_ranking(self):
        """Six layers deep, "it just is" would not survive its first argument in
        the yard — so every priority carries why."""
        _, reason = corrective_priority(open_defects_on_equipment=4,
                                        description='Brake plate')
        assert '4 open faults' in reason and 'safety part' in reason

    def test_the_reason_does_not_credit_a_promotion_that_did_not_happen(self):
        """A job already at urgent cannot be promoted, so the reason must not
        claim the keyword contributed. Saying "+ safety part" when it changed
        nothing would make the explanation a lie."""
        _, reason = corrective_priority(breakdowns_30d=6, description='Brake plate')
        assert reason == '6 breakdowns in 30 days'
        assert 'safety' not in reason


class TestPlanningToday:
    """The yard is in Baghdad (UTC+3); the server runs UTC.

    This was a live bug found on 2026-08-23 at 00:36 Baghdad time, when
    test_calendar_pm_overdue_computed_from_date started failing with 19 != 20.
    Between midnight and 03:00 local, utcnow().date() is still YESTERDAY — so the
    planner counted every overdue job one day short and a PM due today read as
    not-yet-due. The same class of bug was fixed in the mobile app in August.
    """

    def test_returns_baghdad_date_not_utc(self):
        from datetime import datetime, timedelta, timezone
        from app.utils.decorators import planning_today

        expected = (datetime.now(timezone.utc) + timedelta(hours=3)).date()
        assert planning_today() == expected

    def test_never_lags_utc(self):
        """Baghdad is ahead of UTC, so the yard's date is never the earlier one."""
        from datetime import datetime, timezone
        from app.utils.decorators import planning_today

        assert planning_today() >= datetime.now(timezone.utc).date()
