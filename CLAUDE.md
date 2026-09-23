# Inspection System

## Deployment

**Platform:** Render.com
**Auto-deploy:** From GitHub `main` branch

### Services

| Service | URL/Host | Description |
|---------|----------|-------------|
| inspection-api-o3hz | https://inspection-api-o3hz.onrender.com | Backend API (Flask) |
| inspection-web | https://inspection-web.onrender.com | Frontend Web (React) |
| dpg-d5uepavgi27c7395il90-a | PostgreSQL hostname | Database |

### Running Migrations
1. Go to Render Dashboard
2. Select the API service
3. Open Shell tab
4. Run: `flask db upgrade`

## Tech Stack
- **Backend:** Flask, SQLAlchemy, PostgreSQL
- **Frontend Web:** React, TypeScript, Ant Design
- **Frontend Mobile:** React Native, Expo
- **State:** React Query

## Key Rules
- Keep CLAUDE.md under 8KB. Move completed changelog entries to HISTORY.md.
- Full history in HISTORY.md (read when needed, not every time).
- NEVER commit or push to git without explicit user permission
- Always test locally first
- Support both Arabic (RTL) and English
- Use auto-fix loop: find → fix → verify → repeat
- Always explain what you're changing before doing it

## Current Issues / History
- Arabic analysis was returning English only — FIXED (bilingual prompts on all providers)
- WebSocket (flask-socketio) not installed — non-critical
- UI needs modernization and improvements

## What's Working
- Photo upload working
- Photo analysis working (English only)
- Database connected and healthy
- Deployed on Render (auto-deploy from main branch)
- AI fallback chains: 8 providers for photo, 6 for voice
- SambaNova + OpenRouter API keys configured on Render
- Together AI API key ready to add on Render

## What Needs Work

### Done — full detail in HISTORY.md
- ✅ 2026-08-24 Job hours priced from real elapsed time (`docs/job-durations.md`), pool 1,272h → 714h
- ✅ 2026-08-25 Day budget = day-shift men × 8h per team per berth (`app/services/day_budget.py`)
- ✅ 2026-08-25 Plan 2, the evening truth — carry-over books only remaining hours (`day_ripple.py`)
- ✅ 2026-08-25 Plan 3 Stage 1 — nightly urgent proposal, inline buttons, first press wins
- ✅ 2026-08-25 Plan 3 Stage 2 — the fast crew (`app/services/crew_free.py`), commit `f4aac4d`
- ✅ 2026-08-25 Urgent reach stacker offered at 3-4 men / 8h, falling back to 2 men / 12h

### Job sub-tasks / team notes — BUILT 2026-09-05, not yet deployed
- A "+" on every planned job: tickable sub-tasks/notes that survive a return to the
  pool. Full detail in HISTORY.md. Key fact: the list hangs on `sap_order_number`,
  NOT on the plan row, because `purge_job_rows` deletes the row and its children.
- `app/models/work_plan_job_task.py`, 17 tests in `tests/test_work_plan_job_tasks.py`.
- **Deploy needs:** a Render restart (`start.sh` creates the table) + a mobile OTA.

### iPad web + the trade that never arrived — FIXED 2026-09-09
- Swipe scrolls a day again; **hold-then-move is now how you drag on touch**.
- The trade showed under both teams because `WorkPlanDay.to_dict` goes compact above
  10 jobs a day and that payload omitted `work_center`. Every real day is over 10.
- `work_center` was also dropped by 12 of 13 creation paths and ignored by `update_job`.
  Backfill added to `start.sh`.
- A manually added, unstarted job can now be deleted from a published plan.
- Full detail in HISTORY.md.

### The job that came back — FIXED 2026-09-09
- `MAN-<plan>-<job>` is the app's own placeholder for a hand-typed job parked in the
  pool, NOT a SAP order. Treating it as SAP hid the delete button and showed Ali an
  order he never created. Now recognised as manual everywhere.
- Delete endpoint takes `?discard=true` — "typed by mistake" no longer parks it in the
  pool to be swept back on. Drag-to-pool still parks. A real SAP order is never destroyed.
- **⚠️ Jobs deleted BEFORE this fix are still parked in production** and may return once
  more; the button will now be on them.
- Full detail in HISTORY.md.

### Job pool filters — FIXED 2026-09-09
- Headline "Jobs Pool N" was counted after the Hourly/Calendar sub-tab filter, so the
  total changed when you switched view (5 then 7). Now stable; counts sit on the
  `Hourly (n)` / `Calendar (n)` buttons.
- App defects were hard-coded `priority:'normal'`, so a CRITICAL defect vanished under
  the Urgent filter. Now mapped from `defect.severity`.
- `MAN-…` pool rows tagged "✎ by hand"; equipment filter list sorted.
- Full detail in HISTORY.md.

### Workers could see the whole plan — FIXED 2026-09-09
- The mobile dashboard card (and a FAB action mislabelled "My Work Plan") opened the
  WHOLE yard's week to every role. Web already guarded it to admin+engineer; mobile and
  the API did not. Both doors now role-routed; `list_work_plans` and `get_work_plan`
  gated. `/my-plan` untouched.
- Full detail in HISTORY.md.

### A draft plan is invisible to the crews — WARNED 2026-09-09
- `/my-plan` matches `status == 'published'` only, so an unpublished week shows EVERY
  worker an empty day with no explanation. Cost a morning on 2026-09-09: a man was
  reported as seeing nothing and the plan simply had not been published.
- The board did say `DRAFT` — in 11px grey secondary text, which was there and was
  missed. A red `🔒 NOT VISIBLE TO THE TEAM` tag now sits beside it, but ONLY once
  `week_start <= today`; a draft for next week is just work in progress.
