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

### NEXT UP — make the plan realistic
- ~~**Job hours are fiction.**~~ ✅ 2026-08-24 — priced from real elapsed time
  (`docs/job-durations.md`). Pool 1,272h → 714h.
- ~~**No hours cap on a day / family lock / invented constants.**~~ ✅ 2026-08-25 —
  day budget = day-shift men × 8h per team per berth (`app/services/day_budget.py`),
  east one shared wallet, charged in man-hours at placement. Family lock, machine
  counts, `MAX_PM_BUNDLES_PER_WORKER_PER_DAY`, `SPECIALIST_GROUP_SIZE` and the urgent
  "+1" all deleted (AC team caps kept as-is). RS PM splits 8h+4h over two days; urgent
  RS/ECH takes up to 4 men instead. Whole bundle assigned to the PM crew.
- ~~**Plan 2 — the evening truth.**~~ ✅ 2026-08-25 — worker states remaining hours,
  carry-over books ONLY those + merges with a planned continuation, the domino makes
  room (`app/services/day_ripple.py`), split-aware order lookups. Migration
  `r8s9t0u1v2w3` — run `flask db upgrade` on Render.
- ~~**Plan 3 Stage 1 — the bot learned to ask.**~~ ✅ 2026-08-25 — nightly urgent-with-no-room
  proposal with inline buttons; first press wins. Migration `s9t0u1v2w3x4`.
- ~~**Plan 3 Stage 2 — the fast crew is invisible.**~~ ✅ 2026-08-25 — a day is now priced by
  `actual_hours` for men standing in the yard (`app/services/crew_free.py`). Finishing early
  asks the engineer with buttons; the mobile "I am free" button raises the same question.
  Only men who still have hours are offered or sent, and the job must fit inside the
  shortest of them. Not committed — awaiting Ali's `push`.
- ~~**⚠️ Stage 1 never offers an urgent reach stacker.**~~ ✅ 2026-08-25 — Ali's rule: always
  offer 3 or 4 men so the time is 8h, and only fall back to 2 men / 12h when they are not
  available. `urgent_one_day_crew` boosts the crew AND `place_one` staffs to the boosted
  figure, so the promise matches what the domino reads. End-to-end run confirms it:
  `crew: 3, hours: 8.0, cost_man_hours: 24.0`.
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
