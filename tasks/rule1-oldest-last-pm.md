# Rule 1 — oldest last PM breaks ties (Ali, grilled 2026-11-27)

## Decisions
1. Goal: fewer breakdowns from hidden damage, no machine forgotten. The app decides.
2. Among jobs with the SAME score, the machine with the OLDEST last finished PM goes first.
3. Scores, priorities, colours never change. Overdue/urgent always win first.
4. Tie order: overdue hourly PRM (most hours) -> most days late -> oldest last PM (new).
5. Hourly PRM beats faults at 100 — kept as today.
6. A visit = a finished PM (PRM) only. A fault fix does not reset the clock.
7. A machine with a code but no PM in IW39 = away the longest -> first among ties.
   No machine at all (orphan job) or a name with no plant code -> last (neutral).
8. Shown in Job Details only: grey "Last PM: 95 days ago (2026-08-24)".
9. All order types get it — the date belongs to the machine.

Left open: machines with nothing open (a later decision); a "too long" day limit.

## Build
- `sap_order_parser.build_last_pm_by_machine(iw39)` — MES, PRM, finished, newest
  `Actual Order Finish Date` per plant code from `Functional Location`.
- `app/services/last_pm.py` — save/load `uploads/sap_sync/last_pm.json` (persistent
  disk, atomic write, never fails a sync or a generate); `machine_code(name)`.
- Nightly sync saves it (not on dry run); report gets `last_pm: {machines, oldest, newest}`.
- Generator `_step_bundle` stamps `bundle['last_pm']`; `_urgency_key` adds a 4th element.
- `GET /api/last-pm` (own file, PLANNING_ROLES); web `LastPmLine` in Job Details; EN/AR.

## Verify
- Tests fail on the old code (swap from scratchpad).
- After deploy + the nightly sync: report `last_pm.oldest` says how far back IW39 reaches.