- `flask why-no-plan "<name|username|sap id|employee id>"` answers this from the Render
  shell, walking /my-plan's conditions in order and stopping at the first failure.
  Searches every identity field case-insensitively and suggests near-matches by name.

### Job description on the card + Arabic that stops changing — 2026-09-09
- Descriptions were translated on EVERY request through a mostly-dead AI chain, so the
  same job read differently each time. Now a `phrase_translations` store: translated once
  by `flask translate-phrases`, read-only on every screen, English on a miss.
- `flask translate-phrases` with no flags also reports the vocabulary size.
- **Ali's lever:** anything still English needs a working key — `TOGETHER_API_KEY` is
  ready but not set on Render.
- Card now shows the job description. Full detail in HISTORY.md.

### Arabic for the things a worker actually reads — 2026-09-09
- `users.full_name_ar` — TYPED by a person, never machine-transliterated. Empty falls
  back to the stored name. `User.display_name(language)` decides everywhere.
- Notes read from the phrase store, skipped when already Arabic.
- **Two levers, both Ali's:** type the Arabic names; add an API key and run
  `flask translate-phrases --apply`. Full detail in HISTORY.md.
- **⚠️ gemini-2.5-flash is a THINKING model** — reasoning tokens were charged against
  `maxOutputTokens: max(len*3, 100)`, so it thought until the budget was gone and emitted
  a fragment: `AC Issue -> مشكلة تكي`, `RS109-250HR-... -> RS`. That IS Ali's "not all the
  words are translated". Fixed with `thinkingConfig.thinkingBudget = 0` and a real ceiling.
- `remember()` now REFUSES obvious wreckage (`looks_truncated`). Threshold is 30% of the
  source length — Arabic writes no short vowels so a good translation can be far shorter
  (`General Refurbishment -> تجديد عام` is 43% and correct). It cannot catch a word cut
  mid-way at the right total length; the provider fix is what stops those.
- **`flask review-phrases --suspect` / `--forget`** — 49 rows were written before the fix;
  `--forget` deletes the bad ones so `translate-phrases --apply` redoes them.
- Google Translate (the free last resort) produced GOOD Arabic throughout.
- **⚠️ The yard's vocabulary is now HIDDEN from translators** (`protect_terms` /
  `restore_terms`). Real damage from Ali's run: `(PM)` -> `مساءً` (in the evening) on
  every phrase, `AC` -> `التيار المتردد` (alternating current), `hydr` -> `الماء` (water).
  No provider can know (PM) means Preventive Maintenance HERE. Machine codes
  (`RS109-250HR-MECH`), intervals (`2000HR`, `25/5H`) and trade abbreviations
  (HYDR/HVAC/MECH/ELEC/AC) are masked before sending and restored after — an English
  abbreviation a fitter reads daily beats a confidently wrong Arabic word.
- `review-phrases` also flags rows whose Arabic contains `مساء` / `التيار المتردد` —
  those were stored before protection existed. **`--forget` then `--apply` redoes them.**

### Photo + voice on any job, and Arabic that means what the yard means — 2026-09-09
- Ali: "when i drop a job to a day, i can add a photo, a voice so it can be clear for the
  team. the finding coming from the inspection already has them, but other jobs do not."
- Photo/voice hang on `work_plan_job_tasks` (`attachment_file_id` / `attachment_kind`)
  — the same anchor that already survives a trip through the pool. **The buttons are in
  the JOB DETAILS modal** (`JobAttachments.tsx`), NOT the `+` popover — Ali moved them
  there 2026-09-09. The popover still DISPLAYS attachments; it just cannot create them.
  A **planner** adds them, and an **assigned worker** may add evidence too but still
  cannot write plain sub-tasks.
- Sticking is the storage choice, not a feature: they hang on the SAP order, so move,
  pool round-trip and carry-over all keep them. Three tests say so explicitly.
- **The file id is checked** — must exist, must be one the caller uploaded, must match
  its claimed kind. An IDOR review caught this: an id off the wire is a request, not a
  fact.
- **`DOMAIN_ARABIC` in `phrase_translation.py`** — `(PM)` now reads `(صيانة وقائية)`,
  `AC` -> `تكييف`, `HYDR` -> `هيدروليك`. These are what the abbreviation MEANS HERE, not
  a translation of the letters. **Ali is the authority on every line; correcting one
  corrects it everywhere.** `PR` is deliberately absent — nobody has said what it means.
- Machine codes (RS109) keep their own text: a name is the same in every language.
- **`flask translate-phrases --all`** does the whole vocabulary in one run, committing
  every 10 so a rate limit mid-way loses nothing. **386 of 387 done 2026-09-09**; the one
  refusal is `ECH02-SP-(EMS)TWL INSPECTION_PB`, which is pure code and has nothing to
  translate.
- **`flask fix-phrase "<english>" "<arabic>"`** — Ali's correction, marked reviewed, never
  overwritten by any later run. This is the last mile and only he can walk it: a machine
  renders 'Fifth Wheel bushes' as شجيرات (garden shrubs) and will do so forever.
- `review-phrases` flags the everyday meanings a workshop does not want:
  شجيرات (shrubs), الإرسال (broadcasting, for the gearbox), قضية (a legal case),
  ارتداء (wearing clothes), مساء (the evening), التيار المتردد (alternating current).

### Voice was dead on every iPad — FIXED 2026-09-09
- `new MediaRecorder(stream, {mimeType:'audio/webm'})` **THROWS on Safari**; all three
  web call sites caught it and said "microphone denied". Web voice had never worked on
  an iPad. `utils/audio-recording.ts` picks a supported format — **webm stays first** so
  Chrome is byte-identical; Safari gets `audio/mp4` -> `.m4a`. Server already accepted m4a.
