# Bundle Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a planner drop one worker onto a whole bundle card in the web work planner and assign every job on that card in a single action, without changing the existing per-job assignment flow.

**Architecture:** A new `POST /jobs/bulk-assign` route assigns one user to many jobs in one transaction, reusing `assign_user`'s existing "update if present, else create" logic via a shared non-committing helper (the same pattern as `_delete_job_record`). On the web side `BundleCard` gains a droppable, `customCollision` learns to branch on what is being dragged so job/bundle drags never see it, and the existing Lead/Member modal is extended to describe a bundle target.

**Tech Stack:** Flask + SQLAlchemy (backend), React + TypeScript + Ant Design + @dnd-kit + React Query (web), pytest (backend tests), Playwright (E2E).

## Global Constraints

- Web only. Do not modify anything under `frontend/apps/mobile/`.
- No database migration. Add no columns and no constraints.
- The per-job assignment flow must keep working exactly as it does today.
- Bundle assignment is **additive** — a drag never removes an existing assignment.
- "Lead" applies to **every** job in the bundle.
- **All** jobs in the bundle are assigned. No mech/elec trade filtering.
- The existing Playwright specs in `frontend/apps/web/e2e/work-planner-dragdrop.spec.ts` must pass unchanged — they are the regression guard for the collision change.
- Backend command prefix: `./venv/bin/python` from the repo root (`/Users/AliAliAhmad_1_2/Desktop/inspection_system`). There is no `venv/bin/activate`.
- Never commit or push without Ali's explicit permission. Commit steps below stage and commit **locally only**. Do not run `git push`.
- Spec: `docs/superpowers/specs/2026-08-08-bundle-assignment-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `app/api/work_plans.py` | `_assign_user_to_job` helper + `bulk_assign_users` route | Modify |
| `tests/test_work_plan_bulk_assign.py` | Backend tests for the new route | Create |
| `frontend/packages/shared/src/api/work-plans.api.ts` | Add `is_lead` to the declared `bulkAssignUsers` payload | Modify |
| `frontend/apps/web/src/components/work-planning/BundleCard.tsx` | Bundle-level droppable + hover styling | Modify |
| `frontend/apps/web/src/pages/admin/WorkPlanningPage.tsx` | Collision branching, `pendingAssignment` shape, warnings, mutation, modal copy, drag case | Modify |
| `scratchpad seed_scratch_db.py` | Seed an assignable employee so the Team Pool is not empty | Modify |
| `frontend/apps/web/e2e/bundle-assignment.spec.ts` | E2E for bundle assign + per-job regression | Create |

---

## Task 1: Backend — shared assign helper and bulk-assign route

**Files:**
- Modify: `app/api/work_plans.py` (`assign_user` starts at the `@bp.route('/<int:plan_id>/jobs/<int:job_id>/assignments', methods=['POST'])` decorator)
- Test: `tests/test_work_plan_bulk_assign.py` (create)

**Interfaces:**
- Consumes: existing `WorkPlanAssignment`, `WorkPlan`, `WorkPlanJob`, `User` models; `engineer_or_admin_required()`; the error classes `NotFoundError`, `ForbiddenError`, `ValidationError`.
- Produces:
  - `_assign_user_to_job(job_id: int, user_id: int, is_lead: bool) -> WorkPlanAssignment` — does NOT commit; returns the created or updated assignment row.
  - Route `POST /api/work-plans/<plan_id>/jobs/bulk-assign` accepting `{"job_ids": [int], "user_ids": [int], "is_lead": bool}` and returning `{"status": "success", "assigned": int, "message": str}`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_work_plan_bulk_assign.py`:

