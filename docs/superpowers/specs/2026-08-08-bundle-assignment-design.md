# Assign a worker to a whole bundle — design

**Date:** 2026-08-08
**Status:** Approved (approach A), pending spec review
**Scope:** Web planner only

## Problem

In the web work planner, assigning people is one job at a time: drag a worker
from the Team Pool onto a single job row, then pick Lead or Member in a modal.
A bundle (several jobs on the same equipment, rendered as one card) has to be
staffed by repeating that once per job.

Ali wants to drop a worker on the **whole bundle** and have every job assigned
in one motion. The existing per-job flow stays exactly as it is — it is useful
when someone only does part of the work.

## Decisions (confirmed with Ali)

| Question | Decision |
|---|---|
| Which jobs does the worker get? | **Every job in the bundle**, no trade filtering. A mechanical worker dropped on a bundle containing an AC/electrical job gets that job too. |
| What does "Lead" mean for a bundle? | **Lead on every job** in the bundle. |
| Jobs that already have people? | **Additive.** Nobody is ever removed by a drag. |
| Mobile? | **Web only** for now. The backend endpoint will be usable by mobile later. |

Explicitly NOT in scope (YAGNI):
- Trade-aware filtering using the existing `subTeamForJob` mech/elec logic.
- Optimistic cache updates for assignment. Unlike dragging, this ends in a
  modal click where a short wait is normal, and doing it means fabricating
  assignment+user objects in the cache. Revisit if it feels slow.
- Mobile parity.
- The other two dead client methods (`bulkUpdatePriority`, and
  `bulkAssignUsers` beyond what this spec needs) — see "Known adjacent issue".

## Approach A (chosen)

Drop a worker anywhere on the bundle card **except** a job row. The existing
Lead/Member modal opens, retitled to show it applies to the whole bundle and
listing the affected jobs. Confirming fires **one** bulk request.

Rejected alternatives:
- **B — "assign team" button on the bundle header.** No collision risk, but new
  picker UI and it abandons the drag flow Ali already uses.
- **C — multi-select + bulk action bar.** Reuses existing selection state and
  works across bundles, but many more clicks and not what was asked for.

## Backend

### New route: `POST /api/work-plans/<plan_id>/jobs/bulk-assign`

`work-plans.api.ts` **already declares** `bulkAssignUsers` pointing at this
path, but no such route exists — it would 404 today, the same class of bug as
the bulk-move/bulk-delete gap fixed in `aa04054`.

**Contract — pinned to avoid a client/route mismatch.** The declared client
signature is `{ job_ids: number[]; user_ids: number[] }`. Keep `user_ids`
plural (matches what is already declared, and leaves room for multi-user later)
and **add** `is_lead`:

```json
{ "job_ids": [1, 2, 3], "user_ids": [7], "is_lead": true }
```

The UI sends exactly one id in `user_ids`. The client method signature is
updated to `{ job_ids: number[]; user_ids: number[]; is_lead?: boolean }`.

Response: `{ "status": "success", "assigned": <n>, "message": "..." }` where
`assigned` counts assignment rows created or updated.

### Semantics

Mirror `assign_user` exactly, so single and bulk never diverge:

- Extract `assign_user`'s per-job body into a shared helper
  `_assign_user_to_job(job_id, user_id, is_lead)` that does NOT commit —
  same pattern as `_delete_job_record`. It must keep the existing behaviour:
  **if an assignment already exists, update `is_lead`; otherwise create one.**
  That is what makes the bundle drop additive for free.
- Validation, matching the other bulk routes:
  - plan missing → 404
  - plan `published` → 403
  - `job_ids` empty/not a list, or `user_ids` empty/not a list → 400
  - any job id not found → 404
  - any job not in this plan → 404
  - any user id not found → 404
- **One transaction, one commit** for the whole batch.
- **No server-side leave check** — parity with single assign, which has none.
  The client warns instead (see below).

## Frontend

### 1. Bundle droppable

`BundleCard` gets a droppable on the outer card:

- id: `droppable-bundle-<equipmentId ?? jobs[0].id>-<dayId>`
- data: `{ type: 'bundle-target', jobs, dayId, equipmentName }`

The existing bundle `useDraggable` stays; the card is both draggable (move to
another day) and droppable (assign a worker). Hover styling reuses the current
`isEmployeeOver` purple treatment.

### 2. Collision detection — the main regression risk

⚠️ This is the part that can break already-shipped behaviour.

`customCollision` currently returns raw `hits` when no priority matches, and a
day column wins because nothing else covers that area. Adding a full-card
bundle droppable means a dragged **job or bundle** hovering over another bundle
card would hit `droppable-bundle-*` first. `overData.type` would not be
`'day'`, so `handleDragEnd` Case 2 / 2b would not match and **the drop would
silently do nothing** — a regression in the drag-to-move flow shipped and
browser-verified in `aa04054`.