- `voice.api.ts` no longer hard-codes the upload name `recording.webm` — the server picks
  the Whisper suffix and Cloudinary type from that extension.
- Mic errors are now BILINGUAL (`voice.mic_*` keys in en.json/ar.json) — the checklist
  page had a translated message before and must not go backwards for an Arabic crew.
- Camera: the attachment check refused an empty mime type (`''.startswith('image/')` is
  False) — a real, confirmed rejection of ordinary photos, now falling back to the
  extension. The picker moved out of React's tree (`utils/file-picker.ts`, the pattern
  `PhotoCapture.tsx` already used) with separate **Take Photo** / **Gallery** buttons.
  **The input-lifetime theory is unproven — the iPad is the verification.**
- Web only; mobile uses `expo-av` and never had this. Full detail in HISTORY.md.

### Publish hid behind the pool + the machine that came in uninvited — 2026-09-09
- Header row had `flexShrink:0` on both button groups and no wrap, inside a column
  that is 1024-300=723px on an iPad. Publish sat at 746px — 23px past its own column,
  clipped exactly where the pool panel starts. `flexWrap:'wrap'` fixes it; MEASURED in
  headless Chrome at 768/1024 (was invisible, now visible) and 1440/1920 (unchanged).
- **Dropping a job no longer sweeps the whole machine in.** `auto_group` on
  `POST /jobs` + `/schedule-sap-order`, **default TRUE** so nothing else changes; the
  board passes false and gets `related_candidates` back, then shows `RelatedJobsModal`
  — tick-list with hours, *Only this job* / *Add selected* / *All jobs*.
- The dragged job lands FIRST, so cancel = only this job. All rows ticked on open, so
  "all jobs" is still one tap. Follow-up adds also pass `auto_group:false` or the
  planner would be asked, answer, and then be overruled.
- `_related_equipment_work()` is the ONE query behind both the list and the sweep.
- 8 tests in `tests/test_related_jobs_choice.py`. Web+backend only, no OTA.

### The worker could never see the planner's photo — FIXED 2026-09-09
- Server was always fine: `/my-plan` and `/jobs/<id>/tasks` both carry
  `attachment_url`/`attachment_kind`, and the read endpoint is open to any user.
  **The phone drew only `task.content`** — so a photo showed as a tick-box labelled
  "Photo" with no photo, which reads like a failed upload.
- New `mobile/components/JobAttachmentsCard.tsx` (view-only) in `JobDetailsScreen`,
  above the tick list. Media filtered OUT of `JobSubTasksCard`.
- **⚠️ Voice URLs go through `/upload/f_mp3/`** — Chrome records webm, Safari m4a,
  and **iOS cannot play webm**. Plus `playsInSilentModeIOS: true`. Without these two
  the fix looks complete and is silent on every iPhone.
- `_task_payload` passed no language (English planner name on one screen, Arabic on
  the other) — all 5 call sites fixed. `📷/🎤 tap for details` hint on the plan card.
- ✅ **DEPLOYED 2026-09-10** — commit `7886287`, web bundle `index-B9cZgYlV.js`,
  OTA group `1c222b02` on the `preview` channel (runtime 1.0.0). Full detail in HISTORY.md.

### SAP operations + linking a job to an order — BUILT 2026-09-11, NOT PUSHED
- **A live bug is fixed:** typing a real order number onto a manual job silently
  orphaned its notes/photos (they hang on the order number). Proven, then closed in
  `reanchor_job_tasks()` — wired into BOTH the new link endpoint and plain `PUT`.
- `POST /jobs/<id>/link-sap-order`: order must exist, attachments move, order leaves
  the pool, day re-priced with SAP hours ("show both, sap hours win").
- **Operations live in `work_plan_job_tasks`** (`source`, `operation_number`,
  `work_center`, `planned_hours` + own timer). One list holds Ali's typed lines AND
  SAP's operations, as he asked. Order state is DERIVED, never tracked twice.
- ✅ **IW49 COLUMNS CONFIRMED on production 2026-09-11.** All six guesses matched:
  `Order` / `Operation/Activity` / `Operation short text` / `Work Center` / `Work` /
  `Unit for work`. 56,941 operations on 19,375 orders read.
- **⚠️ Operations are stored ONLY for orders the app knows** (pool + on a plan,
  ~200). The first run stored all 19,375 and added 6m23s to a 3m43s sync.
  `skipped_unknown_orders` in the report makes the filter visible.
- **(PR) = waiting on a material under a purchase order** (Ali, 2026-09-11).
  NOT translated, by his instruction — already in `_PROTECTED_TERMS`. IW49 carries
  `Purchase Requisition` PER OPERATION, so the blocked LINE and the part are named;
  `waiting_on_material` flag + amber strip on the phone. A part arriving clears it.
- ✅ **CLOSED, not deferred: there is nothing to pre-mark.** Ali, 2026-09-12: "you will
  not find a open operation and close operation in the same order as we close the order
  after all finish." An order stays open until EVERY operation is done, so an open order
  — the only kind the app plans — has nothing confirmed in SAP, ever. Pre-ticking from
  `System Status`/`Confirmation` was never a feature, it was a blank column.
- **⚠️ THEREFORE the app's ticks and timers are the ONLY record anywhere** that a crew is
  3 operations into a 9-operation order. That makes "a re-sync never resets `is_done`"
  load-bearing, not polite — there is no second copy to restore from. Guarded by
  `test_no_status_or_confirmation_column_is_read`.
