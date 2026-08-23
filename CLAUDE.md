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

- **2026-08-23 (4)** — **The Telegram bot reads the plan (Stages 1-2).** Webhook, not polling — two gunicorn workers running `getUpdates` would be two bots each answering half the messages. **Four gates, and failing any of them produces SILENCE**, never a refusal: the secret header Telegram echoes back, a secret path segment, a private chat, and the sender allowlist. A refusal would confirm to a prober that the endpoint is live. `TELEGRAM_ALLOWED_USERS="<telegram_id>:<app_user_id>"` is **one setting doing both authorization and identity** — two separate lists can disagree, and the failure mode of disagreement is somebody acting as somebody else. **`update_id` dedupe is correctness, not polish:** Telegram redelivers until it gets a 200, so the webhook ACKs immediately and works in a background thread. Commands: `/ping`, `/help`, `/plan [east|west]`, `/today`, `/tomorrow`, `/sap`. **`#<job_id>` is the universal handle** — on every job, always, never changes when a job moves; the SAP number is shown below because inspection-raised jobs have none. **No `parse_mode`**, so `TT032-1000HR_MECH` is not eaten as Markdown formatting and Arabic bidi does not fight the delimiters. Bilingual from day one, driven by Telegram's own `language_code` — the same client-side signal as `Accept-Language`, deliberately not `users.language`, which defaults to 'en' and repeats the bug that kept Arabic workers on English screens. **Pushes at 16:00 (tomorrow) and 06:00 (today) Baghdad — `timezone='Asia/Baghdad'` is not optional**, since Render runs UTC and every other trigger in that file is a UTC hour; without it the 06:00 push lands at 03:00 in the yard. Every message carries a **freshness stamp** (`SAP data: today 06:14` / `3 days old ⚠️`) because the robot only runs while the terminal PC is awake, and stale data looks completely normal. `TELEGRAM_ENABLED=false` skips blueprint registration entirely. **Publishing is deliberately not in the bot** — everything up to it is undone with one more message; publishing notifies the whole crew. Tests: `test_telegram_bot.py` (49), all offline; **mutation-tested** — deleting the header check, the allowlist, the private-chat check or the dedupe each breaks a test. One test that *claimed* to prove "no configured secret never means allow" did not (it posted to an empty path, which 404s before any check) and was replaced. The freshness stamp printed **stored UTC** — a 09:14 Baghdad delivery read as "today 06:14" — now converted via new `planning_now()` / `to_planning_time()` helpers. Suite **419 passed**.

- **2026-08-23 (3)** — **The removal rules: what happens when SAP closes a job already on the plan (scenarios 7-12).** The pool sync handled the box; this handles the other side, where removing a job changes somebody's day and can erase a record of work. Matrix: **closed + untouched → removed and reported** (a day that quietly loses a job looks like a day that never had one); **closed + someone working on it → NOTHING is touched, Ali is told, the worker is not** — he is the filter; **closed + app already finished → the job stays as the record**, only the staging row is cleaned; **app finished + SAP still open → a question**, because SAP is only *slower* here, not more right, and the message surfaces a real problem: somebody forgot to confirm, so the hours will not reconcile at month end. Two rules hold everywhere: **absence is not evidence** (an order missing from the export moves nothing — exports get truncated and work centres get reassigned) and **one event per situation** (the sync runs daily; re-reporting a persisting conflict every morning is how a robot becomes something Ali stops reading). **Classification order is load-bearing and the real data proves it:** both cancelled MES orders (700001289489, 700001232239) also carry `CLSD`, so testing "closed" before "cancelled" reports a cancelled order as finished work. Cancellation is `CNCL` in **`User Status`** — `Deletion flag` is blank on all 9,124 MES rows. New `sap_reconciliation_events` table because the sync runs unattended in a thread with nobody watching a log; `GET /api/sap-sync/events` + `POST .../resolve` (resolving matters — an open event is suppressed as a duplicate forever, so a question nobody can close would silence itself while never being answered). `_delete_job_record`'s child-table deletion extracted to `purge_job_rows()` so the robot removes a job **exactly** the way the planner does. Verified on the real export: 9,124 MES orders → 8,912 done, 210 open, 2 cancelled, **zero unknown**. **Routine confirmations are silent**: a job both sides agree is finished breaks nobody's day and happens weekly, so those events are born `resolved` and notify nobody — otherwise the weekly good news buries the two events that need an answer. Tests: `test_sap_removal_rules.py` (30) + 7 parser tests, **mutation-tested** (treating absence as done, disabling dedupe, unprotecting in-progress jobs, ignoring `dry_run`, and making confirmations loud again each break a test). Suite **419 passed**.
