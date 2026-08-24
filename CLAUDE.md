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
- **Plan 2 pending — the evening truth:** worker types remaining hours on "Could not
  finish"; carry-over books REMAINING hours (bug: copies full figure today) and must
  merge with a planned continuation; the domino re-shuffle inside the daily review.
- **Plan 3 pending — Telegram taps:** finished-early backfill ask; urgent-on-full-day
  proposal (inline buttons).
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