```python
"""
Tests for POST /jobs/bulk-assign, used by the web planner when a worker is
dropped onto a whole bundle card.

Assignment is ADDITIVE: it never removes anyone. Assigning a user who is
already on a job updates their is_lead flag instead of creating a duplicate.
"""

from datetime import date, timedelta

from tests.conftest import get_auth_header, make_equipment
from app.models import WorkPlan, WorkPlanDay, WorkPlanJob, WorkPlanAssignment, User


def _draft_plan(db_session, admin_user, week_offset=0):
    """Create a draft plan with one day. week_start is UNIQUE, so a second
    plan in the same test needs a different week_offset."""
    start = date.today() + timedelta(weeks=week_offset)
    plan = WorkPlan(
        week_start=start, week_end=start + timedelta(days=6),
        status='draft', created_by_id=admin_user.id,
    )
    db_session.session.add(plan)
    db_session.session.flush()
    day = WorkPlanDay(work_plan_id=plan.id, date=start)
    db_session.session.add(day)
    db_session.session.flush()
    return plan, day


def _add_jobs(db_session, day, equipment, count):
    jobs = []
    for i in range(count):
        job = WorkPlanJob(
            work_plan_day_id=day.id, job_type='pm', equipment_id=equipment.id,
            estimated_hours=2.0, description=f'Job {i}', priority='normal',
            position=i + 1, berth='east',
        )
        db_session.session.add(job)
        jobs.append(job)
    db_session.session.commit()
    return jobs


def _make_worker(db_session, email, name):
    user = User(email=email, full_name=name, role='specialist',
                role_id=email.split('@')[0].upper(), shift='day')
    user.set_password('test123')
    db_session.session.add(user)
    db_session.session.commit()
    return user


class TestBulkAssign:
    def test_assigns_user_to_every_job(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Assign Pump', 'ASSIGN-1')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 3)
        worker = _make_worker(db_session, 'w1@test.com', 'Worker One')

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [j.id for j in jobs], 'user_ids': [worker.id], 'is_lead': False},
            headers=headers,
        )

        assert resp.status_code == 200
        assert resp.get_json()['assigned'] == 3
        for job in jobs:
            a = WorkPlanAssignment.query.filter_by(
                work_plan_job_id=job.id, user_id=worker.id).first()
            assert a is not None

    def test_is_lead_applies_to_all_jobs(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Lead Pump', 'ASSIGN-2')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 3)
        worker = _make_worker(db_session, 'w2@test.com', 'Worker Two')

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [j.id for j in jobs], 'user_ids': [worker.id], 'is_lead': True},
            headers=headers,
        )

        assert resp.status_code == 200
        for job in jobs:
            a = WorkPlanAssignment.query.filter_by(
                work_plan_job_id=job.id, user_id=worker.id).first()
            assert a.is_lead is True, 'lead must apply to every job in the bundle'

    def test_is_additive_keeps_other_workers(self, client, admin_user, engineer, db_session):
        """A bundle drop must never remove someone who is already assigned."""
        eq = make_equipment(db_session, 'Additive Pump', 'ASSIGN-3')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 2)
        existing = _make_worker(db_session, 'w3a@test.com', 'Existing Worker')
        newcomer = _make_worker(db_session, 'w3b@test.com', 'New Worker')

        db_session.session.add(WorkPlanAssignment(
            work_plan_job_id=jobs[0].id, user_id=existing.id, is_lead=True))
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [j.id for j in jobs], 'user_ids': [newcomer.id], 'is_lead': False},
            headers=headers,
        )

        assert resp.status_code == 200
        assert WorkPlanAssignment.query.filter_by(
            work_plan_job_id=jobs[0].id, user_id=existing.id).first() is not None
        assert WorkPlanAssignment.query.filter_by(
            work_plan_job_id=jobs[0].id).count() == 2

    def test_reassigning_updates_lead_without_duplicating(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Dup Pump', 'ASSIGN-4')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 2)
        worker = _make_worker(db_session, 'w4@test.com', 'Worker Four')

        db_session.session.add(WorkPlanAssignment(
            work_plan_job_id=jobs[0].id, user_id=worker.id, is_lead=False))
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [j.id for j in jobs], 'user_ids': [worker.id], 'is_lead': True},
            headers=headers,
        )

        assert resp.status_code == 200
        rows = WorkPlanAssignment.query.filter_by(
            work_plan_job_id=jobs[0].id, user_id=worker.id).all()
        assert len(rows) == 1, 'must update in place, not duplicate'
        assert rows[0].is_lead is True

    def test_rejects_published_plan(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Pub Assign Pump', 'ASSIGN-5')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 2)
        worker = _make_worker(db_session, 'w5@test.com', 'Worker Five')
        plan.status = 'published'
        db_session.session.commit()

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [j.id for j in jobs], 'user_ids': [worker.id], 'is_lead': False},
            headers=headers,
        )

        assert resp.status_code == 403
        assert WorkPlanAssignment.query.filter_by(user_id=worker.id).count() == 0

    def test_rejects_job_from_another_plan(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Foreign Pump', 'ASSIGN-6')
        plan_a, day_a = _draft_plan(db_session, admin_user)
        plan_b, _day_b = _draft_plan(db_session, admin_user, week_offset=1)
        foreign = _add_jobs(db_session, day_a, eq, 1)[0]
        worker = _make_worker(db_session, 'w6@test.com', 'Worker Six')

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan_b.id}/jobs/bulk-assign',
            json={'job_ids': [foreign.id], 'user_ids': [worker.id], 'is_lead': False},
            headers=headers,
        )

        assert resp.status_code == 404
        assert WorkPlanAssignment.query.filter_by(user_id=worker.id).count() == 0

    def test_rejects_unknown_user(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Ghost Pump', 'ASSIGN-7')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 1)

        headers = get_auth_header(client, 'eng@test.com', 'test123')
        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [j.id for j in jobs], 'user_ids': [999999], 'is_lead': False},
            headers=headers,
        )

        assert resp.status_code == 404

    def test_requires_job_ids_and_user_ids(self, client, admin_user, engineer, db_session):
        eq = make_equipment(db_session, 'Empty Pump', 'ASSIGN-8')
        plan, day = _draft_plan(db_session, admin_user)
        jobs = _add_jobs(db_session, day, eq, 1)
        worker = _make_worker(db_session, 'w8@test.com', 'Worker Eight')

        headers = get_auth_header(client, 'eng@test.com', 'test123')

        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [], 'user_ids': [worker.id], 'is_lead': False},
            headers=headers,
        )
        assert resp.status_code == 400

        resp = client.post(
            f'/api/work-plans/{plan.id}/jobs/bulk-assign',
            json={'job_ids': [j.id for j in jobs], 'user_ids': [], 'is_lead': False},
            headers=headers,
        )
        assert resp.status_code == 400
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./venv/bin/python -m pytest tests/test_work_plan_bulk_assign.py -q`
Expected: FAIL — all tests return 404 because the route does not exist yet.

- [ ] **Step 3: Extract the shared helper**

In `app/api/work_plans.py`, find `assign_user`. Replace the block that begins with `# Check if already assigned` and ends with `db.session.add(assignment)` so that the per-job work lives in a helper defined immediately ABOVE the `@bp.route(...)/assignments` decorator:

```python
def _assign_user_to_job(job_id, user_id, is_lead):
    """Assign one user to one job, or update their role if already assigned.

    Shared by assign_user (single) and bulk_assign_users (many) so the two
    never drift apart. Does NOT commit — the caller owns the transaction, so a
    bulk assign is one commit instead of one per job. This update-else-create
    behaviour is what makes bundle assignment additive.
    """
    existing = WorkPlanAssignment.query.filter_by(
        work_plan_job_id=job_id,
        user_id=user_id
    ).first()

    if existing:
        existing.is_lead = is_lead
        return existing

    assignment = WorkPlanAssignment(
        work_plan_job_id=job_id,
        user_id=user_id,
        is_lead=is_lead,
    )
    db.session.add(assignment)
    return assignment
```

Then rewrite the body of `assign_user` after its existing validation so it reads:

```python
    assigned_user = db.session.get(User, data['user_id'])
    if not assigned_user:
        raise NotFoundError("User not found")

    was_new = WorkPlanAssignment.query.filter_by(
        work_plan_job_id=job_id, user_id=data['user_id']
    ).first() is None

    assignment = _assign_user_to_job(job_id, data['user_id'], data.get('is_lead', False))
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'User assigned to job' if was_new else 'Assignment updated',
        'assignment': assignment.to_dict()
    }), 201 if was_new else 200
```

- [ ] **Step 4: Add the bulk-assign route**

Add immediately after `bulk_delete_jobs` in `app/api/work_plans.py`, inside the existing `# ==================== BULK JOB OPERATIONS ====================` section:

```python
@bp.route('/<int:plan_id>/jobs/bulk-assign', methods=['POST'])
@jwt_required()
def bulk_assign_users(plan_id):
    """Assign user(s) to several jobs in one transaction.

    Used when a worker is dropped onto a whole bundle card in the web planner.
    Additive — never removes an existing assignment. No server-side leave
    check, matching single assign; the client warns instead.

    Request body:
        {"job_ids": [1, 2, 3], "user_ids": [7], "is_lead": true}
    """
    user = engineer_or_admin_required()

    plan = db.session.get(WorkPlan, plan_id)
    if not plan:
        raise NotFoundError("Work plan not found")

    if plan.status == 'published':
        raise ForbiddenError("Cannot modify a published work plan")

    data = request.get_json() or {}
    job_ids = data.get('job_ids')
    user_ids = data.get('user_ids')
    is_lead = bool(data.get('is_lead', False))

    if not job_ids or not isinstance(job_ids, list):
        raise ValidationError("job_ids (non-empty list) is required")
    if not user_ids or not isinstance(user_ids, list):
        raise ValidationError("user_ids (non-empty list) is required")

    jobs = WorkPlanJob.query.filter(WorkPlanJob.id.in_(job_ids)).all()
    found_job_ids = {j.id for j in jobs}
    missing_jobs = [jid for jid in job_ids if jid not in found_job_ids]
    if missing_jobs:
        raise NotFoundError(f"Job(s) not found: {missing_jobs}")

    for job in jobs:
        if job.day.work_plan_id != plan_id:
            raise NotFoundError(f"Job {job.id} not found in this plan")

    users = User.query.filter(User.id.in_(user_ids)).all()
    found_user_ids = {u.id for u in users}
    missing_users = [uid for uid in user_ids if uid not in found_user_ids]
    if missing_users:
        raise NotFoundError(f"User(s) not found: {missing_users}")

    assigned = 0
    for job in jobs:
        for assigned_user in users:
            _assign_user_to_job(job.id, assigned_user.id, is_lead)
            assigned += 1

    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': f'Assigned {len(users)} user(s) to {len(jobs)} job(s)',
        'assigned': assigned
    }), 200
```

- [ ] **Step 5: Run the new tests**

Run: `./venv/bin/python -m pytest tests/test_work_plan_bulk_assign.py -q`
Expected: PASS — 8 passed.

- [ ] **Step 6: Run the full backend suite (the helper touched single assign)**

Run: `./venv/bin/python -m pytest tests/ -q`
Expected: PASS — 181 passed, 15 deselected (173 before + 8 new).

- [ ] **Step 7: Commit (local only — do NOT push)**

```bash
git add app/api/work_plans.py tests/test_work_plan_bulk_assign.py
git commit -m "Feat: add bulk-assign endpoint for bundle assignment

Extracts assign_user's per-job body into a shared, non-committing
_assign_user_to_job helper so single and bulk assign cannot drift apart, then
adds POST /jobs/bulk-assign which assigns user(s) to many jobs in one
transaction. Additive by construction: the helper updates an existing
assignment's is_lead rather than duplicating it.

work-plans.api.ts already declared bulkAssignUsers against this path with no
backend route behind it, so this also closes a latent 404.

Tests: tests/test_work_plan_bulk_assign.py (8)."
```

---

## Task 2: Shared API client — add `is_lead` to the declared payload

**Files:**
- Modify: `frontend/packages/shared/src/api/work-plans.api.ts:568-570`

**Interfaces:**
- Consumes: the route from Task 1.
- Produces: `bulkAssignUsers(planId: number, payload: { job_ids: number[]; user_ids: number[]; is_lead?: boolean })`.

- [ ] **Step 1: Update the signature**

Replace:

```ts
  bulkAssignUsers(planId: number, payload: { job_ids: number[]; user_ids: number[] }) {
    return getApiClient().post<ApiResponse<{ updated: number }>>(`/api/work-plans/${planId}/jobs/bulk-assign`, payload);
  },
```

with:

```ts
  bulkAssignUsers(
    planId: number,
    payload: { job_ids: number[]; user_ids: number[]; is_lead?: boolean }
  ) {
    return getApiClient().post<ApiResponse<{ assigned: number }>>(
      `/api/work-plans/${planId}/jobs/bulk-assign`,
      payload
    );
  },
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend/apps/web && npx tsc --noEmit`
Expected: no new errors. One pre-existing unrelated error in `src/pages/inspector/InspectionChecklistPage.tsx(340,42)` is expected and must be ignored.

