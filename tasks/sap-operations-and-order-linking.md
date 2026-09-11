# SAP operations + linking a job to an order

**Status: ALL THREE PHASES BUILT 2026-09-11. Local, not pushed.**
Phase 2's budget split ships SWITCHED OFF — see below.
Raised 2026-09-10.

Ali's words:

> "in SAP there is an operation usually you can see him clear in the IW49 ...
> sometimes under a job or order you can do many sub jobs, example inside a
> general refurbishment order you can check the spreader, replace or repair
> harness, open telescopic chain ... also i need to be able to add a work order
> for a defect coming from the inspection or job created manual (can it be
> automatic) ... sometimes i make a manual job before i open the order in SAP
> then when i opened in sap i need a connection between them ... user should see
> the operations inside the order and he can deal with each same as he deal with
> the order i mean an order with many operations he should do 1 by 1"

---

## What I found before designing anything

### 1. The app ALREADY reads IW49 and throws the operations away

`app/services/sap_order_parser.py:326` — `parse_operation_hours(iw49_bytes)`.
It reads three columns, `['Order', 'Work', 'Unit for work']`, **sums the hours
per order, and discards every individual row.** From the docstring on the same
file: **56,131 real operation rows, averaging 2.56 operations per order.**

So this is mostly a matter of KEEPING data that already flows through the sync
every time, not of building a new pipeline. That changes the size of the job.

### 2. Re-numbering a manual job silently orphans everything attached to it — TODAY

**Proven, not guessed** (temporary probe against the real endpoints, since deleted):

```
BEFORE re-number: ['Check the spreader'] | anchor sap MAN-1-1
PUT /jobs/<id> {sap_order_number: '700000123456'} -> 200
AFTER  re-number: []                       | anchor sap 700000123456
rows still in table: 1
```

`update_job` (`app/api/work_plans.py:1245`) assigns `sap_order_number` blindly.
Sub-tasks, photos and voice notes hang on `anchor_for(job)`, which is derived
FROM that number — so changing it moves the anchor and the rows are left behind.
They still exist; the job simply cannot see them any more.

**This is exactly the operation Ali describes wanting to do.** It needs a guard
whichever design he picks.

### 3. Time tracking is one-per-job, by database constraint

`work_plan_job_trackings.work_plan_job_id` is `unique=True`. So "each operation
gets its own start / pause / complete / actual hours" is a much larger build than
"each operation gets its own tick". Question 1 below decides this.

---

## Recommended design (REVISED after Ali's answers below)

### The vessel: extend `work_plan_job_tasks`. Do not build a parallel table.

The first draft said "operations are just sub-task rows", and that was
conditioned on tick-only. Ali chose per-operation timers and a trade split, so an
operation now behaves like a small job. The vessel still survives — it grows.

Two things settle it:

1. Ali's own words: *"what will happen with the operation added manually"* and
   *"he can deal with each same as he deal with the order"*. A line HE typed and a
   line SAP sent must behave identically. One table with a `source` column gives
   that; two tables make "a manual operation" straddle both.
2. The anchor durability — surviving the pool, carry-over, split and
   `purge_job_rows`, plus `for_jobs` batching — is hard-won and debugged. A second
   table re-implements all of it. This table ALREADY holds mixed kinds rendered
   differently (text / photo / voice, split on mobile 2026-09-10); an
   `sap`-operation kind follows the pattern that is already there.

New columns, all nullable so a plain note never uses them:

| column | why |
|---|---|
| `source` `'manual' \| 'sap'` | Ali's lines and SAP's operations in one list |
| `operation_number` | SAP's `0010`, `0020` — the upsert key with the order |
| `work_center` | drives the trade split INSIDE the order |
| `planned_hours` | IW49 carries it per row; today it is summed and thrown away |
| `status`, `started_at`, `paused_at`, `total_paused_minutes`, `actual_hours` | the per-operation timer Ali asked for |

**Rejected: one `WorkPlanJob` per operation.** At 2.56 operations per order it
multiplies the board by ~2.5, breaks one-order-one-pool-row, and multiplies every
capacity and carry-over sum. The pool is a box of ORDERS.