- `flask rebuild-pool` runs the sync now instead of waiting for 02:02.
- **Operations are on the WEB board too** (`JobOperations.tsx`, Job Details): number,
  hours, trade, timer, progress, waiting-for-material, per-operation photo/voice.
- **Ali can ADD an operation** — `operation_number` + `planned_hours` + `work_center`
  on `POST /jobs/<id>/tasks`. `source` stays `manual` so a re-sync never touches it.
  Cannot re-use a SAP number. Planners only. Board suggests 0900 upwards.
- **Photo/voice hang on ONE operation** via `parent_task_id`. Job-level panels
  exclude them; deleting an operation takes its media; an operation carrying media
  counts as TOUCHED so SAP dropping it keeps-and-flags instead of deleting.
- **Mixed-trade orders reach BOTH teams** — `widen_order_trade_to_both()` sets the
  order and its job rows to ELME when the operations span MECH and ELEC. Only ever
  WIDENS; an order SAP marked ELEC with only ELEC operations keeps that label.
  Runs on sync AND when an operation is added by hand.
- **Per-operation assignment SHIPPED 2026-09-15** (was deliberately not built; Ali chose
  it from three options with the staleness warning in front of him — see below). Order-level
  assignment is unchanged and still what the phone's trade filter reads.
- **Voice `--:--` fixed** — a browser writes the length field before it knows the
  length, so it stays unknown. `playableAudioUrl()` asks Cloudinary for `f_mp3`,
  which has a real one. Also fixes webm notes being silent on iPads.
- **⚠️ The `+` badge counts WRITTEN NOTES only** — operations arriving in the same
  list turned a quiet `+` into `0/10`. Filtered client-side AND in the plan-wide
  endpoint so the badge and the popover agree.
- ✅ **ORPHANS CLEARED 2026-09-11 13:26.** 55,381 rows from the first unscoped run
  are gone; verified by a fresh count (`safe to remove: 0`) and Ali's 9 hand-typed
  lines were 9 before and after. Table holds 1,560 operations + 9 notes.
  `flask prune-orphan-operations` (reports; `--apply` deletes; `--limit N` bounds a
  run) stays for next time. The first `--apply` removed only 2,500 before the shell
  died — the delete was one round trip PER ROW; now one `DELETE ... IN` per 2,000.
- Confirmed 2026-09-11: scope fix took the operations step from **6m23s to 2s**;
  1,560 operations on 161 orders. `waiting on material: 180` across the yard.
- Re-sync NEVER resets `is_done`/timers. A dropped operation with work on it is kept
  and flagged, not deleted.
- **⚠️ Phase 2 (`TRADE_SPLIT_BUDGET`) SHIPS OFF.** It re-prices every day in every
  week. The numbers are exposed regardless. Do not enable until BOTH `defect_mech`
  and `defect_elec` rules exist per berth — a crew with no rule gets an empty wallet.
- 1090 backend tests. Full detail in `tasks/sap-operations-and-order-linking.md`.

### A hand-typed operation vs. SAP's own numbering — FIXED 2026-09-12
- Ali: "what when i added an ope manually and the sap send the order wiyhout it, or
  the sap and app has different sectin or work center".
- **His line was always safe** — `sync_order_operations` reads only `source='sap'`
  rows, so a sync can never edit or delete one a person typed. That is also what
  made the bug possible.
- **`uq_work_plan_job_task_operation` allows ONE row per number per order** (model
  AND production via `start.sh:902`). So SAP arriving with a number Ali already used
  was not a harmless duplicate — it was an **IntegrityError**, and with ONE commit
  at the end of the function for all ~161 orders, that single order would have lost
  **the whole yard's operations import for that run**.
- Now SAP's line is **SKIPPED and named**, never renumbered (a number a crew was
  told must not move by itself) and never overwritten. Self-healing: SAP resends
  the whole file nightly, so clearing the number imports SAP's line by itself.
  `skipped_number_taken_by_hand` in the report; printed by `rebuild-pool`/`pool-status`.
- **The case no code can solve:** SAP's line for the same work usually arrives under
  a DIFFERENT number — same job listed twice, hours double-counted on the progress
  bar. `orders_to_review` names those orders. **This becomes likely the day the IW49
  variant is fixed** and hand-typed orders receive real operations for the first time.
- **An unexplained work centre now shows to EVERYONE** on the phone. `MES-WELD` is
  kept untranslated on purpose, matched neither MECH nor ELEC, and so folded away as
  "for the other trade" for BOTH crews — a line belonging to nobody.
- **`job_operations` + `job_attachments` had NO translations at all** — every string
  on the worker's operations and media cards was falling back to English. Both blocks
  added to `en.mobile.json` and `ar.mobile.json`.
- Mobile `tsc` went 5 errors → 1. Fixed: `navigate('WorkPlan')` typed as unreachable
  (a tab, not a root route — the FAB action from commit `0bb8974`); `colleagueData`
  read in a deps array 130 lines above its own `const` in `InspectionWizardScreen`;
  `EPICard`'s hand-written `t` type; a removed `expo-file-system` option.
- **Punch-list Resolve had NEVER worked** — `defectsApi.resolve(id)` sent no body and
  `app/api/defects.py:108` requires `resolution_notes`, so every tap returned 400. With
  no `onError` the row just stayed put, which reads as a slow network, not a refusal.
  Fixed with a fixed note matching `DefectKanban.tsx:396`, plus a bilingual failure
  message. **A typed note per item is still possible** — the panel already imports
  `Modal`/`TextInput` and has the assign-modal pattern to copy.