- [ ] **Step 3: Commit (local only)**

```bash
git add frontend/packages/shared/src/api/work-plans.api.ts
git commit -m "Feat: add is_lead to bulkAssignUsers client payload"
```

---

## Task 3: Collision detection — branch on the active drag type

Do this BEFORE adding the droppable, so the guard exists before the thing it guards against.

**Files:**
- Modify: `frontend/apps/web/src/pages/admin/WorkPlanningPage.tsx:1811-1826` (`customCollision`)

**Interfaces:**
- Consumes: `pointerWithin`, `closestCenter` from `@dnd-kit/core` (already imported).
- Produces: a `customCollision` that hides `droppable-bundle-*` from every drag except an `employee` drag.

- [ ] **Step 1: Replace `customCollision`**

```tsx
  const customCollision = useCallback((args: Parameters<typeof pointerWithin>[0]) => {
    let hits = pointerWithin(args);
    if (hits.length > 0) {
      // Only an employee drag may land on a whole bundle (to staff every job on
      // the card). For job / bundle / pool-job drags the bundle target must be
      // invisible — otherwise dragging a job over a day that contains a bundle
      // would resolve to the bundle instead of the day, overData.type would not
      // be 'day', and handleDragEnd Case 1/2/2b would silently do nothing.
      const activeType = args.active.data.current?.type;
      if (activeType !== 'employee') {
        hits = hits.filter(h => !String(h.id).startsWith('droppable-bundle-'));
      }

      // Priority 1: Pool panel — drag job back to pool
      const poolHit = hits.find(h => h.id === 'job-pool-drop');
      if (poolHit) return [poolHit];
      // Priority 2: At-risk drawer — drag scheduled job to unschedule it
      const atRiskHit = hits.find(h => h.id === 'at-risk-drop');
      if (atRiskHit) return [atRiskHit];
      // Priority 3: Job droppables — employee dragged onto ONE job card.
      // Deliberately ABOVE the bundle target so per-job assignment still wins
      // when the pointer is over a specific row.
      const jobHit = hits.find(h => String(h.id).startsWith('droppable-job-'));
      if (jobHit) return [jobHit];
      // Priority 4: Bundle target — employee dropped anywhere else on the card
      const bundleHit = hits.find(h => String(h.id).startsWith('droppable-bundle-'));
      if (bundleHit) return [bundleHit];
      if (hits.length > 0) return hits;
    }
    return closestCenter(args);
  }, []);
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend/apps/web && npx tsc --noEmit`
Expected: no new errors beyond the known `InspectionChecklistPage` one.

- [ ] **Step 3: Commit (local only)**

```bash
git add frontend/apps/web/src/pages/admin/WorkPlanningPage.tsx
git commit -m "Refactor: gate collision detection on the active drag type

Prepares for a bundle-level droppable. Only an employee drag may resolve to a
bundle target; job and bundle drags filter it out so drag-to-move keeps
resolving to the day column."
```

---

## Task 4: BundleCard — add the bundle droppable

**Files:**
- Modify: `frontend/apps/web/src/components/work-planning/BundleCard.tsx` (the `useDraggable` at the top of `BundleCardInner`, and the outer `<div ref={setDragRef}>` in its return)

**Interfaces:**
- Consumes: `useDroppable` from `@dnd-kit/core` (already imported on line 4 alongside `useDraggable`).
- Produces: droppable id `droppable-bundle-<equipmentId ?? jobs[0].id>-<dayId>` carrying `data: { type: 'bundle-target', jobs, dayId, equipmentName }`.

- [ ] **Step 1: Add the droppable next to the existing bundle draggable**

In `BundleCardInner`, directly below the existing `useDraggable` call:

```tsx
  // Bundle drag (drag the whole bundle to another day)
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `plan-bundle-${equipmentId || jobs[0]?.id}-${dayId}`,
    data: { type: 'bundle', jobs, dayId, equipmentId },
  });

  // Bundle drop target — an employee dropped anywhere on the card (except on a
  // specific job row, which wins in customCollision) staffs EVERY job here.
  const { setNodeRef: setBundleDropRef, isOver: isEmployeeOverBundle } = useDroppable({
    id: `droppable-bundle-${equipmentId || jobs[0]?.id}-${dayId}`,
    data: { type: 'bundle-target', jobs, dayId, equipmentName: equipmentDisplayName(jobs[0]) },
  });
  const setBundleRef = (el: HTMLElement | null) => {
    setDragRef(el);
    setBundleDropRef(el);
  };
```

- [ ] **Step 2: Wire the ref and hover styling into the outer div**

In the same component's `return`, change the outer element from `ref={setDragRef}` to `ref={setBundleRef}` and add the hover treatment, matching the purple already used for per-job hover:

```tsx
  return (
    <div
      ref={setBundleRef}
      style={{
        display: 'flex',
        marginBottom: 4,
        background: isDragging
          ? '#e6f7ff'
          : isEmployeeOverBundle
          ? '#f9f0ff'
          : bundleHeat.active
          ? bundleHeat.cardTint
          : '#fff',
        borderRadius: 5,
        border: `1px solid ${
          isEmployeeOverBundle
            ? '#722ed1'
            : expanded
            ? '#1677ff'
            : bundleHeat.active
            ? bundleHeat.border
            : '#e8e8e8'
        }`,
        boxShadow: expanded ? '0 0 0 2px rgba(22,119,255,0.15)' : bundleHeat.active ? `0 1px 5px ${bundleHeat.stripe}40` : '0 1px 2px rgba(0,0,0,0.04)',
        cursor: isDragging ? 'grabbing' : 'pointer',
        opacity: isDragging ? 0.5 : 1,
        transform: CSS.Translate.toString(transform),
        overflow: 'hidden',
      }}
    >
```

