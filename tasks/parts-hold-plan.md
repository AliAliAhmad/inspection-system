# Plan — hold work that is waiting for parts (2026-11-28) — APPROVED, a/b/c/d all YES

Status: steps 1-2 BUILT (shadow, not pushed). Steps 3-4 wait for one night's numbers.

Replaces Steps 1-4 of `tasks/bites-reader-plan.md`. Steps 2 and 3 there are
DROPPED: the 2026-11-28 sync measured IW39 at +69 MB, peak 309-367 MB of 537.

## Goal
The planner stops placing work that cannot be done because a part has not arrived.
- Machine NOT available in the planners' mail + an order waiting for parts -> hold the WHOLE machine.
- Machine available + an order waiting for parts -> hold ONLY that order.
- The board says WHY, so the planner can still drag it in by hand.

## The finding that may make this smaller (NOT yet proven)
IW49 already gives, every night, the PR on each operation of every open order the
app knows (`work_plan_job_tasks.purchase_requisition`, 314 lines flagged today).
UNPROVEN: (1) that every ME5K PR also appears on an IW49 operation; (2) that the PR
stays on the IW49 line after the PO / goods receipt. Step 2 MEASURES both.
Meanwhile Ali's rule "remember every ME5K row" is KEPT — in a JSON file on the
persistent disk (`parts_links.json`), so still **no new table / no schema change**.
The PR ITEM is not stored on operations today; it is taken from IW49 rows during the
sync (`Item of Requisition` is already matched by the parser).

## Facts (real headers, 2026-11-24 files)
- ME5A: `Purchase Requisition`, `Item of Requisition`, `Purchase Order`, `Deletion Indicator` ('true'/'false'). No PO item. 23,385 rows.
- ME2L: `Purchasing Document`, `Item`, `Still to be delivered (qty)`, `Deletion Indicator`. First data row is a TOTALS row (empty document). ~27,000 lines.
- ME5K (label OTHER, find by name `ME5K ytd.XLSX`): `Order`, `Purchase Requisition`, `Item of Requisition`, `Purchase Order`, `Purchase Order Item`. 71 rows.

## The chain
1. order -> PR + item: IW49 rows in the sync, plus ME5K rows (today's + remembered).
2. PR+item -> cancelled? and PO: ME5A (and ME5K's PO when present).
3. PO+item -> still to deliver / cancelled: ME2L.
4. Decide with `app/services/parts_status.py` (built, 26 tests).

## Steps
### 1. Light reader that filters while it reads (~2 h)
`stream_rows(path, wanted_columns, keep=...)` beside `_stream_excel`: reads from the
FILE on disk (not bytes in memory), keeps only named columns, and drops a row the
moment it is not wanted. Only PRs of known orders (~hundreds) and their POs are kept
out of 23k / 27k rows. openpyxl may still load the file's shared-text list, so the
real cost is MEASURED by the memory marks, not assumed. Header names matched like today.

### 2. Nightly parts status (~4 h)
In the nightly sync, after operations are stored: build order -> status
(waiting / check / clear, with the part names and PO numbers) and save
`uploads/sap_sync/parts_status.json` on the persistent disk (same pattern as
`last_pm.json`). A file missing -> no status -> nothing held (never a silent block).
Report key `parts` + memory marks. Tests on rows shaped like the real files.
**Shadow first:** the report also counts ME5K PRs found / NOT found on IW49 lines,
PRs whose IW49 line lost its PR, and lines per PO in ME2L. Steps 3-4 wait for one
night of these numbers. Then Ali decides whether ME5K memory can be dropped.

### 3. Board shows it (~2 h)
Orange "Waiting parts" tag on pool/day cards and Job Details: which part, PR, PO,
"ordered / not yet ordered". "Check" shows a grey "Parts?" tag. EN/AR.
The phone's amber "waiting on material" today means only "a PR exists" — fixing the
phone needs an OTA; not in this plan.

### 4. Generator holds (~4 h)
In `_step_populate` (where candidates are gathered): drop held orders/machines using
the rule above + `eqt_availability`. The generator summary lists them:
"Held for parts: 7 orders (2 whole machines)". Drag-by-hand still works.
NOT covered (they place work by other doors): Telegram urgent / `place_one`,
`crew_free`, carry-over of work already on a day. Those keep today's behaviour;
a held machine can still arrive through them. Named here so nobody assumes otherwise.

## Decisions needed from Ali before Step 4
a) No fresh availability mail (> 3 days) -> hold ONLY the order? (built so; recommend YES)
b) Mail says waiting parts, SAP says received -> plan it + warning? (built so; recommend YES)
c) ME5A has no PO item. When ME5K does not give it, judge by the WHOLE PO:
   every line delivered -> received; any line still open -> waiting. Recommendation
   waits for Step 2's count of lines per PO: if most POs have 1 line, YES; if many
   POs mix several jobs, this would hold work for someone else's part.
d) PR in IW49 but not in ME5A (e.g. last year's PR, ME5A is "YTD") -> "check", not held. (recommend YES)

## Risks
- ME5A/ME2L are YTD: on 1 January last year's PRs/POs vanish -> they become "check",
  never held. Courier should send rolling 12 months (already asked for IW39).
- ME2L may be days old -> a part that arrived today still shows waiting. Status shows
  the file date; courier should send it daily.
- Wrong match = a job held that could be done. Mitigation: the planner sees the
  reason and can drag it in by hand; the summary names every held order.

## Verify
- Each step: tests that fail on the old code; full suite; tsc.
- After push: one nightly run -> `parts` report: orders waiting / check / clear,
  and peak memory still under ~400 MB. Spot-check 3 orders against SAP with Ali.

## Total: about 1.5 days. Each step pushes on its own.
