"""
Tests for manual jobs persisting in the pool:
removing a manually-added PM job should return it to the pool as a pending SAP
order (so it can be dragged back), instead of being deleted outright.
"""

from datetime import date, timedelta

from tests.conftest import get_auth_header, make_equipment
from app.models import (
    WorkPlan, WorkPlanDay, WorkPlanJob, SAPWorkOrder, Defect, Inspection,
    ChecklistTemplate,
)


def _draft_plan(db_session, admin_user):
    plan = WorkPlan(
        week_start=date.today(), week_end=date.today() + timedelta(days=6),
        status='draft', created_by_id=admin_user.id,
    )
    db_session.session.add(plan)
    db_session.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=date.today())
    db_session.session.add(day)
    db_session.session.flush()
    return plan, day


class TestManualJobPool:
    def test_manual_pm_job_returns_to_pool_on_remove(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Man Pump', 'MAN-1')
        plan, day = _draft_plan(db_session, admin_user)
        job = WorkPlanJob(
            work_plan_day_id=day.id, job_type='pm', equipment_id=eq.id,
            estimated_hours=3.0, description='Manual greasing', priority='normal', position=1,
        )
        db_session.session.add(job)
        db_session.session.commit()
        job_id = job.id

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.delete(f'/api/work-plans/{plan.id}/jobs/{job_id}', headers=headers)
        assert resp.status_code == 200

        # The job is gone from the plan ...
        assert db_session.session.get(WorkPlanJob, job_id) is None
        # ... but preserved in the pool as a pending MANUAL SAP order
        order = SAPWorkOrder.query.filter_by(work_plan_id=plan.id, order_type='MANUAL').first()
        assert order is not None
        assert order.status == 'pending'
        assert order.equipment_id == eq.id
        assert order.job_type == 'pm'

    def test_defect_job_not_turned_into_manual_order(self, client, admin_user, engineer, mech_inspector, db_session):
        eq = make_equipment(db_session, 'Def Pump', 'MAN-2')
        template = ChecklistTemplate(name='T', equipment_type='centrifugal_pump', version='m2')
        db_session.session.add(template)
        db_session.session.flush()
        insp = Inspection(equipment_id=eq.id, template_id=template.id,
                          technician_id=mech_inspector.id, status='submitted')
        db_session.session.add(insp)
        db_session.session.flush()
        defect = Defect(inspection_id=insp.id, description='leak', severity='medium',
                        status='open', due_date=date.today() + timedelta(days=3))
        db_session.session.add(defect)
        db_session.session.flush()
        plan, day = _draft_plan(db_session, admin_user)
        job = WorkPlanJob(
            work_plan_day_id=day.id, job_type='defect', equipment_id=eq.id,
            defect_id=defect.id, estimated_hours=2.0, position=1,
        )
        db_session.session.add(job)
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.delete(f'/api/work-plans/{plan.id}/jobs/{job.id}', headers=headers)
        assert resp.status_code == 200
        # Defect jobs already return via the open defect — no MANUAL order created
        assert SAPWorkOrder.query.filter_by(work_plan_id=plan.id, order_type='MANUAL').first() is None