- [ ] **Step 3: Add `isEmployeeOverBundle` to the memo comparator**

`BundleCard` is wrapped in `React.memo` with a custom comparator at the bottom of the file. The comparator compares props only, and `isEmployeeOverBundle` is internal hook state, so **no comparator change is needed** — hook state changes always re-render regardless of the comparator. Confirm the comparator is left exactly as-is.

- [ ] **Step 4: Typecheck**

Run: `cd frontend/apps/web && npx tsc --noEmit`
Expected: no new errors beyond the known `InspectionChecklistPage` one.

- [ ] **Step 5: Commit (local only)**

```bash
git add frontend/apps/web/src/components/work-planning/BundleCard.tsx
git commit -m "Feat: make the bundle card a drop target for employees"
```

---

## Task 5: Wire the drop, modal, warnings and mutation

**Files:**
- Modify: `frontend/apps/web/src/pages/admin/WorkPlanningPage.tsx`
  - `pendingAssignment` state — line ~600
  - `assignmentWarnings` — line ~1153
  - `handleDragEnd` Case 3 — line ~1716, and its dependency array
  - `handleAssign` — line ~1760
  - assign modal body — line ~3165

**Interfaces:**
- Consumes: `workPlansApi.bulkAssignUsers` (Task 2), droppable data `{ type: 'bundle-target', jobs, dayId, equipmentName }` (Task 4).
- Produces: `PendingAssignment` discriminated union; `bulkAssignMutation`.

- [ ] **Step 1: Change the `pendingAssignment` state shape**

Replace the existing declaration:

```tsx
  const [pendingAssignment, setPendingAssignment] = useState<{ job: WorkPlanJob; user: any } | null>(null);
```

with a discriminated union declared just above the component (next to the other module-level helpers, after `fmtHours`):

```tsx
/** What the Lead/Member modal is about to assign — one job, or a whole bundle. */
type PendingAssignment =
  | { kind: 'job'; user: any; job: WorkPlanJob }
  | { kind: 'bundle'; user: any; jobs: WorkPlanJob[]; equipmentName: string; dayId: number };
```

and inside the component:

```tsx
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);
```

- [ ] **Step 2: Update the existing per-job drop to set `kind: 'job'`**

In `handleDragEnd` Case 3, change:

```tsx
      setPendingAssignment({ job, user });
```

to:

```tsx
      setPendingAssignment({ kind: 'job', job, user });
```

- [ ] **Step 3: Add the bundle drop case**

Immediately after Case 3 in `handleDragEnd`:

```tsx
    // Case 3b: Dropping employee on a whole BUNDLE — staff every job on the card
    if (activeData.type === 'employee' && overData.type === 'bundle-target') {
      const user = activeData.user;
      const bundleJobs = (overData.jobs || []) as WorkPlanJob[];
      if (bundleJobs.length === 0) return;

      // All jobs on a bundle share one day, so one leave check covers them all
      const day = currentPlan?.days?.find((d: any) => d.id === overData.dayId);
      const leaveDates = userLeaveDatesMap.get(user.id);
      if (day && leaveDates?.has(day.date)) {
        message.warning(`${user.full_name} is on leave on ${day.date}. Cannot assign to this day.`);
        return;
      }

      setPendingAssignment({
        kind: 'bundle',
        user,
        jobs: bundleJobs,
        equipmentName: overData.equipmentName || 'this equipment',
        dayId: overData.dayId,
      });
      setAssignModalOpen(true);
    }
```

- [ ] **Step 4: Add the bulk assign mutation**

Directly below the existing `assignMutation`:

```tsx
  // Bulk assign (worker dropped on a whole bundle) — one request for every job
  const bulkAssignMutation = useMutation({
    mutationFn: ({ planId, jobIds, userId, isLead }: { planId: number; jobIds: number[]; userId: number; isLead: boolean }) =>
      workPlansApi.bulkAssignUsers(planId, { job_ids: jobIds, user_ids: [userId], is_lead: isLead }),
    onSuccess: (_res, vars) => {
      message.success(`Assigned to ${vars.jobIds.length} job${vars.jobIds.length !== 1 ? 's' : ''}`);
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      setAssignModalOpen(false);
      setPendingAssignment(null);
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to assign user to bundle');
    },
  });
```

- [ ] **Step 5: Rewrite `assignmentWarnings` to handle both shapes**

