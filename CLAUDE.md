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

### Standard material kits from SAP — LIVE 2026-08-26
- Full record: `docs/material-kits-findings.md`. Commits `5a2463f`, `3fcba0a`.
- **The kits could NEVER have fired.** `sap_pool_sync` never set `cycle_id`, so every job
  carried NULL and `find_matching_kit` fell to its last rule — which demands a kit with no
  interval and no model. All 8 saved kits have both. Fixed, plus a new matcher rule for the
  forklift shape (type + model, no interval), which nothing could return before.
- **`pm_interval_hours`** reads all six ways SAP spells the interval — **375 → 973** PM
  orders read on the real IW39, none of the old hits lost. `250Hrs` (trailing `s`) was found
  only by checking what the first fix DROPPED.
- **APPLIED on production 2026-08-26:** `created: 28, updated: 8, deactivated: 0,
  materials_created: 0, items_written: 204`. Every material already existed in the app.
  Re-run `flask seed-material-kits [--apply]` any time — it is idempotent.
- **The kits do NOT reach jobs until the pool is rebuilt.** `cycle_id` is written by
  `sap_pool_sync`, which runs 05:00 Baghdad. Box orders are UPDATED by that run so they
  backfill; orders ALREADY scheduled onto a plan are deliberately left untouched and keep
  NULL, so jobs on existing plans get no kit. New plans do.
- **DECIDED 2026-09-03 — unknown machines were costing 38 orders a night.**
  `sap_pool_sync` drops EVERY order on a machine that has no `equipment` row, silently.
  2026-09-02: 230 candidates → 5 created, 101 updated, 86 already scheduled, **38 dropped**
  across RET01, TT004, TT005, TT080.
  - **TT004/005/080: SOLD.** In `RETIRED_PLANT_CODES` — still skipped, never reported.
    The real cleanup is TECO-ing them in SAP.
  - **RET01: Ali does NOT want it added** (2026-09-03, after first saying it was real).
    Its ~orders stay out on purpose. It is deliberately NOT in the retired list, because
    Ali asked to keep being flagged about it in case he changes his mind.
    **Do not add it unprompted.** `flask add-missing-equipment --apply` is the button
    if he ever asks; it has never been run.
  - An unknown machine now raises an `orders_skipped_no_equipment` event → bilingual
    in-app notification to admins/engineers, de-duplicated per machine.
  - `flask pool-status` answers "which orders came in?" from the Render shell alone —
    built because TablePlus and the Telegram bot both failed on the same day.
  - Also settled: for machines the app DOES have, only 5 new orders existed. They were in
    the pool the whole time, near the bottom, because the pool sorts most-overdue first.
- **Settled on production 2026-08-26:** `equipment.model_number` holds the bare model
  (`DCF90-45E6`), so Ali's 8 kits are UPDATED in place, none switched off.
- **The spec ships one row per SERVICE, not pre-grouped kits.** Grouping is done by
  `equipment.model_number` in the live table — never by the asset list. Ali: the ten Ottawa
  tractors are *"not one model but share same engine, so keep each kit different"*, and
  production carries `Ottawa 50`..`Ottawa 59` for TT029..TT038. Side effect: the asset
  list's `YT22011` typo stops mattering, because the app already has those 22 right.
- **`CO01-C022-004` does not exist** — zero appearances in 283,345 movement lines, yet it
  was in 6 of the 8 saved kits. Removed by the seeder.
- **Held back: 48 kits under 5 services** (mostly the Ottawa split), and every CALENDAR PM —
  nothing reaches 75% on any, even reach stackers with 109 services. A 3-week inspection is
  a look-and-check job with no standard parts.

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
