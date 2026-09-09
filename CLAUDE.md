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
- **Needs an OTA, not just a Render deploy.** Full detail in HISTORY.md.

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
- **`schedule_sap_order` diverges from the generator** (`app/api/work_plans.py:934`): no
  re-pricing, no berth normalisation, no capacity check, staffs nobody. `place_one` replaces
  that behaviour for the bot; the endpoint is untouched.
- **Night shift disagrees with itself:** `day_budget._unavailable_by_date` excludes `night`,
  `_step_assign`'s own lookup does not — so a man giving the wallet zero hours can still be
  staffed onto day work.
- **Nested PM packages double-charged.** RS109 carries 250HR and 2000HR open at once,
  priced 12h + 12h; Ali's rule says the packages are nested task lists of one plan.
- **⚠️ Confirm the fault price direction.** COM and DAM cost MORE alone (2→3, 1→3) but
  INS and ACD cost LESS (3→2, 2.5→2). Possible misread of Ali's brackets.
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