```tsx
  const assignmentWarnings = useMemo(() => {
    const warnings: { type: 'error' | 'warning'; message: string }[] = [];
    if (!pendingAssignment || !currentPlan) return warnings;

    const user = pendingAssignment.user;
    const firstName = user.full_name?.split(' ')[0];

    // Resolve the day. A bundle carries its dayId directly (all its jobs share
    // one day); a single job has to be searched for.
    const day =
      pendingAssignment.kind === 'bundle'
        ? currentPlan.days?.find(d => d.id === pendingAssignment.dayId)
        : currentPlan.days?.find(d =>
            [...(d.jobs_east || []), ...(d.jobs_west || []), ...(d.jobs_both || [])]
              .some(j => j.id === pendingAssignment.job.id)
          );

    if (day && isUserOnLeaveForDay(user.id, day.date)) {
      warnings.push({
        type: 'error',
        message: `${firstName} is on leave on ${dayjs(day.date).format('ddd, MMM D')}!`,
      });
    }

    if (day) {
      const totalHours = getDayTotalHours(day);
      if (totalHours > 10) {
        warnings.push({
          type: 'warning',
          message: `This day has ${fmtHours(totalHours)}h scheduled (high workload)`,
        });
      }
    }

    // Already-assigned. The modal's disable check is a STRING MATCH on
    // 'already assigned', so partial overlap must be a warning whose wording
    // avoids that phrase — otherwise adding someone to the remaining jobs
    // would be blocked, defeating additive assignment.
    if (pendingAssignment.kind === 'job') {
      const existing = (pendingAssignment.job.assignments || []).find((a: any) => a.user_id === user.id);
      if (existing) {
        warnings.push({
          type: 'error',
          message: `${firstName} is already assigned to this job`,
        });
      }
    } else {
      const total = pendingAssignment.jobs.length;
      const already = pendingAssignment.jobs.filter(j =>
        (j.assignments || []).some((a: any) => a.user_id === user.id)
      ).length;

      if (already === total) {
        warnings.push({
          type: 'error',
          message: `${firstName} is already assigned to all ${total} jobs`,
        });
      } else if (already > 0) {
        warnings.push({
          type: 'warning',
          message: `${firstName} is already on ${already} of ${total} jobs — will be added to the other ${total - already}`,
        });
      }
    }

    return warnings;
  }, [pendingAssignment, currentPlan, isUserOnLeaveForDay, getDayTotalHours]);
```

- [ ] **Step 6: Branch `handleAssign`**

```tsx
  const handleAssign = (isLead: boolean) => {
    if (!pendingAssignment || !currentPlan) return;

    if (pendingAssignment.kind === 'bundle') {
      bulkAssignMutation.mutate({
        planId: currentPlan.id,
        jobIds: pendingAssignment.jobs.map(j => j.id),
        userId: pendingAssignment.user.id,
        isLead,
      });
      return;
    }

    assignMutation.mutate({
      planId: currentPlan.id,
      jobId: pendingAssignment.job.id,
      userId: pendingAssignment.user.id,
      isLead,
    });
  };
```

- [ ] **Step 7: Update the modal body**

Replace the heading paragraph:

```tsx
            <p style={{ fontSize: 15 }}>
              Assign <strong>{pendingAssignment.user.full_name}</strong> to{' '}
              <strong>{pendingAssignment.job.equipment?.name || 'this job'}</strong>
            </p>
```

with:

```tsx
            {pendingAssignment.kind === 'bundle' ? (
              <>
                <p style={{ fontSize: 15, marginBottom: 4 }}>
                  Assign <strong>{pendingAssignment.user.full_name}</strong> to all{' '}
                  <strong>{pendingAssignment.jobs.length} jobs</strong> on{' '}
                  <strong>{pendingAssignment.equipmentName}</strong>
                </p>
                <ul style={{ textAlign: 'left', margin: '0 0 8px 0', paddingLeft: 20 }}>
                  {pendingAssignment.jobs.map(j => (
                    <li key={j.id} style={{ fontSize: 12, color: '#8c8c8c' }}>
                      {j.description || `Job #${j.id}`}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p style={{ fontSize: 15 }}>
                Assign <strong>{pendingAssignment.user.full_name}</strong> to{' '}
                <strong>{pendingAssignment.job.equipment?.name || 'this job'}</strong>
              </p>
            )}
```

- [ ] **Step 8: Add bulk pending state to both modal buttons**

On BOTH the "As Lead" and "As Member" `<Button>`s, change
`loading={assignMutation.isPending}` to:

```tsx
                loading={assignMutation.isPending || bulkAssignMutation.isPending}
```

- [ ] **Step 9: Add the new mutation to `handleDragEnd`'s dependency array**

The array currently reads:

```tsx
  }, [currentPlan, isDraft, addJobMutation, moveMutation, scheduleSAPMutation, removeJobMutation,
      bulkMoveJobsMutation, bulkRemoveJobsMutation, userLeaveDatesMap]);
```

`handleDragEnd` does not call `bulkAssignMutation` directly (it only sets state), so no change is required here. Confirm this is still true after Step 3 — if the bundle case is ever changed to call the mutation directly, it MUST be added to this array. This is the exact omission that was missed once with `bulkMoveJobsMutation`.

- [ ] **Step 10: Typecheck**

Run: `cd frontend/apps/web && npx tsc --noEmit`
Expected: no new errors beyond the known `InspectionChecklistPage` one.

- [ ] **Step 11: Commit (local only)**

```bash
git add frontend/apps/web/src/pages/admin/WorkPlanningPage.tsx
git commit -m "Feat: assign a worker to a whole bundle in one drop

Dropping an employee on a bundle card opens the existing Lead/Member modal
described for the whole bundle and fires one bulk-assign request. pendingAssignment
becomes a discriminated union so bundle state is not faked with jobs[0].

Partial overlap (user already on some jobs) is a WARNING worded to avoid the
phrase 'already assigned', because the modal's disable check is a string match
on it — otherwise additive assignment to the remaining jobs would be blocked."
```

---

## Task 6: Seed an assignable employee for local/E2E testing

**Files:**
- Modify: `/private/tmp/claude-501/-Users-AliAliAhmad-1-2-Desktop-inspection-system/c354a537-ee92-443c-8d61-2946e0b29f9f/scratchpad/seed_scratch_db.py`

The scratch seed currently creates only the admin, so the Team Pool renders empty and no one can be dragged. Without this, Task 7 cannot run.

**Interfaces:**
- Consumes: `User`, `Equipment`, `WorkPlan`, `WorkPlanDay`, `WorkPlanJob` models.
- Produces: at least one active worker visible in the Team Pool.

- [ ] **Step 1: Add workers to the seed**

After the `admin` block in `seed_scratch_db.py`:

```python
    workers = []
    for email, name, role_id, spec in [
        ('mech1@test.com', 'Ahmed Mechanic', 'MEC001', 'mechanical'),
        ('elec1@test.com', 'Omar Electrician', 'ELE001', 'electrical'),
    ]:
        w = User(email=email, full_name=name, role='specialist',
                 role_id=role_id, shift='day', language='en',
                 specialization=spec, is_active=True)
        w.set_password('test123')
        db.session.add(w)
        workers.append(w)
    db.session.flush()
