"""Filters the mobile app relies on, checked from the server side.

2026-09-24 filter audit: several phone screens filtered on something the
server never sent, or sent a filter the server ignored. Each test below pins
one of those contracts so the phone and the API cannot drift apart again.
"""

from datetime import date, datetime, timedelta

import pytest

from app.extensions import db
from app.models import (
    ChecklistTemplate, Defect, FinalAssessment, Inspection, InspectionAssignment,
    InspectionList, MonitorFollowup, SpecialistJob, User, WorkPlan, WorkPlanDay,
)
from tests.conftest import get_auth_header, make_equipment


def _admin(client):
    return get_auth_header(client, 'admin@test.com', 'admin123')


# ── Defects ──────────────────────────────────────────────────────────────────

def _inspection(db_session, eq, technician):
    template = ChecklistTemplate(name='T', equipment_type='centrifugal_pump', version='mf1')
    db_session.session.add(template)
    db_session.session.flush()
    insp = Inspection(equipment_id=eq.id, template_id=template.id,
                      technician_id=technician.id, status='submitted')
    db_session.session.add(insp)
    db_session.session.flush()
    return insp


def _defect(db_session, description, due, status='open', **kw):
    d = Defect(severity='medium', description=description, status=status,
               due_date=due, **kw)
    db_session.session.add(d)
    db_session.session.flush()
    return d


def _descriptions(resp):
    assert resp.status_code == 200, resp.get_json()
    return {d['description'] for d in resp.get_json()['data']}


class TestDefectSlaOverdue:
    """OverdueScreen sends sla_overdue=true; the list used to ignore it."""

    def test_only_past_due_and_unfinished(self, client, admin_user, db_session):
        today = date.today()
        _defect(db_session, 'late open', today - timedelta(days=3))
        _defect(db_session, 'late in progress', today - timedelta(days=1), status='in_progress')
        _defect(db_session, 'late but resolved', today - timedelta(days=5), status='resolved')
        _defect(db_session, 'late but closed', today - timedelta(days=5), status='closed')
        _defect(db_session, 'late false alarm', today - timedelta(days=5), status='false_alarm')
        _defect(db_session, 'due today', today)
        _defect(db_session, 'due next week', today + timedelta(days=7))
        db_session.session.commit()

        got = _descriptions(client.get('/api/defects?sla_overdue=true', headers=_admin(client)))
        assert got == {'late open', 'late in progress'}

    def test_absent_flag_changes_nothing(self, client, admin_user, db_session):
        today = date.today()
        _defect(db_session, 'late', today - timedelta(days=3))
        _defect(db_session, 'future', today + timedelta(days=3))
        db_session.session.commit()
        got = _descriptions(client.get('/api/defects', headers=_admin(client)))
        assert got == {'late', 'future'}

    def test_status_accepts_a_comma_list(self, client, admin_user, db_session):
        today = date.today()
        _defect(db_session, 'a', today, status='open')
        _defect(db_session, 'b', today, status='in_progress')
        _defect(db_session, 'c', today, status='resolved')
        db_session.session.commit()
        got = _descriptions(client.get('/api/defects?status=open,in_progress',
                                       headers=_admin(client)))
        assert got == {'a', 'b'}
        # a single value still means exactly that value
        assert _descriptions(client.get('/api/defects?status=resolved',
                                        headers=_admin(client))) == {'c'}


