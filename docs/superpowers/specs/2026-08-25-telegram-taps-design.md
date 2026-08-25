# Telegram taps — a bot that asks, not only tells — design

**Date:** 2026-08-25
**Status:** Draft — approach approved (Way 1, one shared question table), spec pending review
**Scope:** Backend (Telegram + planning) and one mobile button. No web planner changes.

## Problem

The bot can talk. It cannot ask.

Everything it sends today is a statement: the 06:00 and 16:00 day pushes
(`app/services/telegram/push.py`), the answers to `/plan`, `/pool`, `/sap`. The
one command that changes anything, `/generate`, is typed by a human who already
decided. Nothing the bot sends can be answered with a finger.

Two moments in the working day need exactly that, and both are moments where the
plan is wrong and somebody with a phone could fix it in one second:

1. **An urgent order has nowhere to go.** The nightly SAP rebuild finds an
   urgent order that is still open and not on any live plan. The day it belongs
   on is full. Today the order simply waits in the box and nobody is told.
   `app/services/day_ripple.make_room` already knows how to slide the least
   important untouched job forward to make room — but nothing ever asks whether
   it should.

2. **A crew finished early.** The plan gave them six hours of work; they were
   done in three. Today nothing notices — every wallet, the generator and the
   domino all price a day by `estimated_hours`, so a fast crew releases nothing
   anywhere in the system. The hours are simply lost.

## Decisions (confirmed with Ali, 2026-08-25)

### Both flows

| Question | Decision |
|---|---|
| Who receives the question? | **All active admins + engineers** who are also on the Telegram allowlist. Same set as `sap_removal_rules._planners()`. |
| Who may press? | **Any admin or engineer. First press wins.** Same roles as `/generate` (`generate.PLANNING_ROLES`). |
| What happens to the other phones? | Their copy of the message is **edited** to show who decided and what they chose. The buttons disappear. |
| Language | Arabic or English **per recipient**, from `users.language` — the proactive-push rule (`push._language_for_chat`), because a pushed message has no incoming update to read a phone's `language_code` from. |

### Urgent order with no room

| Question | Decision |
|---|---|
| Message shape | **One message** carrying both the plain words and the buttons. Everyone can read what happened even if nobody presses. |
| Buttons | **Yes** (apply the domino and place it) / **No** / **Pick a day**. |
| How long do the buttons live? | **Until the next night's check.** Each nightly run closes the previous night's open questions and raises fresh ones from the current SAP picture. |
| Pressing No | The order stays in the box. **Tomorrow night it asks again**, as long as it is still urgent and still open. You cannot forget it. |

### Crew finished early

