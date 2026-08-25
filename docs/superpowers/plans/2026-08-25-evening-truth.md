# The Evening Truth (Carry-Over That Tells It) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 5 PM review corrects the plan with real numbers: the worker states the hours left, the carry-over books ONLY those hours and merges with an already-planned continuation, an overloaded target day makes room via the domino (least-important job slides forward, week-end overflow returns to the box), and split-order lookups become split-aware.

**Architecture:** One new nullable column (`work_plan_job_trackings.remaining_hours`), a rewrite inside `create_carry_over` (`app/api/work_plan_tracking.py`), a new `app/services/day_ripple.py` for the domino, and two split-aware fixes in existing services. UI: additive fields on the worker's incomplete form (mobile) and the engineer review (web + mobile).

**Tech Stack:** Flask/SQLAlchemy/Alembic, pytest; React (web), React Native (mobile). One migration.

## Global Constraints

- Ali's decisions (2026-08-24/25 grill), verbatim in behavior:
  - **The worker says how much is left** ("C") — he touched the machine. Engineer can correct at the review.
  - Carry-over books **only the remaining hours** — never the full original figure again.
  - **Merge, never duplicate**: if the plan already holds a continuation (split part 2/2, same `sap_order_number`, untouched), the carry-over adjusts THAT job.
  - **The domino ("A")**: target day over budget → its least-important untouched job slides to the next day, cascading; what falls off the week's end returns to the box. Runs inside the review, whole chain returned so one Submit approves it — never invisible.
  - Worked jobs NEVER move (job_work_state ≠ None) — same iron rule as everywhere else.
- Fallback chain for remaining hours: engineer's figure → worker's figure → `max(0.5, estimated − actual)` → estimated. Never null, never negative.
- Wallet math identical to the generator's: cost = hours × max(2, assigned), AC PMs never charge wallets, no rules configured → no hours check (feature off).
- Migration: revision `r8s9t0u1v2w3`, down_revision `q7r8s9t0u1v2`. Column is nullable — no backfill. Remember production: `flask db upgrade` from the Render shell; `start.sh` won't stop the boot on failure.
- Every rule lands with a mutation check. NO git commits — Ali commits.

---

### Task 1: The worker says how much is left

**Files:**
- Create: `migrations/versions/r8s9t0u1v2w3_remaining_hours.py`
- Modify: `app/models/work_plan_job_tracking.py` (column + `to_dict`), `app/api/work_plan_tracking.py` (`mark_incomplete`)
- Test: `tests/test_carry_over_hours.py` (new)

**Interfaces:**
- Produces: `WorkPlanJobTracking.remaining_hours` (Numeric(5,2), nullable); `POST /jobs/<id>/incomplete` accepts optional `remaining_hours` (float ≥ 0, ≤ 99), stores it, returns it in `tracking`.

- [x] Step 1: failing tests — worker sends `remaining_hours: 6.0` with the incomplete payload → stored and returned; negative → 400; omitted → null.
- [x] Step 2: run, expect FAIL.
- [x] Step 3: migration (nullable ADD COLUMN, sqlite no-op guard like sibling migrations), model column, endpoint validation + store.
- [x] Step 4: full suite green.
- [x] Step 5: mutation — drop the store line; the stored-test fails; restore.

### Task 2: The carry-over books the remaining hours and merges

**Files:**
- Modify: `app/api/work_plan_tracking.py` (`create_carry_over`)
- Test: `tests/test_carry_over_hours.py`