- **Mobile `tsc`: 0 errors**, down from 5.
- 1133 backend tests. Web `tsc` clean.
- ✅ **DEPLOYED 2026-09-12** — commits `ff08fb7` + `71832f8`; OTA update group
  `02091deb-492b-4108-99be-ab7d4e379639` on the `preview` channel (runtime 1.0.0,
  both platforms). API verified `{"database":"connected","status":"healthy"}`.

### A 2000-hour service contains the 250-hour one — FIXED 2026-09-12
- Ali: "2000 hrs service is a service that contain the 250 hrs task and addtional tasks".
- RS109 carries both open at once and was priced **12h + 12h = 24h** — a day and a half
  of two men booked for a visit that happens ONCE.
- `contained_packages()` in `job_durations.py` (pure, no imports) + `_discount_nested_packages`
  in the generator. The smaller package is **zeroed, never removed** — both SAP orders
  are real and both must be closed after the visit.
- **It lives in `_price_bundle`, beside the fault ride-along rule**, for the same stated
  reason: a member's price depends on the company it keeps, and nothing knows that until
  a machine's work is grouped onto one day. **The POOL keeps standalone prices** — a
  250HR really is 12h when it is the only thing open.
- **Test is DIVISIBILITY, not size.** The ladder is 250/500/1000/2000/4000 and every step
  is a multiple of the one below — which is WHY they fall due together (at 2,000 hours the
  250 is due for the 8th time). A 300 beside a 2000 keeps its own schedule and its own price.
- **Trades do not nest.** A 2000HR-MECH does not do a 250HR-ELEC's work; zeroing it would
  hide real electrical hours from the day. A silent trade agrees with anything.
- **A package of `None` never nests and never swallows** — calendar PMs, AC inspections,
  `FL327-HOURLY SERVICE`. SAP did not say which package it is.
- **A 0h job reads as a bug**, so the reason is written to the job's `notes` (asserted NOT
  to be in the generator's kwargs, so nothing is overwritten). Already drawn on board,
  phone and PDF, already translated by the phrase store.
- **⚠️ GENERATED PLANS ONLY.** Dragging both orders onto a day by hand still shows 24h —
  the same known divergence as `schedule_sap_order`. Fixing it would mean mutating stored
  hours based on a job's neighbours, which is exactly the kind of state this codebase
  avoids.
- 19 tests in `tests/test_nested_pm_packages.py`. 1152 backend tests.

### INS was priced at double its own measurement — FIXED 2026-09-12
- Ali asked "which word i do not understand?" — and looking for an honest answer found
  this. `FAULT_HOURS['INS']` was **3.0h**; `docs/job-durations.md` measures **1.5h**
  across 372 finished orders.
- **3 of the 4 with-PM figures match the document EXACTLY** (COM 2.0, DAM 1.0, ACD 2.5).
  INS was the only mismatch and was exactly DOUBLE. The document's own summary names
  only three letters as settled — INS is absent and was never confirmed.
- **One number explained two complaints.** At 3.0 an INS cost LESS alone (2.0) than
  riding with a PM, backwards from Ali's rule. At 1.5 it costs more alone, like COM/DAM.
- **The test suite had ENCODED the bug.** `TestAFaultCostsLessWhenThePMTeamIsAlreadyThere`
  asserted `('INS', 3.0, 2.0)` — a class named after the rule, holding a row that breaks
  it. Asserting figures one by one can only confirm what was typed. Now
  `test_riding_along_is_never_dearer_than_its_own_trip` asserts **the rule**, and
  `test_the_measured_medians_are_what_the_table_holds` pins the table to the evidence.
- Impact today is nil — **there are no open INS orders** (78 PRM, 128 COM, 1 DAM, 1 ACD).
- **ANSWERED 2026-09-12: COM = corrective maintenance, ACD = accident** (Ali).
  **No behaviour changed, deliberately.** ACD -> `corrective` was already right. COM ->
  `defect` is WRONG BY NAME AND RIGHT BY BEHAVIOUR: `job_type` is a behaviour bucket, and
  `defect` buys +20 priority and +10 risk in `work_plan_ai_service` plus a duration
  estimated from completed `SpecialistJob` history in `work_plan_tracking`. All three fit
  corrective maintenance. Renaming it moves **128 of 208 open orders** out of all of it at
  once and nothing looks broken — they just rank lower and estimate worse. Pinned by
  `test_com_stays_a_defect_however_wrong_the_word_looks`.
- 1166 backend tests.

### "I choose all related jobs, but not all come" — FIXED 2026-09-13
- Ali: "in drag a job to a day, i get the pop up i choose drag all related job with, but
  not all comming or displaying in the day". **"coming OR displaying" was exactly right —
  there was one of each.**
- **(1) EVERY related DEFECT was refused, always.** The board's confirm sent no
  `equipment_id` and `POST /jobs` requires one (`equipment_id is required for PM, defect,
  and corrective jobs`). Defects are listed FIRST and the web loop awaited inside ONE
  try/catch — so the first refusal left every SAP order behind it unattempted. Fixed:
  `_candidates_payload` stamps `equipment_id` on every row; per-item try/catch in
  `addChosenRelated`, which now NAMES what it could not add.
- **(2) Jobs landed in the MACHINE's berth, not the dropped one.** `schedule_sap_order`
  stored `sap_order.berth` and ignored the column; `add_job` always honoured the client's.
  `WorkPlanDay.to_dict` splits the payload into `jobs_east`/`jobs_west`/`jobs_both` and the
  board draws each separately — so the work WAS in the day and invisible where he looked.
  **It hit the dragged job too:** the optimistic card drew where he dropped, then the
  refetch moved it. Now `_normalize_berth(data.get('berth')) or sap_order.berth` — optional,
  old value as fallback, so any caller sending no berth is unchanged.
