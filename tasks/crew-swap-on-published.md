# Changing the crew on a published plan — and a supervisor asking for it

Ali, 2026-09-23: "how the supervisor can change the employee already assigned to a
job, is the plan should be in edit mode or no issue if in publish mode???" then
"this need the admin or the planner approval".

## Decisions (all Ali's, 2026-09-23)
1. A PLANNER (engineer/admin) may change the crew of a job in a PUBLISHED plan
   directly — only while nobody has started it (`job_work_state(job) is None`).
   No Revise: Revise hides the whole week from every phone.
2. A job's SUPERVISOR who is not a planner (specialist/maintenance) may only ASK.
   Nothing changes until a planner approves.
3. Any engineer or admin approves. First press wins.
4. Requests appear in the Approvals page + a notification to planners.
   The page is admin-only today → engineers get it too, CREW SWAPS ONLY.
   Leaves/pauses/bonuses/takeovers stay admin-only.
5. The supervisor asks from the phone AND the web.
6. If the job starts while a request waits, the request cancels itself.

## Backend
- [x] `_assert_crew_editable(plan, job)` — draft: OK; published: job untouched.
      Used by `assign_user`, `unassign_user`, `assign_to_operation`,
      `unassign_from_operation`. `bulk_assign_users` stays draft-only.
- [x] On a published plan, a man added/removed is NOTIFIED (draft: publish does it).
- [x] Server leave check for the added man on the job's day (same conditions as
      `inspection_list_service`), on the direct swap on published AND the request.
- [x] Model `WorkPlanCrewChangeRequest` (`work_plan_crew_change_requests`):
      job, requested_by, remove_user_id?, add_user_id?, reason, status
      pending/approved/rejected/cancelled, reviewed_by/at, review_notes. At least
      one of remove/add. In `JOB_CHILD_TABLES`. `start.sh` CREATE TABLE.
- [x] `app/services/crew_change.py`: create / approve / reject / cancel. Approve
      re-checks pending + untouched (else → cancelled 'job_started'), removes (with
      `_clear_operation_assignments`), adds (replacement inherits is_lead).
- [x] Endpoints under work_plans: POST/GET `/jobs/<id>/crew-change-requests`,
      DELETE own pending, GET `/jobs/<id>/crew-change-options` (team + candidates
      with on-leave flag; the supervisor cannot read /users/for-assignment).
- [x] approvals.py: type `crew_change` in list/counts/bulk-action; engineers
      allowed but filtered to crew_change only.
- [x] `/start` cancels pending requests for that job + tells the supervisor.
- [x] Notifications carry `title_ar`/`message_ar` (the AI translation chain is dead).

## Web
- [x] Job Details: remove/add people on a published plan (not draft-only).
- [x] Approvals page: crew_change card; menu open to engineers; engineers see only it.
- [x] MyWorkPlanPage: jobs you watch + "Ask to change crew".

## Mobile
- [x] JobDetailsScreen: supervisor sees "Ask to change crew" + his pending requests.
- [x] en/ar strings.

## Tests
- [x] `tests/test_crew_change.py`.

## Review (2026-09-24)
- All items built. 30 tests; the two security-relevant rules (running line = started,
  engineer cannot act on a leave) verified by breaking them and watching the tests fail.
- Found during the build: the Approvals page was admin-only (asked Ali → engineers see
  crew changes only); operation timers do not touch job tracking (→ `job_has_started`).
- Not done on purpose: the board's drag on a published week (it also moves jobs) and
  bulk assign (planning, not correction).
- UNVERIFIED: the phone card on a real device; the Render log line
  `Created work_plan_crew_change_requests table`.