**Interfaces:**
- Consumes: Task 1's column; `job_work_state` from `app/api/work_plans.py`.
- Produces: `create_carry_over` resolves `remaining = data.remaining_hours → tracking.remaining_hours → max(0.5, estimated − actual) → estimated`; if an untouched job with the same `sap_order_number` exists on a LATER day of this plan (or next week's), it is REUSED (hours set to remaining, note appended, tracking created with `is_carry_over=True`) instead of a duplicate; response gains `merged_into_existing: bool` and `remaining_hours`.

- [x] Step 1: failing tests — (a) full-figure bug: 12h job, 8h worked, no stated remaining → new job carries 4.0h not 12.0h; (b) worker's 6.0 beats the subtraction; (c) engineer's 5.0 beats the worker; (d) split part 2/2 on Tuesday → NO second job, part-2's hours become the remaining, carry-over record points at it; (e) a WORKED continuation is not merged into — a fresh job is created.
- [x] Step 2–4: implement, suite green.
- [x] Step 5: mutations — (i) restore `estimated_hours=original_job.estimated_hours` → (a) fails; (ii) skip the merge lookup → (d) fails.

### Task 3: The domino — the target day makes room

**Files:**
- Create: `app/services/day_ripple.py`
- Modify: `app/api/work_plan_tracking.py` (`create_carry_over` wires it; optional `dry_run: true` payload returns the plan-of-action without applying)
- Test: `tests/test_day_ripple.py` (new)

**Interfaces:**
- Produces:
  - `day_cost_man_hours(day) -> float` (skips AC PMs; crew = max(2, len(assignments))).
  - `make_room(plan, day, needed_mh, protect_job_ids=set(), dry_run=False) -> list[dict]` — chain entries `{'job_id', 'description', 'sap_order_number', 'from': date, 'to': date | 'box'}`. Picks victims among UNTOUCHED (`job_work_state is None`), unprotected, non-carried-into jobs; least important first (priority low<normal<high<urgent, then fewest hours); moves the job row to the next day (`work_plan_day_id` update — assignments ride along), cascading; past `plan.week_end` → SAP-backed jobs release to the box (`purge_job_rows` + order `status='pending'`, `work_plan_id=None`), defect/manual jobs are deleted the same way (their defect stays open and re-enters via the next generate). Wallet capacity from `build_week_wallets`; **no rules → empty chain, nothing moves** (feature off).
- Consumes: `build_week_wallets`, `purge_job_rows`, `job_work_state`.

- [x] Step 1: failing tests — (a) carry lands on a full Tuesday → the lamp job (low, untouched) moves to Wednesday, chain says so; (b) cascade: Tue and Wed both full → lamp lands Thursday; (c) week full to Sunday → victim released to the box (`SAPWorkOrder.status == 'pending'`, job gone); (d) a worked job is never chosen even when it is the least important; (e) `dry_run` returns the same chain and changes nothing; (f) no WorkerAssignmentRules → empty chain.
- [x] Step 2–4: implement, suite green.
- [x] Step 5: mutations — (i) victim selection ignores `job_work_state` → (d) fails; (ii) `make_room` applies during dry_run → (e) fails; (iii) cost drops the crew factor → (a) fails.

### Task 4: Split-aware order lookups

**Files:**
- Modify: `app/services/sap_carry_over.py` (`_was_worked` → ANY job for the order worked, not `.first()`), `app/services/sap_removal_rules.py` (one notification per ORDER per run, not per job row)
- Test: extend `tests/test_sap_carry_over.py`, `tests/test_sap_removal_rules.py`

**Interfaces:** unchanged signatures; behavior: a split order whose part 1 is in progress is protected even when part 2 is untouched; a closed split order raises ONE event and removes both untouched halves.

- [x] Step 1: failing tests — (a) two jobs, same order, part 1 `in_progress`, part 2 untouched → week-end release leaves the ORDER alone; (b) SAP closes a split order, both halves untouched → both jobs removed, exactly one reconciliation event.
- [x] Step 2–4: implement, suite green.
- [x] Step 5: mutation — revert `_was_worked` to `.first()` → (a) fails.

### Task 5: The screens say it

**Files:**
- Modify: `frontend/apps/mobile/src/screens/shared/JobExecutionScreen.tsx` (worker's incomplete form: "hours left" numeric input, optional, sent as `remaining_hours`), `frontend/apps/web/src/components/work-planning/DailyReviewForm.tsx` + `frontend/apps/mobile/src/screens/engineer/DailyReviewScreen.tsx` (show worker's figure on the incomplete job; editable override sent as `remaining_hours` in the carry-over payload; render the returned `ripple` chain lines), shared API types.

**Interfaces:** additive only — old clients keep working (fallback chain covers a missing field).

- [x] Step 1: wire the three screens, bilingual labels (en/ar) per project rule.
- [x] Step 2: `npx tsc --noEmit` clean for web + mobile packages.

### Task 6: Verification and records

- [x] Full suite green (**650 passed**, 1 skipped). Realistic week driven through the real carry-over endpoint (3-man west PM wallet + 3-man defect wallet + shared east wallet; split RS110 PM; cascading Tuesday): dry-run chain == applied chain, 0 of 21 wallets overspent, week-end overflow returns its order to `pending` with the job row gone. **The run caught a live bug** — the merge was priced with the CARRIED job's crew while the day is charged for the CONTINUATION's, so the domino froze and Tuesday ran 26 of 24 past a movable lamp. Fixed (`merged_job.assignments`), regression test `TestTheDominoCountsTheRightCrew`, verified failing before the fix.
- [x] `CLAUDE.md` changelog updated (7.3KB, under the 8KB ceiling — no move needed); second-brain file `~/Documents/second-brain/raw/2026-08-25-inspection-app-evening-truth.md`; checkboxes ticked.
- [x] Report to Ali: what the review now does, what the migration needs on Render. NO commit — Ali's word.

## Self-review notes

- Coverage against the grill: worker states hours ✅ (T1), engineer override ✅ (T2), remaining-not-full ✅ (T2), merge-not-duplicate ✅ (T2), domino with box overflow ✅ (T3), chain visible before Submit ✅ (T3 dry_run + response), worked jobs immovable ✅ (T3d), split-aware lookups ✅ (T4), both platforms ✅ (T5).
- Deliberately NOT here: finished-early cleanup + the Telegram one-tap approvals (Plan 3); nested-package double-charge; INS/ACD direction.
- Risk: `create_carry_over` currently copies assignments and increments `carry_over_count` — keep both; merge path must not duplicate assignments on the reused job.