class TestDefectEquipmentFilter:
    """Field/safety reports have no inspection; their machine is equipment_id_direct.
    An inner join on Inspection dropped every one of them."""

    def test_matches_inspection_and_direct_equipment(self, client, admin_user,
                                                     mech_inspector, db_session):
        pump = make_equipment(db_session, name='Pump A', serial='MF-A')
        other = make_equipment(db_session, name='Pump B', serial='MF-B')
        insp = _inspection(db_session, pump, mech_inspector)
        due = date.today() + timedelta(days=3)
        _defect(db_session, 'from inspection', due, inspection_id=insp.id)
        _defect(db_session, 'field report', due, equipment_id_direct=pump.id,
                report_source='field_report')
        _defect(db_session, 'other machine', due, equipment_id_direct=other.id,
                report_source='field_report')
        db_session.session.commit()

        got = _descriptions(client.get(f'/api/defects?equipment_id={pump.id}',
                                       headers=_admin(client)))
        assert got == {'from inspection', 'field report'}

    def test_composes_with_sla_overdue(self, client, admin_user, db_session):
        pump = make_equipment(db_session, name='Pump C', serial='MF-C')
        _defect(db_session, 'late here', date.today() - timedelta(days=2),
                equipment_id_direct=pump.id)
        _defect(db_session, 'on time here', date.today() + timedelta(days=2),
                equipment_id_direct=pump.id)
        db_session.session.commit()
        got = _descriptions(client.get(
            f'/api/defects?equipment_id={pump.id}&sla_overdue=true', headers=_admin(client)))
        assert got == {'late here'}


# ── Specialist jobs ──────────────────────────────────────────────────────────

class TestSpecialistJobListCarriesCompletedAt:
    """The phone's Completed tab keeps a finished job for a day after
    completed_at. The list payload used to omit it, so the tab was always empty."""

    def test_list_payload_has_completed_at(self, client, admin_user, specialist, db_session):
        d = _defect(db_session, 'x', date.today())
        done_at = datetime.utcnow() - timedelta(hours=2)
        db_session.session.add(SpecialistJob(
            universal_id=901, job_id='SPE001-901', defect_id=d.id,
            specialist_id=specialist.id, assigned_by=admin_user.id,
            status='completed', completed_at=done_at,
        ))
        db_session.session.commit()

        headers = get_auth_header(client, 'spec@test.com', 'test123')
        resp = client.get('/api/jobs', headers=headers)
        assert resp.status_code == 200, resp.get_json()
        rows = resp.get_json()['data']
        assert len(rows) == 1
        assert rows[0]['completed_at'] == done_at.isoformat() + 'Z'

    def test_unfinished_job_reports_none(self, client, admin_user, specialist, db_session):
        d = _defect(db_session, 'y', date.today())
        db_session.session.add(SpecialistJob(
            universal_id=902, job_id='SPE001-902', defect_id=d.id,
            specialist_id=specialist.id, assigned_by=admin_user.id, status='assigned',
        ))
        db_session.session.commit()
        headers = get_auth_header(client, 'spec@test.com', 'test123')
        rows = client.get('/api/jobs', headers=headers).get_json()['data']
        assert rows[0]['completed_at'] is None


# ── Monitor follow-ups ───────────────────────────────────────────────────────

def _followup(db_session, assessment, eq, status):
    f = MonitorFollowup(assessment_id=assessment.id, equipment_id=eq.id,
                        followup_date=date.today() + timedelta(days=2),
                        followup_type='routine_check', location='east', status=status)
    db_session.session.add(f)
    db_session.session.flush()
    return f


class TestMonitorFollowupStatusList:
    """The 'Scheduled' tab covers two statuses; the phone sent only the first."""

    def test_comma_list_returns_both(self, client, admin_user, mech_inspector,
                                     elec_inspector, db_session):
        eq = make_equipment(db_session, name='Crane', serial='MF-CR')
        il = InspectionList(shift='day', target_date=date.today(),
                            status='assigned', total_assets=1)
        db_session.session.add(il)
        db_session.session.flush()
        asg = InspectionAssignment(inspection_list_id=il.id, equipment_id=eq.id,
                                   shift='day', status='assigned',
                                   mechanical_inspector_id=mech_inspector.id,
                                   electrical_inspector_id=elec_inspector.id)
        db_session.session.add(asg)
        db_session.session.flush()
        fa = FinalAssessment(equipment_id=eq.id, inspection_assignment_id=asg.id,
                             mechanical_inspector_id=mech_inspector.id,
                             electrical_inspector_id=elec_inspector.id,
                             mech_verdict='monitor', elec_verdict='monitor')
        fa.evaluate_status()
        db_session.session.add(fa)
        db_session.session.flush()
        a = _followup(db_session, fa, eq, 'scheduled')
        b = _followup(db_session, fa, eq, 'assignment_created')
        c = _followup(db_session, fa, eq, 'completed')
        db_session.session.commit()

        def ids(q):
            resp = client.get(f'/api/monitor-followups?status={q}', headers=_admin(client))
            assert resp.status_code == 200, resp.get_json()
            return {row['id'] for row in resp.get_json()['data']}

        assert ids('scheduled,assignment_created') == {a.id, b.id}
        assert ids('scheduled') == {a.id}
        assert ids('completed') == {c.id}


