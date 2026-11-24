# Splitting `app/api/work_plans.py` — option C (bit by bit)

**Decided by Ali, 2026-11-25.** Knot report 2026-11-24, knot 4.

> "for knot4 use option c, always make sure nothing break, and after each change
> tell me how much done from the plan"

## The rule (C)

1. **New work-plan features go into their own file**, never into `work_plans.py`.
2. **Before changing a topic that still lives in `work_plans.py`, move that topic out
   first** — as its OWN step, checked on its own — and only then make the change.
3. Topics nobody touches stay where they are. No big-bang move.
4. **Never move and change in the same step.** A move is cut-and-paste only.
5. **After every move, report progress to Ali** using the table at the bottom
   (topics moved, routes moved out of 122, lines left in `work_plans.py`).

## The map (where each topic goes)

Routes keep the SAME front desk (`bp`, registered at `app/__init__.py:228` with
`/api/work-plans`) and the SAME function names, so URLs and internal names never change.

| Topic | New file | Routes |
|---|---|---|
| Week plan: list/get/create/update/delete, publish, revise, versions ×3, copy week | stays in `app/api/work_plans.py` | 11 |
| Worker's phone view `/my-plan` | `work_plans_my_plan.py` | 1 |
| Jobs on a day: add, schedule SAP, update, link order ×2, remove, details, move, split, materials ×2, dependencies ×3, classify | `work_plans_jobs.py` | 15 |
| Bulk move/delete/priority/assign | `work_plans_jobs_bulk.py` | 4 |
| Crew: assign, unassign, crew-change ×4 | `work_plans_crew.py` | 6 |
| Tasks, notes, photo/voice, timer, operation assign ×2 | `work_plans_tasks.py` | 8 |
| Job checklist ×3 | `work_plans_checklist.py` | 3 |
| Generate, reject, score, preview, auto-schedule, conflicts ×3, validate | `work_plans_generation.py` | 9 |
| All `/ai/...` | `work_plans_ai.py` | 20 |
| Import SAP, clear pool, available jobs, template downloads ×2 | `work_plans_sap_import.py` | 5 |
| Day/week inspections, inspection equipment | `work_plans_inspections_view.py` | 3 |
| PDF ×3, reports ×4, email ×2 | `work_plans_exports.py` | 9 |
| Job templates (+ materials, checklist) | `work_plans_job_templates.py` | 11 |
| Capacity ×4, skills ×6, equipment restrictions ×4 | `work_plans_settings.py` | 14 |
| Debug, cleanup duplicates, clear jobs | `work_plans_admin_tools.py` | 3 |

That is 14 topics to move out (111 routes); the week plan's 11 routes stay.

**Shared rules go to `app/services/` or `app/utils/`, never door-to-door.** A route file
must never import another route file. Rules still borrowed from `work_plans.py` today:
`job_work_state` (4 services), `_assign_user_to_job` (crew_change), `engineer_or_admin_required`
(sap_sync ×3). Move each one the first time its topic moves.

Already done (2026-11-25): roles → `app/utils/roles.py`; hand-typed-job rule →
`app/utils/manual_jobs.py`; night availability → `day_budget.unavailable_by_date`.

## The checks for EVERY move ("make sure nothing breaks")

1. **Route photo before and after** — every URL + method + endpoint name from
   `app.url_map`. The two lists must be IDENTICAL.
2. **Cut-and-paste only** — `git diff --color-moved` shows only moved lines plus imports.
3. **Full backend suite** — same tests pass, same count. Only allowed test edit:
   re-pointing an address (`app.api.work_plans.X` → its new home).
4. **Every mock re-pointed and proven** — a `mock.patch` aimed at the old address passes
   while testing nothing. Break the moved code on purpose; the test must fail.
5. **No import loops** — the app must start (`create_app('testing')`) after the move.
6. **`git diff --stat` after each edit** — a formatter hook once rewrote a whole file
   (lessons.md, 2026-11-25).
7. **Web `tsc` + web tests** if anything the web reads changed (a pure move changes nothing).
8. Commit the move ALONE, then the feature in its own commit. Ali approves each push.

## Progress

Starting point 2026-11-25: `work_plans.py` = **8,036 lines, 122 routes**, 0 of 14 topics moved.

| Date | Topic moved | Topics (of 14) | Routes moved (of 111) | Lines left in work_plans.py | Checks |
|---|---|---|---|---|---|
| 2026-11-25 | — plan written; 3 shared rules already moved during knots 1–3 | 0 | 0 | 8,036 | — |