### Assignment stays on the JOB, not the operation

The layout Ali approved shows *team* visibility ("Mechanical team sees / Electrical
team sees"), not per-person. So `WorkPlanAssignment` keeps working as it does — it
already takes several users of any trade — and the operation's `work_center`
decides which lines each man is shown.

This also settles a question that would otherwise bite: the task rows are anchored
to the ORDER, so anything stored on them persists across weeks. A person must not
(the electrician assigned in week 37 should not silently own it in week 40). A
half-finished timer SHOULD — half-done work is half-done. Keeping people off the
anchored rows gives both.

### Order state is DERIVED from its operations, never tracked twice

Everything downstream — carry-over, the day ripple, the Telegram finish button,
`/my-plan` — reads `WorkPlanJobTracking` at order level. That does not fork:

- first operation started ⇒ the order is started
- every operation done ⇒ the order can be finished
- order `actual_hours` = the sum of its operations' actual hours
- carry-over remaining = the planned hours of the operations still undone

### Mixed trades use the `ELME` that already exists

`work_center` already has `ELEC | MECH | ELME (both)` on both `work_plan_jobs`
and `sap_work_orders`. A mixed order is ELME at order level, and the per-operation
`work_center` does the filtering inside it.

### Merge is its own action, never a blind re-number

`POST /jobs/<id>/link-sap-order`, in one transaction:
1. the order must exist in `sap_work_orders`
2. **re-anchor the job's task rows** onto the new order — this is finding 2
3. set the number
4. mark the `SAPWorkOrder` scheduled into this plan, or the pool lists the same
   work twice and the chooser offers the job to itself
5. show his estimate beside SAP's sum, and **re-price the day with SAP's** (his
   answer 3)

### "Can it be automatic" — suggest, never auto-merge

On import, when a new order's equipment matches an unlinked manual or defect job,
a one-tap *"is this that job?"*. Never on description text: mixed Arabic and
English will mislink, and a wrong merge silently fuses two different jobs.

**Constraint Ali did not state:** the app cannot create an order inside SAP. The
flow stays *create in SAP → import → link*.

---

## Ali's answers, 2026-09-11

1. **Per-operation start / pause / finish, with real hours.** Not just a tick.
   Chosen knowing it is the bigger build (the one-timer-per-job constraint was
   stated in the question).
2. **Split by operation work centre.** The MECH operations belong to the
   mechanical team, the ELEC ones to the electrical team. One order, each team
   seeing only its own lines.
3. **"show both, sap hours win"** — display his estimate beside SAP's sum, and
   let SAP's number price the day.
4. **Always ask before linking.** Never auto-merge.

**These answers make an operation behave like a small job**, which weakens the
original "just a sub-task row" recommendation. Re-thought below.


---

## Phases

### Phase 0 — needs nothing from SAP, fixes a live bug
- the orphan guard (finding 2 — data is being lost today)
- `POST /jobs/<id>/link-sap-order` with re-anchoring, pool dedupe, and
  "show both, SAP hours win"
- the import-time "is this that job?" banner

This alone answers *"I make a manual job before I open the order in SAP"*.
**No IW49 columns required.**

### Phase 1 — operations (BLOCKED on a fresh IW49 export)
- sync keeps the operation rows instead of only the total
- per-operation start / pause / finish on the phone
- order state derived from operations
- ELME display, per-operation `work_center` filtering

### Phase 2 — trade-split capacity
`day_budget`, `_step_assign` and the generator all price at ORDER level today.
Charging MECH operations to the mechanical wallet and ELEC ones to the electrical
wallet is a real rework of the capacity maths. Deliberately last.

---

## Still open

1. **A fresh IW49 export.** The only fixture in the repo is synthetic and carries
   just the three columns the current code reads, so the real header names for
   operation number / short text / work centre are unknown. `_read_excel` selects
   BY HEADER NAME, so a wrong guess reads as empty and silent — no error, no data.
   **This blocks Phase 1.**
2. **SAP drops an operation that is half-done here.** Recommendation: keep it and
   flag it. Deleting loses the done-history. Not yet confirmed.

## Not to be forgotten

- The orphaning guard from finding 2 is worth doing on its own, whatever else
  happens.


---

## BUILT 2026-09-11 — what actually landed

Ali: "go all phases in line, i will be sleeping."

### Phase 0 — the live data-loss bug, closed
- `reanchor_job_tasks()` moves a job's notes/photos/voice BEFORE its order
  number changes. Wired into the new link endpoint AND into the plain
  `PUT /jobs/<id>`, because closing only the front door leaves the same loss one
  call away.
- `POST /jobs/<id>/link-sap-order` — order must exist, attachments move, the
  order leaves the pool, the day is re-priced with SAP's hours, both numbers are
  reported ("show both, sap hours win").
- `GET /jobs/<id>/link-candidates` — same machine, still in the box. Never
  matched on description: the yard writes in two languages and a wrong merge
  silently fuses two jobs.
- Web: `LinkSapOrder.tsx` in the Job Details window, manual jobs only.
- `tests/test_link_sap_order.py` — 10 tests.

### Phase 1 — operations
- `parse_operations()` keeps IW49's rows instead of only the total.
  **Every column is optional and matched loosely.** `rows_to_frame` RAISES on a
  missing column, so a guessed header name would take the entire pool sync down
  rather than skipping the operations. Worst case now: nothing imported, and the
  report lists the headers actually seen.
- `flask sap-operation-headers` prints a real export's columns so the guessing
  can end.
- `work_plan_job_tasks` gained `source`, `operation_number`, `work_center`,
  `planned_hours` and a timer (`status`, `started_at`, `paused_at`,
  `total_paused_minutes`, `actual_hours`). Schema via `start.sh`.
- `sync_order_operations()` upserts on (anchor, operation_number) and NEVER
  resets `is_done`, `status`, `started_at` or `actual_hours`. An operation SAP
  drops is KEPT and flagged when work was done on it, deleted when untouched.
- `POST /jobs/<id>/tasks/<task>/timer` — start / pause / resume / finish.
- `operations_progress()` DERIVES the order's state from its operations; the
  order's own tracking row is never written twice.
- Mobile `JobOperationsCard.tsx` — his trade first, the other trade folded away
  behind a count rather than hidden (a missing line reads as lost data).
- `tests/test_job_operations.py` (14) + `tests/test_sap_operations_parser.py` (9).

### Phase 2 — trade split, SHIPPED OFF
- `app/services/trade_split.py`. `team_pools()` now also builds `spec_mech` and
  `spec_elec` from the `defect_mech` / `defect_elec` rules that already existed —
  today both are merged into one `spec` wallet, and that merge is what collapses
  the two crews.
- **`TRADE_SPLIT_BUDGET` defaults OFF.** With it off, `_job_wallet_key` returns
  `spec` exactly as before; the first test class proves nothing moves.
- The NUMBERS are exposed regardless, in the task payload (`trade_split`), so the
  board can show "MECH 6.0h / ELEC 3.0h" — the useful half, and safe.
- An ELME order with no operations is reported UNSET, never guessed onto a crew.
- `tests/test_trade_split.py` — 11 tests.

**Why off:** Ali asked for a VISIBILITY split; the budget split is my inference.
It re-prices every day in every week and feeds the generator, the ripple, the
Telegram proposals and the board's warnings. Switching that on for a real yard
with nobody watching is not a side effect a deploy should have. One env var
turns it on, and it should be watched for a week.

**Do not switch it on** until both `defect_mech` and `defect_elec` rules exist
for a berth — a crew with no rule gets an empty wallet, which reads as no hours.

### Totals
1090 backend tests, 32 web tests, mobile tsc clean in every file touched
(5 pre-existing errors elsewhere).

### STILL BLOCKED
A real IW49 export. Until one arrives with recognised headers, `parse_operations`
imports nothing and every order behaves exactly as it does today — the operations
UI simply does not appear. Run `flask sap-operation-headers` on Render once the
file is in place.