# ── Work plans ───────────────────────────────────────────────────────────────

class TestWorkPlanListWeekContainment:
    """The web makes Sunday-start weeks; the phone asks for the Monday. An exact
    week_start match found nothing and the phone showed an empty week."""

    def _plan(self, db_session, creator, start):
        wp = WorkPlan(week_start=start, week_end=start + timedelta(days=6),
                      status='draft', created_by_id=creator.id)
        db.session.add(wp)
        db.session.flush()
        for offset in range(7):
            db.session.add(WorkPlanDay(work_plan_id=wp.id, date=start + timedelta(days=offset)))
        db.session.commit()
        return wp

    def test_monday_request_finds_a_sunday_plan(self, client, admin_user, db_session):
        sunday = date(2026, 9, 20)
        wp = self._plan(db_session, admin_user, sunday)
        resp = client.get('/api/work-plans?week_start=2026-09-21&include_days=true',
                          headers=_admin(client))
        assert resp.status_code == 200, resp.get_json()
        plans = resp.get_json()['work_plans']
        assert [p['id'] for p in plans] == [wp.id]
        assert len(plans[0]['days']) == 7

    def test_exact_match_still_wins_and_comes_first(self, client, admin_user, db_session):
        sunday_plan = self._plan(db_session, admin_user, date(2026, 9, 20))
        monday_plan = self._plan(db_session, admin_user, date(2026, 9, 21))
        resp = client.get('/api/work-plans?week_start=2026-09-21', headers=_admin(client))
        ids = [p['id'] for p in resp.get_json()['work_plans']]
        assert ids[0] == monday_plan.id
        assert set(ids) == {monday_plan.id, sunday_plan.id}

    def test_a_date_outside_every_plan_finds_nothing(self, client, admin_user, db_session):
        self._plan(db_session, admin_user, date(2026, 9, 20))
        resp = client.get('/api/work-plans?week_start=2026-10-05', headers=_admin(client))
        assert resp.get_json()['work_plans'] == []

    def test_bad_date_is_refused(self, client, admin_user, db_session):
        resp = client.get('/api/work-plans?week_start=21-09-2026', headers=_admin(client))
        assert resp.status_code == 400


# ── Chat users ───────────────────────────────────────────────────────────────

class TestChatUsersCarryEveryIdentity:
    """The chat search box can only match what the endpoint sends."""

    def test_arabic_name_and_ids_are_sent(self, client, admin_user, db_session):
        u = User(email='ahmed@test.com', full_name='Ahmed Kareem', full_name_ar='أحمد كريم',
                 role='maintenance', role_id='MNT777', sap_id='123456', username='ahmed.k',
                 shift='day')
        u.set_password('test123')
        db.session.add(u)
        db.session.commit()

        resp = client.get('/api/communication/users', headers=_admin(client))
        assert resp.status_code == 200, resp.get_json()
        row = next(r for r in resp.get_json()['data'] if r['id'] == u.id)
        assert row['full_name_ar'] == 'أحمد كريم'
        assert row['sap_id'] == '123456'
        assert row['username'] == 'ahmed.k'
        assert row['role_id'] == 'MNT777'
        # unchanged for existing readers: employee_id is the role id, as in User.to_dict
        assert row['employee_id'] == 'MNT777'