```

and add to the final print block:

```python
    print(f'Workers: {[w.full_name for w in workers]}')
```

- [ ] **Step 2: (verified — no action needed)**

`app/models/user.py:48` defines `specialization` with a CHECK constraint
allowing exactly `'mechanical'`, `'electrical'`, `'hvac'` or NULL, and
`is_active` is defined on line 70. The values used in Step 1 are valid — do not
substitute e.g. `'mech'`, which would violate `check_valid_specialization`.

- [ ] **Step 3: Rebuild the scratch DB and start the stack**

```bash
SCRATCH=/private/tmp/claude-501/-Users-AliAliAhmad-1-2-Desktop-inspection-system/c354a537-ee92-443c-8d61-2946e0b29f9f/scratchpad
DATABASE_URL="sqlite:///$SCRATCH/planner_test.db" ./venv/bin/python $SCRATCH/seed_scratch_db.py
```

Expected output includes `Workers: ['Ahmed Mechanic', 'Omar Electrician']`.

Then, in two background shells from the repo root:

```bash
DATABASE_URL="sqlite:///$SCRATCH/planner_test.db" FLASK_ENV=development \
  ./venv/bin/python -m flask --app run.py run --port 5055 --no-reload

cd frontend/apps/web && VITE_PROXY_TARGET=http://127.0.0.1:5055 npx vite --port 3001
```

⚠️ `vite.config.ts` defaults its `/api` proxy to the **production** Render API. `VITE_PROXY_TARGET` is mandatory — without it the E2E test would assign real workers to real jobs in the live plan.

---

## Task 7: E2E — bundle assign works, per-job assign still works

**Files:**
- Create: `frontend/apps/web/e2e/bundle-assignment.spec.ts`

**Interfaces:**
- Consumes: the running local stack from Task 6; the same login-once-and-inject-token pattern as `work-planner-dragdrop.spec.ts` (both the API and the web app rate-limit login, so driving the login form per test causes 429s).

- [ ] **Step 1: Write the E2E spec**

```ts
/**
 * Bundle assignment: dropping one worker on a bundle card staffs every job on
 * it, while dropping on a single job row still assigns only that job.
 *
 * Requires the local stack from Task 6: vite on 3001 proxying /api to the
 * seeded backend on 5055. NEVER run against production.
 */
import { test, expect, Page, request as playwrightRequest } from '@playwright/test';

const BASE = 'http://localhost:3001';

test.describe.configure({ mode: 'serial', retries: 0 });

let token = '';

test.beforeAll(async () => {
  const ctx = await playwrightRequest.newContext();
  const res = await ctx.post(`${BASE}/api/auth/login`, {
    data: { email: 'admin@test.com', password: 'admin123' },
  });
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
  token = (await res.json()).access_token;
  await ctx.dispose();
});

async function openPlanner(page: Page) {
  await page.addInitScript((t) => localStorage.setItem('access_token', t), token);
  await page.goto(`${BASE}/admin/work-planning`);
  await page.waitForSelector('.wp-day-columns > *', { timeout: 30000 });
  await page.waitForTimeout(1500);
}

/** Open the Team Pool tab so employees are draggable. */
async function openTeamPool(page: Page) {
  await page.getByRole('tab', { name: /team pool/i }).click();
  await page.waitForTimeout(800);
}

/** dnd-kit needs real incremental movement to clear its 8px activation constraint. */
async function dragTo(page: Page, source: any, target: any) {
  const s = await source.boundingBox();
  const t = await target.boundingBox();
  if (!s || !t) throw new Error('missing bounding box for drag');
  const sx = s.x + s.width / 2, sy = s.y + s.height / 2;
  const tx = t.x + t.width / 2, ty = t.y + t.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(sx + ((tx - sx) * i) / 12, sy + ((ty - sy) * i) / 12, { steps: 2 });
  }
  await page.mouse.up();
}

test('dropping a worker on a bundle assigns every job on the card', async ({ page }) => {
  const bulkCalls: any[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/jobs/bulk-assign')) {
      bulkCalls.push(JSON.parse(req.postData() || '{}'));
    }
  });

  await openPlanner(page);
  await openTeamPool(page);

  const worker = page.locator('text=Ahmed Mechanic').first();
  await expect(worker).toBeVisible({ timeout: 20000 });

  // The Pump A-101 bundle card (3 jobs). Target the card header, NOT a job row.
  const bundle = page.locator('text=Pump A-101').first();
  await dragTo(page, worker, bundle);

  // Modal describes the whole bundle before anything is written
  await expect(page.locator('text=/to all\\s*3 jobs/i')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: /as lead/i }).click();
  await page.waitForTimeout(2500);

  expect(bulkCalls.length, 'exactly one bulk-assign request').toBe(1);
  expect(bulkCalls[0].job_ids.length, 'all 3 jobs in one request').toBe(3);
  expect(bulkCalls[0].is_lead).toBe(true);
});