- **The sweep needed it too.** `_auto_group_equipment_jobs` takes `berth=` now; without it
  the default `auto_group=True` path re-created the split through the other door.
- **The rule, in one line: a job lands in the column you drop it on.**
- 5 new tests in `tests/test_related_jobs_choice.py`, each verified to fail without its fix.
  1178 backend tests, web+mobile `tsc` clean. Web+backend only, no OTA.

### Operations under the job on the board, and a name per line — BUILT 2026-09-15
- Ali: "is thier a way to be shown also when under the job father with an indent, so i can
  easly assign people". Operations now draw INDENTED under their job card; each row is its
  own drop target.
- **The staleness warning he accepted is engineered away.** `work_plan_operation_assignments`
  carries `work_plan_job_id` — the WEEK's row — and is in `JOB_CHILD_TABLES`, so
  `purge_job_rows` deletes it exactly as it already deletes `work_plan_assignments`. **Two
  clocks on purpose:** the operation + tick + timer hang on the SAP ORDER and survive into
  next week; the NAME hangs on the week and is cleared. Rosters change weekly.
- **Assigning to a line ALSO assigns to the job** — `/my-plan` finds a worker's week through
  `WorkPlanJob.assignments`, so a man placed only on a line would see an empty day.
- **Removing him from the JOB clears his lines** (`_clear_operation_assignments`). The
  reverse is deliberately NOT symmetric.
- **⚠️ NESTED DROPPABLE NEEDED A COLLISION-PRIORITY ENTRY.** The rows sit INSIDE the
  `droppable-job-` element, and `customCollision` checked jobs first — a drop on a line
  would have silently assigned the whole order. `operation-` now ranks above it, employee
  drags only. Pinned by `JobOperationRows.test.tsx` (the id prefix is the contract).
- An **assigned** operation now counts as TOUCHED, so SAP dropping the line keeps-and-flags
  instead of unassigning a man overnight.
- `for_jobs` eager-loads assignees + users, or `to_dict` fired 2 queries PER OPERATION;
  a test asserts ≤3 task queries for 20 operations.
- Operations travel in their **own key** on `/job-tasks` — the `+` badge still counts notes.
- Phone shows who is on each line, his own as a green **You / أنت**.
- 11 tests in `tests/test_operation_assignment.py`, 4 in `JobOperationRows.test.tsx`.
  1189 backend, 40 web.
- ✅ **IW49 FIXED AT SOURCE 2026-09-15 21:37** — the courier's new export carries open
  orders. **Pool coverage 0% → 100%** (180 of 180), 62,205 operations, and **146 orders got
  their trade label from operations** (IW39 fills almost no work centre, so the board's team
  columns changed that morning). `orders_to_review: ['700001896146']` fired for real — that
  order holds both a hand-typed and a SAP operation, and needs Ali's eyes once.
- ✅ **DEPLOYED 2026-09-15** — commit `8eca336`; API verified live by a real restart
  (502 → 200). OTA group `03da0c67-158a-4d1e-b8df-6870f6600b48` on `preview` (runtime
  1.0.0, both platforms). **Check the Render log says `Created
  work_plan_operation_assignments table`** — it is the one thing not verifiable from
  outside.
- **⚠️ UNVERIFIED: the drag on a real iPad.** The priority logic is fixed and tested; whether
  a thin indented row is a comfortable finger target is not something a test can answer.
- **Each crew's section shows only ITS lines** (fixed 2026-09-16). An ELME order is listed
  under BOTH 🔧 MECH and ⚡ ELEC — right — but every line was drawn in both, so an
  electrician read 3 mechanical lines to find his one. `belongsToTrade()`: own trade, plus
  ELME (needs both) and SUPV / unexplained codes (belong to everyone, never to nobody).
- **`minWidth: 0` stopped the letters stacking vertically.** A flex item defaults to
  `min-width:auto` and will NOT shrink below its own text, so everything beside it was
  crushed to a few pixels and wrapped one letter per line. The `overflow:hidden` +
  ellipsis only works once the item is allowed to shrink. All siblings now `flexShrink:0`
  + `nowrap`.
- **RULE A, confirmed by Ali 2026-09-16 ("yes this is how we work"): the order's people are
  the TEAM; a name on a line means that line is HIS; a line with NO name belongs to the
  team.** He had asked whether assigning both levels was "unlogic" — the data could never
  contradict (an operation's list is always a SUBSET of the order's, proven by 4 tests), but
  the SCREEN never said the rule, and a blank line meant neither "team" nor "nobody yet".
  - **The real fault: `JobOperations.tsx` showed NO per-line names at all** — so Job Details
    showed the order's people beside a list of nameless lines, two things that looked
    unrelated. That was the whole confusion.
  - Fixed as WORDING AND DISPLAY ONLY — nothing stored changed, nothing already assigned
    moved. Per-line names in Job Details; `— team` on an unnamed line everywhere (board,
    details, phone); the order's list relabelled **"Team on this job"**.
  - A name is NOT a lock: anyone on the team may still tick any line. It says who is
    expected, not who is permitted.
  - ✅ **DEPLOYED 2026-09-16** — commit `8862df8`; OTA group
    `754203db-b900-4637-9f2f-da59cca02d7f` on `preview` (runtime 1.0.0, both platforms).
- **A hand-typed operation is marked `✎` in purple** — Ali asked whether the day shows
  manual or SAP operations. BOTH. The mark matters because a re-sync can never touch his.
