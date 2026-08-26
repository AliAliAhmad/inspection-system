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

### NEXT UP — standard material kits from SAP (built, NOT deployed)
- **Built 2026-08-26, awaiting Ali's push.** Full record: `docs/material-kits-findings.md`.
  Dry run against his real fleet and his 8 real kits: `docs/material-kit-seed-preview.txt`.
- **The kits could NEVER have fired.** `sap_pool_sync` never set `cycle_id`, so every job
  carried NULL and `find_matching_kit` fell to its last rule — which demands a kit with no
  interval and no model. All 8 saved kits have both. Fixed, plus a new matcher rule for the
  forklift shape (type + model, no interval), which nothing could return before.
- **`pm_interval_hours` in `sap_order_parser`** reads all six ways SAP spells the interval.
  On the real IW39 that is **375 → 973** PM orders read, none of the old hits lost.
  `25/5H` IS the 250-hour service (Ali confirmed). `250Hrs` with a trailing `s` was found
  only by checking what the first fix DROPPED.
- **RUN ON RENDER AFTER DEPLOY:** `flask db upgrade` (migration `t0u1v2w3x4y5` de-duplicates
  `material_kit_items` and adds the missing unique constraint), then
  `flask seed-material-kits` — report only — and `--apply` when Ali has read it.
- **What the dry run cannot settle from here:** whether production's
  `equipment.model_number` holds `DRG450-65S5` (Ali's kits' convention) or something else.
  It decides whether his 8 kits are UPDATED or replaced-and-switched-off. The report on
  Render says which, before writing.
- **`CO01-C022-004 Equipment degreaser` does not exist** — zero appearances in 283,345
  movement lines, yet it is in 6 of the 8 saved kits. The seeder removes it.
- **Held back: 23 kits under 5 services**, and every CALENDAR PM — nothing reaches 75% on
  any of them, even reach stackers with 109 services. A 3-week inspection is a
  look-and-check job with no standard parts.

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