test('REGRESSION: dropping on a single job row still assigns only that job', async ({ page }) => {
  const singleCalls: string[] = [];
  const bulkCalls: string[] = [];
  page.on('request', (req) => {
    const u = req.url();
    if (/\/jobs\/\d+\/assignments$/.test(u) && req.method() === 'POST') singleCalls.push(u);
    if (u.includes('/jobs/bulk-assign')) bulkCalls.push(u);
  });

  await openPlanner(page);
  await openTeamPool(page);

  // Expand the bundle so individual job rows are visible
  await page.locator('text=Pump A-101').first().click();
  await page.waitForTimeout(800);

  const worker = page.locator('text=Omar Electrician').first();
  const jobRow = page.locator('text=Replace seal').first();
  await expect(jobRow).toBeVisible({ timeout: 10000 });

  await dragTo(page, worker, jobRow);
  await expect(page.getByRole('button', { name: /as member/i })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /as member/i }).click();
  await page.waitForTimeout(2500);

  expect(singleCalls.length, 'one single-job assign request').toBe(1);
  expect(bulkCalls.length, 'bundle target must NOT swallow a job-row drop').toBe(0);
});
```

- [ ] **Step 2: Run the new E2E spec**

Run: `cd frontend/apps/web && npx playwright test e2e/bundle-assignment.spec.ts --project="Desktop Chrome" --reporter=line --timeout=90000`
Expected: 2 passed.

If a locator fails, do NOT assume the product is broken — log the outgoing request payload first. A previous run of this codebase "failed" only because a `text=` locator matched the wrong day column.

- [ ] **Step 3: Run the drag & drop regression specs**

Run: `cd frontend/apps/web && npx playwright test e2e/work-planner-dragdrop.spec.ts --project="Desktop Chrome" --reporter=line --timeout=90000`
Expected: 2 passed. **This is the guard for the Task 3 collision change.** If either fails, the bundle droppable is swallowing job/bundle drags — revisit Task 3.

- [ ] **Step 4: Stop the local stack and clean up**

```bash
pkill -f "flask --app run.py run --port 5055"
pkill -f "vite --port 3001"
rm -rf frontend/apps/web/test-results
```

- [ ] **Step 5: Commit (local only)**

```bash
git add frontend/apps/web/e2e/bundle-assignment.spec.ts
git commit -m "Test: E2E for bundle assignment + per-job regression guard"
```

---

## Task 8: Documentation

**Files:**
- Modify: `CLAUDE.md` (Change Log — keep only the last 3 entries, move older ones to HISTORY.md; file must stay under 8KB)
- Modify: `HISTORY.md` (full detail entry)
- Modify: `lessons.md` (only if something was learned the hard way)

- [ ] **Step 1: Add the changelog entries**

Add a dated entry summarising: the bulk-assign route closing another declared-but-missing client method; the collision-detection gating that protects drag-to-move; the additive semantics via the shared `_assign_user_to_job` helper; and the partial-overlap warning wording and WHY it must avoid the phrase "already assigned".

- [ ] **Step 2: Verify CLAUDE.md size**

Run: `wc -c CLAUDE.md`
Expected: under 8192.

- [ ] **Step 3: Commit (local only)**

```bash
git add CLAUDE.md HISTORY.md lessons.md
git commit -m "Docs: changelog for bundle assignment"
```

- [ ] **Step 4: Report to Ali and ASK before pushing**

Summarise what shipped and the test results. **Do not run `git push`.** Pushing to `main` auto-deploys both Render services; that decision is Ali's.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| All jobs, no trade filtering | Task 1 (route assigns every job id sent), Task 5 Step 3 (sends all bundle jobs) |
| Lead applies to every job | Task 1 Step 4 + test `test_is_lead_applies_to_all_jobs` |
| Additive | Task 1 Step 3 helper + test `test_is_additive_keeps_other_workers` |
| Web only | Global Constraints |
| `bulk-assign` route with pinned payload | Task 1 Step 4, Task 2 |
| Shared helper so single/bulk cannot drift | Task 1 Step 3 |
| Validation: 403 / 404 / 400 | Task 1 Step 4 + tests |
| No server-side leave check | Task 1 Step 4 docstring; client check in Task 5 Step 3 |
| Bundle droppable + id/data shape | Task 4 |
| Collision branches on active drag type | Task 3 |
| `pendingAssignment` discriminated union | Task 5 Step 1 |
| Warnings: day via dayId, leave, capacity | Task 5 Step 5 |
| Partial overlap = warning avoiding "already assigned" | Task 5 Step 5 |
| All-jobs overlap = blocking error | Task 5 Step 5 |
| Modal copy lists affected jobs | Task 5 Step 7 |
| Both buttons show bulk pending | Task 5 Step 8 |
| Dependency-array check | Task 5 Step 9 |
| Backend tests | Task 1 Step 1 |
| E2E bundle + per-job regression | Task 7 |
| Existing dragdrop specs pass | Task 7 Step 3 |
| Seed an assignable employee | Task 6 |
| No migration | Global Constraints |

No gaps.

**Placeholder scan:** No TBD/TODO. Every code step contains complete code. Task 5 Step 9 and Task 4 Step 3 are deliberate *verification* steps ("confirm X is still true"), not deferred work.

**Type consistency:** `_assign_user_to_job(job_id, user_id, is_lead)` is defined in Task 1 and called only there. `bulkAssignUsers(planId, {job_ids, user_ids, is_lead})` is defined in Task 2 and called in Task 5 Step 4 with that exact shape. `PendingAssignment` is defined in Task 5 Step 1 and its `kind` discriminant is used consistently in Steps 2, 3, 5, 6, 7. Droppable data `{ type: 'bundle-target', jobs, dayId, equipmentName }` is produced in Task 4 and consumed in Task 5 Step 3 with matching field names. The response field is `assigned` in both Task 1 and Task 2.