Fix: branch on the *active* drag type inside `customCollision`.

```
const activeType = args.active.data.current?.type;

if (activeType === 'employee') {
  // job row wins over bundle, so per-job assignment is unchanged
  pool > at-risk > droppable-job-* > droppable-bundle-* > rest
} else {
  // job / bundle / pool-job drags must never see the bundle target
  filter out droppable-bundle-* entirely
  pool > at-risk > droppable-job-* > rest   (unchanged from today)
}
```

The existing Playwright specs (`work-planner-dragdrop.spec.ts`) must pass
unchanged — they are the regression guard for this.

### 3. `pendingAssignment` becomes a discriminated shape

Today: `{ job: WorkPlanJob; user: any }`. Do not fake a bundle by passing
`jobs[0]`. Use:

```ts
type PendingAssignment =
  | { kind: 'job';    user: any; job: WorkPlanJob }
  | { kind: 'bundle'; user: any; jobs: WorkPlanJob[]; equipmentName: string; dayId: number };
```

### 4. `assignmentWarnings` — bundle branch

- **Day lookup:** for a bundle use `dayId` from the drag data directly (all
  bundle jobs share one day); for a single job keep the existing search.
- **Leave check:** unchanged — same day, same rule, still `type: 'error'`.
- **Capacity >10h warning:** unchanged.
- **Already-assigned — encode structurally, not by wording.** The modal buttons
  are disabled by
  `assignmentWarnings.some(w => w.type === 'error' && w.message.includes('already assigned'))`
  — a string match. So:
  - user already on **some** bundle jobs → `type: 'warning'`, worded
    **"Ahmed is already on 1 of 3 jobs — will be added to the other 2"**.
    Must NOT contain the phrase "already assigned", so it cannot trip the
    disable check. Partial overlap must stay actionable.
  - user already on **all** bundle jobs → `type: 'error'`, worded
    **"Ahmed is already assigned to all 3 jobs"** — blocks, matching the
    single-job behaviour.

### 5. Modal copy

For a bundle: *"Assign **Ahmed** to all 3 jobs on **Pump A-101**"* followed by
the job descriptions, so it is always clear what is about to happen. Lead /
Member buttons and the explanatory footer are unchanged.

### 6. Wiring checklist

- `handleDragEnd`: new case — `activeData.type === 'employee'` and
  `overData.type === 'bundle-target'` → leave check → set bundle
  `pendingAssignment` → open modal.
- `handleAssign(isLead)`: branch on `pendingAssignment.kind` — `'job'` uses
  `assignMutation`, `'bundle'` uses the new `bulkAssignMutation`.
- Both modal buttons: `loading={assignMutation.isPending || bulkAssignMutation.isPending}`.
- **`handleDragEnd` dependency array must include `bulkAssignMutation`** — the
  same omission already hit once with `bulkMoveJobsMutation`.

## Testing

**Backend** — `tests/test_work_plan_bulk_assign.py`:
- assigns one user to every job in a batch
- `is_lead: true` makes them lead on **all** jobs
- additive: pre-existing assignments by other users survive
- re-assigning an existing user updates `is_lead` rather than duplicating
- published plan → 403, and nothing is written
- job from another plan → 404, and nothing is written
- unknown user → 404
- empty `job_ids` / `user_ids` → 400

**E2E** — extend `e2e/work-planner-dragdrop.spec.ts` (or a sibling spec):
- drop a worker on a bundle → all 3 jobs show them
- **regression:** drop a worker on a single job row → exactly one job assigned
- **regression:** the existing move + rollback tests still pass (proves the
  collision change did not break drag-to-move)

**Test fixture gap:** `seed_scratch_db.py` currently creates only the admin, so
the Team Pool renders empty and no one can be dragged. It must also seed at
least one active, assignable employee (with `specialization` set, since the
card groups by mech/elec).

## Known adjacent issue (not fixed here)

`bulkUpdatePriority` in `work-plans.api.ts` still has no backend route and
would 404 if called. Out of scope; worth a separate task.

## Risks

| Risk | Mitigation |
|---|---|
| Bundle droppable breaks drag-to-move | Collision branches on active drag type; existing Playwright specs are the guard |
| Partial-overlap assignment silently blocked | Warning severity encoded structurally, wording pinned above |
| Client/route contract mismatch | Payload shape pinned in this spec; client signature updated in the same change |
| Bulk and single assign drifting apart | Both call the shared `_assign_user_to_job` helper |

No database migration required — this adds no columns and no constraints.