- **A RETRACTED day shows NOTHING from this component** (2026-09-16). A one-line summary was
  tried first (2026-09-15) and was STILL a mess — Ali reported it twice. The arithmetic: a
  column is ~160px, a job row inside an expanded bundle has ~105px left after card/block/row/
  handle, and **a job needing both trades is drawn TWICE**, once under each heading, so three
  become six rows before anything of ours is added. `dayExpanded` defaults to false, so a
  caller that forgets it shows nothing rather than something broken.
- **⚠️ UNDIAGNOSED: what the "mess" actually is.** Hiding our rows is a SAFE REVERT, not a
  diagnosis — a screenshot was requested and not yet seen. The doubled job rows in a narrow
  expanded bundle are pre-existing and may be the real cause.
- **Either of them can tick an operation finished** (Ali, 2026-09-15). `_may_tick` always
  allowed engineers/admins; the board only offered Finish once a timer ran, so a line the crew
  did yesterday could not be ticked. **Mark done** now sits beside Start, and **asks for the
  hours** — finishing an unmeasured line would otherwise record ~0, a confident wrong number
  beside the measured ones. One tick, `done_by_id` says which of them. Also lets anyone correct
  a timer left running overnight (19h clock, 3h work).

### An engineer assigns an inspection team and nobody else sees it — 2026-09-16
- Ali: "haidar ghulam assign inspection for team but for me kept unassigned".
- **ROOT CAUSE FOUND — the word "engineer" in his report was the clue.** The dropdown on the
  ENGINEER's page offered every active inspector, **including men on approved leave for the
  list's target date**. The server refuses those (`<name> is on leave on <date>`), the error
  handler showed only "An error occurred", nothing was written, and the row correctly stayed
  unassigned for everybody else.
  - **The ADMIN page has always got this right** — it fetches roster day-availability and
    marks such men red with "On Leave". The engineer's page never did. That asymmetry is
    exactly why it was engineers who hit it.
  - `/users/for-assignment` does carry `is_on_leave`, but that is a **TODAY** flag and a list
    is usually for tomorrow — and the engineer page never read it anyway (0 uses).
  - Fixed: the engineer page now fetches day-availability for the OPEN list's date+shift and
    renders on-leave men as `🔴 <name> — On Leave`, **disabled**. Safe to disable because the
    roster's conditions are IDENTICAL to the server's (`status='approved'`,
    `date_from <= target <= date_to`), so a greyed man is exactly a refused man.
  - `Collapse` made controlled + `accordion` so only the open list is queried: one request,
    not one per list.
  - Hypothesis (b) RULED OUT from the code: daily generation dedupes asset types via `set()`
    and returns early if the list exists; the 1:05 PM follow-up task creates only
    `status='assigned'` rows, so it cannot produce the unassigned row Ali saw.
- **What IS proven and fixed: the refusal reason was being thrown away.**
  `TeamAssignmentPage.tsx` read `err.response.data.error`, but the API returns
  `message` (`app/exceptions/api_exceptions.py` sets `rv['message']`). So all seven real
  reasons — "X is on leave on <date>", "Assignment cannot be reassigned in current status",
  "User is not an inspector, specialist, or maintenance" — became **"An error occurred"**.
  An engineer seeing that would reasonably think it was a glitch and walk away.
- **Same bug in 30 places / 15 files**: leaves (every manager and modal), bonus requests,
  review detail, pause approvals, create job, engineer job detail. All fixed ADDITIVELY —
  `data?.message || data?.error || fallback` — because `'error':` IS genuinely returned by
  `approvals.py` and `auto_approvals.py`, so the fallback is load-bearing.
- `LoginPage.tsx` and `AiAssistantChat.tsx` deliberately NOT swept — different shapes.
- The read path is innocent: `/lists` has **no per-user filter**, both pages hit the same
  endpoint, and the hard-coded `.limit(50)` is identical for everyone.
- Web only, no OTA — every mobile site already read `message`.
- **No `flask why-unassigned` needed** — the cause is now visible in the UI itself.
- **⚠️ STILL UNVERIFIED against production data.** The chain is proven in code, not yet
  confirmed by the row Haidar actually touched. If a check ever shows `status='assigned'`
  with an `assigned_at`, there is a second bug on the read side.

### A supervisor for a job — BUILT 2026-09-23, phone part still to come
- Ali: "we need to have the option to have supervisor for the job, is it already thier?"
  Partly: `is_lead` is a WORKER who leads, and `WorkPlanJob.engineer_id` existed but
  **nothing in the backend ever read it** (`job_showup.py` touches `EngineerJob`, a
  different model). A pure label.
- **He chose a WATCHER, not a worker** — responsible for the job, doing none of its lines,
  told when it starts and finishes. And **any senior person may supervise**: engineer,
  admin, specialist, maintenance. Inspectors deliberately excluded.
- **⚠️ THE FIELD IS STILL `engineer_id` ON THE WIRE, ON PURPOSE.** Because nothing read it,
  it was free to BECOME this rather than earn a second column beside it — two records of
  one fact is what this codebase keeps refusing. Renaming the payload would break the
  mobile app until an OTA and buy nothing. Only the DISPLAY says "Supervisor". See
  `SUPERVISOR_ROLES` in `app/api/work_plans.py`.
- **THE INVARIANT: naming a supervisor costs a day NOTHING.** He gets no
  `WorkPlanAssignment` row, so he is never counted by `bundle_man_hours`, the day budget,
  `_step_assign`, the board avatars or any "unassigned" count. Two tests pin it. Giving him
  an assignment row would silently turn a watcher into a man the planner thinks is busy.
