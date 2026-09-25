# Filter audit — 2026-09-24

Ali: "some of the filters in the web app and maybe in the mobile are not working ... example
i try to find a user in the user page or shows error or nothing showing ... check all the
filter that can be used by a user, confirm they are linked and working and fix the ones not
working".

Three read-only audits (web A–L, web M–Z + components, mobile) traced every filter:
UI state → param sent → backend reads it → applied. Each item below is re-verified by me
before it is fixed.

## Cross-cutting — fixed
- [x] **Rate limit shared by the whole company.** `get_remote_address` + Render proxy, no
      ProxyFix → one bucket of 200/min for everyone, login 5/min for everyone. 429 on any
      screen at random. Now per user (`rate_limit_key`), ProxyFix x_for=1. 6 tests.
- [x] **Users search crashed on every query** — `User.employee_id` does not exist (it is
      `role_id`). Now searches name, Arabic name, email, username, employee no., SAP id,
      phone. Debounced. 9 tests.
- [x] **Cycles list read at the wrong depth** (`data.data.cycles`) — Cycles page, PM
      Templates cycle picker, Cycle Optimizer all always empty. Fixed at the shared type.
- [x] **Notifications**: search, date_from/date_to never read; only first type/priority
      sent. Server now reads all; page sends all. 7 tests.
- [x] **Approvals → Leave tab** called `/api/leaves/pending` (no such route, 404).

## Web — fixed
- [x] All Inspections: search ignored the typed text (only keywords) → leftover words match
      machine name (EN/AR), serial, code. Result/date/defects filters now reset to page 1. 5 tests.
- [x] Equipment page: search misses Arabic name; type filter exact+case-sensitive → partial,
      any case; both debounced. Health cards: Maintenance shows under_maintenance+paused,
      Critical and Certs Due show exactly the machines they counted (ids). Tests.
- [x] Equipment dashboard: risk filter hid every machine; last-inspection filter ignored;
      search promised serial/type/location; colour cards zeroed each other → server sends
      risk_level, last_inspection_date, serial, type, location; counts before the colour filter.
- [x] Inspection Assignments: filters searched only the 50 newest lists → filter first;
      status list covers mech/elec/both_complete + assessment_pending; dropdown choices no
      longer vanish after filtering. 3 tests.
- [x] Leaves page: status filter no page reset; "My Leaves" showed an admin everyone's (mine=true).
- [x] Approvals: Leave tab 404 (/leaves/pending); Approved/Rejected picker removed (inbox is pending-only).
- [x] Checklists: equipment-type filter exact → partial/any case (matches comma lists).
- [x] Engineer "My Jobs": admin saw every engineer's jobs (engineer_id now honoured).
- [x] Kanban/board views (All Specialist Jobs, All Engineer Jobs, My Jobs, QE reviews) showed
      one table page → page 1, up to 200.
- [x] Job pool: Defects tab ignored the berth; urgent sorted as normal (`0 || 2`). Same `0 ||`
      slip fixed in AI Recommendations (critical sorted last) and AI Insights card.
- [x] Materials: categories hydraulic/safety not allowed by the DB (filter empty, SAVE refused),
      hvac missing; Reservations tab 404 → GET /reservations and /<id>/reservations added.
- [x] Notifications: type picker offered 10 never-created types → built from real types
      (/api/notifications/types). Notification Analytics page 404 → /api/notifications/analytics.
- [x] Leaderboard: "All" ranked by all-time points whatever the period; inspector+specialist
      users listed twice; tables showed all-time points → period points, de-duplicated.
- [x] Work Plan Settings: restriction-type filter now honoured (see open question below).
- [x] Running Hours (helper): location/type/sort ignored, page reset, Export 404 → 20 tests.
- [x] Overdue (helper): table was 3 mock rows; ageing buttons crashed the server → real data. 11 tests.
- [x] Performance (helper): 6 cards called missing routes, user picker never appeared, goal
      tabs didn't filter, weekly/monthly always empty → fixed. 9 tests.

## Mobile — fixed (helper; 13 tests in tests/test_mobile_filters.py)
- [x] Load-more REPLACED the list on 9 screens (rows vanished while scrolling) → `usePagedList`
      (useInfiniteQuery) appends; filter change restarts at page 1.
- [x] Week overview never showed web-made plans (Sunday vs Monday week_start) → list_work_plans
      matches the plan whose range CONTAINS the date. 4 tests.
- [x] AdminUsers / LeaveApprovals load-more never fired (paging read at the wrong level).
- [x] Bonus approvals listed every bonus as pending; specialist Completed tab always empty
      (completed_at not sent); My Assignments counted only the 20 newest.
- [x] Monitor follow-ups "Scheduled" missed assignment_created; Overdue inspections tab asked
      for a status that does not exist; overdue defects ignored sla_overdue.
- [x] Notifications: Mentions/Groups called missing routes; filters only covered 20 rows;
      chips for never-created types → server-side search/type/priority + load-more.
- [x] Engineer job chips (verified never set; paused/qc_approved missing); Active tab missed paused.
- [x] Daily review used the UTC date (wrong day 00:00–03:00 Baghdad); Incomplete tab missed pending.
- [x] Arabic names in the communication user search and the defect inspector picker.
- [x] Equipment risk list always empty (read an envelope the API never sent) — fixed in the
      shared client, which also fixes the web Schedules page stat cards.
- [x] **Hidden crash:** monitor_followup to_dict read `equipment.equipment_number` (no such
      column) → every follow-up list with ≥1 row was a 500, web and phone.
- [x] Web defects equipment filter missed field/safety reports (equipment_id_direct).
- [x] Web notification drawer "grouped" view called the dead /groups route → reads /grouped.

## Open — Ali to decide / known limits
- Equipment restrictions: screen offers 5 types, DB allows 4 different ones (blackout is the
  only overlap) — saving any other type fails; and NO planning logic reads restrictions.
  Same Settings page as Capacity Rules / Worker Skills, which Ali deferred on 2026-08-08.
- Daily Review Day/Night: switch changes the review record, not the job list (jobs by date only).
- Performance cards: performance_ai_service reads monthly rows that are never written → many
  cards still "no data" (helper's warning). Needs the service to read daily rows.
- Overdue: other cards still fall back to mock data while loading/on error; rescheduling a
  defect does not clear "overdue" (overdue = created_at + SLA, not due_date).
- Users page sorts active-first on the current page only (harmless).
- Risk list (schedule_ai_service) sends no name_ar / last_inspection_date; `factors` is a list.
- AI similar-defects searches only the 500 newest defects.
