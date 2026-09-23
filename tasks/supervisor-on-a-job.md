# A supervisor for a job — 2026-09-23

Ali: "we need to have the option to have supervisor for the job, is it already
thier?"

Partly. Three things existed and none was a supervisor:

| Existing | What it really is |
|---|---|
| `WorkPlanAssignment.is_lead` | The senior man **doing** the work. A worker. |
| `WorkPlanJob.engineer_id` | Nullable FK, engineer/admin only, editable in Job Details. **A pure label — nothing in the backend reads it.** |
| 685 `MES-SUPV` operations | SAP's supervision lines. Shown to everyone, nobody ever named on them. |

## What Ali chose

**"Watches over it — not one of the workers."** He is responsible for the job,
does none of its lines, sees it on his phone, is told when it starts and
finishes, and appears on the board.

And: **anyone senior may supervise** — engineers, admins, specialists,
maintenance. Not only engineers. (His answer, 2026-09-23. SAP's 685 supervision
operations suggest supervision is real yard work, not only an engineer's desk
job.)

## Decision: REUSE `engineer_id`. Do not add `supervisor_id`.

Nothing reads it functionally — proven by grep: `job_showup.py` touches
`EngineerJob.engineer_id`, a different model. Its existing values were set
through a form meaning "the engineer responsible", which is semantically what
Ali just described.

A second person-who-watches column would be two records of one fact, which this
codebase keeps refusing (order state derived from operations; an operation's
assignee list a subset of the order's).

**The API field name stays `engineer_id`.** Renaming the wire contract buys
nothing and breaks the mobile payload until an OTA. Only the DISPLAY changes.

## The trap: he must NOT become a worker

Do **not** give the supervisor a `WorkPlanAssignment` row. That would count him
in `bundle_man_hours`, the day budget, `_step_assign`, the board avatars and the
"unassigned" counts. Ali said it plainly: *not one of the workers*.

His phone gets a **separate read path**, visually distinct: jobs you WATCH, not
jobs you DO.

**The invariant to pin in a test: naming a supervisor changes no day cost and no
assignment count anywhere.**

## Work, in order of risk

1. **Relabel + board display** — zero risk, visible immediately.
   - Widen validation to engineer/admin/specialist/maintenance
   - Job Details form item: "Engineer" -> "Supervisor"
   - 👁 + name on the job card
   - `supervisor` / `المشرف` in shared i18n

2. **Notifications** — `notify_engineers_for_job` fires only on **pause** today.
   Start/finish notifications do not exist for anybody, so these are NEW calls.
   - Notify plan creator **+ the job's supervisor, deduped** (he may BE the
     plan creator; one event must not notify one person twice)
   - Add calls at `/start` and `/complete`; check `admin-complete`
   - Use the existing notification translation path — do not invent one
     (GROQ is 401, Arabic falls back to English)

3. **His phone** — `/supervised-jobs`, week-scoped, `engineer_id == user.id`,
   its own card. **Needs an OTA, so ship last** and one OTA carries it.

## Deliberately NOT built

The **685 SUPV operations stay team lines**. Ali chose option A (a named
watcher), not option B (supervision is a line someone owns). If he later wants
the supervisor to take the SUPV lines automatically, that is a small addition on
top of the per-operation assignment that already exists.
