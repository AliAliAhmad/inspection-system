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
- ~~Arabic language support for AI analysis~~ ✅ Fixed
- Full QA testing needed (137 passing, 0 skipped, 15 remote-only deselected)
- Add TOGETHER_API_KEY on Render (key ready)
- Add GROQ_API_KEY on Render (biggest gap — free, 14,400 RPD audio)
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

- **2026-08-23 (8)** — **Why the planner UI showed an empty pool, and three queries still blind to the global box.** The UI's pool panel is gated on `plan_id` — no plan existed for the current week, so the screen sent none and `/available-jobs` returned nothing while the box held 202. That part is by design. What was NOT: **three queries still matched `work_plan_id == plan.id`** after the pool went global, so each silently found nothing from a robot-fed order (which carries NULL) — the plan-detail pool count, `auto-schedule`, and "also add this machine's other open work". All now use `pool_orders_query(plan.id)`. **Writing those tests found a live bug:** `sap.work_plan_id = plan.id` inside a function whose only parameter is `plan_id`, raising NameError since f50e3c8 — **swallowed by the caller's `except Exception: logger.warning(...)`**, so auto-adding related work had been doing nothing at all while looking fine. First version of the tests called `pool_orders_query()` directly and stayed green through every mutation; rewritten through the endpoints, each mutation fails. Suite **474 passed**.

- **2026-08-23 (7)** — **`/generate` from the phone, and the silent-skip bug that cost an afternoon.** (a) **The rebuild had three silent ways to find nothing** — `is_current`, `stored_path`, and the file being readable on disk — and its early return **saved no report**, so `/pool` said "never run", which is exactly what a crash says. Worse, the freshness stamp checks only `sheet_name == 'IW39'`, so the bot could truthfully report "SAP data: today 12:44" while the rebuild found nothing to read. Now every exit path saves a report carrying the REASON, a start line is logged, and `/pool` lists what the courier delivered with `not on disk` / `superseded` flags — the state is visible from the phone instead of through a shell that drops. (b) **`/generate` — the bot's only mutating command, and deliberately the only one.** It produces a DRAFT: nobody is notified, no worker sees it, `/undo` removes it. **Publishing is not there and will not be** — it notifies the whole crew and stays a deliberate act at a computer, which also caps the damage if the allowlist is ever defeated. Creates the week's plan if none exists, so "plan this week" needs no laptop. Three guards, each mutation-verified: **role** (the allowlist says who may TALK to the bot — a different question from who may plan, and the bot must never route around a permission the web enforces), **published** (regenerating would silently change work people were already told to do), and **empty box** (said BEFORE building, or the generator succeeds at producing an empty week and looks like it worked). Suite **468 passed**.

- **2026-08-23 (6)** — **`/pool` on the phone, and the rebuild runs itself.** The daily pipeline had a manual step that could only be reached through a shell session that drops on a weak connection. Now: **05:00 Baghdad nightly rebuild** (an hour before the 06:00 push, so it reads fresh data), behind the same cross-worker lock as the manual trigger. **`/pool`** answers "did my SAP files turn into jobs" — box count split by priority and type, what the last rebuild created/updated/removed, equipment matched, and **unmatched plant codes NAMED, never merely counted**: that is the one failure in this pipeline that is otherwise invisible, since dropped orders just make the planner look empty. The rebuild report is persisted to the **persistent disk as JSON, not a table** — start.sh runs `flask db upgrade || echo WARNING`, so a failed migration does not stop the boot and the table would silently not exist. Written tmp-then-renamed, so a crash mid-write leaves the previous report intact. **Dry runs are stored separately**, or "what did the robot do last night" could answer "nothing, it was a rehearsal". Tests: 63 in `test_telegram_bot.py`, mutation-verified (hiding the unmatched codes, or counting scheduled orders as still in the box, each break a test). Suite **453 passed**.