| Question | Decision |
|---|---|
| How is "free" detected? | **Both**: automatically when the crew's last job of the day is completed, **and** a new "I am free, send me more work" button in the mobile app. |
| Time of day gate | **None.** Any time. (This overrides the earlier "only after a set hour" answer — Ali's later answer wins.) |
| What is offered | The **best 3 jobs from the box**, on the same berth, small enough to fit the man-hours the crew really has left, plus a "no thanks" button. |
| How are "hours left" measured? | **By what the men actually did.** Each man has 8 hours; take away the hours he really worked today. The day's planning wallet is *not* consulted — see "The two producers → B". |
| Who does the offered job? | **The same men who just finished**, by default. One more button — **Swap crew** — hands it to another team on that day instead. |
| Who decides | The engineer, never the worker. The worker's app button is a **request**, not a placement. |

### Crew finished early — decided 2026-08-25, second round

| Question | Decision |
|---|---|
| **The number in the message** | **Clock hours, with the crew size** — "5 hours left today (2 men)", NEVER "10 hours". Ali: *"the job should be 5 hrs not 10 hrs unless the job is counted # of employee * job estimated hrs."* He is right, and both numbers are true: two men who each have 5 hours left hold 10 man-hours of work. The arithmetic stays in man-hours because that is how a job is priced; the MESSAGE says clock hours, because at eleven in the morning "ten hours left" is a number nobody can work. |
| A job too big for the hours left | **Offer it anyway** — they start it, and tonight the worker states the hours remaining and the evening carry-over moves the rest to tomorrow. Two rules on top: (1) jobs that FIT are always offered first — finishing something beats starting something; (2) a job that does not fit is offered only when nothing fits, and the message says so plainly: *"this needs 16 hours, they have 5, the rest carries to tomorrow."* |
| A too-big job and tomorrow | **Accepted, eyes open** (Ali chose this over two safer options after seeing the consequence spelled out). Two men with 10 man-hours free given a 16 man-hour job work their 10, and 6 man-hours carry to tomorrow — so **the domino is not avoided, it is delayed by one day**: nothing moves today, and tomorrow's carry-over fires it if tomorrow is full. Rejected alternatives: offer only what fits; offer a too-big job only when the leftover is small. |
| Does the free-crew placement itself run the domino? | **No — and not because the check is skipped.** The free hours are counted from what the men REALLY did, and only jobs fitting those hours are offered, so the room has already been proved before the phone buzzes. Running the domino here would read the day's wallet, which still counts the hours the plan GUESSED, decide the day is full, and push somebody's work aside to make room that already exists — punishing the crew for being fast. |
| Splittable PMs (the reach stacker) | **No special fence.** A 12-hour PM may be started by a free crew like anything else. Ali declined the proposed guard. Recorded consequence, accepted: a 12h reach stacker started with 5 hours left leaves a ~7h remainder on tomorrow's plan, and if tomorrow is full the domino will push another job aside for it. |
| Nothing in the box fits at all | **Say so anyway** — a plain message, no buttons: the men are idle and that is worth knowing. Once per crew per day, so a crew that finishes early every morning does not buzz every morning. |
| Two crews free at once, same best job | **A job in an open question is never offered in another.** Safe over optimal: nobody can press a button that fails. Recorded cost, accepted: if the first crew's question is never answered, that job stays hidden from the second crew until the question dies at the end of the day. |
| What the message says | Names, what they finished, and the hours left: *"Hassan and Omar finished RS110 250HR SERVICE early. 5 hours left today (2 men)."* Deliberately NOT how much faster than the plan they were — that turns every message into a quiet scoreboard about named men. |

### Explicitly NOT in scope (YAGNI)

- Any web planner UI for these questions. The web planner already lets an
  engineer do all of this by hand; this feature is for the phone.
- Free-text replies to the bot. Buttons only.
- A Telegram id column on `users` — the env-var allowlist
  (`TELEGRAM_ALLOWED_USERS`) stays the only mapping, exactly as today.
- Re-asking a "crew is free" question after it expires. It dies with its day.
- Nested PM package double-charging, the INS/ACD fault-price direction, and
  ranking within urgent — all still open in `CLAUDE.md`, all untouched here.

## Architecture

Three new pieces, one shared by both flows.

```
  producers                    the question box                consumers
  ─────────                    ───────────────                 ─────────
  nightly SAP rebuild  ──┐                                  ┌── Telegram tap
                         ├──►  TelegramProposal        ◄────┤   (callback_query)
  job completed        ──┤       + ProposalMessage         └── nightly expiry
  mobile "I am free"   ──┘            (one per phone)
                                          │
                                          ▼
                                   apply(proposal, option)
                                   ├─ urgent_needs_room → make_room + place_one
                                   └─ crew_is_free      → place_one
```

### 1. The question box — two tables

`app/models/telegram_proposal.py`, modelled directly on
`app/models/sap_reconciliation_event.py` (same shape: a `status` with a CHECK
constraint, a free-form `details` JSON, a human-readable `summary`, and
`notified_at` kept separate from `status` because a question can be delivered
and still be open).

**`telegram_proposals`** — one row per question asked.

| Column | Type | Why |
|---|---|---|
| `id` | int PK | |
| `kind` | str(40), indexed | `urgent_needs_room` \| `crew_is_free`. Chooses which apply function runs. |
| `summary` | text | The one line a person reads. Built at ask time, in both languages via `details`. |
| `details` | JSON | Everything the apply step needs: order number, target day id, berth, wallet key, man-hours, the domino chain that was simulated, the candidate job list. Free-form on purpose — the useful fields differ per kind, exactly as in `SapReconciliationEvent`. |
| `options` | JSON | The buttons, in order: `[{"key": "yes", "label_en": ..., "label_ar": ..., "action": "apply"}, ...]`. The button carries only an index into this list, so nothing secret or long ever travels in `callback_data`. |
| `work_plan_id` | FK, nullable | Which plan it would change. Nullable, like the reconciliation event. |
| `target_day_id` | FK to `work_plan_days`, nullable | |
| `status` | str(20), default `open`, indexed | `open` \| `accepted` \| `declined` \| `expired` \| `failed`. CHECK constraint. |
| `decided_by_id` | FK to `users`, nullable | Who pressed. |
| `decided_option` | str(40), nullable | Which key they pressed. |
| `decided_at` | datetime, nullable | |
| `expires_at` | datetime, indexed | After this the buttons are dead. |
| `result` | JSON, nullable | What actually happened when applied — the real domino chain, the created job id. The audit trail. |
| `created_at` | datetime, indexed | |

**`telegram_proposal_messages`** — one row per phone the question landed on.
This table exists for one reason: **to grey out the other seven copies.**
`TelegramClient.send_message` already returns Telegram's result dict containing
`message_id`, and today **no caller keeps it** (`send_chunks` only counts).

| Column | Why |
|---|---|
| `proposal_id` FK, `user_id` FK, `chat_id` bigint | who and where |
| `message_id` bigint, nullable | the id to edit later; nullable because a send can fail |
| `language` str(2) | so the edit is written in the same language as the original |

### 2. The tap catcher

Today a tap would pass every security gate and then vanish:
`app/services/telegram/dispatcher.py:141` reads `update.get('message')`, a
callback has none, so `handle` returns `[]` and `app/api/telegram.py:95`'s
`if chunks:` sends nothing. The spinner on the phone turns until Telegram gives
up. No error, no log.

- New module `app/services/telegram/taps.py` with
  `handle_callback(update, user, client=None)`.
- `app/api/telegram.py` `run()` branches: `callback_query` present →
  `handle_callback`, otherwise the existing `handle`. Both stay inside the
  ack-then-thread pattern; nothing about the four gates changes, because
  `resolve_sender` and `chat_id_of` already read `callback_query`
  (`auth.py:69-70, 95`) and `setWebhook` already subscribes to it
  (`client.py:114`).
- Two new methods on `TelegramClient`, both one-liners over the existing
  `_call`: `answer_callback_query(callback_query_id, text=None)` and
  `edit_message_text(chat_id, message_id, text, reply_markup=None)`.

**Order of operations inside `handle_callback`:**

1. **Exactly one `answerCallbackQuery`, at the end, in a `finally`.** Telegram
   accepts only one answer per press, so answering first would stop the spinner
   sooner but make it impossible to say what happened afterwards. Answering
   last, guaranteed even when the apply step raises, means every press gets a
   truthful toast. The work between is a handful of queries; the spinner turns
   for well under a second.
2. Role gate: `user.role in generate.PLANNING_ROLES`. Refuse anything else with
   a toast. The allowlist says who may talk to the bot; the role says who may
   change the plan — `generate.py:16-17` already draws that line
   ("the bot must never be a way around a permission"), and a tap must obey it.
3. Claim the question (below).
4. Apply, then edit every message row.

### 3. First press wins — the claim

```sql
UPDATE telegram_proposals
   SET status = :new, decided_by_id = :uid, decided_option = :key,
       decided_at = :now
 WHERE id = :id AND status = 'open' AND expires_at > :now
```

Whoever's `UPDATE` reports one changed row won. Everyone else reads zero and
gets a toast saying who already decided. This is the real guard, and it is
stronger than update-deduplication: it also protects against **two different
people** pressing at the same moment, which no `update_id` cache ever could.

Production runs two gunicorn workers, and the existing duplicate-update cache
(`app/api/telegram.py:39-41`) is in-memory and per-worker. Its own comment says
*"It gets promoted to a table before any command mutates."* This design meets
that promise a different way — the atomic claim makes the mutation idempotent
regardless of how many times an update is delivered or which worker gets it.
**Recommendation: keep the in-memory cache as it is and correct that comment**,
rather than adding a table that would not make anything safer. Flagged here
because it is a deliberate departure from what the code says it will do.

### 4. "Pick a day" without a second question

Pressing **Pick a day** does not create a new proposal. Its option carries
`"action": "expand"`; the handler leaves `status = 'open'`, **appends** one
option per day that could take the work to the end of `options`, and edits
**the presser's own message only** to show the new buttons. Pressing a day
option then applies normally.

`options` is **append-only, never rewritten.** The other phones are still
displaying buttons whose `callback_data` carries a position in that list;
renumbering it would silently turn somebody else's "No" into "Tuesday". This is
the one rule that makes an index safe to put in a button at all.

### 5. Language

Each recipient's copy is written from `users.language`
(`push._language_for_chat`), not from the phone's `language_code`. A pushed
message has no incoming update to read a `language_code` from — this is the
existing rule for the 06:00 and 16:00 pushes and it applies unchanged. The
language is stored on the message row so the later edit matches the original.

Bilingual strings follow the module-local `{'en': ..., 'ar': ...}` dict plus a
`_t()` helper, exactly as `dispatcher.py`, `generate.py`, `renderer.py` and
`push.py` all do. No new i18n mechanism.

### 6. Expiry

- `crew_is_free` expires at the **end of the day it is about**. It dies with its
  day and is never re-asked.
- `urgent_needs_room` expires at the **next nightly run**. The nightly job's
  first act is to expire every still-open `urgent_needs_room` row, then raise
  fresh questions from the current SAP picture. So "press No" and "ignore it"
  converge on the same place — the order sits in the box and is asked about
  again tomorrow night — with one difference: **No** edits the message
  immediately so everyone can see a human decided, rather than the question
  quietly rotting.
- A tap after `expires_at` fails the claim's `expires_at > :now` clause and gets
  a toast saying the question is old.

### 7. Failure

Every Telegram call already returns `None` on failure and never raises
(`client.py:59-86`) — there are no retries anywhere in this codebase and this
design adds none. Consequences, stated plainly:

- **A send fails.** That recipient's `message_id` stays `NULL`. The question is
  still open and everyone else can still answer it. Nothing is lost.
- **An edit fails.** The plan change already happened; one phone is left showing
  stale buttons. Pressing them hits the claim, finds the row decided, and gets
  the "already decided by X" toast. Wrong-looking, never wrong-acting.
- **The apply step raises.** The plan changes and the claim are one
  transaction, so both roll back together and the plan is untouched. A second,
  separate transaction then writes `status = 'failed'` with the error in
  `result`, and the presser gets a toast with the reason. Two transactions on
  purpose: the record of the failure must survive the rollback that caused it.
  A `failed` row is re-askable — the nightly run treats it exactly like an
  expired one.

## The two producers

### A. Urgent order with no room — nightly

Appended **inside** `rebuild_pool_nightly`
(`app/services/scheduler_service.py:973`), after
`report = sync_pool_from_delivered_files()` and still inside the
`CrossWorkerLock(app, 'sap-pool-rebuild')` block. At that point the box is
current: dead-week carry-over and removal reconciliation have already run, so
`SAPWorkOrder.status == 'pending'` is exactly the outstanding work. Being inside
the lock means the other gunicorn worker cannot raise the same question twice.

New service `app/services/urgent_watch.py`:

```
expire_open(kind='urgent_needs_room')      # last night's questions die first
for order in urgent_orders_in_the_box():   # pending, work_plan_id IS NULL
    plan = plan_for_week(planning_today())
    days = [d for d in plan.days if d.date >= planning_today()]   # never the past
    cost, berth, wallet_key = price_one(order)
    day = first_day_that_fits(days, cost, berth, wallet_key)
    if day is not None:      continue      # it fits; the next generate will place it
    target = days[0]                       # the earliest day it *should* go on
    chain = make_room(plan, target, cost, berth, wallet_key, dry_run=True)
    if not chain:            continue      # nothing can move; asking is pointless
    ask(kind='urgent_needs_room', ...)
```

"Urgent" is `_is_urgent_bundle`'s rule, not `_is_high_urgency`'s — the two
disagree about `priority='high'` (`_is_high_urgency` counts it, the bundle
version does not). `_is_urgent_bundle` is the one that already drives placement,
so it is the one that decides whether an order is worth a phone buzz.

The chain from the `dry_run=True` call is stored in `details` and printed in the
message, so the words say exactly which job would move where. On accept,
`make_room` runs again with `dry_run=False`. It is **not** assumed to return the
same chain — the plan may have changed since the ask — so the applied chain is
what gets written to `result` and shown in the edited message.

### B. Crew finished early — on completion

Hook in `app/api/work_plan_tracking.py` `complete_job` (line 416), placed
**after `db.session.commit()`**. There is nothing else on that path today: no
notification, no event, no hook — `notify_engineers_for_job` exists but its only
caller in the whole repo is `pause_job`.

CORRECTION, 2026-08-25 (final review, finding C3). This section originally said
"before `db.session.commit()`", and that was wrong. The hook talks to Telegram —
one synchronous POST per planner, 15s timeout each, up to 8 recipients — and
`ask()` commits. Before the commit, that meant a man's completion held an open
transaction while the server waited on api.telegram.org: an outage turned one
tap on Finish into a ~2 minute hang, his phone gave up, retried, and the retry
answered `Cannot complete job in 'completed' status` — a failure message on a
job that had in fact completed. It also collapsed the request's atomicity,
since `ask()`'s commit split the defect auto-resolve into a second transaction.

After the commit, the man's work is safe before anybody picks up the phone.
Guarded by `TestTheManIsSavedBeforeAnybodyPhonesTelegram` in
`tests/test_crew_free.py`.

ACCEPTED RESIDUAL: the request still blocks on Telegram, it just no longer
holds a transaction or risks the man's work while it does. Moving the send to a
background thread is deliberately NOT done here.

Plus a new endpoint for the mobile button:
`POST /api/work-plan-tracking/jobs/<job_id>/free-for-more` — the worker's
**request**, never a placement.

**How free hours are counted (Ali, 2026-08-25):** count what the men really did.

```
for man in crew_of(finished_job):
    worked = sum(t.actual_hours or j.estimated_hours
                 for j, t in his_jobs_today())
    free_hours[man] = max(0.0, MAN_HOURS_PER_DAY - worked)   # 8h
free_man_hours = sum(free_hours.values())
free_men       = [m for m in crew if free_hours[m] > 0]
```

This is new arithmetic. **Nothing in the system prices a day by `actual_hours`
today** — every wallet, the generator and the domino all use `estimated_hours`.
That is precisely why a fast crew is invisible today, and it is the gap this
flow closes. The day wallet is deliberately *not* consulted here: the wallet is
a planning budget, and this question is about execution — men who are standing
in the yard right now.

Candidates are then chosen with the generator's own pure functions:

```
rows   = pool_orders_query(plan.id)          # work_plans.py:1196
         .filter(berth matches)              # order's berth, else equipment's
cands  = [candidate_dict(r) for r in rows]   # same keys _step_populate emits
scored = _step_score(cands, plan)            # PURE — plan arg is never read
bundles= _step_bundle(scored)                # PURE — sorted by score desc
fits   = [b for b in bundles
          if bundle_man_hours(b) <= free_man_hours
          and crew_of(b) <= len(free_men)]
offer  = fits[:3]
```

`_step_score` and `_step_bundle` are stateless and reusable — verified. Only
`_step_populate` (whole box + every open defect + last week's carry-overs) and
`_step_distribute` (week-only, and gated on `plan.status == 'draft'`) cannot be
reused, so the candidate dicts are built directly from the box rows using the
same keys the SAP branch of `_step_populate` emits, including the
`_resolve_overdue(...)` call that makes `overdue_value` comparable.

## The apply step

New service `app/services/place_one.py` — the "bake one bun" piece. Nothing in
the codebase does this today: `_create_jobs_for_bundle` is reachable but
week-shaped, and `schedule_sap_order` (`work_plans.py:934`) is the only existing
single-order placement and diverges from the generator in four ways — it does
not re-price from Ali's hours table, does not normalise the berth, does no
capacity check, and **assigns nobody**.

```
place_one(order, day, crew_user_ids, ripple=None) -> WorkPlanJob
```

1. Price the job with `_price_bundle` + `bundle_man_hours` — Ali's hours table,
   not `SAPWorkOrder.estimated_hours` (which is an import default of 4.0).
2. Create the `WorkPlanJob` with the same field set `schedule_sap_order` uses,
   plus `_normalize_berth` and the priced hours.
3. Assign `crew_user_ids`, creating `WorkPlanAssignment` rows.
4. Flip the box row: `status='scheduled'`, `work_plan_id=plan.id`.
5. One transaction with the `make_room` call, so a failure leaves the plan
   exactly as it was.

**Which price tag — stated once, deliberately.** The job is priced for the
domino by `estimated_hours × the crew that will actually be on it`, matching
`day_ripple.job_cost_man_hours`. The generator's `bundle_man_hours` uses the
crew from Ali's table instead, and for a 4-man urgent reach stacker the two
differ by a factor of two. Because `place_one` assigns the men **before** the
day is re-measured, the two agree by construction. This is the same class of
mistake fixed on 2026-08-25 in the carry-over — a number of the form
`hours × crew` crossing a boundary with two owners — and it is written down here
so it cannot recur silently.

**Who does the work:**
- `crew_is_free` → the men who just finished, already known. A **Swap crew**
  button re-asks with the other teams available on that day.
- `urgent_needs_room` → staffing needs `_assign_from_rule`
  (`work_plan_generator_service.py:2106`), which is **not standalone-callable**:
  it needs four context structures that only `_step_assign` builds (rules keyed
  by berth/team/category, `workers_by_id`, `day_unavailable`, and
  daily/weekly load counters). A thin `staff_one_job(job, day)` wrapper that
  builds that context for a single day is part of this work.

## Assumptions, written down

1. **A tap may change a published plan.** Every HTTP endpoint refuses to add or
   remove jobs on a `published` plan (`work_plans.py:758, 954, 1314`), but
   `make_room` is service-level and does not check — and Plan 2's evening
   carry-over already writes to the published week every night. The line this
   codebase actually draws is *human decision yes, unattended machinery no*.
   Nothing here is applied without a finger on a button; the nightly job only
   **asks**. If Ali wants the stricter line, the fix is one status check in the
   apply step and the feature becomes draft-week-only.
2. **No team rules configured → the urgent producer is off.** `build_week_wallets`
   returns `{}` and `make_room` returns `[]`, so `urgent_needs_room` raises no
   questions at all — the same way the generator's hours check switches itself
   off. The **crew-free producer still works**, deliberately: its arithmetic
   comes from what the men actually did, not from a wallet, and the engineer
   names the crew, so no rule is needed to staff the job. Only the *Swap crew*
   button disappears, because there are no other teams to offer.
3. **`'both'`-berth work is charged to east**, following `_wallet_for` and
   `day_ripple._berth_key`. A known quirk of the existing model, inherited
   deliberately rather than fixed here.
4. **Days already past are never targeted** — `d.date >= planning_today()`
   (Baghdad, via `app/utils/decorators.py:175`). The generator's day picker does
   not filter the past; a nightly job must.

## Testing

Follows `tests/test_telegram_bot.py` exactly: the `Recorder` double replaces
`TelegramClient` at the import site, so nothing reaches api.telegram.org. Two
additions to the harness:

- a `_callback(...)` update factory beside the existing `_update(...)`
  (`tests/test_telegram_bot.py:69`) — there is none today;
- `Recorder` grows `answer_callback_query` and `edit_message_text` recorders,
  and must **stop discarding `reply_markup`** — today its `send_message`
  accepts the kwarg and throws it away (`tests/test_telegram_bot.py:48`), which
  would make every button assertion pass vacuously.

The tests that matter most, one per rule Ali set:

1. Two people press Yes at the same moment → the job is placed **once**; the
   second gets "already decided".
2. A press after `expires_at` changes nothing.
3. A worker (role `maintenance`) on the allowlist presses → refused, plan
   unchanged.
4. Pressing No leaves the order in the box, and the next nightly run **asks
   again**.
5. All recipients' messages are edited after a decision, each in its own
   language.
6. `crew_is_free` never offers a job bigger than the man-hours left.
7. A callback arriving today (before this feature) must not regress: an unknown
   or malformed `callback_data` gets a toast, never an exception.

And for the new arithmetic, which no existing test covers:

8. **Free hours count what was really done.** A 6h job finished in 3h by two men
   leaves 10 man-hours free, not 0. The wallet is untouched by this number.
9. **The price tag matches the domino.** A placed job's cost as measured by
   `day_ripple.job_cost_man_hours` equals the cost the proposal promised — the
   2026-08-25 carry-over bug, guarded in its new home.
10. **No team rules → no questions at all.** Both producers stay silent.
11. **A past day is never targeted**, even when it is the only day with room.
12. **Nothing is applied without a tap.** A full nightly run raises questions and
    changes not one row of the plan.

## Build order

This is two features sharing one foundation, and it should be built and checked
in that order — the first stage is a complete, useful thing on its own.

**Stage 1 — the bot learns to ask.** The two tables, the tap catcher, the two
new client methods, the ask/edit helper, and the urgent-order producer. At the
end of this stage a full nightly run raises real questions on real phones and a
tap really moves work. Nothing about job completion or the mobile app is
touched.

**Stage 2 — the fast crew becomes visible.** The free-hours arithmetic, the
best-3 pick, the completion hook, the `free-for-more` endpoint and the mobile
button. This stage carries all the genuinely new maths and is the one most
likely to need Ali's eye on real numbers, so it benefits from stage 1 already
being proven.

`place_one` is needed by both and belongs to stage 1.

## Files

**New**
- `app/models/telegram_proposal.py` — both tables
- `migrations/versions/s9t0u1v2w3x4_telegram_proposals.py` — `down_revision = 'r8s9t0u1v2w3'` (verified single head)
- `app/services/telegram/taps.py` — the tap catcher and the apply registry
- `app/services/telegram/ask.py` — build a question, send it to every planner, record one message row per phone
- `app/services/urgent_watch.py` — producer A
- `app/services/crew_free.py` — producer B: free-hours arithmetic and the best-3 pick
- `app/services/place_one.py` — place one job on one day, and `staff_one_job`
- `tests/test_telegram_taps.py`, `tests/test_crew_free.py`, `tests/test_place_one.py`

**Changed**
- `app/services/day_budget.py` — add `day_free_man_hours(plan, day, berth, wallet_key)`; three places compute this inline today and one of them (`_existing_load`) gets it wrong, summing machine-hours with no crew multiplier
- `app/services/telegram/client.py` — add `answer_callback_query`, `edit_message_text`
- `app/api/telegram.py` — route `callback_query` to `taps.handle_callback`; correct the stale "promoted to a table before any command mutates" comment
- `app/services/scheduler_service.py` — one call appended inside `rebuild_pool_nightly`
- `app/api/work_plan_tracking.py` — completion hook + `free-for-more` endpoint
- `frontend/apps/mobile/src/screens/shared/JobExecutionScreen.tsx` — the "I am free" button in the `completed` branch (lines 275-283 today are a dead-end info card with no affordance)
- `frontend/packages/shared/src/api/work-plan-tracking.api.ts` — one client method
- `frontend/packages/shared/src/i18n/{en,ar}.json` — `job_execution` namespace (edit `src/`, never `dist/`)

**Deliberately not changed**
- `app/api/work_plans.py:934` `schedule_sap_order` — it diverges from the
  generator in four ways (no re-pricing, no berth normalisation, no capacity
  check, staffs nobody). Fixing it is a separate job; `place_one` does not
  build on it, and the divergence is recorded in `CLAUDE.md` "What Needs Work".