- **Start/finish notifications did not exist for ANYBODY** — `notify_engineers_for_job`
  fired only on pause. Now called at `/start` and `/complete`, **after the commit** (the
  helper commits, and a notification must never roll back a man's work — same reasoning
  already written into `complete_job`). Planner + supervisor, **deduped**: he is very often
  the same person, and being told twice teaches people to stop reading notifications.
- The web dropdown's roles MATCH `SUPERVISOR_ROLES` exactly — offering people the save
  would refuse is the bug that cost a morning on the inspection assignment page.
- ✅ **His phone: DONE.** `/my-plan` gained `supervised_jobs` + `total_supervised` — a
  SECOND list built in the same loop (the days are already eager-loaded; a separate endpoint
  would repeat the week resolution, the joins and the publish check for nothing). He still
  gets no assignment row.
  - **⚠️ THE SECTION IS NOT TIED TO THE SELECTED DAY TAB, and must not be.** A pure
    supervisor has NO jobs of his own, so `selectedDay` is undefined for him — anything hung
    off it renders nothing, and he opens his phone to a blank screen while watching six
    jobs. It lists the whole week on its own.
  - Smaller payload than a worker's: machine, job, **who is actually on it**, and whether it
    has started. Status comes from `job.tracking` — `WorkPlanJob` has no status column.
  - Purple, matching the 👁 on the board. `أعمال تشرف عليها` in Arabic.
- **Deliberately NOT built: the 685 MES-SUPV operations stay team lines.** Ali chose a
  named watcher (option A), not "supervision is a line someone owns" (option B). Linking
  them is a small addition on top of per-operation assignment if he ever wants it.
- 11 tests in `tests/test_job_supervisor.py`; dedupe verified by breaking it. 1210 backend.
- Plan: `tasks/supervisor-on-a-job.md`.

### Still open
- **Watch these two first when Stage 2 goes live** (final review, knowingly not fixed).
  (1) A worker's Finish still waits on Telegram — one 15s POST per planner, after the
  commit now, so his work is safe and the transaction is closed, but the phone still
  waits. Fix is a background thread if it is ever felt. (2) `expires_at` is LOCAL
  midnight compared against `datetime.utcnow()`, so buttons stay alive ~3h past Baghdad
  midnight and can place a job on a day already over. Pre-existing Stage 1 pattern.
- **Three smaller Stage 2 residuals, all deliberate.** A press re-checks neither the
  men's shift nor whether they have picked up other work since; a FAILED swap leaves
  that crew unaskable for the rest of the day; `exclude_orders` matches only a bundle's
  first member (over-suppresses, which is the safe direction).
- **`schedule_sap_order` diverges from the generator**: no re-pricing, no capacity check,
  staffs nobody. `place_one` replaces that behaviour for the bot; the endpoint is otherwise
  untouched. **Berth IS now handled** (fixed 2026-09-13, see below).
- **Night shift disagrees with itself:** `day_budget._unavailable_by_date` excludes `night`,
  `_step_assign`'s own lookup does not — so a man giving the wallet zero hours can still be
  staffed onto day work.
- **The 2000HR has its own price: 18h with 2 men** (Ali, 2026-09-12). `PM_BY_PACKAGE`
  in `job_durations.py`. RS109 with both open: **48 man-hours → 36**, and the same
  36 whether or not the 250HR order happens to be open. The crew curve is NOT stretched
  over it — 3 men still get 18h until measured. **Only the reach stacker's 2000HR is
  known**; every other family/package falls back to the ordinary figure, which
  under-prices on purpose.
- `pm_interval_hours` MOVED from `sap_order_parser` to `job_durations` (one
  implementation, re-exported so both import paths work) — reading the package is a
  pricing question, and a second regex would forget the `25/5H` case.
- ✅ **ACD alone is 3h** (Ali, 2026-09-12) — was 2.0, cheaper than riding with a PM,
  the same shape of error INS had. **All four fault letters now obey the rule** and all
  four are in `test_riding_along_is_never_dearer_than_its_own_trip`, verified by breaking
  each one in turn. No exceptions carried.
- **ECH with 4 men uses the 3-man figure (7h)** until Ali gives the real number.
- **Rank WITHIN urgent.** 40 of 133 SAP orders are urgent and 33 more are high, so the
  label has stopped sorting anything. The numbers to rank by are already stored:
  `overdue_value` (days for calendar PMs and correctives, hours past 250 for hourly).
- **~2,000 legacy `sap_work_orders`** stamped to plans 6-38. Invisible to the box but
  they broke one cleanup already. `UniqueConstraint('work_plan_id','order_number')` is a
  leftover from per-week pools — one order should mean one row.
- **Removal-rule recipients:** all 8 admins+engineers today; Ali is meant to be the
  filter. Undecided.

### Other
- Full QA testing needed (496 passing)
- Add TOGETHER_API_KEY on Render (key ready)
- GROQ_API_KEY returns 401 and OPENAI has no credits — Arabic notification text
  falls back to English (cached + circuit-broken now, so it is quiet, not fixed)
- Google Gemini 429 quota: free tier limited to 5 RPM (known issue since Dec 2025)
- ~~New EAS build needed~~ ✅ Done — Build 934e89de (Android APK, preview profile)

## How to Run Locally
- Backend: `cd backend && flask run --debug`
- Frontend: `cd frontend && npm run dev`
- Local URL: http://localhost:5000 (API) / http://localhost:3000 (Web)

## Context for AI
- This is a bilingual inspection system for the Middle Eastern market
- Primary markets: Iraq, Lebanon, UAE, Saudi Arabia, Jordan
- Part of Tellham Group business
- Owner: Ali


## Change Log
See HISTORY.md for full changelog. Only keep last 3 entries here.
